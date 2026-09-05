// 레시피 데이터·해금·판정 — 정본: docs/GDD.md §6
import type { BakeGrade, Flour, RecipeDef, SimState } from './types';
import { BAKE_ACTIVITY_W, BAKE_SOUR_W, FLOUR_AFFINITY_BONUS, GRADE_BEST, GRADE_GOOD } from './constants';
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
  // 빵 — 보관 통 그램(cost) 소모 + 판정. cost는 통에서 나간다(르방이의 mass가 아니다)
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

/**
 * 굽기 게이트: 단계만. 그램 원가는 보관 통(집 소유·전역)에서 나가므로 sim이 모른다 —
 * 통 잔량 게이트는 store(gameStore.doDispatch) 소관이다. 이 분리 덕에 굽기는 르방이의
 * mass를 아예 건드리지 않고, "어떤 액션도 르방이를 죽일 수 없다"가 더 단단해진다 (GDD §6-2).
 *
 * houseStage (GDD §6-2 개정 2026-09-05) = 집 최고 성장 단계(economy.stageMax). 통이 집 것이면
 * 해금도 집 것이다 — 어린 르방으로 넘겼다고 성숙 르방이 채운 통으로 굽던 빵이 잠기지 않는다.
 * sim은 집을 모르므로(순수) 숫자로만 받는다. 기본값 0 = 활성 르방 단독 판정(기존 동작).
 */
export function canBakeBread(state: SimState, recipe: RecipeDef, now: number, houseStage = 0):
  'ok' | 'stage' {
  if (Math.max(stageOf(state, now), houseStage) < recipe.stage) return 'stage';
  return 'ok';
}

/** discard 게이트: 단계(집 기준 — canBakeBread 주석) + 마지막 급여 후 1회 쿨다운 */
export function canBakeDiscard(state: SimState, recipe: RecipeDef, now: number, houseStage = 0):
  'ok' | 'stage' | 'cooldown' {
  if (Math.max(stageOf(state, now), houseStage) < recipe.stage) return 'stage';
  if (state.lastDiscardBakeAt !== null && state.lastDiscardBakeAt >= state.lastFedAt) return 'cooldown';
  return 'ok';
}
