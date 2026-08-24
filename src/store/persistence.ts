// 저장 envelope 직렬화·버전·복구 (ARCHITECTURE §3).
// 복구 사다리 2계층: 주 파싱+범위 가드 → 실패 시 미러 → 실패 시 null(호출자가 새 게임).
// NaN·범위 밖 숫자는 버리지 않고 clamp로 살린다 — 필드 하나 때문에 기록 전체를 잃지 않는다.
// 파싱 순서: JSON.parse → migrate(raw) → validateAndClamp(현행 스키마) — 마이그레이션이
// 검증보다 먼저다. 구버전 저장본이 신버전 가드에 걸려 null(새 게임)이 되는 사고 방지.
import type { BakeGrade, CollectionEntry, FeedRatio, Flour, Location, SimState } from '../sim';
import { RATIOS, TEMP_MULT } from '../sim';
// MASS_MAX·ACID_MAX는 sim/index.ts가 재수출하지 않는데 sim/**는 M2 범위 밖(수정 금지)이다.
// 범위 수치를 여기에 하드코딩하지 않기 위해(CLAUDE.md 규칙 9) constants에서 직접 가져온다.
import { ACID_MAX, MASS_MAX, SEED_G, STAGES } from '../sim/constants';
import { INGREDIENTS } from '../sim/ingredients';
import type { IngredientId } from '../sim/ingredients';
import type { StorageAdapter } from '../platform/storage';
import type { EconomyState } from './economy';
import { emptyEconomy } from './economy';

/** v2: 멀티 르방 — starters[] + 전역 도감(shared). 확장기획 2026-08-24 §5 */
export const SCHEMA_VERSION = 2;

export interface SaveSettings {
  muted: boolean;
  haptics: boolean;
  notifyEnabled: boolean;
}

export interface PendingBake {
  recipeId: string;
  grade: string;
}

export interface SaveFlags {
  onboarded: boolean;
  /** 굽기 연출 도중 앱이 죽어도 결과를 다시 보여주기 위한 자리 */
  pendingBake: PendingBake | null;
  /** 레시피 탭 재탭 힌트 노출 횟수 (§8-1 — 3회까지만). 키 부재 = 0 (v2 무버전 추가 키) */
  retapHints: number;
}

/**
 * 르방 1개 = 물리(sim) + 정체성(id·name·ordinal). 개체 시드는 sim.createdAt에서 파생
 * (uMoldSeed 관행) — 파생 가능한 값은 저장하지 않는다.
 */
export interface StarterRecord {
  id: string;
  /** null이면 표시 시점에 "르방이 {ordinal}"로 파생 (저장하지 않는다) */
  name: string | null;
  /** 생성 순번 — 삭제해도 재사용 안 함 (nextStarterOrdinal이 보증) */
  ordinal: number;
  sim: SimState;
}

/** 집(계정) 소유 — 특정 르방이 죽거나 삭제돼도 남는 기록 */
export interface SharedState {
  collection: Record<string, CollectionEntry>;
  /** 재료함 (§8-2) — 전역, 형태 무관 재료 단위 수량. 키 부재 = {} (v2 내 무버전 추가 키) */
  inventory: Record<IngredientId, number>;
  /** 무료 경제 카운터 (§9 Phase 7) — 키 부재 = 전부 0 (inventory와 같은 무버전 착륙) */
  economy: EconomyState;
}

export interface SaveEnvelope {
  schemaVersion: number;
  savedAt: number;
  starters: StarterRecord[];
  activeStarterId: string;
  nextStarterOrdinal: number;
  shared: SharedState;
  settings: SaveSettings;
  flags: SaveFlags;
}

export type LoadSource = 'primary' | 'mirror';

export interface LoadResult {
  envelope: SaveEnvelope;
  source: LoadSource;
}

export const defaultSettings = (): SaveSettings => ({
  muted: false,
  haptics: true,
  notifyEnabled: true,
});

export const defaultFlags = (): SaveFlags => ({ onboarded: false, pendingBake: null, retapHints: 0 });

// ── 가드 원자 ────────────────────────────────────────────────────────────────
// 규칙 두 줄: 키가 없으면 복구 불가(null) / 있는데 불량이면 clamp·기본값.

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** lib이 ES2020이라 Object.hasOwn을 못 쓴다. 프로토타입 오염 방지 겸 자체 구현 */
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** 타임스탬프는 유한성만 검사한다 — 범위를 모르니 clamp할 수 없다 */
const finite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** 존재하지만 불량인 수치 살리기: 비유한 → fallback, 범위 밖 → 경계로 접기 */
const num = (v: unknown, lo: number, hi: number, fallback = lo): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
};

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

const GRADES: readonly BakeGrade[] = ['best', 'good', 'flat'];

function collectionOf(v: unknown): Record<string, CollectionEntry> {
  if (!isObject(v)) return {};
  const out: Record<string, CollectionEntry> = {};
  for (const [id, raw] of Object.entries(v)) {
    if (!isObject(raw)) continue;
    const firstAt = finite(raw.firstAt);
    if (firstAt === null) continue; // 시각을 모르는 기록은 살릴 방법이 없다
    const grade = raw.bestGrade;
    out[id] = {
      bestGrade: GRADES.includes(grade as BakeGrade) ? (grade as BakeGrade) : null,
      count: Math.max(1, Math.round(num(raw.count, 1, Number.MAX_SAFE_INTEGER, 1))),
      firstAt,
      // 어느 르방이 처음 구웠나 — 없어도 기록은 산다 (v1 이월분은 마이그레이션이 채움)
      ...(typeof raw.starterId === 'string' && raw.starterId ? { starterId: raw.starterId } : {}),
    };
  }
  return out;
}

export const emptyInventory = (): Record<IngredientId, number> =>
  Object.fromEntries(INGREDIENTS.map((i) => [i.id, 0])) as Record<IngredientId, number>;

function inventoryOf(v: unknown): Record<IngredientId, number> {
  const out = emptyInventory();
  if (!isObject(v)) return out;
  for (const ing of INGREDIENTS) {
    out[ing.id] = Math.round(num(v[ing.id], 0, 999, 0)); // 소프트캡 9는 경제(Phase 7) 소관 — 저장은 관대
  }
  return out;
}

/**
 * 경제 카운터 — 전부 단조 증가 정수. 잔액은 여기 없다(파생, economy.ts 주석).
 * 스키마 v3를 올리지 않는 이유는 flour·inventory와 동일: 1.1.0~1.2.x 클라이언트가 이
 * 저장본을 읽을 때 미지 키만 조용히 버리게 해서 OTA 롤백이 전멸이 되지 않게 한다.
 */
function economyOf(v: unknown): EconomyState {
  const d = emptyEconomy();
  if (!isObject(v)) return d;
  const int = (x: unknown): number => Math.round(num(x, 0, Number.MAX_SAFE_INTEGER, 0));
  return {
    feeds: int(v.feeds),
    bakes: int(v.bakes),
    stageMax: Math.round(num(v.stageMax, 0, STAGES.length - 1, 0)),
    exchanged: int(v.exchanged),
    spent: int(v.spent),
    gifted: bool(v.gifted, d.gifted),
  };
}

/** 전역(집) 소유 상태 — 하위 키가 없으면 기본값 (inventory가 예고대로 무이행 착륙, flour 패턴) */
function sharedOf(v: unknown): SharedState {
  if (!isObject(v)) {
    return { collection: {}, inventory: emptyInventory(), economy: emptyEconomy() };
  }
  return {
    collection: collectionOf(v.collection),
    inventory: inventoryOf(v.inventory),
    economy: economyOf(v.economy),
  };
}

function settingsOf(v: unknown): SaveSettings {
  const d = defaultSettings();
  if (!isObject(v)) return d;
  return {
    muted: bool(v.muted, d.muted),
    haptics: bool(v.haptics, d.haptics),
    notifyEnabled: bool(v.notifyEnabled, d.notifyEnabled),
  };
}

function flagsOf(v: unknown): SaveFlags {
  const d = defaultFlags();
  if (!isObject(v)) return d;
  const pb = v.pendingBake;
  return {
    onboarded: bool(v.onboarded, d.onboarded),
    pendingBake:
      isObject(pb) && typeof pb.recipeId === 'string' && typeof pb.grade === 'string'
        ? { recipeId: pb.recipeId, grade: pb.grade }
        : null,
    retapHints: Math.round(num(v.retapHints, 0, 9, 0)),
  };
}

/** sim 필드는 하나라도 키가 없으면 복구 불가 — 파생 모델이라 빠진 값을 지어낼 수 없다 */
const SIM_KEYS = [
  'createdAt', 'lastFedAt', 'lastSimulatedAt', 'feedRatio', 'location',
  'locAnchorAt', 'effBaseMs', 'acidity', 'maturity', 'mass',
  'reviveProgress',
] as const;

function simOf(v: unknown): SimState | null {
  if (!isObject(v)) return null;
  for (const k of SIM_KEYS) if (!has(v, k)) return null;

  // 타임스탬프 4종 — 유한하지 않으면 시간축이 무너진다
  const createdAt = finite(v.createdAt);
  const lastFedAt = finite(v.lastFedAt);
  const lastSimulatedAt = finite(v.lastSimulatedAt);
  const locAnchorAt = finite(v.locAnchorAt);
  if (createdAt === null || lastFedAt === null || lastSimulatedAt === null || locAnchorAt === null) {
    return null;
  }

  const ratio = v.feedRatio;
  const loc = v.location;
  const revive = v.reviveProgress;

  return {
    createdAt,
    lastFedAt,
    lastSimulatedAt,
    feedRatio: typeof ratio === 'string' && has(RATIOS, ratio) ? (ratio as FeedRatio) : '1:1:1',
    // v2 내 무버전 추가 필드 — 키 부재 = white (label 패턴, §7-2. 스키마 v3 안 올림:
    // 1.1.0 클라이언트가 이 저장본을 읽을 때 미지 키만 조용히 버리게 — 롤백 = 전멸 방지)
    flour: v.flour === 'wholewheat' || v.flour === 'rye' ? (v.flour as Flour) : 'white',
    location: typeof loc === 'string' && has(TEMP_MULT, loc) ? (loc as Location) : 'room',
    locAnchorAt,
    effBaseMs: num(v.effBaseMs, 0, Number.MAX_SAFE_INTEGER, 0),
    acidity: num(v.acidity, 0, ACID_MAX, 0),
    maturity: Math.round(num(v.maturity, 0, Number.MAX_SAFE_INTEGER, 0)),
    mass: num(v.mass, SEED_G, MASS_MAX, SEED_G),
    reviveProgress: revive === 1 ? 1 : 0,
    // null이 정상 도메인 값이라 키 부재도 null로 받는다
    lastDiscardBakeAt: finite(v.lastDiscardBakeAt),
    flake: flakeOf(v.flake), // 키 부재도 null — 구세이브(flake 이전)가 그대로 산다
  };
}

/** starter 항목 단위 관대 처리 — sim이 죽었으면 항목만 폐기 (collection 항목 관행) */
function starterOf(v: unknown, fallbackOrdinal: number): StarterRecord | null {
  if (!isObject(v)) return null;
  const sim = simOf(v.sim);
  if (sim === null) return null;
  const ordinal = Math.max(1, Math.round(num(v.ordinal, 1, Number.MAX_SAFE_INTEGER, fallbackOrdinal)));
  const id = typeof v.id === 'string' && v.id ? v.id : `s${ordinal}`;
  const rawName = typeof v.name === 'string' ? v.name.trim().slice(0, 12) : '';
  return { id, name: rawName || null, ordinal, sim };
}

function flakeOf(v: unknown): SimState['flake'] {
  if (!isObject(v)) return null;
  const madeAt = finite(v.madeAt);
  if (madeAt === null) return null; // 시각을 모르는 백업은 살릴 방법이 없다
  return { madeAt, maturity: Math.round(num(v.maturity, 0, Number.MAX_SAFE_INTEGER, 0)) };
}

/**
 * 손으로 쓴 타입·범위 가드 — **현행(v2) 스키마 전용**. migrate가 항상 선행되므로
 * 구버전 모양은 여기 도달하지 않는다 (v1 시절 주석이 예고한 순서 반전, 2026-08-24 시행).
 */
export function validateAndClamp(raw: unknown): SaveEnvelope | null {
  if (!isObject(raw)) return null;

  const schemaVersion = finite(raw.schemaVersion);
  if (schemaVersion !== SCHEMA_VERSION) return null; // 미래·과거 모양 모두 migrate 책임

  const savedAt = finite(raw.savedAt);
  if (savedAt === null) return null;

  // starters — 항목 단위 관대(불량 항목만 폐기). 0개가 되면 복구 불가(새 게임)
  if (!Array.isArray(raw.starters)) return null;
  const starters: StarterRecord[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.starters.length; i++) {
    const rec = starterOf(raw.starters[i], i + 1);
    if (rec === null) continue;
    let id = rec.id;
    while (seen.has(id)) id = `${id}+`; // 방어적 유일화 — 정상 저장본에선 발생 0
    seen.add(id);
    starters.push(id === rec.id ? rec : { ...rec, id });
  }
  if (starters.length === 0) return null;

  const activeRaw = raw.activeStarterId;
  const activeStarterId =
    typeof activeRaw === 'string' && seen.has(activeRaw) ? activeRaw : starters[0].id;
  const maxOrdinal = starters.reduce((m, s) => Math.max(m, s.ordinal), 0);
  const nextStarterOrdinal = Math.max(
    Math.round(num(raw.nextStarterOrdinal, 1, Number.MAX_SAFE_INTEGER, 1)),
    maxOrdinal + 1, // 순번 재사용 금지의 마지막 방어선
  );

  return {
    schemaVersion,
    savedAt,
    starters,
    activeStarterId,
    nextStarterOrdinal,
    shared: sharedOf(raw.shared),
    settings: settingsOf(raw.settings),
    flags: flagsOf(raw.flags),
  };
}

// ── 마이그레이션 ─────────────────────────────────────────────────────────────
// 규약: MIGRATIONS[v]는 v → v+1 변환, **raw(검증 전) 대상** — 필드 존재를 가정하지
// 말 것. 깨진 값은 통과시키고 v2 검증이 항목 단위로 걷어낸다(결과: v1 쓰레기 저장본은
// 이전과 동일하게 새 게임). 반환값의 schemaVersion은 루프가 채운다.

const MIGRATIONS: Record<number, (e: Record<string, unknown>) => Record<string, unknown>> = {
  // v1(단일 sim, sim 안 label·collection) → v2(starters[] + 전역 도감). 확장기획 §5-2.
  1: (e) => {
    const simRaw = isObject(e.sim) ? { ...e.sim } : {};
    const label = typeof simRaw.label === 'string' ? simRaw.label : null;
    const collectionRaw = isObject(simRaw.collection) ? simRaw.collection : {};
    delete simRaw.label;
    delete simRaw.collection;

    const id = 's1';
    const collection: Record<string, unknown> = {};
    for (const [rid, entry] of Object.entries(collectionRaw)) {
      // 기존 빵 기록에 starterId 없음 → 첫(유일) 르방을 기본값으로 (§5-2)
      collection[rid] = isObject(entry) ? { ...entry, starterId: id } : entry;
    }

    const out: Record<string, unknown> = {
      ...e,
      starters: [{ id, name: label, ordinal: 1, sim: simRaw }], // 이름을 잃지 않는다
      activeStarterId: id,
      nextStarterOrdinal: 2,
      shared: { collection },
    };
    delete out.sim;
    return out;
  },
};

/**
 * raw → 현행 스키마 raw. null = 읽을 수 없음(미래 버전·체인 끊김·버전 없음) →
 * 호출자는 새 게임. 검증은 하지 않는다 — validateAndClamp가 뒤따른다.
 */
export function migrate(raw: unknown): Record<string, unknown> | null {
  if (!isObject(raw)) return null;
  const v0 = finite(raw.schemaVersion);
  if (v0 === null) return null;
  if (v0 > SCHEMA_VERSION) return null; // 다운그레이드 불가 — 미래 저장본은 읽지 않는다
  let cur: Record<string, unknown> = raw;
  for (let v = v0; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return null; // 체인이 끊겼다 — 조용히 새 게임이 낫다
    cur = { ...step(cur), schemaVersion: v + 1 };
  }
  return cur;
}

// ── 입출력 ───────────────────────────────────────────────────────────────────

export function save(env: SaveEnvelope, storage: StorageAdapter): boolean {
  let json: string;
  try {
    json = JSON.stringify(env);
  } catch {
    return false;
  }
  let ok = false;
  try {
    ok = storage.saveRaw(json);
  } catch {
    return false;
  }
  if (!ok) return false;
  try {
    storage.mirror(json); // fire-and-forget — 미러 실패가 저장 성공을 뒤집지 않는다
  } catch {
    /* 미러는 보험일 뿐 */
  }
  return true;
}

function parseEnvelope(raw: string | null): SaveEnvelope | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const migrated = migrate(parsed); // 마이그레이션 먼저 — 검증은 현행 스키마만 안다
  return migrated === null ? null : validateAndClamp(migrated);
}

export async function load(storage: StorageAdapter): Promise<LoadResult | null> {
  let primaryRaw: string | null = null;
  try {
    primaryRaw = storage.loadRaw();
  } catch {
    primaryRaw = null;
  }
  const primary = parseEnvelope(primaryRaw);
  if (primary) return { envelope: primary, source: 'primary' };

  let mirrorRaw: string | null = null;
  try {
    mirrorRaw = await storage.loadMirror();
  } catch {
    mirrorRaw = null;
  }
  const mirror = parseEnvelope(mirrorRaw);
  if (mirror) return { envelope: mirror, source: 'mirror' };

  return null;
}
