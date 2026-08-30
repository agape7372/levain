// 초코칩 스콘 — img2threejs 스킬 정규 파이프라인(state.py 게이트 + 패스별 자가교정)으로
// 재제작(2026-08-30, v2 라운드). 계약은 types.ts 주석이 정본.
//
// 절차 기록: assets/breads/work/scone--choco-chip-v2/ — state.py init → image-analysis →
// reference-suitability/admission → local-spec-search → pre-spec-assessment(complexity=simple,
// CRIB 스킵 4종: detail-inventory·projection-route·material-evidence·material-spec-wiring 전부
// --reason 기록) → author_spec.py → validate_sculpt_spec --strict-quality(PASS) →
// generate_threejs_factory(blockout pass 스캐폴드, createSconeChocoChipModel.ts) → 이 파일로 어댑트
// → breadlab-shot 렌더·비교·append_review(6패스 각 1회 이상). object-sculpt-spec.json이 수치·
// 재질·리뷰 기록 정본이고, assets/breads/specs/scone--choco-chip.json에 보존한다.
//
// 유래: 실루엣(OUTLINE)·프로필(BODY_PROFILE/FACE_PROFILE)·균열·칩 치수는 베이스
// `scripts/breads/scone.ts`(스펙 scone.json)와 이전 라운드 산출물에서 **수치만** 전사했다
// (docs/BREADS.md 변형 규칙 — 계승 대상은 아웃라인·프로필 상수이지 절차가 아니다). 이번 라운드는
// 그 수치를 이번 스펙(object-sculpt-spec.json)의 componentTree/featureReviewTargets에 다시 못박고
// 실제 렌더·비교·리뷰 게이트를 통과시킨 것이 이전 라운드와의 차이다.
//
// ── 마감 계약 (docs/BREADS.md 2026-08-30 개정 — 스무스 클레이 정본) ──────────────────────
// 셸(반죽)은 indexed에서 computeVertexNormals() → toNonIndexed() (순서 필수, 스펙
// wedge-body/wedge-top-face의 normalStrategy와 동일). 초코 청크만 예외로 facet()(플랫 노멀) —
// 근거는 스펙 choc-chunk.topologyRationale: 딱딱한 인클루전과 부드러운 반죽의 재질 대비가
// 레퍼런스의 의도된 디자인이다.
import * as THREE from 'three';
import type { BreadBuilder } from './types';
import { bakeTexture, facet, mergeByMaterial, stdMaterial } from './lib';

// 팔레트 — assets/prompts/breads/scone--choco-chip.json geometry.crust 손 전사 (JSON import 금지, types.ts §8)
const TOP_COLOR = 0xd6a15c; // "top face only in pale golden brown #D6A15C"
const SIDE_COLOR = 0xf4ead4; // "side faces plain cream #F4EAD4"
const CHIP_COLOR = 0x3b2418; // "solid chocolate chunks #3B2418 (warm dark brown)"

// TOP/SIDE는 렌더 파리티 보정 없음 — 조명 리그가 정본 hex를 오차 0%로 재현(2026-08-30 재보정,
// docs/BREADS.md 결정 이력). 그 재보정 유도식은 **평면·단일 노멀(+Y) 면**을 전제한 것이라
// (breadlab.ts 조명 주석 참조) 초코 청크(facet, 다면 노멀)에는 그대로 안 맞는다 — 실측으로 확인됨.
const TOP_ALBEDO = TOP_COLOR;
const SIDE_ALBEDO = SIDE_COLOR;
// ⚠ 품질 라운드 4 — 청크 재질 전용 렌더 타깃(팀장 지시: "전역 게인 금지, 정본 hex 유지, 3쌍 기록").
// 실측 3쌍: {알베도 #3B2418(정본, 그대로 유지) → 무보정 렌더 평균 #3b2418(실측, 시프트 0 —
// 다면 페이싯 대부분이 그림자 쪽이라 밝은 하이라이트가 거의 안 잡힘) → 목표(레퍼런스 청크 영역
// 픽셀 평균, work/measure_chunk_color2.py) #773c1f}. CHIP_COLOR(정본 hex, 스펙·주석용)는
// 그대로 두고 **머티리얼에 실제로 먹이는 값만** 이 보정 타깃으로 교체 — 전역 라이팅이나 다른
// 재질에는 손대지 않는다(청크 로컬 보정, 전역 게인 아님).
const CHIP_RENDER_COLOR = 0x773c1f;

// ── 실루엣·프로필 — object-sculpt-spec.json componentTree[wedge-body/wedge-top-face].geometryDescriptor
// 전사(스펙 latheProfile.points, deformationStack.outline-lookup). 유도 과정은 base scone.ts와
// work/scone/outline_gen.py에 있다.
const OUTLINE_BASE: readonly (readonly [number, number])[] = [
  [0.1882, -0.4788], // apex_l
  [0.2918, -0.322], // left_edge_0
  [0.3954, -0.1652], // left_edge_1
  [0.4989, -0.0084], // left_edge_2
  [0.6025, 0.1485], // left_edge_3
  [0.659, 0.234], // bl_toward_apex
  [0.98, 0.72], // back_left_tip
  [0.7112, 0.7284], // bl_toward_arc
  [0.02, 0.85], // arc_mid
  [-0.6712, 0.7716], // br_toward_arc
  [-0.94, 0.78], // back_right_tip
  [-0.685, 0.276], // br_toward_apex
  [-0.6027, 0.1134], // right_edge_0
  [-0.5204, -0.0492], // right_edge_1
  [-0.4382, -0.2119], // right_edge_2
  [-0.3559, -0.3745], // right_edge_3
  [-0.311, -0.4632], // apex_r
  [-0.05, -0.66], // apex_tip
] as const;

// ── 조밀화 유틸 — CRIB.md "이전 판이 549tri로 밋밋했던 게 기각 사유" 교정. 원본 실루엣 폴리라인
// 위에 선형 보간으로 중간점만 끼워 넣는다(형태 왜곡 없음 — 같은 직선 위의 추가 표본일 뿐).
// 목표 tri대는 변형 빵 3000~5000(CRIB.md 예산표) — 저예산은 표면 질감·균열·크럼 결을 만들 정점이
// 없어 밋밋해진다는 실측 근거로 신설된 구간이다.
function subdivideLoop(points: readonly (readonly [number, number])[], perGap: number): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    out.push(a);
    for (let k = 1; k <= perGap; k++) {
      const t = k / (perGap + 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function subdivideChain(points: readonly (readonly [number, number])[], perGap: number): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (let k = 1; k <= perGap; k++) {
      const t = k / (perGap + 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    out.push(b);
  }
  return out;
}

// 18 → 36섹터(perGap=1). 균열 타겟팅·칩 링 조회는 전부 값 기반(exact-match/nearest)이라
// 원본 컨트롤 포인트만 보존하면 그대로 작동한다(아래 두 프로필도 동일 원칙).
const OUTLINE: readonly (readonly [number, number])[] = subdivideLoop(OUTLINE_BASE, 1);
const SEGMENTS = OUTLINE.length; // 36
// ── 웨지 두께(품질 라운드 3) — 실측: 레퍼런스 vs 렌더의 bbox 높이/폭 비 ─────────────────────
// 레퍼런스(scone--choco-chip.png) bbox 689x531 → H/W 0.771. 이전 렌더(shot-default-v5) bbox
// 336x320 → H/W 0.952 — 우리가 23.5% 더 두꺼웠다(work/measure_ridge3.py 실측. "실루엣 능선
// 폭 프로파일"로 벽/돔 경계를 분리하려 했으나 이 오브젝트는 뒤가 넓고 앞이 좁은 삼각 웨지라
// width(y)가 돔 곡률과 앞쪽 꼭짓점 테이퍼 둘 다에 영향받아 분리가 안 됨 — 그래서 오염 없는
// 지표인 **전체 bbox 높이/폭 비**로 대체). 목표 배율 = 0.771/0.952 ≈ 0.81.
// -2.png(정면뷰) 기반 이전 "0.47" 수치는 그 이미지가 생성 오류(웨지가 아닌 슬래브)라 오염된
// 근거였다(팀장 지적) — 이번 실측이 그걸 대체한다.
const HEIGHT_SCALE = 0.56;
const WEDGE_HEIGHT = 1.0 * HEIGHT_SCALE;

const BODY_PROFILE_BASE: readonly (readonly [number, number])[] = [
  [0.0, 0.0],
  [0.97, 0.0],
  [1.0, 0.04],
  [1.0, 0.2],
  [0.99, 0.48],
  [0.98, 0.82],
];
// 윗면 프로필 = 평평한 대지 + 둥근 어깨(2링 분리 — 스펙 wedge-top-face 참조). 총높이 0.933 /
// 폭 1.98 = 0.47 (스펙 silhouette.aspectRatios "height-over-width"와 일치, 정본 v5
// "height is roughly half its width" 충족).
const FACE_PROFILE_BASE: readonly (readonly [number, number])[] = [
  [0.98, 0.82], // 공유 림
  [0.94, 0.858], // 어깨 하단
  [0.87, 0.888], // 어깨 상단 — 꺾이는 지점
  [0.74, 0.912], // 대지 진입
  [0.6, 0.922],
  [0.45, 0.928],
  [0.3, 0.931],
  [0.15, 0.9325],
  [0.0, 0.933], // 크라운
];
// perGap=3: BODY 6→21링, FACE 9→33링. 반경 방향 조밀화라 크럼 결·균열 벽면 기울기 해상도가
// 오른다(원본 컨트롤 포인트는 정확히 보존되므로 FISSURE_RING_FRACS·faceRingIndex 값조회는 그대로 유효).
const BODY_PROFILE: readonly (readonly [number, number])[] = subdivideChain(BODY_PROFILE_BASE, 3);
const FACE_PROFILE: readonly (readonly [number, number])[] = subdivideChain(FACE_PROFILE_BASE, 3);
// 림(0.98, 0.82)이 두 번 들어간다(RIM_A / RIM_B) — 좌표는 같아 실루엣은 그대로지만 법선 평균이
// 두 벌 사이에서 끊겨 크러스트 모서리만 하드 크리스가 된다(스펙 wedge-crust-rim seam 참조).
const RINGS: readonly (readonly [number, number])[] = [...BODY_PROFILE, ...FACE_PROFILE];
const RIM_A = BODY_PROFILE.length - 1;
const RIM_B = RIM_A + 1; // RIM_A와 동일 좌표

/** 윗면 프로필의 rFrac으로 RINGS 인덱스를 찾는다(림 복제 때문에 인덱스를 손으로 세면 어긋난다). */
function faceRingIndex(rFrac: number): number {
  for (let i = RIM_B + 1; i < RINGS.length; i++) if (RINGS[i][0] === rFrac) return i;
  throw new Error(`face ring ${rFrac} 없음`);
}

// ── 색 경계(품질 라운드 2, 반복 2 — 팀장 정정 반영) ────────────────────────────────────
// ⚠ 1차 시도(hFrac 0.34, 골드:크림 65:35)는 **오판이었다** — 3/4 뷰의 "로컬 컬럼 높이"로 잰
// 비율에 윗면(돔) 투영 면적이 섞여 들어갔다. 레퍼런스를 다시 보면 옆면(수직 벽)은 위에서
// 아래까지 전부 크림이고, 3/4 뷰에서 골드가 넓어 보인 건 카메라가 위에서 내려다봐 윗면
// 투영 면적이 커서지 옆면 자체가 골드라서가 아니다. 되돌린다 — 색 경계는 RIM_A(hFrac 0.82,
// 물리적 크리스 링)에서 아주 살짝만 내린다. 레퍼런스에서 골드가 어깨를 넘어 옆면 최상단
// 모서리로 미세하게 흘러내리는 정도만 반영: BODY_PROFILE에서 RIM_A 바로 아래 링(hFrac 0.735,
// rFrac 0.9825)을 쓴다 — RIM_A(0.82)에서 0.085만 내려간 값, "옆면 대부분이 골드"가 되지
// 않도록 보수적으로 잡았다. 재실측이 필요하면 반드시 **옆면(수직 벽)만** — 윗면/옆면이 갈리는
// 실루엣 능선 아래쪽만 크롭해서 재야 한다(1차 실측의 실패 원인 재발 방지).
const COLOR_BOUNDARY_H = 0.75; // 최근접 매칭이 hFrac 0.735 링(RIM_A 바로 아래)을 고른다
function bodyRingIndexNearestH(targetH: number): number {
  let best = -1;
  let bestDelta = Infinity;
  for (let i = 0; i < RIM_A; i++) {
    const delta = Math.abs(BODY_PROFILE[i][1] - targetH);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return best;
}
const COLOR_BOUNDARY_RING = bodyRingIndexNearestH(COLOR_BOUNDARY_H);

// 안쪽 두 링(0.3·0.15)은 균열 후보에서 뺐다 — 극점 근처 정점 간격이 좁아 균일 변위가 상대적으로
// 커지고(수렴하는 링 함정, CRIB.md), 크라운을 별 모양으로 구긴다.
const FISSURE_RING_FRACS: readonly number[] = [0.87, 0.74, 0.6, 0.45];
// 정본 v5 "one or two soft crack fissures" — 2줄, 사이에 여백.
const FISSURE_TARGETS_Z: readonly number[] = [-0.48, -0.08];
const FISSURE_TOLERANCE = 0.18;
// HEIGHT_SCALE만큼 같이 줄인다 — 웨지 전체 두께가 낮아지는데 균열 깊이(Y축 절대값)를 그대로
// 두면 상대적으로 더 깊어 보인다(품질 라운드 3, 팀장 지시: "균열 깊이·크럼 진폭도 높이에
// 비례하므로 스케일 후 다시 읽히는지 확인"). 크럼은 반경(수평) 오프셋이라 무관 — 스케일 불필요.
const FISSURE_DEPTH = 0.06 * HEIGHT_SCALE; // 스펙 wedge-top-face.localFeatures[fissures] 정본
// ⚠ 반복 3(품질 라운드) 실측: 벽 기울기는 문제가 아니었다 — FACE_PROFILE 조밀화(perGap=3) 후
// 균열 링(rFrac 0.6 예시)과 인접 링 사이 반경차는 ~0.035~0.037(월드 단위), depth 0.06 기준
// atan(0.06/0.0365) ≈ 58.6°로 CRIB 30° 하한을 훨씬 넘는다(work 스크립트로 실측, 인접 양쪽 모두
// 58~60°). 그런데도 약해 보인 이유는 **폭**이다 — 조밀화 전에는 이 반경차가 훨씬 넓어(원 프로필
// 6~9점) 같은 깊이가 넓은 골을 만들었는데, 조밀화로 격자가 촘촘해지며 홈이 딱 1셀 폭(~0.035)의
// 바늘구멍이 됐다. 기울기는 충분해도 가시 면적이 없어 스무스 노멀 아래서 묻힌다. 그래서 깊이를
// 더 올리는 대신(과거 0.18 시도가 접힌 주름을 만든 전례가 있다) **인접 링도 부분 함몰시켜 폭을
// 넓힌다**(아래 dipFissures의 NEIGHBOR_DEPTH_FRACTION).
const FISSURE_NEIGHBOR_DEPTH_FRACTION = 0.55; // 인접 링(안쪽·바깥쪽 각 1개)에 얹는 깊이 비율
// 컷 페이스 크럼 — 스무스 마감에서 옆면이 평판 그라데이션이 되는 것을 authoring 파라미터로 교정
// (스펙 wedge-body.localFeatures[crumb-ridging]). 지터가 아니라 저주파 형상.
// 값 기반 범위 판정(ring 인덱스 하드코딩 금지) — BODY_PROFILE을 조밀화해도 안 깨진다.
// ⚠ 반복 1 실측: 원본 수치(0.04/0.01)는 18섹터×15링 밀도에서 튜닝된 것 — 조밀화(36섹터×54링)
// 후 같은 절대 진폭이 국소 정점 간격 대비 훨씬 커져 "결"이 아니라 "너덜너덜한 톱니"로 읽혔다
// (CRIB.md "판정은 국소 정점 간격 대비" 원칙 위반). 밀도 증가분만큼 진폭을 낮추고, 크럼은
// 링별 완전 독립난수 대신 섹터당 1회 뽑은 저주파 성분 + 작은 링별 잔차로 상관시켜 세로 결이
// 살아남게 했다(아래 makeCrumb).
// ⚠ 반복 3(품질 라운드) 실측: 반복 1 수정이 "톱니"는 잡았지만 과교정이라 결 자체가 거의 안
// 읽혔다(팀장 지적 — 정점만 있고 쓰는 디테일이 없는 상태). 상관 구조(섹터 공유 저주파 + 작은
// 잔차)는 유지한 채 진폭만 다시 올린다 — 톱니의 원인은 상관 없는 독립 잡음이었지 진폭 자체가
// 아니었다는 게 반복 1의 진단이었으므로, 상관 구조를 지키는 한 진폭을 올려도 재발하지 않는다.
// ⚠ 반복 4 실측(평균 벽 기울기 atan((2/3·amp)/arc), 섹터 호 길이 0.1224): amp=0.026→8.0°,
// amp=0.07→19.4°. 기하 계산 자체는 맞았지만 **전제가 틀렸다** — 팀장 정정: CRIB의 30° 규칙은
// "함몰 디테일이 읽히려면"의 기준이지 표면 질감이 따라야 할 목표가 아니다. 미세 크럼 결은
// 30°에 못 미쳐도 되고, 오히려 미달해야 "매끈한 크림 단면에 아주 옅은 결"로 자연스럽다.
// amp=0.07은 옆면에 골판지 같은 굵은 세로 주름을 만들어 기각됨 — 0.026~0.04 구간으로
// 되돌리고, 판정은 각도가 아니라 레퍼런스 옆에 놓고 눈으로 비교하는 것으로 한다.
const CRUMB_AMP = 0.035;
const CRUMB_RESIDUAL_AMP = 0.01; // 링별 미세 잔차 — 섹터 결 위에 얹는 잡음, 결을 지우지 않을 정도로 작다
// 품질 라운드 2: 색 경계가 COLOR_BOUNDARY_H로 내려왔으므로 크럼(크림 재질용 결)도 그
// 아래로만 — 지금부터 크림 색 영역과 크럼 텍스처 영역이 정확히 겹친다(재질-텍스처 일관성).
const CRUMB_H_RANGE: readonly [number, number] = [0.03, COLOR_BOUNDARY_H - 0.02]; // 바닥 극점만 제외, 색 경계 살짝 아래에서 멈춤
const WOBBLE_AMP = 0.02;
const SHELL_JITTER_AMP = 0.004; // 0.01 → 0.004 (조밀화 후 국소 정점 간격 대비 재보정, 반복 1 실측)
// ── 윗면 크러스트 미세 요철 — 반복 3 신설. 조밀화된 FACE_PROFILE(33링)이 이제까지 균열 2줄
// 말고는 완전히 무지 상태였다(팀장 지적: "정점은 있는데 쓰는 디테일 시스템이 없다"). CRUMB와
// 동일한 상관 구조(섹터 공유 저주파 + 작은 잔차)를 윗면에도 적용한다 — 옆면보다 훨씬 작은
// 진폭으로, 레퍼런스의 "빵 껍질 결"이 오톨도톨한 크럼보다 훨씬 은은하기 때문.
const CRUST_MICRO_AMP = 0.01;
const CRUST_MICRO_RESIDUAL_AMP = 0.003;

// ── 칩 시스템 — object-sculpt-spec.json componentTree[choc-chunk] + repetitionSystems[choc-chunk-cluster] ──
// 형태 정본: "half-sunken embed" (스펙 choc-chunk-half-sunken localFeature). 좁고 높은 프러스텀은
// "표면에서 자란 뿔"로 읽혀 기각된 실패 모드 — CHIP_SHAPE로 낮고 넓게 교정.
type ChipShape = { baseR: number; topR: number; embed: number; rise: number; crown: number; minRise: number };
// 치수 정본 = 레퍼런스 픽셀 실측(초코 마스크 연결성분 bbox 폭 / 오브젝트 bbox 폭).
// 스펙 CHIP_BASE_R/CHIP_TOP_R/CHIP_EMBED/CHIP_RISE와 동일 수치.
// 반복 2(surface-pass 자가교정): 0.034는 half-sunken 실루엣 보존엔 안전했지만 나란히 놓고 보면
// 레퍼런스보다 납작해 입체감이 부족했다(critical feature 0.78, 문턱 0.8 미달). rise만 0.05로
// 올려 노출 높이/폭을 0.133→0.216으로 키운다 — embed(0.075) > rise(0.05)라 파묻힘 비율 60%는
// 유지되어 "half-sunken"은 그대로다.
// embed/rise/crown/minRise는 Y축(법선) 오프셋이라 HEIGHT_SCALE로 같이 줄인다 — baseR/topR은
// 반경(수평) 치수라 무관(품질 라운드 3, 팀장 지시: "낮추면 청크가 상대적으로 커 보인다").
// ⚠ 품질 라운드 4 실측(work/measure_chunks.py, 연결성분 bbox 지름 / 오브젝트 bbox 폭):
// 레퍼런스 가시 청크(5~6개, 노이즈 <0.03 제외) 지름/폭 ≈ [0.109, 0.074, 0.074, 0.070, 0.064]
// (중간값대 ≈0.07) vs 우리 렌더 7개 [0.170, 0.167, 0.116, 0.116, 0.095, 0.095, 0.048]
// (중간값대 ≈0.106) — 최대 기준 0.109/0.170≈0.64, 중간값 기준 0.07/0.106≈0.66. CHIP_RADIUS_SCALE
// 0.65로 baseR·topR만 낮춘다(embed/rise는 Y축이라 이미 위에서 별도 처리, 그대로 둠).
const CHIP_RADIUS_SCALE = 0.65;
const CHIP_SHAPE: ChipShape = {
  baseR: 0.1275 * CHIP_RADIUS_SCALE,
  topR: 0.093 * CHIP_RADIUS_SCALE,
  embed: 0.075 * HEIGHT_SCALE,
  rise: 0.05 * HEIGHT_SCALE,
  crown: 0.01 * HEIGHT_SCALE,
  minRise: 0.012 * HEIGHT_SCALE,
};

// ── 조각 형태 다양성 — 스펙 choc-chunk.geometryDescriptor.deformationStack[chunk-irregularity] ──
// 다섯 축을 프리미티브 파라미터로 벌린다(사후 xyz 지터 금지 원칙 유지): 정점 수 5~7, 이방성,
// 비대칭 테이퍼, 높이 산포, 크기 3계층. 밑면 링은 어떤 축에서도 평면을 유지해 파묻힘 여유 보존.
type ChipTier = 'large' | 'medium' | 'shard';
type TierSpec = { size: number; sizeSpread: number; riseMul: number; aniso: number };
// 계층 간 크기 스팬 3.0배(shard 0.45 ~ large 1.35) — 스펙 repetitionSystems.sizeClasses.sizeMultiplier와 동일.
const CHIP_TIER: Record<ChipTier, TierSpec> = {
  large: { size: 1.35, sizeSpread: 0.1, riseMul: 1.15, aniso: 1.08 },
  medium: { size: 0.92, sizeSpread: 0.2, riseMul: 0.95, aniso: 1.18 },
  shard: { size: 0.45, sizeSpread: 0.1, riseMul: 0.45, aniso: 1.5 },
};
// 정본 v5: "a couple of generous pieces, several smaller ones". 7개 기준 큰 것 2 · 파편 1 · 중간 4.
const LARGE_CHIP_COUNT = 2;
const SHARD_CHIP_COUNT = 1;
const CHIP_RISE_SPREAD = 0.25;
const CHIP_ANISO_SPREAD = 0.12;
const CHIP_LEAN = 0.3; // 윗면 중심 오프셋, baseR 단위
const CHIP_EXPOSED_HW_MAX = 0.5; // 노출 높이/폭 상한 — 이 위로 가면 다시 뿔이 된다
const CHIP_RADIUS_VARIANCE = 0.1; // 정점별 반지름 ±10%
const CHIP_MIN_GAP = 0.34; // 가시 폭의 1.9배 이상 — 인접 클러스터가 한 덩어리로 안 뭉치게
const TOP_CHIP_RINGS: readonly number[] = [0.74, 0.6, 0.45, 0.3].map(faceRingIndex);
const CHIP_COUNT = 7; // 스펙 repetitionSystems[choc-chunk-cluster].count
// 클러스터 배치 — 정본 v5 "loose casual clusters that leave quiet plain areas of crust between them"
// (스펙 repetitionSystems.distribution.mechanism). 씨앗 3개를 FPS로 벌린 뒤 [3,2,2]로 채운다.
const CHIP_CLUSTERS: readonly number[] = [3, 2, 2]; // 합 = CHIP_COUNT
const CLUSTER_SEED_RINGS: readonly number[] = [0.6, 0.45].map(faceRingIndex);
const CLUSTER_FIRST_SEED_RING = faceRingIndex(0.45);

// ── 셸 평면색 아틀라스 — TOP/SIDE 2색만 (초코는 별도 solid 머티리얼로 분리, 아래 §머티리얼).
// 64² 2분면. 셸을 indexed로 유지하므로(§마감) UV는 존(zone) 상수값 — 존 경계는 이미 RIM_A/RIM_B
// 정점 복제로 갈라져 있어 같은 정점이 서로 다른 UV를 요구할 일이 없다(CRIB.md indexed-유지 규칙).
const TEX_SIZE = 64;
const TOP_UV: readonly [number, number] = [0.5, 0.75];
const SIDE_UV: readonly [number, number] = [0.5, 0.25];

function hexRgb(h: number): string {
  return `rgb(${(h >> 16) & 0xff}, ${(h >> 8) & 0xff}, ${h & 0xff})`;
}

function bakeShellAtlas(): THREE.CanvasTexture {
  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const half = size / 2;
    ctx.fillStyle = hexRgb(TOP_ALBEDO);
    ctx.fillRect(0, 0, size, half); // 위 절반 → UV (0.5, 0.75)
    ctx.fillStyle = hexRgb(SIDE_ALBEDO);
    ctx.fillRect(0, half, size, half); // 아래 절반 → UV (0.5, 0.25)
  });
}

/**
 * 스무스 마감 — **indexed 유지, toNonIndexed 호출 안 함** (2026-08-30 변형 라운드 실측:
 * campagne--strawberry-jam 선례 — 정점 분리가 불필요하면 indexed 유지가 GLB를 크게 줄인다).
 * UV가 존별 상수값이라 공유 정점이 서로 다른 UV를 요구하지 않으므로 안전하다.
 */
function smoothIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeVertexNormals();
  return g;
}

/**
 * 균열 함몰 — 판 정점 인덱스를 돌려준다(칩 앵커가 균열 바닥에 앉으면 파묻혀 안 보이므로 후보에서 뺀다).
 * ⚠ 반복 3(품질 라운드) 실측: 벽 기울기(atan(depth/링간격))는 조밀화 후에도 58~60°로 CRIB 30°
 * 하한을 넉넉히 넘는다(work 스크립트 실측, 이 파일 FISSURE_NEIGHBOR_DEPTH_FRACTION 주석 참조) —
 * 그런데도 약해 보인 원인은 홈의 **폭**이 조밀화로 링 간격만큼(~0.035) 줄어 바늘구멍이 된 것.
 * 그래서 승자 링 하나만 파지 않고 **양옆 인접 링도 부분 함몰**시켜 홈 폭을 3링으로 넓힌다.
 * 인접 링이 림(RIM_A/RIM_B) 또는 극점(크라운, 전 섹터 공유 정점)이면 스킵 — 크라운을 건드리면
 * 한 섹터의 균열이 전 섹터에 번진다.
 */
function dipFissures(
  positions: number[],
  ringStart: number[],
  rings: readonly (readonly [number, number])[],
): Set<number> {
  const dipped = new Set<number>();
  const dipAt = (ri: number, s: number, depth: number): void => {
    if (ri < 0 || ri >= rings.length) return;
    if (ri === RIM_A || ri === RIM_B) return; // 크러스트 경계 링은 보존
    if (rings[ri][0] <= 1e-6) return; // 크라운 극점 — 전 섹터 공유, 건드리면 안 됨
    const idx = ringStart[ri] + s;
    positions[idx * 3 + 1] -= depth;
    dipped.add(idx);
  };
  for (let s = 0; s < SEGMENTS; s++) {
    const outlineZ = OUTLINE[s][1];
    for (const targetZ of FISSURE_TARGETS_Z) {
      let bestRingIndex = -1;
      let bestDelta = Infinity;
      for (let ri = 0; ri < rings.length; ri++) {
        const rFrac = rings[ri][0];
        if (!FISSURE_RING_FRACS.includes(rFrac)) continue;
        const z = rFrac * outlineZ;
        const delta = Math.abs(z - targetZ);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestRingIndex = ri;
        }
      }
      if (bestRingIndex >= 0 && bestDelta <= FISSURE_TOLERANCE) {
        dipAt(bestRingIndex, s, FISSURE_DEPTH);
        dipAt(bestRingIndex - 1, s, FISSURE_DEPTH * FISSURE_NEIGHBOR_DEPTH_FRACTION);
        dipAt(bestRingIndex + 1, s, FISSURE_DEPTH * FISSURE_NEIGHBOR_DEPTH_FRACTION);
      }
    }
  }
  return dipped;
}

/**
 * 링·섹터별 반경 요철(크럼). 몸통 링(hFrac이 CRUMB_H_RANGE 안, 바닥 극점·림 제외)에서만 활성.
 * 섹터당 1회 뽑은 저주파 성분(sectorNoise)을 모든 활성 링이 공유하고, 링마다 훨씬 작은 잔차만
 * 더해 세로 결이 살아남게 한다 — 링별 완전 독립 난수는 섹터 방향 상관이 없어 소금-후추 잡음이
 * 된다(반복 1 실측: 위 CRUMB_AMP 주석 참조).
 */
function makeCrumb(rng: () => number): number[][] {
  const sectorNoise: number[] = [];
  for (let s = 0; s < SEGMENTS; s++) sectorNoise.push((rng() - 0.5) * 2 * CRUMB_AMP);
  const table: number[][] = [];
  for (let ri = 0; ri < RINGS.length; ri++) {
    const [rFrac, hFrac] = RINGS[ri];
    const active = ri <= COLOR_BOUNDARY_RING && rFrac > 1e-6 && hFrac >= CRUMB_H_RANGE[0] && hFrac <= CRUMB_H_RANGE[1];
    const row: number[] = [];
    for (let s = 0; s < SEGMENTS; s++) {
      row.push(active ? sectorNoise[s] + (rng() - 0.5) * 2 * CRUMB_RESIDUAL_AMP : 0);
    }
    table.push(row);
  }
  return table;
}

/**
 * 윗면 크러스트 미세 요철 — makeCrumb과 동일한 상관 구조(섹터 공유 저주파 + 작은 잔차)를
 * **골드 색 영역**(ri > COLOR_BOUNDARY_RING, 품질 라운드 2)에 적용한다. RIM_B가 아니라
 * COLOR_BOUNDARY_RING을 기준으로 삼아 재질(색)과 텍스처 영역이 정확히 일치한다 — 색 경계가
 * 내려가며 몸통 상단 일부도 이제 골드라서 그 구간도 크러스트 결을 받는다. 진폭은 크럼보다
 * 훨씬 작다(레퍼런스의 크러스트 결은 크럼보다 은은함). 균열이 이미 함몰시킨 링·섹터 위에도
 * 겹쳐 더해지지만 진폭이 작아(0.01 vs 균열 0.06+) 균열 형태를 무너뜨리지 않는다.
 */
function makeCrustMicro(rng: () => number): number[][] {
  const sectorNoise: number[] = [];
  for (let s = 0; s < SEGMENTS; s++) sectorNoise.push((rng() - 0.5) * 2 * CRUST_MICRO_AMP);
  const table: number[][] = [];
  for (let ri = 0; ri < RINGS.length; ri++) {
    const [rFrac] = RINGS[ri];
    const active = ri > COLOR_BOUNDARY_RING && rFrac > 1e-6; // 크라운 극점(전 섹터 공유)만 제외
    const row: number[] = [];
    for (let s = 0; s < SEGMENTS; s++) {
      row.push(active ? sectorNoise[s] + (rng() - 0.5) * 2 * CRUST_MICRO_RESIDUAL_AMP : 0);
    }
    table.push(row);
  }
  return table;
}

/**
 * 셸 지터 — 국소 감쇠판. 바깥 링(rFrac ≥ 0.5)은 amp 그대로, 극점으로 수렴하는 안쪽 링은
 * rFrac에 비례해 줄인다(수렴 링 함정 회피). 정점당 rng 3회는 감쇠 여부와 무관하게 뽑는다.
 * ⚠ 품질 라운드 4 실측: Y축만 HEIGHT_SCALE로 같이 줄인다(yScale 인자) — 두께를 0.56배로
 * 낮추며 BODY_PROFILE 링 간 세로 간격도 같이 좁아졌는데(예: hFrac 0.07 간격 × WEDGE_HEIGHT
 * 0.56 ≈ 0.039 world unit), X/Z와 동일한 절대 지터(0.004)가 그 좁아진 간격 대비 상대적으로
 * 커져 인접 링이 서로 뒤섞이며 옆면에 가로 띠(계단) 무늬를 만들었다(팀장 지적 원인 (a) 확정 —
 * 크럼은 링 간 상관 구조라 가로줄의 원인이 아니었다). X/Z(반경 방향)는 두께 변경과 무관하므로
 * 그대로 둔다.
 */
function jitterShellDamped(
  g: THREE.BufferGeometry,
  ringStart: readonly number[],
  rings: readonly (readonly [number, number])[],
  rng: () => number,
  amp: number,
  yScale: number,
): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let ri = 0; ri < rings.length; ri++) {
    const local = amp * Math.min(1, rings[ri][0] / 0.5);
    const localY = local * yScale;
    const count = rings[ri][0] <= 1e-6 ? 1 : SEGMENTS;
    for (let k = 0; k < count; k++) {
      const i = ringStart[ri] + k;
      pos.setXYZ(
        i,
        pos.getX(i) + (rng() - 0.5) * 2 * local,
        pos.getY(i) + (rng() - 0.5) * 2 * localY,
        pos.getZ(i) + (rng() - 0.5) * 2 * local,
      );
    }
  }
  pos.needsUpdate = true;
}

function makeWobble(rng: () => number): { radius: number[]; rimLift: number[] } {
  const radius: number[] = [];
  const rimLift: number[] = [];
  for (let s = 0; s < SEGMENTS; s++) {
    radius.push(1 + (rng() - 0.5) * 2 * WOBBLE_AMP);
    rimLift.push((rng() - 0.5) * 2 * WOBBLE_AMP * WEDGE_HEIGHT * 0.3);
  }
  return { radius, rimLift };
}

type Shell = {
  geometry: THREE.BufferGeometry;
  bodyTriangles: number;
  ringStart: number[];
  rings: readonly (readonly [number, number])[];
  dipped: Set<number>;
};

/** 웨지 셸 — 반환값에 칩 앵커링에 필요한 격자 메타(ringStart·rings·dipped)를 더했다. */
function buildShell(rng: () => number): Shell {
  const wobble = makeWobble(rng);
  const crumb = makeCrumb(rng);
  const crustMicro = makeCrustMicro(rng);
  const rings = RINGS;

  const positions: number[] = [];
  const ringStart: number[] = [];
  for (let ri = 0; ri < rings.length; ri++) {
    const [rFrac, hFrac] = rings[ri];
    ringStart.push(positions.length / 3);
    if (rFrac <= 1e-6) {
      positions.push(0, hFrac * WEDGE_HEIGHT, 0);
      continue;
    }
    for (let s = 0; s < SEGMENTS; s++) {
      const [ox, oz] = OUTLINE[s];
      const rr = rFrac * wobble.radius[s] + crumb[ri][s] + crustMicro[ri][s];
      const y = hFrac * WEDGE_HEIGHT + wobble.rimLift[s] * rFrac;
      positions.push(ox * rr, y, oz * rr);
    }
  }

  const dipped = dipFissures(positions, ringStart, rings);

  const index: number[] = [];
  let bodyTriangles = 0;
  for (let ri = 0; ri < rings.length - 1; ri++) {
    if (ri === RIM_A) continue; // 림 복제 링 사이 = 퇴화 스트립(좌표 동일), 삼각형 없음
    const a0 = ringStart[ri];
    const b0 = ringStart[ri + 1];
    const aPole = rings[ri][0] <= 1e-6;
    const bPole = rings[ri + 1][0] <= 1e-6;
    for (let s = 0; s < SEGMENTS; s++) {
      const s1 = (s + 1) % SEGMENTS;
      if (aPole) {
        index.push(a0, b0 + s, b0 + s1);
      } else if (bPole) {
        index.push(a0 + s1, a0 + s, b0);
      } else {
        index.push(a0 + s, b0 + s1, a0 + s1);
        index.push(a0 + s, b0 + s, b0 + s1);
      }
    }
    if (ri < RIM_A) bodyTriangles = index.length / 3;
  }

  // UV는 존 상수값 — 색 경계는 COLOR_BOUNDARY_RING(품질 라운드 2, hFrac 0.34)이지 물리적
  // 크리스(RIM_A/RIM_B)가 아니다. ri<=COLOR_BOUNDARY_RING은 SIDE(크림), 그 위는 TOP(골드).
  // 이 경계는 duplicate 링이 아니라서 경계를 가로지르는 삼각형(ri==COLOR_BOUNDARY_RING과
  // ri+1 사이)의 세 정점이 서로 다른 UV 상수를 가질 수 있다 — 그 결과 GPU가 UV를 보간해
  // 아틀라스 중간 지점을 샘플링, 하드 라인 대신 부드러운 색 전환이 생긴다(레퍼런스도 크러스트
  // 경계가 칼같이 날카롭지 않고 살짝 번져 있어 오히려 자연스럽다 — 렌더로 확인).
  const uv = new Float32Array((positions.length / 3) * 2);
  for (let ri = 0; ri < rings.length; ri++) {
    const at = ri <= COLOR_BOUNDARY_RING ? SIDE_UV : TOP_UV;
    const isPole = rings[ri][0] <= 1e-6;
    const count = isPole ? 1 : SEGMENTS;
    for (let k = 0; k < count; k++) {
      const i = ringStart[ri] + k;
      uv[i * 2] = at[0];
      uv[i * 2 + 1] = at[1];
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  jitterShellDamped(geometry, ringStart, rings, rng, SHELL_JITTER_AMP, HEIGHT_SCALE);
  // 림 용접 — 지터는 정점별 독립 난수라 복제된 두 림 링이 다르게 흔들려 실금이 생긴다. 지터 뒤에
  // B를 A로 되붙여 좌표를 다시 일치시킨다(법선은 여전히 분리 = 크리스).
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let s = 0; s < SEGMENTS; s++) {
    const a = ringStart[RIM_A] + s;
    const b = ringStart[RIM_B] + s;
    pos.setXYZ(b, pos.getX(a), pos.getY(a), pos.getZ(a));
  }
  pos.needsUpdate = true;
  return { geometry, bodyTriangles, ringStart, rings, dipped };
}

// ── 칩 앵커 선정 ─────────────────────────────────────────────────────────────────────

type ChipSite = { pos: THREE.Vector3; axis: THREE.Vector3 };

function vertexIndex(shell: Shell, ri: number, s: number): number {
  const isPole = shell.rings[ri][0] <= 1e-6;
  return shell.ringStart[ri] + (isPole ? 0 : ((s % SEGMENTS) + SEGMENTS) % SEGMENTS);
}

function vertexAt(pos: THREE.BufferAttribute, shell: Shell, ri: number, s: number): THREE.Vector3 {
  return new THREE.Vector3().fromBufferAttribute(pos, vertexIndex(shell, ri, s));
}

/** 윗면 앵커의 법선 — 격자 이웃 네 점의 외적. */
function topNormal(pos: THREE.BufferAttribute, shell: Shell, ri: number, s: number): THREE.Vector3 {
  const du = vertexAt(pos, shell, ri, s + 1).sub(vertexAt(pos, shell, ri, s - 1));
  const dv = vertexAt(pos, shell, ri - 1, s).sub(vertexAt(pos, shell, ri + 1, s));
  const n = new THREE.Vector3().crossVectors(du, dv);
  if (n.lengthSq() < 1e-12) return new THREE.Vector3(0, 1, 0);
  n.normalize();
  if (n.y < 0) n.negate();
  return n;
}

function topFaceCandidates(shell: Shell): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  for (const ri of TOP_CHIP_RINGS) {
    for (let s = 0; s < SEGMENTS; s++) {
      if (shell.dipped.has(vertexIndex(shell, ri, s))) continue; // 균열 바닥에 앉으면 안 보인다
      out.push([ri, s]);
    }
  }
  return out;
}

/**
 * 클러스터 배치 — 씨앗 3개를 최원점 샘플링(FPS)으로 윗면 중앙 띠에서 벌린 뒤, 각 씨앗에서
 * 가까운 순으로 정원([3,2,2])을 채운다. 씨앗 사이 영역이 자연히 빈다(스펙 repetitionSystems
 * distribution.mechanism 전사).
 */
function pickClusteredSites(pos: THREE.BufferAttribute, shell: Shell, rng: () => number): ChipSite[] {
  const all = topFaceCandidates(shell);
  const posOf = (c: readonly [number, number]): THREE.Vector3 => vertexAt(pos, shell, c[0], c[1]);
  const seedPool = all.filter((c) => CLUSTER_SEED_RINGS.includes(c[0]));
  if (seedPool.length === 0) return [];

  const firstPool = seedPool.filter((c) => c[0] === CLUSTER_FIRST_SEED_RING);
  const pool0 = firstPool.length > 0 ? firstPool : seedPool;
  const seeds: (readonly [number, number])[] = [pool0[Math.floor(rng() * pool0.length)]];
  while (seeds.length < CHIP_CLUSTERS.length) {
    let best: readonly [number, number] | null = null;
    let bestDist = -1;
    for (const c of seedPool) {
      const p = posOf(c);
      let nearest = Infinity;
      for (const sd of seeds) nearest = Math.min(nearest, posOf(sd).distanceTo(p));
      if (nearest > bestDist) {
        bestDist = nearest;
        best = c;
      }
    }
    if (!best) break;
    seeds.push(best);
  }

  const sites: ChipSite[] = [];
  const taken: THREE.Vector3[] = [];
  seeds.forEach((seedEntry, ci) => {
    const seed = posOf(seedEntry);
    const byNearest = all
      .map((c) => ({ c, d: posOf(c).distanceTo(seed) }))
      .sort((a, b) => a.d - b.d);
    let placed = 0;
    for (const { c } of byNearest) {
      if (placed >= CHIP_CLUSTERS[ci]) break;
      const p = posOf(c);
      if (taken.some((q) => q.distanceTo(p) < CHIP_MIN_GAP)) continue;
      taken.push(p);
      sites.push({ pos: p, axis: topNormal(pos, shell, c[0], c[1]) });
      placed++;
    }
  });
  return sites;
}

function makeTierPlan(count: number, rng: () => number): ChipTier[] {
  // 계층을 정원제로 배분(확률이면 큰 것 0개인 판이 나온다), 그 다음 셔플.
  const plan: ChipTier[] = [];
  for (let i = 0; i < count; i++) {
    if (i < LARGE_CHIP_COUNT) plan.push('large');
    else if (i < LARGE_CHIP_COUNT + SHARD_CHIP_COUNT) plan.push('shard');
    else plan.push('medium');
  }
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = plan[i];
    plan[i] = plan[j];
    plan[j] = tmp;
  }
  return plan;
}

/**
 * 계층·형태가 제각각인 조각 묶음. **indexed로 짓는다**: 스무스 노멀이 공유 정점 평균에서
 * 나오므로 링 정점을 공유해야 낮은 돔처럼 읽힌다. 칩끼리는 정점을 공유하지 않으므로 이웃 칩으로
 * 법선이 번지지 않는다.
 */
function buildChips(sites: readonly ChipSite[], rng: () => number): THREE.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  const push = (v: THREE.Vector3): void => {
    positions.push(v.x, v.y, v.z);
  };
  const tiers = makeTierPlan(sites.length, rng);
  const shape = CHIP_SHAPE;

  sites.forEach((site, k) => {
    const tier = CHIP_TIER[tiers[k]];
    const n = site.axis;
    const helper = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(helper, n).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1);

    const sides = 5 + Math.floor(rng() * 3); // 5, 6, 7
    const size = tier.size * (1 + (rng() - 0.5) * 2 * tier.sizeSpread);
    const aniso = tier.aniso * (1 + (rng() - 0.5) * 2 * CHIP_ANISO_SPREAD);
    const leanU = (rng() - 0.5) * 2 * CHIP_LEAN;
    const leanV = (rng() - 0.5) * 2 * CHIP_LEAN;
    const phase = rng() * Math.PI * 2;

    const baseR = shape.baseR * size;
    const topR = shape.topR * size;
    const embed = shape.embed; // 파묻힘 하한은 크기가 아니라 셸 요철이 정한다 — 크기와 무관하게 유지
    let rise = Math.max(shape.minRise, shape.rise * tier.riseMul * (1 + (rng() - 0.5) * 2 * CHIP_RISE_SPREAD));
    const minorFactor = Math.min(aniso, 1 / aniso);
    const anchorR = (baseR + (topR - baseR) * (embed / (embed + rise))) * minorFactor;
    const exposedMax = CHIP_EXPOSED_HW_MAX * 2 * anchorR - shape.crown;
    if (rise > exposedMax) rise = Math.max(shape.minRise, exposedMax);

    const baseOrigin = site.pos.clone().addScaledVector(n, -embed);
    const topOrigin = site.pos
      .clone()
      .addScaledVector(n, rise)
      .addScaledVector(t1, leanU * baseR)
      .addScaledVector(t2, leanV * baseR);

    const base0 = positions.length / 3;
    const top0 = base0 + sides;
    const capCentre = top0 + sides;
    const topRing: THREE.Vector3[] = [];
    for (let i = 0; i < sides; i++) {
      const w = 1 + (rng() - 0.5) * 2 * CHIP_RADIUS_VARIANCE;
      const a = phase + (i / sides) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const rb = baseR * w;
      const rt = topR * w;
      push(baseOrigin.clone().addScaledVector(t1, c * rb * aniso).addScaledVector(t2, (sn * rb) / aniso));
      topRing.push(topOrigin.clone().addScaledVector(t1, c * rt * aniso).addScaledVector(t2, (sn * rt) / aniso));
    }
    for (const v of topRing) push(v);
    push(topOrigin.clone().addScaledVector(n, shape.crown)); // cap 중앙 — 평평한 타일 방지

    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      index.push(base0 + i, base0 + j, top0 + i);
      index.push(base0 + j, top0 + j, top0 + i);
      index.push(capCentre, top0 + i, top0 + j);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  return g;
}

export const createSconeChocoChip: BreadBuilder = (rng) => {
  const shell = buildShell(rng);
  const shellPos = shell.geometry.attributes.position as THREE.BufferAttribute;

  // 앵커는 지터 이후 셸 실좌표에서 뽑는다 — 칩이 표면에 정확히 앉아야 파묻힘 여유가 유지된다.
  const sites = pickClusteredSites(shellPos, shell, rng);

  // 셸 = indexed 유지 + 스무스 노멀(§마감). UV는 buildShell에서 이미 존별 상수로 채웠다.
  const shellGeo = smoothIndexed(shell.geometry);

  // 재질 예외 — 셸은 스무스, 청크만 플랫(lib.facet). 스펙 choc-chunk.geometryDescriptor.normalStrategy 정본.
  // 초코는 별도 solid 머티리얼이라 UV 값 자체는 안 쓰이지만 types.ts §4 계약상 attribute는 채운다.
  const chipGeo = facet(buildChips(sites, rng));
  const chipUv = new Float32Array(chipGeo.attributes.position.count * 2).fill(0.5);
  chipGeo.setAttribute('uv', new THREE.BufferAttribute(chipUv, 2));

  // 머티리얼 2벌(mesh=2, types.ts §1 예산 안): 셸=TOP/SIDE 아틀라스, 초코=solid color.
  // 서로 다른 머티리얼이라 mergeByMaterial은 각각 1개짜리 버킷으로 그대로 통과시킨다 —
  // indexed(셸) + non-indexed(초코) 지오메트리를 억지로 합치지 않아도 되는 이유이기도 하다.
  const shellMat = stdMaterial({ map: bakeShellAtlas() });
  const chipMat = stdMaterial({ color: CHIP_RENDER_COLOR });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(shellGeo, shellMat));
  group.add(new THREE.Mesh(chipGeo, chipMat));
  return mergeByMaterial(group);
};
