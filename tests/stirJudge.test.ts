// M1 원을 그리면 젓기 — grab 중 손짓 판정기. 곧은 당김 · 떨림 · 당겼다 놓기 = grab 유지, 원 · 왕복 = 젓기
import { describe, it, expect } from 'vitest';
import { StirJudge } from '../src/render/input';

/** 점 목록을 차례로 넣고 처음 true가 난 칸(없으면 -1) */
const feed = (pts: [number, number][]): number => {
  const j = new StirJudge(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) if (j.push(pts[i][0], pts[i][1])) return i;
  return -1;
};
const line = (x0: number, y0: number, dx: number, dy: number, n: number): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [x0 + dx * i, y0 + dy * i]);

describe('StirJudge', () => {
  it('곧은 당김은 안 넘긴다', () => {
    expect(feed(line(100, 100, 3, 0, 80))).toBe(-1);
    expect(feed(line(100, 100, 2, 5, 60))).toBe(-1);
  });

  it('손떨림 섞인 곧은 당김(옆으로 ±2px · 앞뒤 ±1px)은 안 넘긴다', () => {
    const pts = line(100, 100, 0, 3, 120).map(([x, y], i): [number, number] => [
      x + (i % 2 ? 2 : -2) * Math.sin(i * 1.7),
      y + Math.cos(i * 2.3),
    ]);
    expect(feed(pts)).toBe(-1);
  });

  it('1px씩 아주 천천히 끄는 곧은 당김도 안 넘긴다(4px 미만 조각 무시)', () => {
    const pts = line(100, 100, 1, 0, 200).map(([x, y], i): [number, number] => [x, y + (i % 3) * 0.7]);
    expect(feed(pts)).toBe(-1);
  });

  it('당겼다 제자리로 놓기(뒤집힘 1번)는 안 넘긴다', () => {
    expect(feed([...line(100, 100, 4, 0, 30), ...line(220, 100, -4, 0, 30).slice(1)])).toBe(-1);
  });

  it('한 번 꺾인 ㄱ자 당김은 안 넘긴다', () => {
    expect(feed([...line(100, 100, 4, 0, 30), ...line(220, 100, 0, 4, 30).slice(1)])).toBe(-1);
  });

  it('원을 그리면 반 바퀴 안에 넘긴다 — 느린 원(프레임당 2px)도 · 빠른 원도', () => {
    for (const [r, steps] of [[60, 190], [60, 24], [30, 30]] as const) {
      const pts = Array.from({ length: steps + 1 }, (_, i): [number, number] => {
        const a = (i / steps) * Math.PI * 2;
        return [200 + Math.cos(a) * r, 200 + Math.sin(a) * r * 0.6];
      });
      const at = feed(pts);
      expect(at).toBeGreaterThan(0);
      expect(at).toBeLessThan(steps / 2);
    }
  });

  it('반대 방향 원도 넘긴다', () => {
    const pts = Array.from({ length: 61 }, (_, i): [number, number] => {
      const a = -(i / 60) * Math.PI * 2;
      return [200 + Math.cos(a) * 50, 200 + Math.sin(a) * 50];
    });
    expect(feed(pts)).toBeGreaterThan(0);
  });

  it('R3 60px 당긴 채 1.5s 머무름 · ±3px 떨림(균등 200회)은 안 넘긴다', () => {
    let crossed = 0;
    for (let seed = 1; seed <= 200; seed++) {
      let s = seed;
      const rnd = (): number => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
      const pts = line(100, 100, 3, 0, 20);
      for (let i = 0; i < 90; i++) pts.push([160 + rnd() * 3, 100 + rnd() * 3]);
      if (feed(pts) >= 0) crossed++;
    }
    expect(crossed).toBe(0);
  });

  it('왕복은 두 번째 뒤집힘에서 넘긴다', () => {
    const pts = [...line(100, 100, 5, 0, 12), ...line(160, 100, -5, 0, 12).slice(1), ...line(100, 100, 5, 0, 12).slice(1)];
    const at = feed(pts);
    expect(at).toBeGreaterThan(24);
    expect(at).toBeLessThan(28);
  });
});
