// 보관 통 그램 경제 — 떼어내기·굽기 원가·0g 경계 (정본: docs/GDD.md §6-2).
// 이 파일이 지키는 계약 3줄:
//   ① 굽기는 르방이의 mass를 건드리지 않는다 (씨앗 불가침이 물리로 보장된다)
//   ② 그램은 오직 떼어내기로만 통에 들어오고, 게이트는 유효시간이다 (밥 연타로 못 번다)
//   ③ 통 부족 = 사전 차단, 도감·재료·통 어느 것도 안 움직인다 (원자성)
import { describe, it, expect } from 'vitest';
import {
  applyAction, activityAt, bakeScore, gradeOf, initialState, deriveSnapshot,
  HOUR, DAY, SEED_G, SPLIT_MIN_G, RATIOS, recipeById,
  PANTRY_LEGACY_ACIDITY, PANTRY_LEGACY_ACTIVITY, PANTRY_LOT_MAX,
} from '../src/sim';
import type { PantryLot, SimState } from '../src/sim';
import type { GameStore } from '../src/store/gameStore';
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

/** 집이 아직 0단계인 새 게임 — 해금 게이트(집 최고 단계)를 실제로 닫아 두려면 이쪽을 쓴다 */
function freshStore(now = t0) {
  const clock: Clock = { now: () => now };
  let raw: string | null = null;
  const storage: StorageAdapter = {
    loadRaw: () => raw,
    saveRaw: (json: string) => { raw = json; return true; },
    mirror: () => {},
    loadMirror: async () => raw,
  };
  return { store: createGameStore({ clock, storage }, newEnvelope(now)), raw: () => raw };
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
    // 집 자체가 아직 0단계여야 단계 게이트가 실제로 닫힌다 (GDD §6-2 개정: 해금 = 집 최고 단계).
    // memStore의 성숙 르방을 쓰면 집이 5단계라 사유가 'pantry'로 바뀐다 — 그건 A-1의 의도된 결과다.
    const { store } = freshStore();
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

// ── 보관 통 로트 원장 (GDD §6-2 개정 2026-09-05) ────────────────────────────
// 08-25 "품질 세탁 수용"의 번복. 등급은 화면에 떠 있는 르방이 아니라 통에서 나가는 반죽이
// 정한다. 통은 평균 한 덩이가 아니라 **덩이의 줄**이다 — 떼면 뒤에 붙고 구우면 앞에서 나간다.
// 이 절이 지키는 계약:
//   ① 떼는 순간이 로트로 봉해진다 (피크에 떼면 그 순간이 그대로 보관된다)
//   ② 구우면 그 빵에 가장 잘 맞는 로트부터 나가고, 판정한 반죽과 실제로 나간 반죽이 같다
//   ③ 통이 비면 원장도 빈다 · Σ lots.g === pantry(미러)는 언제나 참

/** 성숙 A(피크 1:2:2) + 어리고 시큼한 B — "어느 르방이 화면에 떠 있는지는 굽기와 무관"의 실증 픽스처 */
function twoStarterStore(now = t0) {
  let raw: string | null = null;
  const clock: Clock = { now: () => now };
  const storage: StorageAdapter = {
    loadRaw: () => raw,
    saveRaw: (json: string) => { raw = json; return true; },
    mirror: () => {},
    loadMirror: async () => raw,
  };
  // A — 5단계, 1:2:2로 밥 준 지 유효 8h = 피크 한복판(7~9h), 산미 순함
  const a: SimState = {
    ...initialState(now - 8 * HOUR),
    createdAt: now - 40 * DAY,
    maturity: 45,
    feedRatio: '1:2:2',
    mass: RATIOS['1:2:2'].mass,
    acidity: 20,
    lastSimulatedAt: now,
  };
  // B — 1단계, 60h 방치돼 시큼. 옛 규칙이면 이 르방이 등급을 정해 flat이 나온다
  const b: SimState = {
    ...initialState(now - 60 * HOUR),
    createdAt: now - 10 * DAY,
    maturity: 5,
    acidity: 95,
    lastSimulatedAt: now,
  };
  const base = newEnvelope(now);
  const env = {
    ...base,
    starters: [
      { id: 's1', name: null, ordinal: 1, sim: a },
      { id: 's2', name: null, ordinal: 2, sim: b },
    ],
    activeStarterId: 's1',
    nextStarterOrdinal: 3,
  };
  return { store: createGameStore({ clock, storage }, env) };
}

const lotsOf = (store: GameStore): PantryLot[] => store.getEnvelope().shared.pantryLots;

describe('보관 통 로트 원장 — 적립·best-fit 소비·상한', () => {
  it('빈 통은 품질이 없다 (null)', () => {
    const { store } = memStore();
    expect(store.getPantry()).toBe(0);
    expect(lotsOf(store)).toEqual([]);
    expect(store.getPantryQuality()).toBeNull();
    expect(store.getDoughFor('flatbread')).toBeNull();
  });

  it('떼어내면 그 순간의 activity·acidity·밀가루가 로트 하나로 봉해진다', () => {
    const { store } = memStore();
    const events = store.dispatch({ type: 'split' });
    const split = events.find((e) => e.type === 'split');
    expect(split).toBeDefined();
    const amount = (split as { amount: number }).amount;

    const sim = store.getActiveStarter().sim; // split은 시간 필드를 안 건드린다 — 떼기 전과 같은 값
    expect(lotsOf(store)).toEqual([
      { g: amount, act: activityAt(sim, t0), acid: sim.acidity, flour: sim.flour },
    ]);
    expect(store.getPantry()).toBe(amount); // 미러
  });

  it('적립을 거듭하면 로트가 순서대로 쌓인다 (뒤가 최신)', () => {
    const { store } = memStore();
    store.grantPantry(50, { activity: 0.2, acidity: 90, flour: 'rye' });
    store.grantPantry(70, { activity: 1, acidity: 10, flour: 'white' });
    expect(lotsOf(store)).toEqual([
      { g: 50, act: 0.2, acid: 90, flour: 'rye' },
      { g: 70, act: 1, acid: 10, flour: 'white' },
    ]);
    expect(store.getPantry()).toBe(120);
  });

  it('굽기는 오래된 순이 아니라 그 빵에 맞는 로트부터 쓴다 — 좋은 반죽을 먼저 태우지 않는다', () => {
    const { store } = memStore();
    store.grantPantry(100, { activity: 0.2, acidity: 30, flour: 'white' }); // 배고플 때 뗀 것(먼저)
    store.grantPantry(30, { activity: 1, acidity: 20, flour: 'white' });    // 피크에 뗀 것(나중)

    // 플랫브레드는 점수가 높은 피크 로트를 먼저 쓴다 — FIFO였다면 배고픔 로트가 나갔을 자리
    const first = store.dispatch({ type: 'bake', recipeId: 'flatbread' }).find((e) => e.type === 'baked');
    expect(first).toMatchObject({ grade: 'best' });
    expect(lotsOf(store)).toEqual([{ g: 100, act: 0.2, acid: 30, flour: 'white' }]); // 배고픔 로트는 그대로

    // 피크 로트를 다 썼으니 다음 빵은 남은 것으로 — 그때 납작해진다
    const second = store.dispatch({ type: 'bake', recipeId: 'flatbread' }).find((e) => e.type === 'baked');
    expect(second).toMatchObject({ grade: 'flat' });
  });

  it('시큼한 로트는 호밀빵이 데려간다 — 같은 통에서 식빵은 순한 로트를 고른다', () => {
    const { store } = memStore();
    store.grantPantry(100, { activity: 0.5, acidity: 10, flour: 'white' }); // 순한 반죽(먼저)
    store.grantPantry(100, { activity: 0.5, acidity: 50, flour: 'white' }); // 시큼한 반죽(나중)

    // 호밀빵 선호 40~75 — 시큼한 쪽이 점수가 높다 ("시큼의 구원", GDD §6-2)
    expect(store.getDoughFor('rye')).toMatchObject({ acidity: 50 });
    store.dispatch({ type: 'bake', recipeId: 'rye' }); // 80g
    expect(lotsOf(store)).toEqual([
      { g: 100, act: 0.5, acid: 10, flour: 'white' },
      { g: 20, act: 0.5, acid: 50, flour: 'white' },
    ]);

    // 같은 통, 다른 빵 — 식빵 선호 0~30이라 이번엔 순한 쪽이 뽑힌다
    expect(store.getDoughFor('loaf')).toMatchObject({ acidity: 10 });
  });

  it('점수가 같으면 오래된 로트부터 — 순서가 동률의 타이브레이크다', () => {
    const { store } = memStore();
    store.grantPantry(30, { activity: 0.9, acidity: 20, flour: 'rye' });        // 먼저
    store.grantPantry(30, { activity: 0.9, acidity: 20, flour: 'wholewheat' }); // 점수 동일(친화 없는 레시피)
    store.dispatch({ type: 'bake', recipeId: 'flatbread' }); // 30g
    expect(lotsOf(store)).toEqual([{ g: 30, act: 0.9, acid: 20, flour: 'wholewheat' }]);
  });

  it('getDoughFor(recipeId) = 실제로 나갈 조각의 평균 (통 전체 평균과 다르다)', () => {
    const { store } = memStore();
    store.grantPantry(20, { activity: 0, acidity: 100, flour: 'rye' });
    store.grantPantry(80, { activity: 1, acidity: 0, flour: 'white' });

    // 플랫브레드 30g은 점수 높은 로트 하나로 충분하다 — 나쁜 로트는 손도 안 댄다
    expect(store.getDoughFor('flatbread')).toMatchObject({ activity: 1, acidity: 0, flour: 'white' });

    const all = store.getPantryQuality()!;
    expect(all.activity).toBeCloseTo(0.8, 12);
    expect(all.acidity).toBeCloseTo(20, 12);
    expect(all.flour).toBe('white'); // 80 > 20
  });

  it('원가가 통보다 크면 남은 전량으로 계산한다 (게이트가 막지만 방어)', () => {
    const { store } = memStore();
    store.grantPantry(40, { activity: 1, acidity: 10, flour: 'white' });
    expect(store.getDoughFor('campagne')).toEqual(store.getPantryQuality()); // 100g 필요, 40g뿐
  });

  it('빵이 아닌 레시피는 나갈 반죽이 없다 — null', () => {
    const { store } = memStore();
    store.grantPantry(100);
    expect(store.getDoughFor('pancake')).toBeNull(); // discard = 원가 0
    expect(store.getDoughFor('없는빵')).toBeNull();
  });

  it('판정한 반죽과 실제로 나간 반죽이 같다 — 주입과 소비가 같은 선택', () => {
    const { store } = memStore();
    store.grantPantry(20, { activity: 0, acidity: 100, flour: 'rye' });
    store.grantPantry(80, { activity: 1, acidity: 0, flour: 'white' });
    const predicted = store.getDoughFor('flatbread')!;
    const expected = gradeOf(
      bakeScore(recipeById('flatbread')!, predicted.activity, predicted.acidity, predicted.flour),
    );
    const baked = store.dispatch({ type: 'bake', recipeId: 'flatbread' }).find((e) => e.type === 'baked');
    expect(baked).toMatchObject({ grade: expected });
    // 고른 조각만 빠졌다 — 나쁜 로트는 그대로 남는다
    expect(lotsOf(store)).toEqual([
      { g: 20, act: 0, acid: 100, flour: 'rye' },
      { g: 50, act: 1, acid: 0, flour: 'white' },
    ]);
  });

  it('통이 0으로 떨어지면 원장도 빈다', () => {
    const { store, raw } = memStore();
    store.grantPantry(30);
    store.dispatch({ type: 'bake', recipeId: 'flatbread' }); // 원가 30 = 전액
    expect(store.getPantry()).toBe(0);
    expect(lotsOf(store)).toEqual([]);
    expect(store.getPantryQuality()).toBeNull();
    const shared = (JSON.parse(raw() as string) as { shared: Record<string, unknown> }).shared;
    expect(shared.pantryLots).toEqual([]);
    expect(shared.pantry).toBe(0);
  });

  it('로트 상한을 넘기면 가장 오래된 둘을 병합한다 — g은 한 톨도 안 샌다', () => {
    const { store } = memStore();
    for (let i = 0; i < PANTRY_LOT_MAX; i++) {
      store.grantPantry(10, { activity: 1, acidity: 0, flour: 'white' });
    }
    expect(lotsOf(store)).toHaveLength(PANTRY_LOT_MAX);

    store.grantPantry(10, { activity: 0, acidity: 100, flour: 'white' }); // 13번째
    const lots = lotsOf(store);
    expect(lots).toHaveLength(PANTRY_LOT_MAX);
    expect(lots[0]).toEqual({ g: 20, act: 1, acid: 0, flour: 'white' }); // 앞 둘이 합쳐졌다
    expect(store.getPantry()).toBe(10 * (PANTRY_LOT_MAX + 1));
  });

  it('병합은 act·acid를 g 가중 평균으로, flour는 g 큰 쪽으로 남긴다', () => {
    const { store } = memStore();
    store.grantPantry(30, { activity: 0, acidity: 0, flour: 'rye' });
    store.grantPantry(10, { activity: 1, acidity: 100, flour: 'white' });
    for (let i = 0; i < PANTRY_LOT_MAX - 1; i++) {
      store.grantPantry(5, { activity: 0.5, acidity: 50, flour: 'white' });
    }
    const [merged] = lotsOf(store);
    expect(merged.g).toBe(40);
    expect(merged.act).toBeCloseTo(10 / 40, 12);
    expect(merged.acid).toBeCloseTo(1_000 / 40, 12);
    expect(merged.flour).toBe('rye'); // 30 > 10
  });

  it('grantPantry는 품질을 생략하면 레거시로 적립한다', () => {
    const { store } = memStore();
    store.grantPantry(200);
    expect(lotsOf(store)).toEqual([
      { g: 200, act: PANTRY_LEGACY_ACTIVITY, acid: PANTRY_LEGACY_ACIDITY, flour: 'white' },
    ]);
  });

  it('원장이 미러보다 적으면 게이트가 원장 기준으로 막는다 — 무료 빵도, 반쯤 바뀐 상태도 없다', () => {
    const { store } = memStore();
    store.grantPantry(200);
    // 불변식을 일부러 깬다: 미러(pantry)는 200인데 원장은 10g뿐인 상태.
    // 정상 경로로는 만들 수 없다(setLots가 미러를 함께 갱신한다). pantryGate는 **원장 합**을 보므로
    // 여기서 pantry 사유로 막힌다 — applyPantryEvents의 underflow throw(도감 기록 뒤에 터져 메모리
    // 상태를 반쯤 바꾼 채 남긴다)까지 가지 않는다. 그 throw는 진짜 도달 불가 불변식 위반의 최후 방어다.
    const shared = store.getEnvelope().shared;
    shared.pantryLots = [{ g: 10, act: 1, acid: 0, flour: 'white' }];
    const before = store.getEconomy().bakes;
    const events = store.dispatch({ type: 'bake', recipeId: 'flatbread' });
    expect(events).toEqual([{ type: 'bakeBlocked', reason: 'pantry' }]);
    expect(store.getCollection().flatbread).toBeUndefined();
    expect(store.getEconomy().bakes).toBe(before);
    expect(lotsOf(store)).toEqual([{ g: 10, act: 1, acid: 0, flour: 'white' }]);
  });

  it('불변식: 떼기·굽기·주입을 섞어도 Σ lots.g === pantry', () => {
    const { store, raw } = memStore();
    store.dispatch({ type: 'split' });
    store.grantPantry(100, { activity: 0.5, acidity: 30, flour: 'wholewheat' });
    store.dispatch({ type: 'bake', recipeId: 'campagne' }); // 100g
    store.grantPantry(40);
    const shared = (JSON.parse(raw() as string) as {
      shared: { pantry: number; pantryLots: { g: number }[] };
    }).shared;
    expect(shared.pantryLots.reduce((s, l) => s + l.g, 0)).toBe(shared.pantry);
  });
});

describe('굽기 기준은 집 — store가 houseStage·dough를 주입한다', () => {
  it('어린 르방을 활성으로 둬도 집 최고 단계로 해금된다 (사용자 판정 3 / 실측 F7)', () => {
    const { store } = twoStarterStore();
    store.dispatch({ type: 'split' });            // A가 통을 채운다
    expect(store.switchStarter('s2')).toBe(true); // 화면은 어린 르방으로
    expect(store.getHouseStage()).toBe(5);

    const events = store.dispatch({ type: 'bake', recipeId: 'flatbread' }); // 3단계 필요, B는 1단계
    expect(events.some((e) => e.type === 'baked')).toBe(true);
  });

  it('성숙 르방으로 피크에 떼어 두면 시큼한 르방을 띄워 놓고 구워도 best', () => {
    const { store } = twoStarterStore();
    store.dispatch({ type: 'split' });
    expect(store.getPantryQuality()!.activity).toBeCloseTo(1, 10); // 피크 = activity 1.0
    store.switchStarter('s2');

    // 옛 규칙(활성 르방 판정)이었다면 flat이 나올 상태임을 먼저 못 박는다
    const active = store.getActiveStarter().sim;
    const oldRule = gradeOf(
      bakeScore(recipeById('flatbread')!, activityAt(active, t0), active.acidity, active.flour),
    );
    expect(oldRule).toBe('flat');

    const baked = store.dispatch({ type: 'bake', recipeId: 'flatbread' }).find((e) => e.type === 'baked');
    expect(baked).toMatchObject({ grade: 'best' });
  });

  it('UI가 채워 보낸 houseStage·dough를 store가 덮어쓴다 — 단일 출처', () => {
    const { store } = twoStarterStore();
    store.dispatch({ type: 'split' });
    store.switchStarter('s2');
    const baked = store
      .dispatch({
        type: 'bake',
        recipeId: 'flatbread',
        houseStage: 0,                                        // 거짓 잠금
        dough: { activity: 0, acidity: 100, flour: 'white' }, // 거짓 납작 반죽
      })
      .find((e) => e.type === 'baked');
    expect(baked).toMatchObject({ grade: 'best' });
  });

  // FM1 — 해금이 집 기준으로 열린 뒤에도 통 게이트는 그대로 닫혀 있어야 한다.
  // pantryGate가 집 단계를 안 보면 "단계는 통과, 통은 미확인" 틈으로 무료 빵이 굽힌다.
  it('집 단계로 해금돼도 통이 모자라면 막힌다 — 무료 빵 없음', () => {
    const { store } = freshStore();
    const env = store.getEnvelope();
    env.shared.economy = { ...env.shared.economy, stageMax: 4 }; // 성숙 르방이 있었던 집
    store.grantPantry(20);

    const events = store.dispatch({ type: 'bake', recipeId: 'campagne' }); // 4단계·100g
    expect(events).toEqual([{ type: 'bakeBlocked', reason: 'pantry' }]);
    expect(store.getPantry()).toBe(20);
    expect(lotsOf(store)).toHaveLength(1);
    expect(store.getCollection().campagne).toBeUndefined();
    expect(store.getEconomy().bakes).toBe(0);
  });
});
