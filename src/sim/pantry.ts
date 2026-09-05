// 보관 통 로트 원장의 순수 대수 — 정본: docs/GDD.md §6-2 (개정 2026-09-05).
// sim은 통을 소유하지 않는다(저장은 store의 shared.pantryLots). 여기 있는 것은 **규칙**뿐이고
// 상태는 인자로만 들어온다 — sim/ads.ts가 광고 원장에 대해 하는 일과 같은 선례다.
//
// 왜 로트인가: 통을 평균 한 덩이로 뭉개면 "언제 떼었는지"가 사라진다. 덩이의 줄로 두면
// 뗀 순간이 그대로 보관되고, 굽기는 그중에서 **이 빵에 가장 잘 맞는 반죽을 골라 쓴다**.
//
// 왜 FIFO가 아닌가(2026-09-05 반론 반영): 오래된 것부터 강제로 내보내면 두 가지가 죽는다.
//  ① 산미 조준 — 시큼해진 로트는 호밀빵의 적기인데(GDD §6-2 "시큼의 구원") FIFO는 그걸
//     식빵에 먼저 태워 버린다. 시큼 로트를 위해 통을 비워 둘 방법이 없어진다.
//  ② 통제감 — 지친 로트 하나가 앞에 있으면 더 좋은 반죽이 뒤에 있어도 다음 빵이 납작해진다.
//     플레이어가 손쓸 수 없는 벌이고, "잘 떼어 뒀다"는 보상이 한 판 늦게 도착한다.
// best-fit은 제빵사의 실제 판단과도 맞는다: 반죽통을 열어 보고 오늘 구울 빵에 맞는 걸 쓴다.
import type { DoughQuality, Flour, PantryLot, RecipeDef } from './types';
import { ACID_MAX, PANTRY_LOT_MAX } from './constants';
import { clamp } from './derive';
import { bakeScore } from './recipes';

/** 동률 밀가루 우선순위 — 판정이 로트 순회 순서에 흔들리지 않게 못 박는다 */
const FLOUR_ORDER: readonly Flour[] = ['white', 'wholewheat', 'rye'];

/** 원장 총 그램 — store의 shared.pantry(미러)가 항상 이 값이어야 한다 */
export const lotsSum = (lots: readonly PantryLot[]): number => lots.reduce((s, l) => s + l.g, 0);

/** 조각 묶음의 g 가중 평균 — 밀가루는 종류별 g 합의 최대값 */
function averageOf(parts: ReadonlyArray<{ lot: PantryLot; g: number }>): DoughQuality | null {
  let total = 0;
  let act = 0;
  let acid = 0;
  const byFlour: Record<Flour, number> = { white: 0, wholewheat: 0, rye: 0 };
  for (const { lot, g } of parts) {
    total += g;
    act += lot.act * g;
    acid += lot.acid * g;
    byFlour[lot.flour] += g;
  }
  if (total <= 0) return null;
  let flour: Flour = 'white';
  for (const f of FLOUR_ORDER) if (byFlour[f] > byFlour[flour]) flour = f;
  return { activity: clamp(act / total, 0, 1), acidity: clamp(acid / total, 0, ACID_MAX), flour };
}

/** 통 전체의 g 가중 평균 — 레시피 상태 줄 표시용. 빈 통은 null */
export const pantryQualityOf = (lots: readonly PantryLot[]): DoughQuality | null =>
  averageOf(lots.map((lot) => ({ lot, g: lot.g })));

/** 굽기에 쓸 조각 — index는 원장 위치, g는 그 로트에서 떼어 갈 양 */
export interface DoughPick {
  taken: Array<{ index: number; g: number }>;
  /** taken의 g 가중 평균 = 이 빵의 판정 입력 */
  dough: DoughQuality;
}

/**
 * 이 레시피에 가장 잘 맞는 반죽을 cost만큼 고른다 — 로트별 `bakeScore` 내림차순,
 * 동률이면 오래된 것(작은 index)부터. 마지막 로트는 부분만 떼어 간다.
 *
 * 반환된 `taken`은 판정(dough)과 소비(consumeLots)가 **같은 선택**을 쓰도록 하는 유일한 통로다:
 * 점수를 두 번 계산하면 시트가 예고한 반죽과 실제로 나간 반죽이 갈린다.
 *
 * Σg < cost면 남은 전량으로 계산한다(통 게이트가 먼저 막지만 방어).
 * cost ≤ 0(원가 없는 레시피·조회)이면 통 전체 평균을 답하고 아무것도 집지 않는다.
 * 빈 통은 null.
 */
export function pickDough(
  lots: readonly PantryLot[],
  recipe: RecipeDef,
  cost: number,
): DoughPick | null {
  if (lots.length === 0) return null;

  const need0 = Math.max(0, Math.round(cost));
  if (need0 === 0) {
    const dough = pantryQualityOf(lots);
    return dough === null ? null : { taken: [], dough };
  }

  const ranked = lots
    .map((lot, index) => ({ index, lot, score: bakeScore(recipe, lot.act, lot.acid, lot.flour) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const taken: Array<{ index: number; g: number }> = [];
  const parts: Array<{ lot: PantryLot; g: number }> = [];
  let need = need0;
  for (const { index, lot } of ranked) {
    if (need <= 0) break;
    const g = Math.min(lot.g, need);
    if (g <= 0) continue;
    taken.push({ index, g });
    parts.push({ lot, g });
    need -= g;
  }

  const dough = averageOf(parts);
  return dough === null ? null : { taken, dough };
}

/**
 * 앞(오래된 것)부터 g만큼 버린다 — **굽기 규칙이 아니다**. 굽기는 pickDough가 고른다.
 * 여기 오래된 것부터인 이유는 "어느 반죽을 버릴지" 규칙이 필요한 두 자리 때문이다:
 * 저장 정합(미러보다 원장이 많을 때)과 개발자 주입구의 음수 g. 둘 다 버릴 대상을 고르는
 * 일이고, 가장 오래된 기억이 아까울 게 없는 쪽이다.
 */
export function trimOldest(lots: readonly PantryLot[], g: number): PantryLot[] {
  const rest: PantryLot[] = [];
  let need = Math.max(0, g);
  for (const lot of lots) {
    if (need <= 0) rest.push(lot);
    else if (lot.g <= need) need -= lot.g;
    else {
      rest.push({ ...lot, g: lot.g - need });
      need = 0;
    }
  }
  return rest;
}

/** 고른 조각을 덜어낸다 — 빈 로트는 사라지고, 남은 것의 순서(오래된 것 먼저)는 보존된다 */
export function consumeLots(
  lots: readonly PantryLot[],
  taken: ReadonlyArray<{ index: number; g: number }>,
): PantryLot[] {
  const cut = new Map<number, number>();
  for (const t of taken) cut.set(t.index, (cut.get(t.index) ?? 0) + t.g);
  const out: PantryLot[] = [];
  for (let i = 0; i < lots.length; i++) {
    const g = lots[i].g - (cut.get(i) ?? 0);
    if (g > 0) out.push({ ...lots[i], g });
  }
  return out;
}

/** 가장 오래된 둘을 g 가중으로 합친다 — 가장 흐릿해진 기억부터 뭉갠다 */
function mergeOldestTwo(lots: PantryLot[]): PantryLot[] {
  const [a, b, ...rest] = lots;
  const g = a.g + b.g;
  return [
    {
      g,
      act: (a.act * a.g + b.act * b.g) / g,
      acid: (a.acid * a.g + b.acid * b.g) / g,
      flour: a.g >= b.g ? a.flour : b.flour, // 동률이면 오래된 쪽
    },
    ...rest,
  ];
}

/** 로트 상한 강제 — 넘치면 앞에서부터 병합해 자리를 만든다(떼기를 막지 않는다) */
export function capLots(lots: PantryLot[]): PantryLot[] {
  let out = lots;
  while (out.length > PANTRY_LOT_MAX) out = mergeOldestTwo(out);
  return out;
}

/** 새 로트를 뒤(최신 자리)에 붙인다 — g ≤ 0은 정보가 없어 버린다 */
export const pushLot = (lots: readonly PantryLot[], lot: PantryLot): PantryLot[] =>
  lot.g <= 0 ? [...lots] : capLots([...lots, lot]);
