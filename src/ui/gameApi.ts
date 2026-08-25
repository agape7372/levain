// UI ↔ store 결합 절단면 — 화면은 이 인터페이스만 안다. 배선은 app.ts (ARCHITECTURE §5).
import type { Action, IngredientId, Location, SimEvent, Snapshot } from '../sim';

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
  openNotifySettings(): void;

  /** 미표시 굽기 결과 (강제종료 복구) — 표시 후 clear */
  pendingBake(): { recipeId: string; grade: string } | null;
  clearPendingBake(): void;
}
