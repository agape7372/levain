// 레시피 도감 + 굽기 화면. 정본: docs/GDD.md §6·§10, docs/VISUAL.md §7.
import { copy } from '../copy';
import { toast } from '../components/toast';
import { openModal, confirmModal } from '../components/modal';
import { untilText } from '../format';
import { breadArt } from './breadArt';
import type { GameApi } from '../gameApi';
import type { CollectionEntry, RecipeDef, SimEvent, Snapshot } from '../../sim';
import { RECIPES, SEED_G, FLOAT_OK_ACTIVITY } from '../../sim';
import type { Screen } from '../router';

export function createRecipesScreen(
  api: GameApi,
  getCollection: () => Record<string, CollectionEntry>,
  /** 3D 쇼케이스 열기 — GLB 없으면 false를 돌려주고 카드 리절트로 폴백 */
  openShowcase?: (recipeId: string, headline: string, large: boolean) => Promise<boolean>,
): Screen {
  const el = document.createElement('div');
  el.className = 'screen screen--solid';

  const wrap = document.createElement('div');
  wrap.className = 'recipes-wrap';

  const head = document.createElement('div');
  head.className = 'recipes-head';
  const title = document.createElement('h1');
  title.className = 'recipes-title';
  title.textContent = copy.tabs.recipes;
  const floatBtn = document.createElement('button');
  floatBtn.type = 'button';
  floatBtn.className = 'btn btn-ghost';
  floatBtn.textContent = copy.actions.floatTest;
  floatBtn.addEventListener('click', onFloatTest);
  head.append(title, floatBtn);

  const grid = document.createElement('div');
  grid.className = 'recipe-grid';

  wrap.append(head, grid);
  el.appendChild(wrap);

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
    if (!openShowcase) {
      openResultModal(recipeId, headline, large);
      return;
    }
    void openShowcase(recipeId, headline, large).then((ok) => {
      if (!ok) openResultModal(recipeId, headline, large);
    });
  }

  function onCardTap(recipe: RecipeDef): void {
    const snap = api.getSnapshot();
    const name = copy.recipes.names[recipe.id];

    if (snap.stage < recipe.stage) {
      toast(copy.recipes.lockedHint(copy.stage.names[recipe.stage]));
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

  function renderGrid(snap: Snapshot): void {
    const collection = getCollection();
    const justUnlocked = lastStage >= 0 && snap.stage > lastStage ? snap.stage : -1;
    lastStage = snap.stage;
    grid.innerHTML = '';
    for (const recipe of RECIPES) {
      const card = buildCard(recipe, snap, collection);
      // 방금 해금된 카드 — 크림→컬러 wipe 0.5s (VISUAL §7-2)
      if (justUnlocked >= 0 && recipe.stage === justUnlocked) card.classList.add('just-unlocked');
      grid.appendChild(card);
    }
  }

  const unsub = api.subscribe((snap) => renderGrid(snap));

  return {
    id: 'recipes',
    el,
    onShow() {
      renderGrid(api.getSnapshot());
    },
    onHide() {
      void unsub; // 도감은 탭 화면 — 실제 해제는 앱 종료 시 (home.ts와 동일 패턴)
    },
  };
}
