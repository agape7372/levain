// 레시피 해금·게이트·판정·도감 — 정본: docs/GDD.md §6
import { describe, it, expect } from 'vitest';
import {
  initialState,
  applyAction,
  recipeById,
  sourFit,
  bakeScore,
  gradeOf,
  betterGrade,
  HOUR,
  DAY,
} from '../src/sim';
import type { SimState } from '../src/sim';

const t0 = 1_700_000_000_000;

describe('recipes — 단계·mass 게이트 (GDD §6-2)', () => {
  it('단계 게이트: stage 2에서 flatbread(3단계 해금) bake → bakeBlocked stage', () => {
    const stage2: SimState = { ...initialState(t0), maturity: 7, createdAt: t0 - 5 * DAY, mass: 200 };
    const result = applyAction(stage2, { type: 'bake', recipeId: 'flatbread' }, t0);
    expect(result.events).toEqual([{ type: 'bakeBlocked', reason: 'stage' }]);
    expect(result.state).toBe(stage2);
  });

  it('mass 게이트: 비용+60g 미만이면 mass, 정확히 비용+60이면 성공(씨앗 60g 보존)', () => {
    const stage3: SimState = { ...initialState(t0), maturity: 12, createdAt: t0 - 9 * DAY };

    const tooLittle = applyAction({ ...stage3, mass: 89 }, { type: 'bake', recipeId: 'flatbread' }, t0);
    expect(tooLittle.events).toEqual([{ type: 'bakeBlocked', reason: 'mass' }]);

    const exact = applyAction({ ...stage3, mass: 90 }, { type: 'bake', recipeId: 'flatbread' }, t0);
    expect(exact.events[0].type).toBe('baked');
    expect(exact.state.mass).toBe(60); // 씨앗 60g은 소모 불가
  });
});

describe('recipes — 판정 점수·등급 (GDD §6-2)', () => {
  it('activity 1.0 + 산미 선호 중앙 → best / activity 0.2 + 산미 범위 밖 → flat', () => {
    const flat = recipeById('flatbread')!; // sourRange [0,60], 관대(LENIENT)
    expect(sourFit(flat, 30)).toBeCloseTo(1, 5); // 범위 중앙
    expect(gradeOf(bakeScore(flat, 1.0, 30))).toBe('best');
    expect(gradeOf(bakeScore(flat, 0.2, 100))).toBe('flat');
  });

  it('rye는 acidity 55에서 sourFit 1.0 (선호 범위 40~75 — 시큼의 구원)', () => {
    const rye = recipeById('rye')!;
    expect(sourFit(rye, 55)).toBe(1);
  });

  it('betterGrade: 더 낮은 등급으로 덮어쓰지 않는다', () => {
    expect(betterGrade(null, 'good')).toBe('good');
    expect(betterGrade('good', 'flat')).toBe('good');
    expect(betterGrade('good', 'best')).toBe('best');
    expect(betterGrade('best', 'good')).toBe('best');
  });

  it('baked 이벤트가 판정 등급을 실어 나른다 — 도감 집계(전역)는 store 층 (starters.test.ts)', () => {
    const stage3: SimState = { ...initialState(t0), maturity: 12, createdAt: t0 - 9 * DAY, mass: 300 };
    const r1 = applyAction(stage3, { type: 'bake', recipeId: 'flatbread' }, t0);
    expect(r1.events).toHaveLength(1);
    expect(r1.events[0].type).toBe('baked');
    expect(r1.state.mass).toBe(300 - recipeById('flatbread')!.cost);
  });
});

describe('recipes — discard 쿨다운·비율 해금 (GDD §6-1·§3-3)', () => {
  it('discard 쿨다운: lastDiscardBakeAt ≥ lastFedAt이면 cooldown, 재급여 후 재가능', () => {
    const stage2: SimState = {
      ...initialState(t0),
      maturity: 7,
      createdAt: t0 - 5 * DAY,
      lastFedAt: t0 - HOUR,
      lastDiscardBakeAt: t0,
    };
    const blocked = applyAction(stage2, { type: 'bakeDiscard', recipeId: 'pancake' }, t0 + HOUR);
    expect(blocked.events).toEqual([{ type: 'bakeBlocked', reason: 'cooldown' }]);

    const fed = applyAction(stage2, { type: 'feed', ratio: '1:1:1' }, t0 + 2 * HOUR).state;
    const ok = applyAction(fed, { type: 'bakeDiscard', recipeId: 'pancake' }, t0 + 3 * HOUR);
    expect(ok.events).toEqual([{ type: 'bakedDiscard', recipeId: 'pancake' }]);
    expect(ok.state.lastDiscardBakeAt).toBe(t0 + 3 * HOUR);
  });

  it('비율 해금: stage 2에서 1:2:2 급여 → ratioLocked, 상태 불변', () => {
    const stage2: SimState = { ...initialState(t0), maturity: 7, createdAt: t0 - 5 * DAY };
    const result = applyAction(stage2, { type: 'feed', ratio: '1:2:2' }, t0);
    expect(result.events).toEqual([{ type: 'ratioLocked', ratio: '1:2:2' }]);
    expect(result.state).toBe(stage2);
  });
});
