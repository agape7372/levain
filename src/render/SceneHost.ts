// 씬 수명주기 — 정본: docs/ARCHITECTURE.md §4, docs/VISUAL.md §1.
// 컨텍스트 유실 = 전체 재구축(부분 복구 로직의 버그 표면을 사지 않는다).
import * as THREE from 'three';
import { DoughMesh } from './dough/DoughMesh';
import { createJar, type Jar } from './jar';
import { createGroundShadow } from './background';
import { attachInput } from './input';
import { Cloth } from './cloth';
import { BreadShowcase } from './breadShowcase';
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
  /** 천 덮개 걷기 시작 시 호출 — 사락 사운드 트리거 (배선은 app.ts) */
  onClothOpen: (() => void) | null = null;
  /** 젓기 사운드 훅 (배선은 app.ts — squelch) */
  onStirStart: (() => void) | null = null;
  onStirMove: ((speed01: number) => void) | null = null;
  onStirEnd: (() => void) | null = null;
  /** 배경 좌우 스와이프 = 르방 전환 (§5-5). 허용 여부·처리 모두 배선은 app.ts.
   *  필드 위임인 이유: 컨텍스트 유실 복구가 dispose→mount로 attachInput을 다시 부른다 */
  canSwipe: (() => boolean) | null = null;
  onSwipe: ((dir: 1 | -1) => void) | null = null;
  /** 전환 슬라이드 진행 중 타이머 — 연타 시 정리하고 즉시 교체 (slideSwap) */
  private slideTimer: ReturnType<typeof setTimeout> | null = null;
  private cloth: Cloth | null = null;
  private jar: Jar | null = null;
  private showcase: BreadShowcase | null = null;
  // 고무줄 마커 제거(사용자 확정) — setBandY 계열 전부 삭제됨
  /** 홈 씬 오브젝트 — 쇼케이스 진입 시 통째로 숨긴다 */
  private homeGroup: THREE.Object3D[] = [];
  private showcaseDrag: { detach: () => void } | null = null;
  private current: RenderParams | null = null;
  private target: RenderParams | null = null;
  private lastT = 0;
  private particles: ParticlePool | null = null;
  /** 밥주기 연출 (VISUAL §4-1) — pour=부활 따라내기 선행 */
  private feedSeq: { t0: number; pour: boolean; flourDone: boolean; bubblesDone: boolean } | null = null;
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

    this.dough = new DoughMesh();
    this.scene.add(this.dough.mesh);

    this.particles = new ParticlePool();
    this.scene.add(this.particles.mesh);

    this.cloth = new Cloth();
    this.scene.add(this.cloth.mesh);

    this.showcase = new BreadShowcase();
    this.scene.add(this.showcase.group);
    // 파티클 풀은 홈·쇼케이스 공용(김) — homeGroup에서 제외
    this.homeGroup = [jar.group, this.dough.mesh, this.cloth.mesh];

    this.detachInput = attachInput(this.canvas, this.camera, this.dough, {
      isCovered: () => this.cloth?.covering ?? false,
      onUncover: () => this.uncover(),
      onStirStart: () => this.onStirStart?.(),
      onStirMove: (s) => this.onStirMove?.(s),
      onStirEnd: () => this.onStirEnd?.(),
      canSwipe: () => (this.canSwipe?.() ?? false) && !this.isSequenceActive(),
      onSwipe: (dir) => this.onSwipe?.(dir),
    });

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.stage);
    this.fit();

    // 컨텍스트 유실 — 전체 재구축 전략
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);

    // dev 전용 계기판 — 촉감·draw call 검증용 (프로덕션 번들 제외)
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__levainScene = this;
    }
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

  /**
   * 르방 전환 슬라이드 — 캔버스를 방향대로 밀어내고, **화면 밖에서** swap()을 실행한 뒤 되돌아온다.
   * 스냅샷 캡처를 안 하므로 preserveDrawingBuffer가 필요 없고 WebGL 컨텍스트도 1개 그대로다.
   * `#c`에만 transform을 걸어 레이아웃 크기가 안 변한다 — 리사이즈·DPR 로직 무사, HUD는 제자리.
   * "전환은 컷" 계약은 유지된다 — 그 계약은 *경과 시간을 재생하지 않는다*는 뜻이지 무전환이 아니다.
   */
  slideSwap(dir: 1 | -1, swap: () => void): void {
    const reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 연타 중이면 진행 중인 슬라이드를 정리하고 즉시 교체 — 애니메이션이 입력을 삼키지 않는다
    if (reduce || this.slideTimer !== null) {
      if (this.slideTimer !== null) {
        clearTimeout(this.slideTimer);
        this.slideTimer = null;
        this.canvas.style.transition = '';
        this.canvas.style.transform = '';
        this.canvas.style.opacity = '';
      }
      swap();
      return;
    }
    const OUT_MS = 130;
    const IN_MS = 150;
    const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const away = dir === 1 ? -40 : 40; // 다음(+1)이면 왼쪽으로 빠진다 — 칩 ‹ › 와 같은 방향 감각
    this.canvas.style.transition = `transform ${OUT_MS}ms ${EASE}, opacity ${OUT_MS}ms linear`;
    this.canvas.style.transform = `translateX(${away}%)`;
    this.canvas.style.opacity = '0';
    this.slideTimer = setTimeout(() => {
      swap(); // 화면 밖에서 교체 — 컷이 안 보인다
      this.canvas.style.transition = 'none';
      this.canvas.style.transform = `translateX(${-away}%)`;
      // 강제 리플로우 — 없으면 transition:none이 다음 대입과 합쳐져 되돌아오는 구간이 통째로 사라진다
      void this.canvas.offsetWidth;
      this.canvas.style.transition = `transform ${IN_MS}ms ${EASE}, opacity ${IN_MS}ms linear`;
      this.canvas.style.transform = 'translateX(0)';
      this.canvas.style.opacity = '1';
      this.slideTimer = setTimeout(() => {
        this.canvas.style.transition = '';
        this.canvas.style.transform = '';
        this.canvas.style.opacity = '';
        this.slideTimer = null;
      }, IN_MS);
    }, OUT_MS);
  }

  /** 밥주기 연출 2.8s — pour면 앞 1.2s에 병 기울여 hooch 따라내기 (부활 1회차) */
  playFeed(pour = false): void {
    this.feedSeq = {
      t0: performance.now() / 1000,
      pour,
      flourDone: false,
      bubblesDone: false,
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

  /** 곰팡이 반점 시드 — 개체 정체성. 배선은 app.ts (createdAt) */
  setSeed(seed: number): void {
    this.dough?.setSeed(seed);
  }

  /** 천 덮개 덮기 — 콜드 스타트·오랜 부재 복귀 (조건 판단은 app.ts) */
  coverCloth(): void {
    this.cloth?.cover();
  }

  isClothCovering(): boolean {
    return this.cloth?.covering ?? false;
  }

  /** 덮개 걷기 — 플릭/탭 제스처에서 호출. 밀가루 모트 6 + 사락 */
  private uncover(): void {
    if (!this.cloth?.covering) return;
    this.onClothOpen?.();
    this.cloth.open(() => {
      if (this.dough) this.particles?.spawnFlour(6, this.dough.topY());
    });
  }

  /** 쇼케이스 진입 — 홈 씬 숨기고 GLB 턴테이블. 로드 실패는 reject (호출자 폴백) */
  async enterShowcase(url: string): Promise<void> {
    if (!this.showcase) throw new Error('scene not mounted');
    await this.showcase.load(url);
    for (const o of this.homeGroup) o.visible = false;
    this.showcase.show();
    // 드래그 회전 — 쇼케이스 전용 임시 리스너 (반죽 입력과 분리)
    let lastX: number | null = null;
    const onDown = (e: PointerEvent): void => {
      lastX = e.clientX;
    };
    const onMove = (e: PointerEvent): void => {
      if (lastX === null) return;
      this.showcase?.drag(e.clientX - lastX);
      lastX = e.clientX;
    };
    const onUp = (): void => {
      lastX = null;
      this.showcase?.endDrag();
    };
    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('pointermove', onMove);
    this.canvas.addEventListener('pointerup', onUp);
    this.canvas.addEventListener('pointercancel', onUp);
    this.showcaseDrag = {
      detach: () => {
        this.canvas.removeEventListener('pointerdown', onDown);
        this.canvas.removeEventListener('pointermove', onMove);
        this.canvas.removeEventListener('pointerup', onUp);
        this.canvas.removeEventListener('pointercancel', onUp);
      },
    };
  }

  exitShowcase(): void {
    this.showcaseDrag?.detach();
    this.showcaseDrag = null;
    this.showcase?.hide();
    for (const o of this.homeGroup) o.visible = true;
    // 덮개는 걷힌 상태가 기본 — cover()가 아닌 한 다시 나타나지 않게
    if (this.cloth && !this.cloth.covering) this.cloth.mesh.visible = false;
  }

  isShowcasing(): boolean {
    return this.showcase?.group.visible ?? false;
  }

  /** 갓 구운 김 — 쇼케이스 빵 위로 (배선은 app.ts) */
  spawnSteam(): void {
    this.particles?.spawnSteam(8, 1.7);
  }

  /** 단계 승급 축하 — 기포 3연속 팝 (다이제틱: 이펙트가 아니라 르방이 반긴다) */
  celebrate(): void {
    const spawnAt = (delayMs: number): void => {
      setTimeout(() => {
        if (this.dough) this.dough.bubbles.spawnNow(performance.now() / 1000, 1.2);
      }, delayMs);
    };
    spawnAt(0);
    spawnAt(180);
    spawnAt(380);
  }

  private endFeedSeq(): void {
    if (!this.feedSeq) return;
    this.feedSeq = null;
    if (this.dough) {
      this.dough.material.uniforms.uFlourDust.value = 0;
      // 젓기 시어장은 입력이 끊기면 스스로 damped spring 복귀 — 강제 리셋 불필요
    }
    if (this.jar) this.jar.group.rotation.z = 0;
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
        // 젓기 — 나무 숟가락이 원을 그리듯 시어장을 원형 구동 + 원형 wobble
        if (fs >= 1.2 && fs < 2.4) {
          const sp = (fs - 1.2) / 1.2;
          const env = Math.sin(Math.PI * sp); // 시작·끝은 부드럽게
          const ang = sp * Math.PI * 2 * 1.5; // 한 바퀴 반
          dough.setStirInput(
            Math.cos(ang) * 0.28,
            Math.sin(ang) * 0.28,
            -Math.sin(ang) * 2.2 * env,
            Math.cos(ang) * 2.2 * env,
            false, // wobble은 아래에서 직접 연출 — tick의 속도 유래 구동과 충돌 방지
          );
          dough.wobble.set(Math.cos(ang) * 0.06, Math.sin(ang) * 0.06);
        }
        // 정착 — 눌림 스프링 + 기포 + 밀가루 퍼프
        if (fs >= 2.4) {
          const sp = Math.min((fs - 2.4) / 0.4, 1);
          dough.mesh.scale.y *= 1 - 0.05 * Math.sin(Math.PI * sp);
          if (!s.bubblesDone) {
            s.bubblesDone = true;
            dough.bubbles.spawnNow(t);
            dough.bubbles.spawnNow(t + 0.001);
            this.particles?.spawnFlour(6, dough.topY());
          }
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
      this.cloth?.tick(t);
      this.showcase?.tick(dt);
      this.particles?.update(dt);
      if (this.dough && this.dough.bubbles.popsThisFrame > 0) this.onBubblePop?.();
      if (this.dough && this.jar && this.current) {
        // topY를 한 번만 뽑아 둘에 공급 — hooch 층과 유리 자국이 같은 수면 좌표계를 쓴다
        const top = this.dough.topY();
        this.jar.setHooch(this.current.hoochAmt, top + 0.02, t);
        this.jar.setLevel(
          top,
          this.dough.fillWorldY(this.dough.levelY(this.current.markFill)),
          this.current.residue,
          this.current.wet,
        );
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
    this.particles = null;
    this.cloth = null;
    this.showcaseDrag?.detach();
    this.showcaseDrag = null;
    this.showcase?.dispose();
    this.showcase = null;
    this.homeGroup = [];
    this.feedSeq = null;
    this.watchSeq = null;
  }
}
