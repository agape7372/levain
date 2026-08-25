// 포피시드 — 낮고 넓은 더미 + 앞쪽에 분리된 둥근 낱알 3개(크기 점증). 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/poppyseed.json(워크스페이스 원본은
// assets/ingredients/work/poppyseed/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★세트에서 가장 작은 알갱이 — CRIB 최종 게이트("뭉쳐 보이면 개수를 줄이고 하나를 키운다")를
// 정면으로 받는 재료다. "수백 개 흩뿌림" 대신 더미는 단일 페이셋 힙(matcha/oat/flaxseed와 동일
// 패턴)으로, "낱알이 개별 형태로 읽혀야" 하는 요구는 앞쪽 3개의 작은 구체 인스턴스가 전담한다.
// poppyseed.png 실측: 앞쪽 3알은 크기가 점증한다(소/중/대) — 단순 반복이 아니라 시각적 리듬을
// 준다. 낱알은 올리브의 (링,섹터) 하이라이트 캡 기법을 재사용하되 섹터 제한 없이 링 1개 전체를
// 밝게(둥근 알이라 방향성 스트라이프가 필요 없다 — 사각지대 없이 "위쪽이 밝다"만 필요).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, pickTriangles, splitTrianglesByVertexMask, stdMaterial, uvDome, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/poppyseed.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0x2b2a38; // "a deep blue-black body" — 더미 전체 + 낱알 대부분
const HIGHLIGHT_COLOR = 0x45424f; // "a soft slate-gray highlight catching the rounded tops of the enlarged front seeds"
// 드롭: 크레바스에 고이는 근흑색 그늘 #1B1A24(N·L 감쇠가 공짜로 어둡게 함)와
// 뽀얀 보라 잔반점 #5A5568(하이라이트 버킷과 명도가 가까워 중복 — 4색을 2버킷으로 압축).

const SEED_SEGMENTS = 6; // 극소 알갱이 — 세그먼트를 낮춰도 64px에서 원형 실루엣은 그대로 읽힌다
type ProfilePoint = readonly [number, number];
const SEED_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.85, -0.6],
  [1.0, 0.0],
  [0.85, 0.6],
  [0.0, 1.0],
];
const SEED_JITTER_AMP_FRAC = 0.02; // 반지름 대비 비율(R4 취지 — 작은 알갱이일수록 절대 진폭도 작게)
const HIGHLIGHT_RING_INDEX = 3; // 위쪽 극점 바로 아래 링 — 섹터 제한 없이 전체(둥근 알은 방향성 불필요)

function buildSeed(rng: () => number, radius: number): { bodyGeo: THREE.BufferGeometry; highlightGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(SEED_PROFILE, SEED_SEGMENTS, radius, () => [radius, radius]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  const mask = new Uint8Array(pos.count);
  const base = ringStart[HIGHLIGHT_RING_INDEX];
  for (let s = 0; s < SEED_SEGMENTS; s++) mask[base + s] = 1;

  jitterVertices(geometry, rng, radius * SEED_JITTER_AMP_FRAC);

  const originalIndex = (geometry.index as THREE.BufferAttribute).array as ArrayLike<number>;
  const baked = facet(geometry);
  const { trueTris, falseTris } = splitTrianglesByVertexMask(originalIndex, mask);

  const highlightGeo = pickTriangles(baked, trueTris);
  const bodyGeo = pickTriangles(baked, falseTris);
  uvDome(highlightGeo);
  uvDome(bodyGeo);
  return { bodyGeo, highlightGeo };
}

// 더미 — 낮고 넓은 힙(단일 버킷, BODY_COLOR). poppyseed.png 실측: 폭 대비 높이가 낮은 렌즈꼴.
const MOUND_SEGMENTS = 14;
const MOUND_RADIUS = 0.78;
const MOUND_HALF_HEIGHT = 0.26;
const MOUND_JITTER_AMP = 0.03;
const MOUND_PROFILE: readonly ProfilePoint[] = [
  [0.85, -1.0],
  [1.0, -0.5],
  [0.9, 0.0],
  [0.55, 0.45],
  [0.15, 0.8],
  [0.0, 1.0],
];

function buildMound(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(MOUND_PROFILE, MOUND_SEGMENTS, MOUND_HALF_HEIGHT, () => [MOUND_RADIUS, MOUND_RADIUS]);
  jitterVertices(geometry, rng, MOUND_JITTER_AMP);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

function placeAndGround(child: THREE.Object3D, offset: readonly [number, number], yaw: number): THREE.Group {
  const sub = new THREE.Group();
  sub.add(child);
  sub.rotation.set(0, yaw, 0);
  sub.position.set(offset[0], 0, offset[1]);
  sub.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sub);
  sub.position.y -= box.min.y;
  return sub;
}

interface SeedDef {
  offset: readonly [number, number];
  radius: number;
}
// poppyseed.png 실측: 앞쪽 3알이 좌->우로 크기가 점증(소/중/대) — 단순 반복이 아닌 시각적 리듬.
const SEEDS: Record<'a' | 'b' | 'c', SeedDef> = {
  a: { offset: [-0.62, 0.66], radius: 0.09 },
  b: { offset: [-0.08, 0.72], radius: 0.13 },
  c: { offset: [0.5, 0.68], radius: 0.17 },
};

export const createPoppyseed: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const highlightMat = stdMaterial({ color: HIGHLIGHT_COLOR });

  const cluster = new THREE.Group();

  const moundMesh = new THREE.Mesh(buildMound(rng), bodyMat);
  cluster.add(placeAndGround(moundMesh, [0, -0.1], 0.1));

  (Object.keys(SEEDS) as (keyof typeof SEEDS)[]).forEach((key) => {
    const def = SEEDS[key];
    const { bodyGeo, highlightGeo } = buildSeed(rng, def.radius);
    const seed = new THREE.Group();
    seed.add(new THREE.Mesh(bodyGeo, bodyMat));
    seed.add(new THREE.Mesh(highlightGeo, highlightMat));
    cluster.add(placeAndGround(seed, def.offset, 0));
  });

  return mergeByMaterial(cluster);
};
