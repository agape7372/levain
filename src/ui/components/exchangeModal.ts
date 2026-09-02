// 교환소 + 가루 모으기(미션) — 2026-09-03 개편으로 screens/recipes.ts에서 옮겨 왔다.
// 개편 전엔 30행 × 버튼 2 = 60버튼(모달 안 scrollH 3,641 / 702px)에 잔액이 맨 아래였다.
// 지금은 잔액이 맨 위, 재료는 4열 칩, 버튼 2개는 footer에 고정된다(modal.ts `footer` 옵션).
//
// 도감의 ?-실루엣과 달리 여기선 30종을 전부 이름째 보여준다: 도감은 "만나 본 기록",
// 교환소는 "가져올 수 있는 것"이라 축이 다르다 (사용자 확정 도감 규칙 불변).
// 시각(DOM 모양)은 components/recipeVisuals.ts가 정본. 인라인 style 0.
import { copy } from '../copy';
import { toast } from './toast';
import { openModal } from './modal';
import { celebrateIngredients } from './celebrate';
import { chipGrid, footerActions, footerText, ingredientChip, setChipCount, setChipSelected } from './recipeVisuals';
import {
  INGREDIENTS, INGREDIENT_FLOUR_COST, INGREDIENT_SOFT_CAP, FLOUR_PER_INGREDIENT,
  MISSION_REWARD_FLOUR, RECIPE_REWARD_FLOUR, STAGE_REWARD_FLOUR,
} from '../../sim';
import type { IngredientId } from '../../sim';
import type { GameApi } from '../gameApi';

/** 미션 — 누적만 말한다. 남은 기한·연속 기록은 존재하지 않는다 (§9) */
export function openMissionsModal(api: GameApi): void {
  const eco = api.economy();
  const wrap = document.createElement('div');

  const intro = document.createElement('p');
  intro.className = 'modal-body';
  intro.textContent = copy.economy.missionsIntro;
  wrap.appendChild(intro);

  const rows = document.createElement('div');
  rows.className = 'observe-rows';
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
  wrap.appendChild(rows);

  openModal(wrap, { title: copy.economy.missionsTitle });
}

/**
 * 교환소 — 가루로 원하는 재료를 가져오고, 남는 재료는 가루로 되돌린다 (§9).
 * @param onChanged 재고·잔액이 바뀌었을 때 (레시피 화면 그리드 갱신)
 */
export function openExchangeModal(api: GameApi, onChanged: () => void): void {
  const body = document.createElement('div');

  // ── 머리: 잔액 + 가루 모으기 ──
  const head = document.createElement('div');
  head.className = 'exchange-head';
  const amount = document.createElement('span');
  amount.className = 'econ-amount';
  const missionsBtn = document.createElement('button');
  missionsBtn.type = 'button';
  missionsBtn.className = 'btn btn-ghost btn-slim';
  missionsBtn.textContent = copy.economy.missionsTitle;
  // 모달 위 모달 금지 — 교환소를 닫고 연다 (레포 규약)
  missionsBtn.addEventListener('click', () => {
    handle.close();
    openMissionsModal(api);
  });
  head.append(amount, missionsBtn);
  body.appendChild(head);

  // ── 광고 배송 — SDK 없으면(웹·구셸) 행 자체가 없다. 버전 스큐 방어(확장기획 §10) ──
  if (api.ads.available()) {
    const adRow = document.createElement('div');
    adRow.className = 'option-item exchange-row exchange-ad';
    const adTexts = document.createElement('span');
    adTexts.className = 'exchange-texts';
    const adLabel = document.createElement('span');
    adLabel.textContent = copy.economy.adDeliveryTitle;
    const adHint = document.createElement('span');
    adHint.className = 'hint';
    adTexts.append(adLabel, adHint);
    const adBtn = document.createElement('button');
    adBtn.type = 'button';
    adBtn.className = 'btn btn-primary btn-slim';
    adRow.append(adTexts, adBtn);
    body.appendChild(adRow);

    const paintAdRow = (): void => {
      const remaining = api.ads.deliveryRemaining();
      adHint.textContent = remaining > 0
        ? copy.economy.adDeliveryRemaining(remaining)
        : copy.economy.adDeliveryDone;
      const locked = remaining <= 0;
      adBtn.classList.toggle('is-locked', locked);
      adBtn.setAttribute('aria-disabled', String(locked));
      adBtn.textContent = copy.economy.adDeliveryTitle;
    };
    adBtn.addEventListener('click', () => {
      if (api.ads.deliveryRemaining() <= 0) {
        toast(copy.economy.adDeliveryDone);
        return;
      }
      const before = api.inventory();
      // 재생 중 잠금은 정당한 disabled — 연타로 두 번 재생되는 걸 막는 로딩 상태다
      adBtn.disabled = true;
      adBtn.textContent = copy.economy.adDeliveryWatching;
      void api.ads.watchForDelivery().then((id) => {
        adBtn.disabled = false;
        paintAdRow();
        if (id === null) {
          toast(copy.economy.adDeliveryFailed);
          return;
        }
        toast(copy.economy.adDeliveryGot(copy.recipes.ingredientNames[id]));
        refresh();
        onChanged();
        // 0→1일 때만 연출 — 이미 있던 재료를 더 받는 건 토스트로 충분하다
        if ((before[id] ?? 0) === 0) celebrateIngredients(api, [id]);
      });
    });
    paintAdRow();
  }

  // ── 재료 30종 칩 ──
  // 캡에 닿은 재료도 칩은 그대로 둔다(고를 수는 있다) — 못 사는 이유는 footer 버튼이 말한다
  const grid = chipGrid();
  const chips = new Map<IngredientId, HTMLButtonElement>();
  let selected: IngredientId | null = null;
  for (const ing of INGREDIENTS) {
    const chip = ingredientChip({
      id: ing.id,
      name: copy.recipes.ingredientNames[ing.id],
      count: api.inventory()[ing.id] ?? 0,
      state: 'owned',
      done: false,
    });
    chip.addEventListener('click', () => {
      selected = ing.id;
      chips.forEach((c, k) => setChipSelected(c, k === ing.id));
      refresh();
    });
    chips.set(ing.id, chip);
    grid.appendChild(chip);
  }
  body.appendChild(grid);

  // ── footer: 선택한 재료 + 사기/팔기 ──
  // footer 2단 — 텍스트 줄 + 버튼 줄(라벨이 길어 한 줄엔 셋이 안 들어간다, VISUAL §7-2)
  const footer = document.createElement('div');
  footer.className = 'modal-footer--stack';
  let text = footerText(copy.economy.pickOne);
  const buyBtn = document.createElement('button');
  buyBtn.type = 'button';
  buyBtn.className = 'btn btn-primary btn-slim';
  buyBtn.textContent = copy.economy.buy(INGREDIENT_FLOUR_COST);
  const sellBtn = document.createElement('button');
  sellBtn.type = 'button';
  sellBtn.className = 'btn btn-ghost btn-slim';
  sellBtn.textContent = copy.economy.sell(FLOUR_PER_INGREDIENT);
  footer.append(text, footerActions(buyBtn, sellBtn));

  // ★disabled 금지(항아리·냉장 세그먼트와 같은 원칙) — 클릭이 살아야 아래 핸들러의
  // pickOne·atCap·notEnough·noStock 토스트가 이유를 말한다.
  const lock = (btn: HTMLButtonElement, on: boolean): void => {
    btn.classList.toggle('is-locked', on);
    btn.setAttribute('aria-disabled', String(on));
  };

  function refresh(): void {
    const inv = api.inventory();
    const eco = api.economy();
    amount.textContent = copy.economy.flourLabel(eco.flour);
    chips.forEach((chip, id) => setChipCount(chip, inv[id] ?? 0));
    const next = selected === null
      ? footerText(copy.economy.pickOne)
      : footerText(
          copy.recipes.ingredientNames[selected],
          (inv[selected] ?? 0) >= INGREDIENT_SOFT_CAP
            ? copy.economy.haveFull(inv[selected] ?? 0)
            : copy.economy.have(inv[selected] ?? 0),
        );
    text.replaceWith(next);
    text = next;
    const have = selected === null ? 0 : inv[selected] ?? 0;
    lock(buyBtn, selected === null || eco.flour < INGREDIENT_FLOUR_COST || have >= INGREDIENT_SOFT_CAP);
    lock(sellBtn, selected === null || have < 1);
  }

  buyBtn.addEventListener('click', () => {
    const id = selected;
    if (id === null) {
      toast(copy.economy.pickOne);
      return;
    }
    const before = api.inventory()[id] ?? 0;
    if (before >= INGREDIENT_SOFT_CAP) {
      toast(copy.economy.atCap(INGREDIENT_SOFT_CAP));
      return;
    }
    if (!api.buyIngredient(id)) {
      toast(copy.economy.notEnough);
      return;
    }
    toast(copy.economy.bought(copy.recipes.ingredientNames[id]));
    refresh();
    onChanged();
    if (before === 0) celebrateIngredients(api, [id]);
  });

  sellBtn.addEventListener('click', () => {
    const id = selected;
    if (id === null) {
      toast(copy.economy.pickOne);
      return;
    }
    if (!api.exchangeIngredient(id)) {
      toast(copy.economy.noStock);
      return;
    }
    toast(copy.economy.sold(FLOUR_PER_INGREDIENT));
    refresh();
    onChanged();
  });

  refresh();
  const handle = openModal(body, { title: copy.economy.exchangeTitle, footer });
}
