// 레시피 화면 시각 원형 (2026-09-03) — 카드·상태 줄·시트 머리·재료 칩·형태 행.
// **DOM 모양만** 만든다. 데이터 판정·핸들러는 호출부(screens/recipes.ts·components/breadSheet.ts·exchangeModal.ts)가 붙인다.
// 클래스 이름은 main.css "레시피"·"시트형 모달"·"재료 칩 그리드" 절과 1:1 — 여기 밖에서 이 클래스를 새로 조립하지 말 것.
// 인라인 style 0 (2026-08-26 `font:inherit` 사고 — 시각은 CSS 한 곳).
import { breadArt } from '../screens/breadArt';
import { ingredientArtNode } from '../screens/ingredientArt';
import type { IngredientId } from '../../sim';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * 빵 아트 — 썸네일 PNG 우선, 404면 SVG 폴백.
 * @param fallbackId 변형은 전용 SVG가 없으니 베이스 id를 넘기면 실제 모양(scone/focaccia)으로 그려진다.
 */
export function breadThumb(recipeId: string, fallbackId: string = recipeId): HTMLElement {
  const art = el('div', 'art');
  const img = document.createElement('img');
  img.src = `/breads/thumbs/${recipeId}.png`;
  img.alt = '';
  img.addEventListener('error', () => {
    img.remove();
    art.appendChild(breadArt(fallbackId));
  });
  art.appendChild(img);
  return art;
}

/** 우상단 pill — 빵 카드 `3/16`(변형 진행) / 재료 카드 `9`(수량). 0이면 옅게 */
export function countPill(text: string, zero: boolean): HTMLElement {
  return el('span', zero ? 'count-pill is-zero' : 'count-pill', text);
}

export interface BreadCardView {
  id: string;
  name: string;
  /** 미해금 — 아트 회색·이름 옅게, 원가 자리에 해금 힌트 */
  locked: boolean;
  lockedText?: string;
  /** 원가 줄 — **항상** 표시 (discard 레시피는 맛 문구) */
  costText: string;
  /** 보관이 모자랄 때 원가 옆 옅은 안내 (예: '보관 부족') — 없으면 생략 */
  shortText?: string;
  /** 등급·횟수 — 발견한 빵만 */
  gradeText?: string;
  countText?: string;
  /** 변형 진행 pill — 잠긴 카드엔 안 붙인다 */
  progress?: { done: number; total: number };
  /** 방금 해금 — 크림→컬러 wipe (VISUAL §7-2) */
  justUnlocked?: boolean;
}

/** 빵 카드 — 레시피 그리드 한 칸. 탭 핸들러는 호출부가 붙인다 */
export function breadCard(v: BreadCardView): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'recipe-card' + (v.locked ? ' locked' : '') + (v.justUnlocked ? ' just-unlocked' : '');
  card.appendChild(breadThumb(v.id));
  if (v.progress && !v.locked) {
    card.appendChild(countPill(`${v.progress.done}/${v.progress.total}`, v.progress.done === 0));
  }
  card.appendChild(el('div', 'name', v.name));
  const cost = el('div', 'cost', v.locked ? (v.lockedText ?? '') : v.costText);
  if (!v.locked && v.shortText) {
    cost.append(' · ');
    cost.appendChild(el('span', 'short', v.shortText));
  }
  card.appendChild(cost);
  if (!v.locked && (v.gradeText || v.countText)) {
    const meta = el('div', 'meta');
    if (v.gradeText) meta.appendChild(el('span', 'grade', v.gradeText));
    if (v.gradeText && v.countText) meta.append(' · ');
    if (v.countText) meta.append(v.countText);
    card.appendChild(meta);
  }
  return card;
}

export interface IngredientCardView {
  id: IngredientId;
  name: string;
  /** 도감 밝혀짐 여부 — 아니면 ?-실루엣 */
  known: boolean;
  count: number;
}

/** 재료 카드 — 이름 + 우상단 수량 pill (개편 전 `딸기 · 9개` 텍스트 폐지) */
export function ingredientCard(v: IngredientCardView): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = v.known ? 'recipe-card' : 'recipe-card mystery';
  card.appendChild(ingredientArtNode(v.id));
  if (v.known) {
    card.appendChild(countPill(String(v.count), v.count === 0));
    card.appendChild(el('div', 'name', v.name));
  } else {
    card.appendChild(el('div', 'mystery-mark', '?'));
  }
  return card;
}

export interface StatusLineView {
  /** 왼쪽 앞부분 — 르방 이름 */
  name: string;
  /** 왼쪽 강조부 — '지금 굽기 좋아요' / 'N시간 뒤쯤 굽기 좋아요' */
  readyText: string;
  ready: boolean;
  /** 오른쪽 — '보관 320g' / '보관 없음' */
  pantryText: string;
  pantryEmpty: boolean;
}

/** 굽기 상태 줄 — 제목 아래. 탭 핸들러(띄워보기 토스트)는 호출부가 붙인다 */
export function statusLine(v: StatusLineView): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'status-line';
  const left = el('span', 'sl-left');
  left.append(`${v.name} · `);
  left.appendChild(el('span', v.ready ? 'sl-ready' : '', v.readyText));
  btn.appendChild(left);
  btn.appendChild(el('span', v.pantryEmpty ? 'sl-pantry is-empty' : 'sl-pantry', v.pantryText));
  return btn;
}

/** 상태 줄 내용 갱신 — 스냅샷마다 다시 만들지 않고 텍스트만 바꾼다 */
export function updateStatusLine(btn: HTMLElement, v: StatusLineView): void {
  const left = btn.querySelector('.sl-left');
  const pantry = btn.querySelector('.sl-pantry');
  if (!left || !pantry) return;
  left.textContent = '';
  left.append(`${v.name} · `);
  left.appendChild(el('span', v.ready ? 'sl-ready' : '', v.readyText));
  pantry.textContent = v.pantryText;
  pantry.classList.toggle('is-empty', v.pantryEmpty);
}

export interface SheetHeadView {
  /** 아트 id(변형이면 변형 id) + SVG 폴백용 베이스 id */
  artId: string;
  fallbackId: string;
  name: string;
  flavor: string;
  /** '르방 100g 필요 · 보관 320g' — discard면 빈 문자열 */
  costText: string;
  /** 보관이 모자랄 때 원가 줄 뒤에 옅게 (예: '100g 모자라요') */
  shortText?: string;
  /** '최고예요 · 3번' — 없으면 생략 */
  gradeText?: string;
  countText?: string;
  /** '변형 3/16' */
  progressText?: string;
}

/** 시트 머리 — 큰 아트 + 텍스트 스택 */
export function sheetHead(v: SheetHeadView): HTMLElement {
  const head = el('div', 'sheet-head');
  head.appendChild(breadThumb(v.artId, v.fallbackId));
  const text = el('div', 'sh-text');
  text.appendChild(el('div', 'sh-name', v.name));
  text.appendChild(el('div', 'sh-flavor', v.flavor));
  if (v.costText) {
    const cost = el('div', 'sh-cost', v.costText);
    if (v.shortText) {
      cost.append(' · ');
      cost.appendChild(el('span', 'short', v.shortText));
    }
    text.appendChild(cost);
  }
  if (v.gradeText || v.countText || v.progressText) {
    const meta = el('div', 'sh-meta');
    const parts: Node[] = [];
    if (v.gradeText) parts.push(el('span', 'grade', v.gradeText));
    if (v.countText) parts.push(document.createTextNode(v.countText));
    if (v.progressText) parts.push(document.createTextNode(v.progressText));
    parts.forEach((p, i) => {
      if (i > 0) meta.append(' · ');
      meta.appendChild(p);
    });
    text.appendChild(meta);
  }
  head.appendChild(text);
  return head;
}

/** 절 제목 — '재료 넣기' + 오른쪽 옅은 힌트 */
export function sheetLabel(text: string, hint?: string): HTMLElement {
  const label = el('div', 'sheet-label', text);
  if (hint) label.appendChild(el('span', 'hint', hint));
  return label;
}

/** 선택 요약 한 줄 — 내용은 호출부가 `setSummary`로 채운다 */
export function sheetSummary(): HTMLElement {
  return el('div', 'sheet-summary');
}
export function setSummary(node: HTMLElement, strong: string, rest?: string): void {
  node.textContent = '';
  node.appendChild(el('b', '', strong));
  if (rest) node.append(` · ${rest}`);
}

export type ChipState = 'owned' | 'missing' | 'locked';
export interface ChipView {
  /** 재료 id, 또는 '기본' 칩이면 'base'(빵 썸네일을 그린다) */
  id: IngredientId | 'base';
  name: string;
  /** 수량 pill — null이면 안 붙인다('기본' 칩·교환소 0개 표시는 0) */
  count: number | null;
  state: ChipState;
  /** 발견한 변형이 있는 재료 — ✓ */
  done?: boolean;
  /** id==='base'일 때 그릴 빵 id */
  baseId?: string;
}

/** 재료 칩 — 4열 그리드 한 칸. 탭 핸들러는 호출부. 선택 표시는 `setChipSelected` */
export function ingredientChip(v: ChipView): HTMLButtonElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip'
    + (v.state === 'missing' ? ' chip--missing' : '')
    + (v.state === 'locked' ? ' is-locked' : '')
    + (v.done ? ' chip--done' : '');
  if (v.state === 'locked') chip.setAttribute('aria-disabled', 'true');
  chip.appendChild(v.id === 'base' ? breadThumb(v.baseId ?? '') : ingredientArtNode(v.id));
  if (v.count !== null) chip.appendChild(el('span', v.count === 0 ? 'chip-count is-zero' : 'chip-count', String(v.count)));
  chip.appendChild(el('span', 'chip-name', v.name));
  return chip;
}

export function setChipSelected(chip: HTMLElement, on: boolean): void {
  chip.classList.toggle('selected', on);
  chip.setAttribute('aria-pressed', String(on));
}

/** 칩 수량 pill 갱신 (교환소 구매·판매 뒤) */
export function setChipCount(chip: HTMLElement, count: number): void {
  const pill = chip.querySelector('.chip-count');
  if (!pill) return;
  pill.textContent = String(count);
  pill.classList.toggle('is-zero', count === 0);
}

export function chipGrid(): HTMLElement {
  return el('div', 'chip-grid');
}

export interface FormPillView {
  key: string;
  label: string;
  /** 오른쪽 옅은 힌트 — '1개를 넣어요' / '3번' */
  hint?: string;
  done?: boolean;
  selected?: boolean;
}

/**
 * 형태 서브선택 행 — 고른 칩 **바로 뒤에** 끼워 넣으면 그리드 한 줄 전체로 펼쳐진다.
 * 반환된 행의 `.form-pill`은 `data-key`로 식별. 선택 표시는 `setFormSelected`
 */
export function formsRow(items: FormPillView[], onPick: (key: string) => void): HTMLElement {
  const row = el('div', 'chip-forms');
  for (const it of items) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'form-pill' + (it.done ? ' is-done' : '') + (it.selected ? ' selected' : '');
    pill.dataset.key = it.key;
    pill.append(it.label);
    if (it.hint) pill.appendChild(el('span', 'fp-hint', it.hint));
    pill.addEventListener('click', () => onPick(it.key));
    row.appendChild(pill);
  }
  return row;
}

export function setFormSelected(row: HTMLElement, key: string): void {
  row.querySelectorAll<HTMLElement>('.form-pill').forEach((p) => p.classList.toggle('selected', p.dataset.key === key));
}

/** footer 왼쪽 텍스트 — 교환소 '딸기 · 3개 있어요' */
export function footerText(strong: string, rest?: string): HTMLElement {
  const node = el('span', 'footer-text');
  node.appendChild(el('b', '', strong));
  if (rest) node.append(` · ${rest}`);
  return node;
}

/** footer 2단(텍스트 줄 + 버튼 줄) — 버튼 라벨이 긴 교환소용. 반환 노드에 버튼을 넣는다 */
export function footerActions(...buttons: HTMLElement[]): HTMLElement {
  const row = el('div', 'footer-actions');
  row.append(...buttons);
  return row;
}

/**
 * 결과 카드 — 3D 쇼케이스가 없거나 실패했을 때의 폴백(빵 굽기 결과·재료 감상).
 * 아트를 가운데 크게, 그 아래 이름·한 줄. 시트 머리(왼쪽 아트)와는 다른 그림이라 따로 둔다.
 */
export function resultCard(art: HTMLElement, name: string, headline?: string): HTMLElement {
  const card = el('div', 'result-card');
  art.classList.add('art');
  card.appendChild(art);
  card.appendChild(el('div', 'rc-name', name));
  if (headline) card.appendChild(el('p', 'rc-line', headline));
  return card;
}
