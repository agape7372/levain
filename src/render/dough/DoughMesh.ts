// 반죽 메시 — 상태 uniform + 촉감 상태기(grab 점탄성·젓기 시어장·탭 덴트·슬로싱).
// RenderParams(순수 매핑 결과)를 받아 uniform·스케일을 구동한다. sim을 모른다.
// 반유동체 개편(2026-08-24): 초타원체 실루엣·감쇠 진동자 슬로싱·점성 기억.
// 축 개편(2026-08-25): 구 liquidity 1축이 형상과 물성을 동시에 몰던 것을 4축으로 쪼갰다 —
// levelness(형상) / fluidity(흐름: 슬로싱 ζ·poke 아묾) / cohesion(응집: 실 능선 기억) /
// elasticity(되돌아옴: poke 스프링·grab ζ). 한 축으로 되돌리지 말 것.
// 반죽 모델 v2(2026-11-19): 초타원체(IcosahedronGeometry) → 「병 채움」 매개 메시. 옆벽은 유리에 붙은 원기둥,
// 바닥은 y=0에 평평, 윗면이 하이트필드다(dough.vert.glsl 머리 주석). 높이는 RenderParams.height(월드)를
// uniform으로 받고, mesh.scale.y는 숨쉬기만 맡는다 — 바닥 피벗이 y=0이라 숨이 바닥을 움직이지 않는다.
import * as THREE from 'three';
import vert from './dough.vert.glsl?raw';
import frag from './dough.frag.glsl?raw';
import type { RenderParams } from '../renderParams';
import { BubbleSystem, DYN_SLOTS } from '../bubbles';
import { createFillGeometry, FILL_RADIUS, HOOCH_COVER, JAR_HEIGHT, MARBLE_GLSL, SURF_TILT } from '../jar';
import {
  CELL_BUBBLE, D_W, DOUGH_ALBEDO, DOUGH_SHADE, FBM_GLSL, MOUND_D, MOUND_HMAX, SPINE_N, StrandRig, fbm2, strandMix,
  type StrandBreak, type StrandEnv,
} from './StrandMesh';

export const XZ_SCALE = 1.3; // 월드→오브젝트 XZ 변환에 입력층이 사용 (월드 XZ = 오브젝트 XZ × XZ_SCALE)
/** 옆벽 반경(오브젝트) — 유리 안쪽 FILL_RADIUS(0.912 월드) */
export const R_BODY = FILL_RADIUS / XZ_SCALE;
/** 메시 해상도 — 둘레 · 윗면 링 · 옆벽 행 (A1-04: 구 720 tri는 어깨가 각졌다) */
const SEG = 128;
const RINGS = 30;
const ROWS = 20;
/** 돔·크레이터 커널의 테두리 값 — vert의 exp(−c2·k·kR)에서 c2 = R_BODY²일 때 */
const DOME_RIM = Math.exp(-2.5 * 0.3844);
const CRATER_RIM = Math.exp(-2.0 * 0.3844);
/** 롱프레스 — 0.03까지 천천히 부풀고(τ), 떼면 easeOut 지수 감쇠(VISUAL §5) */
const HOLD_AMP = 0.03;
const HOLD_RISE_TAU = 0.6;
const HOLD_FALL_TAU = 0.3;
/** 하강 꺼짐 깊이(월드) — 가운데 기준, 테두리는 0(유리에 붙어 남는다). vert uSink 항과 같은 값 */
const SINK_DEPTH = 0.05;
/** 곰팡이 군락 수 — 확산(uMold)에 따라 1→5개가 드러난다(반점 1~2개 · 퍼짐 3~5개). 셰이더 uMoldA 길이와 같다(테스트가 잠근다) */
export const MOLD_N = 5;

/** 시드 → 0~1 난수열(mulberry32) — 곰팡이 군락 자리. 같은 시드면 같은 자리 */
function seededRandom(seed: number): () => number {
  let a = Math.floor(Math.abs(seed)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 젓기 v3(2026-11-19 손맛 3차) — 15점 고랑 자취 루프를 뺐다. 1.6.16은 정지 무늬 위에 C자 선을 긋는 꼴이라(고랑 실제 높이 ≈ 화면 1.4px,
//    폰에서 손가락 0.4D가 덮는다) 실물의 두 신호 — 덩어리가 통째로 돌고(S2) 지나간 넓은 자리가 다른 표면으로 남는다(S1) — 가 없었다.
//    이제 닫힌 식 셋: 손끝 패임(캡슐 하나) + 앞 둔덕(초승달 하나) + 반경 칸 소용돌이 상태(누적 각 Θ · 저은 넓이 M) ──
/** 반지름 칸 노드 수 — r = i/8 · R (i 0~8). 셰이더 uSwirl 길이와 같다(테스트가 잠근다) */
export const SWIRL_N = 9;
/** 접힌 주름 켬(1) · 끔(0) — 시안 비교용(2차: 1차 나선 굴곡 자리) */
export const STIR_FOLD: number = 1;
/** 저은 자리 기억 칸 — 무늬 도메인(q) 극좌표 반경 MEM_NR(r = i/6 · R) × 각 MEM_NA. uMem은 vec4 묶음(셰이더 배열 길이 = 칸 ÷ 4, 테스트가 잠근다) */
export const MEM_NR = 7;
export const MEM_NA = 16;
/** 오브젝트 단위 반죽 지름 D — 아래 크기는 전부 D 배수(폰 D ≈ 216 CSS px, 손가락 ≈ 0.4D) */
const D_O = D_W / XZ_SCALE;
/** 손끝 패임 깊이(월드) — 손끝(머리)에서 최대, 꼬리(τ 전 자리)로 갈수록 0.35배. 1.6.16 고랑 실제 높이 0.012의 약 3.5배 —
 *  폰 1배에서 패인 그늘이 손가락 뒤로 읽히는 값. 추정 — 실측 없음(8uAT 46~49s 주걱 뒤 구멍 0.25D만 봤다) */
const DENT_A = 0.042;
/** 패임 반폭(가우스 반경, 오브젝트) — 0.1D. 손가락 접촉 폭(0.18D) 남짓 */
const DENT_W = 0.1 * D_O;
/** 꼬리 = 손끝이 τ초 전에 있던 자리(지연). 되직 0.25s · 피크 0.18s · 묽음 0.1s — 추정 — 실측 없음 */
const TIP_TAU_THICK = 0.25;
const TIP_TAU_PEAK = 0.18;
const TIP_TAU_FLUID = 0.1;
/** 앞 둔덕(S2 · UPQ94 4s 숟가락 앞 둔덕 0.4~0.5D) — 머리 앞 0.2D에 초승달(옆으로 0.22D 반경 → 보이는 지름 ≈ 0.45D, 양끝이 뒤로 휜다).
 *  손가락(0.4D) 옆 · 앞으로 삐져나와 보이게. 높이 = 패임 × 1.25 × (0.4 + 0.6·되기). 추정 — 실측 없음(높이를 못 잰다) */
const BOW_AHEAD = 0.25 * D_O;
const BOW_LA = 0.12 * D_O;
const BOW_LC = 0.3 * D_O;
const BOW_CURVE = 0.9 / D_O;
/** 2차 1.25 → 1.9 · 폭 0.22D → 0.3D — 1차는 1배에서 손가락 옆으로 또렷하지 않았다 */
const BOW_GAIN = 1.9;
/** 되기별 패임 · 둔덕 몫 — 묽음(시큼)은 거의 없이 광 흐름 + 출렁(f). 0.12는 추정 */
const DENT_FLUID_K = 0.12;
/** 메워짐 τ(s) — 묽으면 빨리, 되직하면 늦게, 피크는 덜 메워진다(1.6.16 값 그대로) */
const FILL_TAU_THICK = 1.6;
const FILL_TAU_FLUID = 0.3;
const FILL_TAU_RIPE = 1.5;
/** 소용돌이(S2) — 노드 각속도 목표 = 손 각속도 × 몫 × 가우스(반경 차 ÷ 폭). 묽을수록 넓고(윗면 전체, 8uAT 112~114s) 많이 딸려 온다.
 *  폭 0.28R(되직) ~ 0.6R(묽음) · 몫 0.55 ~ 0.8 · 놓은 뒤 계속 도는 τ 0.2s ~ 0.9s — 추정 — 실측 없음 */
const SWIRL_W_THICK = 0.28;
const SWIRL_W_FLUID = 0.6;
const SWIRL_GAIN_THICK = 0.55;
const SWIRL_GAIN_FLUID = 0.8;
const SPIN_TAU_THICK = 0.2;
const SPIN_TAU_FLUID = 0.9;
const SPIN_RISE_TAU = 0.15;
/** 이웃 노드(R/8 간격) Θ 차 상한(rad) — 무늬가 반경 사이에서 늘어나는 정도의 상한. 추정 — 실측 없음 */
const SHEAR_MAX = 0.45;
/** 저은 넓이 기억(S1) — 손끝 반경 ± 0.4R(손가락 반폭 0.2D)은 다 차고 0.6R에서 0. 반경 0.55R 한 바퀴 = 1(윗면 60% 넘게).
 *  τ = 6s(묽음) ~ 10s(되직) → 10~30초에 돌아온다(피크는 기포가 다시 올라옴). 추정 — 실측 없음(UPQ94 2s→3s · 8-13s만 봤다) */
/** 2차: 각도까지 기억 — 손끝(재료 좌표 q)에서 0.22D 안은 다 차고 0.36D에서 0(손가락 0.4D 폭 + 밀린 자리). 반 바퀴면 반 고리만.
 *  τ 5s(묽음) ~ 12s(되직, 주름이 20~30초 남음) · 피크 8s(기포가 다시 올라옴). 추정 — 실측 없음 */
const MEM_IN = 0.22 * D_O;
const MEM_OUT = 0.36 * D_O;
const MEM_TAU_FLUID = 5;
const MEM_TAU_THICK = 12;
const MEM_TAU_PEAK = 8;
/** 나선 굴곡(d) — 높이(월드) × (0.5 + 0.5·되기) · 파장 0.25D. 낮게 — 그늘보다 광의 결로 읽히는 값. 추정 — 실측 없음 */
/** 접힌 주름(2차) — 높이(월드) 되직 0.045 · 피크 0.026 · 묽음 0.002, 간격(= 주름 하나 굵기) 0.11D, 휨 0.25D(±1줄 넘게).
 *  폰 1배(윗면 ≈ 146px)에서 주름 하나 ≈ 16px — 손가락 옆 · 뒤로 읽히는 굵기. 추정 — 실측 없음 */
const FOLD_A_THICK = 0.045;
const FOLD_A_PEAK = 0.026;
const FOLD_A_FLUID = 0.002;
const FOLD_L = 0.11 * D_O;
const FOLD_WARP = 0.25 * D_O;
/** 저은 자리 광 — 되직은 무광(0.15) · 피크 반들(0.7) · 묽음 0.6. 시큼 광 흐름(돌아간 q의 잔 광택 세기) 0.16. 추정 */
const MEM_GLOSS_THICK = 0.15;
const MEM_GLOSS_PEAK = 0.7;
const MEM_GLOSS_FLUID = 0.6;
const FLOW_GLINT = 0.45;
/** 시큼 출렁 — 젓기 출렁 목표 배율 · 상한(1차 5 · 0.6). fGJz 55~60s 수면이 크게 기울며 광이 흐른다. 추정 */
const SLOSH_GAIN = 9;
const SLOSH_MAX = 0.95;
/** 피크 꺼짐 보이기(e) — knock(0~KNOCK_MAX)가 꽉 차면 반죽 높이 7% ↓(렌더만 · 옆벽 수위선도 같이). τ20s라 30~60초에 돌아온다 */
const KNOCK_DROP = 0.07;
/** 손끝 지연 기록 길이 — 0.25s × 60Hz 넘게 */
const TIP_HIST = 40;
const STIR_IDLE_S = 0.08;    // (stir 전용) 마지막 입력 후 이 시간 지나면 '놓음' — grab은 pointerup 기준
/** 되기 정규화 — fluidity 0.1 이하 = 되직 1, 0.65 이상 = 묽음 0 (갓 밥준 0.22 → 0.78 · 시큼 0.66 → 0) */
const THICK_FLUID_LO = 0.1;
const THICK_FLUID_HI = 0.65;
/** 피크 젓기 꺼짐 — 젓는 거리(오브젝트) × ripe × 0.1이 쌓이고(상한 0.6) τ20s로 돌아온다. uSink에 더한다 */
const KNOCK_GAIN = 0.1;
const KNOCK_MAX = 0.6;
const KNOCK_TAU = 20;
/** 줄무늬 — 혼자 τ6s, 손으로 한 바퀴(경로 2π·0.55R)마다 ×0.38. 0.05 아래로 손이 떨어뜨리면 다 섞임 */
const MARBLE_TAU = 6;
const MARBLE_LOOP = 2 * Math.PI * 0.55 * R_BODY;
const MARBLE_PER_LOOP = 0.38;
const MARBLE_DONE = 0.05;
const MIX_GLINT = 0.25;      // 다 섞임 젖은 광 +0.25, τ1.5s
const MIX_GLINT_TAU = 1.5;
/** hooch 탁해짐 — 젓는 동안 τ1.8s로 오르고 τ5s로 가라앉는다. S7 uMsn 1:15.5→1:20~1:22.5 4.5~7s에 고른 베이지 */
const MURK_RISE_TAU = 1.8;
const MURK_FALL_TAU = 5;

/**
 * 젓기 v3 함수 — 버텍스(높이 x)와 프래그(기울기 yz · 손끝 젖음 w)가 이 소스 하나를 쓴다(규칙 8). 루프 0.
 * swirlAt = 반경 칸 노드(uSwirl: Θ 누적 각 · M 저은 넓이) 선형 보간 + 반경 미분. swirlQ = 무늬 도메인(반죽이 Θ만큼 돌았으니 거꾸로 돌려 읽는다).
 * stirField = 손끝 패임(꼬리 → 머리 캡슐) + 앞 둔덕(초승달) + 접힌 주름(저은 자리 기억 memAt 안에서만).
 * memAt = 재료 좌표 q의 극좌표 칸(uMem, 각도까지) 쌍선형 — 기억이 반죽과 같이 돈다.
 * 솟는 항(앞 둔덕 · 나선 마루)은 윗물 아래서 riseK()만큼 눌린다(§6-9). fbmG(해석적 FBM 기울기)도 여기 — vert는 높이만 써서 컴파일러가 버린다.
 * 앞에 SURF_TILT(hoochSpread) · FBM_GLSL(fbm)이 끼워져 있어야 한다.
 */
export const STIR_FIELD = /* glsl */ `
const float SWIRL_N1 = ${(SWIRL_N - 1).toFixed(1)};
const float DENT_W = ${DENT_W};
const float BOW_AHEAD = ${BOW_AHEAD};
const float BOW_LA = ${BOW_LA};
const float BOW_LC = ${BOW_LC};
const float BOW_CURVE = ${BOW_CURVE};
const float FOLD_L = ${FOLD_L};
const float FOLD_WARP = ${FOLD_WARP};
const int MEM_NR = ${MEM_NR};
const int MEM_NA = ${MEM_NA};
// 솟는 항 배율 — 윗물 덮인 반죽은 덜 솟는다(§6-9). 앞 둔덕 · 나선 마루 · 밑동 둔덕 · 더미가 같이 쓴다
float riseK() { return 1.0 - 0.85 * hoochSpread(uHooch); }
// 해석적 FBM 그라디언트 — sin·cos 도함수 체인 (유한차분 편향·매직 e 제거, §예산)
vec2 fbmG(vec2 p0) {
  mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
  mat2 J = mat2(1.52, -1.14, 1.14, 1.52); // 1.9R
  vec2 g = 0.6 * vec2(cos(p0.x) * cos(p0.y), -sin(p0.x) * sin(p0.y));
  vec2 p1 = R * p0 * 1.9 + 13.7;
  g += 0.3 * vec2(cos(p1.x) * cos(p1.y), -sin(p1.x) * sin(p1.y)) * J;
  vec2 p2 = R * p1 * 1.9 + 5.1;
  g += 0.15 * vec2(cos(p2.x) * cos(p2.y), -sin(p2.x) * sin(p2.y)) * (J * J);
  return g;
}
// 반경 r의 (Θ, M, dΘ/dr, dM/dr) — 노드 i = r/R · 8. 동적 첨자(WebGL2 = GLSL ES 3.00)라 루프가 없다
vec4 swirlAt(float r) {
  float x = clamp(r / uRBody, 0.0, 1.0) * SWIRL_N1;
  int i = min(int(x), ${SWIRL_N - 2});
  vec2 a = uSwirl[i];
  vec2 b = uSwirl[i + 1];
  return vec4(mix(a, b, x - float(i)), (b - a) * (SWIRL_N1 / uRBody));
}
// 무늬 도메인 — Rot(−Θ)·p. 반죽이 반경마다 Θ만큼 돌았으니 무늬는 Θ 전 자리에서 읽는다(점 · 모틀이 손을 따라 돈다)
vec2 swirlQ(vec2 p, float th) {
  float c = cos(th), s = sin(th);
  return vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
}
// 저은 자리 기억 칸 하나 — vec4 묶음에서 꺼낸다(동적 첨자, 텍스처 fetch 0)
float memNode(int i, int j) {
  int k = i * MEM_NA + j;
  vec4 v = uMem[k / 4];
  int c = k - (k / 4) * 4;
  return c == 0 ? v.x : (c == 1 ? v.y : (c == 2 ? v.z : v.w));
}
// 재료 좌표 q의 기억 0~1 — 반경 노드 i = r/R · (MEM_NR − 1), 각 노드 j = (atan/2π + 0.5) · MEM_NA(한 바퀴 돌아 이어진다)
float memAt(float r, vec2 q) {
  float x = clamp(r / uRBody, 0.0, 1.0) * float(MEM_NR - 1);
  int i = min(int(x), MEM_NR - 2);
  float y = (atan(q.y, q.x) * 0.159155 + 0.5) * float(MEM_NA);
  float fy = floor(y);
  int j = int(fy) - (int(fy) / MEM_NA) * MEM_NA;
  int j1 = j + 1 == MEM_NA ? 0 : j + 1;
  float tx = x - float(i);
  float ty = y - fy;
  return mix(mix(memNode(i, j), memNode(i, j1), ty), mix(memNode(i + 1, j), memNode(i + 1, j1), ty), tx);
}
// (높이 월드, 기울기 xz, 손끝 젖음 0~1). sw = swirlAt(|p|), q = swirlQ(p, sw.x), mem = memAt(|p|, q)
vec4 stirField(vec2 p, vec4 sw, vec2 q, float mem) {
  vec4 o = vec4(0.0);
  if (uTip.z + uTip.w > 1e-5) {
    // 손끝 패임 — 꼬리(τ초 전 손끝)에서 머리(지금 손끝)까지 캡슐. 머리 쪽이 깊고 꼬리 쪽이 얕다(손끝 뒤 패임이 조금 남는다, 8uAT 46~49s)
    vec2 tail = uTipB.zw;
    vec2 ab = uTip.xy - tail;
    float il2 = 1.0 / max(dot(ab, ab), 1e-6);
    float s = clamp(dot(p - tail, ab) * il2, 0.0, 1.0);
    vec2 d = p - tail - ab * s;
    float k = 1.0 / (DENT_W * DENT_W);
    float e = exp(-dot(d, d) * k);
    float dep = uTip.z * (0.35 + 0.65 * s);
    float inner = (s > 0.0 && s < 1.0) ? 1.0 : 0.0;
    o.x -= dep * e;
    o.yz -= e * (uTip.z * 0.65 * inner * ab * il2 - dep * 2.0 * k * d);
    o.w = e * (0.35 + 0.65 * s);
    // 앞 둔덕 — 머리 앞 BOW_AHEAD에 선 초승달(양끝이 뒤로 휜다 = 손가락 옆으로 삐져나온 더미)
    vec2 t = uTipB.xy;
    vec2 n = vec2(-t.y, t.x);
    vec2 h = p - uTip.xy;
    float c = dot(h, n);
    float b = dot(h, t) - BOW_AHEAD + BOW_CURVE * c * c;
    float eb = uTip.w * riseK() * exp(-b * b / (BOW_LA * BOW_LA) - c * c / (BOW_LC * BOW_LC));
    o.x += eb;
    // 갓 밀린 둔덕도 젖어 반들하다 — 밝은 마루(프래그 광 · 바늘구멍 지움)
    o.w = max(o.w, 0.8 * eb / max(uTip.w, 1e-5));
    o.yz -= eb * 2.0 * ((t + 2.0 * BOW_CURVE * c * n) * (b / (BOW_LA * BOW_LA)) + n * (c / (BOW_LC * BOW_LC)));
  }
  // 접힌 주름(2차, 8uAT 44~50s · UPQ94 2~6s) — 손이 지나간 자리(mem)에만 밧줄 같은 주름이 실제 높이로 남는다.
  // 단면 |sin| − 0.55 = 둥근 마루 · 날카로운 골(접힌 자국). 결은 반경 방향 간격 FOLD_L(0.11D)인데 돌아간 도메인 q의 fbm으로
  // ±1줄 넘게 휘고(과녁 · 레코드 동심원 금지) 다른 fbm으로 끊어 길이 · 굵기가 제각각인 토막만 남긴다. 휨 · 끊김이 q에서 읽혀 손을 따라 돈다.
  // 1차 나선(각 항)은 전단에 감겨 동심원이 됐고, 반경 고리 기억은 반 바퀴에도 고리 전체에 깔렸다 — 이제 각도까지 기억(uMem)
  if (uStirK.x > 1e-5 && mem > 0.004) {
    float r = max(length(p), 1e-4);
    float rq = r / uRBody;
    float m = uStirK.x * mem * smoothstep(0.12, 0.3, rq) * (1.0 - smoothstep(0.82, 0.96, rq));
    vec2 qk = q * 1.7;
    float f = fbm(qk);
    // r4: 휨 하나로는 뒤쪽에 긴 동심 호가 줄지었다 → 잔 휨(q·3.4, 0.45줄)을 더하고 끊김을 촘촘히(q·3.6)
    vec2 qj = q * 3.4 + 2.0;
    float f2 = fbm(qj);
    float brk = smoothstep(-0.05, 0.3, fbm(q * 3.6 + 9.0)) * (0.6 + 0.4 * smoothstep(-0.3, 0.3, f));
    float psi = (r + FOLD_WARP * f) / FOLD_L + 0.45 * f2;
    float sn = sin(3.14159 * psi);
    float prof = abs(sn) - 0.55;
    float amp = m * brk * (prof > 0.0 ? riseK() : 1.0); // 마루만 riseK — 윗물 아래선 덜 솟는다
    o.x += amp * prof;
    // ∇ψ = (p/r + WARP·∇f)/L, ∇f = Rot(Θ)·∇_q f(전단 항은 SHEAR_MAX 안이라 뺐다) · 끊김 fbm 기울기는 뺀다(부드러운 몫)
    vec2 g = fbmG(qk) * 1.7;
    float cs = cos(sw.x), si = sin(sw.x);
    vec2 gw = FOLD_WARP * g / FOLD_L + 0.45 * 3.4 * fbmG(qj);
    vec2 gp = p / (r * FOLD_L) + vec2(cs * gw.x - si * gw.y, si * gw.x + cs * gw.y);
    o.yz += amp * sign(sn) * 3.14159 * cos(3.14159 * psi) * gp;
  }
  return o;
}
`;
const POKE_K0 = 30;          // 탭 덴트 첨도 — 액체일수록 아물며 퍼진다 (하한 k0/3)

// ── 들기 튜닝 — 상태 물성 3종(grabMax·creepGain·returnZeta)은 RenderParams, 나머지는 grabTuning 오버라이드.
//    들리는 몸은 아래 GRAB_FIELD 꼬집기(떼어내기 v8)가 그린다 ──
const GRAB_DEFAULTS = {
  elasticTau: 0.07, // 끝점(손끝) 추종 τ(s) — 사용자 실기기 확정(2026-08-24). 직교 카메라라 끝이 손끝을 1:1로 따른다(L4a)
  creepDelay: 0.7,  // 버티면 짧아짐 — 잡은 지 이 시간 뒤부터 끊김 길이가 줄어든다 (§1-3)
  creepTau: 2.5,    // L4b 8uAT 1:24.0-1:26.7 피크 연결 약 2.5s (묽음은 ×1.2 = 3s, 8uAT 1:55.7-1:58.3)
  releaseTau: 1.2,  // 놓은 뒤 밑동 흔들림 잔류(creepGain 몫) 해소 τ(s)
  omega: 5.5,       // 밑동 둔덕 스프링 고유진동수 — 5.5가 무겁게 되돌아오는 반죽 (확정, ζ = grabReturnZeta)
};
// ── 떼어내기 v8(2026-11-21, 명세 .work/feel4/spec_v8.md · 바탕 v5 꼬집기) — 반죽 윗면 정점 자체를 잡은 점 쪽으로 오므리며 끌어올려
//    깔때기 → 섬유 기둥 → 손끝 면으로 잇는다(버텍스 마지막 단계). 무늬 · 기포는 원래 자리(vXZ)에서 읽혀 기둥에서 저절로 세로 결이 된다.
//    모양 함수는 pinchPos 하나 — 척추 17점(uSpine, v8b) 위에 단면을 감는다. 잡기 → 늘어남 → 그물 → 끊김 → 털썩 → 쌓임 → 녹음 내내 매개변수만 연속으로 바뀐다
//    (끊김 · 놓기 때 갈아 끼우는 분기 0). 남은 자리는 높이장 밧줄 겹(uPile) · 남은 혹(funnelLobes) ──
/** 깔때기 · 기둥 경계 — 잡은 점에서 깔때기 반경 S의 70% 안 정점이 기둥이 된다. 높이 몫 f = 1 − (s/sC)^1.5(꼭대기에 링을 몰아준다). 추정 */
const PINCH_UC = 0.7;
/** 꼬집기 노멀 앞 차분 간격(월드) — 정점 간격(0.02~0.045)의 절반 아래 */
const PINCH_FD = 0.008;
/** 들림 0.02D 넘는 곳만 기둥 재질 · 그물 구멍(frag) */
const PINCH_HOLE_LIFT = 0.02 * D_W;
/** 척추 몫 — 아래 몸 0~0.6875(점 0~11) · 그물 0.6875~0.9375(점 11~15, 높이 70~92% — 꼭대기 바로 밑, spec_v8c §1) · 위 몸 0.9375~1. StrandRig SPINE_N 17점과 짝 */
const PINCH_FA = 11 / 16;
const PINCH_FB = 15 / 16;
/** 꼭대기 면 — 높이 몫 f 0.88 위 정점이 손끝에 눌린 납작한 원판(반경 ∝ 원래 거리 — 무늬가 한 점으로 모이지 않는다, §2 꼭대기) */
const PINCH_TOP = 0.88;
/** 그물이 다 벌어졌을 때 머리 폭 ÷ 몸통 폭(spec_v8d §2). 추정 */
const PINCH_HEAD = 0.6;
/** 둔덕(깔때기) 높이가 손끝보다 τ0.16 늦게 따라온다(무게, 명세 ①) · 항복 뒤 × 0.7(②) — 목표에 한 번만 곱하고 τ로 내려앉는다(v6 §6) */
const MOUND_LAG_TAU = 0.16;
const YIELD_SAG = 0.7;
/** 버팀 동안 둔덕 배율(긴 기둥 몫 0일 때). 추정 */
const MOUND_HOLD = 0.35;
/** 착지 순간 반죽 전신 출렁 1회 — 슬로싱 속도항 충격(접힘 방향). 0.9는 추정 — 실측 없음 */
const LAND_KICK = 0.9;
/** 무늬 끌림 — 면적 보존 흡입(r_src² = r² + A·e^(−r²/R²)): 반경 쪽으로 늘고 둘레 쪽으로 줄어 점 · 모틀이 잡은 점을 향한 결이 된다.
 *  √A = 0.14D · R = 0.3D(v7 2회전 — 0.22D · 0.4D는 바늘구멍이 검은 방사 긁힘 · 벌레 다리로 읽혔다). 추정 — 실측 없음 */
const PULL_A2 = ((0.14 * D_W) / XZ_SCALE) ** 2;
const PULL_R2 = ((0.3 * D_W) / XZ_SCALE) ** 2;
/** 끌림 풀림 — 놓거나 끊기면 τ0.8s로 풀리고(1~3s), 최고치의 20%가 τ8s 흔적으로 남는다. 차오름 τ0.12s. 추정 */
const PULL_RISE_TAU = 0.12;
const PULL_FALL_TAU = 0.8;
const PULL_KEEP = 0.2;
const PULL_KEEP_TAU = 8;
/** 프래그 기울기 차분 간격(오브젝트) — 접힘 높이장 */
const LIFT_FD = 0.006;
/** 밑동 흔들림 — 끝점 수평 오프셋 × 0.15, 상한 0.1(오브젝트). 추정 — 실측 없음(측면 영상이 없다) */
const SWAY_GAIN = 0.15;
const SWAY_MAX = 0.1;
/** 휴면 · 곰팡이(기둥 없음) 깔때기 몫 — 추정 — 실측 없음(§6-2 「조금」) */
const NONE_MOUND = 0.2;
/** 잡기 확정 때 그 획의 고랑을 지우는 τ(s) — §6-12 */
const STROKE_CANCEL_TAU = 0.1;
/** 깔때기 높이 몫 — GRAB_FIELD funnelH의 CPU 짝(같은 식) */
export function funnelH(u: number): number {
  const k = (Math.sqrt(u * u + 0.04) - 0.2) / 0.8198;
  return (1 - k) * (1 - k);
}

/**
 * 들기 소스 — 버텍스(꼬집기 pinchApply · 접힘 높이 liftH)와 프래그(그물 구멍 netHole · 접힘 기울기 liftGrad · 무늬 도메인 liftQ)가 이 소스 하나를 쓴다(규칙 8).
 * STIR_FIELD(riseK · swirlQ) · FBM_GLSL 뒤에 끼운다.
 */
export const GRAB_FIELD = /* glsl */ `
const float PULL_A2 = ${PULL_A2};
const float PULL_R2 = ${PULL_R2};
const float LIFT_FD = ${LIFT_FD};
const float PINCH_XZ = ${XZ_SCALE.toFixed(2)};
const float PINCH_UC = ${PINCH_UC.toFixed(2)};
const float PINCH_FD = ${PINCH_FD};
const float PINCH_HOLE_LIFT = ${PINCH_HOLE_LIFT};
const float PINCH_FR = ${(0.95 * FILL_RADIUS).toFixed(4)};
const float PINCH_D = ${D_W.toFixed(4)};
const float PINCH_FA = ${PINCH_FA.toFixed(4)};
const float PINCH_FB = ${PINCH_FB.toFixed(4)};
const float PINCH_TOP = ${PINCH_TOP.toFixed(2)};
const float PINCH_HEAD = ${PINCH_HEAD.toFixed(2)};
const float SPINE_N1 = ${(SPINE_N - 1).toFixed(1)};
uniform vec4 uPileB;  // 접힘 (방위 rad, 거침 0~1(되직), 무늬 이완 0~1(털썩 · 쌓임), 녹음 0~1(혹 → 보조개))
uniform vec4 uSpine[${SPINE_N}]; // 척추 17점(몫 i/16) — xyz 월드, w 굵기 배율(털썩 때 혹 넓힘)
uniform vec4 uPinch;  // (몸통 반폭(월드), 밑동 가로 반폭(월드), 꼭대기 넓힘 배율, 혀 몫 0~1(묽음))
uniform vec4 uPinchB; // (깔때기 반경 S(월드), 그물 벌어짐 0~1, 끊김 움츠림 0~1(기둥이 아래 몸 끝까지 · 끊긴 가닥 다시 붙음), 비움)
uniform vec4 uPinchC; // (기둥 몫 0~1, 무늬 씨앗, 긴 기둥 몫 0(혹) ~ 1(기둥) — StrandRig가 길이 · 상태 · 털썩으로 잰다, 비움)
uniform vec4 uPinchD; // 가닥 넷 끊긴 지(s) — 안 끊김 −1
uniform vec4 uPinchE; // (남은 혹 몫 0~1, 밑동 깊이 배율, 움츠린 끝 몫(끊기면 점 11 · 되직 15 · 아니면 1), 몸 길이(월드))
uniform vec4 uPinchF; // 가닥 넷 지름(월드)
// 접힘 높이장 — 털썩 자리에 남는 낮은 보조개 겹(v8c 누운 밧줄은 지웠다 — 이 높이장만 남는다): 누운 방향으로 길쭉한 능선(살짝 휨) + 마루 2~3. 되직은 거칠게. 동심 · 소용돌이 0
float liftH(vec2 p) {
  float h = 0.0;
  if (uPile.z > 1e-5) {
    vec2 e = p - uPile.xy;
    vec2 ad = vec2(cos(uPileB.x), sin(uPileB.x));
    float al = dot(e, ad) / uPile.w;
    float j = fbm(e / uPile.w * 2.2 + uPileB.x * 1.7);
    float ac = (dot(e, vec2(-ad.y, ad.x)) / uPile.w - 0.08 * al * al + 0.12 * j) / (0.75 + 0.1 * uPileB.y); // 둥근 무더기(가는 능선 = 쉼표 · 씨앗 · 벌레, 새 눈 r1)
    // 밧줄처럼 접힌 혹 2~3(가운데 꼭지 하나 = 뾰루지 금지): 길이 따라 cos² 마루, 크기 제각각
    float cr = cos(al * 2.3 + 0.6 * j + 0.7);
    h += uPile.z * exp(-0.6 * al * al - 1.6 * ac * ac) * (0.35 + 0.65 * cr * cr + 0.3 * uPileB.y * j);
  }
  return h * riseK(); // 윗물 아래서 덜 솟는다(§6-9)
}
// 기울기 — 같은 함수의 앞 차분. 접힘이 있을 때만 부른다
vec2 liftGrad(vec2 p) {
  float h0 = liftH(p);
  return vec2(liftH(p + vec2(LIFT_FD, 0.0)) - h0, liftH(p + vec2(0.0, LIFT_FD)) - h0) / LIFT_FD;
}
// 무늬 도메인 — 젓기 회전(swirlQ) 뒤에 끌림을 한 번 더: 잡은 점 쪽 면적 보존 흡입(반경으로 늘어난 결).
// 잡은 점도 같은 Θ로 돌려 같은 틀에서 잰다
vec2 liftQ(vec2 q, float th) {
  if (uGrab.z > 1e-4) {
    vec2 d = q - swirlQ(uGrabPos, th);
    float r2 = max(dot(d, d), 1e-8);
    q += d * (sqrt(1.0 + uGrab.z * PULL_A2 * exp(-r2 / PULL_R2) / r2) - 1.0);
  }
  return q;
}
vec3 pinchXYZ(vec2 xz, float y) { return vec3(xz.x, y, xz.y); }
// 남은 혹 — 막이 풀린 뒤 깔때기 높이는 접힌 밧줄 혹 2~3개 — 누운 방향(uPileB.x)을 따라 줄지어(크기 · 간격 제각각)
float lobe(vec2 d, float S, float r, float a) {
  vec2 e = d - r * S * vec2(cos(a), sin(a));
  return exp(-dot(e, e) / (0.06 * S * S));
}
float funnelLobes(vec2 d, float S) {
  // 혹 셋(루프 대신 펼침 — 셰이더 루프는 범프 · 고랑 · 곰팡이 배열 전용, tests/doughSurface R-L3)
  float a = uPileB.x + 0.3 * (fract(uPinchC.y * 0.37) - 0.5);
  float h = lobe(d, S, 0.08, a + 0.5) + 0.8 * lobe(d, S, 0.36, a - 0.15) + 0.55 * lobe(d, S, 0.6, a + 0.25);
  float u2 = dot(d, d) / (S * S);
  return min(h, 1.0) * (1.0 - u2) * (1.0 - u2);
}
// 깔때기 높이 몫(반경 몫 u 0~1) — 오목한 (1 − u)²에 가운데만 둥글게(반경 0.2S). 밖(u = 1)에서 C1. CPU 짝 = DoughMesh funnelH
float funnelH(float u) {
  float k = (sqrt(u * u + 0.04) - 0.2) / 0.8198;
  return (1.0 - k) * (1.0 - k);
}
// 둔덕 높이 몫(잡은 점에서 d) — 깔때기 funnelH가 풀리며 남은 혹(funnelLobes)으로. 기둥 · 깔때기 고리 · 밖이 같은 식을 써야
// 기둥 몫이 꺼질 때 혹이 몇 프레임에 솟지 않는다(v8 r2 release 2.90)
float moundH(vec2 d, float S) {
  if (dot(d, d) >= S * S) return 0.0;
  float h = funnelH(length(d) / S);
  return uPinchE.x > 1e-3 ? mix(h, funnelLobes(d, S), uPinchE.x) : h;
}
// 척추 한 점(Catmull-Rom, 몫 fs 0~1) — xyz 월드 · w 굵기 배율, tg = d/dfs. 끊긴 위 몸 점은 아래 몸 굽힘에 이어 붙어 있다(StrandRig bendSpine)
vec4 spineAt(float fs, out vec3 tg) {
  float u = clamp(fs, 0.0, 1.0) * SPINE_N1;
  int i = int(min(floor(u), SPINE_N1 - 1.0));
  float t = u - float(i);
  vec4 p1 = uSpine[i];
  vec4 p2 = uSpine[i + 1];
  vec4 p0 = i > 0 ? uSpine[max(i - 1, 0)] : 2.0 * p1 - p2;
  vec4 p3 = i + 2 <= ${SPINE_N - 1} ? uSpine[min(i + 2, ${SPINE_N - 1})] : 2.0 * p2 - p1;
  vec4 a = 2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3;
  vec4 b = 3.0 * (p1 - p2) + p3 - p0;
  vec4 c = p2 - p0;
  tg = SPINE_N1 * 0.5 * (c.xyz + (2.0 * a.xyz + 3.0 * b.xyz * t) * t);
  return p1 + 0.5 * t * (c + t * (a + t * b));
}
// 가닥 넷(spec_v8b §2 그물) — 방위 ≈ 26° · 92° · 158° · 264°(xz 평면, +z = 화면 앞, 조금씩 틀어짐). 앞에서 보이는 셋이 화면 가로
// 0.9 · −0.03 · −0.92 — 구멍이 고르게 3px 넘게 열린다(0.88 · −0.18 · −0.97은 왼쪽 구멍이 1~2px 홈이었다, v8c 1회전). 굵은 가닥(1)이 앞 가운데, 뒤 가닥(3)은 숨는다.
// 15° · 110° · 205° · 290°는 바깥 둘이 대칭으로 서고 가운데가 가는 실이라 「바지 두 다리 + 가운데 실」이었다(v8b r3 2.13~2.43).
// 원래 방위 dir에서 가장 가까운 가닥 k · 부호 있는 각거리 sa(반시계 +) · 가닥 가운데 방위 ak
float pick4(vec4 v, float k) { return k < 0.5 ? v.x : k < 1.5 ? v.y : k < 2.5 ? v.z : v.w; }
float strandNear(vec2 dir, out float sa, out vec2 ak) {
  vec4 A = vec4(0.45, 1.6, 2.75, 4.6) + 0.2 * (fract(uPinchC.y * vec4(0.37, 0.53, 0.71, 0.89)) - 0.5);
  vec4 c = cos(A) * dir.x + sin(A) * dir.y;
  float k = 0.0;
  float m = c.x;
  if (c.y > m) { k = 1.0; m = c.y; }
  if (c.z > m) { k = 2.0; m = c.z; }
  if (c.w > m) { k = 3.0; m = c.w; }
  float a = pick4(A, k);
  ak = vec2(cos(a), sin(a));
  sa = atan(ak.x * dir.y - ak.y * dir.x, dot(ak, dir));
  return k;
}
// 가닥 k가 끊기는 그물 몫 0.76~0.82(꼭대기 바로 밑) — 끊긴 높이를 고르게(0.72~0.85는 아래 토막이 들쭉날쭉한 왕관 · 삼지창, v8c 1회전 2.47)
float strandCutG(float k) { return 0.76 + 0.06 * fract(uPinchC.y * 1.37 + k * 0.618); }
// 가닥 열림 0(통짜 몸) ~ 1(가닥 굵기만 남은 관) — 그물 몫 g. 구멍은 높이 72~88%에서 열리고 93% 위 · 70% 아래에선 닫힌다(spec_v8c §1 70~92%).
// 끊긴 가닥은 0.08s에 다 열린다(위 · 아래 토막이 둥근 끝 관으로). 아래 몸 끝이 닫히면(uPinchB.z) 다시 통짜로
float strandOpen(float g, float k) {
  if (g <= 0.0 || g >= 1.0) return 0.0;
  float age = pick4(uPinchD, k);
  float h = fract(uPinchC.y * 2.17 + k * 0.41);
  // 그물 벌어짐 절반쯤에 다 열린다 — 반쯤 열린 구멍은 가닥 띠가 넓어 1~2px 세로 틈이었다(v8c 1회전 2.17~2.43)
  float sk = clamp(uPinchB.y * (2.0 + 0.6 * h) - 0.3 * h, 0.0, 1.0);
  float env = smoothstep(0.0, 0.12, g) * (1.0 - smoothstep(0.78, 0.97, g));
  float cut = age >= 0.0 ? smoothstep(0.0, 0.08, age) * smoothstep(0.0, 0.1, g) : 0.0;
  // 끊긴 뒤엔 아래 몸 끝 닫힘(uPinchB.z)을 따라 닫힌다 — 가닥 토막이 따로 서 있으면 삼지창 · 두 갈래 끝이었다(v8c 1회전 2.47~2.57).
  // 앞 절반(0 → 0.5)에 닫으면 1프레임에 그물 + 머리가 매끈한 총알 기둥으로 바뀌었다(v8d 1회전 2.57 → 2.60) — 움츠림 거의 끝까지 고르게
  return max(sk * env, cut) * (1.0 - smoothstep(0.0, 0.9, uPinchB.z));
}
// 가닥 k의 반각(rad) — 열림 op에서. 1.25 = 통짜(구멍 0 — 가장 넓은 반간격 ≈1.2보다 커야 op가 0을 막 넘는 프레임에 구멍이 툭 나지 않는다),
// 1 = 가닥 지름만큼. R = 몸 반지름
float strandHalf(float op, float k, float R) { return mix(1.25, 0.5 * pick4(uPinchF, k) / max(R, 1e-4), op); }
// 그물 구멍(§2) — 그물 몫 g의 가닥 사이가 비었나(frag discard). 버텍스 pinchPos의 관 사상과 같은 반각
bool netHole(float g, vec2 dir, float R) {
  if (g <= 0.0 || g >= 1.0) return false;
  float sa;
  vec2 ak;
  float k = strandNear(dir, sa, ak);
  float op = strandOpen(g, k);
  return op > 1e-3 && abs(sa) > strandHalf(op, k, R);
}
// 단면 반폭(월드) — 척추 몫 fs(발 0 → 꼭대기 1), 원래 방위 dir → (가로, 깊이).
// 섬유 기둥(§2): 몸통 uPinch.x에 높이 따라 ±15% 굽이(위상 제각각) · 높이 40~65%가 가장 좁다(덩이 밑을 조이지 않는다).
// 발 = 밑동 uPinch.y로 오목하게 벌어진 깔때기, 꼭대기 = 몸통 × uPinch.z(처마 0). 짧을 땐(L < 0.45D) 낮고 넓은 혹(밑동 반폭 타원 — 코르크 · 병뚜껑 0, v8 r1 b)
vec2 pinchRad(float fs, vec2 dir) {
  float sd = uPinchC.y;
  // 굽이 ±10% · 가장 좁은 곳 −3% — 꼭대기 쪽(0.7~0.9)은 굽이를 끈다: 머리 ÷ 목 ≤ 1.15(면봉 · 성냥 머리 0, v8 r1 검수 ②)
  float L = uPinchE.w;
  // 짧은 기둥(0.6D 아래)은 굽이를 끈다 — 0.25D 기둥에 굽이가 겹쳐 쌓인 고리 · 버섯 대였다(v8c 2회전 a justfed)
  float wav = ((0.1 * (0.6 * sin(fs * 8.2 + sd * 3.1) + 0.4 * sin(fs * 15.1 + sd * 5.3))) * (1.0 - smoothstep(0.7, 0.9, fs))
    - 0.03 * exp(-(fs - 0.52) * (fs - 0.52) / 0.02)) * smoothstep(0.3 * PINCH_D, 0.6 * PINCH_D, L);
  // 몸통은 0.16D(반폭 0.08D) 아래로 안 내려간다(몸통 반폭이 그보다 작게 주어지면 그 값)
  float W = max(uPinch.x * (1.0 + wav * (1.0 - 0.6 * uPinch.w)), min(uPinch.x, 0.08 * PINCH_D));
  // 짧은 기둥(되직 · 이른 버팀)은 밑동 → 몸통 이음을 길게(0.5) — 원통 옆면이 코르크 · 문 손잡이 목으로 읽혔다(v8 r1 검수 ⑤)
  float t = min(fs / mix(0.5, 0.22, smoothstep(0.3 * PINCH_D, 0.6 * PINCH_D, L)), 1.0);
  vec2 X0 = vec2(uPinch.y, uPinch.y * uPinchE.y);
  vec2 r = vec2(W) + (X0 - vec2(W)) * (1.0 - t) * (1.0 - t);
  r *= 1.0 + (uPinch.z - 1.0) * smoothstep(0.82, 1.0, fs);
  // 머리 미리 줄임(spec_v8d §2) — 그물이 벌어지는 동안 그물 위쪽 반 · 머리가 몸통의 PINCH_HEAD배로 모인다(가닥이 손끝 쪽으로 묶임).
  // 구멍 위(몫 0.86~)부터 꼭대기까지 연속 — 그물 가운데부터 줄이면 구멍 위쪽이 1~2px로 좁아졌다(v8d a). 머리만 가닥 굵기로 줄이면
  // 바늘 · 화살촉 첨탑이었다(v8c 1회전). 끊긴 뒤에도 그대로(움츠림 동안 교체 0)
  r *= 1.0 - (1.0 - PINCH_HEAD) * smoothstep(0.3, 1.0, uPinchB.y) * smoothstep(0.86, 1.0, fs);
  // 짧을 땐 종 꼴 혹 — 반폭 X0(1 − fn) · 높이는 pinchPos가 smoothstep으로(밑 · 꼭대기 기울기 0). 옛 X0·√(1 − fs²)는 가장자리가
  // 서서 0.88 → 0.92에 테 두른 판(계란 흰자)이 한 프레임에 솟았다(spec_v8b §5).
  // fs는 움츠리기 전 몫(pinchPos fsN) — 끊긴 아래 몸이 주저앉아도 같은 혹(spec_v8c §2). 주저앉는 동안(무늬 이완 uPileB.z) 윗부분이
  // 방위 fbm으로 울퉁불퉁 — 기운 쪽으로 치우친 둥근 언덕에 작은 혹 1~2
  float fn = fs;
  // 반폭 X0·√(1 − fn) — 밑은 반폭이 곧게 줄고 높이는 smoothstep이라 기울기 0(테 0), 꼭대기는 둥근 돔(세로 접선).
  // (1 − fn)(1 + 0.8fn)은 꼭대기가 기둥보다 좁아 섞는 동안 어깨 위 꼭지 — 키세스 · 압정 · 병아리 머리였다(v8c 1회전 1.03 · 3.00 · justfed)
  // (반폭을 몸통 폭부터 키우면 깔때기가 원래 자리에서 반경으로 2~3배 늘어 둘레 표면 잡음이 햇살 테 · 꽃잎이었다(v8d 2회전 a) — 반폭은 밑동 그대로,
  //  좁은 꼴은 높이 몫(pinchPos fsN² — 둥근 언덕)이 맡는다)
  vec2 hump = X0 * sqrt(max(1.0 - fn, 0.0)) * (1.0 + 0.25 * uPileB.z * smoothstep(0.25, 0.8, fn) * fbm(dir * 1.7 + vec2(sd * 2.3, 0.7)));
  // 혹 → 기둥 사이(꼭대기 원판이 켜지기 전)는 기둥 몫 윗부분을 둥근 머리로 닫는다 — 열린 둘레가 납작한 꼭지혹이었다(spec_v8c §4)
  float lk = uPinchC.z;
  float dome = sqrt(max(1.0 - pow(max(fs - 0.7, 0.0) / 0.3, 2.0), 0.0));
  r = mix(hump, r * mix(dome, 1.0, smoothstep(0.3, 0.8, lk)), lk);
  // 병 안에 머물 가로 여유 — 벽 가까이 잡아도 0.05D는 남긴다(반폭 뒤집힘 0)
  vec2 F = uGrabPos * PINCH_XZ;
  float side = dir.x < 0.0 ? -1.0 : 1.0;
  float room = max(PINCH_FR * sqrt(max(1.0 - F.y * F.y / (PINCH_FR * PINCH_FR), 0.04)) - side * F.x, 0.05 * PINCH_D);
  float k0 = 0.8 * room; // 병 벽 앞 0.8까지는 그대로, 그 바깥만 부드럽게 눌린다
  if (r.x > k0) r.x = k0 + 0.2 * room * tanh(clamp((r.x - k0) / (0.2 * room), -8.0, 8.0));
  return max(r, vec2(0.0));
}
// 윗면 한 점(월드 xz w, 높이 y)의 꼬집힌 자리(월드). 잡은 점(uGrabPos)에서 s < S인 정점만:
//   깔때기(s ≥ 0.7S) = 높이 Hf·funnelH(실제 반경 몫)(밖에서 C1) · 밑동 단면에서 원래 자리로 풀리는 오므림(밖에서 C1)
//   기둥(s < 0.7S)   = 높이 몫 f = 1 − (s/0.7S)^1.5 → 척추 몫 fs = min(f/0.88, 1), 둘레 고리 = 단면 타원, 고리는 척추 접선에 수직.
//                      f > 0.88은 꼭대기 면(원판). 그물 · 가닥 끊김 · 털썩 · 쌓임은 모두 같은 식의 매개변수다.
// fo = 높이 몫 f(깔때기 · 밖 −1) · cutF = 끊긴 가닥 (아래 조각, 위 조각) 표지 — 프래그가 둘에 걸친 세모를 버린다
vec3 pinchPos(vec2 w, float y, out float fo, out vec2 cutF) {
  fo = -1.0;
  cutF = vec2(0.0);
  vec2 F = uGrabPos * PINCH_XZ;
  vec2 d = w - F;
  float s = length(d);
  float S = uPinchB.x;
  if (s >= S) return pinchXYZ(w, y);
  float u = s / S;
  float Hf = uGrab.x * riseK();
  float hp = moundH(d, S);
  vec3 Xf = pinchXYZ(w, y + Hf * hp);
  float kc = uPinchC.x;
  if (kc < 1e-4) return Xf;
  vec2 dir = s > 1e-6 ? d / s : vec2(1.0, 0.0);
  float sC = S * PINCH_UC;
  vec3 P0 = pinchXYZ(F, y + Hf);
  vec3 X1;
  float up = 0.0;
  if (s >= sC) {
    // 깔때기 = 밑동 단면(축마다 반폭 rad0)에서 원래 자리(반경 S)로. 축마다 단조 사상 r = S − (S − rad0)(1 − v^q), q = (S − sC)/(S − rad0) —
    // 밖(v = 1)에서 기울기 1(C1), 접힘 · 뒷면 · 어두운 틈 0
    float v = (s - sC) / (S - sC);
    vec2 rad0 = min(pinchRad(0.0, dir), vec2(S - 0.04 * PINCH_D));
    vec2 q = (S - sC) / (S - rad0);
    vec2 rm = dir * (S - (S - rad0) * (1.0 - pow(vec2(v), q)));
    X1 = pinchXYZ(F + rm, y + Hf * moundH(rm, S));
  } else {
    float f = 1.0 - pow(s / sC, 1.5);
    fo = f;
    float sd = uPinchC.y;
    float L = uPinchE.w;
    // 짧은 혹은 꼭대기 원판 없이 f를 그대로 척추 몫으로 — 원판(f > 0.88)을 반폭 0인 꼭지 한 점에 모으면 뾰족한 산봉우리였다(v8b r3 0.97~1.13)
    float lk = uPinchC.z;
    // 꼭대기 원판 · 모깎기 · 요철은 기둥이 꽤 길어진 뒤에만(lkc) — 반쯤 긴 혹(lk 0.1~0.4)에 얹으면 넓은 혹 위 작은 꼭지혹이었다(spec_v8c §4, v8b r4 1.03~1.13)
    float lkc = smoothstep(0.3, 0.8, lk);
    float fs = mix(f, min(f / PINCH_TOP, 1.0), lkc);
    // 가닥 끊김(spec_v8b §2) — 먼저 끊긴 가는 가닥의 위 토막은 꼭대기 쪽으로 오그라들고, 아래 토막은 그물 밑으로 처진다.
    // 토막 끝은 가닥 굵기 그대로 둥글고 뭉툭하다(endC — 붓끝 · 휘핑 끝 · 바늘 0)
    float gO = (fs - PINCH_FA) / (PINCH_FB - PINCH_FA); // 원래 그물 몫(구멍 · 관 사상 — frag와 같은 값)
    float g0 = gO;
    float sa;
    vec2 ak;
    float k = strandNear(dir, sa, ak);
    float age = pick4(uPinchD, k);
    float legR = 0.5 * pick4(uPinchF, k);
    float endC = 1.0;
    float cutA = uPinchE.z; // 손에서 떨어진 기둥이 움츠러드는 끝 몫(그물 점 11 · 되직 점 15, 안 끊김 1)
    float rj = smoothstep(0.0, 0.9, uPinchB.z); // 손에서 떨어지면 끊겼던 가닥 토막이 다시 몸으로 붙는다(구멍이 닫히는 몫과 같다)
    if (age >= 0.0 && g0 > 0.0 && g0 < 1.0) {
      float gc = strandCutG(k);
      float rg = max(legR / max(L * (PINCH_FB - PINCH_FA), 1e-3), 0.02); // 가닥 반지름(그물 몫)
      if (g0 > gc) {
        up = 1.0;
        float gE = mix(gc, 1.0, smoothstep(0.0, 0.12, age));
        endC = clamp((g0 - gE) / rg, 0.0, 1.0);
        g0 = max(g0, gE);
      } else {
        float gA = (cutA - PINCH_FA) / (PINCH_FB - PINCH_FA);
        // 0.2s smoothstep으로 처진다 — 0.07s는 그물 몫이 한 프레임에 꺼졌다(v8c 1회전 2.43 → 2.47). 토막은 구멍이 닫히며(strandOpen) 한 끝으로 모인다.
        // 기둥이 아직 붙어 있어도(먼저 끊긴 가는 가닥) 그물 밑(몫 0.1)까지 처져 몸에 붙는다 — 끊긴 높이에 서 있으면 양옆 뿔 · 삼지창이었다(v8d 2회전 a 2.40~2.53)
        float gE = mix(gc, min(gA, 0.1), smoothstep(0.0, 0.2, age));
        endC = clamp((gE - g0) / rg, 0.0, 1.0);
        g0 = min(g0, gE);
      }
      // 손에서 떨어지면(uPinchB.z) 토막이 제자리로 돌아와 붙는다 — 다 붙은 뒤(rj 1)엔 걸친 세모가 제 크기라 표지를 끈다
      g0 = mix(g0, gO, rj);
      endC = mix(endC, 1.0, rj);
      fs = PINCH_FA + g0 * (PINCH_FB - PINCH_FA);
      cutF = up > 0.5 ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
    }
    // 마지막 굵은 가닥이 끊기면(손에서 떨어짐) 기둥 전체가 꼭대기째 아래 몸 끝(cutA)까지 고르게 움츠러든다(uPinchB.z 0.22s).
    // 꼭대기 원판이 그대로 둥근 끝이 된다 — 끊긴 위 조각을 손끝 자리에서 줄이면 공중에 뜬 알약 · 점이었고(v8b r3), 0.07s에 줄이면
    // 위 58px이 한 프레임에 사라졌다(v8c 1회전 2.43 → 2.47). 아래 토막 끝을 따로 닫으면 왕관 · 삼지창 · 두 갈래 끝이었다(2.47~2.57)
    // 모양(단면 · 둥근 머리 · 발 둔덕 이음)은 움츠리기 전 몫 fsN으로 잰다 — 움츠린 몫으로 재면 머리 둥글기(dome) · 넓힘이 꺼지고
    // 발 둔덕 이음 (1 − fs)²가 꼭대기에 남아 끊긴 뒤 납작 머리 그루터기 → 분화구 · 과녁 고리였다(v8c 2회전 peak 2.80~3.43). 안 끊김 · 놓기는 fsN = fs
    float fsN = fs;
    float cutE = mix(1.0, cutA, uPinchB.z); // 지금 아래 몸 끝 몫(움츠림 따라 1 → cutA)
    fs *= cutE;
    // 짧을 땐 종 꼴 — 척추 몫을 fsN²로 읽는다: 반폭 √(1 − fsN)과 짝이라 높이 = (1 − ρ²)²(둥근 언덕 — 밑 · 꼭대기 기울기 0, 테 0).
    // smoothstep으로 읽으면 꼭대기 0.6~1이 거의 같은 높이라 윗면이 평평한 판 · 렌즈였다(v8d 1회전 sour 1.17~2.4 · justfed 0.93). 끊긴 뒤엔 아래 몸 끝(cutA)까지
    float fsC = mix(cutA * fsN * fsN, fs, lk);
    vec3 tg;
    vec4 C = spineAt(fsC, tg);
    // 발 맞춤 — 척추 발(상태기 밑점)을 이 정점의 발(깔때기 위 P0)로, 꼭대기로 갈수록 0(꼭대기 = 손끝 그대로).
    // 혹(lk 0)은 통째로 둔덕 위에 얹는다 — 발만 올리면 넓은 둔덕 위 꼭대기만 솟은 꼭지혹이었다(v8c 2회전 peak 1.07~1.13, spec_v8d §5)
    // 손에서 떨어지면(남은 혹 몫 uPinchE.x, τ0.2) 옛 식으로 — 주저앉는 혹 · 녹음은 그대로(release 2.53~2.87 회귀 0)
    // 높이 몫은 발 고리 근처(fsN 0.3 아래)만 — 정점마다 다른 표면 잡음 · 고랑 높이가 기둥 몸에 실리면 오므린 자리에서 고리가 위아래로 엇갈려
    // 밑동 톱니 테 · 치마 주름이었다(v8d 1회전 justfed 0.97~1.17)
    vec3 dP = P0 - uSpine[0].xyz;
    C.xz += dP.xz * mix(1.0, 1.0 - fsN, max(lk, uPinchE.x));
    C.y += dP.y * (1.0 - smoothstep(0.0, 0.3, fsN));
    float tl = length(tg);
    tg = tl > 1e-5 ? tg / tl : vec3(0.0, 1.0, 0.0);
    // 발 고리는 수평(깔때기 안쪽 끝과 같은 자리). 혹(긴 기둥 몫 lk 0)도 고리를 수평으로 — 기운 척추에 수직으로 돌리면 낮은 혹의
    // 기운 쪽 고리가 표면 밑으로 내려가 밑동에 접힌 금 · 진한 테 · 렌즈 판이었다(v8c 1회전 peak 3.30 · justfed 1.73 · release 2.80)
    tg = normalize(mix(vec3(0.0, 1.0, 0.0), tg, smoothstep(0.0, 0.15, fsN) * lk));
    tg.y = max(tg.y, -0.7);
    tg = normalize(tg);
    vec2 rad = pinchRad(fsN, dir);
    // 굵기 배율(척추 w — 주저앉으며 굵어진다, 부피 보존). 혹(lk 0)은 굵히지 않는다 — 혹 반폭은 밑동 반폭이 정한다. 굵히면 위 고리가
    // 밑동보다 넓어 처마 · 테 두른 납작 판 위 꼭지 · 렌즈 테였다(v8c 2회전 b peak 3.0~3.4 · release 3.0~3.3)
    rad *= mix(1.0, C.w, smoothstep(0.0, 0.2, fsN) * lk);
    float gn = clamp(gO, 0.0, 1.0);
    // 꼭대기 끝(spec_v8b §1) — 손가락 볼에 눌린 뭉툭하고 둥근 반죽 끝: 옆면이 반경 0.042D 모깎기로 굴러 윗면이 되고(옆 노멀과 C1 —
    // 평평한 원판 + 또렷한 테는 그루터기 · 양초 끝이었다, v8 r2), 윗면은 혹 2~3개 낮은 요철(0.016D). 처마 · 배꼽 0.
    // 혀(묽음)는 둥근 끝(반폭 × 0.35 — 통나무 끝 원판 0)
    // 요철은 긴 기둥에서만 — 짧은 혹(버팀 · 되직)의 꼭지에 얹으면 반폭 0인 꼭지가 뾰족한 뿔 · 산봉우리였다(v8b r3 peak 0.97~1.13)
    float bev = 0.0;
    // 버팀 동안(기둥 0.6D 아래)도 둥근 끝 — 길이 0.35 → 0.6D에서 납작 끝으로(늘어남 1.6s~는 그대로). 요철(혹 둘)도 둥근 끝에선 끈다
    // (평평한 윗면 + 혹 둘 = 그루터기 · 양초, v8d 1회전 peak 1.27~1.67). 꼭대기 테 반폭 요철도 같다 — 둥근 끝에 얹으면 꼭지 홈 · 쌍봉(v8d 2회전 b 1.30~1.37)
    float rnd = max(max(max(uPinch.w, 1.0 - smoothstep(0.6, 1.0, lk)), 1.0 - smoothstep(0.35 * PINCH_D, 0.6 * PINCH_D, L)), max(uPileB.z, uPinchE.x));
    rad += vec2(1.0, 0.6) * (0.02 * PINCH_D * fbm(dir * 2.3 + vec2(sd, 1.7)) * smoothstep(0.85, 1.0, fsN) * lkc * (1.0 - rnd));
    if (f > PINCH_TOP && lkc > 0.0) {
      float disc = pow((1.0 - f) / (1.0 - PINCH_TOP), 0.6667);
      float rr = rad.x;
      float rho = min(0.042 * PINCH_D, 0.6 * rr);
      float dl = rr * (1.0 - disc);
      float fil = dl < rho ? sqrt(max(rho * rho - (rho - dl) * (rho - dl), 0.0)) : rho;
      // 손에서 떨어지면(남은 혹 몫 uPinchE.x — 놓는 순간부터 τ0.2로 오른다) 둥근 끝 — 무늬 이완(g 0.15부터)을 기다리면
      // 납작한 원판이 기울며 화면을 봐 소시지 끝 · 통나무 단면이었다(v8c 1회전 release 2.17~2.37)
      // 반쯤 긴 기둥(버팀 · 항복 직후, lk < 1)도 둥근 끝 — 평평한 윗면은 그루터기 · 양초였다(v8c 2회전 peak 1.17~1.43, spec_v8d §5). 긴 기둥(늘어남)은 그대로
      float ell = rr * sqrt(max(1.0 - disc * disc, 0.0)) * mix(0.35, 0.8, rnd);
      bev = (mix(fil, ell, rnd)
        + 0.016 * PINCH_D * fbm(dir * disc * 2.2 + vec2(sd * 1.7, 3.1)) * (1.0 - disc * disc) * (1.0 - rnd)) * lkc;
      rad *= mix(1.0, disc, lkc);
    }
    vec2 oe = dir * rad;
    // 가닥 = 둥근 관(spec_v8b §2) — 가닥 몫의 둘레 띠(반각 strandHalf)를 가닥 반지름 legR의 관 한 바퀴로 감는다(열림 op만큼).
    // 띠째 두면 옆에서 모로 선 띠가 1~2px 철사였다(v8 r2 2.23~2.47). 구멍(반각 밖)은 관 안쪽 끝에 모이고 frag가 버린다
    float op = strandOpen(gO, k);
    if (op > 1e-3) {
      float psi = clamp(sa / strandHalf(op, k, 0.85 * uPinch.x), -1.0, 1.0) * 3.14159;
      vec2 nK = normalize(ak * rad + vec2(1e-6, 0.0));
      vec2 cK = ak * rad - 0.1 * legR * nK; // 둘레 안 0.1 legR — 들일수록 앞 가닥 사이가 좁았다(legR 1~2px 홈 v8c 1회전 · 0.4 legR 2~3px v8d 1회전)
      float rs = legR * sqrt(endC * (2.0 - endC));
      oe = mix(oe, cK + rs * (cos(psi) * nK + sin(psi) * vec2(-nK.y, nK.x)), op);
    }
    vec3 o = vec3(oe.x, 0.0, oe.y);
    // 고리를 위(+y) → 접선으로 돌린다(로드리게스, w = up × tg)
    vec3 wv = vec3(tg.z, 0.0, -tg.x);
    o = o * tg.y + cross(wv, o) + wv * (dot(wv, o) / (1.0 + tg.y));
    // 녹는 묽은 혀만 표면으로 납작하게 퍼진다(spec_v8c §5)
    o.y *= 1.0 - 0.85 * uPinch.w * uPileB.w;
    // 가닥은 그물 가운데서 살짝 처진다(현수선 — 끊겨 움츠리는 동안 풀린다: 남으면 주저앉은 혹 꼭대기 몫 0.69~0.94 띠가 4px 꺼져
    // 분화구 · 과녁 고리였다, v8c 2회전 peak 2.97~3.43) · 발 고리 높이를 방위마다 깔때기 높이로(fsN 따라 (1 − fsN)²로 풀린다)
    X1 = C.xyz + o + tg * bev
      + vec3(0.0, -0.03 * PINCH_D * uPinchB.y * (1.0 - uPinchB.z) * sin(3.14159 * gn) + Hf * (moundH(dir * rad, S) - 1.0) * (1.0 - fsN) * (1.0 - fsN), 0.0);
    // (접힘 높이장을 혹에 한 번 더 얹던 몫은 지웠다 — 발 고리(P0)가 이미 높이장을 실어 혹 밑에 턱 · 렌즈 고리였다, v8c 1회전. 꺼질 땐 Xf가 받는다)
    // 병 벽 안 — 가로만이 아니라 앞뒤 · 사선도 PINCH_FR 안으로 부드럽게 눌린다(규칙 검수 v8 ③)
    float lx = length(X1.xz);
    float kf = 0.9 * PINCH_FR;
    if (lx > kf) X1.xz *= (kf + (PINCH_FR - kf) * tanh(clamp((lx - kf) / (PINCH_FR - kf), 0.0, 8.0))) / lx;
  }
  // 끊긴 가닥 표지 — 토막이 다시 붙으면(rj 1) 끈다. 기둥 몫이 꺼질 때도 끈다(걸친 세모 자리가 흰 고리 · 구멍이었다, v8 r1)
  cutF *= smoothstep(0.05, 0.3, kc) * (1.0 - step(0.999, smoothstep(0.0, 0.9, uPinchB.z)));
  return mix(Xf, X1, kc);
}
// 꼬집기 적용(버텍스, 높이장 변위 뒤 마지막) — p = 오브젝트 자리, pinR = 테두리 고정 몫. 반환 = 꼬집힌 오브젝트 자리.
// nW = 꼬집기 면 노멀(월드, 앞 차분 두 번 → 접선 외적) · info = (들림(월드), 늘어남 = 두 방향 길이비 중 큰 값, 높이 몫 f, 0) · cutF = 끊긴 가닥 조각 표지
vec3 pinchApply(vec3 p, float pinR, out vec3 nW, out vec4 info, out vec2 cutF) {
  vec2 w = p.xz * PINCH_XZ;
  float f;
  float fd;
  vec2 cd;
  vec3 P0 = pinchXYZ(w, p.y);
  vec3 X = mix(P0, pinchPos(w, p.y, f, cutF), pinR);
  // 차분은 잡은 점 기준 극좌표 두 방향(바깥 · 둘레) — 축 방향 바깥 차분은 gd.x = 0 · gd.y = 0 선에서 차분 쪽이 뒤집혀 기둥 한가운데
  // 어두운 세로 줄 한 가닥이 남았다(v8 r2 b). 가운데를 건너가지 않으니 꼭대기 칼집(v7 r1)도 없다. 평면에서 외적 = +y
  vec2 gd = w - uGrabPos * PINCH_XZ;
  float gl = length(gd);
  vec2 er = gl > 1e-6 ? gd / gl : vec2(1.0, 0.0);
  vec2 et = vec2(-er.y, er.x);
  vec3 Xa = mix(P0 + pinchXYZ(er * PINCH_FD, 0.0), pinchPos(w + er * PINCH_FD, p.y, fd, cd), pinR);
  vec3 Xb = mix(P0 + pinchXYZ(et * PINCH_FD, 0.0), pinchPos(w + et * PINCH_FD, p.y, fd, cd), pinR);
  vec3 c = cross(Xb - X, Xa - X);
  float a = length(c);
  nW = a > 1e-12 ? c / a : vec3(0.0, 1.0, 0.0);
  // (녹음 몫에 노멀을 둔덕 노멀로 넘기던 몫은 지웠다 — 아직 솟은 혹을 납작하게 비춰 테 두른 렌즈 · 계란 흰자 판이었다, v8c 1회전.
  //  기둥 몫이 0이면 꼬집힌 자리가 둔덕 면 그대로라 차분 노멀이 곧 둔덕 노멀이다)
  info = vec4(X.y - p.y, max(length(Xa - X), length(Xb - X)) / PINCH_FD, f, 0.0);
  return vec3(X.x / PINCH_XZ, X.y, X.z / PINCH_XZ);
}
`;
export type GrabTuning = Partial<
  typeof GRAB_DEFAULTS & { grabMax: number; grabCreepGain: number; grabReturnZeta: number }
>;

export class DoughMesh {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly wobble = new THREE.Vector2();
  readonly bubbles = new BubbleSystem();

  /** 현재 적용 중인 파라미터 (스무딩 완료값) */
  private params: RenderParams | null = null;
  private lastT = -1;
  private pokeAge = Infinity; // 탭 눌림 경과(s) — Infinity = 비활성
  private pokeAmp = 0.06;     // 양수 = 덴트
  /** 롱프레스 홀드 — 탭과 같은 poke uniform을 쓰되 상태기는 따로(A1-15) */
  private holding = false;
  private holdLevel = 0;

  // ── 젓기 상태 — 입력층이 setStirInput으로 밀어 넣고, tick이 스프링·감쇠를 굴린다 ──
  private stirTarget = new THREE.Vector2();
  private stirVecTarget = new THREE.Vector2();
  private stirVec = new THREE.Vector2();      // uStirVec 현재값
  private stirVecVel = new THREE.Vector2();   // 놓은 뒤 damped spring 속도항
  private lastStirInputT = -Infinity;
  private stirDrivesWobble = true;
  private lastHandStirT = -Infinity;
  private wasStirring = false;
  private prevStirTarget = new THREE.Vector2();
  /** 슬로싱 진동자 속도항 — wobble은 감쇠 진동(1.5Hz), ζ는 fluidity가 정한다 */
  private wobbleVel = new THREE.Vector2();
  private wobbleTgt = new THREE.Vector2();
  /** 손끝 지연 기록(지금 획) — 꼬리 = τ초 전 손끝(TIP_TAU_*). 링버퍼 [t, x, z] */
  private tipHist = new Float64Array(TIP_HIST * 3);
  private tipHistN = 0;
  private tipHistHead = 0;
  /** 손끝 패임 깊이 · 앞 둔덕 높이(월드) · 진행 방향 · 잡기 확정으로 빨리 지우는 중(§6-12) */
  private dentH = 0;
  private bowH = 0;
  private tipDir = new THREE.Vector2(1, 0);
  private tipFast = false;
  /** 소용돌이 노드(r = i/8 · R) — Θ 누적 각(rad, 풀리지 않는다) · 각속도 · 저은 넓이 M 0~1 · 이번 획이 쌓은 M(잡기 확정 때 뺀다) */
  private swTheta = new Float32Array(SWIRL_N);
  private swOmega = new Float32Array(SWIRL_N);
  /** 저은 자리 기억(재료 좌표 극좌표 칸) · 이번 획 시작 때 사본(잡기 확정 때 되돌린다, §6-12) */
  private mem = new Float32Array(MEM_NR * MEM_NA);
  private memSnap = new Float32Array(MEM_NR * MEM_NA);
  private prevTipAng = NaN;
  private tailTmp = new THREE.Vector2();
  /** 젓는 세기 0~1 — 기포 가속·젖은 광 부스트·사운드 게인의 공통 소스 */
  agitation = 0;
  /** 피크 젓기 꺼짐 0~0.6 — uSink에 더한다(τ20s 회복) */
  private knock = 0;
  /** 밥 주기 줄무늬 세기 0~1 · 소용돌이 위상(rad) — 연출이 setMarble로 넣고, 옅어짐은 tick이 굴린다 */
  marble = 0;
  marblePhase = 0;
  /** 이번 tick에 손 젓기가 줄무늬를 0.05 아래로 떨어뜨렸나 — SceneHost.onMixed가 읽는다 */
  mixedThisFrame = false;
  private mixGlint = 0;
  /** hooch 탁해짐 0~1 — SceneHost가 jar.setMurk로 넘긴다 */
  murk = 0;
  /** 개체별 호흡 위상 — 두 르방이 같은 박자로 숨쉬지 않게 한다 (setSeed) */
  private seedPhase = 0;

  // ── 들기 상태 — 기둥 상태기는 rig(순수 TS), 꼬집기 모양은 반죽 버텍스(GRAB_FIELD pinchPos), 깔때기 높이 · 흔들림 스프링은 여기 ──
  /** Motion Lab 전용 오버라이드 — 프로덕션 경로는 비워 둔다 */
  grabTuning: GrabTuning = {};
  /** 꼬집기 상태기(떼어내기 v5) — 메시 없음, 반죽 uniform을 몬다 */
  readonly rig = new StrandRig();
  /** 이번 tick의 들기 사건 — SceneHost.onGrabEvent가 읽는다(소리 · 진동) */
  readonly grabBreaks: readonly StrandBreak[] = this.rig.events;
  private grabbing = false;
  private grabReleaseAge = Infinity;
  private grabAnchor = new THREE.Vector2();
  private moundH = 0;
  private moundV = 0;
  /** 둔덕 목표 — 손끝보다 τ0.16(MOUND_LAG_TAU) 늦게 따라온다(무게) */
  private moundTgt = 0;
  /** 무늬 끌림 세기 — 빨리 풀리는 몫 · 흔적으로 남는 몫(uGrab.z = 둘 중 큰 값) */
  private pullFast = 0;
  private pullSlow = 0;
  private sway = new THREE.Vector2();      // 밑동 흔들림(오브젝트) — ω5.5 · ζ 스프링(「무겁게 되돌아온다」)
  private swayV = new THREE.Vector2();
  private swayRest = new THREE.Vector2();  // 놓을 때 남는 몫(creepGain) — releaseTau로 해소
  private swayTgt = new THREE.Vector2();
  private readonly tipOff = [0, 0];
  private readonly strandEnv: StrandEnv = {
    surfaceY: (x, z) => this.surfaceY(x / XZ_SCALE, z / XZ_SCALE),
    followTau: GRAB_DEFAULTS.elasticTau,
    creepDelay: GRAB_DEFAULTS.creepDelay,
    creepTau: GRAB_DEFAULTS.creepTau,
  };

  constructor() {
    const bumpPos = Array.from({ length: DYN_SLOTS }, () => new THREE.Vector2());
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWobble: { value: new THREE.Vector2() },
        uColor: { value: new THREE.Color(0xf4ead4) },
        uNoiseSpeed: { value: 1.0 },
        uSpecStr: { value: 1.0 },
        uCrust: { value: 0 },
        uFlourDust: { value: 0 },
        uFlourSwirl: { value: 0 },
        // 밥 주기 줄무늬(2026-11-19 M3) — 세기 0~1 · 소용돌이 위상
        uMarble: { value: 0 },
        uMarblePhase: { value: 0 },
        uWet: { value: 0 },
        uRipe: { value: 0 },
        uCollapse: { value: 0 },
        // 윗면 질감(2026-11-19 P1b) — 바늘구멍 · 가장자리 잔거품 · 하강 꺼짐 · 젓은 물결
        uPin: { value: 0 },
        uFoam: { value: 0 },
        uSink: { value: 0 },
        uStir: { value: 0 },
        // 곰팡이 군락 MOLD_N(5)개 — (x, z, 크기 배율, 색 종류 0 흰 · 1 회녹 · 2 분홍빛 검정). setSeed가 채운다
        uMoldA: { value: Array.from({ length: MOLD_N }, () => new THREE.Vector4(0, 0, 1, 0)) },
        uKahm: { value: 0 },
        uMold: { value: 0 },
        uHooch: { value: 0 },
        uSeed: { value: 0.37 },
        uBumpPos: { value: bumpPos },
        uBumpAmp: { value: new Float32Array(DYN_SLOTS) },
        uBumpK: { value: new Float32Array(DYN_SLOTS) },
        // 젓기 v3(2026-11-19 손맛 3차) — 손끝 (머리 x, z, 패임 깊이, 앞 둔덕 높이) · (진행 방향 x, z, 꼬리 x, z) ·
        // 소용돌이 노드 (Θ, ω 각속도) × SWIRL_N · 저은 자리 기억 칸(재료 좌표 극좌표, vec4 묶음) ·
        // 세기 (접힌 주름 높이, 저은 자리 광, 시큼 광 흐름, 0)
        uTip: { value: new THREE.Vector4() },
        uTipB: { value: new THREE.Vector4(1, 0, 0, 0) },
        uSwirl: { value: Array.from({ length: SWIRL_N }, () => new THREE.Vector2()) },
        uMem: { value: Array.from({ length: (MEM_NR * MEM_NA) / 4 }, () => new THREE.Vector4()) },
        uStirK: { value: new THREE.Vector4() },
        uPokePos: { value: new THREE.Vector2() },
        uPokeAmt: { value: 0 },
        uPokeK: { value: POKE_K0 },
        uStirPos: { value: new THREE.Vector2() },
        uStirVec: { value: new THREE.Vector2() },
        // 구 uLiquid 분해 (2026-08-25) — uLevel=형상, uFluid=흐름, uCohesion=응집.
        // 한 축으로 되돌리지 말 것: 갓 밥준 르방은 "평평하지만 되직하다"라 1축으로 표현 불가
        uLevel: { value: 0.5 },
        uFluid: { value: 0.3 },
        uCohesion: { value: 0.6 },
        // 옆벽 반경(오브젝트). 프래그 반경 밴드 정규화와 **단일 소스**
        uRBody: { value: R_BODY },
        uWallCell: { value: new THREE.Vector2(0, 60) }, // x=세기, y=주파수
        uRXZMax: { value: R_BODY },
        uHeight: { value: 0.76 },
        uPull: { value: 0 },
        uMenH: { value: 0 },
        // 기울기 진값 — 하이트필드는 오브젝트 xz(월드 ÷ XZ_SCALE) 위 월드 y 변위라 월드 기울기 = dBs / XZ_SCALE.
        // 높이가 y 스케일이 아니라 uHeight라서 fill과 무관하다. 옛 1.0 고정은 노멀 교란을 1.3배 키워 얼룩을 키웠다(A1-05)
        uSlopeAspect: { value: 1 / XZ_SCALE },
        // 들기(떼어내기 v8 꼬집기) — 잡은 점(기둥 발) · (깔때기 높이, 끌려 모임 세기, 무늬 끌림 세기, 0) ·
        // 접힘 (x, z, 높이, 반쪽 길이) · (접힘 방위, 거침, 0, 0) · 척추 17점 · 기둥 매개변수 uPinch ~ uPinchF(StrandRig.col, GRAB_FIELD 머리 주석)
        uGrabPos: { value: new THREE.Vector2() },
        uGrab: { value: new THREE.Vector4() },
        uPile: { value: new THREE.Vector4(0, 0, 0, 1) },
        uPileB: { value: new THREE.Vector4() }, // GRAB_FIELD
        uSpine: { value: Array.from({ length: SPINE_N }, () => new THREE.Vector4()) },
        uPinch: { value: new THREE.Vector4() },
        uPinchB: { value: new THREE.Vector4(1, 0, 0, 1) },
        uPinchC: { value: new THREE.Vector4() },
        uPinchD: { value: new THREE.Vector4(-1, -1, -1, -1) },
        uPinchE: { value: new THREE.Vector4(0, 0.72, 1, 0) },
        uPinchF: { value: new THREE.Vector4() },
      },
      vertexShader: vert
        .replace('// #fbm', FBM_GLSL)
        .replace('// #stirField', SURF_TILT + STIR_FIELD)
        .replace('// #grabField', GRAB_FIELD),
      fragmentShader: frag
        .replace('// #fbm', FBM_GLSL)
        .replace('// #hoochCover', HOOCH_COVER)
        .replace('// #stirField', SURF_TILT + STIR_FIELD)
        .replace('// #marble', MARBLE_GLSL)
        .replace('// #grabField', GRAB_FIELD)
        .replace('// #doughShade', DOUGH_ALBEDO + DOUGH_SHADE)
        .replace('// #cellBubble', CELL_BUBBLE),
    });
    const geo = createFillGeometry(SEG, RINGS, ROWS);
    // 셰이더가 높이를 정하므로 자리 기준 구를 손으로 준다 — 병 전체(바닥~피크 상한)를 덮는다
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.4);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.y = 0;
    this.mesh.scale.set(XZ_SCALE, 1, XZ_SCALE);
    this.mesh.renderOrder = 2;
    this.layoutMold(26000); // setSeed 전 기본 자리(uSeed 0.37과 같은 시드)
  }

  applyParams(p: RenderParams): void {
    this.params = p;
    const u = this.material.uniforms;
    (u.uColor.value as THREE.Color).setRGB(p.color[0], p.color[1], p.color[2]);
    u.uNoiseSpeed.value = p.noiseSpeed;
    u.uSpecStr.value = p.specStr;
    u.uCrust.value = p.crust;
    u.uHooch.value = p.hoochAmt;
    u.uRipe.value = p.ripe;
    u.uCollapse.value = p.collapse;
    u.uPin.value = p.pinholes;
    u.uFoam.value = p.foam;
    u.uSink.value = p.sink;
    u.uStir.value = p.stir;
    u.uKahm.value = p.kahm;
    u.uMold.value = p.mold;
    u.uLevel.value = p.levelness;
    u.uFluid.value = p.fluidity;
    u.uCohesion.value = p.cohesion;
    u.uHeight.value = this.height();
    u.uPull.value = p.pull / XZ_SCALE;
    u.uMenH.value = this.menH();
    (u.uWallCell.value as THREE.Vector2).set(p.wallCells, p.cellFreq);
    this.bubbles.spawnR = 0.6 * R_BODY;
    // uWet은 tick에서 agitation 부스트와 합성
  }

  /**
   * 개체 시드 — createdAt 해시. 세션 간 자리 고정 (파생 가능하므로 저장하지 않는다).
   * 2026-08-25 일반화: 곰팡이 반점 자리에만 쓰던 것을 **정지 실루엣 FBM 오프셋**과
   * **호흡 위상**으로 확장했다. 곰팡이는 평생 한 번 볼까 말까라 개체 식별에 기여가 0이었다 —
   * 이제 르방마다 덩어리 생김새와 숨 타이밍이 다르다. 이름표가 아니라 얼굴이다 (§4-3).
   */
  setSeed(seed: number): void {
    const s = (Math.abs(seed) % 100000) / 100000 + 0.11;
    this.material.uniforms.uSeed.value = s;
    this.seedPhase = s * Math.PI * 2;
    this.layoutMold(seed);
  }

  /** 곰팡이 군락 — 윗면 안쪽 0.15~0.65·R(유리 테두리에 붙지 않게), 크기 0.75~1.15배, 색 종류는 군락마다(R2-10) */
  private layoutMold(seed: number): void {
    const rnd = seededRandom(seed * 7 + 13);
    // 방위는 황금각으로 돌리며 흔든다 — 순수 난수는 5개 중 둘셋이 한 덩이로 겹쳐 「몇 개 더」가 안 보였다
    const ang0 = rnd() * Math.PI * 2;
    (this.material.uniforms.uMoldA.value as THREE.Vector4[]).forEach((c, i) => {
      const ang = ang0 + i * 2.39996 + (rnd() - 0.5) * 0.6;
      const rad = (0.15 + 0.5 * rnd()) * R_BODY;
      c.set(Math.cos(ang) * rad, Math.sin(ang) * rad, 0.75 + 0.4 * rnd(), Math.min(2, Math.floor(rnd() * 3)));
    });
  }

  /** 탭 눌림 — 오브젝트 공간 XZ. 되튐/아묾은 elasticity가 가른다(tick) */
  pokeAt(x: number, z: number, amp = 0.06): void {
    (this.material.uniforms.uPokePos.value as THREE.Vector2).set(x, z);
    this.pokeAmp = amp;
    this.pokeAge = 0;
    this.holding = false;
    this.holdLevel = 0;
  }

  /** 롱프레스 시작 — 손가락 쪽 표면이 아주 천천히 0.03 부푼다(눈 없이 「알아챈다」만, VISUAL §5) */
  holdStart(x: number, z: number): void {
    (this.material.uniforms.uPokePos.value as THREE.Vector2).set(x, z);
    this.pokeAge = Infinity;
    this.holding = true;
  }

  /** 롱프레스 끝 — easeOut으로 가라앉는다. 홀드 중이 아니면 아무 일도 없다 */
  holdEnd(): void {
    this.holding = false;
  }

  private grabParam(key: keyof typeof GRAB_DEFAULTS): number {
    return this.grabTuning[key] ?? GRAB_DEFAULTS[key];
  }
  private grabMax(): number {
    return this.grabTuning.grabMax ?? this.params?.grabMax ?? 0.2;
  }

  /** 가닥 상태기 환경 — 튜닝 오버라이드를 그때그때 반영한다 */
  private env(): StrandEnv {
    const e = this.strandEnv;
    e.followTau = this.grabParam('elasticTau');
    e.creepDelay = this.grabParam('creepDelay');
    e.creepTau = this.grabParam('creepTau');
    return e;
  }

  /**
   * grab 시작 — 앵커(오브젝트 xz). 입력층이 미확정(젓기처럼 흘린 획)을 grab으로 확정하는 순간이라
   * 그 획의 손끝 패임 · 앞 둔덕 · 저은 넓이를 지운다(§6-12). 놓기 = grabEnd(pointerup)
   */
  grabStart(x: number, z: number): void {
    // 패임 · 앞 둔덕은 τ0.1s로 지우고, 이 획이 쌓은 저은 넓이는 M에서 뺀다(§6-12 — 들기 전 32px가 저은 자리로 남지 않게).
    // Θ는 32px 몫이라 작아 그대로 둔다(되감기면 무늬가 거꾸로 도는 게 보인다)
    this.tipFast = true;
    for (let k = 0; k < this.mem.length; k++) this.mem[k] = Math.min(this.mem[k], this.memSnap[k]);
    // 젓기 획은 여기서 끝 — 머리가 계속 파지 않게
    this.lastStirInputT = this.lastHandStirT = -Infinity;
    this.grabbing = true;
    this.grabReleaseAge = Infinity;
    this.grabAnchor.set(x, z);
    const p = this.params;
    this.rig.start(x * XZ_SCALE, z * XZ_SCALE,
      strandMix(p?.elasticity ?? 0.5, p?.fluidity ?? 0.3, this.grabMax()), this.env());
  }

  /** grab 이동 — 손끝 월드 점(입력층이 카메라를 마주 보는 수직 평면에 투영). 기둥 꼭대기가 이 점(손끝 바로 밑, ANCHOR 0)을 따른다 —
   *  버팀 τ0.16 → 항복 τ0.05 → 그 뒤 elasticTau */
  grabMove3(x: number, y: number, z: number): void {
    if (!this.grabbing) return;
    this.rig.move(x, y, z);
  }

  /** 들기 소리 — 장력 0~1(버팀: 1 − e^(−d/0.25D), 뻗은 뒤 0.35 + 0.65 × 신장) · 늘어남 잔 틱 횟수/s(뻗은 뒤 늘어나는 빠르기 비례 4~16) */
  grabFeel(): Readonly<{ tension: number; tickRate: number }> {
    const rig = this.rig;
    const o = this.feelOut; // 매 호출 객체 생성 0(규칙 검수 v8b) — 받는 쪽은 바로 읽고 버린다
    o.tension = 0;
    o.tickRate = 0;
    if (!rig.active || rig.none || !rig.attached()) return o;
    if (!rig.yielded) {
      o.tension = 1 - Math.exp(-rig.pulled() / MOUND_D);
      return o;
    }
    const v = rig.stretchSpeed / D_W;
    o.tension = 0.35 + 0.65 * rig.stretch01(this.env());
    o.tickRate = v > 0.05 ? Math.min(16, 4 + 12 * v) : 0;
    return o;
  }

  private readonly feelOut = { tension: 0, tickRate: 0 };

  /** 놓기 — 붙은 가닥은 한 줄로 합쳐 떨어지고 더미가 되며, 밑동 둔덕은 ω5.5 · ζ 스프링으로 돌아간다. tick이 굴린다 */
  grabEnd(): void {
    if (!this.grabbing) return;
    this.grabbing = false;
    this.rig.release(); // 밑동 흔들림 남는 몫(swayRest)은 tick이 기둥이 떨어진 첫 틱에 잡는다
  }

  /** 신장 0~1 = 주 가닥 길이 ÷ 지금 주 가닥 끊김 길이 — 사운드 훅용(onGrabMove). 주 가닥이 끊겼으면 0 */
  grabStretch01(): number {
    return this.rig.stretch01(this.env());
  }

  /** Motion Lab 계기판 · 녹화 도구용 — held는 rec.mjs가 grab 판정 기록에 쓴다 */
  grabDebug(): { held: boolean; len: number; breakLen: number; attached: number } {
    const rig = this.rig;
    return { held: this.grabbing, len: rig.len, breakLen: rig.breakLen(this.env()), attached: rig.attached() };
  }

  /**
   * 젓기 입력 — 오브젝트 공간 위치 + 프레임 속도(단위/s). 입력이 끊기면(0.08s)
   * tick이 자동으로 '놓음' 처리해 damped spring 복귀를 돌린다.
   * driveWobble=false: 연출(급여 시퀀스)이 wobble을 직접 연출할 때.
   */
  setStirInput(x: number, z: number, vx: number, vz: number, driveWobble = true, hand = driveWobble): void {
    this.stirTarget.set(x, z);
    this.stirDrivesWobble = driveWobble;
    if (hand) this.lastHandStirT = this.lastT;
    // 점성 게인 — 빠른 드래그도 반죽은 반 박자 늦게, 상한으로 찢어짐 방지
    this.stirVecTarget.set(
      THREE.MathUtils.clamp(vx * 0.10, -0.22, 0.22),
      THREE.MathUtils.clamp(vz * 0.10, -0.22, 0.22),
    );
    this.lastStirInputT = this.lastT;
  }

  /** 손이 젓고 있나 — 밥 주기 자동 젓기가 손에 양보한다(SceneHost) */
  isHandStirring(): boolean {
    return this.lastT - this.lastHandStirT < STIR_IDLE_S;
  }

  /** 되기 0 묽음 ~ 1 되직 — 1 − fluidity 정규화. 젓기 소리 몸통 음높이(app.ts)와 고랑 메워짐이 같이 쓴다 */
  stirThickness(): number {
    const f = this.params?.fluidity ?? 0.3;
    return THREE.MathUtils.clamp((THICK_FLUID_HI - f) / (THICK_FLUID_HI - THICK_FLUID_LO), 0, 1);
  }

  /** 줄무늬 세기(0~1) · 위상 — 밥 주기 연출이 넣는다. 옅어짐 · 다 섞임은 tick */
  setMarble(v: number, phase = this.marblePhase): void {
    this.marble = THREE.MathUtils.clamp(v, 0, 1);
    this.marblePhase = phase;
  }

  /** 르방 전환 · 추가 · 버리기 · 앱 열기(SceneHost.snapParams) — 지난 르방의 젓기 · 밥 주기 일시 상태를 새 르방에 넘기지 않는다 */
  resetTransient(): void {
    this.knock = 0;
    this.marble = 0;
    this.marblePhase = 0;
    this.murk = 0;
    this.mixGlint = 0;
    this.mixedThisFrame = false;
    this.lastStirInputT = this.lastHandStirT = -Infinity; // 지난 르방의 획을 잇지 않는다
    this.dentH = this.bowH = 0;
    this.tipFast = false;
    this.tipHistN = 0;
    this.prevTipAng = NaN;
    for (const a of [this.swTheta, this.swOmega, this.mem, this.memSnap]) a.fill(0);
    this.writeStir();
    // 당기기 — 가닥 · 더미 · 밑동 둔덕도 넘기지 않는다
    this.grabbing = false;
    this.rig.reset();
    this.resetMound();
  }

  private resetMound(): void {
    this.moundH = this.moundV = this.moundTgt = this.pullFast = this.pullSlow = 0;
    this.sway.set(0, 0);
    this.swayV.set(0, 0);
    this.swayRest.set(0, 0);
    const u = this.material.uniforms;
    (u.uGrab.value as THREE.Vector4).set(0, 0, 0, 0);
    (u.uPile.value as THREE.Vector4).set(0, 0, 0, 1);
    (u.uPileB.value as THREE.Vector4).set(0, 0, 0, 0);
    this.writePinch();
    (u.uGrabPos.value as THREE.Vector2).copy(this.grabAnchor);
  }

  /** 기둥 — 척추 17점(v8b) · 매개변수 넷(상태기 값 그대로 — 기둥 몫 · 꺼짐도 상태기가 연속으로 몬다) */
  private writePinch(): void {
    const u = this.material.uniforms;
    const rig = this.rig;
    const sp = u.uSpine.value as THREE.Vector4[];
    for (let i = 0; i < SPINE_N; i++) sp[i].fromArray(rig.spine, 4 * i);
    const names = ['uPinch', 'uPinchB', 'uPinchC', 'uPinchD', 'uPinchE', 'uPinchF'] as const;
    for (let k = 0; k < names.length; k++) (u[names[k]].value as THREE.Vector4).fromArray(rig.col, 4 * k);
  }

  /** 젓기 · 밥 주기 연출이 만드는 출렁 배율 — 되직 0 ~ 묽음 1 */
  sloshGain(): number {
    return THREE.MathUtils.smoothstep(this.params?.fluidity ?? 0.3, 0.3, 0.7);
  }

  /** 메니스커스 높이(월드) — 응집이 높고 평평할수록 유리를 타고 오른다. vert uMenH와 단일 소스 */
  private menH(): number {
    const p = this.params;
    return 0.018 * (0.3 + 0.7 * (p?.cohesion ?? 0.6)) * (p?.levelness ?? 0.5);
  }

  /** 반죽 높이(월드, 숨 제외) — RenderParams.height */
  height(): number {
    return (this.params?.height ?? 0.76) * (1 - KNOCK_DROP * (this.knock / KNOCK_MAX));
  }

  /** 몸통 XZ 반경(오브젝트 공간) — 입력 히트 테스트 전용. 옆벽은 늘 유리 안쪽(R_BODY)에 붙어 있다 */
  bodyRadius(): number {
    return this.material.uniforms.uRBody.value as number;
  }

  /** 테두리(반죽이 유리에 닿는 선) 월드 y — 유리 자국 수면·hooch 아랫단. 돔·크레이터 테두리 몫과 숨 포함 */
  levelY(): number {
    const p = this.params;
    const rim = this.height() + this.menH()
      + 0.05 * (p?.ripe ?? 0) * DOME_RIM - 0.08 * (p?.collapse ?? 0) * CRATER_RIM;
    return rim * this.mesh.scale.y;
  }

  /** 반죽 가운데 꼭대기 월드 y — 레이캐스트 평면·밀가루 낙하 자리. 피크 돔·과숙 크레이터·숨까지(A1-11) */
  topY(): number {
    const p = this.params;
    return (this.height() + 0.05 * (p?.ripe ?? 0) - 0.08 * (p?.collapse ?? 0) - SINK_DEPTH * this.sinkNow())
      * this.mesh.scale.y;
  }

  /**
   * 윗면 한 점의 월드 y(숨 포함) — 가닥 밑점 · 누운 자리용. vert topPoint의 정지 항과 같은 계수다:
   * 수위 · 수면 기울기 · 정지 혹(fbm 0.045) · 피크 돔 · 과숙 크레이터 · 하강 꺼짐(주름 포함) · 메니스커스 · 밑동 둔덕 · 더미(§6-13).
   * 시간 FBM · 진행파 · 기포 · 고랑 · 탭은 빼고(작고 빠르다), xz 끌림 뒤가 아니라 휴지 자리에서 본다.
   */
  surfaceY(x: number, z: number): number {
    const u = this.material.uniforms;
    const lev = u.uLevel.value as number;
    const fl = u.uFluid.value as number;
    const ripe = u.uRipe.value as number;
    const rb = u.uRBody.value as number;
    const seed = (u.uSeed.value as number) * 37.0;
    const wob = u.uWobble.value as THREE.Vector2;
    const kR = 0.3844 / (rb * rb);
    const c2 = x * x + z * z;
    // 수면 기울기 × (1 − 덮임) · 솟는 항 × riseK — vert SURF_TILT · STIR_FIELD와 같은 식(§6-9)
    const spread = this.hoochSpread();
    const rise = 1 - 0.85 * spread;
    let y = (u.uHeight.value as number) + (x * wob.x + z * wob.y) * 0.14 * lev * (0.5 + 0.5 * fl) * (1 - spread);
    // 정지 혹은 소용돌이 도메인에서 — vert swirlAt · swirlQ와 같은 식(반경 노드 선형 보간, Rot(−Θ))
    const sx = Math.min(Math.max(Math.sqrt(x * x + z * z) / rb, 0), 1) * (SWIRL_N - 1);
    const si = Math.min(Math.floor(sx), SWIRL_N - 2);
    const th = this.swTheta[si] + (this.swTheta[si + 1] - this.swTheta[si]) * (sx - si);
    const qx = Math.cos(th) * x + Math.sin(th) * z;
    const qz = -Math.sin(th) * x + Math.cos(th) * z;
    y += fbm2(qx * 1.8 + 3.1 + seed, qz * 1.8 + 7.4 + seed) * 0.045 * (1 - 0.55 * lev - 0.3 * fl) * (1 - 0.5 * ripe);
    y += ripe * 0.05 * Math.exp(-c2 * 2.5 * kR);
    y -= (u.uCollapse.value as number) * 0.08 * Math.exp(-c2 * 2.0 * kR);
    const sink = u.uSink.value as number;
    if (sink > 0.001) {
      const bowl = Math.max(Math.exp(-c2 * 3.0 * kR) - 0.3156, 0) / 0.6844;
      const f = fbm2(x * 6 + 2, z * 6 + 2);
      y -= sink * bowl * (0.05 + 0.02 * Math.sqrt(f * f + 0.02));
    }
    y += (u.uMenH.value as number) * THREE.MathUtils.smoothstep(Math.sqrt(c2) / rb, 0.78, 1.0);
    const g = u.uGrab.value as THREE.Vector4;
    const gp = u.uGrabPos.value as THREE.Vector2;
    // 깔때기 · 접힘 — 꼬집기 깔때기 평균(오므림 · 기둥은 빼고 GRAB_FIELD pinchPos의 Hf·funnelH(s/S)만) + 접힘 능선 평균(둥근 가우스 · 몫 0.7)
    if (g.x > 1e-5) {
      const s = Math.min(Math.hypot(x - gp.x, z - gp.y) / (this.rig.funnelR / XZ_SCALE), 1);
      y += rise * g.x * funnelH(s);
    }
    const pl = u.uPile.value as THREE.Vector4;
    if (pl.z > 1e-5) y += rise * 0.7 * pl.z * Math.exp(-((x - pl.x) ** 2 + (z - pl.y) ** 2) / (pl.w * pl.w));
    return y * this.mesh.scale.y;
  }

  /** 윗물 덮임 0~1 — surfaceY · 더미 메시 riseK 공통(셰이더 hoochSpread의 CPU 짝) */
  private hoochSpread(): number {
    return THREE.MathUtils.smoothstep(this.material.uniforms.uHooch.value as number, 0.3, 0.8);
  }

  /** 하강 꺼짐 + 피크 젓기 꺼짐 — uSink · topY 공통 */
  private sinkNow(): number {
    return Math.min(1, (this.params?.sink ?? 0) + this.knock);
  }

  /** t = 렌더 시계(초, CPU 로직 전부). shaderT = 셰이더 uTime — 생략하면 t. 호출자가 원점을 옮긴 작은 값을 넘겨 float32 해상도를 지킨다 */
  tick(t: number, shaderT = t): void {
    const p = this.params;
    const fluid = p?.fluidity ?? 0.3;
    const ela = p?.elasticity ?? 0.5;
    const amp = p?.breatheAmp ?? 0.006;
    const period = p?.breathePeriod ?? 3.5;
    const breathe = 1 + amp * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / period + this.seedPhase));
    // 병에 갇힌 반죽은 폭이 아니라 수위가 숨쉰다. 바닥이 y=0 피벗이라 scale.y만 곱해도 바닥 고정
    this.mesh.scale.set(XZ_SCALE, breathe, XZ_SCALE);
    this.mesh.position.y = 0;

    // 시계 역행 방어(A1-18) — 하한 0. 역행이면 CPU 시각 기록을 그만큼 옮겨 연속성을 지킨다
    if (this.lastT >= 0 && t < this.lastT) this.shiftClock(t - this.lastT);
    const dt = this.lastT < 0 ? 1 / 60 : Math.min(Math.max(t - this.lastT, 0), 0.1);
    this.lastT = t;
    const u = this.material.uniforms;

    // ── 젓기 스프링 · 손끝 지연 · 소용돌이 ──
    const stirring = t - this.lastStirInputT < STIR_IDLE_S;
    const hand = t - this.lastHandStirT < STIR_IDLE_S;
    const stirPos = u.uStirPos.value as THREE.Vector2;
    this.mixedThisFrame = false;
    let pathLen = 0;
    let handDa = 0; // 이번 tick 손끝이 가운데 둘레를 돈 각(rad) — 소용돌이 · 저은 넓이
    const thick = this.stirThickness();
    const ripe = p?.ripe ?? 0;
    if (stirring) {
      const fresh = !this.wasStirring;
      if (fresh) {
        // 새 획 — 손끝 자리로 바로(지난 획 끝에서 끌려오며 패임을 긋지 않게)
        stirPos.copy(this.stirTarget);
        this.prevStirTarget.copy(this.stirTarget);
        this.tipFast = false;
        this.memSnap.set(this.mem);
        this.tipHistN = 0;
        this.prevTipAng = NaN;
      }
      // 손가락 추종 — 머리 = 손끝 자리(τ ≈ 0.03s, 입력 떨림만 거른다). 반죽의 늦음은 꼬리(지연) · 소용돌이 각속도가 맡는다
      stirPos.lerp(this.stirTarget, 1 - Math.exp(-30 * dt));
      this.stirVec.lerp(this.stirVecTarget, 1 - Math.exp(-12 * dt));
      this.stirVecVel.set(0, 0);
      pathLen = this.stirTarget.distanceTo(this.prevStirTarget);
      // 줄무늬 소용돌이 위상 — 손끝이 가운데를 도는 각도를 따라간다(손 · 연출 둘 다)
      if (this.prevStirTarget.lengthSq() > 1e-4 && this.stirTarget.lengthSq() > 1e-4) {
        const a0 = Math.atan2(this.prevStirTarget.y, this.prevStirTarget.x);
        const a1 = Math.atan2(this.stirTarget.y, this.stirTarget.x);
        this.marblePhase += Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
      }
      this.prevStirTarget.copy(this.stirTarget);
      this.pushTip(t, stirPos);
      // 손끝이 가운데 둘레를 돈 각 — 가운데 근처(0.12R 안)는 각이 튀어 세지 않는다
      const r = stirPos.length();
      const ang = Math.atan2(stirPos.y, stirPos.x);
      if (r > 0.12 * R_BODY && Number.isFinite(this.prevTipAng)) {
        handDa = Math.atan2(Math.sin(ang - this.prevTipAng), Math.cos(ang - this.prevTipAng));
      }
      this.prevTipAng = r > 0.12 * R_BODY ? ang : NaN;
    } else if (this.stirVec.lengthSq() > 1e-8) {
      // 놓음 — damped spring e^(-5t)cos(12t) 감각 (ω≈12, 오버슈트 1회)
      const ax = -144 * this.stirVec.x - 10 * this.stirVecVel.x;
      const az = -144 * this.stirVec.y - 10 * this.stirVecVel.y;
      this.stirVecVel.x += ax * dt;
      this.stirVecVel.y += az * dt;
      this.stirVec.x += this.stirVecVel.x * dt;
      this.stirVec.y += this.stirVecVel.y * dt;
    } else {
      this.stirVec.set(0, 0);
      this.stirVecVel.set(0, 0);
    }
    this.wasStirring = stirring;
    (u.uStirVec.value as THREE.Vector2).copy(this.stirVec);
    this.agitation = Math.min(1, this.stirVec.length() * 6);
    this.stepSwirl(dt, stirring, handDa, stirPos, thick, p?.ripe ?? 0);

    // ── 피크 젓기 꺼짐 — 젓는 거리 × ripe로 쌓이고 τ20s로 돌아온다 ──
    this.knock = Math.min(KNOCK_MAX, this.knock * Math.exp(-dt / KNOCK_TAU) + pathLen * (p?.ripe ?? 0) * KNOCK_GAIN);
    if (this.knock < 1e-5) this.knock = 0;
    u.uSink.value = this.sinkNow();
    u.uHeight.value = this.height(); // 피크 꺼짐 보이기(e) — 옆벽 수위선도 같이 내려간다

    // ── 줄무늬 — 손으로 저으면 한 바퀴마다 ×0.38, 아니면 혼자 τ6s. 손이 0.05 아래로 떨어뜨린 순간 = 다 섞임 ──
    if (this.marble > 0) {
      const before = this.marble;
      this.marble *= hand ? Math.pow(MARBLE_PER_LOOP, pathLen / MARBLE_LOOP) : Math.exp(-dt / MARBLE_TAU);
      if (this.marble < MARBLE_DONE) {
        if (hand && before >= MARBLE_DONE) {
          this.mixedThisFrame = true;
          this.mixGlint = MIX_GLINT;
        }
        if (hand || this.marble < 0.005) this.marble = 0;
      }
    }
    u.uMarble.value = this.marble;
    u.uMarblePhase.value = this.marblePhase;
    this.mixGlint *= Math.exp(-dt / MIX_GLINT_TAU);

    // ── hooch 탁해짐 — 젓는 동안 오르고 천천히 가라앉는다(sim hooch 값은 그대로) ──
    this.murk += ((stirring ? 1 : 0) - this.murk) * (1 - Math.exp(-dt / (stirring ? MURK_RISE_TAU : MURK_FALL_TAU)));
    if (this.murk < 1e-4) this.murk = 0;

    // ── 들기 — 꼬집기 상태기(버팀 · 항복 · 찢김 · 끊김 · 털썩 · 접힘) → 깔때기 높이 · 흔들림 스프링(ω5.5 · ζ = grabReturnZeta) · 기둥 uniform.
    //    잠금값 ζ 0.956의 자리 = 깔때기가 「무겁게 되돌아온다」(그대로). 모든 감쇠는 1-exp(-k·dt) 주사율 독립 ──
    {
      const czeta = this.grabTuning.grabReturnZeta ?? p?.grabReturnZeta ?? 0.95;
      const rig = this.rig;
      rig.tick(dt, this.env());
      const att = rig.attached();
      // 밑동 흔들림은 손에서 떨어진 순간부터 풀린다 — 끊긴 뒤 손가락을 든 채면 놓을 때(≈2s 뒤) 녹은 자리의 혹이 옆으로 밀렸다(v8 r2 peak 4.97, spec_v8b §4)
      const swayHeld = this.grabbing && att > 0;
      if (!swayHeld) {
        if (!Number.isFinite(this.grabReleaseAge)) {
          this.grabReleaseAge = 0;
          this.swayRest.copy(this.sway).multiplyScalar(this.grabTuning.grabCreepGain ?? p?.grabCreepGain ?? 0.5);
        } else this.grabReleaseAge += dt;
      }
      const pull = rig.pulled();
      for (const e of rig.events) {
        // 착지 — 반죽 전신 출렁 1회(접힘 방향, 되직은 덜). ② 항복 내려앉음은 아래 hRaw의 YIELD_SAG 한 번(τ0.16)
        if (e.kind === 'land') {
          const k = LAND_KICK * (0.4 + 0.6 * this.sloshGain());
          this.wobbleVel.x += Math.cos(rig.pile[4]) * k;
          this.wobbleVel.y += Math.sin(rig.pile[4]) * k;
        }
      }
      // 깔때기 — h = 0.22D × 상태 배율(되직 0.8 · 묽음 0.45) × (1 − e^(−든 높이/0.25D)) × 붙은 몫(끌수록 오르다 포화), 뻗은 뒤 × 0.7,
      // 손끝보다 τ0.16 늦게. 기둥 없는 휴면은 조금만. 병 입구(JAR_HEIGHT − 0.1) 위로는 안 솟는다(기둥 위쪽은 손끝까지 넘어도 된다)
      // 버팀(짧은 혹, 긴 기둥 몫 uPinchC.z < 1) 동안은 둔덕을 MOUND_HOLD배로 — 둔덕(0.45D)이 혹(0.3D)보다 넓게 솟아 넓은 둔덕 위
      // 꼭지혹 2단이었다(v8d b peak 1.0~1.13, spec_v8d §5). 긴 기둥(늘어남)은 1배 그대로
      const hRaw = MOUND_HMAX * rig.funnelK * (1 - Math.exp(-pull / MOUND_D)) * att * (rig.none ? NONE_MOUND : 1)
        * (rig.yielded ? YIELD_SAG : 1) * (rig.none ? 1 : MOUND_HOLD + (1 - MOUND_HOLD) * rig.col[10]);
      this.moundTgt += (hRaw - this.moundTgt) * (1 - Math.exp(-dt / MOUND_LAG_TAU));
      if (hRaw === 0 && this.moundTgt < 1e-6) this.moundTgt = 0;
      const hT = Math.min(this.moundTgt, Math.max(0, JAR_HEIGHT - 0.1 - this.topY()));
      const w = this.grabParam('omega');
      this.moundV += (-w * w * (this.moundH - hT) - 2 * czeta * w * this.moundV) * dt;
      this.moundH += this.moundV * dt;
      // 흔들림 목표 — 잡는 동안 끝점 수평 오프셋 × 0.15(상한 0.1), 놓은 뒤엔 creepGain 몫이 releaseTau로 풀린다
      const tgt = this.swayTgt;
      if (swayHeld) {
        const off = this.tipOff;
        rig.tipOffset(off);
        tgt.set(off[0] / XZ_SCALE, off[1] / XZ_SCALE).multiplyScalar(SWAY_GAIN);
        if (tgt.length() > SWAY_MAX) tgt.setLength(SWAY_MAX);
      } else {
        tgt.copy(this.swayRest).multiplyScalar(Math.exp(-this.grabReleaseAge / this.grabParam('releaseTau')));
      }
      this.swayV.x += (-w * w * (this.sway.x - tgt.x) - 2 * czeta * w * this.swayV.x) * dt;
      this.swayV.y += (-w * w * (this.sway.y - tgt.y) - 2 * czeta * w * this.swayV.y) * dt;
      this.sway.x += this.swayV.x * dt;
      this.sway.y += this.swayV.y * dt;
      if (!this.grabbing && hT === 0 && Math.abs(this.moundH) < 1e-5 && Math.abs(this.moundV) < 1e-4
        && tgt.lengthSq() < 1e-10 && this.sway.lengthSq() < 1e-10 && this.swayV.lengthSq() < 1e-8) {
        this.moundH = this.moundV = 0;
        this.sway.set(0, 0);
        this.swayV.set(0, 0);
      }
      // 끌림 세기 — 붙은 몫 × smoothstep(0, 0.6D, 든 높이). 가닥 없는 휴면은 0(§6-2 둔덕만).
      // 높이 주름 · 무늬 끌림(uGrab.z)은 τ0.12s로 차고, 놓거나 끊기면 τ0.8s로 풀리며 최고치 20%가 τ8s 흔적으로 남는다
      const tension = rig.none ? 0 : att * THREE.MathUtils.smoothstep(pull, 0, 0.6 * D_W);
      this.pullFast = tension > this.pullFast
        ? this.pullFast + (tension - this.pullFast) * (1 - Math.exp(-dt / PULL_RISE_TAU))
        : tension + (this.pullFast - tension) * Math.exp(-dt / PULL_FALL_TAU);
      this.pullSlow = Math.max(this.pullSlow * Math.exp(-dt / PULL_KEEP_TAU), PULL_KEEP * this.pullFast);
      if (this.pullFast < 1e-4) this.pullFast = 0;
      if (this.pullSlow < 1e-3) this.pullSlow = 0; // 0.1% 아래는 안 보인다 — 1분 안에 정확히 0(셰이더 분기 끔)
      // 접힘 — 휴면 · 곰팡이(기둥 없음)는 안 생긴다(상태기가 만들지 않는다)
      const pl = rig.pile;
      (u.uGrab.value as THREE.Vector4).set(Math.max(0, this.moundH), this.pullFast, Math.max(this.pullFast, this.pullSlow), 0);
      (u.uGrabPos.value as THREE.Vector2).copy(this.grabAnchor).add(this.sway);
      (u.uPile.value as THREE.Vector4).set(pl[0] / XZ_SCALE, pl[1] / XZ_SCALE, pl[2], pl[3] / XZ_SCALE);
      (u.uPileB.value as THREE.Vector4).set(pl[4], pl[5], rig.relax, rig.melt);
      this.writePinch();
    }

    // ── 손끝 패임 · 앞 둔덕 — 젓는 동안 손 속도만큼 파이고(τ0.08s), 놓으면 묽으면 τ0.3s · 되직하면 1.6s(피크는 덜) 메워진다 ──
    const tip = u.uTip.value as THREE.Vector4;
    const tb = u.uTipB.value as THREE.Vector4;
    if (stirring) {
      const live = DENT_A * (DENT_FLUID_K + (1 - DENT_FLUID_K) * thick)
        * Math.min(1, 0.35 + (this.stirVec.length() / 0.22) * 0.65);
      this.dentH += (live - this.dentH) * (1 - Math.exp(-dt / 0.08));
      this.bowH = this.dentH * BOW_GAIN * (0.4 + 0.6 * thick);
      // 꼬리 = τ초 전 손끝(되기별 지연) — 머리에서 꼬리까지 패임이 얕아지며 남는다
      const tipTau = THREE.MathUtils.lerp(THREE.MathUtils.lerp(TIP_TAU_FLUID, TIP_TAU_THICK, thick), TIP_TAU_PEAK, ripe);
      this.tipAt(t - tipTau, this.tailTmp);
      const dx = stirPos.x - this.tailTmp.x;
      const dz = stirPos.y - this.tailTmp.y;
      const dl = Math.hypot(dx, dz);
      if (dl > 0.02) this.tipDir.set(dx / dl, dz / dl);
      else if (this.stirVecTarget.lengthSq() > 1e-6) this.tipDir.copy(this.stirVecTarget).normalize();
      tip.x = stirPos.x;
      tip.y = stirPos.y;
      tb.set(this.tipDir.x, this.tipDir.y, this.tailTmp.x, this.tailTmp.y);
    } else {
      const fill = Math.exp(-dt / (this.tipFast ? STROKE_CANCEL_TAU
        : (FILL_TAU_FLUID + (FILL_TAU_THICK - FILL_TAU_FLUID) * thick) * (1 + FILL_TAU_RIPE * ripe)));
      this.dentH *= fill;
      this.bowH *= fill;
    }
    if (this.dentH < 1e-5) this.dentH = 0;
    if (this.bowH < 1e-5) this.bowH = 0;
    tip.z = this.dentH;
    tip.w = this.bowH;
    // 되기 · 숙성별 세기 — 되직은 굵고 무광, 피크는 중간 · 반들, 묽음은 주름 없이 광 흐름
    const byState = (fl: number, th: number, pk: number): number => THREE.MathUtils.lerp(THREE.MathUtils.lerp(fl, th, thick), pk, ripe);
    (u.uStirK.value as THREE.Vector4).set(
      STIR_FOLD * byState(FOLD_A_FLUID, FOLD_A_THICK, FOLD_A_PEAK),
      byState(MEM_GLOSS_FLUID, MEM_GLOSS_THICK, MEM_GLOSS_PEAK),
      FLOW_GLINT * (1 - thick) * (1 - ripe), 0);

    // ── 기포 — 젓는 동안 부상·팝 가속 (agitation) ──
    this.bubbles.update(t, p?.bubbleDensity ?? 0.4, p?.bubbleScale ?? 1, this.agitation);
    const posArr = u.uBumpPos.value as THREE.Vector2[];
    for (let i = 0; i < DYN_SLOTS; i++) posArr[i].set(this.bubbles.pos[i * 2], this.bubbles.pos[i * 2 + 1]);
    (u.uBumpAmp.value as Float32Array).set(this.bubbles.amp);
    (u.uBumpK.value as Float32Array).set(this.bubbles.k);

    // 젖은 광 — 상태 기본값 + 젓기 부스트
    u.uWet.value = Math.min(1, (p?.wet ?? 0) + 0.3 * this.agitation + this.mixGlint);

    u.uTime.value = shaderT;
    // ── 슬로싱 — 감쇠 진동자(1.5Hz). 액체일수록 오래 출렁(ζ 0.55→0.10).
    //    셰이더는 이 값을 "수면 기울기"(액체)와 잔여 강체 시프트(고체)로 나눠 그린다 ──
    if (stirring && this.stirDrivesWobble) {
      // 되직한 반죽은 젓는다고 판째 기울지 않는다 — 출렁 목표 × smoothstep(0.3, 0.7, fluidity)
      this.wobbleTgt.copy(this.stirVec).multiplyScalar(SLOSH_GAIN * this.sloshGain());
      if (this.wobbleTgt.length() > SLOSH_MAX) this.wobbleTgt.setLength(SLOSH_MAX);
    } else {
      this.wobbleTgt.set(0, 0);
    }
    {
      const om = 2 * Math.PI * 1.5;
      // 흐름 축 구동 — 구 liquidity에선 갓 밥준이 0.82라 ζ 0.18(=물, 5~6회 출렁)이었다.
      // 되직한 페이스트는 두 번 안쪽에서 멎는다. 시큼(fluidity 0.66)만 여전히 출렁의 무대
      const zeta = 0.62 - 0.5 * fluid;
      const wax = -om * om * (this.wobble.x - this.wobbleTgt.x) - 2 * zeta * om * this.wobbleVel.x;
      const waz = -om * om * (this.wobble.y - this.wobbleTgt.y) - 2 * zeta * om * this.wobbleVel.y;
      this.wobbleVel.x += wax * dt;
      this.wobbleVel.y += waz * dt;
      this.wobble.x += this.wobbleVel.x * dt;
      this.wobble.y += this.wobbleVel.y * dt;
      if (
        this.wobbleTgt.lengthSq() === 0 &&
        this.wobble.lengthSq() < 1e-8 &&
        this.wobbleVel.lengthSq() < 1e-6
      ) {
        this.wobble.set(0, 0);
        this.wobbleVel.set(0, 0);
      }
    }
    (u.uWobble.value as THREE.Vector2).copy(this.wobble);

    // ── 롱프레스 홀드 — 쥐는 동안 0.03까지 천천히, 떼면 easeOut (A1-15) ──
    if (this.holding || this.holdLevel > 0) {
      this.holdLevel = this.holding
        ? this.holdLevel + (1 - this.holdLevel) * (1 - Math.exp(-dt / HOLD_RISE_TAU))
        : this.holdLevel * Math.exp(-dt / HOLD_FALL_TAU);
      if (!this.holding && this.holdLevel <= 1e-4) this.holdLevel = 0;
      u.uPokeAmt.value = -HOLD_AMP * this.holdLevel;
      u.uPokeK.value = POKE_K0 / 2; // 덴트보다 넓게 — 부풂은 손끝보다 크다
    } else if (this.pokeAge < 8) {
      // ── 탭 자국 — 고체는 스프링(되튐 1회), 액체는 "넓어지며 얕아지는" 점성 아묾 ──
      this.pokeAge += dt;
      const a = this.pokeAge;
      const springAmt = this.pokeAmp * Math.exp(-5 * a) * Math.cos(12 * a);
      // 되직할수록(fluid 낮을수록) 자국이 오래 남는다 — 갓 밥준 τ≈1.33s, 시큼 τ≈0.77s
      const tauR = 0.35 + 1.25 * (1 - fluid);
      const viscAmt = (this.pokeAmp * Math.exp(-a / tauR)) / (1 + a / 0.9);
      // 되튐이냐 아묾이냐를 가르는 건 흐름이 아니라 **탄성**이다 — 기공이 받쳐야 튕긴다
      const amt = springAmt * ela + viscAmt * (1 - ela);
      u.uPokeAmt.value = Math.abs(amt) < 5e-4 && a > 1.1 ? 0 : amt;
      u.uPokeK.value = Math.max(POKE_K0 / (1 + (a / 0.9) * (0.35 + 0.65 * fluid)), POKE_K0 / 3);
      if ((u.uPokeAmt.value as number) === 0) this.pokeAge = Infinity;
    } else if ((u.uPokeAmt.value as number) !== 0) {
      u.uPokeAmt.value = 0;
    }
    this.recoverNaN();
  }

  /** 손끝 기록 — 꼬리(τ초 전 손끝) 찾기용 링버퍼 */
  private pushTip(t: number, at: THREE.Vector2): void {
    this.tipHistHead = (this.tipHistHead + 1) % TIP_HIST;
    const j = this.tipHistHead * 3;
    this.tipHist[j] = t;
    this.tipHist[j + 1] = at.x;
    this.tipHist[j + 2] = at.y;
    this.tipHistN = Math.min(this.tipHistN + 1, TIP_HIST);
  }

  /** 시각 tq의 손끝 — 기록을 거슬러 선형 보간. 기록이 그보다 짧으면(획 시작) 가장 옛 점 */
  private tipAt(tq: number, out: THREE.Vector2): void {
    const h = this.tipHist;
    let j = this.tipHistHead;
    out.set(h[j * 3 + 1], h[j * 3 + 2]);
    for (let n = 1; n < this.tipHistN; n++) {
      const k = (j - 1 + TIP_HIST) % TIP_HIST;
      if (h[k * 3] <= tq) {
        const f = THREE.MathUtils.clamp((tq - h[k * 3]) / Math.max(h[j * 3] - h[k * 3], 1e-6), 0, 1);
        out.set(h[k * 3 + 1] + (h[j * 3 + 1] - h[k * 3 + 1]) * f, h[k * 3 + 2] + (h[j * 3 + 2] - h[k * 3 + 2]) * f);
        return;
      }
      j = k;
      out.set(h[j * 3 + 1], h[j * 3 + 2]);
    }
  }

  /**
   * 소용돌이 노드 한 걸음 — 젓는 동안 각속도가 손 각속도 × 몫 × 가우스(반경 차)로 따라 붙고, 놓으면 되기별 τ로 멎는다(묽으면 더 돈다).
   * Θ += ω·dt(풀리지 않는다). 저은 자리 기억은 손끝의 재료 좌표(q)에 찍는다 — 각도까지 남고 반죽과 같이 돈다(2차). 동적 기포도 같은 Θ로 돈다.
   * 테두리(r/R 0.8→1.0)는 유리에 붙어 돌지 않는다(vert pin과 같은 띠)
   */
  private stepSwirl(dt: number, stirring: boolean, da: number, tipP: THREE.Vector2, thick: number, ripe: number): void {
    const rTip = tipP.length();
    const lerp = THREE.MathUtils.lerp;
    const w = R_BODY * lerp(SWIRL_W_FLUID, SWIRL_W_THICK, thick);
    const gain = lerp(SWIRL_GAIN_FLUID, SWIRL_GAIN_THICK, thick);
    const omegaH = dt > 0 ? da / dt : 0;
    const kRise = 1 - Math.exp(-dt / SPIN_RISE_TAU);
    const kSpin = Math.exp(-dt / lerp(SPIN_TAU_FLUID, SPIN_TAU_THICK, thick));
    const kMem = Math.exp(-dt / lerp(lerp(MEM_TAU_FLUID, MEM_TAU_THICK, thick), MEM_TAU_PEAK, ripe));
    for (let i = 0; i < SWIRL_N; i++) {
      const ri = (i / (SWIRL_N - 1)) * R_BODY;
      const pin = 1 - THREE.MathUtils.smoothstep(ri / R_BODY, 0.8, 1.0);
      if (stirring) {
        const tgt = gain * omegaH * Math.exp(-(((ri - rTip) / w) ** 2)) * pin;
        this.swOmega[i] += (tgt - this.swOmega[i]) * kRise;
      } else {
        this.swOmega[i] *= kSpin;
        if (Math.abs(this.swOmega[i]) < 1e-4) this.swOmega[i] = 0;
      }
      this.swTheta[i] += this.swOmega[i] * dt;
    }
    // 동적 기포(4개)도 제 반경의 각속도로 돈다 — 점이 손을 따라 돈다(S2)
    this.bubbles.swirl((r) => this.nodeLerp(this.swOmega, r) * dt);
    // 저은 자리 기억 — 옅어지고, 젓는 동안 손끝의 재료 좌표 둘레를 채운다(최댓값 — 지나간 자리 = 1)
    for (let k = 0; k < this.mem.length; k++) this.mem[k] = this.mem[k] * kMem < 1e-4 ? 0 : this.mem[k] * kMem;
    if (stirring) {
      const th = this.nodeLerp(this.swTheta, rTip);
      const qx = Math.cos(th) * tipP.x + Math.sin(th) * tipP.y;
      const qz = -Math.sin(th) * tipP.x + Math.cos(th) * tipP.y;
      for (let i = 0; i < MEM_NR; i++) {
        const ri = (i / (MEM_NR - 1)) * R_BODY;
        for (let j = 0; j < MEM_NA; j++) {
          const aj = ((j / MEM_NA) - 0.5) * 2 * Math.PI;
          const d = Math.hypot(ri * Math.cos(aj) - qx, ri * Math.sin(aj) - qz);
          const c = 1 - THREE.MathUtils.smoothstep(d, MEM_IN, MEM_OUT);
          const k = i * MEM_NA + j;
          if (c > this.mem[k]) this.mem[k] = c;
        }
      }
    }
    // 전단 상한 — 이웃 노드 Θ 차가 SHEAR_MAX를 넘으면 둘을 같은 만큼 당긴다(합 = 평균 회전은 그대로). 2회전: 상한이 없으면 3바퀴 만에
    // 모틀 · 잔 광택 · 나선이 반경 사이 전단에 감겨 과녁 · 레코드판 동심원이 됐다(.work/r1 · r2). 반죽은 점성으로 이어져 덩어리째 돈다(S2)
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < SWIRL_N - 1; i++) {
        const d = this.swTheta[i] - this.swTheta[i + 1];
        const ex = Math.abs(d) - SHEAR_MAX;
        if (ex > 0) {
          const e = (ex / 2) * Math.sign(d);
          this.swTheta[i] -= e;
          this.swTheta[i + 1] += e;
        }
      }
    }
    // 오래 저으면 Θ가 커진다 — 64바퀴를 넘으면 노드 전부를 같은 2π 배수만큼 당겨 float 정밀도만 지킨다(노드 사이 차 = 무늬는 그대로)
    if (Math.abs(this.swTheta[SWIRL_N - 1]) > 128 * Math.PI) {
      const wrap = Math.round(this.swTheta[SWIRL_N - 1] / (2 * Math.PI)) * 2 * Math.PI;
      for (let i = 0; i < SWIRL_N; i++) this.swTheta[i] -= wrap;
    }
    this.writeStir();
  }

  /** 반경 노드 배열을 r에서 선형 보간 — 셰이더 swirlAt과 같은 식 */
  private nodeLerp(a: Float32Array, r: number): number {
    const x = Math.min(Math.max(r / R_BODY, 0), 1) * (SWIRL_N - 1);
    const i = Math.min(Math.floor(x), SWIRL_N - 2);
    return a[i] + (a[i + 1] - a[i]) * (x - i);
  }

  /** 소용돌이 노드 → uSwirl (Θ, ω) · 저은 자리 기억 → uMem(vec4 묶음) */
  private writeStir(): void {
    const sw = this.material.uniforms.uSwirl.value as THREE.Vector2[];
    for (let i = 0; i < SWIRL_N; i++) sw[i].set(this.swTheta[i], this.swOmega[i]);
    const mv = this.material.uniforms.uMem.value as THREE.Vector4[];
    for (let k = 0; k < mv.length; k++) mv[k].fromArray(this.mem, k * 4);
  }

  /** 시계 역행 — CPU 시각 기록을 delta만큼 옮긴다(프로덕션 performance.now는 단조라 방어용) */
  private shiftClock(delta: number): void {
    this.lastStirInputT += delta;
    this.lastHandStirT += delta;
    for (let i = 0; i < TIP_HIST; i++) this.tipHist[i * 3] += delta;
    this.bubbles.shift(delta);
  }

  /**
   * NaN 자가 복구(A1-18) — 상태기 하나가 NaN이 되면(시계 역행 · 비정상 입력) 영원히 고착되던 것을 끊는다.
   * NaN 비교는 늘 거짓이라 기존 「작으면 0」 수렴 조건으로는 빠져나오지 못했다.
   */
  private recoverNaN(): void {
    const ok = (v: THREE.Vector2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);
    const zero = (...vs: THREE.Vector2[]): void => vs.forEach((v) => v.set(0, 0));
    if (!ok(this.wobble) || !ok(this.wobbleVel)) zero(this.wobble, this.wobbleVel);
    if (!ok(this.stirVec) || !ok(this.stirVecVel)) zero(this.stirVec, this.stirVecVel);
    // 당기기 — 가닥 상태기에 NaN이 섞이면 가닥 · 더미를 지운다(§6-14), 밑동 스프링은 0으로
    if (!this.rig.finite()) {
      this.rig.reset();
      this.grabbing = false; // 상태기가 잡기를 놓았으니 grabMove3 · grabEnd도 맞춘다(검토 C-2)
    }
    if (!ok(this.sway) || !ok(this.swayV) || !ok(this.swayRest) || !Number.isFinite(this.moundH + this.moundV)) {
      this.resetMound();
    }
    if (!Number.isFinite(this.holdLevel)) this.holdLevel = 0;
    const u = this.material.uniforms;
    (u.uWobble.value as THREE.Vector2).copy(this.wobble);
    (u.uStirVec.value as THREE.Vector2).copy(this.stirVec);
    if (!Number.isFinite(this.knock)) this.knock = 0;
    if (!Number.isFinite(this.marble)) this.marble = 0;
    if (!Number.isFinite(this.marblePhase)) this.marblePhase = 0;
    if (!Number.isFinite(this.murk)) this.murk = 0;
    if (!Number.isFinite(this.dentH + this.bowH)) this.dentH = this.bowH = 0;
    if (!Number.isFinite(this.pullFast + this.pullSlow)) this.pullFast = this.pullSlow = 0;
    if (![this.swTheta, this.swOmega, this.mem, this.memSnap].every((a) => a.every(Number.isFinite))) {
      for (const a of [this.swTheta, this.swOmega, this.mem, this.memSnap]) a.fill(0);
    }
    this.writeStir();
    if (!Number.isFinite(u.uPokeAmt.value as number)) u.uPokeAmt.value = 0;
  }
}
