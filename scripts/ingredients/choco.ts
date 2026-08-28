// 초코칩 — 눈물방울(콘) 7알 군집(중심 1 + 고리 6). 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/choco.json(워크스페이스 원본은
// assets/ingredients/work/choco/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// R1(types.ts) 군집 정본 순서: 칩 1개 = 한 덩어리 indexed 셸(lib.buildRevolvedShell, 극점 2개:
// 플랫 베이스 팬 + 꼭지 극점) -> jitterVertices -> facet. 올리브와 달리 칩은 똑바로 서므로
// 눕히기(rotateZ) 불필요 — 로컬 Y가 그대로 world Y(위)다. 칩끼리는 정점을 공유하지 않으므로
// 알마다 독립적으로 셸을 짓고 mesh 변환으로 배치한다(통짜 positions 배열 금지, olive.ts와 동일 패턴).
//
// ★2026-08-28 수리: 6알 2열은 중심이 비어 0°·180°에서 원뿔 사이 배경이 20~26px 새었다.
// 중심 칩 + 고리 6으로 창을 막고, 고리 거리를 적도 반지름 합 안으로 좁혀 3/4 시선이 몸통을
// 통과하게 한다. 기울이기는 안 한다 — 재그라운딩이 바깥 밑만 땅에 붙이고 안쪽 밑을 들어
// 0° 밑단 가랑이를 다시 연다. 전부 공유 지면 y=0(types.ts R1).
//
// 색 버킷: 프롬프트 hex 3개(#4A3428 몸통 / #6B4E3D 상면 하이라이트 / #37241B 이음새 그늘) 중 2개를
// 드롭한다 — 올리브 파일럿 교훈의 직접 확장:
//   - 상면 하이라이트(#6B4E3D)는 런타임 키라이트의 N·L 감쇠가 볼록한 콘 상단에서 이미 공짜로 낸다
//     (올리브의 그늘진 아랫면 드롭과 대칭 — 여기선 오히려 더 직접적이다).
//   - 이음새 그늘(#37241B)은 하네스가 렌더하지 않는 contact shadow 효과라 완전히 공짜는 아니지만,
//     64px 축소본에서는 칩 사이 색조 차이가 안 읽힌다(risk 기록, object-sculpt-spec.json 참조).
// 결과: mesh=1(머티리얼 1개) — 마스크 분리 불필요, 재료 중 가장 단순한 빌더.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/choco.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0x4a3428; // "a deep cocoa brown body"

// 실측 비율 (assets/ingredients/src/choco.png 3/4 · choco-2.png 정면 · choco-3.png 탑다운).
// 절대 스케일은 무의미 — 런타임이 군집 전체 최장축을 1.6으로 리핏한다 (types.ts §6).
const CHOCO_RADIUS = 0.5; // 베이스 반지름
const CHOCO_HALF_LENGTH = 0.56; // 극-극 절반 길이 (height:width ~= 1.05:1, choco-2.png 실측)
const CHOCO_SEGMENTS = 8;

// (반지름비, 높이비) — heightFrac -1(플랫 베이스 극점) .. +1(꼭지 극점). 베이스 림(1.0,-1.0)이
// 베이스 극점(0,-1.0)과 같은 높이라 바닥이 완전 평평한 팬이 된다. 아랫단을 두껍게 유지하는 키스
// 단면(최대 반지름=베이스) — 적도에서 부풀리면 공이 된다. 꼭지 직전 작은 링이 끝을 부드럽게.
type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [1.0, -1.0],
  [1.0, -0.72],
  [0.92, -0.22],
  [0.74, 0.28],
  [0.42, 0.62],
  [0.16, 0.86],
  [0.0, 1.0],
];

const JITTER_AMP = 0.018; // ~3.6% of CHOCO_RADIUS — R4, olive와 동일 비율

interface ChipDef {
  offset: readonly [number, number]; // world XZ
  yaw: number; // world Y 회전 (배치 방향 다양화)
  scale: number; // 알별 미세 크기 — 정육각 꽃이 아니라 더미로 읽히게
}

// 중심 1 + 고리 6. φ ≈ -30° + k·60° 이라 기본 3/4 카메라와 180° 반대에 고리 칩이 선다.
// 고리 거리 ≈ 0.64 — 두꺼운 키스 몸통이 맞닿고, 중심 칩이 중상단 V를 채운다. 칩은 세운 채
// 바닥에 앉힌다(기울이면 재그라운딩이 0° 밑단 가랑이를 연다).
const CHIPS: Record<'center' | 'frontL' | 'frontR' | 'right' | 'backR' | 'backL' | 'left', ChipDef> = {
  center: { offset: [0.0, 0.0], yaw: 0.25, scale: 1.1 },
  frontL: { offset: [-0.32, 0.55], yaw: -1.1, scale: 0.98 },
  frontR: { offset: [0.34, 0.56], yaw: 0.55, scale: 1.02 },
  right: { offset: [0.64, 0.02], yaw: 2.0, scale: 0.94 },
  backR: { offset: [0.32, -0.54], yaw: 1.1, scale: 0.98 },
  backL: { offset: [-0.34, -0.52], yaw: -0.7, scale: 1.04 },
  left: { offset: [-0.64, 0.0], yaw: 0.35, scale: 0.96 },
};

/**
 * 칩 1개 = 회전체 셸(플랫 베이스 팬 극점 + 꼭지 극점) + 지터 + 페이싯. 칩은 똑바로 서므로
 * 올리브의 "눕히기(rotateZ)" 단계가 없다 — buildRevolvedShell이 짓는 로컬 Y가 그대로 world Y.
 */
function buildChip(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(PROFILE, CHOCO_SEGMENTS, CHOCO_HALF_LENGTH, () => [CHOCO_RADIUS, CHOCO_RADIUS]);

  // 지터 — indexed 상태에서(공유 정점이 함께 움직여야 베이스 팬이 안 찢어진다, types.ts §5).
  jitterVertices(geometry, rng, JITTER_AMP);

  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

export const createChoco: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const cluster = new THREE.Group();

  (Object.keys(CHIPS) as (keyof typeof CHIPS)[]).forEach((key) => {
    const def = CHIPS[key];
    const geo = buildChip(rng);

    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(geo, bodyMat));

    sub.rotation.set(0, def.yaw, 0);
    sub.scale.setScalar(def.scale);
    sub.position.set(def.offset[0], 0, def.offset[1]);

    // 공유 지면 y=0 — 이 칩만의 회전·스케일 후 bbox를 구해 바닥을 원점에 맞춘다(types.ts R1).
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;

    cluster.add(sub);
  });

  return mergeByMaterial(cluster);
};
