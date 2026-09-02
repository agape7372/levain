# 르방이 — 아키텍처 (계약·구조 정본)

> **정본 선언**: 코드 계약·레이어링·저장·플랫폼 통합은 이 문서가 정본.
> 게임 규칙·수치는 [GDD.md](GDD.md), 씬·uniform은 [VISUAL.md](VISUAL.md)가 정본.

스택: TypeScript(strict) + Vite + three.js(npm) + vitest + Capacitor 8 (Android, 로컬 번들 셸).
백엔드 0, 완전 로컬, CI 없음(검증 전부 로컬: vitest + vite build + Gradle).

## 0. 프로토타입 판정 — 살릴 것 / 버릴 것

**살린다**: 반죽 셰이더 전체(버텍스 가우시안 범프 + 프래그먼트 아날리틱 노멀 재구성 — 제품의 얼굴),
라이팅(키 0xffe2b0 1.4 + 앰비언트 0xfff0dc 0.55), 베이지 팔레트, 포인터→평면 레이캐스트→wobble 감쇠(×0.9) 입력 모델,
병 토러스 반경값(원통 반지름 0.92로 계승 — 고무줄 마커는 제거됨, VISUAL.md §1-2, 개정 2026-08-24: 고무줄 마커 제거 반영).

**버린다**: unpkg importmap(오프라인 앱에서 죽은 코드 → npm three), `#recipe[style*="block"]` CSS 핵,
`?tab=` URL 라우팅, 전역 변수 스크립트 구조, rAF 시계를 게임 시간으로 쓰는 구조(게임 시간 = wall-clock),
탑다운 90° 카메라(→ 55° 틸트, VISUAL.md §1).

## 1. 디렉터리·모듈 구조

```
levain/
├─ index.html  vite.config.ts  tsconfig.json  vitest.config.ts  capacitor.config.ts
├─ src/
│  ├─ main.ts                  # 부트스트랩: 저장 로드 → catch-up → 조립
│  ├─ app.ts                   # 오케스트레이터 — 층을 배선하는 유일한 곳
│  ├─ sim/                     # ★순수 코어: three/DOM/Capacitor/Date.now import 0
│  │  ├─ types.ts              # SimState·Action·SimEvent·Snapshot
│  │  ├─ constants.ts          # 튜닝 상수 전부 한 곳 (GDD §3 수치)
│  │  ├─ advance.ts            # advance(state, now) — 닫힌 함수 catch-up + 재정박
│  │  ├─ actions.ts            # applyAction(state, action, now) → {state, events}
│  │  ├─ derive.ts             # deriveSnapshot(state, now) → Snapshot
│  │  ├─ recipes.ts            # 레시피 데이터·해금·판정 (순수 데이터+함수)
│  │  ├─ notifyPlan.ts         # planNotifications(state, now) → NotifyPlan
│  │  └─ briefing.ts           # deriveBriefing(state, from, to) → BriefingKey[]
│  ├─ render/                  # three 전용. sim을 모른다 — RenderParams만
│  │  ├─ SceneHost.ts          # renderer·scene·camera 수명주기, ResizeObserver, 컨텍스트 유실 복구
│  │  ├─ dough/ DoughMesh.ts dough.vert.glsl dough.frag.glsl   # ?raw 임포트
│  │  ├─ jar.ts                # 병 3패스 + hooch 층 (개정 2026-08-24: 고무줄 마커 제거 반영)
│  │  ├─ cloth.ts              # 천 덮개 1메시(플릭·탭 걷기)
│  │  ├─ background.ts         # 라디얼 그라디언트 + 베이크드 소프트 섀도
│  │  ├─ particles.ts          # 공용 InstancedMesh 풀 256
│  │  ├─ bubbles.ts            # uBump 배열 CPU 생명주기
│  │  ├─ renderParams.ts       # toRenderParams(snap) + 지수 스무딩
│  │  ├─ breadShowcase.ts      # GLB 로더(meshopt)+캐시+턴테이블 쇼케이스 그룹
│  │  ├─ effects.ts            # 밥주기·굽기·부활 시퀀스
│  │  └─ input.ts              # poke·wobble·롱프레스(제스처 FSM)
│  ├─ ui/                      # vanilla TS + DOM 오버레이. sim 직접 접근 금지 — store 경유
│  │  ├─ router.ts             # 화면 스택 + Android backButton 계약 (§5)
│  │  ├─ screens/ home.ts recipes.ts bake.ts onboarding.ts
│  │  ├─ components/ modal.ts toast.ts observeCard.ts settingsModal.ts
│  │  ├─ copy.ts               # 전체 한국어 문구 사전 (한 파일 — 전수 감수용)
│  │  └─ format.ts             # 시간·수치 한국어 포맷
│  ├─ audio/sounds.ts          # WebAudio 합성 3종 + 마스터 게인·음소거
│  ├─ platform/                # 부수효과 전담 포트. 웹/네이티브 분기는 전부 여기서 끝
│  │  ├─ clock.ts              # Clock { now(): number } + systemClock / FakeClock
│  │  ├─ storage.ts            # StorageAdapter: localStorage 주 + Preferences 미러
│  │  ├─ notifications.ts      # NotifierPort: LocalNotifications 래퍼 (웹 no-op)
│  │  ├─ lifecycle.ts          # visibilitychange + App pause/resume 통합
│  │  ├─ haptics.ts            # Haptics 래퍼 (웹 no-op)
│  │  ├─ native.ts             # Capacitor 감지·플러그인 lazy import
│  │  └─ ota.ts                # OTA 확인·다운로드·적용(다음 시작에). app.ts가 부팅 시 1회 호출
│  ├─ store/
│  │  ├─ gameStore.ts          # 단일 진실 소스: state·dispatch·tick·subscribe
│  │  └─ persistence.ts        # envelope 직렬화·버전·복구
│  └─ styles/main.css          # 색 토큰·세이프에어리어·Pretendard 번들
├─ tests/                      # curves neglect clock persistence recipes notifyPlan renderParams
├─ public/fonts/               # Pretendard Variable (번들 — CDN 금지)
├─ public/breads/               # 빵 GLB 10종 + thumbs/ 베이크 PNG 썸네일 (런타임 로드 경로)
├─ scripts/                    # bake-thumbs.mjs(썸네일 베이커) · check-budget.mjs(GLB 용량·tri 예산 검사) ·
│                                 ota-release.mjs(OTA 릴리스 패키저 — build→zip→checksum→ota/ 산출물)
├─ android/                    # cap add android 산출물 — 레포 안 (번들 모드라 셸 분리 불필요)
├─ ota/                        # OTA 정적 배포처 산출물(Vercel 배포) — manifest.json·history.json·bundles/*.zip
└─ docs/                       # GDD ARCHITECTURE VISUAL RELEASE QA + design/(원문)
```

**의존 방향(ESLint `no-restricted-imports`로 잠금)**: `sim` ← `store` ← (`ui`, `render`).
`platform`은 `app.ts`가 주입. sim은 아무것도 import하지 않는다.

## 2. 시뮬레이션 코어 계약

```ts
// 전부 순수. Date.now() 절대 호출 금지 — now는 항상 인자.
export function advance(state: SimState, now: number): SimState;
export function applyAction(state: SimState, action: Action, now: number): { state: SimState; events: SimEvent[] };
export function deriveSnapshot(state: SimState, now: number): Snapshot;
export function planNotifications(state: SimState, now: number): NotifyPlan;
export function initialState(now: number): SimState;
export function deriveBriefing(state: SimState, from: number, to: number): BriefingKey[];

export type Action =
  | { type: 'feed'; ratio: FeedRatio }
  | { type: 'setLocation'; to: Location }
  | { type: 'bake'; recipeId: string }          // 빵: 판정만(GDD §6-2, 2026-08-25). 원가는 mass가
                                                 // 아니라 store가 쥔 보관 통에서 나간다 — sim은 모른다
  | { type: 'bakeDiscard'; recipeId: string }   // discard: 쿨다운 갱신만
  | { type: 'split' }                            // 떼어내기: mass를 씨앗 60g까지 줄인다. 통 적립은
                                                 // store가 'split' 이벤트로 한다 (GDD §5·§6-2)
  | { type: 'makeFlake' }                       // 플레이크 말리기: mass −20g, flake 기록 (GDD §5)
  | { type: 'discardStarter' }                  // moldy 전용: 새 개체로 재시작
  | { type: 'restoreFlake' };                   // moldy 전용: 플레이크로 복원, reviveProgress=1 경유
// 젓기·관찰·띄워보기는 액션이 아님 — 상태 무변형(젓기=코스메틱, 관찰·띄워보기=derive 읽기)
```

- **닫힌 함수**: `advance`는 시계 역행 재정박(GDD §3-8)과 60일 클램프만 수행하고 `lastSimulatedAt`을 갱신.
  나머지는 전부 `deriveSnapshot`의 파생 — advance에 적분 루프 없음.
  (예외적으로 acidity만 누적값: advance가 구간별 요율로 갱신 — 구간 경계는 닫힌 식으로 산출, 루프 없음.)
- **액션 순서 불변식**: `dispatch(action)` = `tick(now)` 선행 → `applyAction`. gameStore 파이프라인에 계약으로 박는다.
- **떼기/통 게이트 분리**(2026-08-25, 보관 통 경제 — GDD §6-2): `split`(떼어내기)의 게이트(`SPLIT_MIN_G`·
  마지막 급여 후 유효 6h)는 sim(`actions.ts`)이 진다 — 순수 함수라 전역 상태를 모른다. 반대로 굽기의
  통 잔량 게이트는 store(`gameStore.pantryGate`)가 진다 — `canBakeBread`는 이제 단계만 보고, 원가는
  sim 밖의 전역 `shared.pantry`에서 나간다. "sim은 전역을 모른다"는 같은 원칙이 도감·재료함·경제와도
  동일 — pantry는 그 네 번째 사례일 뿐이다.
- **SimEvent** (`'peaked' | 'becameHungry' | 'wentDormant' | 'recipeUnlocked' | 'stageUp' | 'revived'` …):
  반환값으로만 흘린다 — 상태에 넣지 않음. UI 토스트·연출 트리거용.
- **결정론 테스트**: 닫힌 함수라 "파생값이 저장·tick 시점과 무관"을 검증
  (임의 시점에 advance를 몇 번 끼워 넣어도 같은 now의 Snapshot이 동일).
- **SimState**: `flake: { madeAt: number; maturity: number } | null` 필드 추가 — `flake.madeAt`은 시계 역행
  재정박 대상(GDD §3-8).
- **Phase**: `'active' | 'hungry' | 'sour' | 'dormant' | 'moldy'` — `moldy`는 종착(terminal, GDD §3-4-1).
  moldy 중 허용 액션은 `discardStarter`/`restoreFlake` 뿐, 그 외는 전부 `moldBlocked` 이벤트로 거부하고
  상태 불변.
- **알림**: `planNotifications` 반환 슬롯이 2종에서 **3종**으로 확장(GDD §7) — 신규 슬롯 3(`moldWarn`, 곰팡이 예고).
- **`MAX_CATCHUP_MS`**(constants.ts): 60일 유지. 근거 갱신 — 실온에서는 곰팡이 종착(≤15일)과 산미 포화가
  고정점이라 그 이상은 상태 불변. 곰팡이 판정 자체는 파생이라 이 캡과 무관하며, 캡은 acidity 적분의
  안전벨트일 뿐이다(GDD §3-8).

### 시간 소스

- `Clock { now(): number }` — gameStore.tick만 clock 접근. sim은 Clock조차 모른다.
- 포그라운드 tick: **5초 setInterval** (rAF 아님 — 백그라운드에서 멈추는 rAF에 게임 시간을 태우지 않는다).
- rAF는 렌더 전용, **홈 화면 + visible일 때만** 구동.
- 렌더 `uTime`은 `performance.now()` 기반 — rAF 델타 누적 금지.

## 3. 저장

```ts
// v2 (개정 2026-08-24: 멀티 르방 — 확장기획 §5. v1은 단일 sim + sim 안 label·collection)
interface SaveEnvelope {
  schemaVersion: number;   // 현행 2. sim은 버전을 모른다
  savedAt: number;
  starters: StarterRecord[];        // { id, name|null, ordinal, sim } — 물리+정체성
  activeStarterId: string;          // 항상 starters 안에 있다 (검증이 보증)
  nextStarterOrdinal: number;       // 삭제해도 순번 재사용 안 함
  shared: {                                    // 집(계정) 소유 — 르방 폐기·삭제에도 남는다
    collection: Record<recipeId, CollectionEntry>;
    inventory: Record<IngredientId, number>;   // 재료함(§8-2) — 무버전 추가 키, 부재→{}
    economy: EconomyState;                     // 무료 경제 카운터(§9) — 무버전 추가 키, 부재→전부 0
    pantry: number;                            // 보관 통 총 g(GDD §6-2) — 무버전 추가 키, 부재→0
  };
  settings: { muted: boolean; haptics: boolean; notifyEnabled: boolean };
  flags: { onboarded: boolean; pendingBake: { recipeId: string; grade: string } | null };
}
```

- **sim은 여전히 "르방 1개의 물리"** — 멀티는 전부 store 층. 활성만 advance/dispatch,
  비활성은 닫힌 함수 모델 덕에 방치(전환 시 `advance(now)` 1회로 정산). 백그라운드 시뮬 0.
- **시계 역행**은 store가 전 starter + `shared.collection.firstAt`에 같은 delta로 재정박
  (개별 sim에만 맡기면 비활성 르방이 delta만큼 공짜 휴식을 얻는다).
- 이름은 `StarterRecord.name`(sim 밖) — 폐기(discardStarter)에도 보존된다(§11-2 승인 변경).
  null이면 표시 시점에 "르방이 {ordinal}" 파생 — 저장하지 않는다.
- **무버전 추가 키**: `inventory`·`economy`·`pantry` 셋 다 `schemaVersion`을 올리지 않고 `shared`에
  얹혔다. `migrate()`는 `raw.schemaVersion > SCHEMA_VERSION`이면 무조건 `null`(=새 게임)로 처리한다
  (`persistence.ts` — 미래 모양 저장본은 다운그레이드해서 읽지 않는다) — 그래서 스키마 버전을 올리는
  릴리스마다 "그 버전을 모르는 과거 번들로는 OTA 롤백 금지"가 하나씩 늘어난다(§3 v1→v2가 그 예).
  반대로 버전은 그대로 두고 키만 늘리면, 그 키를 모르는 구버전 코드도 `validateAndClamp`의 "키 부재
  → 기본값(0/{})" 규칙 덕에 나머지를 그대로 읽는다 — 구버전으로의 롤백이 안전하게 남는다. 그래서
  새 누적값·카운터는 최대한 무버전으로 얹고, 버전을 올려야 하는 경우(필드 의미·구조가 바뀌어 구버전이
  오독하는 경우)로 한정한다. RELEASE.md §8의 롤백 표가 이 규칙을 그대로 반영한다.

- **주 = localStorage** `levain:save` (동기 — 부트 대기·깜빡임 0, 액션 직후 동기 저장으로 유실 창 0).
- **미러 = Capacitor Preferences** (네이티브만, 저장 성공 후 fire-and-forget — Android WebView 스토리지
  evict 보험. SharedPreferences는 evict 대상 아님). 웹에서는 no-op.
- 저장 시점 4종: 모든 액션 직후 / `visibilitychange hidden` / `App.pause` / 포그라운드 60초.
  전부 같은 `persistence.save()` 하나.
- **복구 사다리(2계층)**: 주 파싱+범위 가드 → 실패 시 미러 → 실패 시 새 게임 + 담백한 안내.
  가드는 손으로 쓴 타입·범위 검사(라이브러리 불필요). **NaN·범위 밖은 버리지 말고 clamp로 살린다.**
  starter 항목은 단위 관대 — 불량 항목만 폐기, 전 항목이 죽으면 새 게임.
- **마이그레이션**: 파싱 순서는 **migrate(raw) → validateAndClamp(현행)** — 검증은 현행 스키마만
  안다. `MIGRATIONS[v]`는 raw(검증 전) 대상 v→v+1 변환. v1→v2: 단일 sim을 starters[0]으로,
  label→name, sim.collection→shared.collection(+starterId=첫 르방). 픽스처 왕복 테스트
  tests/persistence.test.ts. ⚠️ v2 저장본이 생긴 뒤 v1 번들로 OTA 롤백하면 저장본을 못 읽고
  새 게임으로 덮는다 — **롤백 대상은 반드시 v2 인지 번들**(RELEASE.md §8 주의).
- **기기 이전**: 설정 "기록 내보내기/불러오기" — envelope JSON을 `@capacitor/filesystem` + 공유 시트
  (웹은 파일 다운로드/업로드). `android:allowBackup="true"` 유지 — 재설치 복원은 QA.md에서 실검증.

## 4. 렌더러 계약

```
SimState → deriveSnapshot(state, now) → Snapshot → toRenderParams(snap) → RenderParams → uniforms
   (sim)         (sim, 순수)                          (render, 순수 — vitest 대상)      (rAF 스무딩)
```

- 이 체인이 **유일한 sim→render 이음새**. uniform 목록·값 범위는 VISUAL.md §3이 정본.
- 스무딩: rAF마다 `v += (target − v) × (1 − exp(−dt/τ))`, τ≈1.2s.
- **전환 정책**: 앱 오픈 catch-up 결과는 **즉시 스냅**(몇 시간 치를 애니메이션 재생하지 않는다 —
  "돌아와 보니 이렇게 되어 있었다"가 다마고치 문법). 라이브 중엔 지수 lerp.
- SceneHost: `mount / setParams / start / stop / dispose / enterShowcase(url) / exitShowcase()`.
  컨텍스트 유실 = **전체 재구축**
  (`webglcontextlost` preventDefault→stop, `restored`→dispose→mount→마지막 params 재주입→start.
  씬이 작아 1프레임 미만 — 부분 복구 로직의 버그 표면을 사지 않는다).
- resize: `#stage`에 ResizeObserver. DPR = `min(devicePixelRatio, 2)` 고정.

## 5. UI 계약 — 2탭 4화면

- 탭: **르방 / 레시피**(=도감+띄워보기+굽기 진입). 설정 = 홈 구석 아이콘 → 중앙 모달. 관찰 카드 = 병 탭.
- 화면: home / recipes / bake(스택) / onboarding. 프레임워크 없음 —
  `gameStore.subscribe(snap => screen.update(snap))`로 각 화면이 자기 DOM만 갱신.
- **모달 = 중앙 팝업 고정** (`components/modal.ts` 하나로 강제. 바닥 시트 금지 — 사용자 규칙, 되돌림 방지 주석 필수).
  `footer` 옵션(2026-09-03)은 같은 중앙 팝업에 본문 스크롤 + 바닥 고정 footer를 더한 **시트형**이지 바닥 시트가 아니다.
  **모달 위 모달은 열지 않는다** — 확인이 필요하면 닫은 뒤 `confirmModal`(관찰 카드·빵 시트 선례).
- **획득 연출 = 비차단 레이어** (`components/celebrate.ts`, 2026-09-03): 모달이 아니라 z 45 오버레이(모달 위·토스트 아래).
  호출 계약은 `celebrateIngredients(api, ids)`·`celebrateStageUp(api, stage)` 둘뿐, 열린 빵 계산·병합·퇴장은 내부.
- **시각 원형은 `components/recipeVisuals.ts`**: 카드·상태 줄·시트 머리·칩·형태 행의 DOM 모양. 화면(`screens/recipes.ts`·
  `components/breadSheet.ts`·`exchangeModal.ts`)은 데이터·핸들러만 붙인다 — 클래스 이름을 화면 코드에서 새로 조립하지 말 것.
- **Android backButton 계약**: `@capacitor/app` backButton 리스너 —
  ① 열린 모달 있으면 닫기 ② router depth>0면 back() ③ 루트면 `App.minimizeApp()` (종료 아님 —
  다마고치는 백그라운드 생존이 자연). 연출 중엔 백 = 연출 스킵. 웹은 no-op.
- 세로 고정(`android:screenOrientation="portrait"`), `env(safe-area-inset-top/bottom)`.

## 6. Capacitor 통합 (로컬 번들 셸 — podoal과 반대 구성)

```ts
// capacitor.config.ts
export default {
  appId: 'com.zaballgam.levain',  // 확정: 2026-08-23. Play 등록 후 변경 불가
  appName: '르방이',
  webDir: 'dist',
  // server.url 없음 — 라이브 리로드용 원격 서버는 여전히 없다. 초기 웹 빌드는 APK에 실려 배포되고,
  // 이후 웹 자산만 CapacitorUpdater(OTA)로 무선 교체한다. 아래 OTA 계약 참조.
  plugins: {
    // updateUrl·statsUrl·channelUrl은 빈 문자열 — 기본값이 Capgo 클라우드로 향한다(방침 위반).
    // 업데이트 확인은 ota.ts가 자체 정적 manifest를 GET할 뿐이다.
    CapacitorUpdater: {
      autoUpdate: 'off', updateUrl: '', statsUrl: '', channelUrl: '',
      resetWhenUpdate: true, appReadyTimeout: 10000,
      autoDeleteFailed: true, autoDeletePrevious: true,
    },
  },
};
```

- **OTA(웹 번들 갱신)**: `src/platform/ota.ts`(부팅 시 확인·다운로드·다음 시작에 적용 — `app.ts`가 1회 호출)·
  `scripts/ota-release.mjs`(릴리스 패키저)·`ota/`(정적 배포처 산출물: manifest.json·history.json·bundles/)
  세 곳에만 산다. **sim·store는 OTA의 존재를 모른다** — platform 층 밖으로 새지 않는다(§0 의존 방향과 동일
  원칙). 무엇이 OTA로 되고 안 되는지·릴리스 절차·롤백은 [RELEASE.md §8](RELEASE.md)이 정본.
- `android/`는 레포 안. 릴리스: `npm run build && npx cap sync android` → Gradle.
- **podoal에서 절차만 재사용**: JDK21 Gradle 경로, 에뮬 함정 6종(README·RELEASE.md에 이식),
  `@capacitor/assets --iconBackgroundColor "#E8D9C4"` + 밀도별 스플래시 비트맵 삭제→단색 windowSplashScreen,
  WebView CDP 디버깅. **재사용 안 함**: FCM·push-notifications·google-services.json·AdMob·딥링크·OAuth.
- keystore **신규 `D:\keys\levain`** (podoal 키 재사용 금지). Play App Signing 권장.
- StatusBar `style: Dark`(베이지 위 어두운 아이콘 — 기본 흰 아이콘은 비가시) + edge-to-edge(targetSdk 35) +
  스플래시 단색 #E8D9C4 연속성.
- **LocalNotifications**: `@capacitor/local-notifications` (push 아님 — 혼동 주의). 채널 1개 "르방이 돌보기".
  inexact 알람. 고정 id 슬롯 cancel→schedule (GDD §7). 냉장 슬롯은 `every:'week'` 반복.
  M6 실기기 판정 2건: ① 재부팅 후 예약 생존(안 되면 resume 재예약으로 커버되는지)
  ② manifest merge가 EXACT_ALARM 권한을 끌고 오면 override 제거.
- resume 흐름: `App.resume`/visible → `tick(now)` catch-up → 스냅 반영 → 알림 재계산·재예약.

## 7. 테스트 전략

vitest (`environment: 'node'` — sim에 DOM 불필요), FakeClock으로 시간 완전 제어.

| 파일 | 검증 |
|---|---|
| `curves.test.ts` | 밥→잠복→피크→하강 곡선, 비율·온도별 피크 시각이 notifyPlan과 정합 |
| `neglect.test.ts` | 2주 방치 → 휴면, 전 필드 NaN 0·유계, 부활 의식 완주 → 활발 복귀, maturity 보존 |
| `clock.test.ts` | 역행 → 전 타임스탬프 재정박(상대 간격 보존), 60일 클램프, 저장시점 무관성 |
| `persistence.test.ts` | envelope 왕복, 손상 → clamp 회수 → 미러 폴백 → 새 게임, pendingBake 재노출 |
| `recipes.test.ts` | 단계·mass 경계 해금, 씨앗 60g 보존, 판정 등급 경계, discard 쿨다운 |
| `notifyPlan.test.ts` | 상태별 슬롯, 냉장 주간 전환, 휴면 침묵, revive 분기, 조용시간 클램프 |
| `renderParams.test.ts` | Snapshot→RenderParams 앵커 값(VISUAL §2-3 표), 범위 클램프 |

렌더·UI는 수동 QA(QA.md).

## 8. 마일스톤

plan 파일 §5와 동일 — M-docs → M0(스캐폴드+씬 재구축) → M1(sim, M0과 병렬 가능) → M2(저장) →
M3(상태→시각) → M4(UI) → M5(레시피·굽기·연출·사운드) → M6(Capacitor) → M7(QA·제출물).
위임: [기계적] = Opus 5/Sonnet 5 서브에이전트 + 본 세션 전량 리뷰 / [판단] = 본 세션 직접.
