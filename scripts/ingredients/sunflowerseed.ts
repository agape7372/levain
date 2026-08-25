// 해바라기씨 — 통통한 물방울꼴 커널 3알 군집. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/sunflowerseed.json(워크스페이스 원본은
// assets/ingredients/work/sunflowerseed/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★세트에서 가장 큰 씨앗 — 포피시드(반지름 0.09~0.17)와의 크기 대비가 정체성이다(팀리드 지시).
// 절대 스케일은 런타임 리핏으로 무의미하지만(types.ts §6), 상대 크기는 각 재료 내부 구성에서
// "커널 하나가 화면 대부분을 채운다"로 인코딩한다(advisor 지시) — 3알이 서로 바짝 붙어 전체
// 실루엣을 꽉 채우게 배치했다. 하이라이트는 flaxseed.ts와 같은 (링,섹터) 기법이지만 폭을 좁혀
// "긴 축을 따라 도는 옅은 줄무늬"(prompt: ghost-pale stripe tracing the long axis)로 만든다 —
// olive.ts의 캡 좌표계(rotateZ(-90) 이후 sectorCenter가 "위") 그대로 재사용.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, pickTriangles, splitTrianglesByVertexMask, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/sunflowerseed.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0x4a4640; // "a muted grayish-brown body"
const STRIPE_COLOR = 0x8c8478; // "a pale taupe highlight catching the plump upper faces" — 길이축 줄무늬
// 드롭: 아랫면 그늘 #332F2A(N·L 감쇠가 공짜로 어둡게 함)와
// 옅은 유령 줄무늬 #6B6558(STRIPE_COLOR와 명도가 가까워 64px에서 살아남지 못함 — advisor 지시로 드롭).

const KERNEL_SEGMENTS = 10;
const KERNEL_RADIUS = 0.5;
const KERNEL_HALF_LENGTH = 0.92; // 길이:너비 ~= 1.84:1 (sunflowerseed-2.png 실측, 통통한 물방울)

type ProfilePoint = readonly [number, number];
// 비대칭 테이퍼 — 한쪽 끝(hFrac=-1)은 뾰족, 반대쪽(hFrac=+1)은 통통하게 둥글다.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.35, -0.85],
  [0.7, -0.5],
  [0.95, -0.05],
  [1.0, 0.25],
  [0.85, 0.6],
  [0.5, 0.85],
  [0.0, 1.0],
];
// 줄무늬 — sectorCenter(=segments/2)가 눕힌 뒤 "위"를 향한다(올리브 공식). 포피시드의 넓은 캡,
// 아마씨의 넓은 상면 하이라이트와 달리 여기는 폭을 좁혀(half=1) "줄무늬"로 좁힌다.
const STRIPE_RING_INDICES: readonly number[] = [2, 3, 4, 5];
const STRIPE_SECTOR_HALF_WIDTH = 1; // segments=10일 때 3칸 폭

const JITTER_AMP = 0.018; // ~3.6% of KERNEL_RADIUS — olive 비율과 일치(R4 기준선)

function buildKernel(rng: () => number): { bodyGeo: THREE.BufferGeometry; stripeGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, KERNEL_SEGMENTS, KERNEL_HALF_LENGTH, () => [
    KERNEL_RADIUS,
    KERNEL_RADIUS,
  ]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  const mask = new Uint8Array(pos.count);
  const sectorCenter = Math.floor(KERNEL_SEGMENTS / 2);
  for (const ri of STRIPE_RING_INDICES) {
    const base = ringStart[ri];
    for (let d = -STRIPE_SECTOR_HALF_WIDTH; d <= STRIPE_SECTOR_HALF_WIDTH; d++) {
      const s = (sectorCenter + d + KERNEL_SEGMENTS) % KERNEL_SEGMENTS;
      mask[base + s] = 1;
    }
  }

  // 눕히기: rotateZ(-90deg) => new_x = old_y(길이), new_y = -old_x("위").
  geometry.rotateZ(-Math.PI / 2);

  jitterVertices(geometry, rng, JITTER_AMP);

  const originalIndex = (geometry.index as THREE.BufferAttribute).array as ArrayLike<number>;
  const baked = facet(geometry);
  const { trueTris, falseTris } = splitTrianglesByVertexMask(originalIndex, mask);

  const stripeGeo = pickTriangles(baked, trueTris);
  const bodyGeo = pickTriangles(baked, falseTris);
  uvTopPlanar(stripeGeo);
  uvTopPlanar(bodyGeo);
  return { bodyGeo, stripeGeo };
}

function placeAndGround(child: THREE.Object3D, offset: readonly [number, number], yaw: number, tiltZ: number): THREE.Group {
  const sub = new THREE.Group();
  sub.add(child);
  sub.rotation.set(0, yaw, tiltZ);
  sub.position.set(offset[0], 0, offset[1]);
  sub.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sub);
  sub.position.y -= box.min.y;
  return sub;
}

interface KernelDef {
  offset: readonly [number, number];
  yaw: number;
  tiltZ: number;
}
// sunflowerseed.png/-2/-3 실측: 3알이 바짝 붙어 서로 다른 각도로 겹쳐 놓인다 — 올리브 클러스터
// 패턴(offset/yaw/tiltZ 다양화)을 그대로 재사용하되 간격을 더 좁혀 "꽉 찬 덩어리" 인상을 준다.
const KERNELS: Record<'a' | 'b' | 'c', KernelDef> = {
  a: { offset: [-0.42, 0.12], yaw: -0.4, tiltZ: 0.0 },
  b: { offset: [0.42, 0.1], yaw: 0.45, tiltZ: 0.0 },
  c: { offset: [0.0, -0.4], yaw: 1.6, tiltZ: 0.12 },
};

export const createSunflowerseed: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const stripeMat = stdMaterial({ color: STRIPE_COLOR });

  const cluster = new THREE.Group();

  (Object.keys(KERNELS) as (keyof typeof KERNELS)[]).forEach((key) => {
    const def = KERNELS[key];
    const { bodyGeo, stripeGeo } = buildKernel(rng);
    const kernel = new THREE.Group();
    kernel.add(new THREE.Mesh(bodyGeo, bodyMat));
    kernel.add(new THREE.Mesh(stripeGeo, stripeMat));
    cluster.add(placeAndGround(kernel, def.offset, def.yaw, def.tiltZ));
  });

  return mergeByMaterial(cluster);
};
