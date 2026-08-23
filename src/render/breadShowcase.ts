// 구운 빵 GLB 쇼케이스 — 단일 캔버스 예산 안의 턴테이블 (VISUAL §8: draw call ≤4).
// meshopt 압축 GLB 로드(디코더 ~30KB — draco wasm 대비 채택), 최근 1개 캐시,
// 교체 시 이전 GLB dispose. 재질은 Lambert로 강제 — 페이셋 클레이 룩(노멀은 GLB에 베이크).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const TURNTABLE_S = 12; // 12s/rev
const FIT_SIZE = 1.6;   // 씬 단위 목표 크기 (병 폭과 비슷하게)

export class BreadShowcase {
  readonly group = new THREE.Group();
  private loader = new GLTFLoader();
  private current: { url: string; root: THREE.Group } | null = null;
  private dragVel = 0;
  private dragging = false;
  private loadSeq = 0;

  constructor() {
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.group.visible = false;
    this.group.position.y = 0.9;
  }

  /** 로드 + 정규화(중심·크기) — 실패 시 reject (호출자가 폴백) */
  async load(url: string): Promise<void> {
    const seq = ++this.loadSeq;
    if (this.current?.url === url) return; // 캐시 히트 — 즉시
    const gltf = await this.loader.loadAsync(url);
    if (seq !== this.loadSeq) return; // 늦게 도착한 로드 — 폐기
    const root = gltf.scene;

    // 재질 통일 — 무광 클레이 (PBR 맵 금지 정책과 정합: basecolor만 승계)
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        o.material = new THREE.MeshLambertMaterial({
          map: m.map ?? null,
          color: m.color ?? new THREE.Color(0xffffff),
        });
        m.dispose();
      }
    });

    // 정규화: 바운딩 박스 중심을 원점으로, 최장축을 FIT_SIZE로
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = FIT_SIZE / Math.max(size.x, size.y, size.z, 1e-6);
    root.scale.setScalar(s);
    root.position.copy(center).multiplyScalar(-s);

    this.disposeCurrent();
    this.current = { url, root };
    this.group.add(root);
  }

  show(): void {
    this.group.visible = true;
    this.group.rotation.y = 0;
  }

  hide(): void {
    this.group.visible = false;
  }

  /** 드래그 회전 — 수평 픽셀 델타 */
  drag(dxPx: number): void {
    this.dragging = true;
    this.group.rotation.y += dxPx * 0.012;
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
      this.group.rotation.y += this.dragVel * dt;
    }
  }

  private disposeCurrent(): void {
    if (!this.current) return;
    this.group.remove(this.current.root);
    this.current.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material as THREE.MeshLambertMaterial;
        m.map?.dispose();
        m.dispose();
      }
    });
    this.current = null;
  }

  dispose(): void {
    this.disposeCurrent();
  }
}
