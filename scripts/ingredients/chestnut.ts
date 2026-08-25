// 밤 — 단일 회전체 셸(구운 밤 한 알). 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/chestnut.json(워크스페이스 원본은
// assets/ingredients/work/chestnut/). 프로필·오프셋·색은 전부 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// R1(types.ts) 단일체 정본 순서: 한 덩어리 indexed 셸(lib.buildRevolvedShell) -> 크리즈(단일 섹터
// 반지름 함몰) -> jitterVertices -> facet -> 바닥 캡 팬을 삼각형 구간으로 분리(몸통/바닥자국 2버킷).
// 밤은 반경 대칭체라 올리브의 (ring,sector) 마스크 대신 buildRevolvedShell이 직접 배 모양 프로필을
// 낸다 -- 크리즈만 후처리로 얹는다(domeShell.ts의 wobble 후처리와 같은 패턴).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvDome } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/chestnut.json geometry.surface 손 전사 (JSON import 금지, types.ts §7).
// "#5E4029"(그늘진 아랫면)은 올리브와 같은 이유로 버킷을 안 만든다 -- 런타임 키라이트의 N·L 감쇠가
// 볼록한 돔의 아랫면을 공짜로 어둡게 만든다. "#C68B5B"(split-line)도 색 버킷이 아니라 CREASE_SECTOR
// 지오메트리 함몰로 승계한다 -- 두 새 페이싯 엣지가 키라이트를 다르게 받아 밝기 대비로 읽힌다.
const SHELL_COLOR = 0x7a5638; // "a warm russet-brown shell"
const BASE_PATCH_COLOR = 0xd9c4a0; // "a pale oatmeal patch ... across the flat base"

// 실측 비율 (assets/ingredients/src/chestnut.png 3/4 · chestnut-2.png 정면 · chestnut-3.png 탑다운).
const CHESTNUT_RADIUS = 0.5; // 배(belly) 적도 반지름
const CHESTNUT_HEIGHT = 0.62; // 바닥-꼭짓점 전체 높이 (~1.24 x 반지름, chestnut-2.png 정면도 실측)
const SEGMENTS = 16;

// (반지름비, 높이비) — heightFrac 0(바닥) .. 1(뾰족한 꼭짓점). advisor 사전 리뷰 교정: 밑단(rFrac
// 0.80)을 배(rFrac 1.0, h=0.32)보다 좁게 잡는다 -- 밑단이 배와 같은 폭이면 플랜지+허리 실루엣이 되어
// chestnut-2.png의 "밑단이 배보다 안으로 좁아지는" 모습과 어긋난다.
type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, 0.0], // 바닥 중심 극점
  [0.8, 0.0], // 밑단 테두리 — 배보다 좁다 (머티리얼 경계, RING_BASE_EDGE)
  [0.92, 0.14],
  [1.0, 0.32], // 배 — 가장 넓은 지점
  [0.9, 0.52],
  [0.68, 0.72],
  [0.4, 0.88],
  [0.14, 0.96],
  [0.0, 1.0], // 꼭짓점 극점 (뾰족)
];
// cmp-1 판정: 바닥자국을 "밑단 팬(ring0->ring1)"만으로 잡으면 카메라가 위에서 내려다보므로
// 아래로 향한 면이라 전혀 안 보인다 -- 레퍼런스(chestnut-2.png)는 자국이 정면 하단부 곡면까지
// 올라와 있다(전체 높이의 ~20-25%). cmp-2 판정: ring1->ring2(h=0.14)까지만 넣었더니 부감 원근
// 단축 탓에 밑단 가장자리 티끌 하나로만 보였다 -- ring3(배, h=0.32)까지 더 끌어올린다.
const PATCH_TRANSITIONS = 3;

// split-line 크리즈 — assets/prompts/ingredients/chestnut.json의 "#C68B5B" 산문을 색이 아니라
// 지오메트리로 승계. 섹터는 하네스 3/4 카메라(-1.6, 2.2, 2.6)를 향하도록 선택: 방위각
// atan2(2.6,-1.6) ≈ 121.8도, SEGMENTS=16(섹터당 22.5도)이면 섹터 5(112.5~135도)가 카메라를
// 향한다 -- 섹터 0(0도, 카메라 정반대편)을 골랐다면 올리브 파일럿의 좌표-임계값 캡 마스크 실패와
// 같은 종류의 함정이었을 것(advisor 사전 리뷰 지적).
const CREASE_SECTOR = 5;
const CREASE_RING_INDICES = [2, 3, 4, 5, 6, 7]; // 밑단(1)·양쪽 극점(0,8) 제외
// cmp-1 판정: 0.08은 렌더 거리에서 전혀 안 보였다. cmp-2 판정: 0.22(반지름만 축소)도 여전히
// 안 보였다 -- 반지름만 줄이면 그라데이션처럼 부드럽게 흡수된다. 반지름을 더 깊게 줄이고 Y도
// 살짝 눌러 실제 골(valley) 단면을 만든다.
const CREASE_DEPTH_FRACTION = 0.34; // 해당 섹터 반지름을 (1 - 이 값)배로 축소
const CREASE_Y_DIP = 0.025; // 해당 섹터 Y를 이 값만큼 추가로 낮춘다 (절대 단위)

const JITTER_AMP = 0.018; // ~3.6% of CHESTNUT_RADIUS — R4, olive와 동일 비율

function buildChestnut(rng: () => number): { shellGeo: THREE.BufferGeometry; basePatchGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, SEGMENTS, CHESTNUT_HEIGHT, () => [
    CHESTNUT_RADIUS,
    CHESTNUT_RADIUS,
  ]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  // 크리즈 — 지터/facet 전, 고정 섹터의 반지름을 줄인다. 극점(rFrac<=0)은 반지름 개념이 없어 제외.
  for (const ri of CREASE_RING_INDICES) {
    const idx = ringStart[ri] + CREASE_SECTOR;
    pos.setXYZ(
      idx,
      pos.getX(idx) * (1 - CREASE_DEPTH_FRACTION),
      pos.getY(idx) - CREASE_Y_DIP,
      pos.getZ(idx) * (1 - CREASE_DEPTH_FRACTION),
    );
  }

  // 지터 — indexed 상태에서(공유 정점이 함께 움직여야 밑단/몸통 경계가 안 찢어진다, types.ts §5).
  jitterVertices(geometry, rng, JITTER_AMP);

  // facet 전에 원본 index로 바닥자국 트라이앵글 개수를 계산 — buildRevolvedShell은 profile 순서
  // 그대로 index를 이어붙이므로(lib.ts 주석), 처음 PATCH_TRANSITIONS개 전이(극점->밑단 fan,
  // 밑단->다음 링 band)가 항상 맨 앞 트라이앵글들이다.
  const baseFanTriangles = SEGMENTS * (1 + 2 * (PATCH_TRANSITIONS - 1)); // fan + (n-1)개 ring-ring band
  const baked = facet(geometry);

  const basePatchGeo = sliceTriangles(baked, 0, baseFanTriangles);
  const shellGeo = sliceTriangles(baked, baseFanTriangles, baked.attributes.position.count / 3);
  uvDome(shellGeo);
  uvDome(basePatchGeo);
  return { shellGeo, basePatchGeo };
}

export const createChestnut: IngredientBuilder = (rng) => {
  const shellMat = stdMaterial({ color: SHELL_COLOR });
  const baseMat = stdMaterial({ color: BASE_PATCH_COLOR });

  const { shellGeo, basePatchGeo } = buildChestnut(rng);

  const group = new THREE.Group();
  group.add(new THREE.Mesh(shellGeo, shellMat));
  group.add(new THREE.Mesh(basePatchGeo, baseMat));

  // 공유 지면 y=0 — 지터가 바닥 정점을 살짝 밀어낼 수 있어 최종 bbox로 스냅한다(types.ts R1).
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
  group.updateMatrixWorld(true);

  return mergeByMaterial(group);
};
