// 크래커 — 정사각 웨이퍼, Cartesian 격자 슬랩. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 `assets/breads/specs/cracker.json`(워크스페이스 원본은
// assets/breads/work/cracker/). 수치·색은 그 스펙의 전사이며, 스펙 자체는
// assets/prompts/breads/cracker.json geometry의 전사다.
//
// pancake과 달리 원형 대칭이 없어 LatheGeometry/폴라 링이 아니라 NxN Cartesian 그리드로
// 짠다(CRIB "LatheGeometry 금지"는 원래 φ-seam 얘기지만, 애초에 사각형엔 적용 대상이 아니다).
// 도킹홀 = 격자 셀 함몰, 씨앗 스페클 = 격자 셀 융기 — 둘 다 pancake의 기포 메커니즘을
// 그대로 정사각 격자에 옮긴 것으로, 삼각형 수를 늘리지 않는다(types.ts 불변 계약과 무관하게
// 스스로 부과한 예산 규율).
import * as THREE from 'three';
import type { BreadBuilder } from './types';
import { facet, jitterVertices, mergeByMaterial, stdMaterial, uvTopPlanar } from './lib';

// 팔레트 — assets/prompts/breads/cracker.json geometry.crust 손 전사 (JSON import 금지, types.ts §8)
const TOP_COLOR = 0xd9a552; // "uniform matte golden surface #D9A552 across the whole top face" — 전체 단색

// 실측/저작 비율 (assets/breads/work/cracker/author_spec.py 전사)
// half-width 1.0 기준 (전체 폭 2.0). 절대 스케일은 무의미 — 런타임이 최장축 1.6으로 리핏 (types.ts §7).
const HALF_WIDTH = 1.0;
const THICK = 0.2; // 폭의 1/10 — cracker.json silhouette 정본 (이미지 실측은 더 얇게 나왔으나 스펙이 정본, CRIB 색 정본 규칙을 비율에도 준용)
const N = 16; // 변당 격자 분할 수 (윗면 해상도)
const CELL = (2 * HALF_WIDTH) / N; // 0.125

// 도킹홀 — 규칙적 격자, 가장자리에서 2셀 마진, 4셀 간격 → 4x4 = 16홀.
// v1(2셀 간격 · 깊이 0.09, 7x7=49홀)은 1차 검수에서 기각됐다: 정점 하나 함몰이 그 정점을
// 공유하는 4분면 전체를 기울이는데, 홀이 2셀마다 있으면 이웃 홀의 경사면이 서로 맞물려
// 표면 전체가 규칙적인 톱니 누빔으로 뒤덮이고 도킹홀 자체가 안 보였다
// (assets/breads/work/cracker/cmp-1.png, cmp-2.png — 지터를 5배 낮춰도 무늬가 그대로였다,
// 즉 원인은 지터가 아니라 홀 밀도였다). 간격을 넓혀 홀 사이에 진짜 평평한 셀을 남긴다.
const HOLE_INDICES = [2, 6, 10, 14];
const HOLE_DEPTH = 0.05; // 완화된 깊이 — 넓어진 간격 덕에 평평한 배경과 대비만으로도 충분히 읽힌다
const HOLE_PAIRS: Vec2[] = HOLE_INDICES.flatMap((i) => HOLE_INDICES.map((j): Vec2 => [i, j]));
const HOLE_SET = new Set(HOLE_PAIRS.map(([i, j]) => `${i},${j}`));

// 씨앗 스페클 — 도킹홀이 아닌 내부 격자 셀에 융기. 참깨(큼)/양귀비씨(작음) 2등급, 색 구분은 없음
// (단일 재질 — 팀리드 지시: 전면 #D9A552 단색 1머티리얼). 크기만으로 두 종류를 읽는다.
const SEED_CLASSES = [
  { depth: 0.035, share: 0.55 }, // 참깨 — 더 큰 융기
  { depth: 0.018, share: 0.45 }, // 양귀비씨 — 작은 점
] as const;
// v1(34개)은 디버그 격리 렌더에서 원인으로 확정됐다: 체비셰프 거리 1 제약 아래 34개는
// 가용 후보 칸 수 대비 최대 근접포장에 가까워, 셔플로 뽑아도 결과가 사실상 규칙적인
// 십자무늬로 수렴해 표면 전체를 덮었다(assets/breads/work/cracker/shot-top-debug-seeds.png).
// 훨씬 성기게 줄인다 — CRIB: 씨앗 위치는 정체성 결정 요소가 아니라 밀도만 대략 맞으면 된다.
const SEED_COUNT = 14;

// 손으로 자른 거친 모서리 — 테두리 루프에만 적용, 내부 격자는 완전 규칙.
const EDGE_WOBBLE_AMP = 0.02; // 2-lobe sine
const EDGE_NOISE_AMP = 0.014; // per-vertex rng noise
const EDGE_HEIGHT_NOISE = 0.02; // 테두리 y 노이즈 (THICK 대비)
const EDGE_PUSH_SCALE = CELL * 1.5; // 웨이브 진폭 1.0 = 셀 1.5개 폭

// pancake의 0.008은 훨씬 성긴 30분할 폴라 링 기준 — 크래커는 16x16 조밀 격자(셀 0.125)라
// 같은 절대치도 셀 폭 대비 비율이 커서 반복 1차 렌더에서 전체 표면이 규칙적인 톱니 누빔
// 무늬로 뒤덮여 도킹홀·씨앗 패턴을 완전히 집어삼켰다 (assets/breads/work/cracker/cmp-1.png).
// 셀 폭 대비 지터 비율을 pancake과 맞추려면 대략 5배 낮춰야 한다.
const JITTER_AMP = 0.0012;

type Vec2 = readonly [number, number];

/** 테두리 루프를 시계 방향(구현 내부 일관 방향)으로 순회하는 (i, j) 목록. 4N개, 코너 중복 없음. */
function perimeterLoop(n: number): Vec2[] {
  const loop: Vec2[] = [];
  for (let j = 0; j < n; j++) loop.push([0, j]); // 좌변: x=-half 고정, z 증가
  for (let i = 0; i < n; i++) loop.push([i, n]); // 상변: z=+half 고정, x 증가
  for (let j = n; j > 0; j--) loop.push([n, j]); // 우변: x=+half 고정, z 감소
  for (let i = n; i > 0; i--) loop.push([i, 0]); // 하변: z=-half 고정, x 감소
  return loop;
}

/** 경계 (i,j)의 바깥 방향 단위 벡터 (코너는 대각선, 정규화). */
function outwardNormal(i: number, j: number, n: number): Vec2 {
  const nx = i === 0 ? -1 : i === n ? 1 : 0;
  const nz = j === 0 ? -1 : j === n ? 1 : 0;
  if (nx !== 0 && nz !== 0) {
    const inv = 1 / Math.SQRT2;
    return [nx * inv, nz * inv];
  }
  return [nx, nz];
}

/** rng 하나로 결정론적 셔플 (Fisher-Yates). pancake.ts와 동일 패턴. */
function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let k = items.length - 1; k > 0; k--) {
    const m = Math.floor(rng() * (k + 1));
    [items[k], items[m]] = [items[m], items[k]];
  }
  return items;
}

/**
 * 씨앗 셀을 고른다 — 도킹홀 격자·경계·이미 고른 씨앗과 체비셰프 거리 1 이내면 거부.
 * pancake의 pickPoreCells와 동일 구조(등급 쿼터 선확정 + 셔플 후보 순회).
 */
function pickSeedCells(n: number, rng: () => number): { i: number; j: number; depth: number }[] {
  const candidates: Vec2[] = [];
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      if (!HOLE_SET.has(`${i},${j}`)) candidates.push([i, j]);
    }
  }
  shuffle(candidates, rng);
  const quota = SEED_CLASSES.map((c) => Math.max(1, Math.round(SEED_COUNT * c.share)));
  const picked: { i: number; j: number; depth: number }[] = [];
  let ci = 0;
  for (const [i, j] of candidates) {
    while (ci < quota.length && quota[ci] === 0) ci++;
    if (ci >= quota.length || picked.length >= SEED_COUNT) break;
    const tooClose = picked.some((p) => Math.abs(p.i - i) <= 1 && Math.abs(p.j - j) <= 1);
    // 실제 홀 (i,j) 쌍 목록과 대조한다 — 두 축을 따로 "가까운 어떤 홀이든" 식으로 검사하면
    // (예전 버그) 홀 격자가 촘촘할 때 사실상 모든 셀이 거부돼 씨앗이 하나도 안 뽑혔다.
    const tooCloseToHole = HOLE_PAIRS.some(([hi, hj]) => Math.abs(hi - i) <= 1 && Math.abs(hj - j) <= 1);
    if (tooClose || tooCloseToHole) continue;
    picked.push({ i, j, depth: SEED_CLASSES[ci].depth });
    quota[ci]--;
  }
  return picked;
}

/** (i, j) 인덱스 -> 윗면 그리드 정점 인덱스. 격자는 항상 (N+1) x (N+1). */
function gridIndex(i: number, j: number, n: number): number {
  return i * (n + 1) + j;
}

function buildWaferGeometry(rng: () => number): THREE.BufferGeometry {
  const n = N;
  const positions: number[] = new Array((n + 1) * (n + 1) * 3).fill(0);
  const loop = perimeterLoop(n);

  // 경계 웨이브 값을 (i,j) 키로 한 번만 뽑아 위/아래 링이 똑같이 쓰게 한다 — 안 그러면 측벽이 꼬인다.
  const edgePush = new Map<string, number>();
  const edgeHeightNoiseTop = new Map<string, number>();
  const edgeHeightNoiseBottom = new Map<string, number>();
  const phase = rng() * Math.PI * 2;
  for (const [i, j] of loop) {
    const key = `${i},${j}`;
    const x0 = (i / n - 0.5) * 2 * HALF_WIDTH;
    const z0 = (j / n - 0.5) * 2 * HALF_WIDTH;
    const angle = Math.atan2(z0, x0);
    const wave = EDGE_WOBBLE_AMP * Math.sin(2 * angle + phase) + EDGE_NOISE_AMP * (rng() - 0.5) * 2;
    edgePush.set(key, wave);
    edgeHeightNoiseTop.set(key, (rng() - 0.5) * 2 * EDGE_HEIGHT_NOISE * THICK);
    edgeHeightNoiseBottom.set(key, (rng() - 0.5) * 2 * EDGE_HEIGHT_NOISE * THICK);
  }

  // 윗면 격자 — 경계는 웨이브 적용, 내부는 순수 격자 + 홀/씨앗 변위.
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const idx = gridIndex(i, j, n);
      let x = (i / n - 0.5) * 2 * HALF_WIDTH;
      let z = (j / n - 0.5) * 2 * HALF_WIDTH;
      let y = THICK / 2;
      const isBoundary = i === 0 || i === n || j === 0 || j === n;
      if (isBoundary) {
        const key = `${i},${j}`;
        const [nx, nz] = outwardNormal(i, j, n);
        const push = (edgePush.get(key) ?? 0) * EDGE_PUSH_SCALE;
        x += nx * push;
        z += nz * push;
        y += edgeHeightNoiseTop.get(key) ?? 0;
      } else if (HOLE_SET.has(`${i},${j}`)) {
        y -= HOLE_DEPTH;
      }
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
    }
  }
  for (const seed of pickSeedCells(n, rng)) {
    const idx = gridIndex(seed.i, seed.j, n);
    positions[idx * 3 + 1] += seed.depth;
  }

  // 아래 링 — 위 링과 같은 (i,j) 웨이브를 쓰되 독립된 정점(다른 높이의 진짜 별개 정점).
  const bottomRingStart = (n + 1) * (n + 1);
  const bottomCenterIndex = bottomRingStart + loop.length;
  for (let k = 0; k < loop.length; k++) {
    const [i, j] = loop[k];
    const key = `${i},${j}`;
    let x = (i / n - 0.5) * 2 * HALF_WIDTH;
    let z = (j / n - 0.5) * 2 * HALF_WIDTH;
    const [nx, nz] = outwardNormal(i, j, n);
    const push = (edgePush.get(key) ?? 0) * EDGE_PUSH_SCALE;
    x += nx * push;
    z += nz * push;
    const y = -THICK / 2 + (edgeHeightNoiseBottom.get(key) ?? 0);
    positions.push(x, y, z);
  }
  positions.push(0, -THICK / 2, 0); // 바닥 중심점 (팬 밑면)

  // 삼각형 — 와인딩은 scripts/breads/cracker.ts 개발 중 외적으로 직접 검산한 값 (아래 세 블록 주석 참조).
  const index: number[] = [];

  // 윗면: 쿼드(a,b,c,d) = (i,j),(i+1,j),(i,j+1),(i+1,j+1). tri1=[a,c,b], tri2=[c,d,b] -> +Y.
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = gridIndex(i, j, n);
      const b = gridIndex(i + 1, j, n);
      const c = gridIndex(i, j + 1, n);
      const d = gridIndex(i + 1, j + 1, n);
      index.push(a, c, b);
      index.push(c, d, b);
    }
  }
  const topTriangleCount = index.length / 3;

  // 측벽: TR[k]=윗면 경계 정점(공유 인덱스, 찢어짐 방지) / BR[k]=아랫면 링.
  // tri1=[TR[k],BR[k],TR[k+1]], tri2=[TR[k+1],BR[k],BR[k+1]] -> 바깥 방향(외적 손검산).
  for (let k = 0; k < loop.length; k++) {
    const k1 = (k + 1) % loop.length;
    const [i0, j0] = loop[k];
    const [i1, j1] = loop[k1];
    const tr0 = gridIndex(i0, j0, n);
    const tr1 = gridIndex(i1, j1, n);
    const br0 = bottomRingStart + k;
    const br1 = bottomRingStart + k1;
    index.push(tr0, br0, tr1);
    index.push(tr1, br0, br1);
  }
  const sideTriangleCount = index.length / 3 - topTriangleCount;

  // 아랫면 팬: 중심 C에서 각 링 세그먼트로. tri=[C,R[k+1],R[k]] -> -Y (외적 손검산).
  for (let k = 0; k < loop.length; k++) {
    const k1 = (k + 1) % loop.length;
    index.push(bottomCenterIndex, bottomRingStart + k1, bottomRingStart + k);
  }
  const bottomTriangleCount = index.length / 3 - topTriangleCount - sideTriangleCount;
  void topTriangleCount;
  void sideTriangleCount;
  void bottomTriangleCount; // 참고용 — 검수 로그에서 손으로 재확인했다 (704 tri 예산 문서와 일치)

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  // indexed 상태에서 지터 — 윗면·측벽·아랫면이 공유하는 경계 인덱스가 함께 움직인다 (types.ts §3)
  jitterVertices(geometry, rng, JITTER_AMP);
  return geometry;
}

export const createCracker: BreadBuilder = (rng) => {
  const group = new THREE.Group();
  const material = stdMaterial({ color: TOP_COLOR });

  const geometry = buildWaferGeometry(rng);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  const mesh = new THREE.Mesh(baked, material);
  group.add(mesh);

  return mergeByMaterial(group);
};
