// 섞는 맛 · 질감 업그레이드(2026-11-19, implementation-notes 「섞는 맛」 M2 · M3) — 렌더 상태기.
// 고랑 자취 · 테두리 고정 · 피크 꺼짐 · 줄무늬 · 다 섞임 · hooch 탁해짐. node라 GLSL은 소스로만 잠근다.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { toRenderParams } from '../src/render/renderParams';
import { DoughMesh, R_BODY, TRAIL_N } from '../src/render/dough/DoughMesh';
import { createJar, MARBLE_GLSL } from '../src/render/jar';
import { SceneHost } from '../src/render/SceneHost';
import { simSnap, STATE_HOURS } from '../scripts/lib/simSnap';

const RP = (k: keyof typeof STATE_HOURS) => toRenderParams(simSnap(STATE_HOURS[k]));

/** 원 그리기 손 젓기 — 반경 0.55R, 한 바퀴 secPerLoop초, 60fps. 끝난 시각을 돌려준다 */
function stirCircle(d: DoughMesh, t0: number, loops: number, secPerLoop = 0.9, hand = true): number {
  const r = 0.55 * R_BODY;
  const n = Math.round(loops * secPerLoop * 60);
  const w = (Math.PI * 2) / secPerLoop;
  let t = t0;
  for (let i = 0; i <= n; i++) {
    t = t0 + i / 60;
    const a = w * (t - t0);
    d.setStirInput(Math.cos(a) * r, Math.sin(a) * r, -Math.sin(a) * r * w, Math.cos(a) * r * w, true, hand);
    d.tick(t);
  }
  return t;
}
const idle = (d: DoughMesh, t0: number, sec: number): number => {
  let t = t0;
  for (let i = 1; i <= Math.round(sec * 60); i++) d.tick((t = t0 + i / 60));
  return t;
};
const trailAmps = (d: DoughMesh): Float32Array => d.material.uniforms.uTrailAmp.value as Float32Array;
const maxAmp = (d: DoughMesh): number => Math.max(...trailAmps(d));

describe('되기 — stirThickness 0 묽음 · 1 되직', () => {
  it('갓 밥준(되직)이 시큼(묽음)보다 크고 0~1 안', () => {
    const a = new DoughMesh();
    a.applyParams(RP('justfed'));
    const b = new DoughMesh();
    b.applyParams(RP('sour'));
    expect(a.stirThickness()).toBeGreaterThan(b.stirThickness() + 0.3);
    for (const v of [a.stirThickness(), b.stirThickness()]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('고랑 자취 — 8점 · 선분 7개, 묽으면 빨리 · 되직하면 늦게 메워진다(M2)', () => {
  it('자취는 8점이고 저으면 고랑이 생긴다', () => {
    expect(TRAIL_N).toBe(8);
    const d = new DoughMesh();
    d.applyParams(RP('justfed'));
    stirCircle(d, 0, 1);
    expect(maxAmp(d)).toBeGreaterThan(0.01);
  });
  const fillTime = (k: keyof typeof STATE_HOURS): number => {
    const d = new DoughMesh();
    d.applyParams(RP(k));
    let t = stirCircle(d, 0, 1);
    const a0 = maxAmp(d);
    let s = 0;
    while (maxAmp(d) > a0 * 0.37 && s < 10) {
      t += 1 / 60;
      s += 1 / 60;
      d.tick(t);
    }
    return s;
  };
  it('메워짐 τ — 시큼 0.3~0.6s · 갓 밥준 1s 넘게', () => {
    expect(fillTime('sour')).toBeLessThan(0.6);
    expect(fillTime('sour')).toBeGreaterThan(0.2);
    expect(fillTime('justfed')).toBeGreaterThan(1.0);
  });
  it('피크는 덜 메워진다 — 같은 되기보다 τ가 길다', () => {
    const d = new DoughMesh();
    const pk = RP('peak');
    expect(pk.ripe).toBeGreaterThan(0.5);
    d.applyParams(pk);
    const flat = new DoughMesh();
    flat.applyParams({ ...pk, ripe: 0 });
    let t = stirCircle(d, 0, 1);
    stirCircle(flat, 0, 1);
    const a = maxAmp(d);
    const b = maxAmp(flat);
    t = idle(d, t, 0.8);
    idle(flat, t - 0.8, 0.8);
    expect(maxAmp(d) / a).toBeGreaterThan(maxAmp(flat) / b);
  });
  it('새 획의 첫 점은 앞 획과 잇지 않는다(uTrailK 음수 = 끊김)', () => {
    const d = new DoughMesh();
    d.applyParams(RP('justfed'));
    let t = stirCircle(d, 0, 1);
    const k = d.material.uniforms.uTrailK.value as Float32Array;
    expect(Array.from(k).some((v) => v < 0)).toBe(false); // 한 획이 버퍼를 다 채우면 끊김 표시는 밀려난다
    t = idle(d, t, 0.3);
    d.setStirInput(-0.3, -0.3, 1, 0);
    d.tick(t + 1 / 60);
    expect(Array.from(k).some((v) => v < 0)).toBe(true);
  });
});

describe('테두리 고정 · 되직한 반죽은 판째 안 기운다(M2)', () => {
  const wobbleAfterStir = (k: keyof typeof STATE_HOURS): number => {
    const d = new DoughMesh();
    d.applyParams(RP(k));
    stirCircle(d, 0, 1, 0.5);
    return d.wobble.length();
  };
  it('갓 밥준(fluidity 0.22) 젓기 출렁 = 0, 시큼은 출렁인다', () => {
    expect(RP('justfed').fluidity).toBeLessThan(0.3);
    expect(wobbleAfterStir('justfed')).toBeLessThan(1e-6);
    expect(wobbleAfterStir('sour')).toBeGreaterThan(0.01);
  });
  it('버텍스: 시어 · grab xz · 슬로싱 강체 xz에 테두리 고정 계수(r/R 0.8→1.0)를 곱한다', () => {
    const v = new DoughMesh().material.vertexShader;
    expect(v).toMatch(/float pin = 1\.0 - smoothstep\(0\.8, 1\.0, length\(xz0\) \/ uRBody\)/);
    expect(v).toMatch(/uStirVec \* sfall \* pin/);
    expect(v).toMatch(/rigid \* pin/);
    expect(v).toMatch(/grabXZ \+ \(p\.xz - grabXZ\) \* pin/);
  });
  it('손끝 밑 섬(|stirVec|·0.35·sfall) 솟음이 없다', () => {
    expect(new DoughMesh().material.vertexShader).not.toMatch(/length\(uStirVec\) \* 0\.35/);
  });
});

describe('고랑 셰이더 — vert · frag 같은 함수 · 같은 상수(규칙 8)', () => {
  it('두 셰이더가 같은 trailGroove 소스를 쓰고, frag는 윗면에서만 부른다', () => {
    const d = new DoughMesh();
    const fn = /vec4 trailGroove\(vec2 p\) \{[\s\S]*?\n\}/.exec(d.material.vertexShader)?.[0];
    expect(fn).toBeDefined();
    expect(d.material.fragmentShader).toContain(fn!);
    expect(fn).toMatch(/\(1\.0 - 2\.0 \* bq\)/); // f = −A(1−2q)e^(−q)
    expect(d.material.fragmentShader).toMatch(/if \(vTop > 0\.5\) \{\s*vec4 tg = trailGroove\(vXZ\)/);
  });
});

describe('피크 젓기 꺼짐 — knock가 uSink에 더해지고 τ20s로 돌아온다(M2)', () => {
  it('피크를 저으면 uSink가 오르고, 갓 밥준(ripe 0)은 그대로', () => {
    const pk = new DoughMesh();
    pk.applyParams(RP('peak'));
    const t = stirCircle(pk, 0, 3);
    const s1 = pk.material.uniforms.uSink.value as number;
    expect(s1).toBeGreaterThan(RP('peak').sink + 0.2);
    expect(s1).toBeLessThanOrEqual(RP('peak').sink + 0.6 + 1e-6);
    idle(pk, t, 20);
    const s2 = pk.material.uniforms.uSink.value as number;
    expect(s2 - RP('peak').sink).toBeLessThan((s1 - RP('peak').sink) * 0.45);
    expect(s2 - RP('peak').sink).toBeGreaterThan((s1 - RP('peak').sink) * 0.3);
    const jf = new DoughMesh();
    jf.applyParams(RP('justfed'));
    stirCircle(jf, 0, 3);
    expect(jf.material.uniforms.uSink.value).toBeCloseTo(RP('justfed').sink, 6);
  });
  it('topY도 꺼짐을 따른다(레이캐스트 평면)', () => {
    const d = new DoughMesh();
    d.applyParams(RP('peak'));
    d.tick(0);
    const y0 = d.topY();
    stirCircle(d, 0, 3);
    expect(d.topY()).toBeLessThan(y0 - 0.005);
  });
});

describe('줄무늬 · 다 섞임 신호(M3)', () => {
  it('혼자 두면 τ6s로 옅어지고 신호는 없다', () => {
    const d = new DoughMesh();
    d.applyParams(RP('justfed'));
    d.tick(0);
    d.setMarble(0.35);
    let fired = 0;
    for (let i = 1; i <= 60 * 20; i++) {
      d.tick(i / 60);
      if (d.mixedThisFrame) fired++;
    }
    expect(fired).toBe(0);
    expect(d.marble).toBeLessThan(0.35 * Math.exp(-20 / 6) * 1.2);
  });
  it('손으로 저으면 한 바퀴당 ×0.38 — 0.05 아래로 떨어뜨린 순간 한 번 신호 + 젖은 광 +0.25', () => {
    const d = new DoughMesh();
    d.applyParams(RP('hungry')); // 젖음이 낮아 광 +0.25가 1에 막히지 않는다(갓 밥준은 wet ≈ 1)
    d.tick(0);
    d.setMarble(0.35);
    const before = d.marble;
    let t = stirCircle(d, 0, 1, 2.0); // 느린 한 바퀴 — 혼자 옅어지는 몫은 빼지 않는다
    expect(d.marble / before).toBeGreaterThan(0.38 * 0.7);
    expect(d.marble / before).toBeLessThan(0.38 * 1.1);
    let fired = 0;
    let wetJump = 0;
    const r = 0.55 * R_BODY;
    for (let i = 1; i <= 60 * 3; i++) {
      t += 1 / 60;
      const a = i * 0.12;
      d.setStirInput(Math.cos(a) * r, Math.sin(a) * r, -Math.sin(a) * 4, Math.cos(a) * 4);
      const w0 = d.material.uniforms.uWet.value as number;
      d.tick(t);
      if (d.mixedThisFrame) {
        fired++;
        wetJump = (d.material.uniforms.uWet.value as number) - w0;
      }
    }
    expect(fired).toBe(1);
    expect(wetJump).toBeGreaterThan(0.2);
    expect(d.marble).toBe(0);
  });
  it('연출(손 아님) 젓기는 줄무늬를 손처럼 지우지 않고 신호도 없다 · 위상은 젓는 각도를 따라 돈다', () => {
    const d = new DoughMesh();
    d.applyParams(RP('justfed'));
    d.tick(0);
    d.setMarble(0.35);
    const p0 = d.marblePhase;
    let fired = 0;
    const r = 0.28;
    for (let i = 1; i <= 60; i++) {
      const a = i * 0.05;
      d.setStirInput(Math.cos(a) * r, Math.sin(a) * r, -Math.sin(a) * 2, Math.cos(a) * 2, false, false);
      d.tick(i / 60);
      if (d.mixedThisFrame) fired++;
    }
    expect(fired).toBe(0);
    expect(d.marble).toBeGreaterThan(0.35 * Math.exp(-1 / 6) * 0.95);
    expect(Math.abs(d.marblePhase - p0)).toBeGreaterThan(1);
  });
  it('isHandStirring — 손 입력만 센다', () => {
    const d = new DoughMesh();
    d.tick(0);
    d.setStirInput(0.1, 0, 1, 0, false, false);
    d.tick(1 / 60);
    expect(d.isHandStirring()).toBe(false);
    d.setStirInput(0.1, 0, 1, 0);
    d.tick(2 / 60);
    expect(d.isHandStirring()).toBe(true);
  });
});

describe('가루 덮개 · 줄무늬 셰이더(M3 · S4)', () => {
  const f = new DoughMesh().material.fragmentShader;
  it('sin×sin 체크무늬 가루가 없다 · 덮개는 윗면만', () => {
    expect(f).not.toMatch(/sin\(vXZ\.x \* 47\.0\)/);
    expect(f).toMatch(/cover = smoothstep[^;]*vTop/);
  });
  it('줄무늬 함수는 반죽 · hooch가 같은 소스', () => {
    expect(f).toContain(MARBLE_GLSL);
    const hooch = (createJar().hooch.material as THREE.ShaderMaterial).fragmentShader;
    expect(hooch).toContain(MARBLE_GLSL);
  });
});

describe('hooch 탁해짐 — 젓는 동안 오르고(τ0.6) 천천히 가라앉는다(τ5)', () => {
  it('저으면 murk 오름 · 쉬면 5s 뒤 절반 밑', () => {
    const d = new DoughMesh();
    d.applyParams(RP('sour'));
    const t = stirCircle(d, 0, 2);
    expect(d.murk).toBeGreaterThan(0.85);
    idle(d, t, 5);
    expect(d.murk).toBeLessThan(0.45);
    expect(d.murk).toBeGreaterThan(0.25);
  });
  it('jar.setMurk가 hooch uniform을 채운다', () => {
    const jar = createJar();
    jar.setMurk(0.5, 1.2, [0.9, 0.8, 0.7]);
    const u = (jar.hooch.material as THREE.ShaderMaterial).uniforms;
    expect(u.uMurk.value).toBe(0.5);
    expect(u.uMurkPhase.value).toBe(1.2);
  });
});

describe('르방 전환 · 추가 · 버리기 · 앱 열기 = 젓기 · 밥 주기 일시 상태를 지운다(R1)', () => {
  it('peak 3바퀴 저은 뒤 snapParams(hungry) → uSink = 새 르방 값, 줄무늬 0, 저어도 다 섞임 신호 없음', () => {
    const base = new DoughMesh();
    base.applyParams(RP('hungry'));
    idle(base, 0, 0.1);

    const d = new DoughMesh();
    const host = new SceneHost({} as HTMLCanvasElement, {} as HTMLElement);
    host.dough = d;
    host.snapParams(RP('peak'));
    let t = stirCircle(d, 0, 3);
    d.setMarble(0.35);
    expect(d.material.uniforms.uSink.value as number).toBeGreaterThan(0.3);
    expect(d.murk).toBeGreaterThan(0.5);

    host.snapParams(RP('hungry'));
    t = idle(d, t, 0.2); // 스와이프 슬라이드(130ms) 동안 손은 떨어져 있다
    expect(d.material.uniforms.uSink.value).toBeCloseTo(base.material.uniforms.uSink.value as number, 6);
    expect(d.marble).toBe(0);
    expect(d.murk).toBe(0);
    expect(maxAmp(d)).toBe(0);
    // 2.5바퀴 손 젓기 — 프레임마다 다 섞임 신호를 센다
    const r = 0.55 * R_BODY;
    const w = (Math.PI * 2) / 0.9;
    let mixed = 0;
    for (let i = 1; i <= 135; i++) {
      const a = (w * i) / 60;
      d.setStirInput(Math.cos(a) * r, Math.sin(a) * r, -Math.sin(a) * r * w, Math.cos(a) * r * w, true, true);
      d.tick((t += 1 / 60));
      if (d.mixedThisFrame) mixed++;
    }
    expect(mixed).toBe(0);
  });
});

describe('고랑 자취 길이 — 손끝 뒤 0.55~0.6바퀴(F3)', () => {
  it('반경 0.55R 원을 저으면 굳은 선분 6개가 0.55~0.62바퀴를 덮는다', () => {
    const d = new DoughMesh();
    d.applyParams(RP('justfed'));
    stirCircle(d, 0, 2);
    const pos = d.material.uniforms.uTrailPos.value as THREE.Vector2[];
    let ang = 0; // 손끝(스프링으로 반경 안쪽을 돈다)이 지난 각도 — 머리 선분(자라는 중)은 뺀다
    for (let j = 1; j < TRAIL_N - 1; j++) {
      const a = Math.atan2(pos[j].y, pos[j].x) - Math.atan2(pos[j - 1].y, pos[j - 1].x);
      ang += Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    }
    const turns = ang / (2 * Math.PI);
    expect(turns).toBeGreaterThan(0.55);
    expect(turns).toBeLessThan(0.62);
  });
});

describe('밥 주기 덮개 — 1.2s부터 고르게 걷히며 소용돌이로 늘어난다(F2) · 덮개 위 회색 점 없음(F4)', () => {
  const f = new DoughMesh().material.fragmentShader;
  it('덮개 fbm 표본 좌표를 소용돌이 각(uFlourSwirl · 가운데 많이)으로 돌린다', () => {
    expect(f).toMatch(/uniform float uFlourSwirl;/);
    expect(f).toMatch(/float sw = uFlourSwirl \* [^;]*length\(vXZ\) \/ uRBody/);
    expect(f).toMatch(/fbm\(sq \* 3\.3 \+ 7\.0\)/);
  });
  it('문턱: uFlourDust 1이면 전부 덮이고, 1 밑으로 내려가는 즉시 걷히기 시작한다(넓은 문턱 ±0.2)', () => {
    // 셰이더와 같은 식 — e = 펴 놓은 fbm 0~1, cover = smoothstep(e − 0.2, e + 0.2, dust·1.4 − 0.2)
    const ss = (a: number, b: number, v: number) => {
      const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
      return x * x * (3 - 2 * x);
    };
    const cover = (e: number, dust: number) => ss(e - 0.2, e + 0.2, dust * 1.4 - 0.2);
    expect(f).toMatch(/cover = smoothstep\(e - 0\.2, e \+ 0\.2, uFlourDust \* 1\.4 - 0\.2\) \* vTop/);
    expect(cover(1, 1)).toBe(1);
    expect(cover(0, 0)).toBe(0);
    expect(cover(1, 0.9)).toBeLessThan(0.9); // 1.32s — 가장 높은 덩어리가 벌써 옅어진다(옛 식은 0.77 밑부터)
  });
  it('밥 주기 연출이 uFlourSwirl을 시작 뒤 젓는 위상만큼 넘긴다', () => {
    const host = new SceneHost({} as HTMLCanvasElement, {} as HTMLElement);
    const d = new DoughMesh();
    host.dough = d;
    host.snapParams(RP('hungry'));
    d.setMarble(0, 5); // 지난 위상이 남아 있어도 연출 시작 기준 0
    host.playFeed();
    const t0 = performance.now() / 1000;
    const drive = (host as unknown as { driveSequences(t: number): void }).driveSequences.bind(host);
    drive(t0 + 0.1);
    expect(d.material.uniforms.uFlourSwirl.value).toBeCloseTo(0, 6);
    d.setMarble(0, 7);
    drive(t0 + 1.5);
    expect(d.material.uniforms.uFlourSwirl.value).toBeCloseTo(2, 6);
  });
  it('터진 기포 자국 · 바늘구멍 그늘은 덮개 아래에서 지운다(× (1 − cover))', () => {
    expect(f).toMatch(/calm \* \(1\.0 - cover\)/);
    expect(f).toMatch(/col \*= 1\.0 - 0\.08 \* min\(scar, 1\.0\)[^;]*\(1\.0 - cover\)/);
  });
});
