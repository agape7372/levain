// 표시 헬퍼 — 날짜·통 품질 밴드 (src/ui/format.ts).
// 이 파일이 지키는 계약 3줄:
//   ① 밴드 경계는 **표시 규칙**이지 밸런스가 아니다 — 경계값 자체가 어느 쪽에 속하는지 고정한다
//   ② 활성 밴드의 상한 경계는 sim의 FLOAT_OK_ACTIVITY와 같은 선이다(띄워보기와 상태 줄이 어긋나면 안 된다)
//   ③ 통이 비면(null) 품질을 지어내지 않고 "여기 모여요" 안내로 답한다
import { describe, it, expect } from 'vitest';
import { acidityBand, activityBand, agoText, dateText, FIRST_BREAD_STAGE, pantryQualityText, sourPhaseKey, splitAdvised, untilText } from '../src/ui/format';
import { copy } from '../src/ui/copy';
import { FLOAT_OK_ACTIVITY } from '../src/sim';
import type { DoughQuality } from '../src/sim';

const quality = (activity: number, acidity: number): DoughQuality =>
  ({ activity, acidity, flour: 'white' });

describe('dateText', () => {
  it('월·일만 말한다 (연도 없음)', () => {
    // 로컬 시각으로 만든 날짜라 어떤 타임존에서도 같은 월·일이 나온다
    const d = new Date(2026, 7, 26, 13, 0, 0); // 8월 26일
    expect(dateText(d.getTime())).toBe('8월 26일');
  });

  it('한 자리 월·일에 0을 붙이지 않는다', () => {
    expect(dateText(new Date(2026, 0, 3, 9, 30).getTime())).toBe('1월 3일');
  });

  it('자정 직전·직후가 서로 다른 날이다 (로컬 기준)', () => {
    const late = new Date(2026, 8, 4, 23, 59).getTime();
    const early = new Date(2026, 8, 5, 0, 1).getTime();
    expect(dateText(late)).toBe('9월 4일');
    expect(dateText(early)).toBe('9월 5일');
  });
});

describe('activityBand', () => {
  it('경계 0.7(FLOAT_OK_ACTIVITY)은 high에 속한다', () => {
    expect(FLOAT_OK_ACTIVITY).toBe(0.7);
    expect(activityBand(FLOAT_OK_ACTIVITY)).toBe('high');
    expect(activityBand(0.699)).toBe('mid');
  });

  it('경계 0.4는 mid에 속한다', () => {
    expect(activityBand(0.4)).toBe('mid');
    expect(activityBand(0.399)).toBe('low');
  });

  it('양 끝', () => {
    expect(activityBand(1)).toBe('high');
    expect(activityBand(0)).toBe('low');
  });
});

describe('acidityBand', () => {
  it('35 미만은 순함 — GDD §3-5 밀가루·요거트 구간', () => {
    expect(acidityBand(0)).toBe('mild');
    expect(acidityBand(34.9)).toBe('mild');
  });

  it('35~60 미만은 새콤 (식초 구간 직전까지)', () => {
    expect(acidityBand(35)).toBe('tangy');
    expect(acidityBand(59.9)).toBe('tangy');
  });

  it('60 이상은 시큼', () => {
    expect(acidityBand(60)).toBe('sour');
    expect(acidityBand(100)).toBe('sour');
  });
});

describe('pantryQualityText', () => {
  it('빈 통이면 품질을 지어내지 않고 안내 한 줄', () => {
    expect(pantryQualityText(null)).toBe(copy.pantry.emptyHint);
  });

  it('두 어절만 잇는다 — 문장이 아니다', () => {
    const text = pantryQualityText(quality(0.9, 10));
    expect(text).toBe('발효력 좋음 · 순함');
    // ' · '는 딱 하나 (상태 줄 오른쪽 열은 240px 미만이라 체인이 길어지면 접힌다)
    expect(text.split(' · ')).toHaveLength(2);
  });

  it('밴드마다 다른 문구를 고른다', () => {
    expect(pantryQualityText(quality(0.5, 45))).toBe('발효력 보통 · 새콤');
    expect(pantryQualityText(quality(0.1, 80))).toBe('발효력 약함 · 시큼');
  });

  it('copy 테이블에서 문구를 가져온다 (문구 정본은 copy.ts 한 파일)', () => {
    expect(pantryQualityText(quality(0.8, 20)))
      .toBe(`${copy.pantry.quality.activity.high} · ${copy.pantry.quality.acidity.mild}`);
  });
});

// A3-14 시간 말하기 — 실제보다 길게 말하지 않는다
describe('agoText · untilText', () => {
  const H = 3_600_000;
  const MIN = 60_000;
  it('10시간 아래는 30분 단위로 말한다 (4.5h → 4시간 반)', () => {
    expect(untilText(4.5 * H, 0)).toBe('4시간 반');
    expect(untilText(6 * H, 0)).toBe('6시간');
    expect(agoText(0, 2.4 * H)).toBe('2시간');
  });
  it('10시간 이상 이틀 아래는 내림 시간', () => {
    expect(agoText(0, 11.9 * H)).toBe('11시간');
  });
  it('이틀 이상은 반일 단위 내림 — 60h는 2일 반, 3일로 올리지 않는다', () => {
    expect(agoText(0, 60 * H)).toBe('2일 반');
    expect(agoText(0, 72 * H)).toBe('3일');
    expect(agoText(0, 59 * H)).toBe('2일');
  });
  it('분 단위와 방금은 그대로', () => {
    expect(agoText(0, 1 * MIN)).toBe(copy.time.justNow);
    expect(agoText(0, 40 * MIN)).toBe('40분');
    expect(untilText(0, 5)).toBe(copy.time.justNow);
  });
});

describe('떼기 권유 게이트 · 시큼 머리 문구 (A3-07 · A3-08)', () => {
  it('첫 빵 단계 전에는 떼기를 권하지 않는다', () => {
    expect(splitAdvised(FIRST_BREAD_STAGE - 1)).toBe(false);
    expect(splitAdvised(FIRST_BREAD_STAGE)).toBe(true);
  });
  it('찡하거나 아세톤 냄새면 「많이 시큼」', () => {
    expect(sourPhaseKey('vinegar')).toBe('sour');
    expect(sourPhaseKey('sharp')).toBe('sourStrong');
    expect(sourPhaseKey('acetone')).toBe('sourStrong');
    expect(copy.phase.sourStrong).toBe('많이 시큼해졌어요');
  });
  it('알림은 단계와 무관하게 떼기를 권하지 않고, 첫 주 알림은 미래형이다', () => {
    expect(copy.notify.peak).not.toContain('떼어');
    expect(copy.notify.firstWeek).not.toContain('부풀었어요');
  });
  it('1:2:2 힌트는 시간을 단정하지 않는다 (배고픔 20h)', () => {
    expect(copy.feed.ratioHint['1:2:2']).not.toContain('하루짜리');
  });
});
