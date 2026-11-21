// 포인터 제스처 FSM — 반죽 촉감의 입력층 (VISUAL §5, 확장기획 §4-2 개편).
//   탭(<8px & <250ms)      → poke 덴트 (damped spring 복귀)
//   홀드 0.8s(무이동)       → 손가락 쪽 살짝 부풂 (swell)
//   드래그(≥8px)            → 2채널: 반죽 위에서 천천히 끌면 미확정(젓기처럼) → 경로 32px에서
//                             곧고 화면 위쪽 ±40° 안이면 grab(들기 — 꼬집힌 기둥 꼭대기가 손끝을 따른다), 아니면 stir(F1 · §6-1).
//                             빠르게 문지르거나 반죽 밖 시작이면 stir(속도 시어장)
//                             — 소유권은 중간에 안 바뀐다 (§5-5 원칙). 예외 하나: grab 중 원 · 가로 왕복을
//                             그리면 stir로 넘긴다(StirJudge, 한 방향만 · 되돌아가지 않음). 내렸다 다시 올리기는 grab 유지
// grab 중 손끝 = 카메라를 마주 보는 수직 평면(누른 점을 지남)과 손끝 광선의 교점(월드) — 직교 카메라라 가닥 끝이 손끝을 1:1로 따른다.
//   배경 시작 + 수평 우세      → swipe(르방 전환). canSwipe()가 false면 이 분기 자체가 없다
//                             (= 기존 stir 경로 그대로)
//   덮개 덮임               → 위로 플릭 또는 탭 = 걷기, 반죽 조작은 통과 안 함
// grab 놓기 = pointerup/cancel (M2 해소 — 80ms 정지 판정은 stir 전용).
// pointermove는 rAF 코얼레싱 — 프레임당 1회만 레이캐스트.
import * as THREE from 'three';
import { XZ_SCALE, type DoughMesh } from './dough/DoughMesh';

const TAP_MAX_MS = 250;
const TAP_MAX_PX = 8;
const HOLD_MS = 800;
const FLICK_UP_PX = 40;   // 위로 플릭 판정 최소 이동
const FLICK_MAX_MS = 350;
/** 드래그 분류 임계 — 이 픽셀 속도(px/ms) 미만이면 grab, 이상이면 stir.
 *  0.9는 실기기에서 grab이 잘 안 잡힘(터치 첫 move가 빠르게 판정) → 1.6 상향 (2026-08-24) */
const GRAB_MAX_PX_PER_MS = 1.6;
/** 좌우 스와이프(르방 전환) 최소 이동 · 수평 우세비 (§5-5) */
const SWIPE_MIN_PX = 48;
const SWIPE_H_RATIO = 1.5;
/** 반죽 위 판정 여유 — 실측 몸통 반경(DoughMesh.bodyRadius)에 곱한다. 경계는 반죽 쪽으로 */
const DOUGH_HIT_MARGIN = 1.15;
/** 옆벽 탭 · 끌기를 보낼 테두리 점 — 몸통 반경 비(R-M2) */
const WALL_RIM = 0.95;

/** grab → stir 넘김 판정(M1) — 이 픽셀 미만 조각은 다음 점과 합친다(손떨림 · 아주 느린 끌기).
 *  10px: 4px였을 땐 ±2px 떨림 섞인 곧은 당김이 32px에서 Σ 33°로 흔들렸고, 당긴 채 머무는 ±3px 떨림이
 *  뒤집힘으로 쌓여 넘어갔다(R3). ±3px 떨림은 한 점에서 10px 조각을 못 만든다(최대 8.5px) */
const STIR_SEG_PX = 10;
/** 부호 있는 회전 누적이 이 각도를 넘으면 원 그리기 */
const STIR_TURN_RAD = (100 * Math.PI) / 180;
/** 직전 조각과 내적이 이 값 미만 = 방향 뒤집힘. 이만큼 뒤집히면 왕복 */
const STIR_FLIP_DOT = -0.5;
const STIR_FLIPS = 2;
/** 미확정 판정(F1) — 반죽 위 느린 끌기는 경로가 이만큼 갈 때까지 젓기로 다루다가 한 번 가른다 */
const GRAB_COMMIT_PX = 32;
/** 그때 |Σ|가 이 각도 미만이면 곧은 당김 = grab. 반경 80px 원은 32px에서 약 20° */
const GRAB_COMMIT_TURN_RAD = (15 * Math.PI) / 180;
/** 위로 끄는 것만 grab — 누른 점 → 지금 점이 화면 위쪽 ±40° 안(엄지 대각선, §6-1). 타원 뒤 호(화면 가로)는 곧아도 stir */
const GRAB_UP_COS = Math.cos((40 * Math.PI) / 180);

/** 화면 위쪽 ±40° 안인가(dy는 화면 아래가 +). 테스트용 export */
export function isUpward(dx: number, dy: number): boolean {
  return -dy >= Math.hypot(dx, dy) * GRAB_UP_COS && dy < 0;
}

/** grab 중 손짓이 젓기인지 — 화면 픽셀 점을 차례로 받아, 넘길 때가 되면 true.
 *  회전 누적은 조각 사이 꺾임(90° 이하만)의 합 = 처음 방향에서 지금 방향까지 돈 각도라
 *  떨림은 서로 지워지고 ㄱ자 한 번 꺾기는 안 쌓인다. 테스트용 export */
export class StirJudge {
  private ax: number;
  private ay: number;
  private dx = 0;
  private dy = 0;
  private turn = 0;
  private flips = 0;
  /** 받아들인 조각 길이 합(px) */
  path = 0;
  /** grab 확정 뒤 — 가로 우세 조각만 뒤집힘으로 센다(내렸다 다시 올리기 = grab 유지, §6-1) */
  horizFlipsOnly = false;
  constructor(x: number, y: number) {
    this.ax = x;
    this.ay = y;
  }
  push(x: number, y: number): boolean {
    const sx = x - this.ax;
    const sy = y - this.ay;
    const len = Math.hypot(sx, sy);
    if (len < STIR_SEG_PX) return false;
    const ux = sx / len;
    const uy = sy / len;
    if (this.dx !== 0 || this.dy !== 0) {
      const dot = this.dx * ux + this.dy * uy;
      if (dot < STIR_FLIP_DOT) {
        if (!this.horizFlipsOnly || Math.abs(ux) > Math.abs(uy)) this.flips++;
      }
      else if (dot >= 0) this.turn += Math.atan2(this.dx * uy - this.dy * ux, dot);
    }
    this.dx = ux;
    this.dy = uy;
    this.ax = x;
    this.ay = y;
    this.path += len;
    return Math.abs(this.turn) >= STIR_TURN_RAD || this.flips >= STIR_FLIPS;
  }
  /** 곧은 당김인가 — 부호 있는 회전 누적이 GRAB_COMMIT_TURN 미만 */
  straight(): boolean {
    return Math.abs(this.turn) < GRAB_COMMIT_TURN_RAD;
  }
}

export interface InputHooks {
  /** 홈 입력을 통째로 막는가 — 쇼케이스 중엔 캔버스가 빵 돌리기 전용이라 젓기·걷기·소리가 나면 안 된다 */
  isBlocked?(): boolean;
  /** 덮개가 덮여 있는가 — true면 반죽 조작 대신 걷기 제스처만 받는다 */
  isCovered?(): boolean;
  /** 덮개 걷기 요청 (플릭/탭) */
  onUncover?(): void;
  onStirStart?(): void;
  /** 젓는 속도 0~1 — squelch 게인 추종 */
  onStirMove?(speed01: number): void;
  onStirEnd?(): void;
  onGrabStart?(): void;
  /** 신장 정도 0~1 — 사운드 훅용. DoughMesh.grabStretch01() 값 그대로(주 가닥 길이 ÷ 주 가닥 끊김 길이, 상한 1). 배선은 SceneHost.onGrab* → app.ts.
   *  항복 · 끊김 · 착지(소리 · 진동)는 렌더 tick에서 나므로 여기 말고 SceneHost.onGrabEvent */
  onGrabMove?(stretch01: number): void;
  onGrabEnd?(): void;
  /** 지금 르방 전환 스와이프를 받아도 되는가 (르방 2마리 이상·모달/연출/쇼케이스 아님) */
  canSwipe?(): boolean;
  /** 전환 방향 — 왼쪽으로 끌면 +1(다음), 오른쪽이면 -1(이전). 칩 ‹ › 와 같은 순서 */
  onSwipe?(dir: 1 | -1): void;
}

/** 스와이프 확정 판정 — 누적 이동 기준(8px 시점의 dx/dy 비는 터치 노이즈다). 테스트용 export */
export function isSwipeCommit(dx: number, dy: number): boolean {
  return Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * SWIPE_H_RATIO;
}

export function attachInput(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  dough: DoughMesh,
  hooks: InputHooks = {},
): () => void {
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  // 반죽 윗면 근사 평면 — fill(부피)에 따라 매 캐스트 갱신 (§4 부수 발견: 고정 0.55는
  // fill 1.0에서 실제 윗면 y≈0.98과 어긋나 손끝과 눌리는 지점이 밀렸다)
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.55);
  const hit = new THREE.Vector3();
  /** grab 중 손끝 평면 — 누른 점을 지나고 카메라를 마주 보는 수직 평면 */
  const vplane = new THREE.Plane();
  const vnorm = new THREE.Vector3();
  const vhit = new THREE.Vector3();

  let down = false;
  let downX = 0;
  let downY = 0;
  let downAt = 0;
  let moved = false;
  // swipeCandidate = 배경에서 시작해 수평 우세지만 **아직 확정 전**. 젓기는 계속 흘려보낸다.
  // 확정(isSwipeCommit)되는 순간에만 'swipe'로 승격하고 그때 젓기를 취소한다 —
  // 8px 시점에 잠가 버리면 반죽을 젓다가 옆 르방으로 넘어간다 (2026-08-25 실기기 신고)
  // pending = 반죽 위 느린 끌기, 곧은 당김인지 아직 모름(F1). 젓기처럼 흘리다가 GRAB_COMMIT_PX에서 가른다
  let mode: 'grab' | 'pending' | 'stir' | 'swipe' | 'swipeCandidate' | null = null;
  /** 넘김 판정기 — pending · grab일 때만 있다 */
  let judge: StirJudge | null = null;
  let downOnDough = false;
  /** 제스처 소유 포인터 — 기기를 쥔 엄지가 스쳐도 진행 중인 제스처를 뺏기지 않는다 */
  let activeId: number | null = null;
  let downHitX = 0;
  let downHitZ = 0;
  /** 누른 점 월드 y — 평면 교점(옆벽 스냅이면 테두리 높이) */
  let downHitY = 0;
  /** 누름 때 옆벽 스냅이 옮긴 거리(월드) — 끌기 좌표 = 평면 교점 + 이 값. 윗면 시작이면 0 */
  let snapDX = 0;
  let snapDZ = 0;
  let coveredGesture = false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let holding = false;
  /** 이 획에서 들기 후보 덴트를 이미 눌렀나(떼어내기 v5 새 눈 r1 ⑤) */
  let liftPressed = false;

  let lastHitX = 0;
  let lastHitZ = 0;
  let lastHitT = 0;

  let pendingMove: PointerEvent | null = null;
  let rafId = 0;

  const raycast = (e: PointerEvent): boolean => {
    const r = canvas.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    // 부피 연동 — 손끝 = 눌리는 지점. 가운데 꼭대기(topY)와 테두리(levelY) 사이에 둔다:
    // topY만 보면 하강(가운데 꺼짐)에서 테두리 탭이 반경의 ~10% 밀렸다(R-L2)
    plane.constant = -(dough.topY() + dough.levelY()) / 2;
    return ray.ray.intersectPlane(plane, hit) !== null;
  };

  /** 유리 너머 옆벽(R-M2) — 직전 raycast의 평면 교점이 몸통 밖이면 원기둥 x²+z² = R², 0 ≤ y ≤ levelY의 앞면 교점을 본다.
   *  맞으면 같은 방위의 테두리 안쪽 점으로 보낸다 — 덴트 · grab 앵커가 손끝 바로 위 테두리에 걸린다.
   *  누름 · 탭에만 쓴다. 끌기 중에 쓰면 옆벽 위에서 목표가 테두리에 묶였다가 바닥선에서 튄다(RV-H1) */
  const snapWall = (): void => {
    const R = dough.bodyRadius() * XZ_SCALE;
    if (Math.hypot(hit.x, hit.z) <= R) return;
    const { origin: o, direction: d } = ray.ray;
    const a = d.x * d.x + d.z * d.z;
    const b = o.x * d.x + o.z * d.z;
    const disc = b * b - a * (o.x * o.x + o.z * o.z - R * R);
    if (a <= 1e-9 || disc < 0) return;
    const t = (-b - Math.sqrt(disc)) / a; // 가까운 근 = 카메라 쪽 앞면
    const y = o.y + d.y * t;
    const levelY = dough.levelY();
    // 교점은 반경 R 위 — 같은 방위로 WALL_RIM배 안쪽
    if (t > 0 && y >= 0 && y <= levelY) hit.set((o.x + d.x * t) * WALL_RIM, levelY, (o.z + d.z * t) * WALL_RIM);
  };

  const clearHold = (): void => {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (holding) dough.holdEnd(); // 떼기·움직임·취소 = 홀드 끝(easeOut)
    holding = false;
  };

  const endDrag = (): void => {
    if (mode === 'stir' || mode === 'pending' || mode === 'swipeCandidate') hooks.onStirEnd?.();
    if (mode === 'grab') {
      dough.grabEnd();
      hooks.onGrabEnd?.();
    }
    mode = null;
  };

  const processMove = (): void => {
    rafId = 0;
    const e = pendingMove;
    pendingMove = null;
    if (!e || !down || coveredGesture) return;
    if (!moved) {
      const distPx = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (distPx > TAP_MAX_PX) {
        moved = true;
        clearHold();
        // 드래그 분류 — 임계 도달 시점의 픽셀 속도. 세션 소유권 고정
        const dtMs = Math.max(1, performance.now() - downAt);
        const slow = distPx / dtMs < GRAB_MAX_PX_PER_MS;
        const dxT = e.clientX - downX;
        const dyT = e.clientY - downY;
        if (downOnDough && slow) {
          // 바로 들지 않는다 — 원을 그리기 시작하면 판째 들린 원판이 윗물을 뚫었다(F1). 소리 · 고랑은 바로
          mode = 'pending';
          judge = new StirJudge(downX, downY);
          hooks.onStirStart?.();
        } else if (
          // 배경 시작 + 수평 우세 → 스와이프 **후보**. 확정은 아래 승격 지점에서만 (§5-5)
          !downOnDough &&
          (hooks.canSwipe?.() ?? false) &&
          Math.abs(dxT) > Math.abs(dyT)
        ) {
          mode = 'swipeCandidate';
          hooks.onStirStart?.(); // 미달로 끝나면 그냥 젓기였던 셈 — 반죽 밖 시작이라 손실 없다
        } else {
          mode = 'stir';
          hooks.onStirStart?.();
        }
      }
    }
    // 후보 → 확정 승격. 여기서만 반죽에서 손을 뗀다
    if (mode === 'swipeCandidate' && isSwipeCommit(e.clientX - downX, e.clientY - downY)) {
      hooks.onStirEnd?.();
      mode = 'swipe';
    }
    // grab · 미확정 → stir 넘김(M1). 들린 기둥은 털썩 · 녹음으로 돌아가고, 소리 · 진동 훅은 안 부른다(시작 소리가 그대로 젓기 소리)
    if ((mode === 'grab' || mode === 'pending') && judge?.push(e.clientX, e.clientY)) {
      if (mode === 'grab') dough.grabEnd();
      mode = 'stir';
      judge = null;
    } else if (mode === 'pending' && judge && judge.path >= GRAB_COMMIT_PX) {
      // 한 번만 가른다. 곧은 당김이면 누른 점을 잡고 아래 grab 분기가 같은 걸음에 지금 목표로 끈다(소리는 이어진다)
      if (judge.straight() && isUpward(e.clientX - downX, e.clientY - downY)) {
        mode = 'grab';
        judge.horizFlipsOnly = true;
        // 손끝 평면 — 법선 = 카메라 forward의 xz(카메라 쪽). 곧장 내려다보는 카메라면 +z
        camera.getWorldDirection(vnorm);
        vnorm.y = 0;
        if (vnorm.lengthSq() < 1e-8) vnorm.set(0, 0, -1);
        vnorm.normalize().negate();
        vplane.setFromNormalAndCoplanarPoint(vnorm, vhit.set(downHitX * XZ_SCALE, downHitY, downHitZ * XZ_SCALE));
        dough.grabStart(downHitX, downHitZ);
        hooks.onGrabStart?.();
      } else {
        mode = 'stir';
        judge = null;
      }
    }
    if (mode === 'swipe') return; // 반죽에 손대지 않는다 — 레이캐스트도 생략
    const onPlane = raycast(e);
    if (mode === 'grab') {
      // 손끝 = 수직 평면 교점(월드). 평면과 나란한 광선이면 윗면 평면 교점으로 대신한다
      if (ray.ray.intersectPlane(vplane, vhit)) dough.grabMove3(vhit.x, vhit.y, vhit.z);
      else if (onPlane) dough.grabMove3(hit.x + snapDX, hit.y, hit.z + snapDZ);
      hooks.onGrabMove?.(dough.grabStretch01());
    }
    if (!onPlane) return;
    // 끌기는 평면 교점을 따라 이어진다 — 누른 점(스냅된 테두리) + 평면 위 이동량 (RV-H1)
    hit.x += snapDX;
    hit.z += snapDZ;
    const t = performance.now() / 1000;
    const dt = Math.max(1 / 240, t - lastHitT);
    const ox = hit.x / XZ_SCALE;
    const oz = hit.z / XZ_SCALE;
    // 미확정이 곧게 위로 끌리는 중(들기 후보)이면 고랑을 끌지 않고 누른 자리만 한 번 오목하게 누른다(탭 덴트, 스프링 복귀) —
    // 32px 동안 고랑 · 앞 둔덕 접힘 줄이 「할퀸 자국 세 줄」로 남았다(떼어내기 v5 새 눈 r1 ⑤). 원 · 가로 젓기는 첫 걸음이 위가 아니라 그대로다
    const liftCand = mode === 'pending' && !!judge?.straight() && isUpward(e.clientX - downX, e.clientY - downY);
    if (liftCand) {
      if (!liftPressed) dough.pokeAt(downHitX, downHitZ);
      liftPressed = true;
    } else if (mode === 'stir' || mode === 'pending' || mode === 'swipeCandidate') {
      const vx = (ox - lastHitX) / dt;
      const vz = (oz - lastHitZ) / dt;
      dough.setStirInput(ox, oz, vx, vz);
      hooks.onStirMove?.(Math.min(1, Math.hypot(vx, vz) * 0.6));
      // 전신 wobble은 DoughMesh.tick이 stirVec(속도 유래)에서 구동 — 절대좌표 오프셋 폐기 (§4 M4)
    }
    lastHitX = ox;
    lastHitZ = oz;
    lastHitT = t;
  };

  const onDown = (e: PointerEvent): void => {
    if (hooks.isBlocked?.()) return;
    // 이미 제스처가 진행 중이면 두 번째 손가락은 무시한다. 예전엔 down/mode/downOnDough를
    // 통째로 덮어써서, 기기를 쥔 엄지가 캔버스에 스치는 것만으로 젓기가 스와이프로 재분류됐다
    if (down && activeId !== null && e.pointerId !== activeId) return;
    // up이 유실된 채 같은 id로 다시 눌렀다면 남은 제스처부터 끝낸다 (젓기 소리·grab 고정 방지)
    if (down) {
      clearHold();
      endDrag();
    }
    activeId = e.pointerId;
    try {
      canvas.setPointerCapture?.(e.pointerId); // 캔버스 밖에서 놓아도 up이 온다
    } catch {
      /* 합성 이벤트·이미 끝난 포인터 — 캡처 없이도 동작한다 */
    }
    down = true;
    liftPressed = false;
    downX = e.clientX;
    downY = e.clientY;
    downAt = performance.now();
    moved = false;
    mode = null;
    coveredGesture = hooks.isCovered?.() ?? false;
    if (coveredGesture) return; // 덮개 제스처 — up에서 판정
    downOnDough = false;
    snapDX = 0;
    snapDZ = 0;
    if (raycast(e)) {
      snapDX = -hit.x;
      snapDZ = -hit.z;
      snapWall();
      snapDX += hit.x;
      snapDZ += hit.z;
      downHitY = hit.y;
      lastHitX = hit.x / XZ_SCALE;
      lastHitZ = hit.z / XZ_SCALE;
      lastHitT = performance.now() / 1000;
      downHitX = lastHitX;
      downHitZ = lastHitZ;
      // 실측 반경 + 여유 마진. 경계에서 애매하면 **반죽 쪽으로** 기울인다 —
      // 젓다가 화면이 넘어가는 쪽이, 스와이프가 한 번 안 먹는 쪽보다 나쁘다
      downOnDough = Math.hypot(downHitX, downHitZ) < dough.bodyRadius() * DOUGH_HIT_MARGIN;
    }
    clearHold();
    holdTimer = setTimeout(() => {
      // 홀드 — 손가락 쪽이 아주 천천히 0.03 부풀고, 떼면 가라앉는다 (VISUAL §5, A1-15)
      if (!down || moved || !downOnDough) return; // 반죽 밖 홀드는 아무 일 없다(앱 검토 L4)
      holding = true;
      dough.holdStart(lastHitX, lastHitZ);
    }, HOLD_MS);
  };

  const onMove = (e: PointerEvent): void => {
    if (!down || (activeId !== null && e.pointerId !== activeId)) return;
    if (!e.buttons && e.pointerType !== 'touch') return;
    pendingMove = e;
    if (rafId === 0) rafId = requestAnimationFrame(processMove);
  };

  const onUp = (e: PointerEvent): void => {
    if (!down || (activeId !== null && e.pointerId !== activeId)) return;
    down = false;
    activeId = null;
    clearHold();
    const dtMs = performance.now() - downAt;
    const dy = e.clientY - downY;
    const dist = Math.hypot(e.clientX - downX, dy);

    if (coveredGesture) {
      // 덮개: 위로 플릭 또는 탭 → 걷기 (탭 허용 = 접근성)
      if ((dy < -FLICK_UP_PX && dtMs < FLICK_MAX_MS) || (dist <= TAP_MAX_PX && dtMs <= TAP_MAX_MS)) {
        hooks.onUncover?.();
      }
      coveredGesture = false;
      return;
    }

    if (mode === 'swipe') {
      // 확정은 여기서만 — 누적 |dx|≥48 & 수평 우세 1.5배. 미달이면 아무 일도 없다
      const dx = e.clientX - downX;
      if (isSwipeCommit(dx, dy) && (hooks.canSwipe?.() ?? false)) hooks.onSwipe?.(dx < 0 ? 1 : -1);
      mode = null;
      return;
    }

    endDrag();
    if (dist <= TAP_MAX_PX && dtMs <= TAP_MAX_MS && raycast(e)) {
      snapWall();
      // 탭 — poke 덴트. 월드→오브젝트 공간 (메시 XZ_SCALE 역변환)
      dough.pokeAt(hit.x / XZ_SCALE, hit.z / XZ_SCALE);
    }
  };

  const onCancel = (e: PointerEvent): void => {
    if (!down || (activeId !== null && e.pointerId !== activeId)) return; // onUp과 대칭
    down = false;
    activeId = null;
    coveredGesture = false;
    clearHold();
    endDrag();
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('lostpointercapture', onCancel); // up이 유실돼도 제스처가 풀린다 (정상 up 뒤엔 down=false라 무시)
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('lostpointercapture', onCancel);
    if (rafId) cancelAnimationFrame(rafId);
    clearHold();
  };
}
