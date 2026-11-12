// 재료 하나 고르기 — 중앙 팝업(모달 규칙 5). 첫 재료 선물(§9 온보딩)의 표면이고,
// 재료를 "받는" 다른 경로가 생기면 그대로 재사용한다.
import { copy } from '../copy';
import { openModal } from './modal';
import { celebrateIngredients } from './celebrate';
import { chipGrid, ingredientChip } from './recipeVisuals';
import { INGREDIENTS } from '../../sim';
import type { IngredientId } from '../../sim';
import type { GameApi } from '../gameApi';

export interface IngredientPickerOpts {
  title: string;
  body?: string;
  /** 고른 뒤 모달은 자동으로 닫힌다 */
  onPick: (id: IngredientId) => void;
}

export function openIngredientPicker(opts: IngredientPickerOpts): void {
  const wrap = document.createElement('div');

  if (opts.body) {
    const p = document.createElement('p');
    p.className = 'modal-body';
    p.textContent = opts.body;
    wrap.appendChild(p);
  }

  // 교환소와 같은 칩 그리드(T5-14) — 2열 대형 카드는 30종이 화면 3.3장(scrollH 2070px)이었다.
  // 칩은 도감·교환소와 **같은** 아트 경로(ingredientArtNode, PNG 우선)를 쓴다. 고르는 자리라 수량 pill은 없다.
  const grid = chipGrid();
  for (const ing of INGREDIENTS) {
    const card = ingredientChip({
      id: ing.id,
      name: copy.recipes.ingredientNames[ing.id],
      count: null,
      state: 'owned',
    });
    card.addEventListener('click', () => {
      handle.close();
      opts.onPick(ing.id);
    });
    grid.appendChild(card);
  }
  wrap.appendChild(grid);

  const handle = openModal(wrap, { title: opts.title });
}

/** 첫 재료 선물 (§9) — 신규는 온보딩 직후, 기존 저장본은 재료 탭 배너에서 같은 모달로 받는다 */
export function openStarterGift(api: GameApi): void {
  openIngredientPicker({
    title: copy.economy.giftTitle,
    body: copy.economy.giftBody,
    onPick: (id) => {
      if (!api.claimStarterGift(id)) return;
      // 첫 재료 = 0→1이 확실한 자리 — 어떤 빵이 열렸는지까지 여기서 보여준다
      celebrateIngredients(api, [id]);
    },
  });
}
