# 빵 모델링 크립 — M2 위임 정본 (pancake 파일럿에서 증류)

레포 `C:\Users\agape\Desktop\코딩\levain` · 스킬 루트 `C:\Users\agape\.claude\skills\img2threejs`.
계약 정본 = `scripts/breads/types.ts` 주석 전체(먼저 정독). 선례 = `scripts/breads/pancake.ts` + `assets/breads/work/pancake/`.

## 절차 (빵 1종당)

1. 워크스페이스 `assets/breads/work/<id>/`. 스킬 스크립트는 스킬 루트에서 실행.
   ```
   python3 forge/state.py init --state <ws>/.img2threejs/state.json --reference <ws 절대경로의 레퍼런스> --profile generic --spec <ws>/object-sculpt-spec.json
   ```
   이후 `forge/next.py`가 시키는 대로. exit 3 = 중단·보고.
2. **이미지 열람은 레퍼런스 3장 각 1회**(`assets/breads/src/<id>.png`·`-2`·`-3`). 형태·비율만 읽는다.
3. assessment는 `--complexity simple`. **스킵 4종**(전부 `state.py mark <step> skipped --reason "..."`):
   - `detail-inventory` — 단일 반복 시스템이면 손 열거가 빠르고 정확 (목표 개수만 채워 열거)
   - `projection-route` — 레퍼런스가 AI 렌더(사진 아님), 런타임 basecolor 1장 상한
   - `material-evidence`/`material-spec-wiring` — 런타임이 map·color만 승계, PBR 채널 무효
   - (해당 시) `action-ready` — mesh≤2 계약이 파트 노드 노출 금지. 사유 기록
4. 스펙: pancake의 `author_spec.py` 패턴 복제(**reviewHistory·sculptPipeline 이월 필수** — 스켈레톤 재생성이 리뷰 기록을 지운다). 패스는 6개(lighting-pass·interaction-pass 제외, **structural-pass는 strict가 요구하므로 필수**). 수치·색은 `assets/prompts/breads/<id>.json` geometry 전사 — 비전 재추출 금지.
5. `validate_sculpt_spec.py` + `--strict-quality` → `generate_threejs_factory.py` → 팩토리를 `scripts/breads/<id>.ts`로 어댑트(BreadBuilder). 마감 패스: indexed에서 `jitterVertices` → `facet` → UV 프로젝터 → `stdMaterial` → `mergeByMaterial`. `scripts/breads/index.ts`에 등록. 스펙을 `assets/breads/specs/<id>.json`으로 보존.

## 확정 규칙 (파일럿 판정 — 재논의 금지)

- **색 정본 = 프롬프트 JSON hex** (이미지는 형태·비율 정본일 뿐. 이미지와 색이 어긋나면 JSON을 따른다)
- **vertex paint 금지** — 다색은 스펙 단계에서 머티리얼 분리(≤2)로 설계해 원천 차단. 경계는 공유 링/엣지로 수밀하게
- **반복마다 `append_review`** — 스킬 카운터(3/패스·6/총)가 정본. 상한 도달 시 중단·보고
- Tier-1 `diagnose_render`는 **정렬 후** 판정: `work/pancake/align_pair.py` 재사용. 직교 vs 원근 잔여 aspect ~0.13은 모델 결함 아님으로 기록
- 렌더 없는 사전 검증: `work/pancake/check_pores.py` 패턴(mulberry32를 파이썬으로 복제해 배치·개수 확인) — 디테일 시스템에 응용

## 지오메트리 함정 (파일럿 실측 — 반복 2회를 여기서 날렸다)

- **displacement 디테일은 authoring 전에 크기를 정점 간격과 비교** — 격자 간격보다 작으면 조용히 사라진다(에러 없음). 함몰은 연속좌표 감쇠가 아니라 **격자 셀 단위**로 판다
- 함몰 벽 기울기 ≥30°는 돼야 Lambert에서 읽힌다. 폭을 못 줄이면 깊이로 기울기를 만든다
- 조밀화는 **필요한 축에만** (기포=반지름 링, 테두리 다각형=섹터 수)
- `LatheGeometry` 금지 — φ-seam 정점 복제가 jitter에서 실금을 만든다. 링 수동 구성
- 투톤 파트는 **한 덩어리 indexed로 만들고 facet 후 삼각형 인덱스로 가른다**(`pancake.ts`의 sliceTriangles) — 따로 만들어 각각 jitter하면 공유 링이 찢어진다
- 와인딩: position이 `(cos t, y, sin t)`면 t 증가가 위에서 볼 때 시계방향 — 순진한 `(s, s1, …)` 감기는 법선이 안쪽을 향한다
- **방향(orientation)을 1반복차에 먼저 확인** — scone 실측: 꼭짓점이 카메라 반대를 향해 IoU 0.659, 180° Y회전만으로 0.821. 비대칭 빵(웨지·슬래시·바타르)은 blockout 첫 렌더에서 "정면이 3/4 카메라 (-1.6,2.2,2.6)을 향하는가"부터 판정하고 시작하라

## 검수 루프 (반복 상한 3회/빵)

레포 루트에서:
```
node scripts/breadlab-shot.mjs "id=<id>&compare=1" assets/breads/work/<id>/cmp-N.png   # 레퍼런스+렌더 콜라주 — 직접 열어 판정
node scripts/breadlab-shot.mjs "id=<id>&shot=1&azimuth=90|180|270" ...                  # 턴테이블 게이트
node scripts/breadlab-shot.mjs "id=<id>&shot=1&roundtrip=1" ...                         # 런타임 파리티 (최종 1회)
```
stdout `stats {json}`으로 tri/KB/mesh 숫자 판정. 어긋나면 refine-spec 우선(수치는 스펙 → 코드 순으로).
최종: `npm run breads:export -- <id>` → `node scripts/check-budget.mjs` → `npm run thumbs`.

## 예산 (pancake 187.8KB 실측 — GLB는 정점 수에 선형, non-indexed vert × 32B)

| 군 | tri 목표 | GLB 목표 |
|---|---|---|
| 판형 (cracker·flatbread·focaccia) | 500~1100 | ≤120KB |
| 덩어리 (scone·loaf·baguette) | 800~1500 | ≤160KB |
| 불 (campagne·rye·wholewheat) | 1200~2000 | ≤200KB |

상한(250KB/개·8000tri)은 상한이지 목표가 아니다. 밀한 표면 디테일이 없으면 격자를 올리지 마라.

## 환경

- python은 **Bash로만**(PowerShell exit 49) + `PYTHONIOENCODING=utf-8` 필수(없으면 cp949로 죽음)
- breadlab-shot은 vite를 매번 새로 띄운다 — 캐시 경합으로 드물게 실패하면 1회 재시도
- 커밋 금지 · src/ 수정 금지 · Math.random 금지 · 본세션 보고에 이미지 첨부 금지(텍스트 수치만)
