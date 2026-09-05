// 저장 왕복·가드·복구 사다리 (ARCHITECTURE §3, §7 표) + v1→v2 마이그레이션 (확장기획 §5-2).
import { describe, expect, it } from 'vitest';
import {
  bakeScore, gradeOf, initialState, recipeById,
  PANTRY_LEGACY_ACIDITY, PANTRY_LEGACY_ACTIVITY, PANTRY_LOT_MAX, lotsSum,
} from '../src/sim';
import type { Flour, PantryLot } from '../src/sim';
import type { StorageAdapter } from '../src/platform/storage';
import {
  SCHEMA_VERSION,
  load,
  migrate,
  save,
  validateAndClamp,
  type SaveEnvelope,
  emptyInventory,
  emptyLots,
} from '../src/store/persistence';
import { emptyEconomy } from '../src/store/economy';

const T0 = 1_700_000_000_000;

function envelopeAt(now = T0): SaveEnvelope {
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
    settings: { muted: true, haptics: false, notifyEnabled: true, notifyPeak: false, notifySour: true, notifyStage: true, notifyFirstWeek: true, quietStartH: 22, quietEndH: 8 },
    flags: { onboarded: true, pendingBake: { recipeId: 'loaf', grade: 'best' }, retapHints: 0 },
  };
}

/** 마이그레이션 입력용 v1 저장본 — v1 시절 실제 모양(sim 안에 label·collection) */
function v1EnvelopeAt(now = T0): Record<string, unknown> {
  return {
    schemaVersion: 1,
    savedAt: now,
    sim: {
      ...initialState(now),
      label: '우리집르방',
      collection: {
        loaf: { bestGrade: 'good', count: 3, firstAt: now - 1000 },
        pancake: { bestGrade: null, count: 1, firstAt: now - 500 },
      },
      flake: { madeAt: now - 2000, maturity: 7 },
    },
    settings: { muted: true, haptics: false, notifyEnabled: true, notifyPeak: false, notifySour: true, notifyStage: true, notifyFirstWeek: true, quietStartH: 22, quietEndH: 8 },
    flags: { onboarded: true, pendingBake: null, retapHints: 0 },
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

/** 활성 sim을 통째로 unknown으로 다루기 위한 헬퍼 — 손상 저장본은 타입이 없다 */
function corrupt(patch: Record<string, unknown>, base: SaveEnvelope = envelopeAt()): unknown {
  const s0 = base.starters[0];
  return { ...base, starters: [{ ...s0, sim: { ...s0.sim, ...patch } }] };
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
    expect(env?.starters[0].sim.acidity).toBe(0);
  });

  it('범위를 넘은 mass·acidity를 경계로 접는다', () => {
    const over = validateAndClamp(corrupt({ mass: 999, acidity: 5000 }));
    expect(over?.starters[0].sim.mass).toBe(480);
    expect(over?.starters[0].sim.acidity).toBe(100);

    const under = validateAndClamp(corrupt({ mass: -20, acidity: -5, effBaseMs: -1 }));
    expect(under?.starters[0].sim.mass).toBe(60); // 씨앗 60g은 남는다
    expect(under?.starters[0].sim.acidity).toBe(0);
    expect(under?.starters[0].sim.effBaseMs).toBe(0);
  });

  it('enum이 어긋나면 기본값으로 되돌린다', () => {
    const env = validateAndClamp(corrupt({ feedRatio: '9:9:9', location: 'moon', reviveProgress: 7 }));
    expect(env?.starters[0].sim.feedRatio).toBe('1:1:1');
    expect(env?.starters[0].sim.location).toBe('room');
    expect(env?.starters[0].sim.reviveProgress).toBe(0);
  });

  it('settings·flags·shared가 없으면 기본값을 채운다', () => {
    const base = envelopeAt();
    const env = validateAndClamp({
      schemaVersion: SCHEMA_VERSION,
      savedAt: base.savedAt,
      starters: base.starters,
    });
    expect(env?.settings).toEqual({
      muted: false, haptics: true, notifyEnabled: true,
      // 2026-09-03: 옵트인 알림 4종 전부 기본 on (하루 상한 2건이 스팸을 막는다)
      notifyPeak: true, notifySour: true, notifyStage: true, notifyFirstWeek: true,
      quietStartH: 22, quietEndH: 8,
    });
    expect(env?.flags).toEqual({ onboarded: false, pendingBake: null, retapHints: 0 });
    expect(env?.shared).toEqual({
      collection: {}, inventory: emptyInventory(), economy: emptyEconomy(),
      pantry: 0, ads: [], pantryLots: emptyLots(),
    });
    expect(env?.activeStarterId).toBe('s1'); // 없는 activeStarterId → 첫 르방
    expect(env?.nextStarterOrdinal).toBe(2); // max(ordinal)+1 바닥
  });

  it('shared.collection의 불량 항목만 버리고 나머지는 남긴다 (starterId 보존)', () => {
    const base = envelopeAt();
    const env = validateAndClamp({
      ...base,
      shared: {
        collection: {
          loaf: { bestGrade: 'good', count: 3, firstAt: T0, starterId: 's1' },
          ghost: { bestGrade: 'good', count: 1, firstAt: 'yesterday' },
          rye: { bestGrade: 'wrong', count: NaN, firstAt: T0 },
        },
      },
    });
    expect(env?.shared.collection.loaf).toEqual({ bestGrade: 'good', count: 3, firstAt: T0, starterId: 's1' });
    expect(env?.shared.collection.ghost).toBeUndefined();
    expect(env?.shared.collection.rye).toEqual({ bestGrade: null, count: 1, firstAt: T0 });
  });

  it('starters 항목 단위 관대: sim이 죽은 항목만 버리고, activeStarterId가 죽은 항목을 가리키면 첫 생존자로', () => {
    const base = envelopeAt();
    const good = base.starters[0];
    const env = validateAndClamp({
      ...base,
      starters: [
        { id: 's2', name: '유령', ordinal: 2, sim: { createdAt: T0 } }, // 필드 부재 → 폐기
        { ...good, id: 's3', ordinal: 3, name: '생존' },
      ],
      activeStarterId: 's2',
      nextStarterOrdinal: 1, // 바닥 미달 → max(ordinal)+1로 승격
    });
    expect(env?.starters.map((s) => s.id)).toEqual(['s3']);
    expect(env?.activeStarterId).toBe('s3');
    expect(env?.nextStarterOrdinal).toBe(4);
  });

  it('id 중복은 방어적으로 유일화한다', () => {
    const base = envelopeAt();
    const s = base.starters[0];
    const env = validateAndClamp({
      ...base,
      starters: [s, { ...s, ordinal: 2 }], // 같은 id 's1' 두 번
    });
    expect(env?.starters).toHaveLength(2);
    expect(new Set(env?.starters.map((r) => r.id)).size).toBe(2);
  });
});

describe('validateAndClamp — 복구 불가면 null', () => {
  it('starters가 통째로 없으면 null', () => {
    const base = envelopeAt();
    expect(
      validateAndClamp({ schemaVersion: SCHEMA_VERSION, savedAt: base.savedAt, settings: base.settings }),
    ).toBeNull();
  });

  it('sim 필드가 빠지면 그 항목이 죽고, 전 항목이 죽으면 null', () => {
    const base = envelopeAt();
    const sim: Record<string, unknown> = { ...base.starters[0].sim };
    delete sim.maturity;
    expect(validateAndClamp({ ...base, starters: [{ ...base.starters[0], sim }] })).toBeNull();
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

describe('migrate — v1 → v2 (순서: migrate가 검증보다 먼저)', () => {
  it('현행 버전은 그대로 통과시킨다', () => {
    const env = envelopeAt();
    expect(migrate(env)).toEqual(env);
  });

  it('체인에 없는 과거 버전은 null (조용히 새 게임)', () => {
    expect(migrate({ ...envelopeAt(), schemaVersion: 0 })).toBeNull();
  });

  it('v1 저장본: label→name·collection→shared(starterId 부여)·flake 무손실, active/ordinal 초기화', () => {
    const raw = v1EnvelopeAt();
    const env = validateAndClamp(migrate(raw));

    expect(env).not.toBeNull();
    expect(env?.schemaVersion).toBe(2);
    expect(env?.starters).toHaveLength(1);
    const s0 = env!.starters[0];
    expect(s0.name).toBe('우리집르방'); // 이름을 잃지 않는다
    expect(s0.ordinal).toBe(1);
    expect(env?.activeStarterId).toBe(s0.id);
    expect(env?.nextStarterOrdinal).toBe(2);
    // sim 물리 무손실
    const v1sim = raw.sim as Record<string, unknown>;
    expect(s0.sim.createdAt).toBe(v1sim.createdAt);
    expect(s0.sim.lastFedAt).toBe(v1sim.lastFedAt);
    expect(s0.sim.maturity).toBe(v1sim.maturity);
    expect(s0.sim.flake).toEqual({ madeAt: T0 - 2000, maturity: 7 });
    // 도감 전역 승격 + 기존 기록 starterId = 첫 르방 (§5-2)
    expect(env?.shared.collection.loaf).toEqual({
      bestGrade: 'good', count: 3, firstAt: T0 - 1000, starterId: s0.id,
    });
    expect(env?.shared.collection.pancake).toEqual({
      bestGrade: null, count: 1, firstAt: T0 - 500, starterId: s0.id,
    });
  });

  it('v1 label 없음(구세이브) → name null', () => {
    const raw = v1EnvelopeAt();
    delete (raw.sim as Record<string, unknown>).label;
    const env = validateAndClamp(migrate(raw));
    expect(env?.starters[0].name).toBeNull();
  });

  it('v1 쓰레기 sim → 이전과 동일하게 새 게임(null)', () => {
    const env = validateAndClamp(migrate({ schemaVersion: 1, savedAt: T0, sim: { createdAt: T0 } }));
    expect(env).toBeNull();
  });

  it('v1 실저장본 JSON 왕복: 문자열 → load → v2 envelope → save → load 동일', async () => {
    const store = memStorage({ primary: JSON.stringify(v1EnvelopeAt()) });
    const first = await load(store.adapter);
    expect(first).not.toBeNull();
    expect(first?.envelope.schemaVersion).toBe(2);
    expect(first?.envelope.starters[0].name).toBe('우리집르방');

    save(first!.envelope, store.adapter);
    const second = await load(store.adapter);
    expect(second?.envelope).toEqual(first?.envelope); // v2 재왕복 무손실
  });
});

// 보관 통 로트 원장 (GDD §6-2 개정 2026-09-05) — pantry(스칼라 g)는 미러로 남고 원장이 본체다.
// 롤백 계약: 옛 번들(1.4.x)은 pantryLots를 조용히 버리고 g만 읽는다 → 다시 올라오면
// 키 부재 = 레거시 로트로 물질화. 그 왕복에서 세이브가 죽지 않는 것을 여기서 지킨다.
describe('sharedOf — 보관 통 로트 원장', () => {
  /** shared만 갈아 끼운 raw 저장본 — validateAndClamp에 그대로 먹인다 */
  const sharedWith = (patch: Record<string, unknown>): unknown => ({
    ...envelopeAt(),
    shared: { collection: {}, inventory: emptyInventory(), economy: emptyEconomy(), ads: [], ...patch },
  });

  const lot = (g: number, act: number, acid: number, flour: Flour = 'white'): PantryLot =>
    ({ g, act, acid, flour });

  it('원장을 왕복에서 그대로 보존한다 (순서 포함 — 순서가 동률·병합의 기준이다)', async () => {
    const store = memStorage();
    const base = envelopeAt();
    const env: SaveEnvelope = {
      ...base,
      shared: {
        ...base.shared,
        pantry: 300,
        pantryLots: [lot(100, 0.4, 60, 'rye'), lot(200, 1, 20)],
      },
    };
    expect(save(env, store.adapter)).toBe(true);
    const result = await load(store.adapter);
    expect(result?.envelope.shared).toEqual(env.shared);
  });

  it('pantryLots가 없으면 g을 레거시 품질 로트 하나로 물질화한다 (1.4.x 저장본)', () => {
    const env = validateAndClamp(sharedWith({ pantry: 200 }));
    expect(env?.shared.pantryLots).toEqual([
      { g: 200, act: PANTRY_LEGACY_ACTIVITY, acid: PANTRY_LEGACY_ACIDITY, flour: 'white' },
    ]);
    expect(env?.shared.pantry).toBe(200); // 미러는 그대로
  });

  it('레거시 로트는 선호 범위 안 빵을 best로, 호밀빵을 good으로 굽는다', () => {
    const env = validateAndClamp(sharedWith({ pantry: 200 }))!;
    const [l] = env.shared.pantryLots;
    expect(gradeOf(bakeScore(recipeById('flatbread')!, l.act, l.acid, l.flour))).toBe('best');
    expect(gradeOf(bakeScore(recipeById('rye')!, l.act, l.acid, l.flour))).toBe('good');
  });

  it('불량 로트만 개별로 버린다 — 나머지 원장은 산다', () => {
    const env = validateAndClamp(sharedWith({
      pantry: 120,
      pantryLots: [
        lot(50, 0.9, 10),
        '로트 아님',
        { g: 0, act: 1, acid: 0, flour: 'white' },   // 0g = 자리만 차지
        { g: 70, act: 5, acid: -3, flour: '호밀' },  // 범위·enum 불량 → clamp
      ],
    }));
    expect(env?.shared.pantryLots).toEqual([
      { g: 50, act: 0.9, acid: 10, flour: 'white' },
      { g: 70, act: 1, acid: 0, flour: 'white' },
    ]);
  });

  it('Σg < pantry (옛 번들이 g만 늘린 롤백 경로) → 부족분을 레거시 로트로 맨 앞에 넣는다', () => {
    const env = validateAndClamp(sharedWith({
      pantry: 300,
      pantryLots: [lot(100, 1, 5)],
    }));
    // 맨 앞 = 가장 오래된 자리 = 다음 빵에 먼저 나가는 자리
    expect(env?.shared.pantryLots).toEqual([
      { g: 200, act: PANTRY_LEGACY_ACTIVITY, acid: PANTRY_LEGACY_ACIDITY, flour: 'white' },
      { g: 100, act: 1, acid: 5, flour: 'white' },
    ]);
  });

  it('Σg > pantry → 앞(오래된 것)부터 잘라 미러에 맞춘다', () => {
    const env = validateAndClamp(sharedWith({
      pantry: 120,
      pantryLots: [lot(100, 0.2, 90), lot(100, 1, 10)], // 합 200 → 80 잘라낸다
    }));
    expect(env?.shared.pantryLots).toEqual([
      { g: 20, act: 0.2, acid: 90, flour: 'white' }, // 오래된 쪽이 깎인다
      { g: 100, act: 1, acid: 10, flour: 'white' },
    ]);
    expect(lotsSum(env!.shared.pantryLots)).toBe(120);
  });

  it('통이 0이면 원장도 빈다 — 반죽만 남은 유령 상태를 만들지 않는다', () => {
    const env = validateAndClamp(sharedWith({ pantry: 0, pantryLots: [lot(500, 1, 0)] }));
    expect(env?.shared).toMatchObject({ pantry: 0, pantryLots: [] });
  });

  it('shared가 통째로 없어도 원장이 빈 배열로 착륙한다', () => {
    const base = envelopeAt();
    const env = validateAndClamp({
      schemaVersion: SCHEMA_VERSION, savedAt: base.savedAt, starters: base.starters,
    });
    expect(env?.shared.pantryLots).toEqual([]);
  });

  it('로트 상한을 넘긴 저장본은 가장 오래된 것부터 병합해 착륙한다', () => {
    const many = Array.from({ length: PANTRY_LOT_MAX + 4 }, () => lot(10, 1, 20));
    const env = validateAndClamp(sharedWith({ pantry: 10 * many.length, pantryLots: many }));
    expect(env?.shared.pantryLots.length).toBe(PANTRY_LOT_MAX);
    expect(lotsSum(env!.shared.pantryLots)).toBe(10 * many.length); // g은 한 톨도 안 샌다
  });

  it('불변식: 어떤 입력이든 Σ lots.g === pantry', () => {
    const cases: Record<string, unknown>[] = [
      { pantry: 200 },
      { pantry: 300, pantryLots: [lot(100, 1, 5)] },
      { pantry: 120, pantryLots: [lot(100, 0.2, 90), lot(100, 1, 10)] },
      { pantry: 100, pantryLots: '원장 아님' },
      { pantry: 0, pantryLots: [lot(50, 1, 0)] },
      { pantry: 77, pantryLots: [] },
    ];
    for (const c of cases) {
      const env = validateAndClamp(sharedWith(c))!;
      expect(lotsSum(env.shared.pantryLots)).toBe(env.shared.pantry);
    }
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
    const broken = JSON.stringify({ ...env, starters: [] });
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
