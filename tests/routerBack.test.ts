// 하드웨어 백 순서 계약 (ARCHITECTURE §5): 연출 스킵 → 모달 닫기 → 화면 back → 루트.
// 획득 연출 레이어 닫기는 trySkipSequence 안에서 먼저 불린다(app.ts 배선, T7-17).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ calls: [] as string[], modalOpen: false }));
vi.mock('../src/ui/components/modal', () => ({
  closeTopModal: () => {
    state.calls.push('modal');
    return state.modalOpen;
  },
}));

import { Router } from '../src/ui/router';
import type { Screen } from '../src/ui/router';

function makeScreen(id: string): Screen {
  const el = { style: { display: '' }, remove: () => undefined } as unknown as HTMLElement;
  return { id, el };
}

let skipping = false;
function makeRouter(): Router {
  const host = { appendChild: () => undefined } as unknown as HTMLElement;
  return new Router(host, {
    trySkipSequence: () => {
      state.calls.push('skip');
      return skipping;
    },
    onRootBack: () => state.calls.push('root'),
  });
}

beforeEach(() => {
  state.calls = [];
  state.modalOpen = false;
  skipping = false;
});

describe('Router.handleBack 순서', () => {
  it('연출 중이면 스킵만 한다 — 모달·화면은 그대로', () => {
    const r = makeRouter();
    r.setRoot(makeScreen('root'));
    r.push(makeScreen('child'));
    skipping = true;
    state.modalOpen = true;
    r.handleBack();
    expect(state.calls).toEqual(['skip']);
    expect(r.current()?.id).toBe('child');
  });

  it('연출이 없으면 모달을 먼저 닫는다', () => {
    const r = makeRouter();
    r.setRoot(makeScreen('root'));
    r.push(makeScreen('child'));
    state.modalOpen = true;
    r.handleBack();
    expect(state.calls).toEqual(['skip', 'modal']);
    expect(r.current()?.id).toBe('child');
  });

  it('모달도 없으면 화면 back, 루트에선 onRootBack', () => {
    const r = makeRouter();
    r.setRoot(makeScreen('root'));
    r.push(makeScreen('child'));
    r.handleBack();
    expect(state.calls).toEqual(['skip', 'modal']);
    expect(r.current()?.id).toBe('root');
    state.calls = [];
    r.handleBack();
    expect(state.calls).toEqual(['skip', 'modal', 'root']);
  });
});
