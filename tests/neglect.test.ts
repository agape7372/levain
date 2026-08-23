// 장기 방치·휴면·부활 의식 — 정본: docs/GDD.md §3-4·§3-7, docs/ARCHITECTURE.md §7
import { describe, it, expect } from 'vitest';
import {
  initialState,
  applyAction,
  advance,
  deriveSnapshot,
  phaseAt,
  HOUR,
  DAY,
} from '../src/sim';
import type { SimState } from '../src/sim';

const t0 = 1_700_000_000_000;

describe('neglect — 장기 방치·휴면·부활 (GDD §3-4·§3-7)', () => {
  it('2주 방치(advance 1회 catch-up): phase dormant, Snapshot 전 필드 NaN 없음·문서 범위 내, acidity ≤ 100', () => {
    const now = t0 + 14 * DAY;
    const advanced = advance(initialState(t0), now);
    const snap = deriveSnapshot(advanced, now);

    expect(snap.phase).toBe('dormant');
    for (const v of Object.values(snap)) {
      if (typeof v === 'number') expect(Number.isNaN(v)).toBe(false);
    }

    expect(snap.fill).toBeGreaterThanOrEqual(0.6);
    expect(snap.fill).toBeLessThanOrEqual(1.6);
    expect(snap.activity).toBeGreaterThanOrEqual(0);
    expect(snap.activity).toBeLessThanOrEqual(1);
    expect(snap.hunger).toBeGreaterThanOrEqual(0);
    expect(snap.hunger).toBeLessThanOrEqual(1);
    expect(snap.sourness).toBeGreaterThanOrEqual(0);
    expect(snap.sourness).toBeLessThanOrEqual(1);
    expect(snap.dormancy).toBeGreaterThanOrEqual(0);
    expect(snap.dormancy).toBeLessThanOrEqual(1);
    expect(snap.hooch).toBeGreaterThanOrEqual(0);
    expect(snap.hooch).toBeLessThanOrEqual(1);
    expect(advanced.acidity).toBeGreaterThanOrEqual(0);
    expect(advanced.acidity).toBeLessThanOrEqual(100);
  });

  it('닫힌 함수 모델의 저장 시점 무관성: 1시간씩 336회 advance == 336시간 한 번에 advance', () => {
    let chunked = initialState(t0);
    let t = t0;
    for (let i = 0; i < 336; i++) {
      t += HOUR;
      chunked = advance(chunked, t);
    }
    const once = advance(initialState(t0), t0 + 336 * HOUR);
    expect(Math.abs(chunked.acidity - once.acidity)).toBeLessThanOrEqual(0.01);
  });

  it('휴면 부활 2세션 의식: reviveStarted → 유효8h 전 reviveTooSoon(lastFedAt 불변) → 8h 후 revived(활발 복귀·maturity 보존)', () => {
    const dormantBase: SimState = {
      ...initialState(t0),
      maturity: 5,
      lastFedAt: t0 - 130 * HOUR,
      locAnchorAt: t0 - 130 * HOUR,
    };
    expect(phaseAt(dormantBase, t0)).toBe('dormant');

    // 1회차 급여
    const r1 = applyAction(dormantBase, { type: 'feed', ratio: '1:1:1' }, t0);
    expect(r1.events).toContainEqual({ type: 'reviveStarted' });
    expect(r1.state.reviveProgress).toBe(1);
    expect(r1.state.maturity).toBe(5);

    // 유효 8h 이전 재급여 — 무해하지만 카운트 안 됨, lastFedAt(의식 타이머) 불변
    const r2 = applyAction(r1.state, { type: 'feed', ratio: '1:1:1' }, t0 + 7 * HOUR);
    expect(r2.events).toContainEqual({ type: 'reviveTooSoon' });
    expect(r2.state.lastFedAt).toBe(r1.state.lastFedAt);
    expect(r2.state.reviveProgress).toBe(1);

    // 유효 8h 이후 재급여 — 부활 완료
    const r3 = applyAction(r2.state, { type: 'feed', ratio: '1:1:1' }, t0 + 8 * HOUR);
    expect(r3.events).toContainEqual({ type: 'revived' });
    expect(r3.events).toContainEqual({ type: 'fed', ratio: '1:1:1', maturityGained: false });
    expect(r3.state.reviveProgress).toBe(0);
    expect(phaseAt(r3.state, t0 + 8 * HOUR)).toBe('active');
    expect(r3.state.maturity).toBe(5); // 부활 급여는 maturity 미적립, 기존 값 보존
  });

  it('휴면 중 냉장 상태에서 feed → needRoom 이벤트, 상태 불변', () => {
    const dormantFridge: SimState = {
      ...initialState(t0),
      maturity: 5,
      location: 'fridge',
      locAnchorAt: t0,
      effBaseMs: 121 * HOUR, // 휴면 임계(120h) 초과를 즉시 고정
    };
    const result = applyAction(dormantFridge, { type: 'feed', ratio: '1:1:1' }, t0);
    expect(result.events).toEqual([{ type: 'needRoom' }]);
    expect(result.state).toBe(dormantFridge);
  });
});
