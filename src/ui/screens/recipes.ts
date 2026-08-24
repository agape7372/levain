// 레시피 탭 — 세그먼트 3분할: 레시피 | 재료함 | 빵 도감 (§8-1 B안).
// 정본: docs/GDD.md §6·§10, docs/VISUAL.md §7, 확장기획 §8.
import { copy } from '../copy';
import { toast } from '../components/toast';
import { openModal, confirmModal } from '../components/modal';
import { untilText } from '../format';
import { breadArt } from './breadArt';
import { createBreadDetailScreen } from './breadDetail';
import type { GameApi } from '../gameApi';
import type { CollectionEntry, RecipeDef, SimEvent, Snapshot } from '../../sim';
import { INGREDIENTS, RECIPES, SEED_G, FLOAT_OK_ACTIVITY, rulesForBase, variantIdOf } from '../../sim';
import type { Screen } from '../router';

export type RecipesSegment = 'recipes' | 'pantry' | 'gallery';
type GalleryFilter = 'all' | 'bakeable' | 'done';

export interface RecipesScreenDeps {
  /** 3D 쇼케이스 열기 — GLB 없으면 false를 돌려주고 카드 리절트로 폴백 */
  openShowcase?: (recipeId: string, headline: string, large: boolean) => Promise<boolean>;
  /** 뒤로(르방이 탭 복귀) — 헤더 백버튼 */
  onBack?: () => void;
  /** 상세 화면 push (§8-3) — 라우터는 app.ts 소유 */
  pushScreen?: (screen: Screen) => void;
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

  // ── 세그먼트: 레시피 | 재료함 | 빵 도감 (§8-1 — 항상 보이는 명시 진입) ──
  let segment: RecipesSegment = 'recipes';
  const segRow = document.createElement('div');
  segRow.className = 'seg';
  const segBtns = new Map<RecipesSegment, HTMLButtonElement>();
  for (const seg of ['recipes', 'pantry', 'gallery'] as RecipesSegment[]) {
    const b = document.createElement('button');
    b.textContent = copy.recipes.segments[seg];
    b.addEventListener('click', () => setSegment(seg));
    segBtns.set(seg, b);
    segRow.appendChild(b);
  }

  const content = document.createElement('div');
  content.style.marginTop = '14px'; // 세그먼트와 첫 카드 라인이 딱 붙는 문제 (사용자 보고 2026-08-24)

  wrap.append(head, segRow, content);
  el.appendChild(wrap);

  function setSegment(seg: RecipesSegment): void {
    segment = seg;
    segBtns.forEach((b, key) => b.classList.toggle('active', key === seg));
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

  /** 상세 화면 열기 (§8-3) — pushScreen 미주입(테스트 등)이면 무시 */
  function openDetail(recipe: RecipeDef): void {
    deps.pushScreen?.(createBreadDetailScreen(recipe, api, {
      openShowcase: deps.openShowcase,
      showResult,
      getCollection,
    }));
  }

  function onCardTap(recipe: RecipeDef): void {
    const snap = api.getSnapshot();
    const name = copy.recipes.names[recipe.id];

    if (snap.stage < recipe.stage) {
      toast(copy.recipes.lockedHint(copy.stage.names[recipe.stage]));
      return;
    }

    // 완성한 빵 카드 = 상세 화면 (감상 경로, §8-3). 미완성은 바로 굽기 flow 유지
    if (recipe.kind === 'bread' && getCollection()[recipe.id] && deps.pushScreen) {
      openDetail(recipe);
      return;
    }

    if (recipe.kind === 'discard') {
      confirmModal({
        title: name,
        body: copy.recipes.flavor[recipe.id],
        confirmLabel: copy.actions.bake,
        onConfirm: () => {
          const events = api.dispatch({ type: 'bakeDiscard', recipeId: recipe.id });
          const blocked = events.find(
            (e): e is Extract<SimEvent, { type: 'bakeBlocked' }> => e.type === 'bakeBlocked',
          );
          if (blocked) {
            toast(
              blocked.reason === 'cooldown'
                ? copy.recipes.discardCooldown
                : copy.recipes.lockedHint(copy.stage.names[recipe.stage]),
            );
            return;
          }
          showResult(recipe.id, copy.recipes.discardDone);
        },
      });
      return;
    }

    // 빵 — mass 부족은 확인 모달을 열기 전에 미리 걸러낸다
    if (snap.mass < recipe.cost + SEED_G) {
      toast(copy.recipes.needMass);
      return;
    }
    confirmModal({
      title: name,
      body: copy.recipes.bakeConfirm(name, recipe.cost),
      confirmLabel: copy.actions.bake,
      onConfirm: () => {
        const events = api.dispatch({ type: 'bake', recipeId: recipe.id });
        const blocked = events.find(
          (e): e is Extract<SimEvent, { type: 'bakeBlocked' }> => e.type === 'bakeBlocked',
        );
        if (blocked) {
          toast(
            blocked.reason === 'mass'
              ? copy.recipes.needMass
              : copy.recipes.lockedHint(copy.stage.names[recipe.stage]),
          );
          return;
        }
        const baked = events.find(
          (e): e is Extract<SimEvent, { type: 'baked' }> => e.type === 'baked',
        );
        if (baked) showResult(recipe.id, copy.recipes.grades[baked.grade], true);
      },
    });
  }

  function buildMeta(recipe: RecipeDef, locked: boolean, entry: CollectionEntry | undefined): HTMLElement {
    const meta = document.createElement('div');
    meta.className = 'meta';
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
    return meta;
  }

  function buildCard(recipe: RecipeDef, snap: Snapshot, collection: Record<string, CollectionEntry>): HTMLButtonElement {
    const locked = snap.stage < recipe.stage;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = locked ? 'recipe-card locked' : 'recipe-card';

    const art = document.createElement('div');
    art.className = 'art';
    // GLB 베이크 썸네일 우선 — 아직 없으면 절차 아트 폴백 (에셋은 사용자 게이트)
    const img = document.createElement('img');
    img.src = `/breads/thumbs/${recipe.id}.png`;
    img.alt = '';
    img.addEventListener('error', () => {
      img.remove();
      art.appendChild(breadArt(recipe.id));
    });
    art.appendChild(img);

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = copy.recipes.names[recipe.id];

    const meta = buildMeta(recipe, locked, collection[recipe.id]);

    card.append(art, name, meta);
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
      const card = buildCard(recipe, snap, collection);
      // 방금 해금된 카드 — 크림→컬러 wipe 0.5s (VISUAL §7-2)
      if (justUnlocked >= 0 && recipe.stage === justUnlocked) card.classList.add('just-unlocked');
      grid.appendChild(card);
    }
    content.appendChild(grid);
  }

  // ── 재료함 (§8-2 — 전역, 형태는 설명으로만. 획득 경로는 Phase 7) ──
  function renderPantry(): void {
    const inv = api.inventory();
    const total = INGREDIENTS.reduce((n, i) => n + (inv[i.id] ?? 0), 0);
    if (total === 0) {
      const empty = document.createElement('p');
      empty.className = 'meta';
      empty.style.cssText = 'text-align:center;margin-top:24px';
      empty.textContent = copy.recipes.pantryEmpty;
      content.appendChild(empty);
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'recipe-grid';
    for (const ing of INGREDIENTS) {
      const count = inv[ing.id] ?? 0;
      const card = document.createElement('div');
      card.className = count > 0 ? 'recipe-card' : 'recipe-card locked';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = `${copy.recipes.ingredientNames[ing.id]} · ${copy.recipes.ingredientCount(count)}`;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = ing.forms.map((f) => copy.recipes.formNames[f]).join(' · ');
      card.append(name, meta);
      grid.appendChild(card);
    }
    content.appendChild(grid);
  }

  // ── 빵 도감 (§8-3 — 필터 칩 + 상세 진입. 잠긴 빵은 해금 힌트만, 결제 유도 0) ──
  let filter: GalleryFilter = 'all';

  function renderGallery(snap: Snapshot): void {
    const collection = getCollection();

    const chips = document.createElement('div');
    chips.className = 'seg';
    for (const f of ['all', 'bakeable', 'done'] as GalleryFilter[]) {
      const b = document.createElement('button');
      b.textContent = copy.recipes.galleryFilters[f];
      b.classList.toggle('active', f === filter);
      b.addEventListener('click', () => {
        filter = f;
        render(api.getSnapshot());
      });
      chips.appendChild(b);
    }
    content.appendChild(chips);

    const grid = document.createElement('div');
    grid.className = 'recipe-grid';
    let shown = 0;
    for (const recipe of RECIPES) {
      const entry = collection[recipe.id];
      const locked = snap.stage < recipe.stage;
      const bakeable = !locked
        && (recipe.kind === 'discard' || snap.mass >= recipe.cost + SEED_G);
      if (filter === 'done' && !entry) continue;
      if (filter === 'bakeable' && !bakeable) continue;
      const card = buildCard(recipe, snap, collection);
      grid.appendChild(card);
      shown += 1;

      // 발견한 변형은 베이스 카드 뒤에 이어 붙인다 (§8-2 — 발견 = 도감 항목)
      for (const rule of rulesForBase(recipe.id)) {
        const vid = variantIdOf(rule);
        const vEntry = collection[vid];
        if (!vEntry) continue;
        if (filter === 'bakeable' && !bakeable) continue;
        const vCard = document.createElement('button');
        vCard.type = 'button';
        vCard.className = 'recipe-card';
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = copy.recipes.variantName(
          copy.recipes.ingredientNames[rule.ingredientId],
          copy.recipes.formNames[rule.form],
          copy.recipes.names[recipe.id],
        );
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = vEntry.bestGrade
          ? `${copy.recipes.grades[vEntry.bestGrade]} · ${vEntry.count}번`
          : copy.recipes.madeCount(vEntry.count);
        vCard.append(name, meta);
        vCard.addEventListener('click', () => openDetail(recipe));
        grid.appendChild(vCard);
        shown += 1;
      }
    }
    if (shown === 0) {
      const empty = document.createElement('p');
      empty.className = 'meta';
      empty.style.cssText = 'text-align:center;margin-top:24px';
      empty.textContent = copy.recipes.galleryEmpty;
      content.appendChild(empty);
      return;
    }
    content.appendChild(grid);
  }

  function render(snap: Snapshot): void {
    content.innerHTML = '';
    if (segment === 'recipes') renderRecipes(snap);
    else if (segment === 'pantry') renderPantry();
    else renderGallery(snap);
  }

  const unsub = api.subscribe((snap) => render(snap));

  setSegment('recipes');

  return {
    id: 'recipes',
    el,
    onShow() {
      render(api.getSnapshot());
    },
    onHide() {
      void unsub; // 도감은 탭 화면 — 실제 해제는 앱 종료 시 (home.ts와 동일 패턴)
    },
    /** 탭 재탭 상태 전이 (§8-1 표) — 레시피 ↔ 재료함 토글. 반환 = 전이 후 세그먼트 */
    cycleSegment(): RecipesSegment {
      setSegment(segment === 'recipes' ? 'pantry' : 'recipes');
      return segment;
    },
  };
}
