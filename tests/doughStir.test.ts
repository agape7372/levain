// 섞는 맛 · 질감 업그레이드(2026-11-19, implementation-notes 「섞는 맛」 M2 · M3) — 렌더 상태기.
// 젓기 v3(손맛 3차) · 테두리 고정 · 피크 꺼짐 · 줄무늬 · 다 섞임 · hooch 탁해짐. node라 GLSL은 소스로만 잠근다.
// 2026-11-19 손맛 3차: 15점 고랑 자취(TRAIL_N · 거리장 · U자 단면 · 잔줄 · uStirMem) 시험은 그 코드를 뺐으니 지웠다 —
// 같은 뜻(파임이 되기별로 메워짐 · 앞 둔덕 · 잡기 확정 취소 · 저은 자리 기억 · vert/frag 같은 소스)은 아래 「젓기 v3」가 새 상태로 잠근다
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { toRenderParams } from '../src/render/renderParams';
import { DoughMesh, GRAB_FIELD, MEM_NA, MEM_NR, R_BODY, STIR_FIELD, STIR_FOLD, SWIRL_N } from '../src/render/dough/DoughMesh';
import { BubbleSystem } from '../src/render/bubbles';
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
const tipOf = (d: DoughMesh) => d.material.uniforms.uTip.value as THREE.Vector4;
const tipBOf = (d: DoughMesh) => d.material.uniforms.uTipB.value as THREE.Vector4;
const swirlOf = (d: DoughMesh) => d.material.uniforms.uSwirl.value as THREE.Vector2[];
/** 저은 자리 기억 칸(재료 좌표 극좌표, 반경 i × 각 j) — uMem vec4 묶음을 편다 */
const memOf = (d: DoughMesh): number[] =>
  (d.material.uniforms.uMem.value as THREE.Vector4[]).flatMap((v) => [v.x, v.y, v.z, v.w]);

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
    expect(tipOf(d).z).toBe(0);
    expect(swirlOf(d).every((v) => v.x === 0 && v.y === 0)).toBe(true);
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

// ── 2026-11-19 젓기 실물화(.work/feel2/spec.md §6-9) — 윗물 섬 ──

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
  it('솟는 항(앞 둔덕 · 접힌 주름 마루 · 밑동 둔덕 · 더미) × (1 − 0.85·덮임)', () => {
    expect(STIR_FIELD).toContain('return 1.0 - 0.85 * hoochSpread(uHooch);');
    // 젓기 v3: 패임은 그대로, 솟는 앞 둔덕 · 나선 마루만 누른다
    expect(STIR_FIELD).toContain('float eb = uTip.w * riseK() *');
    expect(STIR_FIELD).toContain('(prof > 0.0 ? riseK() : 1.0)');
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

describe('젓기 v3 — 손끝 패임 · 앞 둔덕(닫힌 식, 루프 0)', () => {
  const stirred = (k: keyof typeof STATE_HOURS, ripe?: number) => {
    const d = new DoughMesh();
    d.applyParams(ripe === undefined ? RP(k) : { ...RP(k), ripe });
    const t = stirCircle(d, 0, 1);
    return { d, t };
  };
  const fillTime = (k: keyof typeof STATE_HOURS, ripe?: number): number => {
    const { d, t: t0 } = stirred(k, ripe);
    const a0 = tipOf(d).z;
    let t = t0;
    while (tipOf(d).z > a0 * 0.37 && t - t0 < 10) d.tick((t += 1 / 60));
    return t - t0;
  };
  it('저으면 손끝에 패임 · 앞 둔덕이 서고, 묽은 시큼은 거의 없다(광 흐름 · 출렁만)', () => {
    const jf = stirred('justfed').d;
    expect(tipOf(jf).z).toBeGreaterThan(0.02);
    expect(tipOf(jf).w).toBeGreaterThan(tipOf(jf).z); // 앞 둔덕 = 패임 × 1.25 × (0.4 + 0.6·되기)
    expect(tipOf(stirred('sour').d).z).toBeLessThan(tipOf(jf).z * 0.3);
  });
  it('메워짐 τ — 시큼 0.6s 안 · 갓 밥준 1s 넘게 · 피크는 같은 되기보다 늦게', () => {
    expect(fillTime('sour')).toBeLessThan(0.6);
    expect(fillTime('justfed')).toBeGreaterThan(1.0);
    expect(fillTime('peak')).toBeGreaterThan(fillTime('peak', 0));
  });
  it('머리 = 손끝 · 꼬리 = τ초 전 손끝 — 되직할수록 꼬리가 멀다(늦게 따라온다)', () => {
    const gap = (k: keyof typeof STATE_HOURS): number => {
      const d = stirred(k).d;
      const tip = tipOf(d);
      const b = tipBOf(d);
      return Math.hypot(tip.x - b.z, tip.y - b.w);
    };
    // 반경 0.385 · 한 바퀴 0.9s = 2.7/s — 되직 τ ≈ 0.22s → 0.5 넘게 · 묽음 0.1s → 0.3 밑
    expect(gap('justfed')).toBeGreaterThan(0.45);
    expect(gap('sour')).toBeLessThan(0.32);
  });
  it('잡기로 확정되면 패임 · 앞 둔덕을 τ0.1s로 지우고 그 획의 저은 넓이를 뺀다(§6-12)', () => {
    const d = new DoughMesh();
    d.applyParams(RP('justfed'));
    for (let i = 0; i <= 20; i++) {
      d.setStirInput(0.3 + 0.01 * i, 0, 0.6, 0);
      d.tick(i / 60);
    }
    d.grabStart(0.5, 0);
    idle(d, 20 / 60, 0.75);
    expect(tipOf(d).z).toBeLessThan(1e-4);
    expect(tipOf(d).w).toBeLessThan(1e-4);
    expect(Math.max(...memOf(d))).toBeLessThan(1e-3);
  });
  it('셰이더: vert · frag가 같은 STIR_FIELD 문자열 · 반경 칸 uSwirl 길이 SWIRL_N · 루프 없음', () => {
    const d = new DoughMesh();
    for (const s of [d.material.vertexShader, d.material.fragmentShader]) {
      expect(s).toContain(STIR_FIELD);
      expect(s).toContain(`uniform vec2 uSwirl[${SWIRL_N}];`);
      expect(s).toContain(`uniform vec4 uMem[${(MEM_NR * MEM_NA) / 4}];`); // 텍스처 fetch 없이 uniform 배열
      expect(s).not.toMatch(/uTrail|trailGroove/);
    }
    expect(STIR_FIELD).not.toMatch(/\bfor\s*\(/);
    // frag는 fbmG를 따로 두지 않는다(STIR_FIELD 하나)
    expect(d.material.fragmentShader.split('vec2 fbmG(vec2 p0)').length - 1).toBe(1);
    expect(d.material.vertexShader).toContain('disp += stirField(p.xz, sw, q, memAt(length(p.xz), q)).x;');
    expect(d.material.fragmentShader).toMatch(/vec4 sf = stirField\(vXZ, sw, q, mem\);\s*dBs \+= sf\.yz;/);
    for (const s of [d.material.vertexShader, d.material.fragmentShader]) expect(s).not.toMatch(/texture\(uMem/);
  });
  it('높이 · 기울기는 같은 식 — 기울기 = 높이의 수치 미분(패임 캡슐 · 앞 둔덕)', () => {
    // STIR_FIELD 패임 · 둔덕 부분을 JS로 옮긴 참조(문자열과 같은 상수) — 해석적 미분이 맞는지만 본다
    const c = (k: string) => Number(new RegExp(`const float ${k} = ([-\\d.e]+);`).exec(STIR_FIELD)![1]);
    const [W, BA, LA, LC, BC] = ['DENT_W', 'BOW_AHEAD', 'BOW_LA', 'BOW_LC', 'BOW_CURVE'].map(c);
    const head = [0.3, 0.1], tail = [0.0, -0.3], dep = 0.04, bow = 0.05;
    const ab = [head[0] - tail[0], head[1] - tail[1]];
    const L = Math.hypot(ab[0], ab[1]);
    const t = [ab[0] / L, ab[1] / L], n = [-t[1], t[0]];
    const h = (x: number, z: number): number => {
      const s = Math.min(1, Math.max(0, ((x - tail[0]) * ab[0] + (z - tail[1]) * ab[1]) / (L * L)));
      const dx = x - tail[0] - ab[0] * s, dz = z - tail[1] - ab[1] * s;
      let o = -dep * (0.35 + 0.65 * s) * Math.exp(-(dx * dx + dz * dz) / (W * W));
      const hx = x - head[0], hz = z - head[1];
      const cc = hx * n[0] + hz * n[1];
      const b = hx * t[0] + hz * t[1] - BA + BC * cc * cc;
      o += bow * Math.exp(-(b * b) / (LA * LA) - (cc * cc) / (LC * LC));
      return o;
    };
    const g = (x: number, z: number): number[] => {
      const s0 = ((x - tail[0]) * ab[0] + (z - tail[1]) * ab[1]) / (L * L);
      const s = Math.min(1, Math.max(0, s0));
      const inner = s0 > 0 && s0 < 1 ? 1 : 0;
      const dx = x - tail[0] - ab[0] * s, dz = z - tail[1] - ab[1] * s;
      const k = 1 / (W * W);
      const e = Math.exp(-(dx * dx + dz * dz) * k);
      const dp = dep * (0.35 + 0.65 * s);
      let gx = -e * (dep * 0.65 * inner * ab[0] / (L * L) - dp * 2 * k * dx);
      let gz = -e * (dep * 0.65 * inner * ab[1] / (L * L) - dp * 2 * k * dz);
      const hx = x - head[0], hz = z - head[1];
      const cc = hx * n[0] + hz * n[1];
      const b = hx * t[0] + hz * t[1] - BA + BC * cc * cc;
      const eb = bow * Math.exp(-(b * b) / (LA * LA) - (cc * cc) / (LC * LC));
      const bx = t[0] + 2 * BC * cc * n[0], bz = t[1] + 2 * BC * cc * n[1];
      gx -= eb * 2 * (bx * b / (LA * LA) + n[0] * cc / (LC * LC));
      gz -= eb * 2 * (bz * b / (LA * LA) + n[1] * cc / (LC * LC));
      return [gx, gz];
    };
    // 셰이더 식 문자열이 참조와 같은 꼴인지(복붙 어긋남 방지)
    expect(STIR_FIELD).toContain('o.yz -= e * (uTip.z * 0.65 * inner * ab * il2 - dep * 2.0 * k * d);');
    expect(STIR_FIELD).toContain('o.yz -= eb * 2.0 * ((t + 2.0 * BOW_CURVE * c * n) * (b / (BOW_LA * BOW_LA)) + n * (c / (BOW_LC * BOW_LC)));');
    const eps = 1e-5;
    for (const [x, z] of [[0.15, -0.1], [0.32, 0.12], [0.45, 0.25], [0.2, 0.3], [-0.05, -0.35]]) {
      const [gx, gz] = g(x, z);
      expect(gx).toBeCloseTo((h(x + eps, z) - h(x - eps, z)) / (2 * eps), 3);
      expect(gz).toBeCloseTo((h(x, z + eps) - h(x, z - eps)) / (2 * eps), 3);
    }
  });
});

describe('젓기 v3 — 소용돌이 Θ(반경 칸) · 저은 넓이 M', () => {
  it('Θ는 손이 도는 쪽으로 쌓이고 풀리지 않는다 · 이웃 칸 전단은 상한 안(과녁 · 레코드판 방지)', () => {
    const d = new DoughMesh();
    d.applyParams(RP('justfed'));
    let t = stirCircle(d, 0, 2);
    const mid = Math.round(0.55 * (SWIRL_N - 1));
    const th0 = swirlOf(d)[mid].x;
    expect(th0).toBeGreaterThan(Math.PI); // 2바퀴 × 몫 0.55 남짓 — 덩어리가 손을 따라 돈다
    t = idle(d, t, 3);
    const th1 = swirlOf(d)[mid].x;
    expect(th1).toBeGreaterThanOrEqual(th0 - 1e-6); // 놓은 뒤 되감기지 않는다
    const sw = swirlOf(d);
    for (let i = 0; i < SWIRL_N - 1; i++) expect(Math.abs(sw[i].x - sw[i + 1].x)).toBeLessThan(0.45 + 1e-4);
  });
  it('묽으면 놓은 뒤에도 더 돈다(관성) — 되직은 금방 멎는다', () => {
    const spinOn = (k: keyof typeof STATE_HOURS): number => {
      const d = new DoughMesh();
      d.applyParams(RP(k));
      const t = stirCircle(d, 0, 1);
      const mid = Math.round(0.55 * (SWIRL_N - 1));
      const a = swirlOf(d)[mid].x;
      idle(d, t, 2);
      return swirlOf(d)[mid].x - a;
    };
    expect(spinOn('sour')).toBeGreaterThan(spinOn('justfed') * 2);
  });
  it('저은 자리는 각도까지 기억한다 — 반 바퀴면 손 반경 고리의 절반 남짓, 1바퀴 반이면 거의 다', () => {
    const ringFill = (loops: number): number => {
      const d = new DoughMesh();
      d.applyParams(RP('peak'));
      stirCircle(d, 0, loops);
      const m = memOf(d);
      const i = Math.round(0.55 * (MEM_NR - 1)); // 손 반경 0.55R에 가장 가까운 고리
      return m.slice(i * MEM_NA, (i + 1) * MEM_NA).filter((v) => v > 0.5).length / MEM_NA;
    };
    const half = ringFill(0.5);
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.8);
    expect(ringFill(1.5)).toBeGreaterThan(0.9);
  });
  it('기억은 되기별로 옅어진다 — 피크 8초 뒤 20% 넘게 남고 30초 넘으면 10% 밑, 되직은 더 오래', () => {
    const left = (k: keyof typeof STATE_HOURS, sec: number): number => {
      const d = new DoughMesh();
      d.applyParams(RP(k));
      idle(d, stirCircle(d, 0, 1), sec);
      return Math.max(...memOf(d));
    };
    expect(left('peak', 8)).toBeGreaterThan(0.2);
    expect(left('peak', 33)).toBeLessThan(0.1);
    expect(left('justfed', 20)).toBeGreaterThan(left('peak', 20));
  });
  it('접힌 주름 높이 · 저은 자리 광은 되기별 — 되직 굵고 무광 · 피크 중간 반들 · 묽음 거의 없음(STIR_FOLD로 켜고 끔)', () => {
    const k = (st: keyof typeof STATE_HOURS) => {
      const d = new DoughMesh();
      d.applyParams(RP(st));
      idle(d, 0, 0.1);
      return d.material.uniforms.uStirK.value as THREE.Vector4;
    };
    const [jf, pk, so] = [k('justfed'), k('peak'), k('sour')];
    expect(STIR_FOLD).toBe(1);
    expect(jf.x).toBeGreaterThan(pk.x);
    expect(pk.x).toBeGreaterThan(so.x * 4);
    expect(jf.y).toBeLessThan(pk.y); // 되직 무광 < 피크 반들
    expect(so.z).toBeGreaterThan(jf.z); // 광 흐름은 묽을 때만
  });
});

describe('젓기 v3 — 동적 기포도 소용돌이를 따라 돈다', () => {
  it('BubbleSystem.swirl은 반경을 지키며 제 반경의 각만큼 돌린다', () => {
    const b = new BubbleSystem();
    b.update(0, 1, 1);
    const i = b.amp.findIndex((_, k) => b.pos[k * 2] !== 0 || b.pos[k * 2 + 1] !== 0);
    expect(i).toBeGreaterThanOrEqual(0);
    const [x0, z0] = [b.pos[i * 2], b.pos[i * 2 + 1]];
    b.swirl(() => Math.PI / 2);
    b.update(0.01, 0, 1);
    const [x1, z1] = [b.pos[i * 2], b.pos[i * 2 + 1]];
    expect(Math.hypot(x1, z1)).toBeCloseTo(Math.hypot(x0, z0), 6);
    expect(x1).toBeCloseTo(-z0, 6);
    expect(z1).toBeCloseTo(x0, 6);
  });
});

describe('젓기 v3 — 피크 꺼짐을 보이게(e): 높이 5~8% ↓ · 옆벽 수위선도 같이 · 30~60초에 돌아온다', () => {
  it('피크 3바퀴 → height() 5~8% 낮고 uHeight · levelY도 따른다, 60초 뒤 1% 안으로', () => {
    const d = new DoughMesh();
    const pk = RP('peak');
    d.applyParams(pk);
    let t = stirCircle(d, 0, 3);
    const drop = 1 - d.height() / pk.height;
    expect(drop).toBeGreaterThan(0.05);
    expect(drop).toBeLessThan(0.08);
    expect(d.material.uniforms.uHeight.value as number).toBeCloseTo(d.height(), 6);
    t = idle(d, t, 60);
    expect(1 - d.height() / pk.height).toBeLessThan(0.01);
    // 갓 밥준(ripe 0)은 꺼지지 않는다
    const jf = new DoughMesh();
    jf.applyParams(RP('justfed'));
    stirCircle(jf, 0, 3);
    expect(jf.height()).toBeCloseTo(RP('justfed').height, 6);
  });
});
