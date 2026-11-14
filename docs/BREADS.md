# 빵 GLB 파이프라인 — 절차 정본

빵 14종(`public/breads/<id>.glb` + `thumbs/<id>.png`)의 제작·수정 절차. 2026-08-24 구축.
**2026-11-14부터 새 정본 = §Blender 파이프라인**(구운 PBR 텍스처). 아래 §구성 요소~§결정 이력(2026-08-30)은
옛 three.js 절차 파이프라인(`scripts/breads/*.ts` · breadlab) 기록이다 — 옛 GLB를 고칠 때만 본다.

## Blender 파이프라인 (2026-11-14 — 새 정본)

옛 절차 모델은 단색 면·정반사 0이라 소스·과일이 고무처럼, 빵은 저폴리 장난감처럼 읽혔다("조잡하다", 딸기 팬케이크).
Blender 헤드리스로 고해상 형상 + 절차 재질을 짓고 Cycles로 색·거칠기·노멀·AO를 굽는다. 색 맵엔 AO를 곱하고
음식 색 보정(`lib.food_grade`)을 한 번 건 뒤 **메시 1 · 재질 1** GLB로 내보낸다. 런타임은 노멀·거칠기 맵이 있으면 PBR 경로(`src/render/breadMaterial.ts`)로 그린다.

| 것 | 위치 | 역할 |
|---|---|---|
| 빌더 | `scripts/blender/breads/<id>.py` | `build(lib) → (parts, opts)`. 파트별 메시 + 절차 재질(노드). 머리 주석에 레퍼런스·구성 |
| 공용 도구 | `scripts/blender/lib.py` | 방향(`CAM`·`az`·`horiz`·`frame`) · 형상(`lathe`·`metaballs`·`curve_tube`·`decimate`…) · 재질(`Mat`) · `bake_and_export` |
| 계열 공용 | `scripts/blender/<계열>.py` | 여러 빵이 함께 쓰는 형상·재질. `pancake_stack.py`(팬케이크 2종) · `wedge.py`(스콘 2종) · `slab.py`(크래커·플랫브레드·포카치아 2종) · `long_loaf.py`(바게트·호밀빵·식빵) · `boule.py`(깜빠뉴 2종·통밀 깜빠뉴). 빌더가 `from <계열> import …` |
| 진입점 | `scripts/blender/run.py` | `blender -b --factory-startup -P run.py -- <id> <outDir>` |
| 내보내기 | `scripts/blender-export.mjs` | `npm run breads:blender -- <id…>` → `.work/blender/<id>/`(굽기 PNG·raw.glb·stats) → prune·dedup·meshopt → `public/breads/<id>.glb` |
| 검수 캡처 | `scripts/glb-shot.mjs` | `node scripts/glb-shot.mjs <id> .work/shots --az=0,90,180,270 --size=768` — 앱 썸네일 카메라·조명·재질 정책 그대로, 투명 PNG. 동시 실행 가능(vite 포트를 출력에서 읽는다) |
| 런타임 재질 | `src/render/breadMaterial.ts` | PBR 자산 = MeshStandardMaterial + 방 환경맵(**반사만** — IBL 확산은 셰이더에서 뺐다). 옛 자산 = Lambert 강제 그대로 |

**절차**

1. 레퍼런스 `assets/breads/src/<id>{,-2,-3}.png`(1번 = 정면 정체성)에서 실루엣·비율·특징(칼집·고리·딤플·토핑 개수와 배치)을 읽는다.
   마감은 레퍼런스의 로우폴리 면·클레이 무광을 따르지 않는다 — 딸기 팬케이크처럼 부드러운 실사풍(구운 얼룩·기공·윤기)이 새 정본.
2. 빌더를 쓴다. 좌표 = Blender Z-up, 바닥 z=0, 정면 = −Y, 가장 긴 변 ≈ 1(런타임이 최장축을 1.6으로 맞춘다).
   재질 노드는 `m.lpos()`·`m.lnrm()`(파트 국소 위치·법선 — 합치기 직전 `tag_local`이 심는다)로 짠다.
3. 초안 반복: `LEVAIN_DRAFT=1 npm run breads:blender -- <id>`(텍스처 절반·AO 표본 적게, 5~7초) → glb-shot → 대조.
4. 게이트(전부 통과해야 끝): 정면 대조판 · **64px 판독**(카드 크기로 줄여 레퍼런스와 나란히) · **네 방향 턴테이블**(뜬 파트·구멍·이음매) · 예산(`npm run check-budget`).
5. 고품질 굽기(`LEVAIN_DRAFT` 없이) → `npm run thumbs` → `npm test` · `npm run build`.

**함정 (2026-11-14 딸기 팬케이크 11판 + 13종 재제작 실측)**

- **색은 레퍼런스 픽셀을 재서 맞춘다.** 프롬프트 JSON 앵커대로 칠하면 회베이지로 죽는다. 레퍼런스와 렌더의 같은 자리를 상자 평균으로 재서(세로 줄 표본 + 밝은 쪽 확대) 알베도를 되짚는다. 노출: 위를 보는 면 ≈ 0.93×알베도(선형), 수직면 ≈ 0.83×. 렌더에서 같은 색을 내려면 알베도를 레퍼런스보다 한 단계 더 채도 높게 잡는다(반사·AO가 빼 간다). 단 아래 「채도 1」 함정 때문에 밝은 껍질은 보정이 다시 누른다.
- **빛깔은 굽기 끝의 음식 색 보정이 잡는다(`lib.food_grade`).** 첫 판은 밝은 껍질이 주황 · 노랑(화면 윗면 명도 0.92~0.96)이고 속살이 노래서 앱 베이지 배경에서 껍질과 속살이 한 덩어리로 보였다(사용자 「조형은 괜찮은데 빛깔이 별로」). 보정은 AO를 곱한 색 맵(감마 공간)에 건다. 따뜻한 색상 5~60°만 만진다. 껍질(채도 높음)은 짙게 한다(밝은 껍질 20% · 어두운 껍질 8%). 밝은 껍질(알베도 명도 0.6~0.85 위)만 채도 0.62 위를 누르고 색상을 32°(황금 갈색)로 당긴다. 속살(채도 낮고 밝음)은 밝고 담백하게, 끝에 대비 1.05. 빨강·초록·회색은 그대로다.
  기준 = 실물 빵 스캔(ambientCG `3DBread001~013`, CC0) 색 맵: 껍질 색상 26~31° · 채도 0.3~0.65. 첫 판 껍질 채도는 0.75~1.0이었다.
  실패한 판: 색상 +4° 회전(노란 껍질이 올리브색) · 모든 껍질 채도를 0.55 위에서 누름 + 어두운 껍질까지 색상 당김 + 그늘 깊게(깜빠뉴 · 호밀 · 통밀이 회갈색 진흙). 잘 구운 어두운 껍질은 붉은 갈색이 맞다.
  빌더 알베도는 보정 전 값이다. 색을 새로 맞출 땐 구운 뒤 화면을 보고 판단한다.
- **채도 1 껍질은 화면에서 붉게 밀린다.** 파랑이 0인 알베도에 앱 반사광(방 환경맵)이 선형으로 흰빛을 더하면 sRGB에서 파랑만 솟아 색상이 6° 붉게 간다. 팬케이크 윗면 알베도 `#BB5F00`(색상 30°)이 화면에선 `#BF6930`(24°) 주황 플라스틱이었다. 껍질 색은 raw.glb에서 위를 보는 정점의 UV로 색 맵을 찍어 재고(화면 색과 따로) 화면 썸네일과 대조한다.
- **Cycles 빛 굽기는 쓰지 않는다.** 확산광(머리 위 원판 · 하늘 · 바닥 되비침)을 구워 AgX · Khronos PBR Neutral을 입혀 봤다. 앱 조명 결과와 거의 같았고 스스로 겹친 크림 고리 사이에 검은 줄이 생겼다. 빛깔 문제는 빛이 아니라 알베도 색이었다.
- **관(`curve_tube` + 단면 곡선)은 법선이 통째로 뒤집힐 수 있다.** 크림 로제트 면의 97%가 안쪽을 봤다. 앱은 양면 재질이라 안 보이고 `check-winding`(빵 전체 부피 부호)도 통과한다. 굽기만 틀린다(AO가 관 안쪽을 잰다). `curve_tube`가 `recalc_face_normals`로 바로잡는다. 의심되면 면 중심에서 법선 방향으로 쏜 BVH 광선이 자기 메시에 맞는 비율을 잰다.
- **AO는 재질별로**: `ao_strength={'*': 0.6, '<재질>': …}`. 흰·밝은 재질(크림·속살)은 0.25 — 0.6이면 토핑 틈에서 회색으로 죽는다(크림 법선 뒤집힘을 고치기 전 실측). 빵 반죽은 0.45 — 0.8이면 장 사이 틈 바로 위 주황 껍질 띠가 갈색 진흙(#996741 대 레퍼런스 #E98128)이 됐다. 진한 골 그늘은 AO보다 재질색(아래를 보는 껍질을 짙게)으로 낸다.
- **방 환경맵 반사가 채도를 뺀다.** 빵 껍질 거칠기 0.85~0.9(0.6~0.72도 회색 막이 씌워졌다 — 렌더 B 채널이 레퍼런스보다 0x20~0x40 높으면 이것). 윤기(0.05~0.3)는 소스·잼·기름·과일 껍질·초콜릿에만.
- **기공은 고품질 굽기 크기에서 보이게.** 지름 ≈ 장 두께의 6%(보로노이 문턱 0.14~0.22). 0.08~0.16은 바늘구멍이라 1024 텍스처에서도 사라졌다.
- **법선 기반 마스크(껍질/속살)에 노이즈를 더할 땐 경계 폭보다 작게.** 크게 흔들면 껍질 조각이 옆벽 전체로 번져 나뭇결 줄무늬가 된다.
- **반복 토핑은 눕히고 방향을 흩는다.** 곧추선 반쪽 딸기 9개는 테두리 왕관으로 읽혔다. 납작한 타원체 덮개는 빨간 단추로 읽혔다(두 번) — 쓰지 않는다.
- **흰 것을 둘러싼 진한 것**: 크림 위에 통딸기를 정수리에 얹으면 크림이 고리로만 보인다 — 주인공 토핑은 어깨에 비켜 앉힌다.
- 메타볼(임계 0.6·강성 2): 공 하나의 보이는 반지름 = 0.575R, 간격 0.25R 사슬 굵기 = 0.715R. 메타볼 변환은 새 오브젝트를 만든다(`lib.to_mesh`가 처리).
- 예산 다이어트: 메타볼·관은 `lib.decimate`로 목표 삼각형까지, 회전체 48분할, 탄젠트는 내보내지 않는다(three가 화면 미분으로 노멀맵 축을 만든다 — 기하 −25%).
- **홈·갈라짐은 형상으로 판다.** 셰이더로만 그린 스콘 갈라짐은 분필·바느질 선으로 읽혔다. 변위는 `lib.displace_normal`(법선을 먼저 다 읽고 민다 — 정점마다 다시 읽던 옛 판은 칼집 벼랑에서 X가 거꾸로 솟았다).
- **칼집 속살색은 높이 0선까지만.** 솟은 귀 안쪽 비탈까지 칠하면 연노랑 꽃잎 넷으로 읽혔다. 귀 = 껍질색 + 가루, 입술 = 그을린 선, 홈 = 안으로 꺼진 속살.
- **윤기 있는 단면(잼·초콜릿)은 거칠기 0.36~0.42.** 0.16은 방 반사로 잼이 자홍색으로 떴고, 0.25 초콜릿은 젖은 비닐처럼 번들거렸다.
- **반복 무늬는 고른 패턴을 깨야 산다.** 고른 나선 잼은 과녁, 고른 밀가루 고리는 줄무늬 공 — 폭·위상·농도에 큰 노이즈와 빈 곳. 밝은 밀기울 점이 25%를 넘으면 표범 무늬(10~18%, 각진 보로노이 조각).
- **64px에서 뭉치는 것**: 겹친 칼집 4개는 흰 띠 한 줄이 됐다(사선으로 띄움). 가는 빵은 1.6 정규화로 실처럼 가늘어진다(바게트 굵기를 레퍼런스보다 키움). 높이는 레퍼런스 정면도가 아니라 3/4 대조로 정한다.
- **긴 빵 끝을 decimate하지 않는다.** 바늘 삼각형이 옆면 세로 줄무늬가 됐다 — 길이 방향 정거장을 끝에 촘촘히 둔다(`long_loaf.py`).
- **쇼케이스 각도 = 썸네일 36°.** 앱 카메라는 +Z 위 52°라 쇼케이스 그룹을 −16° 젖힌다(`breadShowcase.ts`). 부호가 반대면 68°가 되어 팬케이크가 원반으로 보였다 — 각도는 QA 캡처(`scripts/qa-shots.mjs --screens=shelf-3d,bake-result`)로 확인한다.
- 셸: python 표준 입력 heredoc 금지(훅이 막는다) · Bash `cd` 금지(절대 경로).

**예산 (PBR, 정본 `scripts/lib/families.mjs`)**: 개당 ≤500KB · ≤20k tri · 합 ≤5120KB. 색 1024² WebP q82(무거우면 품질부터 낮춘다 — 통밀 깜빠뉴 q76) · 노멀 1024² · 거칠기 512².
14종 실측 123~454KB · 5.3k~18.6k tri · 합 3387KB(최대 딸기 팬케이크 454KB · 포카치아 18.6k tri). 합계는 OTA 묶음 몫이다:
zip 5.5MB(1.6.4) → 7.4MB. 빌드는 결정적이다 — 같은 소스로 다시 구우면 GLB가 바이트까지 같다.

**검수 도구(로컬, git 밖)**: `.work/tools/` — `cmp.py`(레퍼런스 배경에 깔고 img2threejs 대조판 + 64px 판독판) ·
`px.py`(상자 평균색) · `turn.py`(네 방향 2×2) · `refsheet.py` · `glb-parts.mjs`(GLB 용량 내역).

## 옛 three.js 절차 파이프라인 (2026-08-24 ~ 2026-11-13)

소비 계약(런타임 Lambert 강제·예산·리핏)은 `scripts/breads/types.ts` 주석이 정본 — 옛 빌더를 고칠 때 필독.

### 구성 요소

| 것 | 위치 | 역할 |
|---|---|---|
| 빌더 | `scripts/breads/<id>.ts` | 빵 1종 = `BreadBuilder` 순수 팩토리. 레지스트리 `index.ts` |
| 공유 유틸 | `scripts/breads/lib.ts` | PRNG·facet·jitter·UV 프로젝터·mergeByMaterial·sliceTriangles 등 |
| breadlab 하네스 | `breadlab.html` + `scripts/breadlab.ts` | dev 전용 프리뷰·검수·내보내기 벤치. URL 파라미터가 전체 상태(파일 머리 주석 참조: id·view·azimuth·overlay·roundtrip·compare·shot·export) |
| 스크린샷 CLI | `scripts/breadlab-shot.mjs` | `node scripts/breadlab-shot.mjs "<query>" out.png` — stdout에 stats JSON |
| 배치 내보내기 | `scripts/export-breads.mjs` | `npm run breads:export [-- id…]` → GLB 저장 (GLTFExporter는 canvas 의존이라 puppeteer 경유가 유일 경로) |
| 예산 검사 | `scripts/check-budget.mjs` | 개당 ≤250KB · 합 ≤2560KB · ≤8000 tri |
| 썸네일 | `scripts/bake-thumbs.mjs` (`npm run thumbs`) | 512² 투명 PNG, 도감 카드용 |
| 모델링 스펙 | `assets/breads/specs/<id>.json` | img2threejs ObjectSculptSpec 보존본(수치 정본 — 코드는 전사) |
| 레퍼런스 | `assets/breads/src/<id>[-2|-3].png` | 형태·비율 정본(3/4·정면·탑다운). **색 정본은 prompts JSON** |
| 워크스페이스 | `assets/breads/work/<id>/` | 스킬 state·author_spec.py·검증 스크립트·렌더. `work/CRIB.md` = 위임용 요약 크립 |

### 새 빵 추가·기존 빵 수정 절차

1. **모델링 엔진 = img2threejs 스킬** (`~/.claude/skills/img2threejs`, 4단계 state 게이트). 절차·스킵 규칙·함정은 `assets/breads/work/CRIB.md`가 요약 정본 — 스펙 프라이어(`assets/prompts/breads/<id>.json` geometry)를 주입해 비전 최소화, complexity=simple, 6패스. **변형(variant) 빵도 이 게이트를 예외 없이 전부 밟는다** — 베이스 빌더에서 계승할 것은 수치(아웃라인·프로필 상수)뿐이지 절차 생략이 아니다. 절차를 생략하면 지시한 부분만 고쳐지고 나머지는 방치된다(2026-08-30 변형 라운드 실측).
2. 팩토리를 `scripts/breads/<id>.ts`로 어댑트(**2026-08-30 개정 — 마감 정본이 스무스로 바뀜**): 지터 → `computeVertexNormals()` → `toNonIndexed()`(이 순서 필수 — 반대로 하면 다시 플랫이 된다) → UV → `stdMaterial` → `mergeByMaterial`(메시 ≤2). 정점 분리가 필요 없으면 indexed 유지도 가능. 옛 `facet`(플랫 노멀 각진 마감)은 딱딱한 인클루전 같은 예외에만 근거를 남기고 쓴다. 상세·대가(대비 소실·rim 모따기 함정)는 `assets/breads/work/CRIB.md` §마감 계약. 수치를 고칠 땐 **스펙(author_spec.py) 먼저, 코드는 전사**.
3. 검수: `breadlab.html?id=<id>&compare=1`(레퍼런스 콜라주) → `&roundtrip=1`(런타임 파리티 최종 판정) → azimuth 90/180/270 턴테이블.
4. `npm run breads:export -- <id>` → `npm run check-budget` → `npm run thumbs`.
5. 검증: `npm test` + `npm run build` + dev 앱에서 도감 카드·쇼케이스 Screen 확인.

### 함정 (실측 유래 — 상세는 CRIB.md와 각 빌더 머리 주석)

- 런타임이 모든 머티리얼을 `MeshLambertMaterial({map, color})`로 강제 교체 — **버텍스컬러·PBR·flatShading 죽음**. 페이셋은 지오메트리에 베이크, 색은 map/color만.
- displacement 디테일은 정점 간격보다 작으면 조용히 사라진다 — 격자 셀 단위로 팔 것, 벽 기울기 ≥30°.
- `LatheGeometry` 금지(φ-seam 실금). 링 수동 구성(`lib.buildRevolvedShell`). 프로필 t는 **단조** 유지(비단조면 접힌 주름 — domeShell 사례).
- 투톤은 한 덩어리 indexed → (스무스면 `computeVertexNormals()`, 예외적 플랫이면 `facet`) → `toNonIndexed()` → 삼각형 구간 분리(`sliceTriangles`). 흩어진 색 영역은 삼각형 생성 순서를 통제해 구간화(flatbread char / focaccia oil 참조).
- 비대칭 빵은 **방향을 1반복차에 확인**(scone: 180° 회전만으로 IoU 0.659→0.821).
- GLB 크기 ≈ non-indexed vert × 32B(선형). 텍스처는 basecolor 1장 ≤512² PNG(GLTFExporter는 PNG만 굽는다, VISUAL §8).
- vite 스폰 스크립트: "Local:" 배너는 ANSI 스트립 후 파싱, Windows에서 자식 종료는 taskkill 트리킬(`scripts/export-breads.mjs` killTree 참조). puppeteer Chrome 캐시 손상 대비 폴백 = `scripts/lib/launch-browser.mjs`.
- 스킬 python은 Bash로 실행 + `PYTHONIOENCODING=utf-8`(PowerShell은 exit 49 / cp949 사망).
- **판독 게이트 필수**: tri·KB 예산을 통과해도 실제 표시 크기(카드에서 ≈64px)에서 얼룩으로 뭉칠 수 있다. 512² 렌더를 64²로 LANCZOS 다운샘플 → 실제 카드 배경색 위에서 판정(흰 배경 판정은 다르게 나온다). 뭉치면 폴리곤을 올리지 말고 개수를 줄이고 하나를 키운다(군집 실질 상한 3). 상세는 `assets/breads/work/CRIB.md`.
- **img2threejs 스킬 게이트의 실제 위치**: tier1 실루엣 IoU 임계(0.85)는 AI 렌더 레퍼런스에서 원근 차이로 구조적으로 못 닿는다(실측 최선 0.664) — 그래도 패스는 통과한다. 진짜로 막는 건 리뷰 기록 스크립트의 피처 평균 점수(important 0.65/critical 0.8)다. IoU가 낮다고 거기서 반복을 태우지 말 것.

### 결정 이력 (2026-08-24)

- higgsfield generate_3d 폐기 → three.js 절차 모델링(사용자 확정). GLB 내보내기는 breadlab 담당(스킬은 코드 전용).
- 색 정본 = 프롬프트 JSON hex(이미지는 형태·비율만). JSON에 없는 색은 `scaleHex` 결정론 유도 + 출처 주석.
- meshopt 인코딩 미도입 — 합계 1090KB/2560KB로 여유. 예산 압박 시 @gltf-transform 도입이 릴리프 밸브.

### 결정 이력 (2026-08-30 — 변형 3종 라운드: scone--choco-chip · campagne--strawberry-jam · focaccia--olive-flesh)

- **마감 정본 전환**: `jitterVertices` → `facet`(플랫 노멀 각진 로우폴리)을 폐기하고 **스무스 클레이**(지터 → `computeVertexNormals()` → `toNonIndexed()`, 순서 필수)를 정본으로 확정. 정점 분리가 불필요하면 indexed 유지도 가능(GLB 정점 수 1/3 — campagne 변형 실적: tri 2배인데 GLB 26% 작음). 대가는 플랫 노멀이 공짜로 주던 대비(바네통 링·칼집 그림자·잼 골)의 소실 — 텍스처 톤·저주파 형상으로 보상하고 함몰 깊이를 재튜닝해야 한다. 딱딱한 인클루전 등은 예외로 facet을 유지할 수 있으나 근거를 코드 주석에 남긴다. 상세는 `assets/breads/work/CRIB.md` §마감 계약.
- **변형/디테일 빵 tri 구간 신설**: 3000~5000(public 10종의 판형/덩어리/불 구간과 별도 — 그 구간은 닫힌 10종을 예산 합계 2560KB에 배분할 때의 값이라 public 밖인 변형에는 적용되지 않는다). 저예산(549~1098tri)으로는 표면 질감·균열·딤플을 만들 정점이 없어 밋밋해진다는 실측 근거로 신설. 개당 상한(250KB·8000tri)은 그대로.
- **변형도 img2threejs 스킬 정규 절차를 예외 없이 밟는다**: 베이스 빌더 계승은 수치(아웃라인·프로필 상수)로만 하고, state.py 게이트·패스별 자가교정 절차를 생략하지 않는다. 이번 라운드는 "베이스를 계승하라"는 지시로 자가교정 루프가 통째로 빠져 지시한 부분만 고쳐지고 나머지가 방치되는 실패를 겪었다.
- **판독 게이트를 파이프라인 필수 단계로 승격**(위 함정 목록 참조) — 예산 통과와 UI 판독은 별개임이 실측으로 재확인됨.
