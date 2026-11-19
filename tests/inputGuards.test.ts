// 입력 방어 — 쇼케이스 동안 홈 입력 차단(A1-08) · 유실된 포인터 복구(A1-09) · 천 걷기 도중 쇼케이스(A1-19)
// · 옆벽 입력(R-M2 · R-L2) · 반죽 밖 홀드(L4). 앞쪽은 swipeFsm.test.ts와 같은 최소 스텁, 뒤쪽은 실제 DoughMesh.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { attachInput, type InputHooks } from '../src/render/input';
import { Cloth } from '../src/render/cloth';
import { DoughMesh, XZ_SCALE } from '../src/render/dough/DoughMesh';
import { CAM_ELEV_DEG } from '../src/render/SceneHost';
import { toRenderParams } from '../src/render/renderParams';
import { simSnap, STATE_HOURS } from '../scripts/lib/simSnap';

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
    topY: () => 0, levelY: () => 0, bodyRadius: () => 0.69, grabStart() {}, grabMove() {}, grabEnd() {},
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

// ── 실제 반죽 · 실제 고도 카메라 — 유리 너머 옆벽 입력(R-M2 · R-L2) · 반죽 밖 홀드(앱 검토 L4) ──
const SW = 400;
function scene(state: keyof typeof STATE_HOURS, hooks: InputHooks = {}) {
  const listeners: Record<string, Fn> = {};
  const canvas = {
    addEventListener: (t: string, fn: Fn) => { listeners[t] = fn; },
    removeEventListener: () => {},
    setPointerCapture: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: SW, height: SW }),
  } as unknown as HTMLCanvasElement;
  const a = THREE.MathUtils.degToRad(CAM_ELEV_DEG);
  const cam = new THREE.OrthographicCamera(-2.7, 2.7, 2.7, -2.7, 0.1, 30);
  cam.position.set(0, 0.64 + 9.12 * Math.sin(a), 9.12 * Math.cos(a));
  cam.lookAt(0, 0.64, 0);
  cam.updateMatrixWorld(true);
  const dough = new DoughMesh();
  dough.applyParams(toRenderParams(simSnap(STATE_HOURS[state])));
  attachInput(canvas, cam, dough, hooks);
  /** 월드 점 → 캔버스 픽셀 */
  const px = (x: number, y: number, z: number): [number, number] => {
    const v = new THREE.Vector3(x, y, z).project(cam);
    return [((v.x + 1) / 2) * SW, ((1 - v.y) / 2) * SW];
  };
  /** 옆벽 반경(월드) */
  const R = dough.bodyRadius() * XZ_SCALE;
  return { listeners, dough, px, R };
}
const tap = (l: Record<string, Fn>, [x, y]: [number, number]): void => {
  l.pointerdown(ptr(x, y));
  l.pointerup(ptr(x, y));
};

describe('R-M2 옆벽 입력 — 유리 너머 몸통도 반죽이다', () => {
  it('피크 옆벽 탭은 같은 방위 테두리 안쪽에 덴트를 낸다', () => {
    const { listeners, dough, px, R } = scene('peak');
    const poke = vi.spyOn(dough, 'pokeAt');
    // 앞 가운데 · 오른쪽 아래 · 왼쪽 위(테두리 바로 밑)
    for (const [ang, hy] of [[0, 0.5], [0.5, 0.2], [-0.6, 0.85]] as const) {
      tap(listeners, px(R * Math.sin(ang), dough.levelY() * hy, R * Math.cos(ang)));
      const [ox, oz] = poke.mock.calls[poke.mock.calls.length - 1];
      expect(Math.hypot(ox, oz)).toBeLessThan(dough.bodyRadius());
      expect(Math.atan2(ox, oz)).toBeCloseTo(ang, 1);
    }
  });

  it('르방이 둘 이상이어도 옆벽에서 시작한 가로 끌기는 전환이 아니다 — 빠르면 젓기, 느리면 grab', () => {
    let swipes = 0;
    let grabs = 0;
    let stirs = 0;
    const { listeners, dough, px, R } = scene('peak', {
      canSwipe: () => true,
      onSwipe: () => { swipes += 1; },
      onGrabStart: () => { grabs += 1; },
      onStirStart: () => { stirs += 1; },
    });
    const [x, y] = px(0, dough.levelY() * 0.4, R);
    listeners.pointerdown(ptr(x, y));
    listeners.pointermove(ptr(x + 70, y));
    listeners.pointerup(ptr(x + 70, y));
    expect(stirs).toBe(1);
    const now = vi.spyOn(performance, 'now');
    try {
      now.mockReturnValue(1000);
      listeners.pointerdown(ptr(x, y));
      now.mockReturnValue(2000);
      listeners.pointermove(ptr(x + 70, y));
      listeners.pointerup(ptr(x + 70, y));
    } finally {
      now.mockRestore();
    }
    expect(grabs).toBe(1);
    expect(swipes).toBe(0);
    // 대조 — 병 옆 배경에서 같은 끌기는 여전히 전환이다
    const [bx, by] = px(R * 2.2, dough.levelY() * 0.4, 0);
    listeners.pointerdown(ptr(bx, by));
    listeners.pointermove(ptr(bx - 70, by));
    listeners.pointerup(ptr(bx - 70, by));
    expect(swipes).toBe(1);
  });

  it('R-L2 하강 테두리 탭은 손끝에서 반경의 5% 안에 눌린다(옛 평면 = 꼭대기 topY)', () => {
    const { listeners, dough, px, R } = scene('falling');
    const poke = vi.spyOn(dough, 'pokeAt');
    const z = 0.95 * R;
    tap(listeners, px(0, dough.levelY(), z));
    const [ox, oz] = poke.mock.calls[0];
    expect(Math.abs(ox)).toBeLessThan(1e-3);
    expect(Math.abs(oz * XZ_SCALE - z)).toBeLessThan(0.05 * R);
  });
});

describe('RV-H1 옆벽 스냅은 누름 · 탭에만 — 끌기는 이어진다', () => {
  /** (x, y0)에서 눌러 화면 아래로 3px씩 천천히(100ms) 끈다. 걸음마다 [y, 신장].
   *  이 장면은 실기기(390폭)의 약 0.62배다(피크 옆벽 90px 대 145px) — 3px ≈ 실기기 5px */
  function dragDown(l: Record<string, Fn>, dough: DoughMesh, x: number, y0: number, yEnd: number): [number, number][] {
    const out: [number, number][] = [];
    let t = 1000;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => t);
    try {
      l.pointerdown(ptr(x, y0));
      for (let y = y0 + 3; y <= yEnd; y += 3) {
        t += 100;
        l.pointermove(ptr(x, y));
        out.push([y, dough.grabStretch01()]);
      }
      l.pointerup(ptr(x, yEnd));
    } finally {
      now.mockRestore();
    }
    return out;
  }
  const checkSmooth = (rows: [number, number][]): void => {
    // 첫 grab 걸음(탭 임계 8px를 넘는 순간 앵커에서 9px)은 원래 크다 — 그다음부터 본다
    const first = rows.findIndex(([, s]) => s > 0);
    expect(first).toBeGreaterThan(0);
    for (let i = first + 1; i < rows.length; i++) {
      const d = rows[i][1] - rows[i - 1][1];
      expect(d).toBeGreaterThanOrEqual(-1e-9); // 줄지 않는다(테두리에 묶이지 않는다)
      expect(d).toBeLessThanOrEqual(0.15); // 바닥선에서 튀지 않는다
    }
  };

  it.each(['peak', 'justfed', 'falling'] as const)('%s 윗면 앞 0.6R에서 잡아 병 밑까지 끌면 신장이 매끄럽게 자란다', (state) => {
    const { listeners, dough, px, R } = scene(state);
    const [x0, y0] = px(0, dough.topY(), 0.6 * R);
    const yBot = px(0, 0, R)[1];
    const rows = dragDown(listeners, dough, x0, y0, yBot + 40);
    checkSmooth(rows);
    expect(rows.find(([y]) => y >= yBot)![1]).toBeGreaterThanOrEqual(0.95); // 바닥선 전에 다 늘어난다
  });

  it('옆벽에서 잡아 아래로 끌어도 신장이 자라고 바닥선에서 튀지 않는다', () => {
    const { listeners, dough, px, R } = scene('peak');
    const [x0, y0] = px(0, dough.levelY() * 0.6, R);
    const yBot = px(0, 0, R)[1];
    const rows = dragDown(listeners, dough, x0, y0, yBot + 40);
    checkSmooth(rows);
    expect(rows.filter(([y]) => y < yBot).pop()![1]).toBeGreaterThan(0.3);
  });

  it('빠르게 아래로 젓기 — 옆벽 위에서도 속도가 이어진다(0에 묶였다 튀지 않는다)', () => {
    const { listeners, dough, px, R } = scene('peak');
    const stir = vi.spyOn(dough, 'setStirInput');
    const [x0, y0] = px(0, dough.topY(), 0);
    const yBot = px(0, 0, R)[1];
    let t = 1000;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => t);
    try {
      listeners.pointerdown(ptr(x0, y0));
      for (let y = y0 + 12; y <= yBot + 60; y += 12) {
        t += 4;
        listeners.pointermove(ptr(x0, y));
      }
    } finally {
      now.mockRestore();
    }
    const vz = stir.mock.calls.map((c) => c[3]);
    expect(Math.min(...vz)).toBeGreaterThan(0);
    expect(Math.max(...vz) / Math.min(...vz)).toBeLessThan(1.5);
  });
});

describe('앱 검토 L4 홀드 — 반죽 위에서만 부푼다', () => {
  it('반죽 밖을 0.8초 넘게 눌러도 부풂이 켜지지 않는다 · 반죽 위는 켜진다', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { listeners, dough, px, R } = scene('peak');
      const hold = vi.spyOn(dough, 'holdStart');
      const bg = px(R * 2.2, dough.levelY() * 0.4, 0);
      listeners.pointerdown(ptr(...bg));
      vi.advanceTimersByTime(900);
      listeners.pointerup(ptr(...bg));
      expect(hold).not.toHaveBeenCalled();
      const top = px(0, dough.topY(), 0);
      listeners.pointerdown(ptr(...top));
      vi.advanceTimersByTime(900);
      listeners.pointerup(ptr(...top));
      expect(hold).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
