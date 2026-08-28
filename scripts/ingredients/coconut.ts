// 코코넛 — 말린 채(shred)가 덮인 무더기. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/coconut.json(워크스페이스 원본은
// assets/ingredients/work/coconut/). 색은 assets/prompts/ingredients/coconut.json 손 전사.
//
// ★정체성 = 자른 흰 과육 채 + 끝의 금갈색 테스타. JSON negative가 whole coconut·shell을
// 막고, 레퍼런스 3장도 채 무더기다. 통껍질·세 눈으로 버킷을 쓰면 채가 죽는다.
//
// ★CRIB 1순위 위험군(가는 가닥 + 세트 유일 크림색): 원 hex #EFE6D2가 도감 카드 배경(#F2E6D3)과
// ΔRGB 3/0/1. 아이보리는 scaleHex로 올려 Lambert·카드에서 빼고, 토스트는 JSON의 밝은 끝색
// (#B08A52). 깊은 fleck #8F6B3C는 나무조각/밤·귀리와 붙는다.
//
// ═══ v5 (2026-08-26) — 속 무더기 + 표면 가닥. 떠 있는 조각(v2~v4)은 이 구조로 죽었다 ═══
//
// ═══ v6 (2026-08-28 쇼케이스 수리) ═══════════════════════════════════════════════════════
// 진단: 맨 돔이 넓게 드러나 매끈한 탄색 공. 색이 레퍼런스보다 어두워 귀리/밤과 붙음.
//   ① 가닥이 실루엣. 정수리는 극을 가로지르는 현.
//   ② 아이보리 scaleHex 1.18, 토스트 #B08A52.
//   ③ 가닥 수×세그로 덮지 마라 — 96×5는 441KB. 폭으로 덮고 tri는 ≤250KB.
//
// ═══ v6.2 — 채움은 팬케이크, 돔 금지 ═══════════════════════════════════════════════════
// v6.1이 채움을 토스트 돔으로 바꿨더니 전 각도에서 **갈색 공**이 드러났다.
//
// ═══ v6.3 — 가닥을 원판 위에 붙인다 ═══════════════════════════════════════════════════
// v6.2는 pileY(0)=0.42 vs 원판 0.09라 3/4에서 캐노피 밑으로 원판 윗면이 보였다(tt-180/270
// 맨 살갗). 가닥 보행면을 원판 바로 위로 내리고, 더미 높이는 LAYER_LIFT 적층이 만든다.
import * as THREE from 'three';
import { facet, jitterVertices, buildRevolvedShell, mergeByMaterial, scaleHex, stdMaterial, uvDome, uvTopPlanar } from '../breads/lib';
import type { IngredientBuilder } from './types';

// 팔레트 — assets/prompts/ingredients/coconut.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const IVORY_SRC = 0xefe6d2; // "a near-white ivory shred body"
// Lambert(키 1.4·앰비언트 0.75, 앱은 0.55)가 원 hex를 베이지로 깎아 흰 과육이 사라진다.
// 1.18 → #FFFFF8 (R·G 클램프). 1.12(#FFFFEB)는 1차 턴테이블에서 탄색으로 앉았다.
const IVORY_COLOR = scaleHex(IVORY_SRC, 1.18);
const TOASTED_COLOR = 0xb08a52; // "strand tips toasted to a light golden-brown at their edges"
// 드롭: 깊은 fleck #8F6B3C — 2버킷에서 이 색이 면적을 잡아 나무조각/밤과 붙었다.

// ── 채움 원판 (구멍 보험 — 돔이면 맨 공이 된다) ────────────────────────────────
// 양 극 + 같은 높이 림 = 평면 캡(CRIB sweetpotato). 높이는 가닥 더미의 ~1/4.
const FILL_RADIUS = 0.5;
const FILL_HEIGHT = 0.08;
const FILL_SEGMENTS = 16;
const FILL_JITTER = 0.006;
const FILL_PROFILE: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

// ── 가닥이 걷는 더미 표면 ────────────────────────────────────────────────────
const PILE_RADIUS = 0.74;
const PILE_HEIGHT = 0.11; // 원판(0.08) 바로 위. 높이 0.4로 올리면 캐노피 공동이 다시 생긴다.
const PILE_EXP = 1.5;

function pileY(r: number): number {
  const u = Math.min(1, r / PILE_RADIUS);
  return PILE_HEIGHT * (1 - Math.pow(u, PILE_EXP));
}

// ── 가닥 ────────────────────────────────────────────────────────────────────
const SHRED_COUNT = 76;
const CROWN_COUNT = 20;
const SEGMENTS_PER_SHRED = 3;
const SHRED_LENGTH_MIN = 0.36;
const SHRED_LENGTH_MAX = 0.52;
const SHRED_WIDTH_BASE = 0.12;
const SHRED_WIDTH_TIP = 0.074;
const SHRED_HALF_THICKNESS = 0.015;
// 반두께보다 작게. 크게 잡으면 az 0/270에서 v2~v4의 뜬 조각이 돌아온다.
const SHRED_CLEARANCE = 0.01;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TIP_SPLIT_NODE = 2; // 3세그 중 끝 1/3만 토스트
const LAYER_LIFT = 0.028; // 3층 ≈ 0.06. 더미 높이는 이게 만든다(pileY가 아니라).
const TIP_LIFT = 0.05; // 스펙 "tips curling upward at the edges"

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
  fullToast: boolean;
  tipToast: boolean;
}

// v6: 통토스트 0.15 -> 0.11, 끝토스트 0.35 -> 0.32 (합 0.50 -> 0.43). 밝은 hex로 갈아탄
// 만큼만 비중을 덜었다 — 프롬프트가 통짜 갈색은 "a few"라고 못박고 있고, 가닥 수가 54 -> 70으로
// 늘어 **절대 개수**(27 -> 30)는 오히려 유지된다. 배경 대비를 지키는 건 개수 쪽이다.
function pickCategory(rng: () => number): ShredCategory {
  const r = rng();
  // 레퍼런스 갈색 화소 ~9–18%. 채움은 아이보리 원판이므로 가닥 끝이 테스타를 맡는다.
  if (r < 0.07) return { fullToast: true, tipToast: false };
  if (r < 0.3) return { fullToast: false, tipToast: true };
  return { fullToast: false, tipToast: false };
}

/**
 * 가닥 1개. 높이는 pileY. 정수리 가닥은 극을 가로질러 원판이 위에서 안 보이게 한다.
 */
function buildShred(index: number, rng: () => number): { geo: THREE.BufferGeometry; toasted: boolean }[] {
  const azimuth = index * GOLDEN_ANGLE + (rng() - 0.5) * 0.4;
  const isCrown = index < CROWN_COUNT;
  const bodyU = (index - CROWN_COUNT + 0.5) / Math.max(1, SHRED_COUNT - CROWN_COUNT);
  let startR = isCrown
    ? PILE_RADIUS * (0.14 + 0.2 * Math.sqrt((index + 0.5) / CROWN_COUNT))
    : PILE_RADIUS * (0.24 + 0.72 * Math.sqrt(bodyU));
  const spill = !isCrown && startR > PILE_RADIUS * 0.82 && index % 5 === 0;

  let turn: number;
  let length: number;
  let widthBase = SHRED_WIDTH_BASE;
  let widthTip = SHRED_WIDTH_TIP;
  if (isCrown) {
    turn = Math.PI + (rng() - 0.5) * 0.45;
    length = 0.46 + rng() * 0.14;
    widthBase = 0.155;
    widthTip = 0.1;
  } else if (spill) {
    turn = (rng() - 0.5) * 0.35;
    length = 0.2 + rng() * 0.1;
  } else {
    turn = (rng() < 0.5 ? -1 : 1) * (1.05 + rng() * 0.4);
    length = SHRED_LENGTH_MIN + rng() * (SHRED_LENGTH_MAX - SHRED_LENGTH_MIN);
  }

  const curl = (rng() - 0.5) * 0.7;
  const layerLift = (index % 3) * LAYER_LIFT;
  const tipLift = !isCrown && !spill && index % 8 === 3 ? TIP_LIFT : 0;

  const segLen = length / SEGMENTS_PER_SHRED;
  let x = Math.cos(azimuth) * startR;
  let z = Math.sin(azimuth) * startR;
  let heading = azimuth + turn;

  const points: THREE.Vector3[] = [];
  for (let s = 0; s <= SEGMENTS_PER_SHRED; s++) {
    if (s > 0) {
      heading += curl / SEGMENTS_PER_SHRED;
      x += Math.cos(heading) * segLen;
      z += Math.sin(heading) * segLen;
    }
    const r = Math.hypot(x, z);
    const centerBoost = Math.max(0, 1 - r / (PILE_RADIUS * 0.55)) * 0.035;
    const lift = layerLift + centerBoost + tipLift * (s / SEGMENTS_PER_SHRED) * (s / SEGMENTS_PER_SHRED);
    points.push(new THREE.Vector3(x, pileY(r) + SHRED_CLEARANCE + lift, z));
  }

  const rings = points.map((p, k) => {
    const prev = points[Math.max(0, k - 1)];
    const next = points[Math.min(points.length - 1, k + 1)];
    const halfW = (widthBase + (widthTip - widthBase) * (k / SEGMENTS_PER_SHRED)) / 2;
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

  const { geometry: fillGeo } = buildRevolvedShell(FILL_PROFILE, FILL_SEGMENTS, FILL_HEIGHT, () => [
    FILL_RADIUS,
    FILL_RADIUS,
  ]);
  jitterVertices(fillGeo, rng, FILL_JITTER);
  const fillBaked = facet(fillGeo);
  uvDome(fillBaked);
  // 아이보리 원판 — 틈으로 보여도 과육이지 공이 아니다. 토스트 돔으로 되돌리면 v6.1의 갈색 공.
  group.add(new THREE.Mesh(fillBaked, ivoryMat));

  for (let i = 0; i < SHRED_COUNT; i++) {
    for (const part of buildShred(i, rng)) {
      group.add(new THREE.Mesh(part.geo, part.toasted ? toastedMat : ivoryMat));
    }
  }

  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;

  return mergeByMaterial(group);
};
