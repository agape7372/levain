// 씬 수명주기 — 정본: docs/ARCHITECTURE.md §4, docs/VISUAL.md §1.
// 컨텍스트 유실 = 전체 재구축(부분 복구 로직의 버그 표면을 사지 않는다).
import * as THREE from 'three';
import { DoughMesh } from './dough/DoughMesh';
import { createJar } from './jar';
import { createGroundShadow } from './background';
import { attachInput } from './input';

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
  private band: THREE.Mesh | null = null;

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
    this.band = jar.band;

    this.dough = new DoughMesh();
    this.scene.add(this.dough.mesh);

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

  /** 고무줄 마커 높이 — 마지막 밥 시점 반죽 높이 (M3에서 상태 연결) */
  setBandY(y: number): void {
    if (this.band) this.band.position.y = y;
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
      this.dough?.tick(t);
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
    this.band = null;
  }
}
