// 플랫브레드 — 얇은 타원형 디스크, 물집(블리스터) 돔 + char 반점. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 `assets/breads/specs/flatbread.json`(워크스페이스 원본은
// assets/breads/work/flatbread/). 수치·색은 그 스펙의 전사이며, 스펙 자체는
// assets/prompts/breads/flatbread.json geometry의 전사다. char 헥스만 예외 — JSON이
// 침묵하는 지점이라 저작 결정(author_spec.py CHAR_HEX 주석 참조).
//
// pancake의 단일 디스크 링 구성(BODY_PROFILE+FACE_PROFILE, 공유 링, 극점 처리, 와인딩)을
// 그대로 재사용하되 세 가지가 다르다:
//   1. 스택 아님, 원반 1장 + 타원 XZ 스케일.
//   2. 기공 함몰이 아니라 물집 "돔"이 필요 — 중심 정점 전체 융기 + 체비셰프 거리 1 이웃을
//      부분 융기시켜 낮은 폴리 반구로 읽히게 한다(단일 정점 스파이크였던 크래커 v1의 교훈
//      — 자세한 실패 원인은 scripts/breads/cracker.ts 주석 참조).
//   3. 두 번째 재질(char)이 필요하지만 pancake처럼 깔끔한 삼각형 인덱스 구간이 아니라
//      얼굴 전체에 흩어진 셀들이다 — 그래서 삼각형을 "만드는 순서"를 char 먼저·나머지 나중으로
//      직접 통제해 facet 후에도 pancake의 sliceTriangles 구간 자르기가 그대로 통한다.
import * as THREE from 'three';
import type { BreadBuilder } from './types';
import { facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvTopPlanar } from './lib';

// 팔레트 — assets/prompts/breads/flatbread.json geometry.crust 손 전사, char는 저작 결정 (types.ts §8)
const BASE_COLOR = 0xd9a552;
const CHAR_COLOR = 0x4a2e1a;

const RADIUS = 1.0; // 장축 반지름 기준. 절대 스케일 무의미 (types.ts §7)
const ELLIPSE_RATIO = 0.86; // 타원 단축 비율 — 완벽한 원이 아님
const THICK = (2 * RADIUS) / 12; // 두께/직경 1/12 — flatbread.json silhouette 정본
const SEGMENTS = 30;

type ProfilePoint = readonly [number, number];

// 몸통: 밑면 극점 -> 바닥 가장자리 -> 테두리(살짝 두께감) -> 공유 링(윗면 시작).
// pancake와 달리 적도 불룩(equator bulge)이 없다 — 레퍼런스가 균일하게 얇은 판이라
// 뚱뚱한 림이 아니라 얇은 동전 단면에 가깝다.
const BODY_PROFILE: readonly ProfilePoint[] = [
  [0.0, 0.0],
  [0.9, 0.02],
  [1.0, 0.4],
  [0.95, 0.85],
];
// 윗면: 공유 링에서 안쪽으로. 거의 평평 — 물집이 없는 부분은 살짝만 봉긋하다(pancake의
// 뚜렷한 크라운과 달리 레퍼런스 자체가 대체로 평평한 판이라).
const FACE_PROFILE: readonly ProfilePoint[] = [
  [0.95, 0.85],
  [0.85, 0.9],
  [0.72, 0.93],
  [0.58, 0.96],
  [0.42, 0.98],
  [0.26, 0.99],
  [0.12, 1.0],
  [0.0, 1.0],
];
const SHARED_RING_INDEX = BODY_PROFILE.length - 1;
const RINGS: readonly ProfilePoint[] = [...BODY_PROFILE, ...FACE_PROFILE.slice(1)];
const POLE_RING_INDEX = RINGS.length - 1;
// 물집·char 후보 링 — 공유 링(seam)·중심 극점(pole)은 물론 극점 바로 바깥 2개 링(8,9,
// 반지름비 0.26·0.12)도 제외한다. 섹터 수(30)는 모든 링이 동일한데 반지름은 링마다 다르니
// 셀의 실제 호 길이가 안쪽으로 갈수록 급격히 좁아진다 — 같은 절대 높이를 링9(반지름 0.12,
// 호 길이 ~0.025)에 얹으면 벽 기울기 atan(0.09/0.025)=74도짜리 거의 수직 스파이크가 되어
// 중심 부근이 별무늬로 구겨진 것처럼 보였다(assets/breads/work/flatbread/shot-top-debug.png).
// 링4(호 길이 ~0.18)만 해도 26~46도로 완만해 정상적인 돔으로 읽힌다.
const CANDIDATE_RINGS = [4, 5, 6, 7];

// 물집 돔 — 중심 정점 전체 융기 + 체비셰프 거리 1 이웃 부분 융기. 크래커 씨앗 사고(34개가
// 최소간격 제약 아래 최대근접포장에 수렴해 표면 전체를 뒤덮은 사고)를 겪은 뒤라, 여기서는
// 후보 셀 180개(6링×30섹터) 대비 11개만 뽑아 밀도를 6%대로 낮게 유지한다 — 애초에
// 조밀하게 만들 이유가 없다(레퍼런스도 성기게 흩어져 있다).
// v1 높이(0.09/0.065/0.045)는 링4-7(호 길이 0.09~0.18)에서 벽 기울기가 27~46도로 안전하긴
// 했지만 3/4 출하 카메라에서 돔이 너무 은은해 critical 게이트(featureReviewTargets
// blister-dome-field, minimumScore 0.8)를 0.7로 밑돌았다. 스파이크 없이 더 뚜렷하게
// 읽히도록 30% 가량 올린다 — 가장 안쪽 후보 링(7, 호 길이 0.088)에서도 atan(0.12/0.088)=54도로
// 스파이크 문턱(70도대)에서 여전히 안전하다.
const BLISTER_CLASSES = [
  { id: 'large', height: 0.12, spread: 0.7, share: 0.27 },
  { id: 'medium', height: 0.09, spread: 0.6, share: 0.46 },
  { id: 'small', height: 0.06, spread: 0.45, share: 0.27 },
] as const;
const BLISTER_COUNT = 11;
// v1(9+12=21마킹)은 각 마킹이 자신을 코너로 공유하는 쿼드 최대 4개(삼각형 8개)를 물들여
// char 삼각형이 168/540(31%)까지 불어났다 — 반점이 아니라 큰 웅덩이로 보였다. 이 "마킹 1개
// = 삼각형 최대 8개" 배율을 감안해 목표 서리 밀도(~15%)에 맞춰 절반 이하로 낮춘다.
const CHAR_ON_BLISTER_COUNT = 5;
const CHAR_FLAT_COUNT = 5;

const EDGE_WOBBLE_LOBE = 0.035;
const EDGE_WOBBLE_NOISE = 0.022;
const JITTER_AMP = 0.006;

interface CellKey {
  ring: number;
  sector: number;
}
function key(c: CellKey): string {
  return `${c.ring},${c.sector}`;
}

/** rng 하나로 결정론적 셔플 (Fisher-Yates). pancake.ts와 동일 패턴. */
function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** 체비셰프 거리 1 이웃(자기 자신 포함) — 링 범위를 벗어나면 스킵, 섹터는 랩어라운드. */
function neighborhood(c: CellKey): CellKey[] {
  const out: CellKey[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    const ring = c.ring + dr;
    if (!CANDIDATE_RINGS.includes(ring)) continue;
    for (let ds = -1; ds <= 1; ds++) {
      out.push({ ring, sector: (c.sector + ds + SEGMENTS) % SEGMENTS });
    }
  }
  return out;
}

/** 후보 셀 중 최소 거리 제약을 지키며 n개를 뽑는다 — pancake의 pickPoreCells와 동일 구조. */
function pickCells(candidates: CellKey[], n: number, minSeparation: number, rng: () => number): CellKey[] {
  const shuffled = shuffle([...candidates], rng);
  const picked: CellKey[] = [];
  for (const cell of shuffled) {
    if (picked.length >= n) break;
    const tooClose = picked.some((p) => {
      const ds = Math.abs(p.sector - cell.sector);
      return Math.abs(p.ring - cell.ring) < minSeparation && Math.min(ds, SEGMENTS - ds) < minSeparation;
    });
    if (tooClose) continue;
    picked.push(cell);
  }
  return picked;
}

function buildFlatbreadGeometry(rng: () => number): { charCount: number; geometry: THREE.BufferGeometry } {
  const positions: number[] = [];
  const ringStart: number[] = [];

  // 손으로 늘인 테두리 웨이브 — 링 전체에 동일 적용(pancake의 makeWobble과 동일 원리:
  // 몸통·윗면이 같은 값을 쓰므로 공유 링이 구조적으로 붙는다).
  const phase = rng() * Math.PI * 2;
  const wobble: number[] = [];
  for (let s = 0; s < SEGMENTS; s++) {
    const t = (s / SEGMENTS) * Math.PI * 2;
    wobble.push(1 + EDGE_WOBBLE_LOBE * Math.sin(2 * t + phase) + (rng() - 0.5) * 2 * EDGE_WOBBLE_NOISE);
  }

  for (let ri = 0; ri < RINGS.length; ri++) {
    const [rFrac, hFrac] = RINGS[ri];
    ringStart.push(positions.length / 3);
    if (rFrac <= 1e-6) {
      positions.push(0, hFrac * THICK, 0);
      continue;
    }
    for (let s = 0; s < SEGMENTS; s++) {
      const t = (s / SEGMENTS) * Math.PI * 2;
      const r = rFrac * wobble[s];
      positions.push(Math.cos(t) * r * RADIUS, hFrac * THICK, Math.sin(t) * r * RADIUS * ELLIPSE_RATIO);
    }
  }

  const yAt = (c: CellKey): number => positions[(ringStart[c.ring] + c.sector) * 3 + 1];
  const raise = (c: CellKey, amount: number): void => {
    positions[(ringStart[c.ring] + c.sector) * 3 + 1] = yAt(c) + amount;
  };

  const candidateCells: CellKey[] = CANDIDATE_RINGS.flatMap((ring) =>
    Array.from({ length: SEGMENTS }, (_, sector) => ({ ring, sector })),
  );
  const blisterCenters = pickCells(candidateCells, BLISTER_COUNT, 2, rng);

  const blisterQuota = BLISTER_CLASSES.map((c) => Math.max(1, Math.round(BLISTER_COUNT * c.share)));
  let bi = 0;
  const charCells = new Set<string>();
  blisterCenters.forEach((center, index) => {
    while (bi < blisterQuota.length - 1 && blisterQuota[bi] === 0) bi++;
    const cls = BLISTER_CLASSES[bi];
    blisterQuota[bi]--;
    raise(center, cls.height);
    for (const n of neighborhood(center)) {
      if (n.ring === center.ring && n.sector === center.sector) continue;
      raise(n, cls.height * cls.spread);
    }
    // 11개 중 다수만 그을린 정수리를 갖는다 — 앞쪽 CHAR_ON_BLISTER_COUNT개만, 그것도
    // 정점 셀 하나만 char 표시한다. v1은 이웃 전체(3x3=9셀)를 char로 칠해 물집 11개 중
    // 9개 × 9셀 = 얼굴 후보 180셀의 절반 가까이를 뒤덮어 돔 자체가 안 보였다
    // (assets/breads/work/flatbread/cmp-1.png) — 크래커 밀도 사고의 재판이었다.
    if (index < CHAR_ON_BLISTER_COUNT) {
      charCells.add(key(center));
    }
  });

  const usedForBlister = new Set(blisterCenters.flatMap((c) => neighborhood(c).map(key)));
  const flatCandidates = candidateCells.filter((c) => !usedForBlister.has(key(c)));
  // minSeparation=2 (1이 아니라) — 셀 하나가 자신을 코너로 공유하는 최대 4개 쿼드(8 삼각형)를
  // 물들이므로, 서로 1칸 붙은 두 마킹은 반점이 아니라 이어붙은 웅덩이가 된다. 실측:
  // minSeparation=1로 21칸(물집크라운9+평지12)을 찍었더니 char 삼각형 154/540(28.5%)이
  // 화면에서 하나의 커다란 풍차무늬로 뭉쳐 보였다(cmp-3.png) — 흩어진 반점이 아니었다.
  for (const spot of pickCells(flatCandidates, CHAR_FLAT_COUNT, 2, rng)) {
    charCells.add(key(spot));
  }

  // 삼각형 — char 먼저·나머지 나중으로 "만드는 순서"를 직접 통제해 facet 후에도
  // sliceTriangles 구간 자르기가 통하게 한다 (pancake의 bodyTriangles 컷오프와 동형).
  const charIndex: number[] = [];
  const baseIndex: number[] = [];
  for (let ri = 0; ri < RINGS.length - 1; ri++) {
    const a0 = ringStart[ri];
    const b0 = ringStart[ri + 1];
    const aPole = RINGS[ri][0] <= 1e-6;
    const bPole = RINGS[ri + 1][0] <= 1e-6;
    const isFace = ri >= SHARED_RING_INDEX;
    for (let s = 0; s < SEGMENTS; s++) {
      const s1 = (s + 1) % SEGMENTS;
      const tri: number[][] = [];
      if (aPole) {
        tri.push([a0, b0 + s, b0 + s1]);
      } else if (bPole) {
        tri.push([a0 + s1, a0 + s, b0]);
      } else {
        tri.push([a0 + s, b0 + s1, a0 + s1]);
        tri.push([a0 + s, b0 + s, b0 + s1]);
      }
      const cellsTouched: CellKey[] = aPole || bPole ? [{ ring: ri + 1, sector: s }, { ring: ri + 1, sector: s1 }] : [
        { ring: ri, sector: s }, { ring: ri, sector: s1 }, { ring: ri + 1, sector: s }, { ring: ri + 1, sector: s1 },
      ];
      const isChar = isFace && cellsTouched.some((c) => charCells.has(key(c)));
      const bucket = isChar ? charIndex : baseIndex;
      for (const t of tri) bucket.push(...t);
    }
  }

  const index = [...charIndex, ...baseIndex];
  const charCount = charIndex.length / 3;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  // indexed 상태에서 지터 — 몸통·윗면이 공유하는 경계 인덱스가 함께 움직인다 (types.ts §3)
  jitterVertices(geometry, rng, JITTER_AMP);
  return { charCount, geometry };
}

export const createFlatbread: BreadBuilder = (rng) => {
  const group = new THREE.Group();
  const baseMat = stdMaterial({ color: BASE_COLOR });
  const charMat = stdMaterial({ color: CHAR_COLOR });

  const { charCount, geometry } = buildFlatbreadGeometry(rng);
  // 페이셋 베이크 후 자른다 — toNonIndexed는 인덱스 순서대로 펼치므로 char/base 경계가 보존된다.
  const baked = facet(geometry);
  const total = baked.attributes.position.count / 3;
  const parts: [THREE.BufferGeometry, THREE.Material][] = [
    [sliceTriangles(baked, 0, charCount), charMat],
    [sliceTriangles(baked, charCount, total), baseMat],
  ];
  for (const [geo, mat] of parts) {
    uvTopPlanar(geo);
    group.add(new THREE.Mesh(geo, mat));
  }

  return mergeByMaterial(group);
};
