// 재료·변형 레시피 카탈로그 v1 (기준일 2026-08-24) — 정본: 확장기획 §8·§18.
// 호환성은 **데이터가 결정, UI if문 금지** (§8-2). 재료·변형은 sim에 일절 영향 없음
// (사용자 확정 — 순수 컬렉팅 축): 역할은 변형 해금 키 + 도감 수집뿐.
//
// ⚠ 전사 출처: §18 조사 원문(46행 판정표)은 서브에이전트 산출물이라 유실됨 —
// 이 표는 기획서 §18-1(형태 서열)·§18-2(예시 검증)·§18-3(verified 명시 목록)에서
// 재구성했다. sourceRef는 기획서 절 번호만 쓴다(URL 재조작 금지). 명시 목록 우선 원칙으로
// 집계가 §18 요약(24/16/5/1)과 다르다: verified 27 / conditional 13 / experimental 5 /
// blocked 1 = 46행. 편차 근거는 implementation-notes 2026-08-24 참조.
import type { RecipeDef } from './types';
import { RECIPES } from './recipes';

export type IngredientId = 'olive' | 'choco' | 'strawberry' | 'chestnut';

/** 형태에 등급을 매긴다 — 재료가 아니라 (§18-1) */
export type IngredientForm =
  // 올리브: 오일 > 과육 > 슬라이스(토핑) > 브라인
  | 'flesh' | 'slice' | 'oil' | 'brine'
  // 초코: 칩(입자) / 코코아(흡수, 4~8% 상한) / 필링(로프·바브카 전용)
  | 'chip' | 'cocoa' | 'filling'
  // 딸기: 동결건조 > 구운 > 잼 > 생과 (§18-1 — 동결건조 = 수분 0, 최고 호환)
  | 'fresh' | 'roasted' | 'freezedried' | 'jam'
  // 밤: 구운 조각 > 밤가루(무글루텐 20~25% 하드캡) > 퓌레(필링 전용)
  | 'piece' | 'flour' | 'puree';

export interface IngredientDef {
  id: IngredientId;
  forms: IngredientForm[];
}

export const INGREDIENTS: readonly IngredientDef[] = [
  { id: 'olive', forms: ['flesh', 'slice', 'oil', 'brine'] },
  { id: 'choco', forms: ['chip', 'cocoa', 'filling'] },
  { id: 'strawberry', forms: ['fresh', 'roasted', 'freezedried', 'jam'] },
  { id: 'chestnut', forms: ['piece', 'flour', 'puree'] },
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

/** 판정표 46행 — §18 전사(재구성). 무효 조합은 여기 없음 = 시도 자체가 차단 (§8-2) */
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
