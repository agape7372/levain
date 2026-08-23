// planNotifications(state, now) — 알림 시각 계산(순수). 예약·취소는 platform 소관.
// 정본: docs/GDD.md §7. 슬롯 2개 고정 id, 조용시간 22~08 고정 클램프, 하루 최대 2건.
import type { NotifyPlan, NotifySlot, SimState } from './types';
import {
  HOUR,
  NOTIFY_SLOT_DORMANT,
  NOTIFY_SLOT_FEED,
  QUIET_END_H,
  QUIET_START_H,
  REVIVE_GAP_H,
  TEMP_MULT,
} from './constants';
import { boundariesH, phaseAt } from './derive';

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
  const mult = TEMP_MULT[state.location];
  const b = boundariesH(state);
  const wallFor = (h: number): number =>
    state.locAnchorAt + Math.max(0, h * HOUR - state.effBaseMs) / mult;

  // 부활 의식 중 — 2회차 급여 시각 하나만
  if (state.reviveProgress === 1) {
    const at = clampQuiet(state.lastFedAt + (REVIVE_GAP_H * HOUR) / TEMP_MULT.room);
    if (at > now) slots.push({ id: NOTIFY_SLOT_FEED, at, copyKey: 'reviveSecond', weekly: false });
    return { slots };
  }

  // 휴면 도달 후 — 완전 침묵 (죄책감 유발 금지)
  if (phase === 'dormant') return { slots };

  // 냉장 — 주간 반복 슬롯 하나로 대체 (앱을 안 열어도 발화)
  if (state.location === 'fridge') {
    const at = clampQuiet(wallFor(b.hungry));
    if (at > now) slots.push({ id: NOTIFY_SLOT_FEED, at, copyKey: 'fridgeWeek', weekly: true });
    return { slots };
  }

  const feedAt = clampQuiet(wallFor(b.hungry));
  if (feedAt > now) slots.push({ id: NOTIFY_SLOT_FEED, at: feedAt, copyKey: 'feedTime', weekly: false });

  const dormantAt = clampQuiet(wallFor(b.dormant));
  if (dormantAt > now) slots.push({ id: NOTIFY_SLOT_DORMANT, at: dormantAt, copyKey: 'dormant', weekly: false });

  return { slots };
}
