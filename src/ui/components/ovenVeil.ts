// 굽는 사이 (2026-11-17, VISUAL §4-2) — 굽기를 누른 뒤 결과가 뜨기까지 화면이 오븐 안처럼
// 따뜻하게 가라앉았다가 걷힌다. 글자·도형·등급 0 — 색 온도와 타이밍만(main.css `.oven-veil`).
// 열기는 app.ts openShowcase가 굽기 결과일 때만 한다. 게임 시간과 무관한 화장품이다.
//
// ready = 최소 길이(또는 탭 스킵)가 찬 순간. 호출부는 GLB 받기와 ready를 둘 다 기다린 뒤 결과를
// 드러내고 lift()로 걷는다 — 받기가 길면 그 시간을 덮고, 짧으면 최소 길이만 채운다.

const MIN_MS = 1500; // 들어오기 0.55s + 머묾 → 걷기 0.9s까지 합쳐 2.4s, 밥 주기(2.8s)와 같은 급
const MIN_MS_REDUCED = 300; // 모션 줄이기 = 짧은 페이드 한 번

export interface OvenVeil {
  /** 최소 길이가 찼거나 탭으로 넘겼다 */
  readonly ready: Promise<void>;
  /** 걷기 — 여러 번 불러도 한 번만 */
  lift(): void;
}

let current: { skip: () => void } | null = null;

export function openOvenVeil(): OvenVeil {
  const reduce =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.createElement('div');
  el.className = 'oven-veil';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  void el.offsetWidth; // 투명한 첫 상태를 확정해야 들어오기 전환이 돈다
  el.classList.add('is-in');

  let release = (): void => undefined;
  const ready = new Promise<void>((r) => { release = r; });
  const timer = setTimeout(() => release(), reduce ? MIN_MS_REDUCED : MIN_MS);
  let quick = false;
  let lifted = false;

  const skip = (): void => {
    quick = true;
    clearTimeout(timer);
    release();
  };
  el.addEventListener('click', skip);
  const handle = { skip };
  current = handle;

  return {
    ready,
    lift: () => {
      if (lifted) return;
      lifted = true;
      clearTimeout(timer);
      release();
      if (current === handle) current = null;
      el.classList.toggle('is-quick', quick);
      el.classList.remove('is-in'); // 걷히는 동안은 아래 결과 화면이 바로 눌린다(main.css)
      // transitionend가 안 오는 경우(숨김 탭 등)에도 남지 않게
      const remove = (): void => el.remove();
      el.addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, 1200);
    },
  };
}

/** 하드웨어 백 = 넘기기 (router.trySkipSequence). 떠 있지 않으면 false */
export function skipOvenVeil(): boolean {
  if (!current) return false;
  current.skip();
  return true;
}
