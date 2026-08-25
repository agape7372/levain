// 재료 빌더 레지스트리 — 순서는 src/sim/ingredients.ts의 INGREDIENTS 배열과 일치시킨다
// (도감 카드 순서 = 이 순서). 빌더가 생기는 대로 여기 등록.
// breadlab(?family=ingredient)·export-breads가 이 레지스트리만 본다.
import type { IngredientBuilder } from './types';
import { createOlive } from './olive';
import { createChoco } from './choco';
import { createChestnut } from './chestnut';
import { createFig } from './fig';
import { createWalnut } from './walnut';
import { createCranberry } from './cranberry';
import { createStrawberry } from './strawberry';
import { createPumpkin } from './pumpkin';
import { createBlueberry } from './blueberry';
import { createRosemary } from './rosemary';
import { createCheese } from './cheese';
import { createCinnamon } from './cinnamon';
import { createPoppyseed } from './poppyseed';
import { createSunflowerseed } from './sunflowerseed';
import { createFlaxseed } from './flaxseed';
import { createOat } from './oat';
import { createMatcha } from './matcha';
import { createRedbean } from './redbean';
import { createRaisin } from './raisin';
import { createLemon } from './lemon';
import { createBanana } from './banana';
import { createApricot } from './apricot';
import { createCoconut } from './coconut';
import { createBeet } from './beet';
import { createSweetpotato } from './sweetpotato';
import { createYuzu } from './yuzu';
import { createHoney } from './honey';
import { createMaple } from './maple';

export const INGREDIENT_BUILDERS: Record<string, IngredientBuilder> = {
  olive: createOlive,
  choco: createChoco,
  chestnut: createChestnut,
  fig: createFig,
  walnut: createWalnut,
  cranberry: createCranberry,
  strawberry: createStrawberry,
  pumpkin: createPumpkin,
  blueberry: createBlueberry,
  rosemary: createRosemary,
  cheese: createCheese,
  cinnamon: createCinnamon,
  poppyseed: createPoppyseed,
  sunflowerseed: createSunflowerseed,
  flaxseed: createFlaxseed,
  oat: createOat,
  matcha: createMatcha,
  redbean: createRedbean,
  raisin: createRaisin,
  lemon: createLemon,
  banana: createBanana,
  apricot: createApricot,
  coconut: createCoconut,
  beet: createBeet,
  sweetpotato: createSweetpotato,
  yuzu: createYuzu,
  honey: createHoney,
  maple: createMaple,
};

/** src/sim/ingredients.ts INGREDIENTS 순서. 미등록 id는 하네스 드롭다운에 "(미등록)"으로 뜬다. */
export const INGREDIENT_ORDER = [
  'olive',
  'choco',
  'strawberry',
  'chestnut',
  'walnut',
  'cranberry',
  'fig',
  'rosemary',
  'cheese',
  'cinnamon',
  'blueberry',
  'pumpkin',
  'raisin',
  'lemon',
  'banana',
  'apricot',
  'beet',
  'coconut',
  'sweetpotato',
  'yuzu',
  'honey',
] as const;
