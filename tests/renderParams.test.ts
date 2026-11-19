// Snapshot→RenderParams 앵커·범위·스무딩 — 정본: docs/VISUAL.md §3-2·§3-3
import { describe, it, expect } from 'vitest';
import { toRenderParams, smoothParams } from '../src/render/renderParams';
import type { Snapshot } from '../src/sim';
import { simSnap } from '../scripts/lib/simSnap';

const base: Snapshot = {
  canSplit: false,
  splitReadyAt: 0,
  discardReady: true,
  nextStage: null,
  fakeRise: false,
  phase: 'active',
  activity: 0,
  hunger: 0,
  sourness: 0,
  dormancy: 0,
  fill: 1.0,
  riseFill: 1.0,
  peakFill: 1.6,
  massRatio: 1,
  location: 'room',
  hooch: 0,
  smell: 'flour',
  stage: 2,
  mass: 200,
  flour: 'white',
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

// motionlab 프리셋과 같은 Snapshot — 앵커 검증의 단일 기준 (scripts/motionlab.ts:24-31)
const justfed: Snapshot = { ...base, activity: 0.15, fill: 1.0, sourness: 0.05 };
const peak: Snapshot = { ...base, activity: 1.0, fill: 1.5, sourness: 0.1, smell: 'yogurt', stage: 3 };
const sour: Snapshot = {
  ...base, activity: 0.15, fill: 0.7, hunger: 1, sourness: 0.7,
  phase: 'sour', smell: 'vinegar', hooch: 0.5, stage: 3,
};

describe('renderParams — 상태 앵커 (VISUAL §3-3)', () => {
  it('activity 1·hunger 0·dormancy 0·5단계 → breatheAmp≈0.012, bubbleDensity≈0.9, specStr 0.35(새틴)', () => {
    // 2026-11-19 R2-15: 숨은 높이의 1.2% 이하(실물은 초 단위로 정지). 기포 상한 0.9는 기운 1(5단계)에서만
    const rp = toRenderParams({ ...base, activity: 1, fill: 1.4, stage: 5 });
    expect(rp.breatheAmp).toBeCloseTo(0.012, 5);
    expect(rp.bubbleDensity).toBeCloseTo(0.9, 5);
    // 2026-11-19 R2-12: R1 실물 30장 대조로 2026-08-25 가설(피크가 가장 번들 · 갓 밥준 무광)을 뒤집었다.
    // 피크 = 매트 · 새틴 거품(0.35), 갓 밥준 = 넓고 부드러운 젖은 광(0.70). 정본 VISUAL §3-3
    expect(rp.specStr).toBeCloseTo(0.35, 5);
    expect(toRenderParams(justfed).specStr).toBeGreaterThan(rp.specStr * 1.8);
  });

  it('🔒 피크 grab 물성은 사용자 실기기 확정치다 — grabMax 0.600 · ζ 0.956', () => {
    // 2026-08-24 저녁 실기기 확정. 축 개편 계수는 이 두 값이 나오도록 역산해 고정했다.
    // 리팩터가 이 값을 흔들면 촉감이 조용히 바뀐다 — 자동 방어선은 이 단정 하나뿐
    const rp = toRenderParams(peak);
    expect(rp.grabMax).toBeCloseTo(0.6, 3);
    expect(rp.grabReturnZeta).toBeCloseTo(0.956, 3);
  });

  it('쫀득함은 피크 전용이 아니다 — 갓 밥준이 잘 늘어나고 잔류도 더 크다', () => {
    const jf = toRenderParams(justfed);
    const pk = toRenderParams(peak);
    // 구 공식은 갓 밥준 grabMax 0.311(피크의 52%)이라 밥 주자마자 재료가 죽어 보였다
    expect(jf.grabMax).toBeGreaterThan(0.45);
    // 잔류는 갓 밥준이 더 커야 한다(태피). 구 공식은 정반대로 갓 밥준이 전 상태 최저였다 —
    // 즉 가장 고무줄이었다. 마켓팅 잠금("강한 스프링 금지")과 어긋난 지점
    expect(jf.grabCreepGain).toBeGreaterThan(pk.grabCreepGain);
    // 그래도 피크는 특별해야 한다 — 탄성·신장 상한은 피크가 이긴다
    expect(pk.grabMax).toBeGreaterThan(jf.grabMax);
    expect(pk.elasticity).toBeGreaterThan(jf.elasticity);
  });

  it('형상과 재질은 분리됐다 — 갓 밥준은 평평하지만 되직하고, 시큼만 진짜로 묽다', () => {
    const jf = toRenderParams(justfed);
    const sr = toRenderParams(sour);
    // 구 liquidity 1축에선 갓 밥준이 0.82로 **전 상태 최고**라 묽은 배터로 읽혔다
    expect(jf.levelness).toBeGreaterThan(0.8);   // 수평은 찾는다
    expect(jf.fluidity).toBeLessThan(0.3);       // 그러나 흐르지 않는다
    expect(sr.fluidity).toBeGreaterThan(jf.fluidity); // 단백질 분해가 묽게 만든다
    expect(sr.cohesion).toBeLessThan(jf.cohesion);    // 글루텐이 끊겼다
  });

  it('유리 접촉은 살아있는 동안 유지되고 마르면 윗가장자리만 물러난다(A1-02)', () => {
    // 2026-11-19 반죽 모델 v2: 옆벽은 늘 유리에 붙고(형상), 물러남은 위 10~15% 높이의 pull 하나다
    expect(toRenderParams(peak).pull).toBeCloseTo(0, 5);
    expect(toRenderParams(justfed).pull).toBeCloseTo(0, 5);
    const dry = toRenderParams({ ...base, activity: 0.02, dormancy: 1, fill: 0.65, riseFill: 0.65 });
    expect(dry.pull).toBeGreaterThan(0.02);
    expect(dry.pull).toBeLessThanOrEqual(0.03);
    const hungry = toRenderParams({ ...base, activity: 0.25, hunger: 1, fill: 0.8, riseFill: 0.8 });
    expect(hungry.pull).toBeGreaterThan(0);
    expect(hungry.pull).toBeLessThan(dry.pull);
  });

  it('유리벽 기공은 살아있는 분기 전용 — 휴면·kahm·곰팡이에서 0 (예산 상호배타)', () => {
    // 2026-11-19: 기운(단계)이 벽 기포를 정한다 — 5단계 피크가 가장 빽빽하고, 3단계는 그보다 성기다
    const peak5 = toRenderParams({ ...peak, stage: 5 });
    expect(peak5.wallCells).toBeGreaterThan(0.9);
    expect(toRenderParams(peak).wallCells).toBeLessThan(peak5.wallCells);
    expect(toRenderParams({ ...base, activity: 1, dormancy: 1 }).wallCells).toBeCloseTo(0, 5);
    expect(toRenderParams({ ...base, activity: 1, kahm: true }).wallCells).toBeCloseTo(0, 5);
    expect(toRenderParams({ ...base, activity: 1, moldStage: 'spread', mold01: 0.6 }).wallCells)
      .toBeCloseTo(0, 5);
    // 피크는 크고 성긴 기공, 갓 밥준은 잘고 촘촘
    expect(toRenderParams(peak).cellFreq).toBeLessThan(toRenderParams(justfed).cellFreq);
  });

  it('유리 자국은 피크를 찍고 내려온 뒤에만 — 상승기엔 0, 최고 수위는 현재 수위 이상', () => {
    expect(toRenderParams(justfed).residue).toBeCloseTo(0, 5);
    expect(toRenderParams(peak).residue).toBeCloseTo(0, 5);
    // 2026-11-19 판정 H2: 옛 고정값 {activity 0.6, riseFill 1.2, hunger 0.3}은 sim이 못 만드는 조합이었다
    // (riseFill 1.2일 때 hunger 0.05). 실제 궤적 1:1:1 밥 +9h(riseFill 1.35 · hunger 0.03)로 본다
    const falling = toRenderParams(simSnap(9));
    expect(falling.residue).toBeGreaterThan(0.5);
    expect(falling.markHeight).toBeGreaterThan(falling.height);
  });

  it('moldStage spot + mold01 0.01 → mold 바닥값 0.25 (예고 가시성)', () => {
    const rp = toRenderParams({ ...base, moldStage: 'spot', mold01: 0.01, dormancy: 1 });
    expect(rp.mold).toBeCloseTo(0.25, 5);
    const none = toRenderParams({ ...base, moldStage: 'none', mold01: 0 });
    expect(none.mold).toBe(0);
  });

  it('dormancy 1 → breatheAmp≈0.003(>0, 완전 정지 금지), bubbleDensity≈0, crust 0.8', () => {
    const rp = toRenderParams({ ...base, activity: 0, dormancy: 1, fill: 0.65 });
    expect(rp.breatheAmp).toBeCloseTo(0.003, 5);
    expect(rp.breatheAmp).toBeGreaterThan(0);
    expect(rp.bubbleDensity).toBeCloseTo(0, 5);
    expect(rp.crust).toBeCloseTo(0.8, 5);
  });
});

describe('renderParams — 범위 클램프·스무딩 수렴', () => {
  it('임의 극단 입력에도 전 출력이 문서 범위를 벗어나지 않는다', () => {
    // fill·riseFill은 derive.ts에서 이미 클램프됨 — 여기선 유효값만 넣는다
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
    expect(rp.breatheAmp).toBeGreaterThanOrEqual(0.003);
    expect(rp.breatheAmp).toBeLessThanOrEqual(0.012);
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
    // 축 개편 신규 필드 (2026-08-25)
    for (const k of ['levelness', 'fluidity', 'cohesion', 'elasticity', 'wallCells', 'residue', 'vigor', 'chill', 'warm'] as const) {
      expect(rp[k], k).toBeGreaterThanOrEqual(0);
      expect(rp[k], k).toBeLessThanOrEqual(1);
    }
    expect(rp.pull).toBeGreaterThanOrEqual(0);
    expect(rp.pull).toBeLessThanOrEqual(0.03);
    expect(rp.height).toBeGreaterThan(0);
    expect(rp.height).toBeLessThanOrEqual(0.88 * 1.9);
    expect(rp.cellFreq).toBeGreaterThanOrEqual(34);
    expect(rp.cellFreq).toBeLessThanOrEqual(80);
    expect(rp.markHeight).toBeGreaterThanOrEqual(rp.height);
    expect(rp.grabMax).toBeGreaterThanOrEqual(0);
    expect(rp.grabMax).toBeLessThanOrEqual(0.62);
    expect(rp.grabCreepGain).toBeGreaterThanOrEqual(0);
    expect(rp.grabCreepGain).toBeLessThanOrEqual(1);
    expect(rp.grabReturnZeta).toBeGreaterThanOrEqual(0.94);
    expect(rp.grabReturnZeta).toBeLessThanOrEqual(1.07);
  });

  it('smoothParams가 반복 호출로 target에 수렴한다', () => {
    const cur0 = toRenderParams({ ...base, activity: 0, fill: 1.0 });
    const target = toRenderParams({ ...base, activity: 1, dormancy: 0, fill: 1.4 });

    let cur = cur0;
    for (let i = 0; i < 200; i++) cur = smoothParams(cur, target, 0.1);

    expect(cur.breatheAmp).toBeCloseTo(target.breatheAmp, 3);
    expect(cur.bubbleDensity).toBeCloseTo(target.bubbleDensity, 3);
    expect(cur.specStr).toBeCloseTo(target.specStr, 3);
    expect(cur.height).toBeCloseTo(target.height, 3);
    cur.color.forEach((c, i) => expect(c).toBeCloseTo(target.color[i], 3));
    // 신규 필드가 smoothParams에 빠지면 타입 오류 없이 초기값에 얼어붙는다 — 전수로 잡는다
    for (const k of Object.keys(target) as (keyof typeof target)[]) {
      if (k === 'color') continue;
      expect(cur[k], k).toBeCloseTo(target[k] as number, 3);
    }
  });
});
