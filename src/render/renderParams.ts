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
  fillY: number;           // 0.6~1.6 (급여 시점=1.0 기준)
  hoochAmt: number;        // 0~1
  wet: number;             // 0~1 급여 직후 젖은 광 → 마르면 무광 페이스트
  ripe: number;            // 0~1 피크 돔 + crackle
  collapse: number;        // 0~1 과숙 크레이터 함몰
  mold: number;            // 0~1 곰팡이 확산 (Snapshot.mold01)
  kahm: number;            // 0~1 kahm 효모 막
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
// 곰팡이 확정 — 잿빛이 도는 바랜 톤. 경고는 다이제틱(반점) 소관, 빨강 시맨틱 없음 (VISUAL §7-1)
const MOLDY_TONE = hex(0xd8d0be);

export function toRenderParams(s: Snapshot): RenderParams {
  const a = clamp01(s.activity);
  const moldy = s.phase === 'moldy';

  let color = mix(CREAM, HUNGRY_TONE, clamp01(s.hunger));
  color = mix(color, SOUR_TONE, smooth(0.25, 0.6, s.sourness));
  color = mix(color, DORMANT_TONE, clamp01(s.dormancy));
  if (moldy) color = mix(color, MOLDY_TONE, 0.7);

  return {
    color,
    // moldy = 유일하게 숨이 완전히 멎는 상태 (휴면의 '완전 정지 금지'는 죽음 오인 방지책이었다)
    breatheAmp: moldy ? 0 : 0.006 + (0.055 - 0.006) * a,
    breathePeriod: 2.6 + (7.0 - 2.6) * Math.pow(1 - a, 1.5),
    noiseSpeed: moldy ? 0 : 0.1 + 1.5 * a,
    bubbleDensity: moldy ? 0 : clamp01(a * 0.9 * (1 - 0.85 * s.dormancy)),
    bubbleScale: 0.5 + 0.8 * a,
    // 피크에서도 무광 페이스트 — 과한 스펙은 플라스틱으로 읽힌다 (젖은 광은 uWet 소관)
    specStr: Math.min(1.0, Math.max(0.1, 0.12 + 0.8 * a - 0.4 * s.hunger - 0.6 * s.dormancy)),
    crust: 0.8 * clamp01(Math.max(s.dormancy, moldy ? 1 : 0)),
    fillY: s.fill,
    hoochAmt: clamp01(s.hooch),
    // 급여 직후 젖은 광 — 활성이 오르고 배고파질수록 마른다
    wet: clamp01((1 - smooth(0.15, 0.8, a)) * (1 - smooth(0, 0.45, s.hunger)) * (1 - s.dormancy)),
    ripe: smooth(0.7, 0.95, a) * (1 - clamp01(s.dormancy)),
    collapse: smooth(0.45, 0.8, s.sourness) * (1 - clamp01(s.dormancy)),
    // spot 진입 직후 mold01≈0이라 반점이 안 보임 — 예고는 보여야 예고다 (바닥값 0.25)
    mold: s.moldStage === 'none' ? 0 : Math.max(0.25, clamp01(s.mold01)),
    kahm: s.kahm ? 1 : 0,
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
    wet: n(cur.wet, target.wet),
    ripe: n(cur.ripe, target.ripe),
    collapse: n(cur.collapse, target.collapse),
    mold: n(cur.mold, target.mold),
    kahm: n(cur.kahm, target.kahm),
  };
}
