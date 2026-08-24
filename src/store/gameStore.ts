// 단일 진실 소스 — state·dispatch·tick·subscribe (ARCHITECTURE §2).
// 액션 순서 불변식: dispatch = advance(tick) 선행 → applyAction → 동기 저장 → 알림 재계획 → 통지 1회.
// 통지는 마지막에 딱 한 번 — 중간 통지가 나가면 UI가 액션 전 상태를 한 프레임 그린다.
//
// v2(확장기획 §5): envelope는 starters[]를 담지만 sim은 여전히 "르방 1개의 물리"다.
// 멀티는 전부 이 층에서 — 활성 르방만 advance/dispatch하고, 비활성은 닫힌 함수 모델
// 덕분에 그냥 둔다(전환 시 advance 1회면 정산 끝). 백그라운드 시뮬 0.
import type {
  Action, BriefingKey, CollectionEntry, IngredientId, NotifyPlan, SimEvent, SimState, Snapshot,
} from '../sim';
import {
  LABEL_STAGE, REWIND_TOLERANCE_MS, STARTER_SLOTS_FREE,
  advance, applyAction, betterGrade, deriveBriefing, deriveSnapshot, initialState,
  isPlayable, planNotificationsAll, playableRules, reanchor, ruleByVariantId, stageOf,
  RECIPES, variantIdOf, DAY,
} from '../sim';
import type { Clock } from '../platform/clock';
import type { StorageAdapter } from '../platform/storage';
import type { LoadSource, SaveEnvelope, SaveFlags, SaveSettings, StarterRecord } from './persistence';
import { SCHEMA_VERSION, defaultFlags, defaultSettings, emptyInventory, load, save } from './persistence';

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
  /** 복귀 catch-up + 부재 브리핑 — pre-advance 상태 기준(briefing.ts). 부재 8h 미만은 [] */
  resumeWithBriefing(): BriefingKey[];
  dispatch(action: Action): SimEvent[];
  subscribe(fn: StoreListener): () => void;
  getSnapshot(): Snapshot;
  /**
   * 읽기 전용으로 다뤄야 한다 — 변경은 setSettings/setFlags/dispatch·starter API만.
   * 특히 starters 배열·shared.collection을 직접 변형하면 단일 진실 소스가 조용히
   * 깨진다(방어 복사 없음 — 확장기획 §3-5 지뢰 3).
   */
  getEnvelope(): SaveEnvelope;
  /** 활성 르방 레코드 — 표시 이름이 필요하면 name ?? `르방이 {ordinal}` 파생 (copy는 UI 소관) */
  getActiveStarter(): StarterRecord;
  /** 전역 도감 (집의 기록 — 르방 폐기·삭제에도 남는다) */
  getCollection(): Record<string, CollectionEntry>;
  /** 재료함 (§8-2 — 전역, 재료 단위 수량) */
  getInventory(): Record<IngredientId, number>;
  /** 재료 지급 — 획득 경로는 Phase 7(미션·교환), 지금은 Levain Lab 전용 진입로 */
  grantIngredient(id: IngredientId, count: number): void;
  /**
   * 변형 굽기 (§8-2 해금 공식) — 원자적: 첫 굽기 = 재료 1 차감 + 도감 발견이 같은
   * dispatch(persist 1회) 안에서 커밋. 발견된 변형 재굽기는 재료 재소비 없음(mass만).
   * 무효 조합(카탈로그 밖·v1 미노출)·재료 부족은 **시도 전 차단** — 소비 0, sim 무변경.
   */
  bakeVariant(variantId: string): SimEvent[];
  /** 개발자 모드(설정 숨은 진입) — 활성 르방 즉시 만렙(5단계·피크 준비) */
  devMatureActive(): void;
  /** 개발자 모드 — 도감 전부 완성(베이스 10 + v1 변형 40, 최고 등급) */
  devCompleteCollection(): void;
  /**
   * 활성 르방 이름 짓기 — 게이트·규칙은 v1 setLabel과 동일(5단계·trim·12자).
   * Phase 3에서 자유화 예정(확장기획 §5-3). labeled/labelLocked 이벤트로 통지.
   */
  renameActive(name: string): void;
  /** 새 르방 생성 + 활성 전환. 슬롯 상한(STARTER_SLOTS_FREE) 도달 시 null */
  addStarter(name?: string | null): StarterRecord | null;
  /**
   * 활성 르방 전환 — 대상 sim만 advance(now) 1회로 정산. 미지의 id면 false.
   * 호출자 계약: 성공 시 씬 snapParams + setMoldSeed(새 활성 createdAt) 재설정은
   * 호출자 책임 — Phase 3 UI/Levain Lab이 배선한다.
   */
  switchStarter(id: string): boolean;
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
    starters: [{ id: 's1', name: null, ordinal: 1, sim: initialState(now) }],
    activeStarterId: 's1',
    nextStarterOrdinal: 2,
    shared: { collection: {}, inventory: emptyInventory() },
    settings: defaultSettings(),
    flags: defaultFlags(),
  };
}

/** envelope를 주지 않으면 새 게임으로 시작한다 (부트 경로는 initGameStore가 담당) */
export function createGameStore(deps: GameStoreDeps, envelope?: SaveEnvelope): GameStore {
  const { clock, storage } = deps;

  let env: SaveEnvelope = envelope ?? newEnvelope(clock.now());

  // 불변식: activeStarterId는 항상 starters 안에 있다 (validateAndClamp·starter API가 보증)
  const activeRecord = (): StarterRecord =>
    env.starters.find((r) => r.id === env.activeStarterId) ?? env.starters[0];
  const activeSim = (): SimState => activeRecord().sim;

  function setActiveSim(sim: SimState): void {
    env = {
      ...env,
      starters: env.starters.map((r) => (r.id === env.activeStarterId ? { ...r, sim } : r)),
    };
  }

  let snap: Snapshot = deriveSnapshot(activeSim(), clock.now());
  const listeners = new Set<StoreListener>();

  let timer: ReturnType<typeof setInterval> | null = null;
  let ticksSinceSave = 0;

  /**
   * 통지 없는 내부 catch-up — dispatch가 중간 통지를 내지 않도록 tick()과 분리한다.
   * 시계 역행은 **전 starter + 전역 도감**에 같은 delta로 재정박(확장기획 §5-1) —
   * 개별 advance에만 맡기면 비활성 르방이 delta만큼 공짜 휴식을 얻는다.
   */
  function advanceTo(now: number): void {
    const last = env.starters.reduce((m, r) => Math.max(m, r.sim.lastSimulatedAt), 0);
    if (now < last - REWIND_TOLERANCE_MS) {
      const delta = last - now;
      const collection: Record<string, CollectionEntry> = {};
      for (const [id, e] of Object.entries(env.shared.collection)) {
        collection[id] = { ...e, firstAt: e.firstAt - delta };
      }
      env = {
        ...env,
        starters: env.starters.map((r) => ({ ...r, sim: reanchor(r.sim, delta) })),
        shared: { ...env.shared, collection },
      };
    }
    setActiveSim(advance(activeSim(), now));
    snap = deriveSnapshot(activeSim(), now);
  }

  /** 도감(전역) 갱신 — v1에서 sim이 하던 집계를 이벤트로 이어받는다 (규칙 동일).
   *  변형(baked.variantId)은 변형 id로 기록하고, **첫 발견 시 재료 1을 같은 갱신에서 차감**
   *  (§8-2 원자성 — persist는 dispatch가 마지막에 1회). */
  function applyBakeEvents(events: SimEvent[], now: number): void {
    for (const e of events) {
      if (e.type !== 'baked' && e.type !== 'bakedDiscard') continue;
      const key = e.type === 'baked' && e.variantId ? e.variantId : e.recipeId;
      const prev = env.shared.collection[key];
      const grade = e.type === 'baked' ? e.grade : null;
      const entry: CollectionEntry = prev
        ? {
            ...prev,
            bestGrade: grade === null ? prev.bestGrade : betterGrade(prev.bestGrade, grade),
            count: prev.count + 1,
          }
        : { bestGrade: grade, count: 1, firstAt: now, starterId: env.activeStarterId };

      let inventory = env.shared.inventory;
      if (e.type === 'baked' && e.variantId && !prev) {
        const rule = ruleByVariantId(e.variantId);
        if (rule) {
          // 재고는 bakeVariant가 dispatch 전에 확인했다 — 여기선 차감만 (음수 방어 max 0)
          inventory = {
            ...inventory,
            [rule.ingredientId]: Math.max(0, (inventory[rule.ingredientId] ?? 0) - 1),
          };
        }
      }
      env = {
        ...env,
        shared: { ...env.shared, inventory, collection: { ...env.shared.collection, [key]: entry } },
      };
    }
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
    // 알림을 끄면 빈 플랜을 밀어 예약을 걷어낸다 — 안 그러면 예약이 산 채로 남는다.
    // 전 르방 병합 플랜 (§5-6) — 슬롯 3개 그대로, 같은 슬롯은 가장 이른 시각+집계 문구
    const plan: NotifyPlan = env.settings.notifyEnabled
      ? planNotificationsAll(env.starters.map((r) => r.sim), now)
      : { slots: [] };
    deps.onNotifyPlan(plan);
  }

  function doTick(): Snapshot {
    advanceTo(clock.now());
    emit([]);
    return snap;
  }

  function doDispatch(action: Action): SimEvent[] {
    const now = clock.now(); // 한 번만 캡처 — advance·applyAction·savedAt이 같은 시각을 본다
    advanceTo(now);
    const res = applyAction(activeSim(), action, now);
    setActiveSim(res.state);
    applyBakeEvents(res.events, now);
    snap = deriveSnapshot(activeSim(), now);
    persist(now);
    replan(now);
    emit(res.events);
    return res.events;
  }

  return {
    tick: doTick,

    resumeWithBriefing(): BriefingKey[] {
      const pre = activeSim();
      const briefing = deriveBriefing(pre, pre.lastSimulatedAt, clock.now());
      doTick();
      return briefing;
    },

    dispatch: doDispatch,

    subscribe(fn: StoreListener): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    getSnapshot: () => snap,
    getEnvelope: () => env,
    getActiveStarter: () => activeRecord(),
    getCollection: () => env.shared.collection,
    getInventory: () => env.shared.inventory,

    grantIngredient(id: IngredientId, count: number): void {
      const cur = env.shared.inventory[id] ?? 0;
      env = {
        ...env,
        shared: {
          ...env.shared,
          inventory: { ...env.shared.inventory, [id]: Math.max(0, Math.min(999, cur + count)) },
        },
      };
      persist(clock.now());
      emit([]);
    },

    bakeVariant(variantId: string): SimEvent[] {
      const rule = ruleByVariantId(variantId);
      // 카탈로그 밖·미노출(experimental/blocked) = 무효 조합 — 시도 전 차단, 소비 0 (§8-2)
      if (!rule || !isPlayable(rule)) {
        const events: SimEvent[] = [{ type: 'bakeBlocked', reason: 'unknownRecipe' }];
        emit(events);
        return events;
      }
      const discovered = env.shared.collection[variantId] !== undefined;
      if (!discovered && (env.shared.inventory[rule.ingredientId] ?? 0) < 1) {
        const events: SimEvent[] = [{ type: 'bakeBlocked', reason: 'ingredient' }];
        emit(events);
        return events;
      }
      // sim 게이트(stage·mass)·판정은 베이스 그대로 — 실패 시 baked 이벤트가 없어
      // applyBakeEvents가 아무것도 안 건드린다(차감 0)
      return doDispatch({ type: 'bake', recipeId: rule.baseRecipeId, variantId });
    },

    devMatureActive(): void {
      const now = clock.now();
      advanceTo(now);
      const sim = activeSim();
      // createdAt만 과거로 — 재정박 목록과 무관(더 과거로 미는 건 안전), 일수 게이트 통과용
      setActiveSim({ ...sim, createdAt: now - 40 * DAY, maturity: 45, mass: 480 });
      snap = deriveSnapshot(activeSim(), now);
      persist(now);
      replan(now);
      emit([]);
    },

    devCompleteCollection(): void {
      const now = clock.now();
      const collection = { ...env.shared.collection };
      const keys = [
        ...RECIPES.map((r) => ({ key: r.id, graded: r.kind === 'bread' })),
        ...playableRules().map((r) => ({ key: variantIdOf(r), graded: true })),
      ];
      for (const { key, graded } of keys) {
        if (collection[key]) continue; // 실제 기록은 덮지 않는다
        collection[key] = {
          bestGrade: graded ? 'best' : null,
          count: 1,
          firstAt: now,
          starterId: env.activeStarterId,
        };
      }
      env = { ...env, shared: { ...env.shared, collection } };
      persist(now);
      emit([]);
    },

    renameActive(name: string): void {
      const now = clock.now();
      advanceTo(now);
      if (stageOf(activeSim(), now) < LABEL_STAGE) {
        emit([{ type: 'labelLocked' }]);
        return;
      }
      const trimmed = name.trim().slice(0, 12);
      if (!trimmed) {
        emit([]);
        return;
      }
      env = {
        ...env,
        starters: env.starters.map((r) =>
          r.id === env.activeStarterId ? { ...r, name: trimmed } : r,
        ),
      };
      persist(now);
      emit([{ type: 'labeled' }]);
    },

    addStarter(name?: string | null): StarterRecord | null {
      if (env.starters.length >= STARTER_SLOTS_FREE) return null;
      const now = clock.now();
      advanceTo(now); // 떠나는(현 활성) 르방 정산 + 역행 방어
      const ordinal = env.nextStarterOrdinal;
      const trimmed = (name ?? '').trim().slice(0, 12);
      const rec: StarterRecord = {
        id: `s${ordinal}`, // ordinal은 재사용되지 않으므로 id도 영원히 유일
        name: trimmed || null,
        ordinal,
        sim: initialState(now),
      };
      env = {
        ...env,
        starters: [...env.starters, rec],
        activeStarterId: rec.id,
        nextStarterOrdinal: ordinal + 1,
      };
      snap = deriveSnapshot(rec.sim, now);
      persist(now);
      replan(now);
      emit([]);
      return rec;
    },

    switchStarter(id: string): boolean {
      if (!env.starters.some((r) => r.id === id)) return false;
      if (id === env.activeStarterId) return true;
      const now = clock.now();
      advanceTo(now); // 떠나는 르방 정산 + 역행 방어(전 starter)
      env = { ...env, activeStarterId: id };
      setActiveSim(advance(activeSim(), now)); // 새 활성 catch-up 1회 — 닫힌 함수라 이걸로 끝
      snap = deriveSnapshot(activeSim(), now);
      persist(now);
      replan(now);
      emit([]);
      return true;
    },

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
      snap = deriveSnapshot(activeSim(), now);
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
  /** 부재 중 있었던 일 — 새 게임·짧은 부재면 [] */
  briefing: BriefingKey[];
}

/**
 * 부트: 저장 로드 → 마이그레이션 → catch-up → 저장.
 * catch-up 결과는 즉시 스냅으로 보여준다 — 몇 시간 치를 애니메이션으로 재생하지 않는다 (§4 전환 정책).
 * 주기 tick은 자동 시작하지 않는다 — app.ts가 화면·가시성과 함께 배선한다.
 */
export async function initGameStore(deps: GameStoreDeps): Promise<InitResult> {
  const loaded = await load(deps.storage);
  const store = createGameStore(deps, loaded?.envelope);
  const briefing = loaded === null ? [] : store.resumeWithBriefing();
  if (loaded === null) store.tick();
  store.saveNow();
  store.replanNotifications();
  return { store, isNew: loaded === null, loadSource: loaded?.source ?? null, briefing };
}
