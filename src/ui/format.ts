// 한국어 시간·수치 포맷 — copy.ts와 짝. 내부 용어 노출 금지.
import { copy } from './copy';
import { FLOAT_OK_ACTIVITY } from '../sim';
import type { DoughQuality } from '../sim';

/** "11시간" / "40분" / "방금" — 상대 경과 */
export function agoText(fromMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - fromMs);
  const min = Math.round(diff / 60_000);
  if (min < 2) return copy.time.justNow;
  if (min < 60) return copy.time.minutes(min);
  const h = Math.round(min / 60);
  if (h < 48) return copy.time.hours(h);
  return copy.time.days(Math.round(h / 24));
}

/** 미래 시각 안내 — "오늘 저녁 7시쯤" 수준의 담백함 대신 v1은 "N시간 뒤" */
export function untilText(atMs: number, nowMs: number): string {
  const diff = atMs - nowMs;
  if (diff <= 0) return copy.time.justNow;
  const min = Math.round(diff / 60_000);
  if (min < 60) return copy.time.minutes(min);
  const h = Math.round(min / 60);
  if (h < 48) return copy.time.hours(h);
  return copy.time.days(Math.round(h / 24));
}

/** 절대 날짜 — '8월 26일'. 선반 타일·결과 카드의 "처음 구운 날"(연도는 말하지 않는다) */
export function dateText(ts: number): string {
  const d = new Date(ts);
  return copy.time.monthDay(d.getMonth() + 1, d.getDate());
}

// ── 통 반죽 품질 표시 밴드 (2026-09-05) ──────────────────────────────────────
// 밸런스 상수가 아니라 **표시 밴드**라 sim/constants.ts가 아니라 여기 산다: 판정에 쓰이지 않고
// 오직 문구 고르기에만 쓰인다(같은 수치라도 밴드를 나눠 부르는 방식은 UI의 결정이다).
// 활성 경계 하나만 sim에서 빌려온다 — FLOAT_OK_ACTIVITY는 "띄워보기가 뜨는 선"이라
// "발효력 좋음"과 같은 선이어야 화면끼리 어긋나지 않는다.

export type ActivityBand = 'high' | 'mid' | 'low';
export type AcidityBand = 'mild' | 'tangy' | 'sour';

/** 발효력 밴드 — 0.7 이상 좋음 / 0.4 이상 보통 / 그 아래 약함 */
export function activityBand(activity: number): ActivityBand {
  if (activity >= FLOAT_OK_ACTIVITY) return 'high';
  if (activity >= 0.4) return 'mid';
  return 'low';
}

/** 산미 밴드 — GDD §3-5 냄새 구간과 같은 경계(35 밀가루·요거트 / 60 식초) */
export function acidityBand(acidity: number): AcidityBand {
  if (acidity < 35) return 'mild';
  if (acidity < 60) return 'tangy';
  return 'sour';
}

/** 레시피 상태 줄 오른쪽 캡션 — 두 어절('발효력 좋음 · 순함'). 통이 비면 안내 한 줄 */
export function pantryQualityText(q: DoughQuality | null): string {
  if (q === null) return copy.pantry.emptyHint;
  return `${copy.pantry.quality.activity[activityBand(q.activity)]} · ${copy.pantry.quality.acidity[acidityBand(q.acidity)]}`;
}
