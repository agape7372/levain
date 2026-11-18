// 반죽 모델 v2(2026-11-19) — 병 채움 형상 · 높이 매핑 · 기운 · 촉감 버그 회귀.
// 정본: docs/VISUAL.md §1-1·§3-2·§3-3. 감사 id는 .work/audit-1119/audit_results.json.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { toRenderParams, smoothParams, doughHeight, FED_LEVEL, PEAK_CAP } from '../src/render/renderParams';
import { DoughMesh, XZ_SCALE } from '../src/render/dough/DoughMesh';
import { JAR_RADIUS } from '../src/render/jar';
import type { Snapshot } from '../src/sim';
import { FILL_PEAK_RISE, STAGE_FILL_FACTOR } from '../src/sim/constants';

const base: Snapshot = {
  canSplit: false, splitReadyAt: 0, discardReady: true, nextStage: null, fakeRise: false,
  phase: 'active', activity: 0.15, hunger: 0, sourness: 0.05, dormancy: 0,
  fill: 1.0, riseFill: 1.0, peakFill: 1.6, massRatio: 1, location: 'room',
  hooch: 0, smell: 'flour', stage: 4, mass: 200, flour: 'white',
  nextFeedAt: 0, peakAt: 0, peakEndAt: 0, effSinceFeedMs: 0,
  moldStage: 'none', mold01: 0, moldDeadAt: 0, kahm: false, hasFlake: false,
};
// 한창때 Snapshot — riseFill·peakFill은 sim과 같은 식(1 + FILL_PEAK_RISE × 단계 계수, derive.ts)
const peakOf = (stage: number, extra: Partial<Snapshot> = {}): Snapshot => {
  const pf = 1 + FILL_PEAK_RISE * STAGE_FILL_FACTOR[stage];
  return { ...base, activity: 1, riseFill: pf, fill: pf, peakFill: pf, smell: 'yogurt', stage, ...extra };
};

describe('높이 매핑 — 실물 문법(R2-03 · A1-07)', () => {
  it('갓 밥준 = 병 높이 0.40, 피크 riseFill 1.6 ≈ 2.1배', () => {
    expect(FED_LEVEL).toBeCloseTo(0.4 * 1.9, 5);
    expect(doughHeight(1.0, 1, 4)).toBeCloseTo(FED_LEVEL, 5);
    expect(doughHeight(1.6, 1, 4) / FED_LEVEL).toBeCloseTo(2.1, 2);
  });
  it('꺼짐은 1.0배 근처로 압축된다 — 0.8→≈0.93 · 0.65→≈0.88', () => {
    expect(doughHeight(0.8, 1, 4) / FED_LEVEL).toBeCloseTo(0.93, 2);
    expect(doughHeight(0.65, 1, 4) / FED_LEVEL).toBeCloseTo(0.88, 2);
  });
  it('떼어내면 질량비만큼 낮아지고 하한 0.25', () => {
    expect(doughHeight(1.0, 1 / 3, 4) / FED_LEVEL).toBeCloseTo(1 / 3, 3);
    expect(doughHeight(1.0, 0.05, 4) / FED_LEVEL).toBeCloseTo(0.25, 3);
  });
  it('피크는 병 높이 0.88을 넘지 않는다(넘침 = 촛농 금지)', () => {
    expect(PEAK_CAP).toBeCloseTo(0.88 * 1.9, 5);
    expect(doughHeight(1.72, 1, 0)).toBeLessThanOrEqual(PEAK_CAP);
  });
  it('어린 단계는 렌더 상승 배율이 작다 — 2단계 0.85 · 3단계 0.93 · 4·5단계 1.0', () => {
    const rise = (st: number): number => doughHeight(1.6, 1, st) / FED_LEVEL - 1;
    expect(rise(2) / rise(4)).toBeCloseTo(0.85, 3);
    expect(rise(3) / rise(4)).toBeCloseTo(0.93, 3);
    expect(rise(5)).toBeCloseTo(rise(4), 6);
  });
});

describe('기운 — 성장이 병에 보인다(A3-01 · A3-02)', () => {
  it('2~5단계 한창때 RenderParams가 서로 다르다', () => {
    const rps = [2, 3, 4, 5].map((st) => JSON.stringify(toRenderParams(peakOf(st))));
    expect(new Set(rps).size).toBe(4);
  });
  it('1→5단계로 기운 · 기포 밀도 · 돔 · 한창 높이가 단조 증가', () => {
    let prev = toRenderParams(peakOf(1));
    for (let st = 2; st <= 5; st++) {
      const cur = toRenderParams(peakOf(st));
      expect(cur.vigor, `vigor ${st}`).toBeGreaterThan(prev.vigor);
      expect(cur.bubbleDensity, `bubble ${st}`).toBeGreaterThan(prev.bubbleDensity);
      expect(cur.ripe, `ripe ${st}`).toBeGreaterThan(prev.ripe);
      expect(cur.height, `height ${st}`).toBeGreaterThanOrEqual(prev.height);
      prev = cur;
    }
    expect(toRenderParams(peakOf(5)).vigor).toBeCloseTo(1, 5);
  });
  it('잠잠기(1단계)는 0단계보다 조용하다', () => {
    expect(toRenderParams(peakOf(1)).vigor).toBeLessThan(toRenderParams(peakOf(0)).vigor);
  });
  it('가짜 부풀기는 적고 큰 기포 쪽 — 밀도는 낮고 크기는 크다', () => {
    const plain = toRenderParams(peakOf(0));
    const fake = toRenderParams(peakOf(0, { fakeRise: true }));
    expect(fake.bubbleDensity).toBeLessThan(plain.bubbleDensity);
    expect(fake.bubbleScale).toBeGreaterThan(plain.bubbleScale);
  });
});

describe('유리 최고 수위 — Snapshot.peakFill을 같은 매핑으로(A3-06)', () => {
  it('가짜 부풀기 다음 날 아침 자국이 0단계 계수(1.3)가 아니라 실제 피크(1.72) 높이에 있다', () => {
    const morning = toRenderParams({
      ...base, stage: 0, activity: 0.2, hunger: 0.6, riseFill: 0.9, fill: 0.9, peakFill: 1.72,
    });
    expect(morning.markHeight).toBeCloseTo(doughHeight(1.72, 1, 0), 5);
    expect(morning.markHeight).toBeGreaterThan(doughHeight(1.3, 1, 0) + 0.1);
  });
  it('자국은 현재 수위보다 낮아지지 않는다', () => {
    const rp = toRenderParams(peakOf(4, { peakFill: 1.3 }));
    expect(rp.markHeight).toBeGreaterThanOrEqual(rp.height);
  });
});

describe('smoothParams — 수렴하면 목표 그 자체를 돌려준다(A1-20)', () => {
  it('충분히 가까워지면 target 객체를 그대로 반환 — 매 프레임 할당·applyParams 생략의 근거', () => {
    const a = toRenderParams(base);
    const b = toRenderParams(peakOf(4));
    let cur = a;
    for (let i = 0; i < 400; i++) cur = smoothParams(cur, b, 0.1);
    expect(cur).toBe(b);
  });
});

describe('DoughMesh v2 — 병 채움 형상(A1-01 · A1-02 · A1-04 · A1-10 · A1-13)', () => {
  const geo = new DoughMesh().mesh.geometry as THREE.BufferGeometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;

  it('인덱스 메시이고 바닥은 y=0 평면, 옆벽은 유리 반경(≤0.915 월드) 원기둥', () => {
    expect(geo.index).not.toBeNull();
    let minY = Infinity;
    for (let i = 0; i < pos.count; i++) minY = Math.min(minY, pos.getY(i));
    expect(minY).toBe(0);
    const d = new DoughMesh();
    d.applyParams(toRenderParams(base));
    expect(d.bodyRadius() * XZ_SCALE).toBeLessThanOrEqual(0.915);
    expect(d.bodyRadius() * XZ_SCALE).toBeGreaterThan(JAR_RADIUS - 0.012);
  });

  it('해상도 — 둘레 ≥128 · 윗면 링 ≥28 · 옆벽 행 ≥20 · 테두리 정점 공유(틈 0)', () => {
    const ang = new Set<string>();
    const rings = new Set<string>();
    const rows = new Set<string>();
    let rimCount = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r > 0.999) ang.add(Math.atan2(z, x).toFixed(4));
      if (y === 1) rings.add(r.toFixed(4));
      else rows.add(y.toFixed(4));
      if (y === 1 && r > 0.999) rimCount++;
    }
    expect(ang.size).toBeGreaterThanOrEqual(128);
    expect(rings.size - 1).toBeGreaterThanOrEqual(28); // 가운데 점 제외
    expect(rows.size).toBeGreaterThanOrEqual(20);
    // 테두리 한 바퀴 = 둘레 수와 같다 — 옆벽 맨 윗줄을 따로 두면 2배가 된다
    expect(rimCount).toBe(ang.size);
  });

  it('범프 슬롯은 실제 동시 상한 4개', () => {
    const d = new DoughMesh();
    expect((d.material.uniforms.uBumpAmp.value as Float32Array).length).toBe(4);
    expect(d.bubbles.amp.length).toBe(4);
  });
});

describe('DoughMesh v2 — 높이 · 숨쉬기(R2-15 · A1-11 · 감사 missed)', () => {
  it('숨쉬기는 바닥 고정이고 진폭은 높이의 1.2% 이하', () => {
    const d = new DoughMesh();
    d.applyParams(toRenderParams(peakOf(5)));
    let maxS = 0;
    for (let i = 0; i < 300; i++) {
      d.tick(i * 0.05);
      expect(d.mesh.position.y).toBe(0);
      maxS = Math.max(maxS, d.mesh.scale.y);
    }
    expect(maxS - 1).toBeLessThanOrEqual(0.012 + 1e-9);
  });
  it('topY는 피크 돔과 숨을 반영해 테두리(levelY · 메니스커스 포함)보다 위에 있다', () => {
    const d = new DoughMesh();
    const rp = toRenderParams(peakOf(5));
    d.applyParams(rp);
    d.tick(0);
    expect(d.levelY()).toBeGreaterThan(rp.height * 0.99);
    expect(d.topY()).toBeGreaterThan(d.levelY());
    expect(d.topY()).toBeCloseTo((rp.height + 0.05 * rp.ripe) * d.mesh.scale.y, 5);
  });
});

describe('DoughMesh v2 — 시계·NaN 방어(A1-18)', () => {
  it('시계가 역행해도 uniform이 NaN이 되지 않는다', () => {
    const d = new DoughMesh();
    d.setStirInput(0.1, 0, 2, 0);
    d.tick(864000, 12.5);
    d.tick(5);
    const u = d.material.uniforms;
    for (const v of u.uTrailAmp.value as Float32Array) expect(Number.isFinite(v)).toBe(true);
    const lag = u.uGrabDispLag.value as THREE.Vector2;
    expect(Number.isFinite(lag.x) && Number.isFinite(lag.y)).toBe(true);
  });
  it('NaN 입력이 들어와도 다음 tick에서 스스로 복구한다', () => {
    const d = new DoughMesh();
    d.applyParams(toRenderParams(peakOf(4)));
    d.grabStart(0, 0);
    d.grabMove(Number.NaN, 0);
    for (let i = 1; i <= 5; i++) d.tick(i / 60);
    const u = d.material.uniforms;
    const disp = u.uGrabDisp.value as THREE.Vector2;
    const lag = u.uGrabDispLag.value as THREE.Vector2;
    expect(Number.isFinite(disp.x) && Number.isFinite(disp.y)).toBe(true);
    expect(Number.isFinite(lag.x) && Number.isFinite(lag.y)).toBe(true);
  });
});

describe('DoughMesh v2 — 롱프레스 홀드 채널(A1-15 · VISUAL §5)', () => {
  it('천천히 0.03까지 부풀고 쥐는 동안 유지, 떼면 사라진다', () => {
    const d = new DoughMesh();
    d.applyParams(toRenderParams(peakOf(4)));
    const amt = (): number => d.material.uniforms.uPokeAmt.value as number;
    d.tick(0);
    d.holdStart(0.1, 0.05);
    d.tick(0.1);
    expect(-amt()).toBeLessThan(0.03 * 0.5); // 즉시 튀어나오지 않는다
    for (let t = 0.2; t <= 3; t += 0.05) d.tick(t);
    expect(-amt()).toBeCloseTo(0.03, 3); // 쥐는 동안 유지
    d.holdEnd();
    for (let t = 3.05; t <= 5; t += 0.05) d.tick(t);
    expect(Math.abs(amt())).toBeLessThan(1e-3);
  });
});
