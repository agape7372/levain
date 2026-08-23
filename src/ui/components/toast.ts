// 토스트 — 짧은 안내 한 줄. 담백한 톤, 쌓임 최대 2개.
let container: HTMLElement | null = null;

export function toast(text: string, ms = 2600): void {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.getElementById('ui-root')?.appendChild(container);
  }
  while (container.children.length >= 2) container.firstElementChild?.remove();

  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}
