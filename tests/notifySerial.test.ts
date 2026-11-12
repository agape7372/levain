// applyPlan 직렬화 (T7-03) — 동기 dispatch 2회(「냉장 갈 준비」 = feed + setLocation)면
// 두 실행이 getPending→cancel→schedule의 await 사이로 엇갈려 앞 플랜에만 있던 슬롯이 남았다.
import { describe, it, expect, vi } from 'vitest';

const pending = vi.hoisted(() => new Map<number, unknown>());
vi.mock('@capacitor/local-notifications', () => {
  const tick = () => new Promise((r) => setTimeout(r, 1));
  return {
    LocalNotifications: {
      getPending: async () => {
        await tick();
        return { notifications: [...pending.keys()].map((id) => ({ id })) };
      },
      cancel: async ({ notifications }: { notifications: { id: number }[] }) => {
        await tick();
        for (const n of notifications) pending.delete(n.id);
      },
      schedule: async ({ notifications }: { notifications: { id: number }[] }) => {
        await tick();
        for (const n of notifications) pending.set(n.id, n);
      },
      createChannel: async () => undefined,
    },
  };
});
vi.mock('../src/platform/native', () => ({ isNative: () => true }));

import { createNotifier } from '../src/platform/notifications';
import type { NotifyPlan, NotifySlot } from '../src/sim';

const slot = (id: number, copyKey: NotifySlot['copyKey']): NotifySlot => ({ id, at: 2e12, copyKey, weekly: false });

describe('notifier.applyPlan 직렬화', () => {
  it('연속 두 번 호출 뒤 남은 예약 = 마지막 플랜', async () => {
    const n = createNotifier();
    await n.applyPlan({ slots: [slot(5, 'sour')] }); // 이전 예약이 남아 있는 상태에서 시작
    const first: NotifyPlan = { slots: [slot(1, 'feedTime'), slot(2, 'dormant'), slot(3, 'moldWarn')] };
    const last: NotifyPlan = { slots: [slot(1, 'fridgeWeek')] };
    const a = n.applyPlan(first);
    const b = n.applyPlan(last);
    await Promise.all([a, b]);
    expect([...pending.keys()].sort()).toEqual([1]);
    expect((pending.get(1) as { extra: { copyKey: string } }).extra.copyKey).toBe('fridgeWeek');
  });

  // T2-04: 플러그인은 at이 있으면 every를 무시하고 간격을 (at − 지금)으로 잡아 몇 시간·재부팅 뒤 분 단위로 반복했다
  it('weekly 슬롯도 반복 없는 원샷 { at }으로 예약한다', async () => {
    const n = createNotifier();
    await n.applyPlan({ slots: [{ ...slot(7, 'fridgeWeek'), weekly: true }] });
    const sched = (pending.get(7) as { schedule: Record<string, unknown> }).schedule;
    expect(sched).toEqual({ at: new Date(2e12) });
  });
});
