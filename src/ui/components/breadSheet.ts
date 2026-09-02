// 빵 시트 — 굽기 + 변형 도감을 하나로 (2026-09-03 개편, 정본: docs/GDD.md §6-3·§6-4).
// 시트형 모달(modal.ts `footer` 옵션)이라 재료 칩이 길어져도 `굽기`가 항상 보인다 —
// 개편 전 굽기 모달은 옵션 31행 아래에 버튼이 있었다(실측 scrollH 1,799 / 702px).
//
// 재료 칩은 **이 빵에 넣을 수 있는 재료 전부**를 보유 여부와 무관하게 보인다 —
// "이 레시피에 무엇이 들어가고 무엇이 모자란지"가 한 그리드로 읽히는 게 요점이다.
// 별도의 변형 미니 그리드는 두지 않는다: 칩 + 형태 행이 곧 변형 도감이다.
//
// 시각(DOM 모양)은 components/recipeVisuals.ts가 정본 — 여기서 새 클래스를 조립하지 말 것.
// 인라인 style 0 (2026-08-26 `font:inherit` 사고).
import { copy } from '../copy';
import { toast } from './toast';
import { confirmModal, openModal } from './modal';
import {
  breadThumb, chipGrid, formsRow, ingredientChip, resultCard, setChipSelected, setFormSelected,
  setSummary, sheetHead, sheetLabel, sheetSummary,
} from './recipeVisuals';
import { INGREDIENTS, rulesForBase, variantIdOf } from '../../sim';
import type { CompatibilityRule, IngredientId, RecipeDef, SimEvent } from '../../sim';
import type { GameApi } from '../gameApi';

export interface ShowcaseOpts {
  /** 쇼케이스 하단 "다시 만들기" — 닫힌 뒤 시트 재진입 */
  onRebake?: () => void;
  /**
   * 자산 패밀리 (기본 bread). 재료는 GLB 경로가 다르고 **김을 뿜지 않는다** —
   * 김은 갓 구운 빵의 다이제틱 신호라 생재료에 붙으면 거짓말이 된다.
   */
  kind?: 'bread' | 'ingredient';
  /**
   * 표시 이름 override — 기본은 앱단이 `copy.recipes(.ingredientNames)`에서 자산 id로 찾는다.
   * 변형(예: scone--choco-chip)은 그 테이블에 없으니 호출부(`variantName(rule)`)가 직접 넘긴다.
   */
  name?: string;
}

/** 3D 쇼케이스 열기 — GLB 없으면 false를 돌려주고 호출부가 카드로 폴백한다 */
export type OpenShowcase = (
  id: string, headline: string, large: boolean, opts?: ShowcaseOpts,
) => Promise<boolean>;

export interface BreadSheetDeps {
  openShowcase?: OpenShowcase;
}

/** 변형 표시명 — 형태별 한국어 조립은 copy.ts가 정본 */
export const variantName = (rule: CompatibilityRule): string =>
  copy.recipes.variantName(
    copy.recipes.ingredientNames[rule.ingredientId],
    copy.recipes.formNames[rule.form],
    copy.recipes.names[rule.baseRecipeId],
  );

/** 카드 폴백 — GLB가 없거나 로드에 실패했을 때. 아트 가운데 + 이름 + 한 줄(recipeVisuals.resultCard) */
function openResultCard(recipe: RecipeDef, assetId: string, name: string, headline: string): void {
  openModal(resultCard(breadThumb(assetId, recipe.id), name, headline || copy.recipes.flavor[recipe.id]));
}

/** 결과 표시 — 3D 쇼케이스 우선, GLB 미비 시 카드 폴백 */
function showResult(
  deps: BreadSheetDeps, recipe: RecipeDef,
  assetId: string, name: string, headline: string, large: boolean,
): void {
  const open = deps.openShowcase;
  if (!open) {
    openResultCard(recipe, assetId, name, headline);
    return;
  }
  void open(assetId, headline, large, { name }).then((ok) => {
    if (!ok) openResultCard(recipe, assetId, name, headline);
  });
}

interface Group { id: IngredientId; rules: CompatibilityRule[] }

export function openBreadSheet(api: GameApi, recipe: RecipeDef, deps: BreadSheetDeps): void {
  const collection = api.collection();
  const inv = api.inventory();
  const pantry = api.pantry();
  const baseName = copy.recipes.names[recipe.id];
  const flavor = copy.recipes.flavor[recipe.id];
  const isBread = recipe.kind === 'bread';

  // 카탈로그 순서로 재료를 묶는다 — 같은 재료의 형태 여럿은 한 칩 아래 형태 행으로 접힌다
  const rules = rulesForBase(recipe.id);
  const groups: Group[] = [];
  for (const ing of INGREDIENTS) {
    const own = rules.filter((r) => r.ingredientId === ing.id);
    if (own.length > 0) groups.push({ id: ing.id, rules: own });
  }
  const discovered = rules.filter((r) => variantIdOf(r) in collection).length;

  /** 선택 = null이면 기본 빵, 아니면 그 변형 규칙 */
  let selected: CompatibilityRule | null = null;
  const selectedId = (): string => (selected ? variantIdOf(selected) : recipe.id);
  const selectedName = (): string => (selected ? variantName(selected) : baseName);

  const buildHead = (): HTMLElement => {
    const entry = collection[selectedId()];
    return sheetHead({
      artId: selectedId(),
      fallbackId: recipe.id,
      name: selectedName(),
      flavor,
      // 원가와 재고를 한 줄에서 같이 읽는다 — discard 레시피는 그램 원장이 없다(GDD §6-1)
      costText: isBread ? copy.recipes.needG(recipe.cost, pantry) : '',
      shortText: isBread && pantry < recipe.cost ? copy.pantry.shortBy(recipe.cost - pantry) : undefined,
      gradeText: entry?.bestGrade ? copy.recipes.grades[entry.bestGrade] : undefined,
      countText: entry ? copy.recipes.madeCount(entry.count) : undefined,
      progressText: copy.recipes.progress(discovered, rules.length),
    });
  };

  const body = document.createElement('div');
  let head = buildHead();
  body.append(head, sheetLabel(copy.recipes.ingredientsLabel, copy.recipes.ingredientsHint));
  const grid = chipGrid();
  const summary = sheetSummary();
  body.append(grid, summary);

  // ── footer: [3D로 보기](도감에 있을 때만) + [굽기] ──
  const footer = document.createElement('div');
  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.className = 'btn btn-ghost';
  viewBtn.textContent = copy.recipes.view3d;
  const bakeBtn = document.createElement('button');
  bakeBtn.type = 'button';
  bakeBtn.className = 'btn btn-primary';
  bakeBtn.textContent = copy.actions.bake;
  footer.appendChild(bakeBtn);

  const syncFooter = (): void => {
    const known = selectedId() in collection;
    if (known && viewBtn.parentElement === null) footer.insertBefore(viewBtn, bakeBtn);
    else if (!known && viewBtn.parentElement !== null) viewBtn.remove();
  };

  /** 선택이 바뀌면 머리를 새로 만들어 갈아 끼우고, 요약·footer를 맞춘다 */
  const applySelection = (): void => {
    const next = buildHead();
    head.replaceWith(next);
    head = next;
    if (selected === null) {
      setSummary(summary, `${copy.recipes.plainLabel} ${baseName}`, flavor);
    } else {
      const entry = collection[variantIdOf(selected)];
      setSummary(summary, variantName(selected), entry
        ? copy.recipes.madeCount(entry.count)
        : copy.recipes.bakeWithIngredient(copy.recipes.ingredientNames[selected.ingredientId]));
    }
    syncFooter();
  };

  // ── 칩 그리드: '기본' + 이 빵에 넣을 수 있는 재료 전부 ──
  const chips = new Map<IngredientId | 'base', HTMLButtonElement>();
  const markChip = (key: IngredientId | 'base'): void => {
    chips.forEach((chip, k) => setChipSelected(chip, k === key));
  };
  let formsEl: HTMLElement | null = null;
  const clearForms = (): void => {
    formsEl?.remove();
    formsEl = null;
  };

  const baseChip = ingredientChip({
    id: 'base', baseId: recipe.id, name: copy.recipes.plainLabel, count: null, state: 'owned',
  });
  baseChip.addEventListener('click', () => {
    clearForms();
    selected = null;
    markChip('base');
    applySelection();
  });
  chips.set('base', baseChip);
  grid.appendChild(baseChip);

  for (const group of groups) {
    const have = inv[group.id] ?? 0;
    const chip = ingredientChip({
      id: group.id,
      name: copy.recipes.ingredientNames[group.id],
      count: have,
      state: have > 0 ? 'owned' : 'missing',
      done: group.rules.some((r) => variantIdOf(r) in collection),
    });
    chip.addEventListener('click', () => {
      if (have === 0) {
        // 미보유는 선택을 바꾸지 않는다 — 어디서 구하는지만 말한다(교환소는 재료 탭 상단)
        toast(copy.recipes.galleryIngredientLocked);
        return;
      }
      clearForms();
      markChip(group.id);
      selected = group.rules[0];
      if (group.rules.length > 1) {
        const row = formsRow(
          group.rules.map((r) => {
            const entry = collection[variantIdOf(r)];
            return {
              key: variantIdOf(r),
              label: copy.recipes.formNames[r.form],
              hint: entry ? copy.recipes.madeCount(entry.count) : copy.recipes.addOne,
              done: entry !== undefined,
              selected: r === group.rules[0],
            };
          }),
          (key) => {
            const picked = group.rules.find((r) => variantIdOf(r) === key);
            if (!picked) return;
            selected = picked;
            if (formsEl) setFormSelected(formsEl, key);
            applySelection();
          },
        );
        chip.after(row);
        formsEl = row;
      }
      applySelection();
    });
    chips.set(group.id, chip);
    grid.appendChild(chip);
  }

  markChip('base');
  applySelection();

  // ── 굽기 ──
  const blockedText = (reason: Extract<SimEvent, { type: 'bakeBlocked' }>['reason']): string => {
    if (reason === 'cooldown') return copy.recipes.discardCooldown;
    if (reason === 'ingredient' && selected) {
      return copy.recipes.needIngredient(copy.recipes.ingredientNames[selected.ingredientId]);
    }
    if (reason === 'pantry') return copy.pantry.notEnough(recipe.cost);
    return copy.recipes.lockedHint(copy.stage.names[recipe.stage]);
  };

  const runBake = (): void => {
    const events: SimEvent[] = selected === null
      ? api.dispatch(isBread
          ? { type: 'bake', recipeId: recipe.id }
          : { type: 'bakeDiscard', recipeId: recipe.id })
      : api.bakeVariant(variantIdOf(selected));
    const blocked = events.find(
      (e): e is Extract<SimEvent, { type: 'bakeBlocked' }> => e.type === 'bakeBlocked',
    );
    if (blocked) {
      toast(blockedText(blocked.reason));
      return;
    }
    // 변형을 구우면 결과 연출도 변형 3D를 보여준다 — 라벨은 변형인데 3D는 베이스가 뜨던
    // 어긋남을 2026-08-30에 고친 자리다.
    const assetId = selectedId();
    const label = selected === null ? null : variantName(selected);
    const name = label ?? baseName;
    const baked = events.find((e): e is Extract<SimEvent, { type: 'baked' }> => e.type === 'baked');
    if (baked) {
      const grade = copy.recipes.grades[baked.grade];
      showResult(deps, recipe, assetId, name, label ? `${label} — ${grade}` : grade, true);
      return;
    }
    if (events.some((e) => e.type === 'bakedDiscard')) {
      const done = copy.recipes.discardDone;
      showResult(deps, recipe, assetId, name, label ? `${label} — ${done}` : done, false);
    }
  };

  bakeBtn.addEventListener('click', () => {
    // 통 부족은 **진입 차단이 아니라 탭 응답**이다(2026-09-03 개편) — 원가·부족량이 시트 머리에
    // 이미 적혀 있으니 문을 잠그는 것보다 이유를 말하는 쪽이 정보가 많다.
    if (isBread && api.pantry() < recipe.cost) {
      toast(copy.pantry.notEnough(recipe.cost));
      return;
    }
    handle.close();
    // 이 빵으로 통이 정확히 빈다 — 되돌릴 수 없으니 먼저 알린다 (모달 위 모달 금지: 시트를 닫은 뒤)
    if (isBread && api.pantry() - recipe.cost <= 0) {
      confirmModal({
        body: copy.pantry.lastWarn,
        confirmLabel: copy.actions.bake,
        cancelLabel: '다음에요',
        onConfirm: runBake,
      });
      return;
    }
    runBake();
  });

  viewBtn.addEventListener('click', () => {
    const assetId = selectedId();
    const name = selectedName();
    handle.close();
    const open = deps.openShowcase;
    if (!open) {
      openResultCard(recipe, assetId, name, '');
      return;
    }
    void open(assetId, '', false, {
      onRebake: () => openBreadSheet(api, recipe, deps),
      name,
    }).then((ok) => {
      if (!ok) openResultCard(recipe, assetId, name, '');
    });
  });

  // 제목 없음 — 시트 머리가 이름을 말한다(제목을 또 두면 같은 이름이 두 줄이 된다)
  const handle = openModal(body, { footer });
}
