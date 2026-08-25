// 팥 — 소용돌이 페이스트 마운드 + 통팥 3알. 계약은 types.ts 주석이 정본. 재료 배치4 1번째.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/redbean.json(워크스페이스 원본은
// assets/ingredients/work/redbean/). 프로필·오프셋·색은 전부 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// 기술 계보: 마운드는 chestnut.ts의 단일-셸 + CREASE(고정 섹터 함몰) 패턴을 그대로 쓰되, CREASE_SECTOR가
// **링마다 이동**하도록 일반화했다 — 소용돌이 각도 함수 grooveTargetAngleDeg(hFrac)가 링의 hFrac에서
// 목표 섹터를 계산해 그 섹터(±1)를 반지름 축소 + Y 함몰시킨다. 색 버킷 분리가 필요 없다(블루베리 왕관과
// 달리 이음매 자체가 별도 색이 아니다) — sliceTriangles/마스크 없이 단일 재질 셸.
// 통팥 3알은 olive.ts의 rotateZ(-90deg) 눕히기 규칙으로 만든 독립 타원체이며, **같은 각도 함수**로
// 마운드 표면(hFrac 보간)에 배치한다 — 이음매와 통팥이 항상 같은 나선 위에 있도록 수식을 공유한다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, stdMaterial, uvDome } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/redbean.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
// "#522020"(소용돌이 그늘)·"#85453B"(바깥 코일 하이라이트)는 버킷을 안 만든다 — 볼록/함몰 마운드의
// N·L 감쇠 + 이음매 자체의 페이싯 노멀 대비가 이미 공짜로 표현한다(올리브/밤/블루베리 몸통과 동일 논리).
const BODY_COLOR = 0x6b2e2e; // "a deep maroon-red paste body"
const BEAN_COLOR = 0x3d1818; // "two or three whole beans in a near-black deep red"

// 실측 비율 (assets/ingredients/src/redbean.png 3/4 · redbean-2.png 정면 · redbean-3.png 탑다운).
const MOUND_RADIUS = 0.5;
const MOUND_HEIGHT = 0.9; // 높이:너비 ~0.9:1 (redbean-2.png 정면도 실측)
const SEGMENTS = 16;

// (반지름비, 높이비) — hFrac 0(바닥 극점) .. 1(꼭대기 극점). 가장 넓은 지점(rFrac 1.0)이 hFrac 0.30 —
// 이음매 구간은 여기서부터(등고선이 내려가는 상반부) 시작한다.
type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, 0.0],
  [0.72, 0.08],
  [0.94, 0.2],
  [1.0, 0.3], // 적도/최대폭 — 이음매 구간 시작
  [0.94, 0.42],
  [0.84, 0.54],
  [0.68, 0.66],
  [0.48, 0.78],
  [0.24, 0.9], // 이음매 구간 끝
  [0.0, 1.0],
];

// 소용돌이 이음매 — chestnut.ts CREASE의 "고정 섹터" 대신 hFrac에 따라 움직이는 목표 섹터를 링마다
// 계산해 그 섹터(±half-width)를 반지름 축소 + Y 함몰시킨다(같은 인덱스/지터 이전 후처리 패턴).
// 각도 함수의 정의역(SPIRAL_H_*)과 실제 함몰을 적용하는 링 범위(GROOVE_DIP_H_MAX)를 분리한다 —
// cmp-1/cmp-2 판정: 정의역 끝단(hFrac 0.78~0.90, ring7/8)은 반지름이 이미 작아(rFrac .48/.24) 28%
// 축소 + 지터가 겹치면 극점 쪽으로 뾰족하게 찌그러지는 스파이크/이중 뿔 아티팩트가 생겼다(하나는
// 통팥3과 겹쳐 보여 "귀 두 개"처럼 읽혔다). 함몰은 반지름이 충분히 큰 하반부(0.30~0.66)에만 적용하고,
// 각도 함수 자체는 원래 정의역(0.30~0.90)을 유지해 통팥 3알의 각도 분산(공식 공유)은 그대로 둔다.
const SPIRAL_H_START = 0.3;
const SPIRAL_H_END = 0.9;
const GROOVE_DIP_H_MAX = 0.66; // 함몰은 ring6(rFrac .68)까지만 — ring7/8/극점은 매끈하게 둔다
const GROOVE_ANGLE_START_DEG = 150;
const GROOVE_TURNS = 1.2; // ring-to-ring 각도 스텝이 크므로(SEGMENTS=16) 저폴리에서 완전한 연속선은
// 기대하지 않는다 — cinnamon 나선 텍스처와 같은 종류의 정직한 한계(risk spiral-may-not-survive-64px).
const GROOVE_SECTOR_HALF_WIDTH = 1;
const GROOVE_RADIUS_PULL = 0.28;
const GROOVE_Y_DIP = 0.03;

/** 소용돌이 각도 함수 — 이음매 함몰과 통팥 배치가 공유한다(항상 같은 나선 위에 있도록). */
function grooveTargetAngleDeg(hFrac: number): number {
  const frac = (hFrac - SPIRAL_H_START) / (SPIRAL_H_END - SPIRAL_H_START);
  return GROOVE_ANGLE_START_DEG - frac * GROOVE_TURNS * 360;
}

/** PROFILE의 상반부(인덱스 3..9, hFrac에 단조 — rFrac도 단조 감소)만 선형보간. 통팥 표면 반지름 조회용. */
function rFracAtHFrac(target: number): number {
  for (let i = 3; i < PROFILE.length - 1; i++) {
    const [r0, h0] = PROFILE[i];
    const [r1, h1] = PROFILE[i + 1];
    if (target >= h0 && target <= h1) {
      const t = (target - h0) / (h1 - h0);
      return r0 + (r1 - r0) * t;
    }
  }
  return 0;
}

const JITTER_AMP = 0.018; // ~3.6% of MOUND_RADIUS — R4, olive/chestnut과 동일 비율

function buildMound(rng: () => number): THREE.BufferGeometry {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, SEGMENTS, MOUND_HEIGHT, () => [MOUND_RADIUS, MOUND_RADIUS]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  // 소용돌이 함몰 — 지터/facet 전, 이음매 구간에 속한 링마다 이동하는 목표 섹터(±half-width)를 축소.
  const sectorSize = 360 / SEGMENTS;
  for (let ri = 0; ri < PROFILE.length; ri++) {
    const hFrac = PROFILE[ri][1];
    if (hFrac < SPIRAL_H_START - 1e-6 || hFrac > GROOVE_DIP_H_MAX + 1e-6) continue;
    const targetDeg = grooveTargetAngleDeg(hFrac);
    const targetSector = (((Math.round(targetDeg / sectorSize) % SEGMENTS) + SEGMENTS) % SEGMENTS);
    const base = ringStart[ri];
    for (let d = -GROOVE_SECTOR_HALF_WIDTH; d <= GROOVE_SECTOR_HALF_WIDTH; d++) {
      const s = ((targetSector + d) % SEGMENTS + SEGMENTS) % SEGMENTS;
      const idx = base + s;
      pos.setXYZ(idx, pos.getX(idx) * (1 - GROOVE_RADIUS_PULL), pos.getY(idx) - GROOVE_Y_DIP, pos.getZ(idx) * (1 - GROOVE_RADIUS_PULL));
    }
  }

  // 지터 — indexed 상태에서(types.ts §5), 함몰 이후.
  jitterVertices(geometry, rng, JITTER_AMP);

  const baked = facet(geometry);
  uvDome(baked);
  return baked;
}

// 통팥 — 작은 타원체(pole-ring-ring-pole), 눕히기(olive.ts rotateZ(-90deg) 규칙과 동일)로 장축을
// 로컬 X로 돌린다. 지터 없음(작은 부속 파트, R4).
const BEAN_RADIUS = 0.075;
const BEAN_LENGTH = 0.11;
const BEAN_SEGMENTS = 8;
const BEAN_YAW_DEG = 125; // 하네스 히어로 카메라(-1.6,2.2,2.6) 방위각과 가까운 고정 broadside yaw
const BEAN_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.7, -0.6],
  [1.0, 0.0],
  [0.7, 0.6],
  [0.0, 1.0],
];
// hFrac만 지정 — outer(적도, 소용돌이 시작점) -> mid -> inner. redbean-3.png 탑다운 실측.
// cmp-1/cmp-3 판정: inner를 0.84(ring7~8 근처, 지역 반지름 .18)에 두면 통팥 장반경(0.11)이 그 높이의
// 마운드 반지름과 맞먹어 실루엣 밖으로 길쭉하게 튀어나와 "뿔"처럼 보였다 — 0.70(지역 반지름 .31)으로
// 낮춰 통팥이 마운드 표면 대비 과대하지 않게 한다.
const BEAN_HFRACS: readonly number[] = [0.3, 0.58, 0.7];

function buildBean(): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(BEAN_PROFILE, BEAN_SEGMENTS, BEAN_LENGTH, () => [BEAN_RADIUS, BEAN_RADIUS]);
  geometry.rotateZ(-Math.PI / 2); // 빌드축(Y) -> 로컬 X가 장축
  const baked = facet(geometry);
  uvDome(baked);
  return baked;
}

export const createRedbean: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const beanMat = stdMaterial({ color: BEAN_COLOR });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(buildMound(rng), bodyMat));

  BEAN_HFRACS.forEach((hFrac, i) => {
    const angleRad = (grooveTargetAngleDeg(hFrac) * Math.PI) / 180;
    const radius = rFracAtHFrac(hFrac) * MOUND_RADIUS;
    const y = hFrac * MOUND_HEIGHT;

    const beanMesh = new THREE.Mesh(buildBean(), beanMat);
    // cmp-3/shot-90 판정: 장축을 나선 접선(angleRad+90deg)에 정확히 맞추면 통팥 위치에 따라 카메라
    // 시선축과 거의 평행해지는(edge-on) 경우가 생겨 통통한 알갱이가 아니라 가시/뿔처럼 보였다
    // (특히 inner 통팥, θ≈222deg가 edge-on 각도 ≈212deg에 근접). 나선 접선 대신 하네스 히어로 카메라
    // (-1.6,2.2,2.6)를 항상 옆(broadside)으로 보는 고정 yaw(~125deg, 카메라 방위각과 유사)를 쓴다 —
    // 물리적 정확도(접선 정렬)보다 64px에서 "통통한 알갱이"로 읽히는 게 우선이다.
    beanMesh.rotation.y = ((BEAN_YAW_DEG + i * 12) * Math.PI) / 180;
    beanMesh.position.set(radius * Math.cos(angleRad), y + BEAN_RADIUS * 0.5, radius * Math.sin(angleRad));
    group.add(beanMesh);
  });

  // 공유 지면 y=0 — 통팥은 마운드 표면에 붙어 있으므로 그룹 전체를 한 번만 스냅한다(types.ts R1).
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
  group.updateMatrixWorld(true);

  return mergeByMaterial(group);
};
