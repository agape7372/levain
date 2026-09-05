// 레시피 화면 시각 원형 (2026-09-03 신설 · 2026-09-05 개정: 선반·k/v 정보 행·합성 썸네일·타이포 토큰).
// **DOM 모양만** 만든다. 데이터 판정·핸들러는 호출부(screens/recipes.ts·components/breadSheet.ts·exchangeModal.ts)가 붙인다.
// 클래스 이름은 main.css "레시피"·"선반"·"정보 행"·"시트형 모달"·"재료 칩 그리드" 절과 1:1 — 여기 밖에서 새로 조립하지 말 것.
// 인라인 style 0 (2026-08-26 `font:inherit` 사고 — 시각은 CSS 한 곳).
//
// 2026-09-05 규율 (VISUAL §7-2 개정 — 실측 근거는 플랜 modular-coalescing-tower "UI 실측 결과"):
//  - 240px 미만 열에서 ' · '로 문장을 이어 붙이지 않는다 → 정보는 k/v 행(infoRows). 홈 HUD가 08-25에 배운 것과 같다
//    (실측: 시트 머리 `조금 납작해요. 그래도 맛있어요 · 1번 / 만들었어요 · 변형 1/30`이 구 중간에서 접혔다).
//  - text-overflow: ellipsis는 고정 폭 이름표(HUD 이름 칩)에만. 칩·타일 이름은 2줄 clamp.
//  - 12px(--fs-num)는 숫자 pill 전용. 글자는 13px(--fs-cap) 하한.
//  - 카드는 고정 슬롯(아트/이름 1줄/1행/2행)이라 같은 행의 바닥이 맞는다. 문장은 카드가 아니라 시트가 말한다.
import { breadArt } from '../screens/breadArt';
import { ingredientArt, ingredientArtNode } from '../screens/ingredientArt';
import { ruleByVariantId } from '../../sim';
import type { IngredientId } from '../../sim';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

// ── 아트 ────────────────────────────────────────────────────────────────────

/** 재료 배지 — 베이스 PNG 위 우하단. 자기 폴백(PNG → SVG)을 가진다. `.art`를 중첩하지 않는다(부모 `.X .art img` 규칙 회피) */
function ingredientBadge(id: IngredientId): HTMLElement {
  const badge = el('span', 'art-badge');
  const img = document.createElement('img');
  img.alt = '';
  img.addEventListener('error', () => {
    img.remove();
    badge.appendChild(ingredientArt(id));
  });
  img.src = `/ingredients/thumbs/${id}.png`;
  badge.appendChild(img);
  return badge;
}

/**
 * 빵 아트 — 폴백 사다리 3단: **변형 PNG → 베이스 PNG(+재료 배지) → SVG**.
 * 2026-09-05 전까지는 변형 PNG가 404면 곧장 SVG로 떨어져, 발견한 변형 156종이 "＋ 원"(깜빠뉴 SVG)
 * 플레이스홀더로 보였다(실측 390-05-sheet-variant). 베이스 PNG가 있는데 건너뛴 게 결함이었다.
 * 배지 = 그 변형의 재료 썸네일 — "무엇을 넣었나"를 말하는 다이제틱 표식이지 스티커가 아니다.
 * 전용 PNG(4종)가 로드되면 배지를 붙이지 않는다.
 * @param fallbackId 변형이면 베이스 id. 같으면(베이스 자체) PNG 404 시 곧장 SVG.
 */
export function breadThumb(artId: string, fallbackId: string = artId): HTMLElement {
  const art = el('div', 'art');
  const img = document.createElement('img');
  img.alt = '';
  let step = 0;
  img.addEventListener('error', () => {
    step += 1;
    if (step === 1 && fallbackId !== artId) {
      img.src = `/breads/thumbs/${fallbackId}.png`;
      const ing = ruleByVariantId(artId)?.ingredientId;
      if (ing) art.appendChild(ingredientBadge(ing));
      return;
    }
    img.remove();
    art.appendChild(breadArt(fallbackId));
  });
  img.src = `/breads/thumbs/${artId}.png`;
  art.appendChild(img);
  return art;
}

/** 우상단 pill — 빵 카드 `3/16`(변형 진행, 하나라도 만들었을 때만) / 교환소·재료 칩은 chip-count가 따로 있다 */
export function countPill(text: string, zero: boolean): HTMLElement {
  return el('span', zero ? 'count-pill is-zero' : 'count-pill', text);
}

// ── 정보 행 (k/v) — 시트 머리·결과 카드 공용 ────────────────────────────────

export interface InfoRow {
  k: string;
  v: string;
  /** 값 아래 옅은 보조 줄 — 예: '100g 모자라요'. 정보 톤(--hooch), 경고 아님 */
  note?: string;
  /** 값을 크러스트색 강조로 — 등급 행 */
  grade?: boolean;
}

/** k/v 행 묶음 — ' · ' 체인 문장의 대체물. 라벨은 제자리, 값이 길면 오른쪽 열 안에서만 접힌다 */
export function infoRows(rows: InfoRow[]): HTMLElement {
  const wrap = el('div', 'info-rows');
  for (const r of rows) {
    const row = el('div', 'ir');
    row.appendChild(el('span', 'ir-k', r.k));
    const v = el('span', 'ir-v');
    v.appendChild(el('span', r.grade ? 'grade' : '', r.v));
    if (r.note) v.appendChild(el('span', 'ir-note', r.note));
    row.appendChild(v);
    wrap.appendChild(row);
  }
  return wrap;
}

// ── 빵 카드 (레시피 그리드) ──────────────────────────────────────────────────

export interface BreadCardView {
  id: string;
  name: string;
  /** 미해금 — 아트 회색·이름 옅게, 두 행 슬롯에 해금 힌트 */
  locked: boolean;
  lockedText?: string;
  /** 1행 — 원가 `르방 30g` 또는 discard 표식 `덜어낸 반죽`. 짧은 토큰만(맛 문구는 시트가 말한다) */
  costText: string;
  /** 2행 — 등급 짧은 판(`최고`)과 횟수(`3번`), 또는 보관 부족 안내. 전부 없으면 빈 행(높이는 유지) */
  gradeShort?: string;
  countText?: string;
  shortText?: string;
  /** 변형 진행 pill — done ≥ 1일 때만 붙는다(`0/26`은 소음). 잠긴 카드엔 안 붙인다 */
  progress?: { done: number; total: number };
  /** 방금 해금 — 크림→컬러 wipe (VISUAL §7-2) */
  justUnlocked?: boolean;
}

/** 빵 카드 — 고정 슬롯 4단(아트 / 이름 1줄 / 1행 / 2행). 탭 핸들러는 호출부가 붙인다 */
export function breadCard(v: BreadCardView): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'recipe-card' + (v.locked ? ' locked' : '') + (v.justUnlocked ? ' just-unlocked' : '');
  card.appendChild(breadThumb(v.id));
  if (v.progress && !v.locked && v.progress.done > 0) {
    card.appendChild(countPill(`${v.progress.done}/${v.progress.total}`, false));
  }
  card.appendChild(el('div', 'name', v.name));
  if (v.locked) {
    card.appendChild(el('div', 'locked-text', v.lockedText ?? ''));
    return card;
  }
  card.appendChild(el('div', 'line', v.costText));
  const line2 = el('div', 'line');
  if (v.gradeShort) line2.appendChild(el('span', 'grade', v.gradeShort));
  if (v.gradeShort && v.countText) line2.append(' · ');
  if (v.countText) line2.append(v.countText);
  if (!v.gradeShort && !v.countText && v.shortText) line2.appendChild(el('span', 'short', v.shortText));
  card.appendChild(line2);
  return card;
}

// ── 선반 (구운 빵만, 2D) ────────────────────────────────────────────────────

export interface ShelfTileView {
  /** 도감 키 — 베이스 id 또는 변형 id */
  artId: string;
  fallbackId: string;
  name: string;
  gradeShort?: string;
  countText: string;
  /** 처음 구운 날 — '8월 26일' */
  whenText: string;
}

/** 선반 타일 — 큰 아트 가운데 + 이름 2줄 + 등급·횟수 + 날짜. 탭 = 결과 카드(호출부) */
export function shelfTile(v: ShelfTileView): HTMLButtonElement {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'shelf-tile';
  tile.appendChild(breadThumb(v.artId, v.fallbackId));
  tile.appendChild(el('div', 'name', v.name));
  const line = el('div', 'line');
  if (v.gradeShort) line.appendChild(el('span', 'grade', v.gradeShort));
  if (v.gradeShort) line.append(' · ');
  line.append(v.countText);
  tile.appendChild(line);
  tile.appendChild(el('div', 'line', v.whenText));
  return tile;
}

export function shelfGrid(): HTMLElement {
  return el('div', 'shelf-grid');
}

/** 빈 선반 — 한 줄 + 힌트 한 줄. 버튼 없음(첫 빵은 빵 탭에서 굽는다) */
export function shelfEmpty(text: string, hint: string): HTMLElement {
  const wrap = el('div', 'shelf-empty', text);
  wrap.appendChild(el('span', 'hint', hint));
  return wrap;
}

// ── 통 상태 줄 ───────────────────────────────────────────────────────────────

export interface StatusLineView {
  /** 왼쪽 강조 — '보관 320g' / '보관 없음' */
  pantryText: string;
  pantryEmpty: boolean;
  /** 오른쪽 캡션 — 통 반죽의 발효력·산미('발효력 좋음 · 순함') 또는 빈 통 안내 */
  qualityText: string;
}

/**
 * 통 상태 줄 — 제목 아래. 2026-09-05: "지금 굽기 좋아요"(활성 르방 activity)는 폐지 — 빵은 통에서 나가므로
 * 통의 상태만 말한다(GDD §6-2 개정). 탭 핸들러(통 설명 토스트)는 호출부가 붙인다
 */
export function statusLine(v: StatusLineView): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'status-line';
  btn.appendChild(el('span', v.pantryEmpty ? 'sl-pantry is-empty' : 'sl-pantry', v.pantryText));
  btn.appendChild(el('span', 'sl-quality', v.qualityText));
  return btn;
}

/** 상태 줄 내용 갱신 — 스냅샷마다 다시 만들지 않고 텍스트만 바꾼다 */
export function updateStatusLine(btn: HTMLElement, v: StatusLineView): void {
  const pantry = btn.querySelector('.sl-pantry');
  const quality = btn.querySelector('.sl-quality');
  if (!pantry || !quality) return;
  pantry.textContent = v.pantryText;
  pantry.classList.toggle('is-empty', v.pantryEmpty);
  quality.textContent = v.qualityText;
}

// ── 시트 머리 ────────────────────────────────────────────────────────────────

export interface SheetHeadView {
  /** 아트 id(변형이면 변형 id) + 폴백용 베이스 id */
  artId: string;
  fallbackId: string;
  name: string;
  flavor: string;
  /** 정보 행 — 필요/보관/최고/횟수/변형. 호출부가 copy로 조립한다 */
  rows: InfoRow[];
}

/**
 * 시트 머리 — 아트 가운데 + 이름·맛 가운데 + 정보 행(k/v).
 * 2026-09-05 개정: 이전 판(왼쪽 아트 76px + 오른쪽 텍스트 스택)은 216px 열에서 ' · ' 체인이 구 중간에서 접혔다.
 */
export function sheetHead(v: SheetHeadView): HTMLElement {
  const head = el('div', 'sheet-head');
  head.appendChild(breadThumb(v.artId, v.fallbackId));
  head.appendChild(el('div', 'sh-name', v.name));
  head.appendChild(el('div', 'sh-flavor', v.flavor));
  head.appendChild(infoRows(v.rows));
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

// ── 재료 칩 ──────────────────────────────────────────────────────────────────

/**
 * owned = 또렷 + 수량 / missing = 옅게, 이름은 보인다(무엇이 필요한지) — **수량 pill 없음**(0은 정보가 아니다, 실측 F4)
 * / locked = 잠김(탭하면 이유 토스트) / mystery = 도감 미발견 ?-실루엣(이름 숨김)
 */
export type ChipState = 'owned' | 'missing' | 'locked' | 'mystery';
export interface ChipView {
  /** 재료 id, 또는 '기본' 칩이면 'base'(빵 썸네일을 그린다) */
  id: IngredientId | 'base';
  name: string;
  /** 수량 pill — null이면 안 붙인다('기본'·미보유·미발견). 교환소는 0도 보인다(사고팔기 맥락) */
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
    + (v.state === 'mystery' ? ' chip--mystery' : '')
    + (v.done ? ' chip--done' : '');
  if (v.state === 'locked') chip.setAttribute('aria-disabled', 'true');
  chip.appendChild(v.id === 'base' ? breadThumb(v.baseId ?? '') : ingredientArtNode(v.id));
  if (v.state === 'mystery') {
    chip.appendChild(el('span', 'chip-mark', '?'));
    chip.setAttribute('aria-label', v.name);
    return chip;
  }
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

/** 구분선 행 — 보유 칩과 미보유 칩 사이('아직 없는 재료'). 그리드 한 줄 전체 */
export function chipDivider(label: string): HTMLElement {
  return el('div', 'chip-divider', label);
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

// ── footer 조각 ──────────────────────────────────────────────────────────────

/** footer 왼쪽 텍스트 — 교환소 '딸기 · 3개 있어요' */
export function footerText(strong: string, rest?: string): HTMLElement {
  const node = el('span', 'footer-text');
  node.appendChild(el('b', '', strong));
  if (rest) node.append(` · ${rest}`);
  return node;
}

/** footer 2단(텍스트 줄 위, 버튼 줄 아래) — 버튼 라벨이 긴 교환소용. 반환 노드에 버튼을 넣는다 */
export function footerActions(...buttons: HTMLElement[]): HTMLElement {
  const row = el('div', 'footer-actions');
  row.append(...buttons);
  return row;
}

// ── 결과 카드 ────────────────────────────────────────────────────────────────

export interface ResultCardView {
  /** 아트 노드 — 빵은 breadThumb(변형 id, 베이스 id), 재료는 ingredientArtNode */
  art: HTMLElement;
  name: string;
  /** 한 줄 — 굽기 결과 등급·'빵 N종에 넣을 수 있어요'. 없으면 생략 */
  headline?: string;
  /** 정보 행 — 선반에서 열었을 때(최고/횟수/처음/르방). 없으면 생략 */
  rows?: InfoRow[];
}

/**
 * 결과 카드 — 선반 타일 탭·굽기 결과 3D 폴백·재료 감상 폴백 공용(2026-09-05: 아트 96 → 160px).
 * 아트를 가운데 크게, 그 아래 이름·한 줄·정보 행. footer([3D로 보기][다시 만들기])는 호출부가 modal.ts `footer`로 단다.
 */
export function resultCard(v: ResultCardView): HTMLElement {
  const card = el('div', 'result-card');
  v.art.classList.add('art');
  card.appendChild(v.art);
  card.appendChild(el('div', 'rc-name', v.name));
  if (v.headline) card.appendChild(el('p', 'rc-line', v.headline));
  if (v.rows && v.rows.length > 0) card.appendChild(infoRows(v.rows));
  return card;
}
