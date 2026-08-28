// 아마씨 — 납작한 눈물방울 씨앗이 비늘처럼 겹쳐 쌓인 더미 + 앞쪽에 분리된 낱알 3개.
// 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/flaxseed.json(워크스페이스 원본은
// assets/ingredients/work/flaxseed/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
// ⚠ v3의 수치는 스펙 JSON에 아직 역전사되지 않았다 — 이 배치의 파일 권한이 `scripts/ingredients/*.ts`
//   뿐이었다. 다음에 스펙을 만질 사람은 v3 상수를 스펙으로 올려라.
//
// 낱알 형태 = cranberry.ts의 FLATTEN_X 눕히기 공식(반지름축 하나를 짓눌러 두께를 낸다) +
// 한쪽 끝만 뾰족한 비대칭 테이퍼 프로필.
//
// ═══ v4 (2026-08-27, 쇼케이스 재감사 파손 수정) ═══
//
// v3는 64px·히어로 각도만 고치고 **턴테이블 중간각**을 안 봤다. 재감사 az≈195~225에서
// 파손 판정: 더미가 정구형이라 트러플·솔방울로 읽히고, 뒤쪽 납작 낱알이 스침각에서
// **단검·날개·곰 귀**가 된다(같은 메커니즘의 poppyseed는 구체라 "뜬 구슬"=약함으로 끝난다).
// az=0·150·270 실루엣의 지느러미 슬리버도 같은 원인 — 적도 너머 비늘이 수직으로 선다.
//
// 처방(핸드오프 확정, 되돌리지 마라):
//   (1) 채움 돔 높이:폭 ≈1:1 (R=0.50 / 반높이 0.30) → **반높이를 내려 낮고 넓은 둔덕**.
//       레퍼런스는 넓고 납작한 비늘 더미지 공이 아니다.
//   (2) 비늘이 **뒤로 안 돌게** — phi를 적도 아래로 보내지 않고, 표면 기울기를 낮게 캡한다.
//       납작 씨앗이 법선을 따라 수직이 되면 그 순간 종잇장이다.
//   (3) **앞알 3개를 지우지 마라.** 정체 단서다. 고치는 축은 더미 실루엣이다.
//
// ★v4.1 실패: 채움만 낮추고 구면 phi 배치를 유지하면 비늘이 극점에 몰려 **쿠키 위 아몬드**가
// 된다. 채움이 실루엣을 그리면 안 된다. v4.2는 비늘을 XZ 원반에 깔고 채움은 구멍 막개로 축소.
//
// ═══ v3 (2026-08-26, 전체 화면 쇼케이스 파손 수정) ═══
//
// v2는 64px 썸네일 판독만 보고 통과시켰고 전체 화면에서 셋 다 무너져 있었다:
//   · 낱알의 정체성인 **납작한 눈물방울이 전혀 안 읽힌다**(짧고 두꺼워 통통한 알맹이였다).
//   · 부감에서 하이라이트가 **윗면 전체**를 덮어 군밤 3개로 보인다.
//   · az225에서 매끈한 돔 더미 + 뒤로 넘어간 낱알 2개가 **곰 머리 실루엣**이 된다.
//
// ★레퍼런스(assets/ingredients/src/flaxseed.png)를 다시 보면 답이 세 개 다 들어 있다:
//   ① 낱알은 길이:폭:두께가 대략 7:4:1인 **얇은 판**이다. v2는 3.1:2:1이었다 — 그래서 알맹이였다.
//   ② 밝은 색은 윗면 패치가 아니라 **테두리를 따라 도는 얇은 림**이다. 그래서 하이라이트 버킷의
//      역할을 "flat top facet"에서 **"honey-tan rim tracing the seed's edge"**로 옮겼다
//      (둘 다 스펙 surface[0]에 있는 문구다). 림은 윤곽선처럼 읽혀 형태를 또렷하게 만든다.
//   ③ 더미는 매끈한 돔이 아니라 **낱알이 비늘처럼 겹쳐 쌓인 무더기**다. 돔을 낱알 10장으로
//      바꾸면 실루엣이 톱니가 되어 어느 각도에서도 곰 머리가 될 수 없다. 낱알 사이로 배경이
//      비치는 것(=뚫린 구멍, 파손 판정 항목)만 안쪽 **채움 돔**으로 막는다.
//
// 세그먼트도 올렸다(10 → 20/12). 전체 화면에서 재료는 빵과 같은 크기로 확대돼 보인다.
// ⚠ 되돌리지 말 것: 낱알을 두껍게 하면 ①이, 하이라이트를 윗면으로 옮기면 ②가,
//   더미를 단일 돔으로 되돌리면 ③이 그대로 돌아온다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, pickTriangles, splitTrianglesByVertexMask, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/flaxseed.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0x58381a; // "a dark chocolate-brown body" — 더미 + 낱알 넓적면
const RIM_COLOR = 0xa8794a; // "a warm amber highlight" ~ "a lighter honey-tan rim tracing the seed's edge"
// 두 문구가 같은 버킷을 쓴다 — v3에서 이 버킷은 **테두리**를 맡는다(윗면 패치는 군밤이 됐다).
// 드롭: 뾰족한 끝에 고이는 그늘 #3E2611(N·L 감쇠가 공짜로 어둡게 함)과 꿀색 림 #C79A5C(위와 중복).

type ProfilePoint = readonly [number, number];

// ── 낱알 ─────────────────────────────────────────────────────────────────────
// 프로필은 회전축 = 씨앗의 **길이**축이다(눕히기 전). hFrac=-1이 뾰족한 끝, +1이 둥근 끝.
// 최대 폭이 +0.52 쪽에 있어 뾰족한 끝까지 길게 테이퍼진다 = 눈물방울.
const FRONT_SEGMENTS = 16; // 4의 배수여야 림 섹터(segments/4)가 정수로 떨어진다.
// 세그먼트는 **두께 단면**의 해상도라 납작한 씨앗에선 값이 적다 — 위에서 본 윤곽은 프로필이 그린다.
// 그래서 20 → 16으로 낮추고 그 예산을 더미 비늘 개수로 옮겼다(비늘이 파손의 주원인이었다).
const FRONT_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.3, -0.66],
  [0.66, -0.22],
  [0.94, 0.22],
  [1.0, 0.52],
  [0.86, 0.76],
  [0.5, 0.93],
  [0.0, 1.0],
];
// v3.1: 0.50/0.26은 더미를 압도해서(리핏이 최장축을 1.6에 맞추니 더미가 쪼그라들었다) 앞알끼리도
// 교차했다. 0.42/0.22로 줄이고 배치는 v2의 검증된 오프셋으로 되돌렸다.
const FRONT_HALF_LENGTH = 0.42;
const FRONT_RADIUS = 0.22;
// 더미 구성 낱알(비늘) — 서로 겹쳐서 가려지므로 격자를 낮춘다. 납작한 씨앗이라 세그먼트가 적어도
// 각져 보이지 않는다: 위에서 본 윤곽은 섹터가 아니라 **프로필**이 그린다(넓은 축 최대점이 한 열).
const SHINGLE_SEGMENTS = 6;
const SHINGLE_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.36, -0.58],
  [0.76, -0.06],
  [1.0, 0.48],
  [0.86, 0.78],
  [0.48, 0.94],
  [0.0, 1.0],
];
const SHINGLE_HALF_LENGTH = 0.245;
const SHINGLE_RADIUS = 0.15;

const FLATTEN_X = 0.26; // radialScale sx — 눕힌 뒤 두께(new Y)가 되는 축.
// 앞알 실측 비율: 길이 1.00 : 폭 0.52 : 두께 0.135 ≈ 7.4 : 3.9 : 1 (레퍼런스 ①).
const SEED_JITTER_AMP = 0.008; // 얇은 파트라 R4 적용(빵 크러스트 진폭 금지)

/**
 * 림 마스크 — 눕힌 뒤 **윤곽선**이 되는 섹터 열.
 * 눕히기 전 좌표: x = cos t·rFrac·(R·FLATTEN_X)[얇은 축] · z = sin t·rFrac·R[넓은 축].
 * rotateZ(-90°) 뒤 new_y = -old_x(두께) · new_z = old_z(폭). 따라서 |폭| 최대 = t=90°,270°
 * = 섹터 segments/4, 3·segments/4 가 **테두리**다. 거기서 윗면(t=180°=섹터 segments/2) 쪽으로
 * 한 칸씩 더 먹여 "위에서 봤을 때 보이는 베벨 띠"로 만든다 — 부감 카메라에서 윤곽선처럼 읽힌다.
 * ⚠ v2처럼 윗면 섹터를 통째로 칠하면 낱알이 밝은 덩어리가 되어 군밤이 된다.
 */
function rimSectors(segments: number, widen: boolean): number[] {
  const q = segments / 4;
  const out = [q, 3 * q];
  if (widen) out.push(q + 1, 3 * q - 1); // 윗면 쪽으로 한 칸 (q → segments/2 방향)
  return out;
}

function buildSeed(
  rng: () => number,
  profile: readonly ProfilePoint[],
  segments: number,
  halfLength: number,
  radius: number,
  widenRim: boolean,
): { bodyGeo: THREE.BufferGeometry; rimGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(profile, segments, halfLength, () => [radius * FLATTEN_X, radius]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  const mask = new Uint8Array(pos.count);
  const sectors = rimSectors(segments, widenRim);
  for (let ri = 0; ri < profile.length; ri++) {
    if (profile[ri][0] <= 1e-6) continue; // 극점은 뾰족한 끝 — 림에서 제외(끝이 통째로 밝아진다)
    for (const s of sectors) mask[ringStart[ri] + ((s + segments) % segments)] = 1;
  }

  // 눕히기: rotateZ(-90deg) => new_x = old_y(길이), new_y = -old_x(두께, FLATTEN_X 적용축).
  geometry.rotateZ(-Math.PI / 2);
  jitterVertices(geometry, rng, SEED_JITTER_AMP);

  const originalIndex = (geometry.index as THREE.BufferAttribute).array as ArrayLike<number>;
  const baked = facet(geometry);
  const { trueTris, falseTris } = splitTrianglesByVertexMask(originalIndex, mask);

  const rimGeo = pickTriangles(baked, trueTris);
  const bodyGeo = pickTriangles(baked, falseTris);
  uvTopPlanar(rimGeo);
  uvTopPlanar(bodyGeo);
  return { bodyGeo, rimGeo };
}

// ── 채움 ─────────────────────────────────────────────────────────────────────
// 비늘 **안쪽** 구멍 막개. 실루엣을 이 메시가 그리면 쿠키·공·도넛이 된다(v4.1 실측).
// 더미 외곽은 비늘 낱알의 합집합이고, 채움은 그보다 한 단 작다.
const FILL_SEGMENTS = 12;
const FILL_RADIUS = 0.34;
const FILL_HALF_HEIGHT = 0.11;
const FILL_JITTER_AMP = 0.008;
const FILL_PROFILE: readonly ProfilePoint[] = [
  [0.7, -1.0],
  [1.0, -0.2],
  [0.9, 0.4],
  [0.5, 0.82],
  [0.0, 1.0],
];

function buildFill(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(FILL_PROFILE, FILL_SEGMENTS, FILL_HALF_HEIGHT, () => [FILL_RADIUS, FILL_RADIUS]);
  jitterVertices(geometry, rng, FILL_JITTER_AMP);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

// ── 배치 ─────────────────────────────────────────────────────────────────────
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

// ★v4.2: 구면 phi 배치는 둔덕을 낮추는 순간 비늘이 극점에 몰려 "쿠키 위 토핑"이 됐다.
// 해법 = XZ 원반에 황금각으로 깔고, 높이는 포물선 둔덕. 씨앗은 거의 수평(비늘) —
// 법선을 따라 세우지 않는다. 뒤쪽 적도로 안 넘어가므로 칼날·귀가 원리적으로 안 생긴다.
const HEAP_RADIUS = 0.56;
const HEAP_HEIGHT = 0.2;
const MAX_SHINGLE_TILT = 0.28; // ≈16°. 그 이상이면 가장자리가 종잇장 // ≈16°. 그 이상이면 가장자리가 종잇장
const GOLDEN_ANGLE = 2.39996;

function heapY(r: number): number {
  const t = Math.min(1, r / HEAP_RADIUS);
  return HEAP_HEIGHT * (1 - t * t);
}
function heapTilt(r: number): number {
  return Math.min(MAX_SHINGLE_TILT, 0.55 * (r / HEAP_RADIUS));
}

/**
 * 원반 둔덕 배치 — 방위(Y) → 반경·높이 이동 → 약한 기울기(X, 바깥이 낮아짐) → 자전·lean.
 * 한 Object3D에 오일러 3축을 한꺼번에 주면 적용 순서(THREE 기본 'XYZ')에 걸려 의도와 달라진다.
 */
function shingleOnHeap(child: THREE.Object3D, psi: number, r: number, y: number, spin: number, lean: number): THREE.Group {
  const azimuth = new THREE.Group();
  azimuth.rotation.y = psi;
  const placer = new THREE.Group();
  placer.position.set(0, y, r);
  placer.rotation.x = heapTilt(r);
  const spinner = new THREE.Group();
  spinner.rotation.y = spin;
  const leaner = new THREE.Group();
  leaner.rotation.x = lean;
  leaner.add(child);
  spinner.add(leaner);
  placer.add(spinner);
  azimuth.add(placer);
  return azimuth;
}

// 하층 16 + 상층 8. 상층이 한가운데를 덮어 포물선 꼭대기의 구멍·매끈 채움을 가린다.
const SHINGLE_LOWER = 16;
const SHINGLE_UPPER = 8;
function shingleLean(i: number): number {
  return ((((i * 5) % 7) - 3) / 3) * 0.16;
}

interface SeedDef {
  offset: readonly [number, number];
  yaw: number;
}
// flaxseed.png 실측: 앞쪽 3알이 서로 다른 각도로 흩어져 놓인다. 더미 밑동과 안 겹치게(R1).
// 투명 배경에서 너무 떨어지면 뒷 각도에서 뜬 파편으로 읽히지만, 붙이면 히어로에서 정체가 사라진다.
// 히어로(az=0) 구성을 우선한다 — 도감 썸네일과 기본 쇼케이스 각도다.
const SEEDS: Record<'a' | 'b' | 'c', SeedDef> = {
  a: { offset: [-0.58, 0.53], yaw: -2.15 },
  b: { offset: [0.0, 0.78], yaw: -1.35 },
  c: { offset: [0.6, 0.5], yaw: -0.95 },
};

export const createFlaxseed: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const rimMat = stdMaterial({ color: RIM_COLOR });

  const cluster = new THREE.Group();

  // 더미 — 채움은 구멍 막개, 실루엣은 비늘. 전체를 한 그룹으로 묶어 **마지막에 한 번만** 접지한다.
  const heap = new THREE.Group();
  heap.add(new THREE.Mesh(buildFill(rng), bodyMat));
  const placeShingle = (i: number, r: number, y: number): void => {
    const { bodyGeo, rimGeo } = buildSeed(rng, SHINGLE_PROFILE, SHINGLE_SEGMENTS, SHINGLE_HALF_LENGTH, SHINGLE_RADIUS, false);
    const seed = new THREE.Group();
    seed.add(new THREE.Mesh(bodyGeo, bodyMat));
    seed.add(new THREE.Mesh(rimGeo, rimMat));
    heap.add(shingleOnHeap(seed, i * GOLDEN_ANGLE, r, y, i * 1.7, shingleLean(i)));
  };
  for (let i = 0; i < SHINGLE_LOWER; i++) {
    const u = (i + 0.5) / SHINGLE_LOWER;
    const r = HEAP_RADIUS * (0.18 + 0.8 * Math.sqrt(u));
    placeShingle(i, r, heapY(r));
  }
  for (let i = 0; i < SHINGLE_UPPER; i++) {
    const u = (i + 0.5) / SHINGLE_UPPER;
    const r = HEAP_RADIUS * 0.42 * Math.sqrt(u);
    placeShingle(SHINGLE_LOWER + i, r, heapY(r) + 0.045);
  }
  cluster.add(placeAndGround(heap, [0, 0], -0.2));

  (Object.keys(SEEDS) as (keyof typeof SEEDS)[]).forEach((key) => {
    const def = SEEDS[key];
    const { bodyGeo, rimGeo } = buildSeed(rng, FRONT_PROFILE, FRONT_SEGMENTS, FRONT_HALF_LENGTH, FRONT_RADIUS, true);
    const seed = new THREE.Group();
    seed.add(new THREE.Mesh(bodyGeo, bodyMat));
    seed.add(new THREE.Mesh(rimGeo, rimMat));
    cluster.add(placeAndGround(seed, def.offset, def.yaw));
  });

  return mergeByMaterial(cluster);
};
