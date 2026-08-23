// 포인터 → 레이캐스트 → wobble/poke — 프로토타입 입력 모델 계승.
// 드래그 게인 0.12 → 0.09: 반 박자 무겁게, 점성이 느껴지게 (VISUAL §5).
// 탭(이동<8px & <250ms) = poke 덴트. FSM 전면 개편은 젓기 촉감 마일스톤에서.
import * as THREE from 'three';
import { XZ_SCALE, type DoughMesh } from './dough/DoughMesh';

const DRAG_GAIN = 0.09 / 0.12; // 프로토타입 clamp(±1) 대비 감쇠 배율
const TAP_MAX_MS = 250;
const TAP_MAX_PX = 8;

export function attachInput(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  dough: DoughMesh,
): () => void {
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.55); // 반죽 표면 근사 높이
  const hit = new THREE.Vector3();

  let downX = 0;
  let downY = 0;
  let downAt = 0;
  let moved = false;

  const raycast = (e: PointerEvent): boolean => {
    const r = canvas.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    return ray.ray.intersectPlane(plane, hit) !== null;
  };

  const applyWobble = (): void => {
    dough.wobble.set(
      THREE.MathUtils.clamp(hit.x, -1, 1) * DRAG_GAIN,
      THREE.MathUtils.clamp(hit.z, -1, 1) * DRAG_GAIN,
    );
  };

  const onDown = (e: PointerEvent): void => {
    downX = e.clientX;
    downY = e.clientY;
    downAt = performance.now();
    moved = false;
    if (raycast(e)) applyWobble();
  };

  const onMove = (e: PointerEvent): void => {
    if (!e.buttons && e.pointerType !== 'touch') return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > TAP_MAX_PX) moved = true;
    if (raycast(e)) applyWobble();
  };

  const onUp = (e: PointerEvent): void => {
    if (moved || performance.now() - downAt > TAP_MAX_MS) return;
    if (raycast(e)) {
      // 월드 → 오브젝트 공간 (메시 XZ_SCALE 역변환). 반죽 밖 탭은 덴트가 자연히 감쇠
      dough.pokeAt(hit.x / XZ_SCALE, hit.z / XZ_SCALE);
    }
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
  };
}
