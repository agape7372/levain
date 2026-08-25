// 초코칩 — 눈물방울(콘) 6알 군집. 계약은 types.ts 주석이 정본. 재료 배치B 1번째(4종 중 가장 단순).
//
// 유래: img2threejs 스펙 assets/ingredients/specs/choco.json(워크스페이스 원본은
// assets/ingredients/work/choco/). 프로필·오프셋·색은 전부 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// R1(types.ts) 군집 정본 순서: 칩 1개 = 한 덩어리 indexed 셸(lib.buildRevolvedShell, 극점 2개:
// 플랫 베이스 팬 + 꼭지 극점) -> jitterVertices -> facet. 올리브와 달리 칩은 똑바로 서므로
// 눕히기(rotateZ) 불필요 — 로컬 Y가 그대로 world Y(위)다. 칩끼리는 정점을 공유하지 않으므로
// 알마다 독립적으로 셸을 짓고 mesh 변환으로 배치한다(통짜 positions 배열 금지, olive.ts와 동일 패턴).
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
// 베이스 극점(0,-1.0)과 같은 높이라 바닥이 완전 평평한 팬이 된다. 꼭지 직전에 작은 링(0.13,0.80)을
// 둬 극점 페이싯 수를 늘려 "부드럽게 둥근" 끝을 낸다(단일 급경사 대신).
type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [1.0, -1.0],
  [1.0, -0.86],
  [0.82, -0.5],
  [0.56, -0.02],
  [0.32, 0.44],
  [0.13, 0.8],
  [0.0, 1.0],
];

const JITTER_AMP = 0.018; // ~3.6% of CHOCO_RADIUS — R4, olive와 동일 비율

interface ChipDef {
  offset: readonly [number, number]; // world XZ
  yaw: number; // world Y 회전 (배치 방향 다양화)
}

// assets/ingredients/work/choco/object-sculpt-spec.json CHIPS 전사. 뒷줄(-Z)이 고정 3/4 상단 정면
// 카메라에서 더 도드라져 보이고, 앞줄(+Z)이 낮게 읽힌다(choco.png 6알 육각 배치와 일치).
const CHIPS: Record<'back1' | 'back2' | 'back3' | 'front1' | 'front2' | 'front3', ChipDef> = {
  back1: { offset: [-0.86, -0.42], yaw: 0.35 },
  back2: { offset: [0.02, -0.5], yaw: -0.7 },
  back3: { offset: [0.88, -0.4], yaw: 1.1 },
  front1: { offset: [-0.46, 0.42], yaw: -1.3 },
  front2: { offset: [0.42, 0.46], yaw: 0.55 },
  front3: { offset: [1.15, 0.34], yaw: 2.0 },
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
    sub.position.set(def.offset[0], 0, def.offset[1]);

    // 공유 지면 y=0 — 이 칩만의 회전 후 bbox를 구해 바닥을 원점에 맞춘다(types.ts R1).
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;

    cluster.add(sub);
  });

  return mergeByMaterial(cluster);
};
