// 호두 — 단일 회전체 셸(반쪽 알맹이, 두 엽 + 중앙 골). 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/walnut.json(워크스페이스 원본은
// assets/ingredients/work/walnut/). 프로필·오프셋·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
// ⚠ v3 이후 개편은 **레포 코드만** 고쳤다 — 스펙 파일은 이 작업의 쓰기 범위 밖이라
// "스펙 먼저"를 못 지켰다. 지금은 이 파일이 실측 정본이다.
//
// R1(types.ts) 단일체 정본 순서: 한 덩어리 indexed 타원 셸(lib.buildRevolvedShell, 반경만 타원)
// -> 안쪽 돔에 cos(2*theta) 두 엽+골 + 뇌주름 -> jitterVertices -> facet -> 밑단 팬+챔퍼를
// 림 버킷으로 분리(sliceTriangles). 호두는 방사대칭이 아니라 골 축(로컬 Z) 양측대칭.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvDome } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/walnut.json geometry.surface 손 전사 (JSON import 금지, types.ts §7).
// "#9A6E42"(원문: 골 안쪽)은 **자른면** 색으로 재배치 — 골은 N·L 감쇠가 이미 어둡게 만든다.
// "#E0C79A" 능선 하이라이트는 볼록한 엽이 키라이트를 더 받으므로 버킷을 안 만든다.
const KERNEL_COLOR = 0xc89b6a; // "a warm tan kernel"
const RIM_COLOR = 0x9a6e42; // 원문 "deeper amber ... folds and grooves" -> 자른면으로 재배치

// 실측 비율 (assets/ingredients/src/walnut.png 3/4 · walnut-2.png 정면 · walnut-3.png 탑다운).
//
// ★v3 (2026-08-26): 골만으로는 그 축을 옆에서 볼 때 신호가 0. 방위 주기 주름을 돔에 얹음.
const SEGMENTS = 40;
const RADIUS_X = 0.44; // 짧은 축 (엽 분리 방향)
const RADIUS_Z = 0.6; // 긴 축 (골 방향), 비율 ~1.36:1 (walnut-3.png 탑다운)
// walnut-2.png: 높이가 긴 축 폭의 ~0.45배. 안쪽 로브 Y가 더해져도 봉긋한 무더기가 안 되게.
const HEIGHT_SCALE = 0.6;

type ProfilePoint = readonly [number, number];
// ★v4 모자 챙 제거.
// a5 림 선반 = az 90/270 챙. 바깥 실루엣에 로브/주름 반지름을 걸면 az 0 포춘쿠키·az 90 원뿔.
// 안쪽만 변조하되 분지를 너무 파면 팬케이크+크레이터가 된다(iter3 실측). 바깥은 중간이 넓은
// 돔, 안쪽은 얕은 두 엽+골. 크라운은 인접 로브 피크보다 낮고 바깥 림보다는 크게 안 내려간다.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, 0.0], // 바닥 중심 극점
  [0.72, 0.0], // 밑단 테두리 — 배보다 좁다
  [0.86, 0.12], // 자른면 모서리 — 짧은 챔퍼 (RIM_TRANSITIONS)
  [0.96, 0.3],
  [1.0, 0.48], // 배 — 높이 중간
  [0.95, 0.62],
  [0.84, 0.74], // 위를 넓게 — 옆에서 원뿔이 되지 않게
  [0.68, 0.82],
  [0.48, 0.86],
  [0.28, 0.86],
  [0.12, 0.82],
  [0.0, 0.7], // 크라운 — 로브 피크보다 낮게, 크레이터만큼은 내리지 않음
];
const RIM_TRANSITIONS = 2;
const DOME_FIRST_RING = 3;

// 두 엽 + 골 — 안쪽 윗면에만. 바깥 rFrac 변조는 챙/포춘쿠키. 되돌리지 마라.
const GROOVE_AMP = 0.13; // 안쪽 Y. 두 엽이 윗면에서 읽히게
const GROOVE_RADIAL_AMP = 0.14; // 안쪽만. 타원 유지: 0.44*1.14 < 0.6*0.86

const WRINKLE_RADIAL_AMP = 0.05;
const WRINKLE_Y_AMP = 0.09;

const JITTER_AMP = 0.01; // 40세그 — 극점 인접 컬럼 간격을 넘지 않게

/** 안쪽 윗면만 1. 바깥 실루엣(rFrac 큼)과 자른면(h 낮음)은 0. */
function reliefWeight(hFrac: number, rFrac: number): number {
  const hUp = smoothstep(0.26, 0.46, hFrac);
  const hDown = 1 - 0.3 * smoothstep(0.78, 0.88, hFrac);
  const inward = 1 - smoothstep(0.62, 0.88, rFrac);
  return hUp * hDown * inward;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function wrinkleField(theta: number, hFrac: number): number {
  const a = Math.cos(5 * theta + 3.0 * hFrac);
  const b = Math.cos(9 * theta - 4.6 * hFrac + 1.1);
  const w = (a + 0.5 * b) / 1.5;
  return Math.sign(w) * Math.pow(Math.abs(w), 0.6);
}

// 요 — 레퍼런스(walnut.png)는 골이 대각선. az 0/180이 두 엽을 보게 구워 둔다. 바꾸지 마라.
const YAW_RADIANS = (-32 * Math.PI) / 180;

function buildWalnut(rng: () => number): { kernelGeo: THREE.BufferGeometry; rimGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, SEGMENTS, HEIGHT_SCALE, () => [RADIUS_X, RADIUS_Z]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  for (let ri = DOME_FIRST_RING; ri < PROFILE.length; ri++) {
    const rFrac = PROFILE[ri][0];
    const hFrac = PROFILE[ri][1];
    if (rFrac <= 1e-6) continue;
    const weight = reliefWeight(hFrac, rFrac);
    if (weight <= 0) continue;
    const base = ringStart[ri];
    for (let s = 0; s < SEGMENTS; s++) {
      const t = (s / SEGMENTS) * Math.PI * 2;
      const c2t = Math.cos(2 * t);
      const wr = wrinkleField(t, hFrac);
      const idx = base + s;
      const radialScale = 1 + (c2t * GROOVE_RADIAL_AMP + wr * WRINKLE_RADIAL_AMP) * weight;
      pos.setX(idx, pos.getX(idx) * radialScale);
      pos.setZ(idx, pos.getZ(idx) * radialScale);
      pos.setY(idx, pos.getY(idx) + (c2t * GROOVE_AMP + wr * WRINKLE_Y_AMP) * weight);
    }
  }

  jitterVertices(geometry, rng, JITTER_AMP);
  geometry.rotateY(YAW_RADIANS);

  const rimTriangles = SEGMENTS * (1 + 2 * (RIM_TRANSITIONS - 1));
  const baked = facet(geometry);

  const rimGeo = sliceTriangles(baked, 0, rimTriangles);
  const kernelGeo = sliceTriangles(baked, rimTriangles, baked.attributes.position.count / 3);
  uvDome(kernelGeo);
  uvDome(rimGeo);
  return { kernelGeo, rimGeo };
}

export const createWalnut: IngredientBuilder = (rng) => {
  const kernelMat = stdMaterial({ color: KERNEL_COLOR });
  const rimMat = stdMaterial({ color: RIM_COLOR });

  const { kernelGeo, rimGeo } = buildWalnut(rng);

  const group = new THREE.Group();
  group.add(new THREE.Mesh(kernelGeo, kernelMat));
  group.add(new THREE.Mesh(rimGeo, rimMat));

  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
  group.updateMatrixWorld(true);

  return mergeByMaterial(group);
};
