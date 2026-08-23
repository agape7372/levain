// 포인터 제스처 FSM — 반죽 촉감의 입력층 (VISUAL §5).
//   탭(<8px & <250ms)      → poke 덴트 (damped spring 복귀)
//   홀드 0.8s(무이동)       → 손가락 쪽 살짝 부풂 (swell)
//   드래그(≥8px)            → 젓기: 손가락 추종 점성 시어장 + 끈적한 실 + wobble
//   덮개 덮임               → 위로 플릭 또는 탭 = 걷기, 반죽 조작은 통과 안 함
// pointermove는 rAF 코얼레싱 — 프레임당 1회만 레이캐스트.
import * as THREE from 'three';
import { XZ_SCALE, type DoughMesh } from './dough/DoughMesh';

const TAP_MAX_MS = 250;
const TAP_MAX_PX = 8;
const HOLD_MS = 800;
const FLICK_UP_PX = 40;   // 위로 플릭 판정 최소 이동
const FLICK_MAX_MS = 350;
const WOBBLE_GAIN = 0.09 / 0.12; // 프로토타입 clamp(±1) 대비 감쇠 배율 계승

export interface InputHooks {
  /** 덮개가 덮여 있는가 — true면 반죽 조작 대신 걷기 제스처만 받는다 */
  isCovered?(): boolean;
  /** 덮개 걷기 요청 (플릭/탭) */
  onUncover?(): void;
  onStirStart?(): void;
  /** 젓는 속도 0~1 — squelch 게인 추종 */
  onStirMove?(speed01: number): void;
  onStirEnd?(): void;
}

export function attachInput(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  dough: DoughMesh,
  hooks: InputHooks = {},
): () => void {
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.55); // 반죽 표면 근사 높이
  const hit = new THREE.Vector3();

  let down = false;
  let downX = 0;
  let downY = 0;
  let downAt = 0;
  let moved = false;
  let stirring = false;
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
    return ray.ray.intersectPlane(plane, hit) !== null;
  };

  const clearHold = (): void => {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  const endStir = (): void => {
    if (!stirring) return;
    stirring = false;
    hooks.onStirEnd?.();
  };

  const processMove = (): void => {
    rafId = 0;
    const e = pendingMove;
    pendingMove = null;
    if (!e || !down || coveredGesture) return;
    if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > TAP_MAX_PX) {
      moved = true;
      clearHold();
      stirring = true;
      hooks.onStirStart?.();
    }
    if (!raycast(e)) return;
    const t = performance.now() / 1000;
    const dt = Math.max(1 / 240, t - lastHitT);
    const ox = hit.x / XZ_SCALE;
    const oz = hit.z / XZ_SCALE;
    if (stirring) {
      const vx = (ox - lastHitX) / dt;
      const vz = (oz - lastHitZ) / dt;
      dough.setStirInput(ox, oz, vx, vz);
      hooks.onStirMove?.(Math.min(1, Math.hypot(vx, vz) * 0.6));
      // 전신 wobble — 점성 있는 덩어리가 함께 쏠린다 (프로토타입 감각 계승)
      dough.wobble.set(
        THREE.MathUtils.clamp(hit.x, -1, 1) * WOBBLE_GAIN,
        THREE.MathUtils.clamp(hit.z, -1, 1) * WOBBLE_GAIN,
      );
    }
    lastHitX = ox;
    lastHitZ = oz;
    lastHitT = t;
  };

  const onDown = (e: PointerEvent): void => {
    down = true;
    downX = e.clientX;
    downY = e.clientY;
    downAt = performance.now();
    moved = false;
    coveredGesture = hooks.isCovered?.() ?? false;
    if (coveredGesture) return; // 덮개 제스처 — up에서 판정
    if (raycast(e)) {
      lastHitX = hit.x / XZ_SCALE;
      lastHitZ = hit.z / XZ_SCALE;
      lastHitT = performance.now() / 1000;
    }
    clearHold();
    holdTimer = setTimeout(() => {
      // 홀드 — 손가락 쪽이 살짝 부푼다 (음수 덴트 = swell)
      if (down && !moved) dough.pokeAt(lastHitX, lastHitZ, -0.045);
    }, HOLD_MS);
  };

  const onMove = (e: PointerEvent): void => {
    if (!down) return;
    if (!e.buttons && e.pointerType !== 'touch') return;
    pendingMove = e;
    if (rafId === 0) rafId = requestAnimationFrame(processMove);
  };

  const onUp = (e: PointerEvent): void => {
    if (!down) return;
    down = false;
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

    endStir();
    if (dist <= TAP_MAX_PX && dtMs <= TAP_MAX_MS && raycast(e)) {
      // 탭 — poke 덴트. 월드→오브젝트 공간 (메시 XZ_SCALE 역변환)
      dough.pokeAt(hit.x / XZ_SCALE, hit.z / XZ_SCALE);
    }
  };

  const onCancel = (): void => {
    down = false;
    coveredGesture = false;
    clearHold();
    endStir();
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
