// 토스트 — 짧은 안내 한 줄. 담백한 톤, 쌓임 최대 2개.
let container: HTMLElement | null = null;

// 자리 초과 시 즉시 제거하면 팝 아티팩트 — 퇴장 페이드를 태워서 내보낸다.
function evict(el: Element): void {
  if (el.classList.contains('evicting')) return;
  el.classList.add('evicting');
  el.classList.remove('show');
  setTimeout(() => el.remove(), 300);
}

export function toast(text: string, ms = 2600): void {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.getElementById('ui-root')?.appendChild(container);
  }
  const active = Array.from(container.children).filter((c) => !c.classList.contains('evicting'));
  for (let i = 0; i <= active.length - 2; i++) evict(active[i]);

  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    if (el.classList.contains('evicting')) return;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}
