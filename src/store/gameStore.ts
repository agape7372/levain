// 단일 진실 소스 — state·dispatch·tick·subscribe (ARCHITECTURE §2).
// 액션 순서 불변식: dispatch = advance(tick) 선행 → applyAction → 동기 저장 → 알림 재계획 → 통지 1회.
// 통지는 마지막에 딱 한 번 — 중간 통지가 나가면 UI가 액션 전 상태를 한 프레임 그린다.
//
// v2(확장기획 §5): envelope는 starters[]를 담지만 sim은 여전히 "르방 1개의 물리"다.
// 멀티는 전부 이 층에서 — 활성 르방만 advance/dispatch하고, 비활성은 닫힌 함수 모델
// 덕분에 그냥 둔다(전환 시 advance 1회면 정산 끝). 백그라운드 시뮬 0.
import type {
  Action, AdGrant, BriefingKey, CollectionEntry, IngredientId, NotifyPlan, SimEvent, SimState, Snapshot,
} from '../sim';
import {
  LABEL_STAGE, REWIND_TOLERANCE_MS, STARTER_SLOTS_FREE,
  advance, applyAction, betterGrade, deriveBriefing, deriveSnapshot, initialState,
  isPlayable, planNotificationsAll, playableRules, reanchor, ruleByVariantId, stageOf,
  RECIPES, variantIdOf, DAY, INGREDIENT_SOFT_CAP, INGREDIENT_FLOUR_COST,
  canBakeBread, recipeById, PANTRY_MAX, INGREDIENTS,
  canWatchAd, recordAdGrant,
} from '../sim';
import type { Clock } from '../platform/clock';
import type { StorageAdapter } from '../platform/storage';
import type { LoadSource, SaveEnvelope, SaveFlags, SaveSettings, StarterRecord } from './persistence';
import { SCHEMA_VERSION, defaultFlags, defaultSettings, emptyInventory, load, save } from './persistence';
import type { EconomyState } from './economy';
import { earnedFlour, emptyEconomy, flourBalance } from './economy';

/** 포그라운드 tick 주기 — rAF 아님. 게임 시간은 wall-clock이다 (ARCHITECTURE §2) */
const TICK_MS = 5_000;
/** 포그라운드 주기 저장 60초 = tick 12회 */
const SAVE_EVERY_TICKS = 12;

export type StoreListener = (snap: Snapshot, events: SimEvent[]) => void;

export interface GameStoreDeps {
  clock: Clock;
  storage: StorageAdapter;
  onNotifyPlan?: (plan: NotifyPlan) => void;
  /** 저장 실패 통지 — 호출 지점이 많아(주기 tick 포함) 스팸 방지는 배선 쪽(app.ts) 책임 */
  onSaveFailed?: () => void;
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
  /** 보관 통 잔량(g) — 빵 원가의 출처 (GDD §6-2) */
  getPantry(): number;
  /**
   * 재료 지급 — 소프트캡(INGREDIENT_SOFT_CAP)까지만 쌓이고 초과분은 교환 가루로 자동
   * 전환된다 (§9). Levain Lab·개발자 모드·선물이 공용으로 쓴다.
   */
  grantIngredient(id: IngredientId, count: number): void;
  /**
   * 보관 통 직접 적립 — Levain Lab·개발자 모드·테스트 전용. 정상 경로는 떼어내기(split)다.
   * grantIngredient와 같은 등급의 주입구이고, 게임 규칙은 통과하지 않는다.
   */
  grantPantry(g: number): void;

  // ── 무료 경제 (§9 Phase 7) — 잔액은 파생, store/economy.ts가 정의 ──
  /** 경제 카운터 원본 (읽기 전용) */
  getEconomy(): EconomyState;
  /** 교환 가루 잔액 = 누적 획득 − 누적 사용 */
  getFlour(): number;
  /** 가루로 원하는 재료 1개 사기. 잔액 부족·소프트캡 도달이면 false (무차감) */
  buyIngredient(id: IngredientId): boolean;
  /** 재료 1개를 가루로 되돌리기 (중복 정리). 재고 0이면 false */
  exchangeIngredient(id: IngredientId): boolean;
  /** 첫 재료 선물 1개 (온보딩 §9) — 이미 받았으면 false. 기존 저장본도 1회 받는다 */
  claimStarterGift(id: IngredientId): boolean;
  /** 광고 지급 원장 (확장기획 §10) — 읽기 전용, 상한 산수는 sim/ads.ts 순수 함수로 */
  getAdLedger(): AdGrant[];
  /**
   * 재료 배송 보상 (§10 슬롯 1) — 상한 확인 → 원장 기록 + 재료 1 지급을 같은 persist에 커밋.
   * 지급 경로는 grantInto 재사용(소프트캡·자동 환전 규칙 우회 없음). 대상은 캡 미만 재료 중
   * 미보유(0개) 우선 랜덤 — "신규 보장(가능한 경우)"의 최소 구현. 지급 불가면 null·무기록.
   */
  adDeliveryReward(): IngredientId | null;

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
    shared: { collection: {}, inventory: emptyInventory(), economy: emptyEconomy(), pantry: 0, ads: [] },
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

  // ── 경제(§9) 헬퍼 ─────────────────────────────────────────────────────────
  // 잔액은 저장하지 않는다 — 여기 있는 건 카운터 갱신뿐이고 획득액은 전부 파생이다.

  const economy = (): EconomyState => env.shared.economy;
  const earnedNow = (): number => earnedFlour(economy(), env.shared.collection);

  function setEconomy(patch: Partial<EconomyState>): void {
    env = { ...env, shared: { ...env.shared, economy: { ...economy(), ...patch } } };
  }

  /** stageMax는 이벤트가 아니라 관측으로 올린다 — 구세이브(이미 성장한 르방)도 소급 인정 */
  let stageMaxDirty = false;
  function syncStageMax(now: number): void {
    const top = env.starters.reduce((m, r) => Math.max(m, stageOf(r.sim, now)), 0);
    if (top <= economy().stageMax) return;
    setEconomy({ stageMax: top });
    stageMaxDirty = true;
  }

  function setInventory(id: IngredientId, value: number): void {
    env = {
      ...env,
      shared: { ...env.shared, inventory: { ...env.shared.inventory, [id]: Math.max(0, value) } },
    };
  }

  /**
   * 소프트캡 지급 (§9): 캡까지만 재료로 쌓고 초과분은 교환 가루로 자동 전환한다.
   * 이미 캡을 넘은 재고(개발자 치트·구세이브)는 깎지 않는다 — 지급이 재고를 줄이는 일은 없다.
   */
  function grantInto(id: IngredientId, count: number): void {
    const add = Math.max(0, Math.round(count));
    if (add === 0) return;
    const cur = env.shared.inventory[id] ?? 0;
    const next = Math.max(cur, Math.min(INGREDIENT_SOFT_CAP, cur + add));
    const overflow = add - (next - cur);
    setInventory(id, next);
    if (overflow > 0) setEconomy({ exchanged: economy().exchanged + overflow });
  }

  // 부트 백필 — 이미 성장해 있던 르방(1.2.x 저장본)의 단계 보상을 소급 인정한다.
  // 생성 시점이라 구독자가 없어 통지 대상이 없다: 이후의 상승만 flourEarned로 나간다.
  syncStageMax(clock.now());
  stageMaxDirty = false;

  /** 획득 델타를 이벤트로 — 미션·성장·도감 보상이 조용히 들어오지 않게 (토스트는 UI) */
  const earnEvents = (before: number): SimEvent[] => {
    const delta = earnedNow() - before;
    return delta > 0 ? [{ type: 'flourEarned', amount: delta }] : [];
  };

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
    syncStageMax(now);
  }

  /** 도감(전역) 갱신 — v1에서 sim이 하던 집계를 이벤트로 이어받는다 (규칙 동일).
   *  변형(baked.variantId)은 변형 id로 기록하고, **첫 발견 시 재료 1을 같은 갱신에서 차감**
   *  (§8-2 원자성 — persist는 dispatch가 마지막에 1회). */
  function applyBakeEvents(events: SimEvent[], now: number): void {
    for (const e of events) {
      if (e.type !== 'baked' && e.type !== 'bakedDiscard') continue;
      const key = e.variantId ?? e.recipeId;
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
      if (e.variantId && !prev) {
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

  /**
   * 보관 통 정산 — 떼어내면 쌓이고 빵을 구우면 나간다 (GDD §6-2).
   * sim은 전역 통을 모르므로(순수) 적립·차감이 전부 여기서 일어난다 — 도감·재료와 같은 층이고
   * doDispatch의 persist 1회 안에서 커밋되므로 원자성은 그 계약에 얹힌다.
   */
  function applyPantryEvents(events: SimEvent[]): void {
    let delta = 0;
    for (const e of events) {
      if (e.type === 'split') delta += e.amount;
      // bakedDiscard는 cost 0 — 통을 쓰지 않는다(급여당 1회 쿨다운이 그 제약, GDD §6-1)
      else if (e.type === 'baked') delta -= recipeById(e.recipeId)?.cost ?? 0;
    }
    if (delta === 0) return;
    const pantry = Math.max(0, Math.min(PANTRY_MAX, env.shared.pantry + delta));
    env = { ...env, shared: { ...env.shared, pantry } };
  }

  /**
   * 굽기 통 게이트 — dispatch 전 사전 차단(재료 게이트와 같은 결, §8-2).
   * bakeVariant가 아니라 여기 있는 이유: 베이스 빵은 UI가 dispatch({type:'bake'})를 직접 쏴서
   * bakeVariant를 우회한다. 늦게 두면 sim이 baked를 만들고 도감이 먼저 기록돼 버린다.
   * 단계 미해금이면 통을 보지 않는다 — 차단 사유 우선순위를 sim과 같게 유지한다.
   */
  function pantryGate(action: Action, now: number): { state: SimState; events: SimEvent[] } | null {
    if (action.type !== 'bake') return null;
    const recipe = recipeById(action.recipeId);
    if (!recipe || recipe.kind !== 'bread') return null;
    if (canBakeBread(activeSim(), recipe, now) !== 'ok') return null;
    if (env.shared.pantry >= recipe.cost) return null;
    return { state: activeSim(), events: [{ type: 'bakeBlocked', reason: 'pantry' }] };
  }

  /** 누적 미션 카운터 — 급여·굽기 이벤트만 센다 (차단·잠금은 세지 않는다) */
  function applyEconomyEvents(events: SimEvent[]): void {
    let feeds = 0;
    let bakes = 0;
    for (const e of events) {
      if (e.type === 'fed') feeds += 1;
      else if (e.type === 'baked' || e.type === 'bakedDiscard') bakes += 1;
    }
    if (feeds === 0 && bakes === 0) return;
    setEconomy({ feeds: economy().feeds + feeds, bakes: economy().bakes + bakes });
  }

  function emit(events: SimEvent[]): void {
    for (const fn of [...listeners]) fn(snap, events);
  }

  function persist(now: number): boolean {
    env = { ...env, savedAt: now };
    const ok = save(env, storage);
    // 실패를 조용히 삼키지 않는다 — copy.save.writeFailed가 정의만 되고 배선 0이었다(2026-08-30).
    if (!ok) deps.onSaveFailed?.();
    return ok;
  }

  function replan(now: number): void {
    if (!deps.onNotifyPlan) return;
    // 알림을 끄면 빈 플랜을 밀어 예약을 걷어낸다 — 안 그러면 예약이 산 채로 남는다.
    // 전 르방 병합 플랜 (§5-6) — 슬롯 3개 그대로, 같은 슬롯은 가장 이른 시각+집계 문구
    const plan: NotifyPlan = env.settings.notifyEnabled
      ? planNotificationsAll(env.starters.map((r) => r.sim), now, {
          peakOptIn: env.settings.notifyPeak,
          quietStartH: env.settings.quietStartH,
          quietEndH: env.settings.quietEndH,
        })
      : { slots: [] };
    deps.onNotifyPlan(plan);
  }

  function doTick(): Snapshot {
    const before = earnedNow();
    const now = clock.now();
    stageMaxDirty = false;
    advanceTo(now);
    // 성장 단계 보상은 급여 없이도(경과만으로) 오를 수 있다 — 오른 순간 저장까지 마친다
    if (stageMaxDirty) persist(now);
    emit(earnEvents(before));
    return snap;
  }

  function doDispatch(action: Action): SimEvent[] {
    const now = clock.now(); // 한 번만 캡처 — advance·applyAction·savedAt이 같은 시각을 본다
    const before = earnedNow();
    advanceTo(now);
    const res = pantryGate(action, now) ?? applyAction(activeSim(), action, now);
    setActiveSim(res.state);
    applyBakeEvents(res.events, now);
    applyPantryEvents(res.events); // 도감과 같은 델타 — 통 차감·적립도 이 persist 1회에 든다
    applyEconomyEvents(res.events); // 도감 갱신 뒤 — 레시피 최초 완성분까지 같은 델타에 든다
    snap = deriveSnapshot(activeSim(), now);
    const events = [...res.events, ...earnEvents(before)];
    persist(now);
    replan(now);
    emit(events);
    return events;
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
    getPantry: () => env.shared.pantry,
    getAdLedger: () => env.shared.ads,

    // 광고 자체(SDK·시청)는 platform 소관 — 여기는 "보상 지급"만. 호출자(app.ts)가
    // 광고 시청 완료를 확인한 뒤에만 부른다. 상한 재확인은 여기서도 한다(캡 우회 방지 —
    // UI 판정과 지급 판정이 다른 스냅샷을 볼 가능성을 닫는다).
    adDeliveryReward(): IngredientId | null {
      const now = clock.now();
      if (canWatchAd(env.shared.ads, now, 'delivery') !== 'ok') return null;
      // 신규 보장(가능한 경우) — 미보유(0개) 재료 중에서 우선, 없으면 캡 미만 전체에서.
      const under = INGREDIENTS.filter((i) => (env.shared.inventory[i.id] ?? 0) < INGREDIENT_SOFT_CAP);
      if (under.length === 0) return null;
      const zero = under.filter((i) => (env.shared.inventory[i.id] ?? 0) === 0);
      const pool = zero.length > 0 ? zero : under;
      const pick = pool[Math.floor(Math.random() * pool.length)].id;
      const before = earnedNow();
      env = { ...env, shared: { ...env.shared, ads: recordAdGrant(env.shared.ads, now, 'delivery') } };
      grantInto(pick, 1);
      persist(now);
      emit(earnEvents(before));
      return pick;
    },

    grantIngredient(id: IngredientId, count: number): void {
      const before = earnedNow();
      grantInto(id, count);
      persist(clock.now());
      emit(earnEvents(before));
    },

    grantPantry(g: number): void {
      const pantry = Math.max(0, Math.min(PANTRY_MAX, env.shared.pantry + Math.round(g)));
      env = { ...env, shared: { ...env.shared, pantry } };
      persist(clock.now());
    },

    getEconomy: () => economy(),
    getFlour: () => flourBalance(economy(), env.shared.collection),

    buyIngredient(id: IngredientId): boolean {
      // 잔액·소프트캡을 **차감 전에** 확인 — 실패는 무차감 (무효 조합 규약과 같은 원칙)
      if (flourBalance(economy(), env.shared.collection) < INGREDIENT_FLOUR_COST) return false;
      if ((env.shared.inventory[id] ?? 0) >= INGREDIENT_SOFT_CAP) return false;
      setEconomy({ spent: economy().spent + INGREDIENT_FLOUR_COST });
      setInventory(id, (env.shared.inventory[id] ?? 0) + 1);
      persist(clock.now());
      emit([]);
      return true;
    },

    exchangeIngredient(id: IngredientId): boolean {
      const cur = env.shared.inventory[id] ?? 0;
      if (cur < 1) return false;
      const before = earnedNow();
      setInventory(id, cur - 1);
      setEconomy({ exchanged: economy().exchanged + 1 });
      persist(clock.now());
      emit(earnEvents(before));
      return true;
    },

    claimStarterGift(id: IngredientId): boolean {
      if (economy().gifted) return false;
      const before = earnedNow();
      setEconomy({ gifted: true });
      grantInto(id, 1);
      persist(clock.now());
      emit(earnEvents(before));
      return true;
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
      // sim 게이트(stage·쿨다운)·통 게이트(doDispatch의 pantryGate)·판정은 베이스 그대로 —
      // 실패 시 baked 이벤트가 없어 applyBakeEvents가 아무것도 안 건드린다(재료·통 차감 0).
      // 통 게이트를 여기가 아니라 doDispatch에 둔 이유: 베이스 빵은 UI가 dispatch를 직접 쏘아
      // 이 함수를 우회한다. discard 베이스(팬케이크·크래커·스콘)는
      // bakeDiscard 경로 — bake는 bread 전용이라 안 통한다 (2026-08-24 밤 발견 수정)
      const base = RECIPES.find((r) => r.id === rule.baseRecipeId);
      return doDispatch(
        base?.kind === 'discard'
          ? { type: 'bakeDiscard', recipeId: rule.baseRecipeId, variantId }
          : { type: 'bake', recipeId: rule.baseRecipeId, variantId },
      );
    },

    devMatureActive(): void {
      const now = clock.now();
      advanceTo(now);
      const sim = activeSim();
      // createdAt만 과거로 — 재정박 목록과 무관(더 과거로 미는 건 안전), 일수 게이트 통과용
      setActiveSim({ ...sim, createdAt: now - 40 * DAY, maturity: 45, mass: 480 });
      // 통도 같이 채운다 — 안 채우면 성숙 치트를 써도 빵을 한 개도 못 굽는다(원가가 통에서 나간다)
      env = { ...env, shared: { ...env.shared, pantry: Math.max(env.shared.pantry, 1_000) } };
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
