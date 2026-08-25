# 재료 모델링 크립 — 위임 정본 (olive 파일럿에서 증류)

레포 `C:\Users\agape\Desktop\코딩\levain` · 스킬 루트 `C:\Users\agape\.claude\skills\img2threejs`.
계약 정본 = `scripts/ingredients/types.ts` 주석 전체(먼저 정독). 절차 정본 = `docs/INGREDIENTS.md`.
빵 선례 = `assets/breads/work/CRIB.md` — **거기 있는 함정은 전부 그대로 유효하다.** 이 문서는 차이분만 담는다.

**파일럿 완료 (2026-08-26, 2회차 — 스킬 6패스 풀 루프까지 완주 후 갱신)**: `olive` — 432tri · 42.6KB ·
mesh 2 · roundtrip 통과 · cmp 3회(상한 준수) + 스킬 내부 6패스 게이트 전량 통과.
군집군 목표(300~700tri/≤68KB) 정중앙. 선례 코드 = `scripts/ingredients/olive.ts`(머리 주석 포함).
★1회차는 cmp-3/roundtrip까지만 하고 스킬의 내부 6패스 루프(`next.py` form-refinement 이후)를
안 밟았다 — 밟아보니 하드 게이트 2종이 숨어 있었다(아래 "스킬 파이프라인 실측 함정" 참조).
다음 재료 위임 때는 **6패스를 끝까지 밟을 것을 전제**로 일정을 잡아라.

## 절차 (재료 1종당)

1. 워크스페이스 `assets/ingredients/work/<id>/`. 스킬 스크립트는 스킬 루트에서 실행.
   ```
   python3 forge/state.py init --state <ws>/.img2threejs/state.json --reference <ws 절대경로 레퍼런스> --profile generic --spec <ws>/object-sculpt-spec.json
   ```
   이후 `forge/next.py`가 시키는 대로. **exit 3 = 중단·보고**(반복 상한 도달).
2. **이미지 열람은 레퍼런스 3장 각 1회**(`assets/ingredients/src/<id>.png`·`-2`·`-3`). 형태·비율만 읽는다.
3. assessment는 `--complexity simple`. **스킵 4종**(전부 `state.py mark <step> skipped --reason "..."`):
   - `detail-inventory` — 단일 반복 시스템(알 N개)이면 손 열거가 빠르고 정확
   - `projection-route` — 레퍼런스가 AI 렌더(사진 아님), 런타임 basecolor 1장 상한
   - `material-evidence`/`material-spec-wiring` — 런타임이 map·color만 승계, PBR 채널 무효
   - (해당 시) `action-ready` — mesh≤2 계약이 파트 노드 노출 금지. 사유 기록
4. 스펙: 빵의 `author_spec.py` 패턴 복제(**reviewHistory·sculptPipeline 이월 필수** — 스켈레톤 재생성이
   리뷰 기록을 지운다). 패스 6개(lighting·interaction 제외, **structural-pass는 strict가 요구**).
   수치·색은 `assets/prompts/ingredients/<id>.json` geometry 전사 — **비전 재추출 금지**.
5. `validate_sculpt_spec.py --strict-quality` → `generate_threejs_factory.py` →
   팩토리를 `scripts/ingredients/<id>.ts`로 어댑트(`IngredientBuilder`).
   마감 패스: indexed에서 `jitterVertices` → `facet` → UV 프로젝터 → `stdMaterial` → `mergeByMaterial`.
   `scripts/ingredients/index.ts`에 등록. 스펙을 `assets/ingredients/specs/<id>.json`으로 보존.

## 확정 규칙 (재논의 금지)

- **색 정본 = 프롬프트 JSON hex.** 이미지와 색이 어긋나면 JSON을 따른다. JSON import 금지(산문 안에 박혀 있다).
  없는 색은 `lib.scaleHex` 결정론 유도 + 출처 주석.
- **vertex paint 금지** — 다색은 스펙 단계에서 머티리얼 분리(≤2)로 설계해 원천 차단.
- ★**hue → 버킷 매핑을 스펙 단계에서 확정한다.** 재료당 hex가 3~5개인데 머티리얼은 ≤2다.
  구현 중에 발견하면 지오메트리를 다시 갈라야 한다.
  ① 큰 색 영역 2개면 순색 2개 ② 3개 이상이면 한 버킷에 텍스처(≤256²)를 얹어 나머지를 평면 영역으로.
- **반복마다 `append_review`** — 스킬 카운터(3/패스·6/총)가 정본. 상한 도달 시 중단·보고.
- **`scripts/breads/` 수정 금지** — 빵 10종의 GLB 바이트가 바뀐다. `lib.ts`도 마찬가지
  (지터 진폭을 바꾸고 싶으면 **인스턴스별 오버라이드**로 해결한다).

## 군집 패턴 (12종 중 7종이 여기 해당)

olive 3알 · choco 칩 · cranberry 뭉치 · cheese 큐브 3 · blueberry 3알 · rosemary 바늘잎 · cinnamon 스틱2+가루더미.

- N개 인스턴스를 **한 빌더 안에서** rng 지터 트랜스폼(위치·회전·미세 스케일)으로 배치
- **공유 지면 y=0**에 앉힌다. 뜨는 파트 금지 — 55° 부감에서 즉시 들킨다.
  파일럿 방식: 인스턴스별로 회전 적용 후 `Box3`를 구해 `position.y -= box.min.y`
- 인스턴스끼리 그룹 실루엣을 서로 가리지 않게(프롬프트 JSON `silhouette` 서술 준수)
- ★**"한 덩어리로 만들라"는 빵 함정을 군집에 그대로 적용하지 마라 — 파일럿에서 교정된 지점이다.**
  빵의 찢어짐 함정은 **한 파트 안에서 공유 링을 나눌 때** 생긴다. 서로 정점을 공유하지 않는
  인스턴스(올리브 3알)는 **알마다 독립 셸을 짓고 mesh 변환으로 배치**하는 게 맞다
  (pancake이 디스크 3장을 다루는 방식과 같다). 통짜 positions 배열에 우겨넣지 말 것.
  **알 하나 안에서는** 여전히 indexed → 지터 → `facet` → 삼각형 분리 순서를 지킨다.
- 색 버킷 분리는 `splitTrianglesByVertexMask` + `pickTriangles`. ⚠ **`facet()` 전에 원본 index를
  따로 붙들어야 한다** — `splitTrianglesByVertexMask`는 facet 이전의 indexed 배열을 요구한다.
- 마스크 판정은 **회전을 지오메트리에 구운 뒤** 그 좌표계에서 한다(`geometry.rotateZ(...)` 후 판정).
  회전 전에 계산하면 부호를 재추론하다 틀린다.

## 검수 루프 (반복 상한 3회/재료)

레포 루트에서:
```
node scripts/breadlab-shot.mjs "family=ingredient&id=<id>&compare=1" assets/ingredients/work/<id>/cmp-N.png
node scripts/breadlab-shot.mjs "family=ingredient&id=<id>&shot=1&azimuth=90|180|270" ...
node scripts/breadlab-shot.mjs "family=ingredient&id=<id>&shot=1&roundtrip=1" ...   # 런타임 파리티(최종 1회)
```
stdout `stats {json}`의 tri/kb/mesh로 판정. 어긋나면 **스펙 먼저, 코드는 전사**.
최종: `npm run ingredients:export -- <id>` → `npm run check-budget` → `npm run ingredients:thumbs`.

★**`cmp-4.png`가 생기면 상한 위반이다** — 인계 시 반려 사유. 상한은 프롬프트 지시가 아니라
스킬의 exit 3와 이 파일명 감사 흔적, 두 군데서 집행한다.

## 최종 게이트 — 64px 판독 (빵엔 이 강도로 없던 것)

썸네일은 512²로 굽지만 도감 그리드에선 **~64px**로 뜬다. tri·KB를 다 통과하고도 갈색 얼룩으로 읽힐 수 있다.
`cmp` 이미지를 축소해 봤을 때 그 재료로 읽히는지 확인해라. 안 읽히면 폴리곤이 아니라 **실루엣을 단순화**한다
(인스턴스를 줄이고 하나를 키운다). **rosemary(가는 바늘잎)·cinnamon(가루 더미)이 1순위 위험군.**

## 예산

| 군 | 재료 | tri 목표 | GLB 목표 |
|---|---|---|---|
| 단일 | walnut · chestnut · strawberry · fig · pumpkin | 200~500 | ≤48KB |
| 군집 | olive · choco · cranberry · cheese · blueberry | 300~700 | ≤68KB |
| 세장·복합 | rosemary · cinnamon | 400~900 | ≤88KB |

상한(100KB/개·2500tri)은 상한이지 목표가 아니다. 실측 기준선 = 텍스처 없는 페이셋 메시 **≈96 B/tri**.

★**목표 하한을 한참 밑도는 게 정답인 경우가 있다 — 되돌리지 마라.**
얇거나 텍스처가 일을 하는 자산은 tri를 더 써도 실루엣이 안 좋아진다. 2026-08-26 실측 2건:

| 재료 | 실측 | 목표 | 왜 낮은가 |
|---|---|---|---|
| `rosemary` | **108tri** | 400~900 | 바늘 24개 × 4tri + 줄기 12tri. **지터 전면 생략**(R4)하고 "적고 굵게"로 갔다. cmp-1에서 16개가 성글어 보여 24개로 올린 실측 기록이 있다 — 개수를 더 늘리는 게 아니라 **폭을 키운 게** 답이었다 |
| `cinnamon` | **206tri** | 400~900 | 말린 껍질 나선을 **지오메트리가 아니라 절단면 텍스처**로 실었다. 진짜 3D 롤이면 파트가 늘어 mesh≤2와 충돌한다 |

판정 기준은 tri 수가 아니라 **64px에서 읽히는가**다. 예산은 상한이지 채워야 할 할당량이 아니다.

## 환경

- python은 **Bash로만**(PowerShell exit 49) + `PYTHONIOENCODING=utf-8`(없으면 cp949로 죽음)
- `breadlab-shot`은 vite를 매번 새로 띄운다 — 캐시 경합으로 드물게 실패하면 1회 재시도
- **커밋 금지 · `src/` 수정 금지 · `Math.random` 금지 · 본세션 보고에 이미지 첨부 금지(텍스트 수치만)**
  서브에이전트가 만지는 곳은 `scripts/ingredients/`·`assets/ingredients/{specs,work}/`뿐이다.

## 실측 함정 (olive 파일럿)

- **hex 5개 중 하나를 의도적으로 버리는 게 정답일 수 있다.** 올리브 프롬프트의 `#4A3A36`(그늘진 아랫면)은
  버킷을 안 만들었다 — mesh≤2 예산이 2버킷을 강제하는데, **런타임 키라이트가 볼록한 셸의 아랫면을
  N·L 감쇠로 이미 공짜로 어둡게 만든다.** 지오메트리에 두 번째 어두운 톤을 칠하면 이중으로 어두워진다.
  버릴 땐 스펙에 risk로 기록할 것.
- **지터 진폭은 반지름 대비로 잡는다.** 올리브 `JITTER_AMP = 0.016` ≈ 반지름의 3.6%.
  빵 크러스트 스케일(반지름 1.0에 0.008)을 그대로 쓰면 작은 재료에선 과하다(types.ts R4).
- **비대칭 테이퍼를 프로필로 표현한다.** 올리브는 뭉툭한 끝이 완만하고 꼭지 끝이 급하게 좁아진다 —
  반지름비를 대칭으로 두면 그냥 타원이 되어 정체성이 죽는다. 프로필 `t`는 여전히 **단조** 유지.
- **캡/패치 마스크는 양쪽 극점에 안 닿아야 한다.** 끝까지 번지면 "패치"가 아니라 "투톤 알"이 된다.
- ★**좌표 임계값(로컬 Y > k·R) 마스크는 실패한다 — (링, 섹터) 격자 인덱스가 정본이다.**
  카메라가 위에서 내려다보는 3/4 뷰라 "위를 향한 면"이 시야의 절반 가까이라, k를 0.1→0.55로
  올려도(원주 점유율 47%→31%) 늘 보이는 중심부는 그대로 남아 렌더가 거의 안 바뀐다(cmp-1과
  cmp-2가 거의 동일했다 — 렌더가 안 바뀌면 먼저 로직을, 그다음 캐싱을 의심하되 **바이트 비교로
  실제 변화 여부부터 확인**하라. `a.equals(b)`로 cmp PNG를 직접 diff해서 캐싱이 아님을 확인한 뒤에야
  진짜 원인 — 코드는 맞았는데 좌표 임계값 방식 자체가 "패치"를 못 만든다는 것 — 을 찾았다).
  정본 대체: `buildRevolvedShell`이 돌려주는 `ringStart`로 **링 인덱스 1개 + 섹터 half-width 0**
  (segments=12면 30도 폭)를 직접 지정한다. `splitTrianglesByVertexMask`는 OR-of-3-vertices라
  링 N개를 마킹하면 삼각형 밴드 N+1개가 함께 걸린다 — 링 1개가 이 메커니즘의 최소 단위다.
- **64px 판독은 별도로 렌더해서 본다** — `roundtrip-64.png`처럼 축소본을 따로 남기는 게 파일럿 방식이다.
  숫자 예산을 다 통과하고도 얼룩으로 읽히는지는 축소해 봐야 안다.

## 스킬 파이프라인 실측 함정 (2회차 — form-refinement 이후 6패스 풀 루프)

- ★**`form-refinement`부터 `optimization-pass`를 뺀 모든 패스가 VISUAL_PASS_IDS다.** `orchestrate_passes.py`의
  `check_pass`는 **아직 완료 안 된 현재 패스**에 한해 `tier1Results`에 `passed:true`가 있어야 통과시킨다
  (`has_passing_tier1_result`). AI 렌더(사진 아님) 레퍼런스는 `align_pair.py`로 정렬해도 원근 차이 때문에
  실루엣 IoU 0.85 하드 임계에 구조적으로 못 미칠 수 있다(올리브는 최선으로 0.664) — **이건 pancake도
  마찬가지였다**(`tier1Results` 단일 항목, `passed:false`, 그런데도 6패스 완주). 실제로 패스를 미는 건
  tier1이 아니라 **`append_review.py`의 feature-score 게이트**다(아래 항목).
- ★**진짜 게이트는 `append_review.py`의 important/critical 피처 평균 점수다, tier1 IoU가 아니다.**
  `--feature-reviews-json`에서 그 패스에 `passIds`가 걸린 피처들의 평균이 important는 0.65, critical
  mustPass는 0.8 밑이면 `ValueError`로 거부된다(트레이스백, exit 1). tier1 IoU가 낮아도 이 게이트만
  넘으면 `orchestrate_passes.py check`가 진짜 PASS를 낸다(completed 카운트 증가) — pancake이 tier1
  `passed:false`로도 6패스를 끝낸 이유가 이거였다. **명령 출력을 `/dev/null`로 죽이지 마라** —
  이 실패를 한 번 통째로 놓쳐서 "리뷰가 기록됐다"고 잘못 마크했다가 나중에 `reviewHistory` 개수를
  세어보고서야 들켰다. append 직후 `len(spec['reviewHistory'])`로 실제 반영을 확인하는 습관을 들여라.
- **`state.py`(로컬 진행 체크리스트) 마크 순서는 실제 순서와 다르다** — `pass-gate-check`를
  `ai-review-recorded`보다 **먼저** 마크해야 한다(체크리스트 배열 순서 그대로). 반대로 하면
  "out-of-order" 에러가 나고, 그 상태에서 다음 패스로 넘어가면 로컬 트래커가 `ai-review-recorded`를
  되돌려 다시 요구한다 — 실제 스킬 게이트(`orchestrate_passes.py`)와는 무관한 이 도구만의 버릇이다.
- **author_spec.py의 `PIPELINE_OWNED`에 `tier1Results`를 반드시 넣어라.** 스펙 최상위 키(스킬 자체가
  `sculptPipeline` 밑이 아니라 최상위에 쓴다)라, 여기 빠뜨리면 스펙 재생성마다 tier1 이력이 통째로
  날아간다(`reviewHistory`·`sculptPipeline`만 이월하고 있었다가 실측 도중 발견).
- **배치(오프셋)를 되돌아볼 근거는 자기 리뷰 자체다.** cmp-sheet 자기 리뷰에서 "배치가 레퍼런스보다
  넓게 퍼졌다"고 스스로 mismatch에 적어놓고도 지오메트리를 안 고치면, 나중에 그 문장이 그대로
  `important` 피처 게이트 미달(0.55 < 0.65)로 되돌아온다 — mismatch 기록은 그 자리에서 고치라는
  신호다. 단 오프셋 조정은 advisor 리뷰를 거쳐 **1회로 못 박아라**(Divine Eye 캐빗이 금지하는
  오실레이션 방지) — 그리고 조정 후 반드시 재렌더해서 **다른 인스턴스를 안 가리는지** 확인할 것
  (올리브는 좁히자마자 뒤쪽 알 하나가 고정 카메라에서 거의 사라져서 Z만 한 번 더 미세조정했다).
- 상세 사례는 `assets/ingredients/work/olive/object-sculpt-spec.json`의 `reviewHistory`(4개 항목,
  각 패스의 mismatches/matched)와 `risks`(shaded-underside-hue-dropped, pit-cavity-dropped 등)에
  전부 기록돼 있다 — 다음 재료 스펙 작성 시 같은 문서화 밀도를 유지할 것.
