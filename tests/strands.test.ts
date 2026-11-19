// 들기 v3(2026-11-19 손맛 3차, .work/feel3/spec.md 「들기 v3 명세 초안」) — 순수 상태기(StrandRig) · surfaceY · 셰이더 소스 짝.
// 잠금값 쓰임(사용자 확정 2026-08-24, 값은 그대로): grabMax 0.600 = 피크 주 가닥 끊김 길이 1.2D(mainBreakLen, 1.6.16과 같다) ·
// ζ 0.956 = 밑자락 둔덕 · 흔들림 스프링이 「무겁게 되돌아온다」(DoughMesh, 1.6.16과 같다). 들기 v3에서 두 쓰임은 안 바뀌었다.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  D_W, DOUGH_ALBEDO, DOUGH_SHADE, FBM_GLSL, LIFT_LUMP, LUMP_Y, StrandRig, fbm2, mainBreakLen, strandMix,
  type StrandEnv, type StrandMix,
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
  rig.move(0, y0, 0);
  const breaks: { over: number; thin: boolean; last: boolean }[] = [];
  let splitMax = 0;
  let neckMin = Infinity;
  for (let i = 1; i <= secs * 60; i++) {
    rig.move(0, y0 + (v * i) / 60, 0);
    rig.tick(1 / 60, e);
    splitMax = Math.max(splitMax, rig.split);
    // 화면 목 지름 = 주 가닥 반지름 × 2 × (1 − 목 조임)
    if (rig.attached()) neckMin = Math.min(neckMin, 2 * rig.A[3] * (1 - rig.C[3]));
    for (const b of rig.events) breaks.push({ over: rig.len - rig.lenCommit, ...b });
  }
  return { rig, breaks, splitMax, neckMin, e };
}

describe('가닥 상태기 — 주 가닥 하나 · 상태마다 다른 끊김', () => {
  it('피크 — 끊기기 전에 두 갈래로 갈라지고(UPQ94 12s), 한 번에 끊긴다(1.2D 근처) · 소리 하나', () => {
    const { breaks, splitMax } = lift(mixOf('peak'), 1.5, 3);
    expect(splitMax).toBeGreaterThan(0.5);
    expect(breaks.length).toBe(1);
    expect(breaks[0]).toMatchObject({ thin: false, last: true });
    expect(breaks[0].over / D_W).toBeGreaterThan(0.9);
    expect(breaks[0].over / D_W).toBeLessThan(1.3);
  });
  it('부피 보존 — 목은 끊기기 직전 시작 폭의 1/5 아래로(명세 「5배 넘게」)', () => {
    const m = mixOf('peak');
    const { neckMin } = lift(m, 1.5, 3);
    const w0 = D_W * (0.17 * m.web + 0.13 * m.stiff + 0.12 * m.runny);
    expect(neckMin / w0).toBeLessThan(0.2);
  });
  it('묽음(시큼) — 갈라지지 않는 한 줄, 끊김 길이를 넘어도 소리 없이 주저앉는다 · 목 0.1D 아래로 안 간다', () => {
    const m = mixOf('sour');
    expect(m.runny).toBeGreaterThan(0.9);
    const { breaks, splitMax, rig, neckMin } = lift(m, 1.5, 2);
    expect(splitMax).toBe(0);
    expect(breaks.length).toBe(0);
    expect(rig.attached()).toBe(0);
    expect(neckMin / D_W).toBeGreaterThanOrEqual(0.1 * m.runny - 1e-6);
  });
  it('갓 밥준 — 짧게(0.3D 안) 한 번에 끊긴다', () => {
    const { breaks } = lift(mixOf('justfed'), 1.0, 2);
    expect(breaks.length).toBe(1);
    expect(breaks[0].over / D_W).toBeLessThan(0.3);
  });
  it('목 조임은 붙어 있는 주 가닥 도막만(C.w), 곁가닥은 0', () => {
    const { rig } = lift(mixOf('peak'), 1.5, 0.9);
    for (let s = 2; s < 4; s++) expect(rig.C[s * 4 + 3]).toBe(0);
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

describe('끊김 · 주저앉음 · 더미', () => {
  it('끊기면 위쪽은 0.15s에 손끝 덩이로 말려 올라가고(덩이는 남는다), 아래쪽은 1초 넘게 느리게 주저앉는다', () => {
    const rig = new StrandRig();
    const e = env();
    rig.start(0, 0, mixOf('peak'), e);
    rig.move(0, 1.1, 0);
    for (let i = 1; i <= 240 && !rig.events.length; i++) {
      rig.move(0, 1.1 + (1.5 * i) / 60, 0);
      rig.tick(1 / 60, e);
    }
    expect(rig.events.length).toBe(1);
    const up = 1;
    const lo = 0;
    const len0 = Math.hypot(rig.A[up * 4] - rig.C[up * 4], rig.A[up * 4 + 1] - rig.C[up * 4 + 1]);
    const top0 = rig.C[lo * 4 + 1];
    for (let i = 0; i < 12; i++) rig.tick(1 / 60, e); // 0.2s
    const len1 = Math.hypot(rig.A[up * 4] - rig.C[up * 4], rig.A[up * 4 + 1] - rig.C[up * 4 + 1]);
    expect(len1).toBeLessThan(0.7 * len0); // 덩이 지름 아래로는 안 준다
    expect(rig.B[up * 4 + 3]).toBeGreaterThan(0); // 덩이
    // 납작 원반 금지 — 말린 길이는 덩이 지름 언저리
    expect(len1).toBeGreaterThan(rig.B[up * 4 + 3]);
    for (let i = 0; i < 48; i++) rig.tick(1 / 60, e); // 끊긴 뒤 1s
    expect(rig.C[lo * 4 + 1]).toBeGreaterThan(1 + 0.3 * (top0 - 1)); // 아직 다 안 내려왔다
    expect(rig.pile[2]).toBeGreaterThan(0); // 더미가 같이 자란다
    for (let i = 0; i < 120; i++) rig.tick(1 / 60, e);
    expect(rig.A[lo * 4 + 3]).toBe(0); // 다 녹아들었다
  });
  it('놓으면 주저앉아 더미가 되고, 더미는 τ4s로 꺼지며 반들 자국은 6s까지 차 있다가 13s에 0', () => {
    const { rig, e } = lift(mixOf('peak'), 1.0, 0.5);
    rig.release(e);
    for (let i = 0; i < 60 * 2.5; i++) rig.tick(1 / 60, e);
    expect(rig.visible).toBe(false);
    const h0 = rig.pile[2];
    expect(h0).toBeGreaterThan(0.05 * D_W);
    expect(rig.pile[4]).toBe(1);
    for (let i = 0; i < 60 * 4; i++) rig.tick(1 / 60, e);
    expect(rig.pile[2] / h0).toBeCloseTo(Math.exp(-1), 1);
    for (let i = 0; i < 60 * 10; i++) rig.tick(1 / 60, e); // 마지막 보탬(주저앉음 끝 2.2s)에서 13s 넘게
    expect(rig.pile[4]).toBe(0);
  });
  it('주저앉는 중 다시 잡으면 새 가닥 — 남은 몫은 바로 더미로 넘어간다', () => {
    const { rig, e } = lift(mixOf('peak'), 1.0, 0.5);
    rig.release(e);
    rig.tick(1 / 60, e);
    rig.start(0.1, 0, mixOf('peak'), e);
    expect(rig.pile[2]).toBeGreaterThan(0);
    expect(rig.attached()).toBe(1);
  });
  it('reset은 잡기 상태를 다 지운다 — 목 폭 · 커밋 길이 · 버틴 시간 · 더미', () => {
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
    expect(rig.pile[2]).toBe(0);
    expect(rig.breakLen(e)).toBe(mainBreakLen(m));
    expect(rig.visible).toBe(false);
  });
  it('밑점 · 끝점은 병 안(0.85R)에 머문다', () => {
    const rig = new StrandRig();
    const e = env();
    rig.start(0.7, 0.3, mixOf('peak'), e);
    rig.move(0.9, 2.5, 0.6);
    for (let i = 0; i < 60; i++) rig.tick(1 / 60, e);
    for (let s = 0; s < 4; s++) {
      expect(Math.hypot(rig.A[s * 4], rig.A[s * 4 + 2])).toBeLessThanOrEqual(0.85 * D_W / 2 + 1e-6);
      expect(Math.hypot(rig.C[s * 4], rig.C[s * 4 + 2])).toBeLessThanOrEqual(0.85 * D_W / 2 + 1e-6);
    }
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
  it('fbm2(CPU)는 FBM_GLSL과 같은 식 — 0점 · 임의 점 값', () => {
    expect(fbm2(0, 0)).toBe(0.3 * Math.sin(13.7) * Math.cos(13.7)
      + 0.15 * Math.sin((0.8 * 13.7 + 0.6 * 13.7) * 1.9 + 5.1) * Math.cos((-0.6 * 13.7 + 0.8 * 13.7) * 1.9 + 5.1));
    expect(FBM_GLSL).toContain('p = R * p * 1.9 + 13.7;');
  });
  it('셰이더 짝 — FBM · GRAB_FIELD(liftH · liftQ · pileSheen)는 vert · frag에, DOUGH_SHADE · 알베도는 반죽 frag · 가닥 frag에 같은 소스로', () => {
    const d = new DoughMesh();
    const fbmFn = /float fbm\(vec2 p\) \{[\s\S]*?\n\}/.exec(FBM_GLSL)![0];
    expect(d.material.vertexShader).toContain(fbmFn);
    expect(d.material.fragmentShader).toContain(fbmFn);
    expect(d.strands.material.fragmentShader).toContain(fbmFn);
    for (const re of [/float liftH\(vec2 p\) \{[\s\S]*?\n\}/, /vec2 liftQ\(vec2 q, float th\) \{[\s\S]*?\n\}/]) {
      const src = re.exec(GRAB_FIELD)![0];
      expect(d.material.vertexShader).toContain(src);
      expect(d.material.fragmentShader).toContain(src);
    }
    // 무늬 도메인 = 젓기 회전 뒤 끌림 한 번 더(vert · frag 같은 줄 꼴)
    expect(d.material.vertexShader).toContain('liftQ(swirlQ(p.xz, sw.x), sw.x)');
    expect(d.material.fragmentShader).toContain('liftQ(swirlQ(vXZ, sw.x), sw.x)');
    expect(d.material.vertexShader).toContain('disp += liftH(p.xz);');
    expect(d.material.fragmentShader).toContain('dBs += liftGrad(vXZ);');
    const sh = /vec3 doughShade\([\s\S]*?\n\}/.exec(DOUGH_SHADE)![0];
    expect(d.material.fragmentShader).toContain(sh);
    expect(d.strands.material.fragmentShader).toContain(sh);
    const al = /vec3 doughAlbedo\([\s\S]*?\n\}/.exec(DOUGH_ALBEDO)![0];
    expect(d.material.fragmentShader).toContain(al);
    expect(d.strands.material.fragmentShader).toContain(al);
  });
  it('가닥 셰이더는 반죽 uniform 객체를 공유하고, 텍스처를 읽지 않는다(결 맵 대신 늘인 알베도 좌표)', () => {
    const d = new DoughMesh();
    for (const k of ['uColor', 'uSpecStr', 'uWet', 'uSlopeAspect']) {
      expect(d.strands.material.uniforms[k]).toBe(d.material.uniforms[k]);
    }
    const f = d.strands.material.fragmentShader;
    expect(f).not.toContain('texture(');
    expect(f).toContain('doughAlbedo(xz, mott)');
    expect(f).toContain('vec2 xz = mix(grainQ(vAng, vU), vW.xz * uSlopeAspect, lumpM);');
  });
  it('손끝 덩이 띄우기 — LIFT_LUMP면 가닥 끝 목표가 터치점보다 LUMP_Y 위', () => {
    const d = new DoughMesh();
    d.applyParams(RP('peak'));
    d.tick(0);
    d.grabStart(0, 0);
    const y = d.surfaceY(0, 0) + 0.3;
    d.grabMove3(0, y, 0);
    for (let i = 1; i <= 60; i++) d.tick(i / 60);
    const top = d.strands.rig.C[1 * 4 + 1];
    expect(top).toBeCloseTo(y + LIFT_LUMP * LUMP_Y, 2);
  });
  it('sync는 주 가닥 길이를 uLen으로 넘긴다', () => {
    const d = new DoughMesh();
    d.applyParams(RP('peak'));
    d.tick(0);
    d.grabStart(0.1, 0);
    for (let i = 1; i <= 40; i++) {
      d.grabMove3(0.1 * 1.3, d.surfaceY(0.1, 0) + i * 0.02, 0);
      d.tick(i / 60);
    }
    expect(d.strands.rig.len).toBeGreaterThan(0.1);
    expect(d.strands.material.uniforms.uLen.value).toBe(d.strands.rig.len);
  });
  it('높이 주름 · 끌림(uGrab.z)은 들면 차고, 놓으면 1~3s에 풀리되 흔적(20%)이 남았다가 사라진다', () => {
    const d = new DoughMesh();
    d.applyParams(RP('peak'));
    d.tick(0);
    d.grabStart(0, 0);
    const y = d.surfaceY(0, 0);
    const g = d.material.uniforms.uGrab.value as THREE.Vector4;
    let t = 0;
    for (let i = 1; i <= 50; i++) {
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
    expect(d.strands.rig.attached()).toBe(0); // 끌림은 이제 τ0.8s로 풀린다(바로 0이 아니다)
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
  it('휴면은 잡고 올려도 끌려 모임 · 높이 주름 0, 밑자락 둔덕만 조금(§6-2)', () => {
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
