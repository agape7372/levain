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
import { dateText, pantryQualityText } from '../format';
import { toast } from './toast';
import { confirmModal, openModal } from './modal';
import {
  breadThumb, chipGrid, gridDivider, formsRow, ingredientChip, resultCard, setChipSelected,
  setFormSelected, setSummary, sheetHead, sheetLabel, sheetSummary,
} from './recipeVisuals';
import type { InfoRow } from './recipeVisuals';
import { INGREDIENTS, recipeById, ruleByVariantId, rulesForBase, variantIdOf } from '../../sim';
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
  openModal(resultCard({
    art: breadThumb(assetId, recipe.id),
    name,
    headline: headline || copy.recipes.flavor[recipe.id],
  }));
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

/**
 * 빵 시트 열기.
 * @param preselect 변형 id — 있으면 그 재료 칩·형태를 고른 채로 연다(선반 결과 카드의 "다시 만들기").
 *   이 빵의 규칙에 없는 id(베이스 id 포함)는 조용히 무시하고 기본 빵으로 연다.
 */
export function openBreadSheet(
  api: GameApi, recipe: RecipeDef, deps: BreadSheetDeps, preselect?: string,
): void {
  const collection = api.collection();
  const inv = api.inventory();
  const pantry = api.pantry();
  const baseName = copy.recipes.names[recipe.id];
  const flavor = copy.recipes.flavor[recipe.id];
  const isBread = recipe.kind === 'bread';
  // 이 빵을 지금 구우면 실제로 나갈 반죽 — 통은 로트 원장이고 굽기는 이 빵에 가장 잘 맞는 로트를
  // 골라 쓴다. 변형을 골라도 베이스가 같으면 같은 반죽이라 열 때 한 번만 읽는다(통이 비면 null).
  const dough = isBread ? api.doughFor(recipe.id) : null;

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

  // 머리 정보는 k/v 행으로만 말한다 (2026-09-05). 이전 판은 원가·등급·횟수·변형을 ' · '로 이어
  // 붙였는데, 216px(390) / 186px(360) 열에서 **구 중간**에 접혔다(실측 F2 — 홈 HUD가 08-25에
  // 배운 것과 같은 병). 라벨이 왼쪽에 서 있으면 값이 접혀도 무엇에 대한 값인지가 안 흔들린다.
  const buildHead = (): HTMLElement => {
    const entry = collection[selectedId()];
    const rows: InfoRow[] = [];
    if (isBread) {
      // discard 레시피는 그램 원장이 없다(GDD §6-1) — 필요·보관 행 자체를 두지 않는다
      rows.push({ k: copy.recipes.rows.need, v: copy.recipes.needOnly(recipe.cost) });
      rows.push({
        k: copy.recipes.rows.pantry,
        v: copy.recipes.grams(pantry),
        note: pantry < recipe.cost ? copy.pantry.shortBy(recipe.cost - pantry) : undefined,
      });
      if (dough) {
        // 레시피 화면 상태 줄은 **통 전체 평균**을, 이 행은 **이 빵에 뽑힐 로트**를 말한다 —
        // 시큼한 로트가 호밀빵으로 나가는 날엔 두 값이 다르다. 다른 게 결함이 아니라 요점이다.
        rows.push({ k: copy.recipes.rows.dough, v: pantryQualityText(dough) });
        // 가루는 다목적이 아닐 때만 — 호밀빵·통밀 깜빠뉴의 가산점(sourFit flourAffinity)이
        // 화면에 흔적조차 없으면 "왜 오늘만 잘 나왔지"가 보이지 않는 절벽이 된다.
        if (dough.flour !== 'white') {
          rows.push({ k: copy.recipes.rows.flour, v: copy.feed.flourNames[dough.flour] });
        }
      }
    }
    if (entry) {
      // 등급 전문은 여기서만 — 카드·타일은 짧은 판(gradesShort). 열 폭이 다르다
      if (isBread && entry.bestGrade) {
        rows.push({ k: copy.recipes.rows.best, v: copy.recipes.grades[entry.bestGrade], grade: true });
      }
      rows.push({ k: copy.recipes.rows.count, v: copy.recipes.times(entry.count) });
    }
    rows.push({ k: copy.recipes.rows.variants, v: copy.recipes.variantsOf(discovered, rules.length) });
    return sheetHead({
      artId: selectedId(),
      fallbackId: recipe.id,
      name: selectedName(),
      flavor,
      rows,
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

  /** 재료 칩 선택 — 형태가 여럿이면 칩 **바로 뒤에** 형태 행을 펼친다 */
  const pickGroup = (group: Group, rule?: CompatibilityRule): void => {
    clearForms();
    markChip(group.id);
    const pick = rule ?? group.rules[0];
    selected = pick;
    if (group.rules.length > 1) {
      const row = formsRow(
        group.rules.map((r) => {
          const entry = collection[variantIdOf(r)];
          return {
            key: variantIdOf(r),
            label: copy.recipes.formNames[r.form],
            hint: entry ? copy.recipes.madeCount(entry.count) : copy.recipes.addOne,
            done: entry !== undefined,
            selected: r === pick,
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
      chips.get(group.id)?.after(row);
      formsEl = row;
    }
    applySelection();
  };

  // 보유 → 얇은 구분선 → 미보유 순 (2026-09-05, 실측 F4).
  // 미보유 칩은 수량 pill을 달지 않는다 — `0` 17장은 정보가 아니라 소음이었다. 이름은 그대로
  // 보인다(GDD §6-3 "무엇이 필요한지"), 발견 ✓도 보유 여부와 무관하게 남는다.
  const owned = groups.filter((g) => (inv[g.id] ?? 0) > 0);
  const missing = groups.filter((g) => (inv[g.id] ?? 0) <= 0);

  for (const group of owned) {
    const chip = ingredientChip({
      id: group.id,
      name: copy.recipes.ingredientNames[group.id],
      count: inv[group.id] ?? 0,
      state: 'owned',
      done: group.rules.some((r) => variantIdOf(r) in collection),
    });
    chip.addEventListener('click', () => pickGroup(group));
    chips.set(group.id, chip);
    grid.appendChild(chip);
  }

  if (missing.length > 0) {
    grid.appendChild(gridDivider(copy.recipes.missingLabel));
    for (const group of missing) {
      const chip = ingredientChip({
        id: group.id,
        name: copy.recipes.ingredientNames[group.id],
        count: null,
        state: 'missing',
        done: group.rules.some((r) => variantIdOf(r) in collection),
      });
      // 미보유는 선택을 바꾸지 않는다 — 어디서 구하는지만 말한다(교환소는 재료 탭 상단)
      chip.addEventListener('click', () => toast(copy.recipes.galleryIngredientLocked));
      chips.set(group.id, chip);
      grid.appendChild(chip);
    }
  }

  markChip('base');
  applySelection();

  // 선반 "다시 만들기" — 그 변형을 고른 채로 연다. 재고가 없어도 고른 상태로 여는 이유:
  // 사용자가 지목한 빵이 그것이고, 무엇이 모자란지는 굽기 탭 응답이 말한다(문을 잠그지 않는다).
  if (preselect !== undefined) {
    const rule = rules.find((r) => variantIdOf(r) === preselect);
    const group = rule ? groups.find((g) => g.id === rule.ingredientId) : undefined;
    if (rule && group) pickGroup(group, rule);
  }

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
      // 쇼케이스에서 돌아오면 보고 있던 변형이 그대로 골라져 있다(베이스 id는 preselect가 무시한다)
      onRebake: () => openBreadSheet(api, recipe, deps, assetId),
      name,
    }).then((ok) => {
      if (!ok) openResultCard(recipe, assetId, name, '');
    });
  });

  // 제목 없음 — 시트 머리가 이름을 말한다(제목을 또 두면 같은 이름이 두 줄이 된다)
  const handle = openModal(body, { footer });
}

/**
 * 선반 타일 결과 카드 (2026-09-05) — **구운 빵을 3D 없이 보는 자리**.
 * 09-03 개편 뒤 구운 빵을 보려면 카드 → 시트 → 칩 → footer `3D로 보기` 4단을 거쳐 GLB뿐이었다.
 * 여기서는 2D 아트가 먼저 크게 뜨고, 3D는 footer의 선택지 하나로 내려간다.
 * @param key 도감 키 — 베이스 id 또는 `base--ing-form` 변형 id. 카탈로그에 없는 키는 무시한다.
 */
export function openShelfCard(api: GameApi, key: string, deps: BreadSheetDeps): void {
  const entry = api.collection()[key];
  if (!entry) return;
  const base = recipeById(key);
  const rule = base ? undefined : ruleByVariantId(key);
  const recipe = base ?? (rule ? recipeById(rule.baseRecipeId) : undefined);
  if (!recipe) return;
  const name = rule ? variantName(rule) : copy.recipes.names[recipe.id];
  const preselect = rule ? key : undefined;

  const rows: InfoRow[] = [];
  // discard 레시피는 판정이 없어 등급 행 자체가 없다(GDD §6-1)
  if (recipe.kind === 'bread' && entry.bestGrade) {
    rows.push({ k: copy.recipes.rows.best, v: copy.recipes.grades[entry.bestGrade], grade: true });
  }
  rows.push({ k: copy.recipes.rows.count, v: copy.recipes.times(entry.count) });
  rows.push({ k: copy.recipes.rows.first, v: dateText(entry.firstAt) });
  // 어느 르방으로 구웠는지 — 그 르방이 이미 없으면(곰팡이로 보냈거나 v1 이월분) **행 자체를 뺀다**.
  // 기본 이름으로 메우면 "르방이 1"이 실제로 존재하는 다른 르방을 가리키는 거짓말이 된다.
  const starterName = entry.starterId === undefined ? null : api.starterNameOf(entry.starterId);
  if (starterName !== null) {
    rows.push({ k: copy.recipes.rows.starter, v: starterName });
  }

  const footer = document.createElement('div');
  const open = deps.openShowcase;
  if (open) {
    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'btn btn-ghost';
    viewBtn.textContent = copy.recipes.view3d;
    viewBtn.addEventListener('click', () => {
      handle.close(); // 모달 위 모달 금지 — 닫고 나서 연다
      void open(key, '', false, {
        name,
        onRebake: () => openBreadSheet(api, recipe, deps, preselect),
      }).then((ok) => {
        if (!ok) openShelfCard(api, key, deps); // GLB가 없으면 카드로 되돌아온다
      });
    });
    footer.appendChild(viewBtn);
  }
  const againBtn = document.createElement('button');
  againBtn.type = 'button';
  againBtn.className = 'btn btn-primary';
  againBtn.textContent = copy.recipes.bakeAgain;
  againBtn.addEventListener('click', () => {
    handle.close();
    openBreadSheet(api, recipe, deps, preselect);
  });
  footer.appendChild(againBtn);

  const handle = openModal(
    resultCard({ art: breadThumb(key, recipe.id), name, rows }),
    { footer },
  );
}
