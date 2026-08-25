// 제스처 FSM — 반죽 조작 ↔ 르방 전환 스와이프 상호 불간섭 (확장기획 §16 수용 기준).
//
// 왜 이 파일이 따로 있나: tests/swipe.test.ts는 순수 술어 isSwipeCommit만 검증했다.
// 술어는 맞았는데 **mode 진입에서 그 술어를 안 썼고**(8px 시점의 방향 비교만으로 잠갔다),
// 그래서 "반죽을 젓다가 옆 르방으로 넘어간다"가 테스트를 통과한 채 실기기까지 갔다.
// 여기서 잠그는 건 술어가 아니라 **전이**다.
//
// node 환경(jsdom 없음)이라 canvas·DoughMesh는 최소 스텁 — attachInput이 만지는 표면만 흉내 낸다
// (router.test.ts의 선례와 같은 방식).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { attachInput } from '../src/render/input';
import type { DoughMesh } from '../src/render/dough/DoughMesh';

const W = 200;
const H = 200;

interface Listeners { [k: string]: (e: PointerEvent) => void }

function makeCanvas(listeners: Listeners): HTMLCanvasElement {
  return {
    addEventListener: (type: string, fn: (e: PointerEvent) => void) => { listeners[type] = fn; },
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
  } as unknown as HTMLCanvasElement;
}

/** 위에서 수직으로 내려다보는 카메라 — 화면 중앙 = 월드 원점 = 반죽 한가운데 */
function makeCamera(): THREE.Camera {
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  cam.position.set(0, 5, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

function makeDough(): DoughMesh {
  return {
    topY: () => 0,
    bodyRadius: () => 0.69,
    grabStart: () => {},
    grabMove: () => {},
    grabEnd: () => {},
    grabStretch01: () => 0,
    setStirInput: () => {},
    pokeAt: () => {},
  } as unknown as DoughMesh;
}

const ptr = (x: number, y: number, id = 1): PointerEvent =>
  ({ clientX: x, clientY: y, pointerId: id, pointerType: 'touch', buttons: 1 } as PointerEvent);

const CENTER = W / 2;
/** 반죽 밖(배경) — 화면 가장자리. 위 카메라 기준 월드 |x|가 몸통 반경을 크게 넘는다 */
const EDGE = 8;

let raf: typeof globalThis.requestAnimationFrame | undefined;

beforeEach(() => {
  raf = globalThis.requestAnimationFrame;
  // rAF 코얼레싱을 동기로 — 프레임 경계는 이 테스트의 관심사가 아니다.
  // 0을 돌려주는 게 중요하다: 실제 핸들을 돌려주면 processMove가 방금 비운 rafId를
  // 호출부가 도로 채워서 두 번째 move부터 영영 스케줄되지 않는다
  globalThis.requestAnimationFrame = ((fn: FrameRequestCallback) => { fn(0); return 0; }) as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame;
});
afterEach(() => {
  if (raf) globalThis.requestAnimationFrame = raf;
});

function harness(canSwipe = true) {
  const listeners: Listeners = {};
  const swipes: number[] = [];
  let stirStarts = 0;
  const detach = attachInput(makeCanvas(listeners), makeCamera(), makeDough(), {
    canSwipe: () => canSwipe,
    onSwipe: (dir) => swipes.push(dir),
    onStirStart: () => { stirStarts += 1; },
  });
  return {
    listeners, swipes, detach,
    stirStarts: () => stirStarts,
    drag(fromX: number, y: number, toX: number, id = 1): void {
      listeners.pointerdown(ptr(fromX, y, id));
      // 중간 지점들을 거쳐 간다 — 8px 시점 분기와 확정 승격을 둘 다 태우기 위해
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        listeners.pointermove(ptr(fromX + ((toX - fromX) * i) / steps, y, id));
      }
      listeners.pointerup(ptr(toX, y, id));
    },
  };
}

describe('제스처 FSM — 스와이프는 확정 임계를 넘어야만 발동한다', () => {
  it('배경에서 48px 미만 수평 드래그: 전환 없음 (8px 방향만으로 잠기지 않는다)', () => {
    const h = harness();
    h.drag(EDGE, CENTER, EDGE + 30);
    expect(h.swipes).toEqual([]);
    h.detach();
  });

  it('배경에서 48px 이상 수평 드래그: 전환 발동', () => {
    const h = harness();
    h.drag(W - EDGE, CENTER, W - EDGE - 80); // 오른쪽 배경에서 왼쪽으로 = 다음(+1)
    expect(h.swipes).toEqual([1]);
    h.detach();
  });

  it('★반죽 위에서 시작하면 아무리 크게 끌어도 전환되지 않는다 (실기기 신고 회귀)', () => {
    const h = harness();
    h.drag(CENTER, CENTER, CENTER + 120);
    expect(h.swipes).toEqual([]);
    expect(h.stirStarts()).toBe(1); // 젓기로 갔다
    h.detach();
  });

  it('미달 스와이프도 젓기로 흘러간다 — 후보 구간에서 반죽이 죽지 않는다', () => {
    const h = harness();
    h.drag(EDGE, CENTER, EDGE + 30);
    expect(h.stirStarts()).toBe(1);
    h.detach();
  });

  it('canSwipe가 false면(르방 1마리·모달) 큰 수평 드래그도 전환 없음', () => {
    const h = harness(false);
    h.drag(W - EDGE, CENTER, W - EDGE - 80);
    expect(h.swipes).toEqual([]);
    h.detach();
  });
});

describe('제스처 FSM — 포인터 소유권', () => {
  it('진행 중 제스처를 두 번째 손가락이 뺏지 않는다 (기기 쥔 엄지 오접촉)', () => {
    const h = harness();
    // 반죽 위에서 젓기 시작
    h.listeners.pointerdown(ptr(CENTER, CENTER, 1));
    h.listeners.pointermove(ptr(CENTER + 20, CENTER, 1));
    // 엄지가 배경을 스친다 — 예전엔 여기서 down/mode/downOnDough가 통째로 덮어써졌다
    h.listeners.pointerdown(ptr(EDGE, CENTER, 2));
    h.listeners.pointermove(ptr(EDGE + 90, CENTER, 2));
    h.listeners.pointerup(ptr(EDGE + 90, CENTER, 2));
    // 원래 손가락으로 계속 젓다가 뗀다
    h.listeners.pointermove(ptr(CENTER + 120, CENTER, 1));
    h.listeners.pointerup(ptr(CENTER + 120, CENTER, 1));

    expect(h.swipes).toEqual([]);
    expect(h.stirStarts()).toBe(1); // 재분류 0
    h.detach();
  });
});
