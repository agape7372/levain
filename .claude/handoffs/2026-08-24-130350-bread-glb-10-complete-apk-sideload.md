# Handoff: 빵 GLB 10종 완성 + breadlab 하네스 + APK 사이드로드 전달

## Session Metadata
- Created: 2026-08-24 13:03:50
- Project: C:\Users\agape\Desktop\코딩\levain
- Branch: grok/LV-001 ★여전히 main 아님. 이 세션 산출 전부 미커밋 워킹트리
- Session duration: 약 5시간 (2026-08-24 08:00~13:00)

### Recent Commits (for context)
- fb064ab grok/LV-001: kill inner beige ring
- 616c4bc grok/LV-001: jar floor and dough radius clamp
- 8cf917f docs: 세션 핸드오프 — 대개편+OTA (2026-08-24)

## Handoff Chain
- **Continues from**: [2026-08-24-040510-bread-images-30-done-threejs-next.md](./2026-08-24-040510-bread-images-30-done-threejs-next.md)
  - Previous title: 빵 레퍼런스 이미지 30장 확보 완료 — 다음은 three.js 절차 모델링
- **Supersedes**: 이전 핸드오프의 "three.js 절차 모델링" 계획 절 전체 — 완료됨

## Current State Summary

이전 핸드오프의 다음 작업이었던 "three.js 절차 모델링로 빵 10종 GLB"가 **전량 완료됐다**. 파이프라인은 사용자 확정으로 **img2threejs 스킬(이미지→절차 코드, `~/.claude/skills/img2threejs` clone됨) + breadlab 렌더 하네스** 조합. 10종 GLB(합계 1090KB/2560KB)·썸네일 10장·vitest 88·build green·앱 스모크 green(썸네일 200 OK·쇼케이스 3종·콘솔 0). 사용자 피드백 2건 반영(바게트 L/D 11.4→5.0 스타일라이즈, 레시피 뒤로가기 + Android 백키 탭 복귀). **서명 APK(12.5MB, versionCode 1)를 빌드해 대화로 전달 — 사용자가 폰 설치·확인 중인 상태로 세션 종료.**

## Codebase Understanding

## Architecture Overview
- **절차 정본 = `docs/BREADS.md`** (이 세션 신설, 레포 CLAUDE.md 정본 지도에 연결됨) — 구성 요소 표·절차·함정·결정 이력 전부 여기. 이 핸드오프는 요약만.
- 빌더 계약 = `scripts/breads/types.ts` 주석(런타임 Lambert 강제·mesh≤2·rng 결정론·비율만 유의미).
- 위임 크립 = `assets/breads/work/CRIB.md`(서브에이전트 재작업 시 그대로 재사용).
- 소비: `src/app.ts` openShowcase → `src/render/breadShowcase.ts`(GLTFLoader+meshopt 디코더) / 도감 썸네일 `src/ui/screens/recipes.ts`.

## Critical Files
| File | Purpose | Relevance |
|------|---------|-----------|
| scripts/breads/<id>.ts ×10 + lib.ts·types.ts·index.ts·domeShell.ts | 절차 빌더 전량 | 수정 시 스펙(assets/breads/specs/) 먼저 고치고 전사 |
| breadlab.html + scripts/breadlab.ts | 하네스(compare·roundtrip·azimuth·export 모드) | URL 파라미터 = 전체 상태, 파일 머리 주석 참조 |
| scripts/export-breads.mjs·breadlab-shot.mjs·lib/launch-browser.mjs | 내보내기·스크린샷·Chrome 폴백 CLI | `npm run breads:export` |
| public/breads/*.glb + thumbs/*.png | 산출물 10+10 | 미커밋 |
| assets/breads/specs/<id>.json ×10 | img2threejs 스펙 보존(수치 정본) | reviewHistory 포함 |
| android/app/build/outputs/apk/release/app-release.apk | 서명 APK(12.5MB) | 사용자 전달본과 동일 |

### Key Patterns Discovered
- 상세는 `docs/BREADS.md` §함정 + 위키 `llm-harness-scaffolding` §8. 핵심 4개: ①displacement는 격자 셀 단위(정점 간격보다 작으면 조용히 소멸) ②LatheGeometry 금지·프로필 t 단조 유지 ③투톤은 단일 indexed→facet→sliceTriangles ④비대칭 빵은 방향(orientation)을 1반복차에 확인.
- vite 스폰 함정: "Local:" 배너 ANSI 스트립 파싱 + Windows taskkill 트리킬(bake-thumbs 잠복 버그였음 — 수정됨).
- puppeteer chrome@152 캐시 0바이트 반복 손상(디펜더 추정) — launch-browser.mjs가 151로 자동 폴백. 재설치 시도 무의미.

## Work Completed
- [x] M0: img2threejs 스킬 설치·프로토콜 파악, puppeteer 설치
- [x] M1: breadlab 하네스+export 파이프라인+pancake 파일럿(Opus 서브에이전트)
- [x] M2: 9종 배치 3×3(Sonnet 서브에이전트) — 본세션 전량 코드 리뷰(발견 결함 1: domeShell 프로필 비단조 주름 → 수정·재검)
- [x] M3: 일괄 export·budget(1090KB)·thumbs·test 88·build·앱 스모크(visual-smoke — 천 버그 2건은 오판정 철회: 유리병 립 오인 + 30분 부재 룰 정상)
- [x] M4: docs/BREADS.md 신설 + 레포 CLAUDE.md 연결 + 메모리 + 위키(coding-portfolio·log·llm-harness-scaffolding §8·index)
- [x] 사용자 피드백: 바게트 L/D 5.0(스펙·워크스페이스 스크립트 동기화, 되돌림 방지 주석) · 레시피 헤더 ← 버튼 + onRootBack 탭 복귀(app.ts·recipes.ts·main.css)
- [x] 서명 APK 빌드·검증(apksigner)·사용자 전달

## Files Modified
| 범주 | 파일 |
|---|---|
| 신규(파이프라인) | breadlab.html · scripts/breadlab.ts · scripts/breads/{types,lib,index,domeShell,pancake,cracker,scone,flatbread,focaccia,loaf,baguette,campagne,rye,wholewheat}.ts · scripts/export-breads.mjs · scripts/breadlab-shot.mjs · scripts/lib/launch-browser.mjs |
| 신규(산출·문서) | public/breads/*.glb ×10 + thumbs/*.png ×10 · assets/breads/specs/*.json ×10 · assets/breads/work/* (CRIB.md·빵별 워크스페이스) · docs/BREADS.md |
| 수정 | scripts/bake-thumbs.mjs(ANSI·killTree·폴백) · package.json(breads:export·puppeteer) · docs/VISUAL.md §8(webp/png) · CLAUDE.md(정본 지도) · src/app.ts(백키 탭 복귀) · src/ui/screens/recipes.ts(← 버튼) · src/styles/main.css |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 바게트 L/D 11.365→5.0 | 사용자 판정: 1.6 리핏에서 두께 소멸("콩알"). 게임 가독성 > 실측. 스펙·코드·station_gen 3곳 동기화 |
| 레시피 탭 루트 백키 = 르방이 탭 복귀 | 이전엔 곧장 minimizeApp — "돌아갈 길 없음"의 원인 |
| 색 정본 = 프롬프트 JSON hex | 이미지=형태·비율만. 없는 색은 scaleHex 유도+출처 주석 |
| meshopt 인코딩 미도입 | 1090/2560KB 여유. 압박 시 @gltf-transform이 릴리프 밸브 |

## Pending Work

### Immediate Next Steps
1. **사용자 폰 APK 설치 확인 대기** — 탭바·썸네일·쇼케이스·뒤로가기. 문제 시: 웹 자산 건은 수정 후 `npm run ota:release -- <ver>` + `cd ota && npx vercel --prod --scope jirings-projects`로 무선 반영 가능(APK 재설치 불필요, RELEASE.md §8)
2. 빵 비주얼 추가 수정 요청 시: 해당 `scripts/breads/<id>.ts` 상수 조정 → `npm run breads:export -- <id>` → check-budget → thumbs → 그리드 재생성(스크립트 = 스크래치패드 make-grid.ps1, 없으면 `assets/breads/work/grid-2026-08-24.png` 참조해 재작성)
3. 남은 출시 게이트(사용자): 실기기 스모크 완료 판정 → 방침 게시 → Play 업로드(AAB는 재빌드 필요 — 오늘 변경 포함하려면 `gradlew bundleRelease`)

### Blockers/Open Questions
- [ ] 커밋·머지 정책 = 사용자 판단 (grok/LV-001에 미커밋: 이미지 30장 + 프롬프트 v3 + 빌더·하네스 전부 + GLB/thumbs + docs + src 수정 3파일)
- [ ] Play 제출용 AAB는 어제 것(ea94df6, 빵 미포함) — 제출 전 재빌드 필수

## Important Context
1. **디스크 사건**: C: 여유 0까지 갔었음. npm·gradle 캐시 정리로 9GB 확보. 별도 원격 세션("Free up C: drive")이 Docker 22.8GB·Cowork 번들 11.8GB 정리를 사용자 승인 대기 중이었음 — 그 세션과 정보 동기화 완료 상태.
2. **에이전트 반복 상한(3회/빵)은 프롬프트 지시만으론 집행 안 됐다**(3배치 전부 초과, 결과는 수렴) — 다음 멀티에이전트 작업 시 스크립트 층에서 세야 함.
3. 스킬 python은 **Bash로만** + `PYTHONIOENCODING=utf-8`. PowerShell .ps1에 한글 쓰면 UTF-8 BOM 필수.
4. 서브에이전트 시각 보고는 오판 가능 — 천 버그 2건이 유리병 립 오인이었음. **계기판(window.__levainScene, DEV 노출) 직독으로 판정**하는 절차가 유효했다.

## Potential Gotchas
- breadlab·export 스크립트는 vite를 스폰한다 — 병렬 실행 시 .vite 캐시 경합 가능(실패 시 1회 재시도).
- `@capacitor/assets` 재실행 금지 조건 유지(밀도별 splash 재생성 → 릴리스 깨짐, RELEASE.md §4).
- GLB 재수출은 결정론(같은 코드 = 같은 md5) — diff가 나면 코드가 바뀐 것이다.
- 홈 화면의 밝은 링은 유리병 립(jar.ts lip, 정상) — 천 잔류로 오인하지 말 것(이 세션에서 오판 2회).

## Assumptions Made
- GLB 10종은 사용자 그리드 판정에서 바게트 외 지적 없음 = 잠정 승인으로 취급(폰 실물 확인이 최종)
- versionCode 1 유지(첫 업로드 전이라 사이드로드 APK와 충돌 없음)

## Environment State
- 활성 프로세스 없음(dev 서버·에이전트 전부 종료. 서브에이전트 5개 idle: pancake-pilot·flat/chunk/boule-batch·visual-smoke — SendMessage로 재개 가능)
- C: 여유 ~9GB. APK 사본 = 세션 스크래치패드 levain-2026-08-24.apk

## Related Resources
- 절차 정본: `docs/BREADS.md` · 위임 크립: `assets/breads/work/CRIB.md`
- 빌드·OTA: `docs/RELEASE.md` §2·§8
- 위키: `C:\Users\agape\Documents\Obsidian Vault\06_wiki\llm-harness-scaffolding.md` §8(하네스 교훈) · `C:\Users\agape\Documents\Obsidian Vault\06_wiki\coding-portfolio.md`
- 메모리: `project_levain_2026-08-23.md` (08-24 갱신됨)
