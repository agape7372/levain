// 모달 관문 계약 — T7-01(닫히는 240ms 동안 두 번째 탭이 동작을 한 번 더 부름) · T7-20(포커스) 회귀 방지.
// node 환경이라 document는 최소 스텁 — modal.ts가 만지는 표면만 흉내 낸다(router.test.ts와 같은 방식).
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Listener = (e: { target: FakeEl }) => void;

class FakeEl {
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  className = '';
  id = '';
  textContent = '';
  inert = false;
  tabIndex = 0;
  style: Record<string, string> = {};
  private attrs = new Map<string, string>();
  private listeners = new Map<string, Listener[]>();
  private classes = new Set<string>();
  classList = {
    add: (...c: string[]) => c.forEach((x) => this.classes.add(x)),
    remove: (...c: string[]) => c.forEach((x) => this.classes.delete(x)),
    contains: (c: string) => this.classes.has(c),
  };
  constructor(readonly tagName: string) {}
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
  getAttribute(k: string): string | null { return this.attrs.get(k) ?? null; }
  appendChild(c: FakeEl): FakeEl { c.parent = this; this.children.push(c); return c; }
  append(...cs: FakeEl[]): void { for (const c of cs) this.appendChild(c); }
  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  addEventListener(t: string, fn: Listener): void {
    this.listeners.set(t, [...(this.listeners.get(t) ?? []), fn]);
  }
  click(): void { for (const fn of this.listeners.get('click') ?? []) fn({ target: this }); }
  focus(): void { doc.activeElement = this; }
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
const doc = {
  activeElement: null as FakeEl | null,
  createElement: (tag: string) => new FakeEl(tag.toUpperCase()),
  getElementById: (id: string) => (id === 'ui-root' ? root : null),
};
vi.stubGlobal('document', doc);
vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0));

const { confirmModal, openModal } = await import('../src/ui/components/modal');

const buttons = (el: FakeEl): FakeEl[] =>
  el.children.flatMap((c) => (c.tagName === 'BUTTON' ? [c, ...buttons(c)] : buttons(c)));

beforeEach(() => {
  root.children = [];
  doc.activeElement = null;
});

describe('modal — 닫힘 중 입력 차단 (T7-01)', () => {
  it('confirmModal 확인을 두 번 눌러도 onConfirm은 1회', () => {
    const onConfirm = vi.fn();
    const h = confirmModal({ body: '본문', confirmLabel: '확인', onConfirm });
    const ok = buttons(h.el as unknown as FakeEl).find((b) => b.textContent === '확인')!;
    ok.click();
    ok.click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('close() 즉시 카드가 입력을 받지 않는다 — 백드롭은 계속 받아 밑 화면으로 새지 않는다', () => {
    const h = openModal(doc.createElement('div') as unknown as HTMLElement);
    const card = h.el as unknown as FakeEl;
    h.close();
    expect(card.style.pointerEvents).toBe('none');
    expect(card.inert).toBe(true);
    expect(card.parent?.style.pointerEvents).toBeUndefined();
  });
});

describe('modal — 포커스·제목 연결 (T7-20)', () => {
  it('열면 카드로(첫 버튼이 아니다 — 되돌릴 수 없는 단추가 첫 자리일 수 있다), 닫으면 이전 포커스로 돌아간다', () => {
    const opener = doc.createElement('button');
    opener.focus();
    const content = doc.createElement('div');
    const first = doc.createElement('button');
    content.append(first, doc.createElement('button'));
    const h = openModal(content as unknown as HTMLElement, { title: '제목' });
    expect(doc.activeElement).toBe(h.el);
    h.close();
    expect(doc.activeElement).toBe(opener);
  });

  it('제목이 있으면 aria-labelledby로 연결한다', () => {
    const h = openModal(doc.createElement('div') as unknown as HTMLElement, { title: '제목' });
    const card = h.el as unknown as FakeEl;
    const title = card.children.find((c) => c.tagName === 'H2')!;
    expect(title.id).not.toBe('');
    expect(card.getAttribute('aria-labelledby')).toBe(title.id);
  });

  it('버튼이 없으면 카드 자체에 포커스', () => {
    const h = openModal(doc.createElement('div') as unknown as HTMLElement);
    expect(doc.activeElement).toBe(h.el);
  });
});
