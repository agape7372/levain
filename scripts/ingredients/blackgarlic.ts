// 흑마늘 — 초승달(크레센트) 모양 발효 마늘 쪽 3개. 계약은 types.ts 주석이 정본. 재료 배치4 4번째.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/blackgarlic.json(워크스페이스 원본은
// assets/ingredients/work/blackgarlic/). 프로필·색은 전부 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// 기술 계보: chestnut.ts처럼 비대칭 프로필(뭉툭한 극점=밑동, 뾰족한 극점=꼭지)의 단일 회전체 셸.
// ★이 배치의 새 기법 — **곡률(bend)**: buildRevolvedShell은 직선 길이축만 낸다. 정점마다 hFrac의
// 단조함수를 곡선으로 써서 로컬 X에 추가 오프셋을 줘 직선 캡슐을 초승달로 휜다(단면을 곡률에 수직으로
// 재정렬하진 않는다 — 이 폴리곤/스타일 예산에서는 렌더로 확인해 허용, spec risk
// bend-cross-section-not-rotated). 껍질 잔흔 띠는 올리브의 (ring,sector) 마스크를 극점 제외
// **전체 링**에 적용한다(레퍼런스가 밑동부터 꼭지까지 끊김 없이 이어짐을 보여준다 — 부분 밴드 아님).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import {
  buildRevolvedShell,
  facet,
  jitterVertices,
  mergeByMaterial,
  pickTriangles,
  splitTrianglesByVertexMask,
  stdMaterial,
  uvTopPlanar,
} from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/blackgarlic.json geometry.surface[0] 손 전사 (JSON import
// 금지, types.ts §7). "#2A211D"(그늘진 안쪽 굴곡)·"#52443B"(도드라진 바깥 면)는 버킷을 안 만든다 —
// 오목/볼록 곡면의 N·L 감쇠가 이미 공짜(올리브/밤/레드빈 몸통과 동일 논리).
const BODY_COLOR = 0x3a2e28; // "a deep near-black brown body"
const SKIN_COLOR = 0x6b5c4e; // "a thin pale papery skin remnant clinging to one edge of each clove"

// 실측 비율 (assets/ingredients/src/blackgarlic.png/-2 — 밴드가 밑동부터 꼭지까지 끊김없이 이어짐을
// 2개 독립 뷰에서 확인).
const CLOVE_RADIUS = 0.38;
const CLOVE_HALF_LENGTH = 0.68;
const SEGMENTS = 10;

// (반지름비, 높이비) — hFrac -1(뭉툭한 밑동 극점) .. 1(뾰족한 꼭지 극점). chestnut.ts와 같은
// 비대칭 프로필 스타일(밑동이 넓고 완만, 꼭지가 급하게 좁아짐).
type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.85, -0.85],
  [1.0, -0.4],
  [0.85, 0.1],
  [0.55, 0.5],
  [0.22, 0.8],
  [0.0, 1.0],
];

const JITTER_AMP = 0.013; // ~3.4% of CLOVE_RADIUS — R4

// 곡률(bend) — 정점의 hFrac(-1..1)을 0..1로 정규화한 뒤 완만한 이즈인 커브로 로컬 X 오프셋을 준다.
// 밑동(hFrac=-1)은 거의 안 휘고 꼭지(hFrac=1) 쪽으로 갈수록 더 많이 휘어 레퍼런스의 "꼭지가 더 많이
// 말린" 인상을 낸다.
const BEND_AMOUNT = 0.55;
function bendOffset(hFrac: number): number {
  const t = (hFrac + 1) / 2; // 0..1
  return BEND_AMOUNT * Math.pow(t, 1.4);
}

// 껍질 잔흔 띠 — 극점 제외 전 링(1..5)에 고정 섹터 범위. (좌표 임계값 금지, CRIB — ring/sector 격자.)
const SKIN_RING_INDICES: readonly number[] = [1, 2, 3, 4, 5];
// cmp-1 판정: half-width 1(3/10 폭)에 SECTOR_CENTER=5가 카메라 정면을 거의 다 덮어 몸통이 "너무
// 밝은 갈색"으로 보였다(레퍼런스는 몸통이 지배적이고 껍질 띠는 가장자리 트림이다) — 폭을 좁히고
// 센터를 카메라 정면에서 비켜 가장자리로 옮긴다.
const SKIN_SECTOR_HALF_WIDTH = 0; // SEGMENTS=10일 때 1/10 폭
const SKIN_SECTOR_CENTER = 8;

function buildClove(rng: () => number): { bodyGeo: THREE.BufferGeometry; skinGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, SEGMENTS, CLOVE_HALF_LENGTH, () => [CLOVE_RADIUS, CLOVE_RADIUS]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  // 껍질 마스크 — 지터/곡률/회전 전, (링,섹터) 격자 인덱스로 직접 지정.
  const mask = new Uint8Array(pos.count);
  for (const ri of SKIN_RING_INDICES) {
    const base = ringStart[ri];
    for (let d = -SKIN_SECTOR_HALF_WIDTH; d <= SKIN_SECTOR_HALF_WIDTH; d++) {
      const s = ((SKIN_SECTOR_CENTER + d) % SEGMENTS + SEGMENTS) % SEGMENTS;
      mask[base + s] = 1;
    }
  }

  // 곡률 — 링별로 하나의 hFrac 값이므로 PROFILE에서 직접 룩업해 그 링의 전 섹터에 X 오프셋을 더한다.
  for (let ri = 0; ri < PROFILE.length; ri++) {
    const hFrac = PROFILE[ri][1];
    const offset = bendOffset(hFrac);
    const base = ringStart[ri];
    const ringSegs = PROFILE[ri][0] <= 1e-6 ? 1 : SEGMENTS; // 극점은 정점 1개
    for (let s = 0; s < ringSegs; s++) {
      const idx = base + s;
      pos.setX(idx, pos.getX(idx) + offset);
    }
  }

  // 눕히기: rotateZ(-90deg) — olive.ts와 동일 관례. 장축이 로컬 X로, 로컬 Y가 "위"가 된다.
  geometry.rotateZ(-Math.PI / 2);

  // 지터 — indexed 상태에서(공유 정점이 함께 움직여야 경계가 안 찢어진다, types.ts §5).
  jitterVertices(geometry, rng, JITTER_AMP);

  // facet 전에 원본 index 보존 — splitTrianglesByVertexMask는 facet() 이전 indexed 배열을 요구한다.
  const originalIndex = (geometry.index as THREE.BufferAttribute).array as ArrayLike<number>;
  const baked = facet(geometry);
  const { trueTris, falseTris } = splitTrianglesByVertexMask(originalIndex, mask);
  const skinGeo = pickTriangles(baked, trueTris);
  const bodyGeo = pickTriangles(baked, falseTris);
  uvTopPlanar(skinGeo);
  uvTopPlanar(bodyGeo);
  return { bodyGeo, skinGeo };
}

interface CloveDef {
  offset: readonly [number, number]; // world XZ
  yaw: number;
}

// assets/ingredients/work/blackgarlic/object-sculpt-spec.json 배치 전사. blackgarlic.png 탑다운
// 실측 — 3쪽이 서로 안 겹치는 느슨한 삼각 배치.
const CLOVES: Record<'a' | 'b' | 'c', CloveDef> = {
  a: { offset: [-0.55, 0.4], yaw: 0.4 },
  b: { offset: [0.55, 0.3], yaw: -0.6 },
  c: { offset: [0.0, -0.5], yaw: 2.9 },
};

export const createBlackgarlic: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const skinMat = stdMaterial({ color: SKIN_COLOR });

  const cluster = new THREE.Group();

  (Object.keys(CLOVES) as (keyof typeof CLOVES)[]).forEach((key) => {
    const def = CLOVES[key];
    const { bodyGeo, skinGeo } = buildClove(rng);

    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(bodyGeo, bodyMat));
    sub.add(new THREE.Mesh(skinGeo, skinMat));

    sub.rotation.set(0, def.yaw, 0);
    sub.position.set(def.offset[0], 0, def.offset[1]);

    // 공유 지면 y=0 — 이 쪽만의 회전 후 bbox를 구해 바닥을 원점에 맞춘다(types.ts R1, olive.ts 관례).
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;

    cluster.add(sub);
  });

  return mergeByMaterial(cluster);
};
