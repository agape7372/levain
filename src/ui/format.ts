// 한국어 시간·수치 포맷 — copy.ts와 짝. 내부 용어 노출 금지.
import { copy } from './copy';
import { FIRST_BREAD_STAGE, FLAKE_STAGE, FLOAT_OK_ACTIVITY, FLOUR_STAGE, FRIDGE_STAGE, LABEL_STAGE, RATIOS, SEED_G, SPLIT_MIN_G } from '../sim';
import type { BriefingKey, DoughQuality, SmellBand, Snapshot } from '../sim';

// 첫 빵 단계 — 그 전엔 떼어 둬도 쓸 곳이 없어 떼기를 권하지 않는다(정의는 sim/recipes)
export { FIRST_BREAD_STAGE };

/** 떼기 권유(「떼어 두기 좋아요」)를 말해도 되는 집인가 — 홈·관찰 카드·알림이 같은 기준을 쓴다 (A3-07) */
export function splitAdvised(houseStage: number): boolean {
  return houseStage >= FIRST_BREAD_STAGE;
}

/** 한창때 = 피크 밴드(peakAt ≤ now < peakEndAt) — 홈 머리 · 관찰 카드 · 알림(밴드 시작)이 같은 시간 축 (M2) */
export function inPeakBand(s: Pick<Snapshot, 'peakAt' | 'peakEndAt'>, now: number): boolean {
  return now >= s.peakAt && now < s.peakEndAt;
}

/** 지금 「떼어 두기 좋아요」라고 권하는가 — 한창때 · 뗄 수 있음 · 빵이 열린 집. 홈 둘째 줄과 관찰 카드 띄워보기가 이 하나를 쓴다 (M2) */
export function splitNow(s: Pick<Snapshot, 'canSplit' | 'peakAt' | 'peakEndAt'>, now: number, houseStage: number): boolean {
  return s.canSplit && inPeakBand(s, now) && splitAdvised(houseStage);
}

/** 관찰 카드 띄워보기 행 — 뜨면 한창때에만 떼기를 권하고, 한창때 전(또는 아직 못 뗌)은 「곧」, 지나면 「동동 떠요」만 */
export function floatText(
  s: Pick<Snapshot, 'activity' | 'canSplit' | 'mass' | 'peakAt' | 'peakEndAt'>, now: number, houseStage: number,
): string {
  if (s.activity < FLOAT_OK_ACTIVITY) return copy.observe.floatNotYet;
  if (splitNow(s, now, houseStage)) return copy.observe.floatOk;
  // 씨앗뿐이면 뗄 몫이 없다 · 빵 전 집은 권하지 않는다(A3-07) · 한창때가 지났으면 「곧」이 거짓말이다
  if (!splitAdvised(houseStage) || s.mass - SEED_G < SPLIT_MIN_G || now >= s.peakEndAt) return copy.observe.floatPlain;
  return copy.observe.floatSoon;
}

/** 홈 머리 문구 키. 한창때 = 피크 밴드. 부활 중(휴면이 덜 깬 채)이라도 반점이 생겼으면 「깨어나는 중」 대신 반점을 말한다 (S-M1) */
export function statusKey(
  s: Pick<Snapshot, 'phase' | 'dormancy' | 'moldStage' | 'smell' | 'peakAt' | 'peakEndAt'>, now: number,
): keyof typeof copy.phase {
  if (s.phase === 'active') return inPeakBand(s, now) ? 'peak' : 'active';
  if (s.phase === 'dormant' && s.dormancy < 1) {
    if (s.moldStage === 'spot') return 'moldSpot';
    if (s.moldStage === 'spread') return 'moldSpread';
    return 'reviving';
  }
  if (s.phase === 'sour') return sourPhaseKey(s.smell);
  return s.phase;
}

type Health = Pick<Snapshot, 'phase' | 'moldStage'>;
/** 활발 · 배고픔이고 곰팡이 기미가 없는 통 — 「정상이에요」 · 「속에서 자라는 중」 같은 안심 말의 공통 게이트 */
function calm(s: Health): boolean {
  return s.moldStage === 'none' && (s.phase === 'active' || s.phase === 'hungry');
}

/** 관찰 카드 「이 시기」 행 — 가짜 부풀기 · 잠잠기 둘 다 calm일 때만. 휴면 · 시큼 · 반점 옆에 안심 말을 하지 않는다 (B-H1 · H1) */
export function seasonRow(s: Health & Pick<Snapshot, 'fakeRise' | 'stage'>): 'fakeRise' | 'quiet' | null {
  if (!calm(s)) return null;
  if (s.fakeRise) return 'fakeRise';
  return s.stage === 1 ? 'quiet' : null;
}

/**
 * 승급 카드의 부수 해금 줄 (GDD §4 획득 연출). 새로 열린 빵은 집 단위라 카드가 따로 말한다.
 * 냉장 · 말려두기 · 가루 · 비율 · 이름표는 **개체** 단계로 잠기므로 활성 통이 그 단계에 닿았을 때만,
 * 곰팡이가 낀 통이면 하나도 말하지 않는다(H2 · M1). 잠잠기 안내는 활성 통이 지금 잠잠기이고 calm일 때만.
 * withTitles = 재료 제목 카드 — 승급 이름 줄(집 단위)을 앞에 붙인다.
 */
export function stageUpExtras(stages: number[], active: Health & Pick<Snapshot, 'stage'>, withTitles: boolean): string[] {
  const own = active.moldStage === 'none' && active.phase !== 'moldy';
  const out: string[] = [];
  for (const s of stages) {
    if (withTitles) out.push(copy.celebrate.stageUp(copy.stage.names[s]));
    if (!own || active.stage < s) continue;
    if (s === 1 && active.stage === 1 && calm(active)) out.push(copy.stage.quiet);
    if (s === FRIDGE_STAGE) out.push(copy.celebrate.fridgeUnlocked);
    if (s === FLAKE_STAGE) out.push(copy.celebrate.flakeUnlocked);
    if (s === FLOUR_STAGE) out.push(copy.celebrate.flourUnlocked);
    for (const [ratio, def] of Object.entries(RATIOS)) if (def.stage === s && s > 0) out.push(copy.celebrate.ratioUnlocked(ratio));
    if (s === LABEL_STAGE) out.push(copy.stage.labelUnlocked);
  }
  return out;
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

/** 이 안의 미래는 「곧」 — spanText가 2분 아래를 「방금」(과거형)으로 말하는 경계와 같다 (L1) */
const SOON_MS = 2 * 60_000;

/** 미래 시각 안내 — "오늘 저녁 7시쯤" 수준의 담백함 대신 v1은 "N시간". 2분 안이면 「곧」 */
export function untilText(atMs: number, nowMs: number): string {
  const diff = atMs - nowMs;
  return diff < SOON_MS ? copy.time.soon : spanText(diff);
}

/** 문장에 넣는 미래 — 「3시간 뒤쯤」, 2분 안이면 「곧」 하나. 「곧 뒤쯤」이 되지 않게 문장 틀은 이 말을 그대로 받는다 (L1) */
export function afterText(atMs: number, nowMs: number): string {
  return atMs - nowMs < SOON_MS ? copy.time.soon : copy.observe.after(untilText(atMs, nowMs));
}

/** 피크 예보 문장 — 「4시간 반~6시간 뒤쯤 가장 부풀어요」. 시작이 2분 안이면 「곧 한창때예요」 (L1) */
export function peakRangeText(peakAt: number, peakEndAt: number, nowMs: number): string {
  if (peakAt - nowMs < SOON_MS) return copy.observe.peakSoon;
  return copy.observe.peak(peakUntilText(peakAt, nowMs), peakUntilText(peakEndAt, nowMs));
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
