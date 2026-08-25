# Handoff: OTA 1.2.4 발행 — 물성 축 분해·유리 접촉·유리벽 기공 + 재료 12종 확장

## Session Metadata
- Created: 2026-08-25 11:57:08
- Project: C:\Users\agape\Desktop\코딩\levain
- Branch: main (origin 동기화 완료)
- Session duration: 약 4시간

### Recent Commits (for context)
  - f933ae7 chore: OTA 1.2.4 발행 (물성 축 분해·유리 접촉·재료 12종)
  - e80954c feat: 물성 축 분해 + 유리 접촉·유리벽 기공 + 재료 12종 확장
  - a61281d feat: 무료 경제 — 교환 가루·누적 미션·소프트캡 (Phase 7 §9)
  - 0600409 docs: 세션 핸드오프 — OTA 1.2.3·UX 개편 (2026-08-24 밤)
  - 3e3c318 chore: OTA 1.2.3 발행 (레시피/도감 UX 개편)

## Handoff Chain

- **Continues from**: [2026-08-24-234519-ota-123-ux-overhaul.md](./2026-08-24-234519-ota-123-ux-overhaul.md)
  - Previous title: OTA 1.2.0→1.2.3 발행 — Phase 4·6 완주 + 실기기 피드백 UX 개편
- **Supersedes**: None (체인 유지)

> Review the previous handoff for full context before filling this one.

## Current State Summary

사용자 요구 4개("쫀득함이 피크 말고 처음부터" / "지금은 그냥 쫀득한 반죽 같다 — 영상 속 구조·물리를
파악해서 적용" / "스와이프 전환 애니메이션이 없어 이름만으로 르방 구별이 어렵다" / "재료 다양화 +
재료별 JSON 이미지 프롬프트")로 시작해, 셰이더 전수 감사 → 물성 축 재설계 → 재료 카탈로그 확장까지
완주하고 **OTA 1.2.4를 발행했다**. 커밋 2개(e80954c 구현 · f933ae7 발행) 모두 main 푸시 완료,
작업 트리 깨끗함. 라이브 manifest 1.2.4, 다운로드 재해시 검증 통과.

**미완인 것은 실기기 확인 하나뿐이고, 그게 지금 가장 중요하다** — 순서가 뒤집힌 채로 발행됐다.
사용자가 "해줘"로 명시 지시했고, 실기기 미확인 상태임을 사전 고지한 뒤 발행했다.

## Architecture Overview

렌더 파이프라인의 이음새는 `Snapshot → toRenderParams → RenderParams → SceneHost(smoothParams lerp)
→ DoughMesh.applyParams(정적 uniform) + tick(동적 uniform)` 한 줄이다. sim은 순수(ESLint 잠금)이고
이번 작업은 **sim을 한 줄도 건드리지 않았다** — 신규 축은 전부 기존 Snapshot 필드에서 닫힌 형태로 파생된다.

단 하나 예외를 뒀다: `renderParams.ts`가 `sim/constants`에서 `FILL_MAX·FILL_PEAK_RISE·STAGE_FILL_FACTOR`를
import 한다(유리 자국의 최고 수위를 sim의 peakFill과 같은 식으로 재구성하기 위해). 의존 방향은
`sim ← render`라 합법이고, 규칙 9(수치 하드코딩 금지)를 지키는 유일한 길이었다.

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `src/render/renderParams.ts` | Snapshot→RenderParams 매핑. 신규 4축 + 형상 5필드 전부 여기서 파생 | 물성 조정은 무조건 여기부터 |
| `src/render/dough/dough.vert.glsl` | 실루엣(초타원체+`uRBody` 유리 확장)·grab·슬로싱·피크 크래그 | 형상 변경 진입점 |
| `src/render/dough/dough.frag.glsl` | `cellField` 유리벽 기공·`wallM` 벽 마스크·반경 밴드 5곳 | 벽 텍스처 조정 진입점 |
| `src/render/dough/DoughMesh.ts` | uniform 배선 + CPU 상태기(grab·wobble·poke·trail) | ζ·τ 같은 시간 상수는 여기 |
| `src/render/jar.ts` | `residueGlsl` 공유 블록 — 유리 자국·최고 수위선 (앞/뒤 유리 공통) | 자국 조정 진입점 |
| `scripts/motionlab-shot.mjs` | **신규**. 8프리셋 일괄 촬영 + 셰이더 컴파일 게이트 | 렌더 검증의 유일한 자동 경로 |
| `scripts/motionlab.ts` | 시각 축 노브 7종 추가(grabTuning과 별도 채널) | URL 파라미터로 축 하나씩 격리 확인 |
| `src/sim/ingredients.ts` | 재료 12종·형태 20종·호환성 89행 | sourceRef 접두사로 전사 출처 2종 구분 |
| `assets/prompts/INGREDIENTS_PASTE.md` | **신규**. 그록 일괄 투척 시트(저장 경로·검수 체크 포함) | 사용자 대기 항목 |

## Key Patterns Discovered

- **축은 의미 단위로 쪼갠다**: 한 uniform이 형상과 물성을 동시에 몰면 "평평하지만 되직하다" 같은
  실제 조합을 표현할 수 없다. 쪼갤 때 **구 필드를 남기지 말 것** — 컴파일 에러 전면화가 재발 방지 장치다.
- **프래그의 반경 밴드는 전부 `uRBody` 상대**로 쓴다. 몸통 반경이 바뀌면 절대 상수 밴드는 조용히 이동한다.
- **살아있는 분기 / 죽은 분기 상호배타화**로 셰이더 예산을 산다: `wallCells`·`poreDensity`에
  `(1−dormancy)·(kahm?0:1)·(1−mold)`을 곱해 두면 동시 개방이 구조적으로 불가능해진다.
- **검증은 숫자 먼저, 눈은 나중**: 육안 검수 에이전트가 "변화 없음"을 냈는데 픽셀 diff는 11.8% 변화였다.

## Tasks Finished

- [x] 셰이더 전수 감사 — 확정 버그 3건 특정(file:line)
- [x] `liquidity` 1축 → `levelness`/`fluidity`/`cohesion`/`elasticity` + `wallFill` 분해
- [x] `uRBody` 유리 접촉 + 프래그 반경 밴드 5곳 재정규화
- [x] `cellField` 유리벽 기공 + `wallM` 벽 마스크 + `dBs` 벽 페이드(세로 홈 제거)
- [x] `residueGlsl` 유리 자국·최고 수위선 (앞·뒤 유리)
- [x] 피크 정수리 크래그 (프래그 마이크로 노멀과 같은 필드 공유 — 추가 FBM 호출 0)
- [x] 방향 슬라이드 전환 + `prefers-reduced-motion`(레포 최초) + `uMoldSeed`→`uSeed` 일반화
- [x] 재료 8종·형태 7종 추가, `variantName` '가루' 분기로 표시 충돌 해소
- [x] 호환성 43행 조사·전사(URL 실증 계약을 테스트가 강제)
- [x] 재료별 이미지 프롬프트 JSON 12개 + 공유 스타일 + 그록 투척 시트 + README 갱신
- [x] `scripts/motionlab-shot.mjs` 신설(killTree 포함)
- [x] 문서: VISUAL(§3-2·§3-3·§5·§8) · QA(체크 14줄) · implementation-notes · 메모리 · 위키 3곳
- [x] OTA 1.2.4 발행·검증·커밋·푸시

## Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| `src/render/renderParams.ts` | 4축+5필드 신설, `liquidity` 삭제, specStr·grab 3종 재유도 | 축 분해의 본체 |
| `src/render/dough/*.glsl` | `uRBody`·`uWallCell`·`vWallUV`/`vWallY`·`cellField`·`wallM` | 유리 접촉·벽 기공 |
| `src/render/dough/DoughMesh.ts` | uniform 배선, wobble ζ·poke·trail 재유도, `setSeed` 일반화 | 물성 CPU 측 |
| `src/render/jar.ts` | `residueGlsl` 공유 + `setLevel` API | 유리 자국 |
| `src/render/SceneHost.ts` | `slideSwap` 전환, `setLevel` 배선 | 스와이프 |
| `src/sim/ingredients.ts` | 재료 8·형태 7·호환성 43행 | 재료 확장 |
| `src/ui/copy.ts` · `ingredientArt.ts` · `home.ts` · `main.css` | 이름·SVG·칩 전환·모션 감소 | UI 측 |
| `tests/*.test.ts` | 잠금 회귀 2건·단조성·표시명 유일성·URL 계약·범위 전수 | 재발 방지 |
| `assets/prompts/ingredients/**` | 신규 13파일 | 그록 투척용 |

## Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| `liquidity` 필드 **삭제**(남기지 않음) | 남기고 신규 축 추가 / 완전 삭제 | 남기면 두 의미가 다시 섞인다. 컴파일 에러 전면화가 안전장치 |
| `levelness`를 `fresh`가 아니라 "돔 아님+마르지 않음"으로 정의 | 갓밥준 기준 / 돔 기준 | 갓밥준 기준이면 **배고픈 르방이 공처럼 뭉친다**(꺼진 르방도 평평하다) |
| `wallFill`을 `levelness`와 분리 | 한 축으로 통합 / 분리 | 유리 접촉은 피크에서 최대여야 하는데 levelness는 피크에서 낮다 — 충돌 |
| `specStr`을 gas 주도로 **되돌림** | wet 주도(가설) / gas 주도(관찰) | 실사진에서 갓밥준은 무광·칙칙, 피크가 가장 유광. **관찰이 가설을 이긴다** |
| 유리벽 기공을 fbm 아닌 `cellField`로 | fbm 2회 / sin·cos 2옥타브 값+기울기 동시 | 8 trig ≈ fbm 1.33회. 프래그 FBM 예산 상한을 11→8로 오히려 낮췄다 |
| `markFill`을 세션 기억 아닌 닫힌 형태로 | SceneHost가 max(fill) 보관 / stage로 재구성 | 닫힌 함수 모델(규칙 3) 정합, 앱 재시작에도 자국 유지 |
| 재료당 프롬프트 1개(대표 형태만) | 형태마다 / 재료마다 | 형태는 호환성 데이터의 축이지 아이콘의 축이 아니다. 자산 1/3 |
| 프롬프트 저작을 본세션이 직접 | §15-1대로 Sonnet 위임 / 본세션 | 사용자가 명시 지정("페이블이 짜줘") — 이번 배치 한정 예외 |
| MAX_FEEDS 400→700 | 수치만 올림 / 경제 상수 조정 | 521회로 **도달은 한다**. 수용 기준은 도달 가능성이지 속도가 아니다 |

## Immediate Next Steps

1. **실기기에서 촉감 확인** (최우선 — 이미 라이브다). 앱 열면 1.2.4가 내려온다. 볼 것:
   - 갓 밥준에서 잡아 늘였다 놓으면 **안 튕기고 자국이 남는가** (이전엔 이 상태가 전 상태 중 가장 고무줄이었다)
   - 피크가 병에 눌려 보이는가 / 정수리가 잘게 부서졌는가 (하나의 매끈한 꼭지면 실패)
   - 벽에 **세로 줄무늬**가 남았는가 → 남았으면 `dough.frag.glsl`의 `wallM` 임계값을
     (0.55, 0.95)에서 더 넓힌다. 이번에 (0.30,0.70)→(0.55,0.95)로 한 번 넓혔지만 독립 확인은 못 했다
   - 젓고 떼었을 때 전신 출렁임이 2회 안쪽에서 멎는가 (이전 5~6회 = 물)
2. **이상하면 1.2.3 롤백** — `docs/RELEASE.md` §8 절차. `ota/bundles/`에 1.2.1~1.2.4 로컬 보관 중.
   저장 v2 유지라 1.1.0 이상 롤백은 안전(**1.0.x는 금지 — 저장본 소실**).
3. **그록 이미지**(사용자 몫) — `assets/prompts/INGREDIENTS_PASTE.md` 붙여넣기 → `assets/ingredients/src/`.
   들어오면 재료 3D 파이프라인 착수: `check-budget.mjs`를 `public/ingredients/`도 스캔하도록 일반화 →
   breadlab 레지스트리에 `kind` 추가 → img2threejs 모델링(재료당 3회 상한).

## Blockers/Open Questions

- [ ] **세로 홈이 실제로 지워졌는지 미확인.** 육안 검수는 마스크 확대 **이전** 세트에서 홈을 확정했고,
      확대 후 독립 확인이 없다. 유리벽 기공이 그려진다는 것만 숫자로 확인됨(끔/켬 픽셀 7.5% 차이,
      최대 103/255, 영향 영역 y 610~1117 = 벽 밴드 위치 정확).
- [ ] **무료 경제 페이싱은 사용자 판단 대기.** 변형 40→72로 전 변형 해금에 급여 521회(≈260일).
      "느린 동거" 컨셉과 어긋나진 않지만 길다.
- [ ] **병 입구 링이 반죽 위로 데칼처럼 겹쳐 보인다**(검수 지적). 기존 동작이지만 유리 접촉으로
      반죽이 넓어져 더 눈에 띌 수 있다. 미조사.

## Deferred Items

- **영상 관찰 미이행**: 사용자가 "인스타 영상 보고"를 요구했으나, 참조 에이전트 세션에서 비디오
  캔버스 렌더가 깨져 있었다(대조군 영상도 0:00 정지, CDP 타임아웃). 실제로 본 건 **정지 사진과
  영상 썸네일 스틸뿐**이고, 움직임 표(출렁임 Hz·진동 횟수)는 물리 추론이다. 반영된 건 사진 근거뿐이라
  결과물은 오염되지 않았지만 **요구는 절반만 이행됐다**. 사용자가 릴스를 받아 프레임을 뽑아주는 게 가장 빠름.
- **KAB 호환성 재조사**: King Arthur Baking이 전 경로 403이라 한 행도 못 들어왔다. 무화과+호두 등은
  KAB에 verified급이 있을 가능성이 높다 — 재조사 시 1순위.
- **A-6 정지 상태 반투과**: 계획엔 있었으나 FBM 예산 우선순위에서 밀려 미착수. 벽 기공이 우선이었다.

## Important Context

**이번 작업의 핵심은 "쫀득함을 강화"한 게 아니라 "쫀득함이 왜 안 보였는지"를 찾은 것이다.**
사용자 불만("그냥 쫀득한 반죽 같아")은 취향이 아니라 구조 버그 3건이었고, 전부 file:line으로 확정됐다:

1. **반죽이 어느 상태에서도 유리에 닿은 적이 없다.** 초타원체 스케일이 적도(`q.y=0`)에서 정확히 1이라
   몸통 최대 XZ 반경이 항상 `R=0.62`(월드 0.806), 유리 내벽은 0.92 → **12.4% 틈이 영구적**.
   `uRXZMax=0.69` 소프트 니 클램프는 평생 발동한 적이 없고, VISUAL이 약속한 메니스커스는
   `smoothstep(0.58, uRXZMax, rr2)`인데 `rr2` 최대가 0.62라 **영원히 30% 세기로 잠겨** 있었다.
2. **갓 밥준이 전 상태 중 가장 고무줄이었다.** `grabCreepGain`이 hunger·sourness에만 반응해
   just-fed가 최저(0.310). 마켓팅 잠금("강한 스프링 금지")과 정확히 반대.
3. **벽은 비어 있던 게 아니라 세로 주름이 잡혀 있었다.** 프래그 필드가 전부 `vXZ` 단독 도메인이라
   실루엣이 원통에 가까울수록 윗면 하이트필드가 벽을 따라 세로 줄로 번진다.

**피크 `grabMax` 0.600 · ζ 0.956은 사용자 실기기 확정치다.** 축을 갈아엎으면서도 이 두 값이 그대로
나오도록 계수를 역산해 고정했고 `tests/renderParams.test.ts`가 잠근다. 리팩터로 이 값이 흔들리면
촉감이 조용히 바뀐다 — 테스트가 유일한 자동 방어선이다.

## Assumptions Made

- 재료는 sim에 영향 0(순수 컬렉팅 축)이라는 사용자 확정을 그대로 따랐다 — 신규 8종도 sim 무영향.
- 재료 프롬프트는 **재료 아이템 아트**(재료함·도감용)로 해석했다. "재료별로" + "재료들은 좀 더
  다채롭고 비비드해도 괜찮아"가 근거. 변형 빵 프롬프트는 이미 11개 있다.
- 신규 재료 8종은 색 스펙트럼이 겹치지 않게 + 실제 사워도우 근거가 있는 것으로 골랐다.
  청보라·주황·세이지그린·버터옐로가 팔레트에 새로 들어와 "비비드" 요구를 재료 축에서 충족한다.
- 유리벽 기공 강도는 트라이포포비아 규칙(어두운 항 상한) 안에서 밝은 쪽만 키웠다. 최종 판정은 실기기.

## Potential Gotchas

- **vert/frag 미분 짝 드리프트**: 슬로싱(`vert:127` ↔ frag 슬로싱 항)·유휴 진행파(`vert:160-162` ↔
  frag 2줄)·돔/크레이터(`kR` 양쪽)는 버텍스 변형의 기울기를 프래그가 다시 미분해 쓴다.
  **배열이 아니라 상수라 단일 uniform 소스 ESLint 규칙도 테스트도 못 잡는다.** 한쪽만 고치면
  조명과 지오메트리가 조용히 어긋난다. GLSL에 ⚠ 주석을 달아 뒀다.
- **`smoothParams` 조용한 동결**: 필드를 손으로 나열하는 구조라 신규 필드를 빠뜨리면 **타입 오류 없이**
  그 값만 초기값에 고정된다. `renderParams.test.ts`에 전수 비교 테스트를 넣어 뒀다.
- **반경 밴드**: `uRBody` 확장으로 `|vXZ|` 상한이 0.62 → 0.690이 됐다. 프래그의 접촉 그늘·메니스커스·
  crackle·crust·kahm 5곳이 전부 `uRBody` 상대로 바뀌었다. 새 밴드를 추가하면 같은 규칙을 따를 것.
- **부감 카메라에서 '벽'은 수직면이 아니라 어깨다.** 노멀 기반 벽 마스크를 (0.30, 0.70)으로 잡으면
  어깨가 마스크 밖이라 아무 효과도 안 난다. 현재 (0.55, 0.95).
- **`formNames`는 재료 무관 플랫 맵이고 `variantName`은 한글 라벨로 스위치한다.** `flour`는 '밤가루'
  전용 라벨이라 재사용 금지 — 가루류는 전부 `ground`. 형태를 늘릴 때 표시명이 조용히 겹칠 수 있어
  전 조합 유일성 테스트를 넣어 뒀다.
- **GLSL은 런타임에만 터진다.** `npm run build`는 셰이더를 검사하지 않는다.
  `node scripts/motionlab-shot.mjs --all <dir>`가 사실상 유일한 컴파일 게이트다.
- **육안 검수 결과를 그대로 믿지 말 것.** 이번에 "변화 없음" 판정이 나왔지만 픽셀 diff는 11.8%였다.
  before/after 세트 정의부터 확인하고 숫자로 검증한 뒤 눈을 쓸 것.

## Tools/Services Used

- vitest 168/168 · `npm run build`(tsc --noEmit + vite) · eslint(`npx eslint .` — 플랫 설정, `--ext` 금지)
- `node scripts/motionlab-shot.mjs --all <dir>` — 헤드리스 8프리셋 촬영 + 셰이더 게이트. puppeteer 사용
- OTA: `npm run ota:release -- <version>`(로컬 패키징만) → `cd ota && npx vercel --prod --scope jirings-projects`

## Active Processes

- 없음. 이전에 `motionlab-shot.mjs`가 vite 자식 트리를 안 죽여 node 프로세스 88개가 쌓였던 적이 있고,
  `killTree`를 넣어 고쳤다. 정리하다 `node.exe`를 통째로 죽여 **MCP 서버가 끊긴 사고**가 있었으니
  같은 실수를 반복하지 말 것 — 특정 PID만 죽인다.

## Environment Variables

- `LEVAIN_OTA_BASE` (선택 — 미설정 시 https://levain-ota.vercel.app)
- 시크릿 없음. OTA 배포는 로컬 vercel CLI 로그인에 의존한다.

## Related Resources

- 정본: `docs/VISUAL.md`(§3-2 uniform 표·§3-3 앵커·§5 이징·§8 예산 전부 이번에 갱신) ·
  `docs/GDD.md` · `docs/ARCHITECTURE.md` · `docs/RELEASE.md` §8(OTA·롤백) · `docs/QA.md`(E·H절 신규 체크)
- `implementation-notes.md` 2026-08-25 절 — 결정·이탈·함정 상세
- `르방이-확장기획-2026-08-24.md` §4(촉감)·§4-2b(커널·트라이포포비아 근거)·§8·§18(카탈로그)
- 위키(옵시디언 볼트, 레포 밖): `06_wiki` 의 levain-status 현황 허브(이번 절 추가) + log 2026-08-25 항목
- 메모리: `project_levain_axes_2026-08-25.md`
- 그록 투척: `assets/prompts/INGREDIENTS_PASTE.md` · 형식 정본 `assets/prompts/README.md`

---

**Security Reminder**: Before finalizing, run `validate_handoff.py` to check for accidental secret exposure.
