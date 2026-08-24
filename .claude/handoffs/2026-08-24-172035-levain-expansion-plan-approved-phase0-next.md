# Handoff: 르방이 확장 기획 승인 완료 — Phase 0(버그·문서)부터 구현 착수

## Session Metadata
- Created: 2026-08-24 17:20:35
- Project: C:\Users\agape\Desktop\코딩\levain
- Branch: grok/LV-001 (★여전히 main 아님, 미커밋 워킹트리 ~67항목 + 이 세션 신규 2파일)
- Session type: 감사·조사·기획 전용 — **코드 수정 0** (기획서·핸드오프만 생성)

### Recent Commits (for context)
- fb064ab grok/LV-001: kill inner beige ring
- 616c4bc grok/LV-001: jar floor and dough radius clamp
- 8cf917f docs: 세션 핸드오프 — 대개편+OTA (2026-08-24)

## Handoff Chain
- **Continues from**: [2026-08-24-130350-bread-glb-10-complete-apk-sideload.md](./2026-08-24-130350-bread-glb-10-complete-apk-sideload.md)
  - 이전: 빵 GLB 10종 완성 + APK 사이드로드 전달. 그 흐름(출시 게이트)은 그대로 살아 있고,
    이 핸드오프는 **별도 트랙(확장 기획→구현)**을 연다.

## Current State Summary

사용자의 확장 아이디어(촉감·멀티 르방·재료/변형 레시피·광고/결제)를 **증거 기반으로 감사·조사해
상세 기획서로 완성했고, 사용자가 플랜 모드에서 승인했다.** 산출물 2개가 레포에 남아 있다(미커밋):

1. **`르방이-확장기획-2026-08-24.md`** (레포 루트, 780줄) — 정본 기획서. §1~21:
   감사표·버그 2건·촉감 원인 4중 특정·멀티 르방/저장 v2·Levain Lab·밥주기·재료함/도감·
   경제(무료/광고/IAP)·정책·결정 레지스터·로드맵 Phase 0~10·수용 기준·레시피 카탈로그 46행·
   현실 근거 카탈로그(A/B급 출처). 원본 = `C:\Users\agape\.claude\plans\imperative-tickling-goblet.md` (동일 내용).
2. 이 핸드오프.

감사 4건(sim/저장·플랫폼/렌더·입력/UI·문서)과 웹 조사 4건(사워도우 현실·레시피 카탈로그·
광고/결제 정책·점탄성 기법)이 전부 기획서에 반영 완료. **다음 세션은 조사 없이 바로 구현 시작.**

## Important Context (다음 에이전트가 반드시 알아야 할 것)

### 사용자 확정 결정 (재논의 금지)
1. **재료 = 순수 컬렉팅** — sim(밥주기·발효·산미·굽기 판정)에 영향 0. 변형 레시피 해금 키 + 도감 수집 역할만.
2. **₩1,900 재료 번들 = 확률 공개형 랜덤** (선택 꾸러미 아님) — 게임산업법 §33-2 + Play/App Store
   확률 표시 의무 전부 이행 + 보호장치(중복 없음·신규 보장·3회 천장·재정규화 확률 표시). 기획서 §11-1.
3. **단순작업은 전량 Sonnet 서브에이전트 위임, Haiku 금지** — 본세션은 스펙 계약 + 전량 리뷰만.
4. 변형 레시피 이미지 프롬프트는 기존 `assets/prompts/breads/<id>.json` v2 양식 그대로
   변형별 JSON 생성 — 사용자가 그록에 한 번에 던질 수 있게 (기획서 §15-2).

### 기술 지뢰 4개 (기획서 §3-5 — 구현 전 필독)
1. `parseEnvelope`가 `validateAndClamp` → `migrate` 순서 (`src/store/persistence.ts:243-244`) —
   **v2 스키마 추가 전에 반드시 순서를 뒤집어야** v1 저장본이 안 죽는다. `app.ts:105-108`도 동일.
2. 새 타임스탬프 필드 = `advance.ts:16-31` `reanchor` 목록 + `tests/clock.test.ts` 동시 갱신.
   멀티 르방은 재정박을 **전 starter 순회**로.
3. `getEnvelope()` 방어 복사 없음 (`gameStore.ts:126`) — starters 배열 직접 변형 금지.
4. 광고·결제 SDK는 OTA 불가 — 새 AAB 필수. `resetWhenUpdate:true`라 APK 업 시 웹 번들 리셋.

### 확인된 버그 2건 (Phase 0 대상 — 본세션이 코드로 직접 검증함)
- **BUG-1**: `Router.setRoot()`가 `push()`가 건 `display:none`을 복구 안 함 (`src/ui/router.ts:29-37`
  vs `:41`·`:53`). 쇼케이스 중 탭 전환 → 레시피 탭 영구 백지(재시작 전까지).
- **BUG-2**: `#ui-root`(z-index:10, `main.css:59-64`)가 스태킹 컨텍스트를 만들어 백드롭(40)·토스트(50)를
  가둠 → body 직속 `#tabs`(20, `main.css:75`)가 모달 위에 그려지고 눌림. BUG-1의 트리거.

### 촉감 문제의 확정 원인 (기획서 §4 — 추측 아님, file:line 검증)
- grab anchor 부재: 변형 소스가 포인터 속도뿐 (`input.ts:93-94` → `DoughMesh.ts:115-118` →
  `dough.vert.glsl:37`). 잡고 멈추면 τ≈83ms로 변형 소멸.
- 놓기 판정 = pointerup이 아니라 80ms 입력 정지 (`DoughMesh.ts:17,145`).
- 복귀 스프링 ζ≈0.417 → 24% 오버슈트 (`DoughMesh.ts:163-164`). 소성 0.
- wobble = 손가락 절대좌표 비례 전신 오프셋 (`input.ts:98-101`), τ≈0.167s 스냅백.
- 부수: 레이캐스트 평면 y=0.55 고정(`input.ts:36`)인데 반죽 윗면 y≈0.984(fill 1.0) — 어긋남.
- 해법 = A안(셰이더 2시간척도 점탄성: elastic+creep CPU 스칼라 → `uGrabDisp` uniform). 기획서 §4-2·§4-2b.

### 이미 있어서 다시 만들면 안 되는 것 (기획서 §3-3)
밥 비율 3종·냉장·건조 flake·후치·kahm 분리·곰팡이 예고 2단계·도감·브리핑·빵 GLB 10종.
**현 게임 피크 상수는 현실 실측과 이미 정합**(1:1:1 = 4.5~6h vs KA 4~6h) — 수치 재조정 불필요.

## Work Completed (이 세션)
- [x] 레포 감사 4건 (sim / 저장·플랫폼 / 반죽 렌더·입력 / UI·문서 드리프트 13건+버그 2건)
- [x] 웹 조사 4건 (사워도우 현실 A/B급 출처 / 레시피×재료 46행 판정표 / AdMob·Billing·게임산업법 / 점탄성·기포 기법)
- [x] 기획서 §1~21 작성 → 플랜 승인 → 레포에 `르방이-확장기획-2026-08-24.md` 복사
- [x] 이 핸드오프

## Pending Work

## Immediate Next Steps
1. **Phase 0 착수**: BUG-1(`router.ts` setRoot display 복구) + BUG-2(z-index 스태킹) 수정 →
   `npm test` → `npm run build` → 쇼케이스·탭 전환 수동 회귀(QA.md에 케이스 추가).
   문서 드리프트 21건(기획서 §3-4 + 렌더 감사 목록) 정리 — **Sonnet 서브에이전트 위임 대상**.
2. **Phase 1**: Motion Lab 하네스(breadlab 패턴, URL 파라미터) + grab 채널·2시간척도·기포 순화.
   완료 기준 = 기획서 §4-1 목표 장면 실기기 촬영 비교.
3. **Phase 2**: migrate 순서 반전 → SaveEnvelope v2(StarterRecord[]) → v1 픽스처 무손실 왕복 테스트.
4. 이후 Phase 3~10은 기획서 §15 로드맵 순.

### Blockers/Open Questions
- [ ] 커밋 정책: grok/LV-001에 미커밋 67항목 + 기획서 2파일 — 커밋·머지 시점은 사용자 판단.
- [ ] 광고·IAP **도입 자체**는 아직 사용자 최종 확정 아님(Phase 8~9 설계만 승인) — 기획서 §20-1.
- [ ] 이전 트랙(빵 GLB→출시 게이트): 사용자 폰 APK 확인·Play 업로드가 병행 중일 수 있음 — 충돌 주의.

## Critical Files
| File | Purpose |
|---|---|
| `르방이-확장기획-2026-08-24.md` (레포 루트) | **정본 기획서** — 구현 전 §해당 Phase 절 필독 |
| `src/ui/router.ts` + `src/styles/main.css` | Phase 0 버그 2건 |
| `src/store/persistence.ts` + `src/store/gameStore.ts` | Phase 2 마이그레이션 순서·v2 |
| `src/render/dough/DoughMesh.ts` + `dough.vert.glsl` + `src/render/input.ts` | Phase 1 촉감 |
| `src/sim/*` | 순수성 규칙 — Phase 2에서 sim 자체는 최소 수정(멀티는 상위 계층) |
| `assets/prompts/breads/*.json` + `assets/prompts/README.md` | 변형 이미지 프롬프트 양식 정본 |
| `docs/GDD.md`·`ARCHITECTURE.md`·`VISUAL.md` | 정본 3종 — 기획 확정분은 문서 개정 필요(Phase 0) |

## Key Patterns Discovered
- 위임 패턴: 스펙 먼저 → Sonnet 서브에이전트 전사 → 본세션 전량 리뷰 (빵 GLB 배치에서 검증).
  반복 상한은 프롬프트가 아니라 스크립트 층에서 집행.
- 조사 시 King Arthur = 봇 차단 → 웨이백 스냅샷 경유. CDC/FSIS = WebFetch 403 → 인앱 브라우저 경유.
- 모든 감쇠는 `1-exp(-k·dt)` 패턴(주사율 독립) — 신규 모션도 동일 패턴 유지.

## Potential Gotchas
- CLAUDE.md 불변 규칙 10개(특히 sim 순수성·모달 중앙 팝업·수치는 constants.ts) — ESLint가 일부 잠금.
- `@capacitor/assets` 재실행 금지(스플래시 깨짐, RELEASE.md §4).
- 검증: `npm test`(vitest 88) → `npm run build` → 수동 QA.md. Android는 RELEASE.md(JDK21 = D:/android-toolchain/jdk21).
- 스킬 python은 Bash + `PYTHONIOENCODING=utf-8`.

## Environment State
- 활성 프로세스 없음. C: 여유 ~9GB.
- 조사 서브에이전트들은 완료·idle — 결과는 전부 기획서에 반영됨(재호출 불필요).

## Related Resources
- 기획서 원본: `C:\Users\agape\.claude\plans\imperative-tickling-goblet.md`
- 이전 핸드오프(출시 트랙): `.claude/handoffs/2026-08-24-130350-bread-glb-10-complete-apk-sideload.md`
- 위키: `06_wiki` podoal-status 형식 참조 — **이 트랙 종료 시 레포 문서+메모리+위키 3종 갱신 규칙 적용**
