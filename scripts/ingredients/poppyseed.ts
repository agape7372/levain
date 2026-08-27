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
// ═══ v4 (2026-08-26 재감사, "뒤 각도에서 뜬 구슬 3개") — 지오메트리는 손 안 댔다 ═══
// 바뀐 건 앞알 3개의 **배치 거리·방위뿐**이다. 근거는 SEEDS 상수 주석에.
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
const MOUND_RADIUS = 0.55;
const MOUND_HALF_HEIGHT = 0.2;
const MOUND_JITTER_AMP = 0.018;
const MOUND_PROFILE: readonly ProfilePoint[] = [
  [0.86, -1.0],
  [0.97, -0.72],
  [1.0, -0.38],
  [0.97, -0.02],
  [0.88, 0.32],
  [0.72, 0.6],
  [0.48, 0.82],
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
const GRAIN_SEGMENTS = 10;
const GRAIN_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.62, -0.6],
  [1.0, 0.0],
  [0.62, 0.6],
  [0.0, 1.0],
];
const GRAIN_R_MIN = 0.09;
const GRAIN_R_MAX = 0.155; // 편차를 넓혀 균일한 리벳 배열처럼 보이지 않게
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

/** 프로필을 선형 보간해 더미 표면의 (반지름, 높이)를 준다 — 중심을 표면에 두면 정확히 절반 파묻힌다. */
function moundSurfacePoint(t: number): { r: number; y: number } {
  const i = Math.min(MOUND_PROFILE.length - 2, Math.max(0, Math.floor(t)));
  const f = t - i;
  const [r0, h0] = MOUND_PROFILE[i];
  const [r1, h1] = MOUND_PROFILE[i + 1];
  return { r: (r0 + (r1 - r0) * f) * MOUND_RADIUS, y: (h0 + (h1 - h0) * f) * MOUND_HALF_HEIGHT };
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
// ★v3: 크기를 v1대로 되돌렸다(0.20~0.30 → 0.10~0.16). 더미 반지름 0.6 대비 1/6~1/4로,
// 레퍼런스의 "무더기 앞의 낱알 견본" 구도다. 64px 판독은 이제 더미의 오돌토돌한 실루엣이 맡는다 —
// **낱알을 다시 키우지 말 것.** 키우면 전체 화면에서 다시 돌덩이 3개가 된다.
//
// ═══ v4 (2026-08-26 재감사 — "뒤 각도에서 뜬 구슬 3개") ═══
// 낱알 크기는 그대로다(위 경고대로). 문제는 **더미와의 거리**였다: 중심에서 0.96~0.98이면
// 더미 실루엣(밑동 반경 ≈0.55 + 알갱이)과 0.3 이상 떨어진다. 바닥면이 없는 씬이라
// 실루엣이 분리되는 순간 지면 오브젝트가 뜬 것으로 읽히고, 뒤 각도(az 135~225)에서는
// 낱알이 카메라 시점상 더미 **위쪽**으로 투영돼(0.96·sin36° > 더미 높이) 그대로 "뜬 구슬"이 된다.
// flaxseed v4.1이 확정한 처방 — **끝을 더미에 물려 실루엣을 연결한다** — 을 그대로 적용한다:
// 낱알이 더미 밑동에 닿게 당겼다(같은 BODY_COLOR라 교차선은 안 보이고 "무더기에서 흘러나온
// 낱알"로 읽힌다). 대신 방위를 ±24°에서 ±40°로 벌렸다 — 반지름만 줄이면 셋이 서로 접해
// 한 줄 덩어리가 된다(CRIB 크랜베리 함정). 실측 중심간 거리 a-b 0.49 · b-c 0.51 > 반지름 합 0.23 · 0.29.
// ★거리는 **더미 반지름이 아니라 알갱이 껍질 반지름**에 맞춰야 한다 — r1에서 0.60~0.64로 잡았더니
// 낱알이 표면 알갱이 층(밑동에서 0.518 + 알갱이 0.155 = 0.673까지 뻗는다) 안으로 완전히 들어가
// 셋이 사라지고 "오돌토돌한 덩어리 하나"가 됐다. 뜬 구슬은 없앴지만 견본 낱알이라는 구도도 같이
// 없앤 셈이라 과교정이었다. 0.70~0.76이면 안쪽 모서리(0.60~0.62)가 알갱이 층에 물려 실루엣은
// 이어지고, 바깥쪽 절반은 층 밖으로 나와 개별 알로 읽힌다.
// ⚠ 다시 밖으로 밀지 마라 — 0.85를 넘으면 뒤 각도에서 실루엣이 다시 끊긴다(baseline은 0.96이었다).
const MOUND_CENTER: readonly [number, number] = [0, -0.1];
function seedOffset(deg: number, dist: number): readonly [number, number] {
  const t = (deg * Math.PI) / 180;
  return [MOUND_CENTER[0] + Math.sin(t) * dist, MOUND_CENTER[1] + Math.cos(t) * dist];
}
const SEEDS: Record<'a' | 'b' | 'c', SeedDef> = {
  a: { offset: seedOffset(-40, 0.7), radius: 0.1 },
  b: { offset: seedOffset(0, 0.72), radius: 0.13 },
  c: { offset: seedOffset(40, 0.76), radius: 0.16 },
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
    const p = moundSurfacePoint(t);
    const grain = new THREE.Mesh(buildGrain(rng, radius), bodyMat);
    grain.position.set(Math.cos(psi) * p.r, p.y, Math.sin(psi) * p.r);
    heap.add(grain);
  }
  cluster.add(placeAndGround(heap, MOUND_CENTER, 0.1));

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
