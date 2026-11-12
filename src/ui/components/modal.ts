// 모달 = 중앙 팝업 고정.
// <!-- 되돌림 방지: 사용자 확정 규칙 — 모달은 중앙 팝업. 바닥 시트로 바꾸지 말 것 -->
// 등장 scale 0.96→1 + opacity 0.22s, 백드롭 탭·백버튼으로 닫힘 (ARCHITECTURE §5).

export interface ModalHandle {
  close(): void;
  readonly el: HTMLElement;
}

let openModals: ModalHandle[] = [];
let titleSeq = 0;
let escBound = false;

/** 열린 모달이 있으면 최상단을 닫는다 — Android backButton 계약 1순위 */
export function closeTopModal(): boolean {
  const top = openModals[openModals.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function hasOpenModal(): boolean {
  return openModals.length > 0;
}

export interface ModalOptions {
  title?: string;
  /** 백드롭 탭으로 닫기 허용 (기본 true) */
  dismissible?: boolean;
  onClose?: () => void;
  /**
   * 시트형(2026-09-03): 본문은 `.modal-scroll`에서 스크롤하고 footer는 카드 하단에 **고정**된다.
   * 굽기·교환처럼 목록이 길어도 주 버튼이 항상 보여야 하는 모달용 — 이전엔 `굽기`가 31행 아래 있었다.
   */
  footer?: HTMLElement;
  /** 제목(h2)이 없는 모달의 접근 가능한 이름 — 시트형(빵 시트·선반 카드)처럼 제목 없이 여는 곳에서 넘긴다 */
  ariaLabel?: string;
}

/**
 * 모달 동안 뒤 화면을 inert로 — TalkBack·키보드가 딤 뒤 HUD로 새지 않게(T5-03).
 * 토스트(aria-live)와 획득 연출(모달 위 비차단 레이어)은 살린다: inert면 토스트가 안 읽힌다.
 * 이미 inert인 것은 건드리지 않아야 겹친 모달이 닫힐 때 아래 모달 몫을 풀지 않는다.
 */
function inertBehind(backdrop: HTMLElement): () => void {
  const root = document.getElementById('ui-root');
  const others = [...Array.from(root?.children ?? []), document.getElementById('tabs')].filter(
    (e): e is HTMLElement =>
      e instanceof HTMLElement && e !== backdrop && !e.inert &&
      !e.classList.contains('toast-container') && !e.classList.contains('celebrate-layer'),
  );
  for (const e of others) e.inert = true;
  return () => { for (const e of others) e.inert = false; };
}

export function openModal(content: HTMLElement, opts: ModalOptions = {}): ModalHandle {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.tabIndex = -1; // 버튼 없는 모달은 카드 자체가 포커스를 받는다
  if (!opts.title && opts.ariaLabel) card.setAttribute('aria-label', opts.ariaLabel);

  // 시트형이면 제목·본문은 스크롤 영역에, footer는 카드에 직접 — 카드가 flex column이라 footer가 바닥에 붙는다
  const body = opts.footer ? document.createElement('div') : card;
  if (opts.footer) {
    card.classList.add('modal-card--sheet');
    body.className = 'modal-scroll';
    card.appendChild(body);
  }
  if (opts.title) {
    const h = document.createElement('h2');
    h.className = 'modal-title';
    h.id = `modal-title-${++titleSeq}`;
    h.textContent = opts.title;
    card.setAttribute('aria-labelledby', h.id);
    body.appendChild(h);
  }
  body.appendChild(content);
  if (opts.footer) {
    opts.footer.classList.add('modal-footer');
    card.appendChild(opts.footer);
  }
  backdrop.appendChild(card);
  // 연 자리는 inert를 걸기 **전에** 잡는다 — 포커스된 단추가 inert 안에 들면 activeElement가 body로 빠진다
  const prevFocus = document.activeElement as HTMLElement | null;
  const releaseInert = typeof HTMLElement === 'undefined' ? () => {} : inertBehind(backdrop); // node 테스트 스텁엔 DOM 클래스가 없다
  document.getElementById('ui-root')?.appendChild(backdrop);

  requestAnimationFrame(() => backdrop.classList.add('open'));

  // 포커스는 모달 안으로, 닫으면 연 자리로 (가둠까지는 하지 않는다 — 뒤는 inert라 Tab이 새지 않는다).
  // preventScroll — 긴 시트가 첫 단추 자리로 스크롤된 채 열리지 않게, 닫힐 때 뒤 화면이 튀지 않게
  (card.querySelector('button') ?? card).focus({ preventScroll: true });
  // Esc = 맨 위 모달 닫기 (Android 뒤로와 같은 계약 — router의 closeTopModal). 문서에 한 번만 건다
  if (!escBound && typeof document.addEventListener === 'function') {
    escBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && closeTopModal()) e.preventDefault();
    });
  }

  let closed = false;
  const handle: ModalHandle = {
    el: card,
    close() {
      if (closed) return;
      closed = true;
      // 퇴장 240ms 동안 버튼이 살아 있어 두 번째 탭이 굽기·밥을 한 번 더 불렀다 (T7-01).
      // 카드만 끈다 — 백드롭은 탭을 계속 받아 밑 화면으로 새지 않게 한다
      card.style.pointerEvents = 'none';
      card.inert = true;
      openModals = openModals.filter((m) => m !== handle);
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), 240);
      releaseInert(); // 포커스 복귀보다 먼저 — inert인 채로는 focus()가 먹지 않는다
      prevFocus?.focus?.({ preventScroll: true });
      opts.onClose?.();
    },
  };

  if (opts.dismissible !== false) {
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) handle.close();
    });
  }

  openModals.push(handle);
  return handle;
}

/** 확인 모달 — 버튼 1~2개 헬퍼 */
export function confirmModal(opts: {
  title?: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}): ModalHandle {
  const wrap = document.createElement('div');
  const p = document.createElement('p');
  p.className = 'modal-body';
  p.textContent = opts.body;
  wrap.appendChild(p);

  const row = document.createElement('div');
  row.className = 'modal-actions';
  if (opts.cancelLabel) {
    const cancel = document.createElement('button');
    cancel.className = 'btn btn-ghost';
    cancel.textContent = opts.cancelLabel;
    cancel.addEventListener('click', () => handle.close());
    row.appendChild(cancel);
  }
  const ok = document.createElement('button');
  ok.className = 'btn btn-primary';
  ok.textContent = opts.confirmLabel;
  let confirmed = false; // 스크립트 click()은 inert·pointer-events를 지나간다
  ok.addEventListener('click', () => {
    if (confirmed) return;
    confirmed = true;
    handle.close();
    opts.onConfirm();
  });
  row.appendChild(ok);
  wrap.appendChild(row);

  // 제목 없는 확인 창은 본문이 곧 이름이다 — 포커스가 첫 단추로 가므로 이름이 없으면 무엇을 묻는지 안 읽힌다
  const handle = openModal(wrap, { title: opts.title, ariaLabel: opts.body });
  return handle;
}
