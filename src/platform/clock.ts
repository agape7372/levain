// 시간 소스 주입 — sim은 Clock조차 모른다. gameStore.tick만 이것을 받는다 (ARCHITECTURE §2).
export interface Clock {
  now(): number; // epoch ms
}

export const systemClock: Clock = { now: () => Date.now() };

/** 테스트 전용 — 시간 완전 제어 */
export class FakeClock implements Clock {
  constructor(private t: number) {}
  now(): number {
    return this.t;
  }
  set(t: number): void {
    this.t = t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}
