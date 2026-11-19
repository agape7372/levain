// 승급 연출 순서 (A3-05): 천 덮기 → 브리핑 → (천 걷을 때) 승급 — 큐에 남는다.
import { describe, it, expect } from 'vitest';
import { cheersOf, createStageQueue } from '../src/ui/stageQueue';
import type { Cheer } from '../src/ui/stageQueue';

function make(covered = false) {
  const state = { covered };
  const cheered: number[][] = [];
  const q = createStageQueue<number>((u) => cheered.push(u), () => state.covered);
  return { q, state, cheered };
}

describe('승급 대기열', () => {
  it('천이 안 덮였고 복귀 중도 아니면 바로 연출한다', () => {
    const { q, cheered } = make();
    q.offer([2]);
    expect(cheered).toEqual([[2]]);
  });

  it('천이 덮여 있으면 쌓아 두고 걷을 때 한 번에 낸다', () => {
    const { q, state, cheered } = make(true);
    q.offer([2]);
    expect(cheered).toEqual([]);
    q.flush(); // 아직 덮임 — 그대로 둔다
    expect(q.size()).toBe(1);
    state.covered = false;
    q.drain();
    expect(cheered).toEqual([[2]]);
  });

  it('복귀 처리 중 난 승급은 브리핑 뒤(flush)까지 미뤄진다 — 천이 없어도', () => {
    const { q, cheered } = make(false);
    q.during(() => q.offer([3]));
    expect(cheered).toEqual([]);
    q.flush();
    expect(cheered).toEqual([[3]]);
  });

  it('복귀 중 천을 덮으면 flush 해도 걷을 때까지 큐에 남는다', () => {
    const { q, state, cheered } = make(false);
    state.covered = true; // 천을 resume보다 먼저 덮는다
    q.during(() => q.offer([3]));
    q.flush();
    expect(cheered).toEqual([]);
    expect(q.size()).toBe(1);
    q.drain();
    expect(cheered).toEqual([[3]]);
  });

  it('복귀 중 난 승급 보상 가루도 승급과 같이 브리핑 뒤로 — 토스트가 브리핑 밑에 먼저 깔리지 않는다 (L2)', () => {
    const cheered: Cheer[][] = [];
    const q = createStageQueue<Cheer>((u) => cheered.push(u), () => false);
    q.during(() => q.offer(cheersOf([
      { type: 'stageUp', stage: 3 },
      { type: 'flourEarned', amount: 12 },
      { type: 'moved', to: 'room' },
    ], 2)));
    expect(cheered).toEqual([]);
    q.flush();
    expect(cheered).toEqual([[{ stage: 3, from: 2 }, { flour: 12 }]]);
  });
});
