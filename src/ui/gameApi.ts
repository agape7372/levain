// UI ↔ store 결합 절단면 — 화면은 이 인터페이스만 안다. 배선은 app.ts (ARCHITECTURE §5).
import type { Action, Location, SimEvent, Snapshot } from '../sim';

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
  labelText(): string | null;
  location(): Location;
  dispatch(action: Action): SimEvent[];
  subscribe(fn: (snap: Snapshot, events: SimEvent[]) => void): () => void;

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
