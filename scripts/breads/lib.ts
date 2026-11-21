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

/** check-winding.mjs와 동일 임계 — 뒤집힌 셸은 실측 -0.06 이하, 평면 캡은 -0.001 위다. */
export const WINDING_FLIP_RATIO = -0.01;

/**
 * 부호부피 / 최장변³ — 셸이 안팎 뒤집혔는지 보는 무차원 지표(발산정리).
 * `scripts/check-winding.mjs`의 analyze()와 **같은 식·같은 임계**를 쓴다 — 두 게이트가 어긋나면
 * 하나가 통과시킨 걸 다른 하나가 잡는 혼란이 생긴다. 식을 고칠 땐 양쪽을 같이 고칠 것.
 *
 * ⚠ **닫힌 셸에서만 의미가 있다.** 발산정리가 성립해야 원점 선택과 무관해지는데, 경계가 열린
 * 조각(리본·평면 캡·한쪽만 돌린 반구)은 원점을 어디 두느냐에 따라 부호가 통째로 뒤집힌다.
 * 그래서 아래 hasOpenBoundary()로 먼저 거르고, 열린 조각은 이 값으로 판정하지 않는다
 * (2026-09-02 실측: 소스 풀·드립·절단면이 정상인데도 -0.2대가 나왔다).
 * 열린 조각의 방향은 만들 때 orientToward()로 못 박는 것이 정답이다.
 */
export function signedVolumeRatio(g: THREE.BufferGeometry): number {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const idx = g.index;
  const count = idx ? idx.count : pos.count;
  const at = (k: number): number => (idx ? idx.getX(k) : k);
  let vol = 0;
  for (let k = 0; k + 2 < count; k += 3) {
    const ia = at(k);
    const ib = at(k + 1);
    const ic = at(k + 2);
    const ax = pos.getX(ia);
    const ay = pos.getY(ia);
    const az = pos.getZ(ia);
    const bx = pos.getX(ib);
    const by = pos.getY(ib);
    const bz = pos.getZ(ib);
    const cx = pos.getX(ic);
    const cy = pos.getY(ic);
    const cz = pos.getZ(ic);
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  g.computeBoundingBox();
  const b = g.boundingBox as THREE.Box3;
  const extent = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 1e-6);
  return vol / (extent * extent * extent);
}


/**
 * 인덱스가 없는 지오메트리에 자명한 인덱스(0,1,2,…)를 붙인다.
 *
 * 왜 필요한가: `mergeByMaterial`이 부르는 three `mergeGeometries`는 한 버킷 안에서
 * **indexed/non-indexed가 섞이면 실패**한다(BufferGeometryUtils.js:156 `isIndexed` 비교).
 * 삼각형을 직접 뱉는 작은 파트(씨·잎·캡)가 큰 셸과 같은 머티리얼에 섞이는 일이 흔한데,
 * 반대로 큰 셸을 non-indexed로 만들면 정점이 3배가 되어 GLB가 그만큼 커진다.
 * 작은 파트에 인덱스를 붙이는 쪽이 싸다.
 */
export function ensureIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (g.index) return g;
  const n = g.attributes.position.count;
  g.setIndex(Array.from({ length: n }, (_, i) => i));
  return g;
}

/**
 * 경계가 열려 있는가 — 반쪽만 공유되는 엣지가 하나라도 있으면 열린 조각이다.
 * 부호부피 판정을 쓸 수 있는지 가르는 데 쓴다.
 */
export function hasOpenBoundary(g: THREE.BufferGeometry): boolean {
  const idx = g.index;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const count = idx ? idx.count : pos.count;
  const at = (k: number): number => (idx ? idx.getX(k) : k);
  const seen = new Map<string, number>();
  for (let k = 0; k + 2 < count; k += 3) {
    const tri = [at(k), at(k + 1), at(k + 2)];
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      const key = a < b ? a + ':' + b : b + ':' + a;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  for (const n of seen.values()) if (n !== 2) return true;
  return false;
}

/**
 * 열린 조각의 면 방향을 못 박는다 — 면적 가중 평균 법선이 `dir`의 반대편이면 인덱스를 뒤집는다.
 *
 * 왜 필요한가: 런타임 Lambert는 FrontSide라 뒤집힌 조각은 **각도에 따라 통째로 사라진다**.
 * 닫힌 셸은 check-winding.mjs가 잡지만 리본·캡 같은 열린 조각은 아무 게이트도 못 잡는다
 * (2026-09-02 실측: 소스 풀과 드립 2줄이 통째로 컬링돼 렌더에서 증발했고, 예산·tri·판독
 * 게이트가 전부 통과했다). 만들 때 방향을 선언하는 게 유일하게 확실한 방법이다.
 */
export function orientToward(
  g: THREE.BufferGeometry,
  dir: THREE.Vector3 | ((centroid: THREE.Vector3) => THREE.Vector3),
): THREE.BufferGeometry {
  const idx = g.index;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const count = idx ? idx.count : pos.count;
  const at = (k: number): number => (idx ? idx.getX(k) : k);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  // ⚠ 회전 대칭 셸(원반 옆벽·리본 고리)은 법선 합이 대칭으로 상쇄돼 0이 된다 — 상수 방향으로는
  //   판정이 안 된다. 그래서 방향을 **위치의 함수**로도 받는다(옆벽이면 반지름 바깥 등).
  //   삼각형마다 그 자리에서 기대 방향과 견주고 넓이로 가중해 더한다.
  let score = 0;
  for (let k = 0; k + 2 < count; k += 3) {
    a.fromBufferAttribute(pos, at(k));
    b.fromBufferAttribute(pos, at(k + 1));
    c.fromBufferAttribute(pos, at(k + 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    cross.crossVectors(ab, ac); // 길이 = 삼각형 넓이 × 2 → 면적 가중이 공짜로 된다
    if (typeof dir === 'function') {
      centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      score += cross.dot(dir(centroid));
    } else {
      score += cross.dot(dir);
    }
  }
  if (score >= 0) return g;
  // ★뒤집기는 **인덱스만** 건드린다. 예전엔 non-indexed면 position 삼각형을 직접 스왑했는데,
  //   그러면 uv·normal은 제자리에 남아 정점과 속성이 어긋난다 — 실측으로 딸기 절단면의
  //   연분홍 심이 통째로 다른 색으로 샘플됐다(2026-09-02). 인덱스가 없으면 먼저 붙인다.
  ensureIndexed(g);
  const index = g.index as THREE.BufferAttribute;
  const arr = index.array as unknown as number[];
  for (let k = 0; k + 2 < arr.length; k += 3) {
    const t = arr[k + 1];
    arr[k + 1] = arr[k + 2];
    arr[k + 2] = t;
  }
  index.needsUpdate = true;
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

/**
 * 머티리얼별 지오메트리 병합 — 빌더가 반환 직전에 호출 (types.ts §1).
 * 월드 변환을 베이크하므로 반환 Group은 변환 없는 평평한 Mesh 목록.
 * ⚠ 같은 버킷의 모든 지오메트리는 동일 attribute 셋(position·normal·uv) 필수.
 *
 * ★와인딩 사전 경고 (2026-09-02 신설): 합치기 **전에** 파트별 부호부피를 본다.
 * `check-winding.mjs`는 export된 GLB 프리미티브 단위라, merge로 파트가 한 덩어리가 되고 나면
 * 뒤집힌 작은 셸이 큰 양수 부피에 묻혀 **영영 안 잡힌다**. 회전 셸을 여러 벌 새로 짜는 빵
 * (토핑 얹은 변형 등)에서 실제로 생기는 사각지대라 여기서 한 번 더 본다.
 * 경고만 낸다 — 지오메트리는 건드리지 않는다.
 */
export function mergeByMaterial(group: THREE.Group): THREE.Group {
  group.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const flipped: string[] = [];
  let openParts = 0;
  let partIndex = 0;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const g = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
      // 닫힌 셸만 부호부피로 판정한다 — 열린 조각은 원점 의존이라 오탐이 난다(위 주석).
      if (hasOpenBoundary(g)) {
        openParts++;
      } else {
        const ratio = signedVolumeRatio(g);
        if (ratio < WINDING_FLIP_RATIO) {
          flipped.push(`${o.name || 'part#' + partIndex}=${ratio.toFixed(3)}`);
        }
      }
      partIndex++;
      const m = o.material as THREE.Material;
      const list = buckets.get(m) ?? [];
      list.push(g);
      buckets.set(m, list);
    }
  });
  if (flipped.length > 0) {
    console.warn(
      `[winding] 면이 안쪽을 향하는 닫힌 셸 ${flipped.length}개: ${flipped.join(', ')} — ` +
        '합친 뒤에는 check-winding이 못 잡는다. 링 감기 순서나 좌표계(거울상)를 확인할 것.',
    );
  }
  if (openParts > 0) {
    console.warn(
      `[winding] 경계가 열린 파트 ${openParts}개 — 부호부피로 판정 불가. ` +
        '만들 때 lib.orientToward()로 방향을 못 박았는지 확인할 것(안 하면 각도에 따라 사라진다).',
    );
  }
  const out = new THREE.Group();
  for (const [mat, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) throw new Error('mergeGeometries 실패 — attribute 셋 불일치(types.ts §4)');
    out.add(new THREE.Mesh(merged, mat));
  }
  return out;
}
