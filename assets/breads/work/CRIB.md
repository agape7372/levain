# 빵 모델링 크립 — M2 위임 정본 (pancake 파일럿에서 증류, 2026-08-30 변형 3종 라운드로 개정)

레포 `C:\Users\agape\Desktop\코딩\levain` · 스킬 루트 `C:\Users\agape\.claude\skills\img2threejs`.
계약 정본 = `scripts/breads/types.ts` 주석 전체(먼저 정독). 선례 = `scripts/breads/pancake.ts` + `assets/breads/work/pancake/`
(마감 정본은 아래 §마감 계약으로 갱신됨 — pancake의 facet 마감은 참고용, 그대로 복제하지 말 것).

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
5. `validate_sculpt_spec.py` + `--strict-quality` → `generate_threejs_factory.py` → 팩토리를 `scripts/breads/<id>.ts`로 어댑트(BreadBuilder). 마감 패스(**2026-08-30 개정 — 스무스가 정본, 상세는 아래 §마감 계약**): indexed에서 `jitterVertices` → `computeVertexNormals()` → `toNonIndexed()` → UV 프로젝터 → `stdMaterial` → `mergeByMaterial`. 정점 분리가 불필요하면 indexed 유지도 가능(§마감 계약 참조). `scripts/breads/index.ts`에 등록. 스펙을 `assets/breads/specs/<id>.json`으로 보존.
6. **변형(variant) 빵도 예외 없이 1~5 전 단계를 밟는다.** "베이스 빌더를 계승하라"는 지시가 있어도 계승 대상은 **수치**(아웃라인·프로필 상수)이지 절차가 아니다 — state.py 게이트와 패스별 자가교정 루프를 생략하면 지시한 부분만 고쳐지고 나머지는 방치된다(실측: 이번 라운드 실패 원인). 예외를 둘 거면 사유·대가를 스펙 주석에 기록한다.

## 마감 계약 (2026-08-30 개정 — 스무스 클레이가 정본)

파일럿 정본이던 `jitterVertices` → `facet`(플랫 노멀 각진 로우폴리)은 **폐기**. 신규 작업은 스무스.

- 절차: **indexed 상태에서 `computeVertexNormals()` → `toNonIndexed()`**. 순서가 핵심 —
  toNonIndexed가 normal을 승계한다. 펼친 뒤 재계산하면 다시 플랫이 된다.
- 정점 분리가 필요 없으면(아틀라스·상수 UV라 UV 경계로 안 쪼개도 되면) **indexed 유지도 가능** —
  GLB 정점 수가 1/3로 준다(campagne 변형 실적: tri 2배인데 GLB는 26% 더 작았다).
- **대가**: 플랫 노멀이 공짜로 주던 대비가 사라진다(바네통 링·칼집 그림자·잼 골이 흐려짐).
  텍스처 톤이나 저주파 형상으로 보상해야 하고, 균열 등 함몰 디테일은 깊이를 다시 튜닝해야 한다
  (한 사례 실측: 0.15는 안 읽힘 / 0.18은 과번짐 / 0.13이 적정 — 절대값이 아니라 출발점으로 삼고 렌더로 재확인).
- **rim 모따기 함정**: 윗면과 측벽이 정점을 공유하면 평균 노멀이 45°가 되어 테두리 한 셀이
  통째로 모따기된 것처럼 보인다(잘라놓은 판이 아니라 쿠션으로 읽힌다). 측벽 전용 복제 링을 둬서
  노멀 연속을 끊어라. 복제 링은 **지터 뒤에 원본 좌표를 재복사**해야 한다(안 그러면 실금이 생긴다).
- **예외 허용**: 딱딱한 인클루전(초콜릿 청크 등)은 플랫 노멀이 정당하다 — 부드러운 반죽과 같은
  셰이딩을 쓰면 반죽에서 자란 혹처럼 보인다. 예외를 쓸 땐 근거를 코드 주석에 남겨라.

## 확정 규칙 (파일럿 판정 — 재논의 금지)

- **색 정본 = 프롬프트 JSON hex** (이미지는 형태·비율 정본일 뿐. 이미지와 색이 어긋나면 JSON을 따른다)
- **vertex paint 금지** — 다색은 스펙 단계에서 머티리얼 분리(≤2)로 설계해 원천 차단. 경계는 공유 링/엣지로 수밀하게
- **반복마다 `append_review`** — 스킬 카운터(3/패스·6/총)가 정본. 상한 도달 시 중단·보고
- Tier-1 `diagnose_render`는 **정렬 후** 판정: `work/pancake/align_pair.py` 재사용. 직교 vs 원근 잔여 aspect ~0.13은 모델 결함 아님으로 기록
- **진짜 게이트는 tier1 IoU가 아니다**: tier1 실루엣 IoU 임계(0.85)는 AI 렌더 레퍼런스에서 원근 차이로
  구조적으로 못 닿는다(실측 최선 0.664). 그런데도 패스는 통과한다 — 실제로 막는 건 **리뷰 기록 스크립트의
  피처 평균 점수**(important 0.65 / critical 0.8)다. IoU가 낮다고 거기서 반복을 태우지 말 것
- 렌더 없는 사전 검증: `work/pancake/check_pores.py` 패턴(mulberry32를 파이썬으로 복제해 배치·개수 확인) — 디테일 시스템에 응용

## 지오메트리 함정 (파일럿 실측 — 반복 2회를 여기서 날렸다)

- **displacement 디테일은 authoring 전에 크기를 정점 간격과 비교** — 격자 간격보다 작으면 조용히 사라진다(에러 없음). 함몰은 연속좌표 감쇠가 아니라 **격자 셀 단위**로 판다
- 함몰 벽 기울기 ≥30°는 돼야 Lambert에서 읽힌다. 폭을 못 줄이면 깊이로 기울기를 만든다
- 조밀화는 **필요한 축에만** (기포=반지름 링, 테두리 다각형=섹터 수)
- `LatheGeometry` 금지 — φ-seam 정점 복제가 jitter에서 실금을 만든다. 링 수동 구성
- 투톤 파트는 **한 덩어리 indexed로 만들고 facet 후 삼각형 인덱스로 가른다**(`pancake.ts`의 sliceTriangles) — 따로 만들어 각각 jitter하면 공유 링이 찢어진다
- 와인딩: position이 `(cos t, y, sin t)`면 t 증가가 위에서 볼 때 시계방향 — 순진한 `(s, s1, …)` 감기는 법선이 안쪽을 향한다
- **방향(orientation)을 1반복차에 먼저 확인** — scone 실측: 꼭짓점이 카메라 반대를 향해 IoU 0.659, 180° Y회전만으로 0.821. 비대칭 빵(웨지·슬래시·바타르)은 blockout 첫 렌더에서 "정면이 3/4 카메라 (-1.6,2.2,2.6)을 향하는가"부터 판정하고 시작하라
- 멀티뷰 레퍼런스도 **뷰마다 개별 검증**하라 — 정면 뷰가 웨지 대신 슬래브로 생성된 사례가 있다. 형태 정본으로 그대로 쓰기 전에 확인

### 이번 라운드 실측 (변형 3종 — scone/campagne/focaccia)

- **지터 상한**: `amp ≤ 최소 돌출·함몰 span의 1/20`. 판정 비율은 amp/지름이 아니라 **amp/노출(표면 위로 튀어나온 높이)**이다 — 지터가 Y로도 밀어 노출 자체를 깎기 때문. 스무스 노멀에서는 더 엄격해야 한다(노멀 연속성이 깨지면 돔이 각진 파편으로 되돌아간다)
- **디테일에는 지터를 걸지 마라.** 불규칙성은 프리미티브의 **authoring 파라미터**로 준다(정점 수 5~7 가변, 크기 3계층, 비대칭 테이퍼, 개별 기울기). 사후 xyz 변위는 밀봉을 깨고 형태를 뭉갠다
- **인클루전은 지터 이후 셸 실좌표에 앵커**해 별도 지오메트리로 짓는다 — 마스크가 필요 없어진다
- **균일 진폭은 수렴하는 링에서 무너진다**: 같은 amp가 극점 근처(정점 간격이 좁은 곳)에선 상대적으로 20%가 되어 크라운을 구긴다. **국소 정점 간격 대비**로 판정하고 안쪽 링은 감쇠시켜라
- **크기 격차가 형태 다양성의 절반이다.** 각 수·기울기만 갈라도 크기가 비슷하면 한 무리로 읽힌다(스팬 1.7배는 부족, 2.5~3.0배에서 위계가 읽힌다)
- **계층 배분은 확률이 아니라 정원제로.** 확률 배분이면 시드에 따라 큰 조각이 0개인 판이 나온다
- **클러스터 씨앗은 최원점 샘플링(FPS, farthest-point sampling)**으로 뽑는다. 거리 임계값 방식은 양방향으로 실패한다(낮으면 뭉치고, 높으면 씨앗을 못 찾아 정원 미달). FPS는 임계값이 없어 실패 자체가 없다 — 단 FPS는 극단을 고르는 경향이 있으므로 **씨앗 후보 풀에서 바깥 링을 빼야** 무게중심이 중앙에 온다
- **색 측정은 기준면을 고정하라** — 같은 크러스트가 3/4 뷰에서 238, 탑다운에서 222로 잡혔다. 탑다운을 기준면으로 권장
- **파리티(균일 명도 보정)를 전 표면에 균일 적용하면 대비가 죽는다** — 오일 웅덩이가 크러스트와 나란히 밝아져 통째로 사라진 사례가 있다. 대비가 존재 이유인 요소(웅덩이·그을림 등)는 목표 계조를 따로 잡아라
- **캘리브레이션은 배율이 아니라 3쌍으로 기록**: `{그때 쓴 알베도, 그 결과 렌더, 목표}`. 배율만 적으면 다음 사람이 이미 보정된 값에 또 곱해 어긋난다(이번에 실측 한 라운드를 날렸다)
- **displacement 벽 기울기는 ≥30°가 구체적으로 필요하다** — 깊이 0.055/반폭 0.125(≈24°)는 스무스 셰이딩에서 거의 안 읽혔고, 0.08(≈33°)로 해결됐다
- **비단조 프로필 금지**: 파임을 만들려고 회전 프로필의 폴을 끌어내리면 법선이 안쪽을 향해 뒤집힌다. 파임은 **링의 한두 세그먼트만 안쪽·아래로 눌러** 만든다 — 위상 변화가 없어 안전하다
- **그리드 인덱스 기반 거리·임계값은 해상도를 올릴 때마다 조용히 좁아진다. 배치·간격·회피는 전부 월드좌표로 쓸 것.** tri 예산·표면결 때문에 그리드를 조밀화(NX/NZ 상향)할 때, "N 그리드 셀 이상 떨어뜨려라" 류의 체비셰프/거리 검사가 코드 어딘가에 남아 있으면 그 실제 세계 거리가 조용히 줄어든다 — 에러도 안 나고 렌더가 그냥 미묘하게 나빠진다(focaccia--olive-flesh-v2 라운드 실측 4곳: 딤플 함몰의 이웃-부분함몰 폭 자체, `pickDimples`의 최소간격 reject, `pickToppingCells`의 딤플회피·최소간격 reject, "딤플 옆" 올리브 배치의 링 오프셋). 지적받은 1건(딤플 함몰 폭)을 고치던 중 나머지 3곳이 같은 클래스인 걸 스스로 찾아낸 게 이번 라운드 최고 산출이었다(팀리드 판정) — **한 곳을 그리드-커플링으로 고쳤으면, 같은 파일에서 grep으로 grid-index 기반 거리 비교를 전부 훑어라.**
- **"안 보인다"의 원인은 매번 다르다 — 후보를 순서대로 배제하며 진단하라, 깊이부터 올리지 마라.** 이번 라운드에서 같은 증상("딤플이 안 보인다")이 4가지 다른 원인으로 나타났다: 폭 1셀짜리 바늘구멍(그리드 커플링) → 앨리어싱(파장<정점간격) → 진폭 부족 → **완만한 falloff가 특정 카메라 각도에서만 안 읽힘**. 마지막 건 특히 반직관적이었다: 같은 시드로 azimuth-90/탑다운에서는 뚜렷이 보이는데 하네스 기본 리뷰 카메라(3/4, 라이트와 가까운 방향)에서만 안 보였다 — **카메라가 광원과 거의 같은 방향이면, 전체 반경에 걸쳐 완만하게 퍼진 코사인 falloff는 어느 각도에서도 강한 음영 경계를 만들 지점이 없다.** 폭·깊이를 더 올리는 대신 **falloff 형태 자체를 "컵"(반경의 절반은 평평한 바닥, 나머지 절반에 전체 깊이 변화를 몰아넣기)으로 바꿔 벽 경사를 국소적으로 집중**시키니 문제의 그 카메라에서도 즉시 해결됐다 — **깊이 숫자를 올리기 전에 "다른 각도에서는 보이는데 이 각도에서만 안 보이는가"부터 먼저 확인하라**, 답이 yes면 깊이가 아니라 falloff 형태나 카메라/광원 기하학이 원인이다.

### 색 진단 (campagne--strawberry-jam 완결 라운드 실측)

- **"색이 탁하다"의 원인이 hex가 아니라 셰이딩 패턴의 듀티 사이클일 수 있다.** 실측: 크러스트
  정본 hex는 오차 (-2,+1,+2)로 처음부터 정확했는데 화면은 진흙색이었다. 원인은 공유
  `domeShell.ts`의 `ringPhase`가 대칭 코사인(50% 듀티 사이클)이라 **표면의 절반이 어두운
  톤으로 칠해진 것**. 레퍼런스는 "넓은 밝은 마루 + 얇은 어두운 골"이었다. 해법: ridge를 지수
  압축(`ridge^0.2`)해 마루를 넓히고 골만 좁게. **hex 오차부터 재고, 맞으면 패턴을 의심하라.**
  부수: 레퍼런스에서 링 개수를 직접 세어보니 10~11줄인데 우리는 16이었다(과밀이 크러스트를
  더 어둡게 먹음). 반복 요소는 개수도 실측할 것.
- **방위각에 따라 필 라이트 기여가 0으로 클램프되는 면이 있다.** 조명 캘리브레이션은 특정
  방향 기준이라, 필 라이트를 등진 방위의 면(웨지 컷 페이스 등)은 `dot(N,fill)<0`으로 클램프되어
  기여 0 — 형제 빵 측벽이 받는 보정을 그 면만 못 받는다. 실측 채널 균일 −19.3%(색조 왜곡 없는
  순수 밝기 손실). 해법은 전역 게인이 아니라 **그 면 전용 재질 렌더 타깃**(3쌍 기록).
- **손실 복원이 항상 정답은 아니다 — 어두워야 정상인 요소가 있다.** 위 −19.3% 손실을 잼에도
  똑같이 완전 복원했더니 형광 핑크가 됐다(사탕 인상). 레퍼런스 잼 몸통 실측이
  **(145,44,36)으로 정본 hex(178,58,78)보다 어둡고 B가 훨씬 낮았다** — 자홍이 아니라 벽돌빛
  크림슨. 정본 hex를 역산해 복원하는 대신 **레퍼런스 렌더값을 직접 목표로** 잡아 알베도를
  구하니 1차 시도에 오차 ≤5로 맞았다. 일반화: 밝기 손실 보정은 "정본 hex로 되돌리기"가
  아니라 "레퍼런스가 보여주는 값에 맞추기"다. 정본 hex는 출처이지 목표가 아닐 수 있다.
- 색·릴리프 결합 원칙은 잼 외에도 적용된다: 십자 칼집(ear)이 실제 융기가 있는데도 "표면에
  붙인 테이프"로 읽힌 이유는 텍스처에 ear 전용 색 분기가 없어 주변 링 밴딩을 그대로
  이어받았기 때문. 융기 영역을 패턴 무관하게 칠하니 "솟은 능선"으로 읽혔다.
- 자동 지표가 조건 변화로 무의미해질 수 있다: 기공 밝기(>235) 비율 지표가 배경 크럼이
  밝아지자 배경까지 잡기 시작해 수치가 역행했다. 지표가 전제하는 조건이 바뀌었는지 확인하고,
  아니면 육안 판정으로 넘겨라.
- 크럼 같은 밝은 색은 밝기가 아니라 채널 비율로 맞춰라: 255 근처에서 R·G가 동시에 클리핑되면
  채널 간격이 무너져 무채색이 된다(R-G 간격이 정본 10에서 1~2로). 밝기 추격을 멈추고 B를
  상대적으로 더 깎아 따뜻함을 심는 방향으로.

## state.py 로컬 원장 함정 (2026-08-30 실측 — focaccia--olive-flesh 재제작 라운드)

`.img2threejs/state.json`은 **resumability index일 뿐**(SKILL.md 명문 — 진짜 증거는 렌더·스펙·리뷰기록·결정론적 게이트)이지만, 다음 사람이 아래를 안 지키면 실제로 다 한 작업이 "안 한 것"으로 보인다.

- **`state.py mark`를 매 서브스텝마다 찍어라.** 스크립트(diagnose_render.py·append_review.py·orchestrate_passes.py)를 실제로 실행한 것과, 그 사실을 로컬 원장에 기록한 것은 **별개다**. `forge/next.py`를 상태 확인용으로 호출할 때마다 내부적으로 `sync_from_spec()` → `set_current_pass()`가 도는데, 스펙의 `sculptPipeline.currentPass`가 바뀐 걸 감지하면 **무조건** 이전 패스의 로컬 체크리스트를 `passHistory`로 archive하고 8개 서브스텝(`build-current-pass`~`pipeline-sync`)을 전부 `pending`으로 리셋한다(`workflow_state.py` `set_current_pass()`). 게다가 `status_payload()`(`workflow_state.py:386-388`)는 `current_pass != "complete"`일 때만 `visible_scopes`에 `"pass"`를 넣으므로, 스펙이 먼저 `complete`에 도달하면 raw JSON엔 `status:"pending"`으로 남아 있는 8개 항목이 상태 조회 화면에서 **아예 안 보이게** 된다("status:complete인데 pending 8개"라는 모순 파일이 여기서 나온다 — scone--choco-chip-v2 라운드 실측, focaccia--olive-flesh-v2에서도 동일 재현). `state.py mark`를 안 찍은 채 실제 스크립트만 돌리고 `next.py`로 상태만 확인하면, 그 패스는 로컬 원장에 통째로 미이행으로 남는다(실측: blockout만 부분 마크, 나머지 5패스는 스크립트 다 돌렸는데 로컬 원장엔 흔적이 안 남음). **패스 루프를 돌 때 `orchestrate_passes.py`/`append_review.py`만 쓰지 말고, 각 패스마다 8개 서브스텝을 `state.py mark`로도 같이 밟아라** — 스펙사이드가 먼저 complete에 도달하면 로컬 체크리스트는 영구히 그 갭을 못 메운다(다음 항목).
- **한 번 `complete`로 넘어가면 로컬 원장 백필은 도구로 불가능하다.** `mark_steps()`는 `next_entry()`와 정확히 일치하는 step만 허용하는데, `currentPass=="complete"`면 pass-scope 후보 자체가 사라진다. 실측(2회 독립 재현 — focaccia--olive-flesh-v2, scone--choco-chip-v2): `python3 forge/state.py mark build-current-pass ...` → `state error: out-of-order checklist update: expected complete, received build-current-pass`(exit 2). JSON을 손으로 고쳐 우회하지 말 것 — "안 한 걸 했다고 기록"하는 것과 같다. 진짜 증거(스펙 reviewHistory·렌더 파일)가 있으면 그걸로 판정 가능(팀리드 판정, SKILL.md 근거).
- **`loops.total`은 실제 자가교정 횟수가 아니라 `refine-spec`/`refine-code` 액션 개수만 센다.** `append_review.py:395-399`가 `--action continue`인데 critical feature가 문턱 미달이면 기록 자체를 던지고 거부한다(`ValueError: feature-level AI vision gate failed`, 파일에 저장 안 됨 — fail-closed). 그래서 "1차 시도 실패 → 코드 수정 → 2차 성공"을 해도 성공한 리뷰 한 건만 `continue`로 기록되고, 실패한 1차 시도는 어디에도 안 남아 `loops.total`이 0으로 집계된다(scone--choco-chip-v2 실측: 초코 청크 critical 0.78<0.8로 거부, 코드 고쳐 0.82로 재시도한 것만 기록됨 — 실제 반복 1회인데 loops.total=0). **예방이 사후 조치보다 낫다**: 자가교정 중 문턱 미달을 발견하면 `--action continue`로 밀어붙이지 말고 그 시도 자체를 **`--action refine-code`(또는 `refine-spec`)로 먼저 기록**한 뒤 코드를 고치고 재검증해서 `continue`를 남겨라 — `loops.total`이 실제 반복 횟수를 정확히 반영한다. 이미 거부당한 뒤에는 `--force-out-of-order`로 사후 기록하는 옵션이 스크립트에 있지만, 감사 기록은 사후 조작 불가능한 게 가치이므로 팀리드 판단은 백필보다 애초에 refine-code부터 기록하는 습관 쪽이다.
- **검증자 관점**: 완료 판정은 `state.json`이 아니라 스펙 파일의 `reviewHistory`(passId·layerScores·featureReviews)·`sculptPipeline.completedPasses`·워크스페이스의 실제 렌더 PNG로 하라. `state.json`은 진행 중 재개용 체크리스트일 뿐, 최종 감사 대상이 아니다.
- **`--force-out-of-order`의 정당한 용법 vs 금지된 용법 (팀리드 판정, 한 줄 구분)**: **백필(안 한 걸 했다고 소급 기록)은 금지, complete 이후 실제로 한 수정을 재리뷰로 남기는 것은 정당.** 파이프라인 `complete` 이후에 코드를 더 고쳤으면(품질 재검토 라운드 등) `append_review.py --pass-id <pass> --force-out-of-order`로 그 실제 수정 내용을 재리뷰로 남기고 `orchestrate_passes.py sync`를 다시 돌려라 — 스펙의 `reviewHistory`가 실제 코드 상태와 어긋난 채로 "완료"라고 부르면 다음 사람이 그 스펙을 신뢰 못 한다.

## 검수 루프 (반복 상한 3회/빵)

레포 루트에서:
```
node scripts/breadlab-shot.mjs "id=<id>&compare=1" assets/breads/work/<id>/cmp-N.png   # 레퍼런스+렌더 콜라주 — 직접 열어 판정
node scripts/breadlab-shot.mjs "id=<id>&shot=1&azimuth=90|180|270" ...                  # 턴테이블 게이트
node scripts/breadlab-shot.mjs "id=<id>&shot=1&roundtrip=1" ...                         # 런타임 파리티 (최종 1회)
```
stdout `stats {json}`으로 tri/KB/mesh 숫자 판정. 어긋나면 refine-spec 우선(수치는 스펙 → 코드 순으로).
최종: `npm run breads:export -- <id>` → `node scripts/check-budget.mjs` → `npm run thumbs`.

**판독 게이트(숫자 예산 통과 ≠ UI에서 읽힘) — 필수 단계로 넣을 것**: 썸네일은 실제로 64px 안팎으로 뜬다.
512² 렌더를 **64²로 LANCZOS 다운샘플** → **실제 카드 배경색 위에** 격자 시트로 올려 판정하라(흰 배경에
놓으면 판정이 달라진다). 브라우저 DPR 렌더와 다운샘플 판정이 갈린 실측이 있는데, **후자가 실제 표시
경로에 가깝고 결함을 잡아냈다** — DPR 렌더만 보고 통과시키지 마라. 뭉쳐 보이면 폴리곤을 올리지 말고
**개수를 줄이고 하나를 키운다**(군집 실질 상한 3).

## 예산 (pancake 187.8KB 실측 — GLB는 정점 수에 선형, non-indexed vert × 32B)

| 군 | tri 목표 | GLB 목표 |
|---|---|---|
| 판형 (cracker·flatbread·focaccia) | 500~1100 | ≤120KB |
| 덩어리 (scone·loaf·baguette) | 800~1500 | ≤160KB |
| 불 (campagne·rye·wholewheat) | 1200~2000 | ≤200KB |
| **변형/디테일 빵**(scone--choco-chip류, public 10종 밖) | **3000~5000** | ≤250KB(상한 그대로 — 스무스+indexed 유지로 여유 확보) |

위 판형/덩어리/불 구간은 **닫힌 public 10종을 합계 2560KB에 배분**할 때의 값이다. 변형은 그 합계 밖이라
더 쓸 수 있다. 저예산의 대가도 적어둔다 — **549~1098tri로는 표면 질감·균열·딤플을 만들 정점이 없어
산출물이 밋밋해진다**(실측). 상한(250KB/개·8000tri)은 여전히 상한이지 목표가 아니다 — 밀한 표면
디테일이 없으면 굳이 격자를 올리지 마라. 즉, **저예산도 과예산도 둘 다 실측된 실패 사례가 있다.**

## 환경

- python은 **Bash로만**(PowerShell exit 49) + `PYTHONIOENCODING=utf-8` 필수(없으면 cp949로 죽음)
- breadlab-shot은 vite를 매번 새로 띄운다 — 캐시 경합으로 드물게 실패하면 1회 재시도
- 커밋 금지 · src/ 수정 금지 · Math.random 금지 · 본세션 보고에 이미지 첨부 금지(텍스트 수치만)
