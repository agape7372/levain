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

    // 진행 헤어라인 — 700px 요건이 무피드백이면 "얼마나 더?"를 알 길이 없다(2026-08-30 a11y).
    // 반죽 자체가 손을 따라오는 게 1차 피드백이고, 이 선은 '얼마나 남았나'만 담백하게 말한다.
    const track = document.createElement('div');
    track.className = 'onboard-stir-track';
    const fillEl = document.createElement('div');
    fillEl.className = 'onboard-stir-fill';
    track.appendChild(fillEl);
    el.appendChild(track);

    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      opts.canvas.removeEventListener('pointermove', onMove);
      clearTimeout(fallbackTimer);
      track.remove();
      step3();
    };

    // 대체 경로 — 드래그가 어려운 사용자(모터 장애·포인터 문제)를 위해 10초 뒤 버튼을 연다.
    // 즉시 열면 의식이 스킵 버튼으로 전락하니, 시도할 시간을 먼저 준다. 버튼은 el 안이라
    // pointerEvents:none을 뚫도록 자기만 auto로 되살린다.
    const fallbackTimer = setTimeout(() => {
      if (done) return;
      btn.textContent = copy.onboarding.stirDone;
      btn.style.display = '';
      btn.style.pointerEvents = 'auto';
      btn.addEventListener('click', finish, { once: true });
    }, 10_000);

    let stirred = 0;
    let lastX = 0;
    let lastY = 0;
    const onMove = (e: PointerEvent): void => {
      if (!e.buttons && e.pointerType !== 'touch') return;
      if (lastX !== 0) stirred += Math.hypot(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
      fillEl.style.transform = `scaleX(${Math.min(1, stirred / 700).toFixed(3)})`;
      if (stirred > 700) finish();
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
