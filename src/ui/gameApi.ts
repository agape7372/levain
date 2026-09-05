// UI ↔ store 결합 절단면 — 화면은 이 인터페이스만 안다. 배선은 app.ts (ARCHITECTURE §5).
import type { Action, CollectionEntry, DoughQuality, FeedRatio, IngredientId, Location, SimEvent, Snapshot } from '../sim';

/** 누적 미션 한 줄 — 리셋·기한 없음. remaining은 다음 보상까지 남은 횟수(1~step) */
export interface MissionProgress {
  count: number;
  remaining: number;
  step: number;
  claimed: number;
}

export interface EconomyView {
  /** 교환 가루 잔액 */
  flour: number;
  feed: MissionProgress;
  bake: MissionProgress;
  /** 처음 만들어 본 베이스 레시피 수 / 전체 */
  basesDone: number;
  basesTotal: number;
  /** 첫 재료 선물을 아직 안 받았다 */
  giftPending: boolean;
}

export interface GameSettings {
  muted: boolean;
  haptics: boolean;
  notifyEnabled: boolean;
  notifyPeak: boolean;
  /** 확장 옵트인 3종 (2026-09-03 — 설정 알림 하위 모달) */
  notifySour: boolean;
  notifyStage: boolean;
  notifyFirstWeek: boolean;
  quietStartH: number;
  quietEndH: number;
}

export interface GameApi {
  now(): number;
  getSnapshot(): Snapshot;
  /** 표시용 wall-clock — snapshot의 effSinceFeedMs는 유효시간이라 "N시간 전"에 못 쓴다 */
  lastFedAt(): number;
  /** 활성 르방 이름 (v2: StarterRecord.name — sim 밖 소유) */
  labelText(): string | null;
  /** 이름 짓기 — 게이트·규칙은 store가 판정 (labeled/labelLocked 이벤트) */
  rename(name: string): void;
  /** 멀티 르방 — 홈 칩 전환 UI용 활성 정보 */
  starters(): { count: number; index: number; name: string | null; ordinal: number };
  /** 이전/다음 르방 전환 (순환) — 씬 스냅·시드 재설정은 배선(app.ts)이 수행 */
  switchStarter(dir: 1 | -1): void;
  location(): Location;
  /** 건조 플레이크 말린 시각 — 없으면 null (관찰 카드 표시용) */
  flakeMadeAt(): number | null;
  dispatch(action: Action): SimEvent[];
  subscribe(fn: (snap: Snapshot, events: SimEvent[]) => void): () => void;

  /** 재료함 (§8-2 — 전역 수량) */
  inventory(): Record<IngredientId, number>;
  /** 보관 통 잔량(g) — 빵 원가가 여기서 나간다 (GDD §6-2) */
  pantry(): number;
  /** 도감(전역) — 베이스 id 또는 `base--ing-form` 변형 키. 획득 연출·시트가 "미발견"을 판정한다 (2026-09-03) */
  collection(): Record<string, CollectionEntry>;
  /**
   * 집 최고 성장 단계(`economy.stageMax`) — 레시피 해금·잠김 표시는 활성 르방 stage가 아니라
   * **이것**을 본다 (GDD §6-2 개정 2026-09-05: 통이 집 것이면 해금도 집 것). 르방을 넘겨도 도감이 안 바뀐다.
   */
  houseStage(): number;
  /**
   * 보관 통 반죽 품질(g 가중 평균) — 등급 판정·상태 줄이 읽는다. 통이 비어 있으면 null.
   * 키 부재(1.4.x 저장본의 g)는 store가 레거시 상수로 씌운다 — UI는 구분하지 않는다.
   */
  pantryQuality(): DoughQuality | null;
  /**
   * 이 빵을 구우면 **실제로 나갈 반죽**의 품질 — 통은 로트 원장이고 굽기는 그 레시피에 가장 잘 맞는
   * 로트부터 골라 쓴다(sim/pantry.ts pickDough — 시큼 로트는 호밀빵 때 뽑힌다). 빵 시트 `반죽` 행이 읽는다.
   * pantryQuality()(통 전체 평균)와 다를 수 있다. 통이 비면 null.
   */
  doughFor(recipeId: string): DoughQuality | null;
  /**
   * 현재 급여 비율 — 상단 타임라인이 RATIOS에서 축 눈금을 읽는다(표시 전용 패스스루).
   * Snapshot의 peakAt/peakEndAt을 쓰지 않는 이유: wallFor의 clamp 때문에 피크가 지나면
   * 둘 다 locAnchorAt으로 붕괴해 밴드 폭이 0이 된다 (derive.ts wallFor).
   */
  feedRatio(): FeedRatio;
  /** 변형 굽기 — 원자 해금·차단 규칙은 store가 판정 (gameStore.bakeVariant 주석) */
  bakeVariant(variantId: string): SimEvent[];
  /** 활성 르방 표시명 — starterId로 도감 기록의 "사용 르방" 표기용. 미지 id는 null */
  starterNameOf(id: string): string | null;

  /** 새 르방 추가 (홈 + 버튼 — 정식 UI, 2026-08-24 사용자 확정. 슬롯 상한이면 false) */
  addStarter(): boolean;

  // ── 무료 경제 (§9 Phase 7) ──
  /** 가루 잔액 + 미션 진행 — 전부 파생값 스냅. 렌더할 때마다 새로 읽는다 */
  economy(): EconomyView;
  /** 가루로 재료 1개 사기 — 잔액 부족·소프트캡이면 false (무차감) */
  buyIngredient(id: IngredientId): boolean;
  /** 재료 1개를 가루로 되돌리기 — 재고 0이면 false */
  exchangeIngredient(id: IngredientId): boolean;
  /** 첫 재료 선물 받기 — 이미 받았으면 false */
  claimStarterGift(id: IngredientId): boolean;

  // ── 보상형 광고 (확장기획 §10) — 전부 사용자 선택형, 슬롯 1종(재료 배송)만 v1 구현 ──
  ads: {
    /** SDK 탑재 여부 — false면 UI가 슬롯 자체를 숨긴다(버전 스큐 방어) */
    available(): boolean;
    /** 오늘 남은 배송 횟수 (전체 하루 상한과 슬롯 상한 중 낮은 쪽) */
    deliveryRemaining(): number;
    /**
     * 광고 시청 → 성공하면 재료 1개 지급. 시청 실패·취소·상한 도달은 null(무차감 — §10 금지 목록).
     * 시청과 지급 사이에 시간이 걸리므로 Promise — UI는 로딩 상태를 스스로 관리한다.
     */
    watchForDelivery(): Promise<IngredientId | null>;
  };

  /** 개발자 모드 (설정 버전 7탭 — 사용자 본인 치트. 배선은 app.ts) */
  dev: {
    matureActive(): void;
    grantAllIngredients(): void;
    completeCollection(): void;
  };

  getSettings(): GameSettings;
  setSettings(patch: Partial<GameSettings>): void;

  exportSave(): Promise<void>;
  importSave(): Promise<boolean>;
  resetGame(): void;

  requestNotifyPermission(): Promise<'granted' | 'denied' | 'unavailable'>;
  /** 조회 전용 — 권한 요청 팝업을 띄우지 않는다(설정 화면의 "꺼져 있어요" 안내 판정용) */
  checkNotifyPermission(): Promise<'granted' | 'denied' | 'unavailable'>;
  openNotifySettings(): void;

  /** 미표시 굽기 결과 (강제종료 복구) — 표시 후 clear */
  pendingBake(): { recipeId: string; grade: string } | null;
  clearPendingBake(): void;
}
