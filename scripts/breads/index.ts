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
] as const;
