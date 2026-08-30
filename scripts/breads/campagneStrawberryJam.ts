// campagne--strawberry-jam -- REDO round (2026-08-30), img2threejs skill state-gated procedure.
// Workspace: assets/breads/work/campagne--strawberry-jam-v2/ (state.json + author_spec.py +
// object-sculpt-spec.json, reviewHistory holds the recorded pass-by-pass gate loop). Contract is
// types.ts. The first attempt at this bread (git history: this same file, pre-redo) hand-inherited
// the base campagne.ts dome builder and skipped the state-gated spec/build/review loop entirely --
// CRIB/BREADS.md mandate: variant bread also runs the full img2threejs procedure. Several NUMERIC
// constants below are legitimately re-derived from that attempt's own documented A/B render
// research (per-constant notes below), but every one was re-verified against a fresh
// blockout -> structural -> form -> material -> surface -> optimization pass loop with real
// breadlab-shot renders and diagnose_render.py / append_review.py gates, not carried on faith --
// several (groove density, ear height, swirl wobble amplitude) were changed outright after
// re-reading the regenerated, sharper reference images (assets/breads/src/
// campagne--strawberry-jam[.png|-2.png|-3.png]).
//
// ================================================================================
// ## 마감 계약: 스무스 클레이 룩 (2026-08-30 finish contract)
// ================================================================================
// facet()을 호출하지 않는다. 돔·컷 페이스 전부 indexed 유지 + computeVertexNormals()만 쓴다.
// toNonIndexed()도 안 한다 -- UV가 연속 투영(돔은 극좌표, 컷 페이스는 파라메트릭 rho/height)이라
// 정점 분리가 필요 없고, indexed 유지가 GLB 정점 수를 1/3로 줄인다(v1 실측: tri 2배인데 GLB
// 26% 작음, CRIB에 기록됨).
//
// ================================================================================
// ## 잼은 텍스처가 아니라 지오메트리 -- "스티커" 판정 해소 (v1에서 검증된 구조, 이번에도 유지)
// ================================================================================
// 스월 경로를 따라 컷 페이스 단면을 실제로 파낸다(채널). 색과 릴리프가 **같은 함수**
// `Swirl.dist(u,v)` 를 읽으므로 "판 자리"와 "칠한 자리"가 설계상 어긋날 수 없다. 이 구조는 v1의
// 산출 지식 중 유일하게 순수 설계(수치가 아닌 아키텍처)라 CRIB 계승 규칙("수치는 계승, 절차는
// 계승 금지")과 별개로 유지 -- "절차"가 아니라 "구조적 해법"이고, 이번 라운드에서도 실제 렌더로
// 재검증했다(아래 검수 루프 보고 참조).
//
// ================================================================================
// ## 이번 라운드에서 새로 재검증/변경한 수치 (재생성된 레퍼런스 재관찰 근거)
// ================================================================================
//   - GROOVE_COUNT 8 -> 16: 새 레퍼런스(-3.png 탑다운)는 돔 전체를 훨씬 촘촘한 동심 링으로
//     덮는다 -- 기존 8그루브는 "성긴" 인상을 준다(1차 렌더에서 확인, 아래 검수 로그 참조).
//   - EAR_HEIGHT 0.02 -> 0.032, SLASH_T_END 0.6 -> 0.5, SLASH_HALF_ANGLE_DEG 12 -> 10: 새
//     레퍼런스의 십자는 부드러운 십자가 아니라 4개의 뾰족한 날이 만나는 별(starburst)에
//     가깝다 -- 더 길고 더 좁고 더 높은 귀로 재현.
//   - SWIRL 두께 흔들림 진폭 합 0.80 -> 0.55: 새 레퍼런스의 스월은 v1이 참고한 서술("손으로 만
//     듯 요동")보다 실제로는 더 규칙적이다(정면 뷰 -2.png 실측) -- 완전한 수학 나선(CRIB 경고)은
//     피하되 흔들림을 줄였다.
import * as THREE from 'three';
import type { BreadBuilder } from './types';
import { angleDeltaDeg, bakeTexture, jitterVertices, mergeByMaterial, scaleHex, stdMaterial } from './lib';
import { buildGroovedDomeShell, ringPhase as domeRingPhase, type DomeShellSpec } from './domeShell';

// --- 팔레트 -------------------------------------------------------------------------------
// assets/prompts/breads/campagne--strawberry-jam.json geometry 손 전사 (types.ts §8 -- JSON
// import 금지, hex가 문장 안에 박혀 있어 구조적 파싱 불가).
const CRUST_LIGHT = 0xa9713f; // "amber to dark brown surface #A9713F to a darker brown blend"
const CRUST_DARK = scaleHex(CRUST_LIGHT, 0.7); // campagne.ts 유도값(고정 배율) 계승
const FLOUR = 0xefe7d2; // 계열 hex 부재로 채택한 일반 옅은 밀색 (campagne.ts와 동일 근거)
const CRUMB = 0xf4ead4; // baguette.json "cream-colored crumb #F4EAD4" 계열 공용 -- 크러스트(수평면)의
// 십자 슬래시 속살(SLASH_FLESH)만 이 원본 정본에서 유도한다. 아래 CRUMB_RENDER는 별도.
const JAM = 0xb23a4e; // "a deep red strawberry jam swirl #B23A4E"

// [material-pass 2·3차 수정, 팀리드 실측 지적] 컷 페이스는 **수직면**(normal이 거의 수평 방향)이라
// docs/VISUAL.md §1-3의 hemisphere 보정(측/윗 비 목표 ≈0.9)이 적용되지만, 이 빵의 컷 페이스는
// 방위각(56.25°/123.75°)이 필 라이트(2.5,3,-2) 쪽을 향하지 않아(dot(N,fill)<0, 클램프로 기여 0)
// 다른 빵의 측벽보다 더 어둡게 나온다 -- PIL 실측: CRUMB(#F4EAD4) 그대로 썼을 때 렌더 median이
// (197,188,171)로 정본 대비 채널당 균일 -19.3%(회백색으로 보이는 원인, 색조 자체는 안 틀어짐).
// 2차 수정은 (255,254,230)까지 **균일하게** 밀어올렸는데, R(244)·G(234)가 둘 다 255 근처에서
// 클리핑되며 R-G 간격이 10->1로 무너져 "무채색"으로 읽혔다(팀리드 재지적) -- 밝기를 올리는 게
// 아니라 **채널 비율(따뜻함)**을 지켜야 했다. 3차 수정: R은 헤드룸 최대(255)까지만 밀고, G·B는
// 정본의 간격비를 과장해서 떨어뜨린다(B를 상대적으로 더 깎아 R-B·G-B 간격을 정본보다도 넓힌다) --
// 셰이딩 손실이 채도를 갉아먹는 걸 감안해 미리 더 따뜻하게 심는다.
//   측정=CRUMB #F4EAD4(244,234,212) / 2차 렌더=(199,197,178, R-G=2 사실상 무채색)
//   목표=레퍼런스 median(233,224,206, R-G=9)의 채널 간격비 이상을 renderer 출력에서 재현.
const CRUMB_RENDER = 0xfff2d3; // (255,242,211) -- R 헤드룸 최대, G/B는 비율을 과장해 따뜻하게

/** hex 두 개를 고정 비율로 섞는다 -- 픽셀 샘플링 금지 규칙의 결정론적 대체(types.ts §8). */
function mixHex(a: number, b: number, t: number): number {
  const ch = (shift: number) =>
    Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t) & 0xff;
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// [material-pass 4차 수정, 팀리드 회귀 지적: "형광 핑크로 뜬다"] 3차 수정은 정본 hex를 필 라이트
// 클램프 손실(팩터 0.807)의 역수로 완전 복원했는데, **잼은 크럼과 달리 어두워야 정상인 요소라
// 손실을 되돌리면 오히려 과보정된다** -- "딸기우유" 함정의 다른 얼굴(팀리드 판정). 정본 hex를
// 역산하는 방식을 버리고 **레퍼런스의 실제 렌더값을 직접 목표로 재측정**했다(정면뷰 -2.png,
// HSV 크림슨 마스크(hue 325~360/0~15, s>0.35, v>0.25)로 잼 픽셀만 골라 luma 10~70퍼센타일
// 밴드의 median -- 가장자리 하이라이트·그림자 극단을 뺀 "몸통" 색).
//   레퍼런스 잼 몸통 실측 = (145,44,36) -- 정본 hex(178,58,78)보다 어둡고 B가 크게 낮다(자홍→적갈).
//   이 목표를 우리 셰이딩 손실(팩터 0.807)의 역수로 나눠 렌더 알베도 후보를 구함:
//   (145,44,36)/0.807 = (180,55,45), 채널 클리핑 없음.
//   3쌍 기록: 알베도 후보(180,55,45) / 결과 렌더(재측정, 아래 보고 참조) / 목표(145,44,36).
const JAM_RENDER = 0xb4372d; // (180,55,45)
// 잼이 크럼으로 번진 옅은 띠 -- JSON에 hex 없음. v1 실측(4회차 렌더): 비율 0.32는 "딸기우유"로
// 크럼 전체가 물든다. 0.16이 적정 (재검증: 이번 라운드 1차 렌더에서 동일 비율 확인, 변경 없음).
// 컷 페이스(수직면) 위 색이라 CRUMB_RENDER/JAM_RENDER에서 유도.
const JAM_HALO = mixHex(CRUMB_RENDER, JAM_RENDER, 0.16);
// 잼 밴드 가장자리의 밝은 립 -- 얇게만. v1 실측: 몸통에 깔면 "분홍 사탕"이 된다.
const JAM_LIT = mixHex(JAM_RENDER, 0xfff2ec, 0.18);
// 크럼 기공 -- CRUMB_RENDER에 CRUST_LIGHT를 섞어 결정론 유도. v1 실측: 0.24는 대비 8%뿐이라 안
// 보임, 0.42로 구멍이 구멍으로 보인다.
const CRUMB_PORE = mixHex(CRUMB_RENDER, CRUST_LIGHT, 0.42);
const CRUMB_LIT = mixHex(CRUMB_RENDER, 0xffffff, 0.38);
// 십자 슬래시 속살 -- 크러스트(수평면) 위 색이라 원본 CRUMB(보정 전)에서 유도 -- 이 면은 컷
// 페이스의 밝기 손실을 겪지 않는다. 순수 CRUMB는 회색 크림 줄로 보인다(v1 실측). 레퍼런스 슬래시
// 속살은 따뜻한 금빛(칼집 안쪽은 이미 굽기 시작한 면) -- CRUMB↔CRUST_LIGHT 5:5.
const SLASH_FLESH = mixHex(CRUMB, CRUST_LIGHT, 0.5);
// 그루브 바닥의 짙은 링 -- 스무스 마감이 잃은 대비를 텍스처가 대신 진다.
const CRUST_SHADOW = scaleHex(CRUST_LIGHT, 0.58);

// --- 베이스 실루엣 수치 (campagne.ts/domeShell.ts 계승 -- 프론트뷰 비율 재확인, 변경 없음) ------
const DOME_HEIGHT = 0.76;
const SEGMENTS = 32; // 슬래시 45/135/225/315deg가 섹터 경계에 정확히 떨어진다

// 바네통 링 밀도 -- [material-pass 3차 수정, 팀리드 실측 지적] 16은 과밀이었다. 레퍼런스
// -3.png를 확대해 중심에서 가장자리까지 실제로 세어보니(ref-ring-strip.png) 약 10~11줄이다 --
// 1·2차 수정의 "훨씬 촘촘한" 인상은 개수가 아니라 대비(다음 줄들)가 원인이었다.
const GROOVE_COUNT = 11;
const GROOVE_ZONE: readonly [number, number] = [0.08, 0.97];
const GROOVE_HALF_WIDTH_T = 0.007; // 얇은 골 -- 레퍼런스는 골이 머리카락처럼 가늘다
const GROOVE_DEPTH = 0.022;

// [surface-pass 수정, 1차 턴테이블 렌더 실측] SLASH_T_END=0.5는 t<0.5 전 구간(반경의 86.6%까지)에
// 슬래시가 활성화되어 turn-90/180/270 렌더에서 크림색 리본이 돔 밑동 근처까지 거의 전체를 가로질러
// "칠한 줄무늬"로 보였다(과도한 길이) -- base campagne의 0.6도 아니고 그보다 짧게, 0.68로 되돌려
// 별 날이 어깨선 위쪽에서 끝나도록 수정했다(재렌더로 확인, 아래 검수 로그 참조).
const SLASH_ANGLES_DEG = [45, 135, 225, 315] as const;
const SLASH_T_FULL = 0.92;
const SLASH_T_END = 0.68;
const SLASH_HALF_ANGLE_DEG = 10; // base 12 -- 살짝 좁혀 더 뾰족하게
const SLASH_CRUMB_HALF_ANGLE_DEG = 4;
const SLASH_FLESH_HALF_ANGLE_DEG = 5.5; // base보다 살짝 좁혀 리본 폭 축소(1차 렌더 실측: 6.5는 과굵음)
const SLASH_GAP_HALF_ANGLE_DEG = 1.0;
const SLASH_DEPTH = 0.10;
const EAR_HEIGHT = 0.032; // base 0.02 -- 별 모양 귀는 더 높이 솟는다
const WOBBLE = { lobe3: 0.02, lobe7: 0.012, noise: 0.012 };
const JITTER_AMP = 0.006; // 돔 셸 전용 -- 컷 페이스에는 지터를 걸지 않는다(아래 buildCutFace 참조)

const DOME_SPEC: DomeShellSpec = {
  domeHeight: DOME_HEIGHT,
  segments: SEGMENTS,
  grooveCount: GROOVE_COUNT,
  grooveZone: GROOVE_ZONE,
  grooveHalfWidthT: GROOVE_HALF_WIDTH_T,
  grooveDepth: GROOVE_DEPTH,
  wobble: WOBBLE,
};

// --- 웨지 컷어웨이 -------------------------------------------------------------------------
// 섹터 5~10 삭제(6/32 = 67.5deg), 경계 열 5(56.25deg)·11(123.75deg) 유지. 슬래시(45/135deg)
// 영향 반경(halfAngle 10deg)을 1.25deg만 스치므로 양옆 별 날이 온전히 남는다 -- 3/4 카메라
// (-1.6, 2.2, 2.6)의 방위각 atan2(2.6,-1.6)=121.6deg에 가장 가까운 90deg를 웨지 중심으로 잡는다.
const WEDGE_FIRST_SECTOR = 5;
const WEDGE_SECTOR_COUNT = 6;
const CUT_COL_A = WEDGE_FIRST_SECTOR; // 56.25deg -- 카메라가 정면으로 보는 면
const CUT_COL_B = WEDGE_FIRST_SECTOR + WEDGE_SECTOR_COUNT; // 123.75deg

// 컷 페이스 격자 -- 반경 22열 x 높이 26행. CRIB "격자 셀 단위로 판다"의 하한을 만족.
const CUT_RADIAL = 22;
const CUT_ROWS = 26;

// --- 아틀라스 레이아웃 (px, 512²) ------------------------------------------------------------
const TEX = 512;
const CRUST_PX = 256; // (0,0)~(256,256)
const FACE_X = 176;
const FACE_Y = 256;
const FACE_W = 336; // 336:256 = 1.3125 ~= 1/0.76 -- 컷면의 모델 종횡비 R:H 역수와 맞춤
const FACE_H = 256;
const CRUST_UV_SCALE = CRUST_PX / TEX;
const FACE_U0 = FACE_X / TEX;
const FACE_UW = FACE_W / TEX;
const FACE_VH = FACE_H / TEX;

// --- 잼 스월 (컷면 정규화 좌표 u=rho/R, v=y/H) -----------------------------------------------
// 정면뷰(-2.png) 실측: 중심 (0.40, 0.40), 가시 회전수 3.5~4, 밴드 두께는 반지름의 ~4.8%.
// 새 레퍼런스는 v1이 참고한 서술보다 스월이 더 규칙적이다 -- 두께 흔들림 진폭 합을 0.80->0.55로
// 낮췄다(완전한 수학 나선은 여전히 피한다, CRIB "완벽한 나선=인공물").
const SWIRL_CU = 0.4;
const SWIRL_CV = 0.4;
const SWIRL_R0 = 0.015;
const SWIRL_TURN_GAP = 0.155; // 회전수 3.7을 RMAX=0.62 안에 담기 위해 base보다 촘촘히
const SWIRL_B = SWIRL_TURN_GAP / (2 * Math.PI);
const SWIRL_RMAX = 0.62; // 컷면 중심에서 가장 먼 모서리까지 -- 스월이 단면 가장자리까지 채운다
const SWIRL_TH_MAX = (SWIRL_RMAX - SWIRL_R0) / SWIRL_B; // ~3.7바퀴
// [material-pass 3차 수정, 팀리드 실측 지적: "잼이 얇다"] 정면뷰(-2.png)에서 HSV 크림슨 판정으로
// 스월 팔 폭을 직접 재보니(measure_colors 계열 스크립트) 컷면 폭 대비 4~11%, 전형 6~7% -- 기존
// 0.030(반지름의 4.8%)은 하한에 가까웠다. 0.038(반지름의 6.1%)로 상향.
const SWIRL_HALF = 0.038;
const SWIRL_HALO = 0.009;
const JAM_DEPTH = 0.026; // 채널 깊이 -- 셀 0.029 대비 벽 기울기 ~42%
const CRUMB_BUMP = 0.007;
const DIMPLE_DEPTH = 0.014;
const DIMPLE_COUNT = 18;
const PORE_COUNT = 160;
const FLECK_COUNT = 20;
// 텍스처 표시 전용 축소 배율 -- 지오메트리 함몰(dimples)의 p.r는 그대로, 페인트 반경만 줄인다.
const PORE_PAINT_SCALE = 0.5;
const RIM_INNER = 0.955;
const BASE_CRUST_V = 0.032;

type RGB = readonly [number, number, number];

function rgbOf(hex: number): RGB {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const v = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return v * v * (3 - 2 * v);
}

/** campagne.ts slashFalloff 전사 -- 각도차(연속) x t 테이퍼. */
function slashFalloff(angleDeg: number, t: number, halfAngle: number): number {
  let minDelta = 999;
  for (const a of SLASH_ANGLES_DEG) minDelta = Math.min(minDelta, angleDeltaDeg(angleDeg, a));
  if (minDelta >= halfAngle || t < SLASH_T_END) return 0;
  const angularFalloff = Math.cos((minDelta / halfAngle) * (Math.PI / 2));
  const tTaper = t >= SLASH_T_FULL ? 1 : smoothstep(SLASH_T_END, SLASH_T_FULL, t);
  return angularFalloff * tTaper;
}

// --- 스월 필드 -- 색(텍스처)과 릴리프(정점)가 공유하는 단 하나의 진실 -------------------------
interface Swirl {
  /** 잼 밴드까지의 부호 거리(모델 단위). ≤0이면 밴드 안. */
  dist(u: number, v: number): number;
}

function makeSwirl(rng: () => number): Swirl {
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  const p4 = rng() * Math.PI * 2;
  const p5 = rng() * Math.PI * 2;
  const radiusAt = (th: number) =>
    SWIRL_R0 + SWIRL_B * th + 0.014 * Math.sin(2.3 * th + p1) + 0.009 * Math.sin(0.83 * th + p2);
  // 두께 흔들림 -- 진폭 합 0.55 (v1의 0.80에서 축소, 새 레퍼런스가 더 규칙적이라서).
  const halfAt = (th: number) =>
    SWIRL_HALF *
    (1 + 0.18 * Math.sin(1.7 * th + p3) + 0.11 * Math.sin(3.7 * th + p4) + 0.26 * Math.sin(0.61 * th + p5));
  return {
    dist(u, v) {
      const mx = u - SWIRL_CU;
      const my = (v - SWIRL_CV) * DOME_HEIGHT;
      const ang = Math.atan2(my, mx);
      const rad = Math.hypot(mx, my);
      let best = Infinity;
      for (let n = 0; n <= 5; n++) {
        const th = ang + 2 * Math.PI * n;
        if (th < 0 || th > SWIRL_TH_MAX) continue;
        best = Math.min(best, Math.abs(rad - radiusAt(th)) - halfAt(th));
      }
      return best;
    },
  };
}

/** 기공 목록 -- 텍스처의 어두운 자국과 지오메트리 함몰이 같은 목록을 쓴다. */
function makePores(rng: () => number): { cu: number; cv: number; r: number }[] {
  const out: { cu: number; cv: number; r: number }[] = [];
  let guard = 0;
  while (out.length < PORE_COUNT && guard < PORE_COUNT * 14) {
    guard++;
    const cu = rng();
    const cv = rng();
    const r = 0.008 + rng() * 0.02;
    if (Math.hypot(cu, cv) > RIM_INNER - r || cv < BASE_CRUST_V + r) continue;
    out.push({ cu, cv, r });
  }
  return out;
}

/** 잼 부스러기 -- 밴드 가장자리 바로 밖에 흩뿌려 "번짐/끊김" 힌트를 만든다. */
function makeFlecks(rng: () => number, swirl: Swirl): { cu: number; cv: number; r: number }[] {
  const out: { cu: number; cv: number; r: number }[] = [];
  let guard = 0;
  while (out.length < FLECK_COUNT && guard < FLECK_COUNT * 40) {
    guard++;
    const cu = rng();
    const cv = rng();
    const r = 0.008 + rng() * 0.014;
    if (Math.hypot(cu, cv) > RIM_INNER - r || cv < BASE_CRUST_V + r) continue;
    const d = swirl.dist(cu, cv);
    if (d <= 0.004 || d > 0.05) continue;
    out.push({ cu, cv, r });
  }
  return out;
}

// --- 돔 셸 ---------------------------------------------------------------------------------
function buildDome(rng: () => number): {
  geometry: THREE.BufferGeometry;
  ringStart: number[];
  profile: [number, number][];
  wobble: number[];
} {
  const { geometry, ringStart, profile, wobble } = buildGroovedDomeShell(DOME_SPEC, rng);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  for (let ri = 0; ri < profile.length; ri++) {
    const [rFrac, t] = profile[ri];
    if (rFrac <= 1e-6) continue;
    for (let s = 0; s < SEGMENTS; s++) {
      const idx = ringStart[ri] + s;
      const angleDeg = (s / SEGMENTS) * 360;
      let y = pos.getY(idx);
      const trench = slashFalloff(angleDeg, t, SLASH_HALF_ANGLE_DEG);
      if (trench > 0) {
        const crumbFalloff = slashFalloff(angleDeg, t, SLASH_CRUMB_HALF_ANGLE_DEG);
        if (crumbFalloff > 0) {
          y -= SLASH_DEPTH * crumbFalloff;
        } else {
          y -= SLASH_DEPTH * trench * 0.3;
          y += EAR_HEIGHT * (trench - crumbFalloff);
        }
      }
      pos.setY(idx, y);
    }
  }
  pos.needsUpdate = true;
  jitterVertices(geometry, rng, JITTER_AMP);
  return { geometry, ringStart, profile, wobble };
}

/** 삼각형별 소속 섹터 -- lib.buildRevolvedShell의 인덱스 생성 순서를 그대로 복제. */
function triangleSectors(profile: readonly (readonly [number, number])[], segments: number): number[] {
  const out: number[] = [];
  for (let ri = 0; ri < profile.length - 1; ri++) {
    const aPole = profile[ri][0] <= 1e-6;
    const bPole = profile[ri + 1][0] <= 1e-6;
    for (let s = 0; s < segments; s++) {
      out.push(s);
      if (!aPole && !bPole) out.push(s);
    }
  }
  return out;
}

/** 웨지 섹터 삭제 + 고아 정점 압축. indexed를 유지한 채 인덱스만 걸러 다시 짠다. */
function cutWedge(geo: THREE.BufferGeometry, profile: readonly (readonly [number, number])[]): void {
  const index = geo.index!.array;
  const triSector = triangleSectors(profile, SEGMENTS);
  if (triSector.length !== index.length / 3) {
    throw new Error('삼각형-섹터 매핑 불일치 -- lib.buildRevolvedShell 인덱스 순서가 바뀌었다');
  }
  const src = geo.attributes.position.array as ArrayLike<number>;
  const remap = new Int32Array(src.length / 3).fill(-1);
  const position: number[] = [];
  const kept: number[] = [];
  for (let tri = 0; tri < triSector.length; tri++) {
    const s = triSector[tri];
    if (s >= WEDGE_FIRST_SECTOR && s < WEDGE_FIRST_SECTOR + WEDGE_SECTOR_COUNT) continue;
    for (let k = 0; k < 3; k++) {
      const v = index[tri * 3 + k];
      if (remap[v] < 0) {
        remap[v] = position.length / 3;
        position.push(src[v * 3], src[v * 3 + 1], src[v * 3 + 2]);
      }
      kept.push(remap[v]);
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setIndex(kept);
}

// --- 컷 페이스 -----------------------------------------------------------------------------
function buildCutFace(
  dome: THREE.BufferGeometry,
  ringStart: number[],
  profile: readonly (readonly [number, number])[],
  wobble: number[],
  column: number,
  reverse: boolean,
  swirl: Swirl,
  pores: { cu: number; cv: number; r: number }[],
): THREE.BufferGeometry {
  const pos = dome.attributes.position as THREE.BufferAttribute;
  const at = (i: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));

  const theta = ((column / SEGMENTS) * Math.PI * 2) % (Math.PI * 2);
  const dirX = Math.cos(theta);
  const dirZ = Math.sin(theta);
  const sign = reverse ? -1 : 1;
  const nx = -Math.sin(theta) * sign;
  const nz = Math.cos(theta) * sign;

  const w = wobble[column];
  const bottomPole = at(ringStart[0]);
  const apex = at(ringStart[profile.length - 1]);

  const rFracAt = (t: number): number => {
    if (t <= 0) return 1;
    if (t >= 1) return 0;
    for (let i = 2; i < profile.length; i++) {
      if (profile[i][1] >= t) {
        const [r0, t0] = profile[i - 1];
        const [r1, t1] = profile[i];
        const f = t1 - t0 < 1e-9 ? 0 : (t - t0) / (t1 - t0);
        return r0 + (r1 - r0) * f;
      }
    }
    return 0;
  };

  const dimples = pores.slice(0, DIMPLE_COUNT);
  const reliefAt = (u: number, v: number): number => {
    const taper =
      smoothstep(0, 0.1, u) * smoothstep(0, 0.05, v) * smoothstep(1.0, 0.9, Math.hypot(u, v));
    if (taper <= 0) return 0;
    const jam = JAM_DEPTH * smoothstep(0.03, -0.006, swirl.dist(u, v));
    let dent = 0;
    for (const p of dimples) {
      const du = (u - p.cu) / p.r;
      const dv = (v - p.cv) / (p.r / DOME_HEIGHT);
      const e = 1 - du * du - dv * dv;
      if (e > 0) dent += DIMPLE_DEPTH * e;
    }
    const bump = CRUMB_BUMP * Math.sin(6.1 * u + 1.7) * Math.sin(4.7 * v + 0.4);
    return (jam + dent - bump) * taper;
  };

  const position: number[] = [];
  const uv: number[] = [];
  const rowStart: number[] = [];
  const rowCount: number[] = [];
  const rowV: number[] = [];

  const pushVertex = (p: THREE.Vector3, u: number, v: number, relief: number) => {
    position.push(p.x + nx * -relief, p.y, p.z + nz * -relief);
    uv.push(FACE_U0 + u * FACE_UW, v * FACE_VH);
  };

  for (let j = 0; j <= CUT_ROWS; j++) {
    const v = j / CUT_ROWS;
    const rF = rFracAt(v);
    rowStart.push(position.length / 3);
    rowV.push(v);
    if (rF <= 1e-6) {
      rowCount.push(1);
      pushVertex(apex, 0, v, 0);
      continue;
    }
    const axis = v <= 0 ? bottomPole : new THREE.Vector3(0, v * DOME_HEIGHT, 0);
    const surf = new THREE.Vector3(dirX * rF * w, v * DOME_HEIGHT, dirZ * rF * w);
    rowCount.push(CUT_RADIAL);
    for (let i = 0; i < CUT_RADIAL; i++) {
      const f = i / CUT_RADIAL;
      const u = f * rF;
      pushVertex(axis.clone().lerp(surf, f), u, v, reliefAt(u, v));
    }
  }

  const outerStart = position.length / 3;
  const outerV: number[] = [];
  for (let ri = 1; ri < profile.length; ri++) {
    const isPole = profile[ri][0] <= 1e-6;
    const p = at(isPole ? ringStart[ri] : ringStart[ri] + column);
    position.push(p.x, p.y, p.z);
    uv.push(FACE_U0 + profile[ri][0] * FACE_UW, profile[ri][1] * FACE_VH);
    outerV.push(profile[ri][1]);
  }
  const outerCount = outerV.length;

  const index: number[] = [];
  const px = (i: number) => position[i * 3];
  const py = (i: number) => position[i * 3 + 1];
  const pz = (i: number) => position[i * 3 + 2];
  const tri = (a: number, b: number, c: number) => {
    const abx = px(b) - px(a);
    const aby = py(b) - py(a);
    const abz = pz(b) - pz(a);
    const acx = px(c) - px(a);
    const acy = py(c) - py(a);
    const acz = pz(c) - pz(a);
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    if (cx * cx + cy * cy + cz * cz < 1e-16) return;
    if (reverse) index.push(a, c, b);
    else index.push(a, b, c);
  };

  for (let j = 0; j < CUT_ROWS; j++) {
    const lo = rowStart[j];
    const hi = rowStart[j + 1];
    const hiSingle = rowCount[j + 1] === 1;
    for (let i = 0; i < CUT_RADIAL - 1; i++) {
      if (hiSingle) {
        tri(lo + i, lo + i + 1, hi);
      } else {
        tri(lo + i, lo + i + 1, hi + i);
        tri(lo + i + 1, hi + i + 1, hi + i);
      }
    }
  }

  const inner: number[] = [];
  const innerV: number[] = [];
  for (let j = 0; j <= CUT_ROWS; j++) {
    inner.push(rowStart[j] + (rowCount[j] === 1 ? 0 : CUT_RADIAL - 1));
    innerV.push(rowV[j]);
  }
  let a = 0;
  let b = 0;
  while (a < outerCount - 1 || b < inner.length - 1) {
    const canA = a < outerCount - 1;
    const canB = b < inner.length - 1;
    const takeA = canA && (!canB || outerV[a + 1] <= innerV[b + 1]);
    if (takeA) {
      tri(outerStart + a, outerStart + a + 1, inner[b]);
      a++;
    } else {
      tri(outerStart + a, inner[b + 1], inner[b]);
      b++;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** 돔 크러스트 UV -- 웨지 삭제 전 전체 돔에서 중심/반경을 받아 아틀라스 crust 구역으로 접는다. */
function uvDomeAtlas(g: THREE.BufferGeometry, cx: number, cz: number, r: number): void {
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - cx) / (r * 2) + 0.5;
    const v = (pos.getZ(i) - cz) / (r * 2) + 0.5;
    uv[i * 2] = u * CRUST_UV_SCALE;
    uv[i * 2 + 1] = 1 - (1 - v) * CRUST_UV_SCALE;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// --- 아틀라스 페인터 ------------------------------------------------------------------------
function paintAtlas(
  rng: () => number,
  swirl: Swirl,
  pores: { cu: number; cv: number; r: number }[],
  flecks: { cu: number; cv: number; r: number }[],
): THREE.CanvasTexture {
  const crumb = rgbOf(CRUMB_RENDER); // 컷 페이스(수직면) 렌더 타겟 -- 위 CRUMB_RENDER 주석 참조
  const pore = rgbOf(CRUMB_PORE);
  const crumbLit = rgbOf(CRUMB_LIT);
  const jam = rgbOf(JAM_RENDER); // 컷 페이스 렌더 타겟 -- 위 JAM_RENDER 주석 참조
  const jamLit = rgbOf(JAM_LIT);
  const halo = rgbOf(JAM_HALO);
  const crustLight = rgbOf(CRUST_LIGHT);
  const crustDark = rgbOf(CRUST_DARK);
  const crustShadow = rgbOf(CRUST_SHADOW);
  const slashFlesh = rgbOf(SLASH_FLESH);
  const crustMid: RGB = [
    Math.round((crustDark[0] + crustLight[0]) / 2),
    Math.round((crustDark[1] + crustLight[1]) / 2),
    Math.round((crustDark[2] + crustLight[2]) / 2),
  ];
  // [material-pass 수정, 1차 렌더 실측] 3톤(dark/mid/light)이 전부 어두운 브라운 계열에 몰려
  // 있어 촘촘한 링이 "여러 겹의 갈색 그러데이션"으로만 읽히고 레퍼런스의 뚜렷한 명암 밴딩이
  // 안 살았다 -- 마루(하이라이트) 톤을 FLOUR와 섞어 더 밝게 잡아 링 대비를 올린다.
  const crustHighlight: RGB = rgbOf(mixHex(CRUST_LIGHT, FLOUR, 0.4));

  const crustPixel = (px: number, py: number): RGB => {
    const u = (px + 0.5) / CRUST_PX;
    const v = (py + 0.5) / CRUST_PX;
    const cr = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
    const t = Math.sqrt(Math.max(0, 1 - cr * cr));
    const angleDeg = ((Math.atan2(v - 0.5, u - 0.5) * 180) / Math.PI + 360) % 360;
    if (slashFalloff(angleDeg, t, SLASH_GAP_HALF_ANGLE_DEG) > 0) return crustDark;
    if (slashFalloff(angleDeg, t, SLASH_FLESH_HALF_ANGLE_DEG) > 0) return slashFlesh;
    // [material-pass 3차 수정, 팀리드 실측 지적: "십자 칼집이 테이프처럼 납작하다"] 이어(ear)
    // 융기는 EAR_HEIGHT로 실제 지오메트리가 솟아 있지만(buildDome 참조), 텍스처에서는 별도
    // 색 분기가 없어 주변 링 밴딩을 그대로 이어받았다 -- 융기가 색으로 표시되지 않으니 "표면에
    // 붙인 밝은 띠"로 읽혔다. 잼 스월과 같은 원칙(색·릴리프 결합)을 적용: 이어 전체 폭
    // (SLASH_HALF_ANGLE_DEG까지)을 링 패턴과 무관하게 매끈한 크러스트하이라이트로 칠해
    // "솟은 매끈한 능선"이 시각적으로도 성립하게 한다.
    if (slashFalloff(angleDeg, t, SLASH_HALF_ANGLE_DEG) > 0) return crustHighlight;
    const ridge = t >= GROOVE_ZONE[0] && t <= GROOVE_ZONE[1] ? domeRingPhase(t, DOME_SPEC) : 0.5;
    // [material-pass 3차 수정] 골 임계값을 0.09->0.05로 좁혀 가장 어두운 악센트 선의 폭 자체를
    // 줄인다(레퍼런스는 골이 머리카락처럼 가늘다).
    if (ridge < 0.05) return crustShadow;
    // [material-pass 2·3차 수정, 팀리드 실측 지적] domeRingPhase는 대칭 코사인(50% 듀티 사이클)이라
    // 폭 절반이 어두운/중간 톤으로 채색됐다 -- 넓은 net 표본(탑다운) 실측 median이 정본 hex보다
    // 훨씬 진했던 진짜 원인. 레퍼런스는 "넓은 밝은 크러스트 사이 얇은 어두운 골"인데 우리는
    // "반반"으로 칠했다. domeShell.ts(공유 베이스 파일, 수정 금지)는 그대로 두고 **이 변형
    // 안에서만** ridge를 지수 압축(pow<1)해 마루 쪽을 넓히고 골만 좁게 남긴다. 2차 수정의
    // 0.38은 부족했다(팀리드: "여전히 갈색 톤이 화면을 먹는다") -- 0.2로 더 밀었다.
    const ridgePeak = Math.pow(ridge, 0.2);
    const score = 0.68 * ridgePeak + 0.32 * t;
    return score < 0.22 ? crustDark : score < 0.42 ? crustMid : score < 0.68 ? crustLight : crustHighlight;
  };

  const facePixel = (px: number, py: number): RGB => {
    const u = (px - FACE_X + 0.5) / FACE_W;
    const v = 1 - (py - FACE_Y + 0.5) / FACE_H;
    if (Math.hypot(u, v) >= RIM_INNER) return crustLight;
    if (v <= BASE_CRUST_V) return crustDark;

    const d = swirl.dist(u, v);
    for (let i = 0; i < pores.length; i++) {
      const p = pores[i];
      if (d <= 0 && i % 5 !== 0) continue;
      // [material-pass 2차 수정, 팀리드 실측 지적] 기공이 "흰/베이지 반점이 흩뿌려진" 좁쌀·곰팡이
      // 인상으로 읽혔다 -- CRIB 기존 실패("밀가루 더스팅 알갱이가 크면 곰팡이로 읽힘, 반지름을
      // 절반으로 줄이니 가루로 읽혔다")와 동일 처방을 적용: **대비는 그대로 두고 페인트 반지름만
      // 절반으로** 줄인다. 지오메트리 함몰(dimples, buildCutFace의 p.r)은 그대로 둬 그루브 깊이가
      // 안 바뀌게 하고, 텍스처 표시 반경만 PORE_PAINT_SCALE로 축소한다.
      const pr = p.r * PORE_PAINT_SCALE;
      const du = (u - p.cu) / pr;
      const dv = (v - p.cv) / (pr / DOME_HEIGHT);
      const q = du * du + dv * dv;
      if (q <= 1) return q > 0.7 ? crumbLit : pore;
    }
    if (d <= -0.005) return jam;
    if (d <= 0) return jamLit;
    if (d <= SWIRL_HALO) return halo;
    for (const f of flecks) {
      const du = (u - f.cu) / f.r;
      const dv = (v - f.cv) / (f.r / DOME_HEIGHT);
      if (du * du + dv * dv <= 1) return halo;
    }
    return crumb;
  };

  return bakeTexture(TEX, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        let c = crumb;
        if (px < CRUST_PX && py < CRUST_PX) c = crustPixel(px, py);
        else if (px >= FACE_X && py >= FACE_Y) c = facePixel(px, py);
        const o = (py * size + px) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // 밀가루 더스팅 -- campagne.ts 전사, 알갱이 작게(v1 실측: 큰 알갱이는 곰팡이 반점처럼 읽힘).
    const DUST_COUNT = 190;
    ctx.globalAlpha = 0.44;
    ctx.fillStyle = `rgb(${(FLOUR >> 16) & 0xff}, ${(FLOUR >> 8) & 0xff}, ${FLOUR & 0xff})`;
    let placed = 0;
    let attempts = 0;
    while (placed < DUST_COUNT && attempts < DUST_COUNT * 8) {
      attempts++;
      const u = rng();
      const v = rng();
      const cr = Math.hypot(u - 0.5, v - 0.5) * 2;
      if (cr > 0.98) continue;
      const t = Math.sqrt(Math.max(0, 1 - cr * cr));
      const ridge = t >= GROOVE_ZONE[0] && t <= GROOVE_ZONE[1] ? domeRingPhase(t, DOME_SPEC) : 0.5;
      if (rng() > ridge * ridge) continue;
      ctx.beginPath();
      ctx.arc(u * CRUST_PX, v * CRUST_PX, (0.0035 + rng() * 0.006) * CRUST_PX, 0, Math.PI * 2);
      ctx.fill();
      placed++;
    }
    ctx.globalAlpha = 1;
  });
}

export const createCampagneStrawberryJam: BreadBuilder = (rng) => {
  const swirl = makeSwirl(rng);
  const pores = makePores(rng);
  const flecks = makeFlecks(rng, swirl);

  const { geometry: dome, ringStart, profile, wobble } = buildDome(rng);

  dome.computeBoundingBox();
  const bb = dome.boundingBox as THREE.Box3;
  const domeCx = (bb.min.x + bb.max.x) / 2;
  const domeCz = (bb.min.z + bb.max.z) / 2;
  const domeR = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 || 1e-6;

  const faceA = buildCutFace(dome, ringStart, profile, wobble, CUT_COL_A, false, swirl, pores);
  const faceB = buildCutFace(dome, ringStart, profile, wobble, CUT_COL_B, true, swirl, pores);

  cutWedge(dome, profile);
  uvDomeAtlas(dome, domeCx, domeCz, domeR);
  dome.computeVertexNormals(); // 스무스 노멀 -- facet() 금지

  const material = stdMaterial({ map: paintAtlas(rng, swirl, pores, flecks) });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(dome, material));
  group.add(new THREE.Mesh(faceA, material));
  group.add(new THREE.Mesh(faceB, material));
  return mergeByMaterial(group);
};
