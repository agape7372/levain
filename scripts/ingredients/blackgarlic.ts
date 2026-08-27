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
//
// ═══ v2 (2026-08-27 턴테이블 재감사 수리) — "0/180에서 칼날 파편" ═══════════════════════
// 재감사 판정의 정확한 메커니즘: **브로드사이드로 본 휜 세장 원뿔은 날(blade)로 읽힌다.**
//   곡률 평면은 (장축 × 월드 Y)로 세로다. 그 평면의 법선 쪽에서 보면 초승달 전체가 펼쳐지는데,
//   몸통 지름(0.76)이 길이(1.36)의 56%뿐이고 꼭지 프로필이 r=0.22 → 0으로 바늘처럼 끝나서
//   그 실루엣이 "칼날/지느러미"가 됐다. yaw가 서로 다른 3쪽이니 **어느 az에서도 최소 한 쪽은
//   브로드사이드**다 — 배치로는 못 피한다(az=0에서 c, az=180에서 a·b가 걸렸다).
//   ★그러므로 고칠 축은 배치가 아니라 **단면 자체**다. 넷을 같이 움직였다:
//     ① 두께   CLOVE_RADIUS 0.38 → 0.46 (지름/길이 0.56 → 0.74). 실제 마늘 쪽도 통통하다.
//     ② 짧게   CLOVE_HALF_LENGTH 0.68 → 0.62 — 세장비를 더 낮춘다.
//     ③ 뭉툭   프로필 꼭지 마지막 구간을 r=0.22 → 0.44로 올려 **바늘 → 둥근 꼭지**로
//              (Δr 0.202 > Δh 0.124 이므로 마지막 밴드가 뾰족이 아니라 돔이 된다).
//     ④ 곡률   BEND_AMOUNT 0.55 → 0.38. 0.55는 반길이의 81%라 "쪽"이 아니라 갈고리였다.
//   세그먼트 10 → 12(통통해진 몸통에서 10각 실루엣이 보인다), 지터는 R2대로 0.013 → 0.012.
//   ⚠ 접지: 곡률이 단조라 밑동 극점이 들리고 몸통 배와 꼭지가 바닥에 닿는다(bbox 그라운딩).
//     BEND를 더 내리면 갈고리는 사라지지만 초승달 정체도 사라지고, 더 올리면 밑동 아래
//     빈 공간이 커진다 — 0.38은 그 둘 사이다. 되돌릴 땐 두 방향 다 확인할 것.
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
const CLOVE_RADIUS = 0.46; // v2: 0.38 → 0.46 (칼날 수리 ①)
const CLOVE_HALF_LENGTH = 0.62; // v2: 0.68 → 0.62 (②)
const SEGMENTS = 12; // v2: 10 → 12

// (반지름비, 높이비) — hFrac -1(뭉툭한 밑동 극점) .. 1(둥근 꼭지 극점). chestnut.ts와 같은
// 비대칭 프로필 스타일(밑동이 넓고 완만, 꼭지가 좁아짐)이되 v2에서 **양 끝을 다 뭉툭하게** 했다.
type ProfilePoint = readonly [number, number];
// v2 2라운드: 링 하나를 더 넣어 **테이퍼를 되돌렸다.** 1라운드(0.95/0.76/0.44 → 극)는 칼날은
// 없앴지만 양 끝이 다 둥글어 "아몬드 세 알"로 읽혔다 — 쪽의 정체 단서는 뾰족한 꼭지다.
// 0.92 → 0.70 → 0.44 → 0.20 → 극으로 완만히 좁히면 테이퍼는 살고, 마지막 밴드는 여전히
// Δr(0.092) > Δh(0.043)이라 바늘이 아니라 돔이다(옛 v1이 바늘이던 지점).
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.58, -0.93],
  [0.9, -0.66],
  [1.0, -0.24],
  [0.92, 0.14],
  [0.7, 0.48],
  [0.44, 0.76],
  [0.2, 0.93],
  [0.0, 1.0],
];

const JITTER_AMP = 0.012; // ~2.6% of CLOVE_RADIUS — R4 (세그먼트 12로 올렸으니 함께 내렸다)

// 곡률(bend) — 정점의 hFrac(-1..1)을 0..1로 정규화한 뒤 완만한 이즈인 커브로 로컬 X 오프셋을 준다.
// 밑동(hFrac=-1)은 거의 안 휘고 꼭지(hFrac=1) 쪽으로 갈수록 더 많이 휘어 레퍼런스의 "꼭지가 더 많이
// 말린" 인상을 낸다.
// v2: 0.55 → 0.42. 절대값만 보면 0.55 → 0.38이 안전하지만 **판정 기준은 반지름 대비**다
// (0.55/0.38 = 1.45 → 0.42/0.46 = 0.91). 통통해진 몸통에서는 0.42가 옛 0.38보다도 얌전하고,
// 초승달 정체를 잃지 않는다.
const BEND_AMOUNT = 0.42;
function bendOffset(hFrac: number): number {
  const t = (hFrac + 1) / 2; // 0..1
  return BEND_AMOUNT * Math.pow(t, 1.4);
}

// 껍질 잔흔 띠 — 극점 제외 전 링(1..6)에 고정 섹터 범위. (좌표 임계값 금지, CRIB — ring/sector 격자.)
// v2: 프로필 링이 7 → 9개가 되어 몸통 링이 1..7이다.
const SKIN_RING_INDICES: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
// cmp-1 판정: half-width 1(3/10 폭)에 SECTOR_CENTER=5가 카메라 정면을 거의 다 덮어 몸통이 "너무
// 밝은 갈색"으로 보였다(레퍼런스는 몸통이 지배적이고 껍질 띠는 가장자리 트림이다) — 폭을 좁히고
// 센터를 카메라 정면에서 비켜 가장자리로 옮긴다.
const SKIN_SECTOR_HALF_WIDTH = 0; // SEGMENTS=12일 때 1/12 폭
// v2: 세그먼트가 10 → 12로 바뀌었으니 같은 각도(288° ≈ 300°)를 유지하려면 8 → 10이다.
// 각도를 안 옮기는 게 중요하다 — 8을 그대로 두면 띠가 240°로 40도 돌아가 카메라 정면 쪽으로
// 다가온다(CRIB "넓은 마스크가 의도를 뒤집는다"의 재발 경로).
const SKIN_SECTOR_CENTER = 10;

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

// 배치 — work/blackgarlic/object-sculpt-spec.json의 느슨한 삼각에서 **c만 중앙으로 끌어올렸다.**
// v2에서 쪽이 통통해지자 삼각 배치의 빈 가운데가 az 0·15·30·225·240·255·315에서 갇힌 배경
// 주머니(최악 15×19px)로 드러났다 — choco와 같은 기하다(V자 골의 입구를 세 번째 파트가 덮는다).
// ★셋을 다 조이면(오프셋 0.72배) 주머니는 0이 되지만 az=0에서 세 쪽이 **한 덩어리로 붙어**
//   정체가 죽었다(실측). 그래서 조이는 방향을 골랐다: a·b의 좌우 간격은 오히려 벌리고
//   (1.10 → 1.16) c의 몸통이 클러스터 중심을 지나게만 했다(a-c 0.99 → 0.83, b-c 0.94 → 0.78).
//   c의 yaw 2.9는 장축이 거의 ∓X라, z=-0.26에 두면 몸통이 z∈[-0.72,0.20]을 덮어 중심을 막는다.
//   "가운데를 막는 파트"가 필요한 것이고 "전부 조이는 것"이 필요한 게 아니다.
const CLOVES: Record<'a' | 'b' | 'c', CloveDef> = {
  a: { offset: [-0.58, 0.34], yaw: 0.4 },
  b: { offset: [0.58, 0.26], yaw: -0.6 },
  c: { offset: [0.0, -0.26], yaw: 2.9 },
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
