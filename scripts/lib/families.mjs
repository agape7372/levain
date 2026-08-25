// 3D 자산 패밀리 테이블 — 경로·예산의 단일 출처.
//
// 소비자: check-budget.mjs · bake-thumbs.mjs · export-breads.mjs (node) +
//         breadlab.ts · thumbsHarness.ts (브라우저, vite가 .mjs를 그대로 번들한다).
// 타입은 families.d.ts. 값을 여기서만 고치면 전 소비자가 따라온다.
//
// ## 예산 근거 (2026-08-26 실측)
// GLB 크기는 non-indexed 정점 수에 선형이고, 텍스처 없는 페이셋 메시는 **≈96 B/tri**다:
//   loaf 260tri→27KB · scone 396→39KB · flatbread 540→53KB · focaccia 552→54KB ·
//   cracker 704→67KB · baguette 2048→194KB  (전부 tri×96 + 1~2KB 오버헤드)
// 재료는 구조적으로 빵보다 단순한 단일·군집 오브젝트라 상한을 조인다.
//
// ## 합계 예산이 패밀리마다 다른 이유
// 빵은 10종으로 닫힌 집합이라 고정 상수(2560KB)가 맞다.
// 재료는 12 → 30종으로 자란다. 고정 상수면 재료가 늘 때마다 손으로 올려야 하고,
// 그 손질은 "예산을 지켰다"가 아니라 "예산을 예산에 맞췄다"가 된다.
// 그래서 재료는 **개수 비례**(perItemKB)로 잡는다 — 평균이 기준선을 넘으면 그때 걸린다.

/** @type {import('./families.d.ts').FamilyKey[]} */
export const FAMILY_KEYS = ['bread', 'ingredient'];

/** @type {Record<string, import('./families.d.ts').Family>} */
export const FAMILIES = {
  bread: {
    key: 'bread',
    /** public/<outDir>/<id>.glb · public/<outDir>/thumbs/<id>.png */
    outDir: 'breads',
    /** assets/<refDir>/src/<id>[-2|-3].png — 형태·비율 정본 */
    refDir: 'breads',
    /** assets/prompts/<promptDir>/<id>.json — 색 정본 */
    promptDir: 'breads',
    perKB: 250,
    maxTri: 8000,
    /** 닫힌 집합(10종) — 고정 합계 */
    totalKB: 2560,
    perItemKB: null,
  },
  ingredient: {
    key: 'ingredient',
    outDir: 'ingredients',
    refDir: 'ingredients',
    promptDir: 'ingredients',
    perKB: 100,
    maxTri: 2500,
    totalKB: null,
    /** 12 → 30종으로 자란다 — 합계는 개수 비례 */
    perItemKB: 64,
  },
};

/** CLI `--family=<key>` 파싱. 없으면 bread(기존 동작 보존). */
export function familyFromArgv(argv) {
  const hit = argv.find((a) => a.startsWith('--family='));
  const key = hit ? hit.slice('--family='.length) : 'bread';
  const fam = FAMILIES[key];
  if (!fam) throw new Error(`알 수 없는 family: ${key} — 가능: ${FAMILY_KEYS.join(', ')}`);
  return fam;
}

/** `--family=` 플래그를 뺀 나머지 인자(= id 목록). */
export function idsFromArgv(argv) {
  return argv.filter((a) => !a.startsWith('--'));
}
