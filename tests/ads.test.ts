// 보상형 광고 상한·원장 — 정본: 확장기획 §10. sim/ads.ts는 순수 산수만 안다.
import { describe, it, expect } from 'vitest';
import { adCountsToday, adRemaining, canWatchAd, recordAdGrant, sameLocalDay, DAY } from '../src/sim';
import type { AdGrant } from '../src/sim';

function local(y: number, mo: number, d: number, h: number, mi: number): number {
  return new Date(y, mo, d, h, mi, 0, 0).getTime();
}

describe('sameLocalDay', () => {
  it('같은 날 23:59와 00:00은 다른 날', () => {
    const a = local(2024, 0, 15, 23, 59);
    const b = local(2024, 0, 16, 0, 0);
    expect(sameLocalDay(a, b)).toBe(false);
  });

  it('같은 날 아침·저녁은 같은 날', () => {
    expect(sameLocalDay(local(2024, 0, 15, 6, 0), local(2024, 0, 15, 22, 0))).toBe(true);
  });
});

describe('canWatchAd / adRemaining — 슬롯 상한 + 전체 상한', () => {
  it('빈 원장: delivery 3회 남음, ok', () => {
    const now = local(2024, 0, 15, 12, 0);
    expect(canWatchAd([], now, 'delivery')).toBe('ok');
    expect(adRemaining([], now, 'delivery')).toBe(3);
  });

  it('미지 슬롯은 unknownSlot — 아직 열리지 않은 슬롯(회복·힌트·건조가속)', () => {
    const now = local(2024, 0, 15, 12, 0);
    expect(canWatchAd([], now, 'recovery')).toBe('unknownSlot');
    expect(adRemaining([], now, 'recovery')).toBe(0);
  });

  it('오늘 delivery 3회 소진 → slotCap', () => {
    const now = local(2024, 0, 15, 12, 0);
    const ledger: AdGrant[] = [
      { slot: 'delivery', at: now - 1000 },
      { slot: 'delivery', at: now - 2000 },
      { slot: 'delivery', at: now - 3000 },
    ];
    expect(canWatchAd(ledger, now, 'delivery')).toBe('slotCap');
    expect(adRemaining(ledger, now, 'delivery')).toBe(0);
  });

  it('어제 3회는 오늘 상한에 영향 없음 — 하루 = 로컬 자정 경계', () => {
    const yesterday = local(2024, 0, 14, 23, 0);
    const now = local(2024, 0, 15, 1, 0);
    const ledger: AdGrant[] = [
      { slot: 'delivery', at: yesterday },
      { slot: 'delivery', at: yesterday },
      { slot: 'delivery', at: yesterday },
    ];
    expect(canWatchAd(ledger, now, 'delivery')).toBe('ok');
    expect(adRemaining(ledger, now, 'delivery')).toBe(3);
  });

  it('전체 하루 상한(5) 도달 → dailyCap (슬롯 자체는 미소진이어도)', () => {
    const now = local(2024, 0, 15, 12, 0);
    // delivery만 있는 카탈로그라 5회를 채우려면 슬롯 상한(3)을 넘겨야 하니
    // 여기선 임의 다른 슬롯 문자열로 총량만 채운 시나리오(멱등 원장은 슬롯명을 신뢰하지 않는다는 것도 검증)
    const ledger: AdGrant[] = Array.from({ length: 5 }, (_, i) => ({ slot: `x${i}`, at: now - i * 1000 }));
    expect(canWatchAd(ledger, now, 'delivery')).toBe('dailyCap');
  });
});

describe('recordAdGrant — 지급 기록 + 보존기간 정리', () => {
  it('기록 추가 후 카운트 반영', () => {
    const now = local(2024, 0, 15, 12, 0);
    const ledger = recordAdGrant([], now, 'delivery');
    expect(ledger.length).toBe(1);
    expect(adCountsToday(ledger, now).total).toBe(1);
  });

  it('8일 지난 줄은 정리(보존 7일), 최근 줄은 유지', () => {
    const now = local(2024, 0, 15, 12, 0);
    const old: AdGrant = { slot: 'delivery', at: now - 8 * DAY };
    const recent: AdGrant = { slot: 'delivery', at: now - 1 * DAY };
    const ledger = recordAdGrant([old, recent], now, 'delivery');
    expect(ledger.some((g) => g.at === old.at)).toBe(false);
    expect(ledger.some((g) => g.at === recent.at)).toBe(true);
  });
});
