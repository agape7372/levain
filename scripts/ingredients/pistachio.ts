// 피스타치오 — 알맹이 4개 + 쪼개진 알 1개(2조각). 계약은 types.ts 주석이 정본. 재료 배치4 3번째.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/pistachio.json(워크스페이스 원본은
// assets/ingredients/work/pistachio/). 프로필·색은 전부 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// 기술 계보: 알맹이 셸은 olive.ts와 동일한 회전체(buildRevolvedShell) + rotateZ(-90deg) 눕히기
// 패턴(단, 올리브의 비대칭 테이퍼 대신 양끝이 비슷하게 둥근 대칭 프로필). 쪼개진 알의 "홈"(자른 면)은
// olive.ts의 (ring,sector) 캡 마스크 기법을 **단일 링이 아니라 극점 제외 전체 링**으로 넓히고,
// chestnut.ts의 CREASE(반지름 축소)를 같은 섹터 범위에 적용해 실제 평평한 단면을 깎는다 — 마스크와
// 함몰이 같은 (ring,sector) 범위를 공유하므로 지오메트리(평평함)와 색(아이보리) 경계가 항상 일치한다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import {
  buildRevolvedShell,
  facet,
  jitterVertices,
  mergeByMaterial,
  pickTriangles,
  splitTrianglesByVertexMask,
  stdMaterial,
  uvTopPlanar,
} from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/pistachio.json geometry.surface[0] 손 전사 (JSON import 금지,
// types.ts §7). "#6E8A38"(그늘진 아랫면)은 올리브/밤과 같은 이유로 버킷을 안 만든다(볼록 셸의 N·L
// 감쇠가 공짜). "#8B5D6E"(자주빛 속껍질 잔흔)도 드롭한다 — mesh<=2 예산이 이미 몸통+홈 2버킷을 다
// 썼고, 정확한 UV 타겟 텍스처를 만드는 비용이 이 단계에서 정당화되지 않는다고 판단했다(정직한
// 한계, spec risk mauve-skin-remnant-dropped). 노트에 "결정적"이라 적혀 있지만 아이보리/초록
// 대비만으로도 "쪼개진 속이 보이는 콩"은 충분히 읽힌다고 본다.
const BODY_COLOR = 0x8fa84a; // "a soft yellow-green body"
const CUT_COLOR = 0xede4c0; // "a pale ivory groove ... inside the split kernel's cleft"

// 실측 비율 (assets/ingredients/src/pistachio.png). 길이:너비 ~1.55:1 — 올리브와 비슷하지만
// 양끝이 비슷하게 둥글다(올리브의 비대칭 뭉툭/뾰족 대신).
const KERNEL_RADIUS = 0.4;
const KERNEL_HALF_LENGTH = 0.62;
const SEGMENTS = 8;

type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.7, -0.7],
  [1.0, -0.15],
  [0.9, 0.35],
  [0.5, 0.75],
  [0.0, 1.0],
];

const JITTER_AMP = 0.014; // ~3.5% of KERNEL_RADIUS — R4, olive/chestnut과 동일 비율

// 자른 면 마스크/함몰 — 극점(rFrac<=0, 인덱스 0·5) 제외한 전 링(1..4)에 고정 섹터 범위를 적용한다.
// olive.ts는 캡을 링 1개에만 찍었지만, 여기서는 알의 "길이 전체"를 가로지르는 평평한 단면이
// 필요해서 극점 사이 전 링으로 넓혔다 — chestnut.ts CREASE가 여러 링에 걸쳐 적용되는 것과 같은 확장.
const CUT_RING_INDICES: readonly number[] = [1, 2, 3, 4];
// cmp-2 판정: half-width 1(3/8 폭)은 두 조각의 단면이 서로 뭉개져 하나의 크림색 덩어리로 보였다 —
// 0(1/8 폭)으로 좁혀 조각별 경계가 또렷해지게 한다.
const CUT_SECTOR_HALF_WIDTH = 0;
// cmp-1 판정: rotateZ(-90deg) 눕히기는 new_y = -old_x다 — old 로컬 +X(섹터 0)는 눕힌 뒤 -Y(바닥
// 쪽)로 가 완전히 숨었다. new_y>0("위")를 내려면 old_x<0, 즉 섹터는 각도 180deg 근처여야 한다
// (SEGMENTS=8이면 섹터 4).
const CUT_SECTOR_CENTER = 4;
const CUT_RADIAL_PULL = 0.42; // 해당 섹터 반지름을 이 비율만큼 축소 — 평평한 단면을 깎는다

/**
 * 알맹이 1개. isSplit=true면 자른 면 마스크/함몰을 추가로 적용해 { bodyGeo, cutGeo } 둘 다 반환하고,
 * false면 cutGeo는 비운다(whole 알맹이는 단일 재질).
 */
function buildKernel(rng: () => number, isSplit: boolean): { bodyGeo: THREE.BufferGeometry; cutGeo: THREE.BufferGeometry | null } {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, SEGMENTS, KERNEL_HALF_LENGTH, () => [KERNEL_RADIUS, KERNEL_RADIUS]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  const mask = new Uint8Array(pos.count);
  if (isSplit) {
    // 함몰/마스크 — 지터/회전 전, (링,섹터) 격자 인덱스로 직접 지정(좌표 임계값 금지, CRIB).
    for (const ri of CUT_RING_INDICES) {
      const base = ringStart[ri];
      for (let d = -CUT_SECTOR_HALF_WIDTH; d <= CUT_SECTOR_HALF_WIDTH; d++) {
        const s = ((CUT_SECTOR_CENTER + d) % SEGMENTS + SEGMENTS) % SEGMENTS;
        const idx = base + s;
        mask[idx] = 1;
        pos.setXYZ(idx, pos.getX(idx) * (1 - CUT_RADIAL_PULL), pos.getY(idx), pos.getZ(idx) * (1 - CUT_RADIAL_PULL));
      }
    }
  }

  // 눕히기: rotateZ(-90deg) — olive.ts와 동일 관례. 장축이 로컬 X로, 로컬 Y가 "위"가 된다.
  geometry.rotateZ(-Math.PI / 2);

  // 지터 — indexed 상태에서(공유 정점이 함께 움직여야 경계가 안 찢어진다, types.ts §5).
  jitterVertices(geometry, rng, JITTER_AMP);

  if (!isSplit) {
    const baked = facet(geometry);
    uvTopPlanar(baked);
    return { bodyGeo: baked, cutGeo: null };
  }

  // facet 전에 원본 index 보존 — splitTrianglesByVertexMask는 facet() 이전 indexed 배열을 요구한다.
  const originalIndex = (geometry.index as THREE.BufferAttribute).array as ArrayLike<number>;
  const baked = facet(geometry);
  const { trueTris, falseTris } = splitTrianglesByVertexMask(originalIndex, mask);
  const cutGeo = pickTriangles(baked, trueTris);
  const bodyGeo = pickTriangles(baked, falseTris);
  uvTopPlanar(cutGeo);
  uvTopPlanar(bodyGeo);
  return { bodyGeo, cutGeo };
}

interface KernelDef {
  offset: readonly [number, number]; // world XZ
  yaw: number;
  tiltZ: number; // 자른 알만: 벌어지는 느낌
  split: boolean;
}

// assets/ingredients/work/pistachio/object-sculpt-spec.json 배치 전사. pistachio.png 탑다운 실측 —
// 5알이 느슨한 원형으로 놓이고, 자른 알(splitA/splitB)이 앞쪽에서 살짝 벌어져 단면을 보여준다.
const KERNELS: Record<'w1' | 'w2' | 'w3' | 'w4' | 'splitA' | 'splitB', KernelDef> = {
  w1: { offset: [-0.55, 0.5], yaw: 0.3, tiltZ: 0, split: false },
  w2: { offset: [0.05, 0.62], yaw: -0.5, tiltZ: 0, split: false },
  w3: { offset: [0.62, 0.35], yaw: 1.1, tiltZ: 0, split: false },
  w4: { offset: [-0.6, -0.15], yaw: 2.0, tiltZ: 0, split: false },
  // 자른 알 — CUT_SECTOR_CENTER는 로컬 +Y(눕힌 뒤 "위")라 yaw(월드 Y 회전)에 안 흔들리고 항상
  // 카메라를 향한다. cmp-2 판정: 간격이 너무 좁아 두 단면이 뭉쳐 보였다 — offset을 벌린다.
  splitA: { offset: [0.08, -0.32], yaw: 2.8, tiltZ: -0.16, split: true },
  splitB: { offset: [0.52, -0.42], yaw: 2.55, tiltZ: 0.16, split: true },
};

export const createPistachio: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const cutMat = stdMaterial({ color: CUT_COLOR });

  const cluster = new THREE.Group();

  (Object.keys(KERNELS) as (keyof typeof KERNELS)[]).forEach((key) => {
    const def = KERNELS[key];
    const { bodyGeo, cutGeo } = buildKernel(rng, def.split);

    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(bodyGeo, bodyMat));
    if (cutGeo) sub.add(new THREE.Mesh(cutGeo, cutMat));

    sub.rotation.set(0, def.yaw, def.tiltZ);
    sub.position.set(def.offset[0], 0, def.offset[1]);

    // 공유 지면 y=0 — 이 알만의 회전 후 bbox를 구해 바닥을 원점에 맞춘다(types.ts R1, olive.ts 관례).
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;

    cluster.add(sub);
  });

  return mergeByMaterial(cluster);
};
