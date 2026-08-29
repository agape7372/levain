// planNotifications(state, now, opts) — 알림 시각 계산(순수). 예약·취소는 platform 소관.
// 정본: docs/GDD.md §7. 기본 슬롯 3개 고정 id + 옵트인 피크 슬롯(설정 기본 off).
// 완전 방치 시 총 3건(밥→휴면→곰팡이 경고) 후 침묵 — 사망 시점·사후 알림 0.
import type { NotifyPlan, NotifySlot, SimState } from './types';
import {
  HOUR,
  NOTIFY_SLOT_DORMANT,
  NOTIFY_SLOT_FEED,
  NOTIFY_SLOT_MOLD,
  NOTIFY_SLOT_PEAK,
  QUIET_END_H,
  QUIET_START_H,
  REVIVE_GAP_H,
} from './constants';
import { boundariesH, phaseAt, rateMult } from './derive';

export interface NotifyOpts {
  /** "한창때" 옵트인 슬롯 (settings.notifyPeak — 기본 off) */
  peakOptIn?: boolean;
  /** 조용시간 사용자 설정 (settings.quietStartH/EndH — 기본 22~08) */
  quietStartH?: number;
  quietEndH?: number;
}

/**
 * 조용시간에 걸리면 그 창이 끝나는 시각(endH:00)으로 민다.
 * start > end = 자정을 넘는 밤 창(기본 22~08) / start < end = 낮 창(야간 근무자) /
 * start === end = 조용시간 없음. 2026-08-30부터 사용자 설정 가능 — 기본값은 종전과 동일.
 */
export function clampQuiet(at: number, startH: number = QUIET_START_H, endH: number = QUIET_END_H): number {
  if (startH === endH) return at;
  const d = new Date(at);
  const h = d.getHours();
  const inQuiet = startH > endH ? h >= startH || h < endH : h >= startH && h < endH;
  if (!inQuiet) return at;
  const next = new Date(at);
  if (startH > endH && h >= startH) next.setDate(next.getDate() + 1); // 밤 창의 앞부분 → 다음날 아침
  next.setHours(endH, 0, 0, 0);
  return next.getTime();
}

export function planNotifications(state: SimState, now: number, opts?: NotifyOpts): NotifyPlan {
  const phase = phaseAt(state, now);
  const slots: NotifySlot[] = [];
  const mult = rateMult(state);
  const b = boundariesH(state);
  const wallFor = (h: number): number =>
    state.locAnchorAt + Math.max(0, h * HOUR - state.effBaseMs) / mult;
  const cq = (at: number): number => clampQuiet(at, opts?.quietStartH, opts?.quietEndH);

  // 부활 의식 중 — 2회차 급여 시각 하나만.
  // wallFor로 계산해야 한다: 게이트(effH < REVIVE_GAP_H)는 위치 앵커 회계를 타므로,
  // 부활 중 위치를 옮기면 room 배율 고정식은 게이트보다 이른 거짓 알림이 된다(2026-08-30 수정).
  if (state.reviveProgress === 1) {
    const at = cq(wallFor(REVIVE_GAP_H));
    if (at > now) slots.push({ id: NOTIFY_SLOT_FEED, at, copyKey: 'reviveSecond', weekly: false });
    return { slots };
  }

  // 곰팡이 확정 — 완전 침묵. 죽음을 푸시로 통지하지 않는다
  if (phase === 'moldy') return { slots };

  // 휴면 — 침묵하되 곰팡이 임박 경고 정확히 1건만 (예고 없는 죽음은 불공정)
  if (phase === 'dormant') {
    const spotAt = wallFor(b.moldSpot);
    const at = cq(spotAt > now ? spotAt : wallFor(b.moldSpread));
    if (at > now) slots.push({ id: NOTIFY_SLOT_MOLD, at, copyKey: 'moldWarn', weekly: false });
    return { slots };
  }

  // 냉장 — 주간 반복 슬롯 하나로 대체 (앱을 안 열어도 발화). 곰팡이는 ≈175일이라 제외.
  // 피크도 제외 — 냉장은 주 1회 케어 모드라 "한창" 창 자체가 관심사가 아니다.
  if (state.location === 'fridge') {
    const at = cq(wallFor(b.hungry));
    if (at > now) slots.push({ id: NOTIFY_SLOT_FEED, at, copyKey: 'fridgeWeek', weekly: true });
    return { slots };
  }

  // 피크(옵트인) — ★클램프가 아니라 스킵이 규칙: 조용시간이 민 시각이 밴드 밖이면
  // "한창"이 거짓말이 된다(타임라인 축과 같은 가치). 민 시각이 아직 밴드 안이면 그대로 쓴다.
  if (opts?.peakOptIn) {
    const at = cq(wallFor(b.peakStart));
    if (at > now && at < wallFor(b.peakEnd)) {
      slots.push({ id: NOTIFY_SLOT_PEAK, at, copyKey: 'peak', weekly: false });
    }
  }

  const feedAt = cq(wallFor(b.hungry));
  if (feedAt > now) slots.push({ id: NOTIFY_SLOT_FEED, at: feedAt, copyKey: 'feedTime', weekly: false });

  const dormantAt = cq(wallFor(b.dormant));
  if (dormantAt > now) slots.push({ id: NOTIFY_SLOT_DORMANT, at: dormantAt, copyKey: 'dormant', weekly: false });

  // 곰팡이 임박 경고 — 완전 방치자의 마지막 재계획은 활발 상태에서 일어난다
  const moldAt = cq(wallFor(b.moldSpot));
  if (moldAt > now) slots.push({ id: NOTIFY_SLOT_MOLD, at: moldAt, copyKey: 'moldWarn', weekly: false });

  return { slots };
}

/**
 * 멀티 르방 병합 플랜 (확장기획 §5-6) — 알림 총량은 N배가 아니라 슬롯 수 그대로.
 * 같은 슬롯을 여러 르방이 원하면 **가장 이른 시각 1건**(그 르방의 copyKey·weekly 채택),
 * 병합 수는 count로 실어 문구를 집계형으로(ui/copy.ts notifyMany).
 * 사망 침묵·휴면 1건·조용시간 처리는 개별 planNotifications가 이미 보장한다.
 */
export function planNotificationsAll(sims: SimState[], now: number, opts?: NotifyOpts): NotifyPlan {
  if (sims.length <= 1) return sims.length === 1 ? planNotifications(sims[0], now, opts) : { slots: [] };
  const bySlot = new Map<number, NotifySlot & { count: number }>();
  for (const sim of sims) {
    for (const slot of planNotifications(sim, now, opts).slots) {
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
