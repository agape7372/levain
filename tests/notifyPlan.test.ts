// 알림 슬롯 계획 — 정본: docs/GDD.md §7
import { describe, it, expect } from 'vitest';
import {
  initialState,
  applyAction,
  phaseAt,
  planNotifications,
  planNotificationsAll,
  clampQuiet,
  capPerDay,
  stageOf,
  STAGES,
  HOUR,
  DAY,
} from '../src/sim';
import {
  NOTIFY_SLOT_FEED,
  NOTIFY_SLOT_FIRSTWEEK,
  NOTIFY_SLOT_SOUR,
  NOTIFY_SLOT_STAGE,
  SOUR_AFTER_HUNGRY_H,
} from '../src/sim/constants';
import type { NotifySlot, SimState } from '../src/sim';

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

describe('clampQuiet — 사용자 설정 조용시간 (2026-08-30)', () => {
  it('낮 창(9~18): 10:00은 당일 18:00으로', () => {
    const at = local(2024, 0, 15, 10, 0);
    expect(clampQuiet(at, 9, 18)).toBe(local(2024, 0, 15, 18, 0));
  });

  it('낮 창(9~18): 08:59·18:00은 그대로', () => {
    const a = local(2024, 0, 15, 8, 59);
    const b = local(2024, 0, 15, 18, 0);
    expect(clampQuiet(a, 9, 18)).toBe(a);
    expect(clampQuiet(b, 9, 18)).toBe(b);
  });

  it('start === end: 조용시간 없음 — 모든 시각 그대로', () => {
    const at = local(2024, 0, 15, 23, 30);
    expect(clampQuiet(at, 8, 8)).toBe(at);
  });

  it('밤 창 커스텀(23~7): 22:30은 그대로, 23:30은 다음날 07:00', () => {
    expect(clampQuiet(local(2024, 0, 15, 22, 30), 23, 7)).toBe(local(2024, 0, 15, 22, 30));
    expect(clampQuiet(local(2024, 0, 15, 23, 30), 23, 7)).toBe(local(2024, 0, 16, 7, 0));
  });
});

describe('피크 옵트인 슬롯 (2026-08-30, 설정 기본 off)', () => {
  it('옵트인 없으면 피크 슬롯 없음 — 기존 3슬롯 그대로', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const plan = planNotifications(initialState(t0), t0);
    expect(plan.slots.some((sl) => sl.copyKey === 'peak')).toBe(false);
    expect(plan.slots.length).toBe(3);
  });

  it('옵트인: 피크 슬롯 at = peakStart(4.5h) 시각, id 4', () => {
    const t0 = local(2024, 0, 15, 6, 0); // 피크 10:30 — 조용시간 밖
    const plan = planNotifications(initialState(t0), t0, { peakOptIn: true });
    const peak = plan.slots.find((sl) => sl.copyKey === 'peak');
    expect(peak).toBeDefined();
    expect(peak!.id).toBe(4);
    expect(peak!.at).toBe(t0 + 4.5 * HOUR);
    expect(plan.slots.length).toBe(4);
  });

  it('★클램프가 밴드를 지나치면 스킵 — 19시 급여: 피크 23:30이 조용시간, 밀면 08:00 > 밴드 끝 01:00', () => {
    const t0 = local(2024, 0, 15, 19, 0);
    const plan = planNotifications(initialState(t0), t0, { peakOptIn: true });
    expect(plan.slots.some((sl) => sl.copyKey === 'peak')).toBe(false);
  });

  it('클램프가 밴드 안에 떨어지면 민 시각을 쓴다 — 23시 급여+조용 3~4시: 03:30→04:00 < 밴드 끝 05:00', () => {
    const t0 = local(2024, 0, 15, 23, 0);
    const plan = planNotifications(initialState(t0), t0, { peakOptIn: true, quietStartH: 3, quietEndH: 4 });
    const peak = plan.slots.find((sl) => sl.copyKey === 'peak');
    expect(peak).toBeDefined();
    expect(peak!.at).toBe(local(2024, 0, 16, 4, 0));
  });

  it('냉장에선 옵트인해도 피크 슬롯 없음 — 주 1회 케어 모드', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const s: SimState = { ...initialState(t0), location: 'fridge' };
    const plan = planNotifications(s, t0, { peakOptIn: true });
    expect(plan.slots.some((sl) => sl.copyKey === 'peak')).toBe(false);
  });
});

describe('부활 알림 위치 배율 (2026-08-30 수정 — room 고정식은 냉장 이동 시 거짓 알림)', () => {
  it('부활 중 냉장(0.08×): at = 8h/0.08 = 100h 뒤 — 게이트(wallFor)와 같은 회계', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const s: SimState = {
      ...initialState(t0),
      reviveProgress: 1,
      lastFedAt: t0,
      location: 'fridge',
      locAnchorAt: t0,
      effBaseMs: 0,
    };
    const plan = planNotifications(s, t0);
    expect(plan.slots.length).toBe(1);
    expect(plan.slots[0].copyKey).toBe('reviveSecond');
    expect(plan.slots[0].at).toBe(clampQuiet(t0 + 100 * HOUR));
  });
});


// -- 확장 옵트인 슬롯 3종 + 하루 상한 (2026-09-03, GDD 7절) --

/** capPerDay 검사용 최소 슬롯 — id는 검사에 쓰지 않으므로 고정값 */
function slotOf(copyKey: NotifySlot['copyKey'], at: number, weekly = false): NotifySlot {
  return { id: 99, at, copyKey, weekly };
}

describe('확장 옵트인 슬롯 — opts 없이는 존재하지 않는다', () => {
  it('opts 생략: 신규 슬롯 0 (기존 3슬롯 그대로)', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const plan = planNotifications(initialState(t0), t0);
    expect(plan.slots.length).toBe(3);
    expect(plan.slots.some((sl) => sl.copyKey === 'sour')).toBe(false);
    expect(plan.slots.some((sl) => sl.copyKey === 'stageUp')).toBe(false);
    expect(plan.slots.some((sl) => sl.copyKey === 'firstWeek')).toBe(false);
  });
});

describe('시큼 슬롯 (sourOptIn, id 5)', () => {
  it('실온 활발: at = 배고픔 14h + 22h 클램프', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const plan = planNotifications(initialState(t0), t0, { sourOptIn: true });
    const sour = plan.slots.find((sl) => sl.copyKey === 'sour');
    expect(sour).toBeDefined();
    expect(sour!.id).toBe(NOTIFY_SLOT_SOUR);
    expect(sour!.weekly).toBe(false);
    expect(sour!.at).toBe(clampQuiet(t0 + (14 + SOUR_AFTER_HUNGRY_H) * HOUR));
  });

  it('냉장·휴면 분기에선 없음 — 주 1회 케어/침묵 규칙 우선', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const fridge: SimState = {
      ...initialState(t0), location: 'fridge', maturity: 12, createdAt: t0 - 9 * DAY,
    };
    expect(planNotifications(fridge, t0, { sourOptIn: true }).slots.some((sl) => sl.copyKey === 'sour')).toBe(false);

    const dormant: SimState = {
      ...initialState(t0), lastFedAt: t0 - 130 * HOUR, locAnchorAt: t0 - 130 * HOUR,
    };
    expect(phaseAt(dormant, t0)).toBe('dormant');
    expect(planNotifications(dormant, t0, { sourOptIn: true }).slots.some((sl) => sl.copyKey === 'sour')).toBe(false);
  });
});

describe('단계 승급 예고 슬롯 (stageOptIn, id 6)', () => {
  it('사이클은 찼고 일수만 남았을 때: at = createdAt + 요구 일수(클램프)', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const createdAt = t0 - DAY;
    const s: SimState = { ...initialState(t0), createdAt, maturity: STAGES[1].cycles };
    expect(stageOf(s, t0)).toBe(0); // 일수(3일) 미달이라 아직 0단계
    const plan = planNotifications(s, t0, { stageOptIn: true });
    const up = plan.slots.find((sl) => sl.copyKey === 'stageUp');
    expect(up).toBeDefined();
    expect(up!.id).toBe(NOTIFY_SLOT_STAGE);
    expect(up!.stage).toBe(1);
    expect(up!.at).toBe(clampQuiet(createdAt + STAGES[1].days * DAY));
  });

  it('사이클 미달이면 없음 — 언제 채울지 모르는 시각을 예고하지 않는다', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const s: SimState = { ...initialState(t0), createdAt: t0 - DAY, maturity: STAGES[1].cycles - 1 };
    expect(planNotifications(s, t0, { stageOptIn: true }).slots.some((sl) => sl.copyKey === 'stageUp')).toBe(false);
  });

  it('최종 5단계면 없음 — 다음 단계가 없다', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const top = STAGES.length - 1;
    const s: SimState = {
      ...initialState(t0),
      createdAt: t0 - (STAGES[top].days + 1) * DAY,
      maturity: STAGES[top].cycles,
    };
    expect(stageOf(s, t0)).toBe(top);
    expect(planNotifications(s, t0, { stageOptIn: true }).slots.some((sl) => sl.copyKey === 'stageUp')).toBe(false);
  });

  it('승급 시각이 이미 지났으면 없음', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const s: SimState = {
      ...initialState(t0),
      createdAt: t0 - (STAGES[1].days + 1) * DAY,
      maturity: STAGES[1].cycles,
    };
    expect(planNotifications(s, t0, { stageOptIn: true }).slots.some((sl) => sl.copyKey === 'stageUp')).toBe(false);
  });
});

describe('첫 주 안내 슬롯 (firstWeekOptIn, id 7)', () => {
  it('0단계 갓 태어남: at = createdAt + 24h(클램프)', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const plan = planNotifications(initialState(t0), t0, { firstWeekOptIn: true });
    const fw = plan.slots.find((sl) => sl.copyKey === 'firstWeek');
    expect(fw).toBeDefined();
    expect(fw!.id).toBe(NOTIFY_SLOT_FIRSTWEEK);
    expect(fw!.at).toBe(clampQuiet(t0 + DAY));
  });

  it('1단계 이상이면 없음 — 첫 주 튜토리얼은 끝났다', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const s: SimState = { ...initialState(t0), createdAt: t0 - 4 * DAY, maturity: STAGES[1].cycles };
    expect(stageOf(s, t0)).toBeGreaterThanOrEqual(1);
    expect(planNotifications(s, t0, { firstWeekOptIn: true }).slots.some((sl) => sl.copyKey === 'firstWeek')).toBe(false);
  });

  it('24h가 이미 지났으면 없음', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const s: SimState = { ...initialState(t0), createdAt: t0 - 2 * DAY };
    expect(stageOf(s, t0)).toBe(0);
    expect(planNotifications(s, t0, { firstWeekOptIn: true }).slots.some((sl) => sl.copyKey === 'firstWeek')).toBe(false);
  });
});

describe('capPerDay — 하루 최대 2건 (GDD 7절)', () => {
  const d = local(2024, 0, 15, 9, 0);

  it('같은 날 4건이면 우선순위 상위 2건만 남는다', () => {
    const kept = capPerDay([
      slotOf('firstWeek', d),
      slotOf('feedTime', d + HOUR),
      slotOf('moldWarn', d + 2 * HOUR),
      slotOf('peak', d + 3 * HOUR),
    ]);
    expect(kept.map((sl) => sl.copyKey)).toEqual(['feedTime', 'moldWarn']); // 입력 순서 보존
  });

  it('weekly 슬롯은 집계에서 빠진다 — 같은 날 3건이어도 전부 남는다', () => {
    const kept = capPerDay([
      slotOf('fridgeWeek', d, true),
      slotOf('feedTime', d + HOUR),
      slotOf('moldWarn', d + 2 * HOUR),
    ]);
    expect(kept.length).toBe(3);
  });

  it('날짜가 다르면 서로 영향 없음', () => {
    const kept = capPerDay([
      slotOf('firstWeek', d),
      slotOf('peak', d + HOUR),
      slotOf('stageUp', d + DAY),
      slotOf('sour', d + DAY + HOUR),
    ]);
    expect(kept.length).toBe(4);
  });

  it('2건 이하는 그대로', () => {
    const input = [slotOf('feedTime', d), slotOf('dormant', d + HOUR)];
    expect(capPerDay(input)).toEqual(input);
  });
});

describe('planNotificationsAll — 확장 슬롯 병합 (2026-09-03)', () => {
  it('두 르방의 firstWeek가 병합되어 count 2, 하루 상한도 지킨다', () => {
    const t0 = local(2024, 0, 15, 12, 0);
    const a = initialState(t0);
    const b: SimState = { ...initialState(t0), createdAt: t0 - 2 * HOUR };
    const plan = planNotificationsAll([a, b], t0, { firstWeekOptIn: true });
    const fw = plan.slots.find((sl) => sl.copyKey === 'firstWeek');
    expect(fw).toBeDefined();
    expect(fw!.count).toBe(2);
    expect(fw!.at).toBe(clampQuiet(b.createdAt + DAY)); // 더 이른 쪽 채택

    const perDay = new Map<string, number>();
    for (const sl of plan.slots) {
      if (sl.weekly) continue;
      const dt = new Date(sl.at);
      const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    for (const cnt of perDay.values()) expect(cnt).toBeLessThanOrEqual(2);
  });
});

describe('planNotificationsAll — 슬롯 label = 알림 본문의 르방 이름 (2026-09-03)', () => {
  it('labels를 넘기면 단독 슬롯엔 그 르방 이름이 실리고, 이름이 null이면 label이 없다', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const a = initialState(t0);
    const named = planNotificationsAll([a], t0, undefined, ['하나']);
    expect(named.slots.length).toBeGreaterThan(0);
    expect(named.slots.every((s) => s.label === '하나')).toBe(true);
    const unnamed = planNotificationsAll([a], t0, undefined, [null]);
    expect(unnamed.slots.every((s) => s.label === undefined)).toBe(true);
    // labels 자체를 생략하면 종전과 동일(label 키 없음)
    expect(planNotificationsAll([a], t0).slots.every((s) => !('label' in s))).toBe(true);
  });

  it('병합(count ≥ 2) 슬롯은 한 마리를 지목할 수 없어 label을 떼고, 활성 르방 이름을 쓰지 않는다', () => {
    const t0 = local(2024, 0, 15, 6, 0);
    const a = initialState(t0);
    const b = initialState(t0);
    const plan = planNotificationsAll([a, b], t0, undefined, ['하나', '둘']);
    expect(plan.slots.length).toBeGreaterThan(0);
    for (const s of plan.slots) {
      expect(s.count).toBe(2);
      expect(s.label).toBeUndefined();
    }
  });
});
