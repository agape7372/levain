// 승급 연출 대기열 — 천이 덮여 있거나 복귀 브리핑이 먼저 나가야 할 때 연출을 미룬다 (GDD §4, A3-05).
// 순서: 천 덮기 → 브리핑 → (천 걷을 때) 승급. 미룬 것은 사라지지 않고 큐에 남는다.
import type { SimEvent } from '../sim';

/** 연출 대기열의 한 칸 — 승급(from = 그 승급 전 집 최고 단계) 또는 가루 보상 */
export type Cheer = { stage: number; from: number } | { flour: number };

/** 이벤트에서 대기열에 실을 것. 가루 보상도 승급과 같은 길로 — 복귀 중 토스트가 브리핑 밑에 먼저 깔리지 않게 (L2) */
export function cheersOf(events: SimEvent[], from: number): Cheer[] {
  const out: Cheer[] = [];
  for (const e of events) {
    if (e.type === 'stageUp') out.push({ stage: e.stage, from });
    else if (e.type === 'flourEarned') out.push({ flour: e.amount });
  }
  return out;
}

export function createStageQueue<T>(cheer: (ups: T[]) => void, isCovered: () => boolean) {
  let queue: T[] = [];
  let resuming = false;
  return {
    /** 승급 통지 — 천이 덮였거나 복귀 처리 중이면 쌓고, 아니면 바로 연출 */
    offer(ups: T[]): void {
      if (ups.length === 0) return;
      if (resuming || isCovered()) queue.push(...ups);
      else cheer(ups);
    },
    /** 복귀 처리(catch-up)를 감싼다 — 그 안에서 난 승급은 브리핑 뒤로 */
    during<R>(fn: () => R): R {
      resuming = true;
      try {
        return fn();
      } finally {
        resuming = false;
      }
    },
    /** 쌓인 것을 연출. 천이 아직 덮여 있으면 두고 간다(걷을 때 drain) */
    flush(): void {
      if (isCovered()) return;
      this.drain();
    },
    /** 천을 걷는 순간 — 덮임 여부와 무관하게 비워서 연출 */
    drain(): void {
      if (queue.length === 0) return;
      const q = queue;
      queue = [];
      cheer(q);
    },
    size: () => queue.length,
  };
}
