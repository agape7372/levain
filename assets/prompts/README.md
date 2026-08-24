# 빵 이미지 생성 프롬프트 (v2)

1. `breads/<id>.json`의 `prompt_flat`을 이미지 생성기(Grok 등)에 복붙해 **1:1 1024** 이미지를 생성한다.
   비율·크기는 프롬프트가 아니라 생성기 UI에서 설정.
2. 생성된 이미지를 `assets/breads/src/<id>.png`로 저장한다.
3. 가능하면 **같은 채팅에서** `followup_views`의 두 프롬프트를 순서대로 복붙해
   front elevation·top-down 뷰를 뽑고 `<id>-2.png`, `<id>-3.png`로 저장한다(멀티뷰 image-to-3D용).
   새 채팅에서 뷰만 요청하면 다른 빵이 나온다 — 반드시 같은 대화 컨텍스트에서.
4. 저장된 이미지를 image-to-3D 도구에 넣어 GLB로 변환한다.

## 검수 체크리스트 (저장 전)

- 빵이 **하나만**, 화면 중앙, 여백 충분한가 (3뷰 시트가 한 장에 뭉쳐 나오면 폐기)
- 배경이 균일한 페일 세이지 단색인가 — 접시·바닥·그림자 있으면 폐기 (3D 변환 시 실루엣 오염)
- 광택·하이라이트 없는 matte인가 (알베도에 흰 얼룩으로 구워짐)
- `notes_ko`의 결정적 특징(칼집 귀, 바네통 링, 딤플 등)이 살아 있는가

## v2 변경 요지

- 배경 크림 → 페일 세이지 `#DFEAE0` (식빵·스콘 크림 옆면이 배경에 묻히는 문제)
- prompt_flat에서 멀티뷰 문장 제거 → `followup_views` 후속 프롬프트로 분리 (한 장에 3뷰 시트 방지)
- 그림자·광택 금지 명시, negative 정리 (face/eyes/mouth 3연타 제거)
- 크래커·플랫브레드 두께를 상대 비율로 (초박형 셸은 3D 메시 붕괴)

## 변형 목록 (§15-2, 그록 일괄 투척용)

베이스 빵의 geometry(실루엣·크러스트 구조)를 그대로 계승하고 재료 표현만 추가한 변형 10종.

| variantId | name_ko | 베이스 | 재료 표현 |
|---|---|---|---|
| `focaccia--olive-flesh` | 올리브 포카치아 | focaccia | 다진 올리브 과육 청크가 딤플 안팎에 박힘 |
| `campagne--olive-flesh` | 올리브 깜빠뉴 | campagne | 웨지 컷어웨이로 노출된 단면 크럼에 올리브 과육 혼입 |
| `cracker--olive-oil` | 올리브유 크래커 | cracker | 표면 올리브유 색조(비광택), 씨앗 대신 소금 플레이크 최소 |
| `pancake--choco-chip` | 초코칩 팬케이크 | pancake | 초코칩 스터드, 시럽·버터 없음 |
| `scone--choco-chip` | 초코칩 스콘 | scone | 초코칩 스터드, 세움/콘 실루엣 방지 유지 |
| `focaccia--choco-cocoa` | 더블초코 포카치아 | focaccia | 코코아 반죽(어두운 크럼 색) + 초코 청크, 로즈마리·올리브·소금 대체 |
| `loaf--choco-filling` | 초코 바브카 식빵 | loaf | 절단면에 초코 필링 스월(바브카 스타일) |
| `scone--strawberry-fresh` | 딸기 스콘 | scone | 딸기 과육 청크, 생크림·클로티드 크림 없음 |
| `campagne--strawberry-jam` | 딸기 스월 깜빠뉴 | campagne | 웨지 컷어웨이 단면에 딸기 잼 스월 |
| `campagne--chestnut-roasted` | 밤 깜빠뉴 | campagne | 웨지 컷어웨이 단면에 구운 밤 조각 혼입 |
