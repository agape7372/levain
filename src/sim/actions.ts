// applyAction(state, action, now) — 순수. 호출자는 반드시 advance(tick)를 선행한다
// (액션 순서 불변식 — docs/ARCHITECTURE.md §2). 정본: docs/GDD.md §5·§6·§3-7.
import type { Action, FeedRatio, SimEvent, SimState } from './types';
import {
  FRIDGE_STAGE,
  HOUR,
  INITIAL_MASS,
  MATURITY_MIN_GAP_H,
  RATIOS,
  REVIVE_GAP_H,
  TEMP_MULT,
} from './constants';
import { activityAt, clamp, effSinceFeedMs, phaseAt, stageOf } from './derive';
import { betterGrade, canBakeBread, canBakeDiscard, bakeScore, gradeOf, recipeById } from './recipes';

export interface ActionResult {
  state: SimState;
  events: SimEvent[];
}

/** 창조 의식(온보딩) 직후 초기 상태 — 첫 급여 1:1:1이 이미 반영된 모습 (GDD §2) */
export function initialState(now: number): SimState {
  return {
    createdAt: now,
    lastFedAt: now,
    lastSimulatedAt: now,
    feedRatio: '1:1:1',
    location: 'room',
    locAnchorAt: now,
    effBaseMs: 0,
    acidity: 0,
    maturity: 0,
    mass: INITIAL_MASS,
    reviveProgress: 0,
    lastDiscardBakeAt: null,
    collection: {},
    label: null,
  };
}

function withFeed(state: SimState, ratio: FeedRatio, now: number): SimState {
  const r = RATIOS[ratio];
  return {
    ...state,
    lastFedAt: now,
    locAnchorAt: now,
    effBaseMs: 0,
    feedRatio: ratio,
    mass: r.mass,
    acidity: clamp(state.acidity * r.dilute, 0, 100),
  };
}

function feed(state: SimState, ratio: FeedRatio, now: number): ActionResult {
  const events: SimEvent[] = [];
  const r = RATIOS[ratio];
  const stageBefore = stageOf(state, now);
  if (stageBefore < r.stage) return { state, events: [{ type: 'ratioLocked', ratio }] };

  const phase = phaseAt(state, now);
  const effH = effSinceFeedMs(state, now) / HOUR;

  // 휴면 — 부활 의식 (2세션, GDD §3-7)
  if (phase === 'dormant') {
    if (state.location !== 'room') return { state, events: [{ type: 'needRoom' }] };
    if (state.reviveProgress === 0) {
      const next = { ...withFeed(state, ratio, now), reviveProgress: 1 as const };
      return { state: next, events: [{ type: 'reviveStarted' }] };
    }
    if (effH < REVIVE_GAP_H) {
      // 너무 이른 2회차 — 무해: 산미 희석·mass 보충만, 의식 타이머(lastFedAt)는 보존
      const next = { ...state, mass: r.mass, acidity: clamp(state.acidity * r.dilute, 0, 100) };
      return { state: next, events: [{ type: 'reviveTooSoon' }] };
    }
    const next = { ...withFeed(state, ratio, now), reviveProgress: 0 as const };
    return { state: next, events: [{ type: 'revived' }, { type: 'fed', ratio, maturityGained: false }] };
  }

  // 일반 급여 — maturity는 유효 6h↑ + 활발·배고픔에서만 적립 (연타 무효, GDD §3-6)
  const gained = effH >= MATURITY_MIN_GAP_H && (phase === 'active' || phase === 'hungry');
  let next = withFeed(state, ratio, now);
  if (gained) next = { ...next, maturity: next.maturity + 1 };
  events.push({ type: 'fed', ratio, maturityGained: gained });

  const stageAfter = stageOf(next, now);
  if (stageAfter > stageBefore) events.push({ type: 'stageUp', stage: stageAfter });
  return { state: next, events };
}

function setLocation(state: SimState, to: SimState['location'], now: number): ActionResult {
  if (to === state.location) return { state, events: [] };
  if (to === 'fridge' && stageOf(state, now) < FRIDGE_STAGE) {
    return { state, events: [{ type: 'locationLocked' }] };
  }
  // 위치 앵커 회계: 지금까지의 유효시간을 접어 넣고 새 배율로 이어 간다 (types.ts 주석)
  const folded = state.effBaseMs + Math.max(0, now - state.locAnchorAt) * TEMP_MULT[state.location];
  const next: SimState = { ...state, location: to, locAnchorAt: now, effBaseMs: folded };
  return { state: next, events: [{ type: 'moved', to }] };
}

function bake(state: SimState, recipeId: string, now: number): ActionResult {
  const recipe = recipeById(recipeId);
  if (!recipe || recipe.kind !== 'bread') {
    return { state, events: [{ type: 'bakeBlocked', reason: 'unknownRecipe' }] };
  }
  const gate = canBakeBread(state, recipe, now);
  if (gate !== 'ok') return { state, events: [{ type: 'bakeBlocked', reason: gate }] };

  const grade = gradeOf(bakeScore(recipe, activityAt(state, now), state.acidity));
  const prev = state.collection[recipeId];
  const entry = prev
    ? { bestGrade: betterGrade(prev.bestGrade, grade), count: prev.count + 1, firstAt: prev.firstAt }
    : { bestGrade: grade, count: 1, firstAt: now };
  const next: SimState = {
    ...state,
    mass: state.mass - recipe.cost,
    collection: { ...state.collection, [recipeId]: entry },
  };
  return { state: next, events: [{ type: 'baked', recipeId, grade }] };
}

function bakeDiscard(state: SimState, recipeId: string, now: number): ActionResult {
  const recipe = recipeById(recipeId);
  if (!recipe || recipe.kind !== 'discard') {
    return { state, events: [{ type: 'bakeBlocked', reason: 'unknownRecipe' }] };
  }
  const gate = canBakeDiscard(state, recipe, now);
  if (gate !== 'ok') return { state, events: [{ type: 'bakeBlocked', reason: gate }] };

  const prev = state.collection[recipeId];
  const entry = prev
    ? { ...prev, count: prev.count + 1 }
    : { bestGrade: null, count: 1, firstAt: now };
  const next: SimState = {
    ...state,
    lastDiscardBakeAt: now,
    collection: { ...state.collection, [recipeId]: entry },
  };
  return { state: next, events: [{ type: 'bakedDiscard', recipeId }] };
}

function setLabel(state: SimState, label: string, now: number): ActionResult {
  if (stageOf(state, now) < 5) return { state, events: [{ type: 'labelLocked' }] };
  const trimmed = label.trim().slice(0, 12);
  if (!trimmed) return { state, events: [] };
  return { state: { ...state, label: trimmed }, events: [{ type: 'labeled' }] };
}

export function applyAction(state: SimState, action: Action, now: number): ActionResult {
  switch (action.type) {
    case 'feed': return feed(state, action.ratio, now);
    case 'setLocation': return setLocation(state, action.to, now);
    case 'bake': return bake(state, action.recipeId, now);
    case 'bakeDiscard': return bakeDiscard(state, action.recipeId, now);
    case 'setLabel': return setLabel(state, action.label, now);
  }
}
