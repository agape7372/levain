// 재료·변형 레시피 카탈로그 v1 (기준일 2026-08-24) — 정본: 확장기획 §8·§18.
// 호환성은 **데이터가 결정, UI if문 금지** (§8-2). 재료·변형은 sim에 일절 영향 없음
// (사용자 확정 — 순수 컬렉팅 축): 역할은 변형 해금 키 + 도감 수집뿐.
//
// ⚠ 전사 출처 2종이 섞여 있다 — sourceRef의 접두사로 구분한다:
//   `§18-x`  = 2026-08-24 재구성분 46행. §18 조사 원문(판정표)이 유실돼 기획서 §18-1(형태 서열)·
//              §18-2(예시 검증)·§18-3(verified 명시 목록)에서 복원했다. URL 재조작 금지 원칙으로
//              절 번호만 쓴다. 명시 목록 우선이라 집계가 §18 요약(24/16/5/1)과 다르다: 27/13/5/1.
//   `https://` = 2026-08-25 확장 8종 43행 + 2026-08-26 확장 18종 105행. **실제로 연 페이지만**
//              verified/conditional이고, URL 없으면 experimental이다.
//              이 계약은 tests/variants.test.ts가 강제한다.
// 합계 194행 = verified 78 / conditional 76 / experimental 39 / blocked 1.
// 노출(verified+conditional) = 154종 변형. 재료 30종.
import type { RecipeDef } from './types';
import { RECIPES } from './recipes';

export type IngredientId =
  | 'olive' | 'choco' | 'strawberry' | 'chestnut'
  // 2026-08-25 확장 8종 — 색 스펙트럼이 겹치지 않게 고르고, 실제 사워도우 레시피 근거가 있는 것만
  | 'walnut' | 'cranberry' | 'fig' | 'rosemary'
  | 'cheese' | 'cinnamon' | 'blueberry' | 'pumpkin'
  // 2026-08-26 확장 18종 — 같은 기준. 기존 12색이 이미 따뜻한 갈색·호박색 대역에 4종(밤·계피·치즈·
  // 단호박)을 채워서, 비어 있던 칸(흑·백/크림·자홍·선명한 녹·회청)을 노리고 골랐다.
  | 'raisin' | 'lemon' | 'banana' | 'apricot' | 'beet' | 'coconut'
  | 'pistachio' | 'oat' | 'poppyseed' | 'sunflowerseed' | 'flaxseed' | 'maple'
  | 'redbean' | 'sweetpotato' | 'matcha' | 'blackgarlic' | 'yuzu' | 'honey';

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
  | 'swirl'    // 스월 (계피 설탕·팥앙금)
  | 'seed'     // 씨앗 (단호박씨·포피시드·해바라기씨·아마씨)
  // 2026-08-26 확장에서 딱 하나 늘었다. 압착 귀리는 `dried`(통째 말린 것)도 `ground`(가루)도 아닌
  // 실물 상품 형태라, 둘 중 하나에 밀어 넣으면 표시명이 거짓이 된다
  | 'flake';   // 플레이크 (압착 귀리)

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
  // ── 2026-08-26 확장 18종 ──
  // 형태는 조사 결과가 결정했다 — 손으로 고르지 않았다. 표시명이 어색해지는 형태는 교정했고
  // 사유를 남긴다(교정 4건): maple은 고형 슈거 캔디라 `cube`(기본 분기의 "구운 조각"이 거짓) ·
  // yuzu 껍질은 `slice` · blackgarlic은 조사가 "으깬 페이스트"로 판정해 `crumble` ·
  // raisin은 `dried`면 "말린 건포도"가 되어 `flesh`(말린 과육).
  { id: 'raisin', forms: ['flesh'] },
  { id: 'lemon', forms: ['slice'] },
  { id: 'banana', forms: ['slice'] },
  { id: 'apricot', forms: ['dried'] },
  { id: 'beet', forms: ['fresh', 'roasted'] },
  { id: 'coconut', forms: ['dried'] },
  { id: 'pistachio', forms: ['piece'] },
  { id: 'oat', forms: ['flake'] },
  { id: 'poppyseed', forms: ['seed'] },
  { id: 'sunflowerseed', forms: ['seed'] },
  { id: 'flaxseed', forms: ['seed', 'ground'] },
  { id: 'maple', forms: ['cube'] },
  { id: 'redbean', forms: ['swirl'] },
  { id: 'sweetpotato', forms: ['puree', 'roasted'] },
  { id: 'matcha', forms: ['ground'] },
  { id: 'blackgarlic', forms: ['crumble'] },
  { id: 'yuzu', forms: ['slice', 'fresh'] },
  { id: 'honey', forms: ['jam'] },
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

  // ── 확장 18종 105행 (조사 2026-08-26) ───────────────────────────────────────
  // 방법론은 2026-08-25와 동일 — **실제로 연 페이지의 URL이 있는 것만** verified/conditional.
  // 발견과 검증을 분리해 돌렸고 검증이 15건을 강등시켰다: 예를 들어 matcha×pancake은 discard에
  // 베이킹파우더가 부풀리는 구조라 강등, blackgarlic은 원문이 "으깬 페이스트"라 형태 자체가
  // piece가 아니었다(§18-1 "재료가 아니라 형태에 등급을 매긴다"의 적용).
  // ★조사 한계: **웨이백 머신이 이 환경에서 열리지 않아** KAB 403 우회로가 없다.
  //   2026-08-25 메모가 "재조사 1순위"로 지목한 항목인데, 수단이 없다는 게 이번 결론이다.
  // 건포도 — 노출 5/6
  R('loaf', 'raisin', 'flesh', 'verified', 'https://homegrownhappiness.com/sourdough-cinnamon-raisin-bread/'),
  R('wholewheat', 'raisin', 'flesh', 'verified', 'https://journeytotheeternalcity.com/whole-wheat-cinnamon-swirl-raisin-bread-recipe/'),
  R('campagne', 'raisin', 'flesh', 'conditional', 'https://amybakesbread.com/cinnamon-raisin-sourdough-bread/'),
  R('rye', 'raisin', 'flesh', 'conditional', 'https://www.virtuousbread.com/bread-recipe/wonderful-recipe-for-delicious-sourdough-rye-and-raisin-bread/'),
  R('scone', 'raisin', 'flesh', 'conditional', 'https://www.thenfeedthem.com/post/how-to-make-quick-sourdough-golden-raisin-scones-with-your-discard'),
  R('pancake', 'raisin', 'flesh', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),

  // 레몬 — 노출 3/6
  R('focaccia', 'lemon', 'slice', 'verified', 'https://somebodyfeedseb.com/sourdough-focaccia-with-feta-and-lemon/'),
  R('campagne', 'lemon', 'slice', 'conditional', 'https://sourdoughbrandon.com/preserved-lemon-and-rosemary-sourdough-bread/'),
  R('scone', 'lemon', 'slice', 'conditional', 'https://www.thekitchenmagpie.com/glazed-meyer-lemon-scones/'),
  R('cracker', 'lemon', 'slice', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),
  R('flatbread', 'lemon', 'slice', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),
  R('loaf', 'lemon', 'slice', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),

  // 바나나 — 노출 4/5
  R('flatbread', 'banana', 'slice', 'conditional', 'https://gayathriscookspot.com/2019/06/roti-gulay-banana-roti-thai-roti-thai-banana-roti-recipe/'),
  R('loaf', 'banana', 'slice', 'conditional', 'https://sourdoughbrandon.com/sourdough-banana-bread/'),
  R('pancake', 'banana', 'slice', 'conditional', 'https://homegrownhappiness.com/sourdough-banana-pancakes/'),
  R('scone', 'banana', 'slice', 'conditional', 'https://butternutbakeryblog.com/banana-scones-with-cinnamon-maple-glaze/'),
  R('campagne', 'banana', 'slice', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),

  // 살구 — 노출 5/5
  R('campagne', 'apricot', 'dried', 'verified', 'https://www.theperfectloaf.com/apricot-and-thyme-sourdough-bread/'),
  R('loaf', 'apricot', 'dried', 'conditional', 'https://web.archive.org/web/20260711165109/https://www.kingarthurbaking.com/recipes/sourdough-apricot-oat-bread-recipe'),
  R('rye', 'apricot', 'dried', 'conditional', 'https://web.archive.org/web/20190709011852/http://www.thefreshloaf.com/node/52716/oat-and-apricot-bread'),
  R('scone', 'apricot', 'dried', 'conditional', 'https://victoriamag.com/dried-apricot-scones-recipe/'),
  R('wholewheat', 'apricot', 'dried', 'conditional', 'https://www.theperfectloaf.com/apricot-and-thyme-sourdough-bread/'),

  // 비트 — 노출 3/5
  R('campagne', 'beet', 'fresh', 'verified', 'https://sammywongskitchen.com/beet-chia-sourdough-bread/'),
  R('focaccia', 'beet', 'fresh', 'conditional', 'https://www.ourhomesteadonthehill.com/homestead/sourdough-beet-focaccia/'),
  R('loaf', 'beet', 'fresh', 'conditional', 'https://passionspoon.com/beetroot-sourdough-bread/'),
  R('campagne', 'beet', 'roasted', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),
  R('wholewheat', 'beet', 'fresh', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),

  // 코코넛 — 노출 5/5
  R('flatbread', 'coconut', 'dried', 'verified', 'https://www.thefreshloaf.com/node/70288/pol-roti-coconut-roti-sd-discard-chimichurri-and-lil-extra'),
  R('scone', 'coconut', 'dried', 'verified', 'https://unhurriedhomemaker.com/2025/06/10/sourdough-blackberry-coconut-scones-made-with-discard/'),
  R('campagne', 'coconut', 'dried', 'conditional', 'https://www.thefreshloaf.com/node/66291/evas-coconut-sourdough'),
  R('loaf', 'coconut', 'dried', 'conditional', 'https://makeitdough.com/sourdough-pan-de-coco/'),
  R('pancake', 'coconut', 'dried', 'conditional', 'https://dontwastethecrumbs.com/yummy-recipe-toasted-coconut-and-banana-sourdough-pancakes/'),

  // 피스타치오 — 노출 3/6
  R('campagne', 'pistachio', 'piece', 'verified', 'https://natashasbaking.com/pistachios-dried-cranberries-sourdough-loaf/'),
  R('focaccia', 'pistachio', 'piece', 'conditional', 'https://www.umami.recipes/recipe/LKAXFQ802QwP87plJAOH'),
  R('scone', 'pistachio', 'piece', 'conditional', 'https://sourdoughbagelsrecipes.substack.com/p/sourdough-strawberry-pistachio-scones'),
  R('cracker', 'pistachio', 'piece', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),
  R('loaf', 'pistachio', 'piece', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),
  R('rye', 'pistachio', 'piece', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),

  // 귀리 — 노출 6/6
  R('campagne', 'oat', 'flake', 'verified', 'https://enwnutrition.com/maple-oat-sourdough-bread/'),
  R('loaf', 'oat', 'flake', 'verified', 'https://idiesfarm.com/sourdough-oatmeal-bread-soft-honey-oat-sandwich-loaf/'),
  R('pancake', 'oat', 'flake', 'verified', 'https://enwnutrition.com/sourdough-oatmeal-pancakes/'),
  R('scone', 'oat', 'flake', 'verified', 'https://www.theperfectloaf.com/sourdough-starter-discard-scones/'),
  R('cracker', 'oat', 'flake', 'conditional', 'https://www.baking-sense.com/2021/09/09/sourdough-oatmeal-crisps/'),
  R('wholewheat', 'oat', 'flake', 'conditional', 'https://web.archive.org/web/20260711184327/https://www.kingarthurbaking.com/recipes/vermont-whole-wheat-oatmeal-honey-bread-recipe'),

  // 포피시드 — 노출 8/8
  R('loaf', 'poppyseed', 'seed', 'verified', 'https://breadtopia.com/seeded-sourdough-bread/'),
  R('pancake', 'poppyseed', 'seed', 'verified', 'https://farmhouseharvest.net/sourdough-lemon-poppy-seed-pancakes-2/'),
  R('scone', 'poppyseed', 'seed', 'verified', 'https://amybakesbread.com/lemon-poppy-seed-sourdough-scones/'),
  R('wholewheat', 'poppyseed', 'seed', 'verified', 'https://www.aheadofthyme.com/seeded-whole-wheat-sourdough-bread-small-batch/'),
  R('campagne', 'poppyseed', 'seed', 'conditional', 'https://brodandtaylor.com/blogs/recipes/poppy-sunflower-sourdough'),
  R('cracker', 'poppyseed', 'seed', 'conditional', 'https://pantrymama.com/seeded-sourdough-discard-crackers/'),
  R('flatbread', 'poppyseed', 'seed', 'conditional', 'https://cleoscooking.com/recipe-items/sesame-poppy-seed-flatbread/'),
  R('focaccia', 'poppyseed', 'seed', 'conditional', 'https://healingslice.com/everything-bagel-sourdough-focaccia-with-cheese-bacon'),

  // 해바라기씨 — 노출 7/7
  R('cracker', 'sunflowerseed', 'seed', 'verified', 'https://www.theperfectloaf.com/seeded-sourdough-discard-crackers/'),
  R('loaf', 'sunflowerseed', 'seed', 'verified', 'https://somebodyfeedseb.com/sunflower-seed-sourdough-bread/'),
  R('rye', 'sunflowerseed', 'seed', 'verified', 'https://bubblingstarter.com/healthy-and-delicious-100-rye-super-seed-sourdough-bread/'),
  R('wholewheat', 'sunflowerseed', 'seed', 'verified', 'https://www.aheadofthyme.com/seeded-whole-wheat-sourdough-bread-small-batch/'),
  R('baguette', 'sunflowerseed', 'seed', 'conditional', 'https://web.archive.org/web/20231123031223/https://tonyfitzgeraldphotography.com/2021/07/28/sunflower-seed-baguette/'),
  R('campagne', 'sunflowerseed', 'seed', 'conditional', 'https://brodandtaylor.com/blogs/recipes/poppy-sunflower-sourdough'),
  R('focaccia', 'sunflowerseed', 'seed', 'conditional', 'https://californiaish.substack.com/p/salted-and-seeded-focaccia'),

  // 아마씨 — 노출 7/7
  R('campagne', 'flaxseed', 'seed', 'verified', 'https://web.archive.org/web/20260711114112/https://www.kingarthurbaking.com/pro/formulas/sourdough-seed-bread'),
  R('loaf', 'flaxseed', 'seed', 'verified', 'https://recipes.macd.us.com/recipes/sourdough-bread-w-flaxseed-sunflower-seeds-oats/'),
  R('rye', 'flaxseed', 'seed', 'verified', 'https://bubblingstarter.com/healthy-and-delicious-100-rye-super-seed-sourdough-bread/'),
  R('wholewheat', 'flaxseed', 'seed', 'verified', 'https://www.aheadofthyme.com/seeded-whole-wheat-sourdough-bread-small-batch/'),
  R('cracker', 'flaxseed', 'seed', 'conditional', 'https://pantrymama.com/seeded-sourdough-discard-crackers/'),
  R('focaccia', 'flaxseed', 'seed', 'conditional', 'https://californiaish.substack.com/p/salted-and-seeded-focaccia'),
  R('pancake', 'flaxseed', 'ground', 'conditional', 'https://www.parsnipsandparsimony.com/sourdough-discard-whole-grain-pancakes/'),

  // 메이플 — 노출 3/5
  R('campagne', 'maple', 'cube', 'conditional', 'https://enwnutrition.com/maple-oat-sourdough-bread/'),
  R('focaccia', 'maple', 'cube', 'conditional', 'https://actsofsourdough.com/maple-bacon-focaccia/'),
  R('loaf', 'maple', 'cube', 'conditional', 'https://vanillaandbean.com/maple-oat-sourdough-sandwich-bread/'),
  R('pancake', 'maple', 'cube', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),
  R('scone', 'maple', 'cube', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),

  // 팥 — 노출 3/6
  R('loaf', 'redbean', 'swirl', 'verified', 'https://halicopteraway.com/2021/01/13/black-sesame-and-red-bean-sourdough/'),
  R('pancake', 'redbean', 'swirl', 'conditional', 'https://www.justonecookbook.com/dorayaki-japanese-red-bean-pancake/'),
  R('scone', 'redbean', 'swirl', 'conditional', 'https://www.jessicasdinnerparty.com/2020/11/adzuki-red-bean-scones/'),
  R('flatbread', 'redbean', 'swirl', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),
  R('focaccia', 'redbean', 'swirl', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),
  R('wholewheat', 'redbean', 'swirl', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),

  // 고구마 — 노출 5/5
  R('focaccia', 'sweetpotato', 'puree', 'verified', 'https://www.bakewithpaws.com/2024/04/purple-sweet-potato-sourdough-focaccia.html'),
  R('loaf', 'sweetpotato', 'puree', 'verified', 'https://breadtopia.com/purple-sweet-potato-sourdough-bread/'),
  R('flatbread', 'sweetpotato', 'puree', 'conditional', 'https://www.occasionallyeggs.com/sweet-potato-naan-vegan-whole-grain/'),
  R('pancake', 'sweetpotato', 'roasted', 'conditional', 'https://www.butterforall.com/traditional-cooking-traditional-living/sweet-potato-sourdough-pancakes/'),
  R('scone', 'sweetpotato', 'roasted', 'conditional', 'https://makeitdough.com/sweet-potato-sourdough-biscuits/'),

  // 말차 — 노출 4/6
  R('loaf', 'matcha', 'ground', 'verified', 'https://somebodyfeedseb.com/matcha-sourdough-bread/'),
  R('focaccia', 'matcha', 'ground', 'conditional', 'https://gardengrubblog.com/the-best-matcha-focaccia-recipe-2-ways-sweet-or-savory/'),
  R('pancake', 'matcha', 'ground', 'conditional', 'https://amandawarrenblog.com/blog/2026/4/8/fluffy-matcha-sourdough-discard-pancakes-easy-zero-waste-recipe'),
  R('scone', 'matcha', 'ground', 'conditional', 'https://tokyopony.com/index.php/2020/12/07/matcha-scones-with-yuzu-drizzle-sweet-red-bean-jam/'),
  R('cracker', 'matcha', 'ground', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),
  R('rye', 'matcha', 'ground', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),

  // 흑마늘 — 노출 3/6
  R('focaccia', 'blackgarlic', 'crumble', 'verified', 'https://brodandtaylor.com/blogs/recipes/black-garlic-sourdough-focaccia'),
  R('campagne', 'blackgarlic', 'crumble', 'conditional', 'https://sourdoughtalk.com/black-garlic-sourdough-bread/'),
  R('loaf', 'blackgarlic', 'crumble', 'conditional', 'https://natashasbaking.com/black-garlic-sourdough-bread/'),
  R('cracker', 'blackgarlic', 'crumble', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),
  R('flatbread', 'blackgarlic', 'crumble', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),
  R('rye', 'blackgarlic', 'crumble', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),

  // 유자 — 노출 1/4
  R('scone', 'yuzu', 'slice', 'conditional', 'https://kankitsulabo.com/blogs/sweets/candied-yuzu-peel-scones'),
  R('focaccia', 'yuzu', 'fresh', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),
  R('loaf', 'yuzu', 'fresh', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),
  R('pancake', 'yuzu', 'fresh', 'experimental', '조사 2026-08-26 · 실 레시피 미발견'),

  // 꿀 — 노출 7/7
  R('focaccia', 'honey', 'jam', 'verified', 'https://actsofsourdough.com/maple-bacon-focaccia/'),
  R('loaf', 'honey', 'jam', 'verified', 'https://idiesfarm.com/sourdough-oatmeal-bread-soft-honey-oat-sandwich-loaf/'),
  R('rye', 'honey', 'jam', 'verified', 'https://keepitsweetkitchen.com/honey-rye-sourdough-bread/'),
  R('wholewheat', 'honey', 'jam', 'verified', 'https://amybakesbread.com/honey-whole-wheat-sourdough-artisan-bread/'),
  R('campagne', 'honey', 'jam', 'conditional', 'https://bronwyns.ca/honey-pistachio-sourdough-bread-recipe/'),
  R('cracker', 'honey', 'jam', 'conditional', 'https://www.baking-sense.com/2021/09/09/sourdough-oatmeal-crisps/'),
  R('pancake', 'honey', 'jam', 'conditional', 'https://dontwastethecrumbs.com/yummy-recipe-toasted-coconut-and-banana-sourdough-pancakes/'),
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
