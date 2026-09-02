// sim 공개 API — 이 파일 밖의 심볼을 직접 import하지 말 것
export * from './types';
export { advance, reanchor } from './advance';
export { applyAction, initialState } from './actions';
export { deriveSnapshot, effSinceFeedMs, activityAt, phaseAt, stageOf, boundariesH, moldStageAt, clamp, smoothstep, rateMult } from './derive';
export { planNotifications, planNotificationsAll, clampQuiet, capPerDay } from './notifyPlan';
export { deriveBriefing } from './briefing';
export { adCountsToday, adRemaining, canWatchAd, recordAdGrant, sameLocalDay } from './ads';
export type { AdGrant, AdSlotId } from './ads';
export * from './ingredients';
export {
  RECIPES, recipeById, sourFit, bakeScore, gradeOf, betterGrade, canBakeBread, canBakeDiscard,
} from './recipes';
export {
  RATIOS, TEMP_MULT, STAGES, FRIDGE_STAGE, FLOAT_OK_ACTIVITY, SEED_G, HOUR, DAY,
  FLAKE_STAGE, FLAKE_COST_G, LABEL_STAGE, REWIND_TOLERANCE_MS, STARTER_SLOTS_FREE,
  FLOUR_TIME_MULT, FLOUR_STAGE, FLOUR_AFFINITY_BONUS,
  INGREDIENT_SOFT_CAP, FLOUR_PER_INGREDIENT, INGREDIENT_FLOUR_COST,
  MISSION_FEED_STEP, MISSION_BAKE_STEP, MISSION_REWARD_FLOUR,
  STAGE_REWARD_FLOUR, RECIPE_REWARD_FLOUR,
  SPLIT_MIN_G, PANTRY_MAX,
  AD_SLOT_DAILY, AD_TOTAL_DAILY, AD_SESSION_CAP,
  NOTIFY_MAX_PER_DAY,
} from './constants';
