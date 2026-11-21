// 떼어내기 v5~v8(2026-11-21 명세 .work/feel4/spec_v5 · v8.md) — 들기 상태기(StrandRig, 순수 TS, three 없음)와 반죽 셰이더가 같이 쓰는 GLSL 소스.
// 기둥은 반죽 메시 자체를 꼬집어 그린다(DoughMesh GRAB_FIELD pinchPos — v8b 척추 17점 하나의 모양 함수). 가닥 메시 · draw call은 v5에서 지웠다(파일 이름만 그대로).
// D = 병 안지름 = D_W(월드).
import { FILL_RADIUS } from '../jar';

/** 병 안지름(월드) — 실물 대조표의 D */
export const D_W = 2 * FILL_RADIUS;

/** 무리수 회전 3옥타브 트리그 FBM — 반죽 vert · frag가 이 소스 하나를 쓴다(텍스처 fetch 0, VISUAL §8) */
export const FBM_GLSL = /* glsl */ `
float fbm(vec2 p) {
  mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
  float v = 0.6 * sin(p.x) * cos(p.y);
  p = R * p * 1.9 + 13.7;
  v += 0.3 * sin(p.x) * cos(p.y);
  p = R * p * 1.9 + 5.1;
  v += 0.15 * sin(p.x) * cos(p.y);
  return v;
}
`;

/** FBM_GLSL의 CPU 짝 — 같은 식(mat2는 열 우선: R·p = (0.8x + 0.6y, −0.6x + 0.8y)). DoughMesh.surfaceY가 쓴다 */
export function fbm2(x: number, y: number): number {
  let v = 0.6 * Math.sin(x) * Math.cos(y);
  let px = (0.8 * x + 0.6 * y) * 1.9 + 13.7;
  let py = (-0.6 * x + 0.8 * y) * 1.9 + 13.7;
  v += 0.3 * Math.sin(px) * Math.cos(py);
  const qx = (0.8 * px + 0.6 * py) * 1.9 + 5.1;
  const qy = (-0.6 * px + 0.8 * py) * 1.9 + 5.1;
  px = qx;
  py = qy;
  v += 0.15 * Math.sin(px) * Math.cos(py);
  return v;
}

/**
 * 반죽 음영 — 노멀 이후(반구 앰비언트 · wrap diffuse · 소프트박스 광 · 경사 페널티). 반죽 frag가 쓴다(가닥 셰이더는 v5에서 지웠다).
 * 반죽 frag에서 그대로 뽑아 온 식이다(리팩터 전후 픽셀 같음). xz = 오브젝트 xz(광 띠 도메인), wetL = 젖은 광, matte = 무광 몫.
 * 쓰는 uniform: uSpecStr(공유 객체).
 */
export const DOUGH_SHADE = /* glsl */ `
// 반죽 전용 키 — 씬 KEY_POS보다 낮다(고도 28.6°). 얼룩 증폭은 노이즈 원천(fbmG · 기공)을 지워 해결했고,
// 높이를 올리면 하강 주름 · 젓은 물결 · 돔의 결이 함께 죽어 그대로 둔다(A1-05 검토, VISUAL §1-3).
vec3 doughKey() { return normalize(vec3(-0.7, 0.45, 0.45)); }
vec3 doughShade(vec3 nrm, vec3 base, vec2 xz, float wetL, float matte, out float ndl) {
  vec3 L = doughKey();
  // wrap diffuse — 반투명 페이스트의 부드러운 터미네이터
  ndl = clamp((dot(nrm, L) + 0.35) / 1.35, 0.0, 1.0);
  float slope = length(nrm.xz);

  // 반구 앰비언트 — 윗면 밝기 유지, 어깨·측면 하강 = 부피감 + 유리 접촉 그늘
  vec3 col = base * (0.58 + 0.16 * nrm.y + 0.44 * ndl) * vec3(1.04, 0.985, 0.915);

  // ── 광택(R2-12) — "병 위 소프트박스" 상수 하프벡터. 젖으면 넓고 부드럽게(지수 16 → 9), 세기는 uSpecStr이 상태를 나른다:
  //    갓 밥준 넓은 젖은 광 · 피크 새틴 · 배고픔 얇은 막 · 휴면 매트 ──
  {
    vec3 HS = normalize(vec3(-0.30, 1.0, 0.22));
    float sheet = pow(max(dot(nrm, HS), 0.0), mix(16.0, 9.0, wetL));
    // 균일 밝힘은 '반사'로 안 읽힌다 — 완만한 띠로 잘라 창 모양을 준다
    float band = 0.45 + 0.55 * smoothstep(-0.55, 0.30, dot(xz, vec2(-0.62, 0.78)));
    // normalize(L+V) — 직교 카메라라 V는 화면 전체에서 같다. viewMatrix 3행 = 카메라 +Z(월드)
    vec3 HC = normalize(L + vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
    float spec = sheet * band * (0.30 + 0.45 * wetL) + pow(max(dot(nrm, HC), 0.0), 5.0) * 0.05;
    col += vec3(0.28, 0.16, 0.08) * spec * uSpecStr * (1.0 - matte);
  }
  // 경사 페널티 최소화 — 입체감은 ndl·반구가 담당
  col -= vec3(0.03, 0.022, 0.015) * slope;
  return col;
}
`;

/**
 * 반죽 알베도 — 모틀(fbm) · 젖음. 반죽 frag가 쓴다(검토 C-1). 쓰는 uniform: uColor · uWet(공유 객체).
 * 앞에 FBM_GLSL이 있어야 한다. xz = 오브젝트 xz(§6-13), mott는 반죽 frag가 줄무늬 · 잔줄 휨에 다시 쓴다
 */
export const DOUGH_ALBEDO = /* glsl */ `
vec3 doughAlbedo(vec2 xz, out float mott) {
  mott = fbm(xz * 1.4 + 11.0);
  // 젖으면 조금 진해진다(R2-12: 0.90 → 0.93, 젖은 광과 같이 다시 봄)
  return uColor * (1.0 + mott * 0.03) * mix(1.0, 0.93, uWet);
}
`;

/**
 * 칸 기포 — 반죽 frag 바늘구멍 · 거품 · 유리 너머 기포 단면이 쓴다
 */
export const CELL_BUBBLE = /* glsl */ `
// 칸 해시 — 칸 번호를 37로 접어(정수라 fp16에서도 정확) 중간값을 16 아래로 묶는다. 반죽은 늘 highp(WebGL2, 위 머리 주석)라
// 정밀도 이득은 없고, 접기는 mediump로 도는 경우를 위한 예비책이다(그때도 소수 7비트가 남는다). 대가로 37칸마다 배치가
// 반복된다 — 옆벽 잔 기포 116° · 윗면 잔거품 1.18월드. 캡처 상관 −0.005라 눈에 띄지 않는다(2026-11-19 R-L4).
// 옛 sin 큰 배율 해시는 fp16에서 줄무늬로 무너진다
vec3 hash3(vec2 c) {
  vec3 p = fract(mod(c.xyx, 37.0) * vec3(0.1031, 0.1030, 0.0973));
  p = fract(p + dot(p, p.yzx + 2.33));
  return fract((p.xxy + p.yzz) * p.zyx * 7.31);
}

// 칸 하나 = 기포 하나 — 자기 칸만 본다(이웃 탐색 없음). 기포는 칸 안에 들어가게 반지름을 묶고 중심을 지터한다.
//   uv = 칸 단위 좌표, cell = 칸 크기(월드), pres = 칸에 기포가 있을 확률(빈칸이 격자를 지운다),
//   r0·r1 = 반지름 범위(월드, 작은 것이 많다), asp = 세로/가로 비, grow = 크기 배율.
// 반환: x = 속(부드러운 가장자리) · y = 테두리 고리 · z = 국소 세로 좌표(위 +) · w = 크기 0~1
vec4 cellBubble(vec2 uv, vec2 cell, float pres, float r0, float r1, float asp, float grow) {
  vec3 h = hash3(floor(uv));
  if (h.z >= pres) return vec4(0.0);
  float h4 = fract(h.x * 5.37 + h.y * 2.91);
  float r = mix(r0, r1, h4 * h4) * grow;
  float a = asp * mix(0.8, 1.25, fract(h.y * 3.7 + h.z * 11.3)); // 칸마다 타원비
  vec2 rad = min(vec2(r * inversesqrt(a), r * sqrt(a)), cell * 0.36);
  vec2 lo = rad / cell;
  vec2 q = (fract(uv) - lo - (1.0 - 2.0 * lo) * h.xy) * cell / rad;
  // 휨 — 납작할수록 더 휜다(렌즈가 알약 · 씨앗 꼴로 줄서지 않게). 부호는 크기(h4)와 따로 놀아야 큰 칸이 다 같은 쪽으로
  // 휘지 않는다 — 위로 볼록한 회색 초승달이 줄지으면 「감은 눈」(판정 L1). 최대치 0.3 → 0.2
  q.y += (fract(h.x * 7.13 + h.z * 3.71) - 0.5) * 0.4 / a * q.x * q.x;
  float d = length(q);
  float ring = smoothstep(0.5, 0.88, d) * (1.0 - smoothstep(0.88, 1.15, d));
  return vec4(1.0 - smoothstep(0.62, 1.0, d), ring, q.y, h4);
}
`;



// ── 떼어내기 v8(2026-11-21, 명세 .work/feel4/spec_v8.md) — 기둥은 반죽 윗면 메시 자체를 꼬집어 그린다(DoughMesh GRAB_FIELD pinchPos).
//    모양 함수는 하나다: 척추 17점(uSpine — 위치 + 굵기 배율) · 몸통 폭 · 그물 벌어짐 · 끊긴 끝 닫힘 · 꼭대기 크기 · 기둥 길이(짧으면 낮은 혹) · 가닥 넷 끊긴 지.
//    이 상태기는 그 값들을 τ · 중력 곡선으로 연속으로 몬다. 끊김 · 놓기 때 다른 모양으로 갈아 끼우지 않는다(v5~v7 갈래 · 위 덩이 · 밧줄 교체는 지웠다) ──
/** 척추 점 개수 — 몫 i/16. 아래 몸 = 0~11(몫 0~0.6875), 그물 = 11~15(0.6875~0.9375, 꼭대기 바로 밑 — spec_v8c §1), 위 몸 · 꼭대기 = 15~16.
 *  셰이더 PINCH_FA · PINCH_FB와 짝 */
export const SPINE_N = 17;
/** 끊긴 아래 기둥 끝 — 점 11(몫 0.6875 = 그물 밑). 가닥 아래 토막이 여기까지 처져 둥근 한 끝으로 모이고, 남은 기둥(점 0~11)이 굽으며 주저앉는다(spec_v8c §1 · §2) */
const LOWER_I = 11;
/** 가닥 없는 기둥(되직)의 끊는 자리 — 꼭대기 바로 밑 점 15(셰이더 PINCH_FB와 같은 몫 — 다르면 사이 정점이 축으로 모여 압정 침이었다) */
const STIFF_CUT_I = 15;
/** 되직 기둥 높이 상한(D) — 그리는 꼭대기만 0.25D로 부드럽게 눌린다(tanh, 묽음 혀와 같은 식). 끊김은 끌어 올린 거리(끊김 길이 0.25D)에서 —
 *  기둥 길이 0.25D에서 바로 끊으면 커밋 뒤 0.15s 만에 솟자마자 끊겨 기둥으로 안 읽히고 치마 종 · 원판만 남았다(v8d 1회전 새 눈) */
const STIFF_MAX_H = 0.25;
/** 묽음 혀 높이 상한(D) — 그리는 꼭대기만(spec_v8b §6 「높이 ≤0.3D」). 0.3은 기운 감자 · 조약돌 덩이였다(v8b r3 새 눈) — 낮은 혀 0.22 */
const RUNNY_MAX_H = 0.22;
/** 버팀 추종은 2차 임계 감쇠(속도 0에서 출발) — 1차 τ0.16은 첫 틱 속도가 손끝 거리 ÷ τ라 기둥 몫 켬 길이를 1~2프레임에 넘어
 *  테 두른 넓은 혹이 한 프레임에 솟았다(justfed 0.83 → 0.87, spec_v8b §5). ω = HOLD_W ÷ τ(정착 시간이 τ0.16 1차와 비슷) */
const HOLD_W = 1.7;
/** 몸통 지름(D, 늘어나기 전) — 그물 0.30 · 되직 0.34 · 묽음 0.36(spec_v8 §2 · §4). 부피 보존 W = W0 · √(LW ÷ L), 그물 전 하한 0.16D */
const W0_WEB = 0.3;
const W0_STIFF = 0.34;
const W0_RUNNY = 0.36;
const THIN_LW = 0.4 * D_W; // 0.25D는 그물 전에 하한에 닿아 철사 목이었다(v8 r1 검수 ②)
const W_MIN = 0.16 * D_W;
/** 병 안 클램프 — 밑점 · 끝점 xz */
const CLAMP_R = 0.85 * FILL_RADIUS;
/** 휴면 · 곰팡이 문턱 — grabMax가 이 아래면 기둥 없음 · 끊김 소리 없음, 깔때기만 조금 */
const STRAND_MIN_GRABMAX = 0.2;
/** ① 버팀 — 꼭대기가 손끝을 τ0.16로 무겁게 따른다. ② 항복 — 0.12s 동안 τ0.05로 따라잡은 뒤 elasticTau */
const HOLD_TAU = 0.16;
const YIELD_TAU = 0.05;
const YIELD_S = 0.12;
/** 묽음은 손끝을 더 늦게 따른다(+τ0.2) — 혀가 손끝 밑으로 처져 흘러내린다. 추정 */
const RUNNY_LAG = 0.2;
/** 항복 문턱 — (끈 거리 ≥ 0.25D 그리고 잡은 지 ≥ 0.3s) 또는 끈 거리 ≥ 0.5D에서 한 번(그물만) */
const YIELD_D = 0.25 * D_W;
const YIELD_MIN_S = 0.3;
const YIELD_FORCE_D = 0.5 * D_W;
/** 그물(§1) — 끊김 길이 몫 0.7 → 0.9에서 구멍이 벌어진다(끊기기 전에 다 열린다). 놓으면 τ0.15로 닫힌다. 추정 */
const NET_FROM = 0.7;
const NET_TO = 0.9;
const NET_CLOSE_TAU = 0.15;
/** 그물 벌어짐은 목표를 τ0.1로 따른다 — 0.74~0.9 문턱만으론 5프레임에 구멍 · 가로 이음선이 한꺼번에 열렸다(v8b r3 2.10 → 2.13) */
const NET_OPEN_TAU = 0.1;
/** 가닥 넷 — 방위 ≈ 29° · 100° · 166° · 264°(셰이더 strandNear). 앞에서 보이는 셋이 화면 가로 0.88 · −0.18 · −0.97로 간격이 다르고,
 *  가운데 앞 가닥(1)이 굵다(바지 두 다리 + 가운데 실 0, v8b r3 새 눈 ③). 뒤 가닥(3)이 먼저, 굵은 1이 마지막(기둥 끊김) */
const LEG_N = 4;
const LEG_THICK = 1;
const LEG_EARLY = 3;
/** 가는 가닥 하나가 끊김 길이 0.9~0.95 몫에서 먼저 끊긴다(그물이 벌어진 뒤). 추정 */
const EARLY_F = 0.9;
const EARLY_SPAN = 0.05;
/** 끊김 길이에 닿으면 남은 가닥이 60~120ms 차로 하나씩, 마지막이 굵은 가닥 = 기둥 끊김 */
const LEG_GAP_LO = 0.06;
const LEG_GAP_SPAN = 0.06;
/** 가닥 지름(D) — 가닥마다 [하한, 폭] — 굵은 앞 가운데 0.046, 오른쪽 0.038~0.046, 왼쪽 · 뒤 0.032~0.04
 *  (spec_v8b §2 — 1배 5~9px, 굵기 제각각). 0.054 · 0.042는 몸 둘레에 가닥 셋이 차서 구멍이 1~2px 세로 홈이었다(v8d 1회전 새 눈) */
const LEG_W = [0.038, 0.046, 0.032, 0.032];
const LEG_W_SPAN = 0.008;
/** 끊김(마지막 굵은 가닥) — 기둥이 꼭대기째 아래 몸 끝(점 11)까지 움츠러드는 시간(smoothstep). 먼저 끊긴 가닥 토막은 이 몫 앞 절반에
 *  다시 붙고 그물 구멍도 닫힌다. 꼭대기 원판이 둥근 끝이 된다 — 떨어진 위 조각 · 아래 토막 끝은 따로 그리지 않는다(v8c 2회전: 손끝 자리에서
 *  줄던 위 조각은 공중 알약 · 한 프레임 58px 소멸, 따로 닫던 아래 토막은 왕관 · 삼지창 · 두 갈래 끝이었다). 미리 줄임(그물 동안 꼭대기를
 *  가닥 굵기로)은 바늘 · 화살촉 첨탑이라 지웠다. 0.22s smoothstep = 30fps 프레임당 ≤ 0.23 */
const STUB_S = 0.22;
/** 끊긴 직후 반동 — 0.05s 동안 위가 × 0.92로 살짝 내려앉는다(spec_v8c §2). 끊기 전에 놓으면 반동 없이 0.08s 정지 */
const RECOIL_S = 0.05;
const RECOIL_H = 0.92;
const STAND_S = 0.08;
/** 털썩 = 굽으며 주저앉음(spec_v8c §2) — 그물 0.5s · 되직 0.3s · 묽음 0.6s(퍼지며 낮아짐) */
const SLUMP_RUNNY = 0.6;
const SLUMP_STIFF = 0.3;
const SLUMP_WEB = 0.55;
/** 굽힘 — 꼭대기가 앞왼쪽으로 40° 기운다. 마디마다 발에서 잰 몫만큼(백조 목 — 밑동째 기우는 강체 회전 0). 되직 × 0.6 · 묽음 × 0.5. 추정 */
const TILT = 0.7;
const TILT_STIFF = 0.6;
const TILT_RUNNY = 0.5;
/** 주저앉은 낮은 혹 높이(D) — 그물 0.07 · 되직 0.06 · 묽음 0.04(spec_v8c §2 0.06~0.1D — 0.09는 높고 흰 크림 혹, v8c 1회전 새 눈). 높이는 smoothstep으로 여기까지(stepSlump) */
const HUMP_H_WEB = 0.07;
const HUMP_H_STIFF = 0.06;
const HUMP_H_RUNNY = 0.04;
/** 혹 몫 — 털썩 몫 g 0.5 → 1. 기둥 → 혹 모양 섞기는 주로 길이(write c[10])가 맡는다: 높이가 낮아진 뒤에야 혹이 된다.
 *  g 0.05 → 0.6으로 일찍 섞으면 아직 키 큰 기둥이 수평 고리 혹 꼴로 바뀌어 납작 윗면 그루터기 · 상어 지느러미였다(v8d 1회전 peak 2.77~3.00 · release 2.27~2.43).
 *  길이 몫만으로 섞던 때의 교체(v8c 1회전 2.93 → 3.00)는 높이를 g²(끝이 가장 빠름) 대신 smoothstep으로 눌러 푼다 */
const HUMP_G0 = 0.5;
const HUMP_G1 = 1;
/** 혹이 되며 꼭대기가 밑동 반폭의 0.5배 넘게 기운 쪽으로 나가지 않는다 — 넘으면 눌린 기둥이 옆으로 처마를 내 진한 테 · 렌즈 판이었다(v8c 1회전 3.30) */
const HUMP_OFF = 0.5;
/** 긴 기둥 몫(셰이더 모양 섞기) 길이 문턱(D) — 그물 0.1 → 0.5 · 되직 0.04 → 0.18(0.25D 짧고 굵은 기둥이 실제로 선다, spec_v8c §5) */
const LONG_LO = 0.1;
const LONG_HI = 0.5;
const LONG_LO_STIFF = 0.04;
const LONG_HI_STIFF = 0.18;
/** 주저앉으며 굵어지는 몫(부피 보존 — 혹 윗부분이 둥글게) */
const HUMP_WIDEN = 0.3;
/** 밑동이 털썩 동안 × 0.67로 모인다 — 혹 밑 0.4D(spec_v8c §2 0.35~0.45D) */
const SKIRT_GATHER = 0.33;
/** 착지(「철퍽」 · 접힘 높이장)는 털썩 몫 0.6에서 */
const LAND_AT = 0.6;
/** 기우는 쪽 — 앞왼쪽(화면 앞을 덜 보게 옆으로 더 — 둥근 끝이 화면을 보는 소시지 끝 0). 묽음 혀가 처지는 쪽도 같다 */
const LIE_DIR_X = -0.85;
const LIE_DIR_Z = 0.5;
/** 혹 → 보조개(spec_v8c §3) — 0.6s 동안 혹이 반으로 낮아지며 기둥 몫이 몫 0.1부터 꺼지고, 그 아래 접힘 높이장(uPile · 남은 혹)이 이미 차 있다(겹침 ≥ 0.2s) */
const VANISH_S = 0.6;
const VANISH_GATE0 = 0.1;
const VANISH_SINK = 0.5;
/** 녹은 뒤 무늬 이완이 풀리는 τ(s). 추정 */
const RELAX_TAU = 1;
/** 다시 잡으면 무늬 이완이 τ0.15s로 풀린다(1 → 0 한 틱 튐 0, 규칙 검수 v8 ①) */
const RELAX_GRAB_TAU = 0.15;
/** 녹음 몫은 털썩이 끝난 뒤 τ0.2s로 풀린다(한 틱 1 → 0 금지) */
const MELT_OFF_TAU = 0.2;
/** 깔때기 반경 S(D) — 그물 0.45 · 되직 · 묽음 0.36. 높이 배율 — 되직 0.8 · 묽음 0.45.
 *  되직 · 묽음은 기둥 몫 원(0.7S = 0.25D)이 밑동 반폭 0.25D와 같게 — 오므리지도 펴지지도 않는다. S 0.45~0.48은 둘레가 오므라들며 무늬가
 *  방사 톱니 테 · 햇살 테였고(spec_v8d §4), 0.32는 밑동이 원보다 넓어 깔때기 고리가 눌려 접힌 렌즈 테 · 원판 테였다(v8d 1회전 sour · justfed).
 *  그물은 방사 결이 실물(UPQ94 밑동)이라 그대로 */
const FUNNEL_S_WEB = 0.45;
const FUNNEL_S_STIFF = 0.36;
const FUNNEL_S_RUNNY = 0.36;
const FUNNEL_H_STIFF = 0.8;
const FUNNEL_H_RUNNY = 0.45;
/** 깔때기 높이 = HMAX · 배율 · (1 − e^(−d/D)), HMAX 0.22D · D 0.25D(끌수록 오르다 포화) */
export const MOUND_HMAX = 0.22 * D_W;
export const MOUND_D = 0.25 * D_W;
/** 접힘 높이장 — 주저앉은 혹 밑에 차오르는 낮은 둔덕(혹 → 보조개 섞기의 받침). 높이 0.07D(찢김 없이 놓으면 × 1.5) · 길이 = 기운 거리. 추정 */
const PILE_H = 0.07 * D_W;
const PILE_MAX = 1.5 * PILE_H;
const PILE_IN_TAU = 0.08;
/** 가라앉음 τ — 피크 2s · 갓 밥준 4s · 시큼 0.6s */
const SETTLE_WEB = 2;
const SETTLE_STIFF = 4;
const SETTLE_RUNNY = 0.6;
/** 단면 · 윤곽 — [밑동 가로 반폭(D), 밑동 깊이 배율, 꼭대기 넓힘 배율, 혀 몫].
 *  그물 = 밑동 지름 0.6D · 꼭대기 1.03배 · 되직 = 밑동 0.5D · 묽음 = 밑동 0.5D · 둥근 혀 끝. 추정 */
const SHAPE_WEB = [0.3, 0.72, 1.03, 0];
const SHAPE_STIFF = [0.25, 0.8, 1.02, 0];
const SHAPE_RUNNY = [0.25, 0.7, 0.9, 1];
/** 묽음 혀가 손끝 밑으로 처지는 몫 · 앞왼쪽으로 기우는 몫(그리는 꼭대기만 — 끊김 판정 길이는 그대로). 추정 */
const RUNNY_DROOP = 0.45;
const RUNNY_SIDE = 0.35;
/** 기둥 몫 켬 길이(D) — 되직은 끊김이 짧아 0.12D. 추정 */
const GATE_WEB = 0.25;
const GATE_STIFF = 0.12;
/** 남은 혹 몫이 차는 τ — 막이 풀리면 깔때기가 넓은 혹 2~3개로. 추정 */
const LOBE_TAU = 0.2;

export interface StrandMix {
  /** 그물 — 피크 · 오르는 · 내려앉는 ≈ 1 */
  web: number;
  /** 묽음 — 시큼 ≈ 1 */
  runny: number;
  /** 되직 — 갓 밥준 · 배고픔 · 휴면 */
  stiff: number;
  grabMax: number;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** RenderParams → 상태 혼합 세 가지(§1-3) */
export function strandMix(elasticity: number, fluidity: number, grabMax: number): StrandMix {
  const web = smooth(0.3, 0.8, elasticity);
  const runny = smooth(0.4, 0.75, fluidity) * (1 - web);
  return { web, runny, stiff: Math.max(0, 1 - web - runny), grabMax };
}

/** 묽음 끊김 계수 — 시큼 ≈ 0.45D 짧은 혀. 추정 */
const RUNNY_BREAK_K = 0.55;
/** 끊김 길이(월드, 버팀 짧아짐 전, 커밋 길이 위로) — 피크 1.0D(그물 계수 0.5833) · 갓 밥준 0.25D · 시큼 ≈ 0.45D.
 *  잠금값 grabMax 0.600(2026-08-24 확정) 값은 안 바꿨다 */
export function mainBreakLen(m: StrandMix): number {
  return 2 * D_W * m.grabMax * (0.25 + 0.5833 * m.web + RUNNY_BREAK_K * m.runny);
}

export interface StrandEnv {
  /** 반죽 윗면 월드 y(숨 · 깔때기 평균 포함) — 월드 xz */
  surfaceY(x: number, z: number): number;
  /** 항복 뒤 끝점 추종 τ(s) — GRAB elasticTau */
  followTau: number;
  /** 버티면 짧아짐 — 잡은 지 delay 뒤부터 × (0.55 + 0.45·e^(−(t−delay)/τ)) */
  creepDelay: number;
  creepTau: number;
}

/** 들기 사건 — 소리 · 진동(SceneHost.onGrabEvent → app) */
export interface StrandBreak {
  /** yield = 버티던 기둥이 한 번에 뻗음 · break = 가닥 끊김(thin = 가는 가닥, last = 마지막 · 기둥 끊김) · land = 털썩 착지 */
  kind: 'yield' | 'break' | 'land';
  thin: boolean;
  last: boolean;
  /** land만 — 뜯고 떨어졌나(놓아서 · 묽어서 떨어진 건 false) */
  torn: boolean;
}

/** 배열 값이 전부 유한한가 — 매 tick 부르므로 할당 없이 인덱스 루프(검토 C-3) */
function allFinite(a: ArrayLike<number>): boolean {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
}

const hash = (i: number, seed: number): number => {
  const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** 선 기둥 중심선 한 점 — 2차 베지어 P0 = 발, P1 = 발 위 max(0.5·dy, 0.6·|dxz|), P2 = 꼭대기(발 접선이 늘 위 — 발 고리 수평) */
export function curvePoint(p0: ArrayLike<number>, t: ArrayLike<number>, f: number, out: number[]): void {
  const dx = t[0] - p0[0];
  const dy = t[1] - p0[1];
  const dz = t[2] - p0[2];
  const hc = Math.max(0.5 * dy, 0.6 * Math.hypot(dx, dz));
  const a = (1 - f) * (1 - f);
  const b = 2 * f * (1 - f);
  const c = f * f;
  out[0] = (a + b) * p0[0] + c * t[0];
  out[1] = a * p0[1] + b * (p0[1] + hc) + c * t[1];
  out[2] = (a + b) * p0[2] + c * t[2];
}

/** xz를 병 안 반경 CLAMP_R 안으로 */
function clampR(p: ArrayLike<number> & { [i: number]: number }, o: number): void {
  const r = Math.hypot(p[o], p[o + 2]);
  if (r > CLAMP_R) {
    p[o] *= CLAMP_R / r;
    p[o + 2] *= CLAMP_R / r;
  }
}

/**
 * 꼬집기 상태기 — 순수 TS(three · DOM 없음). 월드 좌표.
 * 출력 spine = 척추 17점 (x, y, z, 굵기 배율)(uSpine) · col = uPinch · uPinchB · uPinchC · uPinchD · uPinchE · uPinchF(각 4) · pile(남은 접힘).
 */
export class StrandRig {
  /** 척추 17점 — 몫 i/16, [x, y, z, 굵기 배율] */
  readonly spine = new Float32Array(SPINE_N * 4);
  /** uPinch(몸통 반폭, 밑동 반폭, 꼭대기 넓힘, 혀 몫) · uPinchB(깔때기 반경, 그물, 끊긴 끝 닫힘, 꼭대기 크기) ·
   *  uPinchC(기둥 몫, 씨앗, 긴 기둥 몫(혹 ↔ 기둥), 거침) · uPinchD(가닥 넷 끊긴 지(s), 안 끊김 −1) · uPinchE(남은 혹, 밑동 깊이, 아래 몸 몫, 길이) · uPinchF(가닥 지름) */
  readonly col = new Float32Array(24);
  /** 깔때기 반경(월드) · 높이 배율 — 상태별 */
  funnelR = FUNNEL_S_WEB * D_W;
  funnelK = 1;
  /** 무늬 씨앗(잡을 때마다 새로) */
  laneSeed = 0;
  /** 단면 · 윤곽 — 상태 혼합(SHAPE_*) */
  readonly shape = [...SHAPE_WEB];
  /** 그물 벌어짐 0~1 */
  split = 0;
  /** 남은 혹 몫 0~1 */
  lobe = 0;
  /** 무늬 이완 0~1 — 털썩 · 주저앉음 동안 무늬를 원래 좌표에서 지금 자리 좌표로 옮긴다(방사 줄무늬 부채 0, spec_v8 §2) */
  relax = 0;
  /** 녹음 0~1 — 혹이 꺼지는 끝 몫(셰이더가 노멀을 둔덕 쪽으로 넘기고, 묽은 혀를 표면으로 누른다) */
  melt = 0;
  visible = false;
  /** 이번 tick의 사건(소리 · 진동) */
  readonly events: StrandBreak[] = [];
  /** 남은 접힘 — 가운데 x, z, 높이, 길이(반쪽), 방위(rad), 거침(되직 몫) */
  readonly pile = [0, 0, 0, 0.1, 0, 0];

  /** 잡는 중 */
  active = false;
  /** 휴면 · 곰팡이 — 기둥 없음 */
  none = false;
  /** 기둥 길이(월드, 밑점 → 꼭대기) */
  len = 0;
  /** 버팀이 풀렸나(② 항복) */
  yielded = false;
  /** 기둥이 늘어나는 빠르기(월드/s, 붙은 동안) — 늘어남 틱 소리 */
  stretchSpeed = 0;
  private held = 0;
  private yieldAge = 0;
  private readonly base = [0, 0, 0];
  private readonly tip = [0, 0, 0];
  /** 버팀 2차 추종 속도(월드/s) */
  private readonly tipV = [0, 0, 0];
  private readonly target = [0, 0, 0];
  /** 그물 벌어짐 목표(τ NET_OPEN_TAU로 따른다) */
  private splitTgt = 0;
  private hasTarget = false;
  /** 커밋 순간 손끝까지 거리 — 끊김 판정은 기둥 길이 − 이 값(§6-2) */
  lenCommit = 0;
  private grabs = 0;
  private mix: StrandMix = { web: 0, runny: 0, stiff: 1, grabMax: 0 };
  private width = 0;
  private settleTau = SETTLE_WEB;
  private att = false;
  private gateLen = GATE_WEB * D_W;
  /** 가닥 — 켬 · 끊긴 지(s, −1 안 끊김) · 지름 · 먼저 끊길 가는 가닥 · 끊김 차례 · 차례 시각 */
  private legsOn = false;
  private readonly legAge = [-1, -1, -1, -1];
  private readonly legW = [0, 0, 0, 0];
  private early = -1;
  private earlyF = EARLY_F;
  private readonly order: number[] = [];
  private readonly orderAt: number[] = [];
  private cascadeT = -1;
  private cascadeNext = 0;
  /** 끊김 — 끊긴 지(s, −1 안 끊김) */
  private brokeAge = -1;
  /** 털썩 — 0 없음 · 1 넘어가는 중 · 2 착지 뒤 녹는 중 */
  private slumpMode = 0;
  private slumpAge = 0;
  private slumpDur = 1;
  private slumpTorn = false;
  /** 주저앉는 척추 끝 첨자(끊기면 아래 몸 11 · 되직 15, 놓으면 16) */
  private slumpN = SPINE_N - 1;
  private slumpR = 0;
  /** 그리는 기둥 길이(밑점 → 그리는 꼭대기, 버팀 · 혀 상한 뒤) — 셰이더 모양 섞기(혹 ↔ 기둥)가 쓴다 */
  private drawnL = 0;
  /** 털썩 시작 때 기둥 길이 · 그 뒤 세로 배율(1 → 낮은 혹) — 셰이더 혹 ↔ 기둥 섞기 길이 = slumpL × slumpS(연속) */
  private slumpL = 0;
  private slumpS = 1;
  /** 털썩 시작 때 아래 몸 높이(밑점 → 척추 끝) · 낮은 혹 세로 배율 · 굽힘 각 */
  private slumpH0 = 1;
  private slumpEnd = 0.1;
  private slumpTilt = TILT;
  private slumpGate = 1;
  /** 혹 몫 0~1 — 털썩 동안 오르고 녹는 동안 1(셰이더 긴 기둥 몫 = 길이 몫 × (1 − 혹 몫)) */
  private humpK = 0;
  private readonly slumpDir = [0, 0];
  /** 털썩 시작 때 척추(선 기둥) */
  private readonly q = new Float32Array(SPINE_N * 4);
  private gather = 0;
  private gate = 0;
  private pileIn = 0;
  private landed = false;
  private readonly tmp = [0, 0, 0];
  private readonly tmp2 = [0, 0, 0];

  /** 잡기 — 앵커 월드 xz. 남은 털썩은 바로 접힘으로 넘기고 새 기둥을 낸다(§6-14) */
  start(x: number, z: number, mix: StrandMix, env: StrandEnv): void {
    if (this.slumpMode === 1 && !this.landed) this.land(false);
    // 남은 혹 몫은 그리던 게 없으면 0에서 — 놓은 적 없는 상태기는 1이라 잡는 첫 0.2s가 놓은 뒤 꼴(둥근 끝 · 혹 셋)로 그려졌다(v8d 1회전 잡기 0.95 → 1.0)
    if (this.gate < 1e-3) this.lobe = 0;
    this.slumpMode = 0;
    this.grabs++;
    const gs = this.grabs;
    this.mix = mix;
    this.none = mix.grabMax < STRAND_MIN_GRABMAX;
    this.funnelR = D_W * (FUNNEL_S_WEB * mix.web + FUNNEL_S_STIFF * mix.stiff + FUNNEL_S_RUNNY * mix.runny);
    this.funnelK = mix.web + FUNNEL_H_STIFF * mix.stiff + FUNNEL_H_RUNNY * mix.runny;
    this.pile[5] = mix.stiff; // 되직 몫(uPileB.y) — 접힘 거침 · 무늬 흡입 끔이 잡는 동안에도 같은 값을 읽는다
    for (let i = 0; i < SHAPE_WEB.length; i++) this.shape[i] = SHAPE_WEB[i] * mix.web + SHAPE_STIFF[i] * mix.stiff + SHAPE_RUNNY[i] * mix.runny;
    this.gateLen = D_W * (GATE_WEB * (1 - mix.stiff) + GATE_STIFF * mix.stiff);
    this.split = 0;
    this.splitTgt = 0;
    this.tipV.fill(0);
    // 무늬 이완은 이어 받아 τ0.15로 푼다(녹는 중 다시 잡기 — 1 → 0 튐 0) · 녹음은 끝(새 기둥은 녹지 않는다, 규칙 검수 v8 ①)
    this.melt = 0;
    this.brokeAge = -1;
    this.gather = 0;
    this.humpK = 0;
    this.active = true;
    this.held = 0;
    this.hasTarget = false;
    this.lenCommit = 0;
    this.yielded = false;
    this.yieldAge = 0;
    this.stretchSpeed = 0;
    this.width = this.neckWidth(0);
    const sy = env.surfaceY(x, z);
    this.base[0] = x;
    this.base[1] = sy;
    this.base[2] = z;
    // 꼭대기는 밑점에서 출발한다(높이 0 출발, §6-2)
    this.tip[0] = x;
    this.tip[1] = sy;
    this.tip[2] = z;
    this.len = 0;
    this.att = !this.none;
    this.laneSeed = 10 * hash(23, gs);
    this.legsOn = !this.none && mix.web > 0.5;
    this.legAge.fill(-1);
    this.cascadeT = -1;
    this.cascadeNext = 0;
    this.order.length = 0;
    this.orderAt.length = 0;
    this.early = -1;
    // 가닥 넷 — 굵기는 가닥마다 정해진 폭에 조금 흔들림. 차례 = 뒤(3) 먼저 → 왼쪽 · 오른쪽(잡을 때마다 순서 바뀜) → 굵은 앞 가운데(1)
    for (let k = 0; k < LEG_N; k++) this.legW[k] = D_W * (LEG_W[k] + (k === LEG_THICK ? 0 : LEG_W_SPAN * hash(13 + k, gs)));
    if (this.legsOn) {
      this.early = LEG_EARLY;
      this.earlyF = EARLY_F + EARLY_SPAN * hash(29, gs);
      const a = hash(7, gs) < 0.5 ? 0 : 2;
      this.order.push(a, 2 - a, LEG_THICK);
      let t = 0;
      for (let i = 0; i < this.order.length; i++) {
        this.orderAt.push(t);
        t += LEG_GAP_LO + LEG_GAP_SPAN * hash(37 + i, gs);
      }
    }
    this.fillStand();
    this.write();
  }

  /** 손끝(월드) — 기둥 꼭대기 = 손끝 바로 밑. 첫 값이 커밋 길이 L_commit이 된다(§6-2) */
  move(x: number, y: number, z: number): void {
    if (!this.active) return;
    this.target[0] = x;
    this.target[1] = y;
    this.target[2] = z;
    clampR(this.target, 0);
    if (!this.hasTarget) {
      this.hasTarget = true;
      this.lenCommit = this.dist(this.target, this.base);
    }
  }

  /** 놓기 — 붙은 기둥은 그대로 털썩(그물 없이 기둥째) */
  release(): void {
    if (!this.active) return;
    this.active = false;
    this.dropAttached();
  }

  /** 다 지운다 — resetTransient · NaN 복구 */
  reset(): void {
    this.active = false;
    this.hasTarget = false;
    this.len = 0;
    this.width = 0;
    this.lenCommit = 0;
    this.held = 0;
    this.yielded = false;
    this.split = 0;
    this.splitTgt = 0;
    this.tipV.fill(0);
    this.drawnL = 0;
    this.brokeAge = -1;
    this.stretchSpeed = 0;
    this.att = false;
    this.legsOn = false;
    this.legAge.fill(-1);
    this.cascadeT = -1;
    this.slumpMode = 0;
    this.relax = 0;
    this.melt = 0;
    this.lobe = 0;
    this.gather = 0;
    this.humpK = 0;
    this.gate = 0;
    this.pile.fill(0);
    this.pile[3] = 0.1;
    this.pileIn = 0;
    for (const a of [this.base, this.tip, this.target]) a.fill(0);
    this.spine.fill(0);
    this.q.fill(0);
    this.events.length = 0;
    this.write();
  }

  /** 상태값에 NaN이 섞였나 */
  finite(): boolean {
    return Number.isFinite(this.len + this.width + this.slumpR + this.pileIn + this.split)
      && allFinite(this.base) && allFinite(this.tip) && allFinite(this.target)
      && allFinite(this.pile) && allFinite(this.spine) && allFinite(this.col);
  }

  /** 지금 끊김 길이(월드) — 버티면 짧아진다(L4b 8uAT 2.5s · 2.7~3s) */
  breakLen(env: StrandEnv): number {
    const over = this.held - env.creepDelay;
    const tau = env.creepTau * (1 + 0.2 * this.mix.runny);
    const creep = over > 0 ? 0.55 + 0.45 * Math.exp(-over / tau) : 1;
    return mainBreakLen(this.mix) * creep;
  }

  /** 신장 0~1 = (손끝까지 거리 − L_commit) ÷ 지금 끊김 길이. 기둥이 없으면 0 */
  stretch01(env: StrandEnv): number {
    if (!this.active || this.none || !this.att || !this.hasTarget) return 0;
    const lb = this.breakLen(env);
    return lb <= 0 ? 0 : Math.min(1, Math.max(0, (this.dist(this.target, this.base) - this.lenCommit) / lb));
  }

  /** 붙은 몫 0~1 — 기둥이 손끝에 붙어 있으면 1. 기둥 없는 휴면은 잡는 동안 1 */
  attached(): number {
    if (this.none) return this.active ? 1 : 0;
    return this.att ? 1 : 0;
  }

  /** 끌어 올린 거리(월드) = 기둥 길이 − 커밋 길이 — 깔때기 · 끌림이 쓴다 */
  pulled(): number {
    return this.active ? Math.max(0, this.len - this.lenCommit) : 0;
  }

  /** 손끝 − 밑점 수평 오프셋(월드) → out[0] · out[1] — 밑동 흔들림 목표. 매 tick 부르므로 out 인자(검토 C-3) */
  tipOffset(out: number[]): void {
    out[0] = this.tip[0] - this.base[0];
    out[1] = this.tip[2] - this.base[2];
  }

  tick(dt: number, env: StrandEnv): void {
    this.events.length = 0;
    const m = this.mix;
    if (this.active) {
      this.held += dt;
      if (this.yielded) this.yieldAge += dt;
      if (this.hasTarget && (this.att || this.none)) { // 휴면은 기둥 없이 손끝만 따라 둔덕 높이를 잰다
        // ① 버팀 τ0.16 → ② 항복 0.12s 동안 τ0.05로 따라잡음 → 그 뒤 elasticTau. 항복 없는 상태(되직 · 묽음)는 끝까지 버팀 τ
        const tau = (!this.yielded ? HOLD_TAU : this.yieldAge < YIELD_S ? YIELD_TAU : env.followTau) + RUNNY_LAG * m.runny;
        if (!this.yielded) {
          // 버팀 — 2차 임계 감쇠(속도 0 출발 — 높이 0에서 연속으로 솟는다). 반 걸음 둘(semi-implicit, ω·dt ≤ 0.2)
          const w = HOLD_W / Math.max(tau, 1e-3);
          const h = dt / 2;
          for (let s = 0; s < 2; s++) {
            for (let i = 0; i < 3; i++) {
              this.tipV[i] += (w * w * (this.target[i] - this.tip[i]) - 2 * w * this.tipV[i]) * h;
              this.tip[i] += this.tipV[i] * h;
            }
          }
        } else {
          const k = 1 - Math.exp(-dt / Math.max(tau, 1e-3));
          for (let i = 0; i < 3; i++) this.tip[i] += (this.target[i] - this.tip[i]) * k;
        }
      }
      this.base[1] = env.surfaceY(this.base[0], this.base[2]);
      const len0 = this.len;
      this.len = this.dist(this.tip, this.base);
      this.stretchSpeed = this.att && dt > 0 ? Math.max(0, (this.len - len0) / dt) : 0;
      this.width = this.neckWidth(this.len);
      if (this.att && !this.none) {
        const over = Math.max(0, this.len - this.lenCommit);
        const f = over / Math.max(this.breakLen(env), 1e-4);
        if (this.legsOn && !this.yielded
          && ((over >= YIELD_D && this.held >= YIELD_MIN_S) || over >= YIELD_FORCE_D)) {
          this.yielded = true;
          this.yieldAge = 0;
          this.events.push({ kind: 'yield', thin: false, last: false, torn: false });
        }
        if (this.legsOn) this.splitTgt = Math.max(this.splitTgt, smooth(NET_FROM, NET_TO, f));
        this.checkBreaks(f, dt);
      }
    } else {
      this.len = 0;
      this.stretchSpeed = 0;
    }
    // 그물은 목표를 τ0.1로 따른다(끊긴 뒤에도 마저 벌어진다) · 끊기 전에 놓았으면 닫힌다
    if (this.legsOn && (this.att || this.brokeAge >= 0)) this.split += (this.splitTgt - this.split) * (1 - Math.exp(-dt / NET_OPEN_TAU));
    else if (!this.att && this.brokeAge < 0) this.split *= Math.exp(-dt / NET_CLOSE_TAU);
    for (let k = 0; k < LEG_N; k++) if (this.legAge[k] >= 0) this.legAge[k] += dt;
    if (this.brokeAge >= 0) this.brokeAge += dt;
    this.lobe = this.att || (this.active && this.none)
      ? (this.lobe < 1e-3 ? 0 : this.lobe * Math.exp(-dt / 0.1))
      : 1 - (1 - this.lobe) * Math.exp(-dt / LOBE_TAU);
    if (this.att) {
      this.fillStand();
      this.relax = this.relax < 1e-3 ? 0 : this.relax * Math.exp(-dt / RELAX_GRAB_TAU);
    } else if (this.slumpMode > 0) this.stepSlump(dt, env);
    else {
      // 녹은 뒤 무늬 이완은 τ1s로 풀린다(끌림 흔적이 천천히 돌아온다) — 한 번에 0이면 끌림 무늬가 동심 고리로 튀었다(v8 r2 a)
      this.relax = this.relax < 1e-3 ? 0 : this.relax * Math.exp(-dt / RELAX_TAU);
      this.melt = this.melt < 1e-3 ? 0 : this.melt * Math.exp(-dt / MELT_OFF_TAU);
    }
    const fade = Math.exp(-dt / this.settleTau);
    if (this.pileIn > 0) {
      const add = this.pileIn * (1 - Math.exp(-dt / PILE_IN_TAU));
      this.pileIn = this.pileIn - add < 1e-6 ? 0 : this.pileIn - add;
      this.pile[2] = Math.min(PILE_MAX, this.pile[2] + add);
    }
    this.pile[2] *= fade;
    if (this.pile[2] < 1e-5) this.pile[2] = 0;
    this.write();
  }

  // ── 안쪽 ──

  private neckWidth(len: number): number {
    const m = this.mix;
    const w0 = D_W * (W0_WEB * m.web + W0_STIFF * m.stiff + W0_RUNNY * m.runny);
    // 부피 보존 — 늘어난 만큼 폭이 준다(W ∝ 1/√L), 그물 전까지 0.16D 아래로 안 내려간다
    return Math.max(w0 * Math.sqrt(THIN_LW / Math.max(len, THIN_LW)), W_MIN);
  }

  private dist(a: ArrayLike<number>, b: ArrayLike<number>): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }

  /** 선 기둥 — 척추 17점을 중심선(발 → 그리는 꼭대기) 위 몫 i/16에. 묽음 혀는 손끝 밑으로 처지며 앞왼쪽으로 기운다 */
  private fillStand(): void {
    const runny = this.mix.runny;
    const h = Math.max(0, this.tip[1] - this.base[1]);
    const sag = runny * h;
    const t = this.tmp;
    t[0] = this.tip[0] + RUNNY_SIDE * sag * LIE_DIR_X;
    t[2] = this.tip[2] + RUNNY_SIDE * sag * LIE_DIR_Z;
    // 묽음 혀는 높이 0.22D로 부드럽게 눌린다(tanh — 손끝을 따라 솟다 처진다, spec_v8b §6).
    // (그물 기둥 버팀 상한 0.2D는 넣었다 뺐다 — 항복 때 쌓인 높이가 2~3프레임에 튀었다(v8b 2회전 a 1.90). 뿔은 2차 추종 · 둥근 꼭지로 푼다)
    const hd = Math.max(0, this.tip[1] - RUNNY_DROOP * sag - this.base[1]);
    // 되직도 0.25D로 눌린다 — 짧고 굵은 기둥이 끊길 때까지 선다
    const capK = runny + this.mix.stiff;
    const hc = D_W * (RUNNY_MAX_H * runny + STIFF_MAX_H * this.mix.stiff) / Math.max(capK, 1e-3);
    // 피크(capK 0)는 hc 0 → hd/hc = 0/0 NaN이라 눌림 항을 건너뛴다(규칙 검수 v8d 막음: 손끝을 밑동까지 내리면 들기 취소)
    t[1] = this.base[1] + hd + (capK > 1e-3 ? (hc * Math.tanh(hd / hc) - hd) * capK : 0);
    this.drawnL = this.dist(t, this.base);
    const p = this.tmp2; // 매 tick 배열 할당 0(규칙 검수 v8)
    for (let i = 0; i < SPINE_N; i++) {
      curvePoint(this.base, t, i / (SPINE_N - 1), p);
      this.spine[4 * i] = p[0];
      this.spine[4 * i + 1] = p[1];
      this.spine[4 * i + 2] = p[2];
      this.spine[4 * i + 3] = 1;
    }
  }

  /** 가는 가닥 하나 먼저 → 끊김 길이에서 남은 가닥 차례로, 마지막 = 기둥 끊김. 가닥 없는 되직은 한 번에, 묽음은 소리 없이 처짐 */
  private checkBreaks(f: number, dt: number): void {
    if (this.mix.runny > 0.5) {
      if (f >= 1) this.dropAttached();
      return;
    }
    if (!this.legsOn) {
      // 되직은 끌어 올린 거리가 끊김 길이(0.25D)에 닿으면 뚝 — 그동안 그리는 기둥은 0.25D 아래에 선다(fillStand)
      if (f >= 1) this.breakMain();
      return;
    }
    if (this.early >= 0 && this.legAge[this.early] < 0 && f >= this.earlyF) this.cutLeg(this.early);
    if (f >= 1 && this.cascadeT < 0) this.cascadeT = 0;
    else if (this.cascadeT >= 0) this.cascadeT += dt;
    while (this.cascadeT >= 0 && this.cascadeNext < this.order.length && this.cascadeT >= this.orderAt[this.cascadeNext]) {
      const k = this.order[this.cascadeNext++];
      if (this.cascadeNext === this.order.length) {
        this.breakMain();
        return;
      }
      if (this.legAge[k] < 0) this.cutLeg(k);
    }
  }

  private cutLeg(k: number): void {
    this.legAge[k] = 0;
    this.events.push({ kind: 'break', thin: true, last: false, torn: false });
  }

  /** 기둥 끊김 — 마지막 굵은 가닥이 끊겨 손에서 떨어진다. 기둥이 꼭대기째 아래 몸 끝(척추 11, 되직 15)까지 움츠러들고 먼저 끊긴 가닥은
   *  다시 붙는다(셰이더 uPinchB.z). 이어 굽으며 털썩 */
  private breakMain(): void {
    this.att = false;
    this.brokeAge = 0;
    this.startSlump(true);
    this.events.push({ kind: 'break', thin: false, last: true, torn: false });
  }

  /** 붙은 기둥 전부 털썩(놓기 · 묽음 끝) */
  private dropAttached(): void {
    if (!this.att) return;
    this.att = false;
    this.startSlump(false);
  }

  /** 털썩 시작 — 지금 척추를 그대로 받아(교체 0) 반동(끊김 0.05s) · 정지(놓기 0.08s) 뒤 굽으며 주저앉는다 */
  private startSlump(torn: boolean): void {
    const m = this.mix;
    this.slumpMode = 1;
    this.slumpAge = 0;
    this.landed = false;
    this.slumpDur = SLUMP_RUNNY * m.runny + SLUMP_STIFF * m.stiff + SLUMP_WEB * m.web;
    this.slumpTorn = torn;
    this.slumpN = torn ? this.lowerI() : SPINE_N - 1;
    this.slumpR = this.width * 0.5;
    this.slumpL = this.drawnL;
    this.slumpS = 1;
    this.slumpGate = this.gate;
    this.q.set(this.spine);
    const n = this.slumpN;
    this.slumpH0 = Math.max(this.q[4 * n + 1] - this.q[1], 1e-4);
    const hEnd = D_W * (HUMP_H_WEB * m.web + HUMP_H_STIFF * m.stiff + HUMP_H_RUNNY * m.runny);
    this.slumpTilt = TILT * (1 + (TILT_STIFF - 1) * m.stiff + (TILT_RUNNY - 1) * m.runny);
    // 낮은 혹 세로 배율 — 기운 꼭대기 높이(× cos 굽힘)가 혹 높이가 되게. 이미 낮으면 그대로
    this.slumpEnd = Math.min(1, hEnd / (this.slumpH0 * Math.cos(this.slumpTilt)));
    const a = Math.atan2(LIE_DIR_Z, LIE_DIR_X) + (hash(31, this.grabs) - 0.5) * 0.6;
    this.slumpDir[0] = Math.cos(a);
    this.slumpDir[1] = Math.sin(a);
    this.pile[4] = a;
  }

  /**
   * 털썩 = 굽으며 주저앉음(spec_v8c §2) — 같은 척추를 연속으로 민다. 세로 배율 slumpS(반동 × 0.92 → smoothstep → 낮은 혹)로 누르고,
   * 마디마다 발에서 잰 몫만큼 앞왼쪽으로 돌린다(꼭대기 40° — 백조 목, 밑동째 기우는 강체 회전 0). 누운 관 · 되접힘 · S 접힘은 지웠다(v8c §0).
   * 짧아진 기둥은 셰이더가 길이(slumpL × slumpS)로 낮고 넓은 종 꼴 혹으로 섞는다. 혹 → 보조개는 같은 높이장에서 섞는다(§3)
   */
  private stepSlump(dt: number, env: StrandEnv): void {
    this.slumpAge += dt;
    const age = this.slumpAge;
    const runny = this.mix.runny;
    if (this.slumpMode === 1) {
      const hold = this.slumpTorn ? RECOIL_S : STAND_S;
      const g = Math.min(1, Math.max(0, age - hold) / this.slumpDur);
      const e = g * g * (3 - 2 * g);
      this.gather = e;
      const s0 = this.slumpTorn ? 1 - (1 - RECOIL_H) * smooth(0, RECOIL_S, age) : 1;
      // 높이는 smoothstep으로 — g²(중력 꼴)는 끝 2프레임에 높이 30%가 빠져 기운 기둥이 한 프레임에 낮은 혹으로 바뀌었다(v8d 1회전 peak 3.00 → 3.03)
      this.slumpS = s0 + (this.slumpEnd - s0) * e;
      this.humpK = smooth(HUMP_G0, HUMP_G1, g);
      this.bendSpine(this.slumpTilt * smooth(0, 0.7, g), 1 + HUMP_WIDEN * e, env);
      this.relax = smooth(0.15, 0.9, g);
      if (g >= LAND_AT && !this.landed) this.land(true);
      if (g >= 1) {
        this.slumpMode = 2;
        this.slumpAge = 0;
      }
    } else if (this.slumpMode === 2) {
      // 혹 → 보조개 — 혹이 반으로 낮아지고, 기둥 몫은 write가 몫 0.1부터 끈다. 접힘 높이장은 이미 차 있다(겹침)
      const vs = this.vanishS();
      const p = Math.min(1, age / vs);
      this.gather = 1; // 밑동 모임은 그대로 — 풀면 혹이 0.6D로 넓어지며 납작 원판 · 테였다(v8c 1회전 release 2.6~2.8)
      this.humpK = 1;
      this.relax = 1;
      this.melt = smooth(0.5, 1, p);
      this.slumpS = this.slumpEnd * (1 - VANISH_SINK * smooth(0, 1, p));
      this.bendSpine(this.slumpTilt, 1 + HUMP_WIDEN + 0.3 * runny * p, env); // 묽음은 퍼진다(점으로 줄며 사라지기 금지)
      if (age > vs) this.slumpMode = 0; // 녹음 몫은 tick이 τ0.2로 푼다
    }
  }

  /** 서 있던 척추(q)를 세로 배율 slumpS로 누르고 마디마다 몫 × th만큼 기우는 쪽으로 돌린다(로드리게스). 끝 너머(끊긴 위 몸) 점은 끝 각도로
   *  이어 붙는다 — 셰이더가 움츠림(uPinchB.z)으로 그 점들을 지나 내려온다. 손끝 자리에 두면 머리가 매달려 있다가 마지막 마디를
   *  2~3프레임에 건너뛰어 사라졌다(v8c 2회전 2.53 → 2.63, spec_v8d §2) */
  private bendSpine(th: number, w: number, env: StrandEnv): void {
    const n = this.slumpN;
    const b = this.base;
    const sp = this.spine;
    const q = this.q;
    const sy = this.slumpS;
    // 회전축 k = up × 기우는 쪽 = (dz, 0, −dx) — up이 기우는 쪽으로 돈다
    const kx = this.slumpDir[1];
    const kz = -this.slumpDir[0];
    const footY = env.surfaceY(b[0], b[2]);
    let px = b[0];
    let py = footY;
    let pz = b[2];
    sp[0] = px;
    sp[1] = py;
    sp[2] = pz;
    sp[3] = 1;
    for (let i = 1; i < SPINE_N; i++) {
      const o = 4 * i;
      {
        const t = th * Math.min((i - 0.5) / n, 1);
        const vx = q[o] - q[o - 4];
        const vy = (q[o + 1] - q[o - 3]) * sy;
        const vz = q[o + 2] - q[o - 2];
        const c = Math.cos(t);
        const s = Math.sin(t);
        const kv = kx * vx + kz * vz;
        px += vx * c + (-kz * vy) * s + kx * kv * (1 - c);
        py = Math.max(footY, py + vy * c + (kz * vx - kx * vz) * s);
        pz += vz * c + (kx * vy) * s + kz * kv * (1 - c);
        sp[o] = px;
        sp[o + 1] = py;
        sp[o + 2] = pz;
        sp[o + 3] = w;
      }
    }
    // 혹이 될수록 꼭대기 수평 오프셋 상한 = 밑동 반폭 × HUMP_OFF(기둥 땐 사실상 없음) — 마디 오프셋을 한 배율로 줄인다(모양 연속)
    const lim = this.shape[0] * D_W * (1 - SKIRT_GATHER * this.gather) * (HUMP_OFF + 4 * (1 - this.humpK));
    const o = 4 * n;
    const off = Math.hypot(sp[o] - b[0], sp[o + 2] - b[2]);
    if (off > lim) {
      const k = lim / off;
      for (let i = 1; i < SPINE_N; i++) {
        sp[4 * i] = b[0] + (sp[4 * i] - b[0]) * k;
        sp[4 * i + 2] = b[2] + (sp[4 * i + 2] - b[2]) * k;
      }
    }
  }

  /** 끊긴 아래 몸 끝 척추 첨자 — 그물은 점 11(가닥 아래 토막이 여기까지 처져 둥근 한 끝으로 모인다), 가닥 없는 되직은 점 15(꼭대기 바로 밑에서 뚝) */
  private lowerI(): number {
    return this.legsOn ? LOWER_I : STIFF_CUT_I;
  }

  /** 녹는 시간 — 묽음은 짧게 */
  private vanishS(): number {
    return VANISH_S * (1 - 0.2 * this.mix.runny); // × 0.5는 혀가 0.25s에 꺼져 튐이었다(v8 r2 sour 2.50)
  }

  /** 착지 — 주저앉는 혹 밑에 접힘 높이장을 남기고 사건을 낸다 */
  private land(emit: boolean): void {
    const p = this.pile;
    const m = this.mix;
    const b = this.base;
    const o = 4 * this.slumpN;
    const lx = this.spine[o] - b[0];
    const lz = this.spine[o + 2] - b[2];
    const l = Math.hypot(lx, lz);
    // 놓아서 주저앉은 기둥은 굵게(× 1.5). 되직은 낮고 넓게
    const dh = PILE_H * (this.slumpTorn ? 1 : 1.5) * (1 - 0.6 * m.runny) * (1 - 0.4 * m.stiff);
    const w = dh / (p[2] + this.pileIn + dh);
    p[0] += (b[0] + lx * 0.55 - p[0]) * w;
    p[1] += (b[2] + lz * 0.55 - p[1]) * w;
    this.pileIn += dh; // tick이 PILE_IN_TAU로 채운다
    p[3] = Math.max(0.3 * D_W, 0.8 * l);
    p[5] = m.stiff;
    this.settleTau = SETTLE_WEB * m.web + SETTLE_STIFF * m.stiff + SETTLE_RUNNY * m.runny;
    this.landed = true;
    if (emit) this.events.push({ kind: 'land', thin: false, last: false, torn: this.slumpTorn });
  }


  /** 상태 → col */
  private write(): void {
    const c = this.col;
    const sh = this.shape;
    // 기둥 몫 — 붙은 동안 꼭대기 높이 0 ~ 켬 길이(잡는 첫 순간은 깔때기가 맡는다), 털썩 동안 그 값 그대로, 녹으며 꺼진다
    if (this.att && !this.none) this.gate = smooth(0, this.gateLen, this.len);
    else if (this.slumpMode === 1) this.gate = this.slumpGate;
    else if (this.slumpMode === 2) this.gate = this.slumpGate * (1 - smooth(VANISH_GATE0, 1, this.slumpAge / this.vanishS()));
    else this.gate = 0;
    const broken = this.brokeAge >= 0;
    c[0] = (this.att ? this.width : 2 * this.slumpR) * 0.5;
    // 밑동은 털썩 동안 모인다 — 묽음은 모이지 않고 녹으며 1.3배로 퍼진다(혀가 고리로 줄며 사라지기 금지, spec_v8d §4)
    const rn = this.mix.runny;
    c[1] = sh[0] * D_W * (1 - SKIRT_GATHER * this.gather * (1 - rn) + 0.3 * rn * this.melt);
    c[2] = sh[2];
    c[3] = sh[3];
    c[4] = this.funnelR;
    c[5] = this.split;
    c[6] = broken ? smooth(0, STUB_S, this.brokeAge) : 0;
    c[18] = broken ? this.lowerI() / (SPINE_N - 1) : 1;
    c[7] = 0; // 비움(옛 끊긴 위 조각 크기 — 위 조각은 따로 그리지 않는다)
    c[8] = this.gate;
    c[9] = this.laneSeed;
    // 그리는 길이 — 주저앉는 만큼(세로 배율) · 끊기면 아래 몸 끝까지 움츠러드는 만큼 짧아진다
    const L = this.att ? this.drawnL : this.slumpL * this.slumpS * (1 - (1 - c[18]) * c[6]);
    // 긴 기둥 몫(셰이더 모양 섞기 혹 ↔ 기둥) — 길이 문턱(되직은 짧게) × (1 − 혹 몫) × (1 − 묽음). 정점마다 같은 값이라 여기서 한 번 잰다.
    // 묽음은 끝까지 기운 혹(혀) — 기둥(반폭 W 원통)이 0.4만 섞여도 넓고 낮은 원통이 팬케이크 · 렌즈 판이었다(v8d 2회전 sour 1.4~2.27)
    const st = this.mix.stiff;
    c[10] = smooth(D_W * (LONG_LO + (LONG_LO_STIFF - LONG_LO) * st), D_W * (LONG_HI + (LONG_HI_STIFF - LONG_HI) * st), L) * (1 - this.humpK) * (1 - this.mix.runny);
    c[11] = 0; // 비움(옛 끊긴 끝 거침)
    for (let k = 0; k < LEG_N; k++) {
      c[12 + k] = this.legAge[k];
      c[20 + k] = this.legW[k];
    }
    c[16] = this.lobe;
    c[17] = sh[1];
    c[19] = L;
    this.visible = this.gate > 1e-3;
  }
}
