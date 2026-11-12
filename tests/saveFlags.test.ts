// flags 선택 키 왕복 — dev(개발자 도구 허용, 기록 불러오기로만 켜진다 · T7-07)와
// pendingBake.variantId(미표시 굽기 결과의 변형 이름 · T7-22). 둘 다 없으면 키 자체가 없다(저장 버전 그대로).
import { describe, it, expect } from 'vitest';
import { initialState } from '../src/sim';
import { SCHEMA_VERSION, validateAndClamp, emptyInventory, emptyLots, type SaveEnvelope } from '../src/store/persistence';
import { emptyEconomy } from '../src/store/economy';

const T0 = 1_700_000_000_000;

function envWith(flags: Record<string, unknown>): SaveEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: T0,
    starters: [{ id: 's1', name: null, ordinal: 1, sim: initialState(T0) }],
    activeStarterId: 's1',
    nextStarterOrdinal: 2,
    shared: {
      collection: {}, inventory: emptyInventory(), economy: emptyEconomy(),
      pantry: 0, ads: [], pantryLots: emptyLots(),
    },
    settings: {
      muted: false, haptics: true, notifyEnabled: true, notifyPeak: true, notifySour: true,
      notifyStage: true, notifyFirstWeek: true, quietStartH: 22, quietEndH: 8,
    },
    flags: { onboarded: true, pendingBake: null, retapHints: 0, ...flags } as SaveEnvelope['flags'],
  };
}

const roundTrip = (env: SaveEnvelope): SaveEnvelope => validateAndClamp(JSON.parse(JSON.stringify(env)))!;

describe('flags 선택 키', () => {
  it('dev: true는 왕복 보존된다', () => {
    expect(roundTrip(envWith({ dev: true })).flags.dev).toBe(true);
  });

  it('dev가 없거나 true가 아니면 키가 없다', () => {
    expect('dev' in roundTrip(envWith({})).flags).toBe(false);
    expect('dev' in roundTrip(envWith({ dev: 'yes' })).flags).toBe(false);
  });

  // T2-02: flags만 깨진 저장본이 온보딩으로 빠져 완료 때 르방·도감이 지워졌다
  it('flags가 없거나 onboarded가 깨졌으면 르방이 있는 저장본은 onboarded true로 착륙한다', () => {
    const noFlags = JSON.parse(JSON.stringify(envWith({})));
    delete noFlags.flags;
    const restored = validateAndClamp(noFlags)!;
    expect(restored.flags.onboarded).toBe(true);
    expect(restored.starters.map((s) => s.id)).toEqual(['s1']);
    expect(roundTrip(envWith({ onboarded: 'true' })).flags.onboarded).toBe(true);
    expect(roundTrip(envWith({ onboarded: null })).flags.onboarded).toBe(true);
  });

  it('온보딩 전 저장본(onboarded false)은 그대로 false', () => {
    expect(roundTrip(envWith({ onboarded: false })).flags.onboarded).toBe(false);
  });

  it('pendingBake.variantId는 왕복 보존되고, 없으면 지금 모양 그대로', () => {
    const v = { recipeId: 'scone', grade: 'good', variantId: 'scone--choco-chip' };
    expect(roundTrip(envWith({ pendingBake: v })).flags.pendingBake).toEqual(v);
    const plain = { recipeId: 'scone', grade: 'good' };
    expect(roundTrip(envWith({ pendingBake: plain })).flags.pendingBake).toEqual(plain);
  });
});
