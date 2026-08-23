// 알림 슬롯 계획 — 정본: docs/GDD.md §7
import { describe, it, expect } from 'vitest';
import {
  initialState,
  applyAction,
  phaseAt,
  planNotifications,
  clampQuiet,
  HOUR,
  DAY,
} from '../src/sim';
import type { SimState } from '../src/sim';

// 로컬 시각 기준 생성 — clampQuiet은 new Date().getHours()(로컬)로 판단한다
function local(y: number, mo: number, d: number, h: number, mi: number): number {
  return new Date(y, mo, d, h, mi, 0, 0).getTime();
}

describe('clampQuiet — 조용시간 22~08 고정 클램프 (GDD §7)', () => {
  it('21:59는 그대로', () => {
    const at = local(2024, 0, 15, 21, 59);
    expect(clampQuiet(at)).toBe(at);
  });

  it('22:00은 다음날 08:00으로', () => {
    const at = local(2024, 0, 15, 22, 0);
    expect(clampQuiet(at)).toBe(local(2024, 0, 16, 8, 0));
  });

  it('07:59는 당일 08:00으로', () => {
    const at = local(2024, 0, 15, 7, 59);
    expect(clampQuiet(at)).toBe(local(2024, 0, 15, 8, 0));
  });

  it('08:00은 그대로', () => {
    const at = local(2024, 0, 15, 8, 0);
    expect(clampQuiet(at)).toBe(at);
  });
});

describe('planNotifications — 상태별 슬롯 (GDD §7)', () => {
  it('실온 활발: feedTime + dormant 슬롯 2개, wallFor+clampQuiet 정합', () => {
    const t0 = local(2024, 0, 15, 6, 0); // 조용시간 밖에서 시작
    const s = initialState(t0);
    const plan = planNotifications(s, t0);
    expect(plan.slots.length).toBe(2);

    const feedSlot = plan.slots.find((sl) => sl.copyKey === 'feedTime');
    const dormantSlot = plan.slots.find((sl) => sl.copyKey === 'dormant');
    expect(feedSlot).toBeDefined();
    expect(dormantSlot).toBeDefined();

    expect(feedSlot!.id).toBe(1); // GDD §7 슬롯 1
    expect(feedSlot!.weekly).toBe(false);
    expect(feedSlot!.at).toBe(clampQuiet(t0 + 14 * HOUR));

    expect(dormantSlot!.id).toBe(2); // GDD §7 슬롯 2
    expect(dormantSlot!.weekly).toBe(false);
    expect(dormantSlot!.at).toBe(clampQuiet(t0 + 120 * HOUR));
  });

  it('냉장: fridgeWeek 슬롯 1개, weekly true (슬롯 1 재사용)', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const stage3: SimState = { ...initialState(t0), maturity: 12, createdAt: t0 - 9 * DAY };
    const fridge = applyAction(stage3, { type: 'setLocation', to: 'fridge' }, t0).state;

    const plan = planNotifications(fridge, t0);
    expect(plan.slots.length).toBe(1);
    expect(plan.slots[0].copyKey).toBe('fridgeWeek');
    expect(plan.slots[0].weekly).toBe(true);
    expect(plan.slots[0].id).toBe(1);
  });

  it('휴면(reviveProgress 0): 슬롯 0개 — 완전 침묵', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const dormant: SimState = {
      ...initialState(t0),
      lastFedAt: t0 - 130 * HOUR,
      locAnchorAt: t0 - 130 * HOUR,
    };
    expect(phaseAt(dormant, t0)).toBe('dormant');
    expect(planNotifications(dormant, t0).slots.length).toBe(0);
  });

  it('reviveProgress 1: reviveSecond 슬롯 1개, at = lastFedAt+8h(클램프 적용)', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const reviving: SimState = { ...initialState(t0), reviveProgress: 1, lastFedAt: t0 };

    const plan = planNotifications(reviving, t0);
    expect(plan.slots.length).toBe(1);
    expect(plan.slots[0].copyKey).toBe('reviveSecond');
    expect(plan.slots[0].weekly).toBe(false);
    expect(plan.slots[0].at).toBe(clampQuiet(t0 + 8 * HOUR));
  });
});
