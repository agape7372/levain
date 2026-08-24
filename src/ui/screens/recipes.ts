// 레시피 탭 — 세그먼트 2분할 [레시피 | 도감], 도감 하위 [빵 | 재료] (사용자 개편 2026-08-24).
// 완성 빵 탭 = 바로 3D · 변형 굽기 = 굽기 모달에서 재료 추가 · 미발견 = ?-실루엣.
// 정본: docs/GDD.md §6·§10, docs/VISUAL.md §7, 확장기획 §8.
import { copy } from '../copy';
import { toast } from '../components/toast';
import { openModal } from '../components/modal';
import { openStarterGift } from '../components/ingredientPicker';
import { untilText } from '../format';
import { breadArt } from './breadArt';
import { ingredientArt } from './ingredientArt';
import type { GameApi } from '../gameApi';
import type { CollectionEntry, CompatibilityRule, RecipeDef, SimEvent, Snapshot } from '../../sim';
import {
  INGREDIENTS, RECIPES, SEED_G, FLOAT_OK_ACTIVITY, rulesForBase, variantIdOf,
  INGREDIENT_FLOUR_COST, FLOUR_PER_INGREDIENT, INGREDIENT_SOFT_CAP, MISSION_REWARD_FLOUR,
  STAGE_REWARD_FLOUR, RECIPE_REWARD_FLOUR,
} from '../../sim';
import type { Screen } from '../router';

export type RecipesSegment = 'recipes' | 'gallery';
type GalleryTab = 'bread' | 'ingredient';

export interface ShowcaseOpts {
  /** 쇼케이스 하단 "다시 만들기" — 닫힌 뒤 굽기 모달 재진입 */
  onRebake?: () => void;
}

export interface RecipesScreenDeps {
  /** 3D 쇼케이스 열기 — GLB 없으면 false를 돌려주고 카드 리절트로 폴백 */
  openShowcase?: (recipeId: string, headline: string, large: boolean, opts?: ShowcaseOpts) => Promise<boolean>;
  /** 뒤로(르방이 탭 복귀) — 헤더 백버튼 */
  onBack?: () => void;
}

const variantName = (rule: CompatibilityRule): string =>
  copy.recipes.variantName(
    copy.recipes.ingredientNames[rule.ingredientId],
    copy.recipes.formNames[rule.form],
    copy.recipes.names[rule.baseRecipeId],
  );

export function createRecipesScreen(
  api: GameApi,
  getCollection: () => Record<string, CollectionEntry>,
  deps: RecipesScreenDeps = {},
): Screen & { cycleSegment(): RecipesSegment } {
  const el = document.createElement('div');
  el.className = 'screen screen--solid';

  const wrap = document.createElement('div');
  wrap.className = 'recipes-wrap';

  // ── 헤더 ──
  const head = document.createElement('div');
  head.className = 'recipes-head';
  const titleGroup = document.createElement('div');
  titleGroup.className = 'recipes-title-group';
  if (deps.onBack) {
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn btn-ghost recipes-back';
    backBtn.textContent = '←';
    backBtn.setAttribute('aria-label', '뒤로');
    backBtn.addEventListener('click', deps.onBack);
    titleGroup.appendChild(backBtn);
  }
  const title = document.createElement('h1');
  title.className = 'recipes-title';
  title.textContent = copy.tabs.recipes;
  titleGroup.appendChild(title);
  const floatBtn = document.createElement('button');
  floatBtn.type = 'button';
  floatBtn.className = 'btn btn-ghost';
  floatBtn.textContent = copy.actions.floatTest;
  floatBtn.addEventListener('click', onFloatTest);
  head.append(titleGroup, floatBtn);

  // ── 세그먼트: [레시피 | 도감] + 도감 하위 [빵 | 재료] ──
  // 두 줄은 경계 없이 착 붙인다(사용자 확정 — 한 덩어리), 줄-그리드만 14px
  let segment: RecipesSegment = 'recipes';
  let galleryTab: GalleryTab = 'bread';

  const segRow = document.createElement('div');
  segRow.className = 'seg';
  const segBtns = new Map<RecipesSegment, HTMLButtonElement>();
  for (const seg of ['recipes', 'gallery'] as RecipesSegment[]) {
    const b = document.createElement('button');
    b.textContent = copy.recipes.segments[seg];
    b.addEventListener('click', () => setSegment(seg));
    segBtns.set(seg, b);
    segRow.appendChild(b);
  }

  const subRow = document.createElement('div');
  subRow.className = 'seg seg--joined-bottom';
  const subBtns = new Map<GalleryTab, HTMLButtonElement>();
  for (const t of ['bread', 'ingredient'] as GalleryTab[]) {
    const b = document.createElement('button');
    b.textContent = copy.recipes.galleryTabs[t];
    b.addEventListener('click', () => {
      galleryTab = t;
      render(api.getSnapshot());
    });
    subBtns.set(t, b);
    subRow.appendChild(b);
  }

  const content = document.createElement('div');
  content.style.marginTop = '14px'; // 줄과 카드 그리드 간격 (1.2.2 확정)

  // 가루 배너 — 재료 탭에서만. 세그 간격 규약(세그↔하위줄 0 / 줄↔그리드 14px)은 그대로 두고
  // 배너가 그 사이에 같은 14px 리듬으로 들어간다 (사용자 확정 간격 불변)
  const econBar = document.createElement('div');
  econBar.className = 'econ-bar';

  wrap.append(head, segRow, subRow, econBar, content);
  el.appendChild(wrap);

  function setSegment(seg: RecipesSegment): void {
    segment = seg;
    render(api.getSnapshot());
  }

  function onFloatTest(): void {
    const snap = api.getSnapshot();
    if (snap.activity >= FLOAT_OK_ACTIVITY) {
      toast(copy.floatTest.ok);
    } else {
      toast(copy.floatTest.notYet(untilText(snap.peakAt, api.now())));
    }
  }

  function openResultModal(recipeId: string, headline: string, large = false): void {
    const body = document.createElement('div');
    const artWrap = document.createElement('div');
    artWrap.style.cssText = 'display:flex;justify-content:center;margin-bottom:12px';
    artWrap.appendChild(breadArt(recipeId));
    const p = document.createElement('p');
    p.className = 'modal-body';
    p.textContent = headline;
    p.style.textAlign = 'center';
    if (large) p.style.cssText += ';font-size:19px;font-weight:600;color:var(--ink)';
    body.append(artWrap, p);
    openModal(body, { title: copy.recipes.names[recipeId] });
  }

  /** 결과 표시 — 3D 쇼케이스 우선, GLB 미비 시 카드 리절트 폴백 */
  function showResult(recipeId: string, headline: string, large = false): void {
    if (!deps.openShowcase) {
      openResultModal(recipeId, headline, large);
      return;
    }
    void deps.openShowcase(recipeId, headline, large).then((ok) => {
      if (!ok) openResultModal(recipeId, headline, large);
    });
  }

  /** 감상 진입 — 바로 3D, 하단 "다시 만들기" (§8-3 개편: 상세 화면 폐지) */
  function openView(recipe: RecipeDef): void {
    if (!deps.openShowcase) {
      openResultModal(recipe.id, '');
      return;
    }
    void deps.openShowcase(recipe.id, '', false, { onRebake: () => openBakeModal(recipe) }).then((ok) => {
      if (!ok) openResultModal(recipe.id, '');
    });
  }

  // ── 굽기 모달 — "기본 + 재료 추가" 옵션 리스트 (home.ts 비율 모달 패턴) ──
  function openBakeModal(recipe: RecipeDef): void {
    const snap = api.getSnapshot();
    const name = copy.recipes.names[recipe.id];
    const collection = getCollection();
    const inv = api.inventory();

    // 재료 추가 후보: 발견됨(무소비 재굽기) OR 미발견+재고 있음(첫 발견 = 1 소비)
    const options = rulesForBase(recipe.id).filter((rule) => {
      const discovered = variantIdOf(rule) in collection;
      return discovered || (inv[rule.ingredientId] ?? 0) > 0;
    });

    const wrapEl = document.createElement('div');
    wrapEl.className = 'option-list';
    type Choice = 'base' | CompatibilityRule;
    let selected: Choice = 'base';
    const items = new Map<Choice, HTMLButtonElement>();

    const addItem = (key: Choice, nameText: string, hintText: string): void => {
      const item = document.createElement('button');
      item.className = 'option-item';
      const nm = document.createElement('span');
      nm.textContent = nameText;
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = hintText;
      item.append(nm, hint);
      item.addEventListener('click', () => {
        selected = key;
        items.forEach((btn, k) => btn.classList.toggle('selected', k === key));
      });
      items.set(key, item);
      wrapEl.appendChild(item);
    };

    const baseHint = recipe.kind === 'bread'
      ? `${copy.recipes.flavor[recipe.id]} · ${copy.recipes.costSuffix(recipe.cost)}`
      : copy.recipes.flavor[recipe.id];
    addItem('base', copy.recipes.bakePlain(name), baseHint);
    for (const rule of options) {
      const discovered = variantIdOf(rule) in collection;
      addItem(
        rule,
        variantName(rule),
        discovered
          ? copy.recipes.madeCount(collection[variantIdOf(rule)].count)
          : copy.recipes.bakeWithIngredient(copy.recipes.ingredientNames[rule.ingredientId]),
      );
    }
    items.get('base')?.classList.add('selected');

    // 빵은 mass 게이트 사전 안내 (기존 관행)
    if (recipe.kind === 'bread' && snap.mass < recipe.cost + SEED_G) {
      toast(copy.recipes.needMass);
      return;
    }

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const ok = document.createElement('button');
    ok.className = 'btn btn-primary';
    ok.textContent = copy.actions.bake;
    ok.addEventListener('click', () => {
      handle.close();
      const events: SimEvent[] = selected === 'base'
        ? api.dispatch(recipe.kind === 'bread'
            ? { type: 'bake', recipeId: recipe.id }
            : { type: 'bakeDiscard', recipeId: recipe.id })
        : api.bakeVariant(variantIdOf(selected));
      const blocked = events.find(
        (e): e is Extract<SimEvent, { type: 'bakeBlocked' }> => e.type === 'bakeBlocked',
      );
      if (blocked) {
        toast(
          blocked.reason === 'cooldown' ? copy.recipes.discardCooldown
          : blocked.reason === 'ingredient' ? copy.recipes.needIngredient(
              copy.recipes.ingredientNames[(selected as CompatibilityRule).ingredientId])
          : blocked.reason === 'mass' ? copy.recipes.needMass
          : copy.recipes.lockedHint(copy.stage.names[recipe.stage]),
        );
        return;
      }
      const vLabel = selected === 'base' ? null : variantName(selected);
      const baked = events.find((e): e is Extract<SimEvent, { type: 'baked' }> => e.type === 'baked');
      if (baked) {
        const grade = copy.recipes.grades[baked.grade];
        showResult(recipe.id, vLabel ? `${vLabel} — ${grade}` : grade, true);
        return;
      }
      if (events.some((e) => e.type === 'bakedDiscard')) {
        showResult(recipe.id, vLabel ? `${vLabel} — ${copy.recipes.discardDone}` : copy.recipes.discardDone);
      }
    });
    actions.appendChild(ok);
    wrapEl.appendChild(actions);

    const handle = openModal(wrapEl, { title: copy.recipes.bakeTitle(name) });
  }

  function onCardTap(recipe: RecipeDef): void {
    const snap = api.getSnapshot();
    if (snap.stage < recipe.stage) {
      toast(copy.recipes.lockedHint(copy.stage.names[recipe.stage]));
      return;
    }
    // 완성한 빵(bread) = 바로 3D 감상, 그 외 = 굽기 모달 (사용자 확정 2026-08-24)
    if (recipe.kind === 'bread' && getCollection()[recipe.id]) {
      openView(recipe);
      return;
    }
    openBakeModal(recipe);
  }

  // ── 카드 빌더 ──
  function artOf(recipeId: string): HTMLElement {
    const art = document.createElement('div');
    art.className = 'art';
    const img = document.createElement('img');
    img.src = `/breads/thumbs/${recipeId}.png`;
    img.alt = '';
    img.addEventListener('error', () => {
      img.remove();
      art.appendChild(breadArt(recipeId));
    });
    art.appendChild(img);
    return art;
  }

  /** ?-실루엣 카드 — 미발견·미해금 공용 (도감의 신비 항목) */
  function mysteryCard(baseRecipeId: string, onTap: () => void): HTMLButtonElement {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'recipe-card mystery';
    card.appendChild(artOf(baseRecipeId));
    const mark = document.createElement('div');
    mark.className = 'mystery-mark';
    mark.textContent = '?';
    card.appendChild(mark);
    card.addEventListener('click', onTap);
    return card;
  }

  function buildRecipeCard(recipe: RecipeDef, snap: Snapshot, collection: Record<string, CollectionEntry>): HTMLButtonElement {
    const locked = snap.stage < recipe.stage;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = locked ? 'recipe-card locked' : 'recipe-card';
    card.appendChild(artOf(recipe.id));

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = copy.recipes.names[recipe.id];

    const meta = document.createElement('div');
    meta.className = 'meta';
    const entry = collection[recipe.id];
    if (locked) {
      meta.textContent = copy.recipes.lockedHint(copy.stage.names[recipe.stage]);
    } else if (!entry) {
      const flavor = copy.recipes.flavor[recipe.id];
      meta.textContent = recipe.kind === 'bread' ? `${flavor} · ${copy.recipes.costSuffix(recipe.cost)}` : flavor;
    } else if (entry.bestGrade === null) {
      meta.textContent = copy.recipes.madeCount(entry.count);
    } else {
      const gradeSpan = document.createElement('span');
      gradeSpan.className = 'grade';
      gradeSpan.textContent = copy.recipes.grades[entry.bestGrade];
      meta.append(gradeSpan, document.createTextNode(` · ${entry.count}번`));
    }

    card.append(name, meta);
    card.addEventListener('click', () => onCardTap(recipe));
    return card;
  }

  let lastStage = -1;

  function renderRecipes(snap: Snapshot): void {
    const collection = getCollection();
    const justUnlocked = lastStage >= 0 && snap.stage > lastStage ? snap.stage : -1;
    lastStage = snap.stage;
    const grid = document.createElement('div');
    grid.className = 'recipe-grid';
    for (const recipe of RECIPES) {
      const card = buildRecipeCard(recipe, snap, collection);
      // 방금 해금된 카드 — 크림→컬러 wipe 0.5s (VISUAL §7-2)
      if (justUnlocked >= 0 && recipe.stage === justUnlocked) card.classList.add('just-unlocked');
      grid.appendChild(card);
    }
    content.appendChild(grid);
  }

  // ── 도감-빵: 전량 노출(베이스 10 + 변형 40), 미발견 = ?-실루엣. 메타 없음 ──
  function renderGalleryBread(snap: Snapshot): void {
    const collection = getCollection();
    const grid = document.createElement('div');
    grid.className = 'recipe-grid';

    for (const recipe of RECIPES) {
      const discovered = collection[recipe.id] !== undefined;
      if (discovered) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'recipe-card';
        card.appendChild(artOf(recipe.id));
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = copy.recipes.names[recipe.id];
        card.appendChild(name);
        card.addEventListener('click', () => openView(recipe));
        grid.appendChild(card);
      } else {
        grid.appendChild(mysteryCard(recipe.id, () => {
          toast(snap.stage < recipe.stage
            ? copy.recipes.lockedHint(copy.stage.names[recipe.stage])
            : copy.recipes.galleryMysteryBase);
        }));
      }

      for (const rule of rulesForBase(recipe.id)) {
        const vid = variantIdOf(rule);
        if (collection[vid]) {
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'recipe-card';
          card.appendChild(artOf(recipe.id)); // 변형 자산 = 베이스 재사용 (§8-2)
          const name = document.createElement('div');
          name.className = 'name';
          name.textContent = variantName(rule);
          card.appendChild(name);
          card.addEventListener('click', () => openView(recipe));
          grid.appendChild(card);
        } else {
          grid.appendChild(mysteryCard(recipe.id, () => toast(copy.recipes.variantHint)));
        }
      }
    }
    content.appendChild(grid);
  }

  // ── 도감-재료: 밝혀짐 = 보유>0 OR 그 재료를 쓴 발견 변형 존재 (파생 — 저장 없음) ──
  function renderGalleryIngredients(): void {
    const collection = getCollection();
    const inv = api.inventory();
    const grid = document.createElement('div');
    grid.className = 'recipe-grid';
    for (const ing of INGREDIENTS) {
      const known = (inv[ing.id] ?? 0) > 0
        || Object.keys(collection).some((k) => k.includes(`--${ing.id}-`));
      const card = document.createElement('div');
      card.className = known ? 'recipe-card' : 'recipe-card mystery';
      const art = document.createElement('div');
      art.className = 'art';
      art.appendChild(ingredientArt(ing.id));
      card.appendChild(art);
      if (known) {
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = `${copy.recipes.ingredientNames[ing.id]} · ${copy.recipes.ingredientCount(inv[ing.id] ?? 0)}`;
        card.appendChild(name);
      } else {
        const mark = document.createElement('div');
        mark.className = 'mystery-mark';
        mark.textContent = '?';
        card.appendChild(mark);
      }
      grid.appendChild(card);
    }
    content.appendChild(grid);
  }

  // ── 교환소 (§9) — 가루로 원하는 재료를 가져오고, 남는 재료는 가루로 되돌린다 ──
  // 도감의 ?-실루엣과 달리 여기선 4종을 전부 이름째 보여준다: 도감은 "만나 본 기록",
  // 교환소는 "가져올 수 있는 것"이라 축이 다르다 (사용자 확정 도감 규칙 불변).
  function openExchangeModal(): void {
    const wrapEl = document.createElement('div');

    const intro = document.createElement('p');
    intro.className = 'modal-body';
    intro.textContent = copy.economy.exchangeIntro;
    wrapEl.appendChild(intro);

    const list = document.createElement('div');
    list.className = 'option-list';
    list.style.marginTop = '12px';
    wrapEl.appendChild(list);

    const balance = document.createElement('p');
    balance.className = 'modal-body';
    balance.style.marginTop = '12px';

    const paint = (): void => {
      const inv = api.inventory();
      const eco = api.economy();
      balance.textContent = copy.economy.flourLabel(eco.flour);
      list.innerHTML = '';
      for (const ing of INGREDIENTS) {
        const have = inv[ing.id] ?? 0;
        const row = document.createElement('div');
        row.className = 'option-item exchange-row';

        const label = document.createElement('span');
        label.textContent = copy.recipes.ingredientNames[ing.id];
        const hint = document.createElement('span');
        hint.className = 'hint';
        hint.textContent = copy.economy.have(have);
        const texts = document.createElement('span');
        texts.className = 'exchange-texts';
        texts.append(label, hint);

        const buy = document.createElement('button');
        buy.type = 'button';
        buy.className = 'btn btn-primary btn-slim';
        buy.textContent = copy.economy.buy(INGREDIENT_FLOUR_COST);
        buy.disabled = eco.flour < INGREDIENT_FLOUR_COST || have >= INGREDIENT_SOFT_CAP;
        buy.addEventListener('click', () => {
          if (have >= INGREDIENT_SOFT_CAP) {
            toast(copy.economy.atCap(INGREDIENT_SOFT_CAP));
            return;
          }
          if (!api.buyIngredient(ing.id)) {
            toast(copy.economy.notEnough);
            return;
          }
          toast(copy.economy.bought(copy.recipes.ingredientNames[ing.id]));
          paint();
        });

        const sell = document.createElement('button');
        sell.type = 'button';
        sell.className = 'btn btn-ghost btn-slim';
        sell.textContent = copy.economy.sell(FLOUR_PER_INGREDIENT);
        sell.disabled = have < 1;
        sell.addEventListener('click', () => {
          if (!api.exchangeIngredient(ing.id)) {
            toast(copy.economy.noStock);
            return;
          }
          toast(copy.economy.sold(FLOUR_PER_INGREDIENT));
          paint();
        });

        const actionsEl = document.createElement('span');
        actionsEl.className = 'exchange-actions';
        actionsEl.append(buy, sell);
        row.append(texts, actionsEl);
        list.appendChild(row);
      }
    };
    paint();

    wrapEl.appendChild(balance);
    openModal(wrapEl, { title: copy.economy.exchangeTitle });
  }

  /** 미션 — 누적만 말한다. 남은 기한·연속 기록은 존재하지 않는다 (§9) */
  function openMissionsModal(): void {
    const eco = api.economy();
    const wrapEl = document.createElement('div');

    const intro = document.createElement('p');
    intro.className = 'modal-body';
    intro.textContent = copy.economy.missionsIntro;
    wrapEl.appendChild(intro);

    const rows = document.createElement('div');
    rows.className = 'observe-rows';
    rows.style.marginTop = '12px';
    const addRow = (text: string, sub: string): void => {
      const row = document.createElement('div');
      row.className = 'row';
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = '·';
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = sub ? `${text} · ${sub}` : text;
      row.append(k, v);
      rows.appendChild(row);
    };
    addRow(
      copy.economy.missionFeed(eco.feed.remaining, MISSION_REWARD_FLOUR),
      copy.economy.missionCount(eco.feed.count),
    );
    addRow(
      copy.economy.missionBake(eco.bake.remaining, MISSION_REWARD_FLOUR),
      copy.economy.missionCount(eco.bake.count),
    );
    addRow(copy.economy.missionStage(STAGE_REWARD_FLOUR), '');
    addRow(copy.economy.missionRecipe(eco.basesDone, eco.basesTotal, RECIPE_REWARD_FLOUR), '');
    wrapEl.appendChild(rows);

    openModal(wrapEl, { title: copy.economy.missionsTitle });
  }

  function renderEconBar(): void {
    const eco = api.economy();
    econBar.innerHTML = '';

    const amount = document.createElement('span');
    amount.className = 'econ-amount';
    amount.textContent = copy.economy.flourLabel(eco.flour);

    const actionsEl = document.createElement('span');
    actionsEl.className = 'econ-actions';

    if (eco.giftPending) {
      const gift = document.createElement('button');
      gift.type = 'button';
      gift.className = 'btn btn-primary btn-slim';
      gift.textContent = copy.economy.giftTitle;
      gift.addEventListener('click', () => openStarterGift(api));
      actionsEl.appendChild(gift);
    } else {
      const exchange = document.createElement('button');
      exchange.type = 'button';
      exchange.className = 'btn btn-primary btn-slim';
      exchange.textContent = copy.economy.exchangeTitle;
      exchange.addEventListener('click', openExchangeModal);
      actionsEl.appendChild(exchange);
    }

    const missions = document.createElement('button');
    missions.type = 'button';
    missions.className = 'btn btn-ghost btn-slim';
    missions.textContent = copy.economy.missionsTitle;
    missions.addEventListener('click', openMissionsModal);
    actionsEl.appendChild(missions);

    econBar.append(amount, actionsEl);
  }

  function render(snap: Snapshot): void {
    segBtns.forEach((b, key) => b.classList.toggle('active', key === segment));
    subBtns.forEach((b, key) => b.classList.toggle('active', key === galleryTab));
    // 도감일 때만 하위 줄 표시 + 윗줄과 이어붙임 (경계 없이 — 사용자 확정)
    const gallery = segment === 'gallery';
    subRow.style.display = gallery ? '' : 'none';
    segRow.classList.toggle('seg--joined-top', gallery);
    // 가루 배너는 재료 탭 전용 — 다른 탭의 간격은 손대지 않는다
    const showEcon = gallery && galleryTab === 'ingredient';
    econBar.style.display = showEcon ? '' : 'none';
    if (showEcon) renderEconBar();
    content.innerHTML = '';
    if (!gallery) renderRecipes(snap);
    else if (galleryTab === 'bread') renderGalleryBread(snap);
    else renderGalleryIngredients();
  }

  const unsub = api.subscribe((snap) => render(snap));

  render(api.getSnapshot());

  return {
    id: 'recipes',
    el,
    onShow() {
      render(api.getSnapshot());
    },
    onHide() {
      void unsub; // 도감은 탭 화면 — 실제 해제는 앱 종료 시 (home.ts와 동일 패턴)
    },
    /** 탭 재탭 상태 전이 (§8-1 표 개정) — 레시피 ↔ 도감 토글 */
    cycleSegment(): RecipesSegment {
      setSegment(segment === 'recipes' ? 'gallery' : 'recipes');
      return segment;
    },
  };
}
