// 레시피 도감 일러스트 — 담백한 플랫 SVG. 무캐릭터, 외곽선·그림자 없음 (CLAUDE.md 규칙7).
// 팔레트 엄수: docs/VISUAL.md §7-1 (--crust, --crust-light은 팔레트 확장, --cream, --ink-faint 얇은 디테일)

const SVG_NS = 'http://www.w3.org/2000/svg';

const CRUST = '#A9713F';
const CRUST_LIGHT = '#C68B5B';
const CREAM = '#F4EAD4';
const DETAIL = '#8A6A4A';
const RYE = '#8A5A33';

function node(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function root(children: SVGElement[]): SVGElement {
  const svg = node('svg', { viewBox: '0 0 64 48', width: 64, height: 48 });
  for (const c of children) svg.appendChild(c);
  return svg;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, fill: string): SVGElement {
  return node('ellipse', { cx, cy, rx, ry, fill });
}

function circle(cx: number, cy: number, r: number, fill: string): SVGElement {
  return node('circle', { cx, cy, r, fill });
}

function rect(x: number, y: number, w: number, h: number, rx: number, fill: string): SVGElement {
  return node('rect', { x, y, width: w, height: h, rx, fill });
}

function line(x1: number, y1: number, x2: number, y2: number, stroke: string, width = 1.2): SVGElement {
  return node('line', { x1, y1, x2, y2, stroke, 'stroke-width': width, 'stroke-linecap': 'round' });
}

function path(d: string, fill: string): SVGElement {
  return node('path', { d, fill });
}

// ── 개별 일러스트 ──────────────────────────────────────────

function pancake(): SVGElement[] {
  return [
    ellipse(32, 33, 20, 6, CRUST),
    ellipse(32, 27, 19, 6, CRUST_LIGHT),
    ellipse(32, 21, 18, 6, CREAM),
    line(20, 21, 44, 21, DETAIL, 1),
  ];
}

function cracker(): SVGElement[] {
  return [
    rect(14, 10, 36, 28, 6, CRUST_LIGHT),
    circle(24, 20, 2, DETAIL),
    circle(40, 20, 2, DETAIL),
    circle(24, 34, 2, DETAIL),
    circle(40, 34, 2, DETAIL),
  ];
}

function scone(): SVGElement[] {
  return [
    path('M32 8 L54 40 Q52 42 50 40 L32 12 L14 40 Q12 42 10 40 Z', CRUST_LIGHT),
    path('M32 8 L44 28 L20 28 Z', CREAM),
    line(32, 8, 32, 26, DETAIL, 1),
  ];
}

function flatbread(): SVGElement[] {
  return [
    ellipse(32, 27, 24, 10, CRUST_LIGHT),
    circle(22, 24, 2, DETAIL),
    circle(32, 30, 2, DETAIL),
    circle(42, 23, 2, DETAIL),
    circle(36, 33, 1.6, DETAIL),
  ];
}

function focaccia(): SVGElement[] {
  return [
    rect(12, 12, 40, 26, 10, CRUST_LIGHT),
    circle(22, 21, 1.6, CRUST),
    circle(32, 26, 1.6, CRUST),
    circle(42, 21, 1.6, CRUST),
    circle(26, 32, 1.6, CRUST),
    circle(38, 32, 1.6, CRUST),
  ];
}

function loaf(): SVGElement[] {
  return [
    path('M14 40 L14 24 Q14 10 32 10 Q50 10 50 24 L50 40 Z', CRUST_LIGHT),
    path('M18 22 Q32 14 46 22 L46 26 Q32 18 18 26 Z', CREAM),
  ];
}

function baguette(): SVGElement[] {
  return [
    path('M8 27 Q8 18 17 18 L47 18 Q56 18 56 27 Q56 36 47 36 L17 36 Q8 36 8 27 Z', CRUST_LIGHT),
    line(20, 20, 16, 34, DETAIL, 1.4),
    line(30, 19, 26, 35, DETAIL, 1.4),
    line(40, 20, 36, 34, DETAIL, 1.4),
  ];
}

function campagne(): SVGElement[] {
  return [
    circle(32, 26, 18, CRUST_LIGHT),
    line(32, 12, 32, 40, DETAIL, 1.4),
    line(19, 26, 45, 26, DETAIL, 1.4),
  ];
}

function rye(): SVGElement[] {
  return [
    ellipse(32, 26, 20, 15, RYE),
    circle(24, 20, 1.4, CREAM),
    circle(34, 16, 1.4, CREAM),
    circle(41, 24, 1.4, CREAM),
    circle(28, 32, 1.4, CREAM),
    circle(38, 33, 1.4, CREAM),
  ];
}

function wholewheat(): SVGElement[] {
  return [
    circle(32, 26, 18, CRUST),
    line(32, 12, 32, 40, DETAIL, 1.4),
    line(19, 26, 45, 26, DETAIL, 1.4),
    circle(23, 18, 1.4, CREAM),
    circle(41, 18, 1.4, CREAM),
    circle(23, 34, 1.4, CREAM),
    circle(41, 34, 1.4, CREAM),
  ];
}

const DRAWERS: Record<string, () => SVGElement[]> = {
  pancake, cracker, scone, flatbread, focaccia, loaf, baguette, campagne, rye, wholewheat,
};

/** 레시피 id → 담백한 플랫 SVG. 미지 id는 깜빠뉴로 대체 */
export function breadArt(recipeId: string): SVGElement {
  const draw = DRAWERS[recipeId] ?? campagne;
  return root(draw());
}
