// 단일 진실 소스 — state·dispatch·tick·subscribe (ARCHITECTURE §2).
// 액션 순서 불변식: dispatch = advance(tick) 선행 → applyAction → 동기 저장 → 알림 재계획 → 통지 1회.
// 통지는 마지막에 딱 한 번 — 중간 통지가 나가면 UI가 액션 전 상태를 한 프레임 그린다.
//
// v2(확장기획 §5): envelope는 starters[]를 담지만 sim은 여전히 "르방 1개의 물리"다.
// 멀티는 전부 이 층에서 — 활성 르방만 advance/dispatch하고, 비활성은 닫힌 함수 모델
// 덕분에 그냥 둔다(전환 시 advance 1회면 정산 끝). 백그라운드 시뮬 0.
import type {
  Action, AdGrant, BriefingKey, CollectionEntry, DoughPick, DoughQuality, IngredientId, NotifyPlan,
  PantryLot, SimEvent, SimState, Snapshot,
} from '../sim';
import {
  LABEL_STAGE, REWIND_TOLERANCE_MS, STARTER_SLOTS_FREE,
  activityAt, advance, applyAction, betterGrade, deriveBriefing, deriveSnapshot, initialState,
  isPlayable, planNotificationsAll, playableRules, reanchor, ruleByVariantId, stageOf,
  RECIPES, variantIdOf, DAY, INGREDIENT_SOFT_CAP, INGREDIENT_FLOUR_COST,
  canBakeBread, recipeById, PANTRY_MAX, PANTRY_LEGACY_ACIDITY, PANTRY_LEGACY_ACTIVITY, INGREDIENTS,
  canWatchAd, recordAdGrant,
  consumeLots, lotsSum, pantryQualityOf, pickDough, pushLot, trimOldest,
} from '../sim';
import type { Clock } from '../platform/clock';
import type { StorageAdapter } from '../platform/storage';
import type { LoadSource, SaveEnvelope, SaveFlags, SaveSettings, StarterRecord } from './persistence';
import {
  SCHEMA_VERSION, defaultFlags, defaultSettings, emptyInventory, emptyLots, load, save,
} from './persistence';
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
   * 집 최고 성장 단계(economy.stageMax) — 해금의 단일 출처 (GDD §6-2 개정 2026-09-05).
   * 활성 르방의 stage가 아니다: 통이 집 것이면 무엇을 구울 수 있는지도 집이 정한다.
   */
  getHouseStage(): number;
  /** 통 **전체**의 g 가중 평균 품질 — 상태 줄 표시용. 통이 비었으면 null */
  getPantryQuality(): DoughQuality | null;
  /**
   * 이 빵을 지금 구우면 실제로 나갈 반죽의 품질 — 굽기는 레시피에 가장 잘 맞는 로트부터
   * 골라 쓴다(sim/pantry.ts pickDough). 등급 판정의 입력이고 빵 시트가 같은 값을 보여준다.
   * 빵 레시피가 아니거나 통이 비었으면 null.
   */
  getDoughFor(recipeId: string): DoughQuality | null;
  /**
   * 재료 지급 — 소프트캡(INGREDIENT_SOFT_CAP)까지만 쌓이고 초과분은 교환 가루로 자동
   * 전환된다 (§9). Levain Lab·개발자 모드·선물이 공용으로 쓴다.
   */
  grantIngredient(id: IngredientId, count: number): void;
  /**
   * 보관 통 직접 적립 — Levain Lab·개발자 모드·테스트 전용. 정상 경로는 떼어내기(split)다.
   * grantIngredient와 같은 등급의 주입구이고, 게임 규칙은 통과하지 않는다.
   * quality 생략 시 레거시 품질(PANTRY_LEGACY_*)의 로트로 들어간다.
   */
  grantPantry(g: number, quality?: DoughQuality): void;

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
    shared: {
      collection: {}, inventory: emptyInventory(), economy: emptyEconomy(),
      pantry: 0, ads: [], pantryLots: emptyLots(),
    },
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

  /**
   * 집 최고 성장 단계 = 해금의 단일 출처 (GDD §6-2 개정 2026-09-05). stageMax는 이미
   * 전 starter 관측으로 갱신되고 부트 백필도 있어(syncStageMax) 별도 max 계산이 필요 없다.
   */
  const houseStage = (): number => economy().stageMax;

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
        shared: {
          ...env.shared,
          collection,
          // 광고 원장도 타임스탬프다 — GDD §3-8은 "향후 필드 포함 모든 타임스탬프"라고 쓴다.
          // 안 당기면 오늘 지급분이 "미래"가 돼 sameLocalDay 산수에서 빠지고 하루 상한이 리셋된다.
          ads: env.shared.ads.map((g) => ({ ...g, at: g.at - delta })),
        },
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

  // ── 보관 통 로트 원장 (GDD §6-2, 개정 2026-09-05) ──────────────────────────
  // 떼면 뒤에 붙고, 구울 때는 그 빵에 **가장 잘 맞는 로트**부터 나간다(sim/pantry.ts pickDough —
  // 오래된 순이 아니다. 그 이유는 그 파일 머리 주석에). g은 정수만: 로트 g의 합이 곧
  // shared.pantry(미러)이고 그게 화면에 뜨는 유일한 수치라 소수점이 생기면 안 된다.
  // 규칙은 전부 sim의 순수 함수이고 여기는 그것을 env에 붙이는 배선뿐이다.

  /** 원장을 갈아 끼운다 — 미러(pantry) 동기화는 여기 한 곳에서만 */
  function setLots(lots: PantryLot[]): void {
    env = { ...env, shared: { ...env.shared, pantryLots: lots, pantry: lotsSum(lots) } };
  }

  /** 로트 추가 — PANTRY_MAX는 밸런스 캡이 아니라 저장 가드라 넘칠 몫만 잘라 넣는다 */
  function addLot(lot: PantryLot): void {
    const room = PANTRY_MAX - env.shared.pantry;
    const g = Math.min(Math.round(lot.g), room);
    if (g <= 0) return;
    setLots(pushLot(env.shared.pantryLots, { ...lot, g }));
  }

  /** 이 레시피를 지금 구우면 어느 조각이 나갈지 — 판정 주입과 소비가 공유하는 단 하나의 선택 */
  function pickFor(recipeId: string): DoughPick | null {
    const recipe = recipeById(recipeId);
    if (!recipe || recipe.kind !== 'bread') return null;
    return pickDough(env.shared.pantryLots, recipe, recipe.cost);
  }

  /**
   * 보관 통 정산 — 떼어내면 쌓이고 빵을 구우면 나간다 (GDD §6-2).
   * sim은 전역 통을 모르므로(순수) 적립·차감이 전부 여기서 일어난다 — 도감·재료와 같은 층이고
   * doDispatch의 persist 1회 안에서 커밋되므로 원자성은 그 계약에 얹힌다.
   * `pick`은 dough를 주입할 때 고른 조각 — 같은 것을 소비해야 예고와 결과가 갈리지 않는다.
   */
  function applyPantryEvents(
    events: SimEvent[],
    stateAfter: SimState,
    now: number,
    pick: DoughPick | null,
  ): void {
    for (const e of events) {
      if (e.type === 'split') {
        // 뗀 순간을 로트로 봉해 둔다 — "피크에 떼라"가 등급에 이빨을 갖는 지점(GDD §6-2).
        // 액션 후 상태로 읽어도 되는 이유: split은 mass만 씨앗으로 줄이고 lastFedAt·locAnchorAt·
        // effBaseMs·acidity·flour를 건드리지 않는다 → activityAt이 떼기 전과 같은 값이다.
        addLot({
          g: e.amount,
          act: activityAt(stateAfter, now),
          acid: stateAfter.acidity,
          flour: stateAfter.flour,
        });
      } else if (e.type === 'baked') {
        // bakedDiscard는 cost 0 — 통을 쓰지 않는다(급여당 1회 쿨다운이 그 제약, GDD §6-1)
        const cost = recipeById(e.recipeId)?.cost ?? 0;
        if (cost <= 0) continue;
        // pantryGate가 통 부족을 사전 차단하므로 여기 도달했으면 Σg ≥ cost이고 pick도 있다.
        // 미러(pantry)가 아니라 **원장 합**을 보는 이유: 게이트가 이미 미러로 판정했으니 미러를
        // 다시 봐야 새로 알 게 없다. 둘이 갈라진 상태(불변식 붕괴)를 잡는 게 이 줄의 일이다.
        // 클램프로 덮으면 무료 빵이 조용히 굽힌다 — 불변식 위반은 소리를 내게 둔다(FM1).
        if (pick === null || lotsSum(env.shared.pantryLots) < cost) {
          throw new Error('pantry underflow');
        }
        setLots(consumeLots(env.shared.pantryLots, pick.taken));
      }
    }
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
    // 단계 판정은 sim과 같은 기준(집 최고 단계)이어야 한다 — 어긋나면 sim이 통과시킬 굽기를
    // 여기서 통 부족으로 막거나 그 반대가 된다.
    if (canBakeBread(activeSim(), recipe, now, houseStage()) !== 'ok') return null;
    // 잔량은 **원장 합**으로 본다(미러 pantry가 아니라) — 나가는 것도 원장이므로 게이트와 소비가 같은 수를
    // 봐야 한다. 미러로 판정하면 둘이 갈라진 저장본(불변식 붕괴)에서 applyPantryEvents의 underflow throw가
    // 도감 기록 뒤에 터져 메모리 상태가 반쯤 바뀐 채 남는다. 원장으로 판정하면 그 경로는 죽는다.
    if (lotsSum(env.shared.pantryLots) >= recipe.cost) return null;
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
    // 전 르방 병합 플랜 (§5-6) — 같은 슬롯은 가장 이른 시각+집계 문구.
    // 옵트인 4종은 설정 기본 on(2026-09-03) — 총량은 capPerDay가 하루 2건으로 눌러 준다
    const plan: NotifyPlan = env.settings.notifyEnabled
      ? planNotificationsAll(env.starters.map((r) => r.sim), now, {
          peakOptIn: env.settings.notifyPeak,
          sourOptIn: env.settings.notifySour,
          stageOptIn: env.settings.notifyStage,
          firstWeekOptIn: env.settings.notifyFirstWeek,
          quietStartH: env.settings.quietStartH,
          quietEndH: env.settings.quietEndH,
        }, env.starters.map((r) => r.name)) // 슬롯별 르방 이름 → 알림 본문(활성 르방 이름이 아니라 그 슬롯의 주인)
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

  /**
   * 집 기준 굽기 컨텍스트 주입 (GDD §6-2 개정 2026-09-05) — 해금은 집 최고 단계로,
   * 등급은 통 반죽 품질로 판정한다. **UI가 채워 보낸 값이 있어도 덮어쓴다**: 단일 출처가
   * store 하나여야 화면이 본 것과 판정이 갈리지 않는다. advanceTo 뒤에만 부를 것 —
   * stageMax는 그 안의 syncStageMax가 갱신한다.
   */
  function withHouseContext(action: Action, pick: DoughPick | null): Action {
    if (action.type === 'bake') {
      return { ...action, houseStage: houseStage(), dough: pick?.dough };
    }
    // discard는 통을 쓰지 않는다 — 나갈 반죽이 없으니 판정할 것도 없다(해금만 집 기준)
    if (action.type === 'bakeDiscard') return { ...action, houseStage: houseStage() };
    return action;
  }

  function doDispatch(action: Action): SimEvent[] {
    const now = clock.now(); // 한 번만 캡처 — advance·applyAction·savedAt이 같은 시각을 본다
    const before = earnedNow();
    advanceTo(now);
    // 나갈 조각을 **한 번만** 고른다 — 판정(dough)과 소비가 같은 선택이어야 시트가 예고한
    // 반죽과 실제로 나간 반죽이 갈리지 않는다. advanceTo 뒤: 그 전엔 원장이 확정이 아니다.
    const pick = action.type === 'bake' ? pickFor(action.recipeId) : null;
    const act = withHouseContext(action, pick);
    const res = pantryGate(act, now) ?? applyAction(activeSim(), act, now);
    setActiveSim(res.state);
    applyBakeEvents(res.events, now);
    // 도감과 같은 델타 — 통 차감·적립도 이 persist 1회에 든다. 액션 후 상태를 넘기는 이유는
    // applyPantryEvents 주석(split의 떼는 순간 품질).
    applyPantryEvents(res.events, res.state, now, pick);
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
    getHouseStage: () => houseStage(),
    getPantryQuality: () => pantryQualityOf(env.shared.pantryLots),
    getDoughFor: (recipeId: string) => pickFor(recipeId)?.dough ?? null,
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

    grantPantry(g: number, quality?: DoughQuality): void {
      // quality 생략 = 1.4.x 저장본 착륙과 같은 레거시 품질(선호 범위 안 빵이 best로 나온다).
      // 음수는 통을 줄이는 뜻이라 오래된 것부터 떠낸다(굽기 규칙과 무관한 주입구 편의).
      const delta = Math.round(g);
      if (delta > 0) {
        addLot({
          g: delta,
          act: quality?.activity ?? PANTRY_LEGACY_ACTIVITY,
          acid: quality?.acidity ?? PANTRY_LEGACY_ACIDITY,
          flour: quality?.flour ?? 'white',
        });
      } else if (delta < 0) {
        // 음수 = "그만큼 없애라". 버릴 대상을 고르는 일이라 굽기(pickDough)가 아니라 trimOldest다.
        setLots(trimOldest(env.shared.pantryLots, -delta));
      }
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
      // 통도 같이 채운다 — 안 채우면 성숙 치트를 써도 빵을 한 개도 못 굽는다(원가가 통에서 나간다).
      // 품질까지 실어 주는 이유: 등급이 통 반죽으로 결정되므로(GDD §6-2 개정) 빈 품질로 채우면
      // 치트로 구운 빵이 죄다 납작하게 나온다. 활발(1.0)·순한(산미 10) 로트 = 어떤 레시피든 최고 가능.
      const need = 1_000 - env.shared.pantry;
      if (need > 0) addLot({ g: need, act: 1.0, acid: 10, flour: 'white' });
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
