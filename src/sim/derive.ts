// 닫힌 함수 파생 — 저장값(타임스탬프+누적)에서 모든 표시 상태를 계산한다.
// 정본: docs/GDD.md §3. 순수 함수만.
import type { MoldStage, Phase, SimState, SmellBand, Snapshot } from './types';
import {
  DAY,
  DORMANT_AFTER_HUNGRY_H,
  FAKE_RISE_FACTOR,
  FILL_DORMANT,
  FILL_HUNGRY,
  FILL_MAX,
  FILL_MIN,
  FILL_PEAK_RISE,
  FILL_SOUR,
  HOOCH_AFTER_HUNGRY_H,
  HOUR,
  MOLD_DEAD_AFTER_HUNGRY_H,
  MOLD_SPOT_AFTER_HUNGRY_H,
  MOLD_SPREAD_AFTER_HUNGRY_H,
  RATIOS,
  SMELL_BANDS,
  SOUR_AFTER_HUNGRY_H,
  STAGES,
  STAGE_FILL_FACTOR,
  TEMP_MULT,
} from './constants';

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 유효 경과 ms — 위치 앵커 회계(types.ts SimState 주석 참조) */
export function effSinceFeedMs(state: SimState, now: number): number {
  return state.effBaseMs + Math.max(0, now - state.locAnchorAt) * TEMP_MULT[state.location];
}

/** 현재 비율의 상태 전이 경계 (유효시간 h) */
export function boundariesH(state: SimState): {
  latent: number; peakStart: number; peakEnd: number;
  hungry: number; sour: number; dormant: number; hooch: number;
  moldSpot: number; moldSpread: number; moldDead: number;
} {
  const r = RATIOS[state.feedRatio];
  return {
    latent: r.latentH,
    peakStart: r.peakStartH,
    peakEnd: r.peakEndH,
    hungry: r.hungryH,
    sour: r.hungryH + SOUR_AFTER_HUNGRY_H,
    dormant: r.hungryH + DORMANT_AFTER_HUNGRY_H,
    hooch: r.hungryH + HOOCH_AFTER_HUNGRY_H,
    moldSpot: r.hungryH + MOLD_SPOT_AFTER_HUNGRY_H,
    moldSpread: r.hungryH + MOLD_SPREAD_AFTER_HUNGRY_H,
    moldDead: r.hungryH + MOLD_DEAD_AFTER_HUNGRY_H,
  };
}

export function phaseAt(state: SimState, now: number): Phase {
  const b = boundariesH(state);
  const effH = effSinceFeedMs(state, now) / HOUR;
  // moldy 판정이 부활 의식 오버라이드보다 먼저 — 의식 1회차 후 방치해도 곰팡이는 온다
  if (effH >= b.moldDead) return 'moldy';
  if (state.reviveProgress === 1) return 'dormant'; // 부활 의식 중 — 아직 잠에서 깨는 중
  if (effH < b.hungry) return 'active';
  if (effH < b.sour) return 'hungry';
  if (effH < b.dormant) return 'sour';
  return 'dormant';
}

/** 곰팡이 단계 — 휴면의 파생 하위단계 2개(예고) + 사망 */
export function moldStageAt(state: SimState, now: number): MoldStage {
  const b = boundariesH(state);
  const effH = effSinceFeedMs(state, now) / HOUR;
  if (effH >= b.moldDead) return 'dead';
  if (effH >= b.moldSpread) return 'spread';
  if (effH >= b.moldSpot) return 'spot';
  return 'none';
}

/** 활성 곡선 (GDD §3-2): 잠복 → 상승 → 피크 → 하강 → 잔불 */
export function activityAt(state: SimState, now: number): number {
  const b = boundariesH(state);
  const effH = effSinceFeedMs(state, now) / HOUR;
  let a: number;
  if (effH < b.latent) a = lerp(0, 0.15, effH / b.latent);
  else if (effH < b.peakStart) a = lerp(0.15, 1, smoothstep(b.latent, b.peakStart, effH));
  else if (effH < b.peakEnd) a = 1;
  else if (effH < b.hungry) a = lerp(1, 0.2, smoothstep(b.peakEnd, b.hungry, effH));
  else if (effH < b.sour) a = lerp(0.2, 0.08, (effH - b.hungry) / (b.sour - b.hungry));
  else if (effH < b.dormant) a = lerp(0.08, 0.02, (effH - b.sour) / (b.dormant - b.sour));
  else a = 0.01;
  if (state.reviveProgress === 1) a *= 0.3; // 깨어나는 중 — 희미한 생기만
  return a;
}

export function stageOf(state: SimState, now: number): number {
  const ageDays = (now - state.createdAt) / DAY;
  let stage = 0;
  for (let i = 0; i < STAGES.length; i++) {
    if (state.maturity >= STAGES[i].cycles && ageDays >= STAGES[i].days) stage = i;
  }
  return stage;
}

/** 부피 표현 계수 — 잠잠기 억제 + D2 가짜 부풀기(실제 현상) */
function stageFillFactor(state: SimState, now: number, stage: number): number {
  if (stage === 0) {
    const age = now - state.createdAt;
    if (age >= DAY && age < 2 * DAY) return FAKE_RISE_FACTOR;
  }
  return STAGE_FILL_FACTOR[stage] ?? 1.0;
}

function smellOf(acidity: number): SmellBand {
  for (const [limit, band] of SMELL_BANDS) if (acidity < limit) return band;
  return 'acetone';
}

export function deriveSnapshot(state: SimState, now: number): Snapshot {
  const b = boundariesH(state);
  const effMs = effSinceFeedMs(state, now);
  const effH = effMs / HOUR;
  const phase = phaseAt(state, now);
  const activity = activityAt(state, now);
  const stage = stageOf(state, now);
  const sf = stageFillFactor(state, now, stage);

  // fill: 급여 시점(고무줄) = 1.0 기준, 피크에서 넘고 지치면 그 아래로 꺼진다
  let fill: number;
  const peakFill = 1.0 + FILL_PEAK_RISE * sf;
  if (effH < b.peakEnd) fill = 1.0 + FILL_PEAK_RISE * sf * activity;
  else if (effH < b.hungry) fill = lerp(peakFill, FILL_HUNGRY, smoothstep(b.peakEnd, b.hungry, effH));
  else if (effH < b.sour) fill = lerp(FILL_HUNGRY, FILL_SOUR, (effH - b.hungry) / (b.sour - b.hungry));
  else if (effH < b.dormant) fill = lerp(FILL_SOUR, FILL_DORMANT, (effH - b.sour) / (b.dormant - b.sour));
  else fill = FILL_DORMANT;
  fill = clamp(fill, FILL_MIN, FILL_MAX);

  const hunger = smoothstep(b.peakEnd, b.sour, effH);
  const hooch = smoothstep(b.hooch, b.dormant, effH);
  let dormancy = smoothstep(b.sour + (b.dormant - b.sour) * 0.6, b.dormant, effH);
  if (phase === 'dormant') dormancy = state.reviveProgress === 1 ? 0.6 : 1;

  const mult = TEMP_MULT[state.location];
  const wallFor = (h: number): number =>
    state.locAnchorAt + Math.max(0, h * HOUR - state.effBaseMs) / mult;

  const moldStage = moldStageAt(state, now);
  // kahm 막 — 창가(더위)×시큼 이후, 곰팡이 반점 전. 무해하지만 곰팡이로 오판하기 쉬운 상태
  const kahm = state.location === 'window' && effH >= b.sour && effH < b.moldSpot;

  return {
    phase,
    activity,
    hunger,
    sourness: clamp(state.acidity / 100, 0, 1),
    dormancy,
    fill,
    hooch,
    smell: smellOf(state.acidity),
    stage,
    mass: state.mass,
    nextFeedAt: wallFor(b.hungry),
    peakAt: wallFor(b.peakStart),
    effSinceFeedMs: effMs,
    moldStage,
    mold01: smoothstep(b.moldSpot, b.moldDead, effH),
    moldDeadAt: wallFor(b.moldDead),
    kahm,
    hasFlake: state.flake !== null,
  };
}
