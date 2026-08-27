// 말차 — 가루 원뿔 둔덕 + 밑동에 흘러내린 가루. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/matcha.json(워크스페이스 원본은
// assets/ingredients/work/matcha/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// cinnamon.ts의 가루 둔덕(buildRevolvedShell + 굵은 지터)을 그대로 계승하되, 말차는 단일
// 피사체라 계피처럼 "가루색이 다른 파트와 붙는" 문제가 없다 — 대신 팀리드 지시대로 채도를
// 최대한 높여(#5C8A3A) 도감의 다른 초록 계열(로즈마리)과 갈리게 했다. 원뿔 몸통을 2버킷으로
// 나누지 않고(피크 링 밴드만 밝은 버킷) 흘러내린 가루 전체를 같은 밝은 버킷에 배정해
// mesh<=2를 지킨다.
//
// ═══ v3 (2026-08-27 정체 수리) — 되돌리지 말 것 ═══════════════════════════════════════════
// 재감사 판정: **"각진 원뿔 + 판때기"**. 두 갈래로 원인이 달랐다.
//
// 1. 각진 원뿔 — 세그먼트 14. 재료 예산이 8000tri로 상향됐는데(types.ts R2) 224tri만 쓰고 있었다.
//    전체 화면 쇼케이스에서 능선 14개가 그대로 다각형으로 보였다. 세그먼트 14 -> 30,
//    프로필 링 7 -> 10(어깨-피크 사이 hFrac 간격 0.45가 꺾임으로 보였다). 510tri.
//    ★R2 짝규칙: 세그먼트를 올리면 지터를 내려야 극 팬이 뒤집힌다. 그런데 파일 전체 진폭을
//    내리면 몸통의 "알갱이" 단서가 같이 죽는다(가루 재료의 유일한 표면 단서다) — 그래서
//    상수 하나를 내리는 대신 **링별로 컬럼 간격에 맞춰 깎는** 로컬 헬퍼(jitterByRing)를 썼다.
//    몸통은 0.020(구 0.025, CRIB 명도 침식 실측 0.025의 연장선), 극 근처 링은 자동으로 0.008까지
//    내려간다. 극점 자신은 진폭 0 — 축에서 안 벗어나므로 팬이 원리적으로 안 뒤집힌다.
//
// 2. "판때기" — 이건 접시가 아니다. 프롬프트 JSON은 **"plate"·"board"를 negative로 명시 금지**하고
//    (assets/prompts/ingredients/matcha.json negative), 형태 정본은 "a thin trailing scatter of
//    loose powder spilling forward from its base"다. v2가 그 흘러내린 가루를 반지름 0.3 ×
//    aspect 1.7 · 반높이 0.09짜리 **매끈한 납작 타원 한 장**으로 지었고, 프로필의 최대 반지름이
//    거의 바닥(hFrac -0.2)에 있어 **칼날 같은 림**이 생겼다 — 그게 옆에 놓인 판때기로 읽힌 실체다.
//    (팀리드 지시는 "접시로 읽히는 단서를 보강"이었는데, 그 방향은 정본의 negative와 정면 충돌한다.
//     CRIB「정본과 충돌하면 정본이 이긴다」에 따라 **가루로 읽히게** 고쳤다. 보고에 명시.)
//    고친 축 셋: (a) 프로필을 최대 반지름이 중간 아래에 오는 **둥근 조약돌 단면**으로 바꿔 림 칼날
//    제거, (b) 납작 타원 1장 -> 크기 다른 **둔덕 2개**로 나눠 "쏟아진 가루"의 불규칙성을 실루엣에
//    싣고 단일 판 실루엣을 깨뜨림, (c) aspect 1.7 -> 1.32로 낮춰 한 방향으로 늘어난 판 느낌을 줄임.
//    ⚠ 개수를 더 늘리지 마라 — CRIB 크랜베리 함정(뭉쳐서 얼룩)에 반대로 걸린다. 2개가 상한이다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, mergeByMaterial, pickTriangles, scaleHex, splitTrianglesByVertexMask, stdMaterial, uvDome } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/matcha.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_SRC = 0x5c8a3a; // "a vivid matcha green body"
const HIGHLIGHT_COLOR = 0xa8cb7e; // "a paler sifted dusting" — 원뿔 피크 링 밴드 + 흘러내린 가루 둔덕 전체에 공유
// 렌더 노출 보정 — types.ts §7의 "JSON에 없는 색은 scaleHex 결정론 유도 + 출처 주석" 경로
// (lemon.ts 과육이 같은 이유로 이미 쓰고 있다). 실측: hex를 그대로 쓴 v2 렌더의 몸통 평균이
// az=0에서 #4D6426, az=180에서 #39501E였다 — 의도한 #5C8A3A의 각각 72%·55%다. 원뿔은
// 사면이 전부 키라이트에서 기울어 있어(N·L) 정본 hex를 그대로 쓰면 "짙은 숲녹색 덩어리"가 되고,
// "vivid matcha green"이라는 정체 단서가 사라진다. 지터를 내리는 CRIB 처방(명도 침식)은 여기선
// 효과가 없었다 — 0.025 -> 0.020으로 내려도 평균이 #4C6325로 사실상 그대로였다(1 LSB 차이).
// ⚠ 1.35가 천장이다(G채널 0x8A=138 × 1.35 = 186, 그 위는 색상이 라임으로 틀어진다).
const BODY_COLOR = scaleHex(BODY_SRC, 1.2); // -> #6EA645
// 드롭: 그늘진 초록 #446B29(N·L 감쇠가 공짜로 만든다, olive 아랫면 드롭 선례)와
// 밝은 초록 #7FAE55(피크 하이라이트 버킷 HIGHLIGHT_COLOR로 대체 — 4색을 2버킷으로 압축).

const CONE_SEGMENTS = 30; // v3: 14 -> 30. 전체 화면에서 능선 14개가 다각형으로 보였다(R2 예산 여유 충분)
const CONE_RADIUS = 0.5;
const CONE_HALF_HEIGHT = 0.72; // v2(cmp-1 판정 후): 0.42는 너무 낮고 둥글어 "돔"으로 읽혔다 —
// matcha.png 실측은 뾰족한 피라미드형 원뿔이라 높이:반지름을 1.4:1까지 올렸다.
const CONE_JITTER_AMP = 0.020; // v3: 0.025 -> 0.020. 세그먼트를 2배 이상 올렸으니 R2 짝규칙대로 내린다.
// 극 근처 링은 jitterByRing이 컬럼 간격에 맞춰 여기서 더 깎는다(최소 0.008 수준).
const JITTER_SPACING_FRAC = 0.45; // 링 진폭 상한 = 이 값 × 컬럼 간격(2π·r/segments). 극 팬 반전 방지

type ProfilePoint = readonly [number, number];
// 바닥은 열린 링(포즈 없음, 절대 안 보임 — cinnamon POWDER_PROFILE과 동일 관례로 하부 캡 생략),
// 완만하게 벌어지는 어깨 -> 곧은 사면 -> 둥글게 좁아지는 피크(높이 단조 유지, types.ts §8).
// v3: 링 7 -> 10. 어깨(-0.42)와 사면 중턱(0.05) 사이가 hFrac 0.47이나 비어 있어 그 한 밴드가
// 통째로 꺾임(어깨 각)으로 보였다. 사면 기울기를 거의 일정하게 유지한다.
// ★v3 r2: 최대 반지름을 hFrac -0.42에서 **-0.84(발 바로 위)**로 내렸다. v2 프로필은 몸통 중턱이
// 최대라 실루엣이 배흘림 달걀 — 렌더가 원뿔이 아니라 **아보카도**로 읽혔다("각진 원뿔" 판정의
// 나머지 절반이 세그먼트가 아니라 이 배부름이었다). 발에서 피크까지 반지름이 단조 감소하는
// 곧은 사면 + 마지막 두 링만 둥근 피크(정본 "gently rounded peak") 구성으로 바꿨다.
const CONE_PROFILE: readonly ProfilePoint[] = [
  [0.96, -1.0],
  [1.0, -0.84],
  [0.92, -0.6],
  [0.83, -0.36],
  [0.73, -0.12],
  [0.62, 0.14],
  [0.5, 0.38],
  [0.37, 0.6],
  [0.22, 0.8],
  [0.0, 1.0],
];
// 피크 하이라이트 — 극점 링 1개만(cmp-1 판정: 3개 링은 몸통 절반 가까이를 물들여 "원뿔+캡" 대신
// "이색 반구"로 읽혔다). 극점을 마킹하면 그 아래 팬 밴드 전체가 OR-of-3-vertices로 자동 물든다
// (CRIB "링 마스크 — 최소와 확장" 절: 여기서는 링 1개가 정답이었던 실측을 유지한다).
// 프로필 링을 늘려도 극점 인덱스가 따라가도록 하드코딩하지 않는다.
const HIGHLIGHT_RING_INDICES: readonly number[] = [CONE_PROFILE.length - 1];

const DUST_SEGMENTS = 18; // v3: 10 -> 18. 원뿔과 같은 이유(각진 실루엣) + 둔덕이 작아 tri 비용이 싸다
// v3: 최대 반지름을 중간 아래(-0.18)로 올리고 바닥 링을 0.60으로 조여 **둥근 조약돌 단면**으로
// 바꿨다. v2 프로필은 최대 반지름이 거의 바닥(-0.2)에 붙어 있어 옆에서 보면 얇은 판의 칼날 림이
// 그대로 실루엣이 됐다 — "판때기" 판정의 실체가 이것이다.
const DUST_PROFILE: readonly ProfilePoint[] = [
  [0.6, -1.0],
  [0.88, -0.62],
  [1.0, -0.18],
  [0.86, 0.22],
  [0.62, 0.52],
  [0.34, 0.78],
  [0.0, 1.0],
];
const DUST_JITTER_AMP = 0.014; // 원뿔보다 작은 파트라 비례해 낮춘다(같은 상대 거칠기)

interface DustLobe {
  readonly radius: number;
  readonly aspect: number; // radialScale sz/sx — 흐르는 방향으로만 살짝 길다
  readonly halfHeight: number;
  readonly offset: readonly [number, number];
  readonly yaw: number;
}
// 흘러내린 가루 — 크기 다른 둔덕 2개. 둘 다 원뿔 발(반지름 0.425~0.47)에 걸치도록 중심 거리를
// 0.45 근처로 잡았다: 축 쪽 절반은 원뿔에 묻히고 바깥쪽만 보이므로 "밑동에서 흘러나온 자국"으로
// 읽힌다(떨어져 놓으면 두 번째 봉우리가 된다 — v2 cmp-1 실측). 크기를 달리해야 대칭 쌍둥이로
// 안 보인다. ⚠ 3개 이상으로 늘리지 마라(CRIB 크랜베리 함정).
//
// ★배치는 **방위각 커버리지**로 정한다 — 쇼케이스는 턴테이블이고 가루는 이 자산의 유일한
// "가루" 단서다. 두 둔덕의 XZ 방위(atan2(z,x))가 서로 가까우면 그 반대편 각도에서 둘 다 원뿔에
// 가려 초록 원뿔만 남는다. v3 r2 실측: 82.6°/132.3°(간격 50°)에서 az 195~285 전 구간이
// 가루 없는 렌더였다. r3에서 작은 둔덕을 185°로 옮겨 간격을 ~100°로 벌렸다 — 카메라의 가시
// 반원(180°)에 최소 하나는 항상 들어온다. 오프셋을 만지면 이 방위 간격을 다시 재라.
const DUST_LOBES: readonly DustLobe[] = [
  { radius: 0.27, aspect: 1.32, halfHeight: 0.12, offset: [0.06, 0.46], yaw: -0.12 }, // 방위 82.6°
  { radius: 0.16, aspect: 1.25, halfHeight: 0.075, offset: [-0.44, -0.04], yaw: 0.5 }, // 방위 185.2°
];

/**
 * 링별 지터 — 진폭을 그 링의 컬럼 간격(≈2π·r/segments)에 비례해 깎는다.
 *
 * types.ts R2("세그먼트를 올리면 지터 진폭도 같이 내려라")를 **파일 전체 상수 하나를 내리는 대신**
 * 링 단위로 지키기 위한 빌더 로컬 헬퍼(lib.jitterVertices는 전 정점 균일 — lib.ts는 불가침).
 * 가루 재료는 굵은 지터가 유일한 표면 단서라 몸통 진폭을 살려야 하고, 그러면서도 극 근처
 * 좁은 링은 간격을 넘는 진폭에서 팬 삼각형이 뒤집힌다. 극점(r=0)은 간격 0 -> 진폭 0이 되어
 * 축에서 아예 안 움직인다.
 *
 * minRadius: radialScale이 타원이면 **작은 쪽 반지름**을 넘겨야 간격 추정이 보수적이다.
 */
function jitterByRing(
  geometry: THREE.BufferGeometry,
  ringStart: readonly number[],
  profile: readonly ProfilePoint[],
  segments: number,
  rng: () => number,
  ampBase: number,
  minRadius: number,
): void {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let ri = 0; ri < profile.length; ri++) {
    const rFrac = profile[ri][0];
    const spacing = (2 * Math.PI * rFrac * minRadius) / segments;
    const amp = Math.min(ampBase, JITTER_SPACING_FRAC * spacing);
    const count = rFrac <= 1e-6 ? 1 : segments;
    for (let s = 0; s < count; s++) {
      const i = ringStart[ri] + s;
      pos.setXYZ(
        i,
        pos.getX(i) + (rng() - 0.5) * 2 * amp,
        pos.getY(i) + (rng() - 0.5) * 2 * amp,
        pos.getZ(i) + (rng() - 0.5) * 2 * amp,
      );
    }
  }
  pos.needsUpdate = true;
}

/** 원뿔 몸통 — buildRevolvedShell + 링별 지터 + facet. 피크 링 인덱스로 하이라이트 버킷 분리
 * (올리브 CAP_RING_INDICES 패턴, 섹터 제한 없이 링 전체 — "피크 전체가 밝다"이므로). */
function buildCone(rng: () => number): { bodyGeo: THREE.BufferGeometry; highlightGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(CONE_PROFILE, CONE_SEGMENTS, CONE_HALF_HEIGHT, () => [CONE_RADIUS, CONE_RADIUS]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  const mask = new Uint8Array(pos.count);
  for (const ri of HIGHLIGHT_RING_INDICES) {
    const base = ringStart[ri];
    const count = CONE_PROFILE[ri][0] <= 1e-6 ? 1 : CONE_SEGMENTS;
    for (let s = 0; s < count; s++) mask[base + s] = 1;
  }

  jitterByRing(geometry, ringStart, CONE_PROFILE, CONE_SEGMENTS, rng, CONE_JITTER_AMP, CONE_RADIUS);

  const originalIndex = (geometry.index as THREE.BufferAttribute).array as ArrayLike<number>;
  const baked = facet(geometry);
  const { trueTris, falseTris } = splitTrianglesByVertexMask(originalIndex, mask);

  const highlightGeo = pickTriangles(baked, trueTris);
  const bodyGeo = pickTriangles(baked, falseTris);
  uvDome(highlightGeo);
  uvDome(bodyGeo);
  return { bodyGeo, highlightGeo };
}

function buildDustMound(lobe: DustLobe, rng: () => number): THREE.BufferGeometry {
  const { geometry, ringStart } = buildRevolvedShell(DUST_PROFILE, DUST_SEGMENTS, lobe.halfHeight, () => [lobe.radius, lobe.radius * lobe.aspect]);
  jitterByRing(geometry, ringStart, DUST_PROFILE, DUST_SEGMENTS, rng, DUST_JITTER_AMP, lobe.radius);
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

  for (const lobe of DUST_LOBES) {
    const mesh = new THREE.Mesh(buildDustMound(lobe, rng), highlightMat);
    cluster.add(placeAndGround(mesh, lobe.offset, lobe.yaw));
  }

  return mergeByMaterial(cluster);
};
