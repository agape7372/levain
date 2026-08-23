// 씬 수명주기 — 정본: docs/ARCHITECTURE.md §4, docs/VISUAL.md §1.
// 컨텍스트 유실 = 전체 재구축(부분 복구 로직의 버그 표면을 사지 않는다).
import * as THREE from 'three';
import { DoughMesh } from './dough/DoughMesh';
import { createJar, type Jar } from './jar';
import { createGroundShadow } from './background';
import { attachInput } from './input';
import { ParticlePool } from './particles';
import { smoothParams, type RenderParams } from './renderParams';

// 세로폰(aspect ~0.46)에서 병 폭 ≈ 화면 70%, 병+헤드룸 55~65% 점유 (VISUAL §1-1 목표값 실측 보정)
const VIEW_H = 5.4;
const LOOK_Y = 0.8; // 병 몸통 중심보다 살짝 위 — 상단 HUD 헤드룸 확보

export class SceneHost {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  private raf = 0;
  private running = false;
  private resizeObserver: ResizeObserver | null = null;
  private detachInput: (() => void) | null = null;

  dough: DoughMesh | null = null;
  /** 기포가 터진 프레임에 호출 — 사운드 트리거 (배선은 app.ts) */
  onBubblePop: (() => void) | null = null;
  private jar: Jar | null = null;
  private band: THREE.Mesh | null = null;
  private current: RenderParams | null = null;
  private target: RenderParams | null = null;
  private lastT = 0;
  private particles: ParticlePool | null = null;
  /** 밥주기 연출 (VISUAL §4-1) — pour=부활 따라내기 선행 */
  private feedSeq: { t0: number; pour: boolean; flourDone: boolean; bubblesDone: boolean; bandFrom: number } | null = null;
  /** 부활 2회차 "지켜보기" — 12% 줌인 (VISUAL §4-3) */
  private watchSeq: { t0: number } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private stage: HTMLElement,
  ) {}

  mount(): void {
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // 고정 상한 — 어댑티브 없음
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    // 배경은 CSS 라디얼 그라디언트(#stage) — 캔버스는 투명

    // 카메라: 직교 55° 틸트 3/4 부감 (VISUAL §1-1)
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
    this.camera.position.set(0, 8.0, 5.6);
    this.camera.lookAt(0, LOOK_Y, 0);

    // 조명: 프로토타입 계승 + 차가운 필 (VISUAL §1-3)
    const key = new THREE.DirectionalLight(0xffe2b0, 1.4);
    key.position.set(-2, 6, 2);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0xfff0dc, 0.55));
    const fill = new THREE.DirectionalLight(0xdce8ff, 0.15);
    fill.position.set(2.5, 3, -2);
    this.scene.add(fill);

    this.scene.add(createGroundShadow());

    const jar = createJar();
    this.scene.add(jar.group);
    this.jar = jar;
    this.band = jar.band;

    this.dough = new DoughMesh();
    this.scene.add(this.dough.mesh);

    this.particles = new ParticlePool();
    this.scene.add(this.particles.mesh);

    this.detachInput = attachInput(this.canvas, this.camera, this.dough);

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.stage);
    this.fit();

    // 컨텍스트 유실 — 전체 재구축 전략
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.stop();
  };

  private onContextRestored = (): void => {
    const wasRunning = true; // 유실은 표시 중에만 감지됨 — 복구 후 재개
    this.dispose();
    this.mount();
    if (wasRunning) this.start();
  };

  /** 고무줄 마커 높이 — 마지막 밥 시점 반죽 높이 */
  setBandY(y: number): void {
    if (this.band) this.band.position.y = y;
  }

  /** 라이브 목표 파라미터 — 프레임마다 지수 lerp로 따라간다 (τ≈1.2s) */
  setTargetParams(p: RenderParams): void {
    this.target = p;
    if (!this.current) this.snapParams(p);
  }

  /** 앱 오픈 catch-up — 즉시 스냅, 경과를 재생하지 않는다 (다마고치 문법, ARCHITECTURE §4) */
  snapParams(p: RenderParams): void {
    this.current = p;
    this.target = p;
    this.dough?.applyParams(p);
  }

  /** 밥주기 연출 2.8s — pour면 앞 1.2s에 병 기울여 hooch 따라내기 (부활 1회차) */
  playFeed(pour = false): void {
    this.feedSeq = {
      t0: performance.now() / 1000,
      pour,
      flourDone: false,
      bubblesDone: false,
      bandFrom: this.dough?.topY() ?? 0.98,
    };
  }

  /** 부활 2회차 — 3.5s 줌인 지켜보기 */
  playWatch(): void {
    this.watchSeq = { t0: performance.now() / 1000 };
  }

  isSequenceActive(): boolean {
    return this.feedSeq !== null || this.watchSeq !== null;
  }

  /** 연출 스킵 (Android 백 계약) — 끝 상태로 점프 */
  skipSequence(): boolean {
    if (!this.isSequenceActive()) return false;
    this.endFeedSeq();
    this.endWatchSeq();
    return true;
  }

  private endFeedSeq(): void {
    if (!this.feedSeq) return;
    this.feedSeq = null;
    if (this.dough) {
      const u = this.dough.material.uniforms;
      u.uFlourDust.value = 0;
      u.uStir.value = 0;
    }
    if (this.jar) this.jar.group.rotation.z = 0;
    this.setBandY(0.98);
  }

  private endWatchSeq(): void {
    if (!this.watchSeq) return;
    this.watchSeq = null;
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
  }

  /** 시퀀스 프레임 구동 — loop에서 dough.tick 이후 호출 */
  private driveSequences(t: number): void {
    const dough = this.dough;
    if (!dough) return;

    if (this.feedSeq) {
      const s = this.feedSeq;
      const st = t - s.t0;
      const dur = s.pour ? 4.0 : 2.8;
      const off = s.pour ? 1.2 : 0; // 따라내기 선행 구간
      const u = dough.material.uniforms;

      if (s.pour && this.jar) {
        const p = Math.min(st / 1.2, 1);
        this.jar.group.rotation.z = (8 * Math.PI / 180) * Math.sin(Math.PI * p);
      }

      const fs = st - off; // 급여 본 시퀀스 로컬 시간
      if (fs >= 0) {
        if (!s.flourDone) {
          s.flourDone = true;
          this.particles?.spawnFlour(80, dough.topY());
        }
        // 밀가루 덮임: 0~0.6 상승, 1.2~2.4 젓기로 소멸
        u.uFlourDust.value = fs < 0.6 ? fs / 0.6 : fs < 1.2 ? 1 : fs < 2.4 ? Math.max(0, 1 - (fs - 1.2) / 1.2) : 0;
        // 물기 — 광 상승 (물 리본 컷 — VISUAL §4-1)
        if (fs > 0.5 && fs < 1.4) u.uSpecStr.value = Math.min(1.2, (u.uSpecStr.value as number) + 0.5 * Math.sin(Math.PI * (fs - 0.5) / 0.9));
        // 젓기 소용돌이 + 원형 wobble
        if (fs >= 1.2 && fs < 2.4) {
          const sp = (fs - 1.2) / 1.2;
          u.uStir.value = Math.sin(Math.PI * sp);
          const ang = sp * Math.PI * 2;
          dough.wobble.set(Math.cos(ang) * 0.06, Math.sin(ang) * 0.06);
        } else {
          u.uStir.value = 0;
        }
        // 정착 — 눌림 스프링 + 기포 + 고무줄 슬라이드
        if (fs >= 2.4) {
          const sp = Math.min((fs - 2.4) / 0.4, 1);
          dough.mesh.scale.y *= 1 - 0.05 * Math.sin(Math.PI * sp);
          if (!s.bubblesDone) {
            s.bubblesDone = true;
            dough.bubbles.spawnNow(t);
            dough.bubbles.spawnNow(t + 0.001);
          }
          const ease = 1 - Math.pow(1 - sp, 3);
          this.setBandY(s.bandFrom + (0.98 - s.bandFrom) * ease);
        }
      }

      if (st >= dur) this.endFeedSeq();
    }

    if (this.watchSeq) {
      const st = t - this.watchSeq.t0;
      const zin = 0.8;
      const hold = 2.0;
      const zout = 0.7;
      let z = 1;
      if (st < zin) z = 1 + 0.14 * (1 - Math.pow(1 - st / zin, 3));
      else if (st < zin + hold) z = 1.14;
      else if (st < zin + hold + zout) z = 1.14 - 0.14 * ((st - zin - hold) / zout);
      else {
        this.endWatchSeq();
        return;
      }
      this.camera.zoom = z;
      this.camera.updateProjectionMatrix();
    }
  }

  private fit(): void {
    if (!this.renderer) return;
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const viewW = VIEW_H * aspect;
    this.camera.left = -viewW / 2;
    this.camera.right = viewW / 2;
    this.camera.top = VIEW_H / 2 + LOOK_Y;
    this.camera.bottom = -VIEW_H / 2 + LOOK_Y;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = (): void => {
      if (!this.running || !this.renderer) return;
      const t = performance.now() / 1000; // rAF 델타 누적 금지 — 단조 시계
      const dt = this.lastT > 0 ? Math.min(0.1, t - this.lastT) : 0.016;
      this.lastT = t;

      if (this.current && this.target && this.current !== this.target) {
        this.current = smoothParams(this.current, this.target, dt);
        this.dough?.applyParams(this.current);
      }
      this.dough?.tick(t);
      this.driveSequences(t);
      this.particles?.update(dt);
      if (this.dough && this.dough.bubbles.popsThisFrame > 0) this.onBubblePop?.();
      if (this.dough && this.jar && this.current) {
        this.jar.setHooch(this.current.hoochAmt, this.dough.topY() + 0.02, t);
      }
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    this.stop();
    this.detachInput?.();
    this.detachInput = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    this.renderer?.dispose();
    this.renderer = null;
    this.dough = null;
    this.jar = null;
    this.band = null;
    this.particles = null;
    this.feedSeq = null;
    this.watchSeq = null;
  }
}
