# 재료 GLB 파이프라인 — 절차 정본

재료 GLB(`public/ingredients/<id>.glb` + `thumbs/<id>.png`)의 제작·수정 절차. 2026-08-26 구축.

**빵 파이프라인(`docs/BREADS.md`)의 일반화다.** 안 바뀐 것 — 런타임 소비 계약, img2threejs state 게이트,
vite+puppeteer 스폰 관용구 — 은 여기 복붙하지 않았다. **BREADS.md를 먼저 읽고 이 문서의 차이분만 얹을 것.**
빌더 계약 정본은 `scripts/ingredients/types.ts` 주석이다 — 코드 작성 전 필독.

## 왜 재료에 3D가 필요한가

도감 카드 아트를 위해서다. 그록 원본(`assets/ingredients/src/`)은 배경이 페일 세이지 단색(`#DFEAE0`)이라
카드 표면(`--bg-soft #F2E6D3`) 위에 그대로 못 올린다. **GLB에서 구운 투명 배경 썸네일**이 유일한 경로이고,
GLB가 생기면 쇼케이스 감상까지 공짜로 따라온다(`SceneHost.enterShowcase`가 이미 패밀리 중립이다).

## 구성 요소 — 빵과 다른 것만

| 것 | 위치 | 빵과의 차이 |
|---|---|---|
| 빌더 | `scripts/ingredients/<id>.ts` | `IngredientBuilder`. 레지스트리 `index.ts` |
| 계약 | `scripts/ingredients/types.ts` | 빵 9조 계승 + **재료 개정 4조**(군집·예산·텍스처·얇은 파트) |
| 공유 유틸 | `scripts/breads/lib.ts` | **옮기지 않았다.** `import … from '../breads/lib'`로 그대로 쓴다 |
| 패밀리 테이블 | `scripts/lib/families.mjs` (+`.d.ts`) | 신설. 경로·예산의 단일 출처 |
| 하네스 | `breadlab.html?family=ingredient` | 같은 하네스. `family` 축 하나만 추가 |
| 스펙 | `assets/ingredients/specs/<id>.json` | 동일 형식 |
| 레퍼런스 | `assets/ingredients/src/<id>[-2\|-3].png` | 형태·비율 정본. **색 정본은 `assets/prompts/ingredients/<id>.json`** |
| 워크스페이스 | `assets/ingredients/work/<id>/` | `work/CRIB.md` = 위임용 크립 |

### ⚠ 이름 빚

**파일명이 `breadlab`인데 재료도 굽는다.** 개명하면 `CRIB.md`·핸드오프·문서의 명령줄이 전부 깨지는데
얻는 게 이름뿐이라 두었다. `?family=`가 실제 축이다. 헷갈리면 이 항목을 보라.

## 새 재료 추가 절차

1. 그록 이미지 3뷰를 `assets/ingredients/src/<id>[-2|-3].png`로 받는다
   (프롬프트 = `assets/prompts/INGREDIENTS_PASTE*.md`, 정본 양식은 `assets/prompts/README.md`).
2. **모델링 엔진 = img2threejs 스킬**. 절차·스킵 규칙·함정은 `assets/ingredients/work/CRIB.md`가 요약 정본.
   스펙 프라이어는 `assets/prompts/ingredients/<id>.json`의 `geometry`를 주입한다(비전 최소화).
3. 팩토리를 `scripts/ingredients/<id>.ts`로 어댑트: indexed에서 지터 → `facet` → UV → `stdMaterial` →
   `mergeByMaterial`(메시 ≤2). **수치를 고칠 땐 스펙 먼저, 코드는 전사.**
4. 검수:
   ```
   node scripts/breadlab-shot.mjs "family=ingredient&id=<id>&compare=1"  …   # 레퍼런스 콜라주
   node scripts/breadlab-shot.mjs "family=ingredient&id=<id>&shot=1&azimuth=90|180|270" …
   node scripts/breadlab-shot.mjs "family=ingredient&id=<id>&shot=1&roundtrip=1" …   # 런타임 파리티(최종)
   ```
5. `npm run ingredients:export -- <id>` → `npm run check-budget` → `npm run ingredients:thumbs`
6. 검증: `npm test` + `npm run build` + dev 앱 도감에서 카드·쇼케이스 확인
7. `src/sim/ingredients.ts`에 재료가 이미 있어야 도감에 뜬다(호환성 행 ≥1 필요 — 죽은 재료는 테스트가 막는다)

## 예산 — 개당 상한은 빵과 같다, 합계 방식만 다르다

| | 빵 | 재료 |
|---|---|---|
| 개당 | ≤250KB · ≤8000 tri | ≤250KB · ≤8000 tri (같다) |
| 합계 | 2560KB 고정 | **개수 비례 160KB/개** |
| 텍스처 | basecolor 1장 ≤512² | **기본 0장**, 탈출구 ≤256² |

★**2026-08-26 상향** (100KB/2500tri → 250KB/8000tri). 원래는 "재료는 구조적으로 빵보다 단순하니
조인다"였는데 **그 전제가 틀렸다.** 조인 진짜 이유는 도감 썸네일이 작아서였고,
재료도 빵과 **똑같은 쇼케이스에서 똑같은 크기로 확대돼 감상된다**는 걸 계산에 안 넣었다
(`src/render/breadShowcase.ts`의 `FIT_SIZE = 1.6`이 패밀리를 안 가린다).

결과: 64px 썸네일에서는 전부 통과하고 **전체 화면에서는 각지고 조잡했다** — 실기기에서 드러났다.
같은 화면에서 같은 크기로 보는 것에 다른 예산을 줄 근거가 없다. **폴리곤을 아껴서 각지게 만들지 마라.**

군별 목표는 폐기했다 — 그 표도 썸네일 전제에서 나온 수치였다.

**개수 비례인 이유**: 빵은 10종으로 닫힌 집합이라 고정 상수가 맞다. 재료는 자라는 집합이라,
고정 상수면 늘 때마다 손으로 올리게 되고 그건 예산을 지킨 게 아니라 **예산을 결과에 맞춘 것**이다.

근거는 실측이다 — 텍스처 없는 페이셋 메시는 **≈96 B/tri**(loaf 260tri→27KB · cracker 704→67KB ·
baguette 2048→194KB, 전부 `tri×96 + 1~2KB`). 정본 = `scripts/lib/families.mjs` 주석.

## 게이트 — 수치가 맞다고 화면이 맞는 건 아니다

발행 후에야 드러난 실패라 절차로 못 박는다. `npm run check-budget`이 예산과 **와인딩**을 같이 본다.

| 게이트 | 무엇을 잡나 |
|---|---|
| `check-budget.mjs` | 개당·합계 KB, tri |
| **`check-winding.mjs`** | **면이 안팎 뒤집힌 셸**(부호부피 음수) |
| breadlab `roundtrip=1` | GLB 왕복 후 mesh·tri 보존 |
| 64px 축소 시트 | 도감 카드 그리드에서의 판독 |
| ★**전체 화면 전 각도 렌더** | **쇼케이스에서의 파손** |

★**마지막 줄이 없어서 사고가 났다.** `fig`·`beet`·`pumpkin`이 면이 뒤집힌 채 발행됐는데
tri·KB·mesh≤2·왕복·64px 판독을 **전부 통과**했다. 뒤집힌 셸은 삼각형 수도 파일 크기도 정상이고,
썸네일 각도에서는 멀쩡해 보였기 때문이다. 런타임은 `FrontSide` 컬링이라 일부 각도에서
**몸통이 통째로 사라지고 꼭지만 남아** "떠 있는 꼭지"로 보였다.

**쇼케이스는 턴테이블이다 — 0/90/180/270을 전부 봐라.** 떠 있는 파트·뚫린 구멍은 한 각도에서만 드러난다.

### 스펙 JSON 역전사 미완 (알려진 빚)

`assets/ingredients/specs/*.json`과 `work/<id>/object-sculpt-spec.json`은 **최초 조형 시점의 기록**이다.
2026-08-26 수리 배치에서 19종의 빌더 수치가 바뀌었는데(세그먼트·지터·색·배치·프로필)
그 값들이 스펙에 역전사되지 않았다. 그래서 지금은 **`scripts/ingredients/<id>.ts`가 현행 정본**이다.
"수치를 고칠 땐 스펙 먼저"는 새 재료를 만들 때의 규칙으로 남고, 기존 재료 수리에는 적용이 밀려 있다.

## 함정 — 빵 파이프라인이 안 겪은 것만

`docs/BREADS.md`의 함정(Lathe 금지·displacement 격자·투톤 슬라이스·비대칭 방향·python 인코딩 등)은
**전부 그대로 유효하다.** 아래는 재료에서 새로 나온 것.

- **군집이 예외가 아니라 다수다.** 30종 중 절반 이상이 다중 인스턴스(올리브 3알·초코칩·크랜베리 뭉치·
  치즈 큐브 3·블루베리 3알·로즈마리 바늘잎·계피 스틱2+가루더미). 한 빌더 안에서 rng 지터 트랜스폼으로
  배치하고 **공유 지면 y=0**에 앉힌다. 파트를 따로 만들어 각각 지터하면 공유 링이 찢어진다.
- **얇은 파트에 빵 지터 진폭을 그대로 먹이지 마라.** `jitterVertices` amp는 빵 크러스트 스케일 튜닝이다.
  로즈마리 바늘잎·계피 스틱 벽에 쓰면 실루엣이 뭉개진다. 파트별 amp 축소 또는 지터 생략 —
  **`lib.ts`를 고치지 말 것**(빵 10종의 바이트가 바뀐다).
- **hue → 머티리얼 버킷 매핑을 스펙 단계에서 확정한다.** 프롬프트 JSON의 hex가 재료당 3~5개인데
  머티리얼은 ≤2다. 구현 중에 발견하면 지오메트리를 다시 갈라야 한다.
  해법 순서: ① 큰 색 영역 2개면 순색 2개 ② 3개 이상이면 한 버킷에 작은 텍스처를 얹어 나머지를 평면 영역으로.
  확정 후보 = pumpkin(껍질·홈그늘·자른면·씨방·꼭지 5색).
- ★**64px 판독 게이트.** 썸네일은 512²로 굽지만 도감 그리드에선 **~64px**로 뜬다. tri·KB를 다 통과하고도
  갈색 얼룩으로 읽힐 수 있다. 안 읽히면 폴리곤이 아니라 **실루엣을 단순화**한다(인스턴스를 줄이고 하나를 키운다).
  rosemary·cinnamon이 1순위 위험군. 빵엔 이 강도로 필요 없던 게이트다.
- **`breadlab.ts`의 `over` 예산 판정**은 패밀리 인자를 탄다. 하드코딩으로 되돌리면 재료가 빵의 헐거운
  상한(250KB/8000tri)으로 조용히 통과한다.
- **`bake-thumbs.mjs`는 디렉터리 글롭**이다(예전 하드코딩 `IDS` 배열을 걷어냈다). 재료가 늘어도 편집 0.
- **`git add -A` 금지** — `assets/ingredients/src/`의 그록 원본 **90장이 114MB**다(30종 × 3뷰). 경로 지정 스테이징.

## 앱 소비 계약

- 카드 아트: `recipes.ts`의 `ingredientArtOf(id)` — `/ingredients/thumbs/<id>.png` 우선,
  404면 `ingredientArt(id)` SVG 폴백. **폴백 파일을 지우지 말 것**(GLB 없는 재료가 빈 칸이 된다).
- 쇼케이스: `openShowcase(id, headline, large, { kind: 'ingredient' })` — `app.ts`가 URL을 조립한다.
  ★**재료는 `spawnSteam()`을 타지 않는다.** 김은 갓 구운 빵의 다이제틱 신호라 생재료에 붙으면 거짓말이다.
- 헤드라인은 데이터 파생: `copy.recipes.ingredientHeadline(n)`, n = 그 재료의 `playableRules()` 수.
  재료가 늘어도 문구는 안 는다.
- 미발견 카드도 버튼이고 힌트 토스트로 답한다 — 도감-빵의 `mysteryCard`와 같은 규약.

## 결정 이력 (2026-08-26)

- `scripts/breads/lib.ts`를 중립 디렉터리로 **옮기지 않았다** — 빵 10종 + `breadlab` + `domeShell`을
  건드리게 되고 바이트 결정론 계약에 재수출 드리프트 위험만 준다. 세 번째 패밀리가 생기면 재검토.
- `breadlab`/`export-breads` **개명 안 함** — 명령줄 호환이 이름보다 값싸다.
- 도감 재료 카드를 `div` → `button`으로. 개편 전엔 재료 카드만 탭 반응이 0이라 도감-빵과 규약이 어긋나 있었다.
- 재료 합계 예산을 **개수 비례**로. 고정 상수는 자라는 집합에서 자기 자신을 검증하지 못한다.
