// 떼어내기 v5(2026-11-21, .work/feel4/spec_v5.md) — 꼬집기 상태기(StrandRig → col · pile) · surfaceY · 셰이더 소스 짝.
// 잠금값 쓰임(사용자 확정 2026-08-24, 값은 그대로): grabMax 0.600 = 피크 끊김 길이(mainBreakLen 그물 계수로 1.2D → 1.0D) ·
// ζ 0.956 = 밑자락 둔덕 · 흔들림 스프링이 「무겁게 되돌아온다」(DoughMesh, 그대로).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  D_W, DOUGH_ALBEDO, DOUGH_SHADE, FBM_GLSL, StrandRig, fbm2, mainBreakLen, strandMix,
  type StrandBreak, type StrandEnv, type StrandMix,
} from '../src/render/dough/StrandMesh';
import { DoughMesh, GRAB_FIELD, funnelH } from '../src/render/dough/DoughMesh';
import { toRenderParams } from '../src/render/renderParams';
import { simSnap, STATE_HOURS } from '../scripts/lib/simSnap';

const RP = (k: keyof typeof STATE_HOURS) => toRenderParams(simSnap(STATE_HOURS[k]));
const mixOf = (k: keyof typeof STATE_HOURS): StrandMix => {
  const r = RP(k);
  return strandMix(r.elasticity, r.fluidity, r.grabMax);
};
const env = (): StrandEnv => ({ surfaceY: () => 1, followTau: 0.07, creepDelay: 0.7, creepTau: 2.5 });

/** 앵커 (0, 0)에서 잡아 손끝을 초당 v(월드)로 곧게 올린다. 사건마다 [판 길이 − L_commit, 시각, 사건] */
function lift(mix: StrandMix, v: number, secs: number) {
  const rig = new StrandRig();
  const e = env();
  rig.start(0, 0, mix, e);
  const y0 = 1.1;
  rig.move(0, y0, 0);
  const ev: (StrandBreak & { over: number; t: number })[] = [];
  for (let i = 1; i <= secs * 60; i++) {
    rig.move(0, y0 + (v * i) / 60, 0);
    rig.tick(1 / 60, e);
    for (const b of rig.events) ev.push({ over: rig.len - rig.lenCommit, t: i / 60, ...b });
  }
  return { rig, ev, e };
}

describe('판 상태기 — 버팀 · 항복 · 다리 · 손 쪽 끊김', () => {
  it('피크 — 항복 한 번, 가는 다리 셋이 먼저 끊기고 마지막(굵은 다리)이 1.0D 근처 · 마지막 혼자 0.15s 안', () => {
    const { ev } = lift(mixOf('peak'), 1.5, 3);
    expect(ev.filter((b) => b.kind === 'yield').length).toBe(1);
    const br = ev.filter((b) => b.kind === 'break');
    expect(br.length).toBe(4);
    expect(br.slice(0, 3).every((b) => b.thin && !b.last)).toBe(true);
    const last = br[3];
    expect(last).toMatchObject({ thin: false, last: true });
    expect(last.over / D_W).toBeGreaterThan(0.9);
    expect(last.over / D_W).toBeLessThan(1.3);
    expect(last.t - br[2].t).toBeLessThanOrEqual(0.15);
    // 항복은 끊김보다 먼저, 0.25D ~ 0.5D 사이
    const y = ev.find((b) => b.kind === 'yield')!;
    expect(y.t).toBeLessThan(br[0].t);
    expect(y.over / D_W).toBeGreaterThan(0.24);
    expect(y.over / D_W).toBeLessThan(0.52);
  });
  it('갓 밥준 — 항복 · 갈래 없이 0.3D 안에서 한 번에 끊긴다 / 시큼 — 끊김 소리 0, 처져 떨어진다', () => {
    const j = lift(mixOf('justfed'), 1.0, 2).ev;
    expect(j.filter((b) => b.kind === 'yield').length).toBe(0);
    const jb = j.filter((b) => b.kind === 'break');
    expect(jb.length).toBe(1);
    expect(jb[0].last).toBe(true);
    expect(jb[0].over / D_W).toBeLessThan(0.3);
    const s = lift(mixOf('sour'), 1.5, 2);
    expect(s.ev.filter((b) => b.kind !== 'land').length).toBe(0);
    expect(s.rig.attached()).toBe(0);
    // 시큼은 짧은 줄기 — 끊김 길이가 피크의 절반 아래(막대 · 크레용으로 서지 않게, v5 2회전)
    expect(mainBreakLen(mixOf('sour'))).toBeLessThan(0.5 * mainBreakLen(mixOf('peak')));
  });
  it('피크 — 들었다가 손끝을 밑동 아래로 내려도 NaN 0(capK 0 → 0/0, 규칙 검수 v8d 막음)', () => {
    const rig = new StrandRig();
    const e = env();
    rig.start(0, 0, mixOf('peak'), e);
    expect(rig.finite()).toBe(true);
    for (let i = 1; i <= 20; i++) { rig.move(0, 1.0 + 0.01 * i, 0); rig.tick(1 / 60, e); }
    for (let i = 1; i <= 20; i++) { rig.move(0, 0.8, 0); rig.tick(1 / 60, e); }
    expect(rig.finite()).toBe(true);
  });
  it('그물(v8) — 끊김 전 마지막 25%에 그물이 0 → 1로 벌어지고, 끊긴 뒤에도 그대로(구멍이 한 프레임에 닫히지 않는다)', () => {
    const rig = new StrandRig();
    const e = env();
    rig.start(0, 0, mixOf('peak'), e);
    let firstThin = -1;
    for (let i = 1; i <= 240 && !rig.events.some((b) => b.last); i++) {
      rig.move(0, 1.1 + (1.5 * i) / 60, 0);
      rig.tick(1 / 60, e);
      if (firstThin < 0 && rig.events.some((b) => b.thin)) firstThin = rig.split;
    }
    expect(firstThin).toBeGreaterThan(0.5); // 가는 가닥이 끊길 땐 이미 그물이 벌어졌다
    // 그물은 목표를 τ0.1로 따른다(v8b 2회전 — 한 번에 열리던 구멍 · 이음선) — 끊길 땐 거의 다 벌어졌고, 끊긴 뒤에도 닫히지 않고 마저 벌어진다
    expect(rig.split).toBeGreaterThan(0.95);
    const s0 = rig.split;
    rig.tick(1 / 60, e);
    expect(rig.split).toBeGreaterThanOrEqual(s0);
  });
  it('가닥 끊김(v8c) — 붙은 동안 꼭대기 = 손끝 · 끊겨도 척추는 한 프레임에 안 바뀌고, 기둥은 0.22s smoothstep으로 꼭대기째 움츠러든다', () => {
    const rig = new StrandRig();
    const e = env();
    rig.start(0, 0, mixOf('peak'), e);
    rig.move(0, 1.6, 0);
    for (let i = 0; i < 90; i++) rig.tick(1 / 60, e);
    expect(Math.hypot(rig.spine[64], rig.spine[65] - 1.6, rig.spine[66])).toBeLessThan(1e-3);
    expect(rig.col[6]).toBe(0);
    let before = rig.spine.slice();
    for (let i = 1; i <= 120 && !rig.events.some((b) => b.last); i++) {
      before = rig.spine.slice();
      rig.move(0, 1.6 + (1.5 * i) / 60, 0);
      rig.tick(1 / 60, e);
    }
    expect(rig.events.some((b) => b.last)).toBe(true);
    // 끊긴 틱 — 척추 점은 손끝이 한 틱 움직인 만큼만(갈아 끼움 0), 움츠림은 한 걸음
    for (let i = 0; i < 68; i++) expect(Math.abs(rig.spine[i] - before[i])).toBeLessThan(0.05);
    expect(rig.col[6]).toBeLessThan(0.1);
    let prev = rig.col[6];
    for (let i = 0; i < 15; i++) {
      rig.tick(1 / 60, e);
      expect(rig.col[6] - prev).toBeLessThanOrEqual(0.15); // 60Hz 한 틱 ≤ 0.15(30fps 프레임 ≤ 0.3)
      prev = rig.col[6];
    }
    expect(rig.col[6]).toBe(1);
    expect(rig.col[18]).toBeCloseTo(11 / 16, 5); // 기둥은 꼭대기째 아래 몸 끝(점 11)까지 움츠러든다
  });
  it('뿔 없음 — 끊긴 아래 몸은 위로 서지 않고(끝 y 단조 감소) 굽으며 주저앉아 낮은 혹이 된다(v8c) · 놓으면 기둥이 사라진다', () => {
    const rig = new StrandRig();
    const e = env();
    rig.start(0, 0, mixOf('peak'), e);
    rig.move(0, 1.1, 0);
    for (let i = 1; i <= 240 && !rig.events.some((b) => b.last); i++) {
      rig.move(0, 1.1 + (1.5 * i) / 60, 0);
      rig.tick(1 / 60, e);
    }
    const h0 = rig.spine[37] - 1;
    let y = rig.spine[37];
    let landed = false;
    for (let i = 0; i < 45; i++) {
      rig.tick(1 / 60, e);
      expect(rig.spine[37]).toBeLessThanOrEqual(y + 1e-6);
      y = rig.spine[37];
      landed ||= rig.events.some((b) => b.kind === 'land' && b.torn);
    }
    expect(landed).toBe(true);
    expect(y - 1).toBeLessThan(0.25 * h0); // 0.75s 뒤 끊긴 끝은 표면 가까이 접혔다
    expect(rig.pile[2]).toBeGreaterThan(0.03 * D_W); // 접힘 높이장(혹 → 보조개) 높이
    rig.release();
    for (let i = 0; i < 60 * 3; i++) rig.tick(1 / 60, e);
    expect(rig.visible).toBe(false);
  });
  it('끊기 전에 놓으면 접힘만 — 찢긴 오목 0, 접힘은 피크 τ2s로 가라앉는다', () => {
    const { rig, e } = lift(mixOf('peak'), 1.0, 0.5);
    rig.release();
    for (let i = 0; i < 60 * 0.8; i++) rig.tick(1 / 60, e);
    const h0 = rig.pile[2];
    expect(h0).toBeGreaterThan(0.02 * D_W);
    for (let i = 0; i < 60 * 2; i++) rig.tick(1 / 60, e);
    expect(rig.pile[2] / h0).toBeCloseTo(Math.exp(-1), 1);
  });
  it('휴면 · 곰팡이(grabMax < 0.2) — 가닥 없음 · 사건 없음', () => {
    for (const k of ['dormant', 'moldy'] as const) {
      const { rig, ev } = lift(mixOf(k), 1.5, 2);
      expect(rig.none).toBe(true);
      expect(rig.visible).toBe(false);
      expect(ev.length).toBe(0);
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
  it('reset은 잡기 상태를 다 지운다 · 밑점 · 끝점은 병 안(0.85R)', () => {
    const rig = new StrandRig();
    const e = env();
    const m = mixOf('peak');
    rig.start(0.7, 0.3, m, e);
    rig.move(0.9, 2.5, 0.6);
    for (let i = 0; i < 60; i++) rig.tick(1 / 60, e);
    expect(Math.hypot(rig.spine[64], rig.spine[66])).toBeLessThanOrEqual(0.85 * D_W / 2 + 1e-6);
    for (let i = 0; i < 60 * 3; i++) rig.tick(1 / 60, e);
    rig.reset();
    expect(rig.len).toBe(0);
    expect(rig.col[6]).toBe(0);
    expect(rig.lenCommit).toBe(0);
    expect(rig.pile[2]).toBe(0);
    expect(rig.breakLen(e)).toBe(mainBreakLen(m));
    expect(rig.visible).toBe(false);
  });
  it('녹는 중 다시 잡기 — 무늬 이완은 한 틱에 0.3 넘게 뛰지 않고, 녹음 몫은 바로 0(spec_v8b §7)', () => {
    const rig = new StrandRig();
    const e = env();
    rig.start(0, 0, mixOf('peak'), e);
    for (let i = 1; i <= 240 && rig.melt < 0.3; i++) {
      rig.move(0, 1.1 + (1.5 * Math.min(i, 120)) / 60, 0);
      rig.tick(1 / 60, e);
    }
    expect(rig.melt).toBeGreaterThan(0.3);
    expect(rig.relax).toBeGreaterThan(0.5);
    let prev = rig.relax;
    rig.start(0, 0, mixOf('peak'), e);
    expect(rig.melt).toBe(0);
    for (let i = 1; i <= 30; i++) {
      rig.move(0, 1.1 + i * 0.01, 0);
      rig.tick(1 / 60, e);
      expect(Math.abs(rig.relax - prev)).toBeLessThan(0.3);
      prev = rig.relax;
    }
    expect(rig.relax).toBeLessThan(0.2); // τ0.15로 풀린다
  });
});

describe('DoughMesh 들기 배선', () => {
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
    // 젓기 v3: 정지 혹은 소용돌이 도메인 q에서 읽는다(젓지 않았으면 q = p.xz — 위 값 그대로)
    expect(v).toContain('fbm(q * 1.8 + vec2(3.1, 7.4) + uSeed * 37.0) * 0.045');
    expect(v).toContain('* (1.0 - 0.55 * uLevel - 0.30 * uFluid) * (1.0 - 0.5 * uRipe)');
    expect(v).toContain('disp += uRipe * 0.05 * exp(-c2 * 2.5 * kR)');
    expect(v).toContain('disp -= uCollapse * 0.08 * exp(-c2 * 2.0 * kR)');
    // 2026-11-19 젓기 실물화: 계수는 jar.ts SURF_TILT(surfTiltK = 0.14·lev·(0.5 + 0.5·fl)), 윗물이 덮으면 끈다(§6-9)
    expect(v).toContain('p.y += dot(p.xz, uWobble) * surfTiltK() * (1.0 - hoochSpread(uHooch))');
    expect(v).toContain('return 0.14 * uLevel * (0.5 + 0.5 * uFluid);');
    expect(v).toContain('disp += uMenH * smoothstep(0.78, 1.0, length(xz0) / uRBody)');
  });
  it('funnelH(CPU)는 GRAB_FIELD funnelH와 같은 식 — 가운데 1 · 밖 0 · 0.5 값', () => {
    expect(GRAB_FIELD).toContain('float k = (sqrt(u * u + 0.04) - 0.2) / 0.8198;'+String.fromCharCode(10)+'  return (1.0 - k) * (1.0 - k);');
    expect([funnelH(0), funnelH(1), funnelH(0.5)].map((v) => +v.toFixed(4))).toEqual([1, 0, +((1 - (Math.sqrt(0.29) - 0.2) / 0.8198) ** 2).toFixed(4)]);
  });
  it('fbm2(CPU)는 FBM_GLSL과 같은 식 — 0점 · 임의 점 값', () => {
    expect(fbm2(0, 0)).toBe(0.3 * Math.sin(13.7) * Math.cos(13.7)
      + 0.15 * Math.sin((0.8 * 13.7 + 0.6 * 13.7) * 1.9 + 5.1) * Math.cos((-0.6 * 13.7 + 0.8 * 13.7) * 1.9 + 5.1));
    expect(FBM_GLSL).toContain('p = R * p * 1.9 + 13.7;');
  });
  it('셰이더 짝 — FBM · GRAB_FIELD(liftH · liftQ · pinchRad · pinchPos · pinchApply)는 vert · frag에, DOUGH_SHADE · 알베도는 반죽 frag에 같은 소스로', () => {
    const d = new DoughMesh();
    const fbmFn = /float fbm\(vec2 p\) \{[\s\S]*?\n\}/.exec(FBM_GLSL)![0];
    expect(d.material.vertexShader).toContain(fbmFn);
    expect(d.material.fragmentShader).toContain(fbmFn);
    for (const re of [/float liftH\(vec2 p\) \{[\s\S]*?\n\}/, /vec2 liftQ\(vec2 q, float th\) \{[\s\S]*?\n\}/,
      /vec2 pinchRad\([\s\S]*?\n\}/, /vec3 pinchPos\([\s\S]*?\n\}/, /vec3 pinchApply\([\s\S]*?\n\}/]) {
      const src = re.exec(GRAB_FIELD)![0];
      expect(d.material.vertexShader).toContain(src);
      expect(d.material.fragmentShader).toContain(src);
    }
    // 무늬 도메인 = 젓기 회전 뒤 끌림 한 번 더(vert · frag 같은 줄 꼴)
    // swirlQ는 한 번만 계산해 sqz로 다시 쓴다(규칙 검수 v8d)
    expect(d.material.vertexShader).toContain('vec2 sqz = swirlQ(p.xz, sw.x);');
    expect(d.material.vertexShader).toContain('vec2 q = liftQ(sqz, sw.x);');
    expect(d.material.fragmentShader).toContain('vec2 sqz = swirlQ(vXZ, sw.x);');
    expect(d.material.fragmentShader).toContain('vec2 q = liftQ(sqz, sw.x);');
    expect(d.material.vertexShader).toContain('disp += liftH(p.xz);');
    expect(d.material.fragmentShader).toContain('dBs += liftGrad(vXZ);');
    const sh = /vec3 doughShade\([\s\S]*?\n\}/.exec(DOUGH_SHADE)![0];
    expect(d.material.fragmentShader).toContain(sh);
    const al = /vec3 doughAlbedo\([\s\S]*?\n\}/.exec(DOUGH_ALBEDO)![0];
    expect(d.material.fragmentShader).toContain(al);
  });
  it('꼬집기는 반죽 셰이더 안에서만 — 버텍스 마지막 단계 · 구멍은 discard · 텍스처 fetch 0', () => {
    const d = new DoughMesh();
    expect(d.material.vertexShader).toContain('p = pinchApply(p, pinR, vPN, vPinch, vCut);');
    const f = d.material.fragmentShader;
    expect(f).not.toContain('texture(');
    expect(f).toContain('discard');
  });
  it('uSpine · uPinch ~ uPinchF는 rig.spine · rig.col을 그대로 넘긴다', () => {
    const d = new DoughMesh();
    d.applyParams(RP('peak'));
    d.tick(0);
    d.grabStart(0.1, 0);
    for (let i = 1; i <= 40; i++) {
      d.grabMove3(0.1 * 1.3, d.surfaceY(0.1, 0) + i * 0.02, 0);
      d.tick(i / 60);
    }
    expect(d.rig.len).toBeGreaterThan(0.1);
    const u = d.material.uniforms;
    const c = Array.from(d.rig.col);
    const got = (['uPinch', 'uPinchB', 'uPinchC', 'uPinchD', 'uPinchE', 'uPinchF'] as const).flatMap((k) => (u[k].value as THREE.Vector4).toArray());
    expect(got).toEqual(c);
    const sp = (u.uSpine.value as THREE.Vector4[]).flatMap((v) => v.toArray());
    expect(sp).toEqual(Array.from(d.rig.spine));
    expect((u.uPinchC.value as THREE.Vector4).x).toBeGreaterThan(0);
  });
  it('무늬 끌림(uGrab.z)은 들면 차고, 놓으면 1~3s에 풀리되 흔적(20%)이 남았다가 사라진다', () => {
    const d = new DoughMesh();
    d.applyParams(RP('peak'));
    d.tick(0);
    d.grabStart(0, 0);
    const y = d.surfaceY(0, 0);
    const g = d.material.uniforms.uGrab.value as THREE.Vector4;
    let t = 0;
    for (let i = 1; i <= 85; i++) { // 떼어내기 v4: 버팀(τ0.16)으로 판이 늦게 따라와 0.3s 더 든다
      t = i / 60;
      d.grabMove3(0, y + 0.1 + i * 0.015, 0);
      d.tick(t);
    }
    const z0 = g.z;
    expect(z0).toBeGreaterThan(0.5);
    d.grabEnd();
    for (let i = 1; i <= 180; i++) d.tick(t + i / 60);
    expect(g.z / z0).toBeLessThan(0.25);
    expect(g.z / z0).toBeGreaterThan(0.1);
    for (let i = 181; i <= 60 * 60; i++) d.tick(t + i / 60);
    expect(g.z).toBe(0);
  });
  it('잡기 확정 = 그 획의 손끝 패임을 τ0.1s로 지운다(§6-12, 젓기 v3 — 옛 고랑 자취 대신 uTip.z)', () => {
    const d = new DoughMesh();
    d.applyParams(RP('justfed'));
    for (let i = 0; i <= 20; i++) {
      d.setStirInput(0.01 * i, 0, 0.6, 0);
      d.tick(i / 60);
    }
    const tip = d.material.uniforms.uTip.value as THREE.Vector4;
    expect(tip.z).toBeGreaterThan(0.004);
    d.grabStart(0.2, 0);
    for (let i = 21; i <= 21 + 45; i++) d.tick(i / 60);
    expect(tip.z).toBeLessThan(1e-4);
  });
  it('끊김은 grabBreaks로 나간다(SceneHost.onGrabEvent)', () => {
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
    expect(d.rig.attached()).toBe(0); // 끌림은 이제 τ0.8s로 풀린다(바로 0이 아니다)
  });
  it('NaN 복구로 상태기를 지우면 잡기도 놓는다 — grabDebug().held = false(검토 C-2)', () => {
    const d = new DoughMesh();
    d.applyParams(RP('peak'));
    d.tick(0);
    d.grabStart(0, 0);
    d.grabMove3(0, d.surfaceY(0, 0) + 0.3, 0);
    d.tick(1 / 60);
    expect(d.grabDebug().held).toBe(true);
    d.rig.pile[0] = NaN;
    d.tick(2 / 60);
    expect(d.grabDebug().held).toBe(false);
    expect(d.rig.finite()).toBe(true);
  });
  it('휴면은 잡고 올려도 끌려 모임 · 무늬 끌림 0, 밑자락 둔덕만 조금(§6-2)', () => {
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
      expect(g.z).toBe(0);
      mound = Math.max(mound, g.x);
    }
    expect(mound).toBeGreaterThan(0);
  });
});
