// 재료 도감 일러스트 — 담백한 플랫 SVG. 무캐릭터, 외곽선·그림자 없음 (CLAUDE.md 규칙7).
// 팔레트 엄수: docs/VISUAL.md §7-1. breadArt와 동일 톤(따뜻한 베이지·갈색) 위에 재료별 색만 추가.
//
// ⚠ **이제 폴백이다 — 삭제하지 말 것** (2026-08-26 개편).
// 도감 카드의 정본 아트는 `public/ingredients/thumbs/<id>.png`(GLB에서 구운 투명 배경 썸네일)이고,
// 이 파일은 그 PNG가 404일 때 내려오는 자리다 — breadArt가 빵에서 하는 역할 그대로
// (`recipes.ts`의 `ingredientArtOf` 참조). 썸네일 파이프라인이 붙었다고 지우면 GLB 없는
// 재료가 빈 칸이 된다.
//
// **여기에 신규 재료 SVG를 늘리지는 말 것.** 신규 재료는 그록 이미지 → GLB → 썸네일 경로로 들어오고,
// 아직 GLB가 없는 동안은 아래 `plain()` 기본 도형으로 무해하게 떨어진다. 손으로 그린 SVG를 30개까지
// 늘리면 전부 버릴 코드가 된다.

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

const WALNUT = '#9C7654';
const WALNUT_LIGHT = '#C9A578';
const CRANBERRY = '#8E1F3B';
const CRANBERRY_LIGHT = '#C24660';
const FIG = '#5B3358';
const FIG_LIGHT = '#E0839C';
const ROSEMARY = '#5E7052';
const ROSEMARY_LIGHT = '#8FA37D';
const CHEESE = '#F0C24B';
const CHEESE_LIGHT = '#F7DE8F';
const CINNAMON = '#8B4A2B';
const CINNAMON_LIGHT = '#C17B4F';
const BLUEBERRY = '#3B4A7A';
const BLUEBERRY_LIGHT = '#6E7AB0';
const PUMPKIN = '#D97A2B';
const PUMPKIN_LIGHT = '#F0A85C';

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

function walnut(): SVGElement[] {
  // 가운데 골로 갈라진 두 쪽의 주름진 호두 속살, 따뜻한 갈색
  return [
    ellipse(32, 24, 16, 15, WALNUT),
    line(32, 9, 32, 39, WALNUT_LIGHT, 1.6),
    path('M20 14 C24 17 24 21 20 24', WALNUT_LIGHT),
    path('M44 14 C40 17 40 21 44 24', WALNUT_LIGHT),
    path('M20 26 C24 29 24 33 20 36', WALNUT_LIGHT),
    path('M44 26 C40 29 40 33 44 36', WALNUT_LIGHT),
  ];
}

function cranberry(): SVGElement[] {
  // 동글동글 뭉친 크랜베리 세 알, 진한 크림슨
  return [
    circle(24, 28, 8, CRANBERRY),
    circle(38, 26, 8.5, CRANBERRY),
    circle(32, 16, 7, CRANBERRY),
    ellipse(21, 25, 2.2, 1.4, CRANBERRY_LIGHT),
    ellipse(35, 23, 2.2, 1.4, CRANBERRY_LIGHT),
    ellipse(30, 13, 2, 1.3, CRANBERRY_LIGHT),
  ];
}

function fig(): SVGElement[] {
  // 반으로 자른 무화과, 자주색 껍질과 씨 촘촘한 분홍 속살
  return [
    path('M32 8 C42 8 46 16 46 24 C46 34 40 40 32 40 C24 40 18 34 18 24 C18 16 22 8 32 8 Z', FIG),
    // 속살은 껍질보다 확실히 작아야 자주색 테가 남는다 — 꽉 채우면 그냥 분홍 덩어리로 읽힌다
    ellipse(32, 25, 9, 10, FIG_LIGHT),
    circle(29, 21, 1, CREAM),
    circle(34, 20, 1, CREAM),
    circle(27, 27, 1, CREAM),
    circle(32, 29, 1, CREAM),
    circle(37, 26, 1, CREAM),
    circle(30, 32, 1, CREAM),
  ];
}

function rosemary(): SVGElement[] {
  // 줄기 하나에 짧은 바늘잎이 촘촘히 붙은 로즈마리 가지, 세이지그린
  return [
    line(32, 8, 32, 40, ROSEMARY, 1.6),
    line(32, 12, 22, 9, ROSEMARY_LIGHT, 1.4),
    line(32, 12, 42, 9, ROSEMARY_LIGHT, 1.4),
    line(32, 17, 21, 14, ROSEMARY_LIGHT, 1.4),
    line(32, 17, 43, 14, ROSEMARY_LIGHT, 1.4),
    line(32, 22, 20, 19, ROSEMARY_LIGHT, 1.4),
    line(32, 22, 44, 19, ROSEMARY_LIGHT, 1.4),
    line(32, 27, 21, 24, ROSEMARY_LIGHT, 1.4),
    line(32, 27, 43, 24, ROSEMARY_LIGHT, 1.4),
    line(32, 32, 22, 29, ROSEMARY_LIGHT, 1.4),
    line(32, 32, 42, 29, ROSEMARY_LIGHT, 1.4),
  ];
}

function cheese(): SVGElement[] {
  // 둥근 구멍이 송송 뚫린 치즈 웨지, 버터옐로
  return [
    path('M14 38 L34 8 L50 38 Z', CHEESE),
    circle(28, 30, 3, CHEESE_LIGHT),
    circle(38, 32, 2.2, CHEESE_LIGHT),
    circle(32, 20, 2, CHEESE_LIGHT),
  ];
}

function cinnamon(): SVGElement[] {
  // 돌돌 말린 나무껍질 두 대, 러셋브라운
  return [
    path('M18 34 L38 12 L44 16 L24 38 Z', CINNAMON),
    ellipse(40, 14, 3, 2.4, CINNAMON_LIGHT),
    line(22, 32, 36, 16, CINNAMON_LIGHT, 1.2),
    path('M26 40 L42 18 L48 22 L32 42 Z', CINNAMON),
    ellipse(44, 20, 3, 2.4, CINNAMON_LIGHT),
    line(30, 38, 40, 22, CINNAMON_LIGHT, 1.2),
  ];
}

function blueberry(): SVGElement[] {
  // 뭉친 블루베리 세 알, 한 알엔 꼭지 별 모양 배꼽, 블루바이올렛
  return [
    circle(22, 28, 7.5, BLUEBERRY),
    circle(36, 30, 8, BLUEBERRY),
    circle(30, 16, 7, BLUEBERRY),
    ellipse(19, 25, 2, 1.3, BLUEBERRY_LIGHT),
    ellipse(33, 27, 2, 1.3, BLUEBERRY_LIGHT),
    ellipse(28, 13, 1.8, 1.2, BLUEBERRY_LIGHT),
    line(30, 9, 30, 12, DETAIL, 1),
    line(28, 10, 32, 11, DETAIL, 1),
    line(32, 10, 28, 11, DETAIL, 1),
  ];
}

function pumpkin(): SVGElement[] {
  // 짧은 꼭지가 달린 납작한 골 무늬 단호박, 오렌지 몸통
  return [
    ellipse(32, 26, 17, 13, PUMPKIN),
    line(32, 14, 32, 38, PUMPKIN_LIGHT, 1.4),
    line(24, 15, 24, 37, PUMPKIN_LIGHT, 1.4),
    line(40, 15, 40, 37, PUMPKIN_LIGHT, 1.4),
    path('M30 14 L30 8 L34 8 L34 14 Z', LEAF),
  ];
}

// 무해한 기본 도형 (미지 id 대비)
function plain(): SVGElement[] {
  return [ellipse(32, 26, 16, 12, CRUST_LIGHT), circle(32, 26, 2, DETAIL)];
}

const DRAWERS: Record<string, () => SVGElement[]> = {
  olive, choco, strawberry, chestnut,
  walnut, cranberry, fig, rosemary, cheese, cinnamon, blueberry, pumpkin,
};

/** 재료 id → 담백한 플랫 SVG. 미지 id는 무해한 기본 도형으로 대체 */
export function ingredientArt(id: string): HTMLElement {
  const draw = DRAWERS[id] ?? plain;
  return root(draw()) as unknown as HTMLElement;
}
