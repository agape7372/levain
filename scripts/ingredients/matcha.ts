// 말차 — 가루 원뿔 둔덕 + 앞쪽으로 흩어진 낮은 더스팅. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/matcha.json(워크스페이스 원본은
// assets/ingredients/work/matcha/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// cinnamon.ts의 가루 둔덕(buildRevolvedShell + 굵은 지터)을 그대로 계승하되, 말차는 단일
// 피사체라 계피처럼 "가루색이 다른 파트와 붙는" 문제가 없다 — 대신 팀리드 지시대로 채도를
// 최대한 높여(#5C8A3A) 도감의 다른 초록 계열(로즈마리)과 갈리게 했다. 원뿔 몸통을 2버킷으로
// 나누지 않고(피크 링 밴드만 밝은 버킷) 앞쪽 더스팅 둔덕 전체를 같은 밝은 버킷에 배정해
// mesh<=2를 지킨다 — 계피의 "가루가 스틱 캡과 같은 텍스처 버킷을 공유" 패턴을 텍스처 없이
// 순색 버킷으로 반복한 것.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, pickTriangles, splitTrianglesByVertexMask, stdMaterial, uvDome } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/matcha.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0x5c8a3a; // "a vivid matcha green body"
const HIGHLIGHT_COLOR = 0xa8cb7e; // "a paler sifted dusting" — 원뿔 피크 링 밴드 + 앞쪽 더스팅 둔덕 전체에 공유
// 드롭: 그늘진 초록 #446B29(N·L 감쇠가 공짜로 만든다, olive 아랫면 드롭 선례)와
// 밝은 초록 #7FAE55(피크 하이라이트 버킷 HIGHLIGHT_COLOR로 대체 — 4색을 2버킷으로 압축).

const CONE_SEGMENTS = 14;
const CONE_RADIUS = 0.5;
const CONE_HALF_HEIGHT = 0.72; // v2(cmp-1 판정 후): 0.42는 너무 낮고 둥글어 "돔"으로 읽혔다 —
// matcha.png 실측은 뾰족한 피라미드형 원뿔이라 높이:반지름을 1.4:1까지 올렸다.
const CONE_JITTER_AMP = 0.025; // 굵은 지터 — 얇은 파트가 아니므로 R4 미적용(cinnamon powder 선례).
// v2: 원뿔이 뾰족해진 만큼 살짝 낮춤(뾰족한 능선이 과한 지터에 뭉개지지 않도록).

type ProfilePoint = readonly [number, number];
// 바닥은 열린 링(포즈 없음, 절대 안 보임 — cinnamon POWDER_PROFILE과 동일 관례로 하부 캡 생략),
// 완만하게 벌어지는 어깨 -> 둥글게 좁아지는 피크(단조 유지, types.ts §8).
// v2: 어깨 플레어를 줄이고(0.98->0.94) 피크 쪽 프로필을 더 가파르게 당겨 실루엣을 돔이 아닌
// 원뿔로 만들었다.
const CONE_PROFILE: readonly ProfilePoint[] = [
  [0.85, -1.0],
  [0.94, -0.72],
  [1.0, -0.4],
  [0.78, 0.05],
  [0.48, 0.42],
  [0.2, 0.74],
  [0.0, 1.0],
];
// 피크 하이라이트 — 극점 링 1개만(cmp-1 판정: 3개 링은 몸통 절반 가까이를 물들여 "원뿔+캡" 대신
// "이색 반구"로 읽혔다). 극점(ri=6)을 마킹하면 그 아래 팬 밴드 전체가 OR-of-3-vertices로 자동
// 물든다 — 그것만으로 "피크가 밝다"는 충분히 전달된다(CRIB "링 1개가 최소 단위" 규칙).
const HIGHLIGHT_RING_INDICES: readonly number[] = [6];

const DUST_SEGMENTS = 10;
const DUST_RADIUS = 0.3;
const DUST_ASPECT = 1.7; // radialScale sz/sx — 원뿔 밑동에서 카메라 쪽(+Z)으로 길게 흘러나온
// 타원 자국으로 만든다(둥근 미니 원뿔 두 번째 피크로 안 보이게, cmp-1 판정 후 v2).
const DUST_HALF_HEIGHT = 0.09; // v2: 0.14 -> 0.09로 더 납작하게 — "흘러 퍼진 가루"이지 두 번째 봉우리가 아니다.
const DUST_JITTER_AMP = 0.018;
const DUST_PROFILE: readonly ProfilePoint[] = [
  [0.75, -1.0],
  [1.0, -0.2],
  [0.5, 0.5],
  [0.15, 0.8],
  [0.0, 1.0],
];

/** 원뿔 몸통 — buildRevolvedShell + 굵은 지터 + facet. 피크 링 인덱스로 하이라이트 버킷 분리
 * (올리브 CAP_RING_INDICES 패턴, 섹터 제한 없이 링 전체 — "피크 전체가 밝다"이므로). */
function buildCone(rng: () => number): { bodyGeo: THREE.BufferGeometry; highlightGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(CONE_PROFILE, CONE_SEGMENTS, CONE_HALF_HEIGHT, () => [CONE_RADIUS, CONE_RADIUS]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  const mask = new Uint8Array(pos.count);
  for (const ri of HIGHLIGHT_RING_INDICES) {
    const base = ringStart[ri];
    const count = ri === CONE_PROFILE.length - 1 && CONE_PROFILE[ri][0] <= 1e-6 ? 1 : CONE_SEGMENTS;
    for (let s = 0; s < count; s++) mask[base + s] = 1;
  }

  jitterVertices(geometry, rng, CONE_JITTER_AMP);

  const originalIndex = (geometry.index as THREE.BufferAttribute).array as ArrayLike<number>;
  const baked = facet(geometry);
  const { trueTris, falseTris } = splitTrianglesByVertexMask(originalIndex, mask);

  const highlightGeo = pickTriangles(baked, trueTris);
  const bodyGeo = pickTriangles(baked, falseTris);
  uvDome(highlightGeo);
  uvDome(bodyGeo);
  return { bodyGeo, highlightGeo };
}

function buildDustMound(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(DUST_PROFILE, DUST_SEGMENTS, DUST_HALF_HEIGHT, () => [DUST_RADIUS, DUST_RADIUS * DUST_ASPECT]);
  jitterVertices(geometry, rng, DUST_JITTER_AMP);
  const baked = facet(geometry);
  uvDome(baked);
  return baked;
}

/** child를 offset/yaw로 배치하고 그 자신의 회전 후 bbox로 y=0에 맞춘다 (R1, cinnamon.ts와 동일). */
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

export const createMatcha: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const highlightMat = stdMaterial({ color: HIGHLIGHT_COLOR });

  const cluster = new THREE.Group();

  const { bodyGeo, highlightGeo } = buildCone(rng);
  const cone = new THREE.Group();
  cone.add(new THREE.Mesh(bodyGeo, bodyMat));
  cone.add(new THREE.Mesh(highlightGeo, highlightMat));
  cluster.add(placeAndGround(cone, [0, 0], 0.2));

  // 더스팅 둔덕 — 원뿔 밑동에 발을 걸치듯 짧게(+Z, 카메라 쪽)만 흘린다(advisor: "keep it short" —
  // 너무 멀리 두면 전체 바운드가 커져 64px에서 원뿔 자체가 작아진다). v2: 원뿔과 분리된 별도
  // 둔덕이 아니라 밑동에서 흘러나온 자국처럼 보이도록 오프셋을 원뿔 반지름 안쪽으로 당겼다.
  const dustMesh = new THREE.Mesh(buildDustMound(rng), highlightMat);
  cluster.add(placeAndGround(dustMesh, [0.08, 0.48], -0.15));

  return mergeByMaterial(cluster);
};
