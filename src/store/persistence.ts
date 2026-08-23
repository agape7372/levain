// 저장 envelope 직렬화·버전·복구 (ARCHITECTURE §3).
// 복구 사다리 2계층: 주 파싱+범위 가드 → 실패 시 미러 → 실패 시 null(호출자가 새 게임).
// NaN·범위 밖 숫자는 버리지 않고 clamp로 살린다 — 필드 하나 때문에 기록 전체를 잃지 않는다.
import type { BakeGrade, CollectionEntry, FeedRatio, Location, SimState } from '../sim';
import { RATIOS, TEMP_MULT } from '../sim';
// MASS_MAX·ACID_MAX는 sim/index.ts가 재수출하지 않는데 sim/**는 M2 범위 밖(수정 금지)이다.
// 범위 수치를 여기에 하드코딩하지 않기 위해(CLAUDE.md 규칙 9) constants에서 직접 가져온다.
import { ACID_MAX, MASS_MAX, SEED_G } from '../sim/constants';
import type { StorageAdapter } from '../platform/storage';

export const SCHEMA_VERSION = 1;

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
}

export interface SaveEnvelope {
  schemaVersion: number;
  savedAt: number;
  sim: SimState;
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

export const defaultFlags = (): SaveFlags => ({ onboarded: false, pendingBake: null });

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
    };
  }
  return out;
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
  };
}

/** sim 필드는 하나라도 키가 없으면 복구 불가 — 파생 모델이라 빠진 값을 지어낼 수 없다 */
const SIM_KEYS = [
  'createdAt', 'lastFedAt', 'lastSimulatedAt', 'feedRatio', 'location',
  'locAnchorAt', 'effBaseMs', 'acidity', 'maturity', 'mass',
  'reviveProgress', 'collection',
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
    location: typeof loc === 'string' && has(TEMP_MULT, loc) ? (loc as Location) : 'room',
    locAnchorAt,
    effBaseMs: num(v.effBaseMs, 0, Number.MAX_SAFE_INTEGER, 0),
    acidity: num(v.acidity, 0, ACID_MAX, 0),
    maturity: Math.round(num(v.maturity, 0, Number.MAX_SAFE_INTEGER, 0)),
    mass: num(v.mass, SEED_G, MASS_MAX, SEED_G),
    reviveProgress: revive === 1 ? 1 : 0,
    // null이 정상 도메인 값이라 키 부재도 null로 받는다
    lastDiscardBakeAt: finite(v.lastDiscardBakeAt),
    collection: collectionOf(v.collection),
    label: typeof v.label === 'string' ? v.label : null,
  };
}

/**
 * 손으로 쓴 타입·범위 가드. 현행(v1) 스키마 기준이다 —
 * 첫 실제 마이그레이션이 생기면 migrate를 이 검증 **앞**으로 옮겨야 한다
 * (구버전 저장본이 신버전 가드에 걸려 null이 되는 사고 방지).
 */
export function validateAndClamp(raw: unknown): SaveEnvelope | null {
  if (!isObject(raw)) return null;

  const schemaVersion = finite(raw.schemaVersion);
  if (schemaVersion === null) return null;
  if (schemaVersion > SCHEMA_VERSION) return null; // 다운그레이드 불가 — 미래 저장본은 읽지 않는다

  const savedAt = finite(raw.savedAt);
  if (savedAt === null) return null;

  const sim = simOf(raw.sim);
  if (sim === null) return null;

  return {
    schemaVersion,
    savedAt,
    sim,
    settings: settingsOf(raw.settings),
    flags: flagsOf(raw.flags),
  };
}

// ── 마이그레이션 ─────────────────────────────────────────────────────────────
// 현행 schemaVersion 1. 1 미만 버전은 존재한 적이 없어 체인은 비어 있다.
// 규약: MIGRATIONS[v]는 v → v+1 변환. 반환값의 schemaVersion은 루프가 채운다.

const MIGRATIONS: Record<number, (e: Record<string, unknown>) => Record<string, unknown>> = {};

export function migrate(env: SaveEnvelope): SaveEnvelope | null {
  if (env.schemaVersion > SCHEMA_VERSION) return null;
  let cur = env as unknown as Record<string, unknown>;
  for (let v = env.schemaVersion; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return null; // 체인이 끊겼다 — 조용히 새 게임이 낫다
    cur = { ...step(cur), schemaVersion: v + 1 };
  }
  return cur as unknown as SaveEnvelope;
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
  const validated = validateAndClamp(parsed);
  return validated === null ? null : migrate(validated);
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
