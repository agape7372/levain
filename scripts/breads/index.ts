// 빵 빌더 레지스트리 — 해금 순서(= bake-thumbs.mjs IDS = src/sim/recipes.ts).
// 빌더가 생기는 대로 여기 등록. breadlab·export-breads가 이 레지스트리만 본다.
import type { BreadBuilder } from './types';
import { createPancake } from './pancake';
import { createCracker } from './cracker';
import { createCampagne } from './campagne';
import { createScone } from './scone';
import { createFlatbread } from './flatbread';
import { createWholewheat } from './wholewheat';
import { createFocaccia } from './focaccia';
import { createRye } from './rye';
import { createLoaf } from './loaf';
import { createBaguette } from './baguette';
// [변형 3종 — 2026-08-30] 게임 배선 완료. variantIdOf 규약(`${baseId}--${ingredientId}-${form}`)과
// 파일명이 이미 정합해 export-breads·bake-thumbs가 레지스트리만 보고 그대로 처리한다.
// public/breads/로 export됨 — 예산은 families.mjs totalKB(2560KB) 안(실측 13종 1459KB).
import { createSconeChocoChip } from './sconeChocoChip';
import { createCampagneStrawberryJam } from './campagneStrawberryJam';
import { createFocacciaOliveFlesh } from './focacciaOliveFlesh';

export const BREAD_BUILDERS: Record<string, BreadBuilder> = {
  pancake: createPancake,
  cracker: createCracker,
  campagne: createCampagne,
  scone: createScone,
  flatbread: createFlatbread,
  wholewheat: createWholewheat,
  focaccia: createFocaccia,
  rye: createRye,
  loaf: createLoaf,
  baguette: createBaguette,
  'scone--choco-chip': createSconeChocoChip,
  'campagne--strawberry-jam': createCampagneStrawberryJam,
  'focaccia--olive-flesh': createFocacciaOliveFlesh,
};

export const BREAD_ORDER = [
  'pancake',
  'cracker',
  'scone',
  'flatbread',
  'focaccia',
  'loaf',
  'baguette',
  'campagne',
  'rye',
  'wholewheat',
  'scone--choco-chip',
  'campagne--strawberry-jam',
  'focaccia--olive-flesh',
] as const;
