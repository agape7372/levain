// 한국어 시간·수치 포맷 — copy.ts와 짝. 내부 용어 노출 금지.
import { copy } from './copy';

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
