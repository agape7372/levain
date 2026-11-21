// 반죽 모델 v2(2026-11-19) — 병 채움 형상 · 높이 매핑 · 기운 · 촉감 버그 회귀.
// 정본: docs/VISUAL.md §1-1·§3-2·§3-3. 감사 id는 .work/audit-1119/audit_results.json.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { toRenderParams, smoothParams, doughHeight, FED_LEVEL, PEAK_CAP } from '../src/render/renderParams';
import { DoughMesh, XZ_SCALE } from '../src/render/dough/DoughMesh';
import { JAR_RADIUS } from '../src/render/jar';
import type { Snapshot } from '../src/sim';
import { FILL_PEAK_RISE, RATIOS, STAGE_FILL_FACTOR } from '../src/sim/constants';
import { simSnap, simState } from '../scripts/lib/simSnap';

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
    expect(morning.markHeight).toBeCloseTo(doughHeight(1.72, 1, 0, 1.72), 5);
    expect(morning.markHeight).toBeGreaterThan(doughHeight(1.3, 1, 0) + 0.1);
  });
  it('자국은 현재 수위보다 낮아지지 않는다', () => {
    const rp = toRenderParams(peakOf(4, { peakFill: 1.3 }));
    expect(rp.markHeight).toBeGreaterThanOrEqual(rp.height);
  });
});

// ── 실제 sim 궤적(2026-11-19 판정 H1 · M1 · M2 · M3) — 손으로 짠 Snapshot은 sim이 못 만드는 조합이라 화면을 가렸다 ──
describe('simSnap — 비율을 받으면 그 비율로 밥 준 직후 질량에서 시작한다(S-L1)', () => {
  it.each(['1:1:1', '1:2:2', '1:5:5'] as const)('%s: mass = RATIOS 밥 질량 · 질량비 1', (ratio) => {
    expect(simState({ ratio }).mass).toBe(RATIOS[ratio].mass);
    expect(simSnap(0, { ratio }).massRatio).toBe(1);
  });
});

describe('실제 sim 하강 — 상승 · 갓 밥준과 갈린다(판정 H1)', () => {
  it.each([['1:1:1', 9], ['1:5:5', 18]] as const)('%s 밥 +%ih 하강: 자국 · 꺼짐 켜짐, 거품 · 물결 꺼짐', (ratio, h) => {
    const rp = toRenderParams(simSnap(h, { ratio }));
    expect(rp.residue).toBeGreaterThan(0.5);
    expect(rp.sink).toBeGreaterThan(0.3);
    expect(rp.foam).toBeLessThan(0.3);
    expect(rp.stir).toBeLessThan(0.1);
    // 수면과 자국 사이 빈 유리 — 실측(2026-11-19 S-L1, 밥 질량 그대로) 1:1:1 +9h 0.353월드(22%) · 1:5:5 +18h 0.289월드(18%).
    // 1:5:5는 0.3월드에 조금 못 미친다. 0.25월드 · 최고 수위 대비 15%로 같이 본다
    expect(rp.markHeight - rp.height).toBeGreaterThan(0.25);
    expect((rp.markHeight - rp.height) / rp.markHeight).toBeGreaterThan(0.15);
  });
  it('1:1:1 +9h 빈 유리는 0.3월드 이상', () => {
    const rp = toRenderParams(simSnap(9));
    expect(rp.markHeight - rp.height).toBeGreaterThan(0.3);
  });
  it('갓 밥준 · 오르는 중 · 피크엔 자국 · 꺼짐이 없다', () => {
    for (const h of [0, 3, 5]) {
      const rp = toRenderParams(simSnap(h));
      expect(rp.residue, `${h}h`).toBeLessThan(0.02);
      expect(rp.sink, `${h}h`).toBeLessThan(0.02);
    }
  });
  it('하강 끝 · 배고픔 초반(+11h · +14h)엔 갓 밥준 물결이 다시 켜지지 않는다', () => {
    for (const h of [11, 14]) expect(toRenderParams(simSnap(h)).stir, `${h}h`).toBeLessThan(0.1);
    expect(toRenderParams(simSnap(0)).stir).toBeGreaterThan(0.9);
  });
});

// sRGB 0~1 → [L*, b*] (D65) — 시큼 색은 어두워지지 않고 노래진다(어두운 얼룩 금지)
const labLb = (c: [number, number, number]): [number, number] => {
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * fy - 16, 200 * (fy - fz)];
};

describe('실제 sim 시큼 초반 — 배고픔과 갈린다(판정 M1)', () => {
  it('hooch 액체층이 시큼 초반부터 보인다 — +60h ≥ 0.2 · +72h ≥ 0.45', () => {
    expect(toRenderParams(simSnap(60)).hoochAmt).toBeGreaterThanOrEqual(0.2);
    expect(toRenderParams(simSnap(72)).hoochAmt).toBeGreaterThanOrEqual(0.45);
    expect(toRenderParams(simSnap(28)).hoochAmt).toBe(0);
  });
  it('+40h 색은 +28h 배고픔보다 노랗고(b* +2.5 이상), 어둡게 가라앉지 않는다(L* −3 이내)', () => {
    const [lH, bH] = labLb(toRenderParams(simSnap(28)).color);
    const [lS, bS] = labLb(toRenderParams(simSnap(40)).color);
    expect(bS - bH).toBeGreaterThanOrEqual(2.5); // 옛 톤 #cbbda2 · 0.3 섞기 = +0.2
    expect(lH - lS).toBeLessThanOrEqual(3);
  });
});

describe('실제 sim 곰팡이 — 군락이 액체 아래 묻히지 않는다(판정 M2)', () => {
  it('휴면(+144h)은 전면 hooch, 곰팡이 번짐(+260h)은 액체가 거의 걷힌다', () => {
    expect(toRenderParams(simSnap(144)).hoochAmt).toBeGreaterThan(0.95);
    const moldy = simSnap(260);
    expect(moldy.moldStage).not.toBe('none');
    expect(toRenderParams(moldy).hoochAmt).toBeLessThan(0.3);
  });
});

describe('실제 sim 단계 — 같은 피크 시각에 단계가 보인다(판정 M3)', () => {
  it('2단계 대 5단계 벽 기포 차이 ≥ 0.3', () => {
    const w2 = toRenderParams(simSnap(5, { stage: 2 })).wallCells;
    const w5 = toRenderParams(simSnap(5, { stage: 5 })).wallCells;
    expect(w5 - w2).toBeGreaterThanOrEqual(0.3);
  });
  it('D2 가짜 부풀기는 5단계 피크보다 낮고, 자국은 그 가짜 피크 자리에 남는다', () => {
    const fakeSnap = simSnap(5, { stage: 0 });
    expect(fakeSnap.fakeRise).toBe(true);
    const fake = toRenderParams(fakeSnap);
    const mature = toRenderParams(simSnap(5, { stage: 5 }));
    expect(fake.height).toBeLessThan(mature.height);
    expect(fake.markHeight).toBeCloseTo(fake.height, 2);
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
    for (const v of u.uSwirl.value as THREE.Vector2[]) expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
    expect(Number.isFinite((u.uTip.value as THREE.Vector4).z)).toBe(true);
    const g = u.uGrab.value as THREE.Vector4;
    expect(Number.isFinite(g.x) && Number.isFinite(g.y)).toBe(true);
  });
  it('NaN 입력이 들어와도 다음 tick에서 스스로 복구한다', () => {
    const d = new DoughMesh();
    d.applyParams(toRenderParams(peakOf(4)));
    d.grabStart(0, 0);
    d.grabMove3(Number.NaN, 0, 0);
    for (let i = 1; i <= 5; i++) d.tick(i / 60);
    const u = d.material.uniforms;
    const g = u.uGrab.value as THREE.Vector4;
    const gp = u.uGrabPos.value as THREE.Vector2;
    expect([g.x, g.y, gp.x, gp.y].every(Number.isFinite)).toBe(true);
    // 꼬집기 uniform도 유한(§6-14 recoverNaN = 상태기 초기화)
    for (const k of ['uPinch', 'uPinchB', 'uPinchC'] as const) {
      expect((u[k].value as THREE.Vector4).toArray().every(Number.isFinite)).toBe(true);
    }
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
