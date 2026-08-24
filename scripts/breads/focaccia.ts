// 포카치아 — 직사각 슬랩, 손가락 딤플(오목+오일 재질) + 토핑(볼록, 크러스트 재질 공유).
// 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 `assets/breads/specs/focaccia.json`(워크스페이스 원본은
// assets/breads/work/focaccia/). 수치·색은 그 스펙의 전사이며, 스펙 자체는
// assets/prompts/breads/focaccia.json geometry의 전사다.
//
// 크래커의 box+grid 슬랩(윗면 그리드+측벽+밑면 팬, cracker.ts)을 정사각→직사각으로 확장하고,
// 두 가지를 더한다:
//   1. 딤플 = 격자 셀 함몰 + "닿는 쿼드"를 oil 재질 버킷으로 분류(flatbread.ts의 char 버킷과
//      동형) — 크래커는 단색이라 버킷이 필요 없었지만 포카치아는 딤플 안쪽 색이 달라야 한다.
//   2. 딤플은 무작위 스캐터가 아니라 크래커 도킹홀처럼 "고정 격자 좌표"로 심는다 — 레퍼런스가
//      실제로 5x4 격자에 가깝게 규칙적이고, flatbread의 교훈(정점 하나 = 쿼드 최대 4개·삼각형
//      최대 8개를 물들인다)을 감안해 간격을 넉넉히 둬야 웅덩이로 뭉치지 않는다.
//   3. 토핑(올리브·로즈마리·소금)은 types.ts §1의 메시당 재질 ≤2 제약 때문에 딤플의 oil
//      재질에 자리를 내주고 크러스트 재질을 공유한다 — 색 구분 없이 융기 실루엣만으로 존재를
//      알린다(팀리드 지시: "토핑 3D 돌기가 필요하면 크러스트와 같은 재질로").
import * as THREE from 'three';
import type { BreadBuilder } from './types';
import { facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvTopPlanar } from './lib';

// 팔레트 — assets/prompts/breads/focaccia.json geometry.crust 손 전사 (types.ts §8)
const TOP_COLOR = 0xd9a552;
const OIL_COLOR = 0xb8813c;

const HALF_X = 1.0;
const HALF_Z = 0.65; // 정사각이 아니라 직사각 — 크래커와의 차이
const THICK = 0.28; // "낮고 균일한 높이" — 크래커보다 두꺼운 슬랩 비율
const NX = 16;
const NZ = 12;
const CELL_X = (2 * HALF_X) / NX;
const CELL_Z = (2 * HALF_Z) / NZ;

// 딤플 — 크래커 도킹홀과 같은 "고정 격자 좌표" 방식(무작위 스캐터 아님). 5열x4행=20개.
// flatbread 교훈(정점 하나 = 쿼드 최대 4개 = 삼각형 최대 8개를 물들인다)을 감안해 간격을
// 넉넉히 둬 인접 딤플의 oil 버킷이 서로 붙어 웅덩이가 되지 않게 한다.
const DIMPLE_X = [2, 5, 8, 11, 14];
const DIMPLE_Z = [2, 5, 7, 10];
const DIMPLE_DEPTH = 0.05;
const DIMPLE_PAIRS: Vec2[] = DIMPLE_X.flatMap((i) => DIMPLE_Z.map((j): Vec2 => [i, j]));
const DIMPLE_SET = new Set(DIMPLE_PAIRS.map(([i, j]) => `${i},${j}`));

// 토핑 — 딤플이 아닌 내부 격자 셀에 융기. 색 구분 없음(위 주석 참조), 크기만으로 존재를 알린다.
const TOPPING_COUNT = 22;
const TOPPING_BUMP = 0.03;

const EDGE_ROUND_AMP = 0.03;
const EDGE_NOISE_AMP = 0.02;
const JITTER_AMP = 0.0015; // 크래커 v1(0.006)이 조밀한 그리드에서 톱니 누빔을 만든 교훈 — 처음부터 낮게

type Vec2 = readonly [number, number];

/** 테두리 루프 — 직사각형이라 각 변의 분할 수가 다르다(크래커는 정사각이라 동일했다). */
function perimeterLoop(): Vec2[] {
  const loop: Vec2[] = [];
  for (let j = 0; j < NZ; j++) loop.push([0, j]);
  for (let i = 0; i < NX; i++) loop.push([i, NZ]);
  for (let j = NZ; j > 0; j--) loop.push([NX, j]);
  for (let i = NX; i > 0; i--) loop.push([i, 0]);
  return loop;
}

function outwardNormal(i: number, j: number): Vec2 {
  const nx = i === 0 ? -1 : i === NX ? 1 : 0;
  const nz = j === 0 ? -1 : j === NZ ? 1 : 0;
  if (nx !== 0 && nz !== 0) {
    const inv = 1 / Math.SQRT2;
    return [nx * inv, nz * inv];
  }
  return [nx, nz];
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let k = items.length - 1; k > 0; k--) {
    const m = Math.floor(rng() * (k + 1));
    [items[k], items[m]] = [items[m], items[k]];
  }
  return items;
}

/** 딤플이 아닌 내부 셀 중 토핑 자리를 고른다 — 크래커의 pickSeedCells와 동일 구조. */
function pickToppingCells(rng: () => number): Vec2[] {
  const candidates: Vec2[] = [];
  for (let i = 1; i < NX; i++) {
    for (let j = 1; j < NZ; j++) {
      if (!DIMPLE_SET.has(`${i},${j}`)) candidates.push([i, j]);
    }
  }
  shuffle(candidates, rng);
  const picked: Vec2[] = [];
  for (const [i, j] of candidates) {
    if (picked.length >= TOPPING_COUNT) break;
    const tooClose = picked.some(([pi, pj]) => Math.abs(pi - i) <= 1 && Math.abs(pj - j) <= 1);
    // 딤플 자신의 정확한 셀만 제외한다(이웃 반경 1 제외 아님). DIMPLE_X 간격이 3인데 허용오차
    // ±1짜리 이웃 제외를 쓰면 3칸짜리 띠가 서로 빈틈없이 맞닿아(간격=띠 폭) 내부 후보 전체가
    // 거부됐다 — pair 기반으로 고쳐도(위 커밋 이력) 완전 격자 곱집합에서는 축별 독립 검사와
    // 수학적으로 동치라 소용없었다(assets/breads/work/focaccia/shot-top-2.png, 0개 픽업 재현:
    // assets/breads/work/focaccia/debug-topping.mjs). 실제 문제는 반경이지 pair 여부가 아니었다.
    const tooCloseToDimple = DIMPLE_SET.has(`${i},${j}`);
    if (tooClose || tooCloseToDimple) continue;
    picked.push([i, j]);
  }
  return picked;
}

function gridIndex(i: number, j: number): number {
  return i * (NZ + 1) + j;
}

function buildSlabGeometry(rng: () => number): { oilCount: number; geometry: THREE.BufferGeometry } {
  const positions: number[] = new Array((NX + 1) * (NZ + 1) * 3).fill(0);
  const loop = perimeterLoop();

  const edgePush = new Map<string, number>();
  const edgeHeightNoiseTop = new Map<string, number>();
  const edgeHeightNoiseBottom = new Map<string, number>();
  const phase = rng() * Math.PI * 2;
  for (const [i, j] of loop) {
    const key = `${i},${j}`;
    const x0 = (i / NX - 0.5) * 2 * HALF_X;
    const z0 = (j / NZ - 0.5) * 2 * HALF_Z;
    const angle = Math.atan2(z0, x0);
    const wave = EDGE_ROUND_AMP * Math.sin(2 * angle + phase) + EDGE_NOISE_AMP * (rng() - 0.5) * 2;
    edgePush.set(key, wave);
    edgeHeightNoiseTop.set(key, (rng() - 0.5) * 2 * 0.02 * THICK);
    edgeHeightNoiseBottom.set(key, (rng() - 0.5) * 2 * 0.02 * THICK);
  }

  for (let i = 0; i <= NX; i++) {
    for (let j = 0; j <= NZ; j++) {
      const idx = gridIndex(i, j);
      let x = (i / NX - 0.5) * 2 * HALF_X;
      let z = (j / NZ - 0.5) * 2 * HALF_Z;
      let y = THICK / 2;
      const isBoundary = i === 0 || i === NX || j === 0 || j === NZ;
      if (isBoundary) {
        const key = `${i},${j}`;
        const [nx, nz] = outwardNormal(i, j);
        const push = edgePush.get(key) ?? 0;
        x += nx * push;
        z += nz * push;
        y += edgeHeightNoiseTop.get(key) ?? 0;
      } else if (DIMPLE_SET.has(`${i},${j}`)) {
        y -= DIMPLE_DEPTH;
      }
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
    }
  }
  for (const [i, j] of pickToppingCells(rng)) {
    const idx = gridIndex(i, j);
    positions[idx * 3 + 1] += TOPPING_BUMP;
  }

  const bottomRingStart = (NX + 1) * (NZ + 1);
  const bottomCenterIndex = bottomRingStart + loop.length;
  for (let k = 0; k < loop.length; k++) {
    const [i, j] = loop[k];
    const key = `${i},${j}`;
    let x = (i / NX - 0.5) * 2 * HALF_X;
    let z = (j / NZ - 0.5) * 2 * HALF_Z;
    const [nx, nz] = outwardNormal(i, j);
    const push = edgePush.get(key) ?? 0;
    x += nx * push;
    z += nz * push;
    const y = -THICK / 2 + (edgeHeightNoiseBottom.get(key) ?? 0);
    positions.push(x, y, z);
  }
  positions.push(0, -THICK / 2, 0);

  // 삼각형 — oil 먼저·crust 나중으로 순서를 통제한다(flatbread의 char/base 버킷과 동형).
  const oilIndex: number[] = [];
  const crustIndex: number[] = [];
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const a = gridIndex(i, j);
      const b = gridIndex(i + 1, j);
      const c = gridIndex(i, j + 1);
      const d = gridIndex(i + 1, j + 1);
      const touchesDimple = DIMPLE_SET.has(`${i},${j}`) || DIMPLE_SET.has(`${i + 1},${j}`) || DIMPLE_SET.has(`${i},${j + 1}`) || DIMPLE_SET.has(`${i + 1},${j + 1}`);
      const bucket = touchesDimple ? oilIndex : crustIndex;
      bucket.push(a, c, b);
      bucket.push(c, d, b);
    }
  }
  for (let k = 0; k < loop.length; k++) {
    const k1 = (k + 1) % loop.length;
    const [i0, j0] = loop[k];
    const [i1, j1] = loop[k1];
    const tr0 = gridIndex(i0, j0);
    const tr1 = gridIndex(i1, j1);
    const br0 = bottomRingStart + k;
    const br1 = bottomRingStart + k1;
    crustIndex.push(tr0, br0, tr1);
    crustIndex.push(tr1, br0, br1);
  }
  for (let k = 0; k < loop.length; k++) {
    const k1 = (k + 1) % loop.length;
    crustIndex.push(bottomCenterIndex, bottomRingStart + k1, bottomRingStart + k);
  }

  const index = [...oilIndex, ...crustIndex];
  const oilCount = oilIndex.length / 3;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  jitterVertices(geometry, rng, JITTER_AMP);
  return { oilCount, geometry };
}

export const createFocaccia: BreadBuilder = (rng) => {
  const group = new THREE.Group();
  const crustMat = stdMaterial({ color: TOP_COLOR });
  const oilMat = stdMaterial({ color: OIL_COLOR });

  const { oilCount, geometry } = buildSlabGeometry(rng);
  const baked = facet(geometry);
  const total = baked.attributes.position.count / 3;
  const parts: [THREE.BufferGeometry, THREE.Material][] = [
    [sliceTriangles(baked, 0, oilCount), oilMat],
    [sliceTriangles(baked, oilCount, total), crustMat],
  ];
  for (const [geo, mat] of parts) {
    uvTopPlanar(geo);
    group.add(new THREE.Mesh(geo, mat));
  }

  return mergeByMaterial(group);
};
