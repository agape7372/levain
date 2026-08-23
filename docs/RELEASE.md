# 르방이 — 빌드·릴리스 절차

> podoal 셸(`D:\podoal-shell-spike\README.md`)에서 절차만 이식. 르방이는 **로컬 번들 셸**이라
> 원격 URL·FCM·Firebase·AdMob·딥링크 관련 절차는 전부 해당 없음.

## 1. 로컬 검증 (CI 없음 — GitHub Actions 비활성, 전부 로컬)

```bash
npm test              # vitest — sim 코어 전 suite
npm run build         # vite build → dist/
npm run dev           # 웹 확인 (Chrome 모바일 뷰포트)
```

## 2. Android 빌드

```bash
npm run build && npx cap sync android
cd android
JAVA_HOME="D:/android-toolchain/jdk21" ./gradlew assembleDebug
# 산출물: android/app/build/outputs/apk/debug/app-debug.apk
```

- `android/local.properties`(sdk.dir)는 기기별 — 커밋 금지. 새 PC에선 `sdk.dir=D:\\android-toolchain\\sdk` 직접 생성.
- 릴리스: `./gradlew bundleRelease` → 서명 AAB.

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
- Play App Signing 사용(업로드 키 분리) 권장. **키 분실 = Play 업데이트 불가.**

## 6. appId (확정: 2026-08-23)

`com.zaballgam.levain` — 사용자 확정. **Play 등록 후 변경 불가.**

## 6-1. 빌드 함정 (실측)

- **한글 경로**: AGP가 거부 → `android/gradle.properties`의 `android.overridePathCheck=true` (적용됨).
- **aapt/adb는 한글 경로 못 읽음** → APK를 ASCII 경로로 복사 후 조작.
- **Capacitor 플러그인은 정적 import 필수** — `import('@capacitor/x')` 동적 bare-import는
  WebView가 해석 못 해 조용히 null (알림·햅틱 전부 무음 실패). `src/platform/native.ts` 주석 참조.
- key.properties의 storePassword/keyPassword 둘 다 채울 것 — 하나라도 비면
  "Given final block not properly padded".

## 7. Play Console 내부테스트 제출물 체크리스트

- [ ] 서명 AAB (`bundleRelease` + keystore)
- [ ] **개인정보처리방침 URL** — 수집 데이터 0·완전 로컬이라 최단 코스. 정적 페이지 1장
      (기존 Vercel 계정에 정적 호스팅 또는 GitHub Pages)
- [ ] **Data Safety 폼** — "수집하는 데이터 없음, 제3자 공유 없음, 모든 데이터 기기 내 저장"
- [ ] 콘텐츠 등급 설문 — 전체이용가(폭력·도박·공포 요소 0)
- [ ] 스토어 등록정보: 앱 이름 "르방이", 짧은 설명, 자세한 설명
- [ ] 아이콘 512×512 PNG
- [ ] 피처 그래픽 1024×500
- [ ] 스크린샷 최소 2장 (폰 세로)
- [ ] 내부테스트 트랙 테스터 이메일 등록
- [ ] targetSdk 35 (Android 15) — 신규 앱 요건

## 8. 릴리스 게이트

[QA.md](QA.md) 전항 통과 + vitest green + `vite build` 경고 0 이 릴리스 조건.
