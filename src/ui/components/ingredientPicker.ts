// 재료 하나 고르기 — 중앙 팝업(모달 규칙 5). 첫 재료 선물(§9 온보딩)의 표면이고,
// 재료를 "받는" 다른 경로가 생기면 그대로 재사용한다.
import { copy } from '../copy';
import { openModal } from './modal';
import { toast } from './toast';
import { celebrateIngredients } from './celebrate';
import { ingredientArtNode } from '../screens/ingredientArt';
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

  const grid = document.createElement('div');
  grid.className = 'recipe-grid';
  grid.style.marginTop = '12px';
  for (const ing of INGREDIENTS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'recipe-card';
    // 도감 그리드와 **같은** 아트 경로(PNG 우선). 여기서 SVG를 직접 부르면 12종분만 그려지고
    // 나머지는 전부 같은 베이지 타원이 된다 — 30종 확장에서 실제로 18장이 겹쳤던 자리다.
    const art = ingredientArtNode(ing.id);
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = copy.recipes.ingredientNames[ing.id];
    card.append(art, name);
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
      toast(copy.economy.giftDone(copy.recipes.ingredientNames[id]));
      // 첫 재료 = 0→1이 확실한 자리 — 어떤 빵이 열렸는지까지 여기서 보여준다
      celebrateIngredients(api, [id]);
    },
  });
}
