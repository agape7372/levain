// Snapshot → RenderParams — sim→render 유일한 이음새의 렌더 쪽 절반 (순수, three 무의존, vitest 대상).
// uniform 값 범위·앵커: docs/VISUAL.md §3-2·§3-3. 시작 공식 — 실기기에서 상수만 미세 튜닝.
//
// 2026-08-25 축 개편: 구 `liquidity` 1축이 **형상과 물성을 동시에** 몰아서 갓 밥준 르방이
// "묽은 배터"로 읽혔다(모양은 수평을 찾지만 재질은 되직해야 하는데 한 축으로는 불가능).
// 4축으로 분해 — levelness(형상) / fluidity(흐름) / cohesion(응집) / elasticity(되돌아옴).
// `liquidity` 필드는 **부활 금지** — 남기면 두 의미가 다시 섞인다.
import type { Snapshot } from '../sim/types';
// 2026-11-19: sim 상수 import(STAGE_FILL_FACTOR 이음새)는 지웠다 — 최고 수위는 Snapshot.peakFill을 그대로 읽는다.
// FILL_PEAK_RISE는 「정상 피크 상한」을 알아보는 데만 쓴다(가짜 부풀기 사이클 판별, 판정 M3)
import { FILL_PEAK_RISE } from '../sim/constants';

/** 병 높이(월드) — jar.ts JAR_HEIGHT와 같은 값. 이 파일은 three 무의존이라 숫자로 둔다 */
const JAR_H = 1.9;
/** 갓 밥준 수위(월드) — 실물 01 연속 사진: 병 높이의 약 40% (R1) */
export const FED_LEVEL = 0.4 * JAR_H;
/** 피크 상한(월드) — 병 높이 0.88. 넘침은 촛농으로 읽혀 쓰지 않는다 */
export const PEAK_CAP = 0.88 * JAR_H;
/** riseFill 1.6(sim 피크) → 2.1배. 실물 피크 사진 5장 가운데값 2.1 (R1) */
const RISE_GAIN = 1.1 / 0.6;
/** riseFill<1 압축 — 실물은 꺼져도 1.0배 근처(0.8→0.93 · 0.65→0.88) */
const FALL_GAIN = 0.35;
/** 렌더 전용 상승 배율 — (높이−1)에 곱한다. 어린 병은 덜 오른다. 0·1단계는 sim 계수가 이미 누른다 */
const RISE_BY_STAGE = [1, 1, 0.85, 0.93, 1, 1];
/** D2 가짜 부풀기 사이클(peakFill이 정상 피크 1.6을 넘음)의 상승 배율 — 성숙 피크를 넘지 않게(판정 M3: 2.2배 → 1.99배) */
const FAKE_RISE_DAMP = 0.75;
/** 기운 — 단계가 병에 보이게 하는 렌더 축(A3-01). 0단계(갓 섞음) · 1단계(잠잠기) · 2 첫 기포 … 5 */
const VIGOR_BY_STAGE = [0.35, 0.25, 0.6, 0.8, 0.92, 1.0];
/** 윗가장자리가 유리에서 물러나는 최대 폭(월드) — 마름·배고픔. 위 10~15% 높이만 */
const PULL_MAX = 0.028;

/**
 * riseFill(질량 무관 부풀기 곡선) · massRatio · 단계 → 반죽 수위(월드 y, 병 바닥 0 기준).
 * 순서를 보존하는 단조 재매핑이라 sim 규칙과 무관한 시각 배율이다(R2-03).
 * peakFill = 이번 사이클 최고치. 정상 피크(1 + FILL_PEAK_RISE)를 넘으면 가짜 부풀기 사이클이라 상승을 누른다 —
 * 지금 시각의 fakeRise 플래그가 아니라 사이클 값이라 수위와 자국이 같은 매핑을 쓴다(판정 M3)
 */
export function doughHeight(riseFill: number, massRatio: number, stage: number, peakFill = 1): number {
  const r = Number.isFinite(riseFill) ? riseFill : 1;
  const damp = peakFill > 1 + FILL_PEAK_RISE + 1e-6 ? FAKE_RISE_DAMP : 1;
  const ratio = r >= 1
    ? 1 + RISE_GAIN * (r - 1) * (RISE_BY_STAGE[stage] ?? 1) * damp
    : 1 - FALL_GAIN * (1 - r);
  const mass = Math.max(0.25, Math.min(1, Number.isFinite(massRatio) ? massRatio : 1));
  return Math.min(PEAK_CAP, FED_LEVEL * ratio * mass);
}

export interface RenderParams {
  /** 반죽 색 [r,g,b] 0~1 */
  color: [number, number, number];
  breatheAmp: number;      // 0.004~0.055
  breathePeriod: number;   // 2.6~7.0 s
  noiseSpeed: number;      // 0.1~1.6
  bubbleDensity: number;   // 0~1
  bubbleScale: number;     // 0.5~1.5
  specStr: number;         // 0.1~1.2
  crust: number;           // 0~1 (휴면 마른 껍질)
  /** 반죽 수위(월드 y, 병 바닥 0) — doughHeight. 유리 테두리 높이이고 돔·크레이터는 그 위에 얹힌다 */
  height: number;
  hoochAmt: number;        // 0~1
  wet: number;             // 0~1 급여 직후 젖은 광 → 마르면 무광 페이스트
  ripe: number;            // 0~1 피크 돔 + crackle
  collapse: number;        // 0~1 과숙 크레이터 함몰
  mold: number;            // 0~1 곰팡이 확산 (Snapshot.mold01)
  kahm: number;            // 0~1 kahm 효모 막
  // ── 물성 4축 (2026-08-25 개편 — 구 liquidity 분해) ──
  /** 형상. 0=돔(고체·마름) ~ 1=병 단면을 채운 수평면. "돔이 아니고 마르지 않았다"이지 "갓 밥준"이 아니다 */
  levelness: number;
  /** 흐름. 슬로싱 감쇠·유휴 진행파·탭 자국 확산. 갓 밥준은 낮다(되직) — 시큼만 높다(단백질 분해) */
  fluidity: number;
  /** 응집(글루텐 망·끈적임). 실·겹·윈도우페인·메니스커스·grab 신장의 공통 축 */
  cohesion: number;
  /** 되돌아옴. 기공이 만든다 — 갓 밥준은 응집이 높아도 탄성은 낮다(태피), 피크가 탱탱 */
  elasticity: number;
  // ── 형상 파생 ──
  /** 윗가장자리가 유리에서 물러나는 폭(월드) 0~0.028 — 마름·배고픔. 옆벽 아래와 바닥은 늘 유리에 붙는다(A1-02) */
  pull: number;
  /** 유리벽 기공 세기 0~1 — 살아있는 분기 전용(휴면·kahm·곰팡이에서 0) */
  wallCells: number;
  /** 유리벽 기공 주파수 34(크고 성김·피크)~80(잘고 촘촘·갓 밥준) */
  cellFreq: number;
  /** 이번 사이클 최고 수위(월드 y) — Snapshot.peakFill을 doughHeight로. 유리 자국 배치용 */
  markHeight: number;
  /** 유리 자국 세기 0~1 — 피크를 찍고 내려온 뒤에만 존재한다 */
  residue: number;
  /** 기운 0~1 — 단계(성숙)가 기포·돔·상승에 보이게 한다(A3-01). 5단계 = 1 */
  vigor: number;
  /** 윗면 바늘구멍 0~1 — 피크(크기 제각각 + 가끔 분화구) · 배고픔(고른 잔 점). 갓 밥준 0(R2-07) */
  pinholes: number;
  /** 유리 닿는 윗가장자리 잔거품 띠 0~1 — 오르는 중 · 피크(R1 rising top_foam) */
  foam: number;
  /** 하강 꺼짐 0~1 — 가운데가 먼저 꺼지고 부드럽게 주름진다. 피크 끝(hunger > 0) ~ 배고픔 초반(hunger 0.5) 전용(R2-06 · 판정 H1) */
  sink: number;
  /** 젓은 물결 0~1 — 갓 밥준 매끈한 페이스트 위 옅은 물결(R1 justfed) */
  stir: number;
  /** 냉장 0~1 — 유리 김서림·차가운 톤 */
  chill: number;
  /** 창가 0~1 — 아주 약한 따뜻함 */
  warm: number;
  // ── grab 점탄성 물성 (확장기획 §4-2-6 — 상태별 촉감 분리) ──
  grabMax: number;         // 0.06~0.62 잡아 늘일 수 있는 최대 변위 — cohesion·elasticity·slack 구동
  grabCreepGain: number;   // 0~1 놓은 뒤 잔류 변형 비율 — 탄성이 낮을수록 크다(태피)
  grabReturnZeta: number;  // 0.94~1.07 복귀 감쇠비 — 임계 근처, 오버슈트 ≤5% (§4-1)
}

type RGB = [number, number, number];
const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// 상태 앵커 색 (VISUAL §3-3)
const CREAM = hex(0xf4ead4);
const HUNGRY_TONE = hex(0xdcd2c0);
// 시큼 = 어두워지지 않고 노래진다(판정 M1, 2026-11-19). 옛 #cbbda2(L*77)는 반죽을 통째로 어둡게 했다 —
// 시큼은 hooch가 말하고(R1 pitfalls), 반죽은 배고픔 톤(L*84.5)과 거의 같은 밝기로 b*만 +10(L*82.6 b*20)
const SOUR_TONE = hex(0xddcca8);
const DORMANT_TONE = hex(0xe4dccc);
// 곰팡이 확정 — 잿빛이 도는 바랜 톤. 경고는 다이제틱(반점) 소관, 빨강 시맨틱 없음 (VISUAL §7-1)
const MOLDY_TONE = hex(0xd8d0be);
// 밀가루 색 톤 (§7-2, 개정 2026-11-19 R2-13) — R1 실측(사진 28·29): 통밀 · 호밀은 흰 밀가루보다 L* 11~13 어둡고
// b* +8~10 노랗다. 옛 톤(#d9c4a3 · #bfb096 × 0.35)은 차이가 실물의 1/3이었고 호밀은 회색 쪽으로 갔다.
// 통밀 = 따뜻한 황갈 L*57, 호밀 = 갈색 L*50(a* 8, 붉은 기). 섞는 비율 0.6(ΔL* −21 · −25)은 밀크티 · 진흙으로 읽혀
// 0.38로 내렸다(2026-11-19 다듬기) — 색값 ΔL* −13.4 · −15.7, 렌더 실측 호밀 −12.5(실물 28 −12 · 보정 −13)
const WHOLEWHEAT_TONE = hex(0xa08458);
const RYE_TONE = hex(0x93724f);
const FLOUR_TONE_MIX = 0.38;
// 냉장 = 차갑게 바랜 채도, 창가 = 아주 약한 햇빛 (R1 dormant: 「차갑게 바랜 채도와 뿌연 유리」)
const COLD_TONE = hex(0xe2e3dc);
const WARM_TONE = hex(0xf7e4c2);

export function toRenderParams(s: Snapshot): RenderParams {
  const a = clamp01(s.activity);
  const moldy = s.phase === 'moldy';
  // 기운 — 단계 축. 가짜 부풀기는 「적고 큰 불규칙 기포」(R1 0단계 D2)
  const vigor = VIGOR_BY_STAGE[s.stage] ?? 1;
  const fake = s.fakeRise ? 1 : 0;
  const chill = s.location === 'fridge' ? 1 : 0;
  const warm = s.location === 'window' ? 1 : 0;

  let color = mix(CREAM, HUNGRY_TONE, clamp01(s.hunger));
  // 밀가루 톤 — 상태 톤보다 먼저(재료가 바탕색), 상태 변화가 그 위를 지나간다
  if (s.flour === 'wholewheat') color = mix(color, WHOLEWHEAT_TONE, FLOUR_TONE_MIX);
  else if (s.flour === 'rye') color = mix(color, RYE_TONE, FLOUR_TONE_MIX);
  // 시큼은 hooch 액체층이 말한다(R2-05). 반죽은 어둡히지 않고 노랗게만 — 시큼 초반(+40h)이 배고픔과 갈리게(판정 M1)
  color = mix(color, SOUR_TONE, 0.45 * smooth(0.4, 0.8, s.sourness));
  color = mix(color, DORMANT_TONE, clamp01(s.dormancy));
  if (moldy) color = mix(color, MOLDY_TONE, 0.7);
  color = mix(color, COLD_TONE, 0.12 * chill);
  color = mix(color, WARM_TONE, 0.06 * warm);

  // 젖음 = 갓 밥준 페이스트 몫(R2-12). 옛 「피크 거품광 바닥값 0.5」는 R1(피크 = 매트 · 새틴 거품)과 어긋나 뺐다
  const wet = clamp01((1 - smooth(0.15, 0.8, a)) * (1 - smooth(0, 0.45, s.hunger)) * (1 - s.dormancy));
  const ripe = smooth(0.7, 0.95, a) * (1 - clamp01(s.dormancy)) * (0.35 + 0.65 * vigor);
  const collapse = smooth(0.45, 0.8, s.sourness) * (1 - clamp01(s.dormancy));

  // ── 물성 4축 재료 — 전부 Snapshot에서 닫힌 형태 (sim 무변경) ──
  const dry = clamp01(s.dormancy);
  const hun = clamp01(s.hunger);
  const hoo = clamp01(s.hooch);
  const fresh = 1 - smooth(0.05, 0.5, hun);     // 갓 수화된 새 밀가루가 남아 있나
  const proteo = smooth(0.35, 0.85, s.sourness); // 산 분해 = 글루텐 절단 + 진짜로 묽어짐
  const gas = smooth(0.2, 0.75, a);              // 기공 구조가 잡힌 정도
  const domed = smooth(0.4, 0.9, a);             // 피크 돔
  const spent = smooth(0.2, 0.8, hun);           // 다 쓴 기공(꺼진 폼) — 크고 성글다
  // 무름 = 잘 늘어남. 갓 밥준(기체 없는 새 반죽)과 배고픔(처짐)이 둘 다 높다
  const slack = clamp01(0.85 * hun + 0.55 * fresh * (1 - gas));

  // levelness는 fresh가 아니라 "돔이 아니고 마르지 않았다"다 — 배고픈(꺼진) 르방도 평평하다
  const levelness = moldy ? 0.3 : clamp01(0.88 + 0.1 * proteo - 0.18 * domed) * (1 - 0.62 * dry);
  const fluidity = moldy ? 0 : clamp01(0.1 + 0.12 * fresh + 0.62 * proteo + 0.15 * hoo - 0.1 * gas) * (1 - 0.97 * dry);
  const cohesion = moldy ? 0.15 : clamp01(0.4 + 0.26 * fresh + 0.3 * gas - 0.62 * proteo - 0.14 * hun) * (1 - 0.3 * dry);
  const elasticity = moldy ? 0 : clamp01(0.08 + 0.8 * gas - 0.55 * proteo - 0.25 * hun) * (1 - 0.7 * dry);
  // 살아있는 연출과 죽은 연출(crust·kahm·mold)을 상호배타로 — 프래그 게이트 동시 개방 방지(예산 §8)
  const alive = (1 - dry) * (s.kahm ? 0 : 1) * (1 - smooth(0, 0.3, s.moldStage === 'none' ? 0 : clamp01(s.mold01)));
  // 피크를 지났다 — hunger는 피크 끝에서 0을 떠난다. hunger 자체는 smoothstep(peakEnd, sour)라 하강 끝(1:1:1 +14h)에도
  // 0.18뿐이라, 하강 신호(자국 · 꺼짐)를 hunger 크기에 걸면 하강 내내 꺼져 있었다(판정 H1). 문턱으로만 쓴다
  const fallen = smooth(0, 0.025, hun);
  // 곰팡이 표시값(반점 바닥 0.25 포함) — hooch를 걷어 군락이 액체 아래 묻히지 않게(판정 M2)
  const moldShow = s.moldStage === 'none' ? 0 : Math.max(0.25, clamp01(s.mold01));
  const height = doughHeight(s.riseFill, s.massRatio, s.stage, s.peakFill);

  return {
    color,
    // moldy = 유일하게 숨이 완전히 멎는 상태 (휴면의 '완전 정지 금지'는 죽음 오인 방지책이었다)
    // 2026-11-19 R2-15: 실물은 초 단위로 정지해 있다 — 숨은 높이의 1.2% 이하. 살아 있음은 기포 몫
    breatheAmp: moldy ? 0 : 0.003 + (0.012 - 0.003) * a,
    breathePeriod: 2.6 + (7.0 - 2.6) * Math.pow(1 - a, 1.5),
    noiseSpeed: moldy ? 0 : 0.1 + 1.5 * a,
    // 가짜 부풀기 = 적고 큰 기포(판정 M3: 밀도 ×0.55 → ×0.4, 크기 ×1.45 → ×1.8 — 상한 1.5 안)
    bubbleDensity: moldy ? 0 : clamp01(a * 0.9 * (1 - 0.85 * s.dormancy) * (0.3 + 0.7 * vigor) * (1 - 0.6 * fake)),
    bubbleScale: Math.min(1.5, (0.5 + 0.8 * a) * (0.75 + 0.25 * vigor) * (1 + 0.8 * fake)),
    // 광택 — 2026-11-19 R2-12: R1 실물(사진 03 · 07 · 08 · 17)로 2026-08-25 가설(「갓 밥준 무광 · 피크가 가장 번들」)을
    // 뒤집었다. 그때 근거는 밀가루 먼지가 앉은 병 몇 장이었고, 30장 대조에선 갓 밥준이 넓고 부드러운 젖은 광(sdL 2.3),
    // 피크는 매트 · 새틴 거품에 기포 테두리만 반짝, 배고픔은 얇은 막 광, 휴면은 매트다(VISUAL §3-3).
    // 갓 밥준 0.70 · 오르는 중 ≈0.48 · 피크 0.35 · 배고픔 0.36 · 시큼 ≈0.26 · 휴면 0.10. hooch 광은 jar.ts 액체층 몫
    specStr: Math.min(1.0, Math.max(0.1,
      (0.1 + 0.6 * wet + 0.25 * gas + 0.25 * spent - 0.12 * proteo) * (1 - 0.9 * dry))),
    crust: 0.8 * clamp01(Math.max(s.dormancy, moldy ? 1 : 0)),
    height,
    // 시각 곡선 √ — sim hooch는 smoothstep(48h, 120h)라 시큼 초반이 얇았다(+60h 0.07 → 0.26, 판정 M1).
    // 곰팡이가 앉으면 액체가 걷힌다 — 마른 윗면에 매트한 군락(판정 M2, R1 moldy 「액체 hooch와 달리 광이 없다」)
    hoochAmt: Math.sqrt(clamp01(s.hooch)) * (1 - 0.85 * smooth(0, 0.3, moldShow)),
    wet,
    ripe,
    collapse,
    // spot 진입 직후 mold01≈0이라 반점이 안 보임 — 예고는 보여야 예고다 (바닥값 0.25)
    mold: moldShow,
    kahm: s.kahm ? 1 : 0,
    levelness,
    fluidity,
    cohesion,
    elasticity,
    // 유리 접촉 — 0.62 × 1.113 = 0.690 = R_XZ_MAX_BASE. 이 배율이 없으면 몸통 최대 반경이
    // 영원히 0.62(월드 0.806)에 묶여 유리 내벽 0.92와 12.4% 틈이 남는다. 소프트 니 클램프도,
    // 메니스커스도 그래서 지금껏 한 번도 제대로 발동한 적이 없다 (2026-08-25 감사)
    // 굶으면 위쪽이 유리에서 떨어진다(실사진 관찰 f — "can pull fully away from glass near top"),
    // 마르면 더 물러난다. **윗가장자리만** — 아래·바닥은 늘 유리에 붙는다(A1-02)
    pull: PULL_MAX * clamp01(dry + 0.5 * spent * (1 - dry)),
    // 기운 반영 0.45+0.55v → 0.2+0.8v(판정 M3): 2단계 대 5단계 피크 0.78 대 1.0 → 0.68 대 1.0
    wallCells: clamp01(0.14 + 0.28 * cohesion + 0.72 * gas + 0.35 * collapse + 0.25 * spent) * alive
      * (0.2 + 0.8 * vigor),
    // 아래는 압력에 눌려 잘고 촘촘, 위는 합쳐져 크고 성글 — 실물 병 사진의 문법
    cellFreq: 80 - 46 * clamp01(0.25 + 0.75 * gas + 0.45 * collapse + 0.2 * spent),
    // 최고 수위 = sim의 이번 사이클 peakFill을 같은 높이 매핑으로(A3-06 — 가짜 부풀기 1.72도 그대로 남는다)
    markHeight: Math.max(height, doughHeight(s.peakFill, s.massRatio, s.stage, s.peakFill)),
    // 자국은 피크를 찍고 내려온 뒤에만 존재한다 — 상승기(hunger 0)엔 0. 내려오기 시작하면 바로 켠다(R1 falling 「핵심」,
    // 판정 H1). jar 셰이더가 막을 수면과 최고 수위 사이로만 그리므로 일찍 켜도 수면 위 빈 유리에만 남는다
    residue: clamp01(Math.max(fallen, 0.9 * dry)) * (1 - 0.35 * hoo),
    // grab 물성 — 갓밥준 태피(응집↑ 탄성↓ 잔류↑) / 피크 탱탱 / 시큼 풀림 / 휴면 뻣뻣.
    // 계수는 사용자 실기기 확정치(피크 grabMax 0.600 · ζ 0.956)가 나오도록 역산해 고정했다.
    // 2026-08-25 이전 버그: creepGain이 hunger·sourness만 봐서 **갓 밥준이 전 상태 중 최저(0.310)**
    // = 가장 고무줄 — 마켓팅 잠금("강한 스프링 금지")과 정확히 반대로 구현돼 있었다
    grabMax: moldy
      ? 0.08
      : (0.11912 + 0.313 * cohesion + 0.205 * elasticity + 0.281 * slack - 0.08 * proteo) * (1 - 0.52 * dry),
    grabCreepGain: moldy ? 0.06 : clamp01(0.25 + 0.48 * (1 - elasticity) + 0.18 * hun) * (1 - 0.8 * dry),
    grabReturnZeta: 1.07 - 0.13 * elasticity,
    // ── 윗면 질감 신호(2026-11-19 P1b) — 전부 살아있는 분기(alive)라 휴면 · kahm · 곰팡이에선 0 ──
    pinholes: clamp01(0.55 * domed * (0.45 + 0.55 * vigor) + 0.6 * spent) * alive,
    // 하강(fallen)부터 피크의 잔거품 띠 · 갓 밥준 물결은 꺼지고 꺼진 주름이 켜진다(판정 H1 — 실제 궤적 +9h에 foam 1 · sink 0이었다)
    foam: clamp01(gas * (1 - spent) * (0.5 + 0.5 * vigor)) * (1 - fallen) * alive,
    sink: fallen * (1 - smooth(0.2, 0.5, hun)) * alive,
    stir: clamp01(fresh * (1 - gas)) * (1 - fallen) * alive,
    vigor,
    chill,
    warm,
  };
}

/** 수렴 판정 — 최대 차가 이 아래면 목표로 스냅한다(A1-20) */
const SNAP_EPS = 1e-4;

/**
 * 프레임 스무딩 — 지수 lerp (τ초). 앱 오픈 스냅은 호출자가 params를 직접 대입.
 * 수렴하면 **target 객체 그 자체**를 돌려준다 — 호출자의 `current !== target` 비교가 거짓이 되어
 * 매 프레임 할당·uniform 대입이 멈춘다(A1-20).
 */
export function smoothParams(cur: RenderParams, target: RenderParams, dtSec: number, tau = 1.2): RenderParams {
  let maxD = 0;
  for (const key of Object.keys(target) as (keyof RenderParams)[]) {
    const tv = target[key];
    const cv = cur[key];
    if (typeof tv === 'number') maxD = Math.max(maxD, Math.abs(tv - (cv as number)));
    else for (let i = 0; i < 3; i++) maxD = Math.max(maxD, Math.abs(tv[i] - (cv as RGB)[i]));
  }
  if (!(maxD >= SNAP_EPS)) return target; // NaN도 목표로 스냅 — 스스로 복구
  const k = 1 - Math.exp(-dtSec / tau);
  const n = (c: number, t: number): number => c + (t - c) * k;
  return {
    color: mix(cur.color, target.color, k),
    breatheAmp: n(cur.breatheAmp, target.breatheAmp),
    breathePeriod: n(cur.breathePeriod, target.breathePeriod),
    noiseSpeed: n(cur.noiseSpeed, target.noiseSpeed),
    bubbleDensity: n(cur.bubbleDensity, target.bubbleDensity),
    bubbleScale: n(cur.bubbleScale, target.bubbleScale),
    specStr: n(cur.specStr, target.specStr),
    crust: n(cur.crust, target.crust),
    height: n(cur.height, target.height),
    hoochAmt: n(cur.hoochAmt, target.hoochAmt),
    wet: n(cur.wet, target.wet),
    ripe: n(cur.ripe, target.ripe),
    collapse: n(cur.collapse, target.collapse),
    mold: n(cur.mold, target.mold),
    kahm: n(cur.kahm, target.kahm),
    // 신규 필드는 반드시 여기에도 행을 추가한다 — 빠뜨리면 타입 오류 없이 그 값만 초기값에 얼어붙는다
    levelness: n(cur.levelness, target.levelness),
    fluidity: n(cur.fluidity, target.fluidity),
    cohesion: n(cur.cohesion, target.cohesion),
    elasticity: n(cur.elasticity, target.elasticity),
    pull: n(cur.pull, target.pull),
    wallCells: n(cur.wallCells, target.wallCells),
    // cellFreq도 보간 대상 — τ1.2s 동안 셀이 서서히 커진다 = 발효처럼 보인다(공짜 연출)
    cellFreq: n(cur.cellFreq, target.cellFreq),
    markHeight: n(cur.markHeight, target.markHeight),
    residue: n(cur.residue, target.residue),
    grabMax: n(cur.grabMax, target.grabMax),
    grabCreepGain: n(cur.grabCreepGain, target.grabCreepGain),
    grabReturnZeta: n(cur.grabReturnZeta, target.grabReturnZeta),
    pinholes: n(cur.pinholes, target.pinholes),
    foam: n(cur.foam, target.foam),
    sink: n(cur.sink, target.sink),
    stir: n(cur.stir, target.stir),
    vigor: n(cur.vigor, target.vigor),
    chill: n(cur.chill, target.chill),
    warm: n(cur.warm, target.warm),
  };
}
