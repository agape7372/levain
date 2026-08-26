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
import * as THREE from 'three';
import { facet, jitterVertices, buildRevolvedShell, mergeByMaterial, stdMaterial, uvDome, uvTopPlanar } from '../breads/lib';
import type { IngredientBuilder } from './types';

// 팔레트 — assets/prompts/ingredients/coconut.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
// 가장자리 밝은 토스트(#B08A52)는 드롭 — mesh<=2 예산 안에서 "아이보리 vs 진한 토스트" 2버킷이
// 배경-대비를 최대화하는 조합이라, 중간 톤을 넣으면 오히려 대비가 흐려진다.
const IVORY_COLOR = 0xefe6d2; // "a near-white ivory shred body"
const TOASTED_COLOR = 0x8f6b3c; // "a few deeper toasted-brown flecks scattered through the pile"

// ── 속 무더기 ────────────────────────────────────────────────────────────────────────────
// y = H·(1 - (r/R)^EXP). EXP>2면 정수리가 완만하고 테두리가 가파르다 — 부어놓은 더미의 옆선.
const MOUND_RADIUS = 0.7;
const MOUND_HEIGHT = 0.52;
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
const SHRED_COUNT = 54;
const SEGMENTS_PER_SHRED = 3;
const SHRED_LENGTH_MIN = 0.3;
const SHRED_LENGTH_MAX = 0.48;
// v5b: 폭·두께를 한 단계 줄였다 — 1차 렌더의 가닥이 채가 아니라 나무 조각(각목)으로 읽혔다.
const SHRED_WIDTH_BASE = 0.1;
const SHRED_WIDTH_TIP = 0.062;
const SHRED_HALF_THICKNESS = 0.019;
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

function pickCategory(rng: () => number): ShredCategory {
  const r = rng();
  if (r < 0.15) return { fullToast: true, tipToast: false };
  if (r < 0.5) return { fullToast: false, tipToast: true };
  return { fullToast: false, tipToast: false };
}

/**
 * 가닥 1개 = 무더기 표면을 따라 걷는 마디 4개. XZ에서만 걷고 높이는 domeY가 정한다 —
 * 그래서 어떤 가닥도 무더기에서 떨어질 수 없다(v5의 핵심). 테두리를 넘으면 domeY=0이라 바닥에 눕는다.
 * spill=true인 가닥만 바깥으로 뻗어 실루엣을 깨고, 나머지는 등고선을 따라 감싼다(더미가 안 커진다).
 */
function buildShred(index: number, rng: () => number): { geo: THREE.BufferGeometry; toasted: boolean }[] {
  const azimuth = index * GOLDEN_ANGLE + (rng() - 0.5) * 0.5;
  // 지수 0.62 — 면적 균등(0.5=sqrt)보다 살짝 안쪽으로 몰아준다. v5b: 정수리가 비어 보였다.
  const startR = MOUND_RADIUS * Math.pow((index + 0.5) / SHRED_COUNT, 0.62);
  // v5b: spill 조건을 0.55R → 0.8R로 올리고 길이를 줄였다. 1차 렌더에서 중턱(높이 57%)부터
  // 바깥으로 뻗은 가닥들이 수평 다리처럼 보여 실루엣이 성게/벌레가 됐다. 이제 테두리 근처에서만
  // 흘러내려 바닥에 눕는다 — 짚더미에서 삐져나온 지푸라기 쪽 인상.
  const spill = index % 3 === 0 && startR > MOUND_RADIUS * 0.8;
  // turn=0이면 방사(바깥으로), ±PI/2면 접선(등고선 감기).
  const turn = spill ? (rng() - 0.5) * 0.5 : (rng() < 0.5 ? -1 : 1) * (0.75 + rng() * 0.7);
  const length = spill
    ? 0.28 + rng() * 0.12
    : SHRED_LENGTH_MIN + rng() * (SHRED_LENGTH_MAX - SHRED_LENGTH_MIN);
  const curl = (rng() - 0.5) * 0.5; // 완만한 활 1회(v3 교훈: 무작위 지그재그는 조각을 낱낱이 갈라놓는다)

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
