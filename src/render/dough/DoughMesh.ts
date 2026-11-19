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
import { createFillGeometry, FILL_RADIUS, HOOCH_COVER, MARBLE_GLSL, SURF_TILT } from '../jar';
import {
  CELL_BUBBLE, D_W, DOUGH_ALBEDO, DOUGH_SHADE, FBM_GLSL, MOUND_H, StrandMesh, fbm2, strandMix,
  type StrandBreak, type StrandEnv,
} from './StrandMesh';
import { CoilMesh } from './CoilMesh';

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

// ── 고랑 자취(2026-11-19 섞는 맛 M2) — 실 능선 4점 가우시안 솟음을 버리고 손끝 자취를 고랑으로 판다.
//    점 TRAIL_N개를 잇는 선분 TRAIL_N − 1개(캡슐 거리), 단면 = U자 + 입술(grooveProf, 시각 고침 2차) — 평평한 바닥 −A · 가파른 벽 · 좁은 마루 +0.5A.
//    맨 끝 점(머리)은 손끝을 따라다니다 TRAIL_STEP만큼 멀어지면 굳고 새 머리가 생긴다 → 손끝 밑 = 고랑 끝의 둥근 패임 ──
/** 자취 점 수 — 셰이더 uTrail* 길이(선분 루프는 TRAIL_N − 1)와 같다(테스트가 잠근다).
 *  시각 고침 3차 S-1: 8 → 15 · 간격 0.19 → 0.095 — 원 젓기 반경 0.55R에서 선분 하나가 0.49rad라 U자 벽이 13각형 토막으로 꺾였다
 *  (hi2_stir). 0.095면 선분당 0.25rad. 15 = 굳은 13선분 × 0.095 = 1.24 ≈ 옛 6 × (0.19 + 넘침 ≈ 0.02) — 굳는 점을 정확히 STEP에 두며
 *  (pushTrail) 넘침이 빠졌다. 자취 길이 · F3 0.58바퀴 그대로. 메모 16은 0.62바퀴를 넘는다 */
export const TRAIL_N = 15;
/** 갓 판 고랑 깊이(월드) — 셰이더 TRAIL_A와 단일 소스(TRAIL_GROOVE에 끼운다).
 *  추정 — 실측 없음(위 시점뿐, 8uAT 0:48 「두툼한 고랑」). 폭을 3배로 넓혀 기울기가 √3배 준 대비를 지키는 값 */
const TRAIL_A = 0.035;
/** 단면 = U자 + 입술(시각 고침 2차 B-4) — x = 옆 거리 ÷ 반폭. 바닥 평평(x < 0.55) · 벽 가파름(0.55~1.0 smoothstep, 벽 끝 = 마루 꼭대기) ·
 *  마루 높이 0.5A, 바깥쪽은 1.0~1.8에 걸쳐 완만히 내려온다. 1차 가우시안 f = −A(1 − 3q)e^(−q)는 2배 녹화에서도 흐린 물결 · 얼룩으로
 *  읽혔다(hi1_stir). 실물 8uAT 47.7~49.3 겹 고랑 = 홈 바닥 가는 그늘 선 + 마루 밝은 띠. 바닥이 평평해 어둡지 않고, 그늘은 빛 반대쪽 벽에만 선다.
 *  바닥 0.55 · 벽 끝 1.0 · 높이 0.5A는 메모 B-4 그대로. 바깥 비탈 1.8은 메모(마루 폭 0.15)에서 벗어남 — 0.15 폭 대칭 마루는 양 비탈이
 *  다 가팔라 밝은 선 + 짙은 선이 겹친 유리 테 · 투명 접시로 읽혔다(.work/feel2/fix2_1). 추정 — 실측 없음(높이를 못 잰다) */
const TRAIL_FLOOR = 0.55;
const TRAIL_CREST = 1.0;
const TRAIL_LIP_OUT = 1.8;
const TRAIL_LIP_H = 0.5;
/** 이음매 부드러운 최소 온도 k(q 단위) — 로그합지수 smin(시각 고침 3차 S-1). 두 칸 몫이 12~88%로 갈리는 폭 |Δq| < 2k = 0.5가
 *  2차 다항 smin 폭(0.5)과 같다. 추정 — 실측 없음 */
const TRAIL_SEAM_Q = 0.25;
/** 이 q 밖 칸은 합에 안 더한다 — e^(−12/0.25) ≈ 1e-21. 고랑은 q 9에서 끝나 합 결과에 안 보인다(루프 비용만 줄인다) */
const TRAIL_Q_CUT = 12;
/** 고랑 높이를 버텍스 변위에만 곱하는 배율(시각 고침 3차 S-2, hi2 판) — 42° 시선에서 앞 입술이 가파른 벽을 가리는데 그 가림이
 *  삼각형(칸 ≈ 0.02, 벽 폭 ≈ 2.5칸) 단위라 고랑 테두리가 톱니가 됐다. 프래그 기울기는 같은 문자열의 해석적 미분 그대로(배율 없음)라
 *  음영 · 단면 읽힘은 그대로이고 실루엣 가림만 줄어든다. 0.35 = 메모 출발값. 추정 — 실측 없음(톱니가 2배 판에서 사라지는 값) */
const GROOVE_VERT_GAIN = 0.35;
const TRAIL_STEP = 0.095;    // 자취 점 간격(오브젝트) — 굳은 12선분 ≈ 손끝 뒤 0.6바퀴(F3: 옛 0.13 × 6은 쉼표 한 토막으로 읽혔다). 시각 고침 3차 0.19 → 0.095
/** 꼬리 가늘어짐 길이 = 0.38(오브젝트) — 옛 0.19 간격 두 점 그대로. 점 수로 = 0.38 / TRAIL_STEP */
const TRAIL_TAIL_PTS = Math.round(0.38 / TRAIL_STEP);
/** 잔줄 띠(머리 뒤 몫) — 머리에서 0.38까지 1, 0.665에서 0(옛 0.19 간격 「머리 뒤 2~3.5선분」 그대로, §6-18). 선분 번호 단위로 */
const RIDGE_FROM_I = TRAIL_N - 1 - 0.665 / TRAIL_STEP;
const RIDGE_RAMP_I = (0.665 - 0.38) / TRAIL_STEP;
/** 손가락 반폭(오브젝트) — S1a fGJz 55.7 · 8uAT 0:48 고랑 폭 ≈ 도구 폭, 손가락 0.18D */
const FINGER_HALF = (0.09 * D_W) / XZ_SCALE;
/** 갓 판 고랑 첨도 ≈ 31 — 반폭(q 0.5) = 손가락 반폭(S1a). 나이 들수록 넓어진다 */
const TRAIL_K0 = 0.5 / FINGER_HALF ** 2;
/** 넓어짐 하한 — §6-10 K0/1.5 (K0/3이면 둔덕 마루가 원 젓기 반경에 모여 도넛 · 과녁) */
const TRAIL_K_MIN = TRAIL_K0 / 1.5;
/** 앞 둔덕(S3) — 머리 + 진행 방향 × 1.2 · 반폭, 지름 0.25D(UPQ94 4s 0.4~0.5D ×0.65). 첨도는 반폭(q 0.5) 기준 */
const BOW_AHEAD = 1.2 * FINGER_HALF;
const BOW_K = 0.5 / ((0.125 * D_W) / XZ_SCALE) ** 2;
/** 앞 둔덕 높이 = 머리 깊이 × 1.2 × (0.4 + 0.6·되기) — 추정 — 실측 없음(위 시점뿐, kib6 149 밀려 오른 더미).
 *  시각 고침 1차 B: 0.8 → 1.2(× 1.5) — 2배 녹화에서 머리 앞 둔덕이 안 보였다(UPQ94 4s 앞 더미) */
const BOW_GAIN = 1.2;
/** 잔줄(S1b, 프래그 노멀만) — 간격 = 손가락 폭 × 0.2 = 0.036D · 띠 반폭 = 손가락 폭 × 1.5 (UPQ94 3s 칸4) */
const RIDGE_GAP = (0.036 * D_W) / XZ_SCALE;
const RIDGE_BAND = (1.5 * 0.18 * D_W) / XZ_SCALE;
/** 잔줄 기울기 진폭 — 추정 — 실측 없음(높이를 못 잰다). 시각 고침 2차 B-4: 0.05 → 0.075(× 1.5, 메모 상한) — 2배 녹화(fix2_2)에서도
 *  머리 뒤 잔줄이 안 보였다. 1차 가우시안 고랑 최대 기울기(≈0.37)의 약 1/5 */
const RIDGE_SLOPE = 0.075;
/** 저은 띠 기억(S2 · S4 · S8) — W는 가운데 둘레를 돈 각도로 쌓인다(한 바퀴 = 1, §6-11).
 *  τ_W = 2 + 4·되기 — S4 UPQ94 2s→3s 저은 자리 약 1s에 매끈 · 8-13s 5s 뒤 다시 거칠어짐 */
const STIRMEM_TAU0 = 2;
const STIRMEM_TAU_THICK = 4;
/** 젓는 반경 지수 평균 τ(s) — 추정 — 실측 없음(손끝 반경 떨림만 거른다) */
const STIRMEM_R_TAU = 0.3;
/** 띠 폭 = R × mix(0.18, 0.55, 1 − 되기) — S2 되직은 도구 둘레만(8uAT 0:48) · 묽음은 지름 거의 전체(8uAT 1:51) */
const STIRMEM_W_THICK = 0.18;
const STIRMEM_W_FLUID = 0.55;
const TRAIL_TAU_THICK = 1.6; // 메워짐 τ(s) — 되직(stirThickness 1)
const TRAIL_TAU_FLUID = 0.3; //                묽음(0)
const TRAIL_TAU_RIPE = 1.5;  // 피크(ripe 1)는 τ × (1 + 1.5) — 공기가 빠진 자리는 덜 메워진다
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
 * 고랑 함수 — 버텍스(높이 x)와 프래그(기울기 yz · 갓 저은 정도 w)가 이 소스 하나를 쓴다(규칙 8).
 * 거리장 = 선분 전부의 누적 부드러운 최소(로그합지수, 시각 고침 3차 S-1). 합이라 선분 순서와 무관하고, 가장 가까운 선분이
 * 바뀌는 자리(꺾인 자취 안쪽)에 곧은 모서리가 서지 않는다. 이웃 선분은 꼭짓점을 나눠 가져 그 둘레에서 둘 다 같은 q를 내므로
 * 그대로 더하면 꼭짓점마다 두 번 패여 구슬 줄 · 꽃잎 테두리가 된다 — 켜진 이웃 사이 꼭짓점 몫을 한 번 뺀다(포함-배제).
 * uTrailK 음수 = 그 점이 새 획의 시작이라 앞 점과 잇지 않는다(크기는 절댓값).
 * 앞 둔덕(uBow, S3)도 여기서 더한다 — vert · frag 짝. 솟는 항(양옆 둔덕 · 앞 둔덕)은 윗물 아래서 riseK()만큼 눌린다(§6-9).
 * tl = 같은 가중으로 섞은 (부호 있는 옆 거리, 진행 방향 xz, 머리 뒤 몫) — 프래그 잔줄만 쓴다(vert는 버린다).
 * 버텍스는 높이에 GROOVE_VERT_GAIN을 곱한다(가림 톱니, S-2) — 프래그 기울기는 배율 없음.
 * 앞에 SURF_TILT(hoochSpread)가 끼워져 있어야 한다.
 */
export const TRAIL_GROOVE = /* glsl */ `
const float TRAIL_A = ${TRAIL_A};
const float TRAIL_FLOOR = ${TRAIL_FLOOR};
const float TRAIL_CREST = ${TRAIL_CREST.toFixed(1)};
const float TRAIL_LIP_OUT = ${TRAIL_LIP_OUT};
const float TRAIL_LIP_H = ${TRAIL_LIP_H};
const float TRAIL_SEAM_Q = ${TRAIL_SEAM_Q};
const float TRAIL_Q_CUT = ${TRAIL_Q_CUT.toFixed(1)};
const float GROOVE_VERT_GAIN = ${GROOVE_VERT_GAIN};
const float RIDGE_GAP = ${RIDGE_GAP};
const float RIDGE_BAND = ${RIDGE_BAND};
const float RIDGE_SLOPE = ${RIDGE_SLOPE};
// 솟는 항 배율 — 윗물 덮인 반죽은 덜 솟는다(§6-9). 고랑 양옆 둔덕 · 앞 둔덕 · 밑동 둔덕 · 더미가 같이 쓴다
float riseK() { return 1.0 - 0.85 * hoochSpread(uHooch); }
// U자 + 입술 단면 — x = 옆 거리 ÷ 반폭 → (높이, d높이/dx). 높이와 기울기를 같은 식의 해석적 미분으로 함께 낸다(vert · frag 짝).
// 스칼라만 써서 시험이 이 문자열을 그대로 수치 미분과 대조한다. 솟는 마루만 rise(윗물 덮임)로 누른다
// 벽 w = smoothstep(바닥, 벽 끝) · 바깥 비탈 o = smoothstep(벽 끝, 바깥) — 두 구간이 겹치지 않아 x = 벽 끝에서 기울기 0으로 이어진다
vec2 grooveProf(float x, float A, float rise) {
  float t = clamp((x - TRAIL_FLOOR) / (TRAIL_CREST - TRAIL_FLOOR), 0.0, 1.0);
  float w = t * t * (3.0 - 2.0 * t);
  float dw = 6.0 * t * (1.0 - t) / (TRAIL_CREST - TRAIL_FLOOR);
  float u = clamp((x - TRAIL_CREST) / (TRAIL_LIP_OUT - TRAIL_CREST), 0.0, 1.0);
  float o = u * u * (3.0 - 2.0 * u);
  float du = 6.0 * u * (1.0 - u) / (TRAIL_LIP_OUT - TRAIL_CREST);
  float lip = TRAIL_LIP_H * A * rise;
  return vec2(-A * (1.0 - w) + lip * w * (1.0 - o),
              A * dw + lip * (dw * (1.0 - o) - w * du));
}
// 단면 하나 — (높이, 기울기 xz, 갓 저은 정도). q = 옆 거리² × K, ∇q는 부르는 쪽이 준다. x = √(2q)라 반폭(q 0.5) = 손가락 반폭(S1a)
vec4 grooveAt(float q, float A, vec2 gq) {
  if (q > 9.0) return vec4(0.0);
  float x = sqrt(2.0 * max(q, 0.0));
  vec2 pr = grooveProf(x, A, riseK());
  // ∇x = ∇q / x — 바닥(x < 0.55)은 평평해 x → 0에서도 기울기 0
  return vec4(pr.x, pr.y * gq / max(x, 1e-4), clamp(A / TRAIL_A, 0.0, 1.0) * exp(-0.7 * q));
}
// 누적 부드러운 최소 한 칸 — 가중 sg·e^(−q/k)를 합 S에 더하고, 같은 가중으로 섞을 값(∇q · 깊이 g, 기울기 방향 u, 잔줄 t)도 더한다.
// sg = +1 선분 · −1 꼭짓점(포함-배제). 먼 칸(q ≥ TRAIL_Q_CUT)은 건너뛴다 — 꼭짓점 q ≥ 양옆 선분 q라 빼는 몫이 더한 몫을 넘지 않는다
void seamAdd(inout float S, inout vec3 G, inout vec2 U, inout vec4 T, float q, float sg, vec3 g, vec2 u, vec4 t) {
  if (q >= TRAIL_Q_CUT) return;
  float w = sg * exp(-q / TRAIL_SEAM_Q);
  S += w;
  G += w * g;
  U += w * u;
  T += w * t;
}
vec4 trailGroove(vec2 p, out vec4 tl) {
  // 거리장 q = −k·ln Σ e^(−q_i/k)(선분 전부의 로그합지수 smin) − 이웃 사이 꼭짓점 몫. 합이라 선분 순서와 무관하다.
  // 시각 고침 3차 S-1: 2차의 「가장 가까운 둘만 smin」은 셋째 선분이 자리를 바꾸는 곳에 곧은 모서리가 남았다(fix2_3b).
  // 한 칸뿐이면 정확히 그 q, 바깥쪽 꼭짓점(두 선분이 같은 꼭짓점을 봄)은 둘을 더하고 꼭짓점을 빼 정확히 꼭짓점 q — 꽃잎 · 구슬이 없다.
  // 선분은 이웃 꺾임만큼 활꼴로 휘고(윤곽), 기울기 방향은 꼭짓점 접선(이웃 방향 평균)을 선분 따라 보간한 방향(음영) — 곧은 선분의
  // 기울기는 선분마다 한 방향이라 0.4rad 꺾임에서 면마다 밝기가 다른 다각형으로 칠해졌다(fix3_1 fastcircle). 크기는 거리장 그대로(|∇q|).
  // 루프 안은 거리 · 방향 · 머리 몫 · 합만, 단면 · 기울기(grooveAt)는 루프 밖 한 번
  float S = 0.0;
  vec3 G = vec3(0.0);   // Σ w · (∇q, 깊이)
  vec2 U = vec2(0.0);   // Σ w · 보간한 기울기 방향
  vec4 T = vec4(0.0);   // Σ w · tl
  bool on = false;      // 앞 선분이 켜져 있나 — 둘 다 켜졌을 때만 나눈 꼭짓점을 뺀다
  vec2 dnP = vec2(0.0);
  for (int i = 0; i < ${TRAIL_N - 1}; i++) {
    float kb = uTrailK[i + 1];
    if (kb < 0.0 || max(uTrailAmp[i], uTrailAmp[i + 1]) < 1e-5) { on = false; continue; }
    vec2 a = uTrailPos[i];
    vec2 ab = uTrailPos[i + 1] - a;
    float il = inversesqrt(max(dot(ab, ab), 1e-8));
    vec2 dn = ab * il;
    float hr = dot(p - a, dn) * il;
    float h = clamp(hr, 0.0, 1.0);
    vec2 d = p - a - ab * h;
    // 먼 선분은 나머지(방향 · 휨 · 합)를 건너뛴다 — 활꼴 거리 ≥ 곧은 거리 − 휨(≤ 0.005)이라 0.9배 여유, 끝 꼭짓점도 더 멀어 같이 빠진다.
    // 윗면 대부분은 자취에서 멀어 선분마다 이 몇 줄만 돈다(시각 고침 3차 비용)
    if (dot(d, d) * min(abs(uTrailK[i]), kb) * 0.9 >= TRAIL_Q_CUT) { on = true; dnP = dn; continue; }
    // 다음 선분이 켜져 있으면 끝 접선 = 두 방향 평균. 획 끝(앞 · 뒤 없음)은 제 방향 그대로
    int j = min(i + 2, ${TRAIL_N - 1});
    bool nx = i < ${TRAIL_N - 2} && uTrailK[j] >= 0.0 && max(uTrailAmp[i + 1], uTrailAmp[j]) >= 1e-5;
    vec2 dnN = nx ? normalize(uTrailPos[j] - uTrailPos[i + 1] + vec2(1e-6, 0.0)) : dn;
    vec2 tA = on ? dn + dnP : dn;
    vec2 tB = dn + dnN;
    // 선분을 활꼴로 휜다 — 양 끝 꺾임(sin)의 평균 φ만큼 도는 원호를 포물선 y = φ·L/2·h(1 − h)로(작은 각, 꺾임 둘의 합 × L/4). 꼭짓점은 그대로 지나고 끝 접선이
    // 이웃과 반씩 나눠 이어진다(G1). 곧은 선분이면 원 젓기 반경 0.22에서 0.44rad 토막마다 윤곽이 꺾여 15각형으로 읽혔다(fix3_4 fastcircle)
    vec2 nl = vec2(-dn.y, dn.x);
    float bend = ((on ? dnP.x * dn.y - dnP.y * dn.x : 0.0) + (dn.x * dnN.y - dn.y * dnN.x)) * 0.25 / il;
    d += nl * (bend * h * (1.0 - h));
    float K = mix(abs(uTrailK[i]), kb, h);
    vec2 t = mix(tA, tB, h);
    t *= inversesqrt(max(dot(t, t), 1e-8));
    // 옆 거리 · 부호는 보간 접선 t 기준 — 선분 안에선 dn 기준과 같고, 끝에 걸린 자리(h 0 · 1)에선 꼭짓점 몫과 똑같아 정확히 지워진다.
    // dn 기준이면 머리 너머 좁은 쐐기에서 부호가 어긋나 곧은 머리카락 금이 섰다(fix3_5 stirc_justfed 3.6s)
    float s = dot(d, vec2(-t.y, t.x));
    // 획 끝 둥근 마개(손끝 밑 패임 · 꼬리)는 참 방향(끝점에서 바깥) — 옆 방향만 쓰면 마개 앞뒤 비탈이 사라진다
    bool cap = (hr < 0.0 && !on) || (hr > 1.0 && !nx);
    vec2 u = cap ? d * inversesqrt(max(dot(d, d), 1e-12)) : sign(s) * vec2(-t.y, t.x);
    // 머리 뒤 몫 — 선분 번호 + 선분 안 자리로 이어서(이음매에서 끊기지 않게). 머리에서 0.38까지 1, 0.665에서 0
    seamAdd(S, G, U, T, dot(d, d) * K, 1.0, vec3(2.0 * K * d, mix(uTrailAmp[i], uTrailAmp[i + 1], h)), u,
            vec4(s, t, clamp((float(i) + h - ${RIDGE_FROM_I.toFixed(1)}) / ${RIDGE_RAMP_I.toFixed(1)}, 0.0, 1.0)));
    if (on) {
      // 앞 선분 끝(h 1) = 이 선분 시작(h 0) = 꼭짓점 a — K · 깊이 · 방향도 양쪽에서 같은 값이라 정확히 지워진다
      vec2 dv = p - a;
      float Kv = abs(uTrailK[i]);
      vec2 m = tA * inversesqrt(max(dot(tA, tA), 1e-8));
      float sv = dot(dv, vec2(-m.y, m.x));
      seamAdd(S, G, U, T, dot(dv, dv) * Kv, -1.0, vec3(2.0 * Kv * dv, uTrailAmp[i]), sign(sv) * vec2(-m.y, m.x),
              vec4(sv, m, clamp((float(i) - ${RIDGE_FROM_I.toFixed(1)}) / ${RIDGE_RAMP_I.toFixed(1)}, 0.0, 1.0)));
    }
    on = true;
    dnP = dn;
  }
  // S ≥ 가장 큰 선분 몫 > 0(꼭짓점은 양옆 선분보다 늘 멀다 — K는 이웃 점끼리 거의 같다). 다 멀면 S = 0 — 고랑 밖
  vec4 o = vec4(0.0);
  tl = vec4(0.0);
  if (S > 1e-30) {
    float iS = 1.0 / S;
    vec2 gq = G.xy * iS;
    // 기울기 = 거리장 크기 × 보간 방향(방향이 다 지워진 자리 — 고랑 바닥 가운데 — 는 거리장 방향 그대로)
    float lu = length(U);
    if (lu > 1e-6 * S) gq = length(gq) * U / lu;
    o = grooveAt(-TRAIL_SEAM_Q * log(S), G.z * iS, gq);
    // 잔줄 tl도 같은 가중으로 — 가장 가까운 선분이 바뀌는 자리에서 옆 거리가 튀어 잔줄 띠에 곧은 금이 섰다(fix2_3)
    tl = T * iS;
  }
  if (uBow.z > 1e-5) {
    vec2 d = p - uBow.xy;
    float e = uBow.z * riseK() * exp(-dot(d, d) * uBow.w);
    o.xyz += vec3(e, -2.0 * uBow.w * e * d);
  }
  return o;
}
`;
const POKE_K0 = 30;          // 탭 덴트 첨도 — 액체일수록 아물며 퍼진다 (하한 k0/3)

// ── 당기기(2026-11-19 가닥 다발, .work/feel2/spec.md §1 · §6) — 들리는 몸은 StrandMesh 가닥, 반죽 윗면엔 밑동 둔덕 ·
//    끌려 모임 · 방사 결 · 더미만 남는다. 옛 넓은 커널 · 리본 리프트(kernelK · lift) · 헤드룸 클램프는 지웠다(대체됨).
//    상태 물성 3종(grabMax·creepGain·returnZeta)은 RenderParams, 나머지는 grabTuning 오버라이드 ──
const GRAB_DEFAULTS = {
  elasticTau: 0.07, // 끝점(손끝) 추종 τ(s) — 사용자 실기기 확정(2026-08-24). 직교 카메라라 끝이 손끝을 1:1로 따른다(L4a)
  creepDelay: 0.7,  // 버티면 짧아짐 — 잡은 지 이 시간 뒤부터 끊김 길이가 줄어든다 (§1-3)
  creepTau: 2.5,    // L4b 8uAT 1:24.0-1:26.7 피크 연결 약 2.5s (묽음은 ×1.2 = 3s, 8uAT 1:55.7-1:58.3)
  releaseTau: 1.2,  // 놓은 뒤 밑동 흔들림 잔류(creepGain 몫) 해소 τ(s)
  omega: 5.5,       // 밑동 둔덕 스프링 고유진동수 — 5.5가 무겁게 되돌아오는 반죽 (확정, ζ = grabReturnZeta)
};
/** 밑동 둔덕 반경(오브젝트) — L2a UPQ94 9s 반경 0.2~0.25D ×0.65 */
const GRAB_RB = (0.14 * D_W) / XZ_SCALE;
/** 끌려 모임 반경(오브젝트) — L2b 결이 들린 점으로 0.4~1D(Sg__ 262-270 · 8uAT 1:13.7) */
const GRAB_PULL_R = (0.5 * D_W) / XZ_SCALE;
/** 방사 결 띠 바깥 끝(오브젝트) — L2b. 0.8rb ~ 0.35D */
const GRAB_BAND = (0.35 * D_W) / XZ_SCALE;
/** 밑동 흔들림 — 끝점 수평 오프셋 × 0.15, 상한 0.1(오브젝트). 추정 — 실측 없음(측면 영상이 없다) */
const SWAY_GAIN = 0.15;
const SWAY_MAX = 0.1;
/** 휴면 · 곰팡이(가닥 없음) 밑동 둔덕 몫 — 추정 — 실측 없음(§6-2 「조금」) */
const NONE_MOUND = 0.35;
/** 더미 반들함이 다 차는 높이 = 둔덕 최대의 절반(시각 고침 1차 A-4 — 더미가 짙은 그늘 얼룩이 아니라 밝은 볼록으로 읽히게).
 *  추정 — 실측 없음(UPQ94 13s 접힌 더미가 둘레보다 밝고 매끈한 것만 봤다) */
const PILE_FULL_H = 0.5 * MOUND_H;
/** 잡기 확정 때 그 획의 고랑을 지우는 τ(s) — §6-12 */
const STROKE_CANCEL_TAU = 0.1;

/**
 * 당기기 높이장 — 버텍스(높이 x)와 프래그(기울기 yz)가 이 소스 하나를 쓴다(규칙 8).
 * 밑동 둔덕(uGrab.x · 반경 GRAB_RB, L2a) + 더미(uPile, L6). 둘레 오목 · 더미 접힌 주름은 뺐다(§6-20).
 * TRAIL_GROOVE(riseK) 뒤에 끼운다.
 */
export const GRAB_FIELD = /* glsl */ `
const float GRAB_RB = ${GRAB_RB};
const float GRAB_PULL_R = ${GRAB_PULL_R};
const float GRAB_BAND = ${GRAB_BAND};
const float PILE_FULL_H = ${PILE_FULL_H};
uniform float uPileK; // 더미 메시가 보이면 PILE_BASE_K, 아니면 1 — 높이 · 기울기 둘 다 같은 몫(CPU surfaceY도)
vec3 grabField(vec2 p) {
  vec3 o = vec3(0.0);
  if (uGrab.x > 1e-5) {
    vec2 d = p - uGrabPos;
    float k = 1.0 / (GRAB_RB * GRAB_RB);
    float e = uGrab.x * exp(-dot(d, d) * k);
    o += vec3(e, -2.0 * k * e * d);
  }
  if (uPile.z > 1e-5) {
    vec2 d = p - uPile.xy;
    float k = 1.0 / (uPile.w * uPile.w);
    float e = uPile.z * uPileK * exp(-dot(d, d) * k);
    o += vec3(e, -2.0 * k * e * d);
  }
  return o * riseK(); // 윗물 아래서 덜 솟는다(§6-9, TRAIL_GROOVE riseK)
}
// 더미 몫 0~1 — 갓 떨어진 반죽은 매끈하고 젖어 반들하다(프래그 광 · 바늘구멍 지움만 쓴다). 높이 PILE_FULL_H에서 1
float pileSheen(vec2 p) {
  if (uPile.z < 1e-5) return 0.0;
  vec2 d = p - uPile.xy;
  return min(1.0, uPile.z / PILE_FULL_H) * exp(-dot(d, d) / (uPile.w * uPile.w));
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
  /** 고랑 자취 링버퍼 — trailHead가 손끝을 따라다니는 머리, brk = 새 획의 첫 점(앞 점과 안 잇는다),
   *  fast = 잡기로 확정된 획이라 τ0.1s로 지운다(§6-12) */
  private trail: Array<{ x: number; z: number; amp: number; bornAt: number; brk: boolean; fast: boolean }> = [];
  private trailHead = 0;
  /** 앞 둔덕(S3) — 높이(월드) · 진행 방향 · 잡기 확정으로 빨리 지우는 중 */
  private bowH = 0;
  private bowDir = new THREE.Vector2(1, 0);
  private bowFast = false;
  /** 저은 띠 기억(S2 · S4 · S8) — 저은 양 W(0~1, 한 바퀴 = 1) · 젓는 반경(오브젝트) · 이번 획이 쌓은 몫(잡기 확정 때 뺀다, §6-12) */
  private stirMem = 0;
  private stirMemR = 0;
  private stirMemStroke = 0;
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

  // ── 당기기 상태 — 가닥은 strands.rig(순수 TS), 반죽 윗면은 밑동 둔덕 스프링 · 흔들림만 ──
  /** Motion Lab 전용 오버라이드 — 프로덕션 경로는 비워 둔다 */
  grabTuning: GrabTuning = {};
  /** 가닥 다발 메시 — SceneHost가 씬 · homeGroup에 넣는다 */
  readonly strands: StrandMesh;
  /** 끊긴 뒤 더미 블렌더 메시 — SceneHost가 씬 · homeGroup에 넣고 load()를 한 번 부른다. 못 받으면 높이장 더미만 */
  readonly coil: CoilMesh;
  /** 이번 tick의 가닥 끊김 — SceneHost.onGrabBreak가 읽는다(소리 · 진동) */
  readonly grabBreaks: readonly StrandBreak[];
  private grabbing = false;
  private grabReleaseAge = Infinity;
  private grabAnchor = new THREE.Vector2();
  private moundH = 0;
  private moundV = 0;
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
    const trailPos = Array.from({ length: TRAIL_N }, () => new THREE.Vector2(9, 9)); // 화면 밖
    for (let i = 0; i < TRAIL_N; i++) this.trail.push({ x: 9, z: 9, amp: 0, bornAt: 0, brk: true, fast: false });
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
        uTrailPos: { value: trailPos },
        uTrailAmp: { value: new Float32Array(TRAIL_N) },
        uTrailK: { value: new Float32Array(TRAIL_N).fill(-TRAIL_K0) },
        // 젓기 실물화(2026-11-19) — 앞 둔덕 (x, z, 높이, 첨도) · 저은 띠 기억 (W, 반경, 띠 폭, 0)
        uBow: { value: new THREE.Vector4(0, 0, 0, BOW_K) },
        uStirMem: { value: new THREE.Vector4() },
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
        // 당기기(2026-11-19 가닥 다발) — 밑동 둔덕 가운데 · (둔덕 높이, 끌려 모임 세기) · 더미 (x, z, 높이, 반경)
        uGrabPos: { value: new THREE.Vector2() },
        uGrab: { value: new THREE.Vector4() },
        uPile: { value: new THREE.Vector4(0, 0, 0, 1) },
        uPileK: { value: 1 }, // 더미 메시가 보이는 동안 높이장 더미 높이에 곱하는 몫(CoilMesh PILE_BASE_K)
      },
      vertexShader: vert
        .replace('// #fbm', FBM_GLSL)
        .replace('// #trailGroove', SURF_TILT + TRAIL_GROOVE)
        .replace('// #grabField', GRAB_FIELD),
      fragmentShader: frag
        .replace('// #fbm', FBM_GLSL)
        .replace('// #hoochCover', HOOCH_COVER)
        .replace('// #trailGroove', SURF_TILT + TRAIL_GROOVE)
        .replace('// #marble', MARBLE_GLSL)
        .replace('// #grabField', GRAB_FIELD)
        .replace('// #doughShade', DOUGH_ALBEDO + DOUGH_SHADE)
        .replace('// #cellBubble', CELL_BUBBLE),
    });
    this.strands = new StrandMesh(this.material.uniforms);
    this.coil = new CoilMesh(this.strands.material.uniforms);
    this.grabBreaks = this.strands.rig.events;
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
    u.uHeight.value = p.height;
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
   * 그 획의 고랑 자취를 τ0.1s로 지운다(§6-12 — 들기 전 32px 고랑이 둔덕 옆에 남지 않게). 놓기 = grabEnd(pointerup)
   */
  grabStart(x: number, z: number): void {
    for (let j = 0; j < TRAIL_N; j++) {
      const s = this.trail[(this.trailHead - j + TRAIL_N) % TRAIL_N];
      s.fast = true;
      if (s.brk) break;
    }
    // 앞 둔덕도 같이 지우고, 이 획이 쌓은 저은 양은 W에서 뺀다(§6-12)
    this.bowFast = true;
    this.stirMem = Math.max(0, this.stirMem - this.stirMemStroke);
    this.stirMemStroke = 0;
    // 젓기 획은 여기서 끝 — 머리가 계속 파지 않게
    this.lastStirInputT = this.lastHandStirT = -Infinity;
    this.grabbing = true;
    this.grabReleaseAge = Infinity;
    this.grabAnchor.set(x, z);
    const p = this.params;
    this.strands.rig.start(x * XZ_SCALE, z * XZ_SCALE,
      strandMix(p?.elasticity ?? 0.5, p?.fluidity ?? 0.3, this.grabMax()), this.env());
  }

  /** grab 이동 — 손끝 월드 점(입력층이 카메라를 마주 보는 수직 평면에 투영). 가닥 끝이 이 점을 τ0.07로 따른다 */
  grabMove3(x: number, y: number, z: number): void {
    if (!this.grabbing) return;
    this.strands.rig.move(x, y, z);
  }

  /** 놓기 — 붙은 가닥은 한 줄로 합쳐 떨어지고 더미가 되며, 밑동 둔덕은 ω5.5 · ζ 스프링으로 돌아간다. tick이 굴린다 */
  grabEnd(): void {
    if (!this.grabbing) return;
    this.grabbing = false;
    this.grabReleaseAge = 0;
    const cgain = this.grabTuning.grabCreepGain ?? this.params?.grabCreepGain ?? 0.5;
    this.swayRest.copy(this.sway).multiplyScalar(cgain);
    this.strands.rig.release(this.env());
  }

  /** 신장 0~1 = 주 가닥 길이 ÷ 지금 주 가닥 끊김 길이 — 사운드 훅용(onGrabMove). 주 가닥이 끊겼으면 0 */
  grabStretch01(): number {
    return this.strands.rig.stretch01(this.env());
  }

  /** Motion Lab 계기판 · 녹화 도구용 — held는 rec.mjs가 grab 판정 기록에 쓴다 */
  grabDebug(): { held: boolean; len: number; breakLen: number; attached: number } {
    const rig = this.strands.rig;
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
    for (const s of this.trail) {
      s.amp = 0;
      s.brk = true;
      s.fast = false;
    }
    this.bowH = this.stirMem = this.stirMemR = this.stirMemStroke = 0;
    this.bowFast = false;
    this.writeTrail(this.lastT);
    // 당기기 — 가닥 · 더미 · 밑동 둔덕도 넘기지 않는다
    this.grabbing = false;
    this.strands.rig.reset();
    this.strands.sync();
    this.coil.mesh.visible = false;
    this.resetMound();
  }

  private resetMound(): void {
    this.moundH = this.moundV = 0;
    this.sway.set(0, 0);
    this.swayV.set(0, 0);
    this.swayRest.set(0, 0);
    const u = this.material.uniforms;
    (u.uGrab.value as THREE.Vector4).set(0, 0, 0, 0);
    (u.uPile.value as THREE.Vector4).set(0, 0, 0, 1);
    u.uPileK.value = 1;
    (u.uGrabPos.value as THREE.Vector2).copy(this.grabAnchor);
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
    return this.params?.height ?? 0.76;
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
    // 수면 기울기 × (1 − 덮임) · 솟는 항 × riseK — vert SURF_TILT · TRAIL_GROOVE와 같은 식(§6-9)
    const spread = this.hoochSpread();
    const rise = 1 - 0.85 * spread;
    let y = (u.uHeight.value as number) + (x * wob.x + z * wob.y) * 0.14 * lev * (0.5 + 0.5 * fl) * (1 - spread);
    y += fbm2(x * 1.8 + 3.1 + seed, z * 1.8 + 7.4 + seed) * 0.045 * (1 - 0.55 * lev - 0.3 * fl) * (1 - 0.5 * ripe);
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
    if (g.x > 1e-5) y += rise * g.x * Math.exp(-((x - gp.x) ** 2 + (z - gp.y) ** 2) / (GRAB_RB * GRAB_RB));
    const pl = u.uPile.value as THREE.Vector4;
    if (pl.z > 1e-5) y += rise * pl.z * (u.uPileK.value as number) * Math.exp(-((x - pl.x) ** 2 + (z - pl.y) ** 2) / (pl.w * pl.w));
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

    // ── 젓기 스프링 · 고랑 자취 ──
    const stirring = t - this.lastStirInputT < STIR_IDLE_S;
    const hand = t - this.lastHandStirT < STIR_IDLE_S;
    const stirPos = u.uStirPos.value as THREE.Vector2;
    this.mixedThisFrame = false;
    let pathLen = 0;
    if (stirring) {
      const fresh = !this.wasStirring;
      if (fresh) {
        // 새 획 — 손끝 자리로 바로(지난 획 끝에서 끌려오며 고랑을 긋지 않게)
        stirPos.copy(this.stirTarget);
        this.prevStirTarget.copy(this.stirTarget);
        this.bowFast = false;
        this.stirMemStroke = 0;
        if (this.stirMem < 0.01) this.stirMemR = this.stirTarget.length();
      }
      // 손가락 추종 — 빠른 지수 수렴, 놓기 전까지 스프링 비활성
      stirPos.lerp(this.stirTarget, 1 - Math.exp(-14 * dt));
      this.stirVec.lerp(this.stirVecTarget, 1 - Math.exp(-12 * dt));
      this.stirVecVel.set(0, 0);
      pathLen = this.stirTarget.distanceTo(this.prevStirTarget);
      // 소용돌이 위상 — 손끝이 가운데를 도는 각도를 따라간다(손 · 연출 둘 다)
      if (this.prevStirTarget.lengthSq() > 1e-4 && this.stirTarget.lengthSq() > 1e-4) {
        const a0 = Math.atan2(this.prevStirTarget.y, this.prevStirTarget.x);
        const a1 = Math.atan2(this.stirTarget.y, this.stirTarget.x);
        const da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
        this.marblePhase += da;
        // 저은 양 — 가운데 둘레를 돈 각도(한 바퀴 = 1, §6-11). 짧은 획 하나로 고리 전체가 반들해지지 않게
        const dw = Math.min(Math.abs(da) / (2 * Math.PI), 1 - this.stirMem);
        this.stirMem += dw;
        this.stirMemStroke += dw;
      }
      this.stirMemR += (stirPos.length() - this.stirMemR) * (1 - Math.exp(-dt / STIRMEM_R_TAU));
      this.prevStirTarget.copy(this.stirTarget);
      this.pushTrail(t, stirPos, fresh);
      if (this.stirVecTarget.lengthSq() > 1e-6) this.bowDir.copy(this.stirVecTarget).normalize();
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

    // ── 피크 젓기 꺼짐 — 젓는 거리 × ripe로 쌓이고 τ20s로 돌아온다 ──
    this.knock = Math.min(KNOCK_MAX, this.knock * Math.exp(-dt / KNOCK_TAU) + pathLen * (p?.ripe ?? 0) * KNOCK_GAIN);
    if (this.knock < 1e-5) this.knock = 0;
    u.uSink.value = this.sinkNow();

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

    // ── 당기기 — 가닥 상태기(끝점 추종 · 끊김 · 낙하 · 더미) → 밑동 둔덕 · 흔들림 스프링(ω5.5 · ζ = grabReturnZeta).
    //    잠금값 ζ 0.956의 새 자리 = 밑동 둔덕이 「무겁게 되돌아온다」. 모든 감쇠는 1-exp(-k·dt) 주사율 독립 ──
    {
      const czeta = this.grabTuning.grabReturnZeta ?? p?.grabReturnZeta ?? 0.95;
      if (!this.grabbing && Number.isFinite(this.grabReleaseAge)) this.grabReleaseAge += dt;
      const rig = this.strands.rig;
      rig.tick(dt, this.env());
      this.strands.sync(this.mesh.visible);
      const att = rig.attached();
      // 밑동 둔덕(L2a) — h = 0.07D × smoothstep(0, 0.5D, L) × 붙은 몫. 가닥 없는 휴면은 조금만
      const hT = MOUND_H * THREE.MathUtils.smoothstep(rig.len, 0, 0.5 * D_W) * att * (rig.none ? NONE_MOUND : 1);
      const w = this.grabParam('omega');
      this.moundV += (-w * w * (this.moundH - hT) - 2 * czeta * w * this.moundV) * dt;
      this.moundH += this.moundV * dt;
      // 흔들림 목표 — 잡는 동안 끝점 수평 오프셋 × 0.15(상한 0.1), 놓은 뒤엔 creepGain 몫이 releaseTau로 풀린다
      const tgt = this.swayTgt;
      if (this.grabbing) {
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
      // 끌려 모임 세기(L2b) — 붙은 몫 × smoothstep(0, 0.6D, L). 가닥 없는 휴면은 0(§6-2 둔덕만)
      const tension = rig.none ? 0 : att * THREE.MathUtils.smoothstep(rig.len, 0, 0.6 * D_W);
      (u.uGrab.value as THREE.Vector4).set(Math.max(0, this.moundH), tension, 0, 0);
      (u.uGrabPos.value as THREE.Vector2).copy(this.grabAnchor).add(this.sway);
      const pl = rig.pile;
      // 더미 메시 — 놓을 자리(반죽 윗면)와 높이장 더미 몫. 휴면 · 곰팡이(가닥 없음)는 더미도 없다
      u.uPileK.value = this.coil.sync(pl, dt, this.mesh.visible && !rig.none, rig.runny(),
        1 - 0.85 * this.hoochSpread(), this.strandEnv.surfaceY);
      (u.uPile.value as THREE.Vector4).set(pl[0] / XZ_SCALE, pl[1] / XZ_SCALE, pl[2], pl[3] / XZ_SCALE);
    }

    // ── 고랑 메워짐 — 묽으면 τ0.3s · 되직하면 1.6s, 피크는 덜 메워진다. 메워지며 넓어진다(첨도 K0 → K0/3) ──
    const tau = (TRAIL_TAU_FLUID + (TRAIL_TAU_THICK - TRAIL_TAU_FLUID) * this.stirThickness())
      * (1 + TRAIL_TAU_RIPE * (p?.ripe ?? 0));
    const decay = Math.exp(-dt / tau);
    const fastDecay = Math.exp(-dt / STROKE_CANCEL_TAU);
    for (let i = 0; i < TRAIL_N; i++) {
      const s = this.trail[i];
      if (!(stirring && i === this.trailHead)) s.amp *= s.fast ? fastDecay : decay; // 머리는 손끝이 계속 판다
      if (s.amp < 1e-5) s.amp = 0;
    }
    this.writeTrail(t);
    // 앞 둔덕(S3) — 젓는 동안 머리 앞에 서고, 손을 떼면 고랑과 같은 τ로 준다
    const thick = this.stirThickness();
    const bow = u.uBow.value as THREE.Vector4;
    if (stirring) {
      const head = this.trail[this.trailHead];
      this.bowH = head.amp * BOW_GAIN * (0.4 + 0.6 * thick);
      bow.x = head.x + this.bowDir.x * BOW_AHEAD;
      bow.y = head.z + this.bowDir.y * BOW_AHEAD;
    } else {
      this.bowH *= this.bowFast ? fastDecay : decay;
    }
    if (this.bowH < 1e-5) this.bowH = 0;
    bow.z = this.bowH;
    // 저은 띠 기억 — τ_W = 2 + 4·되기로 옅어진다. 띠 폭은 되기로(되직 = 좁게)
    this.stirMem *= Math.exp(-dt / (STIRMEM_TAU0 + STIRMEM_TAU_THICK * thick));
    if (this.stirMem < 1e-4) this.stirMem = 0;
    (u.uStirMem.value as THREE.Vector4).set(this.stirMem, this.stirMemR,
      R_BODY * THREE.MathUtils.lerp(STIRMEM_W_THICK, STIRMEM_W_FLUID, 1 - thick), 0);

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
      this.wobbleTgt.copy(this.stirVec).multiplyScalar(5.0 * this.sloshGain());
      if (this.wobbleTgt.length() > 0.6) this.wobbleTgt.setLength(0.6);
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

  /** 자취 머리를 손끝으로 옮기고, 앞 점에서 TRAIL_STEP 멀어지면 굳혀 새 머리를 낸다. fresh = 새 획 */
  private pushTrail(t: number, at: THREE.Vector2, fresh: boolean): void {
    const live = TRAIL_A * Math.min(1, 0.35 + (this.stirVec.length() / 0.22) * 0.65);
    const cur = this.trail[this.trailHead];
    const prev = this.trail[(this.trailHead + TRAIL_N - 1) % TRAIL_N];
    const dist = Math.hypot(at.x - prev.x, at.y - prev.z);
    // 획 첫 점(brk)은 옛 판정 그대로. 이어지는 머리는 손끝이 앞 점에서 TRAIL_STEP을 넘는 그 입력에 정확히 STEP 자리에서 굳힌다 —
    // 시각 고침 3차: 넘친 만큼(입력 간격 ≈ 0.045, 60Hz 빠른 원)이 선분마다 쌓여 간격을 반으로 줄이자 자취가 15% 길어졌다(F3 0.62바퀴 넘음)
    const step = cur.brk ? this.headStep() >= TRAIL_STEP : dist >= TRAIL_STEP;
    if (!fresh && !cur.brk && step) {
      const k = TRAIL_STEP / dist;
      cur.x = prev.x + (at.x - prev.x) * k;
      cur.z = prev.z + (at.y - prev.z) * k;
    }
    if (fresh || step) {
      this.trailHead = (this.trailHead + 1) % TRAIL_N;
      const next = this.trail[this.trailHead];
      next.brk = fresh;
      next.fast = false;
      next.amp = 0;
    }
    const head = this.trail[this.trailHead];
    head.x = at.x;
    head.z = at.y;
    head.amp = Math.max(head.amp, live);
    head.bornAt = t;
  }

  /** 머리와 바로 앞 점 사이 거리(오브젝트) */
  private headStep(): number {
    const head = this.trail[this.trailHead];
    const prev = this.trail[(this.trailHead + TRAIL_N - 1) % TRAIL_N];
    return Math.hypot(head.x - prev.x, head.z - prev.z);
  }

  /** 링버퍼 → uniform(옛 점부터 차례로). 꼬리 TRAIL_TAIL_PTS점(0.38)은 머리가 나아간 만큼 이어서 가늘어진다 — 덮어쓸 때 툭 끊기지 않게 */
  private writeTrail(t: number): void {
    const u = this.material.uniforms;
    const pos = u.uTrailPos.value as THREE.Vector2[];
    const amp = u.uTrailAmp.value as Float32Array;
    const kk = u.uTrailK.value as Float32Array;
    const N = TRAIL_N;
    const prog = this.trail[this.trailHead].brk ? 0 : Math.min(1, this.headStep() / TRAIL_STEP);
    for (let j = 0; j < N; j++) {
      const s = this.trail[(this.trailHead + 1 + j) % N];
      const age = Math.max(0, t - s.bornAt);
      pos[j].set(s.x, s.z);
      amp[j] = s.amp * THREE.MathUtils.clamp((j - prog) / TRAIL_TAIL_PTS, 0, 1);
      const k = Math.max(TRAIL_K0 / (1 + age / 0.8), TRAIL_K_MIN);
      kk[j] = s.brk ? -k : k;
    }
  }

  /** 시계 역행 — CPU 시각 기록을 delta만큼 옮긴다(프로덕션 performance.now는 단조라 방어용) */
  private shiftClock(delta: number): void {
    this.lastStirInputT += delta;
    this.lastHandStirT += delta;
    for (const s of this.trail) s.bornAt += delta;
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
    if (!this.strands.rig.finite()) {
      this.strands.rig.reset();
      this.strands.sync();
      this.grabbing = false; // 상태기가 잡기를 놓았으니 grabMove3 · grabEnd도 맞춘다(검토 C-2)
    }
    if (!ok(this.sway) || !ok(this.swayV) || !ok(this.swayRest) || !Number.isFinite(this.moundH + this.moundV)) {
      this.resetMound();
    }
    for (const s of this.trail) if (!Number.isFinite(s.amp)) s.amp = 0;
    if (!Number.isFinite(this.holdLevel)) this.holdLevel = 0;
    const u = this.material.uniforms;
    (u.uWobble.value as THREE.Vector2).copy(this.wobble);
    (u.uStirVec.value as THREE.Vector2).copy(this.stirVec);
    if (!Number.isFinite(this.knock)) this.knock = 0;
    if (!Number.isFinite(this.marble)) this.marble = 0;
    if (!Number.isFinite(this.marblePhase)) this.marblePhase = 0;
    if (!Number.isFinite(this.murk)) this.murk = 0;
    if (!Number.isFinite(this.bowH)) this.bowH = 0;
    if (!Number.isFinite(this.stirMem + this.stirMemR + this.stirMemStroke)) {
      this.stirMem = this.stirMemR = this.stirMemStroke = 0;
    }
    this.writeTrail(this.lastT);
    if (!Number.isFinite(u.uPokeAmt.value as number)) u.uPokeAmt.value = 0;
  }
}
