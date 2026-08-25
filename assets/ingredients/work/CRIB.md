# 재료 모델링 크립 — 위임 정본 (olive 파일럿에서 증류)

레포 `C:\Users\agape\Desktop\코딩\levain` · 스킬 루트 `C:\Users\agape\.claude\skills\img2threejs`.
계약 정본 = `scripts/ingredients/types.ts` 주석 전체(먼저 정독). 절차 정본 = `docs/INGREDIENTS.md`.
빵 선례 = `assets/breads/work/CRIB.md` — **거기 있는 함정은 전부 그대로 유효하다.** 이 문서는 차이분만 담는다.

**파일럿 완료 (2026-08-26)**: `olive` — 432tri · 43KB · mesh 2 · roundtrip 통과 · cmp 3회(상한 준수).
군집군 목표(300~700tri/≤68KB) 정중앙. 선례 코드 = `scripts/ingredients/olive.ts`(머리 주석 포함).

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
  올리브는 로컬 Y 상단 + 로컬 X 중간 밴드(`[-0.5, 0.42]`)로 한정했다.
- **64px 판독은 별도로 렌더해서 본다** — `roundtrip-64.png`처럼 축소본을 따로 남기는 게 파일럿 방식이다.
  숫자 예산을 다 통과하고도 얼룩으로 읽히는지는 축소해 봐야 안다.
