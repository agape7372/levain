// PANCAKE_PASTE.md 생성기 — 정본 JSON에서 기계 전사한다(md는 파생물).
// 사용: node scripts/gen-pancake-sheet.mjs  (JSON을 고친 뒤 시트를 다시 뽑을 때)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(REPO, 'assets/prompts/breads');
const OUT = join(REPO, 'assets/prompts/PANCAKE_PASTE.md');

/** 배치 = 게임 노출 상태로 나눈다(verified+conditional만 v1 노출). */
const BATCHES = [
  {
    title: '배치 1 — 베이스 + verified (7종)',
    lead: '게임에 이미 노출된 조합 중 실증 근거가 확인된 것들. 먼저 이 배치부터 던진다.',
    ids: ['pancake', 'pancake--choco-chip', 'pancake--choco-cocoa', 'pancake--strawberry-fresh',
      'pancake--blueberry-fresh', 'pancake--oat-flake', 'pancake--poppyseed-seed'],
  },
  {
    title: '배치 2 — conditional (8종)',
    lead: '형태·비율 제한부로 실증된 조합. 게임 노출 대상이다.',
    ids: ['pancake--banana-slice', 'pancake--beet-puree', 'pancake--coconut-dried',
      'pancake--flaxseed-ground', 'pancake--redbean-swirl', 'pancake--sweetpotato-roasted',
      'pancake--matcha-ground', 'pancake--honey-jam'],
  },
  {
    title: '배치 3 — experimental (5종, 게임 미노출)',
    lead: '호환성 판정표에는 있지만 v1 게임에는 안 뜬다(노출 = verified + conditional). 자산이 필요해지면 던지고, 아니면 건너뛴다.',
    ids: ['pancake--olive-flesh', 'pancake--cinnamon-ground', 'pancake--raisin-flesh',
      'pancake--maple-cube', 'pancake--yuzu-fresh'],
  },
];

/** 시트용 비고 — 그 재료를 왜 그렇게 그리는지. 생성 결과 판정할 때 보는 줄이다. */
const NOTE = {
  'pancake': '클래식 — 각진 버터 조각(밑면만 녹기 시작) + 메이플 시럽 흘림 + 슈가파우더. 버터가 액체 웅덩이뿐이면 폐기.',
  'pancake--choco-chip': '반죽은 밝은 황금색 유지(코코아형 아님). 칩은 녹아 번진 반점, 위에 생크림 + 퍼지 지그재그 + 여분 칩. 각진 보석처럼 박힌 칩이면 폐기.',
  'pancake--choco-cocoa': '반죽 전체가 균일한 다크브라운(반점 없음) + 광택 가나슈 부음 + 생크림 + 라즈베리 + 초콜릿 셰이빙. 밝은 반죽에 점이면 초코칩형과 혼동, 폐기.',
  'pancake--strawberry-fresh': '사용자 통과본. 크림 돌롭 + 통 딸기 2·반 3 + 소스 3드립 + 슈가파우더 + 민트. 딸기가 반죽에 박히면 폐기.',
  'pancake--blueberry-fresh': '통 블루베리(자르지 않음, 과분 있음) 무더기 + 과육 씹히는 진한 자주 콩포트 + 생크림. 매끈한 시럽·잘린 베리면 폐기.',
  'pancake--oat-flake': '반죽 표면·옆벽에 오트 알갱이 질감 필수(매끈하면 폐기). 위엔 그릭요거트 + 바나나 부채꼴 + 꿀 + 다진 호두 + 오트 꼬집 + 블루베리.',
  'pancake--poppyseed-seed': '아주 작은 검은 점이 반죽 전체에 균일 + 불투명 흰 레몬 글레이즈 + 밝은 제스트 + 블루베리. 글레이즈 없이 점만 있으면 곰팡이로 읽힘, 폐기.',
  'pancake--banana-slice': '토치로 그을린 브륄레 바나나(어슷 타원, 그을림 슬라이스마다 다름) + 꿀 생크림 + 캐러멜 소스 + 초콜릿 셰이빙. 완벽한 원 등간격이면 폐기.',
  'pancake--beet-puree': '반죽 전체 선명한 핑크(표면 비트 조각 없음), 윗면은 로지 브라운으로 구워짐. 위엔 요거트 + 크림치즈 글레이즈 + 라즈베리·블루베리 + 민트. 탁한 갈색이면 폐기.',
  'pancake--coconut-dried': '황금색으로 토스트된 넓은 컬 플레이크 듬뿍(흰 생코코넛이면 폐기) + 망고 큐브 + 망고 소스 + 크림은 보조.',
  'pancake--flaxseed-ground': '통곡물 짙은 크럼(점박이 아님) + 요거트 + 바나나 + 블루베리 + 호두 + 통아마씨 꼬집 + 꿀. 씨앗 점박이 반죽이면 폐기.',
  'pancake--redbean-swirl': '크림에 한 번 접은 앙금 마블(완벽 나선 아님) + 통팥 낱알 + 꿀 + 호두. 도라야키 샌드 형태면 폐기.',
  'pancake--sweetpotato-roasted': '자색고구마 큐브(꿀 광택·캐러멜 모서리) + 고구마 무스 로제트 + 크림 + 꿀 + 시나몬. 게임 재료 아이콘과 맞춰 보라 유지 — 주황이면 단호박으로 읽힌다.',
  'pancake--matcha-ground': '반죽 균일 초록(잎 조각 없음), 윗면은 갈색이 덮인 올리브브라운. 위엔 생크림 + 통팥 + 선명한 말차 더스팅 + 꿀 + 아몬드. 형광 초록·갈변 0이면 폐기.',
  'pancake--honey-jam': '육각 셀이 보이는 벌집 조각 + 녹는 허니콤 버터 디스크 + 꿀을 과하다 싶게 흘림. 생크림 없음. 벌집 없이 시럽만이면 폐기.',
  'pancake--olive-flesh': '세이버리. 칼라마타 통·반(광택) + 페타 크럼블 + 방울토마토 + 허브 + 올리브오일. 시럽·생크림·단 과일이 나오면 폐기.',
  'pancake--cinnamon-ground': '윗면에 구워진 시나몬-설탕 스월(느슨·오프센터·끊김 1회) + 흰 크림치즈 글레이즈 지그재그 + 버터 + 시나몬 슈거. 완벽한 과녁 나선이면 폐기.',
  'pancake--raisin-flesh': '럼에 불려 통통하고 윤기 나는 건포도 스푼 + 시럽 + 크림 + 시나몬 + 메이플. 옆벽 단면 3~4개만 — 윗면에 박힌 마른 건포도면 폐기.',
  'pancake--maple-cube': '버터 조각 + 메이플 슈거 큐브가 따뜻한 시럽에 반쯤 녹는 중 + 시럽 부음 + 다진 피칸(통 피칸 아님) + 시나몬.',
  'pancake--yuzu-fresh': '유자 크림(연노랑) + 유자청 건더기(껍질 채 엉킴) + 시럽 + 캔디드 필 트위스트 + 민트. 생유자 슬라이스·레몬 톤이면 폐기.',
};

const HEAD = `# 팬케이크 계열 이미지 생성 프롬프트 — 20종 v5 (Codex 투입 시트, 2026-09-02 롱폼 전면 재작성)

정본은 \`assets/prompts/breads/<id>.json\`이다 — **이 시트는 거기서 기계 전사한 파생물**.
문구를 고칠 일이 생기면 JSON을 고치고 시트를 다시 뽑는다(\`node scripts/gen-pancake-sheet.mjs\`).

**v3·v4 산출물(assets/breads/src/pancake*.png, 09-01~02 생성분)은 전부 폐기 대상.** v5는 방향이 다르다 —
과일·토핑을 반죽에 박지 않고 **카페 플레이팅처럼 위에 얹는다**(생크림·소스·슈가파우더·허브 동반), 메뉴별
인터넷 리서치 근거, 항목당 800~950단어 롱폼. 과일·소스는 자연 광택 허용(레퍼런스는 절차 모델링의
형태·비율 입력이라 텍스처로 구워지지 않는다).

## 하는 법 (Codex / ChatGPT 이미지)

1. **먼저 \`pancake\`(베이스) ①을 1장만** 뽑아 보고 판정한다. 통과하면 나머지로 확산.
2. 항목마다 **새 채팅**을 연다. ①을 통째로 붙여넣어 이미지를 받고, **같은 채팅에서** ②, ③을 순서대로 붙여넣는다.
   새 채팅에서 ②③만 요청하면 다른 스택이 나온다.
3. 비율 1:1, 크기는 생성기 UI에서 최대(1024 이상). 프롬프트에 크기 지시 없음.
4. 결과 저장:

| 뷰 | 저장 경로 |
|---|---|
| ① three-quarter top-front | \`assets/breads/src/<id>.png\` |
| ② front elevation | \`assets/breads/src/<id>-2.png\` |
| ③ top-down | \`assets/breads/src/<id>-3.png\` |

## 검수 체크리스트 (저장 전)

- 토핑이 **위에 얹혀** 있는가 — 과일·덩어리가 반죽에 박혀 있거나 뚫고 나오면 폐기
- 생크림(또는 요거트·버터)·소스가 있고 소스가 **한쪽으로 흘러내리는가** — 맨 스택이면 폐기
- 과일·소스에 **자연 광택**이 있는가 — 점토처럼 전부 matte면 폐기
- 옆벽이 크림색이고 윗면이 블로치 갈색 그라데이션인가 — 옆벽까지 갈색 단색이면 쿠키, 폐기
- 드립 길이·조각 크기·놓인 각도가 **제각각**인가 — 복붙 동일·등간격이면 폐기
- 스택 **하나만**, 접시·포크·테이블·손 없음, 배경은 페일 세이지 단색, 여백 충분
- 항목별 **비고**의 결정적 특징이 살아 있는가

색 정본은 프롬프트 JSON의 hex다 — 이미지는 형태·비율만 정본이다(\`docs/BREADS.md\`).
`;

const out = [HEAD];
for (const b of BATCHES) {
  out.push(`\n---\n\n# ${b.title}\n\n${b.lead}\n`);
  for (const id of b.ids) {
    const j = JSON.parse(readFileSync(join(DIR, `${id}.json`), 'utf8'));
    const note = NOTE[id];
    if (!note) throw new Error(`비고 누락: ${id}`);
    if (!j.followup_views || j.followup_views.length !== 2) throw new Error(`followup_views 2개 아님: ${id}`);
    out.push(`\n## ${j.name_ko} \`${id}\`\n`);
    out.push(`비고: ${note}\n`);
    out.push(`**①**\n\n\`\`\`\n${j.prompt_flat}\n\`\`\`\n`);
    out.push(`**②** 같은 채팅에서:\n\n\`\`\`\n${j.followup_views[0]}\n\`\`\`\n`);
    out.push(`**③** 같은 채팅에서:\n\n\`\`\`\n${j.followup_views[1]}\n\`\`\`\n`);
  }
}
writeFileSync(OUT, out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n', 'utf8');
console.log('wrote', OUT);
