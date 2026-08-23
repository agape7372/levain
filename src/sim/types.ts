// 르방이 시뮬레이션 타입 — 정본: docs/GDD.md §2·§3
// sim은 순수: three/DOM/Capacitor import 0, Date.now() 호출 0. now는 항상 인자.

export type FeedRatio = '1:1:1' | '1:2:2' | '1:5:5';
export type Location = 'room' | 'window' | 'fridge';
export type Phase = 'active' | 'hungry' | 'sour' | 'dormant';
export type SmellBand = 'flour' | 'yogurt' | 'vinegar' | 'sharp' | 'acetone';
export type BakeGrade = 'best' | 'good' | 'flat';

export interface CollectionEntry {
  /** 빵 레시피 최고 등급. discard 레시피는 판정이 없어 null */
  bestGrade: BakeGrade | null;
  count: number;
  firstAt: number;
}

export interface SimState {
  createdAt: number;
  /** 마지막 급여 wall-clock — 표시·유효시간 계산의 원점 */
  lastFedAt: number;
  /** advance()가 마지막으로 반영한 시각 — 시계 역행 방어 기준 */
  lastSimulatedAt: number;
  feedRatio: FeedRatio;
  location: Location;
  /**
   * 위치 변경 물리 보존 앵커(회중시계):
   * 유효 경과 = effBaseMs + (now − locAnchorAt) × 온도배율(location).
   * 급여 시 effBaseMs=0·locAnchorAt=now, 위치 변경 시 지금까지의 유효시간을
   * effBaseMs로 접어 넣고 locAnchorAt=now. 과거 구간이 새 배율로 재해석되는 것을 막는다.
   */
  locAnchorAt: number;
  effBaseMs: number;
  /** 산미 누적 0~100 */
  acidity: number;
  /** 건강 급여 사이클 수 — 성장·해금 축 */
  maturity: number;
  /** 병 속 총량 g (60~480). 씨앗 60g은 소모 불가 */
  mass: number;
  /** 부활 의식: 0=정상, 1=휴면 중 1회차 급여 완료(2회차 대기) */
  reviveProgress: 0 | 1;
  /** discard 레시피 "급여당 1회" 쿨다운 — lastFedAt과 비교 */
  lastDiscardBakeAt: number | null;
  collection: Record<string, CollectionEntry>;
  /** 병 이름표 — 5단계 해금 보상 */
  label: string | null;
}

export type Action =
  | { type: 'feed'; ratio: FeedRatio }
  | { type: 'setLocation'; to: Location }
  | { type: 'bake'; recipeId: string }
  | { type: 'bakeDiscard'; recipeId: string };

export type SimEvent =
  | { type: 'fed'; ratio: FeedRatio; maturityGained: boolean }
  | { type: 'stageUp'; stage: number }
  | { type: 'reviveStarted' }
  | { type: 'reviveTooSoon' }
  | { type: 'revived' }
  | { type: 'needRoom' }        // 휴면 급여인데 냉장/창가 — UI가 먼저 막지만 백스톱
  | { type: 'ratioLocked'; ratio: FeedRatio }
  | { type: 'moved'; to: Location }
  | { type: 'locationLocked' }  // 냉장 미해금
  | { type: 'baked'; recipeId: string; grade: BakeGrade }
  | { type: 'bakedDiscard'; recipeId: string }
  | { type: 'bakeBlocked'; reason: 'mass' | 'stage' | 'cooldown' | 'unknownRecipe' };

/** UI·렌더가 읽는 파생 뷰 — deriveSnapshot(state, now)의 반환. 전부 계산값 */
export interface Snapshot {
  phase: Phase;
  /** 발효 활성도 0~1 */
  activity: number;
  /** 배고픔 0~1 (비주얼 구동) */
  hunger: number;
  /** 산미 0~1 (= acidity/100) */
  sourness: number;
  /** 휴면 깊이 0~1 */
  dormancy: number;
  /** 반죽 높이 — 고무줄(마지막 밥 시점) 기준 1.0, 범위 0.6~1.6 */
  fill: number;
  /** 부유액 층 0~1 */
  hooch: number;
  smell: SmellBand;
  stage: number;
  mass: number;
  /** 배고픔 진입 예측 wall-clock (알림·안내) */
  nextFeedAt: number;
  /** 피크 도달 예측 wall-clock */
  peakAt: number;
  /** 유효시간 기준 마지막 밥으로부터의 경과 ms */
  effSinceFeedMs: number;
}

export interface NotifySlot {
  id: number;
  at: number;
  /** copy.ts 키 — sim은 문구를 모른다 */
  copyKey: 'feedTime' | 'fridgeWeek' | 'dormant' | 'reviveSecond';
  /** 냉장 주간 반복 여부 */
  weekly: boolean;
}

export interface NotifyPlan {
  slots: NotifySlot[];
}

export interface RecipeDef {
  id: string;
  kind: 'bread' | 'discard';
  /** 빵: mass 소모 g. discard는 0 */
  cost: number;
  /** 해금 성장 단계 */
  stage: number;
  /** 산미 선호 [lo, hi] — discard는 null */
  sourRange: [number, number] | null;
  /** 감점 기울기: 선호 범위 밖 산미 1당 적합도 감소량 */
  slope: number;
}
