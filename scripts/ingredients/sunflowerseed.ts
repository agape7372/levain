// 해바라기씨 — 통통한 물방울꼴 커널 3알 군집. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/sunflowerseed.json(워크스페이스 원본은
// assets/ingredients/work/sunflowerseed/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★세트에서 가장 큰 씨앗 — 포피시드(반지름 0.09~0.17)와의 크기 대비가 정체성이다(팀리드 지시).
// 절대 스케일은 런타임 리핏으로 무의미하지만(types.ts §6), 상대 크기는 각 재료 내부 구성에서
// "커널 하나가 화면 대부분을 채운다"로 인코딩한다(advisor 지시) — 3알이 서로 바짝 붙어 전체
// 실루엣을 꽉 채우게 배치했다. 눕히기·마스크 좌표계는 olive.ts 그대로 재사용한다
// (rotateZ(-90) 이후 sectorCenter가 "위").
//
// ★줄무늬는 v4에서 **한 방위 고정 밴드 -> 원주 주기 4줄**로 바뀌었다. 이유는 STRIPE_PERIOD
// 선언 위 주석에 전부 있다 — 고치기 전에 그것부터 읽을 것.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, pickTriangles, splitTrianglesByVertexMask, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/sunflowerseed.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0x4a4640; // "a muted grayish-brown body"
const STRIPE_COLOR = 0x8c8478; // "a pale taupe highlight catching the plump upper faces" — 길이축 줄무늬
// 드롭: 아랫면 그늘 #332F2A(N·L 감쇠가 공짜로 어둡게 함)와
// 옅은 유령 줄무늬 #6B6558(STRIPE_COLOR와 명도가 가까워 64px에서 살아남지 못함 — advisor 지시로 드롭).

// v4: 10 -> 20. 줄무늬를 전 방위 주기 패턴으로 바꾸려면 섹터가 충분히 많아야 한다(아래 참조).
// 덩달아 물방울 실루엣도 매끈해진다 — 360tri는 예산(8000tri)의 4.5%였다.
const KERNEL_SEGMENTS = 20;
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
// ★v4 (2026-08-26 쇼케이스 재감사 — "줄무늬 소실") ─────────────────────────────────────────
// v3까지 줄무늬는 **한 방위에 고정된 섹터 밴드**였다(sectorCenter ± 1칸, 링 2~5). 눕힌 좌표계의
// "위"에 한 줄만 있으니 턴테이블을 돌리면 그 한 줄이 알의 등 뒤로 넘어가고, 남는 건 N·L 음영뿐이라
// 8각도 중 대부분에서 "무늬 없는 갈색 아몬드"로 읽혔다. **마스크가 방위 고정이면 보이는 방위도
// 고정된다** — 이게 근본 원인이고, 폭·링을 어떻게 조절해도 안 풀린다.
//
// 해법: 줄무늬를 **원주 방향 주기 패턴**으로 깐다. 극점을 제외한 모든 링에서 컬럼 인덱스가
// STRIPE_PERIOD의 배수인 것만 마킹하면, 길이축을 따라 흐르는 줄이 원주에 4줄 생긴다.
// 어느 방위에서 봐도 보이는 반원(180도)에 줄 2개가 걸린다 — 방위 의존이 사라진다.
//
// 폭 계산: buildRevolvedShell의 측면 삼각형 2장은 둘 다 컬럼 s와 s+1을 함께 물므로
// (index.push가 a0+s, b0+s1, a0+s1 / a0+s, b0+s, b0+s1), **컬럼 1개를 마킹하면 섹터 2칸이
// 초록이 된다**. period 5 · segments 20 → 줄 4개 × 2칸(36도) = 원주의 40%가 줄무늬,
// 나머지 60%가 몸통. 마킹 컬럼을 늘리지 않고도 줄이 충분히 굵다(64px에서 알 폭의 ~1/5).
//
// 극점 정점은 마킹하지 않는다 — 마킹하면 팬 삼각형 전체가 걸려 끝이 통째로 물든다. 대신 링 1의
// 마킹 컬럼이 팬 삼각형 2장씩을 끌고 들어가 **줄이 끝에서 수렴**한다(실제 씨앗의 무늬와 같다).
//
// 프롬프트 정합: JSON은 "faint ghost-pale stripe (#6B6558) tracing the kernel's long axis"라고
// 한 줄로 서술하지만, negative의 "striped hull"은 껍질째 씨앗을 그리지 말라는 이미지 생성 지시다.
// 색은 프롬프트 hex 그대로(#8C8478 하이라이트 / #4A4640 몸통)를 쓰고, **한 줄 -> 주기 4줄**은
// 방위 독립을 얻기 위한 조형 결정이다(팀리드 지시).
const STRIPE_PERIOD = 5; // 컬럼 5칸마다 1칸 마킹 => 줄 4개
const STRIPE_PHASE = 0; // 컬럼 10(= sectorCenter, 눕힌 뒤 "위")이 10 % 5 === 0이라 줄 하나가 정수리에 온다

const JITTER_AMP = 0.011; // R2: segments 10->20이면 컬럼 간격이 절반 — 0.018에서 내렸다.
// 실측 여유: 최소 링 반지름 0.35*0.5=0.175, 컬럼 간격 2π·0.175/20=0.055 > 지터 진폭 0.011.

function buildKernel(rng: () => number): { bodyGeo: THREE.BufferGeometry; stripeGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, KERNEL_SEGMENTS, KERNEL_HALF_LENGTH, () => [
    KERNEL_RADIUS,
    KERNEL_RADIUS,
  ]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  // 주기 줄무늬 마스크 — 극 링(정점 1개)은 건너뛰고, 나머지 모든 링에서 같은 컬럼 집합을 찍는다.
  // 같은 컬럼이 링을 관통해 이어지므로 길이축을 따라 흐르는 줄이 된다. ringStart는
  // buildRevolvedShell이 계산해 준 값 그대로 쓴다(좌표 임계값 재발명 금지, CRIB).
  const mask = new Uint8Array(pos.count);
  for (let ri = 0; ri < PROFILE.length; ri++) {
    if (PROFILE[ri][0] <= 1e-6) continue; // 극점
    const base = ringStart[ri];
    for (let s = STRIPE_PHASE; s < KERNEL_SEGMENTS; s += STRIPE_PERIOD) mask[base + s] = 1;
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
//
// ★v3 (2026-08-26, 64px 판독 — 색 + 배치 두 축을 같이 써야 풀렸다)
//
// v1: 3알이 **전부 같은 배색**이라 낱알 경계가 사라지고 하나의 하트 실루엣으로 뭉쳤다.
//     `flaxseed`가 거의 같은 "1+n 겹침" 구성인데 통과한 이유는 낱알 사이 **명도 대비**로
//     틈새(네거티브 스페이스)가 살아 있었기 때문 — 판독 검사가 그 A/B를 그대로 짚었다.
// v2: `flipBuckets`로 b만 뒤집어 명암을 교대시켰다. b와 나머지는 갈렸지만
//     **a·c가 둘 다 밝은 채로 서로 접해** 여전히 "낱알 2개"로 읽혔다.
//
// ★v3에서 구조적 한계를 확인했다: **머티리얼 2개로는 삼각 배치의 세 알을 못 가른다.**
// 삼각형은 세 쌍이 전부 인접이라 2색으로 칠하면 **반드시 한 쌍이 같은 색**이 된다
// (그래프 채색의 하한 — 삼각형의 채색수는 3). 색을 아무리 잘 배정해도 못 이긴다.
//
// **그래서 인접 자체를 끊었다.** 삼각 배치 → **선형 배치**로 바꾸고 어두운 b를 가운데 놓으면
// 인접 쌍이 a–b와 b–c 둘뿐이고 **양쪽 다 명암이 갈린다**(경로 그래프는 2색으로 칠해진다).
// 좌우로도 더 벌려 톤이 아니라 간격으로도 경계가 서게 했다. tri 0 증가.
interface KernelDef {
  offset: readonly [number, number];
  yaw: number;
  tiltZ: number;
  /** true면 몸통·줄무늬 색을 서로 바꿔 이웃 알과 명도를 갈라 놓는다 */
  flipBuckets: boolean;
}
// 어두운 b가 **가운데** — 밝은 a·c가 서로 안 닿는다. y(=world Z) 미세 차이로 뻣뻣한 일렬을 피한다.
const KERNELS: Record<'a' | 'b' | 'c', KernelDef> = {
  a: { offset: [-0.74, 0.20], yaw: -0.4, tiltZ: 0.0, flipBuckets: false },
  b: { offset: [0.02, -0.14], yaw: 1.6, tiltZ: 0.12, flipBuckets: true },
  c: { offset: [0.76, 0.16], yaw: 0.45, tiltZ: 0.0, flipBuckets: false },
};

export const createSunflowerseed: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const stripeMat = stdMaterial({ color: STRIPE_COLOR });

  const cluster = new THREE.Group();

  (Object.keys(KERNELS) as (keyof typeof KERNELS)[]).forEach((key) => {
    const def = KERNELS[key];
    const { bodyGeo, stripeGeo } = buildKernel(rng);
    const kernel = new THREE.Group();
    // 배정만 뒤집는다 — 머티리얼 인스턴스는 둘 그대로라 mergeByMaterial의 ≤2 계약이 유지된다
    kernel.add(new THREE.Mesh(bodyGeo, def.flipBuckets ? stripeMat : bodyMat));
    kernel.add(new THREE.Mesh(stripeGeo, def.flipBuckets ? bodyMat : stripeMat));
    cluster.add(placeAndGround(kernel, def.offset, def.yaw, def.tiltZ));
  });

  return mergeByMaterial(cluster);
};
