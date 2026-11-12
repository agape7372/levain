# 핸드오프: 출시 전 전면 감사 · 수리 끝, 운영 반영 대기 (2026-11-13)

- 정본: [`docs/audit/AUDIT-2026-11-12.md`](../../docs/audit/AUDIT-2026-11-12.md). 결함 136개를 전부 닫았다(고침 117 · 안 함 12 · 기록만 7).
- 가지 `release/audit-1112` · 작업 폴더 `D:\levain-wt-fix`.
- 커밋: `7eb0389`(수리) · `d92337f`(모달 포커스 보정). 문서 갱신은 그 뒤 커밋으로 들어간다.
- main = `c51c149`(OTA 1.5.1). **push · 머지 · OTA 발행 · `ota/` 재배포 · Play 콘솔 전부 안 했다.**

## 지금 상태

| 항목 | 값 |
|---|---|
| 검증 (2026-11-13) | vitest 34파일 372 통과 · `tsc --noEmit` 0 · `eslint src` 0 · `npm run build` 성공 · `check-budget` 통과 · `gradlew assembleDebug` 성공(서명 없음) |
| 버전 | `package.json` 1.5.1 · 매니페스트 1.5.1 · `versionCode 5` |
| 실기기 확인 | 0 |
| 스토어 스크린샷 6장 | `D:\levain-wt-fix\.audit\store-shots\` (git 밖) |

## 사용자 승인이 필요한 것

1. 머지 · OTA · `ota/` 재배포 승인. 처리방침 게시는 코드 OTA와 같이 또는 뒤.
2. Play 콘솔 「데이터 보안」 정정 (정본 ⑥ 표).
3. AdMob 실 ID (수동 등록이면 출시 전에도 받는다).
4. vc5 AAB 업로드 · 비공개 테스트 12명 × 14일.
5. 배포 국가 결정 (EEA · UK 포함 여부).
6. 규칙 변경 확인 (떼기 4.5h · 호밀 가중 · 미션 계수) · 색 변경 확인 (주 버튼 · 캡션).
7. 첫 빵 시점 권고 (T8-05) · 처리방침 문장 수위.
8. 개발자 모드는 출시 빌드에서 막힌다. 되돌리는 법 = 저장본 `flags.dev = true`.
9. 실기기 확인 (정본 ⑧).
10. 작업 폴더 둘(`D:\levain-wt-audit` · `D:\levain-wt-fix`) 정리.

## 승인 뒤 순서

1. **머지**: `release/audit-1112` → main.
2. **OTA 발행**: `npm run ota:release -- <1.5.1보다 높은 버전>`. `package.json` 버전도 같이 오른다.
3. **`ota/` 재배포**: `cd ota && npx vercel --prod --scope jirings-projects`. 새 `privacy.html`이 같이 나간다.
   `curl -s https://levain-ota.vercel.app/manifest.json`으로 버전을 확인한다.
4. **AAB**: vc5로 `bundleRelease`. 업로드는 사람 손(브리지 10MB 한도).
5. Play 콘솔: 데이터 보안 정정 · 스크린샷 6장 교체 · 비공개 테스트.

## 함정

- **OTA 준비 짝**: 부팅은 `initOta({ deferReady: true })`, 부팅 끝은 `markOtaReady()`. 하나라도 빠지면 새 번들이 전부 30초 뒤 롤백된다.
  `src/app.ts`를 고칠 때마다 `tests/otaStage.test.ts`를 돌린다.
- **원본 체크아웃** `C:\Users\agape\Desktop\코딩\levain`(main)에 미커밋 148파일이 있다. 머지 전에 겹치는지 본다. 원본을 정리하거나 덮지 않는다.
- **`git add -A` 금지**. `.audit/`(화면 수천 장)이 딸려 들어간다. 파일을 이름으로 올린다.
- **옛 OTA zip은 원본 체크아웃의 `ota/bundles/`(1.3.9 · 1.4.0 · 1.5.0 · 1.5.1)에만 있다.** `D:\levain-wt-fix\ota\`엔 `bundles/`가 없다.
  워크트리에서 `vercel --prod`를 돌리면 옛 zip이 배포본에서 빠진다. 발행은 원본에서 하거나 `bundles/`를 먼저 옮긴다.
- 롤백은 옛 manifest 덮어쓰기로 안 된다. 되돌릴 코드를 더 높은 버전으로 재발행한다(RELEASE §8).
- 의존성을 바꾸면 `node scripts/gen-licenses.mjs`로 `public/licenses.txt`를 다시 만든다.

## 근거 자료

| 자료 | 경로 |
|---|---|
| 감사 보고 8편 | `D:\levain-wt-audit\.audit\raw\t1-sim.md` ~ `t8-playtest.md` |
| 수리 보고 5편 | `D:\levain-wt-fix\.audit\fix\fix-a-rules.md` ~ `fix-e-screen.md` |
| 재현 스크립트 | `D:\levain-wt-audit\.audit\tmp\` · `D:\levain-wt-fix\.audit\tmp\` |
| 화면 | 수리 전 `D:\levain-wt-audit\.audit\shots\before\` · 수리 뒤 `D:\levain-wt-fix\.audit\shots\after*\` |
| 데이터 보안 답안 원문 | `D:\levain-wt-fix\.audit\fix\fix-c-release.md` |

`.audit/`는 git 밖이다. 작업 폴더를 지우기 전에 남길 것을 정한다.
