// 툰 스타일 빵 — 쇼케이스(breadShowcase.ts)와 썸네일 하네스(scripts/thumbsHarness.ts)가 공유.
// 2026-11-17 스타일 시험에서 채택: 색 맵은 GLB 그대로 · 본체 = MeshToonMaterial 3단 · 가는 외곽선(썸네일 512px에서 1.2px).
// 외곽선 = 정점을 붙인 사본을 뒤집어(BackSide) 뷰 공간에서 법선 쪽으로 민다. 두 카메라가 다 직교라 뷰 공간 두께 = 화면 두께.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 툰으로 그리는 빵 — 팬케이크 계열(베이스 + 변형)만 */
export function isToonBread(idOrUrl: string): boolean {
  return /(^|\/)pancake(--[a-z0-9-]+)?(\.[0-9a-f]+)?(\.glb)?(\?|$)/.test(idOrUrl);
}

/** 세 단 그늘(어두운 단 → 밝은 단) */
const RAMP = [0.35, 0.65, 1];
/** 외곽선 두께(씬 단위, 빵 최장 변 1.6 기준) — 썸네일(직교 높이 2.2 · 512px)에서 1.2px */
export const TOON_LINE = (1.2 * 2.2) / 512;
const LINE_COLOR = 0x3a2416;
/** 잔 덩이 외곽선 가늘게: 덩이 대각선 ÷ 전체 최장 변이 문턱 아래면 비례로 줄임(바닥 배율까지) */
const SMALL: [number, number] = [0.3, 0.2];

let gradientMap: THREE.DataTexture | null = null;
function ramp(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const t = new THREE.DataTexture(new Uint8Array(RAMP.map((v) => Math.round(v * 255))), RAMP.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return (gradientMap = t); // 모든 빵이 같이 쓴다 — 버리지 않는다
}

/** 위치만 복사 → 같은 자리 정점 병합 → 법선 재계산 (날 선 모서리에서 껍데기가 갈라지지 않게) */
function hullGeometry(src: THREE.BufferGeometry, toRoot: THREE.Matrix4, longest: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p = src.getAttribute('position'); // 인터리브·양자화일 수 있다 — Float32로 풀어 복사
  const pos = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) v.fromBufferAttribute(p, i).toArray(pos, i * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (src.index) g.setIndex(src.index);
  const merged = mergeVertices(g);
  g.dispose();
  merged.computeVertexNormals();
  merged.setAttribute('aLine', new THREE.BufferAttribute(lineScale(merged, toRoot, longest), 1));
  return merged;
}

/** 연결 덩이(union-find)마다 두께 배율 — 잔 토핑이 외곽선에 파묻혀 검은 덩이로 뭉치는 걸 막는다 */
function lineScale(g: THREE.BufferGeometry, toRoot: THREE.Matrix4, longest: number): Float32Array {
  const [thr, floor] = SMALL;
  const pos = g.getAttribute('position');
  const n = pos.count;
  const idx = g.index!.array;
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  for (let i = 0; i < idx.length; i += 3) {
    parent[find(idx[i])] = find(idx[i + 1]);
    parent[find(idx[i + 1])] = find(idx[i + 2]);
  }
  const boxes = new Map<number, THREE.Box3>();
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let b = boxes.get(r);
    if (!b) boxes.set(r, (b = new THREE.Box3()));
    b.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(toRoot));
  }
  const scale = new Map<number, number>();
  const sz = new THREE.Vector3();
  for (const [r, b] of boxes) scale.set(r, THREE.MathUtils.clamp(b.getSize(sz).length() / longest / thr, floor, 1));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = scale.get(find(i))!;
  return out;
}

/**
 * 로드 직후 1회, 정규화(scale) 전에 — 재질을 툰으로 바꾸고 메시마다 외곽선 자식을 붙인다.
 * lineWorld는 정규화 뒤 씬 단위 두께. 정규화 배율(root.scale)은 셰이더가 뷰 공간에서 밀어 상관없다.
 */
export function applyToon(root: THREE.Object3D, lineWorld = TOON_LINE): void {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const longest = Math.max(...new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray(), 1e-6);
  const uniforms = { uLine: { value: lineWorld } };
  // traverse 안에서 자식을 붙이면 그 자식도 순회에 걸린다 — 먼저 모은다
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  for (const mesh of meshes) {
    const orig = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    mesh.material = new THREE.MeshToonMaterial({
      map: orig.map ?? null,
      color: orig.color ?? new THREE.Color(0xffffff),
      gradientMap: ramp(),
      side: orig.side,
      vertexColors: orig.vertexColors,
    });
    orig.normalMap?.dispose();
    orig.roughnessMap?.dispose();
    orig.dispose(); // map은 툰 재질이 이어 쓴다

    const mat = new THREE.MeshBasicMaterial({ color: LINE_COLOR, side: THREE.BackSide });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uLine;\nattribute float aLine;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec3 nView = normalize( normalMatrix * normal );
          if ( dot( nView.xy, nView.xy ) > 1e-12 ) {
            mvPosition.xy += normalize( nView.xy ) * uLine * aLine;
            gl_Position = projectionMatrix * mvPosition;
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'bread-toon-outline';
    const hull = new THREE.Mesh(hullGeometry(mesh.geometry, rootInv.clone().multiply(mesh.matrixWorld), longest), mat);
    hull.name = 'toon-outline';
    mesh.add(hull); // 본체의 자식 — 같은 변환
  }
}
