// 당기기 가닥 다발(2026-11-19 당기기 실물화, 명세 .work/feel2/spec.md §1 · §6) — 고깔 하나를 버리고
// 가닥 STRAND_N(주 1 + 끊기기 직전 곁가닥 1 — 들기 v3에서 가는 실 5를 뺐다) × 도막 2(아래 · 위)를 한 draw call로 그린다.
// 로직(길이 · 굵기 · 벌어짐 · 끊김 · 낙하 · 더미)은 StrandRig(순수 TS, three 없음)가 맡고, 셰이더는 베지어 · 틀 · 단면만 푼다.
// 칸 ID = .work/feel2/table.md(실물 대조표). D = 병 안지름 = D_W(월드).
import * as THREE from 'three';
import { FILL_RADIUS } from '../jar';

/** 병 안지름(월드) — 실물 대조표의 D */
export const D_W = 2 * FILL_RADIUS;
export const STRAND_N = 2;
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

// ── 들기 v3(2026-11-19 손맛 3차, 정본 .work/feel3/spec.md 「들기 v3 명세 초안」) — 가는 실 5가닥을 뺐다(폰 1배에서 손가락 밑 크기).
//    주 가닥 1개 + 끊기기 직전에만 갈라지는 곁가닥 1개. 넓은 신호(끌림 결 · 밑자락 · 더미 주름)는 반죽 높이장(DoughMesh GRAB_FIELD) 몫 ──
/** 손끝 덩이 띄우기 — 1이면 반죽 덩이(지름 ≈ 0.25D)를 터치점 위 ≈ 60 CSS px에 띄우고 가닥이 거기로 이어진다(블록 퍼즐 끌기 띄움과
 *  같은 수법 — 손가락이 가닥 끝을 덮지 않게). 0이면 가닥 끝 = 터치점. 시안 비교용(사용자 결정 거리) */
export const LIFT_LUMP: number = 1;
/** 띄움 높이(월드 y) — 폰 1배 반죽 지름 146 CSS px = D_W라 60px = 0.41D(화면). 42° 부감에서 세로 변위는 cos 42°배로 보여 나눈다 */
export const LUMP_Y = (0.41 / Math.cos((42 * Math.PI) / 180)) * D_W;
/** 반지름 몫 — 주 1 · 곁가닥 0.7(갈라진 두 줄, UPQ94 12s) */
const SHARE = [1, 0.7];
/** 시작 폭(D) — 그물 0.17 · 되직 0.13 · 묽음 0.12. 부피 보존 W = W0 · √(LW ÷ L)(L ≥ LW) — 1.2D 들면 × 0.46, 목 조임 × 0.4와 겹쳐
 *  목이 시작의 1/5 아래(명세 「5배 넘게」). 추정 — 실측 없음(UPQ94 9s 밑 0.4D · 12s 목 0.03D만 봤다) */
const W0_WEB = 0.17;
const W0_STIFF = 0.13;
const W0_RUNNY = 0.12;
const THIN_LW = 0.25 * D_W;
/** 묽음 폭 하한 — 굵은 크림 줄(L3c 8uAT 1:56 아래 0.08D). 묽음은 목 조임이 없다 */
const RUNNY_W_MIN = 0.1 * D_W;
/** 처짐 — 정적 처짐만. 추정 — 실측 없음 */
const SAG = 0.08;
/** 끊기기 직전 목 조임 — 끊김 길이의 85%부터 끊는 자리(u ≈ 0.5)만 × 0.4까지. 묽음은 빼고 */
const PINCH_FROM = 0.85;
const PINCH_MAX = 0.6;
/** 두 갈래 — 그물만, 끊김 길이 55%부터 곁가닥이 밑에서 갈라져 나와 주 가닥 u 0.55에 붙는다(UPQ94 12s). 밑점 간격 ± 0.07D. 추정 — 실측 없음 */
const SPLIT_FROM = 0.55;
const SPLIT_OFF = 0.07 * D_W;
const SPLIT_JOIN_U = 0.55;
/** 병 안 클램프 — 밑점 · 끝점 xz */
const CLAMP_R = 0.85 * FILL_RADIUS;
/** 휴면 · 곰팡이 문턱 — grabMax가 이 아래면 가닥 없음 · 끊김 소리 없음, 밑자락만 조금 */
export const STRAND_MIN_GRABMAX = 0.2;
/** 끊는 자리 tb = 0.47 ~ 0.55(해시) — 목 조임 창(셰이더 u 0.3~0.72)과 같은 자리 */
const TB_LO = 0.47;
const TB_SPAN = 0.08;
/** 위쪽은 0.15s에 손끝 덩이로 말려 올라간다(8uAT 85.3 → 85.7s) — 길이 × 0.06까지 · 가닥 반지름 × 0.3, 덩이는 남는다 */
const CURL_S = 0.15;
const CURL_LEN = 0.06;
const HANG_DROOP_S = 0.4; // 추정 — 실측 없음
const HANG_POINT = 0.6; // 끊긴 끝 뾰족 길이 몫. 추정 — 실측 없음
/** 곁가닥 윗도막 — 0.15s에 주 기둥으로 흡수 */
const ABSORB_S = 0.15;
const ABSORB_LEN = 0.35;
/** 아래쪽 주저앉음 — 1 ~ 2.5s 느리게 접혀 내려앉으며 높이장 더미로 녹아든다(UPQ94 12 → 13s). 묽음 1s · 되직 1.5s · 그물 2.2s. 추정 */
const SLUMP_RUNNY = 1.0;
const SLUMP_STIFF = 1.5;
const SLUMP_WEB = 2.2;
const SLUMP_POINT = 0.35; // 끊긴 끝 뾰족 길이 몫. 추정 — 실측 없음
/** 놓은 덩이 낙하 — 0.35s(L5b UPQ94 0.3~0.5s) */
const FALL_S = 0.35;
const LIE_FRAC = 0.3;
const COIL = 0.25; // 접힐 때 가운데 점 옆 오프셋 = 길이 × 0.25 (L5b UPQ94 12s)
const VANISH_S = 0.2;
/** 밑자락 둔덕(높이장) 최대 높이 · 반경 — 명세 0.2D · 0.28D(UPQ94 9s 밑 0.4~0.5D). 둔덕 모양은 GRAB_FIELD(오목 윤곽) */
export const MOUND_H = 0.2 * D_W;
export const MOUND_R = 0.28 * D_W;
/** 더미(높이장) — 지름 0.45D(반경 0.225D 가우스) · 높이 0.07D · 겹 고리 2개. 추정 — 실측 없음(UPQ94 13s 접힌 더미만 봤다) */
export const PILE_R = 0.225 * D_W;
const PILE_H = 0.07 * D_W;
const PILE_MAX = 1.3 * PILE_H;
/** 더미 가라앉음 τ — 4s(묽음 2.5s) */
const PILE_TAU = 4;
const PILE_TAU_RUNNY = 2.5;
/** 반들 자국 — 더미가 생긴 뒤 6s까지 다 차 있다가 13s에 0(명세 8~15s) */
const SHEEN_HOLD = 6;
const SHEEN_END = 13;
/** 더미 자리 무늬 꼬임(rad) — 접혀 포개진 반죽이라 표면 무늬가 더미 둘레로 감긴다(따로 놓인 물건이 아니라 표면이 이어진다). 추정 */
const PILE_TWIST = 1.6;
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

/** 주 가닥 끊김 길이(월드, 버팀 짧아짐 전, 커밋 길이 위로) — L4b: 피크 grabMax 0.6 → 1.2D · 갓 밥준 0.497 → 0.25D · 시큼 0.278 → 1.0D.
 *  잠금값 grabMax 0.600(2026-08-24 확정)의 지금 뜻 = 피크 끊김 길이 1.2D(1.6.16과 같다, 들기 v3에서 안 바뀜) */
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
  /** 더미에 보탤 높이(월드) · 이미 보탠 높이 */
  vol: number;
  added: number;
  /** 주저앉음(느린 접힘, 더미가 같이 자란다) — 아니면 덩이 낙하(t², 닿은 뒤 더미) */
  slump: boolean;
  /** 곁가닥 윗도막 — 매달리지 않고 ABSORB_S에 주 기둥으로 흡수된다 */
  absorb: boolean;
};

const newSeg = (): Seg => ({
  mode: 0, age: 0, from: new Array<number>(9).fill(0), to: new Array<number>(9).fill(0), dur: 1,
  rel: [0, 0, 0, 0, 0, 0], rn: 0, lump: 0, u0: 0, u1: 1, ta: 0, tb: 0, vol: 0, added: 0, slump: false, absorb: false,
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
 *   A = (P0, 목 반지름) · B = (P1, 손끝 덩이 반지름) · C = (P2, 목 조임 0~0.6) · D = (u0, u1, 시작 뾰족 길이, 끝 뾰족 길이)
 * 도막 i·2 = 아랫도막, i·2+1 = 윗도막. 붙어 있는 동안 두 도막은 한 베지어를 tb에서 나눈 것이라 이음매가 없다.
 */
export class StrandRig {
  readonly A = new Float32Array(SEG_N * 4);
  readonly B = new Float32Array(SEG_N * 4);
  readonly C = new Float32Array(SEG_N * 4);
  readonly D = new Float32Array(SEG_N * 4);
  /** 두 갈래 0~1 — 끊기기 직전 곁가닥 몫 */
  split = 0;
  /** 되직 몫 — 셰이더 덩이 거칠기 */
  stiff = 0;
  /** 합친 목 반지름(W/2, 월드) — 셰이더 가늘수록 밝음의 기준 */
  neck = 0;
  visible = false;
  /** 이번 tick의 끊김(소리 · 진동) */
  readonly events: StrandBreak[] = [];
  /** 더미 — 월드 x, z, 높이, 반경, 반들 0~1, 접힘 방위(rad), 무늬 꼬임(rad) */
  readonly pile = [0, 0, 0, PILE_R, 0, 0, 0];

  /** 묽음 몫 0~1 — 셰이더 덩이 꼴(줄줄 흐름) */
  runny(): number {
    return this.mix.runny;
  }

  /** 잡는 중 */
  active = false;
  /** 휴면 · 곰팡이 — 가닥 없음 */
  none = false;
  /** 주 가닥 길이(월드) — 밑자락 둔덕 · 끌림 결이 쓴다 */
  len = 0;
  private held = 0;
  /** 끊기기 직전 목 조임 0 ~ PINCH_MAX — 주 가닥 도막의 C.w로 셰이더에 간다 */
  private pinch = 0;
  private readonly base = [0, 0, 0];
  private readonly tip = [0, 0, 0];
  /** 곁가닥이 붙는 자리 = 주 가닥 u SPLIT_JOIN_U(월드) */
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
  private pileAge = Infinity;
  private readonly att: boolean[] = new Array<boolean>(STRAND_N).fill(false);
  private tb = 0.5;
  private readonly segs: Seg[] = Array.from({ length: SEG_N }, newSeg);
  private readonly g = new Array<number>(9).fill(0);

  /** 잡기 — 앵커 월드 xz. 남은 낙하 도막은 바로 더미로 넘기고 새 가닥을 낸다(§6-14) */
  start(x: number, z: number, mix: StrandMix, env: StrandEnv): void {
    for (const s of this.segs) {
      if (s.mode === 3) this.addPile(s.to[3], s.to[5], s.vol - s.added);
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
    this.split = 0;
    this.side = hash(3, this.grabs) > 0.5 ? 1 : -1;
    this.width = this.neckWidth(0);
    const sy = env.surfaceY(x, z);
    this.base[0] = x;
    this.base[1] = sy - this.width * 0.5;
    this.base[2] = z;
    // 끝점은 밑점에서 출발한다(높이 0 출발, §6-2)
    this.tip[0] = x;
    this.tip[1] = sy;
    this.tip[2] = z;
    for (let k = 0; k < 3; k++) this.joint[k] = this.tip[k];
    this.len = 0;
    this.pinch = 0;
    this.att.fill(!this.none);
    this.tb = TB_LO + TB_SPAN * hash(0, this.grabs);
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

  /** 놓기 — 붙은 가닥은 느리게 주저앉아 더미가 되고(§6-4), 손끝 덩이도 떨어진다(§6-14) */
  release(env: StrandEnv): void {
    if (!this.active) return;
    this.active = false;
    this.dropAttached(env);
    for (let i = 0; i < SEG_N; i++) {
      const s = this.segs[i];
      if (s.mode !== 2) continue;
      if (s.absorb) {
        s.mode = 0;
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
      s.slump = false;
      s.vol = 0.5 * PILE_H;
      s.added = 0;
    }
  }

  /** 다 지운다 — resetTransient · NaN 복구 */
  reset(): void {
    this.active = false;
    this.hasTarget = false;
    this.len = 0;
    this.split = 0;
    this.neck = 0;
    this.width = 0;
    this.lenCommit = 0;
    this.held = 0;
    this.pinch = 0;
    this.pileAge = Infinity;
    this.pile.fill(0);
    this.pile[3] = PILE_R;
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
    if (!Number.isFinite(this.len + this.split) || !allFinite(this.base) || !allFinite(this.tip)
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

  /** 붙은 몫 0~1 — 주 가닥이 붙어 있으면 1. 가닥 없는 휴면은 잡는 동안 1 */
  attached(): number {
    if (this.none) return this.active ? 1 : 0;
    return this.att[0] ? 1 : 0;
  }

  /** 끌어 올린 거리(월드) = 주 가닥 길이 − 커밋 길이 — 밑자락 둔덕 · 주름이 쓴다. 손끝 덩이를 띄워도 누르는 순간은 0 */
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
      if (this.hasTarget) {
        const k = 1 - Math.exp(-dt / Math.max(env.followTau, 1e-3));
        for (let i = 0; i < 3; i++) this.tip[i] += (this.target[i] - this.tip[i]) * k;
      }
      this.len = this.dist(this.tip, this.base);
      this.width = this.neckWidth(this.len);
      this.base[1] = env.surfaceY(this.base[0], this.base[2]) - this.width * 0.5;
      const over = Math.max(0, this.len - this.lenCommit);
      const lb = this.breakLen(env);
      const f = over / Math.max(lb, 1e-4);
      const near = smooth(PINCH_FROM, 1, f);
      if (m.runny > 0.5) this.width = Math.max(this.width * (1 - 0.5 * near), RUNNY_W_MIN * m.runny);
      this.pinch = PINCH_MAX * (1 - m.runny) * near;
      this.split = this.att[0] ? m.web * smooth(SPLIT_FROM, 0.95, f) : 0;
      this.att[1] = this.att[0] && this.split > 0.01;
      this.updateJoint(env);
      if (!this.none) this.checkBreaks(over, lb, env);
    } else {
      this.split = 0;
      this.len = 0;
      this.pinch = 0;
    }
    this.neck = this.width * 0.5;
    for (let i = 0; i < SEG_N; i++) this.stepSeg(i, dt, env);
    if (this.pile[2] > 0) {
      this.pile[2] *= Math.exp(-dt / this.pileTau);
      if (this.pile[2] < 1e-4) this.pile[2] = 0;
    }
    this.pileAge += dt;
    this.pile[4] = 1 - smooth(SHEEN_HOLD, SHEEN_END, this.pileAge);
    this.pile[6] = PILE_TWIST * Math.min(1, this.pile[2] / PILE_H);
    this.write();
  }

  // ── 안쪽 ──

  private neckWidth(len: number): number {
    const m = this.mix;
    const w0 = D_W * (W0_WEB * m.web + W0_STIFF * m.stiff + W0_RUNNY * m.runny);
    // 부피 보존 — 늘어난 만큼 단면이 준다(r ∝ 1/√L)
    const w = w0 * Math.sqrt(THIN_LW / Math.max(len, THIN_LW));
    return Math.max(w, RUNNY_W_MIN * m.runny);
  }

  /** 손끝 덩이 반지름(목 위에 더하는 몫) — 띄우면(LIFT_LUMP) 덩이 지름 ≈ 0.25~0.29D(되직이 크다), 안 띄우면 1.6.16 값(손가락이 덮는다) */
  private lumpR(): number {
    const m = this.mix;
    const k = LIFT_LUMP
      ? D_W * (0.13 * m.stiff + 0.12 * m.web + 0.06 * m.runny)
      : 0.5 * D_W * (0.08 * m.stiff + 0.015 * m.web + 0.05 * m.runny);
    return k * smooth(0.05 * D_W, 0.3 * D_W, this.len);
  }

  /** 곁가닥이 붙는 자리 — 주 가닥 베지어의 u SPLIT_JOIN_U */
  private updateJoint(env: StrandEnv): void {
    const g = this.g;
    this.strandGeom(0, env, g);
    const t = SPLIT_JOIN_U;
    for (let k = 0; k < 3; k++) {
      this.joint[k] = (1 - t) * (1 - t) * g[k] + 2 * t * (1 - t) * g[3 + k] + t * t * g[6 + k];
    }
  }

  private dist(a: number[], b: number[]): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }

  /** 붙은 가닥 i의 베지어 P0 · P1 · P2 → out(9). 반환 = 목 반지름 */
  private strandGeom(i: number, env: StrandEnv, out: number[]): number {
    // 갈라지면 두 줄이 넓이를 나눈다 — 주 가닥은 조금 가늘어지고 곁가닥이 생긴다
    const rn = i === 0 ? this.width * 0.5 * (1 - 0.3 * this.split) : SHARE[1] * this.width * 0.5 * this.split;
    // 화면 가로축(월드 x)으로 두 밑점이 벌어진다
    const off = (i === 0 ? -1 : 1) * this.side * SPLIT_OFF * this.split;
    out[0] = this.base[0] + off;
    out[2] = this.base[2];
    clampR(out, 0);
    out[1] = i === 0 && this.split === 0 ? this.base[1] : env.surfaceY(out[0], out[2]) - rn;
    const top = i === 0 ? this.tip : this.joint;
    out[6] = top[0];
    out[7] = top[1];
    out[8] = top[2];
    clampR(out, 6);
    const sag = SAG * this.len * (1 - 0.5 * this.mix.web);
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
      if (over >= lb) this.dropAttached(env);
      return;
    }
    if (over >= lb) {
      for (let i = 0; i < STRAND_N; i++) if (this.att[i]) this.breakStrand(i, env);
      this.events.push({ thin: false, last: true });
    }
  }

  /** 가닥 i 끊김 — 위쪽은 손끝 덩이로 말려 올라가고, 아래쪽은 느리게 접혀 주저앉는다 */
  private breakStrand(i: number, env: StrandEnv): void {
    const g = this.g;
    const rn = this.strandGeom(i, env, g);
    this.att[i] = false;
    const tb = this.tb;
    const bz = (k: number): number => {
      const a = g[k] + (g[k + 3] - g[k]) * tb;
      const b = g[k + 3] + (g[k + 6] - g[k + 3]) * tb;
      return a + (b - a) * tb;
    };
    const q2 = [bz(0), bz(1), bz(2)];
    const lo = this.segs[i * 2];
    for (let k = 0; k < 3; k++) {
      lo.from[k] = g[k];
      lo.from[3 + k] = g[k] + (g[3 + k] - g[k]) * tb;
      lo.from[6 + k] = q2[k];
    }
    const lenLo = Math.hypot(q2[0] - g[0], q2[1] - g[1], q2[2] - g[2]);
    this.slump(lo, rn, 0, tb, SLUMP_POINT, i === 0 ? PILE_H : 0.4 * PILE_H, g[0], g[2], lenLo, env);
    const up = this.segs[i * 2 + 1];
    up.mode = 2;
    up.age = 0;
    up.rn = rn;
    up.absorb = i !== 0;
    up.lump = i === 0 ? this.lumpR() : 0;
    up.u0 = tb;
    up.u1 = 1;
    up.ta = HANG_POINT;
    up.tb = 0;
    // 손끝(그 가닥의 끝점)에서 끊긴 끝까지 · 손끝 오프셋
    up.rel[0] = q2[0] - g[6];
    up.rel[1] = q2[1] - g[7];
    up.rel[2] = q2[2] - g[8];
    up.rel[3] = g[6] - this.tip[0];
    up.rel[4] = g[7] - this.tip[1];
    up.rel[5] = g[8] - this.tip[2];
  }

  /** 붙은 가닥 전부 주저앉음(놓기 · 묽음 끝) — 한 줄로 밑점 쪽에 접혀 내려앉는다(§6-4) */
  private dropAttached(env: StrandEnv): void {
    for (let i = 0; i < STRAND_N; i++) {
      if (!this.att[i]) continue;
      this.att[i] = false;
      const lo = this.segs[i * 2];
      const rn = this.strandGeom(i, env, lo.from);
      this.slump(lo, rn, 0, 1, 0, i === 0 ? PILE_H : 0.4 * PILE_H, this.base[0], this.base[2], this.len, env);
      lo.lump = i === 0 ? this.lumpR() : 0;
      this.segs[i * 2 + 1].mode = 0;
    }
  }

  /** 주저앉음 시작 — from은 채워져 있다. 밑점에서 들던 수평 방향으로 len × LIE_FRAC에 S자로 접혀 눕고, 더미가 같이 자란다 */
  private slump(s: Seg, rn: number, u0: number, u1: number, tb: number, vol: number,
    bx: number, bz: number, len: number, env: StrandEnv): void {
    const m = this.mix;
    s.mode = 3;
    s.age = 0;
    s.dur = SLUMP_RUNNY * m.runny + SLUMP_STIFF * m.stiff + SLUMP_WEB * m.web;
    s.rn = rn;
    s.lump = 0;
    s.u0 = u0;
    s.u1 = u1;
    s.ta = 0;
    s.tb = tb;
    s.vol = vol;
    s.added = 0;
    s.slump = true;
    let hx = this.tip[0] - this.base[0];
    let hz = this.tip[2] - this.base[2];
    const hl = Math.hypot(hx, hz);
    if (hl > 1e-3) {
      hx /= hl;
      hz /= hl;
    } else {
      hx = 0;
      hz = 1;
    }
    const coil = (hash(31, this.grabs) > 0.5 ? 1 : -1) * COIL;
    const t = s.to;
    t[0] = bx;
    t[2] = bz;
    t[6] = bx + hx * len * LIE_FRAC;
    t[8] = bz + hz * len * LIE_FRAC;
    clampR(t, 6);
    t[3] = (t[0] + t[6]) / 2 - hz * len * coil;
    t[5] = (t[2] + t[8]) / 2 + hx * len * coil;
    clampR(t, 3);
    for (let k = 0; k < 9; k += 3) t[k + 1] = env.surfaceY(t[k], t[k + 2]) + (k === 0 ? -rn : 0.3 * rn);
    // 더미 자리 = 접힌 가운데 — 반들 자국 · 접힘 방위는 지금 새로
    this.pile[0] = this.pile[2] > 1e-4 ? this.pile[0] : t[3];
    this.pile[1] = this.pile[2] > 1e-4 ? this.pile[1] : t[5];
    this.pile[5] = Math.atan2(hz, hx) + coil * 2;
  }

  /** 매달린 윗도막의 지금 점 — 0.15s에 길이 × 0.06까지 손끝 덩이로 말려 올라간다(곁가닥은 × 0.35까지 줄며 흡수) */
  private hangPoints(s: Seg, out: number[]): void {
    const tx = this.tip[0] + s.rel[3];
    const ty = this.tip[1] + s.rel[4];
    const tz = this.tip[2] + s.rel[5];
    const l0 = Math.hypot(s.rel[0], s.rel[1], s.rel[2]);
    // 말려 올라간 덩이도 길이를 덩이 지름 아래로 줄이지 않는다 — 6%까지 줄이면 납작한 원반 · 커피콩으로 떴다(r2 갓 밥준)
    const kMin = Math.min(1, Math.max(CURL_LEN, (2.2 * (s.lump + s.rn)) / Math.max(l0, 1e-6)));
    const k = s.absorb
      ? 1 - (1 - ABSORB_LEN) * smooth(0, 1, s.age / ABSORB_S)
      : 1 - (1 - kMin) * smooth(0, 1, s.age / CURL_S);
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

  /** 더미에 높이 dh를 보탠다 — 자리는 높이 무게 평균, 반들 자국은 새로 */
  private addPile(x: number, z: number, dh: number): void {
    if (!(dh > 0)) return;
    const p = this.pile;
    const w = dh / (p[2] + dh);
    p[0] += (x - p[0]) * w;
    p[1] += (z - p[1]) * w;
    p[2] = Math.min(PILE_MAX, p[2] + dh);
    this.pileAge = 0;
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
      const tb = strand === 0 ? this.tb : SPLIT_JOIN_U;
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
    if (s.mode === 3) {
      // 주저앉음은 더미가 같이 자란다(가닥이 녹아드는 동안 높이장이 받는다), 덩이 낙하는 닿은 뒤 한 번에
      const want = s.slump ? s.vol * smooth(0.3, 1, s.age / s.dur) : (s.age >= s.dur ? s.vol : 0);
      if (want > s.added) {
        this.addPile(s.to[3], s.to[5], want - s.added);
        s.added = want;
      }
      if (s.age > s.dur + (s.slump ? 0 : VANISH_S)) s.mode = 0;
    }
  }

  /** 도막 → uniform 배열 */
  private write(): void {
    let vis = false;
    for (let i = 0; i < SEG_N; i++) {
      const s = this.segs[i];
      const o = i * 4;
      let fadeR = 1;
      let fadeL = 1;
      let p = s.from;
      if (s.mode === 3) {
        const g = Math.min(1, s.age / s.dur);
        // 주저앉음 = 느린 접힘(처음 · 끝이 느리다), 덩이 낙하 = 중력 t²
        const e = s.slump ? g * g * (3 - 2 * g) : g * g;
        const q = this.g;
        for (let k = 0; k < 9; k++) q[k] = s.from[k] + (s.to[k] - s.from[k]) * e;
        p = q;
        // 주저앉음 끝 45% 동안 가닥은 옅어지고 그 몫은 더미(높이장)가 받는다 · 접히며 조금 굵어진다
        // 놓은 손끝 덩이는 떨어지며 옅어진다 — 띄운 덩이가 화면 위쪽에서 반죽까지 날아 내리는 원반으로 읽혔다(r1)
        fadeR = s.slump ? (1 - smooth(0.55 * s.dur, s.dur, s.age)) * (1 + 0.3 * e) : 1 - smooth(0.2 * s.dur, s.dur, s.age);
        fadeL = fadeR;
      } else if (s.mode === 2) {
        fadeR = s.absorb ? 1 - smooth(0, ABSORB_S, s.age) : 1 - 0.7 * smooth(0, CURL_S, s.age);
        fadeL = s.absorb ? 0 : 1;
      }
      const rn = s.mode === 0 ? 0 : s.rn * fadeR;
      if (rn > HIDE_R || (s.mode !== 0 && s.lump * fadeL > HIDE_R)) vis = true;
      this.A[o] = p[0];
      this.A[o + 1] = p[1];
      this.A[o + 2] = p[2];
      this.A[o + 3] = rn;
      this.B[o] = p[3];
      this.B[o + 1] = p[4];
      this.B[o + 2] = p[5];
      this.B[o + 3] = s.mode === 0 ? 0 : s.lump * fadeL;
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

// ── 기둥 질감(들기 v3) — 블렌더 결 맵(strand_detail.png)을 뺐다. 반죽 표면 알베도를 「늘인 좌표」에서 읽어 세로 결을 낸다:
//    둘레 = 각의 cos · sin(이음매 없음), 길이 = 거의 안 변함 → 표면 모틀이 기둥 길이 방향으로 늘어난 줄이 된다(UPQ94 9s 세로 결) ──
/** 늘어남 0~1 = smoothstep(이 둘, 주 가닥 길이) — 결 노멀이 함께 또렷해진다. 추정 — 실측 없음 */
const STRETCH_LO = 0.1 * D_W;
const STRETCH_HI = 0.8 * D_W;
/** 결 좌표 — 둘레 원 반경(fbm 도메인) · 길이 방향 변화량. 반경 2.2면 한 바퀴에 굵은 결 3~5줄. 추정 — 실측 없음 */
const GRAIN_C = 2.2;
const GRAIN_V = 0.5;
/** 결 노멀 세기 · 밝기 몫 — 추정 — 실측 없음 */
const GRAIN_N = 0.22;
const GRAIN_TONE = 0.05;
/** 세로 광(비등방 Ward) — 접선 쪽 폭 · 둘레 쪽 폭 · 세기. 반짝 점 · 흰 띠 금지라 약하게. 추정 — 실측 없음 */
const ANISO_T = 0.8;
const ANISO_B = 0.15;
const ANISO_GAIN = 0.5;
/** 덩이 윤곽 거칠기 — 되직 0.35(뭉툭한 덩이) ~ 그 밖 0.18. 추정 — 실측 없음(8uAT 52s 되직 덩이) */
const LUMP_ROUGH_STIFF = 0.35;
const LUMP_ROUGH = 0.18;

const STRAND_VERT = /* glsl */ `
attribute float aT;
attribute float aAng;
attribute float aSeg;
uniform vec4 uSA[${SEG_N}];
uniform vec4 uSB[${SEG_N}];
uniform vec4 uSC[${SEG_N}];
uniform vec4 uSD[${SEG_N}];
uniform float uNeck;
uniform float uStiff;
uniform float uRunny;
varying vec3 vN;
varying vec3 vSide;
varying vec3 vW;
varying float vU;
varying float vAng;
varying float vThin;
varying float vMain;
varying vec3 vT;
${FBM_GLSL}

// 반지름 윤곽 — 가닥 전체 위치 u(0 밑 ~ 1 끝): 짧은 밑동 나팔(넓은 밑자락은 반죽 높이장 둔덕 몫) → 끊는 자리 목 → 손끝 덩이 → 닫힌 끝.
// pinch = 끊기기 직전 목 조임(C.w, 주 가닥만) — 끊는 자리 tb(0.47~0.55) 둘레
float strandR(float u, float rn, float lump, float pinch) {
  float trumpet = 1.0 + 0.8 * (1.0 - smoothstep(0.0, 0.15, u));
  float body = mix(0.92, 1.15, smoothstep(0.22, 0.95, u));
  float prof = trumpet * body;
  prof *= 1.0 - pinch * smoothstep(0.3, 0.45, u) * (1.0 - smoothstep(0.58, 0.72, u));
  // 덩이 — 되직은 위 30%에 둥글고 뭉툭하게, 묽음은 위 60%에 걸쳐 아래로 길게 흘러내린 꼴(되기를 덩이로 읽는다, S5)
  float knob = lump * smoothstep(mix(0.5, 0.15, uRunny), mix(0.88, 0.97, uRunny), u);
  float c = clamp((1.0 - u) / mix(0.2, 0.1, uRunny), 0.0, 1.0);
  return (rn * prof + knob) * sqrt(c * (2.0 - c));
}

// 도막 안 위치 t의 반지름 — 윤곽 × 끊긴 끝 뾰족(시작 · 끝 쪽 D.z · D.w 길이에 걸쳐 0으로)
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
  // 덩이 윤곽은 거칠게 — 매끈한 공 · 버섯 갓 금지. 각의 cos · sin으로 읽어 이음매가 없다
  float lumpK = B.w > 1e-5 ? smoothstep(0.55, 0.85, u) : 0.0;
  r *= 1.0 + mix(${LUMP_ROUGH}, ${LUMP_ROUGH_STIFF}, uStiff) * (1.0 - 0.7 * uRunny) * lumpK
    * fbm(vec2(1.7 * cos(aAng) + 5.0 * u + aSeg * 3.1, 1.7 * sin(aAng) + 3.0 * u));
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
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}
`;

export const STRAND_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uSpecStr;
uniform float uWet;
uniform float uSlopeAspect;
uniform float uLen;
varying vec3 vN;
varying vec3 vSide;
varying vec3 vW;
varying float vU;
varying float vAng;
varying float vThin;
varying float vMain;
varying vec3 vT;
${FBM_GLSL}
${DOUGH_ALBEDO}
${DOUGH_SHADE}
// 늘인 결 좌표 — 둘레는 원(이음매 없음), 길이로는 조금만 움직인다
vec2 grainQ(float ang, float u) {
  return vec2(${GRAIN_C.toFixed(2)} * cos(ang) + 0.4 * u, ${GRAIN_C.toFixed(2)} * 0.7 * sin(ang) + ${GRAIN_V.toFixed(2)} * u);
}
void main() {
  // 위 끝 덩이(손끝)는 늘지 않은 반죽 — 월드 xz 알베도. 아래 기둥은 늘인 결 좌표(같은 DOUGH_ALBEDO, 색은 그대로)
  float lumpM = smoothstep(0.7, 0.9, vU);
  float tex = vMain * (1.0 - lumpM);
  float st = smoothstep(${STRETCH_LO}, ${STRETCH_HI}, uLen);
  vec2 xz = mix(grainQ(vAng, vU), vW.xz * uSlopeAspect, lumpM);
  float mott;
  vec3 base = doughAlbedo(xz, mott);
  vec3 n = normalize(vN);
  vec3 T = normalize(vT);
  if (tex > 0.0) {
    // 결 노멀 — 둘레로 각을 조금 옮긴 모틀 차(fbm 1회 더). 늘어날수록(st) 또렷
    vec3 side = normalize(vSide);
    vec3 circ = normalize(-side * sin(vAng) + cross(side, T) * (${STRAND_FLAT} * cos(vAng)));
    float m2 = fbm(grainQ(vAng + 0.06, vU) * 1.4 + 11.0);
    n = normalize(n + circ * ((m2 - mott) / 0.06 * ${GRAIN_N} * mix(0.4, 1.0, st) * tex));
    base *= 1.0 + ${GRAIN_TONE} * mott * tex;
  }
  // 아래 15%는 표면 노멀로 — 빨대 꽂힌 꼴 금지(§6-13)
  float low = smoothstep(0.0, 0.15, vU);
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), 1.0 - low));
  // 가늘수록 조금 밝고 광이 넓다(L8 kib6 연노랑 윤기). 광 +0.35 · 밝기 +0.06은 추정 — 실측 없음
  float ndl;
  vec3 col = doughShade(n, base, xz, min(1.0, uWet + 0.35 * vThin), 0.0, ndl);
  col *= 1.0 + 0.06 * vThin;
  if (tex * low > 0.0) {
    // 세로 광 — 늘어난 면의 긴 하이라이트(비등방 Ward: 접선 쪽 넓고 둘레 쪽 좁다). 결 노멀을 따라 휘어 한 줄 흰 띠가 되지 않는다
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

/** 가닥 메시 — 한 draw call. 반죽 머티리얼의 uniform 객체(uColor · uSpecStr · uWet · uSlopeAspect)를 같은 객체로 공유한다 */
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
        uNeck: { value: 0 },
        uStiff: { value: 0 },
        uRunny: { value: 0 },
        uLen: { value: 0 },
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
    u.uNeck.value = this.rig.neck;
    u.uStiff.value = this.rig.stiff;
    u.uRunny.value = this.rig.runny();
    u.uLen.value = this.rig.len;
    this.mesh.visible = show && this.rig.visible;
  }
}
