// 모달 접근성 나머지(T5-03) — Esc로 맨 위만 닫기 · 제목 없는 시트의 aria-label · 포커스 이동이 스크롤을 일으키지 않기.
// node 환경 최소 스텁(modalGuard.test.ts와 같은 방식). 배경 inert는 실제 DOM이 필요해 qa-shots 하네스가 잰다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Fn = (e: unknown) => void;

class FakeEl {
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  className = '';
  id = '';
  textContent = '';
  inert = false;
  tabIndex = 0;
  style: Record<string, string> = {};
  focusOpts: unknown = undefined;
  private attrs = new Map<string, string>();
  classList = { add: () => {}, remove: () => {}, contains: () => false };
  constructor(readonly tagName: string) {}
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  getAttribute(k: string): string | null { return this.attrs.get(k) ?? null; }
  appendChild(c: FakeEl): FakeEl { c.parent = this; this.children.push(c); return c; }
  append(...cs: FakeEl[]): void { for (const c of cs) this.appendChild(c); }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  addEventListener(): void {}
  focus(opts?: unknown): void { this.focusOpts = opts; doc.activeElement = this; }
  querySelector(sel: string): FakeEl | null {
    for (const c of this.children) {
      if (c.tagName === sel.toUpperCase()) return c;
      const hit = c.querySelector(sel);
      if (hit) return hit;
    }
    return null;
  }
}

const root = new FakeEl('DIV');
const keydown: Fn[] = [];
const doc = {
  activeElement: null as FakeEl | null,
  createElement: (tag: string) => new FakeEl(tag.toUpperCase()),
  getElementById: (id: string) => (id === 'ui-root' ? root : null),
  addEventListener: (t: string, fn: Fn) => { if (t === 'keydown') keydown.push(fn); },
};
vi.stubGlobal('document', doc);
vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0));

const { openModal, hasOpenModal, closeTopModal } = await import('../src/ui/components/modal');

const press = (key: string): boolean => {
  let prevented = false;
  for (const fn of keydown) fn({ key, preventDefault: () => { prevented = true; } });
  return prevented;
};
const div = (): HTMLElement => doc.createElement('div') as unknown as HTMLElement;

beforeEach(() => {
  while (closeTopModal()) { /* 이전 테스트 모달 정리 */ }
  root.children = [];
});

describe('modal — Esc (T5-03)', () => {
  it('Esc는 맨 위 모달 하나만 닫는다', () => {
    const a = openModal(div(), { title: 'A' });
    openModal(div(), { title: 'B' });
    expect(keydown).toHaveLength(1); // 문서 리스너는 모달 수와 상관없이 하나
    expect(press('Escape')).toBe(true);
    expect(hasOpenModal()).toBe(true);
    expect((a.el as unknown as FakeEl).inert).toBe(false); // A는 아직 열려 있다
    press('Escape');
    expect(hasOpenModal()).toBe(false);
  });

  it('열린 모달이 없으면 Esc를 가로채지 않는다', () => {
    expect(press('Escape')).toBe(false);
    expect(press('Enter')).toBe(false);
  });
});

describe('modal — 이름·포커스 (T5-03)', () => {
  it('제목이 없으면 ariaLabel을 접근 가능한 이름으로', () => {
    const h = openModal(div(), { ariaLabel: '올리브 깜빠뉴' });
    expect((h.el as unknown as FakeEl).getAttribute('aria-label')).toBe('올리브 깜빠뉴');
  });

  it('제목이 있으면 aria-labelledby만 — aria-label이 제목을 덮지 않는다', () => {
    const h = openModal(div(), { title: '설정', ariaLabel: '다른 이름' });
    expect((h.el as unknown as FakeEl).getAttribute('aria-label')).toBeNull();
  });

  it('포커스 이동과 복귀는 preventScroll — 긴 시트가 첫 단추 자리로 스크롤돼 열리지 않게', () => {
    const opener = doc.createElement('button');
    opener.focus();
    const h = openModal(div());
    expect((h.el as unknown as FakeEl).focusOpts).toEqual({ preventScroll: true });
    h.close();
    expect(opener.focusOpts).toEqual({ preventScroll: true });
  });
});
