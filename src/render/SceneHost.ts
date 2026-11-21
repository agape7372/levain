// 씬 수명주기 — 정본: docs/ARCHITECTURE.md §4, docs/VISUAL.md §1.
// 컨텍스트 유실 = 전체 재구축(부분 복구 로직의 버그 표면을 사지 않는다).
import * as THREE from 'three';
import { DoughMesh } from './dough/DoughMesh';
import type { StrandBreak } from './dough/StrandMesh';
import { createJar, type Jar } from './jar';
import { createGroundShadow } from './background';
import { attachInput } from './input';
import { Cloth } from './cloth';
import { BreadShowcase } from './breadShowcase';
import { createRoomEnvironment } from './breadMaterial';
import { ParticlePool } from './particles';
import { smoothParams, type RenderParams } from './renderParams';

// 세로폰(aspect ~0.46)에서 병 폭 ≈ 화면 70%, 병+헤드룸 55~65% 점유 (VISUAL §1-1 목표값 실측 보정)
const VIEW_H = 5.4;
const LOOK_Y = 0.64; // 병 몸통 중심보다 살짝 위 — 상단 HUD 헤드룸 · 아래 위치 알약과 틈(VISUAL §1-1)
/** 카메라 시선 고도(°) — 2026-11-19 52.1° → 42°(반죽 모델 v2, VISUAL §1-1). 옆벽 높이가 보여야 성장이 읽힌다.
 *  쇼케이스 빵 기울기(breadShowcase.ts)가 이 값에서 계산된다 — 바꿔도 빵은 썸네일과 같은 36°로 보인다 */
export const CAM_ELEV_DEG = 42;
/** 시선 기준점까지 거리 — 직교라 화면 크기와 무관, near/far 안에만 두면 된다(구 (0,8,5.6)과 같은 9.12) */
const CAM_DIST = 9.12;
/** 픽셀 비율 상한(고정) · 버퍼 총 픽셀 상한 — 큰 태블릿(800×1280@2 = 3.9M px)에서 반죽 프래그 비용을 묶는다 (T4-11).
 *  360×728 폰은 비율 2 그대로(1.05M px) — 총량 상한은 큰 화면에서만 물린다 */
const MAX_DPR = 2;
const MAX_BUFFER_PIXELS = 2.2e6;

/** CSS 크기 w×h 스테이지의 픽셀 비율 — DPR 상한과 버퍼 총량 상한 중 작은 쪽. 테스트용 export */
export function fitPixelRatio(dpr: number, w: number, h: number): number {
  return Math.min(dpr, MAX_DPR, Math.sqrt(MAX_BUFFER_PIXELS / (w * h)));
}

type LightRig = {
  /** pos 생략 = KEY_POS(홈 · 기본 쇼케이스) */
  key: { color: number; intensity: number; pos?: [number, number, number] };
  ambient: { color: number; intensity: number };
  fill: { color: number; intensity: number };
  /** 측면 노출 2차 캘리브레이션(2026-08-30) 전용 — HOME_LIGHT는 생략(=끔), SHOWCASE_LIGHT만 갖는다. */
  hemi?: { sky: number; ground: number; intensity: number };
};

// 홈 씬(병·반죽·천) 조명 — 프로토타입 계승 + 차가운 필 (VISUAL §1-3). 게임 화면 전체가 이 조명을
// 쓰므로 **여기는 건드리지 않는다** — 빵 쇼케이스 파리티 캘리브레이션은 SHOWCASE_LIGHT로 분리.
const HOME_LIGHT: LightRig = {
  key: { color: 0xffe2b0, intensity: 1.4 },
  ambient: { color: 0xfff0dc, intensity: 0.55 },
  fill: { color: 0xdce8ff, intensity: 0.15 },
};
// 빵 쇼케이스 전용 조명(2026-08-30 캘리브레이션, 2차 개정) — breadlab.ts/thumbsHarness.ts와 동일
// 값·근거(docs/VISUAL.md §1-3). 빵 GLB는 정본 hex 그대로 보여야 하므로 enterShowcase()/exitShowcase()
// 에서만 이 값으로 스왑한다 — 홈 씬(병·반죽·천)은 절대 이 조명을 쓰지 않는다.
// hemi: sky=검정이라 윗면(normal +Y) 기여가 정확히 0 — 윗면 파리티는 그대로, 수직 측벽만 순증된다.
const SHOWCASE_LIGHT: LightRig = {
  key: { color: 0xffffff, intensity: 2.4 },
  ambient: { color: 0xffffff, intensity: 0.7656 },
  fill: { color: 0xffffff, intensity: 0.3 },
  hemi: { sky: 0x000000, ground: 0xffffff, intensity: 1.7 },
};
// 툰 빵(toonMaterial.ts) 쇼케이스 — 기본 쇼케이스 조명은 앰비언트 · 반구가 커서 세 단 그늘이 안 보인다.
// 직광을 옆 뒤로 돌려 벽면이 단을 가르게 한다. thumbsHarness.ts 툰 분기와 같은 값(2026-11-17 스타일 시험).
const TOON_SHOWCASE_LIGHT: LightRig = {
  key: { color: 0xffffff, intensity: 2.8, pos: [-4, 2.5, -1] },
  ambient: { color: 0xffffff, intensity: 0.3 },
  fill: { color: 0xffffff, intensity: 0.3 },
};
const KEY_POS: [number, number, number] = [-2, 6, 2];
/** 밥 주기 끝에 남기는 줄무늬 세기 — 뒤는 혼자 τ6s · 손으로 저으면 빨리(DoughMesh) */
const FEED_MARBLE_END = 0.35;

export class SceneHost {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  private raf = 0;
  private running = false;
  /** 호출자가 원하는 구동 상태 — start()/stop() 공개 호출만 바꾼다. 컨텍스트 유실의 내부 정지는 건드리지 않는다 (T4-3) */
  private wantRunning = false;
  /** 마지막으로 받은 개체 시드·쇼케이스 url — 컨텍스트 복구 뒤 재적용 (T4-3) */
  private seed: number | null = null;
  private showcaseUrl: string | null = null;
  private showcaseToon = false;
  /** 셰이더 시계 원점 — start()마다 새로 잡는다. uTime을 작게 유지해 float32 해상도를 지킨다 (T4-9) */
  private shaderT0 = 0;
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
  /** 당기기(grab) 훅 — 배선은 app.ts. onGrabMove 인자 = 신장 정도 0~1 (DoughMesh.grabStretch01, 여기서 한 번 더 자른다) */
  onGrabStart: (() => void) | null = null;
  onGrabMove: ((stretch01: number) => void) | null = null;
  onGrabEnd: (() => void) | null = null;
  /** 들기 사건 — 항복(yield) · 다리 끊김(break: thin = 가는 다리, last = 마지막) · 착지(land: torn = 뜯고 떨어짐). 묽음 · 휴면은 끊김을 안 부른다. 배선은 app.ts */
  onGrabEvent: ((e: StrandBreak) => void) | null = null;
  /** 다 섞임 — 손으로 저어 밥 주기 줄무늬를 0.05 아래로 떨어뜨린 순간 한 번(혼자 옅어지면 안 부른다). 배선은 app.ts */
  onMixed: (() => void) | null = null;
  /** 배경 좌우 스와이프 = 르방 전환 (§5-5). 허용 여부·처리 모두 배선은 app.ts.
   *  필드 위임인 이유: 컨텍스트 유실 복구가 dispose→mount로 attachInput을 다시 부른다 */
  canSwipe: (() => boolean) | null = null;
  onSwipe: ((dir: 1 | -1) => void) | null = null;
  /** 전환 슬라이드 진행 중 타이머 — 연타 시 정리하고 즉시 교체 (slideSwap) */
  private slideTimer: ReturnType<typeof setTimeout> | null = null;
  private cloth: Cloth | null = null;
  private jar: Jar | null = null;
  private showcase: BreadShowcase | null = null;
  /** PBR 빵 환경맵 — 쇼케이스가 처음 요구할 때 만든다(breadMaterial.ts) */
  private roomEnv: THREE.Texture | null = null;
  /** 조명 3등 — 쇼케이스 진입/이탈 시 HOME_LIGHT ↔ SHOWCASE_LIGHT 스왑 대상 */
  private keyLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  /** 쇼케이스 측면 노출 보정 전용 — HOME_LIGHT엔 hemi가 없으므로 exitShowcase()가 intensity 0으로 끈다. */
  private hemiLight: THREE.HemisphereLight | null = null;
  // 고무줄 마커 제거(사용자 확정) — setBandY 계열 전부 삭제됨
  /** 홈 씬 오브젝트 — 쇼케이스 진입 시 통째로 숨긴다 */
  private homeGroup: THREE.Object3D[] = [];
  private showcaseDrag: { detach: () => void } | null = null;
  private showcaseSeq = 0;
  private current: RenderParams | null = null;
  private target: RenderParams | null = null;
  private lastT = 0;
  private particles: ParticlePool | null = null;
  /** 밥주기 연출 (VISUAL §4-1) — pour=부활 따라내기 선행 */
  private feedSeq: { t0: number; pour: boolean; flourDone: boolean; bubblesDone: boolean; marbleOn: boolean; phase0: number } | null = null;
  /** 부활 2회차 "지켜보기" — 12% 줌인 (VISUAL §4-3) */
  private watchSeq: { t0: number } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private stage: HTMLElement,
  ) {}

  mount(): void {
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_DPR)); // 고정 상한 — 어댑티브 없음. 총량 상한은 fit()
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    // 배경은 CSS 라디얼 그라디언트(#stage) — 캔버스는 투명

    // 카메라: 직교 42° 틸트 3/4 부감 (VISUAL §1-1)
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
    this.setCameraElevation(CAM_ELEV_DEG);

    // 조명: 홈 씬 값(HOME_LIGHT)으로 초기화 — 쇼케이스 진입 시에만 스왑(VISUAL §1-3)
    const key = new THREE.DirectionalLight(HOME_LIGHT.key.color, HOME_LIGHT.key.intensity);
    key.position.set(...KEY_POS);
    this.scene.add(key);
    const ambient = new THREE.AmbientLight(HOME_LIGHT.ambient.color, HOME_LIGHT.ambient.intensity);
    this.scene.add(ambient);
    const fill = new THREE.DirectionalLight(HOME_LIGHT.fill.color, HOME_LIGHT.fill.intensity);
    fill.position.set(2.5, 3, -2);
    this.scene.add(fill);
    // HOME_LIGHT엔 hemi가 없으므로 intensity 0으로 시작(끔) — enterShowcase()가 SHOWCASE_LIGHT.hemi로 켠다.
    const hemi = new THREE.HemisphereLight(0x000000, 0xffffff, 0);
    this.scene.add(hemi);
    this.hemiLight = hemi;
    this.keyLight = key;
    this.ambientLight = ambient;
    this.fillLight = fill;

    this.scene.add(createGroundShadow());

    const jar = createJar();
    this.scene.add(jar.group);
    this.jar = jar;

    this.dough = new DoughMesh();
    this.scene.add(this.dough.mesh);
    jar.shareSurface(this.dough.material.uniforms); // 윗물 윗면이 반죽 수면과 같은 기울기(S7)

    this.particles = new ParticlePool();
    this.scene.add(this.particles.mesh);

    this.cloth = new Cloth();
    this.scene.add(this.cloth.mesh);

    // 환경맵은 PBR 빵을 처음 띄울 때 한 번 만든다 — 렌더러 수명(dispose가 버린다)
    this.showcase = new BreadShowcase(() => (this.roomEnv ??= createRoomEnvironment(renderer)));
    this.scene.add(this.showcase.group);
    // 파티클 풀은 홈·쇼케이스 공용(김) — homeGroup에서 제외
    this.homeGroup = [jar.group, this.dough.mesh, this.cloth.mesh]; // 들기 기둥은 반죽 메시 자체(떼어내기 v5 꼬집기 — 따로 메시 없음)

    this.detachInput = attachInput(this.canvas, this.camera, this.dough, {
      isBlocked: () => this.isShowcasing(), // 쇼케이스 위에서 젓기 소리·햅틱·천 걷기가 나면 안 된다
      isCovered: () => this.cloth?.covering ?? false,
      onUncover: () => this.uncover(),
      onStirStart: () => this.onStirStart?.(),
      onStirMove: (s) => this.onStirMove?.(s),
      onStirEnd: () => this.onStirEnd?.(),
      onGrabStart: () => this.onGrabStart?.(),
      onGrabMove: (s) => this.onGrabMove?.(Math.min(1, Math.max(0, s))),
      onGrabEnd: () => this.onGrabEnd?.(),
      canSwipe: () => (this.canSwipe?.() ?? false) && !this.isSequenceActive(),
      onSwipe: (dir) => this.onSwipe?.(dir),
    });

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.stage);
    this.fit();

    // 셰이더를 로딩 때 한 번 컴파일 — 첫 당김 버벅임 방지
    renderer.compile(this.scene, this.camera);

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
    this.halt(); // wantRunning은 그대로 — 복구 뒤 재개 여부의 근거
  };

  private onContextRestored = (): void => {
    const showcaseUrl = this.showcaseUrl; // dispose가 비우기 전에 챙긴다
    const toon = this.showcaseToon;
    this.dispose();
    this.mount();
    // 새 반죽은 기본값(시드 0.37·기본 파라미터)으로 태어난다 — 유실 전 상태를 다시 입힌다
    if (this.seed !== null) this.dough?.setSeed(this.seed);
    if (this.current) this.dough?.applyParams(this.current);
    if (this.wantRunning) this.start(); // 레시피 탭처럼 멈춰 있던 씬은 멈춘 채로
    // 쇼케이스 중이었으면 빵을 다시 올린다 — enterShowcase가 showcaseSeq를 올려 늦은 이전 로드는 버려진다
    if (showcaseUrl) this.enterShowcase(showcaseUrl, toon).catch(() => {});
  };

  /** 시선 고도(°) — 기본 CAM_ELEV_DEG. motionlab 고도 비교(?cam=)용으로 열어 둔다 */
  setCameraElevation(deg: number): void {
    const a = (deg * Math.PI) / 180;
    this.camera.position.set(0, LOOK_Y + CAM_DIST * Math.sin(a), CAM_DIST * Math.cos(a));
    this.camera.lookAt(0, LOOK_Y, 0);
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
    // 지난 르방의 젓기 꺼짐 · 줄무늬 · 탁해짐 · 고랑을 넘기지 않는다(R1). 스와이프는 skipSequence → endFeedSeq 뒤라 연출 끝 줄무늬도 지운다.
    // jar 탁해짐은 다음 프레임 loop가 dough.murk(0)를 setMurk로 넘긴다
    this.dough?.resetTransient();
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
      marbleOn: false,
      phase0: this.dough?.marblePhase ?? 0, // 덮개 소용돌이 기준 — 지난 젓기 위상이 쌓여 있어도 시작은 0
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
    this.seed = seed;
    this.dough?.setSeed(seed);
  }

  /** 천 덮개 덮기 — 콜드 스타트·오랜 부재 복귀 (조건 판단은 app.ts) */
  coverCloth(): void {
    this.cloth?.cover();
    // 쇼케이스 중엔 입력이 막혀 걷을 수 없다 — 상태(covering)만 두고 보이지 않게, exitShowcase가 homeGroup을 켜면 나타난다 (R-01)
    if (this.cloth && this.isShowcasing()) this.cloth.mesh.visible = false;
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

  /** 조명 3등을 rig 값으로 스왑 (enterShowcase/exitShowcase 전용, 다른 경로에서 호출 금지) */
  private applyLightRig(rig: LightRig): void {
    this.keyLight?.color.setHex(rig.key.color);
    if (this.keyLight) this.keyLight.intensity = rig.key.intensity;
    this.keyLight?.position.set(...(rig.key.pos ?? KEY_POS));
    this.ambientLight?.color.setHex(rig.ambient.color);
    if (this.ambientLight) this.ambientLight.intensity = rig.ambient.intensity;
    this.fillLight?.color.setHex(rig.fill.color);
    if (this.fillLight) this.fillLight.intensity = rig.fill.intensity;
    // rig.hemi 부재(HOME_LIGHT) = 0으로 꺼서 원복 — sky/ground 색은 항상 고정, intensity만 스왑한다.
    const hemi = rig.hemi ?? { sky: 0x000000, ground: 0xffffff, intensity: 0 };
    this.hemiLight?.color.setHex(hemi.sky);
    this.hemiLight?.groundColor.setHex(hemi.ground);
    if (this.hemiLight) this.hemiLight.intensity = hemi.intensity;
  }

  /** 쇼케이스 진입 — 홈 씬 숨기고 GLB 턴테이블. 로드 실패는 reject (호출자 폴백) */
  async enterShowcase(url: string, toon = false): Promise<void> {
    if (!this.showcase) throw new Error('scene not mounted');
    const seq = ++this.showcaseSeq;
    await this.showcase.load(url, toon);
    // 늦게 도착해 버려진 로드면 진행하지 않는다 — show·리스너 부착이 두 번 되던 경로 (T7-02)
    if (seq !== this.showcaseSeq) throw new Error('showcase load superseded');
    this.showcaseUrl = url;
    this.showcaseToon = toon;
    this.showcaseDrag?.detach();
    for (const o of this.homeGroup) o.visible = false;
    this.showcase.show();
    // 빵 GLB는 정본 hex 파리티 조명(SHOWCASE_LIGHT)으로 — 홈 씬 진입 전까지만 유효(exitShowcase가 원복)
    this.applyLightRig(toon ? TOON_SHOWCASE_LIGHT : SHOWCASE_LIGHT);
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
    this.showcaseUrl = null;
    this.showcaseDrag?.detach();
    this.showcaseDrag = null;
    this.showcase?.hide();
    for (const o of this.homeGroup) o.visible = true;
    // 덮개는 걷힌 상태가 기본 — cover()가 아닌 한 다시 나타나지 않게
    this.cloth?.finishOpen(); // 걷는 도중 숨겨졌다면 여기서 마무리(밀가루 모트 콜백 포함)
    if (this.cloth && !this.cloth.covering) this.cloth.mesh.visible = false;
    this.applyLightRig(HOME_LIGHT); // 조명 원복 — 홈 씬은 항상 HOME_LIGHT
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
    const s = this.feedSeq;
    this.feedSeq = null;
    if (this.dough) {
      const u = this.dough.material.uniforms;
      u.uFlourDust.value = 0;
      // 끝 상태 = 줄무늬 0.35(스킵해도 같은 자리로). 손이 이미 더 섞었으면 그대로
      if (!s.marbleOn || this.dough.marble > FEED_MARBLE_END) this.dough.setMarble(FEED_MARBLE_END);
      if (this.current) u.uSpecStr.value = this.current.specStr; // 물기 광 램프 원복
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
        // 마른 가루 덮개(윗면만): 0~0.6 상승, 1.2~2.4 젓기가 줄무늬로 바꾼다
        u.uFlourDust.value = fs < 0.6 ? fs / 0.6 : fs < 1.2 ? 1 : fs < 2.4 ? Math.max(0, 1 - (fs - 1.2) / 1.2) : 0;
        u.uFlourSwirl.value = dough.marblePhase - s.phase0; // 덮개가 젓는 방향으로 나선을 그리며 늘어난다(F2)
        // 물기 — 광 상승 (물 리본 컷 — VISUAL §4-1). 상태 광에서 잰다 — 옛 식은 프레임마다 누적돼 1.2에 붙어 남았다
        const spec0 = this.current?.specStr ?? 0.5;
        u.uSpecStr.value = fs > 0.5 && fs < 1.4 ? Math.min(1.2, spec0 + 0.5 * Math.sin(Math.PI * (fs - 0.5) / 0.9)) : spec0;
        // 줄무늬 — 덮개가 걷히는 만큼 1 → 0.35. 손이 더 섞었으면 그 값을 지킨다(min)
        if (fs >= 1.2) {
          if (!s.marbleOn) {
            s.marbleOn = true;
            dough.setMarble(1);
          }
          const target = 1 - (1 - FEED_MARBLE_END) * Math.min(1, (fs - 1.2) / 1.2);
          dough.setMarble(Math.min(dough.marble, target));
        }
        // 젓기 — 나무 숟가락이 원을 그리듯 시어장을 원형 구동 + 원형 wobble. 손이 젓고 있으면 손이 이긴다
        if (fs >= 1.2 && fs < 2.4 && !dough.isHandStirring()) {
          const sp = (fs - 1.2) / 1.2;
          const env = Math.sin(Math.PI * sp); // 시작·끝은 부드럽게
          const ang = sp * Math.PI * 2 * 1.5; // 한 바퀴 반
          dough.setStirInput(
            Math.cos(ang) * 0.28,
            Math.sin(ang) * 0.28,
            -Math.sin(ang) * 2.2 * env,
            Math.cos(ang) * 2.2 * env,
            false, // wobble은 아래에서 직접 연출 — tick의 속도 유래 구동과 충돌 방지
            false, // 손 아님 — 줄무늬를 손처럼 지우지 않고 다 섞임 신호도 없다
          );
          // 되직한 반죽은 판째 돌지 않는다 — 젓기 출렁과 같은 배율(테두리는 버텍스가 고정)
          const g = 0.06 * dough.sloshGain();
          dough.wobble.set(Math.cos(ang) * g, Math.sin(ang) * g);
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
    this.renderer.setPixelRatio(fitPixelRatio(devicePixelRatio, w, h));
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
    this.wantRunning = true;
    if (this.running) return;
    this.running = true;
    // 단조 시계(performance.now) 자체는 JS double이라 안전하지만, 셰이더 uTime은 float32 — 며칠 켜 둔 앱에서
    // 해상도가 떨어지지 않게 원점을 새로 잡는다. CPU 쪽(기포·트레일·숨쉬기 위상·시퀀스)은 절대 t 그대로라
    // 원점 이동에 영향받지 않는다. 시계는 정지→재개 때만 옮기므로 화면이 멈춰 있던 동안의 점프는 안 보인다 (T4-9)
    this.shaderT0 = performance.now() / 1000;
    const loop = (): void => {
      if (!this.running || !this.renderer) return;
      const t = performance.now() / 1000; // rAF 델타 누적 금지 — 단조 시계
      const dt = this.lastT > 0 ? Math.min(0.1, t - this.lastT) : 0.016;
      this.lastT = t;

      if (this.current && this.target && this.current !== this.target) {
        this.current = smoothParams(this.current, this.target, dt);
        this.dough?.applyParams(this.current);
      }
      const ts = t - this.shaderT0;
      this.dough?.tick(t, ts);
      this.driveSequences(t);
      this.cloth?.tick(t);
      this.showcase?.tick(dt);
      this.particles?.update(dt);
      // 쇼케이스 중엔 반죽이 숨어 있다 — 안 보이는 기포 소리를 내지 않는다 (T4-4)
      if (this.dough && this.dough.bubbles.popsThisFrame > 0 && !this.isShowcasing()) this.onBubblePop?.();
      if (this.dough?.mixedThisFrame) this.onMixed?.();
      if (this.dough && !this.isShowcasing()) for (const b of this.dough.grabBreaks) this.onGrabEvent?.(b);
      if (this.dough && this.jar && this.current) {
        // 테두리 높이를 한 번만 뽑아 둘에 공급 — hooch 층과 유리 자국이 같은 수면 좌표계를 쓴다
        const level = this.dough.levelY();
        this.jar.setHooch(this.current.hoochAmt, level, this.current.height, ts);
        this.jar.setLevel(level, Math.max(level, this.current.markHeight), this.current.residue, this.current.wet);
        this.jar.setClimate(this.current.chill, this.current.warm);
        this.jar.setMurk(this.dough.murk, this.dough.marblePhase, this.current.color);
      }
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.wantRunning = false;
    this.halt();
  }

  /** rAF만 끊는다 — wantRunning은 건드리지 않는다 (컨텍스트 유실·dispose 내부용) */
  private halt(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    this.halt();
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
    this.showcaseUrl = null;
    this.roomEnv?.dispose();
    this.roomEnv = null;
    this.homeGroup = [];
    this.keyLight = null;
    this.ambientLight = null;
    this.fillLight = null;
    this.hemiLight = null;
    this.feedSeq = null;
    this.watchSeq = null;
  }
}
