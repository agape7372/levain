# Handoff: 확장 트랙 Phase 0·2·1 구현 완료 — 다음은 실기기 촉감 튜닝 → Phase 3

## Session Metadata
- Created: 2026-08-24 18:15
- Project: C:\Users\agape\Desktop\코딩\levain
- Branch: grok/LV-001 (미커밋 — 기존 67항목 + 이 세션 신규·수정 ~30파일. **커밋 시점 = 사용자 판단**)
- Session type: 구현 (Phase 0 → 2 → 1 순서로 완료. Phase 1·2는 병렬 가능 트랙이라 순서 무방했음)

## Handoff Chain
- **Continues from**: [2026-08-24-172035-levain-expansion-plan-approved-phase0-next.md](./2026-08-24-172035-levain-expansion-plan-approved-phase0-next.md)
- 정본 기획서: `르방이-확장기획-2026-08-24.md` (레포 루트) — 변경 없음, 그대로 유효.

## Current State Summary — 전부 검증 green

vitest **110/110** (기존 88 → +22) · `npm run build`(tsc+vite) · eslint 클린 ·
dev 서버 실검증(v1 저장 마이그레이션·모달 z-order·grab 물리 합성 tick 실측).

### Phase 0 — 버그 2건 + D6·D7 + 문서 드리프트 (완료)
- BUG-1: `Router.setRoot()` display:none 미복구 → 복구 1줄 (`src/ui/router.ts`) + `tests/router.test.ts`(스텁, jsdom 미도입) + QA.md 케이스.
- BUG-2: `#ui-root` z-index 10→30 (`main.css`) — 모달 백드롭이 탭바를 딤·차단. elementFromPoint로 실증.
- D6: 리터럴 5 → `LABEL_STAGE` (constants + actions·app·settingsModal 3사용처). D7: label 테스트 5케이스.
- D1~D5 문서 드리프트: Sonnet 서브에이전트 위임 → 본세션 검수 통과 (STORE_LISTING 카피 재작성, VISUAL §1-2·§4-2, GDD §5 2건).

### Phase 2 — 저장 v2 + 멀티 르방 코어 (완료)
- **순서 폭탄 해제**: parseEnvelope = migrate(raw) → validateAndClamp. app.ts importSave 동일.
- SaveEnvelope v2: `starters[]{id('s'+ordinal), name, ordinal, sim}` + activeStarterId + nextStarterOrdinal + `shared.collection`(전역 도감, 항목에 starterId).
- **sim 다이어트**: SimState에서 label·collection 제거(sim = 물리만). setLabel 액션 삭제 → `store.renameActive`(게이트 동일). 도감 집계는 store가 baked/bakedDiscard 이벤트로.
- store 신규 API: getActiveStarter / getCollection / renameActive / addStarter(상한 `STARTER_SLOTS_FREE`=3) / switchStarter. **switchStarter 호출자 계약: 씬 snapParams + setMoldSeed 재설정 — Phase 3 UI가 배선해야 함.**
- 역행 재정박 = 전 starter + shared.collection.firstAt 동일 delta (store.advanceTo). `reanchor` export됨.
- 테스트: `tests/starters.test.ts`(7) + persistence v1 픽스처 왕복 + label 스토어 테스트로 이식.
- 브라우저 실증: v1 저장본(label·도감·flake) 주입 → v2 산출, HUD 칩에 이름 표시, 도감 배지 정상.

### Phase 1 — Motion Lab + 촉감 개편 §4-2 A안 (코드 완료, **실기기 튜닝 게이트 남음**)
- input 2채널: 반죽 위 + 느린 끌기(<`GRAB_MAX_PX_PER_MS`=0.9) = **grab**, 그 외 stir. 세션 소유권 고정. grab 놓기 = pointerup (M2). 레이캐스트 평면 fill 연동 (`plane.constant = -topY()`).
- DoughMesh 2시간척도 SLS: elastic(τ0.1)+creep(0.7s 지연·τ1.0 축적·τ1.2 해소), 복귀 ζ≈0.95·ω12. 기본값 `GRAB_DEFAULTS`, 상태 물성 3종은 RenderParams(grabMax/grabCreepGain/grabReturnZeta).
- 셰이더: uGrabPos/uGrabDisp + Ricker 커널 + det=1 necking + vStretch 윈도우페인. uniform만(정점 버퍼 갱신 0).
- wobble 델타화(M4) + 급여 시퀀스 충돌 픽스(setStirInput 5번째 인자 driveWobble=false).
- 기포: 팝 −0.3→−0.12 + 프래그 팝 링 하이라이트 + 동시 가시 ≤4.
- **Motion Lab**: `motionlab.html` + `scripts/motionlab.ts` — 프리셋 8종·노브 8개·계기판·URL 전체 상태(breadlab 패턴). `npm run dev` 후 `/motionlab.html?preset=peak`.
- 합성 tick 실측: 잡고-멈춤 2s 변위 0.150 유지 / 오버슈트 0.0% / 잔류 1.5s 0.010 / 3.5s 소멸.

## 사용자 확인·거부권 (다음 세션이 먼저 보고할 것)
1. **DEC-6 시행**: 도감 전역 승격 + starterId — §20-5가 사용자 확인 항목이었으나 v2 작성 시점이 결정 시한이라 기획서 추천 기본값으로 진행. **거부 시 커밋 전 되돌림 가능.**
2. **동작 변경**: discardStarter 후 이름 보존(v1은 label 초기화 — §11-2 근거 채택).
3. **잠금 문서 자기모순**: `르방이-업데이트-계획.md` 헤더는 "사워도우"도 금지 나열, 본문 금지어 목록(112~117행)엔 없음 — STORE_LISTING엔 기획서의 3단어 기준으로 "사워도우" 유지. 사용자 판단 필요.
4. **OTA 롤백 지뢰**: v2 저장 생긴 뒤 v1 번들 롤백 = 저장 소실. RELEASE.md §8·ARCHITECTURE §3에 경고 기록 — 다음 릴리스부터 유효한 제약.

## Immediate Next Steps
1. **실기기 튜닝(사용자 게이트)**: 폰에서 `motionlab.html` 열어 §4-1 목표 장면 촬영 비교 → 노브 확정 → 확정값을 `GRAB_DEFAULTS`(DoughMesh.ts)·`toRenderParams` grab 매핑에 반영. FSM 임계 0.9px/ms 체감 확인.
2. **Phase 3** (이름 UI·스와이프 전환·집계 알림 `planNotificationsAll`): 스와이프 FSM이 grab/stir 분류 표면과 겹치므로 **1 이후에** 설계. switchStarter 호출자 계약(씬 재설정) 배선 포함.
3. 급여 연출(playFeed) 육안 확인 1회 — wobble 픽스 후 미검(헤드리스라 합성 불가).

### Blockers/Open Questions
- [ ] 커밋 정책 (기존 블로커 유지 — 사용자 판단).
- [ ] 광고·IAP 도입 자체 (Phase 8~9, §20-1 — 미확정 유지).
- [ ] VISUAL 고무줄 잔재 5곳(§0·§3-2·§3-3·§4-1·§8) + GDD 271행 + ARCHITECTURE 13·39행 — D2 범위 밖이라 보류, 다음 문서 패스.

## Critical Files (이 세션 신규·중대 수정)
| File | 내용 |
|---|---|
| `src/store/persistence.ts` | v2 스키마·검증·마이그레이션 (순서 반전) |
| `src/store/gameStore.ts` | 멀티 코어·전 starter 재정박·도감 집계·starter API |
| `src/sim/types.ts`·`actions.ts`·`advance.ts`·`constants.ts`·`index.ts` | sim 다이어트·reanchor export·상수 |
| `src/render/dough/DoughMesh.ts`·`dough.vert.glsl`·`dough.frag.glsl` | grab SLS·necking·윈도우페인·팝 링 |
| `src/render/input.ts` | 2채널 FSM·fill 평면·wobble 폐기 |
| `src/render/renderParams.ts`·`bubbles.ts` | grab 물성 3종·기포 순화 |
| `motionlab.html`·`scripts/motionlab.ts` | 튜닝 하네스 (dev 전용) |
| `tests/starters.test.ts`(신규)·`router/label/persistence/flake/clock/recipes.test.ts` | v2 재작성 |
| `docs/ARCHITECTURE.md`·`GDD.md`·`VISUAL.md`·`QA.md`·`RELEASE.md`·`STORE_LISTING.md` | 정본 개정 |

## Key Patterns / Gotchas
- 위임: 문서 드리프트 = Sonnet 서브에이전트(Haiku 금지) + 본세션 전량 검수 — 이번에도 유효했음.
- grab 픽스처 함정: stage 5 상태는 createdAt만 backdate — lastFedAt 건드리면 moldy 게이트가 먼저 먹는다.
- motionlab TDZ: 모듈 최상단에서 applyState() 호출 금지(아래 const 참조) — 부트는 파일 하단.
- 헤드리스 검증: 브라우저 페인이 안 보이면 rAF 정지 — `dough.tick(t)`을 합성 시간으로 직접 굴려 물리 검증 가능.
- launch.json에 `levain-dev`(포트 5199) 추가됨 (`코딩\.claude\launch.json`).

## Environment State
- dev 서버 5199 세션 종료 시 정리됨(preview 소유). 활성 백그라운드 작업 없음.
- 위키: `06_wiki/levain-status.md` 신설(이 세션) — 현황 허브.
