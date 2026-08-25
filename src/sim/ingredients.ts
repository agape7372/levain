// 재료·변형 레시피 카탈로그 v1 (기준일 2026-08-24) — 정본: 확장기획 §8·§18.
// 호환성은 **데이터가 결정, UI if문 금지** (§8-2). 재료·변형은 sim에 일절 영향 없음
// (사용자 확정 — 순수 컬렉팅 축): 역할은 변형 해금 키 + 도감 수집뿐.
//
// ⚠ 전사 출처 2종이 섞여 있다 — sourceRef의 접두사로 구분한다:
//   `§18-x`  = 2026-08-24 재구성분 46행. §18 조사 원문(판정표)이 유실돼 기획서 §18-1(형태 서열)·
//              §18-2(예시 검증)·§18-3(verified 명시 목록)에서 복원했다. URL 재조작 금지 원칙으로
//              절 번호만 쓴다. 명시 목록 우선이라 집계가 §18 요약(24/16/5/1)과 다르다: 27/13/5/1.
//   `https://` = 2026-08-25 확장 8종 조사 43행. **실제로 연 페이지만** verified/conditional이고,
//              URL 없으면 experimental이다. 이 계약은 tests/variants.test.ts가 강제한다.
// 합계 89행 = verified 45 / conditional 27 / experimental 16 / blocked 1.
import type { RecipeDef } from './types';
import { RECIPES } from './recipes';

export type IngredientId =
  | 'olive' | 'choco' | 'strawberry' | 'chestnut'
  // 2026-08-25 확장 8종 — 색 스펙트럼이 겹치지 않게 고르고, 실제 사워도우 레시피 근거가 있는 것만
  | 'walnut' | 'cranberry' | 'fig' | 'rosemary'
  | 'cheese' | 'cinnamon' | 'blueberry' | 'pumpkin';

/** 형태에 등급을 매긴다 — 재료가 아니라 (§18-1) */
export type IngredientForm =
  // 올리브: 오일 > 과육 > 슬라이스(토핑) > 브라인
  | 'flesh' | 'slice' | 'oil' | 'brine'
  // 초코: 칩(입자) / 코코아(흡수, 4~8% 상한) / 필링(로프·바브카 전용)
  // ⚠ `filling`은 **초코 전용 라벨**이다 — `flour`(밤가루)와 같은 함정이라 여기 같이 못 박는다.
  //   copy.ts의 formNames.filling이 일반 "필링"이 아니라 '초코 필링'이고, formFirst가 그 문자열을
  //   그대로 앞에 붙인다. 다른 재료에 주면 **다른 베이스 위에서는 표시명이 유일해서 테스트를 통과하면서**
  //   "초코 필링 캉파뉴" 같은 사실이 틀린 한국어가 나온다. 소·앙금류는 `swirl`을 쓸 것.
  | 'chip' | 'cocoa' | 'filling'
  // 딸기: 동결건조 > 구운 > 잼 > 생과 (§18-1 — 동결건조 = 수분 0, 최고 호환)
  | 'fresh' | 'roasted' | 'freezedried' | 'jam'
  // 밤: 구운 조각 > 밤가루(무글루텐 20~25% 하드캡) > 퓌레(필링 전용)
  | 'piece' | 'flour' | 'puree'
  // 확장 8종 신규 형태. `flour`는 '밤가루' 전용 라벨이라 재사용 금지 — 가루류는 전부 `ground`
  | 'dried'    // 건조 (크랜베리·무화과·블루베리·로즈마리)
  | 'sprig'    // 생잎 (로즈마리)
  | 'cube'     // 큐브 (고다 치즈)
  | 'crumble'  // 크럼블 (페타 치즈)
  | 'ground'   // 가루 (호두·치즈·계피)
  | 'swirl'    // 스월 (계피 설탕)
  | 'seed';    // 씨앗 (단호박씨)

export interface IngredientDef {
  id: IngredientId;
  forms: IngredientForm[];
}

export const INGREDIENTS: readonly IngredientDef[] = [
  { id: 'olive', forms: ['flesh', 'slice', 'oil', 'brine'] },
  { id: 'choco', forms: ['chip', 'cocoa', 'filling'] },
  { id: 'strawberry', forms: ['fresh', 'roasted', 'freezedried', 'jam'] },
  { id: 'chestnut', forms: ['piece', 'flour', 'puree'] },
  { id: 'walnut', forms: ['piece', 'ground'] },
  { id: 'cranberry', forms: ['dried', 'fresh'] },
  { id: 'fig', forms: ['dried', 'fresh', 'jam'] },
  { id: 'rosemary', forms: ['sprig', 'dried'] },
  { id: 'cheese', forms: ['cube', 'crumble', 'ground'] },
  { id: 'cinnamon', forms: ['ground', 'swirl'] },
  { id: 'blueberry', forms: ['fresh', 'dried'] },
  { id: 'pumpkin', forms: ['roasted', 'puree', 'seed'] },
];

/**
 * verified = 실증 URL 확인(조사 시점) / conditional = 형태·비율 제한부 실증 /
 * experimental = 근거 미발견·원리상 성립 / blocked = 검증 실패("세상에 없다" 아님).
 * v1 노출 = verified + conditional (§18-6 추천안).
 */
export type RuleStatus = 'verified' | 'conditional' | 'experimental' | 'blocked';

export interface CompatibilityRule {
  baseRecipeId: string;
  ingredientId: IngredientId;
  form: IngredientForm;
  status: RuleStatus;
  sourceRef: string;
}

const R = (
  baseRecipeId: string, ingredientId: IngredientId, form: IngredientForm,
  status: RuleStatus, sourceRef: string,
): CompatibilityRule => ({ baseRecipeId, ingredientId, form, status, sourceRef });

/** 판정표 89행. 무효 조합은 여기 없음 = 시도 자체가 차단 (§8-2) */
export const COMPATIBILITY: readonly CompatibilityRule[] = [
  // ── verified 27 (§18-3 명시 목록) ──
  R('focaccia', 'olive', 'flesh', 'verified', '§18-2·§18-3'),
  R('campagne', 'olive', 'flesh', 'verified', '§18-2·§18-3'),
  R('rye', 'olive', 'flesh', 'verified', '§18-3'),
  R('wholewheat', 'olive', 'flesh', 'verified', '§18-3'),
  R('focaccia', 'olive', 'oil', 'verified', '§18-3'),
  R('cracker', 'olive', 'oil', 'verified', '§18-2·§18-3'),
  R('loaf', 'olive', 'oil', 'verified', '§18-2·§18-3'),
  R('campagne', 'olive', 'oil', 'verified', '§18-3'),
  R('pancake', 'choco', 'chip', 'verified', '§18-3'),
  R('scone', 'choco', 'chip', 'verified', '§18-3'),
  R('pancake', 'choco', 'cocoa', 'verified', '§18-3'),
  R('cracker', 'choco', 'cocoa', 'verified', '§18-3'),
  R('scone', 'choco', 'cocoa', 'verified', '§18-3'),
  R('focaccia', 'choco', 'cocoa', 'verified', '§18-3 (KAB 더블초코 ★)'),
  R('campagne', 'choco', 'cocoa', 'verified', '§18-3'),
  R('rye', 'choco', 'cocoa', 'verified', '§18-3'),
  R('wholewheat', 'choco', 'cocoa', 'verified', '§18-3'),
  R('loaf', 'choco', 'filling', 'verified', '§18-3 (KAB 사워도우 바브카 ★)'),
  R('pancake', 'strawberry', 'fresh', 'verified', '§18-3'),
  R('scone', 'strawberry', 'fresh', 'verified', '§18-3'),
  R('campagne', 'strawberry', 'freezedried', 'verified', '§18-3'),
  R('campagne', 'strawberry', 'jam', 'verified', '§18-3 (스월)'),
  R('focaccia', 'strawberry', 'roasted', 'verified', '§18-3'),
  R('campagne', 'chestnut', 'piece', 'verified', '§18-3'),
  R('baguette', 'chestnut', 'piece', 'verified', '§18-3'),
  R('wholewheat', 'chestnut', 'piece', 'verified', '§18-3'),
  R('rye', 'chestnut', 'flour', 'verified', '§18-3'),
  // ── conditional 13 (§18-1 서열·§18-4 물리 근거 보간) ──
  R('loaf', 'olive', 'flesh', 'conditional', '§18-2'),
  R('flatbread', 'olive', 'flesh', 'conditional', '§18-1 보간'),
  R('focaccia', 'olive', 'slice', 'conditional', '§18-1 보간 (토핑 형태)'),
  R('loaf', 'olive', 'brine', 'conditional', '§18-4 (염분 +2 — 소금 차감 전제)'),
  R('loaf', 'choco', 'chip', 'conditional', '§18-1 보간 (비-사워도우 실증 다수)'),
  R('focaccia', 'choco', 'chip', 'conditional', '§18-1 보간 (디저트 포카치아)'),
  R('loaf', 'choco', 'cocoa', 'conditional', '§18-4 (4~8% 상한)'),
  R('campagne', 'choco', 'filling', 'conditional', '§18-1 보간 (스월 형태 제한)'),
  R('focaccia', 'strawberry', 'fresh', 'conditional', '§18-4 (수분 +2 — 크럼 손상 위험)'),
  R('scone', 'strawberry', 'roasted', 'conditional', '§18-1 보간'),
  R('campagne', 'chestnut', 'flour', 'conditional', '§18-1 (무글루텐 20~25% 하드캡)'),
  R('wholewheat', 'chestnut', 'flour', 'conditional', '§18-1 (하드캡)'),
  R('loaf', 'chestnut', 'puree', 'conditional', '§18-1 (퓌레 = 필링 전용)'),
  // ── experimental 5 (근거 미발견·원리상 성립 — v1 미노출) ──
  R('cracker', 'olive', 'flesh', 'experimental', '§18-2'),
  R('pancake', 'olive', 'flesh', 'experimental', '§18-2 (세이버리 팬케이크 — §18-6 검토 항목)'),
  R('campagne', 'strawberry', 'fresh', 'experimental', '§18-4 (린 반죽 × 수분 +2)'),
  R('campagne', 'chestnut', 'puree', 'experimental', '§18-1 (퓌레 혼입 — 원리상)'),
  R('baguette', 'choco', 'cocoa', 'experimental', '§18-3 부재 — 원리상'),
  // ── blocked 1 (§18-2 — 1.5mm 압연에서 칩 용융·탄화) ──
  R('cracker', 'choco', 'chip', 'blocked', '§18-2'),
  // ── 확장 8종 43행 (조사 2026-08-25) ──────────────────────────────────────────
  // §18과 같은 방법론: **실제로 연 페이지의 URL이 있는 것만** verified/conditional.
  // URL 없으면 experimental — 개수를 채우려고 등급을 올리지 않는다.
  // 조사 한계(그대로 남긴다): King Arthur Baking은 이번 조사에서 전 경로 403이라 한 행도 못 들어왔다.
  // 무화과+호두·메이플 호두 등은 KAB에 verified급이 있을 가능성이 높다 — 재조사 시 1순위.

  // 호두 — 깜빠뉴·호밀이 표준
  R('campagne', 'walnut', 'piece', 'verified', 'https://www.theperfectloaf.com/tartine-country-walnut-sourdough/'),
  R('rye', 'walnut', 'piece', 'verified', 'https://www.thehathicooks.com/walnut-rye-sourdough/'),
  // ↓ 통밀 비율이 ~22%로 얇다 — 등급을 내린 건 비-사워도우라서가 아니라 그 비율 때문
  R('wholewheat', 'walnut', 'piece', 'conditional', 'https://bakerstable.net/whole-wheat-sourdough-fig-and-walnut-bread'),
  R('scone', 'walnut', 'piece', 'conditional', 'https://www.miascucina.com/fig-scones-made-with-fresh-figs-and-walnuts/'),
  // 호두가루는 실 레시피를 못 찾았다 (식품과학 논문의 2~6% 대체 실험만 존재)
  R('campagne', 'walnut', 'ground', 'experimental', '조사 2026-08-25 · 실 레시피 미발견'),
  R('cracker', 'walnut', 'ground', 'experimental', '조사 2026-08-25 · 실 레시피 미발견'),

  // 크랜베리 — 호두와 짝지어 다닌다
  R('campagne', 'cranberry', 'dried', 'verified', 'https://www.theperfectloaf.com/walnut-cranberry-sourdough/'),
  R('campagne', 'cranberry', 'fresh', 'verified', 'https://amybakesbread.com/cranberry-orange-sourdough-loaf/'),
  R('scone', 'cranberry', 'dried', 'verified', 'https://vanillaandbean.com/cranberry-orange-sourdough-scones/'),
  R('wholewheat', 'cranberry', 'dried', 'experimental', '조사 2026-08-25 · 근거 미발견'),
  R('loaf', 'cranberry', 'dried', 'experimental', '조사 2026-08-25 · 근거 미발견'),

  // 무화과
  R('campagne', 'fig', 'dried', 'verified', 'https://homegrownhappiness.com/fig-and-walnut-sourdough/'),
  R('wholewheat', 'fig', 'dried', 'conditional', 'https://bakerstable.net/whole-wheat-sourdough-fig-and-walnut-bread'),
  R('focaccia', 'fig', 'fresh', 'conditional', 'https://www.eatthelove.com/fig-focaccia/'),
  R('loaf', 'fig', 'jam', 'conditional', 'https://www.mydailysourdoughbread.com/fig-jam-bread/'),
  R('scone', 'fig', 'fresh', 'conditional', 'https://www.miascucina.com/fig-scones-made-with-fresh-figs-and-walnuts/'),

  // 로즈마리 — 포카치아가 본가. dried 행은 원문이 생잎 기준이고 건조 대체 비율만 명시해 conditional
  R('focaccia', 'rosemary', 'sprig', 'verified', 'https://amybakesbread.com/roasted-garlic-rosemary-sourdough-focaccia/'),
  R('campagne', 'rosemary', 'sprig', 'verified', 'https://www.farmhouseonboone.com/rosemary-sourdough-bread/'),
  R('cracker', 'rosemary', 'sprig', 'verified', 'https://pantrymama.com/sourdough-discard-crackers-recipe-with-parmesan-rosemary/'),
  R('cracker', 'rosemary', 'dried', 'conditional', 'https://pantrymama.com/sourdough-discard-crackers-recipe-with-parmesan-rosemary/'),
  R('focaccia', 'rosemary', 'dried', 'conditional', 'https://amybakesbread.com/roasted-garlic-rosemary-sourdough-focaccia/'),
  R('campagne', 'rosemary', 'dried', 'conditional', 'https://www.farmhouseonboone.com/rosemary-sourdough-bread/'),
  R('flatbread', 'rosemary', 'sprig', 'experimental', '조사 2026-08-25 · 근거 미발견'),

  // 치즈 — 갈아 넣는 형태가 가장 널리 실증된다
  R('scone', 'cheese', 'ground', 'verified', 'https://breadtopia.com/sourdough-cheddar-dill-scones/'),
  R('cracker', 'cheese', 'ground', 'verified', 'https://pantrymama.com/sourdough-discard-crackers-recipe-with-parmesan-rosemary/'),
  R('loaf', 'cheese', 'ground', 'verified', 'https://www.creationsbykara.com/cheese-sourdough-bread/'),
  R('focaccia', 'cheese', 'cube', 'conditional', 'https://rhubarbandcod.com/orange-feta-focaccia/'),
  R('focaccia', 'cheese', 'crumble', 'conditional', 'https://www.thecookierookie.com/three-cheese-focaccia/'),
  R('flatbread', 'cheese', 'ground', 'conditional', 'https://www.vegrecipesofindia.com/cheese-naan-recipe/'),
  R('campagne', 'cheese', 'cube', 'experimental', '조사 2026-08-25 · 근거 미발견'),

  // 계피 — loaf 행은 원문의 주 방식이 더치오븐 불(boule)이고 팬 로프는 부기라 conditional
  R('campagne', 'cinnamon', 'swirl', 'verified', 'https://pantrymama.com/cinnamon-swirl-sourdough-bread/'),
  R('loaf', 'cinnamon', 'swirl', 'conditional', 'https://pantrymama.com/cinnamon-swirl-sourdough-bread/'),
  R('scone', 'cinnamon', 'ground', 'verified', 'https://amybakesbread.com/apple-cinnamon-sourdough-scones/'),
  R('pancake', 'cinnamon', 'ground', 'experimental', '조사 2026-08-25 · 근거 미발견'),

  // 블루베리 — 생과만 실증됐다. 건조는 검색 스니펫에만 있고 실제 페이지는 전부 생과 전용이었다
  R('pancake', 'blueberry', 'fresh', 'verified', 'https://www.farmhouseonboone.com/sourdough-blueberry-pancakes/'),
  R('scone', 'blueberry', 'fresh', 'verified', 'https://amybakesbread.com/lemon-blueberry-sourdough-scones/'),
  R('loaf', 'blueberry', 'fresh', 'experimental', '조사 2026-08-25 · 근거 미발견'),
  R('scone', 'blueberry', 'dried', 'experimental', '조사 2026-08-25 · 실 레시피 미발견'),

  // 단호박 — 퓌레가 표준. 구운 조각 혼입은 근거가 없다
  R('campagne', 'pumpkin', 'puree', 'verified', 'https://amybakesbread.com/pumpkin-sourdough-artisan-bread/'),
  R('loaf', 'pumpkin', 'puree', 'conditional', 'https://amybakesbread.com/pumpkin-sourdough-artisan-bread/'),
  R('campagne', 'pumpkin', 'seed', 'verified', 'https://www.farmhouseonboone.com/how-to-make-seeded-sourdough-bread/'),
  R('wholewheat', 'pumpkin', 'seed', 'experimental', '조사 2026-08-25 · 근거 미발견'),
  R('focaccia', 'pumpkin', 'roasted', 'experimental', '조사 2026-08-25 · 근거 미발견'),
];

/** 변형 id — 도감(collection) 키로도 쓴다. 파일명 안전 문자만 */
export const variantIdOf = (r: Pick<CompatibilityRule, 'baseRecipeId' | 'ingredientId' | 'form'>): string =>
  `${r.baseRecipeId}--${r.ingredientId}-${r.form}`;

/** v1 노출 변형 = verified + conditional (§18-6). experimental·blocked는 게임에 없음 */
export const isPlayable = (r: CompatibilityRule): boolean =>
  r.status === 'verified' || r.status === 'conditional';

export const playableRules = (): readonly CompatibilityRule[] => COMPATIBILITY.filter(isPlayable);

export const rulesForBase = (baseRecipeId: string): readonly CompatibilityRule[] =>
  COMPATIBILITY.filter((r) => r.baseRecipeId === baseRecipeId && isPlayable(r));

const byVariantId = new Map(COMPATIBILITY.map((r) => [variantIdOf(r), r]));
export const ruleByVariantId = (variantId: string): CompatibilityRule | undefined =>
  byVariantId.get(variantId);

/** 변형의 베이스 레시피 정의 — 굽기 게이트·비용·판정은 전부 베이스 그대로 (재료 sim 무영향) */
export const baseOfVariant = (variantId: string): RecipeDef | undefined => {
  const rule = byVariantId.get(variantId);
  return rule ? RECIPES.find((r) => r.id === rule.baseRecipeId) : undefined;
};
