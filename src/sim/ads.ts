// 보상형 광고 상한·원장 계산(순수) — 정본: 확장기획 §10.
// 전부 사용자 선택형(opt-in)이고, 여기는 "오늘 몇 번 남았나"의 산수만 안다.
// SDK·노출·세션 상한은 platform/ui 소관 — sim은 광고가 뭔지 모른다(원장 항목일 뿐).
import { AD_LEDGER_KEEP_D, AD_SLOT_DAILY, AD_TOTAL_DAILY, DAY } from './constants';

/** 지급 원장 한 줄 — 같은 노출 중복 지급 0의 근거 (확장기획 §10 멱등성) */
export interface AdGrant {
  slot: string;
  at: number;
}

export type AdSlotId = keyof typeof AD_SLOT_DAILY;

/** "하루" = 기기 로컬 자정 경계 — 조용시간과 같은 로컬 시각 기준 */
export function sameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function adCountsToday(ledger: AdGrant[], now: number): { total: number; bySlot: Record<string, number> } {
  const bySlot: Record<string, number> = {};
  let total = 0;
  for (const g of ledger) {
    if (!sameLocalDay(g.at, now)) continue;
    total += 1;
    bySlot[g.slot] = (bySlot[g.slot] ?? 0) + 1;
  }
  return { total, bySlot };
}

/** 슬롯 잔여 판정 — 'ok'가 아니면 사유. 미지의 슬롯은 아직 열리지 않은 것으로 본다 */
export function canWatchAd(ledger: AdGrant[], now: number, slot: string): 'ok' | 'slotCap' | 'dailyCap' | 'unknownSlot' {
  const daily = AD_SLOT_DAILY[slot as AdSlotId];
  if (daily === undefined) return 'unknownSlot';
  const c = adCountsToday(ledger, now);
  if (c.total >= AD_TOTAL_DAILY) return 'dailyCap';
  if ((c.bySlot[slot] ?? 0) >= daily) return 'slotCap';
  return 'ok';
}

/** 오늘 이 슬롯에 남은 횟수 (전체 상한과 슬롯 상한 중 빡빡한 쪽) */
export function adRemaining(ledger: AdGrant[], now: number, slot: string): number {
  const daily = AD_SLOT_DAILY[slot as AdSlotId];
  if (daily === undefined) return 0;
  const c = adCountsToday(ledger, now);
  return Math.max(0, Math.min(daily - (c.bySlot[slot] ?? 0), AD_TOTAL_DAILY - c.total));
}

/** 지급 기록 — 오래된 줄은 정리(원장은 상한 산수용이지 역사책이 아니다) */
export function recordAdGrant(ledger: AdGrant[], now: number, slot: string): AdGrant[] {
  const keepAfter = now - AD_LEDGER_KEEP_D * DAY;
  return [...ledger.filter((g) => g.at >= keepAfter), { slot, at: now }];
}
