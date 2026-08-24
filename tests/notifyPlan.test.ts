// 알림 슬롯 계획 — 정본: docs/GDD.md §7
import { describe, it, expect } from 'vitest';
import {
  initialState,
  applyAction,
  phaseAt,
  planNotifications,
  planNotificationsAll,
  clampQuiet,
  HOUR,
  DAY,
} from '../src/sim';
import { NOTIFY_SLOT_FEED } from '../src/sim/constants';
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
  it('실온 활발: feedTime + dormant + moldWarn 슬롯 3개, wallFor+clampQuiet 정합', () => {
    const t0 = local(2024, 0, 15, 6, 0); // 조용시간 밖에서 시작
    const s = initialState(t0);
    const plan = planNotifications(s, t0);
    expect(plan.slots.length).toBe(3);

    const feedSlot = plan.slots.find((sl) => sl.copyKey === 'feedTime');
    const dormantSlot = plan.slots.find((sl) => sl.copyKey === 'dormant');
    const moldSlot = plan.slots.find((sl) => sl.copyKey === 'moldWarn');
    expect(feedSlot).toBeDefined();
    expect(dormantSlot).toBeDefined();
    expect(moldSlot).toBeDefined();

    expect(feedSlot!.id).toBe(1); // GDD §7 슬롯 1
    expect(feedSlot!.weekly).toBe(false);
    expect(feedSlot!.at).toBe(clampQuiet(t0 + 14 * HOUR));

    expect(dormantSlot!.id).toBe(2); // GDD §7 슬롯 2
    expect(dormantSlot!.weekly).toBe(false);
    expect(dormantSlot!.at).toBe(clampQuiet(t0 + 120 * HOUR));

    expect(moldSlot!.id).toBe(3); // NOTIFY_SLOT_MOLD
    expect(moldSlot!.weekly).toBe(false);
    expect(moldSlot!.at).toBe(clampQuiet(t0 + 168 * HOUR)); // moldSpot
  });

  it('냉장: fridgeWeek 슬롯 1개, weekly true (슬롯 1 재사용), moldWarn 없음(≈175일이라 제외)', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const stage3: SimState = { ...initialState(t0), maturity: 12, createdAt: t0 - 9 * DAY };
    const fridge = applyAction(stage3, { type: 'setLocation', to: 'fridge' }, t0).state;

    const plan = planNotifications(fridge, t0);
    expect(plan.slots.length).toBe(1);
    expect(plan.slots[0].copyKey).toBe('fridgeWeek');
    expect(plan.slots[0].weekly).toBe(true);
    expect(plan.slots[0].id).toBe(1);
    expect(plan.slots.some((sl) => sl.copyKey === 'moldWarn')).toBe(false);
  });

  it('휴면(reviveProgress 0), spot 전: moldWarn 슬롯 1개(id 3), at = spot 시각 클램프', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const dormant: SimState = {
      ...initialState(t0),
      lastFedAt: t0 - 130 * HOUR,
      locAnchorAt: t0 - 130 * HOUR,
    };
    expect(phaseAt(dormant, t0)).toBe('dormant');
    const plan = planNotifications(dormant, t0);
    expect(plan.slots.length).toBe(1);
    expect(plan.slots[0].id).toBe(3);
    expect(plan.slots[0].copyKey).toBe('moldWarn');
    expect(plan.slots[0].weekly).toBe(false);
    // moldSpot(168h) - 경과(130h) = 남은 38h
    expect(plan.slots[0].at).toBe(clampQuiet(t0 + 38 * HOUR));
  });

  it('휴면, spot 이미 경과(200h): moldWarn at = spread 시각으로 대체', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const dormant: SimState = {
      ...initialState(t0),
      lastFedAt: t0 - 200 * HOUR,
      locAnchorAt: t0 - 200 * HOUR,
    };
    expect(phaseAt(dormant, t0)).toBe('dormant');
    const plan = planNotifications(dormant, t0);
    expect(plan.slots.length).toBe(1);
    expect(plan.slots[0].copyKey).toBe('moldWarn');
    // moldSpread(240h) - 경과(200h) = 남은 40h
    expect(plan.slots[0].at).toBe(clampQuiet(t0 + 40 * HOUR));
  });

  it('휴면, spread도 이미 경과(300h): 슬롯 0개 — 예고 시각이 지나면 조용히 침묵', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const dormant: SimState = {
      ...initialState(t0),
      lastFedAt: t0 - 300 * HOUR,
      locAnchorAt: t0 - 300 * HOUR,
    };
    expect(phaseAt(dormant, t0)).toBe('dormant');
    expect(planNotifications(dormant, t0).slots.length).toBe(0);
  });

  it('moldy: 슬롯 0개 — 죽음을 푸시로 통지하지 않는다', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const moldy: SimState = {
      ...initialState(t0),
      lastFedAt: t0 - 337 * HOUR,
      locAnchorAt: t0 - 337 * HOUR,
    };
    expect(phaseAt(moldy, t0)).toBe('moldy');
    expect(planNotifications(moldy, t0).slots.length).toBe(0);
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

describe('planNotificationsAll — 멀티 르방 병합 (확장기획 §5-6)', () => {
  // 조용시간 밖(정오)에서 생성 — clampQuiet 간섭 배제
  const t0 = local(2024, 0, 15, 12, 0);

  it('한 마리는 단일 플랜 그대로 (count 없음)', () => {
    const one = planNotificationsAll([initialState(t0)], t0);
    expect(one.slots.every((s) => s.count === undefined)).toBe(true);
    expect(one.slots.length).toBeGreaterThan(0);
  });

  it('둘 다 활발: 같은 슬롯은 가장 이른 시각 1건 + count 2, 슬롯 총량은 3 유지', () => {
    const a = initialState(t0);                    // 밥 t0 → hungry +14h
    const b = { ...initialState(t0), lastFedAt: t0 - 4 * HOUR, locAnchorAt: t0 - 4 * HOUR }; // 4h 먼저
    const plan = planNotificationsAll([a, b], t0);
    const feed = plan.slots.find((s) => s.id === NOTIFY_SLOT_FEED)!;
    const feedB = planNotifications(b, t0).slots.find((s) => s.id === NOTIFY_SLOT_FEED)!;
    expect(feed.at).toBe(feedB.at);                // 더 이른(b) 시각 채택
    expect(feed.count).toBe(2);
    expect(plan.slots.length).toBeLessThanOrEqual(3); // 알림 스팸 없음 — 슬롯 의미 유지
  });

  it('실온+냉장 혼합: 슬롯 1은 더 이른 실온 one-shot(feedTime, weekly:false) + count 2', () => {
    const room = initialState(t0);
    const fridge: SimState = { ...initialState(t0), location: 'fridge', maturity: 12, createdAt: t0 - 9 * DAY };
    const plan = planNotificationsAll([room, fridge], t0);
    const feed = plan.slots.find((s) => s.id === NOTIFY_SLOT_FEED)!;
    expect(feed.copyKey).toBe('feedTime');         // 가장 이른(실온) 항목의 문구·반복 채택
    expect(feed.weekly).toBe(false);
    expect(feed.count).toBe(2);
  });

  it('moldy 르방은 병합에 기여 0 (죽음을 푸시로 통지하지 않는다)', () => {
    const moldy: SimState = { ...initialState(t0), lastFedAt: t0 - 400 * HOUR, locAnchorAt: t0 - 400 * HOUR };
    expect(phaseAt(moldy, t0)).toBe('moldy');
    const alone = planNotificationsAll([moldy], t0);
    expect(alone.slots).toEqual([]);
    const withAlive = planNotificationsAll([moldy, initialState(t0)], t0);
    expect(withAlive.slots.every((s) => s.count === undefined)).toBe(true); // 산 놈 혼자 = 병합 없음
  });
});
