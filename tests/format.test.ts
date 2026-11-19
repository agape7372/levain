// 표시 헬퍼 — 날짜·통 품질 밴드 (src/ui/format.ts).
// 이 파일이 지키는 계약 3줄:
//   ① 밴드 경계는 **표시 규칙**이지 밸런스가 아니다 — 경계값 자체가 어느 쪽에 속하는지 고정한다
//   ② 활성 밴드의 상한 경계는 sim의 FLOAT_OK_ACTIVITY와 같은 선이다(띄워보기와 상태 줄이 어긋나면 안 된다)
//   ③ 통이 비면(null) 품질을 지어내지 않고 "여기 모여요" 안내로 답한다
import { describe, it, expect } from 'vitest';
import {
  acidityBand, activityBand, afterText, agoText, briefingText, dateText, FIRST_BREAD_STAGE, floatText, pantryQualityText, peakRangeText,
  peakUntilText, seasonRow, sourPhaseKey, splitAdvised, splitNow, stageUpExtras, statusKey, untilText,
} from '../src/ui/format';
import { copy } from '../src/ui/copy';
import { FLOAT_OK_ACTIVITY, REVIVE_GAP_H, SEED_G } from '../src/sim';
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
  it('1시간 아래 분은 내림값 그대로 — 59.9분은 「60분」이 아니라 59분 (R-05)', () => {
    expect(agoText(0, 59.9 * MIN)).toBe('59분');
    expect(agoText(0, 4.6 * MIN)).toBe('4분');
  });
  it('피크 범위는 30분 반올림 — 밥 직후 10초 뒤에도 「4시간 반~6시간」 (R-04)', () => {
    const fedAt = 0;
    const now = fedAt + 10_000;
    expect(peakUntilText(fedAt + 4.5 * H, now)).toBe('4시간 반');
    expect(peakUntilText(fedAt + 6 * H, now)).toBe('6시간');
    expect(peakUntilText(fedAt + 6 * H, fedAt + 29 * MIN)).toBe('5시간 반');
    expect(peakUntilText(20 * MIN, 0)).toBe('30분');
    expect(peakUntilText(10 * MIN, 0)).toBe('10분');
    expect(peakUntilText(0, 5)).toBe(copy.time.soon);
  });
  it('분 단위와 방금은 그대로 — 미래는 「방금」이 아니라 「곧」 (L1)', () => {
    expect(agoText(0, 1 * MIN)).toBe(copy.time.justNow);
    expect(agoText(0, 40 * MIN)).toBe('40분');
    expect(untilText(0, 5)).toBe(copy.time.soon);
  });
});

describe('복귀 브리핑 시큼해짐 — 홈 머리와 같은 세기 (R-03)', () => {
  it('찡하거나 아세톤이면 「많이」, 그 밑이면 「조금」 · 다른 키는 그대로', () => {
    expect(briefingText('becameSour', 'vinegar')).toBe(copy.briefing.becameSour);
    expect(briefingText('becameSour', 'sharp')).toBe(copy.briefing.becameSourStrong);
    expect(briefingText('becameSour', 'acetone')).toBe(copy.briefing.becameSourStrong);
    expect(briefingText('becameHungry', 'acetone')).toBe(copy.briefing.becameHungry);
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

describe('관찰 카드 「이 시기」 행 — 활발 · 배고픔이고 곰팡이 기미가 없을 때만 (B-H1 · H1)', () => {
  it('가짜 부풀기 「정상이에요」: 휴면 · 시큼 · 반점이 겹치면 말하지 않는다', () => {
    const base = { fakeRise: true, stage: 0, phase: 'active', moldStage: 'none' } as const;
    expect(seasonRow(base)).toBe('fakeRise');
    expect(seasonRow({ ...base, phase: 'hungry' })).toBe('fakeRise');
    expect(seasonRow({ ...base, phase: 'dormant' })).toBeNull();
    expect(seasonRow({ ...base, phase: 'sour' })).toBeNull();
    expect(seasonRow({ ...base, moldStage: 'spot' })).toBeNull();
    expect(seasonRow({ ...base, fakeRise: false })).toBeNull();
  });
  it('잠잠기 「속에서 자라는 중」도 같은 게이트 — 반점 · 번짐 · 휴면 · 시큼 옆엔 없다', () => {
    const base = { fakeRise: false, stage: 1, phase: 'active', moldStage: 'none' } as const;
    expect(seasonRow(base)).toBe('quiet');
    expect(seasonRow({ ...base, phase: 'hungry' })).toBe('quiet');
    expect(seasonRow({ ...base, phase: 'dormant', moldStage: 'spot' })).toBeNull();
    expect(seasonRow({ ...base, phase: 'dormant', moldStage: 'spread' })).toBeNull();
    expect(seasonRow({ ...base, phase: 'dormant' })).toBeNull();
    expect(seasonRow({ ...base, phase: 'sour' })).toBeNull();
    expect(seasonRow({ ...base, stage: 2 })).toBeNull();
  });
});

describe('떼기 권유 시간 기준 — 홈 · 관찰 카드 · 알림이 같은 피크 밴드 (M2)', () => {
  const H = 3_600_000;
  // 1:5:5 꼴 — 피크 전에도 activity가 0.7을 넘는다
  const s = { activity: 0.8, canSplit: true, mass: 440, peakAt: 10 * H, peakEndAt: 12 * H };
  it('밴드 안이면 권한다', () => {
    expect(splitNow(s, 11 * H, 4)).toBe(true);
    expect(floatText(s, 10 * H, 4)).toBe(copy.observe.floatOk);
  });
  it('밴드 전이라도 이미 뗄 수 있으면 「동동 떠요」 — 통이 잠금 풀린 채 「곧」이라 하지 않는다 (N-M1)', () => {
    expect(splitNow(s, 9 * H, 4)).toBe(false);
    expect(floatText(s, 9 * H, 4)).toBe(copy.observe.floatPlain);
  });
  it('밴드 전이고 아직 못 떼면 「곧」', () => {
    expect(floatText({ ...s, canSplit: false }, 9 * H, 4)).toBe(copy.observe.floatSoon);
  });
  it('밴드가 지나면 권하지 않는다 — 홈은 배고픔 예보로 넘어간다', () => {
    expect(splitNow(s, 12 * H, 4)).toBe(false);
    expect(floatText(s, 12 * H, 4)).toBe(copy.observe.floatPlain);
  });
  it('기존 갈래는 그대로 — 가라앉음 · 빵 전 집 · 씨앗뿐 · 아직 못 떼는 한창때', () => {
    expect(floatText({ ...s, activity: FLOAT_OK_ACTIVITY - 0.01 }, 11 * H, 4)).toBe(copy.observe.floatNotYet);
    expect(floatText(s, 11 * H, FIRST_BREAD_STAGE - 1)).toBe(copy.observe.floatPlain);
    expect(splitNow(s, 11 * H, FIRST_BREAD_STAGE - 1)).toBe(false);
    expect(floatText({ ...s, canSplit: false, mass: SEED_G }, 11 * H, 4)).toBe(copy.observe.floatPlain);
    expect(floatText({ ...s, canSplit: false }, 11 * H, 4)).toBe(copy.observe.floatSoon);
  });
});

describe('미래 2분 안은 「곧」 — 문장 틀에 맞게 (L1)', () => {
  const H = 3_600_000;
  const MIN = 60_000;
  it('untilText: 2분 아래 「곧」, 2분부터 분. 과거는 「방금」 그대로', () => {
    expect(untilText(MIN, 0)).toBe(copy.time.soon);
    expect(untilText(1.98 * MIN, 0)).toBe(copy.time.soon);
    expect(untilText(2 * MIN, 0)).toBe('2분');
    expect(agoText(0, MIN)).toBe(copy.time.justNow);
  });
  it('「곧 뒤쯤」 · 「방금 뒤쯤」이 나오지 않는다', () => {
    expect(copy.observe.nextFeed(afterText(MIN, 0))).toBe('곧 배고파질 거예요');
    expect(copy.observe.nextFeed(afterText(3 * H, 0))).toBe('3시간 뒤쯤 배고파질 거예요');
    expect(copy.diagnosis.moldDeadline(afterText(MIN, 0))).toBe('이대로 두면 곧 곰팡이가 펴요');
    expect(copy.split.blockedTooSoon(afterText(MIN, 0))).toBe('밥 준 지 얼마 안 됐어요. 곧 떼어낼 수 있어요');
    expect(peakRangeText(MIN, 2 * H, 0)).toBe(copy.observe.peakSoon);
    expect(peakRangeText(4.5 * H, 6 * H, 10_000)).toBe('4시간 반~6시간 뒤쯤 가장 부풀어요');
    for (const t of [afterText(MIN, 0), peakRangeText(MIN, 2 * H, 0)]) {
      expect(t).not.toContain('방금');
      expect(t).not.toContain('곧 뒤');
    }
  });
});

describe('승급 카드 개체 해금 줄 — 활성 통 기준 (H2 · M1)', () => {
  const ok = { stage: 3, phase: 'active', moldStage: 'none' } as const;
  it('활성 통이 그 단계에 닿았고 건강하면 냉장 · 말려두기 · 비율을 말한다', () => {
    expect(stageUpExtras([3], ok, false)).toEqual([
      copy.celebrate.fridgeUnlocked, copy.celebrate.flakeUnlocked, copy.celebrate.ratioUnlocked('1:2:2'),
    ]);
  });
  it('곰팡이 낀 통(사망 · 반점 · 번짐)이면 개체 줄을 빼고 집 단위만', () => {
    expect(stageUpExtras([3], { ...ok, phase: 'moldy', moldStage: 'dead' }, false)).toEqual([]);
    expect(stageUpExtras([3], { ...ok, phase: 'dormant', moldStage: 'spot' }, false)).toEqual([]);
    expect(stageUpExtras([1], { stage: 1, phase: 'dormant', moldStage: 'spread' }, false)).toEqual([]);
    expect(stageUpExtras([3], { ...ok, phase: 'moldy', moldStage: 'dead' }, true)).toEqual([copy.celebrate.stageUp(copy.stage.names[3])]);
  });
  it('다른 통이 집 단계를 올렸으면(활성 통 단계 < 해금 단계) 개체 줄 없음', () => {
    expect(stageUpExtras([3], { ...ok, stage: 0 }, false)).toEqual([]);
    expect(stageUpExtras([4], ok, false)).toEqual([]);
  });
  it('잠잠기 안내는 활성 통이 지금 잠잠기이고 건강할 때만', () => {
    expect(stageUpExtras([1], { ...ok, stage: 1 }, false)).toEqual([copy.stage.quiet]);
    expect(stageUpExtras([1, 2], { ...ok, stage: 2 }, false)).not.toContain(copy.stage.quiet);
    expect(stageUpExtras([1], { ...ok, stage: 1, phase: 'sour' }, false)).not.toContain(copy.stage.quiet);
  });
});

describe('홈 머리 — 부활 중 곰팡이면 「깨어나는 중」 대신 반점 (S-M1)', () => {
  const s = { phase: 'dormant', dormancy: 0.6, moldStage: 'none', smell: 'flour', peakAt: 0, peakEndAt: 0 } as const;
  it('반점 · 번짐이면 곰팡이 문구', () => {
    expect(statusKey(s, 0)).toBe('reviving');
    expect(statusKey({ ...s, moldStage: 'spot' }, 0)).toBe('moldSpot');
    expect(statusKey({ ...s, moldStage: 'spread' }, 0)).toBe('moldSpread');
  });
  it('휴면이어도 반점 · 번짐이면 곰팡이 문구 — 완전 휴면(dormancy 1)도 (N-L3)', () => {
    const d = { ...s, dormancy: 1 } as const;
    expect(statusKey(d, 0)).toBe('dormant');
    expect(statusKey({ ...d, moldStage: 'spot' }, 0)).toBe('moldSpot');
    expect(statusKey({ ...d, moldStage: 'spread' }, 0)).toBe('moldSpread');
  });
  it('나머지 갈래는 그대로 — 한창때 = 피크 밴드', () => {
    const H = 3_600_000;
    const a = { ...s, phase: 'active', dormancy: 0, peakAt: 4 * H, peakEndAt: 6 * H } as const;
    expect(statusKey(a, 5 * H)).toBe('peak');
    expect(statusKey(a, 6 * H)).toBe('active');
    expect(statusKey({ ...s, phase: 'sour', smell: 'sharp' }, 0)).toBe('sourStrong');
    expect(statusKey({ ...s, dormancy: 1 }, 0)).toBe('dormant');
  });
});

describe('부활 1회차 안내 시간 = 2회차 게이트 · 알림 (L3)', () => {
  it('「N시간쯤 뒤」의 N이 REVIVE_GAP_H다', () => {
    expect(copy.revive.started).toContain(`${REVIVE_GAP_H}시간쯤`);
  });
});
