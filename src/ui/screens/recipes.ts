// 레시피 탭 — 세그먼트 한 줄 [빵 | 재료] (2026-09-03 개편, 정본: docs/GDD.md §6·§10).
// 개편 전: [레시피|도감] + 하위 [빵|재료] 두 줄에 같은 빵 10종이 두 번 있었고, 도감-빵은
// 변형 160장이 `?` 벽으로 평면화돼 있었다(실측 170장·scrollH 9,012px = 10.7화면).
// 지금은 빵 카드 하나가 굽기·3D·변형 도감을 다 품는 시트(components/breadSheet.ts)로 열린다.
//
// 이 파일은 **셸**만 맡는다: 상태 줄·세그먼트·두 그리드·가루 배너.
// 시각(DOM 모양)은 components/recipeVisuals.ts, 굽기·교환은 components/{breadSheet,exchangeModal}.ts.
// 인라인 style 0 (2026-08-26 `font:inherit` 사고).
import { copy } from '../copy';
import { toast } from '../components/toast';
import { openModal } from '../components/modal';
import { openStarterGift } from '../components/ingredientPicker';
import { openBreadSheet } from '../components/breadSheet';
import type { OpenShowcase, ShowcaseOpts } from '../components/breadSheet';
import { openExchangeModal, openMissionsModal } from '../components/exchangeModal';
import { breadCard, ingredientCard, resultCard, statusLine, updateStatusLine } from '../components/recipeVisuals';
import type { StatusLineView } from '../components/recipeVisuals';
import { ingredientArtNode } from './ingredientArt';
import { untilText } from '../format';
import type { GameApi } from '../gameApi';
import type { CollectionEntry, IngredientId, Snapshot } from '../../sim';
import {
  FLOAT_OK_ACTIVITY, INGREDIENTS, RECIPES, playableRules, rulesForBase, variantIdOf,
} from '../../sim';
import type { Screen } from '../router';

export type RecipesSegment = 'bread' | 'ingredient';
export type { ShowcaseOpts };

export interface RecipesScreenDeps {
  /** 3D 쇼케이스 열기 — GLB 없으면 false를 돌려주고 카드로 폴백 */
  openShowcase?: OpenShowcase;
}

export function createRecipesScreen(
  api: GameApi,
  getCollection: () => Record<string, CollectionEntry>,
  deps: RecipesScreenDeps = {},
): Screen & { cycleSegment(): RecipesSegment } {
  const el = document.createElement('div');
  el.className = 'screen screen--solid';

  const wrap = document.createElement('div');
  wrap.className = 'recipes-wrap';

  // ── 헤더 = 제목 한 줄 ──
  // 백버튼은 폐지됐다(2026-09-03): 탭바가 복귀 수단이고 하드웨어 백 계약은 app.ts가 그대로 지킨다.
  // "물에 띄워보기" 버튼도 상태 줄로 흡수됐다 — 같은 판정을 말로 늘 보여주는 쪽이 정보가 많다.
  const head = document.createElement('div');
  head.className = 'recipes-head';
  const title = document.createElement('h1');
  title.className = 'recipes-title';
  title.textContent = copy.tabs.recipes;
  head.appendChild(title);

  // ── 상태 줄 — 굽기에 필요한 두 정보(적기·보관량)를 홈으로 돌아가지 않고 여기서 본다 ──
  function statusView(snap: Snapshot): StatusLineView {
    const ready = snap.activity >= FLOAT_OK_ACTIVITY;
    const g = api.pantry();
    return {
      name: api.labelText() ?? copy.starter.defaultName(api.starters().ordinal),
      ready,
      readyText: ready ? copy.recipes.readyNow : copy.recipes.readyIn(untilText(snap.peakAt, api.now())),
      pantryText: g > 0 ? copy.pantry.label(g) : copy.pantry.none,
      pantryEmpty: g <= 0,
    };
  }
  const status = statusLine(statusView(api.getSnapshot()));
  status.setAttribute('aria-label', copy.actions.floatTest); // 스크린리더엔 동작 이름 — 보이는 글은 상태
  status.addEventListener('click', () => {
    const snap = api.getSnapshot();
    if (snap.activity >= FLOAT_OK_ACTIVITY) toast(copy.floatTest.ok);
    else toast(copy.floatTest.notYet(untilText(snap.peakAt, api.now())));
  });

  // ── 세그먼트 한 줄 [빵 | 재료] ──
  let segment: RecipesSegment = 'bread';
  const segRow = document.createElement('div');
  segRow.className = 'seg recipes-seg';
  const segBtns = new Map<RecipesSegment, HTMLButtonElement>();
  for (const seg of ['bread', 'ingredient'] as RecipesSegment[]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = copy.recipes.segments[seg];
    b.addEventListener('click', () => setSegment(seg));
    segBtns.set(seg, b);
    segRow.appendChild(b);
  }

  // 가루 배너 — 재료 탭에서만 붙는다(다른 탭의 간격은 손대지 않는다)
  const econBar = document.createElement('div');
  econBar.className = 'econ-bar';
  const content = document.createElement('div');

  wrap.append(head, status, segRow, content);
  el.appendChild(wrap);

  function setSegment(seg: RecipesSegment): void {
    segment = seg;
    paint(api.getSnapshot());
  }

  // ── 재료 감상 — 3D 우선, 로드 실패 시 한 줄 카드 폴백 (2026-08-30: 죽은 탭이었던 자리) ──
  /** 그 재료로 열 수 있는 **빵 종류** 수 — 형태가 여럿이면 같은 빵이 중복 계수되던 버그를 고쳤다 */
  function playableCountOf(id: string): number {
    return new Set(playableRules().filter((r) => r.ingredientId === id).map((r) => r.baseRecipeId)).size;
  }
  function openIngredientView(id: IngredientId): void {
    const headline = copy.recipes.ingredientHeadline(playableCountOf(id));
    const fallback = (): void => {
      openModal(resultCard(ingredientArtNode(id), copy.recipes.ingredientNames[id], headline));
    };
    const open = deps.openShowcase;
    if (!open) {
      fallback();
      return;
    }
    void open(id, headline, false, { kind: 'ingredient' }).then((ok) => {
      if (!ok) fallback();
    });
  }

  // ── 빵 그리드 (10장) ──
  let lastStage = -1;
  function renderBread(snap: Snapshot): void {
    const collection = getCollection();
    const g = api.pantry();
    const justUnlocked = lastStage >= 0 && snap.stage > lastStage ? snap.stage : -1;
    lastStage = snap.stage;
    const grid = document.createElement('div');
    grid.className = 'recipe-grid';
    for (const recipe of RECIPES) {
      const locked = snap.stage < recipe.stage;
      const lockedText = copy.recipes.lockedHint(copy.stage.names[recipe.stage]);
      const isBread = recipe.kind === 'bread';
      const entry = collection[recipe.id];
      const rules = rulesForBase(recipe.id);
      const card = breadCard({
        id: recipe.id,
        name: copy.recipes.names[recipe.id],
        locked,
        lockedText,
        // 원가는 **발견 여부와 무관하게 항상** 보인다 — 개편 전엔 한 번 구우면 등급·횟수로
        // 바뀌어 "몇 그램 필요한지조차 모름"이 됐다. discard 레시피는 그램 원장이 없어 맛 문구.
        costText: isBread ? copy.recipes.costSuffix(recipe.cost) : copy.recipes.flavor[recipe.id],
        shortText: isBread && g < recipe.cost ? copy.pantry.short : undefined,
        gradeText: entry?.bestGrade ? copy.recipes.grades[entry.bestGrade] : undefined,
        countText: entry ? copy.recipes.madeCount(entry.count) : undefined,
        progress: {
          done: rules.filter((r) => variantIdOf(r) in collection).length,
          total: rules.length,
        },
        justUnlocked: justUnlocked >= 0 && recipe.stage === justUnlocked,
      });
      card.addEventListener('click', () => {
        if (locked) {
          toast(lockedText);
          return;
        }
        openBreadSheet(api, recipe, { openShowcase: deps.openShowcase });
      });
      grid.appendChild(card);
    }
    content.appendChild(grid);
  }

  // ── 재료 그리드 (30장) — 밝혀짐 = 보유>0 OR 그 재료를 쓴 발견 변형 존재 (파생, 저장 없음) ──
  function renderIngredients(): void {
    const collection = getCollection();
    const inv = api.inventory();
    const keys = Object.keys(collection);
    const grid = document.createElement('div');
    grid.className = 'recipe-grid';
    for (const ing of INGREDIENTS) {
      const count = inv[ing.id] ?? 0;
      const known = count > 0 || keys.some((k) => k.includes(`--${ing.id}-`));
      const card = ingredientCard({
        id: ing.id, name: copy.recipes.ingredientNames[ing.id], known, count,
      });
      // 도감-빵과 같은 규약: 카드는 전부 버튼이고 미발견은 힌트 토스트로 답한다
      card.addEventListener('click', () => {
        if (known) openIngredientView(ing.id);
        else toast(copy.recipes.galleryIngredientLocked);
      });
      grid.appendChild(card);
    }
    content.appendChild(grid);
  }

  function renderEconBar(): void {
    const eco = api.economy();
    econBar.innerHTML = '';

    const amount = document.createElement('span');
    amount.className = 'econ-amount';
    amount.textContent = copy.economy.flourLabel(eco.flour);

    const actions = document.createElement('span');
    actions.className = 'econ-actions';

    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'btn btn-primary btn-slim';
    if (eco.giftPending) {
      primary.textContent = copy.economy.giftTitle;
      primary.addEventListener('click', () => openStarterGift(api));
    } else {
      primary.textContent = copy.economy.exchangeTitle;
      primary.addEventListener('click', () => openExchangeModal(api, () => paint(api.getSnapshot(), true)));
    }
    actions.appendChild(primary);

    const missions = document.createElement('button');
    missions.type = 'button';
    missions.className = 'btn btn-ghost btn-slim';
    missions.textContent = copy.economy.missionsTitle;
    missions.addEventListener('click', () => openMissionsModal(api));
    actions.appendChild(missions);

    econBar.append(amount, actions);
  }

  // ── 재렌더 절약 ──
  // 그리드 내용을 정하는 값만 모아 키로 만든다. 스냅샷(60초 tick)이 와도 키가 같으면
  // 상태 줄 텍스트만 갱신하고 카드 40장은 건드리지 않는다.
  let visible = false;
  let lastKey = '';
  function gridKey(snap: Snapshot): string {
    const inv = api.inventory();
    const collection = getCollection();
    const eco = api.economy();
    let sig = 0;
    for (const key of Object.keys(collection)) {
      const e = collection[key];
      sig += e.count * 3 + (e.bestGrade === null ? 0 : 1);
    }
    return [
      segment, snap.stage, api.pantry(), Object.keys(collection).length, sig,
      eco.flour, eco.giftPending ? 1 : 0,
      INGREDIENTS.map((i) => inv[i.id] ?? 0).join(','),
    ].join('|');
  }

  function paint(snap: Snapshot, force = false): void {
    updateStatusLine(status, statusView(snap));
    segBtns.forEach((b, key) => b.classList.toggle('active', key === segment));
    const key = gridKey(snap);
    if (!force && key === lastKey) return;
    lastKey = key;
    if (segment === 'ingredient') {
      if (econBar.parentElement === null) wrap.insertBefore(econBar, content);
      renderEconBar();
    } else {
      econBar.remove();
    }
    content.innerHTML = '';
    if (segment === 'bread') renderBread(snap);
    else renderIngredients();
  }

  // 숨은 탭에선 아무것도 그리지 않는다 — 개편 전엔 60초 tick마다 카드 170장을 다시 만들었다.
  // 별도 dirty 플래그를 두지 않는 이유: lastKey가 곧 dirty 신호다(내용이 실제로 바뀌었는지까지 안다).
  const unsub = api.subscribe((snap) => {
    if (!visible) return;
    paint(snap);
  });

  paint(api.getSnapshot());

  return {
    id: 'recipes',
    el,
    onShow() {
      visible = true;
      paint(api.getSnapshot());
    },
    onHide() {
      visible = false;
      void unsub; // 탭 화면 — 실제 해제는 앱 종료 시 (home.ts와 동일 패턴)
    },
    /** 탭 재탭 상태 전이 — 빵 ↔ 재료 토글 */
    cycleSegment(): RecipesSegment {
      setSegment(segment === 'bread' ? 'ingredient' : 'bread');
      return segment;
    },
  };
}
