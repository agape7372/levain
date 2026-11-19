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
│  │  ├─ stageQueue.ts         # 승급 연출 대기열 — 천·복귀 브리핑 뒤로 미룬다 (§5)
│  │  ├─ screens/ home.ts recipes.ts bake.ts onboarding.ts
│  │  ├─ components/ modal.ts toast.ts observeCard.ts settingsModal.ts
│  │  ├─ copy.ts               # 전체 한국어 문구 사전 (한 파일 — 전수 감수용)
│  │  └─ format.ts             # 시간·수치 한국어 포맷
│  ├─ audio/sounds.ts          # WebAudio 합성 9종 + 마스터 게인·음소거 (VISUAL §6)
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
2026-11-12부터 sim에서 `@capacitor/*` import와 인자 없는 `new Date()`도 린트가 막는다(`eslint.config.js`).

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
  | { type: 'bake'; recipeId: string; variantId?: string; houseStage?: number; dough?: DoughQuality }
                                                 // 빵: 판정만(GDD §6-2). 원가는 mass가 아니라 store가 쥔 보관 통에서 나간다 —
                                                 // sim은 모른다. houseStage(집 최고 단계)·dough(이 빵에 골라 쓸 로트의 품질)는
                                                 // store가 doDispatch에서 주입(2026-09-05). 부재 = 활성 르방 자기 상태로 판정
  | { type: 'bakeDiscard'; recipeId: string; variantId?: string; houseStage?: number }   // discard: 쿨다운 갱신만(통 미사용)
  | { type: 'split' }                            // 떼어내기: mass를 씨앗 60g까지 줄인다. 통 적립은
                                                 // store가 'split' 이벤트로 한다 (GDD §5·§6-2)
  | { type: 'makeFlake' }                       // 플레이크 말리기: mass −20g, flake 기록 (GDD §5)
  | { type: 'discardStarter' }                  // moldy 전용: 새 개체로 재시작
  | { type: 'restoreFlake' };                   // moldy 전용: 플레이크로 복원, reviveProgress=1 경유
// 젓기·관찰·띄워보기는 액션이 아님 — 상태 무변형(젓기=코스메틱, 관찰·띄워보기=derive 읽기)
```

- **닫힌 함수**: `advance`는 시계 역행 재정박(GDD §3-8)과 산미 적분만 수행하고 `lastSimulatedAt`을 갱신(catch-up 상한 없음, 2026-11-19).
  `now`가 유한수가 아니면(NaN·Infinity) 상태를 그대로 돌려준다(2026-11-12). store의 tick·dispatch도 같은 가드를 둔다.
  나머지는 전부 `deriveSnapshot`의 파생 — advance에 적분 루프 없음.
  (예외적으로 acidity만 누적값: advance가 구간별 요율로 갱신 — 구간 경계는 닫힌 식으로 산출, 루프 없음.)
- **액션 순서 불변식**: `dispatch(action)` = `tick(now)` 선행 → `applyAction`. gameStore 파이프라인에 계약으로 박는다.
- **떼기/통 게이트 분리**(2026-08-25, 보관 통 경제 — GDD §6-2): `split`(떼어내기)의 게이트(`SPLIT_MIN_G`·
  마지막 급여 후 유효 `splitGateH` = min(6h, 비율 피크 시작). 2026-11-12부터 1:1:1은 4.5h)는 sim(`actions.ts`)이 진다 — 순수 함수라 전역 상태를 모른다. 반대로 굽기의
  통 잔량 게이트는 store(`gameStore.pantryGate`)가 진다 — `canBakeBread`는 이제 단계만 보고, 원가는
  sim 밖의 전역 `shared.pantry`에서 나간다. "sim은 전역을 모른다"는 같은 원칙이 도감·재료함·경제와도
  동일 — pantry는 그 네 번째 사례일 뿐이다.
- **SimEvent** (`'peaked' | 'becameHungry' | 'wentDormant' | 'recipeUnlocked' | 'stageUp' | 'revived'` …):
  반환값으로만 흘린다 — 상태에 넣지 않음. UI 토스트·연출 트리거용.
  `fed`·`bakedDiscard`는 `counted: boolean`을 싣는다. economy(미션)는 `counted`만 센다(2026-11-12, GDD §6-5).
- **store가 내는 stageUp**(2026-11-12): sim의 `stageUp`은 급여로 넘긴 승급만 낸다. store는 집 최고 단계가 오를 때마다
  `houseStageUps`로 빠진 단계를 채운다(tick·dispatch). 부팅 때 정산분은 `InitResult.stageUps`로 넘긴다.
- **dispatch 원자성**(2026-11-12): `doDispatch`는 advanceTo부터 deriveSnapshot까지 try로 감싼다. throw하면 env·snap을 dispatch 전으로 되돌린다.
  `setActiveSim` 다음 `syncStageMax(now)`를 불러 승급 보상이 같은 dispatch에 들어간다.
- **광고 지급 가능 수**: `adDeliveryRemaining()`은 캡 미만 재료가 없으면 0이다. UI는 이 값으로 광고 행을 잠근다.
- **결정론 테스트**: 닫힌 함수라 "파생값이 저장·tick 시점과 무관"을 검증
  (임의 시점에 advance를 몇 번 끼워 넣어도 같은 now의 Snapshot이 동일).
- **SimState**: `flake: { madeAt: number; maturity: number } | null` 필드 추가 — `flake.madeAt`은 시계 역행
  재정박 대상(GDD §3-8).
- **Phase**: `'active' | 'hungry' | 'sour' | 'dormant' | 'moldy'` — `moldy`는 종착(terminal, GDD §3-4-1).
  moldy 중 허용 액션은 `discardStarter`/`restoreFlake` 뿐, 그 외는 전부 `moldBlocked` 이벤트로 거부하고
  상태 불변.
- **알림**: `planNotifications` 반환 슬롯이 2종에서 **3종**으로 확장(GDD §7) — 신규 슬롯 3(`moldWarn`, 곰팡이 예고).
  2026-11-12 기준 슬롯 1~8. 냉장 주간은 전용 `NOTIFY_SLOT_FRIDGE = 8`이다.
- **`MAX_CATCHUP_MS` 삭제**(2026-11-19, 감사 A2-04): 적분이 경계 컷 최대 5개의 O(1) 식이라 상한이 필요 없고,
  60일 상한은 부활+냉장에서 쪼개기 등가를 깼다(GDD §3-8).
- **알림 상한**: `capPerDay`는 `weekly` 슬롯(냉장)도 날짜 집계에 넣는다. `weekly`는 냉장 슬롯 표식일 뿐 반복이 아니다(원샷 예약).

### 시간 소스

- `Clock { now(): number }` — gameStore.tick만 clock 접근. sim은 Clock조차 모른다.
- 포그라운드 tick: **5초 setInterval** (rAF 아님 — 백그라운드에서 멈추는 rAF에 게임 시간을 태우지 않는다).
- rAF는 렌더 전용, **홈 화면 + visible일 때만** 구동.
- 렌더 `uTime`은 `performance.now()` 기반 — rAF 델타 누적 금지. `start()`마다 원점을 다시 잡는다(`shaderT0`, float32 정밀도, 2026-11-12).

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
    pantry: number;                            // 보관 통 총 g(GDD §6-2) — 무버전 추가 키, 부재→0. 2026-09-05부터 Σ pantryLots.g의 **미러**
    pantryLots: PantryLot[];                   // 통 로트 원장 {g, act, acid, flour}[] — 뗀 순서, 상한 12. 굽기는 레시피 best-fit으로 골라 쓴다 (GDD §6-2 개정 2026-09-05).
                                               // 무버전 추가 키. 부재→pantry>0이면 레거시 로트 1개(act 0.8·acid 25·white)로 물질화.
                                               // 적재 시 Σg를 pantry에 맞춘다(부족분 = 레거시 로트를 맨 앞에, 초과분 = 앞에서 잘라냄).
  };
  settings: {                       // 2026-11-12 현행 모양 (persistence.ts SaveSettings)
    muted: boolean; haptics: boolean; notifyEnabled: boolean;
    notifyPeak: boolean; notifySour: boolean; notifyStage: boolean; notifyFirstWeek: boolean;
    quietStartH: number; quietEndH: number;           // 무버전 추가 키
  };
  flags: {
    onboarded: boolean;
    pendingBake: { recipeId: string; grade: string; variantId?: string } | null;
    retapHints: number;             // 쓰지 않음(재탭 힌트 삭제). 옛 저장과 모양을 맞추는 자리
    dev?: boolean;                  // true일 때만 저장. 출시 빌드 개발자 도구 허용
  };
}
```

- **sim은 여전히 "르방 1개의 물리"** — 멀티는 전부 store 층. 활성만 advance/dispatch,
  비활성은 닫힌 함수 모델 덕에 방치(전환 시 `advance(now)` 1회로 정산). 백그라운드 시뮬 0.
- **시계 역행**은 store가 전 starter + `shared.collection.firstAt`에 같은 delta로 재정박
  (개별 sim에만 맡기면 비활성 르방이 delta만큼 공짜 휴식을 얻는다).
- 이름은 `StarterRecord.name`(sim 밖) — 폐기(discardStarter)에도 보존된다(§11-2 승인 변경).
  null이면 표시 시점에 "르방이 {ordinal}" 파생 — 저장하지 않는다.
- **집 기준 굽기 주입**(2026-09-05, GDD §6-2): 해금은 `economy.stageMax`, 등급은 통 로트 품질 — 둘 다 **store가 `doDispatch`에서
  bake/bakeDiscard 액션에 `houseStage`·`dough`로 주입**한다(UI는 넣지 않는다, 넣어도 store가 덮는다). sim은 값 인자로만 받아 순수를
  지키고, 필드 부재 = 자기 상태 판정(후방 호환). `pantryGate`도 같은 houseStage를 받는다 — 어긋나면 활성 르방 기준 'stage' 차단이라고
  믿고 통 검사를 건너뛰어 원가 0 빵이 나온다(회귀 테스트). `gameApi`: `houseStage()`·`pantryQuality()`(통 전체 평균)·`doughFor(recipeId)`(그 빵에 골라 쓸 로트의 품질 — `sim/pantry.ts pickDough`, 순수).
- **무버전 추가 키**: `inventory`·`economy`·`pantry`·`pantryLots`(2026-09-05) 전부 `schemaVersion`을 올리지 않고 `shared`에
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
  전부 같은 `persistence.save()` 하나. 기록 불러오기 중엔 `reloading` 플래그로 hidden 저장을 건너뛴다.
  reload 언로드 때 옛 메모리가 새 기록을 덮던 결함(2026-11-12, T2-01). 불러오기 저장이 실패하면 reload하지 않는다.
- **복구 사다리(2계층)**: 주 파싱+범위 가드 → 실패 시 미러 → 실패 시 새 게임 + 담백한 안내.
  둘 다 읽히면 `savedAt`이 큰 쪽을 읽는다(같으면 주). WebView localStorage는 5초~1분 뒤에야 디스크에 내려가
  밀어 닫은 직후엔 미러가 더 새 판이다(2026-11-18 어뷰징 점검 · 11-19 OTA 1.6.14로 게시). 그래서 `savedAt`은
  시계 시각이 아니라 줄지 않는 저장 도장이다: `persist`가 `max(now, 직전+1)`로 찍고(시계를 되돌려도 줄지 않음 → 재정박
  목록에 넣지 않는다) 기록 불러오기도 지금 기록보다 큰 도장으로 쓴다.
  못 읽은 원문은 `levain:save:broken`(localStorage + 네이티브 Preferences)에 남기고 7초 토스트 「저장된 기록을 읽을 수 없어 새로 시작해요」를 띄운다
  (`loadDetailed` → `{ result, broken }`, `StorageAdapter.keepBroken`, 2026-11-12).
  flags가 객체가 아니거나 `onboarded`가 boolean이 아니면 `onboarded=true`로 읽는다. 온보딩이 기록을 덮지 않게 하려는 것이다.
  가드는 손으로 쓴 타입·범위 검사(라이브러리 불필요). **NaN·범위 밖은 버리지 말고 clamp로 살린다.**
  starter 항목은 단위 관대 — 불량 항목만 폐기, 전 항목이 죽으면 새 게임.
- **마이그레이션**: 파싱 순서는 **migrate(raw) → validateAndClamp(현행)** — 검증은 현행 스키마만
  안다. `MIGRATIONS[v]`는 raw(검증 전) 대상 v→v+1 변환. v1→v2: 단일 sim을 starters[0]으로,
  label→name, sim.collection→shared.collection(+starterId=첫 르방). 픽스처 왕복 테스트
  tests/persistence.test.ts. ⚠️ v2 저장본이 생긴 뒤 v1 번들로 OTA 롤백하면 저장본을 못 읽고
  새 게임으로 덮는다 — **롤백 대상은 반드시 v2 인지 번들**(RELEASE.md §8 주의).
- **기기 이전**: 설정 "기록 내보내기/불러오기" — envelope JSON을 `@capacitor/filesystem` + 공유 시트
  (웹은 파일 다운로드/업로드). `android:allowBackup="true"` 유지 — 재설치 복원은 QA.md에서 실검증.
  백업 규칙(`res/xml/backup_rules.xml`·`data_extraction_rules.xml`)이 OTA 번들 폴더 `versions/`를 뺀다(번들당 약 9.35MB, 2026-11-12).

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
  재구축 뒤 시드·마지막 params·실행 상태(멈춰 있던 씬은 멈춘 채)·쇼케이스 url을 다시 적용한다(2026-11-12, `onContextRestored`).
  이전엔 시드가 기본값 0.37로 돌아갔다. 천 덮개 상태는 아직 잃는다.
- resize: `#stage`에 ResizeObserver. DPR = `fitPixelRatio` = min(devicePixelRatio, 2, √(2.2e6 / (w×h))) (2026-11-12, 버퍼 픽셀 총량 상한).

## 5. UI 계약 — 2탭 4화면

- 탭: **르방 / 레시피**(=도감+띄워보기+굽기 진입). 설정 = 홈 구석 아이콘 → 중앙 모달. 관찰 카드 = 병 탭.
- 화면: home / recipes / bake(스택) / onboarding. 프레임워크 없음 —
  `gameStore.subscribe(snap => screen.update(snap))`로 각 화면이 자기 DOM만 갱신.
- **모달 = 중앙 팝업 고정** (`components/modal.ts` 하나로 강제. 바닥 시트 금지 — 사용자 규칙, 되돌림 방지 주석 필수).
  `footer` 옵션(2026-09-03)은 같은 중앙 팝업에 본문 스크롤 + 바닥 고정 footer를 더한 **시트형**이지 바닥 시트가 아니다.
  **모달 위 모달은 열지 않는다** — 확인이 필요하면 닫은 뒤 `confirmModal`(관찰 카드·빵 시트 선례).
  설정 하위(알림·방해 없는 시간·라이선스)는 설정을 닫고 연다. 닫으면 부모로 돌아온다(`onClose`, 2026-11-12).
  부팅 때 순서는 브리핑 → 곰팡이 → 구운 빵 재노출이다. 복귀 브리핑은 모달이 떠 있으면 건너뛴다.
- **모달 접근성**(2026-11-12): 열면 카드(`tabindex -1`, 포커스 링 없음)가 포커스를 받고, 닫으면 이전 포커스로 돌린다.
  첫 단추에 주지 않는 이유: 부트 모달의 첫 단추가 「보내주고 새로 시작하기」처럼 되돌릴 수 없는 쪽일 수 있다(`d92337f`). 이름은 제목의 `aria-labelledby` 또는 `ariaLabel` 옵션.
  Esc는 맨 위 모달을 닫는다(`closeTopModal`). 열린 동안 뒤는 `inert`. `close()`는 첫머리에 카드를 `pointer-events:none`+`inert`로 막는다. `confirmModal` 확인은 1회만 받는다.
- **획득 연출 = 비차단 레이어** (`components/celebrate.ts`, 2026-09-03): 모달이 아니라 z 45 오버레이(모달 위·토스트 아래).
  호출 계약은 `celebrateIngredients(api, ids)`·`celebrateStageUp(api, stage, prevHouseStage)` 둘뿐, 열린 빵 계산·병합·퇴장은 내부.
  열린 빵 수는 집 최고 단계 기준이다(2026-11-12). 승급 연출 타이밍은 `ui/stageQueue.ts`(`createStageQueue(cheer, isCovered)`)가 맡는다: `offer`(천이 덮였거나 복귀 중이면 쌓고 아니면 바로) · `during`(복귀 catch-up을 감싼다 — 그 안의 승급은 브리핑 뒤로) · `flush`(천이 덮였으면 두고 감) · `drain`(`scene.onClothOpen` — 천을 걷는 순간 비운다).
  복귀 순서(개정 2026-11-19): 천 덮기(`scene.coverCloth`; 쇼케이스 중이면 상태만 두고 안 보이게, 홈으로 나오면 보인다) → `during`으로 catch-up + 브리핑 → 브리핑·곰팡이 모달 닫힘 뒤 `flush` → 천을 걷을 때 `drain`.
- **시각 원형은 `components/recipeVisuals.ts`**: 카드·상태 줄·시트 머리·정보 행(`infoRows`)·선반 타일·칩·구분선·형태 행·결과 카드의
  DOM 모양. 화면(`screens/recipes.ts`·`components/breadSheet.ts`·`exchangeModal.ts`)은 데이터·핸들러만 붙인다 — 클래스 이름을 화면
  코드에서 새로 조립하지 말 것. 아트는 `breadThumb(artId, fallbackId)` 폴백 사다리(변형 PNG → 베이스 PNG+재료 → SVG) 하나만.
- **레시피 탭 = 세그먼트 3개 `[빵 | 선반 | 재료]`**(2026-09-05, GDD §6-3): 재탭 순환 3단. 선반 = 도감 항목 2D 타일 → 결과 카드(중앙 팝업,
  footer `[3D로 보기] [다시 만들기]`). 3D 쇼케이스는 여전히 Screen push이되 결과 카드의 선택지다.
- **Android backButton 계약**: `@capacitor/app` backButton 리스너 —
  ① 열린 모달 있으면 닫기 ② router depth>0면 back() ③ 루트면 `App.minimizeApp()` (종료 아님 —
  다마고치는 백그라운드 생존이 자연). 연출 중엔 백 = 연출 스킵. 획득 연출이 떠 있으면 백이 먼저 닫는다(`dismissCelebrate`, 2026-11-12). 웹은 no-op.
- 현재 탭은 `document.body.dataset.tab`에 둔다. 탭별 토스트 자리 CSS의 기준이다(VISUAL §7-2).
- **부트 실패**: `main.ts`가 `startApp()` reject를 잡아 `#ui-root`에 `copy.app.bootFailed` 한 줄을 띄운다(WebGL 생성 실패 등).
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
  2026-11-12 계약: 부팅은 `initOta({ deferReady: true })`로 시작하고 부팅 끝에 `markOtaReady()`를 부른다. 이 짝이 빠지면 새 번들은 30초 뒤 전부 롤백된다.
  내장 번들 판정은 `APP_VERSION` 기준이다. 실패한 버전은 `levain:ota:bad`에 두고 다시 받지 않는다.
  매니페스트 url이 `${OTA_BASE}/bundles/`로 시작하고 checksum이 64자 hex일 때만 받는다.
  그리고 박힌 공개 키(`otaKey`)로 판 목록 서명(`sig`)을 확인한 것만 받는다(2026-11-18 · 11-19 OTA 1.6.14로 게시, RELEASE.md §8 「판 목록 서명」).
- **원격 빵 자산(「완전 로컬」의 예외, 2026-11-16)**: 묶음 밖 변형 143종의 GLB·썸네일은 같은 정적 호스트 `/assets/`에서 처음 볼 때 받는다.
  `src/platform/remoteAssets.ts`만 안다(sim·store는 모른다). 부팅 때 묶음 안 `remote-assets.json`(키 → 해시)을 읽고, 못 읽으면 전부 로컬.
  GLB는 Cache Storage `levain-assets` + id당 blob URL 하나(세션 동안 revoke 안 함 — 쇼케이스 url 캐시·컨텍스트 복구가 다시 읽는다).
  쇼케이스는 최대 4초 기다리고 넘기면 베이스 빵, 받기는 뒤에서 이어 간다. 썸네일은 `<img>` + WebView HTTP 캐시, 실패하면 베이스 PNG + 재료 배지.
  네트워크 실패는 조용히 삼킨다(ota.ts ③과 같은 태도). 나눔 규칙은 `scripts/lib/families.mjs`, 릴리스는 [RELEASE.md §8](RELEASE.md).
- `android/`는 레포 안. 릴리스: `npm run build && npx cap sync android` → Gradle.
- **podoal에서 절차만 재사용**: JDK21 Gradle 경로, 에뮬 함정 6종(README·RELEASE.md에 이식),
  `@capacitor/assets --iconBackgroundColor "#E8D9C4"` + 밀도별 스플래시 비트맵 삭제→단색 windowSplashScreen,
  WebView CDP 디버깅. **재사용 안 함**: FCM·push-notifications·google-services.json·딥링크·OAuth.
- **AdMob**(보상형 광고, `src/platform/ads.ts`): 초기화 순서 = UMP 동의 확인(`requestConsentInfo` → 필요하면 `showConsentForm`) → `initialize({ maxAdContentRating: General })`.
  `initDone`은 초기화 성공 뒤에 세운다. Play 서비스 ads 버전은 `android/variables.gradle`의 `playServicesAdsVersion = '25.4.0'`로 고정(2026-11-12).
- keystore **신규 `D:\keys\levain`** (podoal 키 재사용 금지). Play App Signing 권장.
- StatusBar `style: Dark`(베이지 위 어두운 아이콘 — 기본 흰 아이콘은 비가시) + edge-to-edge(targetSdk 36) +
  스플래시 단색 #E8D9C4 연속성.
- **LocalNotifications**: `@capacitor/local-notifications` (push 아님 — 혼동 주의). 채널 1개 "르방이 돌보기".
  inexact 알람. 고정 id 슬롯 cancel→schedule (GDD §7). 냉장 슬롯(8)도 `{ at }` 원샷이다(2026-11-12, 이전 `every:'week'`).
  예약 적용(`applyPlan`)은 체인으로 직렬화한다. 동시에 두 번 불려도 순서대로 끝난다.
  M6 실기기 판정 2건: ① 재부팅 후 예약 생존(안 되면 resume 재예약으로 커버되는지)
  ② manifest merge가 EXACT_ALARM 권한을 끌고 오면 override 제거.
- resume 흐름: `App.resume`/visible → `tick(now)` catch-up → 스냅 반영 → 알림 재계산·재예약.

## 7. 테스트 전략

vitest (`environment: 'node'` — sim에 DOM 불필요), FakeClock으로 시간 완전 제어.

| 파일 | 검증 |
|---|---|
| `curves.test.ts` | 밥→잠복→피크→하강 곡선, 비율·온도별 피크 시각이 notifyPlan과 정합 |
| `neglect.test.ts` | 2주 방치 → 휴면, 전 필드 NaN 0·유계, 부활 의식 완주 → 활발 복귀, maturity 보존 |
| `clock.test.ts` | 역행 → 전 타임스탬프 재정박(상대 간격 보존), 60일 초과 점프 포화, 저장시점 무관성 |
| `simAudit1119.test.ts` | 부피 연속(날짜 경계·부활), 브리핑 peaked·hooch 경계, advance 쪼개기 등가, 휴면 경계 activity, 부활 곰팡이 예고, 하루 2건 상한 |
| `persistence.test.ts` | envelope 왕복, 손상 → clamp 회수 → 미러 폴백 → 새 게임, pendingBake 재노출 |
| `recipes.test.ts` | 단계·mass 경계 해금, 씨앗 60g 보존, 판정 등급 경계, discard 쿨다운 |
| `notifyPlan.test.ts` | 상태별 슬롯, 냉장 주간 전환, 휴면 침묵, revive 분기, 조용시간 클램프 |
| `renderParams.test.ts` | Snapshot→RenderParams 앵커 값(VISUAL §2-3 표), 범위 클램프 |

2026-11-12 감사로 더한 테스트: `rulesAudit` · `directorAudit` · `modalA11y` · `modalGuard` · `routerBack` · `otaStage` · `adsInit` · `notifySerial` · `saveFlags` · `render` (전체 34파일 372).

렌더·UI는 수동 QA(QA.md). 화면 캡처·접근성 측정은 `scripts/qa-shots.mjs`(QA.md 「감사 하네스」).

## 8. 마일스톤

plan 파일 §5와 동일 — M-docs → M0(스캐폴드+씬 재구축) → M1(sim, M0과 병렬 가능) → M2(저장) →
M3(상태→시각) → M4(UI) → M5(레시피·굽기·연출·사운드) → M6(Capacitor) → M7(QA·제출물).
위임: [기계적] = Opus 5/Sonnet 5 서브에이전트 + 본 세션 전량 리뷰 / [판단] = 본 세션 직접.
