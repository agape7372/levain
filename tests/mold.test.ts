// 곰팡이 사망(파생) — 정본: docs/GDD.md §3-4(곰팡이), constants.ts MOLD_*_AFTER_HUNGRY_H
import { describe, it, expect } from 'vitest';
import {
  initialState,
  applyAction,
  advance,
  phaseAt,
  moldStageAt,
  effSinceFeedMs,
  HOUR,
} from '../src/sim';
import type { SimState } from '../src/sim';

const t0 = 1_700_000_000_000;

describe('mold — 임계 사다리 (1:1:1 실온: spot 168h → spread 240h → dead 336h)', () => {
  it('167h는 dormant·moldStage none, 168h→spot, 240h→spread, 336h→phase moldy·moldStage dead', () => {
    const s = initialState(t0); // 급여 직후(lastFedAt=t0)와 동일한 형태

    expect(phaseAt(s, t0 + 167 * HOUR)).toBe('dormant');
    expect(moldStageAt(s, t0 + 167 * HOUR)).toBe('none');

    expect(moldStageAt(s, t0 + 168 * HOUR)).toBe('spot');
    expect(moldStageAt(s, t0 + 240 * HOUR)).toBe('spread');

    expect(phaseAt(s, t0 + 336 * HOUR)).toBe('moldy');
    expect(moldStageAt(s, t0 + 336 * HOUR)).toBe('dead');
  });

  it('1:5:5(hungry 30h)는 급여 후 352h에 moldy — 오프셋이 비율을 따라 이월된다. 351h는 아직 dormant', () => {
    const s: SimState = { ...initialState(t0), feedRatio: '1:5:5' };

    expect(phaseAt(s, t0 + 351 * HOUR)).toBe('dormant');
    expect(phaseAt(s, t0 + 352 * HOUR)).toBe('moldy');
  });

  it('fridge에서 wall 336h 경과(eff ≈26.9h) → moldStage 여전히 none', () => {
    // 냉장 해금(3단계) 조건을 만족시킨 상태에서 급여 후 냉장으로 이동 (curves.test.ts 패턴 재사용)
    const stage3: SimState = { ...initialState(t0), maturity: 12, createdAt: t0 - 9 * 24 * HOUR };
    const { state: fed } = applyAction(stage3, { type: 'feed', ratio: '1:1:1' }, t0);
    const { state: fridge } = applyAction(fed, { type: 'setLocation', to: 'fridge' }, t0);
    expect(fridge.location).toBe('fridge');

    const now = t0 + 336 * HOUR;
    expect(effSinceFeedMs(fridge, now) / HOUR).toBeCloseTo(336 * 0.08, 1); // ≈26.9h
    expect(moldStageAt(fridge, now)).toBe('none');
  });
});

describe('mold — moldy 확정 시 액션 전면 차단 (moldBlocked)', () => {
  function moldyFixture(): SimState {
    return {
      ...initialState(t0),
      lastFedAt: t0 - 337 * HOUR,
      locAnchorAt: t0 - 337 * HOUR,
    };
  }

  it('feed/setLocation/bake/makeFlake 전부 moldBlocked 이벤트 + 상태 불변', () => {
    const moldy = moldyFixture();
    expect(phaseAt(moldy, t0)).toBe('moldy');

    const rFeed = applyAction(moldy, { type: 'feed', ratio: '1:1:1' }, t0);
    expect(rFeed.events).toEqual([{ type: 'moldBlocked' }]);
    expect(rFeed.state).toBe(moldy);

    const rLoc = applyAction(moldy, { type: 'setLocation', to: 'fridge' }, t0);
    expect(rLoc.events).toEqual([{ type: 'moldBlocked' }]);
    expect(rLoc.state).toBe(moldy);

    const rBake = applyAction(moldy, { type: 'bake', recipeId: 'loaf' }, t0);
    expect(rBake.events).toEqual([{ type: 'moldBlocked' }]);
    expect(rBake.state).toBe(moldy);

    const rFlake = applyAction(moldy, { type: 'makeFlake' }, t0);
    expect(rFlake.events).toEqual([{ type: 'moldBlocked' }]);
    expect(rFlake.state).toBe(moldy);
  });
});

describe('mold — spot 단계 급여 시 부활 의식 우선', () => {
  it('spot 단계(170h)에서 feed → reviveStarted + eff 리셋(moldStage none)', () => {
    const s = initialState(t0);
    const feedAt = t0 + 170 * HOUR;
    expect(moldStageAt(s, feedAt)).toBe('spot');

    const r = applyAction(s, { type: 'feed', ratio: '1:1:1' }, feedAt);
    expect(r.events).toContainEqual({ type: 'reviveStarted' });
    expect(r.state.reviveProgress).toBe(1);
    expect(moldStageAt(r.state, feedAt)).toBe('none');
  });

  it('reviveProgress 1로 만든 뒤 336h+ 방치 → phaseAt moldy(곰팡이가 의식 오버라이드보다 우선) + feed는 moldBlocked', () => {
    const s = initialState(t0);
    const feedAt = t0 + 170 * HOUR;
    const revived1 = applyAction(s, { type: 'feed', ratio: '1:1:1' }, feedAt).state;
    expect(revived1.reviveProgress).toBe(1);

    const laterMoldy = feedAt + 336 * HOUR;
    expect(phaseAt(revived1, laterMoldy)).toBe('moldy');

    const rFeed = applyAction(revived1, { type: 'feed', ratio: '1:1:1' }, laterMoldy);
    expect(rFeed.events).toEqual([{ type: 'moldBlocked' }]);
    expect(rFeed.state).toBe(revived1);
  });
});

describe('mold — 시계 역행 재정박(reanchor)', () => {
  it('moldy 상태에서 6분 역행 → flake.madeAt 포함 전 타임스탬프가 delta만큼 이동, 여전히 moldy', () => {
    const moldyWithFlake: SimState = {
      ...initialState(t0),
      lastFedAt: t0 - 337 * HOUR,
      locAnchorAt: t0 - 337 * HOUR,
      lastSimulatedAt: t0,
      flake: { madeAt: t0 - 100 * HOUR, maturity: 5 },
    };
    expect(phaseAt(moldyWithFlake, t0)).toBe('moldy');

    const delta = 6 * 60_000; // 5분 허용 오차 초과
    const now = t0 - delta;
    const result = advance(moldyWithFlake, now);

    expect(result.flake!.madeAt).toBe(moldyWithFlake.flake!.madeAt - delta);
    expect(result.lastFedAt).toBe(moldyWithFlake.lastFedAt - delta);
    expect(result.locAnchorAt).toBe(moldyWithFlake.locAnchorAt - delta);
    expect(phaseAt(result, now)).toBe('moldy');
  });
});

describe('mold — 닫힌 함수 모델: 저장 시점 무관성', () => {
  it('1시간씩 336회 advance == 336시간 한 번에 advance — acidity·phase 일치', () => {
    let chunked = initialState(t0);
    let t = t0;
    for (let i = 0; i < 336; i++) {
      t += HOUR;
      chunked = advance(chunked, t);
    }
    const once = advance(initialState(t0), t0 + 336 * HOUR);

    expect(Math.abs(chunked.acidity - once.acidity)).toBeLessThan(1e-6);
    expect(phaseAt(chunked, t)).toBe(phaseAt(once, t0 + 336 * HOUR));
    expect(phaseAt(once, t0 + 336 * HOUR)).toBe('moldy');
  });
});
