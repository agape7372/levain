// Snapshot→RenderParams 앵커·범위·스무딩 — 정본: docs/VISUAL.md §3-2·§3-3
import { describe, it, expect } from 'vitest';
import { toRenderParams, smoothParams } from '../src/render/renderParams';
import type { Snapshot } from '../src/sim';

const base: Snapshot = {
  phase: 'active',
  activity: 0,
  hunger: 0,
  sourness: 0,
  dormancy: 0,
  fill: 1.0,
  hooch: 0,
  smell: 'flour',
  stage: 2,
  mass: 200,
  nextFeedAt: 0,
  peakAt: 0,
  peakEndAt: 0,
  effSinceFeedMs: 0,
  moldStage: 'none',
  mold01: 0,
  moldDeadAt: 0,
  kahm: false,
  hasFlake: false,
};

describe('renderParams — 상태 앵커 (VISUAL §3-3)', () => {
  it('activity 1·hunger 0·dormancy 0 → breatheAmp≈0.055, bubbleDensity≈0.9, specStr 0.92(무광 페이스트 상한)', () => {
    const rp = toRenderParams({ ...base, activity: 1, fill: 1.4 });
    expect(rp.breatheAmp).toBeCloseTo(0.055, 5);
    expect(rp.bubbleDensity).toBeCloseTo(0.9, 5);
    expect(rp.specStr).toBeCloseTo(0.92, 5);
  });

  it('moldStage spot + mold01 0.01 → mold 바닥값 0.25 (예고 가시성)', () => {
    const rp = toRenderParams({ ...base, moldStage: 'spot', mold01: 0.01, dormancy: 1 });
    expect(rp.mold).toBeCloseTo(0.25, 5);
    const none = toRenderParams({ ...base, moldStage: 'none', mold01: 0 });
    expect(none.mold).toBe(0);
  });

  it('dormancy 1 → breatheAmp≈0.006(>0, 완전 정지 금지), bubbleDensity≈0, crust 0.8', () => {
    const rp = toRenderParams({ ...base, activity: 0, dormancy: 1, fill: 0.65 });
    expect(rp.breatheAmp).toBeCloseTo(0.006, 5);
    expect(rp.breatheAmp).toBeGreaterThan(0);
    expect(rp.bubbleDensity).toBeCloseTo(0, 5);
    expect(rp.crust).toBeCloseTo(0.8, 5);
  });
});

describe('renderParams — 범위 클램프·스무딩 수렴', () => {
  it('임의 극단 입력에도 전 출력이 문서 범위를 벗어나지 않는다 (fillY는 pass-through라 제외)', () => {
    // fillY = s.fill 그대로 통과(derive.ts에서 이미 클램프됨) — 여기선 유효값만 넣는다
    const extreme: Snapshot = {
      ...base,
      activity: 999,
      hunger: -50,
      sourness: 1e6,
      dormancy: -1e6,
      fill: 1.0,
      hooch: 42,
    };
    const rp = toRenderParams(extreme);

    for (const c of rp.color) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
    expect(rp.breatheAmp).toBeGreaterThanOrEqual(0.004);
    expect(rp.breatheAmp).toBeLessThanOrEqual(0.055);
    expect(rp.breathePeriod).toBeGreaterThanOrEqual(2.6);
    expect(rp.breathePeriod).toBeLessThanOrEqual(7.0);
    expect(rp.noiseSpeed).toBeGreaterThanOrEqual(0.1);
    expect(rp.noiseSpeed).toBeLessThanOrEqual(1.6);
    expect(rp.bubbleDensity).toBeGreaterThanOrEqual(0);
    expect(rp.bubbleDensity).toBeLessThanOrEqual(1);
    expect(rp.bubbleScale).toBeGreaterThanOrEqual(0.5);
    expect(rp.bubbleScale).toBeLessThanOrEqual(1.5);
    expect(rp.specStr).toBeGreaterThanOrEqual(0.1);
    expect(rp.specStr).toBeLessThanOrEqual(1.2);
    expect(rp.crust).toBeGreaterThanOrEqual(0);
    expect(rp.crust).toBeLessThanOrEqual(1);
    expect(rp.hoochAmt).toBeGreaterThanOrEqual(0);
    expect(rp.hoochAmt).toBeLessThanOrEqual(1);
  });

  it('smoothParams가 반복 호출로 target에 수렴한다', () => {
    const cur0 = toRenderParams({ ...base, activity: 0, fill: 1.0 });
    const target = toRenderParams({ ...base, activity: 1, dormancy: 0, fill: 1.4 });

    let cur = cur0;
    for (let i = 0; i < 200; i++) cur = smoothParams(cur, target, 0.1);

    expect(cur.breatheAmp).toBeCloseTo(target.breatheAmp, 3);
    expect(cur.bubbleDensity).toBeCloseTo(target.bubbleDensity, 3);
    expect(cur.specStr).toBeCloseTo(target.specStr, 3);
    expect(cur.fillY).toBeCloseTo(target.fillY, 3);
    cur.color.forEach((c, i) => expect(c).toBeCloseTo(target.color[i], 3));
  });
});
