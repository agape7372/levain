// 당기기 가닥 다발(2026-11-19 당기기 실물화, 명세 .work/feel2/spec.md §1 · §6) — 고깔 하나를 버리고
// 가닥 STRAND_N(주 1 + 가는 5) × 도막 2(아래 · 위)를 한 draw call로 그린다.
// 로직(길이 · 굵기 · 벌어짐 · 끊김 · 낙하 · 더미)은 StrandRig(순수 TS, three 없음)가 맡고, 셰이더는 베지어 · 틀 · 단면만 푼다.
// 칸 ID = .work/feel2/table.md(실물 대조표). D = 병 안지름 = D_W(월드).
import * as THREE from 'three';
import { FILL_RADIUS } from '../jar';

/** 병 안지름(월드) — 실물 대조표의 D */
export const D_W = 2 * FILL_RADIUS;
export const STRAND_N = 6;
const SEG_N = STRAND_N * 2;
/** 길이 16마디 · 둘레 16(이음매 꼭짓점 하나 더 = 17). 시각 고침 2차 A-2: 11 · 8 → 17 · 16 — 8각은 갓 밥준 덩이가 8각 갓 · 끊긴 뒤
 *  8각 보석 팽이로 깎였고, 10마디는 덩이 부풂(u 0.55~0.9)에 링이 셋뿐이라 원통 대 + 갓으로 꺾였다. 꼭짓점이 늘어도 draw call은 1 */
const RINGS = 17;
const SIDES = 16;

/** 무리수 회전 3옥타브 트리그 FBM — 반죽 vert · frag · 가닥 frag가 이 소스 하나를 쓴다(텍스처 fetch 0, VISUAL §8) */
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
 * 반죽 음영 — 노멀 이후(반구 앰비언트 · wrap diffuse · 소프트박스 광 · 경사 페널티). 반죽 frag와 가닥 frag가 이 함수 하나를 쓴다.
 * 반죽 frag에서 그대로 뽑아 온 식이다(리팩터 전후 픽셀 같음). xz = 오브젝트 xz(광 띠 도메인), wetL = 젖은 광, matte = 무광 몫.
 * 쓰는 uniform: uSpecStr(공유 객체).
 */
export const DOUGH_SHADE = /* glsl */ `
// 반죽 전용 키 — 씬 KEY_POS보다 낮다(고도 28.6°). 얼룩 증폭은 노이즈 원천(fbmG · 기공)을 지워 해결했고,
// 높이를 올리면 하강 주름 · 젓은 물결 · 돔의 결이 함께 죽어 그대로 둔다(A1-05 검토, VISUAL §1-3).
// 가닥 frag 세로 광(시각 고침 3차 L-3)도 이 키를 쓴다
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
 * 반죽 알베도 — 모틀(fbm) · 젖음. 반죽 frag와 가닥 frag가 이 함수 하나를 쓴다(검토 C-1). 쓰는 uniform: uColor · uWet(공유 객체).
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
 * 칸 기포 — 반죽 frag 바늘구멍 · 거품과 가닥 frag 길쭉한 기포 틈(시각 고침 3차 L-3)이 이 소스 하나를 쓴다(반죽 frag에서 그대로 옮김)
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

// ── 굵기 · 길이 · 벌어짐 (칸 ID = 실물 대조표) ──
/** 반지름 몫 — 주 1 · 가는 5. 반지름 = 몫 × W/2 (L1b · L1c).
 *  2026-11-19 시각 고침 1차: 가는 0.33~0.42 → 0.12~0.17(머리카락) — 주 가닥 아래쪽과 굵기가 같아 젓가락 · 해파리 다리로 읽혔다.
 *  실물 8uAT 1:16.3 · w93D 가는 실은 주 기둥의 1/4 아래. 메모 출발값 0.16~0.22는 2배 녹화에서 아직 주 기둥의 1/3 리본이라 더 내렸다.
 *  시각 고침 2차 A-1: 주 0.85 → 1 — 가는 가닥이 머리카락이 된 뒤로 보이는 기둥 = 주 가닥 하나라 W(합친 목 폭)를 그대로 받는다.
 *  가는 가닥은 ÷ 1.1735(W 기준 길이를 0.5D로 옮기며 커진 배율, neckWidth) — 실 굵기는 1차와 같다(유지) */
const SHARE = [1, 0.128, 0.111, 0.145, 0.102, 0.119];
/** 피크 끊김 길이 비(주 = 1) — 가는 가닥부터 하나씩(L5a w93D 한 가닥씩 약 1s · 8uAT 두 갈래가 하나씩) */
const BREAK_FRAC = [1, 0.42, 0.55, 0.68, 0.8, 0.9];
/** 부채 방위(°, 화면 가로축 기준 한쪽 ±60) · 밑점 반경(D) — 가닥마다 제각각(§6-6, L3a 8uAT 1:16.3). 고르게 두면 별 · 욱일 */
const FAN_DEG = [0, -48, 14, -21, 55, 33];
const FAN_R = [0, 0.3, 0.18, 0.35, 0.12, 0.24];
/** 가늘어짐 기준 길이 — W(L) = W0 · √(L0/(L0 + L)) (L1c). 시각 고침 1차 0.25D → 0.6D: 실물 UPQ94 9s 기둥은 끊기기 직전까지
 *  0.2D로 굵다 — 가늘어짐은 끊김 바로 앞 목 조임(PINCH_*)이 맡는다 */
const THIN_L0 = 0.6 * D_W;
/** W 기준 길이 — L1b 폭은 들린 기둥(UPQ94 9s)에서 잰 값이라 L = 0.5D에서 W = w0이 되게 √을 맞춘다(시각 고침 2차 A-1).
 *  옛 식은 L = 0에서 w0이라 0.5D에서 × 0.739가 한 번 더 깎였다(SHARE 0.85 · body 가운데 0.9와 겹쳐 0.084D, 측정 36px = 계산 36px) */
const LIFT_REF = 0.5 * D_W;
/** 묽음 폭 하한 — 굵은 크림 줄(§6-8, L3c 8uAT 1:56 위 0.15D → 아래 0.08D). 시각 고침 1차 0.05D → 0.15D: 주 가닥 목 지름 =
 *  0.85 × 0.8(body 아래) × 0.15D ≈ 0.1D. 0.05D는 실제로 걸려 목이 0.03D 바늘이 됐다(lift_sour) */
// 시각 고침 2차: 0.15 → 0.115 — SHARE 1 · body 가운데 정규화로 같은 W가 1/(0.85 × 0.9)배 굵게 보여 같은 화면 폭으로 환산(1 × 0.92(body 아래) × 0.115 ≈ 0.1D)
const RUNNY_W_MIN = 0.115 * D_W;
/** 묽음 시작 폭 몫(W0 = 이 값 × D) — 시각 고침 1차 0.12 → 0.2: 하한 0.15D 위에서 출발해야 √ 가늘어짐이 보인다(L3c 위 0.15D) */
// 시각 고침 2차: L = 0.5D 기준 0.113 = 0.2 × 0.85 × 0.9 × √(0.6/1.1) — 기준 길이 · SHARE · body 정규화를 바꿔도 시큼 크림 줄은
// 1차와 같은 화면 폭(묽음은 메모 대상 아님)
const RUNNY_W0 = 0.113;
/** 처짐 — 정적 처짐만(§6-20). 주 가닥 = SAG · L · (1 − 0.5·web). 추정 — 실측 없음(8uAT 옆 살짝 휨만 봤다) */
const SAG = 0.08;
/** 가는 가닥 처짐 = 0.18 · L — 현수선처럼 살짝 휜 실(시각 고침 1차 A-1, 8uAT 1:16.3 위에서 본 휜 실).
 *  추정 — 실측 없음(옆 영상에서 휨 깊이를 못 잰다) */
const SAG_THIN = 0.18;
/** 가는 가닥 위 끝 = 주 가닥 u 0.7(덩이 아래 목) — 실이 기둥 · 도구 아래 가장자리에서 갈라져 나온다(8uAT 1:16.3 · UPQ94 12s).
 *  손끝 꼭대기로 모으면 닫힌 캡이 덩이 위로 솟아 마늘 · 왕관 혹이 됐다(시각 고침 1차 A-1) */
const THIN_JOIN_U = 0.7;
/** 끊기기 직전 목 조임 — 끊김 길이의 85%부터 목(u 0.2~0.35)만 × 0.4까지(L1b 끊기기 직전 0.03D, 8uAT 1:26). 묽음은 빼고.
 *  시각 고침 2차 A-1: 0.4 → 0.6 — 기둥이 0.1D(1.1D 들었을 때)로 굵어져 × 0.6이면 목이 0.06D에 머문다. × 0.4 = 0.04D(메모 목표 0.03~0.05D) */
const PINCH_FROM = 0.85;
const PINCH_MAX = 0.6;
/** 되직 판정 — 벌어짐이 이 아래면 여섯이 한 기둥이라 가는 가닥 끊김을 주 가닥 끊김에 합친다(쩍 두 번 금지, 검토 C-4).
 *  추정 — 실측 없음(벌어짐 0 근처 문턱) */
const STIFF_FAN = 0.05;
/** 병 안 클램프 — 가는 가닥 밑점 · 그루터기 끝 · 끝점 xz(§6-7) */
const CLAMP_R = 0.85 * FILL_RADIUS;
/** 휴면 · 곰팡이 문턱 — grabMax가 이 아래면 가닥 없음 · 끊김 소리 없음, 밑동 둔덕만 조금(§6-2) */
export const STRAND_MIN_GRABMAX = 0.2;
/** 끊는 자리 tb = 0.2 ~ 0.35(해시) — 윗도막이 길게 매달린다(§6-3, L5a 8uAT 1:27.0) */
const TB_LO = 0.2;
const TB_SPAN = 0.15;
/** 윗도막 — 0.25s에 길이 × 0.7까지 줄고 아래로 매달린다(§6-3 L5a). 뾰족한 끝 = 아래 60%에 걸쳐 0으로 */
const HANG_SHRINK = 0.3;
const HANG_SHRINK_S = 0.25;
/** 되직 윗도막 = 둥근 방울 + 짧은 뾰족 꼬리(시각 고침 2차 A-2) — 천막(아래 넓은 원뿔) 몫은 버리고 목(u 0.5)부터만 매달고,
 *  길이 × 0.5까지 줄이며, 뾰족 끝은 아래 40%. 넓은 천막을 뾰족하게 깎으면 보석 팽이였다(hi1_jf_sheet). 추정 — 실측 없음(8uAT 0:47 덩이만 봤다) */
const HANG_U0_STIFF = 0.5;
const HANG_SHRINK_STIFF = 0.5;
const HANG_POINT_STIFF = 0.4;
const HANG_DROOP_S = 0.4; // 추정 — 실측 없음(시트 2~6fps라 0.1s 아래는 못 봄)
const HANG_POINT = 0.6; // 추정 — 실측 없음(L5a 8uAT 1:27.0 「뾰족 끝」만 봤다, 뾰족해지는 길이는 못 잰다)
/** 그물 윗도막 덩이 = lumpR × 0.6 — 손가락에 묻은 정도(시각 고침 1차 A-3). 실기기에선 손가락이 가린다. 추정 — 실측 없음 */
const HANG_LUMP_WEB = 0.6;
/** 가는 가닥 윗도막 — 매달리지 않고 0.3s에 길이 × 0.35 · 반지름 0으로 주 기둥에 흡수(시각 고침 1차 A-3).
 *  머리카락 굵기라 고무줄로 안 읽히고, 매달리면 끊긴 뒤 허공에 양파 + 뿌리가 떴다. 추정 — 실측 없음(시트 fps로 못 봄) */
const ABSORB_S = 0.3;
const ABSORB_LEN = 0.35;
/** 아랫도막 그루터기 — 표면으로 내려앉는다(§6-3, w93D 털 끝). 끝 50%가 털 끝으로 가늘어짐.
 *  시각 고침 2차 A-3: 0.4s → 0.12s — t² 낙하라 0.4s면 처음 0.2s 동안 25%도 안 움직여 표면 위 곧은 가시로 서 있었다(메모 상한 0.12s) */
const STUMP_S = 0.12;
const STUMP_POINT = 0.5; // 추정 — 실측 없음(w93D 털 끝이 가늘어지는 길이는 못 잰다)
/** 놓기 낙하 — 0.35s(L5b UPQ94 0.3~0.5s), 누운 자리 = 밑점에서 수평 방향으로 길이 × 0.5(w93D 든 방향으로 누운 끝) */
const FALL_S = 0.35;
const LIE_FRAC = 0.5;
const COIL = 0.25; // 똬리 한 번 — 가운데 점 옆 오프셋 = 길이 × 0.25 (L5b UPQ94 12s 칸4→6)
/** 닿은 뒤 사라짐 — 가는 관이 표면에 오래 누워 있지 않는다(§6-3). 추정 — 실측 없음(지렁이 금지가 근거) */
const VANISH_S = 0.2;
/** 더미(L6) — 높이 = 누운 반지름 × 2.0, 상한 1.0 × 둔덕 최대. 반경은 추정 — 실측 없음(UPQ94 13s 더미 ≈ 밑동 둔덕 크기).
 *  시각 고침 1차 A-4: 1.2 · 0.6 → 2.0 · 1.0 — 끊긴 뒤 더미가 거의 안 보였다(실물 UPQ94 13s 접힌 더미 1.3s+ 또렷) */
export const MOUND_H = 0.07 * D_W; // 밑동 둔덕 최대 높이(월드) — 추정(측면 실측 없음, 깔때기만 확인 Sg__ 259-270)
const PILE_GAIN = 2.0;
const PILE_MAX = 1.0 * MOUND_H;
export const PILE_R = 0.12 * D_W;
/** 더미 가라앉음 τ — 3s(묽음 2s) (L6 UPQ94 1.3s+ · oelv 2s+ · SbPf 3s+) */
const PILE_TAU = 3;
const PILE_TAU_RUNNY = 2;
/** 묽음 누운 도막은 굵어져 합쳐진다(L5b 8uAT 2:01) */
const RUNNY_LIE_GAIN = 1.3;
const HIDE_R = 0.0005;

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

/** 주 가닥 끊김 길이(월드, 버팀 짧아짐 전) — L4b: 피크 grabMax 0.6 → 1.2D(Sg__ 1.2~1.4D · 8uAT ≥0.9D) ·
 *  갓 밥준 0.497 → 0.25D(8uAT 0:47 짧은 결) · 시큼 0.278 → 1.0D(8uAT 1:56 안 끊김) */
export function mainBreakLen(m: StrandMix): number {
  return 2 * D_W * m.grabMax * (0.25 + 0.75 * m.web + 1.55 * m.runny);
}

export interface StrandEnv {
  /** 반죽 윗면 월드 y(숨 포함) — 월드 xz */
  surfaceY(x: number, z: number): number;
  /** 끝점 추종 τ(s) — GRAB elasticTau */
  followTau: number;
  /** 버티면 짧아짐 — 잡은 지 delay 뒤부터 × (0.55 + 0.45·e^(−(t−delay)/τ)) */
  creepDelay: number;
  creepTau: number;
}

export interface StrandBreak {
  thin: boolean;
  last: boolean;
}

type Seg = {
  /** 0 숨김 · 1 붙음(가닥에서 매 프레임) · 2 매달림(윗도막) · 3 떨어짐 */
  mode: 0 | 1 | 2 | 3;
  age: number;
  from: number[];
  to: number[];
  dur: number;
  /** 매달림 — 손끝에서 끊긴 끝까지(상대), 손끝 오프셋 */
  rel: number[];
  rn: number;
  lump: number;
  u0: number;
  u1: number;
  ta: number;
  tb: number;
  vol: number;
  piled: boolean;
  /** 매달림 중 가는 가닥 윗도막 — 매달리지 않고 ABSORB_S에 주 기둥으로 흡수된다 */
  absorb: boolean;
};

const newSeg = (): Seg => ({
  mode: 0, age: 0, from: new Array<number>(9).fill(0), to: new Array<number>(9).fill(0), dur: 1,
  rel: [0, 0, 0, 0, 0, 0], rn: 0, lump: 0, u0: 0, u1: 1, ta: 0, tb: 0, vol: 0, piled: false, absorb: false,
});

/** 배열 값이 전부 유한한가 — 매 tick 부르므로 할당 없이 인덱스 루프(검토 C-3) */
function allFinite(a: ArrayLike<number>): boolean {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
}

const hash = (i: number, seed: number): number => {
  const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** xz를 병 안 반경 CLAMP_R 안으로 */
function clampR(p: number[], o: number): void {
  const r = Math.hypot(p[o], p[o + 2]);
  if (r > CLAMP_R) {
    p[o] *= CLAMP_R / r;
    p[o + 2] *= CLAMP_R / r;
  }
}

/**
 * 가닥 상태기 — 순수 TS(three · DOM 없음). 월드 좌표. 출력 = 도막마다 vec4 넷(uniform 배열 그대로).
 *   A = (P0, 목 반지름) · B = (P1, 손끝 덩이 반지름) · C = (P2, 목 조임 0~0.4) · D = (u0, u1, 시작 뾰족 길이, 끝 뾰족 길이)
 * 도막 i·2 = 아랫도막, i·2+1 = 윗도막. 붙어 있는 동안 두 도막은 한 베지어를 tb에서 나눈 것이라 이음매가 없다.
 */
export class StrandRig {
  readonly A = new Float32Array(SEG_N * 4);
  readonly B = new Float32Array(SEG_N * 4);
  readonly C = new Float32Array(SEG_N * 4);
  readonly D = new Float32Array(SEG_N * 4);
  /** 벌어짐 s 0~1 — 셰이더 밑동 나팔 */
  fan = 0;
  /** 되직 몫 — 셰이더 단면 꼴(천막 원뿔 + 손끝 덩이, 시각 고침 2차 A-2) */
  stiff = 0;
  /** 합친 목 반지름(W/2, 월드) — 셰이더 가늘수록 밝음의 기준 */
  neck = 0;
  visible = false;
  /** 이번 tick의 끊김(소리 · 진동) */
  readonly events: StrandBreak[] = [];
  /** 더미 — 월드 x, z, 높이, 반경 */
  readonly pile = [0, 0, 0, PILE_R];

  /** 묽음 몫 0~1 — 더미 메시가 K1에서 시작하는 근거(CoilMesh) */
  runny(): number {
    return this.mix.runny;
  }

  /** 잡는 중 */
  active = false;
  /** 휴면 · 곰팡이 — 가닥 없음 */
  none = false;
  /** 주 가닥 길이(월드) — 밑동 둔덕 · 끌려 모임이 쓴다 */
  len = 0;
  private held = 0;
  /** 끊기기 직전 목 조임 0 ~ PINCH_MAX — 주 가닥 도막의 C.w로 셰이더에 간다 */
  private pinch = 0;
  private readonly base = [0, 0, 0];
  private readonly tip = [0, 0, 0];
  /** 가는 가닥이 갈라져 나오는 자리 = 주 가닥 u THIN_JOIN_U(월드) */
  private readonly joint = [0, 0, 0];
  private readonly target = [0, 0, 0];
  private hasTarget = false;
  /** 커밋 순간 손끝까지 거리 — 끊김 판정은 주 가닥 길이 − 이 값(§6-2) */
  lenCommit = 0;
  private side = 1;
  private grabs = 0;
  private mix: StrandMix = { web: 0, runny: 0, stiff: 1, grabMax: 0 };
  private width = 0;
  private pileTau = PILE_TAU;
  private readonly att: boolean[] = new Array<boolean>(STRAND_N).fill(false);
  private readonly tbs = new Array<number>(STRAND_N).fill(0.3);
  private readonly jit = new Array<number>(STRAND_N).fill(0);
  private readonly segs: Seg[] = Array.from({ length: SEG_N }, newSeg);
  private readonly g = new Array<number>(9).fill(0);

  /** 잡기 — 앵커 월드 xz. 남은 낙하 도막은 바로 더미로 넘기고 새 다발을 낸다(§6-14) */
  start(x: number, z: number, mix: StrandMix, env: StrandEnv): void {
    for (const s of this.segs) {
      if (s.mode === 3 && !s.piled) this.addPile(s.to[6], s.to[8], s.vol);
      s.mode = 0;
    }
    this.grabs++;
    this.mix = mix;
    this.stiff = mix.stiff;
    this.none = mix.grabMax < STRAND_MIN_GRABMAX;
    this.active = true;
    this.held = 0;
    this.hasTarget = false;
    this.lenCommit = 0;
    this.side = x > 0 ? -1 : 1; // 부채는 병 가운데 쪽으로
    this.width = this.neckWidth(0);
    const sy = env.surfaceY(x, z);
    this.base[0] = x;
    this.base[1] = sy - this.width * 0.5 * SHARE[0];
    this.base[2] = z;
    // 끝점은 밑점에서 출발한다(높이 0 출발, §6-2)
    this.tip[0] = x;
    this.tip[1] = sy;
    this.tip[2] = z;
    for (let k = 0; k < 3; k++) this.joint[k] = this.tip[k];
    this.len = 0;
    this.pinch = 0;
    for (let i = 0; i < STRAND_N; i++) {
      this.att[i] = !this.none;
      this.tbs[i] = TB_LO + TB_SPAN * hash(i, this.grabs);
      this.jit[i] = 2 * hash(i + 7, this.grabs) - 1;
    }
  }

  /** 손끝(월드) — 첫 값이 커밋 길이 L_commit이 된다(§6-2) */
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

  /** 놓기 — 붙은 가닥은 한 줄로 합쳐 한 더미로 떨어지고(§6-4), 매달린 윗도막도 같이 떨어진다(§6-14) */
  release(env: StrandEnv): void {
    if (!this.active) return;
    this.active = false;
    this.dropAttached(env, this.mix.runny);
    for (let i = 0; i < SEG_N; i++) {
      const s = this.segs[i];
      if (s.mode !== 2) continue;
      if (s.absorb) {
        s.mode = 0; // 흡수 중인 가는 가닥 윗도막은 머리카락 굵기라 떨어뜨리지 않는다
        continue;
      }
      this.hangPoints(s, this.g);
      for (let k = 0; k < 9; k++) s.from[k] = this.g[k];
      for (let k = 0; k < 9; k += 3) {
        s.to[k] = s.from[k];
        s.to[k + 2] = s.from[k + 2];
        clampR(s.to, k);
        s.to[k + 1] = env.surfaceY(s.to[k], s.to[k + 2]) + 0.4 * s.rn;
      }
      s.mode = 3;
      s.age = 0;
      s.dur = FALL_S;
      s.vol = s.rn;
      s.piled = false;
    }
  }

  /** 다 지운다 — resetTransient · NaN 복구 */
  reset(): void {
    this.active = false;
    this.hasTarget = false;
    this.len = 0;
    this.fan = 0;
    this.neck = 0;
    this.width = 0;
    this.lenCommit = 0;
    this.held = 0;
    this.pinch = 0;
    this.pile[0] = this.pile[1] = this.pile[2] = 0;
    this.att.fill(false);
    for (const a of [this.base, this.tip, this.target, this.joint]) a.fill(0);
    for (const s of this.segs) {
      s.mode = 0;
      s.from.fill(0);
      s.to.fill(0);
      s.rel.fill(0);
    }
    this.events.length = 0;
    this.write();
  }

  /** 상태값에 NaN이 섞였나 */
  finite(): boolean {
    if (!Number.isFinite(this.len + this.fan) || !allFinite(this.base) || !allFinite(this.tip)
      || !allFinite(this.target) || !allFinite(this.pile)) return false;
    for (let i = 0; i < SEG_N; i++) {
      const s = this.segs[i];
      if (!allFinite(s.from) || !allFinite(s.to) || !allFinite(s.rel)) return false;
    }
    return true;
  }

  /** 지금 주 가닥 끊김 길이(월드) — 버티면 짧아진다(L4b 8uAT 2.5s · 2.7~3s) */
  breakLen(env: StrandEnv): number {
    const over = this.held - env.creepDelay;
    const tau = env.creepTau * (1 + 0.2 * this.mix.runny);
    const creep = over > 0 ? 0.55 + 0.45 * Math.exp(-over / tau) : 1;
    return mainBreakLen(this.mix) * creep;
  }

  /** 신장 0~1 = (손끝까지 거리 − L_commit) ÷ 지금 주 가닥 끊김 길이. 주 가닥이 없으면 0 */
  stretch01(env: StrandEnv): number {
    if (!this.active || this.none || !this.att[0] || !this.hasTarget) return 0;
    const lb = this.breakLen(env);
    return lb <= 0 ? 0 : Math.min(1, Math.max(0, (this.dist(this.target, this.base) - this.lenCommit) / lb));
  }

  /** 붙은 몫 0~1(목 반지름 몫으로 무게). 가닥 없는 휴면은 잡는 동안 1 */
  attached(): number {
    if (this.none) return this.active ? 1 : 0;
    let a = 0;
    let all = 0;
    for (let i = 0; i < STRAND_N; i++) {
      all += SHARE[i];
      if (this.att[i]) a += SHARE[i];
    }
    return a / all;
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
      if (this.hasTarget) {
        const k = 1 - Math.exp(-dt / Math.max(env.followTau, 1e-3));
        for (let i = 0; i < 3; i++) this.tip[i] += (this.target[i] - this.tip[i]) * k;
      }
      this.len = this.dist(this.tip, this.base);
      this.width = this.neckWidth(this.len);
      this.base[1] = env.surfaceY(this.base[0], this.base[2]) - this.width * 0.5 * SHARE[0];
      const over = Math.max(0, this.len - this.lenCommit);
      const lb = this.breakLen(env);
      const near = smooth(PINCH_FROM, 1, over / Math.max(lb, 1e-4));
      // 묽음 — 끊김 길이 끝 15%에서 소리 없이 가늘어진다(§6-8 L5b 8uAT 2:01). 하한(목 0.1D) 아래로는 안 간다(시각 고침 1차 A-5)
      if (m.runny > 0.5) this.width = Math.max(this.width * (1 - 0.5 * near), RUNNY_W_MIN * m.runny);
      this.pinch = PINCH_MAX * (1 - m.runny) * near;
      this.fan = m.web * smooth(0.15 * D_W, 0.6 * D_W, this.len); // L3a
      this.updateJoint(env);
      if (!this.none) this.checkBreaks(over, lb, env);
    } else {
      // 낙하 중 한 줄로 합친다(§6-4). τ0.1s 추정 — 실측 없음(놓는 순간 0.35s 낙하 안에 합쳐 보이면 된다)
      this.fan *= Math.exp(-dt / 0.1);
      this.len = 0;
      this.pinch = 0;
    }
    this.neck = this.width * 0.5;
    for (let i = 0; i < SEG_N; i++) this.stepSeg(i, dt, env);
    if (this.pile[2] > 0) {
      this.pile[2] *= Math.exp(-dt / this.pileTau);
      if (this.pile[2] < 1e-4) this.pile[2] = 0;
    }
    this.write();
  }

  // ── 안쪽 ──

  private neckWidth(len: number): number {
    const m = this.mix;
    // L1b — 합친 목 폭(L = 0.5D에서): 그물 UPQ94 9s 0.2D × 0.65 = 0.13D(시각 고침 2차 A-1, 옛 0.15는 L = 0 기준).
    // 되직 0.072 — 메모 A-2 목 0.08~0.1D(8uAT 0:47 · 0:52, 갓 밥준은 L ≈ 0.26D에서 √ × 1.13 = 0.081D, 덩이 시작이 얹혀 화면 0.1D).
    // 0.08은 화면 목 0.11D(fix2_2 측정 47px). 옛 0.18(Sg__ 굵은 기둥)은
    // 끝 덩이 · 천막과 겹쳐 원통 대 + 갓이 됐다
    const w0 = D_W * (0.13 * m.web + 0.072 * m.stiff + RUNNY_W0 * m.runny);
    const w = w0 * Math.sqrt((THIN_L0 + LIFT_REF) / (THIN_L0 + len)); // L1c 부피 보존 √ 가늘어짐 — L = 0.5D에서 1
    return Math.max(w, RUNNY_W_MIN * m.runny);
  }

  /** 손끝 덩이 반지름 — 주 가닥만(L3b 8uAT 0:47 덩이 = 막대 1.5~2배 · ×0.65, 지름 → 반지름).
   *  가닥이 짧을 땐 작게 — 들기 시작부터 크면 짧은 기둥 위 못대가리로 읽혔다(첫 녹화). 길이 몫은 추정 — 실측 없음.
   *  시각 고침 1차 A-2: 그물 0.08 → 0.035 — 가는 대 위 둥근 덩이(핀 머리 · 서양배)로 읽혔다. 되직 0.12는 그대로(8uAT 0:52 손끝에 붙은 덩이).
   *  시각 고침 2차: 그물 0.035 → 0.015 — 기둥이 굵어져 위 끝이 기둥 폭 × 1.3을 넘으면 면봉 머리(메모 A-1).
   *  되직 0.12 → 0.08 — 덩이 지름 = 2(목 반지름 + 덩이) ≈ 0.14D(L 0.25D) ~ 0.16D(L 0.5D)(메모 A-2 0.13~0.15D, 8uAT 0:47 · 0:52).
   *  0.12면 0.29D 갓이었다(측정 125px), 0.06은 0.12D로 목과 거의 같았다(fix2_1) */
  private lumpR(): number {
    const m = this.mix;
    return 0.5 * D_W * (0.08 * m.stiff + 0.015 * m.web + 0.05 * m.runny) * smooth(0.05 * D_W, 0.4 * D_W, this.len);
  }

  /** 가는 가닥이 갈라져 나오는 자리 — 주 가닥 베지어의 u THIN_JOIN_U */
  private updateJoint(env: StrandEnv): void {
    const g = this.g;
    this.strandGeom(0, env, g);
    const t = THIN_JOIN_U;
    for (let k = 0; k < 3; k++) {
      this.joint[k] = (1 - t) * (1 - t) * g[k] + 2 * t * (1 - t) * g[3 + k] + t * t * g[6 + k];
    }
  }

  private dist(a: number[], b: number[]): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }

  /** 붙은 가닥 i의 베지어 P0 · P1 · P2 → out(9). 반환 = 목 반지름 */
  private strandGeom(i: number, env: StrandEnv, out: number[]): number {
    const rn = SHARE[i] * this.width * 0.5;
    const a = (FAN_DEG[i] * Math.PI) / 180;
    const off = this.fan * FAN_R[i] * D_W;
    // 화면 가로축(카메라 오른쪽 = 월드 +x, 홈 카메라는 x = 0에서 −z를 본다) 한쪽 부채 ±60°(§6-6)
    out[0] = this.base[0] + this.side * Math.cos(a) * off;
    out[2] = this.base[2] + Math.sin(a) * off;
    clampR(out, 0);
    out[1] = i === 0 ? this.base[1] : env.surfaceY(out[0], out[2]) - rn;
    // 위 끝 — 주 가닥은 손끝, 가는 가닥은 주 가닥 덩이 아래 목(THIN_JOIN_U)에서 갈라져 나온다(닫힌 끝이 주 기둥 안에 묻힌다)
    const top = i === 0 ? this.tip : this.joint;
    out[6] = top[0];
    out[7] = top[1];
    out[8] = top[2];
    clampR(out, 6);
    const sag = i === 0 ? SAG * this.len * (1 - 0.5 * this.mix.web) : SAG_THIN * this.len;
    out[3] = (out[0] + out[6]) / 2;
    out[4] = (out[1] + out[7]) / 2 - sag;
    out[5] = (out[2] + out[8]) / 2;
    return rn;
  }

  private checkBreaks(over: number, lb: number, env: StrandEnv): void {
    const m = this.mix;
    if (!this.att[0]) return;
    if (m.runny > 0.5) {
      // 묽음 — 끊기지 않고 소리 없이 떨어져 합쳐진다(§6-8)
      if (over >= lb) this.dropAttached(env, m.runny);
      return;
    }
    // 한 tick에 여럿 끊겨도 소리는 하나. 되직(벌어짐 < STIFF_FAN)은 여섯이 한 기둥이라 가는 가닥을 따로 끊지 않고
    // 주 가닥 끊김에 합친다 — 지터 ±8%로 몇 tick 먼저 끊겨 쩍이 두 번 났다(검토 C-4)
    let thin = false;
    for (let i = 1; i < STRAND_N && this.fan >= STIFF_FAN; i++) {
      if (!this.att[i]) continue;
      const frac = (1 + 0.08 * this.jit[i]) * (1 - m.web) + BREAK_FRAC[i] * m.web;
      if (over >= lb * frac) {
        this.breakStrand(i, env);
        thin = true;
      }
    }
    if (over >= lb) {
      // 주 가닥이 끊기면 남은 가닥도 같이 — 마지막(§1-3)
      for (let i = 0; i < STRAND_N; i++) if (this.att[i]) this.breakStrand(i, env);
      this.events.push({ thin: false, last: true });
    } else if (thin) {
      this.events.push({ thin: true, last: false });
    }
  }

  /** 가닥 i 끊김 — 윗도막은 손끝에 매달리고, 아랫도막은 그루터기로 내려앉는다(§6-3) */
  private breakStrand(i: number, env: StrandEnv): void {
    const g = this.g;
    const rn = this.strandGeom(i, env, g);
    this.att[i] = false;
    const tb = this.tbs[i];
    const bz = (k: number): number => {
      const a = g[k] + (g[k + 3] - g[k]) * tb;
      const b = g[k + 3] + (g[k + 6] - g[k + 3]) * tb;
      return a + (b - a) * tb;
    };
    const q2 = [bz(0), bz(1), bz(2)];
    const lo = this.segs[i * 2];
    lo.mode = 3;
    lo.age = 0;
    lo.dur = STUMP_S;
    lo.rn = rn;
    lo.lump = 0;
    lo.u0 = 0;
    lo.u1 = tb;
    lo.ta = 0;
    lo.tb = STUMP_POINT;
    lo.vol = rn;
    lo.piled = false;
    for (let k = 0; k < 3; k++) {
      lo.from[k] = g[k];
      lo.from[3 + k] = g[k] + (g[3 + k] - g[k]) * tb;
      lo.from[6 + k] = q2[k];
    }
    // 누운 자리 — 밑점에서 손끝의 수평 방향(없으면 카메라 쪽 +z)으로 아랫도막 길이 × 0.5
    const lenLo = Math.hypot(q2[0] - g[0], q2[1] - g[1], q2[2] - g[2]);
    this.lieTargets(lo, g[0], g[2], lenLo, rn, env, 0);
    const up = this.segs[i * 2 + 1];
    up.mode = 2;
    up.age = 0;
    up.rn = rn;
    up.absorb = i !== 0;
    up.lump = i === 0 ? this.lumpR() * (1 - (1 - HANG_LUMP_WEB) * this.mix.web) : 0;
    const st = this.mix.stiff;
    up.u0 = tb + (Math.max(tb, HANG_U0_STIFF) - tb) * st;
    up.u1 = 1;
    up.ta = HANG_POINT + (HANG_POINT_STIFF - HANG_POINT) * st;
    up.tb = 0;
    // 손끝(그 가닥의 끝점)에서 끊긴 끝까지 · 손끝 오프셋
    up.rel[0] = q2[0] - g[6];
    up.rel[1] = q2[1] - g[7];
    up.rel[2] = q2[2] - g[8];
    up.rel[3] = g[6] - this.tip[0];
    up.rel[4] = g[7] - this.tip[1];
    up.rel[5] = g[8] - this.tip[2];
  }

  /** 붙은 가닥 전부 낙하 — 한 줄로 합쳐(밑점 = 주 밑점) 수평 방향으로 누우며 똬리 한 번(§6-4) */
  private dropAttached(env: StrandEnv, runny: number): void {
    const coil = hash(31, this.grabs) > 0.5 ? 1 : -1;
    for (let i = 0; i < STRAND_N; i++) {
      if (!this.att[i]) continue;
      this.att[i] = false;
      const lo = this.segs[i * 2];
      const rn = this.strandGeom(i, env, lo.from);
      lo.mode = 3;
      lo.age = 0;
      lo.dur = FALL_S;
      lo.rn = rn;
      lo.lump = i === 0 ? this.lumpR() : 0;
      lo.u0 = 0;
      lo.u1 = 1;
      lo.ta = 0;
      lo.tb = 0;
      lo.vol = rn * (1 + (RUNNY_LIE_GAIN - 1) * runny);
      lo.piled = false;
      this.lieTargets(lo, this.base[0], this.base[2], this.len, rn, env, coil * COIL);
      this.segs[i * 2 + 1].mode = 0;
    }
  }

  /** 떨어질 자리 — 밑점(bx, bz)에서 수평 방향으로 len × LIE_FRAC. coil = 가운데 점 옆 오프셋 비 */
  private lieTargets(s: Seg, bx: number, bz: number, len: number, rn: number, env: StrandEnv, coil: number): void {
    let hx = this.tip[0] - this.base[0];
    let hz = this.tip[2] - this.base[2];
    const hl = Math.hypot(hx, hz);
    if (hl > 1e-4) {
      hx /= hl;
      hz /= hl;
    } else {
      hx = 0;
      hz = 1;
    }
    const t = s.to;
    t[0] = bx;
    t[2] = bz;
    t[6] = bx + hx * len * LIE_FRAC;
    t[8] = bz + hz * len * LIE_FRAC;
    clampR(t, 6);
    t[3] = (t[0] + t[6]) / 2 - hz * len * coil;
    t[5] = (t[2] + t[8]) / 2 + hx * len * coil;
    clampR(t, 3);
    for (let k = 0; k < 9; k += 3) t[k + 1] = env.surfaceY(t[k], t[k + 2]) + (k === 0 ? -rn : 0.4 * rn);
  }

  /** 매달린 윗도막의 지금 점 — 길이 × 0.7까지 줄며 아래로 처진다(가는 가닥은 × 0.35까지 줄며 흡수) */
  private hangPoints(s: Seg, out: number[]): void {
    const tx = this.tip[0] + s.rel[3];
    const ty = this.tip[1] + s.rel[4];
    const tz = this.tip[2] + s.rel[5];
    const l0 = Math.hypot(s.rel[0], s.rel[1], s.rel[2]);
    const k = s.absorb
      ? 1 - (1 - ABSORB_LEN) * smooth(0, 1, s.age / ABSORB_S)
      : 1 - (HANG_SHRINK + (HANG_SHRINK_STIFF - HANG_SHRINK) * this.mix.stiff) * smooth(0, 1, s.age / HANG_SHRINK_S);
    const w = 0.85 * smooth(0, 1, s.age / HANG_DROOP_S);
    let dx = (s.rel[0] / Math.max(l0, 1e-6)) * (1 - w);
    let dy = (s.rel[1] / Math.max(l0, 1e-6)) * (1 - w) - w;
    let dz = (s.rel[2] / Math.max(l0, 1e-6)) * (1 - w);
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx *= (l0 * k) / dl;
    dy *= (l0 * k) / dl;
    dz *= (l0 * k) / dl;
    out[0] = tx + dx;
    out[1] = ty + dy;
    out[2] = tz + dz;
    out[3] = tx + dx * 0.5;
    out[4] = ty + dy * 0.5;
    out[5] = tz + dz * 0.5;
    out[6] = tx;
    out[7] = ty;
    out[8] = tz;
  }

  private addPile(x: number, z: number, r: number): void {
    const dh = r * PILE_GAIN;
    if (!(dh > 0)) return;
    const p = this.pile;
    const w = dh / (p[2] + dh);
    p[0] += (x - p[0]) * w;
    p[1] += (z - p[1]) * w;
    p[2] = Math.min(PILE_MAX, p[2] + dh);
    this.pileTau = PILE_TAU + (PILE_TAU_RUNNY - PILE_TAU) * this.mix.runny;
  }

  private stepSeg(i: number, dt: number, env: StrandEnv): void {
    const s = this.segs[i];
    const strand = i >> 1;
    s.age += dt;
    if (this.att[strand]) {
      s.mode = 1;
      const g = this.g;
      const rn = this.strandGeom(strand, env, g);
      const tb = this.tbs[strand];
      const lower = (i & 1) === 0;
      // 한 베지어를 tb에서 나눈다(de Casteljau) — 아래 [0, tb] · 위 [tb, 1]
      for (let k = 0; k < 3; k++) {
        const a = g[k] + (g[3 + k] - g[k]) * tb;
        const b = g[3 + k] + (g[6 + k] - g[3 + k]) * tb;
        const m = a + (b - a) * tb;
        if (lower) {
          s.from[k] = g[k];
          s.from[3 + k] = a;
          s.from[6 + k] = m;
        } else {
          s.from[k] = m;
          s.from[3 + k] = b;
          s.from[6 + k] = g[6 + k];
        }
      }
      s.rn = rn;
      s.lump = strand === 0 ? this.lumpR() : 0;
      s.u0 = lower ? 0 : tb;
      s.u1 = lower ? tb : 1;
      s.ta = 0;
      s.tb = 0;
      return;
    }
    if (s.mode === 1) s.mode = 0;
    if (s.mode === 2 && s.absorb && s.age >= ABSORB_S) s.mode = 0;
    if (s.mode === 2) this.hangPoints(s, s.from);
    if (s.mode === 3 && s.age >= s.dur && !s.piled) {
      s.piled = true;
      this.addPile(s.to[6], s.to[8], s.vol);
    }
    if (s.mode === 3 && s.age > s.dur + VANISH_S) s.mode = 0;
  }

  /** 도막 → uniform 배열 */
  private write(): void {
    let vis = false;
    for (let i = 0; i < SEG_N; i++) {
      const s = this.segs[i];
      const o = i * 4;
      let fade = 1;
      let p = s.from;
      if (s.mode === 3) {
        const g = Math.min(1, s.age / s.dur);
        const g2 = g * g; // 중력 꼴 t²
        const q = this.g;
        for (let k = 0; k < 9; k++) q[k] = s.from[k] + (s.to[k] - s.from[k]) * g2;
        p = q;
        // 그루터기도 같은 사라짐 — 0.12s에 누운 털 끝이 VANISH_S에 걸쳐 옅어진다(시각 고침 2차 A-3, 옛 0.25~0.4s 따로 사라짐은 지움)
        fade = 1 - smooth(s.dur, s.dur + VANISH_S, s.age);
      } else if (s.mode === 2 && s.absorb) {
        fade = 1 - smooth(0, ABSORB_S, s.age);
      }
      const rn = s.mode === 0 ? 0 : s.rn * fade;
      if (rn > HIDE_R) vis = true;
      this.A[o] = p[0];
      this.A[o + 1] = p[1];
      this.A[o + 2] = p[2];
      this.A[o + 3] = rn;
      this.B[o] = p[3];
      this.B[o + 1] = p[4];
      this.B[o + 2] = p[5];
      this.B[o + 3] = s.mode === 0 ? 0 : s.lump * fade;
      this.C[o] = p[6];
      this.C[o + 1] = p[7];
      this.C[o + 2] = p[8];
      this.C[o + 3] = i < 2 && s.mode === 1 ? this.pinch : 0; // 목 조임 — 붙어 있는 주 가닥만
      this.D[o] = s.u0;
      this.D[o + 1] = s.u1;
      this.D[o + 2] = s.ta;
      this.D[o + 3] = s.tb;
    }
    this.visible = vis;
  }
}

/** 단면 깊이/폭 — 납작한 타원, 넓은 면이 카메라를 본다(§1-2). 둥근 고른 관 = 지렁이라 금지 */
const STRAND_FLAT = 0.6;

// ── 기둥 질감(2026-11-19 블렌더 상세 맵 public/fx/strand_detail.png) — 옛 절차 결(sin 줄 + fbm) · 길쭉한 기포 틈(cellBubble)을 맵 한 번 읽기로 바꿨다.
//    RGBA8 256 × 512(둘레 × 길이): R·G = 탄젠트 노멀 x(둘레) · y(길이)(0.5 = 0) · B = 틈(1 = 트임, 최저 0.8) · A = 높이(0.5 = 0, 바깥 +).
//    둘레 한 바퀴 = u 0..1, v 0..1 = 둘레 두 바퀴 길이(종횡 1:2), 이음매 없음. 주 가닥만 · 위 끝 머리는 빼고 ──
/** 늘어남 0~1 = smoothstep(이 둘, 주 가닥 길이) — 맵 노멀 · 세로 광이 함께 또렷해진다(늘어난 글루텐). 추정 — 실측 없음(UPQ94 8s 붙음 → 9s 결) */
const STRETCH_LO = 0.1 * D_W;
const STRETCH_HI = 0.8 * D_W;
/** 맵 길이 방향 반복 수 — v = vU × V_REPEAT. 고정이라 기둥이 늘어나면 결이 같이 길어진다(늘어난 글루텐).
 *  기준: 주 가닥 길이 L = 0.5D(LIFT_REF) · 목 반지름 = 피크 기둥 0.065D(neckWidth 그물 w0 0.13D ÷ 2)일 때 맵 한 칸이 둘레 1 : 길이 2.
 *  납작 단면 둘레 ≈ 2π · (1 + 0.6)/2 · r = 5.03r → 0.327D, 한 칸 길이 = 둘레 × 2 = 0.654D → V_REPEAT = L ÷ 0.654D = 0.5 ÷ 0.654 = 0.765.
 *  (아치 길이는 L보다 조금 길다 — 무시, 추정) */
const V_REPEAT = 0.765;
/** 맵 노멀 세기 — n += circ · nx · N + T · ny · N, nx · ny = (채널 − 0.5) × 2. 늘어날수록(st) 세게(짧을 때 DETAIL_N_LO 배).
 *  맵 그대로면 이 조명에서 대비가 약하다(맵 쪽 담당 보고)라 1.5에서 시작. 추정 — 실측 없음(높이를 못 잰다) */
const DETAIL_N = 1.8;
const DETAIL_N_LO = 0.4;
/** 높은 띠가 밝고 골이 어둡다(실물 UPQ94 9s는 반투명) — col *= 1 + TONE · (A − 0.5) · 2. 추정 — 실측 없음 */
const DETAIL_TONE = 0.2;
/** 틈(B)이 어둡다 — col *= mix(1, B, CAV · (0.8 + 0.4 · 바늘구멍 uPin)). 지금까지 SLIT가 uPin을 쓰던 몫. 추정 — 실측 없음 */
const DETAIL_CAV = 1.0;
/** 세로 광(비등방 Ward) — 접선 쪽 폭 · 둘레 쪽 폭 · 세기. 반짝 점 · 흰 띠 금지라 약하게. 추정 — 실측 없음(UPQ94 9s 세로로 긴 광만 봤다) */
const ANISO_T = 0.8;
const ANISO_B = 0.15;
const ANISO_GAIN = 0.5;

/** 상세 맵 경로 — 묶음 안(빵 GLB '/breads/x.glb' 꼴과 같다). 못 받으면 맵 질감 없이 매끈(절차 결 대체 길은 두지 않는다) */
export const DETAIL_URL = '/fx/strand_detail.png';

/** 상세 맵 로드 — 데이터 텍스처(NoColorSpace) · 반복 · 밉맵 · 이방성 4(렌더러 최대로 three가 깎는다). 받으면 on 1. document 없는 시험(node)은 건너뛴다 */
function loadDetail(on: THREE.IUniform<number>): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const t = new THREE.TextureLoader().load(DETAIL_URL, () => { on.value = 1; }, undefined, (err) => {
    console.warn('[StrandMesh] 상세 맵 로드 실패 — 맵 질감 없이 매끈하게', err);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

const STRAND_VERT = /* glsl */ `
attribute float aT;
attribute float aAng;
attribute float aSeg;
uniform vec4 uSA[${SEG_N}];
uniform vec4 uSB[${SEG_N}];
uniform vec4 uSC[${SEG_N}];
uniform vec4 uSD[${SEG_N}];
uniform float uFan;
uniform float uNeck;
uniform float uStiff;
varying vec3 vN;
varying vec3 vSide;
varying vec3 vW;
varying float vU;
varying float vAng;
varying float vThin;
varying float vMain;
varying vec3 vT;
varying float vAO;

// 반지름 윤곽(§6-5) — 가닥 전체 위치 u(0 밑 ~ 1 끝): 밑동 나팔(아래 15%) → 가장 가는 곳(아래 1/4 근처) →
// 위로 굵어져 손끝 덩이(주 가닥만) → 끝 링 0(닫힌 끝). 위 굵고 아래 가늚(8uAT 옆 0.25 → 0.1 → 0.03D)
// pinch = 끊기기 직전 목(u 0.2~0.35) 조임 몫(C.w, 주 가닥만 — L1b 끊기기 직전 0.03D, 8uAT 1:26)
float strandR(float u, float rn, float lump, float pinch) {
  // L2a 밑동 나팔 — 시각 고침 2차 A-1: 0.8·(1 − 벌어짐) → 0.8 + 0.4·벌어짐. 메모 목표 밑동 0.22~0.28D = 기둥 0.13D × 약 1.9
  // (u 0에서 (1 + 1.2) × 0.92). 옛 식은 피크(벌어짐 0.9)에서 나팔이 거의 0이라 빨대 꽂힌 꼴. 묽음 · 되직(벌어짐 0)은 1차와 같다
  float trumpet = 1.0 + (0.8 + 0.4 * uFan) * (1.0 - smoothstep(0.0, 0.15, u));
  // 위 : 가운데 ≈ 1.4(상한 1.6). 시각 고침 1차 0.55 → 1.25를 0.8 → 1.1로 — 가는 대 위 덩이(핀 머리 · 서양배, 5 : 1)로 읽혔다.
  // 추정 — 8uAT 옆 비율. 시각 고침 2차 A-1: 가운데(u 0.5)를 1에 맞춤 — rn = 기둥 가운데 반지름(W/2). 옛 식은 가운데가 0.9라
  // SHARE 0.85 · √ 기준 길이와 겹쳐 기둥이 L1b의 0.57배였다. 위 : 가운데 1.22 → 1.15 — 굵어진 기둥 위 끝이 면봉 머리로 읽혀(fix2_2 측정
  // 72 : 56px = 1.29) 메모 상한 1.3에서 여유를 둔다
  float body = mix(0.92, 1.15, smoothstep(0.22, 0.95, u));
  // 되직 = 표면에서 끌려 오른 두꺼운 천막(시각 고침 2차 A-2, 8uAT 0:47 · 0:52) — u 0.6 목(1배, 0.09D)에서 아래로 오목하게 넓어진다.
  // 밑점은 표면 아래 rn에 묻혀 표면은 u ≈ 0.1~0.17에서 끊긴다 — 거기서 3.1~3.8배 = 0.28~0.31D(메모 밑 0.28~0.32D). 2.3은 0.2D였다
  // (fix2_1 측정 78px). 위는 덩이가 목에서 부드럽게 부푼다(덩이 아래가 꺾여 들어가는 갓 금지)
  float cu = max(1.0 - u / 0.6, 0.0);
  float prof = mix(trumpet * body, 1.0 + 4.0 * cu * cu, uStiff);
  prof *= 1.0 - pinch * smoothstep(0.12, 0.2, u) * (1.0 - smoothstep(0.35, 0.45, u));
  // 덩이는 위 40%에 걸쳐 부풀고 끝 20%에 걸쳐 원호로 닫힌다 — 짧게 닫으면 마름모 보석 꼴(첫 녹화).
  // 부풂 구간 0.55~0.9 · 닫힘 0.2는 추정 — 실측 없음(첫 녹화에서 보석 꼴이 사라지는 값). 되직은 0.45~0.85로 넓혀 목에서 이어지게
  // (추정 — 실측 없음, 갓 밑 꺾임이 사라지는 값)
  float knob = lump * smoothstep(mix(0.55, 0.45, uStiff), mix(0.9, 0.85, uStiff), u);
  float c = clamp((1.0 - u) / 0.2, 0.0, 1.0);
  return (rn * prof + knob) * sqrt(c * (2.0 - c));
}

// 도막 안 위치 t의 반지름 — 윤곽 × 끊긴 끝 뾰족(시작 · 끝 쪽 D.z · D.w 길이에 걸쳐 0으로, 끝에 방울 없음 L5a 8uAT 1:27)
float segR(float t, vec4 D, float rn, float lump, float pinch) {
  float r = strandR(mix(D.x, D.y, t), rn, lump, pinch);
  if (D.z > 0.0) r *= clamp(t / D.z, 0.0, 1.0);
  if (D.w > 0.0) r *= clamp((1.0 - t) / D.w, 0.0, 1.0);
  return r;
}

void main() {
  int i = int(aSeg + 0.5);
  vec4 A = uSA[i];
  vec4 B = uSB[i];
  vec4 C = uSC[i];
  vec4 D = uSD[i];
  float t = aT;
  vec3 P = mix(mix(A.xyz, B.xyz, t), mix(B.xyz, C.xyz, t), t);
  vec3 T = mix(B.xyz - A.xyz, C.xyz - B.xyz, t);
  float tl = length(T);
  T = tl > 1e-6 ? T / tl : vec3(0.0, 1.0, 0.0);
  // 틀 — 옆 = 접선 × 카메라 시선(넓은 면이 카메라를 본다)
  vec3 V = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec3 side = cross(T, V);
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
  vec3 face = cross(side, T);
  float u = mix(D.x, D.y, t);
  float r = segR(t, D, A.w, B.w, C.w);
  // 반지름이 길이를 따라 변하는 만큼 노멀을 접선 쪽으로 기울인다. 빼면 닫힌 끝(덩이 꼭대기)이 옆벽처럼 어둡게 칠해졌다
  float t0 = max(t - 0.02, 0.0);
  float t1 = min(t + 0.02, 1.0);
  float drds = clamp((segR(t1, D, A.w, B.w, C.w) - segR(t0, D, A.w, B.w, C.w)) / max((t1 - t0) * 2.0 * tl, 1e-5), -4.0, 4.0);
  float ca = cos(aAng);
  float sa = sin(aAng);
  vec3 pos = P + (side * ca + face * (sa * ${STRAND_FLAT})) * r;
  vN = normalize(side * (ca * ${STRAND_FLAT}) + face * sa) - T * drds;
  vSide = side;
  vT = T;
  vW = pos;
  vU = u;
  vAng = aAng;
  vThin = clamp(1.0 - r / max(uNeck, 1e-4), 0.0, 1.0);
  vMain = aSeg < 1.5 ? 1.0 : 0.0;
  vAO = 1.0; // 정점 색 그늘은 더미 메시 몫(CoilMesh) — 가닥은 그늘 없음
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}
`;

export const STRAND_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uSpecStr;
uniform float uWet;
uniform float uSlopeAspect;
uniform float uPin;
uniform float uLen;
uniform sampler2D uDetail;
uniform float uDetailOn;
varying vec3 vN;
varying vec3 vSide;
varying vec3 vW;
varying float vU;
varying float vAng;
varying float vThin;
varying float vMain;
varying vec3 vT;
varying float vAO;
${FBM_GLSL}
${DOUGH_ALBEDO}
${DOUGH_SHADE}
void main() {
  // 반죽과 같은 알베도(DOUGH_ALBEDO — 모틀 · 젖음) — 오브젝트 xz 도메인(§6-13). 알베도 색은 바꾸지 않는다
  vec2 xz = vW.xz * uSlopeAspect;
  float mott;
  vec3 base = doughAlbedo(xz, mott);
  vec3 n = normalize(vN);
  vec3 T = normalize(vT);
  // 기둥 질감은 주 가닥(합친 기둥)만(§6-15) · 위 끝 둥근 머리(손끝 밑)는 빼고 · 늘어날수록 또렷(st)
  float tex = vMain * (1.0 - smoothstep(0.75, 0.9, vU));
  float st = smoothstep(${STRETCH_LO}, ${STRETCH_HI}, uLen);
  // 상세 맵 — 분기 밖에서 한 번만 읽는다(밉 도함수). 로드 전 · 실패(uDetailOn 0)면 중립값(노멀 0 · 틈 없음 · 높이 0)이라 매끈하다.
  // u = 둘레 각 ÷ 2π, v = 가닥 위치 × 고정 반복 수(늘어나면 결이 같이 길어진다)
  vec4 dt = mix(vec4(0.5, 0.5, 1.0, 0.5), texture(uDetail, vec2(vAng / 6.2832, vU * ${V_REPEAT.toFixed(3)})), uDetailOn);
  if (tex > 0.0) {
    // 맵 노멀(둘레 · 길이)로 흔든다 — 둘레 방향 = 각 미분, 길이 방향 = 접선 T. 줄이 한 점에서 깎이는 2π 이음매는 맵이 이음매 없음
    vec3 side = normalize(vSide);
    vec3 circ = normalize(-side * sin(vAng) + cross(side, T) * (${STRAND_FLAT} * cos(vAng)));
    vec2 dn = (dt.rg - 0.5) * 2.0;
    n = normalize(n + (circ * dn.x + T * dn.y) * (${DETAIL_N.toFixed(2)} * mix(${DETAIL_N_LO.toFixed(2)}, 1.0, st) * tex));
  }
  // 아래 15%는 표면 노멀로 — 빨대 꽂힌 꼴 금지(§6-13)
  float low = smoothstep(0.0, 0.15, vU);
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), 1.0 - low));
  // 가늘수록 조금 밝고 광이 넓다(L8 kib6 연노랑 윤기). 광 +0.35 · 밝기 +0.06은 추정 — 실측 없음(L8은 색만 봤다, 세기는 못 잰다)
  float ndl;
  vec3 col = doughShade(n, base, xz, min(1.0, uWet + 0.35 * vThin), 0.0, ndl);
  col *= 1.0 + 0.06 * vThin;
  col *= vAO; // 정점 색 그늘(접힌 골 AO) — 더미 메시만 1이 아니다
  if (tex * low > 0.0) {
    // 높은 띠가 밝고 골 · 틈이 어둡다(실물은 반투명). 틈은 바늘구멍 있는 상태(uPin)일수록 조금 더
    col *= 1.0 + ${DETAIL_TONE.toFixed(3)} * (dt.a - 0.5) * 2.0 * tex * low;
    col *= mix(1.0, dt.b, ${DETAIL_CAV.toFixed(2)} * (0.8 + 0.4 * smoothstep(0.004, 0.2, uPin)) * tex * low);
    // 세로 광 — 늘어난 면의 긴 하이라이트(비등방 Ward: 접선 쪽 넓고 둘레 쪽 좁다). 맵으로 흔든 노멀을 따라 휘어 한 줄 흰 띠가 되지 않는다
    vec3 H = normalize(doughKey() + vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
    vec3 B = cross(T, n);
    B *= inversesqrt(max(dot(B, B), 1e-8));
    float hn = max(dot(H, n), 1e-3);
    float ht = dot(H, T) / ${ANISO_T};
    float hb = dot(H, B) / ${ANISO_B};
    col += vec3(0.28, 0.16, 0.08) * (exp(-(ht * ht + hb * hb) / (hn * hn)) * ${ANISO_GAIN} * uSpecStr * (0.4 + 0.6 * st) * tex * low);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

/** 가닥 다발 메시 — 한 draw call. 반죽 머티리얼의 uniform 객체(uColor · uSpecStr · uWet · uSlopeAspect)를 같은 객체로 공유한다 */
export class StrandMesh {
  readonly rig = new StrandRig();
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(shared: Record<string, THREE.IUniform>) {
    const per = RINGS * (SIDES + 1);
    const n = SEG_N * per;
    const aT = new Float32Array(n);
    const aAng = new Float32Array(n);
    const aSeg = new Float32Array(n);
    const idx: number[] = [];
    for (let s = 0; s < SEG_N; s++) {
      for (let r = 0; r < RINGS; r++) {
        for (let j = 0; j <= SIDES; j++) {
          const v = s * per + r * (SIDES + 1) + j;
          // 코사인 간격 — 양 끝(손끝 덩이 · 뾰족 끝 · 밑동 나팔)에 링을 모은다. 고른 간격은 덩이가 마름모 보석으로 깎였다(첫 녹화)
          aT[v] = 0.5 - 0.5 * Math.cos((Math.PI * r) / (RINGS - 1));
          aAng[v] = (j / SIDES) * Math.PI * 2; // 이음매 꼭짓점 하나 더(2π) — 각이 거꾸로 보간되지 않게
          aSeg[v] = s;
          if (r < RINGS - 1 && j < SIDES) {
            const a = v;
            const b = v + SIDES + 1;
            idx.push(a, b, a + 1, a + 1, b, b + 1);
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geo.setAttribute('aAng', new THREE.BufferAttribute(aAng, 1));
    geo.setAttribute('aSeg', new THREE.BufferAttribute(aSeg, 1));
    geo.setIndex(idx);
    const detailOn = { value: 0 };
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: shared.uColor,
        uSpecStr: shared.uSpecStr,
        uWet: shared.uWet,
        uSlopeAspect: shared.uSlopeAspect,
        uSA: { value: this.rig.A },
        uSB: { value: this.rig.B },
        uSC: { value: this.rig.C },
        uSD: { value: this.rig.D },
        uFan: { value: 0 },
        uNeck: { value: 0 },
        uStiff: { value: 0 },
        // 기둥 질감 — 바늘구멍은 반죽 uniform 객체를 공유, 길이는 sync가 넣는다. 상세 맵은 로드되면 uDetailOn 1(CoilMesh도 이 객체를 공유)
        uPin: shared.uPin,
        uLen: { value: 0 },
        uDetail: { value: loadDetail(detailOn) },
        uDetailOn: detailOn,
      },
      vertexShader: STRAND_VERT,
      fragmentShader: STRAND_FRAG,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; // 셰이더가 자리를 정한다
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
  }

  /** 상태기 출력 → uniform · 보임. show = 반죽이 보이는가(쇼케이스 중엔 숨는다) */
  sync(show = true): void {
    const u = this.material.uniforms;
    u.uFan.value = this.rig.fan;
    u.uNeck.value = this.rig.neck;
    u.uStiff.value = this.rig.stiff;
    u.uLen.value = this.rig.len;
    this.mesh.visible = show && this.rig.visible;
  }
}
