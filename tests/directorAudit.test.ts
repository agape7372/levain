// 2026-11-12 감사 통합분(총괄) — 단계 상승 알림(T8-01) · 깨진 저장 보관(T2-03) · 스냅샷 파생 필드
import { describe, it, expect } from 'vitest';
import { DAY, HOUR, STAGES, applyAction, deriveSnapshot, initialState } from '../src/sim';
import type { SimEvent, SimState } from '../src/sim';
import { createGameStore, initGameStore, newEnvelope } from '../src/store/gameStore';
import { loadDetailed, save } from '../src/store/persistence';
import type { Clock } from '../src/platform/clock';
import type { StorageAdapter } from '../src/platform/storage';

const t0 = 1_700_000_000_000;

function mem(initial: string | null = null) {
  let raw = initial;
  const kept: string[] = [];
  const storage: StorageAdapter = {
    loadRaw: () => raw,
    saveRaw: (json: string) => { raw = json; return true; },
    mirror: () => {},
    loadMirror: async () => null,
    keepBroken: (r: string) => { kept.push(r); },
  };
  return { storage, raw: () => raw, kept };
}

/** 급여 사이클은 다 채웠고 날짜만 모자란 르방 — 승급이 「시간이 지나서」 오는 흔한 경우 */
function waitingForDays(now: number, stage: number): SimState {
  const need = STAGES[stage];
  return {
    ...initialState(now),
    createdAt: now - (need.days * DAY - HOUR), // 한 시간 뒤면 날짜 조건이 찬다
    maturity: need.cycles,
  };
}

describe('단계 상승 알림 — 급여 없이 날짜로 넘는 승급 (감사 T8-01)', () => {
  it('tick이 집 최고 단계를 올리면 stageUp 이벤트가 나간다', () => {
    let t = t0;
    const clock: Clock = { now: () => t };
    const base = newEnvelope(t0);
    const env = { ...base, starters: [{ ...base.starters[0], sim: waitingForDays(t0, 1) }] };
    const store = createGameStore({ clock, storage: mem().storage }, env);
    expect(store.getHouseStage()).toBe(0);

    const seen: SimEvent[] = [];
    store.subscribe((_snap, events) => seen.push(...events));
    t = t0 + 2 * HOUR;
    store.tick();

    expect(store.getHouseStage()).toBe(1);
    expect(seen.filter((e) => e.type === 'stageUp')).toEqual([{ type: 'stageUp', stage: 1 }]);
    // 한 번만 — 다음 tick은 조용하다
    seen.length = 0;
    t += HOUR;
    store.tick();
    expect(seen.some((e) => e.type === 'stageUp')).toBe(false);
  });

  it('급여가 넘긴 승급은 sim의 stageUp 하나뿐 — 겹쳐 내지 않는다', () => {
    const t = t0;
    const clock: Clock = { now: () => t };
    const base = newEnvelope(t0);
    // 날짜는 찼고 사이클 하나가 모자란 르방 — 다음 급여(유효 6h↑)가 넘긴다
    const sim: SimState = {
      ...initialState(t0 - 8 * HOUR),
      createdAt: t0 - STAGES[1].days * DAY - HOUR,
      maturity: STAGES[1].cycles - 1,
    };
    const env = { ...base, starters: [{ ...base.starters[0], sim }] };
    const store = createGameStore({ clock, storage: mem().storage }, env);
    const events = store.dispatch({ type: 'feed', ratio: '1:1:1' });
    expect(events.filter((e) => e.type === 'stageUp')).toEqual([{ type: 'stageUp', stage: 1 }]);
  });

  it('앱이 꺼져 있는 동안 넘은 단계는 부트 결과(stageUps)에 실린다', async () => {
    const m = mem();
    const base = newEnvelope(t0);
    const env = { ...base, starters: [{ ...base.starters[0], sim: waitingForDays(t0, 2) }] };
    // 저장본의 집 최고 단계는 1 — 꺼져 있는 사이 2단계 날짜가 찬다
    const saved = { ...env, shared: { ...env.shared, economy: { ...env.shared.economy, stageMax: 1 } } };
    expect(save(saved, m.storage)).toBe(true);

    const clock: Clock = { now: () => t0 + 3 * HOUR };
    const res = await initGameStore({ clock, storage: m.storage });
    expect(res.isNew).toBe(false);
    expect(res.stageUps).toEqual([2]);
    // 다시 켜면 조용하다(저장본이 이미 2)
    const again = await initGameStore({ clock, storage: m.storage });
    expect(again.stageUps).toEqual([]);
  });
});

describe('읽을 수 없는 저장본 (감사 T2-03)', () => {
  it('원문을 따로 남기고 broken을 알린다 — 새 게임 저장이 덮기 전에', async () => {
    const m = mem('{"schemaVersion":2,"savedAt":17000'); // 잘린 파일
    const res = await loadDetailed(m.storage);
    expect(res).toEqual({ result: null, broken: true });
    expect(m.kept).toEqual(['{"schemaVersion":2,"savedAt":17000']);

    const boot = await initGameStore({ clock: { now: () => t0 }, storage: m.storage });
    expect(boot.isNew).toBe(true);
    expect(boot.brokenSave).toBe(true);
  });

  it('저장이 아예 없으면 broken이 아니다', async () => {
    const m = mem(null);
    expect(await loadDetailed(m.storage)).toEqual({ result: null, broken: false });
    expect(m.kept).toEqual([]);
  });
});

describe('스냅샷 파생 필드', () => {
  it('nextStage — 남은 급여 사이클과 날 수, 마지막 단계는 null', () => {
    const fresh = deriveSnapshot(initialState(t0), t0);
    expect(fresh.nextStage).toEqual({ feeds: STAGES[1].cycles, days: STAGES[1].days });
    const almost = deriveSnapshot(waitingForDays(t0, 1), t0);
    expect(almost.nextStage).toEqual({ feeds: 0, days: 1 }); // 한 시간 남음 → 올림 1일
    const top: SimState = { ...initialState(t0), createdAt: t0 - 60 * DAY, maturity: 99 };
    expect(deriveSnapshot(top, t0).nextStage).toBeNull();
  });

  it('discardReady — recipes.canBakeDiscard의 쿨다운과 같은 답', () => {
    const s: SimState = { ...initialState(t0 - 8 * HOUR), createdAt: t0 - 10 * DAY, maturity: 10 };
    expect(deriveSnapshot(s, t0).discardReady).toBe(true);
    const baked = applyAction(s, { type: 'bakeDiscard', recipeId: 'pancake' }, t0).state;
    expect(deriveSnapshot(baked, t0).discardReady).toBe(false);
    const fedAgain = applyAction(baked, { type: 'feed', ratio: '1:1:1' }, t0 + HOUR).state;
    expect(deriveSnapshot(fedAgain, t0 + HOUR).discardReady).toBe(true);
  });

  it('fakeRise — 갓 반죽의 둘째 날에 준 밥의 사이클만 (부피와 같은 기준, R-M1)', () => {
    const s = initialState(t0);
    expect(deriveSnapshot(s, t0 + 12 * HOUR).fakeRise).toBe(false);
    // 24h 전에 준 밥의 사이클은 평범하다 — 지금 나이가 둘째 날이어도 카드 행은 없다
    expect(deriveSnapshot(s, t0 + 30 * HOUR).fakeRise).toBe(false);
    expect(deriveSnapshot(s, t0 + 30 * HOUR).fill).toBeLessThan(deriveSnapshot(s, t0 + 30 * HOUR).peakFill + 1e-9);
    // 둘째 날에 밥을 주면 그 사이클 내내 켜져 있다(48h를 넘겨도 부피와 함께 유지)
    const fed = applyAction(s, { type: 'feed', ratio: '1:1:1' }, t0 + 30 * HOUR).state;
    const a = deriveSnapshot(fed, t0 + 33 * HOUR);
    expect(a.fakeRise).toBe(true);
    expect(deriveSnapshot(fed, t0 + 52 * HOUR).fakeRise).toBe(true);
    // 부피 계수와 같은 날 — 같은 시간 오프셋에서 평범한 사이클보다 더 부푼다
    const plain = deriveSnapshot(applyAction(s, { type: 'feed', ratio: '1:1:1' }, t0 + 12 * HOUR).state, t0 + 15 * HOUR);
    expect(a.peakFill).toBeGreaterThan(plain.peakFill);
    // 48h 뒤에 준 밥은 평범
    const late = applyAction(s, { type: 'feed', ratio: '1:1:1' }, t0 + 50 * HOUR).state;
    expect(deriveSnapshot(late, t0 + 53 * HOUR).fakeRise).toBe(false);
  });
});
