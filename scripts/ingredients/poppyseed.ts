// 포피시드 — 알갱이가 오돌토돌 드러난 낮고 넓은 더미 + 앞쪽에 분리된 둥근 낱알 3개(크기 점증).
// 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/poppyseed.json(워크스페이스 원본은
// assets/ingredients/work/poppyseed/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
// ⚠ v3의 수치는 스펙 JSON에 아직 역전사되지 않았다 — 이 배치의 파일 권한이 `scripts/ingredients/*.ts`
//   뿐이었다. 다음에 스펙을 만질 사람은 v3 상수를 스펙으로 올려라.
//
// ★세트에서 가장 작은 알갱이 — CRIB 최종 게이트("뭉쳐 보이면 개수를 줄이고 하나를 키운다")를
// 정면으로 받는 재료다. 낱알은 올리브의 (링,섹터) 하이라이트 캡 기법을 재사용하되 섹터 제한 없이
// 링 1개 전체를 밝게(둥근 알이라 방향성 스트라이프가 필요 없다).
//
// ═══ v3 (2026-08-26, 전체 화면 쇼케이스 파손 수정) ═══
//
// v2는 **64px 썸네일만 보고 판정해서** 두 가지를 동시에 망가뜨렸다. 전체 화면(빵과 같은
// `FIT_SIZE=1.6` 쇼케이스)에서 재료도 똑같이 확대돼 보인다는 걸 계산에 안 넣은 결과다.
//
//  (a) `SEED_SEGMENTS=6` — 64px에선 원형 실루엣이 남지만 전체 화면에선 **육각 프리즘**이다.
//      윗면이 평평하고 옆면이 수직 6면이라 양귀비씨가 아니라 연탄·검은 주사위로 읽혔다.
//      → 20세그먼트 + 프로필 9점(위아래 극점 포함)으로 진짜 구체를 만든다.
//  (b) 64px 판독을 살리려 낱알을 0.09~0.17 → 0.20~0.30으로 키웠는데, 전체 화면에서는
//      **거대한 돌덩이 3개**가 됐다. 레퍼런스(assets/ingredients/src/poppyseed.png)의 앞알은
//      더미의 1/10 크기다.
//
// ★근본 원인은 낱알 크기가 아니라 **더미가 매끈했다는 것**이다. 매끈한 렌즈는 크기와 무관하게
// "검은 돌 하나"로 읽힌다. 레퍼런스의 더미는 **수백 개의 작은 구체가 쌓인 오돌토돌한 표면**이고,
// 그 알갱이 결이 64px에서도 실루엣의 물결로 살아남는다. 그래서 v3은 낱알을 v1 크기로 되돌리고
// (0.10/0.13/0.16) 대신 **더미 표면에 알갱이 범프를 새겼다** — 판독을 낱알이 아니라 더미가 맡는다.
//
// ★알갱이 결은 **인스턴스로** 낸다. 1차 시도는 공짜(0tri)인 코사인 로브 변위였는데 렌더에서
// 실패했다: 로브가 링을 가로질러 세로로 정렬되면서 꼭대기에 바큇살이 생기고 테두리가 톱니바퀴가
// 됐다(로브 하나당 세그먼트가 4개뿐이라 마루가 정점 하나로 뾰족해진다). 진짜 알갱이 15개를
// 더미 표면에 반쯤 파묻는 편이 예산은 들어도(1200tri) 결과가 확실하다 — 구체는 어느 각도에서도
// 구체다. 상향된 예산(250KB/8000tri)이 이걸 감당한다.
// ⚠ 되돌리지 말 것: 세그먼트를 다시 낮추면 (a)가, 알갱이를 지우면 (b)가 그대로 돌아온다.
// ⚠ 알갱이를 코사인 변위로 되돌리지 마라 — 위 실패가 그대로 재현된다.
//
// ═══ v4 (접지·배치 — 낱알 반지름은 그대로) ═══
//
// v3은 더미 결은 살렸지만 앞알을 더미 앞 허공에 두었다. 레퍼런스는 바닥에 그림자가 있어
// 간격이 허용되지만, 쇼케이스는 투명 배경이라 같은 간격이 **공중 부유**로 읽힌다.
// 뒤 각도(135~225)에서는 더미 너머로 구슬 3개가 따로 떠 보인다.
//
// 원인은 크기 아님(★반지름 0.10/0.13/0.16 유지). 두 가지 배치 단서:
//  (1) 앞알 z가 더미 앞발과 안 겹침 → 앞알을 더미 밑동에 포갠다.
//  (2) 알갱이가 더미 바닥보다 아래로 뚫려 힙 bbox가 알갱이 바닥에 맞춰 들어올려짐
//      → 더미가 앞알보다 위에 떠서 접지면이 갈라진다. 알갱이는 표면에 더 묻고,
//      바닥을 뚫으면 더미 밑동까지 올려 힙과 앞알이 같은 y=0을 공유하게.
// v4.1: 밑동을 넓히고 접지 치마 알갱이 10개를 둘러, 낮은 각도에서 렌즈 컷·허공 틈이 안 보이게.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, pickTriangles, splitTrianglesByVertexMask, stdMaterial, uvDome, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/poppyseed.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0x2b2a38; // "a deep blue-black body" — 더미 전체 + 낱알 대부분
const HIGHLIGHT_COLOR = 0x45424f; // "a soft slate-gray highlight catching the rounded tops of the enlarged front seeds"
// 드롭: 크레바스에 고이는 근흑색 그늘 #1B1A24(N·L 감쇠가 공짜로 어둡게 함)와
// 뽀얀 보라 잔반점 #5A5568(하이라이트 버킷과 명도가 가까워 중복 — 4색을 2버킷으로 압축).

type ProfilePoint = readonly [number, number];

// ── 낱알 ─────────────────────────────────────────────────────────────────────
// v3: 6 → 20 세그먼트. 프로필도 5점 → 9점으로 늘려 위아래를 둥글린다(v2는 위아래가 평평한
// 프리즘이었다). 280tri/개 × 3 = 840tri — 상향된 예산(250KB/8000tri)에서 싼 값이다.
const SEED_SEGMENTS = 18;
const SEED_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.34, -0.94],
  [0.64, -0.77],
  [0.87, -0.47],
  [1.0, 0.0],
  [0.87, 0.47],
  [0.64, 0.77],
  [0.34, 0.94],
  [0.0, 1.0],
];
const SEED_JITTER_AMP_FRAC = 0.018; // 반지름 대비 비율(R4 취지 — 작은 알갱이일수록 절대 진폭도 작게)
// 하이라이트 — 위쪽 극점 바로 아래 링 하나. OR-of-3-vertices라 위아래 밴드까지 걸쳐 "둥근 윗면
// 캡"이 된다(280tri 중 60tri ≈ 21%). v2처럼 링을 2개 이상 잡으면 알이 반반으로 갈려 보인다.
const HIGHLIGHT_RING_INDEX = 7;

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

// ── 더미 ─────────────────────────────────────────────────────────────────────
// 낮고 넓은 렌즈꼴 힙. poppyseed.png 실측: 폭 대비 높이가 낮다.
//
// ★v3 핵심: 매끈한 렌즈 위에 **진짜 알갱이 15개를 반쯤 파묻는다.** 매끈한 표면은 크기와 무관하게
// "검은 돌"로 읽히고, 알갱이가 테두리를 물결치게 만들면 64px에서도 "쌓인 씨앗"으로 읽힌다.
const MOUND_SEGMENTS = 26; // 알갱이 사이로 드러나는 면이라 각져 보이지 않을 만큼은 필요
// v3.2: 0.6/0.22 → 0.55/0.20. 알갱이 대비 더미가 크면 알갱이 사이의 매끈한 면이 넓게 남아
// "리벳 박힌 원반"으로 읽힌다. 더미를 줄여 알갱이가 서로 겹치게 만든다.
// v4.1: 밑동 rFrac 0.86→0.94. 렌즈처럼 안으로 들어간 밑면은 낮은 각도에서 동굴이 되고
// 앞알이 그 앞에 떠 보인다. 밑동을 넓혀 더미가 바닥에 앉은 무더기로 읽히게.
const MOUND_RADIUS = 0.55;
const MOUND_HALF_HEIGHT = 0.2;
const MOUND_JITTER_AMP = 0.018;
const MOUND_PROFILE: readonly ProfilePoint[] = [
  [0.94, -1.0],
  [1.0, -0.68],
  [0.99, -0.32],
  [0.92, 0.02],
  [0.8, 0.34],
  [0.62, 0.62],
  [0.38, 0.84],
  [0.0, 1.0],
];

/**
 * 극점을 건드리지 않는 지터. lib.jitterVertices는 극점 정점도 밀어버리는데, 극점은 팬의
 * 중심이라 조금만 밀려도 **별 모양 핀치 주름**이 생긴다(v2 더미 꼭대기의 실제 결함).
 * rng는 극점에서도 그대로 소비해 시드 소비 순서를 단순하게 유지한다.
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

function buildMound(rng: () => number): THREE.BufferGeometry {
  const { geometry, ringStart } = buildRevolvedShell(MOUND_PROFILE, MOUND_SEGMENTS, MOUND_HALF_HEIGHT, () => [
    MOUND_RADIUS,
    MOUND_RADIUS,
  ]);
  jitterExceptPoles(geometry, rng, MOUND_JITTER_AMP, MOUND_PROFILE, ringStart);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

// ── 표면 알갱이 ───────────────────────────────────────────────────────────────
// 더미 표면에 반쯤 파묻히는 작은 구체들. 이게 테두리를 물결치게 만들어 "돌"과 "쌓인 씨앗"을 가른다.
// v3.2: 15 → 20개. 대신 프로필을 6점 → 5점으로 깎아 개당 80 → 60tri로 맞췄다(예산 동일).
// 아래 절반은 더미에 파묻혀 안 보이므로 세로 해상도보다 **개수**가 이득이다. 세그먼트(=평면도
// 윤곽의 매끄러움)는 10을 유지 — 부감 카메라라 그쪽이 눈에 띈다.
const GRAIN_COUNT = 20;
const GRAIN_SEGMENTS = 8;
const GRAIN_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.62, -0.6],
  [1.0, 0.0],
  [0.62, 0.6],
  [0.0, 1.0],
];
const GRAIN_R_MIN = 0.085;
const GRAIN_R_MAX = 0.13; // 앞알보다 크지 않게. 너무 작으면 더미가 다시 매끈한 렌즈.
const GRAIN_T_LO = 0.75; // 프로필 인덱스 하한 — 이보다 아래는 더미 밑동이라 알갱이가 바닥을 뚫는다
const GRAIN_T_SPAN = 5.65;
const GOLDEN_ANGLE = 2.39996; // 방위를 균등 배치하면 줄무늬가 보인다 — 황금각으로 흩는다

function buildGrain(rng: () => number, radius: number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(GRAIN_PROFILE, GRAIN_SEGMENTS, radius, () => [radius, radius]);
  jitterVertices(geometry, rng, radius * SEED_JITTER_AMP_FRAC);
  const baked = facet(geometry);
  uvDome(baked);
  return baked;
}

/** 프로필을 선형 보간해 더미 표면의 (반지름, 높이)를 준다. */
function moundSurfacePoint(t: number): { r: number; y: number } {
  const i = Math.min(MOUND_PROFILE.length - 2, Math.max(0, Math.floor(t)));
  const f = t - i;
  const [r0, h0] = MOUND_PROFILE[i];
  const [r1, h1] = MOUND_PROFILE[i + 1];
  return { r: (r0 + (r1 - r0) * f) * MOUND_RADIUS, y: (h0 + (h1 - h0) * f) * MOUND_HALF_HEIGHT };
}

const GRAIN_BURY = 0.28; // 너무 묻으면 실루엣이 다시 매끈한 렌즈가 된다. 돌출은 남기되 붙여넣은 구슬은 피한다.
const MOUND_BOTTOM = -MOUND_HALF_HEIGHT;
// 밑동 한 바퀴 — 열린 렌즈 밑면이 낮은 각도에서 검은 돌 컷으로 보이는 걸 알갱이 치마로 가린다.
// 앞알(0.10)보다 작아서 견본 알과 안 헷갈린다.
const SKIRT_COUNT = 10;
const SKIRT_R_MIN = 0.062;
const SKIRT_R_MAX = 0.084;
const SKIRT_R_FRAC = 0.84; // 밑동 안쪽에 심어 둘레 구슬이 따로 안 떠 보이게. 실루엣만 물결.

/** 표면 법선 쪽으로 파묻고, 더미 밑동 아래로 안 뚫리게 올린다(힙 접지가 알갱이 바닥에 안 끌려가게). */
function placeGrainOnMound(grain: THREE.Object3D, psi: number, t: number, radius: number): void {
  const p = moundSurfacePoint(t);
  const len = Math.hypot(p.r, p.y) || 1;
  const bury = radius * GRAIN_BURY;
  grain.position.set(
    Math.cos(psi) * (p.r - (p.r / len) * bury),
    p.y - (p.y / len) * bury,
    Math.sin(psi) * (p.r - (p.r / len) * bury),
  );
  const below = MOUND_BOTTOM - (grain.position.y - radius);
  if (below > 0) grain.position.y += below;
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
//
// ★v3: 크기를 v1대로 되돌렸다(0.20~0.30 → 0.10~0.16). **낱알을 다시 키우지 말 것.**
// ★v4.2: 반지름 그대로. 너무 밀어 넣으면 히어로에서 견본 3알이 더미에 먹힌다.
// 밑동·치마와 겹치되 앞쪽으로 살짝 내밀어 "더미 + 앞알"로 읽히게.
const SEEDS: Record<'a' | 'b' | 'c', SeedDef> = {
  a: { offset: [-0.3, 0.48], radius: 0.1 },
  b: { offset: [0.02, 0.54], radius: 0.13 },
  c: { offset: [0.3, 0.5], radius: 0.16 },
};

export const createPoppyseed: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const highlightMat = stdMaterial({ color: HIGHLIGHT_COLOR });

  const cluster = new THREE.Group();

  // 더미 = 매끈한 렌즈 + 표면 알갱이. 한 그룹으로 묶어 **마지막에 한 번만** 접지한다
  // (알갱이를 개별 접지하면 전부 바닥으로 내려앉아 더미를 떠난다).
  const heap = new THREE.Group();
  heap.add(new THREE.Mesh(buildMound(rng), bodyMat));
  for (let i = 0; i < GRAIN_COUNT; i++) {
    const u = (i + 0.5) / GRAIN_COUNT;
    const t = GRAIN_T_LO + GRAIN_T_SPAN * Math.pow(u, 0.72); // 아래(넓은 쪽)에 더 촘촘히 = 테두리 물결
    const psi = i * GOLDEN_ANGLE;
    const radius = GRAIN_R_MIN + (GRAIN_R_MAX - GRAIN_R_MIN) * (((i * 3) % 7) / 6);
    const grain = new THREE.Mesh(buildGrain(rng, radius), bodyMat);
    placeGrainOnMound(grain, psi, t, radius);
    heap.add(grain);
  }
  for (let i = 0; i < SKIRT_COUNT; i++) {
    const radius = SKIRT_R_MIN + (SKIRT_R_MAX - SKIRT_R_MIN) * (((i * 5) % 6) / 5);
    const psi = i * GOLDEN_ANGLE + 0.31; // 표면 알갱이 황금각과 어긋나 줄무늬 방지
    const r = MOUND_RADIUS * SKIRT_R_FRAC;
    const grain = new THREE.Mesh(buildGrain(rng, radius), bodyMat);
    grain.position.set(Math.cos(psi) * r, MOUND_BOTTOM + radius, Math.sin(psi) * r);
    heap.add(grain);
  }
  cluster.add(placeAndGround(heap, [0, -0.04], 0.08));

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
