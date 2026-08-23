// 급여 후 활성 곡선 — 정본: docs/GDD.md §3-2·§3-3, docs/ARCHITECTURE.md §7
import { describe, it, expect } from 'vitest';
import {
  initialState,
  applyAction,
  deriveSnapshot,
  activityAt,
  phaseAt,
  effSinceFeedMs,
  HOUR,
  DAY,
} from '../src/sim';
import type { SimState } from '../src/sim';

const t0 = 1_700_000_000_000;

describe('curves — 급여 후 활성 곡선 (GDD §3-2)', () => {
  it('initialState 직후 activity ≈ 0 (잠복기), phase active', () => {
    const s = initialState(t0);
    const snap = deriveSnapshot(s, t0);
    expect(snap.phase).toBe('active');
    expect(snap.activity).toBeCloseTo(0, 5);
  });

  it('1:1:1 실온: 유효 5h에 피크(1.0), 13h에 하강 중(0.2~0.4), 14h에 phase hungry', () => {
    const s = initialState(t0);
    expect(activityAt(s, t0 + 5 * HOUR)).toBeCloseTo(1, 5);

    const a13 = activityAt(s, t0 + 13 * HOUR);
    expect(a13).toBeGreaterThan(0.2);
    expect(a13).toBeLessThan(0.4);

    expect(phaseAt(s, t0 + 14 * HOUR)).toBe('hungry');
  });

  it('deriveSnapshot().peakAt / nextFeedAt이 곡선 전이 시각과 정합 (±1분)', () => {
    const s = initialState(t0);
    const snap = deriveSnapshot(s, t0);
    expect(Math.abs(snap.peakAt - (t0 + 4.5 * HOUR))).toBeLessThan(60_000);
    expect(Math.abs(snap.nextFeedAt - (t0 + 14 * HOUR))).toBeLessThan(60_000);
  });

  it('창가(×1.3): 실측 5h/1.3에서 피크(activity 1.0), peakAt도 실측시간으로 정합', () => {
    const s0 = initialState(t0);
    const { state: sWindow } = applyAction(s0, { type: 'setLocation', to: 'window' }, t0);
    expect(sWindow.location).toBe('window');

    // 유효 5h(=플래토 중앙) 도달 실측 시각 = 5h/1.3
    const realElapsedMs = (5 * HOUR) / 1.3;
    expect(activityAt(sWindow, t0 + realElapsedMs)).toBeCloseTo(1, 5);

    const snap = deriveSnapshot(sWindow, t0);
    const expectedPeakAt = t0 + (4.5 * HOUR) / 1.3;
    expect(Math.abs(snap.peakAt - expectedPeakAt)).toBeLessThan(60_000);
  });

  it('냉장(×0.08): 급여 후 냉장 이동 → 실측 7.3일 부근에서 phase hungry 진입', () => {
    // 냉장 해금(3단계) 조건을 만족시킨 상태에서 급여 후 냉장으로 이동
    const stage3: SimState = { ...initialState(t0), maturity: 12, createdAt: t0 - 9 * DAY };
    const { state: fed } = applyAction(stage3, { type: 'feed', ratio: '1:1:1' }, t0);
    const { state: fridge } = applyAction(fed, { type: 'setLocation', to: 'fridge' }, t0);
    expect(fridge.location).toBe('fridge');

    const hungryAt = t0 + (14 * HOUR) / 0.08; // ≈175h
    expect(phaseAt(fridge, hungryAt - HOUR)).toBe('active');
    expect(phaseAt(fridge, hungryAt)).toBe('hungry');
    expect((hungryAt - t0) / DAY).toBeCloseTo(7.29, 1);
  });

  it('위치 앵커 회계: 실온 5h → 냉장 이동 → 10h 뒤 유효시간 = 5h + 10h×0.08 = 5.8h', () => {
    const stage3: SimState = { ...initialState(t0), maturity: 12, createdAt: t0 - 9 * DAY };
    const { state: fed } = applyAction(stage3, { type: 'feed', ratio: '1:1:1' }, t0);

    const moveAt = t0 + 5 * HOUR;
    const { state: moved } = applyAction(fed, { type: 'setLocation', to: 'fridge' }, moveAt);

    const checkAt = moveAt + 10 * HOUR;
    const eff = effSinceFeedMs(moved, checkAt);
    expect(eff).toBeCloseTo(5 * HOUR + 10 * HOUR * 0.08, 2);
  });
});
