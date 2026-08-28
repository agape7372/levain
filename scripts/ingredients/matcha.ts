// 말차 — 낮고 넓은 가루 둔덕 + 앞쪽 유출 더미 + 밑동 부스러기. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/matcha.json. 색은 프롬프트 JSON 손 전사.
//
// ★수리 (각진 원뿔+판때기). 되돌리지 마라.
//  옛 빌더는 cinnamon 가루를 계승한다면서 정반대였다: 밑면이 열린 채 최대 반지름을 허리에 둔
//  높은 원뿔(물방울/고깔) + 높이 0.09·종횡비 1.7 타원(널빤지). cinnamon.ts v3가 이미 잡은
//  함정 세 가지 — 열린 밑면 / 언더컷 / 돌멩이 실루엣 — 를 그대로 밟은 것.
//  처방도 cinnamon과 같다. 말차만의 차이는 (1) 피사체가 가루 자체라 안식각을 조금 더 세우고
//  (2) 프롬프트의 단차·앞쪽 유출·밑동 부스러기를 둔덕 프로필 + 두 번째 힙 + 크럼으로 낸다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, mergeByMaterial, pickTriangles, splitTrianglesByVertexMask, stdMaterial, uvDome } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/matcha.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0x5c8a3a; // "a vivid matcha green body"
const HIGHLIGHT_COLOR = 0xa8cb7e; // "a paler sifted dusting" — 피크 캡 + 앞쪽 유출 힙 + 부스러기 일부
// 드롭: 그늘진 초록 #446B29(N·L 감쇠가 공짜로 만든다, olive 아랫면 드롭 선례)와
// 밝은 초록 #7FAE55(피크 하이라이트 버킷 HIGHLIGHT_COLOR로 대체 — 4색을 2버킷으로 압축).

type ProfilePoint = readonly [number, number];

const MOUND_SEGMENTS = 26;
const MOUND_RADIUS = 0.64;
const MOUND_HALF_HEIGHT = 0.3; // 총 높이 0.60 vs 반지름 0.64 — 안식각 ~43°. 옛 0.72/0.5(≈71°)는 고깔.
const MOUND_JITTER_AMP = 0.016;
// 바닥 극점 → 지면 원판 → 최대 반지름을 지면 바로 위(언더컷 금지) → 완만한 단차 세 단 → 둥근 피크.
// hFrac 단조. 옛 프로필은 r=1.0을 h=-0.4에 둬 허리가 밑보다 넓었고, 그게 물방울 실루엣의 원인이다.
const MOUND_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.7, -1.0],
  [1.0, -0.96],
  [0.94, -0.7],
  [0.8, -0.62],
  [0.82, -0.34],
  [0.66, -0.26],
  [0.64, 0.0],
  [0.48, 0.1],
  [0.4, 0.38],
  [0.24, 0.64],
  [0.1, 0.88],
  [0.0, 1.0],
];
// 피크 캡 — 극점 링 1개만(CRIB: 링 3개는 이색 반구). 극점 마킹이면 그 아래 팬만 밝은 버킷.
const HIGHLIGHT_RING_INDEX = MOUND_PROFILE.length - 1;

const SPILL_SEGMENTS = 16;
const SPILL_RADIUS = 0.34;
const SPILL_HALF_HEIGHT = 0.12; // 부피가 있는 낮은 힙이지, 옛 0.09×종횡비 1.7 판때기가 아니다.
const SPILL_ASPECT = 1.18;
const SPILL_JITTER_AMP = 0.014;
const SPILL_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.72, -1.0],
  [1.0, -0.92],
  [0.86, -0.32],
  [0.52, 0.28],
  [0.2, 0.74],
  [0.0, 1.0],
];
const SPILL_OFFSET: readonly [number, number] = [-0.12, 0.5];

const CRUMB_SEGMENTS = 8;
const CRUMB_JITTER_FRAC = 0.04;
const CRUMB_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.78, -0.82],
  [1.0, -0.12],
  [0.82, 0.42],
  [0.36, 0.86],
  [0.0, 1.0],
];
interface CrumbDef {
  offset: readonly [number, number];
  radius: number;
  pale: boolean;
}
// 밑동 스커트 — 탑다운에서 깨끗한 원판이 되지 않게 둘레를 끊는다. 앞(+Z)에 더 촘촘히.
const CRUMBS: readonly CrumbDef[] = [
  { offset: [0.18, 0.78], radius: 0.072, pale: true },
  { offset: [-0.22, 0.72], radius: 0.058, pale: true },
  { offset: [0.48, 0.52], radius: 0.064, pale: true },
  { offset: [-0.5, 0.38], radius: 0.05, pale: true },
  { offset: [0.62, 0.08], radius: 0.048, pale: false },
  { offset: [-0.6, -0.06], radius: 0.044, pale: false },
  { offset: [0.42, -0.48], radius: 0.052, pale: false },
  { offset: [-0.28, -0.58], radius: 0.046, pale: true },
  { offset: [0.08, -0.66], radius: 0.04, pale: false },
];

/**
 * 극점을 건드리지 않는 지터. lib.jitterVertices는 극점 팬 중심을 밀어 별 주름을 남긴다
 * (poppyseed.ts jitterExceptPoles 선례). rng는 극점에서도 소비해 시드 순서를 단순하게 둔다.
 */
function jitterExceptPoles(
  geometry: THREE.BufferGeometry,
  rng: () => number,
  amp: number,
  profile: readonly ProfilePoint[],
  ringStart: readonly number[],
): void {
  const poles = new Set<number>();
  profile.forEach((p, ri) => {
    if (p[0] <= 1e-6) poles.add(ringStart[ri]);
  });
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const dx = (rng() - 0.5) * 2 * amp;
    const dy = (rng() - 0.5) * 2 * amp;
    const dz = (rng() - 0.5) * 2 * amp;
    if (poles.has(i)) continue;
    pos.setXYZ(i, pos.getX(i) + dx, pos.getY(i) + dy, pos.getZ(i) + dz);
  }
  pos.needsUpdate = true;
}

function bakeMound(
  rng: () => number,
  profile: readonly ProfilePoint[],
  segments: number,
  halfHeight: number,
  radial: () => readonly [number, number],
  amp: number,
): { geometry: THREE.BufferGeometry; ringStart: number[] } {
  const { geometry, ringStart } = buildRevolvedShell(profile, segments, halfHeight, () => radial());
  jitterExceptPoles(geometry, rng, amp, profile, ringStart);
  return { geometry, ringStart };
}

function buildMainMound(rng: () => number): { bodyGeo: THREE.BufferGeometry; highlightGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = bakeMound(
    rng,
    MOUND_PROFILE,
    MOUND_SEGMENTS,
    MOUND_HALF_HEIGHT,
    () => [MOUND_RADIUS, MOUND_RADIUS * 0.92],
    MOUND_JITTER_AMP,
  );
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const mask = new Uint8Array(pos.count);
  const base = ringStart[HIGHLIGHT_RING_INDEX];
  const count =
    HIGHLIGHT_RING_INDEX === MOUND_PROFILE.length - 1 && MOUND_PROFILE[HIGHLIGHT_RING_INDEX][0] <= 1e-6
      ? 1
      : MOUND_SEGMENTS;
  for (let s = 0; s < count; s++) mask[base + s] = 1;

  const originalIndex = (geometry.index as THREE.BufferAttribute).array as ArrayLike<number>;
  const baked = facet(geometry);
  const { trueTris, falseTris } = splitTrianglesByVertexMask(originalIndex, mask);
  const highlightGeo = pickTriangles(baked, trueTris);
  const bodyGeo = pickTriangles(baked, falseTris);
  uvDome(highlightGeo);
  uvDome(bodyGeo);
  return { bodyGeo, highlightGeo };
}

function buildSpill(rng: () => number): THREE.BufferGeometry {
  const { geometry } = bakeMound(
    rng,
    SPILL_PROFILE,
    SPILL_SEGMENTS,
    SPILL_HALF_HEIGHT,
    () => [SPILL_RADIUS, SPILL_RADIUS * SPILL_ASPECT],
    SPILL_JITTER_AMP,
  );
  const baked = facet(geometry);
  uvDome(baked);
  return baked;
}

function buildCrumb(rng: () => number, radius: number): THREE.BufferGeometry {
  const halfH = radius * 0.58;
  const aspect = 0.88 + rng() * 0.16;
  const { geometry } = bakeMound(
    rng,
    CRUMB_PROFILE,
    CRUMB_SEGMENTS,
    halfH,
    () => [radius, radius * aspect],
    radius * CRUMB_JITTER_FRAC,
  );
  const baked = facet(geometry);
  uvDome(baked);
  return baked;
}

export const createMatcha: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const highlightMat = stdMaterial({ color: HIGHLIGHT_COLOR });

  // 한 힙으로 묶고 bbox 1회 접지(CRIB: 인스턴스별 접지는 층 높이를 납작하게 누른다).
  const heap = new THREE.Group();

  const { bodyGeo, highlightGeo } = buildMainMound(rng);
  heap.add(new THREE.Mesh(bodyGeo, bodyMat));
  heap.add(new THREE.Mesh(highlightGeo, highlightMat));

  const spill = new THREE.Mesh(buildSpill(rng), highlightMat);
  spill.position.set(SPILL_OFFSET[0], -MOUND_HALF_HEIGHT + SPILL_HALF_HEIGHT, SPILL_OFFSET[1]);
  spill.rotation.y = -0.18;
  heap.add(spill);

  for (const crumb of CRUMBS) {
    const halfH = crumb.radius * 0.58;
    const mesh = new THREE.Mesh(buildCrumb(rng, crumb.radius), crumb.pale ? highlightMat : bodyMat);
    mesh.position.set(crumb.offset[0], -MOUND_HALF_HEIGHT + halfH * 0.55, crumb.offset[1]);
    heap.add(mesh);
  }

  heap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(heap);
  heap.position.y -= box.min.y;

  return mergeByMaterial(heap);
};
