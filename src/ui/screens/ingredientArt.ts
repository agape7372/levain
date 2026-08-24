// 재료 도감 일러스트 — 담백한 플랫 SVG. 무캐릭터, 외곽선·그림자 없음 (CLAUDE.md 규칙7).
// 팔레트 엄수: docs/VISUAL.md §7-1. breadArt와 동일 톤(따뜻한 베이지·갈색) 위에 재료별 색만 추가.

const SVG_NS = 'http://www.w3.org/2000/svg';

const CRUST_LIGHT = '#C68B5B';
const CREAM = '#F4EAD4';
const DETAIL = '#8A6A4A';

const OLIVE = '#5C6B3E';
const OLIVE_LIGHT = '#8A9A5B';
const CHOCO = '#4A3428';
const CHOCO_LIGHT = '#6B4E3D';
const STRAWBERRY = '#B4443A';
const STRAWBERRY_LIGHT = '#CF6156';
const LEAF = '#6B7E4A';
const CHESTNUT = '#7A5638';
const CHESTNUT_LIGHT = '#D9C4A0';

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

function line(x1: number, y1: number, x2: number, y2: number, stroke: string, width = 1.2): SVGElement {
  return node('line', { x1, y1, x2, y2, stroke, 'stroke-width': width, 'stroke-linecap': 'round' });
}

function path(d: string, fill: string): SVGElement {
  return node('path', { d, fill });
}

// ── 개별 일러스트 ──────────────────────────────────────────

function olive(): SVGElement[] {
  // 진녹색 타원 + 밝은 하이라이트 점 (씨 구멍 느낌)
  return [
    ellipse(32, 26, 13, 18, OLIVE),
    ellipse(27, 17, 3.5, 2.4, OLIVE_LIGHT),
    circle(32, 25, 1.6, DETAIL),
  ];
}

function choco(): SVGElement[] {
  // 홈(세그먼트 라인) 파인 초콜릿 판 조각, 진갈색
  return [
    path('M14 14 L50 14 L50 38 L14 38 Z', CHOCO),
    line(14, 22, 50, 22, CHOCO_LIGHT, 1.4),
    line(14, 30, 50, 30, CHOCO_LIGHT, 1.4),
    line(26, 14, 26, 38, CHOCO_LIGHT, 1.4),
    line(38, 14, 38, 38, CHOCO_LIGHT, 1.4),
  ];
}

function strawberry(): SVGElement[] {
  // 씨앗 점 몇 개 있는 하트형 붉은 과일 + 위에 작은 잎
  return [
    path(
      'M32 40 C20 30 14 22 14 16 C14 10 20 8 24 12 C27 15 30 18 32 22 C34 18 37 15 40 12 C44 8 50 10 50 16 C50 22 44 30 32 40 Z',
      STRAWBERRY
    ),
    path('M32 22 C34 18 37 15 40 12', STRAWBERRY_LIGHT),
    path('M28 10 L32 6 L36 10 L32 13 Z', LEAF),
    circle(26, 20, 1, CREAM),
    circle(34, 24, 1, CREAM),
    circle(29, 30, 1, CREAM),
    circle(36, 16, 1, CREAM),
  ];
}

function chestnut(): SVGElement[] {
  // 밑면이 평평한 물방울형, 갈색 몸체 + 밑면 연한 색
  return [
    path('M32 8 C42 16 46 26 46 32 C46 38 40 40 32 40 C24 40 18 38 18 32 C18 26 22 16 32 8 Z', CHESTNUT),
    ellipse(32, 36, 12, 4, CHESTNUT_LIGHT),
    circle(32, 20, 1.4, CRUST_LIGHT),
  ];
}

// 무해한 기본 도형 (미지 id 대비)
function plain(): SVGElement[] {
  return [ellipse(32, 26, 16, 12, CRUST_LIGHT), circle(32, 26, 2, DETAIL)];
}

const DRAWERS: Record<string, () => SVGElement[]> = {
  olive, choco, strawberry, chestnut,
};

/** 재료 id → 담백한 플랫 SVG. 미지 id는 무해한 기본 도형으로 대체 */
export function ingredientArt(id: string): HTMLElement {
  const draw = DRAWERS[id] ?? plain;
  return root(draw()) as unknown as HTMLElement;
}
