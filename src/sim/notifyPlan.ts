// planNotifications(state, now, opts) — 알림 시각 계산(순수). 예약·취소는 platform 소관.
// 정본: docs/GDD.md §7. 기본 슬롯 3개 고정 id + 옵트인 슬롯 4종(피크·시큼·단계·첫 주).
// 완전 방치 시 총 4건(밥→시큼→휴면→곰팡이 경고) 후 침묵 — 사망 시점·사후 알림 0.
//
// 2026-09-03 확장: 옵트인 슬롯 id 5~7 추가 + GDD §7 "스팸 금지, 하루 최대 2건"을
// capPerDay로 코드에 옮겼다. 옵션 기본값은 전부 undefined(off) — opts 없이 부르면
// 종전과 완전히 같은 플랜이 나온다(설정 기본 on은 store가 값을 넘겨 만든다).
import type { NotifyPlan, NotifySlot, SimState } from './types';
import {
  DAY,
  HOUR,
  NOTIFY_MAX_PER_DAY,
  NOTIFY_SLOT_DORMANT,
  NOTIFY_SLOT_FEED,
  NOTIFY_SLOT_FIRSTWEEK,
  NOTIFY_SLOT_MOLD,
  NOTIFY_SLOT_PEAK,
  NOTIFY_SLOT_SOUR,
  NOTIFY_SLOT_STAGE,
  QUIET_END_H,
  QUIET_START_H,
  REVIVE_GAP_H,
  STAGES,
} from './constants';
import { boundariesH, phaseAt, rateMult, stageOf } from './derive';

export interface NotifyOpts {
  /** "한창때" 옵트인 슬롯 (settings.notifyPeak) */
  peakOptIn?: boolean;
  /** "시큼해질 때" 옵트인 슬롯 (settings.notifySour) */
  sourOptIn?: boolean;
  /** "단계가 오를 때" 옵트인 슬롯 (settings.notifyStage) */
  stageOptIn?: boolean;
  /** "첫 주 안내" 옵트인 슬롯 (settings.notifyFirstWeek) */
  firstWeekOptIn?: boolean;
  /** 조용시간 사용자 설정 (settings.quietStartH/EndH — 기본 22~08) */
  quietStartH?: number;
  quietEndH?: number;
}

/**
 * 하루 상한을 깎을 때의 우선순위(작을수록 남긴다) — 잃을 것이 큰 신호부터.
 * 곰팡이·휴면은 방치하면 개체를 잃고, 밥·부활은 리듬의 축이며, 나머지는 있으면 좋은 안내다.
 */
const DROP_ORDER: Record<NotifySlot['copyKey'], number> = {
  moldWarn: 0,
  dormant: 1,
  reviveSecond: 2,
  feedTime: 3,
  fridgeWeek: 3, // weekly라 집계에서 빠지지만 Record 완전성을 위해 둔다
  sour: 4,
  peak: 5,
  stageUp: 6,
  firstWeek: 7,
};

/** 로컬 자정 경계 기준 날짜 키 — 조용시간·광고 원장과 같은 "하루" 정의 (sim/ads.sameLocalDay) */
function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * GDD §7 "하루 최대 2건" 강제(순수). 같은 로컬 날짜에 3건 이상이면 우선순위가 낮은 것부터
 * 드롭한다. `weekly: true`(냉장 주간 반복)는 날짜가 고정 의미를 갖지 않으므로 집계에서 제외 —
 * 항상 남는다. 입력 순서는 보존한다(platform은 순서를 읽지 않지만 테스트·디버깅이 읽는다).
 */
export function capPerDay(slots: NotifySlot[]): NotifySlot[] {
  const byDay = new Map<string, NotifySlot[]>();
  const keep = new Set<NotifySlot>();
  for (const s of slots) {
    if (s.weekly) {
      keep.add(s);
      continue;
    }
    const key = dayKey(s.at);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(s);
    else byDay.set(key, [s]);
  }
  for (const bucket of byDay.values()) {
    // 동순위는 이른 시각이 이긴다 — 같은 날 같은 종류가 둘일 수 있는 건 병합 전 단계뿐이다
    bucket.sort((a, b) => DROP_ORDER[a.copyKey] - DROP_ORDER[b.copyKey] || a.at - b.at);
    for (const s of bucket.slice(0, NOTIFY_MAX_PER_DAY)) keep.add(s);
  }
  return slots.filter((s) => keep.has(s));
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

  // 시큼(옵트인) — 피크와 달리 클램프한다: "시큼하다"는 창이 아니라 되돌리기 전까지
  // 계속 참인 상태라, 아침으로 밀어도 문구가 거짓이 되지 않는다.
  if (opts?.sourOptIn) {
    const at = cq(wallFor(b.sour));
    if (at > now) slots.push({ id: NOTIFY_SLOT_SOUR, at, copyKey: 'sour', weekly: false });
  }

  // 단계 승급 예고(옵트인) — 사이클은 이미 찼고 일수만 남은 경우에만.
  // 게이트가 max(사이클, 일수)라 이때의 승급 시각은 createdAt + 요구 일수로 확정된다
  // (사이클이 모자라면 언제 채울지 모르므로 예약하지 않는다 — 거짓 예고 금지).
  if (opts?.stageOptIn) {
    const next = stageOf(state, now) + 1;
    if (next < STAGES.length && state.maturity >= STAGES[next].cycles) {
      const at = cq(state.createdAt + STAGES[next].days * DAY);
      if (at > now) {
        slots.push({ id: NOTIFY_SLOT_STAGE, at, copyKey: 'stageUp', weekly: false, stage: next });
      }
    }
  }

  // 첫 주 안내(옵트인) — 0단계의 D2 가짜 부풀기 예고(GDD §4). 탄생 24h 시점 1회.
  if (opts?.firstWeekOptIn && stageOf(state, now) === 0) {
    const at = cq(state.createdAt + DAY);
    if (at > now) slots.push({ id: NOTIFY_SLOT_FIRSTWEEK, at, copyKey: 'firstWeek', weekly: false });
  }

  const feedAt = cq(wallFor(b.hungry));
  if (feedAt > now) slots.push({ id: NOTIFY_SLOT_FEED, at: feedAt, copyKey: 'feedTime', weekly: false });

  const dormantAt = cq(wallFor(b.dormant));
  if (dormantAt > now) slots.push({ id: NOTIFY_SLOT_DORMANT, at: dormantAt, copyKey: 'dormant', weekly: false });

  // 곰팡이 임박 경고 — 완전 방치자의 마지막 재계획은 활발 상태에서 일어난다
  const moldAt = cq(wallFor(b.moldSpot));
  if (moldAt > now) slots.push({ id: NOTIFY_SLOT_MOLD, at: moldAt, copyKey: 'moldWarn', weekly: false });

  // 하루 상한은 여기서만 걸면 된다 — 위 분기(부활·휴면·냉장)는 슬롯이 최대 1개다
  return { slots: capPerDay(slots) };
}

/**
 * 멀티 르방 병합 플랜 (확장기획 §5-6) — 알림 총량은 N배가 아니라 슬롯 수 그대로.
 * 같은 슬롯을 여러 르방이 원하면 **가장 이른 시각 1건**(그 르방의 copyKey·weekly 채택),
 * 병합 수는 count로 실어 문구를 집계형으로(ui/copy.ts notifyMany).
 * 사망 침묵·휴면 1건·조용시간 처리는 개별 planNotifications가 이미 보장한다.
 */
export function planNotificationsAll(
  sims: SimState[],
  now: number,
  opts?: NotifyOpts,
  /** sims와 같은 순서의 표시 이름(없으면 null) — 단독 슬롯의 본문에 실린다. 생략하면 label 없음 */
  labels?: ReadonlyArray<string | null>,
): NotifyPlan {
  const withLabel = (slot: NotifySlot, i: number): NotifySlot => {
    const label = labels?.[i];
    return label ? { ...slot, label } : slot;
  };
  if (sims.length === 0) return { slots: [] };
  if (sims.length === 1) {
    const plan = planNotifications(sims[0], now, opts);
    return labels?.[0] ? { slots: plan.slots.map((s) => withLabel(s, 0)) } : plan;
  }
  const bySlot = new Map<number, NotifySlot & { count: number }>();
  sims.forEach((sim, i) => {
    for (const slot of planNotifications(sim, now, opts).slots) {
      const cur = bySlot.get(slot.id);
      if (!cur) bySlot.set(slot.id, { ...withLabel(slot, i), count: 1 });
      else if (slot.at < cur.at) bySlot.set(slot.id, { ...withLabel(slot, i), count: cur.count + 1 });
      else cur.count += 1;
    }
  });
  const slots: NotifySlot[] = [...bySlot.values()]
    // 병합(count ≥ 2)이면 한 마리를 지목할 수 없다 — label을 뗀다
    .map(({ count, label, ...rest }) => (count > 1 ? { ...rest, count } : label ? { ...rest, label } : rest))
    .sort((a, b) => a.id - b.id);
  // 병합 후 한 번 더 — 개별 플랜이 각자 상한을 지켜도 합치면 같은 날에 몰릴 수 있다
  return { slots: capPerDay(slots) };
}
