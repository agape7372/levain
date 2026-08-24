// 르방이 시뮬레이션 타입 — 정본: docs/GDD.md §2·§3
// sim은 순수: three/DOM/Capacitor import 0, Date.now() 호출 0. now는 항상 인자.

export type FeedRatio = '1:1:1' | '1:2:2' | '1:5:5';
export type Location = 'room' | 'window' | 'fridge';
export type Phase = 'active' | 'hungry' | 'sour' | 'dormant' | 'moldy';
export type MoldStage = 'none' | 'spot' | 'spread' | 'dead';
export type SmellBand = 'flour' | 'yogurt' | 'vinegar' | 'sharp' | 'acetone';
export type BakeGrade = 'best' | 'good' | 'flat';

/** 복귀 브리핑 항목 — 부재 중 넘은 경계, 시간순 (briefing.ts) */
export type BriefingKey =
  | 'peaked' | 'becameHungry' | 'hoochAppeared' | 'becameSour'
  | 'wentDormant' | 'moldSpotted' | 'moldSpread' | 'moldDied';

/**
 * 빵 도감 항목 — v2에서 전역(집의 기록)으로 승격돼 sim 밖(SaveEnvelope.shared)에 산다.
 * 타입은 도메인 어휘라 sim에 남긴다. 갱신은 store가 baked/bakedDiscard 이벤트로 수행.
 */
export interface CollectionEntry {
  /** 빵 레시피 최고 등급. discard 레시피는 판정이 없어 null */
  bestGrade: BakeGrade | null;
  count: number;
  firstAt: number;
  /** 처음 구운 르방 id — v1 이월분은 starters[0] (확장기획 §5-4) */
  starterId?: string;
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
  /**
   * 건조 플레이크 백업(죽음 보험) 1슬롯 — 말린 시점 maturity 스냅.
   * 곰팡이 사망 후 restoreFlake로 계보를 잇는다. madeAt은 재정박 목록(advance.reanchor).
   */
  flake: { madeAt: number; maturity: number } | null;
}

export type Action =
  | { type: 'feed'; ratio: FeedRatio }
  | { type: 'setLocation'; to: Location }
  | { type: 'bake'; recipeId: string }
  | { type: 'bakeDiscard'; recipeId: string }
  | { type: 'makeFlake' }       // 얇게 펴 말리기 — 죽음 보험 (3단계 해금, 활발, -20g)
  | { type: 'discardStarter' }  // 곰팡이 확정 후 폐기 — 새 개체 (도감은 전역이라 자동 보존)
  | { type: 'restoreFlake' };   // 곰팡이 확정 후 플레이크 복원 — 같은 계보 (부활 의식 경유)

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
  | { type: 'bakeBlocked'; reason: 'mass' | 'stage' | 'cooldown' | 'unknownRecipe' }
  | { type: 'labeled' }
  | { type: 'labelLocked' }
  | { type: 'flakeMade' }
  | { type: 'flakeBlocked'; reason: 'stage' | 'phase' | 'mass' }
  | { type: 'starterDiscarded' }
  | { type: 'flakeRestored' }
  | { type: 'moldBlocked' }; // 곰팡이 확정 — 폐기·복원 외 전 액션 차단

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
  /** 반죽 높이 — 마지막 밥 시점 기준 1.0, 범위 0.6~1.6 */
  fill: number;
  /** 부유액 층 0~1 */
  hooch: number;
  smell: SmellBand;
  stage: number;
  mass: number;
  /** 배고픔 진입 예측 wall-clock (알림·안내) */
  nextFeedAt: number;
  /** 피크 진입 예측 wall-clock — 피크는 구간이라 peakEndAt과 짝으로 범위 표현 */
  peakAt: number;
  /** 피크 구간 끝 예측 wall-clock */
  peakEndAt: number;
  /** 유효시간 기준 마지막 밥으로부터의 경과 ms */
  effSinceFeedMs: number;
  /** 곰팡이 단계 (예고 2단 → 사망) */
  moldStage: MoldStage;
  /** 곰팡이 확산 연속값 0~1 — 렌더 전용 */
  mold01: number;
  /** 곰팡이 사망 확정 예측 wall-clock — 정직한 예고 */
  moldDeadAt: number;
  /** kahm 효모 막(무해 — 오판 유발) — 창가×시큼 구간 파생 */
  kahm: boolean;
  hasFlake: boolean;
}

export interface NotifySlot {
  id: number;
  at: number;
  /** copy.ts 키 — sim은 문구를 모른다 */
  copyKey: 'feedTime' | 'fridgeWeek' | 'dormant' | 'reviveSecond' | 'moldWarn';
  /** 냉장 주간 반복 여부 */
  weekly: boolean;
  /** 멀티 르방 병합 수(§5-6) — 2 이상이면 집계 문구. 플랜 일시값, 저장 안 함 */
  count?: number;
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
