// 키우기 sim 감사 보정(2026-11-19) — A2-01·02·03·04·05·06, A3-08, 검증 missed(fridgeWeek 상한)
// 정본: docs/GDD.md §3·§7·§8
import { describe, it, expect } from 'vitest';
import {
  initialState,
  applyAction,
  advance,
  activityAt,
  deriveSnapshot,
  deriveBriefing,
  planNotifications,
  planNotificationsAll,
  capPerDay,
  boundariesH,
  RATIOS,
  HOUR,
  DAY,
} from '../src/sim';
import type { FeedRatio, Location, NotifySlot, SimState } from '../src/sim';

const t0 = 1_700_000_000_000;
const MIN = 60_000;

const fedAs = (ratio: FeedRatio, over: Partial<SimState> = {}): SimState => ({
  ...initialState(t0),
  feedRatio: ratio,
  mass: RATIOS[ratio].mass,
  ...over,
});

/** [from, to] 구간을 1분 간격으로 훑어 fill의 최대 한 걸음을 돌려준다 */
function maxFillStep(s: SimState, from: number, to: number): number {
  let prev = deriveSnapshot(s, from).fill;
  let worst = 0;
  for (let t = from + MIN; t <= to; t += MIN) {
    const f = deriveSnapshot(s, t).fill;
    worst = Math.max(worst, Math.abs(f - prev));
    prev = f;
  }
  return worst;
}

describe('A2-05 · 부피 연속성 — 날짜 경계를 지나도 밥 없이 높이가 튀지 않는다', () => {
  // 한 사이클(1:1:1, 14h) 안에서 경계가 유효 5h(피크 한가운데)에 오게 잡는다. 1분 걸음의 정상 기울기는 0.005 미만
  const LIMIT = 0.01;
  it('생후 24h 경계(가짜 부풀기 진입)', () => {
    const s = fedAs('1:1:1', { createdAt: t0 - 19 * HOUR, lastFedAt: t0, locAnchorAt: t0 });
    expect(maxFillStep(s, t0, t0 + 14 * HOUR)).toBeLessThan(LIMIT);
  });
  it('생후 48h 경계(가짜 부풀기 종료)', () => {
    const s = fedAs('1:1:1', { createdAt: t0 - 43 * HOUR, lastFedAt: t0, locAnchorAt: t0 });
    expect(maxFillStep(s, t0, t0 + 14 * HOUR)).toBeLessThan(LIMIT);
  });
  it('0→1단계 날짜 승급(72h)', () => {
    const s = fedAs('1:1:1', { createdAt: t0 - 67 * HOUR, maturity: 3, lastFedAt: t0, locAnchorAt: t0 });
    expect(maxFillStep(s, t0, t0 + 14 * HOUR)).toBeLessThan(LIMIT);
  });
  it('1→2단계 날짜 승급(120h)', () => {
    const s = fedAs('1:1:1', { createdAt: t0 - 115 * HOUR, maturity: 7, lastFedAt: t0, locAnchorAt: t0 });
    expect(maxFillStep(s, t0, t0 + 14 * HOUR)).toBeLessThan(LIMIT);
  });
});

describe('A2-01 · 부활 중 유효 피크 끝에서 fill이 안 튄다', () => {
  it('reviveProgress 1 — 피크 끝(6h)·하강 구간을 지나며 연속', () => {
    const s = fedAs('1:1:1', { createdAt: t0 - 10 * DAY, maturity: 12, reviveProgress: 1 });
    expect(maxFillStep(s, t0, t0 + 14 * HOUR)).toBeLessThan(0.01);
  });
  it('부활 중 peakFill이 activity와 같은 ×0.3로 눌린다', () => {
    const live = fedAs('1:1:1', { createdAt: t0 - 10 * DAY, maturity: 12 });
    const rev = { ...live, reviveProgress: 1 as const };
    const k = (deriveSnapshot(rev, t0).peakFill - 1) / (deriveSnapshot(live, t0).peakFill - 1);
    expect(k).toBeCloseTo(0.3, 6);
  });
});

describe('A2-03 · 브리핑 peaked = 피크 뒤 activity가 0.5 아래로 내려간 뒤', () => {
  for (const ratio of ['1:1:1', '1:2:2', '1:5:5'] as const) {
    it(`${ratio}: 8~40h 어느 복귀 시각에서도 peaked ⇔ activity ≤ 0.5`, () => {
      const s = fedAs(ratio);
      for (let t = t0 + 8 * HOUR; t <= t0 + 40 * HOUR; t += 6 * MIN) {
        const a = activityAt(s, t);
        const got = deriveBriefing(s, t0, t).includes('peaked');
        if (a > 0.5 + 1e-6) expect(got, `${ratio} +${(t - t0) / HOUR}h act ${a}`).toBe(false);
        if (a < 0.5 - 1e-6) expect(got, `${ratio} +${(t - t0) / HOUR}h act ${a}`).toBe(true);
      }
    });
  }
  it('1:2:2 +8.5h(저녁 피크에 돌아온 경우) → peaked 없음', () => {
    expect(deriveBriefing(fedAs('1:2:2'), t0, t0 + 8.5 * HOUR)).not.toContain('peaked');
  });
});

describe('A3-08 · 브리핑 hoochAppeared = hooch가 보일 만큼 찼을 때', () => {
  it('hooch 0.3 미만이면 없고, 0.3 이상이면 있다 (3비율)', () => {
    for (const ratio of ['1:1:1', '1:2:2', '1:5:5'] as const) {
      const s = fedAs(ratio);
      for (let t = t0 + 8 * HOUR; t <= t0 + 12 * DAY; t += HOUR) {
        const h = deriveSnapshot(s, t).hooch;
        const got = deriveBriefing(s, t0, t).includes('hoochAppeared');
        if (h < 0.29) expect(got, `${ratio} h=${h}`).toBe(false);
        if (h > 0.31) expect(got, `${ratio} h=${h}`).toBe(true);
      }
    }
  });
});

describe('A2-04 · advance 쪼개기 등가 (catch-up 상한 없음)', () => {
  const cases: Array<[string, SimState]> = [
    ['부활+냉장(restoreFlake 꼴)', fedAs('1:1:1', { reviveProgress: 1, location: 'fridge' as Location, maturity: 12, createdAt: t0 - 30 * DAY })],
    ['냉장 1:5:5', fedAs('1:5:5', { location: 'fridge' as Location, maturity: 30, createdAt: t0 - 60 * DAY })],
    ['창가 1:2:2 호밀', fedAs('1:2:2', { location: 'window' as Location, flour: 'rye' })],
    ['부활 실온', fedAs('1:1:1', { reviveProgress: 1 })],
  ];
  for (const [name, s] of cases) {
    it(`${name}: advance(advance(s,t1),t2) == advance(s,t2), 90일`, () => {
      const t2 = t0 + 90 * DAY;
      const once = advance(s, t2);
      for (const step of [5 * DAY, 13 * HOUR, 40 * DAY]) {
        let c = s;
        for (let t = t0 + step; t < t2; t += step) c = advance(c, t);
        c = advance(c, t2);
        expect(c.acidity).toBeCloseTo(once.acidity, 6);
      }
    });
  }
  it('부활+냉장은 60일에 산미가 포화하지 않는다(상한이 있으면 57.6에서 멈춘다)', () => {
    const s = fedAs('1:1:1', { reviveProgress: 1, location: 'fridge' as Location, maturity: 12, createdAt: t0 - 30 * DAY });
    expect(advance(s, t0 + 90 * DAY).acidity).toBeGreaterThan(80);
  });
});

describe('A2-06 · 휴면 경계에서 activity가 끊기지 않는다', () => {
  for (const ratio of ['1:1:1', '1:2:2', '1:5:5'] as const) {
    it(`${ratio}`, () => {
      const s = fedAs(ratio);
      const dormantAt = t0 + boundariesH(s).dormant * HOUR;
      expect(Math.abs(activityAt(s, dormantAt - 1) - activityAt(s, dormantAt + 1))).toBeLessThan(1e-3);
    });
  }
});

describe('A2-02 · 부활 의식 중에도 곰팡이 예고가 예약된다', () => {
  const revive = (over: Partial<SimState> = {}): SimState => ({ ...initialState(t0), reviveProgress: 1, ...over });
  it('1회차 직후: reviveSecond + moldWarn(spot 시각)', () => {
    const plan = planNotifications(revive(), t0);
    expect(plan.slots.map((s) => s.copyKey).sort()).toEqual(['moldWarn', 'reviveSecond']);
    const warn = plan.slots.find((s) => s.copyKey === 'moldWarn')!;
    expect(warn.at).toBeGreaterThan(t0 + 160 * HOUR);
  });
  it('2회차 시각이 지난 뒤 재계획해도 moldWarn은 남는다', () => {
    const plan = planNotifications(revive(), t0 + 9 * HOUR);
    expect(plan.slots.map((s) => s.copyKey)).toEqual(['moldWarn']);
  });
  it('플레이크 복원 직후(restoreFlake)도 같다', () => {
    const moldy: SimState = { ...initialState(t0 - 20 * DAY), flake: { madeAt: t0 - 30 * DAY, maturity: 10 } };
    const restored = applyAction(moldy, { type: 'restoreFlake' }, t0).state;
    expect(restored.reviveProgress).toBe(1);
    expect(planNotifications(restored, t0 + 9 * HOUR).slots.map((s) => s.copyKey)).toContain('moldWarn');
  });
  it('1회차 뒤 방치 — 복귀 브리핑엔 곰팡이 키만 남는다 (S-M1, GDD §8-1)', () => {
    const dormant: SimState = { ...initialState(t0 - 30 * DAY), maturity: 14, lastFedAt: t0 - 6 * DAY, locAnchorAt: t0 - 6 * DAY, lastSimulatedAt: t0 - 6 * DAY };
    const rev = applyAction(advance(dormant, t0), { type: 'feed', ratio: '1:1:1' }, t0).state;
    expect(rev.reviveProgress).toBe(1);
    expect(deriveBriefing(rev, t0, t0 + 8 * DAY)).toEqual(['moldSpotted']);
    expect(deriveBriefing(rev, t0, t0 + 11 * DAY)).toEqual(['moldSpotted', 'moldSpread']);
    expect(deriveBriefing(rev, t0, t0 + 15 * DAY)).toEqual(['moldSpotted', 'moldSpread', 'moldDied']);
    expect(deriveBriefing(rev, t0, t0 + 20 * HOUR)).toEqual([]); // 배고픔 · 시큼 · hooch · 휴면은 계속 뺀다
  });
});

describe('하루 최대 2건 — 냉장 슬롯도 집계에 든다 (GDD §7)', () => {
  const local = (h: number): number => new Date(2026, 0, 5, h, 0, 0, 0).getTime();
  it('capPerDay: fridgeWeek 포함 같은 날 3건 → 2건', () => {
    const d = local(9);
    const mk = (copyKey: NotifySlot['copyKey'], at: number, weekly = false): NotifySlot => ({ id: 99, at, copyKey, weekly });
    const kept = capPerDay([mk('fridgeWeek', d, true), mk('feedTime', d + HOUR), mk('moldWarn', d + 2 * HOUR)]);
    expect(kept.length).toBe(2);
  });
  it('planNotificationsAll: 실온(피크·밥) + 냉장(13:00 배고픔)이 같은 날이어도 2건 이하', () => {
    const now = local(7);
    const room = initialState(now);
    const fridgeAnchor = now + 6 * HOUR - 175 * HOUR;
    const fridge: SimState = {
      ...initialState(fridgeAnchor), createdAt: now - 30 * DAY, maturity: 12,
      location: 'fridge', lastFedAt: fridgeAnchor, locAnchorAt: fridgeAnchor, lastSimulatedAt: now,
    };
    const plan = planNotificationsAll([room, fridge], now, { peakOptIn: true });
    expect(plan.slots.some((s) => s.copyKey === 'fridgeWeek')).toBe(true);
    const perDay = new Map<string, number>();
    for (const s of plan.slots) {
      const dt = new Date(s.at);
      const k = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
    for (const n of perDay.values()) expect(n).toBeLessThanOrEqual(2);
  });
});
