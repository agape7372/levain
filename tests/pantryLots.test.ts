// 보관 통 로트 원장의 순수 대수 — 정본: docs/GDD.md §6-2, src/sim/pantry.ts
// 여기는 store 없이 규칙만 본다: 어떤 조각이 뽑히고(pickDough), 어떻게 빠지고(consumeLots),
// 어떻게 합쳐지는가(pushLot). store 배선은 pantry.test.ts가 본다.
import { describe, it, expect } from 'vitest';
import {
  pickDough, consumeLots, pushLot, capLots, pantryQualityOf, lotsSum,
  recipeById, bakeScore, PANTRY_LOT_MAX,
} from '../src/sim';
import type { PantryLot } from '../src/sim';

const lot = (g: number, act: number, acid: number, flour: PantryLot['flour'] = 'white'): PantryLot =>
  ({ g, act, acid, flour });

const flatbread = recipeById('flatbread')!; // 선호 0~60, 관대
const rye = recipeById('rye')!;             // 선호 40~75, 호밀 친화
const loaf = recipeById('loaf')!;           // 선호 0~30, 보통

describe('pickDough — 이 빵에 맞는 반죽을 고른다', () => {
  it('빈 통은 null', () => {
    expect(pickDough([], flatbread, 30)).toBeNull();
  });

  it('점수가 높은 로트부터 담는다 — 오래된 순이 아니다', () => {
    const lots = [lot(100, 0.2, 30), lot(50, 1, 20)]; // 앞이 오래된 것
    const pick = pickDough(lots, flatbread, 30)!;
    expect(pick.taken).toEqual([{ index: 1, g: 30 }]);
    expect(pick.dough).toMatchObject({ activity: 1, acidity: 20 });
  });

  it('한 로트로 모자라면 다음으로 좋은 로트에서 이어 담는다 (마지막은 부분)', () => {
    const lots = [lot(100, 0.2, 30), lot(20, 1, 20)];
    const pick = pickDough(lots, flatbread, 30)!;
    expect(pick.taken).toEqual([{ index: 1, g: 20 }, { index: 0, g: 10 }]);
    // 가중 평균: (20×1 + 10×0.2)/30
    expect(pick.dough.activity).toBeCloseTo(22 / 30, 12);
    expect(pick.dough.acidity).toBeCloseTo((20 * 20 + 10 * 30) / 30, 12);
  });

  it('점수가 같으면 오래된 것(작은 index) 먼저', () => {
    const lots = [lot(30, 0.9, 20, 'rye'), lot(30, 0.9, 20, 'wholewheat')];
    expect(bakeScore(flatbread, 0.9, 20, 'rye')).toBe(bakeScore(flatbread, 0.9, 20, 'wholewheat'));
    expect(pickDough(lots, flatbread, 30)!.taken).toEqual([{ index: 0, g: 30 }]);
  });

  it('레시피가 바뀌면 뽑히는 로트도 바뀐다 — 시큼 로트는 호밀빵의 것', () => {
    const lots = [lot(100, 0.5, 10), lot(100, 0.5, 50)];
    expect(pickDough(lots, rye, 80)!.taken).toEqual([{ index: 1, g: 80 }]);
    expect(pickDough(lots, loaf, 80)!.taken).toEqual([{ index: 0, g: 80 }]);
  });

  it('호밀 밀가루 로트는 flourAffinity 가산까지 얹혀 호밀빵에 먼저 뽑힌다', () => {
    // 산미가 선호 범위(40~75) **밖**이라야 가산이 보인다 — 범위 안이면 sourFit이 이미 1이라
    // 가산이 clamp에 먹혀 두 로트 점수가 같아진다(그땐 오래된 쪽이 뽑힌다).
    const lots = [lot(80, 0.5, 30, 'white'), lot(80, 0.5, 30, 'rye')];
    expect(pickDough(lots, rye, 80)!.taken).toEqual([{ index: 1, g: 80 }]);

    const inRange = [lot(80, 0.5, 55, 'white'), lot(80, 0.5, 55, 'rye')];
    expect(pickDough(inRange, rye, 80)!.taken).toEqual([{ index: 0, g: 80 }]);
  });

  it('Σg < cost면 남은 전량으로 계산한다 (게이트가 막지만 방어)', () => {
    const lots = [lot(20, 0.4, 10)];
    const pick = pickDough(lots, flatbread, 100)!;
    expect(pick.taken).toEqual([{ index: 0, g: 20 }]);
    expect(pick.dough).toEqual(pantryQualityOf(lots));
  });

  it('cost 0이면 아무것도 집지 않고 통 전체 평균을 답한다', () => {
    const lots = [lot(20, 0, 100), lot(80, 1, 0)];
    const pick = pickDough(lots, flatbread, 0)!;
    expect(pick.taken).toEqual([]);
    expect(pick.dough).toEqual(pantryQualityOf(lots));
  });

  it('밀가루는 담은 조각 중 종류별 g 합의 최대값 — 동률이면 white > wholewheat > rye', () => {
    // 같은 점수(친화 없는 레시피)라 index 순으로 담긴다: rye 30 + wholewheat 30 → 동률 → wholewheat
    const tie = [lot(30, 0.5, 20, 'wholewheat'), lot(30, 0.5, 20, 'rye')];
    expect(pickDough(tie, flatbread, 60)!.dough.flour).toBe('wholewheat');
    // 합이 다르면 많은 쪽
    const lots = [lot(10, 0.5, 20, 'white'), lot(50, 0.5, 20, 'rye')];
    expect(pickDough(lots, flatbread, 60)!.dough.flour).toBe('rye');
  });
});

describe('consumeLots — 고른 조각만 덜어낸다', () => {
  it('부분 차감은 남기고, 0이 된 로트는 사라진다. 순서는 보존', () => {
    const lots = [lot(100, 0.2, 30), lot(20, 1, 20), lot(40, 0.7, 15)];
    const out = consumeLots(lots, [{ index: 1, g: 20 }, { index: 0, g: 10 }]);
    expect(out).toEqual([lot(90, 0.2, 30), lot(40, 0.7, 15)]);
  });

  it('아무것도 안 집으면 원장이 그대로다', () => {
    const lots = [lot(50, 0.5, 10)];
    expect(consumeLots(lots, [])).toEqual(lots);
  });

  it('굽기 왕복: pick → consume 하면 정확히 cost만큼 줄어든다', () => {
    const lots = [lot(100, 0.2, 30), lot(20, 1, 20)];
    const pick = pickDough(lots, flatbread, 30)!;
    expect(lotsSum(consumeLots(lots, pick.taken))).toBe(lotsSum(lots) - 30);
  });
});

describe('pushLot·capLots — 상한과 병합', () => {
  it('새 로트는 뒤(최신 자리)에 붙는다', () => {
    expect(pushLot([lot(10, 1, 0)], lot(20, 0.5, 40))).toEqual([lot(10, 1, 0), lot(20, 0.5, 40)]);
  });

  it('g ≤ 0은 버린다 — 자리만 차지하는 로트를 만들지 않는다', () => {
    const lots = [lot(10, 1, 0)];
    expect(pushLot(lots, lot(0, 1, 0))).toEqual(lots);
    expect(pushLot(lots, lot(-5, 1, 0))).toEqual(lots);
  });

  it('상한을 넘기면 가장 오래된 둘을 g 가중으로 병합한다 — g 손실 0', () => {
    let lots: PantryLot[] = [];
    for (let i = 0; i < PANTRY_LOT_MAX; i++) lots = pushLot(lots, lot(10, 1, 0));
    expect(lots).toHaveLength(PANTRY_LOT_MAX);

    lots = pushLot(lots, lot(10, 0, 100));
    expect(lots).toHaveLength(PANTRY_LOT_MAX);
    expect(lots[0]).toEqual(lot(20, 1, 0)); // 앞 둘이 하나로
    expect(lotsSum(lots)).toBe(10 * (PANTRY_LOT_MAX + 1));
  });

  it('병합은 act·acid를 g 가중 평균으로, flour는 g 큰 쪽으로 남긴다', () => {
    const many = [lot(30, 0, 0, 'rye'), lot(10, 1, 100, 'white')];
    for (let i = 0; i < PANTRY_LOT_MAX - 1; i++) many.push(lot(5, 0.5, 50));
    const [merged] = capLots(many);
    expect(merged.g).toBe(40);
    expect(merged.act).toBeCloseTo(10 / 40, 12);
    expect(merged.acid).toBeCloseTo(1_000 / 40, 12);
    expect(merged.flour).toBe('rye'); // 30 > 10
  });

  it('상한 이하면 병합하지 않는다', () => {
    const lots = [lot(10, 1, 0), lot(20, 0.5, 40)];
    expect(capLots(lots)).toEqual(lots);
  });
});

describe('pantryQualityOf — 통 전체 평균 (상태 줄)', () => {
  it('빈 통은 null', () => {
    expect(pantryQualityOf([])).toBeNull();
  });

  it('g 가중 평균 + 밀가루 최다', () => {
    const q = pantryQualityOf([lot(20, 0, 100, 'rye'), lot(80, 1, 0, 'white')])!;
    expect(q.activity).toBeCloseTo(0.8, 12);
    expect(q.acidity).toBeCloseTo(20, 12);
    expect(q.flour).toBe('white');
  });
});
