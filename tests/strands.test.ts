// 당기기 가닥 다발(2026-11-19, .work/feel2/spec.md §1 · §4 · §6) — 순수 상태기(StrandRig) · surfaceY · 셰이더 소스 짝.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  CELL_BUBBLE, D_W, DOUGH_ALBEDO, DOUGH_SHADE, FBM_GLSL, MOUND_H, StrandRig, fbm2, mainBreakLen, strandMix, type StrandEnv, type StrandMix,
} from '../src/render/dough/StrandMesh';
import { DoughMesh, GRAB_FIELD } from '../src/render/dough/DoughMesh';
import { toRenderParams } from '../src/render/renderParams';
import { simSnap, STATE_HOURS } from '../scripts/lib/simSnap';

const RP = (k: keyof typeof STATE_HOURS) => toRenderParams(simSnap(STATE_HOURS[k]));
const mixOf = (k: keyof typeof STATE_HOURS): StrandMix => {
  const r = RP(k);
  return strandMix(r.elasticity, r.fluidity, r.grabMax);
};
const env = (): StrandEnv => ({ surfaceY: () => 1, followTau: 0.07, creepDelay: 0.7, creepTau: 2.5 });

/** 앵커 (0, 0)에서 잡아 손끝을 초당 v(월드)로 곧게 올린다. 끊김마다 [주 가닥 길이 − L_commit, 사건] */
function lift(mix: StrandMix, v: number, secs: number) {
  const rig = new StrandRig();
  const e = env();
  rig.start(0, 0, mix, e);
  const y0 = 1.1;
  rig.move(0, y0, 0); // 커밋 순간 손끝(L_commit ≈ 0.1 + 목 반지름)
  const breaks: { over: number; thin: boolean; last: boolean }[] = [];
  let fanMax = 0;
  for (let i = 1; i <= secs * 60; i++) {
    rig.move(0, y0 + (v * i) / 60, 0);
    rig.tick(1 / 60, e);
    fanMax = Math.max(fanMax, rig.fan);
    for (const b of rig.events) breaks.push({ over: rig.len - rig.lenCommit, ...b });
  }
  return { rig, breaks, fanMax, e };
}

describe('가닥 상태기 — 상태마다 다른 끊김(L3 · L4 · L5)', () => {
  it('피크 — 6가닥이 서로 다른 길이에서 하나씩 끊기고, 주 가닥이 마지막(1.2D 근처)', () => {
    const { breaks } = lift(mixOf('peak'), 1.5, 3);
    expect(breaks.length).toBe(6);
    expect(breaks.slice(0, 5).every((b) => b.thin && !b.last)).toBe(true);
    expect(breaks[5]).toMatchObject({ thin: false, last: true });
    const at = breaks.map((b) => b.over);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThan(0.05); // 하나씩
    expect(at[5] / D_W).toBeGreaterThan(0.9);
    expect(at[5] / D_W).toBeLessThan(1.3);
  });
  it('묽음(시큼) — 벌어짐 0인 한 줄, 끊김 길이를 넘어도 소리 없이 떨어진다', () => {
    const m = mixOf('sour');
    expect(m.runny).toBeGreaterThan(0.9);
    const { breaks, fanMax, rig } = lift(m, 1.5, 2);
    expect(fanMax).toBe(0);
    expect(breaks.length).toBe(0);
    expect(rig.attached()).toBe(0); // 다 떨어졌다
  });
  it('묽음 크림 줄 — 붙어 있는 동안 주 가닥 화면 목 지름(몫 1 × body 아래 0.92 × W)이 0.1D 아래로 안 간다(시각 고침 1차 A-5 · 2차 환산, L3c 8uAT 1:56)', () => {
    const m = mixOf('sour');
    const rig = new StrandRig();
    const e = env();
    rig.start(0, 0, m, e);
    rig.move(0, 1.1, 0);
    for (let i = 1; i <= 120 && rig.attached() > 0; i++) {
      rig.move(0, 1.1 + (1.5 * i) / 60, 0);
      rig.tick(1 / 60, e);
      if (rig.attached() > 0) expect((0.92 * 2 * rig.neck) / D_W).toBeGreaterThanOrEqual(0.1 * m.runny - 1e-6);
    }
  });
  it('갓 밥준 — 짧게(0.3D 안) 한 번에 끊긴다 · 소리 하나(되직은 가는 가닥 끊김을 주 가닥에 합친다, 검토 C-4)', () => {
    const m = mixOf('justfed');
    expect(m.stiff).toBeGreaterThan(0.9);
    expect(mainBreakLen(m) / D_W).toBeLessThan(0.3);
    const { breaks, rig } = lift(m, 0.6, 2);
    // 지터 ±8%로 가는 가닥이 몇 tick 먼저 끊겨 「쩍」이 두 번 나던 것 — 이제 사건은 마지막 하나뿐
    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({ thin: false, last: true });
    expect(breaks[0].over / D_W).toBeLessThan(0.3);
    expect(rig.attached()).toBe(0); // 여섯이 함께 끊겼다
  });
  it('굵은 기둥 — 피크 주 가닥 화면 폭(= W, 주 몫 1 · body 가운데 1)은 0.5D 들면 0.11~0.14D, 1D에서도 0.1D 위(시각 고침 2차 A-1, L1b UPQ94 9s)', () => {
    const m = mixOf('peak');
    expect(m.web).toBeGreaterThan(0.99);
    const at = (dy: number) => {
      const rig = new StrandRig();
      const e = env();
      rig.start(0, 0, m, e);
      rig.move(0, 1 + dy, 0);
      for (let i = 0; i < 30; i++) rig.tick(1 / 60, e);
      return rig;
    };
    // 주 가닥 목 반지름 = W/2(몫 1). 옛 몫 0.85 · body 가운데 0.9 · √ 기준 L = 0이 겹쳐 0.5D에서 0.084D였다(2배 녹화 36px = 계산 36px)
    const half = at(0.5 * D_W);
    expect(half.A[3]).toBeCloseTo(half.neck, 6);
    expect((2 * half.neck) / D_W).toBeGreaterThan(0.11);
    expect((2 * half.neck) / D_W).toBeLessThan(0.14);
    // W = 0.13D · √((L0 + 0.5D)/(L0 + L)), L0 = 0.6D — L1b 폭은 들린 기둥에서 잰 값이라 0.5D에서 0.13D
    const one = at(D_W);
    expect(one.len / D_W).toBeGreaterThan(0.9);
    expect((2 * one.neck) / D_W).toBeCloseTo(0.13 * Math.sqrt((0.6 * D_W + 0.5 * D_W) / (0.6 * D_W + one.len)), 4);
    expect((2 * one.neck) / D_W).toBeGreaterThan(0.1);
  });
  it('갓 밥준 목 0.07~0.1D — 되직 W가 천막 · 덩이와 겹쳐 원통 대 + 갓이 되지 않는 굵기(시각 고침 2차 A-2, 8uAT 0:47 · 0:52)', () => {
    const rig = new StrandRig();
    const e = env();
    rig.start(0, 0, mixOf('justfed'), e);
    rig.move(0, 1 + 0.2 * D_W, 0);
    for (let i = 0; i < 20; i++) rig.tick(1 / 60, e);
    expect(rig.stiff).toBeGreaterThan(0.9);
    expect((2 * rig.neck) / D_W).toBeGreaterThan(0.07);
    expect((2 * rig.neck) / D_W).toBeLessThan(0.1);
  });
  it('끊기기 직전 목 조임 — 끊김 길이 85%부터 주 가닥 도막만 C.w > 0(최대 0.6 = 굵어진 기둥을 0.04D 목까지), 가는 가닥은 0(L1b · 8uAT 1:26)', () => {
    const rig = new StrandRig();
    const e = env();
    const m = mixOf('peak');
    rig.start(0, 0, m, e);
    rig.move(0, 1.1, 0);
    const lb = rig.breakLen(e);
    let pinchMax = 0;
    for (let i = 1; i <= 180 && rig.attached() > 0; i++) {
      rig.move(0, 1.1 + (0.9 * lb * i) / 60, 0); // 3초에 걸쳐 끊김 길이의 0.9배까지 → 마지막엔 85%를 넘는다
      rig.tick(1 / 60, e);
      if (rig.stretch01(e) < 0.8) expect(rig.C[3]).toBe(0);
      pinchMax = Math.max(pinchMax, rig.C[3], rig.C[4 + 3]);
      for (let s = 2; s < 12; s++) expect(rig.C[s * 4 + 3]).toBe(0);
    }
    expect(pinchMax).toBeGreaterThan(0.05);
    expect(pinchMax).toBeLessThanOrEqual(0.6);
  });
  it('휴면 · 곰팡이(grabMax < 0.2) — 가닥 없음 · 끊김 소리 없음', () => {
    for (const k of ['dormant', 'moldy'] as const) {
      const { rig, breaks } = lift(mixOf(k), 1.5, 2);
      expect(rig.none).toBe(true);
      expect(rig.visible).toBe(false);
      expect(breaks.length).toBe(0);
    }
  });
  it('버티면 끊김 길이가 짧아진다 — 0.7s 뒤부터 τ2.5s로 0.55배까지(L4b)', () => {
    const rig = new StrandRig();
    const e = env();
    rig.start(0, 0, mixOf('peak'), e);
    const lb0 = rig.breakLen(e);
    for (let i = 0; i < 60 * 0.7; i++) rig.tick(1 / 60, e);
    expect(rig.breakLen(e)).toBeCloseTo(lb0, 5);
    for (let i = 0; i < 60 * 20; i++) rig.tick(1 / 60, e);
    expect(rig.breakLen(e) / lb0).toBeCloseTo(0.55, 2);
  });
});

describe('끊긴 끝 · 낙하 · 더미(L5 · L6 · §6-3 · §6-4)', () => {
  it('가는 가닥은 머리카락 — 목 반지름이 주 가닥의 1/4 아래, 위 끝은 손끝이 아니라 주 가닥 u 0.7(덩이 아래 목, 시각 고침 1차 A-1)', () => {
    const rig = new StrandRig();
    const e = env();
    rig.start(0, 0, mixOf('peak'), e);
    rig.move(0, 1.1 + 0.4 * D_W, 0);
    for (let i = 0; i < 30; i++) rig.tick(1 / 60, e);
    const tipY = rig.C[1 * 4 + 1]; // 주 가닥 윗도막 끝 = 손끝
    for (let s = 1; s < 6; s++) {
      expect(rig.A[s * 2 * 4 + 3] / rig.A[3]).toBeLessThan(0.25);
      const topY = rig.C[(s * 2 + 1) * 4 + 1];
      expect(topY).toBeLessThan(tipY - 0.15 * rig.len); // 손끝보다 확실히 아래(닫힌 끝이 덩이 위로 솟지 않는다)
      expect(topY).toBeGreaterThan(1 + 0.4 * rig.len); // 그래도 기둥 위쪽에서 갈라진다
    }
  });
  it('끊기면 끊긴 끝이 뾰족(시작 쪽 반지름 0) · 그루터기는 털 끝 — 가는 가닥 윗도막은 0.3s에 주 기둥으로 흡수(시각 고침 1차 A-3)', () => {
    const { rig, e } = lift(mixOf('peak'), 1.5, 0.75); // 첫 가는 가닥(BREAK_FRAC 0.42)만 끊길 만큼
    const lower = 1 * 2;
    const upper = lower + 1;
    expect(rig.D[upper * 4 + 2]).toBeGreaterThan(0); // 셰이더: r *= t / D.z → t = 0에서 0
    expect(rig.D[lower * 4 + 3]).toBeGreaterThan(0); // r *= (1 − t) / D.w → t = 1에서 0
    // 매달려 허공에 뜬 양파 + 뿌리가 되지 않는다 — 0.3s 안에 반지름 0
    for (let i = 0; i < 20; i++) rig.tick(1 / 60, e);
    expect(rig.A[upper * 4 + 3]).toBe(0);
  });
  it('주 가닥 윗도막은 손끝에 뾰족 꼬리로 매달리고, 그물이면 덩이가 0.6배로 준다(시각 고침 1차 A-3 · 2차 그물 덩이 0.015)', () => {
    const { rig, breaks } = lift(mixOf('peak'), 1.5, 3);
    expect(breaks[breaks.length - 1]?.last).toBe(true);
    const upper = 1; // 주 가닥 윗도막
    expect(rig.A[upper * 4 + 3]).toBeGreaterThan(0); // 매달려 있다
    expect(rig.D[upper * 4 + 2]).toBeGreaterThan(0); // 끊긴 끝 뾰족
    // 덩이 — 그물 lumpR = 0.5 · D · 0.015 · (길이 몫 1) × 0.6. 0.035면 굵어진 기둥 위 끝이 면봉 머리(기둥 폭 × 1.3 넘음)
    expect(rig.B[upper * 4 + 3]).toBeCloseTo(0.5 * D_W * 0.015 * 0.6, 4);
  });
  it('갓 밥준 윗도막 = 둥근 방울 + 짧은 꼬리 — 천막 몫(u < 0.5)은 버리고 뾰족 끝 0.4, 길이는 × 0.5까지 준다(시각 고침 2차 A-2)', () => {
    const rig = new StrandRig();
    const e = env();
    rig.start(0, 0, mixOf('justfed'), e);
    rig.move(0, 1.1, 0);
    let len0 = 0;
    for (let i = 1; i <= 120 && len0 === 0; i++) {
      rig.move(0, 1.1 + (0.6 * i) / 60, 0);
      rig.tick(1 / 60, e);
      // 끊긴 순간의 윗도막 길이(손끝 ~ 끊긴 끝)
      if (rig.events.some((b) => b.last)) len0 = Math.hypot(rig.A[4] - rig.C[4], rig.A[5] - rig.C[5], rig.A[6] - rig.C[6]);
    }
    expect(len0).toBeGreaterThan(0);
    expect(rig.D[4]).toBeGreaterThanOrEqual(0.5); // u0 — 넓은 천막을 뾰족하게 깎으면 보석 팽이였다(hi1_jf_sheet)
    expect(rig.D[6]).toBeCloseTo(0.4, 5); // 꼬리 = 아래 40%
    for (let i = 0; i < 30; i++) rig.tick(1 / 60, e); // 줄어듦 0.25s 넘게
    const len1 = Math.hypot(rig.A[4] - rig.C[4], rig.A[5] - rig.C[5], rig.A[6] - rig.C[6]);
    expect(len1 / len0).toBeCloseTo(0.5, 1);
  });
  it('그루터기는 0.12s 안에 들던 쪽으로 쓰러져 눕는다 — 표면 위 곧은 가시 금지(시각 고침 2차 A-3, w93D 누운 털 끝)', () => {
    const rig = new StrandRig();
    const e = env();
    rig.start(0, 0, mixOf('peak'), e);
    rig.move(0, 1.1, 0);
    for (let i = 1; i <= 240 && !rig.events.length; i++) {
      rig.move(0.3 * (i / 60), 1.1 + 1.5 * (i / 60), 0); // 오른쪽 위로 들기
      rig.tick(1 / 60, e);
    }
    expect(rig.events.length).toBeGreaterThan(0);
    const lo = 1 * 2; // 첫 가는 가닥 아랫도막
    expect(rig.C[lo * 4 + 1]).toBeGreaterThan(1.1); // 끊긴 순간엔 서 있다
    for (let i = 0; i < 8; i++) rig.tick(1 / 60, e); // 0.133s
    // 끝점이 표면(누운 반지름 × 0.4 위)까지 내려왔고, 든 쪽(+x)으로 누웠다
    expect(rig.C[lo * 4 + 1]).toBeLessThan(1 + 0.01);
    expect(rig.C[lo * 4]).toBeGreaterThan(rig.A[lo * 4]);
  });
  it('놓으면 한 더미로 떨어지고, 0.6s 안에 가닥이 사라진 뒤 더미는 τ_pile(3s)로 가라앉는다', () => {
    const { rig, e } = lift(mixOf('peak'), 1.0, 0.5);
    expect(rig.visible).toBe(true);
    rig.release(e);
    let hMax = 0;
    for (let i = 0; i < 36; i++) {
      rig.tick(1 / 60, e);
      hMax = Math.max(hMax, rig.pile[2]);
    }
    expect(rig.visible).toBe(false); // 가는 관이 표면에 오래 누워 있지 않는다
    const h0 = rig.pile[2];
    // 또렷한 더미 — 한 다발이면 둔덕 최대(MOUND_H)까지 찬다. 높이 = 누운 반지름 × 2.0, 상한 1.0 × MOUND_H
    // (시각 고침 1차 A-4 — 옛 × 1.2 · 상한 0.6이면 끊긴 뒤 더미가 거의 안 보였다, UPQ94 13s)
    expect(hMax).toBeLessThanOrEqual(MOUND_H); // 상한
    expect(hMax / MOUND_H).toBeGreaterThan(0.98); // 도막이 몇 tick에 걸쳐 쌓이는 사이 τ3s로 조금 가라앉는다
    expect(h0).toBeGreaterThan(0.9 * MOUND_H);
    for (let i = 0; i < 180; i++) rig.tick(1 / 60, e);
    expect(rig.pile[2] / h0).toBeCloseTo(Math.exp(-1), 1);
    for (let i = 0; i < 60 * 30; i++) rig.tick(1 / 60, e);
    expect(rig.pile[2]).toBe(0);
  });
  it('낙하 중 다시 잡으면 새 다발 — 남은 낙하 도막은 바로 더미로 넘어간다', () => {
    const { rig, e } = lift(mixOf('peak'), 1.0, 0.5);
    rig.release(e);
    rig.tick(1 / 60, e);
    rig.start(0.1, 0, mixOf('peak'), e);
    expect(rig.pile[2]).toBeGreaterThan(0);
    expect(rig.attached()).toBe(1);
  });
  it('reset은 잡기 상태를 다 지운다 — 목 폭 · 커밋 길이 · 버틴 시간(버티면 짧아짐도 처음으로, 검토 C-2)', () => {
    const rig = new StrandRig();
    const e = env();
    const m = mixOf('peak');
    rig.start(0, 0, m, e);
    rig.move(0, 1.5, 0);
    for (let i = 0; i < 60 * 3; i++) rig.tick(1 / 60, e);
    expect(rig.breakLen(e)).toBeLessThan(mainBreakLen(m));
    rig.reset();
    expect(rig.neck).toBe(0);
    expect(rig.lenCommit).toBe(0);
    expect(rig.breakLen(e)).toBe(mainBreakLen(m)); // held 0 → creep 1
    expect(rig.visible).toBe(false);
  });
  it('가는 가닥 밑점 · 끝점은 병 안(0.85R)에 머문다(§6-7)', () => {
    const rig = new StrandRig();
    const e = env();
    rig.start(0.7, 0.3, mixOf('peak'), e);
    rig.move(0.9, 2.5, 0.6);
    for (let i = 0; i < 60; i++) rig.tick(1 / 60, e);
    for (let s = 2; s < 12; s += 2) {
      expect(Math.hypot(rig.A[s * 4], rig.A[s * 4 + 2])).toBeLessThanOrEqual(0.85 * D_W / 2 + 1e-6);
      expect(Math.hypot(rig.C[(s + 1) * 4], rig.C[(s + 1) * 4 + 2])).toBeLessThanOrEqual(0.85 * D_W / 2 + 1e-6);
    }
  });
});

describe('DoughMesh 당기기 배선', () => {
  it('surfaceY는 vert 정지 항과 같은 식 — 가운데는 topY + 정지 혹(fbm 0.045)', () => {
    const d = new DoughMesh();
    const rp = RP('peak');
    d.applyParams(rp);
    d.tick(0);
    const u = d.material.uniforms;
    const seed = (u.uSeed.value as number) * 37;
    const sil = fbm2(3.1 + seed, 7.4 + seed) * 0.045 * (1 - 0.55 * rp.levelness - 0.3 * rp.fluidity) * (1 - 0.5 * rp.ripe);
    expect(d.surfaceY(0, 0)).toBeCloseTo(d.topY() + sil * d.mesh.scale.y, 6);
    const v = d.material.vertexShader;
    expect(v).toContain('fbm(p.xz * 1.8 + vec2(3.1, 7.4) + uSeed * 37.0) * 0.045');
    expect(v).toContain('* (1.0 - 0.55 * uLevel - 0.30 * uFluid) * (1.0 - 0.5 * uRipe)');
    expect(v).toContain('disp += uRipe * 0.05 * exp(-c2 * 2.5 * kR)');
    expect(v).toContain('disp -= uCollapse * 0.08 * exp(-c2 * 2.0 * kR)');
    // 2026-11-19 젓기 실물화: 계수는 jar.ts SURF_TILT(surfTiltK = 0.14·lev·(0.5 + 0.5·fl)), 윗물이 덮으면 끈다(§6-9)
    expect(v).toContain('p.y += dot(p.xz, uWobble) * surfTiltK() * (1.0 - hoochSpread(uHooch))');
    expect(v).toContain('return 0.14 * uLevel * (0.5 + 0.5 * uFluid);');
    expect(v).toContain('disp += uMenH * smoothstep(0.78, 1.0, length(xz0) / uRBody)');
  });
  it('fbm2(CPU)는 FBM_GLSL과 같은 식 — 0점 · 임의 점 값', () => {
    expect(fbm2(0, 0)).toBe(0.3 * Math.sin(13.7) * Math.cos(13.7)
      + 0.15 * Math.sin((0.8 * 13.7 + 0.6 * 13.7) * 1.9 + 5.1) * Math.cos((-0.6 * 13.7 + 0.8 * 13.7) * 1.9 + 5.1));
    expect(FBM_GLSL).toContain('p = R * p * 1.9 + 13.7;');
  });
  it('셰이더 짝 — FBM · GRAB_FIELD는 vert · frag에, DOUGH_SHADE는 반죽 frag · 가닥 frag에 같은 소스로', () => {
    const d = new DoughMesh();
    const fbmFn = /float fbm\(vec2 p\) \{[\s\S]*?\n\}/.exec(FBM_GLSL)![0];
    expect(d.material.vertexShader).toContain(fbmFn);
    expect(d.material.fragmentShader).toContain(fbmFn);
    expect(d.strands.material.fragmentShader).toContain(fbmFn);
    const gf = /vec3 grabField\(vec2 p\) \{[\s\S]*?\n\}/.exec(GRAB_FIELD)![0];
    expect(d.material.vertexShader).toContain(gf);
    expect(d.material.fragmentShader).toContain(gf);
    const sh = /vec3 doughShade\([\s\S]*?\n\}/.exec(DOUGH_SHADE)![0];
    expect(d.material.fragmentShader).toContain(sh);
    expect(d.strands.material.fragmentShader).toContain(sh);
    // 알베도(모틀 · 젖음)도 한 소스 — 가닥 frag에 복사해 두지 않는다(검토 C-1)
    const al = /vec3 doughAlbedo\([\s\S]*?\n\}/.exec(DOUGH_ALBEDO)![0];
    expect(d.material.fragmentShader).toContain(al);
    expect(d.strands.material.fragmentShader).toContain(al);
    for (const f of [d.material.fragmentShader, d.strands.material.fragmentShader]) {
      expect(f.split('mix(1.0, 0.93, uWet)').length - 1).toBe(1);
    }
    // 옛 리본 · 윈도우페인 · 겹 줄무늬는 없다
    expect(d.material.fragmentShader).not.toMatch(/vStretch|wpane|uGrabDisp/);
    expect(d.material.vertexShader).not.toMatch(/vStretch|uGrabShape|uGrabWrinkle/);
  });
  it('가닥 셰이더는 반죽 uniform 객체를 같은 객체로 공유한다', () => {
    const d = new DoughMesh();
    // 2026-11-19 상세 맵: 기둥 틈 몫(uPin)만 반죽 상태를 읽는다 — uRipe는 옛 기포 틈 그늘 몫이라 가닥에서 뺐다(이름만 바꾼 시험)
    for (const k of ['uColor', 'uSpecStr', 'uWet', 'uSlopeAspect', 'uPin']) {
      expect(d.strands.material.uniforms[k]).toBe(d.material.uniforms[k]);
    }
    expect(d.strands.material.uniforms.uRipe).toBeUndefined();
  });
  // 바뀐 시험(옛 「기둥 질감 — 절차 결 · 기포 틈」 GRAIN · SLIT 잠금): 절차 결 · cellBubble 틈을 블렌더 맵 한 번 읽기로 바꿨으니
  // 잠글 것도 맵 파일 · 읽기 횟수 · 좌표 · 노멀 · 띠 식으로 옮긴다. 주 가닥만 · 머리 빼기 · 세로 광 잠금은 그대로
  it('상세 맵 public/fx/strand_detail.png — ≤ 128KB · 256 × 512 RGBA8(PNG IHDR)', () => {
    const png = readFileSync('public/fx/strand_detail.png');
    expect(png.length).toBeLessThanOrEqual(128 * 1024);
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(256); // 너비 = 둘레
    expect(png.readUInt32BE(20)).toBe(512); // 높이 = 길이
    expect(png[24]).toBe(8); // 비트 깊이
    expect(png[25]).toBe(6); // 색 유형 6 = RGBA
  });
  it('기둥 질감 = 맵 한 번 읽기(노멀 · 띠 · 틈) · 옛 sin 결 · cellBubble 기둥 호출 없음 · 주 가닥만 · 머리 빼고 · 세로 광', () => {
    const d = new DoughMesh();
    const f = d.strands.material.fragmentShader;
    // 맵은 정확히 한 번, uDetail로 (분기 밖 — 밉 도함수)
    expect(f.split('texture(').length - 1).toBe(1);
    expect(f).toContain('texture(uDetail, vec2(vAng / 6.2832, vU * ');
    expect(f.indexOf('texture(uDetail')).toBeLessThan(f.indexOf('if (tex > 0.0) {'));
    // 옛 절차 결 · 기포 틈 호출은 없다(cellBubble은 반죽 frag 바늘구멍 몫으로만 남는다)
    expect(f).not.toMatch(/float ph = |float g = sin\(ph\)|cellBubble\(|GRAIN|SLIT|uRipe|uNeck/);
    expect(d.material.fragmentShader).toContain(/vec4 cellBubble\([\s\S]*?\n\}/.exec(CELL_BUBBLE)![0]);
    // v = vU × V_REPEAT(고정 반복 수) — 기둥이 늘어나면 결이 같이 길어진다. 값은 0.5D · 피크 목에서 한 칸이 둘레 1 : 길이 2가 되는 0.765(주석 계산)
    const rep = Number(/vU \* ([\d.]+)\)\), uDetailOn\)/.exec(f)![1]);
    expect(rep).toBeCloseTo(0.5 / (2 * 2 * Math.PI * 0.8 * 0.065), 1);
    // 주 가닥만(vMain) · 위 끝 둥근 머리(u 0.75~0.9 위)는 빼고
    expect(f).toContain('float tex = vMain * (1.0 - smoothstep(0.75, 0.9, vU));');
    // 노멀 = 맵 R · G를 둘레(circ) · 길이(T)로, 늘어날수록(st) 세게. 띠 = A · 틈 = B(uPin이 더하는 몫)
    expect(f).toMatch(/n = normalize\(n \+ \(circ \* dn\.x \+ T \* dn\.y\) \* \([\d.]+ \* mix\([\d.]+, 1\.0, st\) \* tex\)\);/);
    expect(f).toMatch(/col \*= 1\.0 \+ [\d.]+ \* \(dt\.a - 0\.5\) \* 2\.0 \* tex \* low;/);
    expect(f).toMatch(/col \*= mix\(1\.0, dt\.b, [\d.]+ \* \(0\.8 \+ 0\.4 \* smoothstep\(0\.004, 0\.2, uPin\)\) \* tex \* low\);/);
    // 정점 그늘 한 번 — 가닥 vert는 1
    expect(f).toContain('col *= vAO;');
    expect(d.strands.material.vertexShader).toContain('vAO = 1.0;');
    // 세로 광 — 반죽 키(doughKey) 한 소스, 접선 쪽 폭이 둘레 쪽보다 넓다(긴 하이라이트)
    expect(f).toContain('normalize(doughKey() + vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]))');
    const at = Number(/float ht = dot\(H, T\) \/ ([\d.]+);/.exec(f)![1]);
    const ab = Number(/float hb = dot\(H, B\) \/ ([\d.]+);/.exec(f)![1]);
    expect(at).toBeGreaterThan(3 * ab);
  });
  it('상세 맵 uniform — uDetail · uDetailOn(로드 전 0), 더미 메시도 같은 객체를 공유한다', () => {
    const d = new DoughMesh();
    const u = d.strands.material.uniforms;
    expect(u.uDetail.value).toBeInstanceOf(THREE.Texture);
    expect(u.uDetailOn.value).toBe(0);
    expect((d.coil.mesh.material as THREE.ShaderMaterial).uniforms.uDetail).toBe(u.uDetail);
  });
  it('sync는 주 가닥 길이를 uLen으로 넘긴다(결 · 틈 · 세로 광이 늘어날수록 또렷)', () => {
    const d = new DoughMesh();
    d.applyParams(RP('peak'));
    d.tick(0);
    d.grabStart(0.1, 0);
    let t = 0;
    for (let i = 1; i <= 40; i++) {
      t = i / 60;
      d.grabMove3(0.1 * 1.3, d.surfaceY(0.1, 0) + i * 0.02, 0);
      d.tick(t);
    }
    expect(d.strands.rig.len).toBeGreaterThan(0.1);
    expect(d.strands.material.uniforms.uLen.value).toBe(d.strands.rig.len);
  });
  it('잡기 확정 = 그 획의 고랑을 τ0.1s로 지운다(§6-12)', () => {
    const d = new DoughMesh();
    d.applyParams(RP('justfed'));
    for (let i = 0; i <= 20; i++) {
      d.setStirInput(0.01 * i, 0, 0.6, 0);
      d.tick(i / 60);
    }
    const amp = d.material.uniforms.uTrailAmp.value as Float32Array;
    expect(Math.max(...amp)).toBeGreaterThan(0.004);
    d.grabStart(0.2, 0);
    for (let i = 21; i <= 21 + 45; i++) d.tick(i / 60);
    expect(Math.max(...amp)).toBeLessThan(1e-4);
  });
  it('끊김은 grabBreaks로 나간다(SceneHost.onGrabBreak)', () => {
    const d = new DoughMesh();
    d.applyParams(RP('justfed'));
    d.tick(0);
    d.grabStart(0, 0);
    const y = d.surfaceY(0, 0);
    let n = 0;
    for (let i = 1; i <= 120; i++) {
      d.grabMove3(0, y + 0.1 + i * 0.01, 0);
      d.tick(i / 60);
      n += d.grabBreaks.length;
      if (d.grabBreaks.some((b) => b.last)) break;
    }
    expect(n).toBeGreaterThan(0);
    expect(d.grabStretch01()).toBe(0); // 주 가닥이 끊겼다
    expect((d.material.uniforms.uGrab.value as THREE.Vector4).y).toBe(0); // 끌려 모임 끝
  });
  it('NaN 복구로 상태기를 지우면 잡기도 놓는다 — grabDebug().held = false(검토 C-2)', () => {
    const d = new DoughMesh();
    d.applyParams(RP('peak'));
    d.tick(0);
    d.grabStart(0, 0);
    d.grabMove3(0, d.surfaceY(0, 0) + 0.3, 0);
    d.tick(1 / 60);
    expect(d.grabDebug().held).toBe(true);
    d.strands.rig.pile[0] = NaN;
    d.tick(2 / 60);
    expect(d.grabDebug().held).toBe(false);
    expect(d.strands.rig.finite()).toBe(true);
  });
  it('휴면은 잡고 올려도 끌려 모임 · 방사 결 0, 밑동 둔덕만 조금(§6-2)', () => {
    const d = new DoughMesh();
    d.applyParams(RP('dormant'));
    d.tick(0);
    d.grabStart(0, 0);
    const y = d.surfaceY(0, 0);
    let mound = 0;
    for (let i = 1; i <= 90; i++) {
      d.grabMove3(0, y + 0.1 + i * 0.01, 0);
      d.tick(i / 60);
      const g = d.material.uniforms.uGrab.value as THREE.Vector4;
      expect(g.y).toBe(0);
      mound = Math.max(mound, g.x);
    }
    expect(mound).toBeGreaterThan(0);
  });
});
