// 선반 정렬 — 종류별 묶음 (GDD §6-3, 2026-09-05). 순수 함수라 DOM 없이 순서를 직접 본다.
import { describe, expect, it } from 'vitest';
import { shelfGroups } from '../src/ui/shelfOrder';
import { RECIPES, playableRules, rulesForBase, variantIdOf } from '../src/sim';
import type { CollectionEntry } from '../src/sim';

const entry = (firstAt: number): CollectionEntry => ({ bestGrade: 'good', count: 1, firstAt });

/** 굽은 순서를 일부러 뒤섞어 넣는다 — 선반이 firstAt에 흔들리지 않아야 한다 */
function collectionOf(keys: string[]): Record<string, CollectionEntry> {
  const out: Record<string, CollectionEntry> = {};
  keys.forEach((k, i) => { out[k] = entry(1_000 - i); }); // 뒤로 갈수록 옛날
  return out;
}

describe('shelfGroups — 종류별 묶음', () => {
  it('묶음은 레시피 카탈로그 순서다 (구운 순서와 무관)', () => {
    const late = RECIPES[RECIPES.length - 1].id; // 가장 나중 해금
    const early = RECIPES[0].id;
    // 나중 빵을 **먼저** 구웠어도 카탈로그 순서로 놓인다
    const groups = shelfGroups(collectionOf([late, early]));
    expect(groups.map((g) => g.baseId)).toEqual([early, late]);
  });

  it('묶음 안은 기본 빵이 먼저, 그다음 변형은 시트 칩과 같은 순서', () => {
    const base = rulesForBase('campagne');
    expect(base.length).toBeGreaterThan(2);
    const v0 = variantIdOf(base[0]);
    const v2 = variantIdOf(base[2]);
    // 일부러 뒤집어 넣는다: 변형 v2 → v0 → 기본
    const groups = shelfGroups(collectionOf([v2, v0, 'campagne']));
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.key)).toEqual(['campagne', v0, v2]);
    expect(groups[0].items[0].isBase).toBe(true);
    expect(groups[0].items[1].isBase).toBe(false);
  });

  it('변형은 자기 베이스 묶음에 들어간다', () => {
    const rule = playableRules().find((r) => r.baseRecipeId === 'focaccia');
    expect(rule).toBeDefined();
    const key = variantIdOf(rule!);
    const groups = shelfGroups(collectionOf([key]));
    expect(groups).toEqual([{ baseId: 'focaccia', items: [{ key, baseId: 'focaccia', isBase: false }] }]);
  });

  it('카탈로그에 없는 키는 버린다 — 옛 저장본의 잔존 변형', () => {
    const groups = shelfGroups(collectionOf(['campagne', 'zzz--gone-form', 'nope']));
    expect(groups.map((g) => g.baseId)).toEqual(['campagne']);
    expect(groups[0].items).toHaveLength(1);
  });

  it('빈 도감은 빈 배열', () => {
    expect(shelfGroups({})).toEqual([]);
  });

  it('도감 전량이면 묶음 수 = 레시피 수, 항목 합 = 도감 크기', () => {
    const keys = [...RECIPES.map((r) => r.id), ...playableRules().map((r) => variantIdOf(r))];
    const groups = shelfGroups(collectionOf(keys));
    expect(groups).toHaveLength(RECIPES.length);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(keys.length);
    // 묶음마다 기본 빵이 맨 앞
    for (const g of groups) expect(g.items[0].isBase).toBe(true);
  });
});
