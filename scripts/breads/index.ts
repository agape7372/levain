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
// [시범 변형 — 초벌 직행 파이프라인 검증, 2026-08-30] breadlab 미리보기 전용.
// public/breads/로 export하지 않는다(빵은 닫힌 10종 · 고정 예산 2560KB).
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
