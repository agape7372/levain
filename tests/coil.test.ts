// 끊긴 뒤 더미 메시(CoilMesh) — GLB 예산 · 모프 이름 · k → (모프 · Y 배율 · 보임) 경계.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CoilMesh, coilPhase, coilWeights } from '../src/render/dough/CoilMesh';

describe('public/fx/dough_coil.glb', () => {
  const buf = readFileSync('public/fx/dough_coil.glb');
  it('≤ 60KB', () => {
    expect(buf.length).toBeLessThanOrEqual(60 * 1024);
  });
  it('모프 이름 K0 · K1 · K2 (GLB JSON 덩이)', () => {
    const jsonLen = buf.readUInt32LE(12);
    const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
    expect(json.meshes[0].extras.targetNames).toEqual(['K0', 'K1', 'K2']);
    expect(json.meshes[0].primitives[0].targets.length).toBe(3);
    expect(json.materials ?? []).toHaveLength(0);
  });
});

describe('coilPhase — k(1 → 0)', () => {
  it('경계값 — 1 K0 · 0.55 K1 · 0.15 K2 · 0.05 Y 0 · 그 아래 숨김', () => {
    expect(coilPhase(1)).toEqual({ m: 0, yScale: 1, visible: true });
    expect(coilPhase(0.55).m).toBeCloseTo(1, 9);
    expect(coilPhase(0.15).m).toBeCloseTo(2, 9);
    expect(coilPhase(0.15).yScale).toBe(1);
    expect(coilPhase(0.05).yScale).toBe(0);
    expect(coilPhase(0.05).visible).toBe(false);
    expect(coilPhase(0.0501).visible).toBe(true);
    expect(coilPhase(0).visible).toBe(false);
  });
  it('k가 줄면 모프는 늘고 Y 배율은 줄기만 한다(단조)', () => {
    let m = -1;
    let y = 2;
    for (let k = 1; k >= 0; k -= 0.01) {
      const p = coilPhase(k);
      expect(p.m).toBeGreaterThanOrEqual(m - 1e-12);
      expect(p.yScale).toBeLessThanOrEqual(y + 1e-12);
      m = p.m;
      y = p.yScale;
    }
  });
  it('묽음은 K1에서 시작', () => {
    expect(coilPhase(1, 1).m).toBe(1);
    expect(coilPhase(0.3, 1).m).toBeGreaterThan(1);
    expect(coilPhase(1, 0.5).m).toBe(0.5);
  });
  it('가중치는 합 1 · 이웃 모프만', () => {
    for (const m of [0, 0.3, 1, 1.4, 2]) {
      const w = coilWeights(m);
      expect(w[0] + w[1] + w[2]).toBeCloseTo(1, 9);
    }
    expect(coilWeights(1)).toEqual([0, 1, 0]);
    expect(coilWeights(0.5)[2]).toBe(0);
    expect(coilWeights(1.5)[0]).toBe(0);
  });
});

describe('정점 그늘 vAO', () => {
  it('COLOR_0 없을 때 = 기본 1 경로 — 더미 vert는 aAO를 uCoilM으로 풀어 vAO에 보내고, aAO 1이면 어느 모프에서나 1', () => {
    const coil = new CoilMesh({});
    const m = coil.mesh.material as THREE.ShaderMaterial;
    expect(m.vertexShader).toContain('vAO = mix(1.0, aAO, 1.0 - uCoilM * 0.8);');
    expect(m.uniforms.uCoilM.value).toBe(0);
    // 모프 0(막 떨어짐)에서 그늘 전부, 1(다 녹음)에서 20%
    const mixAO = (ao: number, mm: number) => 1 + (ao - 1) * (1 - mm * 0.8);
    expect(mixAO(0.4, 0)).toBeCloseTo(0.4, 9);
    expect(mixAO(0.4, 1)).toBeCloseTo(0.88, 9);
    expect(mixAO(1, 0.3)).toBe(1);
  });
});
