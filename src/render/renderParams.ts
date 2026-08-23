// Snapshot → RenderParams — sim→render 유일한 이음새의 렌더 쪽 절반 (순수, three 무의존, vitest 대상).
// uniform 값 범위·앵커: docs/VISUAL.md §3-2·§3-3. 시작 공식 — 실기기에서 상수만 미세 튜닝.
import type { Snapshot } from '../sim/types';

export interface RenderParams {
  /** 반죽 색 [r,g,b] 0~1 */
  color: [number, number, number];
  breatheAmp: number;      // 0.004~0.055
  breathePeriod: number;   // 2.6~7.0 s
  noiseSpeed: number;      // 0.1~1.6
  bubbleDensity: number;   // 0~1
  bubbleScale: number;     // 0.5~1.5
  specStr: number;         // 0.1~1.2
  crust: number;           // 0~1 (휴면 마른 껍질)
  fillY: number;           // 0.6~1.6 (고무줄 기준)
  hoochAmt: number;        // 0~1
}

type RGB = [number, number, number];
const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// 상태 앵커 색 (VISUAL §3-3)
const CREAM = hex(0xf4ead4);
const HUNGRY_TONE = hex(0xdcd2c0);
const SOUR_TONE = hex(0xcbbda2);
const DORMANT_TONE = hex(0xe4dccc);

export function toRenderParams(s: Snapshot): RenderParams {
  const a = clamp01(s.activity);

  let color = mix(CREAM, HUNGRY_TONE, clamp01(s.hunger));
  color = mix(color, SOUR_TONE, smooth(0.25, 0.6, s.sourness));
  color = mix(color, DORMANT_TONE, clamp01(s.dormancy));

  return {
    color,
    breatheAmp: 0.006 + (0.055 - 0.006) * a,
    breathePeriod: 2.6 + (7.0 - 2.6) * Math.pow(1 - a, 1.5),
    noiseSpeed: 0.1 + 1.5 * a,
    bubbleDensity: clamp01(a * 0.9 * (1 - 0.85 * s.dormancy)),
    bubbleScale: 0.5 + 0.8 * a,
    specStr: Math.min(1.2, Math.max(0.1, 0.15 + 1.05 * a - 0.4 * s.hunger - 0.6 * s.dormancy)),
    crust: 0.8 * clamp01(s.dormancy),
    fillY: s.fill,
    hoochAmt: clamp01(s.hooch),
  };
}

/** 프레임 스무딩 — 지수 lerp (τ초). 앱 오픈 스냅은 호출자가 params를 직접 대입 */
export function smoothParams(cur: RenderParams, target: RenderParams, dtSec: number, tau = 1.2): RenderParams {
  const k = 1 - Math.exp(-dtSec / tau);
  const n = (c: number, t: number): number => c + (t - c) * k;
  return {
    color: mix(cur.color, target.color, k),
    breatheAmp: n(cur.breatheAmp, target.breatheAmp),
    breathePeriod: n(cur.breathePeriod, target.breathePeriod),
    noiseSpeed: n(cur.noiseSpeed, target.noiseSpeed),
    bubbleDensity: n(cur.bubbleDensity, target.bubbleDensity),
    bubbleScale: n(cur.bubbleScale, target.bubbleScale),
    specStr: n(cur.specStr, target.specStr),
    crust: n(cur.crust, target.crust),
    fillY: n(cur.fillY, target.fillY),
    hoochAmt: n(cur.hoochAmt, target.hoochAmt),
  };
}
