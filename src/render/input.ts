// 포인터 제스처 FSM — 반죽 촉감의 입력층 (VISUAL §5, 확장기획 §4-2 개편).
//   탭(<8px & <250ms)      → poke 덴트 (damped spring 복귀)
//   홀드 0.8s(무이동)       → 손가락 쪽 살짝 부풂 (swell)
//   드래그(≥8px)            → 2채널: 반죽 위에서 천천히 끌면 grab(변위 추종·점탄성),
//                             빠르게 문지르거나 반죽 밖 시작이면 stir(속도 시어장)
//                             — 한 포인터 세션의 소유권은 중간에 안 바뀐다 (§5-5 원칙)
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

export interface InputHooks {
  /** 덮개가 덮여 있는가 — true면 반죽 조작 대신 걷기 제스처만 받는다 */
  isCovered?(): boolean;
  /** 덮개 걷기 요청 (플릭/탭) */
  onUncover?(): void;
  onStirStart?(): void;
  /** 젓는 속도 0~1 — squelch 게인 추종 */
  onStirMove?(speed01: number): void;
  onStirEnd?(): void;
  onGrabStart?(): void;
  /** 신장 정도 0~1 — 사운드·햅틱 훅용 (현재 미배선 — Phase 1 튜닝 후) */
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

  let down = false;
  let downX = 0;
  let downY = 0;
  let downAt = 0;
  let moved = false;
  // swipeCandidate = 배경에서 시작해 수평 우세지만 **아직 확정 전**. 젓기는 계속 흘려보낸다.
  // 확정(isSwipeCommit)되는 순간에만 'swipe'로 승격하고 그때 젓기를 취소한다 —
  // 8px 시점에 잠가 버리면 반죽을 젓다가 옆 르방으로 넘어간다 (2026-08-25 실기기 신고)
  let mode: 'grab' | 'stir' | 'swipe' | 'swipeCandidate' | null = null;
  let downOnDough = false;
  /** 제스처 소유 포인터 — 기기를 쥔 엄지가 스쳐도 진행 중인 제스처를 뺏기지 않는다 */
  let activeId: number | null = null;
  let downHitX = 0;
  let downHitZ = 0;
  let coveredGesture = false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;

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
    plane.constant = -dough.topY(); // 부피 연동 — 손끝 = 눌리는 지점
    return ray.ray.intersectPlane(plane, hit) !== null;
  };

  const clearHold = (): void => {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  const endDrag = (): void => {
    if (mode === 'stir' || mode === 'swipeCandidate') hooks.onStirEnd?.();
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
          mode = 'grab';
          dough.grabStart(downHitX, downHitZ);
          hooks.onGrabStart?.();
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
    if (mode === 'swipe') return; // 반죽에 손대지 않는다 — 레이캐스트도 생략
    if (!raycast(e)) return;
    const t = performance.now() / 1000;
    const dt = Math.max(1 / 240, t - lastHitT);
    const ox = hit.x / XZ_SCALE;
    const oz = hit.z / XZ_SCALE;
    if (mode === 'grab') {
      dough.grabMove(ox, oz);
      hooks.onGrabMove?.(dough.grabStretch01());
    } else if (mode === 'stir' || mode === 'swipeCandidate') {
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
    // 이미 제스처가 진행 중이면 두 번째 손가락은 무시한다. 예전엔 down/mode/downOnDough를
    // 통째로 덮어써서, 기기를 쥔 엄지가 캔버스에 스치는 것만으로 젓기가 스와이프로 재분류됐다
    if (down && activeId !== null && e.pointerId !== activeId) return;
    activeId = e.pointerId;
    down = true;
    downX = e.clientX;
    downY = e.clientY;
    downAt = performance.now();
    moved = false;
    mode = null;
    coveredGesture = hooks.isCovered?.() ?? false;
    if (coveredGesture) return; // 덮개 제스처 — up에서 판정
    downOnDough = false;
    if (raycast(e)) {
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
      // 홀드 — 손가락 쪽이 살짝 부푼다 (음수 덴트 = swell)
      if (down && !moved) dough.pokeAt(lastHitX, lastHitZ, -0.045);
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
      // 탭 — poke 덴트. 월드→오브젝트 공간 (메시 XZ_SCALE 역변환)
      dough.pokeAt(hit.x / XZ_SCALE, hit.z / XZ_SCALE);
    }
  };

  const onCancel = (): void => {
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
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    if (rafId) cancelAnimationFrame(rafId);
    clearHold();
  };
}
