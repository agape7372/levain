# Handoff: 르방이 게임성·비주얼 대개편 + OTA 도입

## Session Metadata
- Created: 2026-08-24 00:58:00
- Project: C:\Users\agape\Desktop\코딩\levain
- Branch: grok/LV-001 (main과 같은 커밋 cc7486d — 다른 세션이 만든 브랜치, 분기 없음)
- Session duration: 약 7시간 (2026-08-23 18:00 ~ 2026-08-24 01:00)

### Recent Commits (for context)
  - cc7486d feat: OTA(웹 번들 무선 갱신) — 정적 호스팅 수동 모드, 에뮬 E2E 통과
  - 8ad1633 feat: OTA 업데이트 파이프라인 (@capgo/capacitor-updater)
  - ea94df6 chore: 스플래시 비트맵 재삭제(RELEASE.md §4 — splash.xml 단색 정본과 동명 충돌) + 개편 반영 AAB 재빌드
  - df784c6 chore: 고무줄 잔재 주석 정리 — fill 기준 서술을 급여 시점으로 통일
  - d98af24 fix: demo 모드에 곰팡이 시드 배선 — 단계 튜닝(?demo=170+)에서 반점 자리 고정

## Handoff Chain

- **Continues from**: None (fresh start)
- **Supersedes**: None

> 같은 날 오전의 "원샷 완성"(main 51bc9fc까지) 뒤에 이어진 2차 마라톤이다. 오전 작업 기록은 커밋 로그와 memory `project_levain_2026-08-23.md` 참조.

## Current State Summary

사용자의 실기기 녹화 영상 판독에서 출발해 **게임성·비주얼 대개편 + 3D 파이프라인 + OTA 도입**을 완주했다.
리서치(실제 사워도우 사육 전수조사 6갈래)에서 "진짜 사망은 곰팡이뿐, 오판이 흔함"이라는 수렴점을 얻어
**좁은 진짜 죽음 + 건조 플레이크 보험 + 진단 플레이**를 코어 차별점으로 채택했고, 시뮬(곰팡이·플레이크·브리핑)
→ 렌더(도우 셰이더 근본 수리·젓기 촉감·천 덮개) → 3D 파이프라인(프롬프트 10종·GLB 쇼케이스·썸네일 베이커)
→ 아이콘/스플래시 교체 → OTA(정적 호스팅 수동 모드)까지 전부 커밋·검증했다. vitest 88 green,
서명 AAB·릴리스 APK 재빌드 완료, OTA 첫 번들 1.0.1 배포 및 에뮬 E2E 통과.
남은 것은 전부 **사용자 게이트**(빵 이미지 생성·실기기 스모크·Play 업로드)다.

## Codebase Understanding

## Architecture Overview

- 층 구조: `sim`(순수·닫힌 함수) ← `store` ← (`ui`, `render`), `platform`은 app.ts가 주입. 정본 문서 4종이
  관할을 나눠 가짐(GDD=규칙·수치 / ARCHITECTURE=코드 계약 / VISUAL=씬·uniform / RELEASE·QA=절차).
- **닫힌 함수 모델**: 저장 상태는 타임스탬프+누적값만. 활성도·부피·단계·곰팡이 전부 파생. 적분 루프 없음.
  이번에 추가한 곰팡이도 이 원칙을 지켜 **신규 저장 필드 0**으로 구현했다(flake만 예외적으로 1개 추가).
- sim은 three/DOM/Date.now 금지(ESLint `no-restricted-imports`로 잠겨 있음). now는 항상 인자.
- OTA는 `platform` 층에 격리 — sim·store는 OTA의 존재를 모른다.

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `src/sim/derive.ts` | 곰팡이 단계·kahm·Snapshot 파생. `phaseAt`에서 moldy가 revive 오버라이드보다 **먼저** 판정되는 순서가 핵심 | 곰팡이 관련 수정 시 1순위 |
| `src/sim/constants.ts` | 곰팡이 임계(154/226/322h, 배고픔 기준 오프셋)·FLAKE_* 상수 | 밸런스 조정 진입점 |
| `src/sim/actions.ts` | makeFlake/discardStarter/restoreFlake + moldy 액션 가드 | 액션 추가 시 가드 확인 |
| `src/sim/briefing.ts` | 부재 중 넘은 경계를 시간순 수집(순수) | 복귀 브리핑 |
| `src/render/dough/dough.frag.glsl` | 도우 표면 정본 — 2로브 스펙·FBM 노멀·곰팡이 보풀·kahm 막 | 비주얼 튜닝 1순위 |
| `src/render/dough/DoughMesh.ts` | 젓기 시어장·실 트레일·poke 스프링 상태기 | 촉감 튜닝 |
| `src/render/renderParams.ts` | Snapshot→uniform 유일 이음새(순수, vitest 대상) | 새 uniform 추가 시 여기부터 |
| `src/platform/ota.ts` | OTA 계약 3줄(notifyAppReady 즉시·세션 중 무적용·실패는 침묵) | OTA 수정 시 필독 |
| `scripts/ota-release.mjs` | build→zip→sha256→manifest/history | 발행 |
| `scripts/lib/zip.mjs` | 자작 결정론 zip(의존 0) | 번들 패키징 |
| `docs/RELEASE.md` §8 | OTA 절차·롤백·Play 정책 정본 | 발행 전 필독 |

## Key Patterns Discovered

- **문구는 `src/ui/copy.ts` 한 파일** — 담백한 한 문장, 시스템어·죄책감 금지. 죽음 문구는 "사실 서술+위로".
- **모달은 중앙 팝업 고정**(바닥 시트 금지, modal.ts 주석에 되돌림 방지 명시). 쇼케이스는 모달이 아니라 Screen push.
- 실패·차단은 문구 대신 **옅은 비활성**(disabled)으로 표현한다.
- 셰이더 범프 배열은 **단일 uniform 소스** — 버텍스/프래그가 같은 배열을 첨도 계수만 달리해 읽는다.
- 이징 3종 고정(등장 cubic-bezier(0.22,1,0.36,1) / 숨 easeInOutSine / damped spring). elastic·bounce 금지.
- 커밋 시 `git add -A` 금지 — 경로 명시(implementation-notes.md는 커밋 제외 관례).

## Work Completed

## Tasks Finished

- [x] 영상 판독 기반 P0 수정(토스트 겹침·유리병 존재감·poke 배선·wobble 프레임률 독립화)
- [x] 리서치 6갈래(실패/성공/간과/과학/유사게임/리텐션) + 빵 10종 시각특징 전수조사
- [x] 곰팡이 사망 시스템(파생·결정론, 반점 168h→확산 240h→사망 336h @1:1:1 실온)
- [x] 건조 플레이크 백업/복원/폐기 액션 3종 + moldy 액션 가드
- [x] 복귀 브리핑(deriveBriefing) + 진단 행(kahm·잿빛·데드라인)
- [x] moldWarn 알림 슬롯 3 신설(휴면 완전 침묵 폐지), 사망 후 무통지
- [x] 도우 셰이더 개편 — 4엽 얼룩 근본 제거(레거시 음수 혹 폐기)·FBM·젖은광/무광·피크 돔·과숙 크레이터
- [x] 젓기 촉감(손가락 추종 시어장·실 트레일·기포 가속·squelch)·천 덮개 플릭 오프닝·햅틱 예산
- [x] 고무줄 토러스 제거(사용자 지시)
- [x] GLB 파이프라인 인프라(프롬프트 JSON 10종·쇼케이스·썸네일 베이커·예산 검사)
- [x] 앱 아이콘 3D 렌더 교체 + 브랜드 스플래시
- [x] OTA 도입 + 첫 번들 1.0.1 배포 + 에뮬 E2E
- [x] 문서 5종 갱신(GDD·VISUAL·ARCHITECTURE·QA·PRIVACY·RELEASE) + 메모리 + 위키

## Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| `src/sim/*` (7파일) | 곰팡이·플레이크·브리핑·알림 슬롯 | 게임성 코어 |
| `src/render/*` (10파일 + 신규 3) | 셰이더 개편·촉감·천 덮개·쇼케이스 | 영상에서 드러난 시각 문제 |
| `src/ui/*` (8파일 + 신규 3) | 사망 모달·브리핑 카드·진단 행·말려두기 | 새 시스템 노출 |
| `capacitor.config.ts` | CapacitorUpdater 설정(클라우드 차단 포함) | OTA |
| `docs/*` (6파일) | 규칙 개정·신규 절 | 정본 동기화 |
| `tests/*` (4개정 + 3신규) | 88건 green | 안전망 |

## Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| 진짜 실패 = 곰팡이만 | 실패 없음 유지 / 다중 사망 벡터 | 사용자가 "진짜 실패" 지시. 실사육에서도 사망 원인이 좁고 예고됨 — 분홍 Serratia·과열은 v2 컷 |
| 곰팡이를 파생으로 | 새 상태 필드 추가 | 닫힌 함수 모델 유지 + 시계 조작 회피 불가 |
| 젓기 = 시뮬 영향 0 | 배고픔 리셋 등 | 사용자 확정("슬라임 촉감놀이") |
| GLB 쇼케이스 = Screen push | 모달에 캔버스 | 중앙 팝업 규칙 위반 회피 + 단일 캔버스 예산 |
| 썸네일 = 빌드 타임 베이크 | 런타임 1회 캐시 | 저사양 기기에 GLB 10개 로드 전가 금지 |
| OTA = capgo 수동 모드 | 자동 모드 / server.url / Appflow | 자동 체크는 POST라 정적 호스팅 불가. server.url은 오프라인 상실. Appflow는 종료 예정 |
| updateUrl/statsUrl 빈 문자열 | 기본값 유지 | 기본값이 Capgo 클라우드로 기기정보·통계 전송 — PRIVACY.md 계약 위반 |

## Pending Work

## Immediate Next Steps

1. **빵 이미지 10종 생성(사용자 게이트)** — `assets/prompts/breads/<id>.json`의 `prompt_flat`을 이미지 생성기에
   복붙(1:1 1024, 가능하면 뷰 3장) → `assets/breads/src/<id>.png` 저장. 이미지가 들어오면 이후 자동:
   higgsfield `generate_3d`(MCP) → `npx @gltf-transform/cli`로 최적화 → `public/breads/` → `npm run thumbs`
   → `npm run check-budget`. 도감·쇼케이스가 자동으로 GLB를 쓰기 시작한다(현재는 breadArt 폴백).
2. **실기기 스모크** — `docs/QA.md` G절. 특히 젓기 60fps(강하 노브 3단은 VISUAL §8에 사전 설계됨),
   천 덮개 플릭, 곰팡이 예고→사망→플레이크 복원 왕복(저장 조작 절차 QA.md에 있음).
3. **Play 업로드** — 방침 URL 게시(`docs/PRIVACY.md` 정적 페이지 1장) 후 AAB 업로드.
   AAB는 OTA 포함 재빌드 완료(`android/app/build/outputs/bundle/release/app-release.aab`, jar verified).

## Blockers/Open Questions

- [ ] 빵 이미지 생성은 사용자만 가능(생성기 접근) — 이게 W7 전체의 유일한 병목
- [ ] 쇼케이스 draw call ≤4는 GLB가 없어 미실측
- [ ] 젓기 시각 결과물은 계기(uniform 실측)로만 확인 — 실기기 체감은 미검증

## Deferred Items

- v2 목록: 계보 UI·냄새 도감·이달의 빵·분홍 Serratia·49°C 과열·플레이크 다회 슬롯·사망 추모 연출·float test 재해석
- 도감 상세 뷰어(쇼케이스는 굽기 결과에만 연결) — GLB 도착 후 confirm 모달에 보조 버튼으로 추가 예정
- `breadArt.ts` 삭제 — 썸네일 10종이 전부 생기면

## Context for Resuming Agent

## Important Context

**이 앱의 계약 3개를 깨지 말 것.**
1. **sim은 순수**: three/DOM/`Date.now()` 금지, now는 항상 인자. 파생 가능한 값은 저장하지 않는다.
   새 타임스탬프 필드를 추가하면 `advance.ts`의 `reanchor` 목록에 **반드시** 편입(시계 역행 방어).
2. **실시간 = wall-clock**: rAF·프레임 델타를 게임 시간에 누적 금지. rAF는 렌더 화장품 전용.
3. **OTA는 웹 자산만**: 네이티브 플러그인·권한·아이콘·versionCode는 OTA로 못 고친다 → APK/AAB 재배포.

**OTA 검증할 때 가장 흔한 오판**: 적용 트리거는 "앱 재시작"이 아니라 **백그라운드 전환 후 복귀**다.
force-stop→재시작만 하면 builtin이 계속 로드돼서 "OTA가 안 된다"고 오진하게 된다. 홈키로 나갔다 들어올 것.

**프라이버시 계약**: `capacitor.config.ts`의 `updateUrl`/`statsUrl`/`channelUrl` 빈 문자열은 장식이 아니다.
기본값이 Capgo 클라우드로 기기 정보·통계를 보내고, 그러면 `docs/PRIVACY.md`가 거짓이 된다. 되돌리지 말 것.

## Assumptions Made

- 첫 OTA 번들 버전을 1.0.1로 잡았다(네이티브 versionName "1.0"보다 커야 다운로드된다). 이후 발행은 증가만.
- `minNative: "1.0"` — 네이티브 플러그인을 추가하면 이 값을 올려 구 셸이 새 번들을 받지 않게 해야 한다.
- 곰팡이 임계(7/10/14일)는 "주말 여행은 무해, 실온 2주 완전 방치만 사망"을 노린 값. 실플레이 피드백으로 조정 가능.
- 조기 사망(생후 8일 미만, 보험 미해금)은 의도적 수용 — GDD §3-4-1에 재론 방지 문장 있음.

## Potential Gotchas

- **`@capacitor/assets generate` 재실행 시** 밀도별 `splash.png`가 되살아나 android res의 `splash.xml`(단색 정본)과
  동명 충돌 → 릴리스 빌드가 깨진다. RELEASE.md §4대로 즉시 삭제할 것.
- **PowerShell `Compress-Archive` 금지** — zip 엔트리 경로를 역슬래시로 써서 안드로이드 unzip이 파일명으로 먹는다.
  `scripts/lib/zip.mjs`를 쓸 것.
- **`ota/bundles/`는 커밋 제외**(개당 5MB대). 과거 번들 실체는 Vercel 배포본 + 릴리스 PC에만 있다.
  다른 PC에서 `vercel --prod`를 돌리면 과거 zip이 사라져 롤백 URL이 404가 된다.
- **CircleGeometry는 XY 평면** — 셰이더가 `position.xz`를 읽는데 메시 회전으로 눕히면 축이 어긋난다(천 덮개 실사고).
  지오메트리를 `rotateX`로 베이크할 것.
- **localStorage 시드 후 reload는 레이스** — 앱이 리로드 직전 saveNow로 덮어쓴다. 브라우저 검증 시 `initScript`로만.
- 한글 경로 Android 빌드: `android.overridePathCheck=true`, aapt/adb는 ASCII 경로로 복사 후 조작.
- Capacitor 플러그인 **동적 import 금지**(bare specifier 해석 실패로 조용히 null).

### Tests

`npm test` 88건(11파일). 곰팡이·플레이크·브리핑은 sim 순수 로직이라 테스트가 안전망이다.
render/UI/platform은 테스트 없음 → 수동 QA(docs/QA.md)가 유일한 그물.

## Environment State

## Tools/Services Used

- Node 24.11.1 / vitest 4 / vite 8 / Capacitor 8.5 / three 0.185
- JDK21 = `D:/android-toolchain/jdk21` (gradle 빌드 시 JAVA_HOME 지정 필수)
- Android SDK = `D:/android-toolchain/sdk`, 에뮬 AVD `podoal-spike`(현재 emulator-5556 기동 중이었음)
- Vercel CLI 54.5.0, scope `jirings-projects`, 프로젝트 `levain-ota`(alias `levain-ota.vercel.app`)
- higgsfield MCP(`generate_3d`) — 빵 이미지→GLB 변환에 사용 예정

## Active Processes

- 에뮬레이터 emulator-5556에 디버그 APK 설치돼 있음(OTA 번들 1.0.1 적용 상태). 세션 종료 시 정리 안 함.
- vite dev 서버는 종료함.

## Environment Variables

- `LEVAIN_OTA_BASE` — OTA 배포처 베이스 URL 덮어쓰기(미설정 시 기본값 사용). 값 자체는 비밀 아님.
- `JAVA_HOME` — 빌드 시 JDK21 경로 지정.
- 시크릿 없음. keystore 자격증명은 `D:\keys\levain\credentials.txt`(레포 밖, 커밋 금지).

## Related Resources

- 승인 플랜: `C:\Users\agape\.claude\plans\c-users-agape-claude-uploads-f0f7eeb7-6-fizzy-cat.md`
  (설계 원문 2종: 같은 폴더의 `...-agent-afe0ea12145c5e8bf.md` 메커닉 / `...-agent-ae37dc4c1a469ce84.md` 비주얼)
- 정본 문서: `docs/GDD.md`(§3-4-1 곰팡이·§8-1 브리핑) · `docs/VISUAL.md`(§0 셰이더 함정·§8 예산) ·
  `docs/ARCHITECTURE.md`(§6 OTA 계약) · `docs/RELEASE.md`(§8 OTA) · `docs/QA.md`(G절 신규 시스템)
- 이탈 기록: `implementation-notes.md`(커밋 제외)
- 메모리: `project_levain_2026-08-23.md` / 위키: 옵시디언 볼트 06_wiki의 coding-portfolio 페이지
- OTA 배포처: https://levain-ota.vercel.app/manifest.json

---

**Security Reminder**: Before finalizing, run `validate_handoff.py` to check for accidental secret exposure.
