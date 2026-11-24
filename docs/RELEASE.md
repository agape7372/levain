# 르방이 — 빌드·릴리스 절차

> podoal 셸(`D:\podoal-shell-spike\README.md`)에서 절차만 이식. 르방이는 **로컬 번들 셸**이라
> `server.url` 라이브 리로드·FCM·Firebase·딥링크 관련 절차는 전부 해당 없음.
> AdMob은 2026-08-30부터 쓴다(§6-2). 출시 전 감사 정본 = [audit/AUDIT-2026-11-12.md](audit/AUDIT-2026-11-12.md).
> (OTA 정적 배포처는 별개 — §8.)

## 1. 로컬 검증 (CI 없음 — GitHub Actions 비활성, 전부 로컬)

```bash
npm test              # vitest 전 suite (sim·store·platform·UI 계약, 2026-11-12 기준 34파일 372)
npx tsc --noEmit && npx eslint src
node scripts/gen-licenses.mjs   # 의존성을 바꿨으면 public/licenses.txt를 다시 만들어 같이 커밋
npm run build         # vite build → dist/
npm run dev           # 웹 확인 (Chrome 모바일 뷰포트)
```

## 1-1. ★APK/AAB를 새로 구우면 OTA도 같이 발행한다 (2026-08-24 실사고)

**증상**: 새로 설치한 APK가 홈으로 나갔다 오면 옛날 화면으로 되돌아간다. 브라우저(dev)는 최신인데 폰만 구버전 — "폰이랑 브라우저 버전이 다른" 상태.

**원인**: 내장 번들의 버전은 `versionName`(예 `1.0`)이다. 매니페스트에 그보다 높은 옛 OTA(예 `1.0.1`)가 떠 있으면 `ota.ts`의 비교가 `1.0.1 > 1.0`으로 판정해 **옛 번들을 받아 예약**하고, 백그라운드 복귀 시 새 APK의 웹 자산을 옛것으로 덮어쓴다. 즉 OTA가 다운그레이드로 작동한다.

**규칙**: 웹 자산(dist/에 들어가는 전부 — JS·CSS·GLB·폰트·문구·상수)을 고쳐 APK/AAB를 재빌드했으면, **같은 코드로 OTA를 한 번 더 발행**해 매니페스트를 그 이상으로 올린다.

```bash
npm run ota:release -- <versionName보다 높은 버전>   # 예: 네이티브 1.0 → 1.0.2
cd ota && npx vercel --prod --scope jirings-projects
curl -s https://levain-ota.vercel.app/manifest.json   # version 확인
```

**2026-11-12 원인 제거(감사 T3-05)**: 내장 번들 비교 기준이 이제 `versionName`이 아니라 `APP_VERSION`(빌드 때의 package.json 버전)이다.
`versionName`도 `build.gradle`이 package.json에서 읽는다. 매니페스트가 내장 번들보다 높을 때만 받으므로 위 다운그레이드는 더 생기지 않는다.
아래 문장은 「APK에 넣은 코드를 OTA 사용자에게도 같이 보낸다」는 뜻으로 남긴다.

**키 둘(§8) 이후**: 예비 공개 키 자리가 비어 있으면 `ota-release`(`--dry-run` 포함)가 멈춘다. 그래서 AAB를 굽기 전에도 `--dry-run` 통과를 먼저 본다.
키 목록은 JS 묶음에 있으므로 AAB를 기다리지 않고 OTA로 걸린다. 예비 키가 실린 첫 OTA 판(1.6.19)이 새 서명 바닥 판이다(§8).

`versionName`을 올리는 빌드라면 OTA 버전도 그보다 높게 잡는다. 발행을 건너뛰려면 매니페스트가 네이티브 이하여야 한다(그 경우 OTA 자체가 무효). 적용 트리거는 §8대로 **백그라운드 전환 후 복귀**.

## 2. Android 빌드

```bash
npm run build && npx cap sync android
cd android
JAVA_HOME="D:/android-toolchain/jdk21" ./gradlew assembleDebug
# 산출물: android/app/build/outputs/apk/debug/app-debug.apk
```

- `android/local.properties`(sdk.dir)는 기기별 — 커밋 금지. 새 PC에선 `sdk.dir=D:\\android-toolchain\\sdk` 직접 생성.
- **버전**(2026-11-12): `versionName`은 `build.gradle`이 `package.json` version을 읽는다. 손으로 쓰지 않는다. `versionCode`는 손으로 올린다(현재 5).
- 서명 없는 디버그 빌드 확인 환경: `JAVA_HOME=D:/android-toolchain/jdk21` · `ANDROID_HOME=D:/android-toolchain/sdk`.
- `npm run build`는 `dist/`를 비우지 않는다. 깨끗한 dist로 확인하려면 `npm run ota:release -- <version> --dry-run`(dist를 비우고 빌드한다).
- 릴리스: `./gradlew bundleRelease` → 서명 AAB. 굽기 전에 `npm run ota:release -- <version> --dry-run` 통과(예비 키 자리표시면 멈춘다, §8 「키 둘」).

## 3. 에뮬레이터 (D:\android-toolchain — podoal에서 검증된 조합)

```bash
cd /d/android-toolchain/sdk/emulator
ANDROID_SDK_ROOT=D:/android-toolchain/sdk ANDROID_AVD_HOME=D:/android-toolchain/avd \
  ./emulator.exe -avd podoal-spike -no-window -no-audio -no-boot-anim \
  -gpu swiftshader_indirect -feature -Vulkan
```

**함정 6가지 (podoal 실측)**:
1. `ANDROID_AVD_HOME` 안 주면 AVD를 못 찾음 (`Cannot find AVD system path`).
2. 창 모드 + Vulkan 조합에서 부팅 정지 — `-no-window` + `-feature -Vulkan`로 띄운다.
3. Git Bash에서 `adb shell am start … --es` 인자는 경로 치환으로 깨짐 —
   `MSYS2_ARG_CONV_EXCL='*' MSYS_NO_PATHCONV=1` 붙인다.
4. 그 환경변수를 켠 채 `adb install`하면 이번엔 APK 경로가 안 변환됨 — install은 윈도우 경로(`D:\…`)로.
5. 에뮬 네트워크가 통째로 죽는 일 있음(`Network is unreachable`) — `-wipe-data` 콜드 부팅으로만 복구.
   앱 문제로 오해하기 쉽다. (르방이는 오프라인 앱이라 영향 적지만 진단 시 참고.)
6. 에뮬 로그를 파이프로 받으면 버퍼에 갇힘 — 파일 리다이렉트(`> emulator.log 2>&1`).

WebView 디버깅(디버그 빌드):
```bash
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof <appId>)
curl http://127.0.0.1:9222/json/list   # webSocketDebuggerUrl로 CDP 접속
```

## 4. 아이콘·스플래시

```bash
npx @capacitor/assets generate --android \
  --iconBackgroundColor "#E8D9C4" --splashBackgroundColor "#E8D9C4"
```

생성기가 만드는 밀도별 스플래시 비트맵(~19MB)은 **전부 삭제**하고
`res/drawable/splash.xml`(단색 #E8D9C4) + `styles.xml` `windowSplashScreen*`으로 대체
(아이콘 mipmap은 유지, `drawable-{land,port}*`·`drawable-night`만 제거 — podoal과 같은 정리).
아이콘 원본은 `assets/icon/`에 버전관리.

## 5. 서명·키스토어 (2026-08-23 완료)

- keystore: `D:\keys\levain\levain.keystore` (alias `levain`), 자격증명 = `D:\keys\levain\credentials.txt`.
- gradle 서명: `android/key.properties`(gitignore) — 분실 시 credentials.txt 값으로 재작성.
- 릴리스: `cd android && JAVA_HOME="D:/android-toolchain/jdk21" ./gradlew bundleRelease`
  → `android/app/build/outputs/bundle/release/app-release.aab`
- Play App Signing 사용(업로드 키 분리). 업로드 키를 잃으면 Play 콘솔에서 재설정을 요청할 수 있다(2026-11-12 정정).
  Play App Signing 없이 앱 서명 키를 잃으면 업데이트 불가.

## 6. appId (확정: 2026-08-23)

`com.zaballgam.levain` — 사용자 확정. **Play 등록 후 변경 불가.**

## 6-1. 빌드 함정 (실측)

- **한글 경로**: AGP가 거부 → `android/gradle.properties`의 `android.overridePathCheck=true` (적용됨).
- **aapt/adb는 한글 경로 못 읽음** → APK를 ASCII 경로로 복사 후 조작.
- **Capacitor 플러그인은 정적 import 필수** — `import('@capacitor/x')` 동적 bare-import는
  WebView가 해석 못 해 조용히 null (알림·햅틱 전부 무음 실패). `src/platform/native.ts` 주석 참조.
- key.properties의 storePassword/keyPassword 둘 다 채울 것 — 하나라도 비면
  "Given final block not properly padded".

## 6-2. AdMob (2026-08-30 도입 — 확장기획 §10)

`@capacitor-community/admob` 8.1.0. **네이티브 SDK라 OTA로 못 나간다** — 새 AAB + 심사가 전제.
이후의 슬롯 배치·상한 수치 조정은 웹 레이어라 OTA 가능.

- **`AndroidManifest.xml`에 `com.google.android.gms.ads.APPLICATION_ID` meta-data가 없으면
  앱이 시작 즉시 크래시한다.** 지금은 `@string/admob_app_id`(strings.xml)를 가리키고,
  값은 **Google 공식 테스트 App ID**다. 실 ID 발급(AdMob 콘솔)은 사용자 게이트 —
  발급되면 `strings.xml`의 `admob_app_id`와 `src/platform/ads.ts`의 `REWARDED_AD_ID` 둘 다 교체.
- **`Capacitor.isPluginAvailable('AdMob')` 단독 판정 금지** — 이 플러그인은 웹 스텁을 등록해서
  브라우저에서도 true다(2026-08-30 실측으로 잡음). `isNative() &&` 를 앞에 둔다.
- 광고를 켠 AAB를 올리기 전에 **Data Safety·앱 콘텐츠 폼을 먼저 갱신**할 것
  (`docs/STORE_LISTING.md` 2026-08-30 개정판: 광고 있음·광고 ID 사용·기기 ID 공유).
  처리방침도 게시본(`ota/privacy.html`)까지 같이 배포해야 앱 내 링크와 어긋나지 않는다.
- SSV 미사용(백엔드 0) — 클라이언트 보상. 콘솔에서 SSV 설정을 켜지 말 것.
- **초기화 순서**(2026-11-12): UMP 동의 확인(`requestConsentInfo` → 필요하면 `showConsentForm`) → `initialize({ maxAdContentRating: MaxAdContentRating.General })`.
  동의가 REQUIRED인 지역에서만 설정에 「광고 개인정보 설정」 행이 생긴다. EEA·UK 배포 여부는 사용자 결정.
- **SDK 버전 고정**: `android/variables.gradle` `playServicesAdsVersion = '25.4.0'`. 플러그인 기본값이 바뀌어도 AAB가 흔들리지 않게 한다.
- 출시 전 앱도 AdMob 콘솔에 수동 등록하면 App ID·광고 단위 ID를 받는다. Play 게시를 기다릴 필요가 없다.
- Data Safety 답안 정본은 [audit/AUDIT-2026-11-12.md](audit/AUDIT-2026-11-12.md) ⑥이다(2026-11-13. 위 08-30 개정판보다 우선).

## 7. Play Console 내부테스트 제출물 체크리스트

- [ ] 서명 AAB (`bundleRelease` + keystore)
- [ ] **개인정보처리방침 URL**: `ota/privacy.html`. 2026-11-13 개정판(AdMob SDK 자동 수집 · 국외 이전 고지)은
      코드 OTA와 같이 또는 뒤에 게시한다
- [ ] **Data Safety 폼**: 답안 = [audit/AUDIT-2026-11-12.md](audit/AUDIT-2026-11-12.md) ⑥. AdMob SDK가 대략적 위치·앱 상호작용·진단·기기 ID를 수집·공유한다(필수). 「수집 없음」은 틀린 답(2026-11-12)
- [ ] 콘텐츠 등급 설문 — 전체이용가(폭력·도박·공포 요소 0)
- [ ] 스토어 등록정보: 앱 이름 "르방이", 짧은 설명, 자세한 설명
- [ ] 아이콘 512×512 PNG
- [ ] 피처 그래픽 1024×500
- [ ] 스크린샷 최소 2장 (폰 세로). `node scripts/store-shots.mjs <outDir>`(폰·7"·10" 각 2장)
- [ ] 내부테스트 트랙 테스터 이메일 등록
- [ ] targetSdk — 현재 `android/variables.gradle`이 **36**(Android 16). 정본은 그 파일이지 이 줄이 아니다

## 8. OTA(웹 번들 갱신)

`@capgo/capacitor-updater` — 정적 호스팅(`https://levain-ota.vercel.app`, `manifest.json` + `bundles/*.zip`
+ `assets/`(원격 빵 자산, 아래), 서버 로직 없음). 앱이 부팅 시 매니페스트를 읽어 새 버전이면 백그라운드로 받아 두고,
**앱을 백그라운드로 보냈다 다시 열 때** 적용한다(세션 중 화면이 갈아끼워지지 않는다).
실측 주의: 완전 종료 후 재시작만으로는 적용되지 않는다 — 홈으로 나갔다 돌아오는 전환이 트리거다. 계약·구현은
[ARCHITECTURE.md §6](ARCHITECTURE.md)·`src/platform/ota.ts` 참조.

**OTA로 되는 것 / 안 되는 것**

| 되는 것 (웹 자산, `dist/`에 들어가는 전부) | 안 되는 것 (APK/AAB 재배포 필요) |
|---|---|
| JS/CSS 번들 | 네이티브 플러그인 추가·변경 |
| 이미지·폰트·GLB 등 정적 자산 | Android 권한 |
| three.js 셰이더(.glsl) | `capacitor.config.ts`의 appId |
| UI 문구(`ui/copy.ts`) | 아이콘·스플래시 등 네이티브 리소스 |
| 게임 밸런스 상수(`sim/constants.ts`) | versionCode·versionName, AndroidManifest.xml |

**릴리스 절차**

```bash
# 0) 버전은 package.json이 유일 출처 — 아래 명령이 자동으로 올린다 (2026-09-03)
npm run ota:release -- <version>          # 예: 1.1.0 — build → zip → sha256 체크섬 → ota/ 산출물
# 신규 네이티브 플러그인을 전제로 한 번들이면 최소 네이티브 버전을 명시:
npm run ota:release -- <version> --min-native=<x.y>
npm run ota:release -- <version> --dry-run   # 파일 쓰기 없이 빌드·zip·체크섬만 확인

cd ota && npx vercel --prod --scope jirings-projects   # 실제 배포
node scripts/check-remote-assets.mjs                   # 배포 뒤 — 원격 빵 자산이 다 떴는지(하나라도 200이 아니면 exit 1)
```

`scripts/ota-release.mjs`가 `ota/manifest.json`(현재 배포 버전)과 `ota/history.json`(발행 이력 누적)을
같이 갱신하고, `ota/bundles/`에는 최근 4개 버전만 남기고 자동 정리한다.

**원격 빵 자산 `ota/assets/`**(2026-11-16): 묶음 밖 변형 143종의 GLB·썸네일. 빌드(`split-remote.mjs`)가 dist에서 빼고
`dist/remote-assets.json`(키 → 내용 해시 앞 10자)을 묶음에 넣는다. 릴리스가 원본을 `ota/assets/breads/<id>.<hash>.glb` ·
`breads/thumbs/<id>.<hash>.png`로 복사하고(같은 이름이 있으면 건너뜀) 그 판의 맵을 `ota/assets/maps/<version>.json`에 남긴다.
최근 4개 판의 맵이 가리키는 파일만 남기고 정리한다(`--dry-run`은 복사 · 정리 목록만 찍는다). `/assets/*`는 1년 immutable + CORS `*`.
앱은 처음 볼 때 받고(쇼케이스는 최대 4초 기다린 뒤 베이스 빵으로 물러남) 기기 Cache Storage에 둔다. 묶음 안 변형 규칙은 `scripts/lib/families.mjs`.
- **순서**: ① `npm run ota:release -- <version>` ② 워크트리에서 릴리스했으면 `ota/assets/`와 새 zip을 배포 폴더(본 레포 `ota/`)로 옮긴다
  ③ `vercel --prod` ④ `node scripts/check-remote-assets.mjs`. ④를 건너뛰면 원격 404가 앱에서 조용히 베이스 빵으로 가려져 아무도 모른다.
  본 레포엔 node_modules가 없어 릴리스는 워크트리에서 만들고, 배포는 `npx vercel --prod --scope jirings-projects --cwd <본 레포>/ota`로 한다(1.6.9 실측).
- **배포 용량(1.6.9 실측)**: zip을 최근 4개(1.6.6~1.6.9)만 두고 assets 52MB를 더해 폴더 합 99MB로 Vercel 배포가 통과했다.
  zip은 4개 유지(옛 zip 10개는 지움). 업로드 상한은 이번엔 안 걸렸지만 여유가 1MB 남짓이라 zip을 더 늘리지 않는다.
- **발행 전 필수**: 개인정보처리방침 세 곳(`docs/PRIVACY.md` · `ota/privacy.html` · GitHub Pages용 사본 `site/privacy.html` — 뒤 둘은 시험이 같은지 본다)에 「빵 그림 파일을 같은 곳에서 받는다」 문장이
  들어 있어야 한다(2026-11-16 개정). 이 기능을 처음 내보내는 판부터 해당한다.
- **처리방침 GitHub Pages(준비만, 2026-11-23)**: Vercel Hobby가 상업 이용 금지라 처리방침을 옮길 자리 `site/`(`privacy.html` + `.nojekyll`).
  게시 = `git subtree push --prefix site origin gh-pages` → Pages 켜기(source `gh-pages` / `(root)`)
  → `https://agape7372.github.io/levain/privacy.html`. 200을 확인한 뒤에 `STORE_LISTING.md` 주소를 바꾼다. 앱 안 링크(`settingsModal.ts`)는 1.6.19(2026-11-24)에 실었다.
  옛 주소 `levain-ota.vercel.app/privacy.html`은 그 판이 다 퍼질 때까지 지우지 않는다.

**판 목록 서명**(2026-11-18 어뷰징 점검 · 11-19 첫 서명 판 1.6.14 게시, 냥수제비 S5 이식): Vercel 계정을 쥔 사람이
manifest와 zip을 같이 바꾸면 모든 폰이 그 JS를 받던 길을 막는다.
- `ota-release`가 `levain-ota\n판\n주소\n체크섬`을 레포 밖 평시 개인 키 `D:\keys\levain\ota-sign.pem`(ECDSA P-256)으로 서명해 manifest에
  `sig`(r‖s base64)를 넣는다(`scripts/ota-sign.mjs`). 평시 키의 다른 자리는 환경 변수 `LEVAIN_OTA_KEY`.
- 앱(`src/platform/ota.ts` `otaKeys` · `signedOk`)은 박힌 공개 키 목록 중 하나로 `crypto.subtle.verify`를 통과한 manifest만 받는다.
  묶음 체크섬이 서명 글 안에 있어 zip만 바꾸면 플러그인 체크섬 대조에서, 체크섬까지 바꾸면 서명에서 걸린다.
- 확인은 돌고 있는 번들이 하므로 AAB 없이 OTA로 걸린다. 지금 폰(1.6.12 이하)은 첫 서명 판을 옛 길로 받고, 그 판부터 확인한다.
  다음 AAB(vc5)를 이 코드로 구우면 내장 번들도 처음부터 확인한다.
- **짝 확인은 빌드 산출물 기준**(2026-11-23): `ota-release`가 빌드 뒤 · 쓰기 전에 `dist/`의 JS에서 P-256 공개 키 목록을 꺼내(`distKeys`)
  서명을 되검증한다(`pairProblem`). 폰이 갖는 건 소스가 아니라 묶음이기 때문이다. 키 파일이 없으면 빌드 전에, 묶음에 키가 둘이 아니거나
  예비 자리표시가 남았거나 짝이 안 맞으면 빌드 뒤에 멈춘다(`--dry-run`도 같다. 멈추면 올려 둔 package.json 판도 되돌린다).
- **키 둘**(2026-11-23): 키 하나가 단일 장애점이라 앱에 공개 키 둘을 박는다 — `otaKeys = [평시, 예비]`.
  평시 키를 잃어도 예비 키로 OTA가 이어지고, 둘 다 잃어야 새 키 + 새 AAB로만 고친다.
  **확인 코드와 키 목록은 JS 묶음(`ota.ts`)에 있다 → 예비 키가 실린 OTA 판을 받은 폰부터 예비 키를 믿는다. AAB를 기다리지 않는다.**
  다음 AAB는 내장 번들에도 같은 목록을 실을 뿐이다(새로 깐 폰이 첫 OTA를 받기 전에도 키 둘로 확인).
  - **keygen**: `node scripts/ota-keygen.mjs <레포 밖 경로>` — P-256 개인 키 PEM을 그 경로에만 쓰고(git 작업 트리 안 · 이미 있는 파일은 거부)
    화면엔 공개 키(SPKI base64)만 찍는다. 그 공개 키를 `src/platform/ota.ts` `otaKeys` 둘째 자리(`OTA_RESERVE_TODO` 자리)에 넣고 커밋한다.
    자리표시가 남아 있으면 `ota-release`가 dist에서 보고 멈춘다 = 예비 키 없이 OTA도 AAB도 내지 않는다.
  - **보관**: 예비 개인 키는 `D:\keys`와 다른 물리 디스크에 둔다(같은 디스크 · 같은 백업이면 같이 잃는다). 경로는 문서에 적지 않는다.
    키 내용은 어디에도 커밋하지 않는다.
  - **예비 키로 서명**(평시 키를 잃었을 때만): `LEVAIN_OTA_RESERVE_KEY=<예비 PEM 경로> npm run ota:release -- <version>`.
    이 환경 변수가 있을 때만 예비 키로 서명하고 시작에 「★예비 키로 서명한다」를 찍는다. 예비 키로 넘어갔으면 새 예비 키를 keygen해
    목록을 [옛 예비, 새 예비]로 바꿔 OTA로 낸다(그 판이 새 바닥 판).
- 평시 키 백업은 `D:\keys\backup-keys.ps1`(그 스크립트가 `D:\keys` 전체를 담는다).
- **서명 바닥 판**(냥수제비 FLOOR와 같은 몫): 지금 **1.6.19**(2026-11-24 예비 키가 실린 첫 OTA 판. 그 전 바닥은 1.6.14 = 2026-11-19 첫 서명 판).
  예비 키를 갈아 끼운 판을 내면 이 줄을 그 판으로 고친다(AAB와 상관없이 OTA 발행 시점). 그보다 옛 코드로는 되돌리지 않는다(1.6.14 이전은 서명 확인이 없고, 1.6.18 이하 = 키 둘 이전 코드는 예비 키를 몰라
  평시 키를 잃는 날 그 폰의 OTA가 멈춘다). 막힘: 옛 커밋의 `ota-release`는 서명을 못 해 새 앱이 안 받고, 새 `ota-release`는
  묶음(dist)에 공개 키가 둘 없으면 짝 확인에서 멈춘다.
  `ota/bundles`의 옛 zip을 손으로 manifest에 가리키지 않는다.

**OTA 호스트 이전 메모 — Cloudflare Pages로 결정(2026-11-23, 아직 실행 안 함)**: Vercel Hobby가 상업 이용 금지라 옮긴다.
- **주소가 박힌 곳**: JS뿐이다 — `src/platform/ota.ts` `OTA_BASE`(manifest 주소 · `${OTA_BASE}/bundles/` 접두 검사)와
  `src/platform/remoteAssets.ts` `ASSET_BASE`. 네이티브(`capacitor.config.ts`는 `updateUrl`·`statsUrl`·`channelUrl` 전부 빈 값, android 리소스)엔 없다.
  스크립트 기본값: `scripts/ota-release.mjs` `DEFAULT_BASE` · `scripts/check-remote-assets.mjs` `--base`. 앱 안 처리방침 링크는 `settingsModal.ts`.
- **AAB 몫인 것**: 돌고 있는 묶음은 자기 `OTA_BASE`의 manifest만 읽고 그 아래 zip만 받는다. 그래서 새 주소를 실은 판은 OTA로도 퍼지지만,
  옛 AAB(vc4 이하)를 새로 깐 폰은 내장 번들이 옛 주소를 보고 첫 OTA를 옛 호스트에서 받는다 → **옛 호스트는 새 주소를 내장한 AAB(vc5)가
  스토어에 깔리고 옛 판이 빠질 때까지 계속 서빙한다.** 이전 자체는 OTA로 되고, 옛 호스트를 끄는 시점만 AAB에 묶인다.
- **계정**: Cloudflare 계정(무료) 하나. Pages 무료 = 파일당 25MiB · 사이트당 2만 파일 · 대역폭 무제한. zip은 1.6.18 기준 약 15MB.
- **wrangler 절차**(레포 devDependency 아님 → `npx wrangler@<고정 버전>`):
  1. `npx wrangler login`(브라우저 인증) 또는 `CLOUDFLARE_API_TOKEN`(Pages 편집 권한) + `CLOUDFLARE_ACCOUNT_ID` 환경 변수
  2. `npx wrangler pages project create levain-ota --production-branch main` → 주소 `https://levain-ota.pages.dev`
  3. `ota/_headers`에 `vercel.json` 헤더를 옮긴다: `/manifest.json` → `Cache-Control: no-store`(지금은 `max-age=0, must-revalidate`) +
     `Access-Control-Allow-Origin: *`, `/bundles/*` · `/assets/*` → `Cache-Control: public, max-age=31536000, immutable` + CORS `*`
  4. `npx wrangler pages deploy ota --project-name levain-ota --branch main`(배포 폴더 = 지금 Vercel에 올리는 그 `ota/`)
  5. 확인: `curl -sI https://levain-ota.pages.dev/manifest.json`(헤더) · `node scripts/check-remote-assets.mjs --base=https://levain-ota.pages.dev/assets`
- **옮기는 순서**: ① 같은 `ota/`를 두 호스트에 다 올린다 ② `OTA_BASE`·`ASSET_BASE`·스크립트 기본값을 새 주소로 바꾼 판을 낸다 —
  이때 manifest가 두 벌 필요하다(옛 호스트 것은 url이 옛 주소 아래여야 옛 코드가 받고, 새 호스트 것은 새 주소 아래. url이 서명 글에 들어가므로
  따로 서명). **지금 `ota-release`는 한 벌만 쓴다 → 이전 때 스크립트를 먼저 보강한다.** ③ 그 뒤 판은 두 호스트에 다 올린다
  ④ vc5(새 주소 내장)가 퍼진 뒤 옛 호스트를 끈다.

**롤백**(2026-11-12 다시 씀, 감사 T2-06): 옛 항목을 manifest에 덮어쓰는 방법은 **안 먹는다**.
기기는 지금 버전 이하의 매니페스트를 무시한다(다운그레이드 거부). `ota-release`도 최신 이하 버전 발행을 거부한다.
쓸 수 있는 롤백은 하나다: 되돌릴 커밋을 체크아웃하고 `npm run ota:release -- <현행보다 높은 버전>`으로 재발행한 뒤 배포한다.
되돌릴 커밋은 서명 바닥 판(위) 이후여야 한다.
- 부팅에 실패해 플러그인이 되돌린 버전은 `levain:ota:bad`에 남아 다시 받지 않는다. 고친 코드는 새 버전 번호로 낸다.
- 매니페스트 url은 앱에 박힌 `https://levain-ota.vercel.app/bundles/` 아래여야 하고 checksum은 64자 hex여야 한다.
  릴리스 때 `LEVAIN_OTA_BASE`로 다른 주소를 쓰면 앱이 그 매니페스트를 무시한다.
- `bundles/*.zip`은 1년 immutable 캐시로 서빙되므로 같은 파일명을 새로 쓰지 않는다.
**⚠️ 저장 스키마 하위호환(2026-08-24 추가)**: 저장 v2(멀티 르방) 이후 번들이 한 번이라도
사용자 기기에 저장을 쓰면, **v2를 모르는 옛 번들로 롤백 금지** — 옛 코드가 schemaVersion 2를
읽지 못해 조용히 새 게임으로 덮어쓴다(미러까지). 롤백 후보는 반드시 v2 인지 버전 중에서 고른다.

**보관 통(pantry) 경제 — 1.3.0**: 빵 굽기 원가를 mass에서 보관 통으로 옮긴 개편(GDD §6-2)은
스키마 버전을 올리지 않았다 — v2 그대로, `shared.pantry`는 무버전 추가 키다(ARCHITECTURE.md §3).
그래서 위 v1 금지와 달리 **1.2.x로 롤백해도 저장은 안전**하다 — 옛 코드가 `pantry` 키를 모를 뿐
나머지(르방·도감·경제 카운터)는 그대로 읽는다. 잃는 건 보관 통 잔량이다(떼어 둔 g이
사라짐 — 병 속 mass·산미·성장 단계는 무손실). 굽기 자체는 1.2.x 코드가 원래의 mass 게이트로
되돌아가므로 계속 가능하다.

**통 로트 원장 — 1.5.0**(2026-09-05, GDD §6-2 개정): `shared.pantryLots[]`(뗀 순간의 발효력·산미·가루를 담는 로트, 굽기는 레시피 best-fit 선택)를 무버전
추가 키로 얹고, `shared.pantry`(총 g)는 Σ로트의 **미러**로 계속 저장한다. 그래서 **1.4.x로 롤백해도 저장은 안전**하다 — 옛 코드는
`pantryLots`를 모를 뿐 g은 그대로 읽고, 등급은 옛 규칙(활성 르방)으로 돌아간다. 옛 번들에서 떼거나 굽어 g이 바뀌면 로트와 어긋나는데,
다시 1.5.0으로 올라오면 **모든** 로트가 레거시 1개(0.8/25·white)로 합쳐진다. 1.4.0이 shared를 다시 조립하며 `pantryLots` 키를
통째로 버리기 때문이다(2026-11-12 정정, 감사 T2-18. 이전 판은 「옛 번들에서 뗀 그램의 품질만 잃는다」고 썼다). g·르방·도감은 무손실이다. 1.4.0 저장본을 1.5.0이 처음 읽을 때도 같은 규칙으로 로트
1개가 물질화된다. 1.5.0은 네이티브 변경 0 — OTA 단독 발행, AAB 재빌드 없음.

**★"무버전 추가 키라 안전"은 키 추가에만 성립한다 — 기존 키가 담는 값의 집합이 커진 경우는 다르다**
(2026-08-26, 재료 30종 발행에서 확인). 1.3.3은 스키마 버전을 안 올렸지만 재료를 12 → 30종으로 늘렸다.
1.3.2 이하로 내려가면:

| 대상 | 결과 |
|---|---|
| 도감 발견(변형 키 포함) | **무손실** — 열거가 카탈로그를 안 보고 저장된 키를 그대로 훑는다. 롤포워드하면 되살아난다 |
| 가루·경제 카운터 | **무손실** — 베이스 레시피만 세고 상수도 그대로 |
| 르방 물리·성장·산미 | **무손실** |
| 화면 | **안 깨진다** — 교환소·굽기 모달·도감-빵이 전부 옛 카탈로그로 돌아 미지의 id를 만나지 않는다 |
| **`shared.inventory`의 신규 18종 수량** | ★**소실.** 옛 코드가 모르는 재료라 조용히 버려지고, 옛 클라이언트가 처음 저장하는 순간 **영구히** 지워진다 |

즉 롤백해도 진척은 남지만 **재료함에 쌓아둔 신규 재료는 못 돌아온다.** 발행을 막을 사유는 아니고,
롤백을 실제로 결정할 때 이걸 알고 하면 된다. 일반화: **카탈로그가 커지는 변경은 스키마 버전이
그대로여도 롤백 비대칭을 만든다** — "키를 안 늘렸으니 안전"으로 넘기지 말고 값 집합을 따로 따져라.

**zip은 커밋하지 않는다**(`.gitignore`의 `ota/bundles/` — 개당 5MB대). 따라서 과거 번들의 실체는
① 지금 배포돼 있는 Vercel 프로젝트와 ② 릴리스를 돌린 이 PC의 `ota/bundles/` 두 곳에만 있다.
다른 PC에서 `vercel --prod`를 돌리면 로컬에 없는 과거 zip이 배포본에서 사라져 롤백 URL이 404가 된다 —
새 PC에서 배포하기 전에 `ota/bundles/`를 함께 옮길 것. `ota/assets/`도 같다(git 밖: `.gitignore`에 `ota/assets/` — 이 PC와 Vercel에만 있다).

**안전장치**(2026-11-12 개정): `app.ts`가 `initOta({ deferReady: true })`로 시작하고 부팅 끝에 `markOtaReady()`를 부른다.
이 짝이 와야 `notifyAppReady()`가 나간다. 부팅이 안 끝나면(크래시 등) 플러그인이 새 번들을 30초 뒤 "깨진 번들"로 판단해 이전 번들로 되돌린다.
**짝 하나가 빠지면 모든 새 번들이 30초 뒤 롤백된다.** 부팅 코드를 고칠 때 이 짝을 지킨다(`tests/otaStage.test.ts`). 번들 적용은 백그라운드 전환 후 복귀에만 일어난다(세션 중 무적용).

**★새 APK/AAB를 구웠다면 OTA도 같이 발행할 것**: OTA 사용자도 같은 코드를 받게 한다. 옛 다운그레이드 사고는 2026-11-12에 막혔다(§1-1).

**기록 복구 지원**(2026-11-12): 저장을 못 읽어 새로 시작한 기기는 원문을 `levain:save:broken`(localStorage + Preferences)에 남긴다.
백업 규칙(`res/xml/backup_rules.xml`·`data_extraction_rules.xml`)은 OTA 번들 폴더 `versions/`를 빼고 나머지를 백업한다.
GLB 캐시 `app_webview/Default/Service Worker/`도 클라우드 백업에서 뺀다(다 보면 약 36MB라 25MB 상한을 넘겨 백업이 통째로 빠짐). main 합침(11-19). 네이티브 리소스라 OTA로는 안 가고 **다음 AAB(vc5)부터** 실린다.

**Play 정책**: 웹 자산(JS/HTML/CSS 등) 무선 갱신은 허용 범위. 네이티브 코드·권한 교체는 금지 —
이 구조는 전자만 다루므로 해당 없음. 위 표의 "안 되는 것"이 필요해지면 통상 절차(§2~§6)로 AAB 재배포.

## 9. 릴리스 게이트

[QA.md](QA.md) 전항 통과 + vitest green + `vite build` 경고 0 이 릴리스 조건.
