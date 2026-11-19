// 섞는 맛 · 질감 업그레이드(2026-11-19, implementation-notes 「섞는 맛」 M2 · M3) — 렌더 상태기.
// 고랑 자취 · 테두리 고정 · 피크 꺼짐 · 줄무늬 · 다 섞임 · hooch 탁해짐. node라 GLSL은 소스로만 잠근다.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { toRenderParams } from '../src/render/renderParams';
import { DoughMesh, GRAB_FIELD, R_BODY, TRAIL_GROOVE, TRAIL_N } from '../src/render/dough/DoughMesh';
import { D_W } from '../src/render/dough/StrandMesh';
import { createJar, HOOCH_COVER, MARBLE_GLSL, SURF_TILT } from '../src/render/jar';
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

describe('고랑 자취 — 15점 · 선분 14개, 묽으면 빨리 · 되직하면 늦게 메워진다(M2)', () => {
  it('자취는 15점(시각 고침 3차 — 간격 0.095, 원 젓기 선분당 0.25rad)이고 저으면 고랑이 생긴다', () => {
    // 8점 · 0.19 간격은 반경 0.55R 원에서 선분 하나가 0.49rad라 U자 벽이 13각형 토막으로 꺾였다(hi2_stir)
    expect(TRAIL_N).toBe(15);
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
  it('버텍스: 시어 · 당기기 끌려 모임 · 슬로싱 강체 xz에 테두리 고정 계수(r/R 0.8→1.0)를 곱한다', () => {
    const v = new DoughMesh().material.vertexShader;
    expect(v).toMatch(/float pin = 1\.0 - smoothstep\(0\.8, 1\.0, length\(xz0\) \/ uRBody\)/);
    expect(v).toMatch(/uStirVec \* sfall \* pin/);
    expect(v).toMatch(/rigid \* pin/);
    // 2026-11-19 가닥 다발: 옛 grab 리본 xz 변위(grabXZ + (p.xz − grabXZ)·pin) 자리 = 끌려 모임(L2b), 역시 pin을 곱한다
    expect(v).toMatch(/p\.xz -= gd \* \(0\.18 \* uGrab\.y \* exp\([^;]*\* pin\)/);
  });
  it('손끝 밑 섬(|stirVec|·0.35·sfall) 솟음이 없다', () => {
    expect(new DoughMesh().material.vertexShader).not.toMatch(/length\(uStirVec\) \* 0\.35/);
  });
});

describe('고랑 셰이더 — vert · frag 같은 함수 · 같은 상수(규칙 8)', () => {
  it('두 셰이더가 같은 trailGroove 소스를 쓰고, frag는 윗면에서만 부른다', () => {
    const d = new DoughMesh();
    // 2026-11-19 젓기 실물화: out tl(옆 거리 · 진행 방향 · 머리 뒤 몫)이 붙었다 — vert는 버리고 frag 잔줄만 쓴다
    const fn = /vec4 trailGroove\(vec2 p, out vec4 tl\) \{[\s\S]*?\n\}/.exec(d.material.vertexShader)?.[0];
    expect(fn).toBeDefined();
    expect(d.material.fragmentShader).toContain(fn!);
    const at = /vec4 grooveAt\([^)]*\) \{[\s\S]*?\n\}/.exec(d.material.vertexShader)?.[0];
    expect(d.material.fragmentShader).toContain(at!);
    const pf = /vec2 grooveProf\([^)]*\) \{[\s\S]*?\n\}/.exec(d.material.vertexShader)?.[0];
    expect(d.material.fragmentShader).toContain(pf!);
    // 시각 고침 2차 B-4: 단면 = U자 + 입술(바닥 0.55 · 벽 끝 1.0 · 마루 0.5A). 1차 가우시안 −A(1 − 3q)e^(−q)는 없다
    expect(d.material.vertexShader).toContain('const float TRAIL_FLOOR = 0.55;');
    expect(d.material.vertexShader).toContain('const float TRAIL_CREST = 1.0;');
    expect(d.material.vertexShader).toContain('const float TRAIL_LIP_H = 0.5;');
    expect(d.material.vertexShader).not.toMatch(/TRAIL_RIDGE_C/);
    // 시각 고침 3차 S-1: 선분 전부의 누적 로그합지수 smin — 선분은 더하고(+1) 켜진 이웃 사이 꼭짓점은 한 번 뺀다(−1, 두 번 패면 구슬 줄).
    // ∇q · 깊이 · 잔줄 tl은 같은 가중으로 섞고, 단면(grooveAt)은 루프 밖 한 번. 2차의 「가장 가까운 둘」 장치(hs · sep · b2)는 없다
    expect(fn).toContain('seamAdd(S, G, U, T, dot(d, d) * K, 1.0, vec3(2.0 * K * d, mix(uTrailAmp[i], uTrailAmp[i + 1], h)), u,');
    expect(fn).toContain('seamAdd(S, G, U, T, dot(dv, dv) * Kv, -1.0, vec3(2.0 * Kv * dv, uTrailAmp[i]), sign(sv) * vec2(-m.y, m.x),');
    // 기울기 방향 = 꼭짓점 접선(이웃 방향 평균)을 선분 따라 보간 — 꺾인선 기울기는 선분마다 한 방향이라 면 다각형으로 칠해졌다(fix3_1 fastcircle).
    // 크기는 거리장 그대로, 획 끝 마개는 참 방향
    expect(fn).toContain('vec2 t = mix(tA, tB, h);');
    // 선분은 양 끝 꺾임 평균만큼 활꼴(포물선)로 휜다 — 꼭짓점(h 0 · 1)에선 0이라 포함-배제 꼭짓점 몫과 그대로 맞는다
    expect(fn).toContain('d += nl * (bend * h * (1.0 - h));');
    // 먼 선분은 방향 · 휨 · 합을 건너뛴다(비용) — 끝 꼭짓점도 더 멀어 포함-배제가 짝째 빠진다
    expect(fn).toContain('if (dot(d, d) * min(abs(uTrailK[i]), kb) * 0.9 >= TRAIL_Q_CUT) { on = true; dnP = dn; continue; }');
    expect(fn).toContain('if (lu > 1e-6 * S) gq = length(gq) * U / lu;');
    expect(fn).toContain('bool cap = (hr < 0.0 && !on) || (hr > 1.0 && !nx);');
    expect(fn).toContain('o = grooveAt(-TRAIL_SEAM_Q * log(S), G.z * iS, gq);');
    expect(fn).toContain('tl = T * iS;');
    expect(fn).not.toMatch(/\bhs\b|\bsep\b|b2\.x/);
    expect(fn).not.toMatch(/vec2 gw/);
    // 단면 · 기울기는 루프 밖 한 번 — 루프 안에 grooveAt이 없다
    const loop = /for \(int i = 0;[\s\S]*?\n {2}\}/.exec(fn!)![0];
    expect(loop).not.toMatch(/grooveAt|grooveProf/);
    expect(d.material.fragmentShader).toMatch(/if \(vTop > 0\.5\) \{\s*vec4 tg = trailGroove\(vXZ, tl\)/);
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

// 2026-11-19 젓기 실물화: 오름 τ0.6 → 1.8(S7 uMsn 4.5~7s에 고른 베이지). 2바퀴(1.8s)면 0.63이라 4바퀴(3.6s)로 본다
describe('hooch 탁해짐 — 젓는 동안 오르고(τ1.8) 천천히 가라앉는다(τ5)', () => {
  it('저으면 murk 오름(1바퀴 0.5 밑 · 4바퀴 0.85 넘게) · 쉬면 5s 뒤 절반 밑', () => {
    const d1 = new DoughMesh();
    d1.applyParams(RP('sour'));
    stirCircle(d1, 0, 1);
    expect(d1.murk).toBeLessThan(0.5);
    const d = new DoughMesh();
    d.applyParams(RP('sour'));
    const t = stirCircle(d, 0, 4);
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
  it('반경 0.55R 원을 저으면 굳은 선분 13개(간격 0.095, 시각 고침 3차)가 0.55~0.62바퀴를 덮는다', () => {
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

// ── 2026-11-19 젓기 실물화(.work/feel2/spec.md §2 · §6-9~11 · 17~19 · 21) — 손가락 폭 고랑 · 앞 둔덕 · 잔줄 · 저은 띠 기억 · 윗물 섬 ──
const K0 = 0.5 / ((0.09 * D_W) / 1.3) ** 2;
/** 곧은 획 — +x로 초당 1.2(오브젝트), n프레임. 끝난 시각 */
function strokeX(d: DoughMesh, t0: number, n: number): number {
  let t = t0;
  for (let i = 0; i <= n; i++) {
    t = t0 + i / 60;
    d.setStirInput(-0.3 + 0.02 * i, 0, 1.2, 0);
    d.tick(t);
  }
  return t;
}

describe('고랑 폭 = 손가락(S1a) · 넓어짐 하한 K0/1.5(§6-10)', () => {
  it('갓 판 첨도 ≈ 31(반폭 0.09D), 오래 두면 K0/1.5에서 멈춘다 · 깊이 0.035', () => {
    expect(K0).toBeGreaterThan(30);
    expect(K0).toBeLessThan(32);
    const d = new DoughMesh();
    d.applyParams(RP('justfed'));
    const t = stirCircle(d, 0, 1);
    const k = d.material.uniforms.uTrailK.value as Float32Array;
    expect(Math.max(...Array.from(k, Math.abs))).toBeCloseTo(K0, 0);
    idle(d, t, 6);
    expect(Math.min(...Array.from(k, Math.abs))).toBeCloseTo(K0 / 1.5, 3);
    expect(d.material.vertexShader).toContain('const float TRAIL_A = 0.035;');
  });
});

describe('앞 둔덕 uBow(S3) — 머리 앞에 밀려 오른 더미', () => {
  const bowOf = (d: DoughMesh) => d.material.uniforms.uBow.value as THREE.Vector4;
  it('젓는 동안 머리 앞(진행 방향)에 서고, 되직할수록 높고, 손을 떼면 고랑과 같은 τ로 준다', () => {
    const jf = new DoughMesh();
    jf.applyParams(RP('justfed'));
    const sr = new DoughMesh();
    sr.applyParams(RP('sour'));
    let t = strokeX(jf, 0, 30);
    strokeX(sr, 0, 30);
    const head = (jf.material.uniforms.uTrailPos.value as THREE.Vector2[])[TRAIL_N - 1];
    const b = bowOf(jf);
    expect(b.x).toBeGreaterThan(head.x + 0.1);
    expect(Math.abs(b.y - head.y)).toBeLessThan(1e-3);
    expect(b.z).toBeGreaterThan(bowOf(sr).z * 1.8); // (0.4 + 0.6·0.78) / 0.4
    const h0 = b.z;
    t = idle(jf, t, 1);
    expect(bowOf(jf).z).toBeLessThan(h0 * 0.6);
    expect(bowOf(jf).z).toBeGreaterThan(h0 * 0.3);
  });
  it('잡기로 확정되면 τ0.1s로 지운다(§6-12)', () => {
    const d = new DoughMesh();
    d.applyParams(RP('justfed'));
    const t = strokeX(d, 0, 20);
    expect(bowOf(d).z).toBeGreaterThan(0.005);
    d.grabStart(0.1, 0);
    idle(d, t, 0.75);
    expect(bowOf(d).z).toBeLessThan(1e-4);
  });
});

describe('저은 띠 기억 uStirMem(S2 · S4 · S8, §6-11)', () => {
  const mem = (d: DoughMesh) => d.material.uniforms.uStirMem.value as THREE.Vector4;
  it('W = 가운데 둘레를 돈 각도 — 1/4바퀴 ≈ 0.25 · 한 바퀴 넘게 저으면 1에 막힌다', () => {
    const q = new DoughMesh();
    q.applyParams(RP('justfed'));
    stirCircle(q, 0, 0.25);
    expect(mem(q).x).toBeGreaterThan(0.2);
    expect(mem(q).x).toBeLessThan(0.27);
    const f = new DoughMesh();
    f.applyParams(RP('justfed'));
    stirCircle(f, 0, 1.5);
    expect(mem(f).x).toBeGreaterThan(0.9);
    expect(mem(f).x).toBeLessThanOrEqual(1);
  });
  it('τ_W = 2 + 4·되기 — 갓 밥준(되직)이 시큼(묽음)보다 오래 남는다', () => {
    const ratio = (k: keyof typeof STATE_HOURS): number => {
      const d = new DoughMesh();
      d.applyParams(RP(k));
      const t = stirCircle(d, 0, 0.5);
      const w0 = mem(d).x;
      idle(d, t, 3);
      return mem(d).x / w0;
    };
    expect(ratio('justfed')).toBeGreaterThan(0.5); // τ ≈ 5.1s → e^(−3/5.1) ≈ 0.56
    expect(ratio('sour')).toBeLessThan(0.25); // τ 2s → 0.22
  });
  it('띠 반경 = 젓는 반경 · 폭은 되직 좁게 · 묽음 넓게(0.55R)', () => {
    const jf = new DoughMesh();
    jf.applyParams(RP('justfed'));
    stirCircle(jf, 0, 1);
    const sr = new DoughMesh();
    sr.applyParams(RP('sour'));
    stirCircle(sr, 0, 1);
    expect(mem(jf).y).toBeGreaterThan(0.45 * R_BODY);
    expect(mem(jf).y).toBeLessThan(0.6 * R_BODY);
    expect(mem(jf).z).toBeLessThan(0.3 * R_BODY);
    expect(mem(sr).z).toBeCloseTo(0.55 * R_BODY, 6);
  });
  it('잡기로 확정된 획이 쌓은 몫은 W에 넣지 않는다(§6-12) · 르방 전환이면 0', () => {
    const d = new DoughMesh();
    d.applyParams(RP('justfed'));
    let t = stirCircle(d, 0, 0.5);
    const w0 = mem(d).x;
    t = idle(d, t, 0.3); // 획 끝
    const w1 = mem(d).x;
    t = stirCircle(d, t, 0.2); // 새 획(미확정) → 잡기 확정
    d.grabStart(0.3, 0);
    d.tick(t + 1 / 60);
    expect(mem(d).x).toBeLessThan(w1);
    expect(mem(d).x).toBeGreaterThan(w1 * 0.9);
    expect(w0).toBeGreaterThan(0.4);
    d.resetTransient();
    d.tick(t + 2 / 60);
    expect(mem(d).x).toBe(0);
  });
});

describe('잔줄 · 저은 띠 셰이더 — 프래그만, uniform 게이트(§6-17~19 · 21)', () => {
  const d = new DoughMesh();
  const f = d.material.fragmentShader;
  const v = d.material.vertexShader;
  it('잔줄(S1b)은 머리 뒤 2~3선분(tl.w)의 노멀에만 — vert는 쓰지 않는다', () => {
    // 머리 뒤 몫 = 머리에서 0.38(오브젝트)까지 1 · 0.665에서 0 — 옛 0.19 간격 「2~3.5선분」을 0.095 간격 선분 번호로(시각 고침 3차)
    const m = /clamp\(\(float\(i\) \+ h - ([\d.]+)\) \/ ([\d.]+), 0\.0, 1\.0\)/.exec(TRAIL_GROOVE)!;
    const step = 0.095;
    expect((TRAIL_N - 1 - Number(m[1])) * step).toBeCloseTo(0.665, 2);
    expect((TRAIL_N - 1 - Number(m[1]) - Number(m[2])) * step).toBeCloseTo(0.38, 2);
    expect(f).toMatch(/if \(rw > 0\.01\) \{\s*float ph = 6\.2832 \* tl\.x \/ RIDGE_GAP/);
    expect(v).not.toMatch(/RIDGE_SLOPE \*/);
  });
  it('저은 띠: 바늘구멍 지움 0.85 · 젖은 광 0.5(시각 고침 2차 B-4) · 감긴 결 광 ≤ 0.15(줄무늬 · 윗물 덮인 곳은 끔)', () => {
    expect(f).toMatch(/if \(uStirMem\.x > 0\.004 && vTop > 0\.5\)/);
    // 2026-11-19 시각 고침 1차: 더미(pileM)도 기공을 덮는다 — 같은 지움 식에 셋째로 들어간다
    expect(f).toContain('float calm = 1.0 - 0.85 * max(max(trailWet, stirM), pileM);');
    expect(f).toContain('uWet + 0.4 * trailWet + 0.5 * stirM + 0.15 * swirl');
    expect(f).toMatch(/if \(stirM > 0\.004 && uMarble < 0\.004\)/);
    expect(f).toMatch(/swirl = marbleBand\([^;]*\* \(1\.0 - hc\)/);
  });
});

describe('윗물 섬 고침(S7 · §6-9) — 반죽 기울기는 덮이면 끄고, 윗물 윗면이 같은 기울기로 기운다', () => {
  it('수면 기울기 계수는 반죽 vert · frag · 윗물 vert가 같은 SURF_TILT · 덮임은 HOOCH_COVER spread와 같은 식', () => {
    const d = new DoughMesh();
    const hv = (createJar().hooch.material as THREE.ShaderMaterial).vertexShader;
    const fn = /float surfTiltK\(\) \{[^}]*\}/.exec(SURF_TILT)![0];
    for (const s of [d.material.vertexShader, d.material.fragmentShader, hv]) expect(s).toContain(fn);
    expect(d.material.fragmentShader).toContain('dBs += uWobble * (surfTiltK() * (1.0 - hoochSpread(uHooch)) * vTop)');
    expect(SURF_TILT).toContain('smoothstep(0.30, 0.80, amt)');
    expect(HOOCH_COVER).toContain('smoothstep(0.30, 0.80, amt)');
    expect(hv).toContain('clamp(tilt, -0.6 * uThick, 0.6 * uThick)');
  });
  it('솟는 항(고랑 양옆 둔덕 · 앞 둔덕 · 밑동 둔덕 · 더미) × (1 − 0.85·덮임)', () => {
    expect(TRAIL_GROOVE).toContain('return 1.0 - 0.85 * hoochSpread(uHooch);');
    // 고랑은 솟는 마루만 누른다(벽 · 바닥은 그대로) — grooveProf의 rise는 마루 몫에만 곱한다
    expect(TRAIL_GROOVE).toContain('vec2 pr = grooveProf(x, A, riseK());');
    expect(TRAIL_GROOVE).toContain('float lip = TRAIL_LIP_H * A * rise;');
    expect(TRAIL_GROOVE).toContain('uBow.z * riseK()');
    expect(GRAB_FIELD).toContain('return o * riseK();');
  });
  it('surfaceY(CPU)도 덮이면 기울기가 없다', () => {
    const tiltAt = (hooch: number): number => {
      const d = new DoughMesh();
      d.applyParams({ ...RP('sour'), hoochAmt: hooch });
      const w = d.material.uniforms.uWobble.value as THREE.Vector2;
      w.set(0, 0);
      const a = d.surfaceY(0.3, 0);
      w.set(0.5, 0);
      return d.surfaceY(0.3, 0) - a;
    };
    expect(tiltAt(0)).toBeGreaterThan(0.005);
    expect(Math.abs(tiltAt(1))).toBeLessThan(1e-9);
  });
  it('윗물은 반죽 uniform 객체를 공유하고(Jar.shareSurface) 두께를 받는다', () => {
    const jar = createJar();
    const d = new DoughMesh();
    jar.shareSurface(d.material.uniforms);
    const u = (jar.hooch.material as THREE.ShaderMaterial).uniforms;
    for (const k of ['uWobble', 'uLevel', 'uFluid', 'uSlopeAspect']) expect(u[k]).toBe(d.material.uniforms[k]);
    jar.setHooch(1, 0.8, 0.76, 0);
    expect(u.uThick.value as number).toBeGreaterThan(0.05);
  });
});

describe('고랑 U자 단면(시각 고침 2차 B-4) — frag 기울기 = 문자열 미분 · vert 높이 = 같은 문자열 × 배율(3차 S-2)', () => {
  it('vert는 trailGroove 높이에 GROOVE_VERT_GAIN(0 < 배율 < 1)만 곱하고, frag 기울기에는 배율이 없다 — 앞 입술이 벽을 삼각형 단위로 가린 톱니(hi2)', () => {
    const d = new DoughMesh();
    const gain = Number(/const float GROOVE_VERT_GAIN = ([\d.]+);/.exec(TRAIL_GROOVE)![1]);
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThan(1);
    expect(d.material.vertexShader).toContain('disp += trailGroove(p.xz, tl).x * GROOVE_VERT_GAIN;');
    expect(d.material.fragmentShader).toMatch(/vec4 tg = trailGroove\(vXZ, tl\);\s*dBs \+= tg\.yz;/);
    // 배율은 vert 줄 하나에만 — 단면 함수 · 기울기 식에 끼어들지 않는다
    expect(TRAIL_GROOVE.split('GROOVE_VERT_GAIN').length - 1).toBe(1);
    expect(d.material.fragmentShader.split('GROOVE_VERT_GAIN').length - 1).toBe(1); // 선언만
  });
  /** TRAIL_GROOVE의 grooveProf 문자열을 그대로 JS로 옮긴다(스칼라 식만 — float → let, vec2 → 배열). 상수도 같은 문자열에서 */
  const prof = (() => {
    const consts = [...TRAIL_GROOVE.matchAll(/const float (\w+) = ([-\d.e]+);/g)].map(([, k, v]) => `const ${k} = ${v};`).join('\n');
    const src = /vec2 grooveProf\(float x, float A, float rise\) \{([\s\S]*?)\n\}/.exec(TRAIL_GROOVE)![1]
      .replace(/\bfloat /g, 'let ')
      .replace(/return vec2\(([\s\S]*?),\s*\n\s*([\s\S]*?)\);/, 'return [$1, $2];');
    return new Function('x', 'A', 'rise', `const clamp = (v, a, b) => Math.min(b, Math.max(a, v));\n${consts}\n${src}`) as
      (x: number, A: number, rise: number) => [number, number];
  })();
  const A = 0.035;
  it('높이 · 기울기는 같은 식 — 기울기 = 높이의 수치 미분(바닥 · 벽 · 마루 · 바깥 비탈 전부)', () => {
    const h = 1e-5;
    for (let x = 0; x <= 2.2; x += 0.01) {
      for (const rise of [1, 0.15]) {
        const num = (prof(x + h, A, rise)[0] - prof(x - h, A, rise)[0]) / (2 * h);
        expect(prof(x, A, rise)[1]).toBeCloseTo(num, 4);
      }
    }
  });
  it('바닥 평평(x < 0.55에서 −A · 기울기 0) · 벽 끝(x 1.0)이 마루 꼭대기 +0.5A · 1.8 밖은 0', () => {
    for (const x of [0, 0.3, 0.54]) expect(prof(x, A, 1)).toEqual([-A, 0]);
    expect(prof(1, A, 1)[0]).toBeCloseTo(0.5 * A, 9);
    expect(prof(1, A, 1)[1]).toBeCloseTo(0, 9);
    expect(prof(1.8, A, 1)[0]).toBeCloseTo(0, 9);
    expect(prof(2.5, A, 1)).toEqual([0, 0]);
    // 벽이 가장 가파르다 — 바깥 비탈은 완만(대칭 좁은 마루면 밝은 선 + 짙은 선이 겹친 유리 테였다, fix2_1)
    const wall = Math.max(...[0.6, 0.7, 0.775, 0.85, 0.95].map((x) => Math.abs(prof(x, A, 1)[1])));
    const out = Math.max(...[1.1, 1.3, 1.4, 1.5, 1.7].map((x) => Math.abs(prof(x, A, 1)[1])));
    expect(out).toBeLessThan(0.3 * wall);
    // 윗물 덮이면(rise) 마루만 눌린다 — 바닥은 그대로
    expect(prof(1, A, 0.15)[0]).toBeCloseTo(0.5 * A * 0.15, 9);
    expect(prof(0.3, A, 0.15)[0]).toBe(-A);
  });
});

describe('고랑 거리장 — 선분 전부의 누적 로그합지수 smin(시각 고침 3차 S-1)', () => {
  // TRAIL_GROOVE의 합 규칙을 그대로 옮긴 참조 — 선분 +e^(−q/k) · 켜진 이웃 사이 꼭짓점 −e^(−q/k), q = −k·ln Σ(셰이더 문자열이 같은 식인지는 위
  // 「두 셰이더가 같은 trailGroove」가 seamAdd 줄로 잠근다). K는 한 값(나이 같음)
  const k = Number(/const float TRAIL_SEAM_Q = ([\d.]+);/.exec(TRAIL_GROOVE)![1]);
  const K = 31;
  type P = [number, number];
  const segQ = (p: P, a: P, b: P): number => {
    const ab = [b[0] - a[0], b[1] - a[1]];
    const l2 = Math.max(ab[0] ** 2 + ab[1] ** 2, 1e-8);
    const h = Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2));
    return ((p[0] - a[0] - ab[0] * h) ** 2 + (p[1] - a[1] - ab[1] * h) ** 2) * K;
  };
  const ptQ = (p: P, v: P): number => ((p[0] - v[0]) ** 2 + (p[1] - v[1]) ** 2) * K;
  /** 칸 목록(선분 +1 · 꼭짓점 −1)을 주어진 차례로 더한다 */
  const field = (p: P, pts: P[], order: number[]): number => {
    const terms: Array<[number, number]> = [];
    for (let i = 0; i < pts.length - 1; i++) terms.push([segQ(p, pts[i], pts[i + 1]), 1]);
    for (let i = 1; i < pts.length - 1; i++) terms.push([ptQ(p, pts[i]), -1]);
    let S = 0;
    for (const j of order) S += terms[j][1] * Math.exp(-terms[j][0] / k);
    return -k * Math.log(S);
  };
  const arc: P[] = Array.from({ length: 9 }, (_, i) => {
    const a = i * 0.25; // 시각 고침 3차 선분당 0.25rad
    return [0.385 * Math.cos(a), 0.385 * Math.sin(a)];
  });
  const nTerms = 2 * arc.length - 3;
  const fwd = Array.from({ length: nTerms }, (_, i) => i);
  const shuffled = [...fwd].reverse().sort((a, b) => ((a * 7) % 5) - ((b * 7) % 5));
  const probe: P[] = [];
  for (let x = -0.2; x <= 0.5; x += 0.035) for (let z = -0.1; z <= 0.6; z += 0.035) probe.push([x, z]);

  it('선분 순서를 바꿔도 거리장이 같다 — 차례로 섞는 다항 smin(2차)과 달리 합이라 결합 순서가 없다', () => {
    for (const p of probe) {
      const a = field(p, arc, fwd);
      expect(field(p, arc, [...fwd].reverse())).toBeCloseTo(a, 9);
      expect(field(p, arc, shuffled)).toBeCloseTo(a, 9);
    }
  });
  it('곧은 자취는 꼭짓점에서 구슬이 없다 — 한 줄로 늘어선 선분들 = 긴 선분 하나(포함-배제가 나눈 꼭짓점을 정확히 지운다)', () => {
    const line: P[] = Array.from({ length: 7 }, (_, i) => [i * 0.095, 0]);
    for (const p of probe) {
      const one = segQ(p, line[0], line[6]);
      if (one > 12) continue;
      expect(field(p, line, Array.from({ length: 11 }, (_, i) => i))).toBeCloseTo(one, 9);
    }
  });
  it('바깥 꼭짓점(두 선분이 같은 꼭짓점을 봄)은 꼭짓점 거리 그대로 — 꽃잎 테두리 없음 · 안쪽은 가장 가까운 선분보다 깊지 않게 얕게 섞인다', () => {
    // 원호 바깥(반경 0.385 + 0.1)에서 꼭짓점 방향 = 정확히 꼭짓점 q
    const v = arc[4];
    const out: P = [v[0] * 1.26, v[1] * 1.26];
    expect(field(out, arc, fwd)).toBeCloseTo(ptQ(out, v), 6);
    // 안쪽 이음매(꼭짓점 방향 안쪽): 두 선분이 따로 가까워 부드럽게 섞인다 — 최솟값보다 k·ln2 넘게 깊어지지 않는다
    const inn: P = [v[0] * 0.8, v[1] * 0.8];
    const qmin = Math.min(segQ(inn, arc[3], arc[4]), segQ(inn, arc[4], arc[5]));
    const q = field(inn, arc, fwd);
    expect(q).toBeLessThanOrEqual(qmin + 1e-9);
    expect(q).toBeGreaterThan(qmin - k * Math.log(2) - 1e-9);
  });
});
