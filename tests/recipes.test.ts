// 레시피 해금·게이트·판정·도감 — 정본: docs/GDD.md §6
import { describe, it, expect } from 'vitest';
import {
  initialState,
  activityAt,
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

  // mass 게이트 케이스 삭제 — 통 게이트로 이전, pantry 경제, GDD §6-2
  // (빵 원가는 이제 전역 보관 통에서 나간다 — sim은 mass로 굽기를 막지 않는다)
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
    expect(r1.state.mass).toBe(300); // pantry 경제 — bake는 mass를 건드리지 않는다 (GDD §6-2)
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

// ── 집 기준 굽기 (GDD §6-2 개정 2026-09-05) ─────────────────────────────────
// 통은 집 것이고 빵은 통에서 나간다. 그래서 무엇을 구울 수 있는지(houseStage)와
// 얼마나 잘 구워지는지(dough)는 화면에 떠 있는 르방이 아니라 집·통이 정한다.
// 두 필드 모두 store가 주입한다(gameStore.withHouseContext) — sim은 값으로만 받는다.

describe('recipes — 해금은 집 최고 단계 houseStage', () => {
  /** 갓 태어난 0단계 르방 — 자기 힘으로는 어떤 빵도 못 굽는다 */
  const young: SimState = { ...initialState(t0), mass: 300 };

  it('houseStage 4면 0단계 르방으로도 식빵(4단계 해금)을 굽는다', () => {
    const res = applyAction(young, { type: 'bake', recipeId: 'loaf', houseStage: 4 }, t0);
    expect(res.events[0].type).toBe('baked');
  });

  it('houseStage 4면 0단계 르방으로도 팬케이크(discard 2단계)를 만든다', () => {
    const res = applyAction(young, { type: 'bakeDiscard', recipeId: 'pancake', houseStage: 4 }, t0);
    expect(res.events).toEqual([{ type: 'bakedDiscard', recipeId: 'pancake' }]);
  });

  it('houseStage 부재 = 기존 동작 — 활성 르방 단계로 막힌다 (후방 호환)', () => {
    expect(applyAction(young, { type: 'bake', recipeId: 'loaf' }, t0).events)
      .toEqual([{ type: 'bakeBlocked', reason: 'stage' }]);
    expect(applyAction(young, { type: 'bakeDiscard', recipeId: 'pancake' }, t0).events)
      .toEqual([{ type: 'bakeBlocked', reason: 'stage' }]);
  });

  it('집이 낮아도 르방이 이미 그 단계면 통과한다 — 판정은 둘 중 max', () => {
    const stage3: SimState = { ...initialState(t0), maturity: 12, createdAt: t0 - 9 * DAY, mass: 300 };
    const res = applyAction(stage3, { type: 'bake', recipeId: 'flatbread', houseStage: 0 }, t0);
    expect(res.events[0].type).toBe('baked');
  });

  it('discard 쿨다운은 여전히 그 르방의 것 — houseStage가 열어 주지 않는다', () => {
    const cooled: SimState = { ...young, lastFedAt: t0 - HOUR, lastDiscardBakeAt: t0 };
    const res = applyAction(cooled, { type: 'bakeDiscard', recipeId: 'pancake', houseStage: 5 }, t0 + HOUR);
    expect(res.events).toEqual([{ type: 'bakeBlocked', reason: 'cooldown' }]);
  });
});

describe('recipes — 등급은 통에 든 반죽 dough', () => {
  /** 3단계지만 60h 방치돼 시큼한 르방 — 옛 규칙이면 이 상태가 등급을 정했다 */
  const sour: SimState = {
    ...initialState(t0 - 60 * HOUR),
    createdAt: t0 - 9 * DAY,
    maturity: 12,
    acidity: 95,
    mass: 300,
  };

  it('활성 르방이 시큼해도 통 반죽이 활발·순하면 best', () => {
    expect(applyAction(sour, { type: 'bake', recipeId: 'flatbread' }, t0).events[0])
      .toMatchObject({ type: 'baked', grade: 'flat' }); // 옛 규칙의 결과를 먼저 못 박는다
    const withDough = applyAction(
      sour,
      { type: 'bake', recipeId: 'flatbread', dough: { activity: 1, acidity: 20, flour: 'white' } },
      t0,
    );
    expect(withDough.events[0]).toMatchObject({ type: 'baked', grade: 'best' });
  });

  it('dough 부재면 판정이 기존 공식과 한 값도 다르지 않다', () => {
    const s: SimState = {
      ...initialState(t0 - 5 * HOUR), createdAt: t0 - 9 * DAY, maturity: 12, acidity: 12, mass: 300,
    };
    const expected = gradeOf(bakeScore(recipeById('flatbread')!, activityAt(s, t0), s.acidity, s.flour));
    expect(applyAction(s, { type: 'bake', recipeId: 'flatbread' }, t0).events[0])
      .toMatchObject({ type: 'baked', grade: expected });
  });

  it('dough의 밀가루가 flourAffinity 가산을 탄다 — 호밀 반죽이 호밀빵을 한 등급 올린다', () => {
    const bake = (flour: 'white' | 'rye') =>
      applyAction(
        { ...initialState(t0), mass: 300 },
        { type: 'bake', recipeId: 'rye', houseStage: 5, dough: { activity: 0.9, acidity: 30, flour } },
        t0,
      ).events[0];
    expect(bake('white')).toMatchObject({ grade: 'good' });
    expect(bake('rye')).toMatchObject({ grade: 'best' });
  });
});
