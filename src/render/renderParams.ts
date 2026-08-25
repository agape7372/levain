// Snapshot → RenderParams — sim→render 유일한 이음새의 렌더 쪽 절반 (순수, three 무의존, vitest 대상).
// uniform 값 범위·앵커: docs/VISUAL.md §3-2·§3-3. 시작 공식 — 실기기에서 상수만 미세 튜닝.
//
// 2026-08-25 축 개편: 구 `liquidity` 1축이 **형상과 물성을 동시에** 몰아서 갓 밥준 르방이
// "묽은 배터"로 읽혔다(모양은 수평을 찾지만 재질은 되직해야 하는데 한 축으로는 불가능).
// 4축으로 분해 — levelness(형상) / fluidity(흐름) / cohesion(응집) / elasticity(되돌아옴).
// `liquidity` 필드는 **부활 금지** — 남기면 두 의미가 다시 섞인다.
import type { Snapshot } from '../sim/types';
// seam 예외: 이 파일만 sim 상수를 읽는다 (ARCHITECTURE §4). markFill을 닫힌 형태로 재구성하기 위한
// 것이고, 규칙 9(수치 하드코딩 금지)를 지키는 유일한 길이다. 의존 방향은 sim ← render로 합법.
import { FILL_MAX, FILL_PEAK_RISE, STAGE_FILL_FACTOR } from '../sim/constants';

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
  fillY: number;           // 0.6~1.6 (급여 시점=1.0 기준)
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
  /** 몸통 적도 반경 배율 — 병에 담긴 반죽은 늘 유리에 닿는다. 마르면 물러난다. 1.0~1.113 */
  wallFill: number;
  /** 유리벽 기공 세기 0~1 — 살아있는 분기 전용(휴면·kahm·곰팡이에서 0) */
  wallCells: number;
  /** 유리벽 기공 주파수 34(크고 성김·피크)~80(잘고 촘촘·갓 밥준) */
  cellFreq: number;
  /** 이번 사이클 최고 수위 — 유리 자국 배치용. fill과 같은 단위 */
  markFill: number;
  /** 유리 자국 세기 0~1 — 피크를 찍고 내려온 뒤에만 존재한다 */
  residue: number;
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
const SOUR_TONE = hex(0xcbbda2);
const DORMANT_TONE = hex(0xe4dccc);
// 곰팡이 확정 — 잿빛이 도는 바랜 톤. 경고는 다이제틱(반점) 소관, 빨강 시맨틱 없음 (VISUAL §7-1)
const MOLDY_TONE = hex(0xd8d0be);
// 밀가루 색 톤 시프트 (§7-2) — 통밀 = 따뜻한 담갈, 호밀 = 어두운 회갈. 상태 톤 위에 약하게 얹는다
const WHOLEWHEAT_TONE = hex(0xd9c4a3);
const RYE_TONE = hex(0xbfb096);
const FLOUR_TONE_MIX = 0.35;

export function toRenderParams(s: Snapshot): RenderParams {
  const a = clamp01(s.activity);
  const moldy = s.phase === 'moldy';

  let color = mix(CREAM, HUNGRY_TONE, clamp01(s.hunger));
  // 밀가루 톤 — 상태 톤보다 먼저(재료가 바탕색), 상태 변화가 그 위를 지나간다
  if (s.flour === 'wholewheat') color = mix(color, WHOLEWHEAT_TONE, FLOUR_TONE_MIX);
  else if (s.flour === 'rye') color = mix(color, RYE_TONE, FLOUR_TONE_MIX);
  color = mix(color, SOUR_TONE, smooth(0.25, 0.6, s.sourness));
  color = mix(color, DORMANT_TONE, clamp01(s.dormancy));
  if (moldy) color = mix(color, MOLDY_TONE, 0.7);

  // liquidity 재료 — 급여 직후 젖은 광 + 피크 거품광 바닥값 (실물 피크 르방은 젖은 유광)
  const wet = clamp01(Math.max(
    (1 - smooth(0.15, 0.8, a)) * (1 - smooth(0, 0.45, s.hunger)) * (1 - s.dormancy),
    0.5 * smooth(0.55, 0.95, a) * (1 - s.dormancy),
  ));
  const ripe = smooth(0.7, 0.95, a) * (1 - clamp01(s.dormancy));
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

  return {
    color,
    // moldy = 유일하게 숨이 완전히 멎는 상태 (휴면의 '완전 정지 금지'는 죽음 오인 방지책이었다)
    breatheAmp: moldy ? 0 : 0.006 + (0.055 - 0.006) * a,
    breathePeriod: 2.6 + (7.0 - 2.6) * Math.pow(1 - a, 1.5),
    noiseSpeed: moldy ? 0 : 0.1 + 1.5 * a,
    bubbleDensity: moldy ? 0 : clamp01(a * 0.9 * (1 - 0.85 * s.dormancy)),
    bubbleScale: 0.5 + 0.8 * a,
    // 피크에서도 무광 페이스트 — 과한 스펙은 플라스틱으로 읽힌다 (젖은 광은 uWet 소관).
    // ⚠ 2026-08-25 실사진 관찰이 가설을 뒤집었다: "갓 섞은 젖은 페이스트가 가장 유광"이라 보고
    // wet 쪽으로 옮기려 했으나, 실제 병 사진의 갓 밥준은 **무광·칙칙**이다(밀가루 먼지 + 젓은 자국).
    // 유광은 피크의 것이다 — 얇은 기포막이 빛을 받아야 젖은 광이 생긴다.
    // 그래서 gas가 주도하고 wet은 바닥을 조금 올리는 역할만 한다. 갓 밥준이 죽어 보이지 않는 건
    // 광택이 아니라 물성(cohesion·creep)이 담당한다 — 그게 이번 개편의 요지다
    specStr: Math.min(1.0, Math.max(0.1, 0.12 + 0.18 * wet + 0.68 * gas - 0.3 * hun - 0.6 * dry)),
    crust: 0.8 * clamp01(Math.max(s.dormancy, moldy ? 1 : 0)),
    fillY: s.fill,
    hoochAmt: clamp01(s.hooch),
    wet,
    ripe,
    collapse,
    // spot 진입 직후 mold01≈0이라 반점이 안 보임 — 예고는 보여야 예고다 (바닥값 0.25)
    mold: s.moldStage === 'none' ? 0 : Math.max(0.25, clamp01(s.mold01)),
    kahm: s.kahm ? 1 : 0,
    levelness,
    fluidity,
    cohesion,
    elasticity,
    // 유리 접촉 — 0.62 × 1.113 = 0.690 = R_XZ_MAX_BASE. 이 배율이 없으면 몸통 최대 반경이
    // 영원히 0.62(월드 0.806)에 묶여 유리 내벽 0.92와 12.4% 틈이 남는다. 소프트 니 클램프도,
    // 메니스커스도 그래서 지금껏 한 번도 제대로 발동한 적이 없다 (2026-08-25 감사)
    // 굶으면 위쪽이 유리에서 떨어진다(실사진 관찰 f — "can pull fully away from glass near top"),
    // 마르면 더 물러난다
    wallFill: 1 + 0.113 * (1 - 0.62 * dry) * (1 - 0.22 * spent),
    wallCells: clamp01(0.14 + 0.28 * cohesion + 0.72 * gas + 0.35 * collapse + 0.25 * spent) * alive,
    // 아래는 압력에 눌려 잘고 촘촘, 위는 합쳐져 크고 성글 — 실물 병 사진의 문법
    cellFreq: 80 - 46 * clamp01(0.25 + 0.75 * gas + 0.45 * collapse + 0.2 * spent),
    // 최고 수위를 sim의 peakFill과 같은 식으로 재구성 (derive.ts:143) — 상태 추가 0, 세션 기억 0.
    // stage 0 D2 가짜 부풀기 구간만 실제보다 낮게 잡히는데 max(, fill)이 흡수한다(화장품 오차)
    markFill: Math.min(FILL_MAX, Math.max(s.fill, 1 + FILL_PEAK_RISE * (STAGE_FILL_FACTOR[s.stage] ?? 1))),
    // 자국은 피크를 찍고 내려온 뒤에만 존재한다 — 상승기(hunger 0)엔 0
    residue: clamp01(Math.max(smooth(0.05, 0.55, hun), 0.9 * dry)) * (1 - 0.35 * hoo),
    // grab 물성 — 갓밥준 태피(응집↑ 탄성↓ 잔류↑) / 피크 탱탱 / 시큼 풀림 / 휴면 뻣뻣.
    // 계수는 사용자 실기기 확정치(피크 grabMax 0.600 · ζ 0.956)가 나오도록 역산해 고정했다.
    // 2026-08-25 이전 버그: creepGain이 hunger·sourness만 봐서 **갓 밥준이 전 상태 중 최저(0.310)**
    // = 가장 고무줄 — 마켓팅 잠금("강한 스프링 금지")과 정확히 반대로 구현돼 있었다
    grabMax: moldy
      ? 0.08
      : (0.11912 + 0.313 * cohesion + 0.205 * elasticity + 0.281 * slack - 0.08 * proteo) * (1 - 0.52 * dry),
    grabCreepGain: moldy ? 0.06 : clamp01(0.25 + 0.48 * (1 - elasticity) + 0.18 * hun) * (1 - 0.8 * dry),
    grabReturnZeta: 1.07 - 0.13 * elasticity,
  };
}

/** 프레임 스무딩 — 지수 lerp (τ초). 앱 오픈 스냅은 호출자가 params를 직접 대입 */
export function smoothParams(cur: RenderParams, target: RenderParams, dtSec: number, tau = 1.2): RenderParams {
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
    fillY: n(cur.fillY, target.fillY),
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
    wallFill: n(cur.wallFill, target.wallFill),
    wallCells: n(cur.wallCells, target.wallCells),
    // cellFreq도 보간 대상 — τ1.2s 동안 셀이 서서히 커진다 = 발효처럼 보인다(공짜 연출)
    cellFreq: n(cur.cellFreq, target.cellFreq),
    markFill: n(cur.markFill, target.markFill),
    residue: n(cur.residue, target.residue),
    grabMax: n(cur.grabMax, target.grabMax),
    grabCreepGain: n(cur.grabCreepGain, target.grabCreepGain),
    grabReturnZeta: n(cur.grabReturnZeta, target.grabReturnZeta),
  };
}
