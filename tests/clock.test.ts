// 시계 방어 — 정본: docs/GDD.md §3-8, docs/ARCHITECTURE.md §7
import { describe, it, expect } from 'vitest';
import { initialState, advance, deriveSnapshot, stageOf, HOUR, DAY } from '../src/sim';
import type { SimState } from '../src/sim';
import { createGameStore, newEnvelope } from '../src/store/gameStore';
import type { Clock } from '../src/platform/clock';
import type { StorageAdapter } from '../src/platform/storage';

const t0 = 1_700_000_000_000;

function populatedState(): SimState {
  return {
    ...initialState(t0),
    createdAt: t0 - 5 * DAY,
    lastFedAt: t0 - 2 * HOUR,
    lastSimulatedAt: t0,
    locAnchorAt: t0 - 2 * HOUR,
    lastDiscardBakeAt: t0 - 1 * HOUR,
    flake: { madeAt: t0 - 4 * HOUR, maturity: 3 },
  };
}

describe('clock — 시계 방어 (GDD §3-8)', () => {
  it('5분 초과 역행: 전 타임스탬프가 delta만큼 재정박, 상대 간격 보존, 크래시 없음', () => {
    const s = populatedState();
    const delta = 10 * HOUR;
    const now = t0 - delta;
    const result = advance(s, now);

    expect(result.createdAt).toBe(s.createdAt - delta);
    expect(result.lastFedAt).toBe(s.lastFedAt - delta);
    expect(result.lastSimulatedAt).toBe(s.lastSimulatedAt - delta);
    expect(result.locAnchorAt).toBe(s.locAnchorAt - delta);
    expect(result.lastDiscardBakeAt).toBe((s.lastDiscardBakeAt as number) - delta);
    // 도감 firstAt 재정박은 v2에서 전역(shared) 소유 — store 층 테스트(starters.test.ts)가 커버
    expect(result.flake!.madeAt).toBe(s.flake!.madeAt - delta);
    expect(result.flake!.maturity).toBe(s.flake!.maturity); // maturity는 시계값이 아니라 재정박 대상 아님

    // 상대 간격 보존
    expect(result.lastFedAt - result.createdAt).toBe(s.lastFedAt - s.createdAt);
    expect(result.lastSimulatedAt - result.lastFedAt).toBe(s.lastSimulatedAt - s.lastFedAt);
    expect(result.lastDiscardBakeAt! - result.lastFedAt).toBe(
      (s.lastDiscardBakeAt as number) - s.lastFedAt,
    );

    // 누적값(파생 아닌 것)은 재정박의 영향을 받지 않는다
    expect(result.acidity).toBe(s.acidity);
    expect(result.maturity).toBe(s.maturity);
  });

  it('5분 이내 역행: 상태 불변', () => {
    const s = populatedState();
    const now = t0 - 4 * 60_000; // 4분 전 — 허용 오차 내
    const result = advance(s, now);
    expect(result).toEqual(s);
  });

  it('60일 초과 점프: acidity는 60일 캡 시점과 동일(포화), lastSimulatedAt은 now로 갱신', () => {
    const capped = advance(initialState(t0), t0 + 60 * DAY);
    const over = advance(initialState(t0), t0 + 90 * DAY);

    expect(over.acidity).toBeCloseTo(capped.acidity, 5);
    expect(capped.lastSimulatedAt).toBe(t0 + 60 * DAY);
    expect(over.lastSimulatedAt).toBe(t0 + 90 * DAY); // 캡과 무관하게 실제 now로 갱신
  });

  it('역행 후 deriveSnapshot 정상: 나이 음수 없음, 단계 퇴행 없음', () => {
    const s = populatedState();
    const delta = 10 * HOUR;
    const now = t0 - delta;
    const rewound = advance(s, now);
    const snap = deriveSnapshot(rewound, now);

    expect(now - rewound.createdAt).toBeGreaterThanOrEqual(0);
    expect(snap.stage).toBeGreaterThanOrEqual(0);
    expect(stageOf(rewound, now)).toBe(stageOf(s, t0)); // 상대 나이 보존 → 단계 퇴행 없음
  });
});

// 재정박은 sim 밖 타임스탬프에도 걸린다 — GDD §3-8은 "향후 필드 포함 모든 타임스탬프"라고 쓴다.
// 광고 원장(shared.ads[].at)이 그 목록에서 빠져 있었다: 안 당기면 오늘 지급분이 "미래"로
// 밀려 sameLocalDay 산수에서 빠지고 하루 상한이 리셋된다 (D3).
describe('clock — 시계 역행 시 광고 원장 재정박 (GDD §3-8)', () => {
  it('shared.ads[].at이 delta만큼 당겨진다', () => {
    let t = t0;
    let raw: string | null = null;
    const clock: Clock = { now: () => t };
    const storage: StorageAdapter = {
      loadRaw: () => raw,
      saveRaw: (json: string) => { raw = json; return true; },
      mirror: () => {},
      loadMirror: async () => raw,
    };
    const base = newEnvelope(t0);
    const env = {
      ...base,
      shared: {
        ...base.shared,
        ads: [{ slot: 'delivery', at: t0 - HOUR }, { slot: 'delivery', at: t0 - 2 * HOUR }],
      },
    };
    const store = createGameStore({ clock, storage }, env);

    const delta = 10 * HOUR;
    t = t0 - delta;
    store.tick();

    expect(store.getAdLedger().map((g) => g.at)).toEqual([
      t0 - HOUR - delta,
      t0 - 2 * HOUR - delta,
    ]);
    // 원장 항목의 상대 간격도 보존된다 — 상한 산수가 흔들리지 않는다
    const [a, b] = store.getAdLedger();
    expect(a.at - b.at).toBe(HOUR);
  });

  it('5분 이내 역행이면 원장도 그대로', () => {
    let t = t0;
    let raw: string | null = null;
    const clock: Clock = { now: () => t };
    const storage: StorageAdapter = {
      loadRaw: () => raw,
      saveRaw: (json: string) => { raw = json; return true; },
      mirror: () => {},
      loadMirror: async () => raw,
    };
    const base = newEnvelope(t0);
    const store = createGameStore(
      { clock, storage },
      { ...base, shared: { ...base.shared, ads: [{ slot: 'delivery', at: t0 - HOUR }] } },
    );
    t = t0 - 4 * 60_000;
    store.tick();
    expect(store.getAdLedger()[0].at).toBe(t0 - HOUR);
  });
});
