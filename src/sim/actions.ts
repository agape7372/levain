// applyAction(state, action, now) — 순수. 호출자는 반드시 advance(tick)를 선행한다
// (액션 순서 불변식 — docs/ARCHITECTURE.md §2). 정본: docs/GDD.md §5·§6·§3-7.
import type { Action, DoughQuality, FeedRatio, Flour, SimEvent, SimState } from './types';
import {
  FLAKE_COST_G,
  FLAKE_MATURITY_KEEP,
  FLAKE_STAGE,
  FRIDGE_STAGE,
  HOUR,
  INITIAL_MASS,
  MATURITY_MIN_GAP_H,
  RATIOS,
  REVIVE_GAP_H,
  SEED_G,
  SPLIT_MIN_G,
} from './constants';
import { activityAt, clamp, effSinceFeedMs, phaseAt, rateMult, stageOf } from './derive';
import { canBakeBread, canBakeDiscard, bakeScore, gradeOf, recipeById } from './recipes';

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
    flour: 'white', // 부활·창조는 기본 가루 — flour 선택은 급여 액션의 몫
    location: 'room',
    locAnchorAt: now,
    effBaseMs: 0,
    acidity: 0,
    maturity: 0,
    mass: INITIAL_MASS,
    reviveProgress: 0,
    lastDiscardBakeAt: null,
    flake: null,
  };
}

function withFeed(state: SimState, ratio: FeedRatio, flour: Flour, now: number): SimState {
  const r = RATIOS[ratio];
  return {
    ...state,
    lastFedAt: now,
    locAnchorAt: now,
    effBaseMs: 0,
    feedRatio: ratio,
    flour, // flour는 여기(급여)에서만 바뀐다 — FLOUR_TIME_MULT 균일 배율의 전제
    mass: r.mass,
    acidity: clamp(state.acidity * r.dilute, 0, 100),
  };
}

function feed(state: SimState, ratio: FeedRatio, flour: Flour, now: number): ActionResult {
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
      const next = { ...withFeed(state, ratio, flour, now), reviveProgress: 1 as const };
      return { state: next, events: [{ type: 'reviveStarted' }] };
    }
    if (effH < REVIVE_GAP_H) {
      // 너무 이른 2회차 — 무해: 산미 희석·mass 보충만, 의식 타이머(lastFedAt)는 보존
      const next = { ...state, mass: r.mass, acidity: clamp(state.acidity * r.dilute, 0, 100) };
      return { state: next, events: [{ type: 'reviveTooSoon' }] };
    }
    const next = { ...withFeed(state, ratio, flour, now), reviveProgress: 0 as const };
    return { state: next, events: [{ type: 'revived' }, { type: 'fed', ratio, maturityGained: false }] };
  }

  // 일반 급여 — maturity는 유효 6h↑ + 활발·배고픔에서만 적립 (연타 무효, GDD §3-6)
  const gained = effH >= MATURITY_MIN_GAP_H && (phase === 'active' || phase === 'hungry');
  let next = withFeed(state, ratio, flour, now);
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
  const folded = state.effBaseMs + Math.max(0, now - state.locAnchorAt) * rateMult(state);
  const next: SimState = { ...state, location: to, locAnchorAt: now, effBaseMs: folded };
  return { state: next, events: [{ type: 'moved', to }] };
}

function bake(
  state: SimState,
  recipeId: string,
  now: number,
  variantId?: string,
  houseStage = 0,
  dough?: DoughQuality,
): ActionResult {
  const recipe = recipeById(recipeId);
  if (!recipe || recipe.kind !== 'bread') {
    return { state, events: [{ type: 'bakeBlocked', reason: 'unknownRecipe' }] };
  }
  const gate = canBakeBread(state, recipe, now, houseStage);
  if (gate !== 'ok') return { state, events: [{ type: 'bakeBlocked', reason: gate }] };

  // 도감 기록은 전역(집의 기록) — store가 baked 이벤트로 갱신한다 (확장기획 §5-4)
  // 그램 원가도 마찬가지로 store 소관: 빵은 보관 통에서 나가고 르방이의 mass는 변하지 않는다.
  // 판정만 여기서 — **GDD §6-2 개정(2026-09-05)**: 등급은 화면에 떠 있는 르방이 아니라
  // 통에서 나가는 반죽(dough)이 정한다. 08-25 "품질 세탁 수용"의 번복이다. dough 부재면
  // 옛 규칙(활성 르방 자기 상태)으로 판정한다 — 후방 호환·순수성 유지(통은 store 소관).
  const grade = dough
    ? gradeOf(bakeScore(recipe, dough.activity, dough.acidity, dough.flour))
    : gradeOf(bakeScore(recipe, activityAt(state, now), state.acidity, state.flour));
  return { state, events: [{ type: 'baked', recipeId, grade, ...(variantId ? { variantId } : {}) }] };
}

/**
 * 떼어내기 — 씨앗만 남기고 보관 통으로 (GDD §6-2). 통 적립은 store가 split 이벤트로 한다.
 * 게이트가 유효시간인 이유: 급여는 mass를 리셋하므로(withFeed) 시간 게이트가 없으면
 * 밥 연타 → 떼기 연타로 무한 적립된다. phase==='active'는 단조가 아니라 피크를 놓친
 * 플레이어가 회수를 못 하므로 쓰지 않는다 — 한 번 열리면 다음 급여까지 닫히지 않아야 한다.
 */
function split(state: SimState, now: number): ActionResult {
  const amount = state.mass - SEED_G;
  if (amount < SPLIT_MIN_G) return { state, events: [{ type: 'splitBlocked', reason: 'mass' }] };
  if (effSinceFeedMs(state, now) < MATURITY_MIN_GAP_H * HOUR) {
    return { state, events: [{ type: 'splitBlocked', reason: 'tooSoon' }] };
  }
  const next: SimState = { ...state, mass: SEED_G };
  return { state: next, events: [{ type: 'split', amount }] };
}

function bakeDiscard(
  state: SimState,
  recipeId: string,
  now: number,
  variantId?: string,
  houseStage = 0,
): ActionResult {
  const recipe = recipeById(recipeId);
  if (!recipe || recipe.kind !== 'discard') {
    return { state, events: [{ type: 'bakeBlocked', reason: 'unknownRecipe' }] };
  }
  // 해금은 집 기준, 쿨다운은 이 르방 것 — discard는 "이 르방의 덜어낸 반죽"이라 쿨다운만 개체 소유다
  const gate = canBakeDiscard(state, recipe, now, houseStage);
  if (gate !== 'ok') return { state, events: [{ type: 'bakeBlocked', reason: gate }] };

  const next: SimState = { ...state, lastDiscardBakeAt: now };
  return { state: next, events: [{ type: 'bakedDiscard', recipeId, ...(variantId ? { variantId } : {}) }] };
}

/** 얇게 펴 말리기 — 죽음 보험. 덮어쓰기 허용(최신 스냅이 더 낫다) */
function makeFlake(state: SimState, now: number): ActionResult {
  if (stageOf(state, now) < FLAKE_STAGE) return { state, events: [{ type: 'flakeBlocked', reason: 'stage' }] };
  if (phaseAt(state, now) !== 'active') return { state, events: [{ type: 'flakeBlocked', reason: 'phase' }] };
  if (state.mass < SEED_G + FLAKE_COST_G) return { state, events: [{ type: 'flakeBlocked', reason: 'mass' }] };
  const next: SimState = {
    ...state,
    mass: state.mass - FLAKE_COST_G,
    flake: { madeAt: now, maturity: state.maturity },
  };
  return { state: next, events: [{ type: 'flakeMade' }] };
}

/**
 * 곰팡이 확정 후 폐기 — 새 개체로 다시 시작. 플레이크는 사람의 기록이라 남는다.
 * 도감은 v2에서 전역(집의 기록)이라 여기서 보존 로직이 필요 없다 — 확장기획 §5-4가 예고한 단순화.
 * 이름(name)도 starter 레코드 소유라 자동 이월된다 (§11-2 "기본으로 이월하도록 바꾸는 게 옳음").
 */
function discardStarter(state: SimState, now: number): ActionResult {
  if (phaseAt(state, now) !== 'moldy') return { state, events: [] }; // 살아있는 르방은 버릴 수 없다
  const next: SimState = { ...initialState(now), flake: state.flake };
  return { state: next, events: [{ type: 'starterDiscarded' }] };
}

/**
 * 곰팡이 확정 후 플레이크 복원 — 같은 계보. createdAt 보존(stageOf 일수 게이트 유지가
 * 핵심 — 이름·도감은 이제 sim 밖 소유라 자연 보존), maturity ×0.6, 부활 의식
 * (reviveProgress=1) 경유로 기존 2세션 부활 기계·문구·알림을 전량 재사용한다.
 */
function restoreFlake(state: SimState, now: number): ActionResult {
  if (phaseAt(state, now) !== 'moldy' || state.flake === null) return { state, events: [] };
  const next: SimState = {
    ...state,
    lastFedAt: now,
    locAnchorAt: now,
    effBaseMs: 0,
    feedRatio: '1:1:1',
    flour: 'white', // 부활·창조는 기본 가루 — flour 선택은 급여 액션의 몫
    location: 'room',
    acidity: 0,
    mass: INITIAL_MASS,
    maturity: Math.floor(state.flake.maturity * FLAKE_MATURITY_KEEP),
    reviveProgress: 1,
    lastDiscardBakeAt: null,
    flake: null,
  };
  return { state: next, events: [{ type: 'flakeRestored' }] };
}

export function applyAction(state: SimState, action: Action, now: number): ActionResult {
  // 곰팡이 확정 — 종결 2액션만 통과. 씨앗 불가침과 같은 결: 죽음 앞에서 다른 일은 없다
  if (phaseAt(state, now) === 'moldy' && action.type !== 'discardStarter' && action.type !== 'restoreFlake') {
    return { state, events: [{ type: 'moldBlocked' }] };
  }
  switch (action.type) {
    case 'feed': return feed(state, action.ratio, action.flour ?? state.flour, now);
    case 'setLocation': return setLocation(state, action.to, now);
    // houseStage·dough는 store가 doDispatch에서 주입한다 (types.ts Action 주석) — 부재 = 옛 규칙
    case 'bake': return bake(state, action.recipeId, now, action.variantId, action.houseStage ?? 0, action.dough);
    case 'bakeDiscard': return bakeDiscard(state, action.recipeId, now, action.variantId, action.houseStage ?? 0);
    case 'split': return split(state, now);
    case 'makeFlake': return makeFlake(state, now);
    case 'discardStarter': return discardStarter(state, now);
    case 'restoreFlake': return restoreFlake(state, now);
  }
}
