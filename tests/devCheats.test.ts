// 개발자 치트가 레시피 해금 출처(stageMax)를 바로 올리는지 — 2026-11-14 「관리자 모드인데 레시피가 안 열려」
import { describe, it, expect } from 'vitest';
import { STAGES } from '../src/sim';
import { createGameStore, newEnvelope } from '../src/store/gameStore';
import type { Clock } from '../src/platform/clock';
import type { StorageAdapter } from '../src/platform/storage';

function freshStore() {
  const now = 1_700_000_000_000;
  let raw: string | null = null;
  const clock: Clock = { now: () => now };
  const storage: StorageAdapter = {
    loadRaw: () => raw,
    saveRaw: (json: string) => { raw = json; return true; },
    mirror: () => {},
    loadMirror: async () => raw,
  };
  return createGameStore({ clock, storage }, newEnvelope(now));
}

describe('개발자 치트 → 레시피 해금', () => {
  it('성숙 치트는 tick 없이 바로 집 최고 단계를 올린다', () => {
    const store = freshStore();
    expect(store.getHouseStage()).toBe(0);
    store.devMatureActive();
    expect(store.getHouseStage()).toBe(STAGES.length - 1);
  });

  it('도감 완성 치트는 레시피도 전부 연다', () => {
    const store = freshStore();
    store.devCompleteCollection();
    expect(store.getHouseStage()).toBe(STAGES.length - 1);
  });
});
