// 재료 빌더 레지스트리 — 순서는 src/sim/ingredients.ts의 INGREDIENTS 배열과 일치시킨다
// (도감 카드 순서 = 이 순서). 빌더가 생기는 대로 여기 등록.
// breadlab(?family=ingredient)·export-breads가 이 레지스트리만 본다.
import type { IngredientBuilder } from './types';

export const INGREDIENT_BUILDERS: Record<string, IngredientBuilder> = {};

/** src/sim/ingredients.ts INGREDIENTS 순서. 미등록 id는 하네스 드롭다운에 "(미등록)"으로 뜬다. */
export const INGREDIENT_ORDER = [
  'olive',
  'choco',
  'strawberry',
  'chestnut',
  'walnut',
  'cranberry',
  'fig',
  'rosemary',
  'cheese',
  'cinnamon',
  'blueberry',
  'pumpkin',
] as const;
