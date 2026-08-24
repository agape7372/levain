// Router 스택·display 계약 — BUG-1 회귀 방지: setRoot는 push()가 남긴 display:none을 복구한다.
// node 환경(vitest jsdom 없음)이라 el·host는 최소 스텁 — Router가 만지는 표면만 흉내 낸다.
import { describe, it, expect } from 'vitest';
import { Router } from '../src/ui/router';
import type { Screen } from '../src/ui/router';

interface StubEl {
  style: { display: string };
  parent: StubHost | null;
  remove(): void;
}
interface StubHost {
  children: StubEl[];
  appendChild(el: unknown): void;
}

function makeHost(): StubHost {
  const host: StubHost = {
    children: [],
    appendChild(el: unknown) {
      const stub = el as StubEl;
      host.children.push(stub);
      stub.parent = host;
    },
  };
  return host;
}

function makeScreen(id: string): Screen & { el: StubEl & HTMLElement; shown: number; hidden: number } {
  const el: StubEl = {
    style: { display: '' },
    parent: null,
    remove() {
      if (el.parent) {
        el.parent.children = el.parent.children.filter((c) => c !== el);
        el.parent = null;
      }
    },
  };
  const screen = {
    id,
    el: el as StubEl & HTMLElement,
    shown: 0,
    hidden: 0,
    onShow() { screen.shown++; },
    onHide() { screen.hidden++; },
  };
  return screen;
}

function makeRouter(host: StubHost): Router {
  return new Router(host as unknown as HTMLElement, { onRootBack: () => undefined });
}

describe('Router — push/back display 계약', () => {
  it('push는 이전 화면을 display:none으로 가리고, back은 복구한다', () => {
    const host = makeHost();
    const router = makeRouter(host);
    const a = makeScreen('a');
    const b = makeScreen('b');
    router.setRoot(a);
    router.push(b);
    expect(a.el.style.display).toBe('none');
    expect(router.current()?.id).toBe('b');

    expect(router.back()).toBe(true);
    expect(a.el.style.display).toBe('');
    expect(router.current()?.id).toBe('a');
    expect(host.children).toEqual([a.el]);
  });

  it('루트 하나면 back은 false', () => {
    const host = makeHost();
    const router = makeRouter(host);
    const a = makeScreen('a');
    router.setRoot(a);
    expect(router.back()).toBe(false);
  });
});

describe('Router.setRoot — BUG-1 회귀', () => {
  it('push로 가려진 재사용 Screen을 setRoot가 다시 루트로 세우면 display가 복구된다', () => {
    const host = makeHost();
    const router = makeRouter(host);
    const recipes = makeScreen('recipes');
    const showcase = makeScreen('showcase');
    const home = makeScreen('home');

    // 재현 경로: 레시피 루트 → 쇼케이스 push → 탭 전환(setRoot home) → 레시피 탭 복귀
    router.setRoot(recipes);
    router.push(showcase);
    expect(recipes.el.style.display).toBe('none');

    router.setRoot(home);            // 탭 전환 — 스택 전체 제거 (showcase.onHide 포함)
    expect(showcase.hidden).toBe(1);
    expect(host.children).toEqual([home.el]);

    router.setRoot(recipes);         // 레시피 탭 복귀 — display:none이 남아 있으면 영구 백지
    expect(recipes.el.style.display).toBe('');
    expect(host.children).toEqual([recipes.el]);
    expect(router.current()?.id).toBe('recipes');
  });

  it('같은 루트 재탭(setRoot 동일 Screen)도 안전 — 재마운트 후 보인다', () => {
    const host = makeHost();
    const router = makeRouter(host);
    const a = makeScreen('a');
    router.setRoot(a);
    router.setRoot(a);
    expect(a.el.style.display).toBe('');
    expect(host.children).toEqual([a.el]);
    expect(a.shown).toBe(2);
  });
});
