# Handoff: 빵 레퍼런스 이미지 30장 확보 완료 — 다음은 three.js 절차 모델링

## Session Metadata
- Created: 2026-08-24 04:05:10
- Project: C:\Users\agape\Desktop\코딩\levain
- Branch: grok/LV-001 ★주의 — main 아님. 그록봇 T1 재시도가 만든 브랜치. 이 세션 작업(프롬프트 v2/v3 + 이미지)은 전부 미커밋 상태로 워킹트리에 있다
- Session duration: 약 3시간 (2026-08-24 01:00~04:00)

### Recent Commits (for context)
  - fb064ab grok/LV-001: kill inner beige ring
  - 616c4bc grok/LV-001: jar floor and dough radius clamp
  - 8cf917f docs: 세션 핸드오프 — 대개편+OTA (2026-08-24)
  - cc7486d feat: OTA(웹 번들 무선 갱신) — 정적 호스팅 수동 모드, 에뮬 E2E 통과
  - 8ad1633 feat: OTA 업데이트 파이프라인 (@capgo/capacitor-updater)

## Handoff Chain

- **Continues from**: [2026-08-24-005800-levain-revamp-ota.md](./2026-08-24-005800-levain-revamp-ota.md)
  - Previous title: 르방이 게임성·비주얼 대개편 + OTA 도입
- **Supersedes**: None (이전 핸드오프의 "빵 이미지 사용자 게이트" 항목만 이 문서가 대체)

## Current State Summary

이전 핸드오프의 사용자 게이트였던 "빵 이미지 10종 생성"이 **완료됐다**. 그록봇 IMAGE 방(xAI Grok Bot 데스크탑, 코딩\grok-ops 체계)에 프롬프트를 시켜 10종 × 3뷰 = 30장을 `assets/breads/src/`에 확보했고, 서브에이전트 시각 검수 + 본세션 직접 육안 확인으로 **30장 전량 통과** 판정했다. 재생성은 크래커 1회뿐(두께 문제, v3 프롬프트로 해결). ★중요한 파이프라인 변경: **GLB 생성은 higgsfield generate_3d가 아니라(크레딧 없음, 사용자 확정) three.js 절차 모델링으로 한다**. 이미지 30장은 3D 변환 입력이 아니라 **모델링 레퍼런스**다. threejs 스킬팩 11종을 `~/.claude/skills/_retired/`에서 복구해 놨다(플러그인 다이어트 때 치워져 있었음). 다음 작업 = 이미지를 보고 three.js로 빵 10종 절차 모델링 → GLB 내보내기 → 기존 파이프라인(meshopt → npm run thumbs) 접속.

## Codebase Understanding

### Architecture Overview

- 레포 원칙(docs/VISUAL.md): 텍스처 fetch 0, 전량 절차 셰이딩 — three.js 절차 모델링 결정이 이 원칙과 정합
- GLB 소비 경로: `public/breads/*.glb` → `scripts/bake-thumbs.mjs`(썸네일 굽기, GLB 없으면 에러 메시지로 경로 안내) + `scripts/check-budget.mjs`(예산 검사)
- 빵 해금 순서(docs/GDD.md §단계): 팬케이크·크래커(2단계) → 플랫브레드·포카치아·스콘(3단계) → 이후 캄파뉴·식빵·바게트·통밀·호밀
- 그록봇 운영 체계는 `코딩\grok-ops\README.md`가 정본 (봇 로스터·증거 게이트·ledger)

### Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| assets/breads/src/*.png (30장) | 빵 10종 × 3뷰 레퍼런스 이미지 | 모델링할 때 형태·색·디테일 스펙. **미커밋** |
| assets/prompts/breads/*.json | 프롬프트 정본 v2~v3 | geometry 필드가 사실상 모델링 스펙(실루엣·색 hex·디테일). notes_ko에 시행착오 기록 |
| assets/prompts/style-shared.json | 공통 스타일 v2 | low-poly faceted·matte·페일 세이지 배경 #DFEAE0 |
| assets/prompts/GROK_PASTE.md | 그록 복붙 시트 | 재생성 필요 시 재사용 |
| scripts/bake-thumbs.mjs | GLB → 썸네일 | GLB가 public/breads/에 생기면 npm run thumbs |
| ~/.claude/skills/threejs-* (11종) | three.js 스킬팩 | 모델링 참고. 이번 세션에 _retired에서 복구 |

### Key Patterns Discovered

- 프롬프트 JSON 구조: `prompt_flat`(메인뷰 복붙용) + `followup_views` 2개(같은 채팅에서 front elevation·top-down) — 멀티뷰 문장을 한 프롬프트에 넣으면 3뷰 시트가 한 장에 뭉쳐 나옴
- 생성 이미지는 전부 1536×1024 (3:2) — 그록 기본 비율. 1:1 스펙이었지만 내용 전량 통과라 그대로 확정(재생성 리스크 > 재프레이밍 이득)
- 색 스펙 hex: 크러스트 #A9713F~#8C5A32 계열, 크럼 #F4EAD4, 배경 #DFEAE0 (JSON별 상세)

## Work Completed

### Tasks Finished

- [x] 프롬프트 11파일 v2 업그레이드 (멀티뷰 분리, 배경 크림→세이지, 그림자·광택 금지, negative 정리, 크래커·플랫브레드 상대 두께)
- [x] GROK_PASTE.md 복붙 시트 생성 (JSON에서 자동 추출)
- [x] 그록봇 명령 작성·발송 (증거 게이트 포함) → 30장 생성 완료
- [x] 시각 검수 3배치 (서브에이전트) + 실패 판정건 본세션 직접 재확인
- [x] 크래커 재생성 1회 (v3: exaggerated thickness가 역효과 → 브라우니 슬랩. 웨이퍼 명시로 해결)
- [x] 스콘 스펙 자기모순 교정 (v3: '웨지'와 '높이>폭' 양립 불가 — 실물이 맞고 스펙이 틀렸던 사례)
- [x] threejs 스킬팩 11종 _retired에서 복구

### Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| assets/prompts/*.json 11파일 | v2~v3 전면 개정 | 위 Tasks 참조. notes_ko에 각 파일 변경 사유 기록 |
| assets/prompts/README.md | v2 플로우 + 검수 체크리스트 | followup_views 사용법, 폐기 기준 |
| assets/prompts/GROK_PASTE.md | 신규 | 30개 프롬프트 복붙 시트 |
| assets/breads/src/*.png 30장 | 신규 (그록 생성) | 전량 검수 통과. **미커밋 — 커밋은 사용자 판단** |

### Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| GLB는 three.js 절차 모델링 | higgsfield generate_3d | ★사용자 확정 — 힉스필드 크레딧 없음. 레포 텍스처-0 원칙과도 정합 |
| 3:2 비율 그대로 확정 | 1:1 재생성 | 내용 전량 통과, 그록 시드 고정 불가라 재생성=품질 도박. 썸네일은 bake-thumbs가 정사각 처리 |
| 크래커 초박형(1/33) 수용 | 1/10 재재생성 | 크래커로 읽히는 게 우선. 단 3D 메시화 시 최우선 용의자로 기록 |
| 호밀 칼집 강함 편차 수용 | 재생성 | 색+캐러웨이 씨가 이미 구분자. 정체성 지장 없음 |

## Pending Work

## Immediate Next Steps

1. **three.js 절차 모델링로 빵 10종 GLB 생성** — 해금 순서대로 팬케이크부터. 레퍼런스 = assets/breads/src/*.png + assets/prompts/breads/*.json의 geometry 필드. 스킬 = threejs-geometry·materials·loaders (GLTFExporter로 내보내기)
2. GLB를 public/breads/에 놓고 `node scripts/check-budget.mjs` → `npm run thumbs`
3. 남은 출시 게이트 (이전 핸드오프): 실기기 스모크(docs/QA.md G절) · 방침 게시 + Play 업로드

### Blockers/Open Questions

- [ ] 이미지 30장 + 프롬프트 v3 커밋 여부·시점 = 사용자 판단 (지금 grok/LV-001 브랜치임 — main 머지 정책도 사용자)
- [ ] GLB 폴리곤/용량 예산 확인 필요 — scripts/check-budget.mjs 기준값 먼저 읽을 것

### Deferred Items

- 크래커 두께 재조정 — 3D 모델링 시엔 지오메트리를 직접 만드니 이미지의 1/33 두께에 종속될 필요 없음. 모델링에서 1/10로 잡으면 끝
- 바게트 v3 문구(그림자·정사영 강화) — 재생성 트리거 아님, 다음 세대용 예방 문구

## Context for Resuming Agent

## Important Context

1. **파이프라인 변경이 최우선 정보**: 메모리·이전 문서에 "higgsfield generate_3d" 경로가 남아 있지만 **폐기됐다**. three.js 절차 모델링이 확정 경로. 이 세션에서 본세션이 힉스필드를 언급했다가 사용자가 정정했다.
2. **서브에이전트 시각 검수 오탐 사례**: 스콘·바게트 5장이 FAIL 판정됐으나 본세션이 원본을 직접 보니 전량 정상이었다. 원인 = 검수 스펙 자체의 모순(스콘) + 과민 판정(바게트 그림자·각도). **실패 보고가 오면 원본 이미지를 직접 볼 것.** 스펙이 틀리면 에이전트는 틀린 스펙대로 오탐을 만든다.
3. **그록봇에 보낸 [정정2] 재생성 명령은 결과적으로 불필요했다** — 봇이 34분 무응답이었는데 재생성할 필요가 없던 것. 봇 방에 해당 태스크가 미완으로 남아 있을 수 있으니 사용자가 방 정리할 때 참고.
4. 브랜치가 grok/LV-001인 상태로 세션이 진행됐다 — 그록봇 T1(jar floor 등)이 만든 브랜치. 프롬프트·이미지 작업과 T1 코드 변경이 같은 워킹트리에 섞여 있다.

### Assumptions Made

- 이미지 30장은 커밋 전이지만 확정본으로 취급 (검수 완료)
- GROK_PASTE.md의 프롬프트가 이미지와 1:1 대응 (재생성분 크래커만 v3 프롬프트 산출물)

### Potential Gotchas

- **threejs 스킬팩은 세션 시작 시 로드** — 복구 직후 세션에선 /스킬 호출이 안 잡힐 수 있다. SKILL.md 직접 Read로 우회 가능 (~/.claude/skills/threejs-*/SKILL.md)
- bake-thumbs.mjs는 public/breads/*.glb 부재 시 에러 — GLB 먼저
- 사워도우 GLB 쇼케이스 기존 파이프라인(meshopt 등)은 이전 핸드오프·docs 참조
- 이미지 배경 #DFEAE0은 파이프라인 중간물 전제로 고른 색 — 앱 내 노출 없음 전제. 만약 이미지를 직접 앱에 쓰는 방향으로 바뀌면 배경 처리 재검토
- grok-ops 봇은 완료 과장 전례 있음 — 완료 주장은 디스크 실측으로 판정 (이번 세션은 mtime+개수+육안으로 검증했음)

## Environment State

### Tools/Services Used

- 그록봇 IMAGE 방 (xAI Grok Bot 데스크탑) — 이미지 생성 실행자
- 서브에이전트(Sonnet) 시각 검수 — 이미지 토큰 본세션 차단 목적
- Monitor 백그라운드 감시 (파일 도착·mtime) — 전부 종료됨

### Active Processes

- 없음 (감시 모니터 2개 모두 TaskStop 완료)

### Environment Variables

- 해당 없음

## Related Resources

- 이전 핸드오프: .claude/handoffs/2026-08-24-005800-levain-revamp-ota.md (대개편·OTA·출시 게이트 전체 그림)
- 그록봇 운영 정본: C:\Users\agape\Desktop\코딩\grok-ops\README.md
- 빵 스펙 정본: assets/prompts/breads/*.json (geometry + notes_ko)
- GDD 해금 순서: docs/GDD.md §단계·§레시피
