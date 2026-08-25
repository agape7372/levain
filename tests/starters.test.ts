// 멀티 르방 코어(store 층) — 확장기획 §5-1·§5-2·§5-4:
// 활성만 advance, 전환 시 catch-up 1회, 역행 재정박은 전 starter + 전역 도감,
// 도감 집계는 baked 이벤트로 store가 수행(전역·starterId 병기), 폐기 시 이름·도감 생존.
import { describe, it, expect } from 'vitest';
import { HOUR, DAY, STARTER_SLOTS_FREE, betterGrade } from '../src/sim';
import type { BakeGrade, SimEvent } from '../src/sim';
import type { StorageAdapter } from '../src/platform/storage';
import { FakeClock } from '../src/platform/clock';
import { createGameStore } from '../src/store/gameStore';
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

function makeStore(now = t0): { store: GameStore; clock: FakeClock; events: SimEvent[] } {
  const clock = new FakeClock(now);
  const store = createGameStore({ clock, storage: memStorage() });
  const events: SimEvent[] = [];
  store.subscribe((_snap, evs) => events.push(...evs));
  return { store, clock, events };
}

/** flatbread(3단계) 굽기가 가능한 활성 sim + 통(pantry)으로 조정 — 원가는 이제 통에서 나간다 */
function makeBakeReady(store: GameStore): void {
  const env = store.getEnvelope();
  const rec = env.starters.find((r) => r.id === env.activeStarterId)!;
  rec.sim = { ...rec.sim, maturity: 12, createdAt: rec.sim.createdAt - 9 * DAY, mass: 300 };
  store.grantPantry(1000); // 반복 굽기까지 여유 있게 — 게임 규칙을 안 타는 테스트 주입구
}

describe('starters — 생성·전환', () => {
  it('addStarter: 새 르방 생성 + 활성 전환, ordinal 증가·재사용 없음', () => {
    const { store } = makeStore();
    const rec = store.addStarter('둘째');
    expect(rec).not.toBeNull();
    expect(rec!.ordinal).toBe(2);
    expect(rec!.name).toBe('둘째');
    expect(store.getEnvelope().activeStarterId).toBe(rec!.id);
    expect(store.getEnvelope().nextStarterOrdinal).toBe(3);
    expect(store.getEnvelope().starters).toHaveLength(2);
  });

  it('슬롯 상한(STARTER_SLOTS_FREE)에서 addStarter는 null', () => {
    const { store } = makeStore();
    for (let i = 1; i < STARTER_SLOTS_FREE; i++) expect(store.addStarter()).not.toBeNull();
    expect(store.getEnvelope().starters).toHaveLength(STARTER_SLOTS_FREE);
    expect(store.addStarter()).toBeNull();
    expect(store.getEnvelope().starters).toHaveLength(STARTER_SLOTS_FREE);
  });

  it('switchStarter: 미지 id는 false, 전환 시 대상만 catch-up — 비활성은 그대로 둔다', () => {
    const { store, clock } = makeStore();
    store.addStarter(); // s2 활성
    expect(store.switchStarter('유령')).toBe(false);

    clock.advance(20 * HOUR); // s1은 t0에 밥 먹고 방치된 셈
    expect(store.switchStarter('s1')).toBe(true);
    // 전환 즉시 20h 경과가 정산돼 있다 (배고픔 14h 경계 초과)
    expect(store.getSnapshot().phase).toBe('hungry');
    // 떠나는 르방(s2)도 전환 시점에 정산된다 — 닫힌 함수라 언제 정산해도 결과 동일.
    // "진짜 비활성 방치"(활성이 tick 도는 동안 안 건드림)는 아래 역행 테스트가 커버.
    const s2 = store.getEnvelope().starters.find((r) => r.id === 's2')!;
    expect(s2.sim.lastSimulatedAt).toBe(t0 + 20 * HOUR);
    expect(s2.sim.lastFedAt).toBe(t0); // 정산은 시간 반영일 뿐 — 급여 시각은 불변
  });
});

describe('starters — 시계 역행: 전 starter + 전역 도감 재정박 (확장기획 §5-1)', () => {
  it('역행 delta가 비활성 르방·도감 firstAt에도 같이 적용된다 (공짜 휴식 없음)', () => {
    const { store, clock, events } = makeStore();
    makeBakeReady(store);
    store.dispatch({ type: 'bake', recipeId: 'flatbread' }); // 도감에 firstAt=t0 기록
    store.addStarter(); // s2 활성 (t0 생성)
    store.switchStarter('s1'); // s1 활성 복귀 — s2는 비활성

    clock.advance(2 * HOUR);
    store.tick(); // s1.lastSimulatedAt = t0+2h (전 starter 최댓값)

    const before = store.getEnvelope();
    const s2Before = before.starters.find((r) => r.id === 's2')!;

    const delta = 10 * HOUR;
    clock.set(t0 + 2 * HOUR - delta); // 최댓값 기준 10h 역행
    store.tick();

    const after = store.getEnvelope();
    const s1 = after.starters.find((r) => r.id === 's1')!;
    const s2 = after.starters.find((r) => r.id === 's2')!;
    // 활성: 재정박 후 now로 정산
    expect(s1.sim.lastSimulatedAt).toBe(clock.now());
    // 비활성: 같은 delta로 이동 — 상대 간격 보존, 나이 축소 없음
    expect(s2.sim.lastFedAt).toBe(s2Before.sim.lastFedAt - delta);
    expect(s2.sim.createdAt).toBe(s2Before.sim.createdAt - delta);
    expect(s2.sim.lastSimulatedAt).toBe(s2Before.sim.lastSimulatedAt - delta);
    // 전역 도감 firstAt도 같은 delta
    expect(after.shared.collection.flatbread.firstAt).toBe(t0 - delta);
    expect(events.some((e) => e.type === 'baked')).toBe(true);
  });
});

describe('starters — 도감 집계 (전역, baked 이벤트 경유)', () => {
  it('bake: count·firstAt·bestGrade·starterId — v1 sim 집계 규칙 그대로', () => {
    const { store, clock, events } = makeStore();
    makeBakeReady(store);

    store.dispatch({ type: 'bake', recipeId: 'flatbread' });
    const g1 = (events.find((e) => e.type === 'baked') as { grade: BakeGrade }).grade;
    let entry = store.getCollection().flatbread;
    expect(entry).toEqual({ bestGrade: g1, count: 1, firstAt: t0, starterId: 's1' });

    clock.advance(1 * HOUR);
    store.dispatch({ type: 'bake', recipeId: 'flatbread' });
    const g2 = (events.filter((e) => e.type === 'baked')[1] as { grade: BakeGrade }).grade;
    entry = store.getCollection().flatbread;
    expect(entry.count).toBe(2);
    expect(entry.firstAt).toBe(t0); // 최초 시각 보존
    expect(entry.bestGrade).toBe(betterGrade(g1, g2)); // 낮은 등급으로 덮어쓰지 않는다
    expect(entry.starterId).toBe('s1'); // 처음 구운 르방 유지
  });

  it('도감은 집의 기록: 다른 르방으로 전환해 구워도 한 도감에 쌓인다', () => {
    const { store } = makeStore();
    makeBakeReady(store);
    store.dispatch({ type: 'bake', recipeId: 'flatbread' });

    store.addStarter('둘째'); // s2 활성
    makeBakeReady(store);
    store.dispatch({ type: 'bake', recipeId: 'flatbread' });

    const entry = store.getCollection().flatbread;
    expect(entry.count).toBe(2);
    expect(entry.starterId).toBe('s1'); // 첫 기록 소유는 그대로
  });
});

describe('starters — 폐기: 이름·도감 생존 (확장기획 §11-2 승인 변경)', () => {
  it('moldy 폐기 후에도 StarterRecord.name·전역 도감이 남는다', () => {
    const { store } = makeStore();
    makeBakeReady(store);
    store.dispatch({ type: 'bake', recipeId: 'flatbread' });

    // 활성 sim을 moldy로 (유효 337h 방치)
    const env = store.getEnvelope();
    const rec = env.starters[0];
    rec.name = '르방이';
    rec.sim = {
      ...rec.sim,
      lastFedAt: t0 - 337 * HOUR,
      locAnchorAt: t0 - 337 * HOUR,
      lastSimulatedAt: t0,
    };
    expect(store.tick().phase).toBe('moldy');

    store.dispatch({ type: 'discardStarter' });
    expect(store.getSnapshot().phase).toBe('active'); // 새 개체
    expect(store.getActiveStarter().name).toBe('르방이'); // v1과 달리 이름 보존
    expect(store.getCollection().flatbread.count).toBe(1); // 도감은 집의 기록
  });
});
