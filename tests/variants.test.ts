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
import { copy } from '../src/ui/copy';

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
  it('총 89행, blocked는 정확히 크래커×초코칩 1건', () => {
    expect(COMPATIBILITY.length).toBe(89);
    const blocked = COMPATIBILITY.filter((r) => r.status === 'blocked');
    expect(blocked).toEqual([
      expect.objectContaining({ baseRecipeId: 'cracker', ingredientId: 'choco', form: 'chip' }),
    ]);
  });

  it('집계 체크섬: verified 45 / conditional 27 / experimental 16 / blocked 1', () => {
    const count = (s: string): number => COMPATIBILITY.filter((r) => r.status === s).length;
    // §18 재구성 46행(27/13/5/1) + 확장 8종 조사 43행(18/14/11/0) = 89행.
    // 회귀 감지용 체크섬 — 행을 늘리면 여기도 같이 올린다.
    expect(count('verified')).toBe(45);
    expect(count('conditional')).toBe(27);
    expect(count('experimental')).toBe(16);
    expect(count('blocked')).toBe(1);
  });

  it('URL sourceRef를 단 행은 verified/conditional뿐이고, 그 역도 성립한다(확장 8종)', () => {
    // 조사 계약: **연 페이지의 URL이 없으면 verified/conditional 금지**. 개수를 채우려고
    // 등급을 올리는 걸 구조적으로 막는다. §18 재구성분은 절 번호 참조라 이 검사에서 제외
    const expanded = COMPATIBILITY.filter((r) => !r.sourceRef.startsWith('§'));
    expect(expanded.length).toBe(43);
    for (const r of expanded) {
      const hasUrl = r.sourceRef.startsWith('https://');
      expect(hasUrl, `${variantIdOf(r)} — ${r.status} / ${r.sourceRef}`)
        .toBe(r.status === 'verified' || r.status === 'conditional');
    }
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

  it('중복 행 없음', () => {
    const ids = COMPATIBILITY.map(variantIdOf);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 재료가 최소 1개 놀 수 있는 조합을 갖는다 (도감에 죽은 재료 0)', () => {
    // 재료를 늘리면서 호환 행을 안 붙이면 "가졌는데 아무 데도 못 쓰는 재료"가 생긴다.
    // 재료는 순수 컬렉팅 축이지만, 수집한 게 아무것도 안 여는 건 다른 문제다
    const playableIngredients = new Set(playableRules().map((r) => r.ingredientId));
    for (const ing of INGREDIENTS) {
      expect(playableIngredients.has(ing.id), ing.id).toBe(true);
    }
  });

  it('표시명이 전 조합에서 유일하다 — 형태가 다른데 같은 이름이면 고를 수가 없다', () => {
    // formNames는 재료 무관 플랫 맵이고 variantName은 한글 라벨로 분기한다 —
    // 형태 id를 늘릴 때 조용히 겹칠 수 있는 구조라 전수로 잡는다 (예: 호두 조각 vs 호두 가루)
    const seen = new Map<string, string>();
    for (const rule of COMPATIBILITY) {
      const ingName = copy.recipes.ingredientNames[rule.ingredientId];
      const formName = copy.recipes.formNames[rule.form];
      expect(ingName, `ingredientNames.${rule.ingredientId}`).toBeTruthy();
      expect(formName, `formNames.${rule.form}`).toBeTruthy();
      const baseName = copy.recipes.names[rule.baseRecipeId];
      const label = copy.recipes.variantName(ingName, formName, baseName);
      const prev = seen.get(label);
      expect(prev, `표시명 충돌: "${label}" ← ${prev} / ${variantIdOf(rule)}`).toBeUndefined();
      seen.set(label, variantIdOf(rule));
    }
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

  it('discard 베이스 변형(초코칩 팬케이크) — bakeDiscard 경로로 원자 해금', () => {
    const store = matureStore();
    store.grantIngredient('choco', 1);
    const vid = 'pancake--choco-chip';
    const events = store.bakeVariant(vid);
    expect(events.some((e) => e.type === 'bakedDiscard')).toBe(true);
    expect(store.getInventory().choco).toBe(0);
    expect(store.getCollection()[vid]).toMatchObject({ count: 1, bestGrade: null }); // 판정 없음
    // 쿨다운(급여당 1회) — 재시도는 차단, 재료도 그대로
    store.grantIngredient('choco', 1);
    const again = store.bakeVariant(vid);
    expect(again).toEqual([{ type: 'bakeBlocked', reason: 'cooldown' }]);
    expect(store.getInventory().choco).toBe(1);
  });

  it('ruleByVariantId 왕복', () => {
    for (const rule of COMPATIBILITY) {
      expect(ruleByVariantId(variantIdOf(rule))).toBe(rule);
    }
    expect(isPlayable(ruleByVariantId('cracker--choco-chip')!)).toBe(false);
  });
});
