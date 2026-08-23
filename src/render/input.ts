// 포인터 → 레이캐스트 → wobble — 프로토타입 입력 모델 계승.
// 드래그 게인 0.12 → 0.09: 반 박자 무겁게, 점성이 느껴지게 (VISUAL §5).
import * as THREE from 'three';
import type { DoughMesh } from './dough/DoughMesh';

const DRAG_GAIN = 0.09 / 0.12; // 프로토타입 clamp(±1) 대비 감쇠 배율

export function attachInput(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  dough: DoughMesh,
): () => void {
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.55); // 반죽 표면 근사 높이
  const hit = new THREE.Vector3();

  const onPtr = (e: PointerEvent): void => {
    const r = canvas.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    if (ray.ray.intersectPlane(plane, hit)) {
      dough.wobble.set(
        THREE.MathUtils.clamp(hit.x, -1, 1) * DRAG_GAIN,
        THREE.MathUtils.clamp(hit.z, -1, 1) * DRAG_GAIN,
      );
    }
  };

  const onDown = (e: PointerEvent): void => onPtr(e);
  const onMove = (e: PointerEvent): void => {
    if (e.buttons || e.pointerType === 'touch') onPtr(e);
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
  };
}
