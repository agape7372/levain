// 이름 짓기(renameActive) — v2에서 sim 밖(StarterRecord.name)으로 이동, 게이트·규칙은
// v1 setLabel과 동일: 5단계(노포) 해금·trim·12자 (GDD §4, D7: 확장 전 잠금).
import { describe, it, expect } from 'vitest';
import { LABEL_STAGE, DAY } from '../src/sim';
import type { SimEvent } from '../src/sim';
import type { StorageAdapter } from '../src/platform/storage';
import { FakeClock } from '../src/platform/clock';
import { createGameStore, newEnvelope } from '../src/store/gameStore';
import type { GameStore } from '../src/store/gameStore';

const t0 = 1_700_000_000_000;

function memStorage(): StorageAdapter {
  let primary: string | null = null;
  let mirror: string | null = null;
  return {
    loadRaw: () => primary,
    saveRaw: (json: string) => ((primary = json), true),
    mirror: (json: string) => {
      mirror = json;
    },
    loadMirror: async () => mirror,
  };
}

/** stage 5 상태의 store — createdAt만 backdate(-30d)+maturity 45, lastFedAt은 t0 유지
 *  (backdate하면 moldy/dormant로 빠져 게이트보다 곰팡이 차단이 먼저 먹는다) */
function makeStore(maturity: number): { store: GameStore; events: SimEvent[] } {
  const env = newEnvelope(t0);
  env.starters[0].sim = { ...env.starters[0].sim, createdAt: t0 - 30 * DAY, maturity };
  const store = createGameStore({ clock: new FakeClock(t0), storage: memStorage() }, env);
  const events: SimEvent[] = [];
  store.subscribe((_snap, evs) => events.push(...evs));
  return { store, events };
}

describe('renameActive — 해금 게이트 (LABEL_STAGE)', () => {
  it('5단계 미만이면 labelLocked, 이름 불변', () => {
    const { store, events } = makeStore(44);
    expect(store.getSnapshot().stage).toBe(LABEL_STAGE - 1);
    store.renameActive('우리집르방');
    expect(events).toEqual([{ type: 'labelLocked' }]);
    expect(store.getActiveStarter().name).toBeNull();
  });

  it('5단계면 이름이 저장되고 labeled 이벤트', () => {
    const { store, events } = makeStore(45);
    expect(store.getSnapshot().stage).toBe(LABEL_STAGE);
    store.renameActive('우리집르방');
    expect(events).toEqual([{ type: 'labeled' }]);
    expect(store.getActiveStarter().name).toBe('우리집르방');
  });

  it('앞뒤 공백은 잘리고 12자 초과는 잘려 저장된다', () => {
    const { store } = makeStore(45);
    store.renameActive('  가나다라마바사아자차카타파하  ');
    expect(store.getActiveStarter().name).toBe('가나다라마바사아자차카타');
    expect(store.getActiveStarter().name!.length).toBe(12);
  });

  it('공백뿐인 입력은 무시 — labeled 이벤트 0, 이름 불변', () => {
    const { store, events } = makeStore(45);
    store.renameActive('   ');
    expect(events.filter((e) => e.type === 'labeled' || e.type === 'labelLocked')).toEqual([]);
    expect(store.getActiveStarter().name).toBeNull();
  });

  it('이름은 덮어쓰기 가능하고 저장 왕복에서 보존된다', () => {
    const { store } = makeStore(45);
    store.renameActive('첫째');
    store.renameActive('둘째');
    expect(store.getActiveStarter().name).toBe('둘째');
    expect(store.getEnvelope().starters[0].name).toBe('둘째');
  });
});
