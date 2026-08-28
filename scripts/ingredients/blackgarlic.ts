// 흑마늘 — 초승달 발효 마늘 쪽 3개. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/blackgarlic.json. 색은
// assets/prompts/ingredients/blackgarlic.json geometry.surface[0] 손 전사.
//
// ═══ v2 (쇼케이스 0/180 칼날 파편) ═══
//
// v1은 회전체를 +X로 휜 뒤 rotateZ(-90°)로 눕혔다. 곡률이 수직면(XY) 초승달이 되어
// 스침각에서 종잇장·칼날이 된다 — flaxseed가 납작 낱알을 법선 따라 세운 것과 같은 메커니즘.
// 처방: 곡률을 +Z(회전 후에도 수평 XZ)로 옮기고, 쪽을 통통하게·팁을 무디게, 얇은 파트를
// 수직으로 세우지 않는다. 레퍼런스는 쪽 3개(도감 폼 crumble이어도 3D는 레퍼런스 따름).
// 얼굴을 만들지 마라(뾰족 팁 2개가 귀·이빨로 읽힘).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import {
  buildRevolvedShell,
  facet,
  jitterVertices,
  mergeByMaterial,
  sliceTriangles,
  stdMaterial,
  uvTopPlanar,
} from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/blackgarlic.json geometry.surface[0] 손 전사 (JSON import
// 금지, types.ts §7). "#2A211D"(그늘진 안쪽 굴곡)·"#52443B"(도드라진 바깥 면)는 버킷을 안 만든다 —
// 오목/볼록 곡면의 N·L 감쇠가 이미 공짜(올리브/밤/레드빈 몸통과 동일 논리).
const BODY_COLOR = 0x3a2e28; // "a deep near-black brown body"
const SKIN_COLOR = 0x6b5c4e; // "a thin pale papery skin remnant clinging to one edge of each clove"

// 통통한 쪽 — 길이:폭 ≈ 1.5:1. 팁이 바늘이면 어떤 각이든 칼날이다.
// v2.1은 알이 커서 겹쳐 2개로 읽힘. 올리브 삼각 간격에 맞게 한 단 줄인다.
const CLOVE_RADIUS = 0.4;
const CLOVE_HALF_LENGTH = 0.52;
const SEGMENTS = 16;

// (반지름비, 높이비) — hFrac -1(뭉툭한 밑동) .. 1(꼭지). 꼭지 근처도 부피를 남긴다.
type ProfilePoint = readonly [number, number];
// v2 2라운드: 링 하나를 더 넣어 **테이퍼를 되돌렸다.** 1라운드(0.95/0.76/0.44 → 극)는 칼날은
// 없앴지만 양 끝이 다 둥글어 "아몬드 세 알"로 읽혔다 — 쪽의 정체 단서는 뾰족한 꼭지다.
// 0.92 → 0.70 → 0.44 → 0.20 → 극으로 완만히 좁히면 테이퍼는 살고, 마지막 밴드는 여전히
// Δr(0.092) > Δh(0.043)이라 바늘이 아니라 돔이다(옛 v1이 바늘이던 지점).
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.72, -0.9],
  [0.96, -0.5],
  [1.0, -0.08],
  [0.9, 0.28],
  [0.7, 0.58],
  [0.44, 0.82],
  [0.0, 1.0],
];

const JITTER_AMP = 0.009; // ~2.3% of CLOVE_RADIUS — R4

// 곡률 — 눕히기 전 +Z. rotateZ(-90°) 뒤에도 Z라 초승달이 바닥(XZ)에 눕는다.
const BEND_AMOUNT = 0.34;
function bendOffset(hFrac: number): number {
  const t = (hFrac + 1) / 2;
  return BEND_AMOUNT * Math.pow(t, 1.4);
}

// 밑동 껍질 캡만 — 전이 2는 배까지 번져 허리 띠·입처럼 읽힌다(v2.1).
const SKIN_TRANSITIONS = 1;

function buildClove(rng: () => number): { bodyGeo: THREE.BufferGeometry; skinGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, SEGMENTS, CLOVE_HALF_LENGTH, () => [CLOVE_RADIUS, CLOVE_RADIUS]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  for (let ri = 0; ri < PROFILE.length; ri++) {
    const offset = bendOffset(PROFILE[ri][1]);
    const base = ringStart[ri];
    const ringSegs = PROFILE[ri][0] <= 1e-6 ? 1 : SEGMENTS;
    for (let s = 0; s < ringSegs; s++) {
      const idx = base + s;
      pos.setZ(idx, pos.getZ(idx) + offset);
    }
  }

  // 눕히기: rotateZ(-90deg) — 장축이 로컬 X. 곡률은 Z에 남아 수평 초승달.
  geometry.rotateZ(-Math.PI / 2);

  jitterVertices(geometry, rng, JITTER_AMP);

  const baked = facet(geometry);
  const skinTris = SEGMENTS * (1 + 2 * (SKIN_TRANSITIONS - 1));
  const skinGeo = sliceTriangles(baked, 0, skinTris);
  const bodyGeo = sliceTriangles(baked, skinTris, baked.attributes.position.count / 3);
  uvTopPlanar(skinGeo);
  uvTopPlanar(bodyGeo);
  return { bodyGeo, skinGeo };
}

interface CloveDef {
  offset: readonly [number, number];
  yaw: number;
  tipLift: number; // 장축(+X)을 살짝만 든다. 수직 금지.
  roll: number; // 장축 롤 — 큰 페이셋이 수직 벽에 안 서게.
  scale: number;
}

// 올리브와 같은 느슨한 삼각 — 3쪽이 전 각도에서 각각 보이게. yaw는 대칭 V(눈)를 피한다.
const CLOVES: Record<'a' | 'b' | 'c', CloveDef> = {
  a: { offset: [-0.42, 0.22], yaw: 0.55, tipLift: 0.18, roll: 0.32, scale: 1.0 },
  b: { offset: [0.44, 0.16], yaw: -1.85, tipLift: 0.14, roll: -0.4, scale: 0.86 },
  c: { offset: [0.04, -0.5], yaw: 2.35, tipLift: 0.04, roll: 0.2, scale: 1.05 },
};

function placeClove(bodyGeo: THREE.BufferGeometry, skinGeo: THREE.BufferGeometry, bodyMat: THREE.Material, skinMat: THREE.Material, def: CloveDef): THREE.Group {
  const mesh = new THREE.Group();
  mesh.add(new THREE.Mesh(bodyGeo, bodyMat));
  mesh.add(new THREE.Mesh(skinGeo, skinMat));
  mesh.scale.setScalar(def.scale);

  // 롤(장축) → 팁 들기 → 수평 yaw. 오일러 한 방에 넣으면 축이 섞인다.
  const roll = new THREE.Group();
  roll.rotation.x = def.roll;
  roll.add(mesh);
  const lift = new THREE.Group();
  lift.rotation.z = def.tipLift;
  lift.add(roll);
  const yaw = new THREE.Group();
  yaw.rotation.y = def.yaw;
  yaw.add(lift);
  yaw.position.set(def.offset[0], 0, def.offset[1]);

  yaw.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(yaw);
  yaw.position.y -= box.min.y;
  return yaw;
}

export const createBlackgarlic: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const skinMat = stdMaterial({ color: SKIN_COLOR });

  const cluster = new THREE.Group();
  (Object.keys(CLOVES) as (keyof typeof CLOVES)[]).forEach((key) => {
    const { bodyGeo, skinGeo } = buildClove(rng);
    cluster.add(placeClove(bodyGeo, skinGeo, bodyMat, skinMat, CLOVES[key]));
  });

  return mergeByMaterial(cluster);
};
