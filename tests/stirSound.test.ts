// M4 젓기 소리 일정 — 찰박 간격 · 끈적 틱 비율 · 미리 예약 · 몸통 대역 (순수 함수)
import { describe, it, expect } from 'vitest';
import { planStirEvents, stirBodyHz, stirSlapGap, STIR_LOOKAHEAD_S, type StirPlan } from '../src/audio/sounds';

/** 결정적 난수 */
const lcg = (seed = 7) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

/** dur초 동안 50ms마다 update를 부른 것처럼 일정을 돌린다 */
function run(speed: number, dur = 30, rnd = lcg()) {
  let plan: StirPlan = { nextAt: 0, tickIn: 2 };
  const ev: { at: number; tick: boolean }[] = [];
  for (let now = 1; now < 1 + dur; now += 0.05) {
    const r = planStirEvents(plan, now, speed, rnd);
    for (const e of r.events) {
      expect(e.at).toBeGreaterThanOrEqual(now - 1e-9); // 지난 시각은 예약하지 않는다
      expect(e.at).toBeLessThan(now + STIR_LOOKAHEAD_S + 1e-9);
    }
    ev.push(...r.events);
    plan = r.plan;
  }
  return ev;
}

describe('젓기 찰박 일정', () => {
  it('간격 = clamp(0.9 − 0.6·speed, 0.25, 0.9) ±25%', () => {
    expect(stirSlapGap(0, 0.5)).toBeCloseTo(0.9);
    expect(stirSlapGap(1, 0.5)).toBeCloseTo(0.3);
    expect(stirSlapGap(2, 0.5)).toBeCloseTo(0.25);
    expect(stirSlapGap(0.5, 0)).toBeCloseTo(0.6 * 0.75);
    expect(stirSlapGap(0.5, 1)).toBeCloseTo(0.6 * 1.25);
  });

  it.each([0.2, 0.5, 1])('speed %s — 사건 사이 간격이 범위 안 · 평균이 기준 근처', (speed) => {
    const ev = run(speed);
    const base = Math.min(0.9, Math.max(0.25, 0.9 - 0.6 * speed));
    const gaps = ev.slice(1).map((e, i) => e.at - ev[i].at);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(base * 0.75 - 1e-9);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(base * 1.25 + 1e-9);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(Math.abs(mean / base - 1)).toBeLessThan(0.08);
  });

  it('끈적 틱은 찰박 2~3번에 한 번', () => {
    const ev = run(0.6);
    const idx = ev.flatMap((e, i) => (e.tick ? [i] : []));
    const d = idx.slice(1).map((v, i) => v - idx[i]);
    expect(d.length).toBeGreaterThan(5);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...d)).toBeLessThanOrEqual(3);
  });

  it('멈췄다가 다시 저으면 밀린 사건을 한꺼번에 내지 않는다', () => {
    const p = planStirEvents({ nextAt: 1, tickIn: 2 }, 10, 0.5, lcg());
    expect(p.events.length).toBe(1);
    expect(p.events[0].at).toBe(10);
  });

  it('거의 안 움직이면 찰박이 없다', () => {
    expect(run(0.02, 3)).toHaveLength(0);
  });
});

describe('젓기 몸통 대역', () => {
  it('180~500Hz · 되직할수록 낮다', () => {
    for (const s of [0, 0.5, 1]) {
      expect(stirBodyHz(0, s)).toBeGreaterThan(stirBodyHz(1, s));
      for (const th of [0, 0.5, 1]) {
        expect(stirBodyHz(th, s)).toBeGreaterThanOrEqual(180);
        expect(stirBodyHz(th, s)).toBeLessThanOrEqual(500);
      }
    }
  });
});
