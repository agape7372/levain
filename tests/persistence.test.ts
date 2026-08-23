// 저장 왕복·가드·복구 사다리 (ARCHITECTURE §3, §7 표).
import { describe, expect, it } from 'vitest';
import { initialState } from '../src/sim';
import type { StorageAdapter } from '../src/platform/storage';
import {
  SCHEMA_VERSION,
  load,
  migrate,
  save,
  validateAndClamp,
  type SaveEnvelope,
} from '../src/store/persistence';

const T0 = 1_700_000_000_000;

function envelopeAt(now = T0): SaveEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: now,
    sim: initialState(now),
    settings: { muted: true, haptics: false, notifyEnabled: true },
    flags: { onboarded: true, pendingBake: { recipeId: 'loaf', grade: 'best' } },
  };
}

interface MemStorage {
  adapter: StorageAdapter;
  primary(): string | null;
  mirror(): string | null;
}

function memStorage(seed: { primary?: string | null; mirror?: string | null; readOnly?: boolean } = {}): MemStorage {
  let primaryVal = seed.primary ?? null;
  let mirrorVal = seed.mirror ?? null;
  return {
    adapter: {
      loadRaw: () => primaryVal,
      saveRaw: (json: string) => {
        if (seed.readOnly) return false;
        primaryVal = json;
        return true;
      },
      mirror: (json: string) => {
        mirrorVal = json;
      },
      loadMirror: async () => mirrorVal,
    },
    primary: () => primaryVal,
    mirror: () => mirrorVal,
  };
}

/** sim을 통째로 unknown으로 다루기 위한 헬퍼 — 손상 저장본은 타입이 없다 */
function corrupt(patch: Record<string, unknown>, base: SaveEnvelope = envelopeAt()): unknown {
  return { ...base, sim: { ...base.sim, ...patch } };
}

describe('save/load 왕복', () => {
  it('저장한 envelope를 그대로 되읽는다', async () => {
    const store = memStorage();
    const env = envelopeAt();

    expect(save(env, store.adapter)).toBe(true);
    const result = await load(store.adapter);

    expect(result).not.toBeNull();
    expect(result?.source).toBe('primary');
    expect(result?.envelope).toEqual(env);
  });

  it('저장 성공 시 미러에도 같은 원문을 남긴다', () => {
    const store = memStorage();
    save(envelopeAt(), store.adapter);
    expect(store.mirror()).toBe(store.primary());
  });

  it('주 저장이 실패하면 false를 돌려주고 미러도 건드리지 않는다', () => {
    const store = memStorage({ readOnly: true });
    expect(save(envelopeAt(), store.adapter)).toBe(false);
    expect(store.mirror()).toBeNull();
  });

  it('pendingBake를 왕복에서 보존한다', async () => {
    const store = memStorage();
    save(envelopeAt(), store.adapter);
    const result = await load(store.adapter);
    expect(result?.envelope.flags.pendingBake).toEqual({ recipeId: 'loaf', grade: 'best' });
  });
});

describe('validateAndClamp — 있는데 불량이면 살린다', () => {
  it('acidity NaN을 0으로 되살린다', () => {
    const env = validateAndClamp(corrupt({ acidity: NaN }));
    expect(env?.sim.acidity).toBe(0);
  });

  it('범위를 넘은 mass·acidity를 경계로 접는다', () => {
    const over = validateAndClamp(corrupt({ mass: 999, acidity: 5000 }));
    expect(over?.sim.mass).toBe(480);
    expect(over?.sim.acidity).toBe(100);

    const under = validateAndClamp(corrupt({ mass: -20, acidity: -5, effBaseMs: -1 }));
    expect(under?.sim.mass).toBe(60); // 씨앗 60g은 남는다
    expect(under?.sim.acidity).toBe(0);
    expect(under?.sim.effBaseMs).toBe(0);
  });

  it('enum이 어긋나면 기본값으로 되돌린다', () => {
    const env = validateAndClamp(corrupt({ feedRatio: '9:9:9', location: 'moon', reviveProgress: 7 }));
    expect(env?.sim.feedRatio).toBe('1:1:1');
    expect(env?.sim.location).toBe('room');
    expect(env?.sim.reviveProgress).toBe(0);
  });

  it('settings·flags가 없으면 기본값을 채운다', () => {
    const base = envelopeAt();
    const env = validateAndClamp({
      schemaVersion: SCHEMA_VERSION,
      savedAt: base.savedAt,
      sim: base.sim,
    });
    expect(env?.settings).toEqual({ muted: false, haptics: true, notifyEnabled: true });
    expect(env?.flags).toEqual({ onboarded: false, pendingBake: null });
  });

  it('collection의 불량 항목만 버리고 나머지는 남긴다', () => {
    const env = validateAndClamp(
      corrupt({
        collection: {
          loaf: { bestGrade: 'good', count: 3, firstAt: T0 },
          ghost: { bestGrade: 'good', count: 1, firstAt: 'yesterday' },
          rye: { bestGrade: 'wrong', count: NaN, firstAt: T0 },
        },
      }),
    );
    expect(env?.sim.collection.loaf).toEqual({ bestGrade: 'good', count: 3, firstAt: T0 });
    expect(env?.sim.collection.ghost).toBeUndefined();
    expect(env?.sim.collection.rye).toEqual({ bestGrade: null, count: 1, firstAt: T0 });
  });
});

describe('validateAndClamp — 복구 불가면 null', () => {
  it('sim이 통째로 없으면 null', () => {
    const base = envelopeAt();
    expect(
      validateAndClamp({ schemaVersion: SCHEMA_VERSION, savedAt: base.savedAt, settings: base.settings }),
    ).toBeNull();
  });

  it('sim 필드가 빠지면 null', () => {
    const base = envelopeAt();
    const sim: Record<string, unknown> = { ...base.sim };
    delete sim.maturity;
    expect(validateAndClamp({ ...base, sim })).toBeNull();
  });

  it('타임스탬프가 유한하지 않으면 null', () => {
    expect(validateAndClamp(corrupt({ lastFedAt: NaN }))).toBeNull();
    expect(validateAndClamp(corrupt({ createdAt: Infinity }))).toBeNull();
    expect(validateAndClamp(corrupt({ locAnchorAt: '어제' }))).toBeNull();
  });

  it('객체가 아니면 null', () => {
    expect(validateAndClamp(null)).toBeNull();
    expect(validateAndClamp('저장본')).toBeNull();
    expect(validateAndClamp([envelopeAt()])).toBeNull();
  });

  it('미래 schemaVersion은 읽지 않는다 — 다운그레이드 불가', () => {
    const future = { ...envelopeAt(), schemaVersion: SCHEMA_VERSION + 1 };
    expect(validateAndClamp(future)).toBeNull();
    expect(migrate(future)).toBeNull();
  });
});

describe('migrate', () => {
  it('현행 버전은 그대로 통과시킨다', () => {
    const env = envelopeAt();
    expect(migrate(env)).toEqual(env);
  });

  it('체인에 없는 과거 버전은 null (조용히 새 게임)', () => {
    expect(migrate({ ...envelopeAt(), schemaVersion: 0 })).toBeNull();
  });
});

describe('복구 사다리', () => {
  it('주가 손상 JSON이면 미러로 내려간다', async () => {
    const env = envelopeAt();
    const store = memStorage({ primary: '{깨진 json', mirror: JSON.stringify(env) });

    const result = await load(store.adapter);
    expect(result?.source).toBe('mirror');
    expect(result?.envelope).toEqual(env);
  });

  it('주가 가드에 걸려도 미러가 멀쩡하면 미러를 쓴다', async () => {
    const env = envelopeAt();
    const broken = JSON.stringify({ ...env, sim: { createdAt: T0 } });
    const store = memStorage({ primary: broken, mirror: JSON.stringify(env) });

    const result = await load(store.adapter);
    expect(result?.source).toBe('mirror');
  });

  it('주도 미러도 못 읽으면 null — 호출자가 새 게임을 연다', async () => {
    const store = memStorage({ primary: '{깨진 json', mirror: 'null' });
    expect(await load(store.adapter)).toBeNull();
  });

  it('아무것도 저장된 적 없으면 null', async () => {
    expect(await load(memStorage().adapter)).toBeNull();
  });
});
