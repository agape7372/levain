// 단일 진실 소스 — state·dispatch·tick·subscribe (ARCHITECTURE §2).
// 액션 순서 불변식: dispatch = advance(tick) 선행 → applyAction → 동기 저장 → 알림 재계획 → 통지 1회.
// 통지는 마지막에 딱 한 번 — 중간 통지가 나가면 UI가 액션 전 상태를 한 프레임 그린다.
import type { Action, NotifyPlan, SimEvent, Snapshot } from '../sim';
import { advance, applyAction, deriveSnapshot, initialState, planNotifications } from '../sim';
import type { Clock } from '../platform/clock';
import type { StorageAdapter } from '../platform/storage';
import type { LoadSource, SaveEnvelope, SaveFlags, SaveSettings } from './persistence';
import { SCHEMA_VERSION, defaultFlags, defaultSettings, load, save } from './persistence';

/** 포그라운드 tick 주기 — rAF 아님. 게임 시간은 wall-clock이다 (ARCHITECTURE §2) */
const TICK_MS = 5_000;
/** 포그라운드 주기 저장 60초 = tick 12회 */
const SAVE_EVERY_TICKS = 12;

export type StoreListener = (snap: Snapshot, events: SimEvent[]) => void;

export interface GameStoreDeps {
  clock: Clock;
  storage: StorageAdapter;
  onNotifyPlan?: (plan: NotifyPlan) => void;
}

export interface GameStore {
  /** 지금 시각으로 catch-up 후 스냅샷 재계산 + 통지 */
  tick(): Snapshot;
  dispatch(action: Action): SimEvent[];
  subscribe(fn: StoreListener): () => void;
  getSnapshot(): Snapshot;
  /** 읽기 전용으로 다뤄야 한다 — 변경은 setSettings/setFlags/dispatch만 */
  getEnvelope(): SaveEnvelope;
  setSettings(patch: Partial<SaveSettings>): void;
  setFlags(patch: Partial<SaveFlags>): void;
  startNewGame(): void;
  /** 저장 시점 4종 중 hidden·pause를 app.ts가 여기로 태운다 (ARCHITECTURE §3) */
  saveNow(): boolean;
  /** resume·pause 시 재예약용 (GDD §7 트리거) */
  replanNotifications(): void;
  startTicking(): void;
  stopTicking(): void;
}

export function newEnvelope(now: number): SaveEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: now,
    sim: initialState(now),
    settings: defaultSettings(),
    flags: defaultFlags(),
  };
}

/** envelope를 주지 않으면 새 게임으로 시작한다 (부트 경로는 initGameStore가 담당) */
export function createGameStore(deps: GameStoreDeps, envelope?: SaveEnvelope): GameStore {
  const { clock, storage } = deps;

  let env: SaveEnvelope = envelope ?? newEnvelope(clock.now());
  let snap: Snapshot = deriveSnapshot(env.sim, clock.now());
  const listeners = new Set<StoreListener>();

  let timer: ReturnType<typeof setInterval> | null = null;
  let ticksSinceSave = 0;

  /** 통지 없는 내부 catch-up — dispatch가 중간 통지를 내지 않도록 tick()과 분리한다 */
  function advanceTo(now: number): void {
    env = { ...env, sim: advance(env.sim, now) };
    snap = deriveSnapshot(env.sim, now);
  }

  function emit(events: SimEvent[]): void {
    for (const fn of [...listeners]) fn(snap, events);
  }

  function persist(now: number): boolean {
    env = { ...env, savedAt: now };
    return save(env, storage);
  }

  function replan(now: number): void {
    if (!deps.onNotifyPlan) return;
    // 알림을 끄면 빈 플랜을 밀어 예약을 걷어낸다 — 안 그러면 예약이 산 채로 남는다
    const plan: NotifyPlan = env.settings.notifyEnabled
      ? planNotifications(env.sim, now)
      : { slots: [] };
    deps.onNotifyPlan(plan);
  }

  function doTick(): Snapshot {
    advanceTo(clock.now());
    emit([]);
    return snap;
  }

  return {
    tick: doTick,

    dispatch(action: Action): SimEvent[] {
      const now = clock.now(); // 한 번만 캡처 — advance·applyAction·savedAt이 같은 시각을 본다
      advanceTo(now);
      const res = applyAction(env.sim, action, now);
      env = { ...env, sim: res.state };
      snap = deriveSnapshot(env.sim, now);
      persist(now);
      replan(now);
      emit(res.events);
      return res.events;
    },

    subscribe(fn: StoreListener): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    getSnapshot: () => snap,
    getEnvelope: () => env,

    setSettings(patch: Partial<SaveSettings>): void {
      env = { ...env, settings: { ...env.settings, ...patch } };
      const now = clock.now();
      persist(now);
      replan(now);
      emit([]);
    },

    setFlags(patch: Partial<SaveFlags>): void {
      env = { ...env, flags: { ...env.flags, ...patch } };
      persist(clock.now());
      emit([]);
    },

    startNewGame(): void {
      const now = clock.now();
      env = newEnvelope(now);
      snap = deriveSnapshot(env.sim, now);
      persist(now);
      replan(now);
      emit([]);
    },

    saveNow(): boolean {
      return persist(clock.now());
    },

    replanNotifications(): void {
      replan(clock.now());
    },

    startTicking(): void {
      if (timer !== null) return;
      ticksSinceSave = 0;
      timer = setInterval(() => {
        doTick();
        ticksSinceSave += 1;
        if (ticksSinceSave >= SAVE_EVERY_TICKS) {
          ticksSinceSave = 0;
          persist(clock.now());
        }
      }, TICK_MS);
    },

    stopTicking(): void {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
  };
}

export interface InitResult {
  store: GameStore;
  isNew: boolean;
  /** 새 게임이면 null */
  loadSource: LoadSource | null;
}

/**
 * 부트: 저장 로드 → 마이그레이션 → catch-up → 저장.
 * catch-up 결과는 즉시 스냅으로 보여준다 — 몇 시간 치를 애니메이션으로 재생하지 않는다 (§4 전환 정책).
 * 주기 tick은 자동 시작하지 않는다 — app.ts가 화면·가시성과 함께 배선한다.
 */
export async function initGameStore(deps: GameStoreDeps): Promise<InitResult> {
  const loaded = await load(deps.storage);
  const store = createGameStore(deps, loaded?.envelope);
  store.tick();
  store.saveNow();
  store.replanNotifications();
  return { store, isNew: loaded === null, loadSource: loaded?.source ?? null };
}
