// 귀리 — 압착 플레이크 더미 + 앞쪽에 분리된 낱장 3개. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/oat.json(워크스페이스 원본은
// assets/ingredients/work/oat/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// 정체성은 "납작하게 눌린 원반"이다(팀리드 지시) — 통곡 낟알(타원체)이 아니라 얇은 원판+테두리
// 벽을 가진 코인 형태로 짓는다. buildRevolvedShell을 세워서(Y=두께축, X/Z=넓적한 판면) 짓기
// 때문에 올리브/크랜베리처럼 눕히는 rotateZ가 필요 없다 — 프로필의 h축이 이미 "두께"다.
// 테두리(rim) 색은 프로필 구성 시점에 알려진 (링,섹터) 인덱스로 분리한다(CRIB "다음 순위" 방식,
// sliceTriangles는 여기선 안 씀 — 테두리가 전체 원주를 도는 밴드라 링 마스크가 더 자연스럽다).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, pickTriangles, splitTrianglesByVertexMask, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/oat.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0xd7c7a3; // "a warm tan body" — 더미 + 낱장 넓적면
const RIM_COLOR = 0x8f7a54; // "a darker umber edge ridge tracing each flake's curled rim"
// 드롭: 눌린 골 그늘 #B8A47D(N·L 감쇠가 넓적면 가장자리를 공짜로 어둡게 함)와
// 크림 하이라이트 #EDE0C4(림 컬러가 이미 대비를 맡는다 — 4색을 2버킷으로 압축).

const FLAKE_SEGMENTS = 10;
const FLAKE_RADIUS = 0.5;
const FLAKE_ASPECT = 0.62; // 타원 종횡비 (Z/X) — 압착 귀리는 원이 아니라 길쭉한 타원(oat.png 실측)
const FLAKE_HALF_HEIGHT = 0.09; // 아주 얇은 원반 — R4: 얇은 파트라 지터를 억제한다(아래)
const FLAKE_JITTER_AMP = 0.008; // R4 — 얇은 파트 지터 축소(빵 크러스트 스케일을 그대로 쓰지 않는다)

type ProfilePoint = readonly [number, number];
// 바닥 중심(포즈) -> 바닥면 테두리 -> 림 벽 아래 -> 림 벽 위 -> 윗면 테두리 -> 위 중심(포즈).
const FLAKE_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.92, -1.0],
  [1.0, -0.5],
  [1.0, 0.5],
  [0.92, 1.0],
  [0.0, 1.0],
];
// 림 밴드 — 벽을 이루는 두 링(2,3)을 마킹. OR-of-3-vertices라 인접한 위/아래 테이퍼 밴드까지
// 걸치며 "테두리를 도는 굵은 릿지"로 읽힌다(여기서는 넓게 걸치는 게 의도 — 올리브 캡처럼
// 최소 폭을 노리는 경우와 반대, CRIB 링 마스크 매커니즘의 의도된 활용).
const RIM_RING_INDICES: readonly number[] = [2, 3];

function buildFlake(rng: () => number): { bodyGeo: THREE.BufferGeometry; rimGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(FLAKE_PROFILE, FLAKE_SEGMENTS, FLAKE_HALF_HEIGHT, () => [
    FLAKE_RADIUS,
    FLAKE_RADIUS * FLAKE_ASPECT,
  ]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  const mask = new Uint8Array(pos.count);
  for (const ri of RIM_RING_INDICES) {
    const base = ringStart[ri];
    for (let s = 0; s < FLAKE_SEGMENTS; s++) mask[base + s] = 1;
  }

  jitterVertices(geometry, rng, FLAKE_JITTER_AMP);

  const originalIndex = (geometry.index as THREE.BufferAttribute).array as ArrayLike<number>;
  const baked = facet(geometry);
  const { trueTris, falseTris } = splitTrianglesByVertexMask(originalIndex, mask);

  const rimGeo = pickTriangles(baked, trueTris);
  const bodyGeo = pickTriangles(baked, falseTris);
  uvTopPlanar(rimGeo);
  uvTopPlanar(bodyGeo);
  return { bodyGeo, rimGeo };
}

// 더미 — cinnamon/matcha와 같은 굵은 지터 둔덕(단일 버킷, BODY_COLOR). "수백 장 흩뿌림" 금지
// 규칙(팀리드 지시)에 따라 낱장을 개별로 짓지 않고 하나의 페이셋 힙으로 뭉친다.
const MOUND_SEGMENTS = 14;
const MOUND_RADIUS = 0.68;
const MOUND_HALF_HEIGHT = 0.34;
const MOUND_JITTER_AMP = 0.026; // v2(cmp-1 판정 후): 0.045는 명암 대비가 과해 바위처럼 어둡게 읽혔다 —
// 낮춰서 tan 바탕색이 더 드러나게 했다(얇은 파트가 아니므로 R4 자체는 미적용, 값만 조정).
const MOUND_PROFILE: readonly ProfilePoint[] = [
  [0.82, -1.0],
  [0.98, -0.55],
  [1.0, -0.1],
  [0.7, 0.4],
  [0.32, 0.75],
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

interface FlakeDef {
  offset: readonly [number, number];
  yaw: number;
}
// oat.png/-2/-3 실측: 앞쪽 3장이 서로 다른 각도로 흩어져 놓인다. 오프셋은 더미 밑동과
// 안 겹치게(R1) 짧게 유지 — advisor 지시: 빈 공간이 늘면 리핏 확대로 64px에서 더 작아진다.
const FLAKES: Record<'a' | 'b' | 'c', FlakeDef> = {
  a: { offset: [-0.62, 0.62], yaw: 0.4 },
  b: { offset: [0.05, 0.85], yaw: -0.55 },
  c: { offset: [0.68, 0.6], yaw: 1.15 },
};

export const createOat: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const rimMat = stdMaterial({ color: RIM_COLOR });

  const cluster = new THREE.Group();

  const moundMesh = new THREE.Mesh(buildMound(rng), bodyMat);
  cluster.add(placeAndGround(moundMesh, [0, 0], 0.15));

  (Object.keys(FLAKES) as (keyof typeof FLAKES)[]).forEach((key) => {
    const def = FLAKES[key];
    const { bodyGeo, rimGeo } = buildFlake(rng);
    const flake = new THREE.Group();
    flake.add(new THREE.Mesh(bodyGeo, bodyMat));
    flake.add(new THREE.Mesh(rimGeo, rimMat));
    cluster.add(placeAndGround(flake, def.offset, def.yaw));
  });

  return mergeByMaterial(cluster);
};
