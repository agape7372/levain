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
    topY: () => 0, levelY: () => 0, bodyRadius: () => 0.69, grabStart() {}, grabMove3() {}, grabEnd() {},
    grabStretch01: () => 0, setStirInput() {}, pokeAt() {},
  } as unknown as DoughMesh;
  const grabEnd = vi.spyOn(dough, 'grabEnd');
  attachInput(canvas, cam, dough, hooks);
  return { listeners, captured, grabEnd, dough };
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

  it('르방이 둘 이상이어도 옆벽에서 시작한 끌기는 전환이 아니다 — 가로는 빠르든 느리든 젓기, 느리게 위로면 grab(§6-1)', () => {
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
      expect(grabs).toBe(0); // 느린 가로 끌기 = 위쪽이 아니라 젓기
      expect(stirs).toBe(2);
      now.mockReturnValue(3000);
      listeners.pointerdown(ptr(x, y));
      now.mockReturnValue(4000);
      listeners.pointermove(ptr(x, y - 70));
      listeners.pointerup(ptr(x, y - 70));
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
  // 2026-11-19 가닥 다발: grab은 위로 끄는 것만이고(§6-1), 손끝은 누른 점을 지나 카메라를 마주 보는 수직 평면 위다.
  // 옛 「아래로 끌어 병 밑까지」 장면(윗면 평면 교점이 옆벽 위에서 테두리에 묶이던 버그)은 수직 평면이라 생길 수 없어 위로 끌기로 바꿨다
  /** (x, y0)에서 눌러 화면 위로 3px씩 천천히(100ms) 끈다. 걸음마다 [y, 신장] */
  function dragUp(l: Record<string, Fn>, dough: DoughMesh, x: number, y0: number, steps: number): [number, number][] {
    const out: [number, number][] = [];
    let t = 1000;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => t);
    try {
      l.pointerdown(ptr(x, y0));
      for (let i = 1; i <= steps; i++) {
        t += 100;
        l.pointermove(ptr(x, y0 - 3 * i));
        out.push([y0 - 3 * i, dough.grabStretch01()]);
      }
      l.pointerup(ptr(x, y0 - 3 * steps));
    } finally {
      now.mockRestore();
    }
    return out;
  }
  const checkSmooth = (rows: [number, number][]): void => {
    // 32px 미확정 동안은 0 — 그다음부터 본다
    const first = rows.findIndex(([, s]) => s > 0);
    expect(first).toBeGreaterThan(0);
    for (let i = first + 1; i < rows.length; i++) {
      const d = rows[i][1] - rows[i - 1][1];
      expect(d).toBeGreaterThanOrEqual(-1e-9); // 줄지 않는다
      expect(d).toBeLessThanOrEqual(0.15); // 튀지 않는다
    }
  };

  it.each(['peak', 'justfed', 'falling'] as const)('%s 윗면 앞 0.6R에서 잡아 위로 끌면 신장이 매끄럽게 자라 끝까지 간다', (state) => {
    const { listeners, dough, px, R } = scene(state);
    const [x0, y0] = px(0, dough.topY(), 0.6 * R);
    const rows = dragUp(listeners, dough, x0, y0, 90);
    checkSmooth(rows);
    expect(rows[rows.length - 1][1]).toBeGreaterThanOrEqual(0.95);
  });

  it('옆벽에서 잡아 위로 끌어도 신장이 매끄럽게 자란다', () => {
    const { listeners, dough, px, R } = scene('peak');
    const [x0, y0] = px(0, dough.levelY() * 0.6, R);
    const rows = dragUp(listeners, dough, x0, y0, 60);
    checkSmooth(rows);
    expect(rows[rows.length - 1][1]).toBeGreaterThan(0.3);
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

describe('F1 · M1 반죽 위 느린 끌기 — 32px까지 미확정(젓기처럼), 곧게 위로(±40°) 당김만 grab', () => {
  /** 점 목록을 100ms 간격으로 끈다(첫 점 = 누름). 훅 · 반죽 호출을 차례로 적는다 */
  function drag(pts: [number, number][], up = true) {
    const ev: string[] = [];
    const { listeners, dough } = setup({
      onGrabStart: () => ev.push('grabStart'),
      onGrabEnd: () => ev.push('grabEnd'),
      onStirStart: () => ev.push('stirStart'),
      onStirEnd: () => ev.push('stirEnd'),
    });
    const spy = (k: 'grabStart' | 'grabMove3' | 'grabEnd' | 'setStirInput' | 'pokeAt') =>
      vi.spyOn(dough, k).mockImplementation((() => { ev.push(`d.${k}`); }) as never);
    const gs = spy('grabStart');
    spy('grabMove3');
    spy('grabEnd');
    spy('setStirInput');
    spy('pokeAt');
    /** 처음 d.grabStart가 난 걸음의 누른 점에서 경로 길이(px) */
    let commitPath = -1;
    let path = 0;
    let t = 1000;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => t);
    try {
      listeners.pointerdown(ptr(...pts[0]));
      for (let i = 1; i < pts.length; i++) {
        t += 100;
        path += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        listeners.pointermove(ptr(...pts[i]));
        if (commitPath < 0 && gs.mock.calls.length) commitPath = path;
      }
      if (up) listeners.pointerup(ptr(...pts[pts.length - 1]));
    } finally {
      now.mockRestore();
    }
    return { ev, commitPath, grabAt: gs.mock.calls[0] as [number, number] | undefined };
  }
  const line = (x0: number, y0: number, dx: number, dy: number, n: number): [number, number][] =>
    Array.from({ length: n + 1 }, (_, i) => [x0 + dx * i, y0 + dy * i]);
  /** (C, C)에서 시작해 반경 r로 도는 원(프레임당 3px) */
  const circle = (r: number, turns: number): [number, number][] => {
    const n = Math.round((turns * 2 * Math.PI * r) / 3);
    return Array.from({ length: n + 1 }, (_, i) => {
      const a = (i * 3) / r;
      return [C - r + Math.cos(a) * r, C + Math.sin(a) * r];
    });
  };
  const has = (ev: string[], k: string): boolean => ev.includes(k);

  it('곧게 위로 당김 — 32px 전엔 젓기 소리 + 누른 자리 덴트 한 번(고랑 없음, v5 새 눈 r1 ⑤), 32px에서 누른 점으로 grab · 같은 걸음에 grabMove3', () => {
    const { ev, commitPath, grabAt } = drag(line(C, C, 0, -3, 20));
    expect(ev[0]).toBe('stirStart');
    const g = ev.indexOf('d.grabStart');
    expect(ev.slice(0, g).filter((k) => k === 'd.pokeAt')).toHaveLength(1); // 손끝이 바로 반응 — 누른 자리 오목
    expect(ev.slice(0, g)).not.toContain('d.setStirInput'); // 할퀸 자국(고랑 · 앞 둔덕 접힘) 없음
    expect(ev.slice(g, g + 3)).toEqual(['d.grabStart', 'grabStart', 'd.grabMove3']);
    expect(ev.slice(g)).not.toContain('d.setStirInput');
    expect(commitPath).toBeGreaterThanOrEqual(32);
    expect(commitPath).toBeLessThan(42);
    expect(Math.hypot(...grabAt!)).toBeLessThan(0.01); // 누른 점(화면 가운데)
    expect(ev[ev.length - 1]).toBe('grabEnd');
    expect(has(ev, 'stirEnd')).toBe(false);
  });

  it('손떨림 섞인 곧은 당김(옆 ±2px · 앞뒤 ±1px)도 grab', () => {
    const pts = line(C, C + 40, 0, -3, 30).map(([x, y], i): [number, number] =>
      i === 0 ? [x, y] : [x + (i % 2 ? 2 : -2) * Math.sin(i * 1.7), y + Math.cos(i * 2.3)],
    );
    expect(has(drag(pts).ev, 'd.grabStart')).toBe(true);
  });

  it.each([80, 40])('반경 %ipx 원은 grab 없이 젓기로 끝난다', (r) => {
    const { ev } = drag(circle(r, 1.5));
    expect(ev[0]).toBe('stirStart');
    expect(has(ev, 'd.grabStart')).toBe(false);
    expect(has(ev, 'grabStart')).toBe(false);
    expect(ev.filter((k) => k === 'd.setStirInput').length).toBeGreaterThan(30);
    expect(ev[ev.length - 1]).toBe('stirEnd');
  });

  it.each([
    ['가로', 3, 0],
    ['아래', 0, 3],
    ['위쪽에서 50° 기운', 3 * Math.sin((50 * Math.PI) / 180), -3 * Math.cos((50 * Math.PI) / 180)],
  ] as const)('위쪽 ±40° 밖의 곧은 느린 끌기(%s)는 grab이 아니라 젓기(§6-1)', (_, dx, dy) => {
    const { ev } = drag(line(C, C, dx, dy, 20));
    expect(has(ev, 'd.grabStart')).toBe(false);
    expect(ev[ev.length - 1]).toBe('stirEnd');
  });

  it('위쪽에서 35° 기운 곧은 당김(엄지 대각선)은 grab', () => {
    const a = (35 * Math.PI) / 180;
    expect(has(drag(line(C, C, 3 * Math.sin(a), -3 * Math.cos(a), 20)).ev, 'd.grabStart')).toBe(true);
  });

  it('grab 중 내렸다 다시 올리기는 grab 유지 — 세로 뒤집힘은 넘김으로 세지 않는다', () => {
    const up = line(C, C, 0, -3, 15);
    const [ux, uy] = up[up.length - 1];
    const down = line(ux, uy, 0, 3, 10).slice(1);
    const [dx, dy] = down[down.length - 1];
    const again = line(dx, dy, 0, -3, 10).slice(1);
    const down2 = line(dx, dy - 30, 0, 3, 10).slice(1);
    const { ev } = drag([...up, ...down, ...again, ...down2]);
    expect(has(ev, 'd.grabStart')).toBe(true);
    expect(ev[ev.length - 1]).toBe('grabEnd'); // 놓을 때까지 grab
    expect(has(ev, 'stirEnd')).toBe(false);
  });

  it('grab 중 가로 왕복은 stir로 넘긴다', () => {
    const up = line(C, C, 0, -3, 15);
    const [ux, uy] = up[up.length - 1];
    const sweep: [number, number][] = [];
    for (let k = 0; k < 3; k++) for (let i = 1; i <= 8; i++) sweep.push([ux + (k % 2 ? 24 - 3 * i : 3 * i), uy]);
    const { ev } = drag([...up, ...sweep]);
    expect(has(ev, 'd.grabStart')).toBe(true);
    expect(ev[ev.length - 1]).toBe('stirEnd');
  });

  it('32px 전에 떼면 젓기로 끝난다', () => {
    const { ev } = drag(line(C, C, 0, -3, 8));
    expect(has(ev, 'd.grabStart')).toBe(false);
    expect(ev.filter((k) => k === 'stirStart' || k === 'stirEnd')).toEqual(['stirStart', 'stirEnd']);
  });

  it('grab으로 확정된 뒤 원을 그리면 여전히 stir로 넘긴다 — onGrabEnd 없이 · 놓으면 onStirEnd', () => {
    const pull = line(C, C, 0, -3, 15);
    const r = 40;
    const [ex, ey] = pull[pull.length - 1];
    const loop = Array.from({ length: 120 }, (_, i): [number, number] => {
      const a = ((i + 1) * 3) / r;
      return [ex - r + Math.cos(a) * r, ey + Math.sin(a) * r];
    });
    const { ev } = drag([...pull, ...loop]);
    const g = ev.indexOf('d.grabStart');
    expect(g).toBeGreaterThan(0);
    const e = ev.indexOf('d.grabEnd');
    expect(e).toBeGreaterThan(g); // 넘길 때 리본 스프링 복귀
    expect(ev.slice(e)).toContain('d.setStirInput');
    expect(has(ev, 'grabEnd')).toBe(false);
    expect(ev[ev.length - 1]).toBe('stirEnd');
  });
});
