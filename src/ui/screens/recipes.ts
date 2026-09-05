// 레시피 탭 — 세그먼트 한 줄 [빵 | 선반 | 재료] (2026-09-03 개편 · 2026-09-05 선반 복원).
// 개편 전(~09-02): [레시피|도감] + 하위 [빵|재료] 두 줄에 같은 빵 10종이 두 번 있었고, 도감-빵은
// 변형 160장이 `?` 벽으로 평면화돼 있었다(실측 170장·scrollH 9,012px = 10.7화면).
// 09-03 개편이 그 벽을 걷어내며 **"내가 구운 빵"을 볼 자리도 같이 없앴다** — 구운 빵을 보려면
// 카드 → 시트 → 칩 → footer `3D로 보기` 4단을 거쳐 GLB 턴테이블뿐이었다(사용자 판정 1).
// 09-05: 가운데 세그먼트 `선반`이 발견한 것만(베이스+변형) 큰 2D 타일로 보여주고,
// 타일 탭 = 결과 카드(2D)다. 3D는 그 카드의 선택지로 내려간다.
//
// ★굽기의 기준은 **집**이다(GDD §6-2 개정): 해금은 `api.houseStage()`(집 최고 단계),
// 등급은 통에 든 반죽. 활성 르방이 무엇이냐는 이 화면 어디에도 안 나온다 — 통은 집 것이고
// 빵은 통에서 나가기 때문이다. 르방을 넘겨도 카드가 잠기거나 상태 줄이 바뀌지 않는다.
//
// 이 파일은 **셸**만 맡는다: 상태 줄·세그먼트·세 그리드·가루 배너.
// 시각(DOM 모양)은 components/recipeVisuals.ts, 굽기·교환은 components/{breadSheet,exchangeModal}.ts.
// 인라인 style 0 (2026-08-26 `font:inherit` 사고).
import { copy } from '../copy';
import { toast } from '../components/toast';
import { openModal } from '../components/modal';
import { openStarterGift } from '../components/ingredientPicker';
import { openBreadSheet, openShelfCard, variantName } from '../components/breadSheet';
import type { OpenShowcase, ShowcaseOpts } from '../components/breadSheet';
import { openExchangeModal, openMissionsModal } from '../components/exchangeModal';
import {
  breadCard, chipGrid, ingredientChip, resultCard, shelfEmpty, shelfGrid, shelfTile,
  statusLine, updateStatusLine,
} from '../components/recipeVisuals';
import type { StatusLineView } from '../components/recipeVisuals';
import { ingredientArtNode } from './ingredientArt';
import { dateText, pantryQualityText } from '../format';
import type { GameApi } from '../gameApi';
import type { CollectionEntry, IngredientId } from '../../sim';
import {
  INGREDIENTS, RECIPES, playableRules, recipeById, ruleByVariantId, rulesForBase, variantIdOf,
} from '../../sim';
import type { Screen } from '../router';

export type RecipesSegment = 'bread' | 'shelf' | 'ingredient';
export type { ShowcaseOpts };

const SEGMENTS: readonly RecipesSegment[] = ['bread', 'shelf', 'ingredient'];

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
  const head = document.createElement('div');
  head.className = 'recipes-head';
  const title = document.createElement('h1');
  title.className = 'recipes-title';
  title.textContent = copy.tabs.recipes;
  head.appendChild(title);

  // ── 상태 줄 = 통의 상태 ──
  // 2026-09-05: 이전 판은 활성 르방의 activity로 `지금 굽기 좋아요 / N시간 뒤쯤`을 말했다.
  // 빵은 통에서 나가는데 화면에 떠 있는 르방의 컨디션을 말하고 있었던 셈이라(실측 F7),
  // 어린 르방으로 넘기면 통 320g이 있어도 "아직"이라고 했다. 지금은 통만 말한다.
  // "띄워보기"(르방의 상태)는 관찰 카드 정보 행으로 옮겨갔다.
  // ★여기는 통 **전체 평균**(pantryQuality)이다. 빵 시트의 `반죽` 행은 그 빵에 실제로 뽑힐
  // 로트(doughFor)라 두 값이 다를 수 있다 — 통에 섞여 있으면 다른 게 정상이다.
  function statusView(): StatusLineView {
    const g = api.pantry();
    return {
      pantryText: g > 0 ? copy.pantry.label(g) : copy.pantry.none,
      pantryEmpty: g <= 0,
      qualityText: pantryQualityText(api.pantryQuality()),
    };
  }
  // aria-label을 두지 않는다 — 보이는 글이 곧 내용이고, 탭 응답은 같은 이야기의 긴 판이다
  const status = statusLine(statusView());
  status.addEventListener('click', () => {
    toast(api.pantry() > 0 ? copy.pantry.hint : copy.pantry.empty);
  });

  // ── 세그먼트 한 줄 [빵 | 선반 | 재료] ──
  let segment: RecipesSegment = 'bread';
  const segRow = document.createElement('div');
  segRow.className = 'seg recipes-seg';
  const segBtns = new Map<RecipesSegment, HTMLButtonElement>();
  for (const seg of SEGMENTS) {
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
    paint();
  }

  // ── 재료 감상 — 3D 우선, 로드 실패 시 한 줄 카드 폴백 (2026-08-30: 죽은 탭이었던 자리) ──
  /** 그 재료로 열 수 있는 **빵 종류** 수 — 형태가 여럿이면 같은 빵이 중복 계수되던 버그를 고쳤다 */
  function playableCountOf(id: string): number {
    return new Set(playableRules().filter((r) => r.ingredientId === id).map((r) => r.baseRecipeId)).size;
  }
  function openIngredientView(id: IngredientId): void {
    const headline = copy.recipes.ingredientHeadline(playableCountOf(id));
    const fallback = (): void => {
      openModal(resultCard({
        art: ingredientArtNode(id),
        name: copy.recipes.ingredientNames[id],
        headline,
      }));
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
  // 해금은 집 최고 단계 — `lastHouseStage` 비교라 르방 전환(성숙→어린→성숙)에 반응하지 않는다.
  // 이전 판은 활성 르방 stage를 비교해서 전환할 때마다 거짓 "방금 해금" 와이프가 났다(D2).
  let lastHouseStage = -1;
  function renderBread(): void {
    const collection = getCollection();
    const g = api.pantry();
    const house = api.houseStage();
    const justUnlocked = lastHouseStage >= 0 && house > lastHouseStage ? house : -1;
    lastHouseStage = house;
    const grid = document.createElement('div');
    grid.className = 'recipe-grid';
    for (const recipe of RECIPES) {
      const locked = house < recipe.stage;
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
        // 바뀌어 "몇 그램 필요한지조차 모름"이 됐다. discard 레시피는 그램 원장이 없다(GDD §6-1).
        // 맛 문구는 카드가 아니라 시트가 말한다 — 145px 열에 문장을 넣으면 카드 바닥이 어긋난다.
        costText: isBread ? copy.recipes.costSuffix(recipe.cost) : copy.recipes.discardCost,
        shortText: isBread && g < recipe.cost ? copy.pantry.short : undefined,
        gradeShort: entry?.bestGrade ? copy.recipes.gradesShort[entry.bestGrade] : undefined,
        countText: entry ? copy.recipes.times(entry.count) : undefined,
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

  // ── 선반 (발견한 것만) ──
  // `?` 벽이 없다: 아직 안 구운 빵은 빵 탭이 말하고, 여기는 구운 것만 최근 순으로 놓인다.
  // 카탈로그에서 사라진 키(옛 저장본의 잔존 변형)는 그릴 이름이 없으니 조용히 건너뛴다.
  function renderShelf(): void {
    const collection = getCollection();
    const keys = Object.keys(collection)
      .sort((a, b) => collection[b].firstAt - collection[a].firstAt);
    const grid = shelfGrid();
    let drawn = 0;
    for (const key of keys) {
      const entry = collection[key];
      let name: string;
      let fallbackId: string;
      if (recipeById(key)) {
        name = copy.recipes.names[key];
        fallbackId = key;
      } else {
        const rule = ruleByVariantId(key);
        if (!rule) continue; // 카탈로그에서 사라진 변형 — 그릴 이름이 없다
        name = variantName(rule);
        fallbackId = rule.baseRecipeId;
      }
      const tile = shelfTile({
        artId: key,
        fallbackId,
        name,
        gradeShort: entry.bestGrade ? copy.recipes.gradesShort[entry.bestGrade] : undefined,
        countText: copy.recipes.times(entry.count),
        whenText: dateText(entry.firstAt),
      });
      tile.addEventListener('click', () => openShelfCard(api, key, deps));
      grid.appendChild(tile);
      drawn += 1;
    }
    content.appendChild(drawn > 0
      ? grid
      : shelfEmpty(copy.recipes.shelfEmpty, copy.recipes.shelfEmptyHint));
  }

  // ── 재료 칩 그리드 (30종) ──
  // 밝혀짐 = 보유>0 OR 그 재료를 쓴 발견 변형 존재 (파생, 저장 없음).
  // 판정은 규칙 조회로 한다 — 문자열 포함(`k.includes('--id-')`)은 id가 서로의 접두가 되는 날
  // 조용히 오탐한다(D4). 교환소와 같은 4열 칩 원형이라 같은 30종을 두 문법으로 보이지 않는다.
  function renderIngredients(): void {
    const collection = getCollection();
    const inv = api.inventory();
    const grid = chipGrid();
    // 도감 키를 한 번만 훑어 "발견에 쓰인 재료" 집합을 만든다 — 재료 30종 × 키마다 규칙표(200행)를
    // 다시 뒤지면 같은 답을 30번 계산하게 된다
    const discoveredIds = new Set<string>();
    for (const key of Object.keys(collection)) {
      const ing = ruleByVariantId(key)?.ingredientId;
      if (ing !== undefined) discoveredIds.add(ing);
    }
    for (const ing of INGREDIENTS) {
      const count = inv[ing.id] ?? 0;
      const discovered = discoveredIds.has(ing.id);
      const known = count > 0 || discovered;
      const chip = ingredientChip({
        id: ing.id,
        name: copy.recipes.ingredientNames[ing.id],
        count: known && count > 0 ? count : null,
        state: known ? 'owned' : 'mystery',
        done: discovered,
      });
      // 도감-빵과 같은 규약: 칩은 전부 버튼이고 미발견은 힌트 토스트로 답한다
      chip.addEventListener('click', () => {
        if (known) openIngredientView(ing.id);
        else toast(copy.recipes.galleryIngredientLocked);
      });
      grid.appendChild(chip);
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
      primary.addEventListener('click', () => openExchangeModal(api, () => paint(true)));
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
  // 활성 르방 stage는 이제 아무 그리드도 정하지 않는다 — 집 단계가 그 자리를 대신한다.
  let visible = false;
  let lastKey = '';
  function gridKey(): string {
    const inv = api.inventory();
    const collection = getCollection();
    const eco = api.economy();
    let sig = 0;
    for (const key of Object.keys(collection)) {
      const e = collection[key];
      sig += e.count * 3 + (e.bestGrade === null ? 0 : 1);
    }
    return [
      segment, api.houseStage(), api.pantry(), Object.keys(collection).length, sig,
      eco.flour, eco.giftPending ? 1 : 0,
      INGREDIENTS.map((i) => inv[i.id] ?? 0).join(','),
    ].join('|');
  }

  function paint(force = false): void {
    updateStatusLine(status, statusView());
    segBtns.forEach((b, key) => b.classList.toggle('active', key === segment));
    const key = gridKey();
    if (!force && key === lastKey) return;
    lastKey = key;
    if (segment === 'ingredient') {
      if (econBar.parentElement === null) wrap.insertBefore(econBar, content);
      renderEconBar();
    } else {
      econBar.remove();
    }
    content.innerHTML = '';
    if (segment === 'bread') renderBread();
    else if (segment === 'shelf') renderShelf();
    else renderIngredients();
  }

  // 숨은 탭에선 아무것도 그리지 않는다 — 개편 전엔 60초 tick마다 카드 170장을 다시 만들었다.
  // 별도 dirty 플래그를 두지 않는 이유: lastKey가 곧 dirty 신호다(내용이 실제로 바뀌었는지까지 안다).
  // 스냅샷 인자를 받지 않는다 — 이 화면이 읽는 값(통·집 단계·도감·재료·가루)은 전부 api에서
  // 직접 오고, 활성 르방의 스냅샷은 여기서 아무것도 정하지 않는다(GDD §6-2 개정).
  const unsub = api.subscribe(() => {
    if (!visible) return;
    paint();
  });

  paint();

  return {
    id: 'recipes',
    el,
    onShow() {
      visible = true;
      paint();
    },
    onHide() {
      visible = false;
      void unsub; // 탭 화면 — 실제 해제는 앱 종료 시 (home.ts와 동일 패턴)
    },
    /** 탭 재탭 상태 전이 — 빵 → 선반 → 재료 → 빵 */
    cycleSegment(): RecipesSegment {
      setSegment(SEGMENTS[(SEGMENTS.indexOf(segment) + 1) % SEGMENTS.length]);
      return segment;
    },
  };
}
