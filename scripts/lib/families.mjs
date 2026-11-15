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
// 빵은 베이스 10종은 닫힌 집합이지만 **변형(§8, `id--ingredient-form`)이 얹힌다**
// (2026-08-30: scone--choco-chip 등 3종 첫 배선, 95.0+155.6+118.9=369.5KB로 베이스 위에 추가).
// 그래도 고정 상수(2560KB)를 유지한다 — 변형은 조합 폭발이 아니라 rulesForBase가 정하는
// 유한한 호환성 규칙 수만큼만 늘고, 늘어난 실측(13종 1459KB)도 상한 안에 여유가 있다.
// 재료는 12 → 30종으로 자란다. 고정 상수면 재료가 늘 때마다 손으로 올려야 하고,
// 그 손질은 "예산을 지켰다"가 아니라 "예산을 예산에 맞췄다"가 된다.
// 그래서 재료는 **개수 비례**(perItemKB)로 잡는다 — 평균이 기준선을 넘으면 그때 걸린다.
//
// ## 빵 예산 개정 (2026-11-14 — Blender PBR 파이프라인, docs/BREADS.md §Blender)
// 크기를 정하는 게 삼각형이 아니라 **텍스처**가 됐다: 색 1024² WebP 100~190KB + 노멀·거칠기 ≈60KB
// + meshopt 기하 ≈11 B/tri. 14종 실측: 123~468KB · 5.3k~18.6k tri · 합 3401KB
// (최대 = 토핑 변형 딸기 팬케이크 468KB · 포카치아 18.6k tri). 그래서 개당 500KB · 20k tri.
// 런타임 비용은 개수와 무관하다 — 쇼케이스는 한 번에 1개만 올리고 이전 것을 dispose한다(breadShowcase.ts).
// 합계는 OTA가 매 판 통째로 내려받는 몫이다. WebP·meshopt라 zip이 9%밖에 못 줄인다:
// OTA zip 실측 5.5MB(1.6.4, 옛 빵) → 8.77MB(1.6.5: 빵 GLB 3.1MB + 빵 썸네일 PNG 1.6MB, 나머지 4.0MB) → 8.79MB(1.6.6) → 10.71MB(1.6.7: 팬케이크 변형 4종).
// 실사풍 썸네일은 PNG가 옛 판의 두 배다. 합계 상한 5MB면 zip ≈ 10.5MB다.
// 넘기면 새 빵을 얹기 전에 색 맵 품질·해상도부터 다시 본다(wholewheat는 WebP 품질 76으로 맞췄다).

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
    perKB: 500,
    maxTri: 20000,
    /** 베이스 10종(닫힌 집합) + 변형(호환성 규칙 수만큼, 열려 있으나 유한) — 고정 합계 = OTA 묶음 몫 */
    totalKB: 5120,
    perItemKB: null,
  },
  ingredient: {
    key: 'ingredient',
    outDir: 'ingredients',
    refDir: 'ingredients',
    promptDir: 'ingredients',
    // ★2026-08-26 상향 (100→250KB · 2500→8000tri). 원래 "재료는 빵보다 단순하니 조인다"였는데
    // **그 전제가 틀렸다.** 조인 진짜 이유는 도감 썸네일이 작아서였고, 나는 재료가 **빵과 똑같은
    // 쇼케이스에서 똑같은 크기로 확대돼 감상된다**는 걸 계산에 안 넣었다
    // (`breadShowcase.ts`의 `FIT_SIZE = 1.6`이 패밀리를 안 가린다).
    // 결과: 64px 썸네일에서는 멀쩡하고 전체 화면에서는 각지고 조잡했다 — 실기기에서 드러났다.
    // 상한을 빵과 같게 둔다. 같은 화면에서 같은 크기로 보는 것에 다른 예산을 줄 근거가 없다.
    // (2026-11-14) 빵은 Blender PBR로 옮겨 500KB가 됐다. 재료는 아직 옛 절차 파이프라인(텍스처 0장)이라
    // 250KB가 그 파이프라인의 상한이다. 재료를 Blender로 옮기면 빵 예산을 따른다.
    perKB: 250,
    maxTri: 8000,
    totalKB: null,
    /** 12 → 30종으로 자란다 — 합계는 개수 비례 */
    perItemKB: 160,
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
