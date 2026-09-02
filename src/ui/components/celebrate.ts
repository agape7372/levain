// 획득 연출 — "새 재료·새 레시피가 열렸어요" (2026-09-03 신설, 정본: docs/GDD.md §5 획득 연출 행).
// 모달이 아니라 **비차단 레이어**(.celebrate-layer): 교환소 모달 위에서도 뜨고 탭 또는 시간 경과로 사라진다.
// 다이제틱 규칙(무캐릭터): 밀가루 모트·카드 와이프만. 하트·별·컨페티 금지.
// ★API는 고정 — 호출부(레시피 화면·교환소·선물 피커·app.ts)가 이 두 함수만 안다.
//
// 여러 개가 한꺼번에 열릴 때: 300ms 수집 창에 들어온 트리거를 **한 장으로 병합**한다(재료 아트 최대 3 + N,
// 빵 스트립 최대 6 + 외 N종). 표시 중에 또 오면 최소 1.2s 지난 뒤 교체(그 안에 오면 다음 장에 병합).
import type { IngredientId } from '../../sim';
import {
  FRIDGE_STAGE, INGREDIENTS, LABEL_STAGE, RATIOS, RECIPES, playableRules, recipeById, variantIdOf,
} from '../../sim';
import type { GameApi } from '../gameApi';
import { copy } from '../copy';
import { haptic } from '../../platform/haptics';
import { sfxUnlock } from '../../audio/sounds';
import { ingredientArtNode } from '../screens/ingredientArt';
import { breadThumb } from './recipeVisuals';

const COLLECT_MS = 300;      // 트리거 수집 창 — 선물·구매·치트가 연달아 와도 한 장
const MIN_SHOW_MS = 1200;    // 이미 떠 있는 장을 교체하기 전 최소 노출
const AUTO_DISMISS_MS = 2600;
const LEAVE_MS = 240;
const MAX_HERO = 3;
const MAX_STRIP = 6;
const MOTES = 14;

interface Pending {
  ingredients: Set<IngredientId>;
  stages: number[];
}

let pending: Pending | null = null;
let collectTimer: ReturnType<typeof setTimeout> | null = null;
let current: { layer: HTMLElement; shownAt: number; dismissTimer: ReturnType<typeof setTimeout> | null } | null = null;
let queued: (() => void) | null = null;

/** 재료 수량이 0→1이 된 직후(선물·구매·광고 배송·치트) 호출. 열린 빵 계산은 내부에서 한다. */
export function celebrateIngredients(api: GameApi, ids: IngredientId[]): void {
  if (ids.length === 0) return;
  pending ??= { ingredients: new Set(), stages: [] };
  for (const id of ids) pending.ingredients.add(id);
  scheduleFlush(api);
}

/** 성장 단계 승급 직후(stageUp 이벤트) 호출. 새로 열린 베이스 레시피를 스트립으로 보여준다. */
export function celebrateStageUp(api: GameApi, stage: number): void {
  pending ??= { ingredients: new Set(), stages: [] };
  if (!pending.stages.includes(stage)) pending.stages.push(stage);
  scheduleFlush(api);
}

function scheduleFlush(api: GameApi): void {
  if (collectTimer) clearTimeout(collectTimer);
  collectTimer = setTimeout(() => {
    collectTimer = null;
    const p = pending;
    pending = null;
    if (p) present(api, p);
  }, COLLECT_MS);
}

/** 이 재료들로 지금 새로 열리는 베이스 빵 — 해금된 단계 + 미발견 변형이 하나라도 있는 것(RECIPES 순서) */
function openedBases(api: GameApi, ids: Set<IngredientId>): string[] {
  const stage = api.getSnapshot().stage;
  const collection = api.collection();
  const bases = new Set<string>();
  for (const rule of playableRules()) {
    if (!ids.has(rule.ingredientId)) continue;
    const recipe = recipeById(rule.baseRecipeId);
    if (!recipe || recipe.stage > stage) continue;
    if (variantIdOf(rule) in collection) continue;
    bases.add(rule.baseRecipeId);
  }
  return RECIPES.filter((r) => bases.has(r.id)).map((r) => r.id);
}

function present(api: GameApi, p: Pending): void {
  const show = (): void => {
    const layer = build(api, p);
    document.getElementById('ui-root')?.appendChild(layer);
    requestAnimationFrame(() => layer.classList.add('show'));
    // 승급이 섞여 있으면 app.ts의 stageUp 분기가 이미 sfxUnlock·haptic('success')·기포 팝을 냈다 — 두 번 울리지 않는다
    if (p.stages.length === 0) {
      haptic('light');
      sfxUnlock();
    }
    current = { layer, shownAt: Date.now(), dismissTimer: setTimeout(() => dismiss(), AUTO_DISMISS_MS) };
    layer.addEventListener('pointerdown', () => dismiss());
  };

  if (!current) {
    show();
    return;
  }
  // 떠 있는 장이 있으면 최소 노출을 채운 뒤 교체 — 그 사이 또 오면 마지막 것으로 덮는다(병합은 collect 창이 맡는다)
  const wait = Math.max(0, MIN_SHOW_MS - (Date.now() - current.shownAt));
  queued = show;
  setTimeout(() => {
    if (queued !== show) return;
    queued = null;
    dismiss();
    setTimeout(show, LEAVE_MS);
  }, wait);
}

function dismiss(): void {
  const c = current;
  if (!c) return;
  current = null;
  if (c.dismissTimer) clearTimeout(c.dismissTimer);
  c.layer.classList.add('leaving');
  c.layer.classList.remove('show');
  setTimeout(() => c.layer.remove(), LEAVE_MS);
}

function build(api: GameApi, p: Pending): HTMLElement {
  const layer = document.createElement('div');
  layer.className = 'celebrate-layer';
  layer.setAttribute('role', 'status');
  layer.setAttribute('aria-live', 'polite');
  const card = document.createElement('div');
  card.className = 'celebrate-card';
  layer.appendChild(card);

  const ings = INGREDIENTS.filter((i) => p.ingredients.has(i.id)).map((i) => i.id); // 카탈로그 순서
  const stages = [...p.stages].sort((a, b) => a - b);
  const topStage = stages[stages.length - 1];

  // ── 히어로 ──
  const hero = document.createElement('div');
  hero.className = 'celebrate-hero';
  if (ings.length > 0) {
    if (ings.length > 1) hero.classList.add('multi');
    for (const id of ings.slice(0, MAX_HERO)) {
      const slot = document.createElement('div');
      slot.className = 'hero-slot';
      const art = ingredientArtNode(id);
      art.classList.add('hero-art');
      slot.appendChild(art);
      hero.appendChild(slot);
    }
    if (ings.length > MAX_HERO) {
      const more = document.createElement('span');
      more.className = 'hero-more';
      more.textContent = `+${ings.length - MAX_HERO}`;
      hero.appendChild(more);
    }
  } else if (topStage !== undefined) {
    const disc = document.createElement('div');
    disc.className = 'hero-art hero-stage';
    disc.textContent = String(topStage);
    hero.appendChild(disc);
  }
  for (let i = 0; i < MOTES; i++) {
    const mote = document.createElement('span');
    mote.className = 'mote';
    // 방사각은 균등 + 지터, 거리·크기·지연은 불규칙(기계적으로 안 보이게 — css-animations 메타 패턴 2)
    const jitter = ((i * 7) % 5) * 4 - 8;
    mote.style.setProperty('--r', `${Math.round((360 / MOTES) * i + jitter)}deg`);
    mote.style.setProperty('--dist', `-${46 + ((i * 11) % 4) * 8}px`);
    mote.style.setProperty('--size', `${4 + ((i * 5) % 3)}px`);
    mote.style.setProperty('--d', `${0.1 + ((i * 3) % 4) * 0.04}s`);
    hero.appendChild(mote);
  }
  card.appendChild(hero);

  // ── 제목·부제 ──
  const title = document.createElement('p');
  title.className = 'celebrate-title';
  if (ings.length === 1) title.textContent = copy.celebrate.gotIngredient(copy.recipes.ingredientNames[ings[0]]);
  else if (ings.length > 1) title.textContent = copy.celebrate.gotIngredients(ings.length);
  else if (topStage !== undefined) title.textContent = copy.celebrate.stageUp(copy.stage.names[topStage]);
  card.appendChild(title);

  // 열린 빵 = 재료로 열린 베이스 ∪ 승급으로 해금된 베이스
  const opened = new Set<string>(openedBases(api, p.ingredients));
  for (const s of stages) for (const r of RECIPES) if (r.stage === s) opened.add(r.id);
  const openedIds = RECIPES.filter((r) => opened.has(r.id)).map((r) => r.id);

  const sub = document.createElement('p');
  sub.className = 'celebrate-sub';
  sub.textContent = openedIds.length > 0 ? copy.celebrate.openedBreads(openedIds.length) : copy.celebrate.openedNone;
  card.appendChild(sub);

  // 승급 부수 해금 — 냉장·비율·이름표 (재료 제목 뒤에도 붙는다)
  const extras: string[] = [];
  for (const s of stages) {
    if (ings.length > 0) extras.push(copy.celebrate.stageUp(copy.stage.names[s]));
    if (s === FRIDGE_STAGE) extras.push(copy.celebrate.fridgeUnlocked);
    for (const [ratio, def] of Object.entries(RATIOS)) if (def.stage === s && s > 0) extras.push(copy.celebrate.ratioUnlocked(ratio));
    if (s === LABEL_STAGE) extras.push(copy.stage.labelUnlocked);
  }
  for (const line of extras) {
    const e = document.createElement('p');
    e.className = 'celebrate-extra';
    e.textContent = line;
    card.appendChild(e);
  }

  // ── 열린 빵 스트립 ──
  if (openedIds.length > 0) {
    const strip = document.createElement('div');
    strip.className = 'celebrate-strip';
    openedIds.slice(0, MAX_STRIP).forEach((id, i) => {
      const item = document.createElement('div');
      item.className = 'celebrate-item';
      item.style.setProperty('--i', String(i));
      item.appendChild(breadThumb(id));
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = copy.recipes.names[id] ?? id;
      item.appendChild(name);
      strip.appendChild(item);
    });
    if (openedIds.length > MAX_STRIP) {
      const more = document.createElement('div');
      more.className = 'celebrate-item more';
      more.style.setProperty('--i', String(MAX_STRIP));
      more.textContent = copy.celebrate.moreBreads(openedIds.length - MAX_STRIP);
      strip.appendChild(more);
    }
    card.appendChild(strip);
  }

  const hint = document.createElement('p');
  hint.className = 'celebrate-hint';
  hint.textContent = copy.celebrate.dismissHint;
  card.appendChild(hint);
  return layer;
}
