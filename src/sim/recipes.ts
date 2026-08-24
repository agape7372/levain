// 레시피 데이터·해금·판정 — 정본: docs/GDD.md §6
import type { BakeGrade, Flour, RecipeDef, SimState } from './types';
import { BAKE_ACTIVITY_W, BAKE_SOUR_W, FLOUR_AFFINITY_BONUS, GRADE_BEST, GRADE_GOOD, SEED_G } from './constants';
import { clamp, stageOf } from './derive';

/** 감점 기울기: 관대 0.015 / 보통 0.025 / 엄격 0.04 (선호 범위 밖 산미 1당) */
const LENIENT = 0.015;
const NORMAL = 0.025;
const STRICT = 0.04;

export const RECIPES: readonly RecipeDef[] = [
  // discard — 판정 없음, "마지막 급여 후 1회"
  { id: 'pancake', kind: 'discard', cost: 0, stage: 2, sourRange: null, slope: 0 },
  { id: 'cracker', kind: 'discard', cost: 0, stage: 2, sourRange: null, slope: 0 },
  { id: 'scone', kind: 'discard', cost: 0, stage: 3, sourRange: null, slope: 0 },
  // 빵 — mass 소모 + 판정
  { id: 'flatbread', kind: 'bread', cost: 30, stage: 3, sourRange: [0, 60], slope: LENIENT },
  { id: 'focaccia', kind: 'bread', cost: 50, stage: 3, sourRange: [0, 40], slope: LENIENT },
  { id: 'loaf', kind: 'bread', cost: 80, stage: 4, sourRange: [0, 30], slope: NORMAL },
  { id: 'baguette', kind: 'bread', cost: 60, stage: 4, sourRange: [10, 35], slope: STRICT },
  { id: 'campagne', kind: 'bread', cost: 100, stage: 4, sourRange: [15, 45], slope: STRICT },
  // 호밀빵 = 시큼의 구원 — 방치돼 시어진 르방이 오히려 적기 (실제 호밀 사워도우)
  { id: 'rye', kind: 'bread', cost: 80, stage: 5, sourRange: [40, 75], slope: NORMAL, flourAffinity: 'rye' },
  { id: 'wholewheat', kind: 'bread', cost: 120, stage: 5, sourRange: [20, 50], slope: STRICT, flourAffinity: 'wholewheat' },
];

export const recipeById = (id: string): RecipeDef | undefined => RECIPES.find((r) => r.id === id);

/** 산미 적합도 0~1 — 선호 범위 안 1.0, 벗어난 만큼 기울기 감점. flour 일치 시 가산 (§7-2) */
export function sourFit(recipe: RecipeDef, acidity: number, flour?: Flour): number {
  if (!recipe.sourRange) return 1;
  const [lo, hi] = recipe.sourRange;
  const dist = acidity < lo ? lo - acidity : acidity > hi ? acidity - hi : 0;
  const bonus = recipe.flourAffinity !== undefined && recipe.flourAffinity === flour ? FLOUR_AFFINITY_BONUS : 0;
  return clamp(1 - recipe.slope * dist + bonus, 0, 1);
}

/** 판정 점수 = 0.6×activity + 0.4×산미적합도 (GDD §6-2) */
export function bakeScore(recipe: RecipeDef, activity: number, acidity: number, flour?: Flour): number {
  return BAKE_ACTIVITY_W * activity + BAKE_SOUR_W * sourFit(recipe, acidity, flour);
}

export function gradeOf(score: number): BakeGrade {
  if (score >= GRADE_BEST) return 'best';
  if (score >= GRADE_GOOD) return 'good';
  return 'flat'; // "조금 납작해요. 그래도 맛있어요" — 실패 없음
}

const GRADE_ORDER: Record<BakeGrade, number> = { flat: 0, good: 1, best: 2 };
export const betterGrade = (a: BakeGrade | null, b: BakeGrade): BakeGrade =>
  a !== null && GRADE_ORDER[a] >= GRADE_ORDER[b] ? a : b;

/** 굽기 게이트: 단계 + mass ≥ 비용 + 씨앗 60g (씨앗 소모 불가 — 영구 사망 없음의 물리 보장) */
export function canBakeBread(state: SimState, recipe: RecipeDef, now: number):
  'ok' | 'stage' | 'mass' {
  if (stageOf(state, now) < recipe.stage) return 'stage';
  if (state.mass < recipe.cost + SEED_G) return 'mass';
  return 'ok';
}

/** discard 게이트: 단계 + 마지막 급여 후 1회 쿨다운 */
export function canBakeDiscard(state: SimState, recipe: RecipeDef, now: number):
  'ok' | 'stage' | 'cooldown' {
  if (stageOf(state, now) < recipe.stage) return 'stage';
  if (state.lastDiscardBakeAt !== null && state.lastDiscardBakeAt >= state.lastFedAt) return 'cooldown';
  return 'ok';
}
