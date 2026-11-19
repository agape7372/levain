// 입력 방어 — 쇼케이스 동안 홈 입력 차단(A1-08) · 유실된 포인터 복구(A1-09) · 천 걷기 도중 쇼케이스(A1-19).
// node 환경이라 canvas·DoughMesh는 swipeFsm.test.ts와 같은 최소 스텁.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { attachInput, type InputHooks } from '../src/render/input';
import { Cloth } from '../src/render/cloth';
import type { DoughMesh } from '../src/render/dough/DoughMesh';

const W = 200;
type Fn = (e: PointerEvent) => void;

function setup(hooks: InputHooks) {
  const listeners: Record<string, Fn> = {};
  const captured: number[] = [];
  const canvas = {
    addEventListener: (t: string, fn: Fn) => { listeners[t] = fn; },
    removeEventListener: () => {},
    setPointerCapture: (id: number) => { captured.push(id); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: W }),
  } as unknown as HTMLCanvasElement;
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  cam.position.set(0, 5, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  const dough = {
    topY: () => 0, bodyRadius: () => 0.69, grabStart() {}, grabMove() {}, grabEnd() {},
    grabStretch01: () => 0, setStirInput() {}, pokeAt() {},
  } as unknown as DoughMesh;
  attachInput(canvas, cam, dough, hooks);
  return { listeners, captured };
}

const ptr = (x: number, y: number, id = 1): PointerEvent =>
  ({ clientX: x, clientY: y, pointerId: id, pointerType: 'touch', buttons: 1 } as PointerEvent);
const C = W / 2;

let raf: typeof globalThis.requestAnimationFrame | undefined;
beforeEach(() => {
  raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = ((fn: FrameRequestCallback) => { fn(0); return 0; }) as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame;
});
afterEach(() => {
  if (raf) globalThis.requestAnimationFrame = raf;
});

describe('A1-08 쇼케이스 동안 홈 입력 차단', () => {
  it('isBlocked가 true면 드래그해도 젓기·걷기가 시작되지 않는다', () => {
    let stirs = 0;
    let uncovers = 0;
    const { listeners } = setup({
      isBlocked: () => true,
      isCovered: () => true,
      onStirStart: () => { stirs += 1; },
      onUncover: () => { uncovers += 1; },
    });
    listeners.pointerdown(ptr(C, C));
    listeners.pointermove(ptr(C + 40, C));
    listeners.pointerup(ptr(C + 40, C - 60));
    expect(stirs).toBe(0);
    expect(uncovers).toBe(0);
  });
});

describe('A1-09 활성 포인터 up 유실', () => {
  it('pointerdown에서 포인터를 캡처한다', () => {
    const { listeners, captured } = setup({});
    listeners.pointerdown(ptr(C, C, 7));
    expect(captured).toEqual([7]);
  });

  it('lostpointercapture로 제스처가 끝나고 젓기 소리가 풀린다', () => {
    let stirEnds = 0;
    let stirStarts = 0;
    const { listeners } = setup({ onStirStart: () => { stirStarts += 1; }, onStirEnd: () => { stirEnds += 1; } });
    listeners.pointerdown(ptr(C, C, 11));
    listeners.pointermove(ptr(C + 40, C, 11));
    expect(stirStarts).toBe(1);
    listeners.lostpointercapture(ptr(C + 40, C, 11));
    expect(stirEnds).toBe(1);
    // 다음 터치(다른 id)가 정상으로 먹는다
    listeners.pointerdown(ptr(C, C, 12));
    listeners.pointermove(ptr(C + 40, C, 12));
    expect(stirStarts).toBe(2);
  });

  it('다른 포인터의 cancel은 진행 중 제스처를 끊지 않는다 (onUp과 대칭)', () => {
    let stirEnds = 0;
    const { listeners } = setup({ onStirEnd: () => { stirEnds += 1; } });
    listeners.pointerdown(ptr(C, C, 1));
    listeners.pointermove(ptr(C + 40, C, 1));
    listeners.pointercancel(ptr(0, 0, 2));
    expect(stirEnds).toBe(0);
  });

  it('up 없이 같은 id로 다시 눌러도 이전 젓기를 먼저 끝낸다', () => {
    let stirEnds = 0;
    const { listeners } = setup({ onStirEnd: () => { stirEnds += 1; } });
    listeners.pointerdown(ptr(C, C, 1));
    listeners.pointermove(ptr(C + 40, C, 1));
    listeners.pointerdown(ptr(C, C, 1));
    expect(stirEnds).toBe(1);
  });
});

describe('A1-19 천 걷기 도중 쇼케이스', () => {
  it('걷는 중 숨겨졌다가 finishOpen하면 콜백이 한 번 불리고 천이 정리된다', () => {
    const cloth = new Cloth();
    cloth.cover();
    let opened = 0;
    cloth.open(() => { opened += 1; });
    cloth.tick(1); // 걷기 시작
    cloth.mesh.visible = false; // 쇼케이스가 홈 그룹을 숨김 → tick이 멈춘다
    cloth.tick(2);
    expect(opened).toBe(0);
    cloth.finishOpen();
    expect(opened).toBe(1);
    expect(cloth.mesh.visible).toBe(false);
    cloth.finishOpen(); // 두 번째는 무해
    expect(opened).toBe(1);
  });

  it('걷는 중이 아니면 finishOpen은 아무것도 하지 않는다', () => {
    const cloth = new Cloth();
    cloth.cover();
    cloth.finishOpen();
    expect(cloth.covering).toBe(true);
    expect(cloth.mesh.visible).toBe(true);
  });
});
