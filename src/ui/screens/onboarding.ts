// 온보딩 — 창조 의식: 환영 → 젓기(캔버스 드래그 실측) → 탄생 → 알림 권한 (GDD §9).
// 저장이 없을 때 1회만. 완료 시 onComplete(now)가 initialState 생성·flags.onboarded 기록.
import { copy } from '../copy';
import { toast } from '../components/toast';

export function mountOnboarding(opts: {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  requestNotifyPermission: () => Promise<'granted' | 'denied' | 'unavailable'>;
  onComplete: () => void;
}): void {
  const el = document.createElement('div');
  el.className = 'onboard';

  const h = document.createElement('h1');
  const p = document.createElement('p');
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-wide';
  el.append(h, p, btn);
  opts.root.appendChild(el);

  // 1) 환영
  h.textContent = copy.onboarding.welcome;
  p.textContent = copy.onboarding.firstWeek;
  btn.textContent = '시작하기';
  btn.addEventListener('click', step2, { once: true });

  // 2) 젓기 — 오버레이를 뚫어 캔버스 드래그를 실측
  function step2(): void {
    h.textContent = copy.onboarding.stir;
    p.textContent = '';
    btn.style.display = 'none';
    el.style.pointerEvents = 'none';
    el.style.background = 'transparent';

    let stirred = 0;
    let lastX = 0;
    let lastY = 0;
    const onMove = (e: PointerEvent): void => {
      if (!e.buttons && e.pointerType !== 'touch') return;
      if (lastX !== 0) stirred += Math.hypot(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
      if (stirred > 700) {
        opts.canvas.removeEventListener('pointermove', onMove);
        step3();
      }
    };
    opts.canvas.addEventListener('pointermove', onMove);
  }

  // 3) 탄생 → 알림 권한(가치를 본 뒤) → 완료
  function step3(): void {
    el.style.pointerEvents = '';
    h.textContent = copy.onboarding.born;
    p.textContent = copy.onboarding.firstWeek;
    btn.style.display = '';
    btn.textContent = '좋아요';
    btn.addEventListener(
      'click',
      () => {
        el.remove();
        opts.onComplete();
        void opts.requestNotifyPermission().then((r) => {
          if (r === 'granted') toast(copy.notify.permissionHint);
        });
      },
      { once: true },
    );
  }
}
