// 밀가루 축 (§7-2) — 발효 가속·마이그레이션 기본값·친화 보정·알림 정합
import { describe, it, expect } from 'vitest';
import {
  initialState, applyAction, deriveSnapshot, effSinceFeedMs,
  planNotifications, sourFit, recipeById, HOUR,
  FLOUR_TIME_MULT, FLOUR_AFFINITY_BONUS,
} from '../src/sim';
import { migrate, validateAndClamp } from '../src/store/persistence';
import type { SimState } from '../src/sim';

const T0 = 1_700_000_000_000;

function fed(flour: SimState['flour']): SimState {
  const s = initialState(T0);
  return { ...s, flour };
}

describe('flour 발효 가속', () => {
  it('유효시간 = 경과 × 온도 × 밀가루 배율', () => {
    const dt = 10 * HOUR;
    expect(effSinceFeedMs(fed('white'), T0 + dt)).toBe(dt);
    expect(effSinceFeedMs(fed('rye'), T0 + dt)).toBeCloseTo(dt * FLOUR_TIME_MULT.rye);
    expect(effSinceFeedMs(fed('wholewheat'), T0 + dt)).toBeCloseTo(dt * FLOUR_TIME_MULT.wholewheat);
  });

  it('위치 접기(setLocation)도 flour 배율을 접는다 — 회계 연속성', () => {
    const s = fed('rye');
    const t1 = T0 + 4 * HOUR;
    const moved = applyAction(s, { type: 'setLocation', to: 'window' }, t1).state;
    // 접힌 유효시간 = 4h × 1.25 (rye·room)
    expect(moved.effBaseMs).toBeCloseTo(4 * HOUR * FLOUR_TIME_MULT.rye);
    // 이후 경과는 창가 × rye
    const t2 = t1 + 2 * HOUR;
    expect(effSinceFeedMs(moved, t2)).toBeCloseTo(4 * HOUR * 1.25 + 2 * HOUR * 1.3 * 1.25);
  });

  it('flour는 급여에서만 바뀌고, 생략하면 유지된다', () => {
    let s = fed('white');
    s = applyAction(s, { type: 'feed', ratio: '1:1:1', flour: 'rye' }, T0 + 10 * HOUR).state;
    expect(s.flour).toBe('rye');
    s = applyAction(s, { type: 'feed', ratio: '1:1:1' }, T0 + 20 * HOUR).state;
    expect(s.flour).toBe('rye'); // 생략 = 유지
  });

  it('nextFeedAt 예측이 가속을 반영한다 (rye가 white보다 이르다)', () => {
    const white = deriveSnapshot(fed('white'), T0);
    const rye = deriveSnapshot(fed('rye'), T0);
    expect(rye.nextFeedAt).toBeLessThan(white.nextFeedAt);
  });

  it('알림 밥 시각도 같은 배율 (게이트-알림 드리프트 0)', () => {
    const white = planNotifications(fed('white'), T0).slots.find((s) => s.copyKey === 'feedTime');
    const rye = planNotifications(fed('rye'), T0).slots.find((s) => s.copyKey === 'feedTime');
    // 조용시간 클램프가 같은 아침으로 접을 수 있어 ≤ 로 본다 — 최소한 늦지는 않아야 한다
    expect(rye!.at).toBeLessThanOrEqual(white!.at);
  });
});

describe('flour 마이그레이션·검증', () => {
  it('v2 저장본에 flour 키가 없으면 white (label 패턴)', () => {
    const env = {
      schemaVersion: 2, savedAt: T0,
      starters: [{ id: 's1', name: null, ordinal: 1, sim: { ...initialState(T0) } }],
      activeStarterId: 's1', nextStarterOrdinal: 2,
      shared: { collection: {} },
      settings: { muted: false, haptics: true, notifyEnabled: true },
      flags: { onboarded: true, pendingBake: null },
    };
    delete (env.starters[0].sim as Record<string, unknown>).flour;
    const out = validateAndClamp(env);
    expect(out!.starters[0].sim.flour).toBe('white');
  });

  it('v1 저장본 마이그레이션 후에도 flour=white로 산다', () => {
    const sim: Record<string, unknown> = { ...initialState(T0) };
    delete sim.flour;
    const v1 = {
      schemaVersion: 1, savedAt: T0, sim: { ...sim, label: '우리집' },
      settings: { muted: false, haptics: true, notifyEnabled: true },
      flags: { onboarded: true, pendingBake: null },
    };
    const out = validateAndClamp(migrate(v1)!);
    expect(out!.starters[0].sim.flour).toBe('white');
  });

  it('불량 flour 값은 white로 접는다', () => {
    const env = {
      schemaVersion: 2, savedAt: T0,
      starters: [{ id: 's1', name: null, ordinal: 1, sim: { ...initialState(T0), flour: 'spelt' } }],
      activeStarterId: 's1', nextStarterOrdinal: 2,
      shared: { collection: {} },
      settings: { muted: false, haptics: true, notifyEnabled: true },
      flags: { onboarded: true, pendingBake: null },
    };
    expect(validateAndClamp(env)!.starters[0].sim.flour).toBe('white');
  });
});

describe('flour 친화 보정 (§7-2)', () => {
  it('호밀빵 × rye 가루 = sourFit 가산', () => {
    const rye = recipeById('rye')!;
    // 산미 30 — 선호 [40,75] 밖 dist 10, slope 0.025 → 기본 0.75
    expect(sourFit(rye, 30)).toBeCloseTo(0.75);
    expect(sourFit(rye, 30, 'rye')).toBeCloseTo(0.75 + FLOUR_AFFINITY_BONUS);
    expect(sourFit(rye, 30, 'white')).toBeCloseTo(0.75);
  });

  it('친화 없는 레시피는 flour와 무관', () => {
    const loaf = recipeById('loaf')!;
    expect(sourFit(loaf, 20, 'rye')).toBe(sourFit(loaf, 20));
  });

  it('가산 후에도 1.0 클램프', () => {
    const ww = recipeById('wholewheat')!;
    expect(sourFit(ww, 30, 'wholewheat')).toBe(1); // 범위 안 1.0 + 0.15 → clamp 1
  });
});
