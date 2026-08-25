# 핸드오프 — 재료 3D 도감 + 재료 30종 확장 (2026-08-26 새벽)

- 날짜: 2026-08-26
- 브랜치: `main` (원격 없음)
- 커밋: `599c4b9`(파이프라인) → `4c0f06b`(olive 파일럿) → `0a1ee03`(파일럿 2회차) → `ec5d06d`(GLB 12종)
- 앞 체인: `2026-08-26-ota-132-top-hud-jar-help.md`
- **OTA 미발행** — 사용자 지시 없었다. 아래 "출시 순서 제약" 참조.

## 무엇을 왜 했나

사용자 요구 2개: ① 예전 만든 3D 하네스로 재료를 구현해 도감에 넣기 ② 재료를 30종으로 늘릴
이미지 프롬프트를 그록에 던질 수 있게. 세션 중에 그록이 기존 12종 이미지 36장을 다 떨궈서
①은 대기 0으로 착수 가능했다.

sim 시뮬 코드 0줄 · 셰이더 0줄. 건드린 sim 파일은 데이터 카탈로그 `ingredients.ts`뿐이다.

## 완료

### 파이프라인 일반화 (`599c4b9`)

빵 GLB 파이프라인에 `?family=bread|ingredient` 축 **하나만** 추가했다. 새 하네스 안 만들었다.

- `scripts/lib/families.mjs`(+`.d.ts`) 신설 — 경로·예산 단일 출처. node·브라우저가 공유.
- `scripts/ingredients/types.ts` — 빌더 계약(빵 9조 계승 + 재료 개정 4조).
- `bake-thumbs.mjs`의 하드코딩 `IDS` → 디렉터리 글롭. 재료가 30종까지 자라도 편집 0.
- `check-budget.mjs` 패밀리 순회. **재료 합계는 개수 비례(64KB/개)** — 고정 상수는 자라는 집합에서
  늘 때마다 손으로 올리게 되고 그건 예산을 결과에 맞추는 것이다.
- `breadlab-shot.mjs`는 **변경 0**(쿼리를 그대로 통과시킨다). 기존 빵 명령줄도 그대로 통한다.

### 도감 3D 진입 (`599c4b9`)

- 재료 카드 `div` → `button`. 밝혀진 재료 → 3D 쇼케이스, 미발견 → 힌트 토스트.
  개편 전엔 재료 카드만 탭 반응이 0이라 도감-빵과 규약이 어긋나 있었다.
- `ingredientArtOf` — PNG 썸네일 우선 + SVG 폴백. 그록 원본은 배경이 페일 세이지 단색이라
  카드 표면과 충돌해서 못 쓴다. **GLB에서 구운 투명 배경 썸네일이 유일한 경로**이고,
  이게 재료 GLB가 필요한 진짜 이유다.
- ★재료 쇼케이스는 `spawnSteam()`을 안 탄다. 김은 갓 구운 빵의 다이제틱 신호다.

### 재료 GLB 12종 (`4c0f06b`·`0a1ee03`·`ec5d06d`)

합계 **458KB / 768KB**. 파일럿 olive를 본세션이 확정한 뒤 3배치 위임.

| 재료 | tri/KB | | 재료 | tri/KB |
|---|---|---|---|---|
| walnut | 216 / 22 | | choco | 576 / 55 |
| chestnut | 224 / 23 | | cranberry | 600 / 57 |
| strawberry | 268 / 27 | | cheese | 630 / 61 |
| fig | 250 / 30 | | blueberry | 504 / 49 |
| pumpkin | 334 / 50 | | olive | 432 / 43 |
| cinnamon | 206 / 27 | | rosemary | 108 / 12 |

텍스처는 4종만(cinnamon 176px · fig 192 · pumpkin 192 · strawberry 96, 전부 R3 상한 256 이하).

### 신규 재료 18종 프롬프트 (`599c4b9`)

`assets/prompts/INGREDIENTS_PASTE_NEW18.md` — **사용자에게 전달 완료.** 54장 생성 대기.
raisin · lemon · banana · apricot · beet · coconut · pistachio · oat · poppyseed ·
sunflowerseed · flaxseed · maple · redbean · sweetpotato · matcha · blackgarlic · yuzu · honey

기술 레일 30/30 기계 검증 통과. **팔레트 게이트가 색도 같고 형태도 같던 3쌍을 잡아 고쳤다** —
coconut(귀리와 명도차 0) · lemon(바나나와 둘 다 노란 원반) · flaxseed(계피와 둘 다 둔덕).
잔여 충돌 14쌍은 전부 호박·갈색 대역인데 실루엣이 갈린다(벌집 육각/단풍잎/큐브/갈빗살 웨지).
**honey가 4쌍에 걸려 재판정 1순위** — 실물 이미지 도착 시 64px에서 maple과 구분되는지 볼 것.

### 리서치 (미커밋 — 데이터 전사 대기)

호환성 조사 워크플로 완주(9에이전트·0에러). **병합 100행 = verified 32 / conditional 47 /
experimental 21 / blocked 0**, 신규 노출 변형 **79종**. 죽은 재료 0.
기계 게이트(중복0·id유효·전용라벨0·URL⟺playable) 통과.
결과 = `scratchpad/merged-rows.json` (세션 스크래치패드 — **커밋 전에 레포로 옮길 것**).

검증이 실제로 물었다: **강등 15건.** `matcha×pancake`는 discard+베이킹파우더라 강등,
`blackgarlic×loaf`는 "으깬 페이스트라 `piece` 형태가 아니다"로 **형태 단위 판정**까지 걸렀다.
`blackgarlic×cracker`는 검색 요약엔 있었으나 원문을 열어보니 흑마늘 언급이 아예 없어 강등 —
요약만 믿었으면 허위 conditional이 될 자리였다.

## 데이터 30종까지 완료 (`8de8437`)

1~5는 **끝났다.** `beet`은 조사 배치에서 누락됐던 걸 본세션이 직접 보충했다
(campagne×fresh verified — sammywongskitchen, 르뱅 100g·다치오븐 불).

- 카탈로그 194행(89 + 105) · 노출 변형 72 → **154종** · 죽은 재료 0
- 신규 형태는 `flake` 하나뿐. **표시명 교정 4건** — maple `piece`→`cube`(고형 캔디) ·
  yuzu `piece`→`slice`(껍질) · blackgarlic `piece`→`crumble`(조사가 "으깬 페이스트"로 판정) ·
  raisin `dried`→`flesh`("말린 건포도"가 되어서). **전부 유일성 테스트를 통과하면서 틀리는 종류다.**
- 테스트: `EXPECTED` 블록으로 리터럴을 모으고, `43`은 **"§ 행 46개(영구 동결)" 단언 + 파생**으로 대체 —
  앞으로 배치가 늘어도 유지할 리터럴이 0개다.
- 경제: 상한을 8000으로 열고 실제 완주시켜 측정 → **1181회 ≈ 591일**, `MAX_FEEDS`=1536(실측×1.3).
  닫힌 식 F(154)=1150 대비 2.7% 위 — 가루 말고 다른 게 병목이 되지 않았다는 확인.
- 문서: GDD 재료 개수·변형 수·수용 기준 전부 갱신. `constants.ts` 주석 산술도.

## 남은 일

1. **64px 판독 — 사용자 판정 대기.** 대조 시트를 만들어 전달했다
   (`assets/ingredients/work/thumb-64-sheet.png`·`thumb-64-closeup.png` — 12종을 64px로 축소해
   카드 배경색 `#F2E6D3` 위에 올린 4×3 격자). **시각 지각 문제라 사용자 판정이 정본**이다.
   판정 지점: ★`cranberry`↔`blueberry`(둘 다 작은 열매 군집 — 색이 아니라 형태로 갈려야 한다) ·
   `rosemary` 바늘이 남았는지 · `cinnamon` 나선이 보이는지 · `chestnut`↔`walnut` · `fig`↔`pumpkin`.
   안 읽히면 폴리곤이 아니라 **실루엣을 단순화**한다(개수를 줄이고 하나를 키운다).
2. **앱 배선·런타임 확인 완료.**
   - 코드: 김 게이트(`app.ts:253` `if (kind === 'bread')`) · GLB 경로 분기(`:241`) ·
     재료 카드 `button`(`recipes.ts:424`) · 썸네일 폴백(`:341`·`:345`)
   - `npm run build` green. `dist/ingredients/`에 GLB 12 + 썸네일 12(**번들 +764KB**, 30종이면 약 1.9MB)
   - dev 서버 실측: **재료 자산 24개 전부 200**, 앱 부팅 **콘솔 에러 0**
   - ★**런타임 파리티 12/12 통과**(GLTFExporter → GLB → GLTFLoader 왕복 후 mesh·tri 보존).
     전 종 mesh ≤2, 예산 초과 0. 텍스처 쓴 4종도 정상.
     `choco`·`cranberry`는 mesh **1개** — 단색 버킷 하나로 끝냈다는 뜻이라 계약상 더 좋다.
   - 미확인은 **UI 인터랙션**뿐(탭 → 3D가 화면에 뜨는지, 미발견 토스트, 뒤로가기 후 홈 씬 복원).
     재료 재고가 있어야 밝혀진 카드가 나와서 저장본 조작이 필요하다.
3. **`rosemary` 108tri · `cinnamon` 206tri는 의도된 것으로 판정** — 코드로 확인했고 크립에 못 박았다.
   로즈마리는 바늘 24 × 4tri + 줄기 12tri로 **지터를 전면 생략**(R4)하고 "적고 굵게"로 갔다
   (cmp-1에서 16개가 성글어 24개로 올린 실측 기록 있음). 계피는 나선을 **지오메트리가 아니라
   절단면 텍스처**로 실었다(진짜 3D 롤이면 파트가 늘어 mesh≤2와 충돌). **되돌리지 마라.**
4. **신규 18종 GLB** — 사용자가 그록 이미지를 넣은 뒤. 이번 범위 밖.
5. **실기기 확인** — 1.3.0·1.3.1·1.3.2 세 발행이 여전히 미확인으로 쌓여 있다(이번 세션과 무관).

## ★출시 순서 제약

**트랙 2 데이터(신규 18종)를 트랙 3 자산(그 GLB) 전에 라이브로 내보내지 마라.**
내보내면 도감·교환소에 신규 18종이 전부 똑같은 `plain()` 회색 도형으로 뜬다.
OTA는 사용자 게이트라 작업 항목이 아니라 **제약**으로 못 박는다.

## 함정 (다음 세션이 반드시 볼 것)

정본은 `assets/ingredients/work/CRIB.md`와 `docs/INGREDIENTS.md`. 요지만:

1. ★**좌표 임계값 마스크(로컬 Y > k·R)는 패치를 못 만든다.** 3/4 부감이라 "위를 향한 면"이 시야의
   절반 가까이여서 임계값을 올려도 중심부가 남아 렌더가 거의 안 바뀐다. 정본 =
   `buildRevolvedShell`의 `ringStart`로 **링 인덱스 + 섹터** 직접 지정.
   `splitTrianglesByVertexMask`는 OR-of-3-vertices라 링 1개가 최소 단위.
2. ★**스킬의 진짜 패스 게이트는 tier1 IoU가 아니라 `append_review.py`의 피처 평균 점수다**
   (important 0.65 / critical mustPass 0.8). AI 렌더 레퍼런스는 원근 차이로 IoU 0.85 하드 임계에
   **구조적으로 못 닿는다**(olive 최선 0.664, pancake도 동일) — 거기서 반복을 태우지 마라.
3. **명령 출력을 `/dev/null`로 죽이지 마라** — append 실패를 통째로 놓치고 "기록됐다"고 잘못 마크했다가
   `reviewHistory` 개수를 세어보고서야 들켰다.
4. **렌더가 안 바뀌면 캐싱을 의심하기 전에 PNG를 바이트로 diff해라.**
5. **군집에 "한 덩어리로 만들라"는 빵 함정을 그대로 적용하지 마라.** 빵의 찢어짐은 *한 파트 안에서
   공유 링을 나눌 때* 생긴다. 정점을 공유하지 않는 인스턴스는 알마다 독립 셸이 맞다.
6. **hex 하나를 의도적으로 버리는 게 정답일 수 있다** — 런타임 키라이트가 볼록면 아랫면을 이미
   어둡게 만들어서, 그늘색을 지오메트리에 칠하면 이중으로 어두워진다(olive `#4A3A36` 선례).
7. **`breadlab.ts:175`의 `over` 예산 판정**은 패밀리 인자를 탄다. 하드코딩으로 되돌리면 재료가
   빵의 헐거운 상한(250KB/8000tri)으로 조용히 통과한다.
8. **`git add -A` 금지** — `assets/ingredients/src/`의 그록 원본 36장이 30MB다. 경로 지정 스테이징.
9. **웨이백(web.archive.org)이 이 환경에서 안 열린다** — KAB 403 우회로가 막혔다는 뜻이다.
   메모리가 "재조사 1순위"로 지목한 항목인데, **수단이 없다**는 게 이번 조사의 결론이다.
10. `filling`(초코 전용)·`flour`(밤가루 전용) 재사용 금지 — 다른 베이스 위에서는 표시명이 유일해서
    **테스트를 통과하면서** 틀린 한국어가 나온다. `씨앗` 조합기에도 같은 계열 가드를 넣어 뒀다
    (없으면 "해바라기씨씨"·"아마씨씨"가 나오는데 유일성 테스트가 못 잡는다).

## 바뀐 파일

| 파일 | 변경 |
|---|---|
| `scripts/lib/families.mjs`·`.d.ts` | 신규 — 경로·예산 단일 출처 |
| `scripts/ingredients/` | 신규 — `types.ts` 계약 · `index.ts` 레지스트리 · 빌더 12종 |
| `scripts/breadlab.ts` | `family` 축 · 예산 판정 인자화 · 패밀리 토글 |
| `scripts/{bake-thumbs,export-breads,check-budget}.mjs` | 패밀리화. bake-thumbs는 글롭으로 |
| `scripts/thumbsHarness.ts` | GLB URL 패밀리화 |
| `src/app.ts` | `openShowcase`에 `kind` · **김 게이트** |
| `src/ui/screens/recipes.ts` | `ingredientArtOf` · `openIngredientView` · 카드 버튼화 |
| `src/ui/screens/showcase.ts` | 제목을 인자로(이름 테이블 분리) |
| `src/ui/screens/ingredientArt.ts` | 머리 주석을 "폴백 — 삭제 금지"로 |
| `src/ui/copy.ts` | `ingredientHeadline`·`galleryIngredientLocked` · `씨앗` 가드 |
| `src/sim/ingredients.ts` | `filling` 전용 라벨 경고 |
| `public/ingredients/` | GLB 12 + 썸네일 12 |
| `assets/prompts/ingredients/` | 신규 18종 JSON |
| `assets/prompts/INGREDIENTS_PASTE_NEW18.md` | 신규 — 사용자 투척 시트 |
| `docs/INGREDIENTS.md` | 신규 — 절차 정본(BREADS.md의 차이분만) |
| `docs/GDD.md` §6-3 · `docs/VISUAL.md` §8 · `CLAUDE.md` | 계약·예산·정본 지도 반영 |
