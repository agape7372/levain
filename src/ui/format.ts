// 한국어 시간·수치 포맷 — copy.ts와 짝. 내부 용어 노출 금지.
import { copy } from './copy';
import { FIRST_BREAD_STAGE, FLOAT_OK_ACTIVITY } from '../sim';
import type { BriefingKey, DoughQuality, SmellBand } from '../sim';

// 첫 빵 단계 — 그 전엔 떼어 둬도 쓸 곳이 없어 떼기를 권하지 않는다(정의는 sim/recipes)
export { FIRST_BREAD_STAGE };

/** 떼기 권유(「떼어 두기 좋아요」)를 말해도 되는 집인가 — 홈·관찰 카드·알림이 같은 기준을 쓴다 (A3-07) */
export function splitAdvised(houseStage: number): boolean {
  return houseStage >= FIRST_BREAD_STAGE;
}

/** 시큼 단계의 홈 머리 문구 키 — 냄새가 찡하거나 아세톤이면 「많이」 쪽 (A3-08) */
export function sourPhaseKey(smell: SmellBand): 'sour' | 'sourStrong' {
  return smell === 'sharp' || smell === 'acetone' ? 'sourStrong' : 'sour';
}

/** 복귀 브리핑 행 문구 — 시큼해짐은 지금 냄새 밴드로 홈 머리와 같은 세기로 말한다 (R-03). sim은 키만 낸다 */
export function briefingText(key: BriefingKey, smell: SmellBand): string {
  if (key === 'becameSour') return copy.briefing[sourPhaseKey(smell) === 'sourStrong' ? 'becameSourStrong' : 'becameSour'];
  return copy.briefing[key];
}

/** 시간 길이 말하기 — 실제보다 길게 말하지 않는다(내림). 1시간 아래 분, 10시간 아래 30분 단위, 이틀 아래 시간, 그 위 반일 단위 */
function spanText(diffMs: number): string {
  const min = Math.floor(diffMs / 60_000 + 1e-6);
  if (min < 2) return copy.time.justNow;
  if (min < 60) return copy.time.minutes(min);
  const h = min / 60;
  if (h < 10) {
    const halves = Math.floor(min / 30);
    return halves % 2 ? copy.time.hoursHalf(Math.floor(halves / 2)) : copy.time.hours(halves / 2);
  }
  if (h < 48) return copy.time.hours(Math.floor(h));
  const halfDays = Math.floor(h / 12);
  return halfDays % 2 ? copy.time.daysHalf(Math.floor(halfDays / 2)) : copy.time.days(halfDays / 2);
}

/** "11시간" / "40분" / "방금" — 상대 경과 */
export function agoText(fromMs: number, nowMs: number): string {
  return spanText(Math.max(0, nowMs - fromMs));
}

/** 미래 시각 안내 — "오늘 저녁 7시쯤" 수준의 담백함 대신 v1은 "N시간 뒤" */
export function untilText(atMs: number, nowMs: number): string {
  const diff = atMs - nowMs;
  return diff <= 0 ? copy.time.justNow : spanText(diff);
}

/**
 * 피크 범위의 양 끝 — 30분 단위 반올림. 끝을 내림하면 밥 직후 5초만 지나도 「4시간~5시간 반」(실제 4.5~6h)이 되어
 * 범위가 30분 동안 틀리게 읽힌다(R-04). 범위는 예보라 반올림이 정직하다. 15분 아래는 분 문구 그대로.
 */
export function peakUntilText(atMs: number, nowMs: number): string {
  const diff = atMs - nowMs;
  const HALF = 30 * 60_000;
  return diff >= HALF / 2 ? spanText(Math.round(diff / HALF) * HALF) : untilText(atMs, nowMs);
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
  // 1e-9 여유 — 로트 g 가중 평균이 0.7을 0.6999…로 내려 밴드가 바뀌지 않게(sim gradeOf와 같은 방식)
  if (activity + 1e-9 >= FLOAT_OK_ACTIVITY) return 'high';
  if (activity + 1e-9 >= 0.4) return 'mid';
  return 'low';
}

/** 산미 밴드 — GDD §3-5 냄새 구간과 같은 경계(35 밀가루·요거트 / 60 식초) */
export function acidityBand(acidity: number): AcidityBand {
  if (acidity + 1e-9 < 35) return 'mild';
  if (acidity + 1e-9 < 60) return 'tangy';
  return 'sour';
}

/** 레시피 상태 줄 오른쪽 캡션 — 두 어절('발효력 좋음 · 순함'). 통이 비면 안내 한 줄 */
export function pantryQualityText(q: DoughQuality | null): string {
  if (q === null) return copy.pantry.emptyHint;
  return `${copy.pantry.quality.activity[activityBand(q.activity)]} · ${copy.pantry.quality.acidity[acidityBand(q.acidity)]}`;
}
