// 렌더 층 순수 로직 — 픽셀 총량 상한(T4-11) · 셰이더 시계 원점(T4-9) · 김 페이드(T4-14).
// node 환경이라 WebGL은 없다. three 객체·uniform만 만지는 표면을 검증한다.
import { describe, it, expect } from 'vitest';
import { fitPixelRatio, CAM_ELEV_DEG } from '../src/render/SceneHost';
import { BreadShowcase } from '../src/render/breadShowcase';
import { DoughMesh } from '../src/render/dough/DoughMesh';
import { ParticlePool, STEAM_FADE_S } from '../src/render/particles';
import { JAR_HEIGHT } from '../src/render/jar';
import { toRenderParams } from '../src/render/renderParams';
import { simSnap } from '../scripts/lib/simSnap';
import * as THREE from 'three';

// 판정 M4(2026-11-19) — 피크에서 잡아 당기면 리본 끝이 병 입구 위로 솟아 소프트아이스크림 꼴이 됐다.
// 리본 끝 y = topY + |변위| × uGrabShape.y × 1.7(dough.vert.glsl 리프트 식의 상수)
describe('DoughMesh grab — 리본 끝은 병 입구 위로 솟지 않는다(판정 M4)', () => {
  const tipY = (h: number): { tip: number; rp: ReturnType<typeof toRenderParams> } => {
    const d = new DoughMesh();
    const rp = toRenderParams(simSnap(h));
    d.applyParams(rp);
    d.tick(0);
    d.grabStart(0, 0);
    d.grabMove(5, 0); // grabMax까지 끝까지 당긴다
    for (let i = 1; i <= 120; i++) d.tick(i / 60);
    const u = d.material.uniforms;
    const disp = (u.uGrabDisp.value as THREE.Vector2).length();
    return { tip: d.topY() + disp * (u.uGrabShape.value as THREE.Vector2).y * 1.7, rp };
  };
  it('피크(+5h, 수위 ≈1.6) — 끝까지 당겨도 JAR_HEIGHT + 0.12 이하, 잠금값 grabMax는 그대로', () => {
    const { tip, rp } = tipY(5);
    expect(rp.height).toBeGreaterThan(1.55);
    expect(tip).toBeLessThanOrEqual(JAR_HEIGHT + 0.12 + 1e-6);
  });
  it('배고픔(+20h, 수위 ≈0.7)은 여유가 커서 리프트가 거의 줄지 않는다', () => {
    const d = new DoughMesh();
    d.applyParams(toRenderParams(simSnap(20)));
    d.grabStart(0, 0);
    d.grabMove(5, 0);
    d.tick(0);
    expect((d.material.uniforms.uGrabShape.value as THREE.Vector2).y).toBeGreaterThan(1.6 * 0.9);
  });
});

describe('fitPixelRatio — DPR 상한 + 버퍼 총량 상한', () => {
  it('360×728 폰은 비율 2 그대로', () => {
    expect(fitPixelRatio(3, 360, 728)).toBe(2);
    expect(fitPixelRatio(2, 360, 728)).toBe(2);
  });
  it('800×1280@2 태블릿은 줄어들고 버퍼가 2.2M px 안', () => {
    const r = fitPixelRatio(2, 800, 1280);
    expect(r).toBeLessThan(2);
    expect(800 * r * 1280 * r).toBeLessThanOrEqual(2.2e6 * 1.0001);
  });
  it('DPR 1은 어떤 크기에서도 DPR보다 커지지 않는다', () => {
    expect(fitPixelRatio(1, 200, 300)).toBe(1);
  });
});

describe('DoughMesh.tick — 셰이더 시계', () => {
  it('shaderT를 주면 uTime은 그 값, 안 주면 t', () => {
    const d = new DoughMesh();
    d.tick(86400 * 10, 12.5); // 10일 켠 앱: CPU t는 크고, 셰이더 시계는 원점 이동으로 작다
    expect(d.material.uniforms.uTime.value).toBe(12.5);
    d.tick(5);
    expect(d.material.uniforms.uTime.value).toBe(5);
  });
  it('shaderT는 CPU 로직에 영향 없다 — 숨쉬기 위상은 t만 따른다', () => {
    const a = new DoughMesh();
    const b = new DoughMesh();
    a.tick(100, 100);
    b.tick(100, 3);
    expect(b.mesh.scale.y).toBe(a.mesh.scale.y);
  });
});

describe('ParticlePool — 김 페이드', () => {
  it('수명 끝 0.3초에 scale이 0으로 줄어든다', () => {
    const pool = new ParticlePool();
    pool.spawnSteam(1, 1.7);
    const scales: number[] = [];
    for (let i = 0; i < 100 && (i === 0 || pool.mesh.count > 0); i++) {
      pool.update(0.05);
      if (pool.mesh.count > 0) scales.push(pool.mesh.instanceMatrix.array[0] as number); // 회전 없음 → [0] = scale.x
    }
    const peak = Math.max(...scales);
    expect(scales.length).toBeGreaterThan(Math.ceil(STEAM_FADE_S / 0.05)); // 수명이 페이드 구간보다 길다
    expect(scales[scales.length - 1]).toBeLessThan(peak * 0.3);
  });
});

// 판정 R-H1(2026-11-19 최종 검토) — 홈 카메라를 52°에서 42°로 내렸는데 쇼케이스 기울기는 52° 기준(−16°)에 남아
// 빵이 썸네일 · 레퍼런스(scripts/thumbsHarness.ts 카메라 35.8°)보다 낮은 26°로 보였다(VISUAL §4-6)
describe('쇼케이스 — 빵을 썸네일과 같은 36°에서 본다(R-H1)', () => {
  it('쇼케이스 시선 고도 = 36°±1 — 빵 세로축과 카메라 방향이 이루는 고도', () => {
    const s = new BreadShowcase(() => new THREE.Texture());
    const up = new THREE.Vector3(0, 1, 0).applyEuler(s.group.rotation);
    const a = THREE.MathUtils.degToRad(CAM_ELEV_DEG);
    const toCam = new THREE.Vector3(0, Math.sin(a), Math.cos(a)); // 직교 카메라 — 방향만 본다
    const elev = 90 - THREE.MathUtils.radToDeg(up.angleTo(toCam));
    expect(Math.abs(elev - 36)).toBeLessThanOrEqual(1);
  });
});
