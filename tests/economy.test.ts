// 무료 경제 (확장기획 §9 · Phase 7) — §16 수용 기준:
// "광고 0으로 전 변형 도달 가능" / 무료 회복 상존 / 핵심 레시피 유료 전용 0.
// 잔액이 파생이라는 설계(store/economy.ts)의 회귀 감시도 겸한다.
import { describe, it, expect } from 'vitest';
import {
  DAY, HOUR, INGREDIENT_FLOUR_COST, INGREDIENT_SOFT_CAP, FLOUR_PER_INGREDIENT,
  MISSION_BAKE_STEP, MISSION_FEED_STEP, MISSION_REWARD_FLOUR, RECIPE_REWARD_FLOUR,
  RECIPES, STAGE_REWARD_FLOUR, initialState, playableRules, ruleByVariantId, variantIdOf,
} from '../src/sim';
import type { SimEvent } from '../src/sim';
import { FakeClock } from '../src/platform/clock';
import type { StorageAdapter } from '../src/platform/storage';
import { createGameStore, newEnvelope } from '../src/store/gameStore';
import type { GameStore } from '../src/store/gameStore';
import { load } from '../src/store/persistence';
import { earnedFlour, emptyEconomy, flourBalance, milestonesOf } from '../src/store/economy';

const T0 = 1_700_000_000_000;

const memStorage = (): StorageAdapter => {
  let v: string | null = null;
  return {
    loadRaw: () => v,
    saveRaw: (json) => { v = json; return true; },
    mirror: () => undefined,
    loadMirror: async () => null,
  };
};

/** 5단계·피크 근처 르방 + 제어 가능한 시계 */
function matureStore(storage: StorageAdapter = memStorage()): { store: GameStore; clock: FakeClock } {
  const clock = new FakeClock(T0 + 5 * HOUR);
  const env = newEnvelope(T0);
  env.starters[0].sim = { ...initialState(T0), createdAt: T0 - 40 * DAY, maturity: 45, mass: 480 };
  return { store: createGameStore({ clock, storage }, env), clock };
}

describe('경제 — 잔액은 파생', () => {
  it('새 집은 잔액 0이고 획득도 0', () => {
    const eco = emptyEconomy();
    expect(earnedFlour(eco, {})).toBe(0);
    expect(flourBalance(eco, {})).toBe(0);
  });

  it('누적 미션은 리셋 없이 계속 쌓인다 (step마다 1회)', () => {
    expect(milestonesOf(MISSION_FEED_STEP - 1, MISSION_FEED_STEP)).toBe(0);
    expect(milestonesOf(MISSION_FEED_STEP, MISSION_FEED_STEP)).toBe(1);
    expect(milestonesOf(MISSION_FEED_STEP * 7, MISSION_FEED_STEP)).toBe(7);
  });

  it('획득 = 급여·굽기 미션 + 성장 단계 + 도감 베이스 + 교환', () => {
    const eco = {
      ...emptyEconomy(),
      feeds: MISSION_FEED_STEP * 2,
      bakes: MISSION_BAKE_STEP,
      stageMax: 3,
      exchanged: 2,
    };
    const collection = { focaccia: { bestGrade: null, count: 1, firstAt: T0 } };
    expect(earnedFlour(eco, collection)).toBe(
      2 * MISSION_REWARD_FLOUR + MISSION_REWARD_FLOUR + 3 * STAGE_REWARD_FLOUR
      + RECIPE_REWARD_FLOUR + 2 * FLOUR_PER_INGREDIENT,
    );
  });

  it('변형 도감 키는 베이스 보상으로 세지 않는다 (재료를 이미 썼다)', () => {
    const vid = variantIdOf(playableRules()[0]);
    const collection = { [vid]: { bestGrade: null, count: 1, firstAt: T0 } };
    expect(earnedFlour(emptyEconomy(), collection)).toBe(0);
  });
});

describe('경제 — 소프트캡·교환', () => {
  it('소프트캡 초과 지급분은 가루로 전환된다 (재고는 캡에서 멈춘다)', () => {
    const { store } = matureStore();
    const before = store.getFlour();
    store.grantIngredient('olive', INGREDIENT_SOFT_CAP + 3);
    expect(store.getInventory().olive).toBe(INGREDIENT_SOFT_CAP);
    expect(store.getFlour()).toBe(before + 3 * FLOUR_PER_INGREDIENT);
  });

  it('캡에 도달하면 구매는 거절 — 가루 무차감', () => {
    const { store } = matureStore();
    store.grantIngredient('olive', INGREDIENT_SOFT_CAP);
    store.grantIngredient('choco', 99); // 잔액 확보용 (초과분 전환)
    const flour = store.getFlour();
    expect(store.buyIngredient('olive')).toBe(false);
    expect(store.getFlour()).toBe(flour);
  });

  it('잔액이 모자라면 구매는 거절 — 무차감', () => {
    const { store } = matureStore();
    store.getEconomy();
    // 부트 백필(5단계 = 60)만 있는 상태에서 5번 사면 바닥난다
    for (let i = 0; i < 5; i++) store.buyIngredient('olive');
    expect(store.getFlour()).toBeLessThan(INGREDIENT_FLOUR_COST);
    const spent = store.getEconomy().spent;
    const stock = store.getInventory().olive;
    expect(store.buyIngredient('choco')).toBe(false);
    expect(store.getEconomy().spent).toBe(spent);
    expect(store.getInventory().olive).toBe(stock);
    expect(store.getInventory().choco).toBe(0);
  });

  it('구매 = 가루 차감 + 재료 1 (원하는 종류를 고른다 — 랜덤 없음)', () => {
    const { store } = matureStore();
    store.grantIngredient('choco', INGREDIENT_SOFT_CAP + 9); // 초과 9개 → 가루 36
    const flour = store.getFlour();
    expect(flour).toBeGreaterThanOrEqual(INGREDIENT_FLOUR_COST);
    expect(store.buyIngredient('strawberry')).toBe(true);
    expect(store.getInventory().strawberry).toBe(1);
    expect(store.getFlour()).toBe(flour - INGREDIENT_FLOUR_COST);
  });

  it('되돌리기는 재고를 줄이고 가루를 준다 / 재고 0이면 거절', () => {
    const { store } = matureStore();
    expect(store.exchangeIngredient('olive')).toBe(false);
    store.grantIngredient('olive', 2);
    const flour = store.getFlour();
    expect(store.exchangeIngredient('olive')).toBe(true);
    expect(store.getInventory().olive).toBe(1);
    expect(store.getFlour()).toBe(flour + FLOUR_PER_INGREDIENT);
  });

  it('사고팔기를 반복해도 가루는 늘지 않는다 (무한 회전 차단)', () => {
    expect(FLOUR_PER_INGREDIENT).toBeLessThan(INGREDIENT_FLOUR_COST);
  });

  it('첫 재료 선물은 1회뿐 — 종류는 사용자가 고른다', () => {
    const { store } = matureStore();
    expect(store.getEconomy().gifted).toBe(false);
    expect(store.claimStarterGift('chestnut')).toBe(true);
    expect(store.getInventory().chestnut).toBe(1);
    expect(store.claimStarterGift('chestnut')).toBe(false);
    expect(store.getInventory().chestnut).toBe(1);
  });
});

describe('경제 — 획득 경로', () => {
  it('급여가 쌓이면 미션 보상이 들어오고 flourEarned로 통지된다', () => {
    const { store, clock } = matureStore();
    const events: SimEvent[] = [];
    store.subscribe((_s, evs) => events.push(...evs));
    const before = store.getFlour();
    for (let i = 0; i < MISSION_FEED_STEP; i++) {
      clock.advance(6 * HOUR);
      store.dispatch({ type: 'feed', ratio: '1:1:1' });
    }
    expect(store.getEconomy().feeds).toBe(MISSION_FEED_STEP);
    expect(events.some((e) => e.type === 'flourEarned')).toBe(true);
    expect(store.getFlour()).toBe(before + MISSION_REWARD_FLOUR);
  });

  it('이미 성장한 저장본은 단계 보상을 소급 인정받는다 (부트 백필)', () => {
    const { store } = matureStore();
    expect(store.getEconomy().stageMax).toBe(5);
    expect(store.getFlour()).toBe(5 * STAGE_REWARD_FLOUR);
  });

  it('베이스 레시피를 처음 구우면 도감에서 보상이 파생된다', () => {
    const { store, clock } = matureStore();
    clock.advance(HOUR);
    store.dispatch({ type: 'feed', ratio: '1:5:5' });
    const flour = store.getFlour();
    clock.advance(5 * HOUR);
    store.dispatch({ type: 'bake', recipeId: 'focaccia' });
    expect(store.getCollection().focaccia).toBeDefined();
    expect(store.getFlour()).toBeGreaterThanOrEqual(flour + RECIPE_REWARD_FLOUR);
  });
});

describe('§16 수용 기준 — 광고 0으로 전 변형 도달', () => {
  it('핵심 레시피(베이스 10종)는 재료 없이 성장만으로 열린다', () => {
    expect(RECIPES.length).toBe(10);
    for (const r of RECIPES) expect(r.stage).toBeLessThanOrEqual(5);
  });

  it('무료 경로만으로 변형 40종 전부 해금된다', () => {
    const { store, clock } = matureStore();
    store.claimStarterGift('olive');

    const targets = playableRules().map((r) => variantIdOf(r));
    expect(targets.length).toBe(40);
    const remaining = (): string[] => targets.filter((v) => store.getCollection()[v] === undefined);

    let feeds = 0;
    const MAX_FEEDS = 400; // 하루 2회면 200일 — 이 상한에 닿으면 설계가 틀린 것
    while (remaining().length > 0 && feeds < MAX_FEEDS) {
      clock.advance(6 * HOUR);
      store.dispatch({ type: 'feed', ratio: '1:5:5' }); // mass 440 회복 + discard 쿨다운 해제
      feeds += 1;
      clock.advance(5 * HOUR); // 피크 근처 — 판정용(해금 자체엔 무관)

      // 가진 재료로 열 수 있는 변형부터 굽는다 (mass 부족이면 다음 급여 주기로 미뤄진다)
      for (const vid of remaining()) {
        const rule = ruleByVariantId(vid);
        if (!rule) continue;
        if ((store.getInventory()[rule.ingredientId] ?? 0) < 1) continue;
        store.bakeVariant(vid);
      }

      // 남은 목표에 필요한 재료를 가루로 사 둔다
      for (const vid of remaining()) {
        const rule = ruleByVariantId(vid);
        if (!rule) continue;
        if ((store.getInventory()[rule.ingredientId] ?? 0) > 0) continue;
        if (!store.buyIngredient(rule.ingredientId)) break; // 잔액 소진 — 다음 주기에
      }
    }

    // 광고·결제 진입점은 이 경로에 단 한 번도 등장하지 않았다
    expect(remaining()).toEqual([]);
    expect(feeds).toBeLessThan(MAX_FEEDS);
  });

  it('무료 회복은 상존한다 — 급여 미션은 상한이 없다', () => {
    const eco = { ...emptyEconomy(), feeds: MISSION_FEED_STEP * 1000 };
    expect(earnedFlour(eco, {})).toBe(1000 * MISSION_REWARD_FLOUR);
  });
});

describe('경제 — 저장 왕복', () => {
  it('카운터가 저장·복원된다', async () => {
    const storage = memStorage();
    const { store } = matureStore(storage);
    store.grantIngredient('olive', INGREDIENT_SOFT_CAP + 1);
    store.claimStarterGift('choco');
    store.saveNow();

    const loaded = await load(storage);
    expect(loaded?.envelope.shared.economy).toEqual(store.getEconomy());
    expect(loaded?.envelope.shared.economy.gifted).toBe(true);
    expect(loaded?.envelope.shared.economy.exchanged).toBe(1);
  });

  it('economy 키가 없는 1.2.x 저장본도 그대로 열린다 (기본값 0)', async () => {
    const storage = memStorage();
    const { store } = matureStore(storage);
    store.saveNow();
    const raw = JSON.parse(storage.loadRaw()!) as Record<string, unknown>;
    const shared = raw.shared as Record<string, unknown>;
    delete shared.economy;
    storage.saveRaw(JSON.stringify(raw));

    const loaded = await load(storage);
    expect(loaded?.envelope.shared.economy).toEqual(emptyEconomy());
  });
});
