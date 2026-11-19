// 반죽 표면 질감 v2(2026-11-19 P1b) — 윗면 신호 · 광택 · 밀가루 톤 · 기포 · 곰팡이 · 셰이더 해시.
// 정본: docs/VISUAL.md §2·§3-2·§3-3·§4-4·§8. 감사 id는 .work/audit-1119/audit_results.json.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { toRenderParams } from '../src/render/renderParams';
import { DoughMesh, R_BODY, XZ_SCALE, MOLD_N, TRAIL_N } from '../src/render/dough/DoughMesh';
import { createJar, HOOCH_COVER } from '../src/render/jar';
import { BubbleSystem, SCAR_AMP, DYN_SLOTS } from '../src/render/bubbles';
import frag from '../src/render/dough/dough.frag.glsl?raw';
import vert from '../src/render/dough/dough.vert.glsl?raw';
import type { Snapshot } from '../src/sim';
import { simSnap, STATE_HOURS } from '../scripts/lib/simSnap';

// 실제 sim 궤적의 상태별 시각(판정 H2, 2026-11-19) — 옛 손 고정값(falling = riseFill 1.2 + hunger 0.3 등)은
// sim이 못 만드는 조합이라 실제 화면을 가렸다. motionlab 프리셋과 같은 표(scripts/lib/simSnap.ts STATE_HOURS)
const S = Object.fromEntries(Object.entries(STATE_HOURS).map(([k, h]) => [k, simSnap(h)])) as
  Record<keyof typeof STATE_HOURS, Snapshot>;
const R = Object.fromEntries(Object.entries(S).map(([k, s]) => [k, toRenderParams(s)])) as Record<keyof typeof S, ReturnType<typeof toRenderParams>>;

/** sRGB 0~1 → CIE L* (D65) */
function lstar([r, g, b]: [number, number, number]): number {
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

describe('윗면 질감 신호 — 상태마다 문법이 다르다(R2-07 · R2-06 · R1 must ⑤)', () => {
  it('갓 밥준 = 젓은 물결만, 바늘구멍 · 꺼짐 없음', () => {
    expect(R.justfed.stir).toBeGreaterThan(0.8);
    expect(R.justfed.pinholes).toBeLessThan(0.05);
    expect(R.justfed.sink).toBe(0);
  });
  it('오르는 중 = 유리 닿는 가장자리 잔거품 띠, 꺼짐 없음', () => {
    expect(R.rising.foam).toBeGreaterThan(0.3);
    expect(R.rising.sink).toBe(0);
    expect(R.rising.stir).toBeLessThan(R.justfed.stir * 0.5);
  });
  it('피크 = 바늘구멍 + 돔, 꺼짐 없음', () => {
    expect(R.peak.pinholes).toBeGreaterThan(0.3);
    expect(R.peak.ripe).toBeGreaterThan(0.5);
    expect(R.peak.sink).toBe(0);
  });
  it('하강 = 가운데부터 꺼진다 — 오르는 중과 구별된다', () => {
    expect(R.falling.sink).toBeGreaterThan(0.8);
    expect(R.falling.sink - R.rising.sink).toBeGreaterThan(0.8);
  });
  it('배고픔 = 평평 + 고른 바늘구멍, 꺼짐 끝', () => {
    expect(R.hungry.pinholes).toBeGreaterThan(0.4);
    expect(R.hungry.sink).toBeLessThan(0.05);
    expect(R.hungry.ripe).toBe(0);
  });
  it('휴면 · 곰팡이 = 살아있는 표면 신호 0(죽은 분기와 상호배타, §8 예산)', () => {
    for (const k of ['dormant', 'moldy'] as const) {
      expect(R[k].pinholes).toBe(0);
      expect(R[k].foam).toBe(0);
      expect(R[k].stir).toBe(0);
      expect(R[k].wallCells).toBe(0);
    }
  });
});

describe('광택 — R1 실물 근거로 2026-08-25 가설을 뒤집는다(R2-12)', () => {
  it('갓 밥준 = 넓은 젖은 광 높음 · 피크 = 새틴 · 배고픔 = 얇은 막 · 휴면 = 매트', () => {
    expect(R.justfed.specStr).toBeGreaterThanOrEqual(0.6);
    expect(R.justfed.specStr).toBeLessThanOrEqual(0.8);
    expect(R.peak.specStr).toBeGreaterThanOrEqual(0.3);
    expect(R.peak.specStr).toBeLessThanOrEqual(0.4);
    expect(R.hungry.specStr).toBeGreaterThanOrEqual(0.25);
    expect(R.hungry.specStr).toBeLessThanOrEqual(0.45);
    expect(R.dormant.specStr).toBeLessThanOrEqual(0.1);
    expect(R.justfed.specStr).toBeGreaterThan(R.peak.specStr);
  });
  it('젖음(wet)은 갓 밥준 몫이다 — 피크에 바닥값을 두지 않는다', () => {
    expect(R.justfed.wet).toBeGreaterThan(0.9);
    expect(R.peak.wet).toBeLessThan(0.1);
  });
});

describe('밀가루 톤 — 통밀 따뜻한 황갈 · 호밀 갈색(R2-13 · R1 사진 28·29)', () => {
  const pk = (flour: Snapshot['flour']) => toRenderParams({ ...S.peak, flour }).color;
  // 개정 2026-11-19 다듬기: 섞는 비율 0.6은 ΔL* −21 · −25로 실물(28: 통밀 −10 · 호밀 −12)의 두 배였다 — 밀크티 · 진흙
  it('통밀 · 호밀은 흰 밀가루보다 어둡되 실물 폭 안(호밀 ΔL* 12~16 · 통밀 9~16)', () => {
    const w = lstar(pk('white'));
    const dw = w - lstar(pk('wholewheat'));
    const dr = w - lstar(pk('rye'));
    expect(dr).toBeGreaterThanOrEqual(12);
    expect(dr).toBeLessThanOrEqual(16);
    expect(dw).toBeGreaterThanOrEqual(9);
    expect(dw).toBeLessThanOrEqual(16);
  });
  it('회색이 아니라 갈색 — r > g > b 이고 r−b 차가 흰 밀가루보다 크다', () => {
    for (const f of ['wholewheat', 'rye'] as const) {
      const [r, g, b] = pk(f);
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
      const [wr, , wb] = pk('white');
      expect(r - b).toBeGreaterThan(wr - wb);
    }
  });
  it('호밀이 통밀보다 조금 더 어둡다(실물 ΔL* ≈ 2)', () => {
    const d = lstar(pk('wholewheat')) - lstar(pk('rye'));
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(6);
  });
});

describe('기포 — 작고 날카로운 돔이 터지면 바늘구멍이 남았다 옅어진다(R2-08)', () => {
  it('돔은 k 60~140 · 진폭 0.025 이하', () => {
    const b = new BubbleSystem();
    for (let i = 0; i < 4; i++) b.spawnNow(0, 1);
    b.update(0.5, 0, 1);
    for (let i = 0; i < 4; i++) {
      expect(b.k[i]).toBeGreaterThanOrEqual(60);
      expect(b.k[i]).toBeLessThanOrEqual(140);
      expect(Math.abs(b.amp[i])).toBeLessThanOrEqual(0.025);
    }
  });
  it('터진 뒤 1.5초에도 바늘구멍(음수 진폭)이 남아 있고, 6초 안에 슬롯이 빈다', () => {
    const b = new BubbleSystem();
    b.spawnNow(0, 1);
    let poppedAt = -1;
    for (let t = 0; t < 12; t += 1 / 60) {
      b.update(t, 0, 1);
      if (poppedAt < 0 && b.popsThisFrame > 0) poppedAt = t;
      if (poppedAt >= 0 && Math.abs(t - poppedAt - 1.5) < 1 / 120) {
        expect(b.amp[0]).toBeLessThan(0);
      }
    }
    expect(poppedAt).toBeGreaterThan(0);
    expect(b.amp[0]).toBe(0);
  });
  // 판정 R-M3(2026-11-19 최종 검토) — 바늘구멍이 4초 동안 슬롯을 붙들어, 젓기(수명 ↓ · 스폰 ↑)가 오히려 돔을 줄였다
  // (쉼 1.62 → 젓기 0.65, .work/final-review/render/bubsim.mts). 밀도 1로 10분, 시드 고정
  it('젓는 동안 평균 돔 수가 쉴 때보다 적지 않다 — 쉼도 목표 2~4개(R-M3)', () => {
    const avgDomes = (ag: number): number => {
      let seed = 7;
      const rnd = vi.spyOn(Math, 'random').mockImplementation(() => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      });
      try {
        const b = new BubbleSystem();
        const N = 600 * 60;
        let sum = 0;
        for (let i = 0; i < N; i++) {
          b.update(i / 60, 1, 1, ag);
          for (const a of b.amp) if (a > 1e-4) sum++;
        }
        return sum / N;
      } finally {
        rnd.mockRestore();
      }
    };
    const rest = avgDomes(0);
    expect(rest).toBeGreaterThanOrEqual(2);
    expect(avgDomes(1)).toBeGreaterThanOrEqual(rest);
  });
});

describe('하강 꺼짐 — 가운데가 테두리보다 낮다(R2-06)', () => {
  it('하강은 topY < levelY, 피크는 topY > levelY', () => {
    const d = new DoughMesh();
    d.applyParams(R.falling);
    d.tick(1);
    expect(d.topY()).toBeLessThan(d.levelY());
    d.applyParams(R.peak);
    d.tick(2);
    expect(d.topY()).toBeGreaterThan(d.levelY());
  });
});

describe('곰팡이 군락 — CPU가 시드로 자리를 정해 두 셰이더가 같은 값을 읽는다(R2-10)', () => {
  const colonies = (seed: number): THREE.Vector4[] => {
    const d = new DoughMesh();
    d.setSeed(seed);
    return d.material.uniforms.uMoldA.value as THREE.Vector4[];
  };
  // 개정 2026-11-19 다듬기: 반점 1~2개 → 퍼짐에서 몇 개 더(흰 솜털 반점, 실물 25 · 26 · 27)
  it('군락 5개 — 윗면 안쪽(0.75·R) · 같은 시드면 같은 자리', () => {
    const a = colonies(12345);
    expect(a.length).toBe(5);
    for (const c of a) expect(Math.hypot(c.x, c.y)).toBeLessThanOrEqual(0.75 * R_BODY);
    expect(colonies(12345).map((c) => c.toArray())).toEqual(a.map((c) => c.toArray()));
  });
  it('시드마다 색 종류(흰 · 청록 · 분홍빛 회색)가 갈린다', () => {
    const kinds = new Set<number>();
    for (let s = 1; s < 40; s++) for (const c of colonies(s * 7919)) kinds.add(c.w);
    expect([...kinds].sort()).toEqual([0, 1, 2]);
  });
});

describe('셰이더 — 해시 · 줄무늬 필드 회귀 방지(R2-04 · A1-06 · 예산 §8)', () => {
  it('mediump에서 뭉개지는 sin 해시(43758)와 주기 sin 기공 필드(cellField)가 없다', () => {
    expect(frag).not.toMatch(/43758/);
    expect(frag).not.toMatch(/cellField/);
  });
  it('3×3 이웃 탐색 없이 칸마다 기포 하나 — 기포 층 함수는 이중 루프를 갖지 않는다', () => {
    expect(frag).not.toMatch(/for\s*\(int\s+\w+\s*=\s*-1/);
  });
  it('셰이더 상수가 CPU 쪽과 같다 — XZ_W = XZ_SCALE · SCAR_AMP', () => {
    expect(frag).toContain(`const float XZ_W = ${XZ_SCALE};`);
    expect(frag).toContain(`const float SCAR_AMP = ${SCAR_AMP};`);
  });
  it('범프 · 실 능선 · 곰팡이 배열 길이와 루프 상한이 TS 상수와 같다(규칙 8 · R-L3)', () => {
    for (const s of [vert, frag]) {
      for (const n of ['vec2 uBumpPos', 'float uBumpAmp', 'float uBumpK']) expect(s).toContain(`uniform ${n}[${DYN_SLOTS}];`);
      for (const n of ['vec2 uTrailPos', 'float uTrailAmp', 'float uTrailK']) expect(s).toContain(`uniform ${n}[${TRAIL_N}];`);
      expect(s).toContain(`uniform vec4 uMoldA[${MOLD_N}];`);
      // 루프마다 본문이 읽는 배열의 상수와 짝짓는다 — 소속 검사만 하면 범프 루프가 TRAIL_N 값이어도 통과한다(RV-L2)
      const want = { Bump: DYN_SLOTS, Trail: TRAIL_N, Mold: MOLD_N } as const;
      const seen = new Set<string>();
      for (const m of s.matchAll(/for \(int i = 0; i < (\d+); i\+\+\) \{([\s\S]*?)\n\s*\}/g)) {
        const arr = /u(Bump|Trail|Mold)\w*\[i\]/.exec(m[2])?.[1] as keyof typeof want | undefined;
        expect(arr, `루프 본문이 범프 · 실 · 곰팡이 배열을 읽지 않는다: ${m[0].slice(0, 60)}`).toBeDefined();
        expect(Number(m[1]), `${arr} 루프 상한`).toBe(want[arr!]);
        seen.add(arr!);
      }
      expect(seen.size).toBe(3);
    }
  });
});

// 판정 R-M1(2026-11-19 최종 검토) — 유리 자국 흘러내림 · 냉장 물방울이 sin 해시(×43758)를 쓰는데 프래그가 mediump였다.
// fp16(Mali · Adreno)에선 곱이 1024를 넘으면 ulp ≥ 1이라 fract가 0으로 무너져 물방울 0.308 → 0.002, 흘러내림 5줄 → 0줄
// (.work/final-review/render/fp16.mjs). 데스크톱 ANGLE은 mediump를 무시해 캡처로는 안 보인다 — 선언으로 잠근다
describe('유리 · hooch 셰이더 정밀도 — highp(R-M1)', () => {
  const jar = createJar();
  const frags: string[] = [];
  jar.group.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m instanceof THREE.ShaderMaterial) frags.push(m.fragmentShader);
  });
  it('sin 해시를 쓰는 프래그(유리 앞 · 뒤)는 전부 highp다', () => {
    const hashed = frags.filter((f) => f.includes('43758'));
    expect(hashed.length).toBe(2);
    for (const f of hashed) {
      expect(f).toMatch(/precision highp float;/);
      expect(f).not.toMatch(/precision\s+mediump/);
    }
  });
  it('hooch 프래그도 highp다', () => {
    const f = (jar.hooch.material as THREE.ShaderMaterial).fragmentShader;
    expect(f).toMatch(/precision highp float;/);
    expect(f).not.toMatch(/precision\s+mediump/);
  });
});

describe('hooch — 액체로 읽히되 유리판 줄이 없다 · 덮인 곳엔 마른 금이 없다(2026-11-19 다듬기)', () => {
  const hoochFrag = (createJar().hooch.material as THREE.ShaderMaterial).fragmentShader;
  it('반사는 1차원 띠(평행 줄)가 아니라 2차원 얼룩 — vP.xz를 한 축에 투영한 띠 함수가 없다', () => {
    expect(hoochFrag).not.toMatch(/float u = dot\(vP\.xz/);
  });
  it('덮임 함수는 hooch와 반죽 셰이더가 같은 소스를 쓴다(규칙 8과 같은 이유)', () => {
    const d = new DoughMesh();
    expect(hoochFrag).toContain(HOOCH_COVER);
    expect(d.material.fragmentShader).toContain(HOOCH_COVER);
  });
  it('반죽이 hooch 양을 받아 잔금을 덮인 만큼 지운다', () => {
    const d = new DoughMesh();
    d.applyParams(R.dormant);
    expect(R.dormant.hoochAmt).toBeGreaterThan(0.5);
    expect(d.material.uniforms.uHooch.value).toBeCloseTo(R.dormant.hoochAmt, 6);
    expect(d.material.fragmentShader).toMatch(/1\.0 - hoochCover\(/);
  });
});
