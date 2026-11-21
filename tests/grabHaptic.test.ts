// 들기 진동 배선 잠금(떼어내기 v6 §6) — yield → break(last) → end 순서에서 2회, 시큼(끊김 없음)은 놓을 때 1회
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { grabHaptics } from '../src/grabHaptic';
import type { StrandBreak } from '../src/render/dough/StrandMesh';

const ev = (kind: StrandBreak['kind'], last = false): StrandBreak => ({ kind, thin: kind === 'break' && !last, last, torn: false });

describe('들기 진동', () => {
  it('피크 — 항복 1 + 마지막 끊김 1 = 2회(가는 갈래 · 착지 · 끊긴 뒤 놓기는 무진동)', () => {
    const calls: string[] = [];
    const h = grabHaptics((k) => calls.push(k));
    h.start();
    for (const e of [ev('yield'), ev('break'), ev('break'), ev('break', true), ev('land')]) h.event(e);
    h.end();
    expect(calls).toEqual(['light', 'light']);
  });
  it('항복 뒤 끊기 전에 놓으면 — 항복 1 + 놓기 1 = 2회', () => {
    const calls: string[] = [];
    const h = grabHaptics((k) => calls.push(k));
    h.start();
    h.event(ev('yield'));
    h.event(ev('land'));
    h.end();
    expect(calls).toEqual(['light', 'light']);
  });
  it('app.ts 배선 — 들기 사건 · 놓기는 grabHap만 거치고, 들기 배선에 haptic 직접 호출이 없다', () => {
    const src = readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');
    expect(src).toContain('grabHap.event(e)');
    expect(src).toContain('grabHap.end()');
    const a = src.indexOf('const grabHap = grabHaptics(haptic);');
    const b = src.indexOf('scene.onGrabEvent');
    const wire = src.slice(a, src.indexOf('sfxBubble', b)); // 들기 배선(onGrabStart ~ onGrabEvent 착지 기포 앞까지)
    expect(a).toBeGreaterThan(0);
    expect(wire).toContain('grabHap.event(e)');
    expect(wire).not.toMatch(/haptic\('light'\)/);
  });
  it('시큼 — 항복 · 끊김 없이 놓으면 놓을 때 1회 · 다음 들기는 새로 센다', () => {
    const calls: string[] = [];
    const h = grabHaptics((k) => calls.push(k));
    h.start();
    h.event(ev('land'));
    h.end();
    expect(calls).toEqual(['light']);
    h.start();
    h.event(ev('break', true));
    h.end();
    expect(calls).toEqual(['light', 'light']);
  });
});
