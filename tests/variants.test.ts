// 재료함·변형 레시피 (§8-2·§16 수용 기준) — 무효 조합 소비 0 / 해금+차감 원자성 /
// 재굽기 재소비 없음 / 카탈로그 무결성
import { describe, it, expect } from 'vitest';
import {
  COMPATIBILITY, INGREDIENTS, RECIPES, isPlayable, playableRules, ruleByVariantId, variantIdOf,
  initialState, DAY,
} from '../src/sim';
import { createGameStore, newEnvelope } from '../src/store/gameStore';
import type { StorageAdapter } from '../src/platform/storage';
import type { GameStore } from '../src/store/gameStore';

const T0 = 1_700_000_000_000;

const memStorage = (): StorageAdapter => {
  let v: string | null = null;
  return {
    loadRaw: () => v,
    saveRaw: (json) => { v = json; return true; },
    mirror: () => undefined,
    loadMirror: async () => null,
  };
};

/** 성숙 르방(5단계·피크 근처) 스토어 — 굽기 게이트 통과용 */
function matureStore(): GameStore {
  const env = newEnvelope(T0);
  env.starters[0].sim = {
    ...initialState(T0),
    createdAt: T0 - 40 * DAY,
    maturity: 45,
    mass: 480,
  };
  return createGameStore({ clock: { now: () => T0 + 5 * 3_600_000 }, storage: memStorage() }, env);
}

describe('카탈로그 무결성 (§18 전사 — 재구성 검증)', () => {
  it('총 46행, blocked는 정확히 크래커×초코칩 1건', () => {
    expect(COMPATIBILITY.length).toBe(46);
    const blocked = COMPATIBILITY.filter((r) => r.status === 'blocked');
    expect(blocked).toEqual([
      expect.objectContaining({ baseRecipeId: 'cracker', ingredientId: 'choco', form: 'chip' }),
    ]);
  });

  it('집계 — 재구성 편차 문서화: verified 27 / conditional 13 / experimental 5', () => {
    const count = (s: string): number => COMPATIBILITY.filter((r) => r.status === s).length;
    // 기획서 §18 요약은 24/16/5/1 — §18-3 명시 목록 우선 원칙으로 27/13이 됐다
    // (implementation-notes 2026-08-24). 이 테스트는 회귀 감지용 체크섬.
    expect(count('verified')).toBe(27);
    expect(count('conditional')).toBe(13);
    expect(count('experimental')).toBe(5);
  });

  it('모든 행이 실존 레시피·재료·형태를 가리킨다', () => {
    const recipeIds = new Set(RECIPES.map((r) => r.id));
    for (const rule of COMPATIBILITY) {
      expect(recipeIds.has(rule.baseRecipeId)).toBe(true);
      const ing = INGREDIENTS.find((i) => i.id === rule.ingredientId);
      expect(ing).toBeDefined();
      expect(ing!.forms).toContain(rule.form);
    }
  });

  it('중복 행 없음 + v1 노출 = verified+conditional = 40', () => {
    const ids = COMPATIBILITY.map(variantIdOf);
    expect(new Set(ids).size).toBe(ids.length);
    expect(playableRules().length).toBe(40);
  });
});

describe('변형 굽기 — 원자 해금 (§8-2)', () => {
  const VID = variantIdOf({ baseRecipeId: 'focaccia', ingredientId: 'olive', form: 'flesh' });

  it('무효 조합(카탈로그 밖)은 소비 0·sim 무변경', () => {
    const store = matureStore();
    store.grantIngredient('choco', 3);
    const massBefore = store.getSnapshot().mass;
    const events = store.bakeVariant('cracker--choco-chip'); // blocked — v1 미노출
    expect(events).toEqual([{ type: 'bakeBlocked', reason: 'unknownRecipe' }]);
    expect(store.getInventory().choco).toBe(3);
    expect(store.getSnapshot().mass).toBe(massBefore);
    expect(store.bakeVariant('loaf--strawberry-jam')).toEqual([
      { type: 'bakeBlocked', reason: 'unknownRecipe' }, // 카탈로그에 아예 없는 조합
    ]);
  });

  it('재료 없으면 차단 — 소비 0·sim 무변경', () => {
    const store = matureStore();
    const massBefore = store.getSnapshot().mass;
    const events = store.bakeVariant(VID);
    expect(events).toEqual([{ type: 'bakeBlocked', reason: 'ingredient' }]);
    expect(store.getSnapshot().mass).toBe(massBefore);
    expect(store.getCollection()[VID]).toBeUndefined();
  });

  it('첫 굽기 = 재료 1 차감 + 도감 발견 + mass 소모가 한 번에', () => {
    const store = matureStore();
    store.grantIngredient('olive', 2);
    const massBefore = store.getSnapshot().mass;
    const events = store.bakeVariant(VID);
    const baked = events.find((e) => e.type === 'baked');
    expect(baked).toMatchObject({ recipeId: 'focaccia', variantId: VID });
    expect(store.getInventory().olive).toBe(1);           // 차감 1
    expect(store.getCollection()[VID]).toMatchObject({ count: 1 }); // 발견
    expect(store.getSnapshot().mass).toBe(massBefore - 50);         // 포카치아 비용
    expect(store.getCollection().focaccia).toBeUndefined(); // 베이스가 아니라 변형에 기록
  });

  it('재굽기는 재료 재소비 없음 (mass만 — §8-2)', () => {
    const store = matureStore();
    store.grantIngredient('olive', 1);
    store.bakeVariant(VID);
    expect(store.getInventory().olive).toBe(0);
    const events = store.bakeVariant(VID); // 재고 0이지만 발견된 변형은 굽힌다
    expect(events.some((e) => e.type === 'baked')).toBe(true);
    expect(store.getInventory().olive).toBe(0); // 음수 없음
    expect(store.getCollection()[VID].count).toBe(2);
  });

  it('sim 게이트(mass 부족)에 걸리면 재료도 안 나간다', () => {
    const env = newEnvelope(T0);
    env.starters[0].sim = {
      ...initialState(T0), createdAt: T0 - 40 * DAY, maturity: 45, mass: 80, // 포카치아 50+60 미달
    };
    const store = createGameStore({ clock: { now: () => T0 + 5 * 3_600_000 }, storage: memStorage() }, env);
    store.grantIngredient('olive', 1);
    const events = store.bakeVariant(VID);
    expect(events).toEqual([{ type: 'bakeBlocked', reason: 'mass' }]);
    expect(store.getInventory().olive).toBe(1); // 소비 0
    expect(store.getCollection()[VID]).toBeUndefined();
  });

  it('저장 왕복 — inventory·변형 도감이 산다', () => {
    const storage = memStorage();
    const env = newEnvelope(T0);
    env.starters[0].sim = { ...initialState(T0), createdAt: T0 - 40 * DAY, maturity: 45, mass: 480 };
    const store = createGameStore({ clock: { now: () => T0 + 5 * 3_600_000 }, storage }, env);
    store.grantIngredient('olive', 3);
    store.bakeVariant(VID);
    const raw = JSON.parse(storage.loadRaw()!);
    expect(raw.shared.inventory.olive).toBe(2);
    expect(raw.shared.collection[VID].count).toBe(1);
  });

  it('ruleByVariantId 왕복', () => {
    for (const rule of COMPATIBILITY) {
      expect(ruleByVariantId(variantIdOf(rule))).toBe(rule);
    }
    expect(isPlayable(ruleByVariantId('cracker--choco-chip')!)).toBe(false);
  });
});
