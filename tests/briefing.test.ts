// 복귀 브리핑 — 정본: src/sim/briefing.ts, docs/GDD.md §3-4(곰팡이)
// 주의: sour(36h)가 hooch(48h)보다 먼저 지나간다 — 순서를 시간값으로 재확인한다.
import { describe, it, expect } from 'vitest';
import { initialState, deriveBriefing, HOUR, DAY } from '../src/sim';
import type { SimState } from '../src/sim';

const t0 = 1_700_000_000_000;

describe('briefing — 부재 중 경계 수집·시간순 (GDD §3-4)', () => {
  it('14h 부재(0h→14.5h) → [peaked, becameHungry] 시간순', () => {
    const s = initialState(t0);
    const result = deriveBriefing(s, t0, t0 + 14.5 * HOUR);
    expect(result).toEqual(['peaked', 'becameHungry']);
  });

  it('8일 부재 → wentDormant·moldSpotted 포함, 시간순', () => {
    const s = initialState(t0);
    const result = deriveBriefing(s, t0, t0 + 8 * DAY);
    expect(result).toEqual([
      'peaked',
      'becameHungry',
      'becameSour',
      'hoochAppeared',
      'wentDormant',
      'moldSpotted',
    ]);
  });

  it('15일 부재 → 마지막이 moldDied', () => {
    const s = initialState(t0);
    const result = deriveBriefing(s, t0, t0 + 15 * DAY);
    expect(result[result.length - 1]).toBe('moldDied');
    expect(result).toEqual([
      'peaked',
      'becameHungry',
      'becameSour',
      'hoochAppeared',
      'wentDormant',
      'moldSpotted',
      'moldSpread',
      'moldDied',
    ]);
  });

  it('from≥to → []', () => {
    const s = initialState(t0);
    expect(deriveBriefing(s, t0, t0)).toEqual([]);
    expect(deriveBriefing(s, t0 + HOUR, t0)).toEqual([]);
  });

  it('짧은 부재(7h, 최소 8h 미달) → []', () => {
    const s = initialState(t0);
    expect(deriveBriefing(s, t0, t0 + 7 * HOUR)).toEqual([]);
  });

  it('부활 의식 중(reviveProgress 1) → [] — 경계 의미 없음', () => {
    const reviving: SimState = { ...initialState(t0), reviveProgress: 1 };
    expect(deriveBriefing(reviving, t0, t0 + 20 * HOUR)).toEqual([]);
  });
});
