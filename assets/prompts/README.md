# 이미지 생성 프롬프트

> **신규 프롬프트 작성·수정은 `/food-image` 스킬이 절차 정본**(~/.claude/skills/food-image).
> 스켈레톤 8슬롯·실측 실패 장부·사전 검수 체크리스트가 거기 있다. 이 문서의 v2 절차와
> style-shared.json appetizing 원칙은 스킬의 프로젝트 인스턴스다.

두 갈래다. **빵**(아래 v2 절차)과 **재료**(`ingredients/`, 2026-08-25 신설).

| | 빵 | 재료 |
|---|---|---|
| 프롬프트 | `breads/<id>.json` | `ingredients/<id>.json` |
| 스타일 | `style-shared.json` (shared-style-v2) | `ingredients/style-shared-ingredient-v1.json` |
| 일괄 시트 | `GROK_PASTE.md` | `INGREDIENTS_PASTE.md`(기존 12종) · `INGREDIENTS_PASTE_NEW18.md`(2026-08-26 확장 18종) |
| 이미지 저장 | `assets/breads/src/` | `assets/ingredients/src/` |
| 개수 | 10종 + 변형 11종 | **30종** = 12(이미지 확보) + 18(2026-08-26 신설, 생성 대기) — 재료당 대표 형태 1개 |

**시트를 둘로 나눈 이유**: 기존 12종은 이미지가 이미 다 들어와 있다(36장). 한 파일에 합치면
사용자가 이미 받은 24종을 다시 훑어야 신규분에 닿는다 — 신규분만 던질 수 있게 분리했다.
**신규 18종**: raisin · lemon · banana · apricot · beet · coconut · pistachio · oat · poppyseed ·
sunflowerseed · flaxseed · maple · redbean · sweetpotato · matcha · blackgarlic · yuzu · honey

두 갈래의 **기술 레일(배경 페일 세이지·matte·그림자 금지·단일 오브젝트·1:1 1024·같은 채팅 3뷰)은
문자 단위로 동일**하다. 재료 쪽만 오브젝트 채도를 완화했다(사용자 지시 2026-08-25) — 광택은 여전히 금지.

---

## 빵 이미지 생성 프롬프트 (v2)

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

### 식욕 검수 (appetizing v3, 2026-08-30 신설 — style-shared.json `appetizing`이 정본)

AI 생성 음식 특유의 혐오감을 프롬프트 단계에서 차단한다. 원인은 문구다 —
생성기는 "scattered/studded/evenly across"를 **최대 밀도 균일 충전**으로 해석한다.

- 토핑·인클루전에 **개수가 명시**돼 있는가 ("about eight chips") — "across the whole surface"류 문구 금지
- 토핑이 반죽에 **반쯤 파묻혀** 있는가 — 표면에 얹힌 스터드·뿔 돌출이면 폐기
- 단면의 인클루전이 **납작한 플레이크**인가 — 단면에서 튀어나온 혹이면 폐기
- 배치가 **불균일 클러스터 + 여백**인가 — 격자·균일 간격·물방울 패턴이면 폐기
- 스월·필링이 **불균일·끊긴 리본**인가 — 완벽 나선·과녁이면 폐기
- 기공이 소수·불규칙인가 — 벌집 밀집이면 폐기 (트라이포포비아)
- 더스팅이 헤이즈 수준인가 — 흰 반점이면 폐기 (곰팡이 오독)
- 토핑 색이 따뜻한가 — 순검정이면 폐기

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

---

## 재료 목록 (12종, `ingredients/`)

재료당 JSON 1개 = **대표 형태 하나만**. 형태(과육/오일/가루…)는 호환성 데이터의 축이지 아이콘의
축이 아니다 — 형태마다 자산을 만들면 개수가 3배가 되고 도감에서 서로 구분도 안 된다.

| id | name_ko | 대표 형태 | 그리는 것 |
|---|---|---|---|
| `olive` | 올리브 | flesh | 통 올리브 3알 (짙은 가지-검정) |
| `choco` | 초콜릿 | chip | 초코칩 무더기 5~7개 |
| `strawberry` | 딸기 | fresh | 꼭지 달린 딸기 1알 |
| `chestnut` | 밤 | piece | 구운 밤 1알 (가시 껍질 없음) |
| `walnut` | 호두 | piece | 호두 알맹이 반쪽 (껍질 아님) |
| `cranberry` | 크랜베리 | dried | 말린 크랜베리 무더기 |
| `fig` | 무화과 | fresh | 세로로 반 가른 단면 정면 |
| `rosemary` | 로즈마리 | sprig | 가지 **하나** (묶음 금지) |
| `cheese` | 치즈 | cube | 고다 큐브 3개 (녹는 장면 금지) |
| `cinnamon` | 계피 | ground | 스틱 2개 + 가루 무더기 |
| `blueberry` | 블루베리 | fresh | 3알, 앞 알에 꼭대기 왕관 |
| `pumpkin` | 단호박 | roasted | 납작한 단호박, 쐐기 하나 잘림 |

각 JSON의 `notes_ko`에 **왜 그 형태·그 negative인지**가 적혀 있다. 생성 결과가 어긋나면 거기부터 읽는다.
공통 실패 패턴: 올리브→치즈·토마토 토핑 / 초콜릿→녹은 드리즐 / 딸기→크림 / 밤→가시 껍질 /
로즈마리→묶음 / 치즈→피자 늘어짐 / **단호박→잭오랜턴 얼굴**(무캐릭터 규칙 위반).
