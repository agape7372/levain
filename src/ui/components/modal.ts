// 모달 = 중앙 팝업 고정.
// <!-- 되돌림 방지: 사용자 확정 규칙 — 모달은 중앙 팝업. 바닥 시트로 바꾸지 말 것 -->
// 등장 scale 0.96→1 + opacity 0.22s, 백드롭 탭·백버튼으로 닫힘 (ARCHITECTURE §5).

export interface ModalHandle {
  close(): void;
  readonly el: HTMLElement;
}

let openModals: ModalHandle[] = [];

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
}

export function openModal(content: HTMLElement, opts: ModalOptions = {}): ModalHandle {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');

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
    h.textContent = opts.title;
    body.appendChild(h);
  }
  body.appendChild(content);
  if (opts.footer) {
    opts.footer.classList.add('modal-footer');
    card.appendChild(opts.footer);
  }
  backdrop.appendChild(card);
  document.getElementById('ui-root')?.appendChild(backdrop);

  requestAnimationFrame(() => backdrop.classList.add('open'));

  let closed = false;
  const handle: ModalHandle = {
    el: card,
    close() {
      if (closed) return;
      closed = true;
      openModals = openModals.filter((m) => m !== handle);
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), 240);
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
  ok.addEventListener('click', () => {
    handle.close();
    opts.onConfirm();
  });
  row.appendChild(ok);
  wrap.appendChild(row);

  const handle = openModal(wrap, { title: opts.title });
  return handle;
}
