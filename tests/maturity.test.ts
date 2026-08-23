// maturity 적립 게이트·성장 단계 승급 — 정본: docs/GDD.md §3-6·§4
import { describe, it, expect } from 'vitest';
import { initialState, applyAction, phaseAt, stageOf, HOUR, DAY } from '../src/sim';
import type { SimState } from '../src/sim';

const t0 = 1_700_000_000_000;

describe('maturity — 급여 사이클 적립 게이트 (GDD §3-6)', () => {
  it('유효 6h 미만 재급여는 미적립, 6h 이상이면 적립', () => {
    const under = applyAction(initialState(t0), { type: 'feed', ratio: '1:1:1' }, t0 + 5 * HOUR);
    expect(under.events).toContainEqual({ type: 'fed', ratio: '1:1:1', maturityGained: false });
    expect(under.state.maturity).toBe(0);

    const over = applyAction(initialState(t0), { type: 'feed', ratio: '1:1:1' }, t0 + 6 * HOUR);
    expect(over.events).toContainEqual({ type: 'fed', ratio: '1:1:1', maturityGained: true });
    expect(over.state.maturity).toBe(1);
  });

  it('시큼 phase에서 급여 → 회복되지만 maturity는 미적립', () => {
    const sour: SimState = {
      ...initialState(t0),
      lastFedAt: t0 - 40 * HOUR, // hungry(14h) < 40h < dormant(120h) → sour
      locAnchorAt: t0 - 40 * HOUR,
    };
    expect(phaseAt(sour, t0)).toBe('sour');

    const result = applyAction(sour, { type: 'feed', ratio: '1:1:1' }, t0);
    expect(result.events).toContainEqual({ type: 'fed', ratio: '1:1:1', maturityGained: false });
    expect(result.state.maturity).toBe(0);
    expect(phaseAt(result.state, t0)).toBe('active'); // 회복은 됨
  });
});

describe('maturity — 성장 단계 게이트 = max(사이클, 일수) 둘 다 충족 (GDD §4)', () => {
  it('3사이클+3일 → stage 1 (사이클만 충족하고 일수 미달이면 stage 0에 머문다)', () => {
    let state = initialState(t0);
    let now = t0;
    for (let i = 0; i < 3; i++) {
      now += 7 * HOUR; // 유효 6h↑, 활발 구간(<14h) 안 → 매번 적립
      state = applyAction(state, { type: 'feed', ratio: '1:1:1' }, now).state;
    }
    expect(state.maturity).toBe(3);
    expect(stageOf(state, now)).toBe(0); // 아직 3일 미만

    const day3 = t0 + 3 * DAY;
    expect(stageOf(state, day3 - HOUR)).toBe(0);
    expect(stageOf(state, day3)).toBe(1);
  });

  it('7사이클+5일 → stage 2 경계 검증', () => {
    let state = initialState(t0);
    let now = t0;
    for (let i = 0; i < 7; i++) {
      now += 7 * HOUR;
      state = applyAction(state, { type: 'feed', ratio: '1:1:1' }, now).state;
    }
    expect(state.maturity).toBe(7);

    const day5 = t0 + 5 * DAY;
    // 사이클(7)은 충분하지만 일수 미달 → stage1(3사이클·3일)까지만
    expect(stageOf(state, day5 - HOUR)).toBe(1);
    expect(stageOf(state, day5)).toBe(2);
  });
});
