// 구운 빵 GLB 쇼케이스 — 단일 캔버스 예산 안의 턴테이블 (VISUAL §8: draw call ≤4).
// meshopt 압축 GLB 로드(디코더 ~30KB — draco wasm 대비 채택), 최근 1개 캐시,
// 교체 시 이전 GLB dispose. 재질 정책(PBR 자산 = Standard + 환경맵, 옛 자산 = Lambert)은 breadMaterial.ts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { applyBreadMaterials, disposeBreadMaterial } from './breadMaterial';
import { applyToon } from './toonMaterial';

const TURNTABLE_S = 12; // 12s/rev
const FIT_SIZE = 1.6;   // 씬 단위 목표 크기 (병 폭과 비슷하게)
/** 홈 카메라는 +Z 쪽 위에서 52° 부감이다. 빵 윗면을 카메라 반대쪽(−Z)으로 16° 젖혀 썸네일·레퍼런스와 같은
 *  36°에서 보게 한다(VISUAL §4-6). 52°에선 쌓은 빵의 옆면이 안 보이고 윗면 토핑만 보였다 — 통딸기가 토마토 꼭지로 읽혔다.
 *  ★부호: rotation.x가 +면 윗면이 카메라 쪽으로 숙어 68°가 된다(첫 판이 그랬다 — QA 캡처에서 팬케이크가 원반으로 보였다) */
const TILT = THREE.MathUtils.degToRad(-16);

export class BreadShowcase {
  /** 자리·기울기 */
  readonly group = new THREE.Group();
  /** 턴테이블 회전 — 기울어진 group 안에서 빵 자신의 세로축으로 돈다 */
  private spin = new THREE.Group();
  private loader = new GLTFLoader();
  private current: { url: string; toon: boolean; root: THREE.Group } | null = null;
  private dragVel = 0;
  private dragging = false;
  private loadSeq = 0;

  /** getEnv: PBR 자산을 처음 만났을 때만 불린다(환경맵 지연 생성 — SceneHost가 렌더러 수명으로 소유) */
  constructor(private getEnv: () => THREE.Texture) {
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.group.visible = false;
    this.group.position.y = 0.9;
    this.group.rotation.x = TILT;
    this.group.add(this.spin);
  }

  /** 로드 + 정규화(중심·크기) — 실패 시 reject (호출자가 폴백) */
  async load(url: string, toon = false): Promise<void> {
    const seq = ++this.loadSeq;
    if (this.current?.url === url && this.current.toon === toon) return; // 캐시 히트 — 즉시
    const gltf = await this.loader.loadAsync(url);
    if (seq !== this.loadSeq) return; // 늦게 도착한 로드 — 폐기
    const root = gltf.scene;

    if (toon) applyToon(root); // 툰 빵(팬케이크 계열) — toonMaterial.ts
    else applyBreadMaterials(root, this.getEnv);

    // 정규화: 바운딩 박스 중심을 원점으로, 최장축을 FIT_SIZE로
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = FIT_SIZE / Math.max(size.x, size.y, size.z, 1e-6);
    root.scale.setScalar(s);
    root.position.copy(center).multiplyScalar(-s);

    this.disposeCurrent();
    this.current = { url, toon, root };
    this.spin.add(root);
  }

  show(): void {
    this.group.visible = true;
    this.spin.rotation.y = 0;
  }

  hide(): void {
    this.group.visible = false;
  }

  /** 드래그 회전 — 수평 픽셀 델타 */
  drag(dxPx: number): void {
    this.dragging = true;
    this.spin.rotation.y += dxPx * 0.012;
    this.dragVel = dxPx * 0.012 * 60;
  }

  endDrag(): void {
    this.dragging = false;
  }

  tick(dt: number): void {
    if (!this.group.visible) return;
    if (!this.dragging) {
      // 관성 → 턴테이블 기본 속도로 수렴
      const base = (Math.PI * 2) / TURNTABLE_S;
      this.dragVel += (base - this.dragVel) * (1 - Math.exp(-1.5 * dt));
      this.spin.rotation.y += this.dragVel * dt;
    }
  }

  private disposeCurrent(): void {
    if (!this.current) return;
    this.spin.remove(this.current.root);
    this.current.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        disposeBreadMaterial(o.material as THREE.Material);
      }
    });
    this.current = null;
  }

  dispose(): void {
    this.disposeCurrent();
  }
}
