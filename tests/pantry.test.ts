// 보관 통 그램 경제 — 떼어내기·굽기 원가·0g 경계 (정본: docs/GDD.md §6-2).
// 이 파일이 지키는 계약 3줄:
//   ① 굽기는 르방이의 mass를 건드리지 않는다 (씨앗 불가침이 물리로 보장된다)
//   ② 그램은 오직 떼어내기로만 통에 들어오고, 게이트는 유효시간이다 (밥 연타로 못 번다)
//   ③ 통 부족 = 사전 차단, 도감·재료·통 어느 것도 안 움직인다 (원자성)
import { describe, it, expect } from 'vitest';
import {
  applyAction, initialState, deriveSnapshot,
  HOUR, DAY, SEED_G, SPLIT_MIN_G, RATIOS, recipeById,
} from '../src/sim';
import type { SimState } from '../src/sim';
import { createGameStore, newEnvelope } from '../src/store/gameStore';
import type { Clock } from '../src/platform/clock';
import type { StorageAdapter } from '../src/platform/storage';

const t0 = 1_700_000_000_000;
/** 떼어내기 게이트(유효 6h)를 막 넘긴 상태 — 실온 1:1:1이면 유효시간 = 벽시계 시간 */
const RIPE_H = 7;

function ripe(now = t0): SimState {
  return { ...initialState(now - RIPE_H * HOUR), lastSimulatedAt: now };
}

function memStore(now = t0) {
  let t = now;
  let raw: string | null = null;
  const clock: Clock = { now: () => t };
  const storage: StorageAdapter = {
    loadRaw: () => raw,
    saveRaw: (json: string) => { raw = json; return true; },
    mirror: () => {},
    loadMirror: async () => raw,
  };
  // 성숙 + 떼어낼 만큼 익은 르방으로 시작한다. devMatureActive는 쓰지 않는다 —
  // 그 치트는 통을 미리 채우고 lastFedAt을 지금으로 두어 이 파일의 관심사를 가린다
  const base = newEnvelope(now);
  const sim: SimState = { ...ripe(now), createdAt: now - 40 * DAY, maturity: 45 };
  const env = { ...base, starters: [{ ...base.starters[0], sim }] };
  const store = createGameStore({ clock, storage }, env);
  return { store, raw: () => raw, advanceClock: (ms: number) => { t += ms; } };
}

describe('떼어내기 — 씨앗만 남기고 통으로 (GDD §6-2)', () => {
  it('mass가 씨앗만 남고, 뗀 양이 split 이벤트로 나온다', () => {
    const s = ripe();
    const res = applyAction(s, { type: 'split' }, t0);
    expect(res.state.mass).toBe(SEED_G);
    expect(res.events).toEqual([{ type: 'split', amount: RATIOS['1:1:1'].mass - SEED_G }]);
  });

  it('유효 6h 전에는 못 뗀다 — 밥 연타로 그램을 벌 수 없다는 뜻', () => {
    const justFed = initialState(t0); // 방금 급여 = 유효시간 0
    const res = applyAction(justFed, { type: 'split' }, t0);
    expect(res.events).toEqual([{ type: 'splitBlocked', reason: 'tooSoon' }]);
    expect(res.state).toBe(justFed); // 부작용 0
  });

  it('밥→떼기→밥→떼기 연타: 두 번째 떼기가 막힌다 (급여가 게이트를 못 연다)', () => {
    const first = applyAction(ripe(), { type: 'split' }, t0);
    expect(first.events[0].type).toBe('split');
    // 곧바로 밥을 주면 mass는 180으로 회복되지만 유효시간이 0으로 리셋된다
    const fed = applyAction(first.state, { type: 'feed', ratio: '1:1:1' }, t0);
    expect(fed.state.mass).toBe(RATIOS['1:1:1'].mass);
    const second = applyAction(fed.state, { type: 'split' }, t0);
    expect(second.events).toEqual([{ type: 'splitBlocked', reason: 'tooSoon' }]);
  });

  it('씨앗 위로 남는 양이 최소치 미만이면 막힌다', () => {
    const thin = { ...ripe(), mass: SEED_G + SPLIT_MIN_G - 1 };
    const res = applyAction(thin, { type: 'split' }, t0);
    expect(res.events).toEqual([{ type: 'splitBlocked', reason: 'mass' }]);
    expect(res.state.mass).toBe(thin.mass);
  });

  it('canSplit 스냅샷이 실제 게이트와 같은 답을 낸다 — 눌리는데 막히는 버튼 방지', () => {
    for (const s of [ripe(), initialState(t0), { ...ripe(), mass: SEED_G }]) {
      const allowed = applyAction(s, { type: 'split' }, t0).events[0].type === 'split';
      expect(deriveSnapshot(s, t0).canSplit).toBe(allowed);
    }
  });

  it('떼어내면 병이 실제로 줄어든다 — fill이 질량비를 탄다', () => {
    const before = deriveSnapshot(ripe(), t0).fill;
    const after = deriveSnapshot(applyAction(ripe(), { type: 'split' }, t0).state, t0).fill;
    expect(after).toBeLessThan(before);
  });
});

describe('굽기 — 원가는 통에서, mass는 불변 (GDD §6-2)', () => {
  it('빵을 구워도 르방이의 mass가 그대로다 (씨앗 불가침의 물리 보장)', () => {
    const { store } = memStore();
    store.grantPantry(500);
    const massBefore = store.getSnapshot().mass;
    store.dispatch({ type: 'bake', recipeId: 'flatbread' });
    expect(store.getSnapshot().mass).toBe(massBefore);
  });

  it('통에서 레시피 비용만큼 빠진다', () => {
    const { store } = memStore();
    store.grantPantry(200);
    store.dispatch({ type: 'bake', recipeId: 'campagne' }); // 100g
    expect(store.getPantry()).toBe(200 - (recipeById('campagne')?.cost ?? 0));
  });

  it('통 부족이면 사전 차단 — 도감·통 어느 것도 안 움직인다 (원자성)', () => {
    const { store } = memStore();
    store.grantPantry(10);
    const events = store.dispatch({ type: 'bake', recipeId: 'flatbread' });
    expect(events).toEqual([{ type: 'bakeBlocked', reason: 'pantry' }]);
    expect(store.getPantry()).toBe(10);
    expect(store.getCollection().flatbread).toBeUndefined();
  });

  it('단계 미해금이 통 부족보다 먼저다 — 차단 사유 우선순위 보존', () => {
    const { store } = memStore();
    const fresh = store.addStarter(); // 갓 태어난 르방 = 0단계
    expect(fresh).not.toBeNull();
    store.grantPantry(0);
    const events = store.dispatch({ type: 'bake', recipeId: 'flatbread' }); // 3단계 필요
    expect(events).toEqual([{ type: 'bakeBlocked', reason: 'stage' }]);
  });

  it('통이 정확히 0으로 떨어지고 음수로 안 내려간다', () => {
    const { store } = memStore();
    const cost = recipeById('flatbread')?.cost ?? 0;
    store.grantPantry(cost);
    store.dispatch({ type: 'bake', recipeId: 'flatbread' });
    expect(store.getPantry()).toBe(0);
    // 빈 통에서 한 번 더 = 차단
    expect(store.dispatch({ type: 'bake', recipeId: 'flatbread' })).toEqual([
      { type: 'bakeBlocked', reason: 'pantry' },
    ]);
    expect(store.getPantry()).toBe(0);
  });

  it('discard 레시피는 통을 쓰지 않는다 — 급여당 1회 쿨다운이 그 제약 (GDD §6-1)', () => {
    const { store } = memStore();
    store.grantPantry(0);
    const events = store.dispatch({ type: 'bakeDiscard', recipeId: 'pancake' });
    expect(events.some((e) => e.type === 'bakedDiscard')).toBe(true);
    expect(store.getPantry()).toBe(0);
  });
});

describe('통은 집의 것 — 전역 (도감·재료와 같은 층)', () => {
  it('A에서 떼어 B로 구울 수 있다 (의도된 이탈: 품질 세탁 — implementation-notes)', () => {
    const { store } = memStore();
    store.grantPantry(0);
    // A에서 떼기 — devMatureActive가 mass를 480으로 올려 뒀고 유효시간도 충분하다
    const split = store.dispatch({ type: 'split' });
    const gained = split.find((e) => e.type === 'split');
    expect(gained).toBeDefined();
    expect(store.getPantry()).toBeGreaterThan(0);

    const b = store.addStarter();
    expect(b).not.toBeNull();
    expect(store.getPantry()).toBeGreaterThan(0); // 르방을 바꿔도 통은 하나
  });

  it('저장 왕복 — 통이 살아남는다', () => {
    const { store, raw } = memStore();
    store.grantPantry(240);
    const parsed = JSON.parse(raw() as string) as { shared: { pantry: number } };
    expect(parsed.shared.pantry).toBe(240);
  });
});
