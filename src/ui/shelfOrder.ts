// 선반 정렬 — 구운 빵을 **종류별로** 묶는다 (2026-09-05 사용자 판정: "종류별로 정렬시켜야지 선반은").
//
// 이전 판은 `firstAt` 내림차순(최근 구운 순)이었다. 도감이 차오르면 같은 빵의 변형이 굽는 순서대로
// 흩어져 "깜빠뉴가 어디까지 있더라"를 훑을 수 없다 — 선반은 시간 순서가 아니라 **진열**이다.
//
// 순서 규칙 두 줄:
//   ① 묶음 = 베이스 레시피, 카탈로그 순(RECIPES 배열 = 해금 순서라 자연스럽게 쉬운 빵부터).
//   ② 묶음 안 = 기본 빵 먼저, 그다음 변형은 **빵 시트의 재료 칩과 같은 순서**(rulesForBase).
//      두 화면이 같은 순서를 쓰면 시트에서 본 자리가 선반에서도 같은 자리다.
//
// DOM을 모른다 — 이 파일이 순수해야 vitest(node 환경)가 순서를 직접 검증할 수 있다.
import { RECIPES, recipeById, ruleByVariantId, rulesForBase, variantIdOf } from '../sim';
import type { CollectionEntry } from '../sim';

export interface ShelfItem {
  /** 도감 키 — 베이스 id 또는 `base--ing-form` 변형 id */
  key: string;
  baseId: string;
  /** 기본 빵(변형 아님) */
  isBase: boolean;
}

export interface ShelfGroup {
  baseId: string;
  items: ShelfItem[];
}

/**
 * 도감을 종류별 묶음으로 — 발견한 것만, 위 순서 규칙대로.
 * 카탈로그에서 사라진 키(옛 저장본의 잔존 변형)는 그릴 이름이 없으니 조용히 버린다.
 */
export function shelfGroups(collection: Record<string, CollectionEntry>): ShelfGroup[] {
  const baseOrder = new Map<string, number>(RECIPES.map((r, i) => [r.id, i]));
  // 변형의 묶음 내 순서 = 시트 칩 순서. 규칙표를 한 번만 훑어 색인해 둔다
  const variantOrder = new Map<string, number>();
  for (const recipe of RECIPES) {
    rulesForBase(recipe.id).forEach((rule, i) => variantOrder.set(variantIdOf(rule), i));
  }

  const rows: Array<ShelfItem & { rank: number; sub: number }> = [];
  for (const key of Object.keys(collection)) {
    if (recipeById(key)) {
      rows.push({ key, baseId: key, isBase: true, rank: baseOrder.get(key) ?? 999, sub: -1 });
      continue;
    }
    const rule = ruleByVariantId(key);
    if (!rule) continue; // 카탈로그 밖 — 이름을 만들 수 없다
    rows.push({
      key,
      baseId: rule.baseRecipeId,
      isBase: false,
      rank: baseOrder.get(rule.baseRecipeId) ?? 999,
      // 규칙표에 없는 변형(비노출 등급)은 묶음 끝으로 — 순서만 정하고 버리지는 않는다
      sub: variantOrder.get(key) ?? 998,
    });
  }
  rows.sort((a, b) => a.rank - b.rank || a.sub - b.sub || a.key.localeCompare(b.key));

  const groups: ShelfGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    const item: ShelfItem = { key: row.key, baseId: row.baseId, isBase: row.isBase };
    if (last && last.baseId === row.baseId) last.items.push(item);
    else groups.push({ baseId: row.baseId, items: [item] });
  }
  return groups;
}
