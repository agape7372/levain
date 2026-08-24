// 무료 경제 (확장기획 §9 — Phase 7). 순수 함수 전용: 시간·DOM·저장 접근 0.
//
// 설계 한 줄: **잔액을 저장하지 않는다.** 가루 잔액 = 누적 획득 − 누적 사용이고,
// 누적 획득은 전부 이미 저장돼 있는 카운터·도감의 함수다(CLAUDE.md 규칙 3 닫힌 함수 모델).
// 부작용 셋:
//   1. 이중 지급이 구조적으로 불가능 — "지급 완료" 플래그가 아예 없다.
//   2. 타임스탬프가 없어 시계 조작 면역 + 재정박 목록(규칙 4)에 들어가지 않는다.
//   3. 상수를 나중에 조정하면 잔액이 소급 재계산된다 — 발행 후 하향 조정은 잔액을
//      깎을 수 있으니 상수는 올리는 방향으로만 만질 것.
import { RECIPES } from '../sim';
import type { CollectionEntry } from '../sim';
import {
  FLOUR_PER_INGREDIENT, INGREDIENT_FLOUR_COST, MISSION_BAKE_STEP, MISSION_FEED_STEP,
  MISSION_REWARD_FLOUR, RECIPE_REWARD_FLOUR, STAGE_REWARD_FLOUR,
} from '../sim/constants';

/** 집(계정) 경제 상태 — 전부 단조 증가 카운터. shared 하위 무버전 추가 키 */
export interface EconomyState {
  /** 누적 급여 횟수 (fed 이벤트) — 급여 미션의 축 */
  feeds: number;
  /** 누적 굽기 횟수 (baked·bakedDiscard) — 굽기 미션의 축 */
  bakes: number;
  /** 집 최고 도달 성장 단계 — 르방이 죽거나 삭제돼도 내려가지 않는다 */
  stageMax: number;
  /** 가루로 바꾼 재료 누계 (자발 교환 + 소프트캡 초과분 자동 전환) */
  exchanged: number;
  /** 사용한 가루 누계 */
  spent: number;
  /** 첫 재료 선물 수령 여부 (온보딩 §9 — 기존 저장본도 키 부재 = 미수령이라 받는다) */
  gifted: boolean;
}

export const emptyEconomy = (): EconomyState => ({
  feeds: 0, bakes: 0, stageMax: 0, exchanged: 0, spent: 0, gifted: false,
});

const BASE_RECIPE_IDS: ReadonlySet<string> = new Set(RECIPES.map((r) => r.id));

/** 도감에서 파생 — 변형 키(`base--ing-form`)는 세지 않는다 (변형은 재료를 이미 썼다) */
export const basesCompleted = (collection: Record<string, CollectionEntry>): number =>
  Object.keys(collection).filter((k) => BASE_RECIPE_IDS.has(k)).length;

/** 누적 미션 달성 횟수 — 리셋 없음, 무한 반복 (§9 "실패해도 리셋 없는 누적") */
export const milestonesOf = (count: number, step: number): number => Math.floor(count / step);

/** 누적 획득 가루 — 전부 파생. 이 함수가 경제의 정의다 */
export function earnedFlour(
  eco: EconomyState,
  collection: Record<string, CollectionEntry>,
): number {
  return (
    milestonesOf(eco.feeds, MISSION_FEED_STEP) * MISSION_REWARD_FLOUR
    + milestonesOf(eco.bakes, MISSION_BAKE_STEP) * MISSION_REWARD_FLOUR
    + eco.stageMax * STAGE_REWARD_FLOUR
    + basesCompleted(collection) * RECIPE_REWARD_FLOUR
    + eco.exchanged * FLOUR_PER_INGREDIENT
  );
}

/**
 * 현재 가루 잔액. 음수 방어(max 0)는 상수 하향 조정·손상 저장본 대비 —
 * 정상 경로에서는 spent가 earned를 넘을 수 없다(구매가 잔액을 먼저 확인한다).
 */
export const flourBalance = (
  eco: EconomyState,
  collection: Record<string, CollectionEntry>,
): number => Math.max(0, earnedFlour(eco, collection) - eco.spent);

export const canBuyIngredient = (
  eco: EconomyState,
  collection: Record<string, CollectionEntry>,
): boolean => flourBalance(eco, collection) >= INGREDIENT_FLOUR_COST;

export interface MissionView {
  /** 누적 횟수 */
  count: number;
  /** 다음 보상까지 남은 횟수 (1~step) */
  remaining: number;
  step: number;
  /** 지금까지 받은 횟수 */
  claimed: number;
}

const viewOf = (count: number, step: number): MissionView => ({
  count,
  remaining: step - (count % step),
  step,
  claimed: milestonesOf(count, step),
});

/** 미션 진행 뷰 — UI 표시 전용 파생 */
export const missionViews = (eco: EconomyState): { feed: MissionView; bake: MissionView } => ({
  feed: viewOf(eco.feeds, MISSION_FEED_STEP),
  bake: viewOf(eco.bakes, MISSION_BAKE_STEP),
});
