// 해바라기씨 — 통통한 물방울꼴 커널 3알 군집. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/sunflowerseed.json(워크스페이스 원본은
// assets/ingredients/work/sunflowerseed/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★세트에서 가장 큰 씨앗 — 포피시드(반지름 0.09~0.17)와의 크기 대비가 정체성이다(팀리드 지시).
// 절대 스케일은 런타임 리핏으로 무의미하지만(types.ts §6), 상대 크기는 각 재료 내부 구성에서
// "커널 하나가 화면 대부분을 채운다"로 인코딩한다(advisor 지시) — 3알이 서로 바짝 붙어 전체
// 실루엣을 꽉 채우게 배치했다.
//
// ═══ v3 (2026-08-26, 64px 판독) ═══
// 머티리얼 2개로는 삼각 배치의 세 알을 못 가른다(K₃ 채색수=3). 선형 배치 + 어두운 가운데가
// 경로 그래프를 2색으로 칠한다. ⚠ 삼각 배치로 되돌리지 말 것. 오프셋은 v3 값을 유지한다
// (간격을 벌리면 최장축 리핏이 알을 줄여 줄무늬가 죽는다).
//
// ═══ v4 (2026-08-28, 쇼케이스 줄무늬 복구) ═══
// v3 줄무늬는 (링 2–5, 섹터 half=1) 윗면 패치라 길이축 밴드가 아니었다. 쇼케이스에서 단색
// 물방울로 읽혀 flax와 구분이 안 됐다.
// 처방: 회전체 섹터를 길이축 줄무늬로 교대. 삼각형은 buildRevolvedShell 감김 순서로 갈라
// OR-of-3 마스크가 이웃 칸을 잡아먹는 일을 막는다. 가운데는 주기3(어두운 다수), 양쪽은
// 주기2(50/50) — 주기3+flip 은 밝은 반쪽이 60°라 탄색 깍지로 읽혔다.
// 가운데 yaw≈π/2 는 극점만 보여 클로버/삼각으로 읽히므로 세 알 모두 길이축을 대략 X로 맞춘다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, pickTriangles, scaleHex, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/sunflowerseed.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0x332f2a; // "a darker umber-gray shadow" — 줄무늬 대비용 몸통. 원문 바디 #4A4640은
// 토프와 명도가 붙어 쇼케이스에서 줄이 증발했다. 그늘 hex를 몸통으로 승격.
const STRIPE_COLOR = scaleHex(0x8c8478, 1.72); // "a pale taupe highlight"를 밝혀 흰 줄. 1.72 → ~#F0E2CE.
// 드롭: 원문 바디 #4A4640(명도 부족) · 유령 줄 #6B6558(토프와 더 가까움).

const KERNEL_SEGMENTS = 18; // 2·3 공배수 — 양쪽 주기2 / 가운데 주기3이 정수 칸으로 떨어진다
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

const JITTER_AMP = 0.01; // 줄 경계를 안 흔들게 v3 0.018에서 내림. ~2% of KERNEL_RADIUS (R4)

/**
 * buildRevolvedShell 인덱스 순서와 같은 이중 루프로 삼각형을 줄무늬/몸통으로 가른다.
 * 정점 마스크(OR-of-3)는 경계 삼각형을 밝은 쪽으로 밀어 가는 줄이 투톤 반쪽으로 죽는다.
 */
function partitionStripeTris(
  profile: readonly ProfilePoint[],
  segments: number,
  isStripe: (sector: number) => boolean,
): { stripeTris: number[]; bodyTris: number[] } {
  const stripeTris: number[] = [];
  const bodyTris: number[] = [];
  let tri = 0;
  const take = (count: number, stripe: boolean) => {
    const dest = stripe ? stripeTris : bodyTris;
    for (let i = 0; i < count; i++) dest.push(tri++);
  };
  for (let ri = 0; ri < profile.length - 1; ri++) {
    const aPole = profile[ri][0] <= 1e-6;
    const bPole = profile[ri + 1][0] <= 1e-6;
    for (let s = 0; s < segments; s++) {
      const stripe = isStripe(s);
      if (aPole || bPole) take(1, stripe);
      else take(2, stripe);
    }
  }
  return { stripeTris, bodyTris };
}

function buildKernel(
  rng: () => number,
  isStripe: (sector: number) => boolean,
): { bodyGeo: THREE.BufferGeometry; stripeGeo: THREE.BufferGeometry } {
  const { geometry } = buildRevolvedShell(PROFILE, KERNEL_SEGMENTS, KERNEL_HALF_LENGTH, () => [
    KERNEL_RADIUS,
    KERNEL_RADIUS,
  ]);

  // 눕히기: rotateZ(-90deg) => new_x = old_y(길이), new_y = -old_x("위" = 원 섹터 π, s=segments/2).
  geometry.rotateZ(-Math.PI / 2);
  jitterVertices(geometry, rng, JITTER_AMP);

  const baked = facet(geometry);
  const { stripeTris, bodyTris } = partitionStripeTris(PROFILE, KERNEL_SEGMENTS, isStripe);
  const stripeGeo = pickTriangles(baked, stripeTris);
  const bodyGeo = pickTriangles(baked, bodyTris);
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
  /** 밝은 줄 주기(칸). 2=50/50, 3=어두운 다수 */
  period: number;
  /** 주기 위상. 옆알끼리 줄을 어긋내 접면에서 명도가 갈리게 */
  phase: number;
}
// v3 선형 오프셋 유지(어두운 가운데). yaw만 낮춰 길이축 ≈ X — π/2로 세우면 극점 스타버스트가 된다.
const KERNELS: Record<'a' | 'b' | 'c', KernelDef> = {
  a: { offset: [-0.74, 0.20], yaw: -0.22, tiltZ: 0.0, period: 2, phase: 1 },
  b: { offset: [0.02, -0.14], yaw: 0.18, tiltZ: 0.12, period: 3, phase: 0 },
  c: { offset: [0.76, 0.16], yaw: 0.28, tiltZ: 0.0, period: 2, phase: 0 },
};

export const createSunflowerseed: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const stripeMat = stdMaterial({ color: STRIPE_COLOR });

  const cluster = new THREE.Group();

  (Object.keys(KERNELS) as (keyof typeof KERNELS)[]).forEach((key) => {
    const def = KERNELS[key];
    const { bodyGeo, stripeGeo } = buildKernel(rng, (s) => (s + def.phase) % def.period === 0);
    const kernel = new THREE.Group();
    kernel.add(new THREE.Mesh(bodyGeo, bodyMat));
    kernel.add(new THREE.Mesh(stripeGeo, stripeMat));
    cluster.add(placeAndGround(kernel, def.offset, def.yaw, def.tiltZ));
  });

  return mergeByMaterial(cluster);
};
