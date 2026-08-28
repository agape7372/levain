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
import { buildRevolvedShell, facet, mergeByMaterial, sliceTriangles, stdMaterial, uvDome } from '../breads/lib';

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

/** 주름 전용 추가 감쇠 — 크라운(h 0.60~0.90)에서 0으로 죽인다.
 * ★v4.2: r2에서도 크라운에 **소용돌이 주름**이 남았다. 원인은 골(cos 2θ)이 아니라 주름 필드다:
 * 위상에 hFrac이 섞여 있어(사행 목적) 극점으로 갈수록 5·9주기 마루가 회전하면서 수렴한다 —
 * 반지름이 0으로 줄어드는 링에서 그 회전이 소용돌이로 보인다.
 * 크라운에서 주름만 끄면 남는 변조는 **매끈한 2주기 골뿐**이라 안장(saddle)으로 깔끔하게 닫힌다.
 * 실제 호두도 접힘은 옆구리에 몰려 있고 두 엽의 꼭대기는 매끈하다 — 레퍼런스와도 맞다. */
function wrinkleFalloff(hFrac: number): number {
  return 1 - smoothstep(0.6, 0.9, hFrac);
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

/**
 * 링별로 진폭을 조절하는 지터. lib.jitterVertices와 rng 소비 순서(정점당 3회)가 같다.
 * ★v4.2: 크라운의 **소용돌이/별 주름**의 진짜 원인이 여기였다. types.ts R2가 경고하는
 * "지터 진폭 > 극 근처 링의 컬럼 간격" 조건을 이 재료가 정확히 밟고 있었다:
 * 40세그먼트에서 rFrac 0.30 링의 컬럼 간격은 2π·(0.30·0.52)/40 ≈ 0.024인데 진폭이 0.012라
 * 이웃 정점끼리 자리를 넘나들 만큼 흔들렸다. 몸통에서는 같은 진폭이 페이셋 결로 잘 보인다 —
 * **한 값으로 통일할 수 없는 문제**라 링 반지름에 비례해 상한을 건다(간격의 35%).
 * 극점(반지름 0)은 팬 40장의 공유 꼭짓점이라 아예 제외한다(poppyseed의 jitterExceptPoles 선례).
 * rng는 극점에서도 소비해 시드 스트림을 단순하게 유지한다.
 */
function jitterTapered(geometry: THREE.BufferGeometry, ringStart: readonly number[], rng: () => number): void {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const ampByVertex = new Float64Array(pos.count);
  for (let ri = 0; ri < PROFILE.length; ri++) {
    const rFrac = PROFILE[ri][0];
    if (rFrac <= 1e-6) continue; // 극점 — amp 0으로 남긴다
    const meanRadius = rFrac * 0.5 * (RADIUS_X + RADIUS_Z);
    const columnSpacing = (2 * Math.PI * meanRadius) / SEGMENTS;
    const amp = Math.min(JITTER_AMP, 0.35 * columnSpacing);
    for (let s = 0; s < SEGMENTS; s++) ampByVertex[ringStart[ri] + s] = amp;
  }
  for (let i = 0; i < pos.count; i++) {
    const amp = ampByVertex[i];
    pos.setXYZ(
      i,
      pos.getX(i) + (rng() - 0.5) * 2 * amp,
      pos.getY(i) + (rng() - 0.5) * 2 * amp,
      pos.getZ(i) + (rng() - 0.5) * 2 * amp,
    );
  }
  pos.needsUpdate = true;
}

function buildWalnut(rng: () => number): { kernelGeo: THREE.BufferGeometry; rimGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, SEGMENTS, HEIGHT_SCALE, () => [RADIUS_X, RADIUS_Z]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  for (let ri = DOME_FIRST_RING; ri < PROFILE.length; ri++) {
    const rFrac = PROFILE[ri][0];
    const hFrac = PROFILE[ri][1];
    if (rFrac <= 1e-6) continue;
    const weight = reliefWeight(hFrac, rFrac);
    if (weight <= 0) continue;
    const wrinkleWeight = weight * wrinkleFalloff(hFrac);
    const base = ringStart[ri];
    for (let s = 0; s < SEGMENTS; s++) {
      const t = (s / SEGMENTS) * Math.PI * 2;
      const c2t = Math.cos(2 * t);
      const wr = wrinkleField(t, hFrac);
      const idx = base + s;
      const radialScale = 1 + c2t * GROOVE_RADIAL_AMP * weight + wr * WRINKLE_RADIAL_AMP * wrinkleWeight;
      pos.setX(idx, pos.getX(idx) * radialScale);
      pos.setZ(idx, pos.getZ(idx) * radialScale);
      pos.setY(idx, pos.getY(idx) + c2t * GROOVE_AMP * weight + wr * WRINKLE_Y_AMP * wrinkleWeight);
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
