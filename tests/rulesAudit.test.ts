// 2026-11-12 총 감사 수리 A — sim·store 규칙과 경제 회귀 잠금.
// 재현 원본: 감사 T1 exploit(E1·E2·E3)·probe(P1)·clockfloat, T7-23·T7-24.
import { describe, it, expect } from 'vitest';
import {
  initialState, applyAction, advance, activityAt, recipeById, RECIPES, sourFit, bakeScore, gradeOf,
  HOUR, DAY, RATIOS, INGREDIENTS, INGREDIENT_SOFT_CAP, AD_SLOT_DAILY, STAGE_REWARD_FLOUR,
  planNotificationsAll,
} from '../src/sim';
import type { FeedRatio, Flour, SimEvent, SimState } from '../src/sim';
import { FakeClock } from '../src/platform/clock';
import type { StorageAdapter } from '../src/platform/storage';
import { createGameStore, newEnvelope } from '../src/store/gameStore';
import { activityBand } from '../src/ui/format';

const T0 = Date.UTC(2026, 0, 5, 0, 0, 0);

const mem = (): StorageAdapter & { raw: () => string | null } => {
  let v: string | null = null;
  return {
    loadRaw: () => v, saveRaw: (j) => { v = j; return true; },
    mirror: () => undefined, loadMirror: async () => null, raw: () => v,
  };
};

/** 5단계 르방, 직전 급여 T0, 시계는 T0 + effH */
function mature(effH = 7) {
  const clock = new FakeClock(T0 + effH * HOUR);
  const env = newEnvelope(T0);
  env.starters[0].sim = { ...initialState(T0), createdAt: T0 - 40 * DAY, maturity: 45, mass: 480 };
  env.shared.economy.stageMax = 5;
  const storage = mem();
  return { store: createGameStore({ clock, storage }, env), clock, storage };
}

describe('A1 급여 미션은 유효 6h 간격 급여만 센다 (T1-01)', () => {
  it('E1: 같은 시각 급여 100회 → 미션 +1(첫 급여만)', () => {
    const { store } = mature(7);
    const feeds0 = store.getEconomy().feeds;
    const flour0 = store.getFlour();
    for (let i = 0; i < 100; i++) store.dispatch({ type: 'feed', ratio: '1:1:1' });
    expect(store.getEconomy().feeds - feeds0).toBe(1);
    expect(store.getFlour()).toBe(flour0);
  });

  it('시큼 급여는 maturity 없이 미션만 센다 / 부활 2회차도 센다', () => {
    const s: SimState = { ...initialState(T0), createdAt: T0 - 40 * DAY, maturity: 45 };
    const sour = applyAction(advance(s, T0 + 40 * HOUR), { type: 'feed', ratio: '1:1:1' }, T0 + 40 * HOUR);
    expect(sour.events).toContainEqual({ type: 'fed', ratio: '1:1:1', maturityGained: false, counted: true });

    const dormant = advance(s, T0 + 130 * HOUR);
    const r1 = applyAction(dormant, { type: 'feed', ratio: '1:1:1' }, T0 + 130 * HOUR);
    const t2 = T0 + 139 * HOUR;
    const r2 = applyAction(advance(r1.state, t2), { type: 'feed', ratio: '1:1:1' }, t2);
    expect(r2.events).toContainEqual({ type: 'fed', ratio: '1:1:1', maturityGained: false, counted: true });
  });
});

describe('A2 굽기 미션은 discard 굽기 벽시계 6h 간격만 센다 (T1-02)', () => {
  it('E2: 0.5초 간격 급여+팬케이크 50회 → 굽기는 50번 되지만 미션은 +1', () => {
    const { store, clock } = mature(7);
    const b0 = store.getEconomy().bakes;
    let baked = 0;
    for (let i = 0; i < 50; i++) {
      clock.advance(500);
      store.dispatch({ type: 'feed', ratio: '1:1:1' });
      clock.advance(500);
      const ev = store.dispatch({ type: 'bakeDiscard', recipeId: 'pancake' });
      if (ev.some((e) => e.type === 'bakedDiscard')) baked += 1;
    }
    expect(baked).toBe(50);
    expect(store.getEconomy().bakes - b0).toBe(1);
  });

  // 2026-11-17: 빵은 처음 굽거나 더 잘 구운 것만 센다(이전 판 = 빵 전부, 기대값 4)
  it('6h 뒤의 discard 굽기는 다시 센다 · 같은 빵 같은 등급 재굽기는 안 센다', () => {
    const { store, clock } = mature(7);
    const b0 = store.getEconomy().bakes;
    store.dispatch({ type: 'bakeDiscard', recipeId: 'pancake' });
    clock.advance(6 * HOUR);
    store.dispatch({ type: 'feed', ratio: '1:1:1' });
    store.dispatch({ type: 'bakeDiscard', recipeId: 'pancake' });
    store.grantPantry(200);
    store.dispatch({ type: 'bake', recipeId: 'flatbread' });
    store.dispatch({ type: 'bake', recipeId: 'flatbread' });
    expect(store.getEconomy().bakes - b0).toBe(3);
  });
});

describe('A3 부활 이른 2회차는 mass를 채우지 않는다 (T1-03)', () => {
  it('E3: 부활 창에서 떼기 → 이른 급여 20회 → 통 증가는 첫 1회분뿐', () => {
    const { store, clock } = mature(5);
    store.dispatch({ type: 'feed', ratio: '1:1:1' });
    clock.advance(130 * HOUR);
    expect(store.dispatch({ type: 'feed', ratio: '1:1:1' }).map((e) => e.type)).toContain('reviveStarted');
    clock.advance(6.2 * HOUR);
    const p0 = store.getPantry();
    for (let i = 0; i < 20; i++) {
      store.dispatch({ type: 'split' });
      store.dispatch({ type: 'feed', ratio: '1:1:1' });
    }
    expect(store.getPantry() - p0).toBe(RATIOS['1:1:1'].mass - 60);
  });
});

/** 산미 preAcid 르방을 ratio·flour로 먹이고 h시간 뒤(실온) 뗀 로트 — 감사 T1 rye.test 이식 */
function lotAt(preAcid: number, ratio: FeedRatio, flour: Flour, h: number) {
  let s: SimState = { ...initialState(T0), createdAt: T0 - 60 * DAY, maturity: 60, acidity: preAcid };
  s = applyAction(s, { type: 'feed', ratio, flour }, T0 + 1).state;
  const t = T0 + 1 + h * HOUR;
  s = advance(s, t);
  return { act: activityAt(s, t), acid: s.acidity, flour };
}

describe('A4 GRADE_GOOD 0.55 — 하루 2회 12h 떼기는 good (T1-04)', () => {
  const flatbread = recipeById('flatbread')!;
  const grade = (l: ReturnType<typeof lotAt>) => gradeOf(bakeScore(flatbread, l.act, l.acid, l.flour));

  it('1:1:1 급여 12h 뒤 뗀 로트 = good', () => {
    expect(grade(lotAt(8, '1:1:1', 'white', 12))).toBe('good');
  });

  it('배고픔 이후 뗀 로트(≈0.51~0.52) = flat', () => {
    const l = lotAt(8, '1:1:1', 'white', 16);
    const sc = bakeScore(flatbread, l.act, l.acid, l.flour);
    expect(sc).toBeGreaterThan(0.5);
    expect(sc).toBeLessThan(0.53);
    expect(grade(l)).toBe('flat');
  });

  it('best 경계는 0.85 그대로', () => {
    expect(gradeOf(0.85)).toBe('best');
    expect(gradeOf(0.849)).toBe('good');
  });
});

describe('A5 호밀빵만 activity 0.3 / 산미 0.7 (시큼의 구원)', () => {
  const LOTS = [
    lotAt(8, '1:1:1', 'white', 5), lotAt(8, '1:1:1', 'white', 8), lotAt(8, '1:1:1', 'white', 12),
    lotAt(43, '1:1:1', 'white', 24), lotAt(20, '1:2:2', 'white', 12), lotAt(20, '1:2:2', 'white', 24),
    lotAt(15, '1:5:5', 'white', 24), lotAt(8, '1:1:1', 'white', 60), lotAt(8, '1:1:1', 'white', 130),
    lotAt(72, '1:1:1', 'rye', 6 / 1.25), lotAt(72, '1:1:1', 'white', 6), lotAt(20, '1:1:1', 'rye', 40),
  ];
  const rye = recipeById('rye')!;

  it('L4(하루 1회 24h)·L12(호밀 시큼 40h)가 호밀빵에서 good', () => {
    const L4 = LOTS[3];
    const L12 = LOTS[11];
    expect(gradeOf(bakeScore(rye, L4.act, L4.acid, L4.flour))).toBe('good');
    expect(gradeOf(bakeScore(rye, L12.act, L12.acid, L12.flour))).toBe('good');
  });

  it('다른 빵 6종 등급표는 옛 가중(0.6/0.4)과 같다', () => {
    const others = RECIPES.filter((r) => r.kind === 'bread' && r.id !== 'rye');
    expect(others.length).toBe(6);
    for (const r of others) {
      const now = LOTS.map((l) => gradeOf(bakeScore(r, l.act, l.acid, l.flour)));
      const old = LOTS.map((l) => gradeOf(0.6 * l.act + 0.4 * sourFit(r, l.acid, l.flour)));
      expect(now).toEqual(old);
    }
  });
});

describe('A6 급여 승급 dispatch에 단계 보상이 같이 실린다 (T1-06)', () => {
  it('stageUp과 flourEarned·stageMax가 같은 dispatch·같은 저장에 든다', () => {
    const clock = new FakeClock(T0 + 7 * HOUR);
    const env = newEnvelope(T0);
    env.starters[0].sim = { ...initialState(T0), createdAt: T0 - 4 * DAY, maturity: 2 };
    const storage = mem();
    const store = createGameStore({ clock, storage }, env);
    expect(store.getEconomy().stageMax).toBe(0);
    const ev = store.dispatch({ type: 'feed', ratio: '1:1:1' });
    expect(ev).toContainEqual({ type: 'stageUp', stage: 1 });
    expect(ev).toContainEqual({ type: 'flourEarned', amount: STAGE_REWARD_FLOUR });
    expect(store.getEconomy().stageMax).toBe(1);
    expect(JSON.parse(storage.raw()!).shared.economy.stageMax).toBe(1);
  });
});

describe('A7 등급·밴드 경계 부동소수 여유 (T1-07)', () => {
  it('activity 0.95 · 적합도 0.7 = 0.85는 best', () => {
    expect(0.6 * 0.95 + 0.4 * 0.7).toBeLessThan(0.85); // 함정 자체가 아직 있는지
    expect(gradeOf(0.6 * 0.95 + 0.4 * 0.7)).toBe('best');
  });

  it('g 가중 평균으로 0.7이 0.6999…로 내려와도 발효력 좋음', () => {
    expect(activityBand(0.7 - 1e-12)).toBe('high');
    expect(activityBand(0.4 - 1e-12)).toBe('mid');
  });
});

describe('A8 유한하지 않은 now는 무시한다 (T1-08)', () => {
  it('advance(NaN·Infinity)는 상태를 그대로 돌려준다', () => {
    const s = initialState(T0);
    expect(advance(s, NaN)).toBe(s);
    expect(advance(s, Infinity)).toBe(s);
  });

  it('store dispatch·tick도 NaN 시계면 아무것도 바꾸지 않는다', () => {
    const { store, clock } = mature(7);
    const env0 = store.getEnvelope();
    clock.set(NaN);
    expect(store.dispatch({ type: 'feed', ratio: '1:1:1' })).toEqual([]);
    store.tick();
    expect(store.getEnvelope()).toBe(env0);
  });
});

describe('A9 sim 밀가루 단계 게이트 (T1-11)', () => {
  it('4단계 전에는 다른 밀가루를 요청해도 지금 밀가루 유지', () => {
    const s0 = initialState(T0);
    const r = applyAction(s0, { type: 'feed', ratio: '1:1:1', flour: 'rye' }, T0 + 7 * HOUR);
    expect(r.state.flour).toBe('white');
    expect(r.events.map((e) => e.type)).toEqual(['fed']);
  });

  it('4단계부터는 바뀐다', () => {
    const s4: SimState = { ...initialState(T0), createdAt: T0 - 20 * DAY, maturity: 21 };
    const r = applyAction(s4, { type: 'feed', ratio: '1:1:1', flour: 'rye' }, T0 + 7 * HOUR);
    expect(r.state.flour).toBe('rye');
  });
});

describe('A10 dispatch 도중 throw면 메모리 상태를 되돌린다 (T7-23)', () => {
  it('env·스냅샷이 dispatch 전 그대로이고 예외는 다시 던진다', () => {
    const { store, clock } = mature(7);
    clock.advance(HOUR); // advanceTo가 env를 바꾸게
    const env0 = store.getEnvelope();
    const snap0 = store.getSnapshot();
    expect(() => store.dispatch({ type: 'feed', ratio: '9:9:9' as FeedRatio })).toThrow();
    expect(store.getEnvelope()).toBe(env0);
    expect(store.getSnapshot()).toBe(snap0);
  });
});

describe('A11 광고 배송 남은 횟수는 줄 재료가 없으면 0 (T7-24 · T3-04①)', () => {
  it('재료 30종 전부 캡이면 0, 하나라도 캡 밑이면 하루 상한', () => {
    const { store } = mature(7);
    expect(store.adDeliveryRemaining()).toBe(AD_SLOT_DAILY.delivery);
    for (const ing of INGREDIENTS) store.grantIngredient(ing.id, INGREDIENT_SOFT_CAP);
    expect(store.adDeliveryRemaining()).toBe(0);
    expect(store.adDeliveryReward()).toBeNull();
    store.exchangeIngredient(INGREDIENTS[0].id);
    expect(store.adDeliveryRemaining()).toBe(AD_SLOT_DAILY.delivery);
  });
});

describe('A14 멀티 르방 알림 병합은 같은 copyKey끼리만 (T2-11)', () => {
  const noQuiet = { quietStartH: 0, quietEndH: 0 };

  it('N3: 냉장 A + 실온 B → feedTime 단독(count 없음) + fridgeWeek 따로 남는다', () => {
    const a: SimState = { ...initialState(T0), location: 'fridge' };
    const b = initialState(T0);
    const plan = planNotificationsAll([a, b], T0 + HOUR, noQuiet);
    const feed = plan.slots.find((s) => s.copyKey === 'feedTime');
    const fridge = plan.slots.find((s) => s.copyKey === 'fridgeWeek');
    expect(feed?.count).toBeUndefined();
    expect(fridge?.weekly).toBe(true);
    expect(feed?.id).not.toBe(fridge?.id);
  });

  it('같은 copyKey는 전처럼 합친다 — 실온 둘이면 feedTime count 2', () => {
    const plan = planNotificationsAll([initialState(T0), initialState(T0 + HOUR)], T0 + 2 * HOUR, noQuiet);
    expect(plan.slots.find((s) => s.copyKey === 'feedTime')?.count).toBe(2);
  });

  it('부활 중 A + 실온 B → 서로 세지 않고, 슬롯 id는 겹치지 않는다', () => {
    const a: SimState = { ...initialState(T0), reviveProgress: 1 };
    const plan = planNotificationsAll([a, initialState(T0)], T0 + HOUR, noQuiet);
    // reviveSecond·feedTime은 서로 안 세고, 같은 copyKey인 moldWarn만 병합된다
    for (const s of plan.slots) {
      if (s.copyKey === 'moldWarn') expect(s.count).toBe(2);
      else expect(s.count).toBeUndefined();
    }
    const ids = plan.slots.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// SimEvent 타입이 counted 필드를 싣는지 컴파일 단계에서도 잠근다
const _fed: SimEvent = { type: 'fed', ratio: '1:1:1', maturityGained: true, counted: true };
void _fed;
