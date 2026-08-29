// 건조 플레이크(죽음 보험) — 정본: docs/GDD.md §3-7, src/sim/actions.ts makeFlake/discardStarter/restoreFlake
import { describe, it, expect } from 'vitest';
import { initialState, applyAction, phaseAt, HOUR, DAY } from '../src/sim';
import type { SimState } from '../src/sim';
import type { StorageAdapter } from '../src/platform/storage';
import { SCHEMA_VERSION, emptyInventory, load, save, validateAndClamp, type SaveEnvelope } from '../src/store/persistence';
import { emptyEconomy } from '../src/store/economy';

const t0 = 1_700_000_000_000;

function stage3Fixture(): SimState {
  return { ...initialState(t0), maturity: 12, createdAt: t0 - 9 * DAY };
}

describe('flake — makeFlake 게이트 (3단계 해금, 활발 상태, mass ≥80)', () => {
  it('stage<3 → flakeBlocked stage', () => {
    const s0 = initialState(t0);
    const result = applyAction(s0, { type: 'makeFlake' }, t0);
    expect(result.events).toEqual([{ type: 'flakeBlocked', reason: 'stage' }]);
    expect(result.state).toBe(s0);
  });

  it('활발 아님(15h, hungry phase) → flakeBlocked phase', () => {
    const stage3 = stage3Fixture();
    expect(phaseAt(stage3, t0 + 15 * HOUR)).toBe('hungry');
    const result = applyAction(stage3, { type: 'makeFlake' }, t0 + 15 * HOUR);
    expect(result.events).toEqual([{ type: 'flakeBlocked', reason: 'phase' }]);
    expect(result.state).toBe(stage3);
  });

  it('mass 79(<80) → flakeBlocked mass', () => {
    const lowMass: SimState = { ...stage3Fixture(), mass: 79 };
    const result = applyAction(lowMass, { type: 'makeFlake' }, t0);
    expect(result.events).toEqual([{ type: 'flakeBlocked', reason: 'mass' }]);
    expect(result.state).toBe(lowMass);
  });

  it('성공: mass -20, flake = { madeAt: now, maturity }', () => {
    const ok: SimState = { ...stage3Fixture(), mass: 100 };
    const result = applyAction(ok, { type: 'makeFlake' }, t0);
    expect(result.events).toEqual([{ type: 'flakeMade' }]);
    expect(result.state.mass).toBe(80);
    expect(result.state.flake).toEqual({ madeAt: t0, maturity: 12 });
  });
});

describe('flake — makeFlake 덮어쓰기', () => {
  it('기존 flake가 있어도 재실행하면 새 madeAt·maturity로 교체된다', () => {
    const withFlake: SimState = {
      ...stage3Fixture(),
      mass: 100,
      maturity: 20,
      flake: { madeAt: t0 - 5 * DAY, maturity: 5 },
    };
    const later = t0 + 2 * HOUR;
    const result = applyAction(withFlake, { type: 'makeFlake' }, later);
    expect(result.events).toEqual([{ type: 'flakeMade' }]);
    expect(result.state.flake).toEqual({ madeAt: later, maturity: 20 });
    expect(result.state.mass).toBe(80);
  });
});

describe('flake — discardStarter: moldy에서만 동작', () => {
  it('active에서는 상태 불변·이벤트 0 (살아있는 르방은 버릴 수 없다)', () => {
    const activeS = initialState(t0);
    const result = applyAction(activeS, { type: 'discardStarter' }, t0);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(activeS);
  });

  it('moldy: initialState 기반으로 새 개체 + flake 보존 + createdAt=now + maturity 0', () => {
    // v2: 도감·이름은 sim 밖 소유(전역/StarterRecord)라 폐기의 영향 자체를 받지 않는다 —
    // 이름은 v1과 달리 "보존"된다(확장기획 §11-2 승인 변경). store 층 테스트가 커버.
    const moldyWithData: SimState = {
      ...initialState(t0),
      lastFedAt: t0 - 337 * HOUR,
      locAnchorAt: t0 - 337 * HOUR,
      createdAt: t0 - 400 * HOUR,
      maturity: 15,
      flake: { madeAt: t0 - 100 * HOUR, maturity: 8 },
    };
    expect(phaseAt(moldyWithData, t0)).toBe('moldy');

    const result = applyAction(moldyWithData, { type: 'discardStarter' }, t0);
    expect(result.events).toEqual([{ type: 'starterDiscarded' }]);
    expect(result.state.flake).toBe(moldyWithData.flake);
    expect(result.state.createdAt).toBe(t0);
    expect(result.state.maturity).toBe(0);
  });
});

describe('flake — restoreFlake: 같은 계보로 복원 (부활 의식 경유)', () => {
  it('moldy → 복원: maturity floor(20×0.6)=12·reviveProgress 1·location room·acidity 0·mass 180·flake null, createdAt 보존', () => {
    const moldyState: SimState = {
      ...initialState(t0),
      lastFedAt: t0 - 337 * HOUR,
      // location=fridge라 wall 경과를 직접 쓰면 온도배율(0.08)에 밀려 moldy에 못 미친다 —
      // effBaseMs로 유효 경과를 직접 337h로 고정해 위치와 무관하게 moldy를 만든다
      locAnchorAt: t0,
      effBaseMs: 337 * HOUR,
      createdAt: t0 - 400 * HOUR,
      location: 'fridge',
      maturity: 20,
      flake: { madeAt: t0 - 100 * HOUR, maturity: 20 },
    };
    expect(phaseAt(moldyState, t0)).toBe('moldy');

    const result = applyAction(moldyState, { type: 'restoreFlake' }, t0);
    expect(result.events).toEqual([{ type: 'flakeRestored' }]);
    const restored = result.state;

    expect(restored.maturity).toBe(12);
    expect(restored.reviveProgress).toBe(1);
    expect(restored.location).toBe('room');
    expect(restored.acidity).toBe(0);
    expect(restored.mass).toBe(180);
    expect(restored.flake).toBeNull();
    expect(restored.createdAt).toBe(moldyState.createdAt); // stageOf 일수 게이트 유지 — 계보 보존

    // 유효 8h 후 feed → revived 이벤트·reviveProgress 0
    const fedResult = applyAction(restored, { type: 'feed', ratio: '1:1:1' }, t0 + 8 * HOUR);
    expect(fedResult.events).toContainEqual({ type: 'revived' });
    expect(fedResult.state.reviveProgress).toBe(0);
  });
});

// ── persistence: flake 왕복·가드 (ARCHITECTURE §3, §7) ──────────────────────

function envelopeAt(now = t0): SaveEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: now,
    starters: [{ id: 's1', name: null, ordinal: 1, sim: initialState(now) }],
    activeStarterId: 's1',
    nextStarterOrdinal: 2,
    shared: { collection: {}, inventory: emptyInventory(), economy: emptyEconomy(), pantry: 0, ads: [] },
    settings: { muted: true, haptics: false, notifyEnabled: true, notifyPeak: false, quietStartH: 22, quietEndH: 8 },
    flags: { onboarded: true, pendingBake: null, retapHints: 0 },
  };
}

/** 활성 sim을 통째로 unknown으로 다루기 위한 헬퍼 — 손상 저장본은 타입이 없다 (persistence.test.ts와 동일 패턴) */
function corrupt(patch: Record<string, unknown>, base: SaveEnvelope = envelopeAt()): unknown {
  const s0 = base.starters[0];
  return { ...base, starters: [{ ...s0, sim: { ...s0.sim, ...patch } }] };
}

function memStorage(): { adapter: StorageAdapter; primary: () => string | null } {
  let primaryVal: string | null = null;
  let mirrorVal: string | null = null;
  return {
    adapter: {
      loadRaw: () => primaryVal,
      saveRaw: (json: string) => {
        primaryVal = json;
        return true;
      },
      mirror: (json: string) => {
        mirrorVal = json;
      },
      loadMirror: async () => mirrorVal,
    },
    primary: () => primaryVal,
  };
}

describe('flake — persistence 왕복·가드', () => {
  it('flake 왕복: save → load 동일', async () => {
    const store = memStorage();
    const env = envelopeAt();
    env.starters[0].sim.flake = { madeAt: t0 - 10 * HOUR, maturity: 7 };

    expect(save(env, store.adapter)).toBe(true);
    const result = await load(store.adapter);
    expect(result?.envelope.starters[0].sim.flake).toEqual({ madeAt: t0 - 10 * HOUR, maturity: 7 });
  });

  it('flake 키 없는 구세이브 JSON → flake null로 생존 (전체 null 아님)', () => {
    const base = envelopeAt();
    const sim: Record<string, unknown> = { ...base.starters[0].sim };
    delete sim.flake;

    const env = validateAndClamp({ ...base, starters: [{ ...base.starters[0], sim }] });
    expect(env).not.toBeNull();
    expect(env?.starters[0].sim.flake).toBeNull();
    expect(env?.starters[0].sim.maturity).toBe(base.starters[0].sim.maturity); // 나머지 필드는 멀쩡
  });

  it('flake.maturity NaN → 0 clamp', () => {
    const env = validateAndClamp(corrupt({ flake: { madeAt: t0, maturity: NaN } }));
    expect(env?.starters[0].sim.flake).toEqual({ madeAt: t0, maturity: 0 });
  });

  it('flake.madeAt 비유한 → flake null', () => {
    const env1 = validateAndClamp(corrupt({ flake: { madeAt: Infinity, maturity: 5 } }));
    expect(env1?.starters[0].sim.flake).toBeNull();

    const env2 = validateAndClamp(corrupt({ flake: { madeAt: '어제', maturity: 5 } }));
    expect(env2?.starters[0].sim.flake).toBeNull();
  });
});
