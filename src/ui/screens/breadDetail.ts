// 빵 도감 상세 (§8-3 — 감상 경로 신설): 썸네일 → 3D 보기 / 기록 / 변형 목록 / 다시 만들기.
// 완성 카드 재탭 = 무조건 재굽기 confirm이던 v1 문제의 해법. router.push로 진입.
import { copy } from '../copy';
import { toast } from '../components/toast';
import { confirmModal } from '../components/modal';
import { breadArt } from './breadArt';
import type { GameApi } from '../gameApi';
import type { CollectionEntry, CompatibilityRule, RecipeDef, SimEvent } from '../../sim';
import { SEED_G, rulesForBase, variantIdOf } from '../../sim';
import type { Screen } from '../router';

export interface BreadDetailDeps {
  /** 3D 쇼케이스 — GLB 미비면 false (recipes.ts와 동일 계약) */
  openShowcase?: (recipeId: string, headline: string, large: boolean) => Promise<boolean>;
  /** 굽기 결과 표시 (쇼케이스 우선·카드 폴백) — recipes.ts showResult 재사용 */
  showResult: (recipeId: string, headline: string, large?: boolean) => void;
  /** 전역 도감 접근자 (store.getCollection — recipes.ts와 동일 주입) */
  getCollection: () => Record<string, CollectionEntry>;
}

const variantDisplayName = (rule: CompatibilityRule): string =>
  copy.recipes.variantName(
    copy.recipes.ingredientNames[rule.ingredientId],
    copy.recipes.formNames[rule.form],
    copy.recipes.names[rule.baseRecipeId],
  );

export function createBreadDetailScreen(
  recipe: RecipeDef,
  api: GameApi,
  deps: BreadDetailDeps,
): Screen {
  const el = document.createElement('div');
  el.className = 'screen screen--solid';
  const wrap = document.createElement('div');
  wrap.className = 'recipes-wrap';
  el.appendChild(wrap);

  const name = copy.recipes.names[recipe.id];

  function bakeBase(): void {
    // 기존 굽기 flow 그대로 — 커밋·연출·결과는 recipes.ts와 같은 경로 (§8-3 "다시 만들기")
    if (recipe.kind === 'discard') {
      confirmModal({
        title: name,
        body: copy.recipes.flavor[recipe.id],
        confirmLabel: copy.actions.bake,
        onConfirm: () => {
          const events = api.dispatch({ type: 'bakeDiscard', recipeId: recipe.id });
          if (events.some((e) => e.type === 'bakeBlocked')) {
            toast(copy.recipes.discardCooldown);
            return;
          }
          deps.showResult(recipe.id, copy.recipes.discardDone);
          render();
        },
      });
      return;
    }
    if (api.getSnapshot().mass < recipe.cost + SEED_G) {
      toast(copy.recipes.needMass);
      return;
    }
    confirmModal({
      title: name,
      body: copy.recipes.bakeConfirm(name, recipe.cost),
      confirmLabel: copy.actions.bake,
      onConfirm: () => {
        const events = api.dispatch({ type: 'bake', recipeId: recipe.id });
        const baked = events.find((e): e is Extract<SimEvent, { type: 'baked' }> => e.type === 'baked');
        if (baked) deps.showResult(recipe.id, copy.recipes.grades[baked.grade], true);
        else toast(copy.recipes.needMass);
        render();
      },
    });
  }

  function bakeVariant(rule: CompatibilityRule): void {
    const vid = variantIdOf(rule);
    const vname = variantDisplayName(rule);
    const discovered = vid in deps.getCollection();
    const ingName = copy.recipes.ingredientNames[rule.ingredientId];

    if (!discovered && (api.inventory()[rule.ingredientId] ?? 0) < 1) {
      toast(copy.recipes.needIngredient(ingName)); // 소비 0 — 시도 전 차단 (§8-2)
      return;
    }
    if (api.getSnapshot().mass < recipe.cost + SEED_G) {
      toast(copy.recipes.needMass);
      return;
    }
    confirmModal({
      title: vname,
      body: discovered
        ? copy.recipes.bakeConfirm(vname, recipe.cost)
        : copy.recipes.variantConfirm(vname, ingName, recipe.cost),
      confirmLabel: copy.actions.bake,
      onConfirm: () => {
        const events = api.bakeVariant(vid);
        const baked = events.find((e): e is Extract<SimEvent, { type: 'baked' }> => e.type === 'baked');
        if (baked) {
          // 변형도 베이스 GLB 재사용 (§8-2 assetId 분리 — 전용 자산은 승격 후)
          deps.showResult(recipe.id, `${vname} — ${copy.recipes.grades[baked.grade]}`, true);
        } else {
          const blocked = events.find(
            (e): e is Extract<SimEvent, { type: 'bakeBlocked' }> => e.type === 'bakeBlocked',
          );
          toast(blocked?.reason === 'ingredient' ? copy.recipes.needIngredient(ingName) : copy.recipes.needMass);
        }
        render();
      },
    });
  }

  const collection = (): Record<string, CollectionEntry> => deps.getCollection();

  function render(): void {
    wrap.innerHTML = '';

    // 헤더 — 백버튼은 하드웨어/제스처 백(라우터)이 담당, 헤더에도 하나 (recipes.ts 관행)
    const head = document.createElement('div');
    head.className = 'recipes-head';
    const titleGroup = document.createElement('div');
    titleGroup.className = 'recipes-title-group';
    const title = document.createElement('h1');
    title.className = 'recipes-title';
    title.textContent = name;
    titleGroup.appendChild(title);
    head.appendChild(titleGroup);

    // 큰 썸네일
    const art = document.createElement('div');
    art.style.cssText = 'display:flex;justify-content:center;margin:10px 0';
    const img = document.createElement('img');
    img.src = `/breads/thumbs/${recipe.id}.png`;
    img.alt = '';
    img.style.cssText = 'width:min(60vw,220px);border-radius:16px';
    img.addEventListener('error', () => {
      img.remove();
      art.appendChild(breadArt(recipe.id));
    });
    art.appendChild(img);

    // 기록 (§8-3 — firstAt은 저장만 되고 표시 안 하던 것)
    const entry = collection()[recipe.id];
    const record = document.createElement('div');
    record.className = 'meta';
    record.style.cssText = 'text-align:center;margin-bottom:12px';
    if (entry) {
      const lines: string[] = [];
      lines.push(copy.recipes.detailFirstAt(new Date(entry.firstAt).toLocaleDateString('ko-KR')));
      if (entry.bestGrade) lines.push(copy.recipes.grades[entry.bestGrade]);
      lines.push(copy.recipes.madeCount(entry.count));
      const by = entry.starterId ? api.starterNameOf(entry.starterId) : null;
      if (by) lines.push(copy.recipes.detailBy(by));
      record.textContent = lines.join(' · ');
    } else {
      record.textContent = copy.recipes.detailNotYet;
    }

    // 액션: 3D로 보기(완성 + 쇼케이스 가능 시) / 다시 만들기
    const actions = document.createElement('div');
    actions.className = 'hud-actions';
    actions.style.cssText = 'justify-content:center;margin-bottom:14px';
    if (entry && deps.openShowcase) {
      const view = document.createElement('button');
      view.className = 'btn btn-ghost';
      view.textContent = copy.recipes.view3d;
      view.addEventListener('click', () => {
        // 감상 — 등급 헤드라인 없이 (재감상, §8-3 "굽지 않고 재감상 가능")
        void deps.openShowcase!(recipe.id, entry.bestGrade ? copy.recipes.grades[entry.bestGrade] : '', false);
      });
      actions.appendChild(view);
    }
    const again = document.createElement('button');
    again.className = 'btn btn-primary';
    again.textContent = entry ? copy.recipes.bakeAgain : copy.actions.bake;
    again.addEventListener('click', bakeBase);
    actions.appendChild(again);

    wrap.append(head, art, record, actions);

    // 변형 목록 (§8-2 — verified+conditional만, 데이터가 결정)
    const rules = rulesForBase(recipe.id);
    if (rules.length > 0) {
      const vTitle = document.createElement('h2');
      vTitle.className = 'recipes-title';
      vTitle.style.cssText = 'font-size:15px;margin:6px 0';
      vTitle.textContent = copy.recipes.variantsTitle;
      const vGrid = document.createElement('div');
      vGrid.className = 'recipe-grid';
      for (const rule of rules) {
        const vid = variantIdOf(rule);
        const vEntry = collection()[vid];
        const have = (api.inventory()[rule.ingredientId] ?? 0) > 0;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = vEntry || have ? 'recipe-card' : 'recipe-card locked';
        const nameEl = document.createElement('div');
        nameEl.className = 'name';
        nameEl.textContent = variantDisplayName(rule);
        const meta = document.createElement('div');
        meta.className = 'meta';
        if (vEntry) {
          meta.textContent = vEntry.bestGrade
            ? `${copy.recipes.grades[vEntry.bestGrade]} · ${vEntry.count}번`
            : copy.recipes.madeCount(vEntry.count);
        } else {
          meta.textContent = copy.recipes.needIngredient(copy.recipes.ingredientNames[rule.ingredientId]);
        }
        card.append(nameEl, meta);
        card.addEventListener('click', () => bakeVariant(rule));
        vGrid.appendChild(card);
      }
      wrap.append(vTitle, vGrid);
    }
  }

  return {
    id: `bread-detail-${recipe.id}`,
    el,
    onShow() {
      render();
    },
  };
}
