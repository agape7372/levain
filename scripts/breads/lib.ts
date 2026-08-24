// 빵 빌더 공유 유틸 — 계약은 types.ts 주석이 정본.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 결정론 PRNG (mulberry32) — 빌더 난수는 전부 이걸로. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 빵 id → 고정 시드 (FNV-1a). 같은 id면 항상 같은 모델. */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 유기적 표면 지터 — ⚠ indexed 지오메트리에서 호출할 것(facet 전).
 * 공유 정점이 함께 움직여야 면이 안 벌어진다.
 */
export function jitterVertices(g: THREE.BufferGeometry, rng: () => number, amp: number): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + (rng() - 0.5) * 2 * amp,
      pos.getY(i) + (rng() - 0.5) * 2 * amp,
      pos.getZ(i) + (rng() - 0.5) * 2 * amp,
    );
  }
  pos.needsUpdate = true;
}

/** 페이셋 베이크 — non-indexed + 플랫 노멀. 반환값을 쓸 것(원본 비파괴). */
export function facet(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.toNonIndexed();
  ng.deleteAttribute('normal');
  ng.computeVertexNormals();
  return ng;
}

/** 절차 basecolor 텍스처 — SRGB 강제 (runtime Lambert가 map을 승계). px ≤512. */
export function bakeTexture(
  px: number,
  paint: (ctx: CanvasRenderingContext2D, size: number) => void,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context 없음');
  paint(ctx, px);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * non-indexed 지오메트리에서 삼각형 [from, to) 구간만 떼어낸다 — 투톤 파트 분리용
 * (pancake.ts의 로컬 헬퍼를 공유 유틸로 승격; scone/loaf/baguette가 함께 쓴다).
 */
export function sliceTriangles(source: THREE.BufferGeometry, from: number, to: number): THREE.BufferGeometry {
  const src = source.attributes.position.array as ArrayLike<number>;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(Array.prototype.slice.call(src, from * 9, to * 9), 3));
  out.computeVertexNormals();
  return out;
}

/**
 * 인덱스 지오메트리의 정점별 불리언 마스크로, facet() 이후 non-indexed 삼각형을 두 그룹으로
 * 가른다(campagne.ts의 크럼 분류를 공유 유틸로 승격; rye.ts도 같은 패턴을 쓴다).
 * 정점 3개 중 하나라도 마스크 true면 그 삼각형은 true 그룹 — 불연속 색 경계를 지오메트리
 * 엣지로 수밀하게 낼 때 쓴다(vertex paint 금지, types.ts §2).
 * ⚠ originalIndex는 facet() 호출 **전** indexed 지오메트리의 index.array여야 한다 —
 * toNonIndexed()가 그 순서 그대로 삼각형을 펼치므로 인덱스가 삼각형 순번과 정확히 대응한다.
 */
export function splitTrianglesByVertexMask(
  originalIndex: ArrayLike<number>,
  mask: Uint8Array,
): { trueTris: number[]; falseTris: number[] } {
  const trueTris: number[] = [];
  const falseTris: number[] = [];
  const triCount = originalIndex.length / 3;
  for (let tri = 0; tri < triCount; tri++) {
    const a = originalIndex[tri * 3];
    const b = originalIndex[tri * 3 + 1];
    const c = originalIndex[tri * 3 + 2];
    (mask[a] || mask[b] || mask[c] ? trueTris : falseTris).push(tri);
  }
  return { trueTris, falseTris };
}

/** non-indexed(facet 이후) 지오메트리에서 임의 삼각형 인덱스 목록만 뽑는다(연속 구간이 아닐 때 sliceTriangles 대신). */
export function pickTriangles(source: THREE.BufferGeometry, tris: number[]): THREE.BufferGeometry {
  const src = source.attributes.position.array as ArrayLike<number>;
  const out = new Float32Array(tris.length * 9);
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    for (let k = 0; k < 9; k++) out[i * 9 + k] = src[t * 9 + k];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  geo.computeVertexNormals();
  return geo;
}

/** 머티리얼 캐리어 — 런타임 Lambert 교체에서 map·color만 살아남는다 (types.ts §2). */
export function stdMaterial(opts: { map?: THREE.Texture; color?: THREE.ColorRepresentation } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: opts.map ?? null,
    color: opts.color ?? 0xffffff,
    roughness: 1,
    metalness: 0,
  });
}

function bbox(g: THREE.BufferGeometry): THREE.Box3 {
  g.computeBoundingBox();
  return g.boundingBox as THREE.Box3;
}

/** 탑다운 평면 투영 UV (팬케이크·크래커·플랫브레드·포카치아). */
export function uvTopPlanar(g: THREE.BufferGeometry): void {
  const b = bbox(g);
  const sx = Math.max(b.max.x - b.min.x, 1e-6);
  const sz = Math.max(b.max.z - b.min.z, 1e-6);
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - b.min.x) / sx;
    uv[i * 2 + 1] = (pos.getZ(i) - b.min.z) / sz;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * 연속 인덱스 lathe 셸 — LatheGeometry 금지 규칙(CRIB: φ-seam 정점 복제가 jitter에서
 * 실금을 만든다)의 수동 대체. pancake.ts의 buildDisk 링 구성 로직을 프로필 무관하게 일반화했다.
 * profile은 (반지름비, 높이비) 쌍 배열 — 반지름비 ≤1e-6이면 극점(섹터 전체가 정점 1개로 접힘).
 * radialScale(hFrac, ringIndex)로 링마다 X/Z 배율을 달리 줄 수 있다(타원/바타르 단면용, 기본 원형).
 * 지터·기포/그루브 변위·페이싯은 호출자 책임 — 이 함수는 인덱스 지오메트리와 각 링의 시작
 * 정점 인덱스(ringStart)만 반환한다. 와인딩은 pancake.ts와 동일 관례(t 증가가 위에서 볼 때
 * 시계방향이라 (s, s+1, ...) 순진 감기는 법선이 안쪽을 향한다) — 안쪽을 보지 않도록 뒤집어 감는다.
 */
export function buildRevolvedShell(
  profile: readonly (readonly [number, number])[],
  segments: number,
  heightScale: number,
  radialScale: (hFrac: number, ringIndex: number) => readonly [number, number] = () => [1, 1],
): { geometry: THREE.BufferGeometry; ringStart: number[] } {
  const positions: number[] = [];
  const ringStart: number[] = [];
  for (let ri = 0; ri < profile.length; ri++) {
    const [rFrac, hFrac] = profile[ri];
    ringStart.push(positions.length / 3);
    if (rFrac <= 1e-6) {
      positions.push(0, hFrac * heightScale, 0);
      continue;
    }
    const [sx, sz] = radialScale(hFrac, ri);
    for (let s = 0; s < segments; s++) {
      const t = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(t) * rFrac * sx, hFrac * heightScale, Math.sin(t) * rFrac * sz);
    }
  }
  const index: number[] = [];
  for (let ri = 0; ri < profile.length - 1; ri++) {
    const a0 = ringStart[ri];
    const b0 = ringStart[ri + 1];
    const aPole = profile[ri][0] <= 1e-6;
    const bPole = profile[ri + 1][0] <= 1e-6;
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      if (aPole) {
        index.push(a0, b0 + s, b0 + s1);
      } else if (bPole) {
        index.push(a0 + s1, a0 + s, b0);
      } else {
        index.push(a0 + s, b0 + s1, a0 + s1);
        index.push(a0 + s, b0 + s, b0 + s1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return { geometry, ringStart };
}

/** 최소 각도 차이 (deg, wrap-around 처리) — 슬래시류 각도 기반 falloff에 공용. */
export function angleDeltaDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/** hex 채널을 고정 배율로 어둡히거나 밝힌다 — 픽셀 샘플링 금지 규칙의 결정론적 대체(types.ts §8). */
export function scaleHex(hexcolor: number, ratio: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((hexcolor >> 16) & 0xff) * ratio)));
  const g = Math.max(0, Math.min(255, Math.round(((hexcolor >> 8) & 0xff) * ratio)));
  const b = Math.max(0, Math.min(255, Math.round((hexcolor & 0xff) * ratio)));
  return (r << 16) | (g << 8) | b;
}

/** 원통 투영 UV — axis = 길이 축 (식빵·바게트는 'x'). */
export function uvCylindrical(g: THREE.BufferGeometry, axis: 'x' | 'y' | 'z' = 'y'): void {
  const b = bbox(g);
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const lo = b.min[axis];
  const span = Math.max(b.max[axis] - lo, 1e-6);
  for (let i = 0; i < pos.count; i++) {
    const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    let angle: number;
    if (axis === 'x') angle = Math.atan2(p.z, p.y);
    else if (axis === 'z') angle = Math.atan2(p.y, p.x);
    else angle = Math.atan2(p.z, p.x);
    uv[i * 2] = (p[axis] - lo) / span;
    uv[i * 2 + 1] = angle / (Math.PI * 2) + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** 돔(반구) 투영 UV (불·바타르: 깜빠뉴·호밀·통밀·스콘). 위에서 본 극좌표. */
export function uvDome(g: THREE.BufferGeometry): void {
  const b = bbox(g);
  const c = b.getCenter(new THREE.Vector3());
  const r = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2 || 1e-6;
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - c.x) / (r * 2) + 0.5;
    uv[i * 2 + 1] = (pos.getZ(i) - c.z) / (r * 2) + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * 머티리얼별 지오메트리 병합 — 빌더가 반환 직전에 호출 (types.ts §1).
 * 월드 변환을 베이크하므로 반환 Group은 변환 없는 평평한 Mesh 목록.
 * ⚠ 같은 버킷의 모든 지오메트리는 동일 attribute 셋(position·normal·uv) 필수.
 */
export function mergeByMaterial(group: THREE.Group): THREE.Group {
  group.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const g = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
      const m = o.material as THREE.Material;
      const list = buckets.get(m) ?? [];
      list.push(g);
      buckets.set(m, list);
    }
  });
  const out = new THREE.Group();
  for (const [mat, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) throw new Error('mergeGeometries 실패 — attribute 셋 불일치(types.ts §4)');
    out.add(new THREE.Mesh(merged, mat));
  }
  return out;
}
