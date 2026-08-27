// 코코넛 — 말린 채(shred)가 덮인 무더기. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/coconut.json(워크스페이스 원본은
// assets/ingredients/work/coconut/). 색은 그 스펙(author_spec.py)의 전사다.
//
// ★CRIB 1순위 위험군(가는 가닥 + 세트 유일 크림색): 몸통색 #EFE6D2가 도감 카드 배경(#F2E6D3)과
// 거의 같다(ΔRGB 3/0/1) — 64px에서 배경에 녹아 사라질 위험이 가장 큰 재료. 대응은 토스트 버킷
// (#8F6B3C) 비중을 후하게 잡는 것(가닥의 15%는 통째로 토스트, 35%는 끝만) — **이 비율을 낮추지 마라.**
//
// ═══ v5 (2026-08-26 쇼케이스 수리) — 되돌리지 말 것 ═══════════════════════════════════════
// v2~v4는 전부 "흩뿌린 가닥의 배치를 조여서" 무더기를 만들려 했고 **네 번 다 실패했다.**
// 전체 화면 쇼케이스에서 어느 각도로 봐도 흩뿌린 색종이 조각이었다: front 뷰에서 조각들이
// y=0/중간/위 세 개의 수평 띠로 갈라져 그 사이 빈 공간에 떠 있었고, az 0/270에서는 무더기 밖으로
// 완전히 떨어져 나간 조각도 있었다.
//
// 근본 원인은 배치 수치가 아니라 **모델이 비어 있다는 것**이다. 가닥만으로 부피를 채우려면
// 가닥 사이가 반드시 비고, 그 빈틈은 어느 각도에서든 배경이 뚫고 나온다(층을 쌓으면 위층이
// 아래층 위에 뜬다 — v2가 정확히 그랬다). 실제 코코넛 채 무더기도 속은 채가 아니라 **덩어리**다.
//
// v5는 그래서 구조를 바꿨다:
//   ① 아이보리 **속 무더기(dome)**를 실제 지오메트리로 넣는다. 실루엣과 부피는 이게 책임진다.
//   ② 가닥은 그 표면에 **얹는다**. 모든 마디의 높이가 domeY(반지름)로 결정되므로 가닥은
//      정의상 무더기에 붙어 있다 — 층 개념도, 뜨는 조각도 원리적으로 생길 수 없다.
//      테두리를 넘어간 가닥은 domeY=0이라 그대로 바닥에 눕는다.
//   ③ 조각 모양도 바꿨다. v2~v4의 "카드"는 뿌리·끝·좌우 날개 4정점 사면체라 어느 방향에서 봐도
//      마름모였다 — 그게 "색종이 조각"의 정체다. 이제 단면 4각의 **닫힌 얇은 각기둥 리본**이다.
//   ④ CLEARANCE는 리본 반두께보다 작게 둔다. 살짝 파묻히는 건 안 보이지만, 살짝 뜨는 건
//      스치는 각도(az 0/270)에서 정확히 우리가 고치려는 그 버그로 보인다.
//
// 예산이 100KB/2500tri → 250KB/8000tri로 상향돼서(families.mjs) 속 무더기를 넣을 여유가 생겼다.
// 원래 조였던 이유가 도감 썸네일이 작아서였는데, 재료도 빵과 **같은 쇼케이스에서 같은 크기로**
// 확대돼 보인다는 걸 계산에 안 넣은 것이었다.
//
// ═══ v6 (2026-08-26 재감사 수리) — 판정: "맨 돔이 넓게 드러남 + 색이 레퍼런스보다 어두움" ═══
// v5의 구조(속 무더기 + 표면에 얹는 가닥)는 옳았고 그대로 유지한다. 바꾼 건 두 축뿐이다:
//   ① 커버리지 — 가닥 54 -> 76, 길이 0.30~0.48 -> 0.36~0.58, 뿌리 반지름 상한 0.92R.
//      **개수는 예산(250KB)이 먼저 막아서 tri가 공짜인 길이 축으로 벌었다.**
//      동시에 v5가 남긴 "성게 가시"를 눌렀다(접선 강제 + 테두리 길이 축소 — 아래 상수 주석 참조).
//   ② 색 — 토스트 버킷을 프롬프트의 진한 hex에서 밝은 hex로 교체(TOASTED_COLOR 주석 참조).
//
// ⚠ 남은 한계(다음 사람용): 렌더의 아이보리는 #EFE6D2가 아니라 **#CAB189**로 나온다.
// 하네스·런타임 키라이트가 따뜻한 색이라 R-B 스프레드가 29 -> 65로 벌어진다(픽셀 실측).
// 즉 "코코넛이 레퍼런스보다 탁하다"의 일부는 팔레트가 아니라 **조명 리그**다 —
// 빌더에서 더 밝게 만들 여지는 hex 정본을 어기지 않는 한 없다. 창백한 재료 전반에 해당한다.
import * as THREE from 'three';
import { facet, jitterVertices, buildRevolvedShell, mergeByMaterial, stdMaterial, uvDome, uvTopPlanar } from '../breads/lib';
import type { IngredientBuilder } from './types';

// 팔레트 — assets/prompts/ingredients/coconut.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
//
// ★v6: 토스트 버킷을 #8F6B3C -> #B08A52로 **교체**했다. 프롬프트에는 갈색 hex가 둘 있는데
//   - #B08A52 "scattered strand tips toasted to a light golden-brown at their edges" (다수 피처)
//   - #8F6B3C "a few deeper toasted-brown flecks scattered through the pile" (소수 피처)
// v5는 진한 쪽 하나만 남겨 **두 역할에 같이** 썼다. 그 결과 가닥의 절반이 진갈색이 되어
// 쇼케이스에서 재료 전체가 레퍼런스보다 어둡게(카키색 덩어리) 읽혔다 — 재감사 약함 판정의 색 축.
// 다수 피처의 hex를 쓰는 게 프롬프트 정합이고, 밝은 쪽이므로 전체 명도도 올라간다.
// ⚠ 배경 대비는 여전히 확보된다: #B08A52(176,138,82) vs 카드 배경 #F2E6D3(242,230,211)은
// ΔRGB 66/92/129 — v5가 상쇄하려던 "아이보리가 배경에 녹는다"(ΔRGB 3/0/1) 문제는 그대로 막힌다.
const IVORY_COLOR = 0xefe6d2; // "a near-white ivory shred body"
const TOASTED_COLOR = 0xb08a52; // "strand tips toasted to a light golden-brown at their edges"

// ── 속 무더기 ────────────────────────────────────────────────────────────────────────────
// y = H·(1 - (r/R)^EXP). EXP>2면 정수리가 완만하고 테두리가 가파르다 — 부어놓은 더미의 옆선.
const MOUND_RADIUS = 0.7;
// v6: 0.52 -> 0.45. 덮어야 할 돔 표면적이 줄어(같은 가닥 수로 커버리지 +8%) 맨살 패치가 줄고,
// 프롬프트의 "irregular **low** mound"에도 더 맞다 — 0.52는 옆에서 보면 반구여서 빵 번 쪽이었다.
const MOUND_HEIGHT = 0.45;
const MOUND_EXP = 2.2;
const MOUND_SEGMENTS = 24;
const MOUND_JITTER = 0.016; // 얇은 파트가 아니라 덩어리라 지터를 먹여도 실루엣이 안 뭉개진다(R4)

function domeY(r: number): number {
  const u = Math.min(1, r / MOUND_RADIUS);
  return MOUND_HEIGHT * (1 - Math.pow(u, MOUND_EXP));
}

// 프로필 = domeY 그 자체(별도 수치 테이블을 두면 가닥이 얹히는 면과 무더기 표면이 어긋난다).
// hFrac은 0..1이고 heightScale=MOUND_HEIGHT라 y = hFrac·H로 domeY와 정확히 같은 곡선이 나온다.
// 첫 두 점 [0,0]→[1,0]은 밑면(팬) — 바깥→위로 올라가기 전에 바닥을 닫는다.
const MOUND_RING_U: readonly number[] = [1.0, 0.9, 0.75, 0.57, 0.36, 0.16];
const MOUND_PROFILE: readonly (readonly [number, number])[] = [
  [0, 0],
  ...MOUND_RING_U.map((u) => [u, 1 - Math.pow(u, MOUND_EXP)] as const),
  [0, 1],
];

// ── 가닥 ────────────────────────────────────────────────────────────────────────────────
// v5b: 42 → 54. 1차 렌더에서 정수리 쪽 무더기 살갗이 그대로 드러나 "빨대 꽂은 빵"으로 보였다.
//
// ★v6: 54 → 76 + 길이 확대. 재감사가 "맨 돔이 넓게 드러남"으로 약함 판정했다 — 54개로는 돔
// 표면적을 못 덮어 아이보리 살갗이 넓게 남고, 실루엣을 가닥이 아니라 돔이 정한다.
//
// **개수만 올려서는 못 푼다 — 예산이 먼저 막힌다.** 가닥 1개 ≈ 29tri, 실측 96 B/tri라
// 76개 + 무더기 288tri = 2512tri ≈ 238KB로 250KB 상한 안쪽 끝까지 이미 썼다.
// 그래서 남은 커버리지는 **tri가 공짜인 축**에서 벌었다: 길이 0.30~0.48 -> 0.36~0.58.
// 가닥 1개의 발자국 면적 0.037 -> 0.046으로 돔 표면적(≈1.9)의 1.37배 -> 1.85배를 덮는다.
// (CRIB rosemary 교훈 "개수를 더 늘리는 게 아니라 폭을 키운 게 답이었다"와 같은 축 — 다만
// 여기선 폭이 아니라 길이다. 폭은 0.118로 조금만 올려 길이/폭 4.9:1을 유지했다: 중간에
// 0.128까지 넓혀 봤더니 채가 아니라 나무 조각으로 읽혔다.)
// 두께는 안 올렸다: 얇고 넓은 리본이 채(shred)이고, 두꺼워지면 v5b가 고친 "각목"으로 돌아간다.
const SHRED_COUNT = 76;
const SEGMENTS_PER_SHRED = 3;
const SHRED_LENGTH_MIN = 0.36;
const SHRED_LENGTH_MAX = 0.58;
const SHRED_WIDTH_BASE = 0.118;
const SHRED_WIDTH_TIP = 0.078;
const SHRED_HALF_THICKNESS = 0.019;
// 뿌리를 R의 92%까지 놓는다 — 86%로 잘랐던 v6는 테두리 띠(r 0.60~0.70)가 맨살로 남았다.
// 테두리에서 출발한 가닥이 domeY=0인 바닥으로 뻗는 게 "성게 가시"의 정체였으므로(CRIB
// coconut v1~v3 함정), 클램프를 푸는 대신 아래 두 축(접선 강제 + 길이 축소)으로 눌렀다.
const SHRED_START_R_MAX = 0.92;
// 뿌리가 바깥일수록 길이를 줄인다(테두리 밖 돌출량 = f(startR, length, turn)).
// v6: 0.3 -> 0.45. 길이 상한이 0.48 -> 0.58로 올라간 만큼 테두리 쪽을 더 깎아야 돌출량이
// v6 수준(R+0.07)에 머문다. 실측 근거: startFrac 0.92 · length 0.58 · cos(turn) 최대 0.50에서
// 반지름 도달점 = sqrt(0.644² + 0.319² + 2·0.644·0.319·0.50) = 0.79 ≈ R + 0.09.
const SHRED_RIM_SHORTENING = 0.45;
// 완만한 활 1회의 진폭(rad) — v6: 0.5 -> 0.9. 가닥이 길어진 만큼 휘어야 "curled shred"가 되고,
// 안쪽으로 휘는 절반은 돌출량도 같이 줄인다. 무작위 지그재그는 금지(v3 교훈).
const SHRED_CURL_AMP = 0.9;
// ⚠ 반두께(0.019)보다 작게. 크게 잡으면 가닥이 무더기 위에 뜨고, 그게 az 0/270 스치는 각도에서
// 정확히 v2~v4의 "떠 있는 조각"으로 보인다. 파묻히는 쪽 오차는 안 보인다 — 비대칭 위험이다.
const SHRED_CLEARANCE = 0.013;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // 방위각을 겹치지 않게 흩는다(rng 뭉침 방지)
const TIP_SPLIT_NODE = 2; // 끝만 토스트일 때 색이 갈리는 마디 — 끝 1/3만 갈색

const UP = new THREE.Vector3(0, 1, 0);

/** 마디 하나의 단면 4각형(리본 폭 × 두께). tangent가 수직에 가까우면 side가 무너지므로 방어한다. */
function ringAt(p: THREE.Vector3, tangent: THREE.Vector3, halfW: number): THREE.Vector3[] {
  const t = tangent.clone().normalize();
  const side = new THREE.Vector3().crossVectors(t, UP);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const up = new THREE.Vector3().crossVectors(side, t).normalize();
  const h = SHRED_HALF_THICKNESS;
  return [
    p.clone().addScaledVector(side, halfW).addScaledVector(up, h),
    p.clone().addScaledVector(side, -halfW).addScaledVector(up, h),
    p.clone().addScaledVector(side, -halfW).addScaledVector(up, -h),
    p.clone().addScaledVector(side, halfW).addScaledVector(up, -h),
  ];
}

/**
 * 단면 링 배열 → 닫힌 각기둥(양끝 캡 포함). 와인딩은 전부 바깥향으로 손검산했다
 * (옆면 4장 + 시작 캡 [0,1,2]/[0,2,3] + 끝 캡 역순). 뒤집으면 check-winding이 잡는다.
 * 리본을 두 토막으로 나눌 때 **같은 링 객체를 공유**하므로 이음매가 정확히 맞물린다(v3 네킹 방지).
 */
function buildTube(rings: readonly THREE.Vector3[][]): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const ring of rings) for (const v of ring) positions.push(v.x, v.y, v.z);
  const index: number[] = [];
  for (let k = 0; k < rings.length - 1; k++) {
    const a = k * 4;
    const b = (k + 1) * 4;
    for (let s = 0; s < 4; s++) {
      const s1 = (s + 1) % 4;
      index.push(a + s, b + s, b + s1);
      index.push(a + s, b + s1, a + s1);
    }
  }
  index.push(0, 1, 2, 0, 2, 3);
  const e = (rings.length - 1) * 4;
  index.push(e + 0, e + 2, e + 1, e + 0, e + 3, e + 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

interface ShredCategory {
  fullToast: boolean; // 통째로 토스트("deeper toasted-brown flecks")
  tipToast: boolean; // 끝만 토스트
}

// v6: 통토스트 0.15 -> 0.11, 끝토스트 0.35 -> 0.32 (합 0.50 -> 0.43). 밝은 hex로 갈아탄
// 만큼만 비중을 덜었다 — 프롬프트가 통짜 갈색은 "a few"라고 못박고 있고, 가닥 수가 54 -> 70으로
// 늘어 **절대 개수**(27 -> 30)는 오히려 유지된다. 배경 대비를 지키는 건 개수 쪽이다.
function pickCategory(rng: () => number): ShredCategory {
  const r = rng();
  if (r < 0.11) return { fullToast: true, tipToast: false };
  if (r < 0.43) return { fullToast: false, tipToast: true };
  return { fullToast: false, tipToast: false };
}

/**
 * 가닥 1개 = 무더기 표면을 따라 걷는 마디 4개. XZ에서만 걷고 높이는 domeY가 정한다 —
 * 그래서 어떤 가닥도 무더기에서 떨어질 수 없다(v5의 핵심). 테두리를 넘으면 domeY=0이라 바닥에 눕는다.
 * spill=true인 가닥만 바깥으로 뻗어 실루엣을 깨고, 나머지는 등고선을 따라 감싼다(더미가 안 커진다).
 */
function buildShred(index: number, rng: () => number): { geo: THREE.BufferGeometry; toasted: boolean }[] {
  const azimuth = index * GOLDEN_ANGLE + (rng() - 0.5) * 0.5;
  // 지수는 면적 균등(0.5=sqrt)보다 안쪽으로 몰아준다 — v5b에서 정수리가 비어 보였다.
  // ⚠ v6 중간 라운드에서 0.56으로 내려봤고 **되돌렸다**(0.62 유지). 실측: 0.56은 중턱~테두리를
  // 채우는 대신 정수리에 매끈한 맨살 캡을 만들었고, 3/4 부감 카메라에서는 정수리가 화면을 가장
  // 넓게 차지해 손해가 더 컸다. **커버리지는 분포를 재배분해서 벌 수 없다** — 총량(개수·길이)과
  // 덮을 면적(돔 높이) 쪽에서만 벌린다. 그 셋을 다 올린 지금 상태가 전 구간 최선이었다.
  // v6: 뿌리 반지름을 SHRED_START_R_MAX로 클램프해 테두리 밖으로 뻗는 걸 막는다.
  const startR = MOUND_RADIUS * SHRED_START_R_MAX * Math.pow((index + 0.5) / SHRED_COUNT, 0.62);
  const startFrac = startR / MOUND_RADIUS;
  // v5b: spill 조건을 0.55R → 0.8R로 올리고 길이를 줄였다. 1차 렌더에서 중턱(높이 57%)부터
  // 바깥으로 뻗은 가닥들이 수평 다리처럼 보여 실루엣이 성게/벌레가 됐다. 이제 테두리 근처에서만
  // 흘러내려 바닥에 눕는다 — 짚더미에서 삐져나온 지푸라기 쪽 인상.
  const spill = index % 3 === 0 && startFrac > 0.8;
  // turn=0이면 방사(바깥으로), ±PI/2면 접선(등고선 감기).
  // v6: 비-spill 범위를 0.75~1.45 -> 1.05~1.55로 올려 거의 접선으로 눕혔다. 방사 성분이 남으면
  // 뿌리가 안쪽이어도 끝이 테두리를 넘어가고, 그게 스치는 각도에서 가시가 된다.
  const turn = spill ? (rng() - 0.5) * 0.5 : (rng() < 0.5 ? -1 : 1) * (1.05 + rng() * 0.5);
  const rawLength = spill
    ? 0.22 + rng() * 0.1
    : SHRED_LENGTH_MIN + rng() * (SHRED_LENGTH_MAX - SHRED_LENGTH_MIN);
  const length = rawLength * (1 - SHRED_RIM_SHORTENING * startFrac);
  const curl = (rng() - 0.5) * SHRED_CURL_AMP; // 완만한 활 1회

  const segLen = length / SEGMENTS_PER_SHRED;
  let x = Math.cos(azimuth) * startR;
  let z = Math.sin(azimuth) * startR;
  let heading = azimuth + turn;

  const points: THREE.Vector3[] = [new THREE.Vector3(x, domeY(Math.hypot(x, z)) + SHRED_CLEARANCE, z)];
  for (let s = 0; s < SEGMENTS_PER_SHRED; s++) {
    heading += curl / SEGMENTS_PER_SHRED;
    x += Math.cos(heading) * segLen;
    z += Math.sin(heading) * segLen;
    points.push(new THREE.Vector3(x, domeY(Math.hypot(x, z)) + SHRED_CLEARANCE, z));
  }

  // 마디별 접선은 앞뒤 평균 — 이음매에서 단면이 어긋나지 않는다.
  const rings = points.map((p, k) => {
    const prev = points[Math.max(0, k - 1)];
    const next = points[Math.min(points.length - 1, k + 1)];
    const halfW = (SHRED_WIDTH_BASE + (SHRED_WIDTH_TIP - SHRED_WIDTH_BASE) * (k / SEGMENTS_PER_SHRED)) / 2;
    return ringAt(p, next.clone().sub(prev), halfW);
  });

  const category = pickCategory(rng);
  if (category.tipToast) {
    return [
      { geo: buildTube(rings.slice(0, TIP_SPLIT_NODE + 1)), toasted: false },
      { geo: buildTube(rings.slice(TIP_SPLIT_NODE)), toasted: true },
    ];
  }
  return [{ geo: buildTube(rings), toasted: category.fullToast }];
}

export const createCoconut: IngredientBuilder = (rng) => {
  const ivoryMat = stdMaterial({ color: IVORY_COLOR });
  const toastedMat = stdMaterial({ color: TOASTED_COLOR });

  const group = new THREE.Group();

  // 속 무더기 — 가닥과 **같은 아이보리 머티리얼 인스턴스**를 쓴다(mesh ≤2, types.ts §1).
  const { geometry: moundGeo } = buildRevolvedShell(MOUND_PROFILE, MOUND_SEGMENTS, MOUND_HEIGHT, () => [
    MOUND_RADIUS,
    MOUND_RADIUS,
  ]);
  jitterVertices(moundGeo, rng, MOUND_JITTER);
  const moundBaked = facet(moundGeo);
  uvDome(moundBaked);
  group.add(new THREE.Mesh(moundBaked, ivoryMat));

  for (let i = 0; i < SHRED_COUNT; i++) {
    for (const part of buildShred(i, rng)) {
      group.add(new THREE.Mesh(part.geo, part.toasted ? toastedMat : ivoryMat));
    }
  }

  // 공유 지면 y=0 — 더미 전체 bbox 1회로만 맞춘다(개별 가닥 그라운딩은 표면 곡률을 눌러버린다).
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;

  return mergeByMaterial(group);
};
