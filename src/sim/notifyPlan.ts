// planNotifications(state, now) — 알림 시각 계산(순수). 예약·취소는 platform 소관.
// 정본: docs/GDD.md §7. 슬롯 3개 고정 id, 조용시간 22~08 고정 클램프.
// 완전 방치 시 총 3건(밥→휴면→곰팡이 경고) 후 침묵 — 사망 시점·사후 알림 0.
import type { NotifyPlan, NotifySlot, SimState } from './types';
import {
  HOUR,
  NOTIFY_SLOT_DORMANT,
  NOTIFY_SLOT_FEED,
  NOTIFY_SLOT_MOLD,
  QUIET_END_H,
  QUIET_START_H,
  REVIVE_GAP_H,
} from './constants';
import { boundariesH, phaseAt, rateMult } from './derive';

/** 조용시간(22~08 로컬)에 걸리면 다음 08:00으로 민다 */
export function clampQuiet(at: number): number {
  const d = new Date(at);
  const h = d.getHours();
  if (h >= QUIET_END_H && h < QUIET_START_H) return at;
  const next = new Date(at);
  if (h >= QUIET_START_H) next.setDate(next.getDate() + 1); // 22시 이후 → 다음날 아침
  next.setHours(QUIET_END_H, 0, 0, 0);
  return next.getTime();
}

export function planNotifications(state: SimState, now: number): NotifyPlan {
  const phase = phaseAt(state, now);
  const slots: NotifySlot[] = [];
  const mult = rateMult(state);
  const b = boundariesH(state);
  const wallFor = (h: number): number =>
    state.locAnchorAt + Math.max(0, h * HOUR - state.effBaseMs) / mult;

  // 부활 의식 중 — 2회차 급여 시각 하나만
  if (state.reviveProgress === 1) {
    // 부활 게이트(effH < REVIVE_GAP_H)는 flour 배율을 포함하므로 알림도 같은 배율로
    const at = clampQuiet(state.lastFedAt + (REVIVE_GAP_H * HOUR) / rateMult({ location: 'room', flour: state.flour }));
    if (at > now) slots.push({ id: NOTIFY_SLOT_FEED, at, copyKey: 'reviveSecond', weekly: false });
    return { slots };
  }

  // 곰팡이 확정 — 완전 침묵. 죽음을 푸시로 통지하지 않는다
  if (phase === 'moldy') return { slots };

  // 휴면 — 침묵하되 곰팡이 임박 경고 정확히 1건만 (예고 없는 죽음은 불공정)
  if (phase === 'dormant') {
    const spotAt = wallFor(b.moldSpot);
    const at = clampQuiet(spotAt > now ? spotAt : wallFor(b.moldSpread));
    if (at > now) slots.push({ id: NOTIFY_SLOT_MOLD, at, copyKey: 'moldWarn', weekly: false });
    return { slots };
  }

  // 냉장 — 주간 반복 슬롯 하나로 대체 (앱을 안 열어도 발화). 곰팡이는 ≈175일이라 제외
  if (state.location === 'fridge') {
    const at = clampQuiet(wallFor(b.hungry));
    if (at > now) slots.push({ id: NOTIFY_SLOT_FEED, at, copyKey: 'fridgeWeek', weekly: true });
    return { slots };
  }

  const feedAt = clampQuiet(wallFor(b.hungry));
  if (feedAt > now) slots.push({ id: NOTIFY_SLOT_FEED, at: feedAt, copyKey: 'feedTime', weekly: false });

  const dormantAt = clampQuiet(wallFor(b.dormant));
  if (dormantAt > now) slots.push({ id: NOTIFY_SLOT_DORMANT, at: dormantAt, copyKey: 'dormant', weekly: false });

  // 곰팡이 임박 경고 — 완전 방치자의 마지막 재계획은 활발 상태에서 일어난다
  const moldAt = clampQuiet(wallFor(b.moldSpot));
  if (moldAt > now) slots.push({ id: NOTIFY_SLOT_MOLD, at: moldAt, copyKey: 'moldWarn', weekly: false });

  return { slots };
}

/**
 * 멀티 르방 병합 플랜 (확장기획 §5-6) — 알림 총량은 N배가 아니라 슬롯 3개 그대로.
 * 같은 슬롯을 여러 르방이 원하면 **가장 이른 시각 1건**(그 르방의 copyKey·weekly 채택),
 * 병합 수는 count로 실어 문구를 집계형으로(ui/copy.ts notifyMany).
 * 사망 침묵·휴면 1건·조용시간 클램프는 개별 planNotifications가 이미 보장한다.
 */
export function planNotificationsAll(sims: SimState[], now: number): NotifyPlan {
  if (sims.length <= 1) return sims.length === 1 ? planNotifications(sims[0], now) : { slots: [] };
  const bySlot = new Map<number, NotifySlot & { count: number }>();
  for (const sim of sims) {
    for (const slot of planNotifications(sim, now).slots) {
      const cur = bySlot.get(slot.id);
      if (!cur) bySlot.set(slot.id, { ...slot, count: 1 });
      else if (slot.at < cur.at) bySlot.set(slot.id, { ...slot, count: cur.count + 1 });
      else cur.count += 1;
    }
  }
  const slots: NotifySlot[] = [...bySlot.values()]
    .map(({ count, ...rest }) => (count > 1 ? { ...rest, count } : rest))
    .sort((a, b) => a.id - b.id);
  return { slots };
}
