> 설계 워크플로 원문(2026-08-23). 정본 아님 — 정본은 docs/GDD.md·ARCHITECTURE.md·VISUAL.md(비판 판정 반영본). 모순 시 정본이 이긴다.

# 르방이 아키텍처 설계 — 프로토타입 → 출시 품질

대상: `C:\Users\agape\Desktop\코딩\levain` (현재 index.html + main.js 160줄, three.js CDN).
목표: TypeScript + Vite + Capacitor(Android 우선) 다마고치형 르방 키우기 앱. 백엔드 0, 완전 로컬.

---

## 0. 프로토타입 판정 — 살릴 것 / 버릴 것

**살린다 (그대로 이식):**
- 반죽 셰이더 전체 — 버텍스(혹 4개 가우시안 범프 + sin/cos 저주파 + wobble 전단)와 프래그먼트(같은 범프 중심으로 아날리틱 노멀 재구성 → 램버트+스펙+슬로프 셰이딩). 이 미학이 제품의 얼굴이다. `.glsl` 파일로 분리해 버전관리·확장 지점으로 만든다.
- 직교 탑다운 카메라 구도(`viewH 3.4`, bottom `-1.52`), 라이팅(키 `0xffe2b0` 1.4 + 앰비언트 `0xfff0dc` 0.55), 베이지 팔레트(`#E8D9C4` 배경, 반죽 `0xf4ead4`, 병 `0xc4784a`).
- 포인터 → 평면 레이캐스트 → wobble 감쇠(×0.9) 입력 모델.
- 병 토러스(초기엔 유지, 시각 업그레이드는 M7 옵션).

**버린다:**
- unpkg importmap — 번들 앱은 오프라인이다. CDN은 런타임에 죽은 코드. → npm `three` + Vite 번들.
- `#recipe[style*="block"]` CSS 핵, `?tab=recipe` URL 라우팅, 전역 변수 스크립트 구조.
- `window.resize` 직접 청취 → 스테이지 요소 `ResizeObserver`로 교체(탭바·키보드·세이프에어리어 대응).
- rAF 시계(`THREE.Clock`)를 게임 시간으로 쓰는 구조 — 게임 시간은 wall-clock, rAF는 화장품 전용(확정 결정 1).

---

## 1. 디렉터리·모듈 구조

```
levain/
├─ index.html                  # 캔버스 + UI 루트 div만. 스크립트는 /src/main.ts 하나
├─ package.json
├─ vite.config.ts              # base './', target es2020, glsl ?raw 임포트
├─ tsconfig.json               # strict
├─ vitest.config.ts            # environment: 'node' (sim 테스트에 DOM 불필요)
├─ capacitor.config.ts         # webDir 'dist', server.url 없음 (§6)
├─ public/                     # 파비콘 등 정적 자산
├─ src/
│  ├─ main.ts                  # 부트스트랩: 저장 로드 → catch-up → 루프·UI·렌더 조립
│  ├─ app.ts                   # 오케스트레이터(아래 각 층을 배선하는 유일한 곳)
│  │
│  ├─ sim/                     # ★순수 코어. three/DOM/Capacitor import 0. Date.now() 호출 0
│  │  ├─ types.ts              # SimState·Action·SimEvent·Snapshot 타입
│  │  ├─ constants.ts          # 튜닝 상수 전부 한 곳(밥 주기, 곡선 계수, 임계값)
│  │  ├─ advance.ts            # advance(state, dtMs) — 고정 스텝 적산
│  │  ├─ actions.ts            # applyAction(state, action) — 밥·젓기·온도·수확·부활
│  │  ├─ derive.ts             # 파생값 셀렉터(기분 상태, 부풀기%, 해금 판정) — 상태 비저장
│  │  ├─ recipes.ts            # 레시피 정의 데이터 + 해금 조건(순수 데이터)
│  │  ├─ notifyPlan.ts         # 다음 밥/경고 시각 계산(알림 예약용 순수 함수)
│  │  └─ rng.ts                # 시드 PRNG(mulberry32) — 시드는 state 안
│  │
│  ├─ render/                  # three.js 전용. sim을 모른다 — VisualParams만 받는다
│  │  ├─ SceneHost.ts          # renderer·scene·camera 수명주기, resize, 컨텍스트 유실 복구
│  │  ├─ dough/
│  │  │  ├─ DoughMesh.ts       # 기존 셰이더 이식 + uniform 확장(uRise·uSag·uTint·uBubble)
│  │  │  ├─ dough.vert.glsl
│  │  │  └─ dough.frag.glsl
│  │  ├─ jar.ts                # 병 메시
│  │  ├─ visualMap.ts          # Snapshot → VisualParams 매핑 + 프레임 스무딩(트위닝은 여기)
│  │  └─ input.ts              # 포인터 → 레이캐스트 → wobble
│  │
│  ├─ ui/                      # vanilla TS + DOM 오버레이(§5). sim을 직접 만지지 않고 store 경유
│  │  ├─ router.ts             # 화면 스택(상태 기반, URL 없음)
│  │  ├─ screens/
│  │  │  ├─ home.ts            # 캔버스 위 HUD + 밥주기·젓기·온도 버튼
│  │  │  ├─ recipes.ts         # 해금 레시피 목록
│  │  │  ├─ bake.ts            # 수확→굽기 플로우
│  │  │  ├─ collection.ts      # 구운 빵 기록
│  │  │  ├─ settings.ts        # 알림 시각, 데이터 관리
│  │  │  └─ onboarding.ts      # 첫 실행: 이름 짓기·첫 밥
│  │  ├─ components/
│  │  │  ├─ modal.ts           # ★중앙 팝업 고정(바닥 시트 금지 — 사용자 규칙)
│  │  │  ├─ toast.ts
│  │  │  └─ statusCard.ts
│  │  └─ format.ts             # 한국어 시간·상태 문구("6시간 전에 밥을 먹었어요")
│  │
│  ├─ platform/                # 부수효과 전담. 웹/네이티브 분기는 전부 이 층에서
│  │  ├─ clock.ts              # Clock 인터페이스 + SystemClock/FakeClock
│  │  ├─ storage.ts            # StorageAdapter: localStorage 주 + Preferences 미러
│  │  ├─ notifications.ts      # NotifierPort: LocalNotifications 래퍼(웹은 no-op)
│  │  ├─ lifecycle.ts          # visibilitychange + Capacitor App pause/resume 통합 이벤트
│  │  └─ native.ts             # Capacitor 감지, 플러그인 lazy import
│  │
│  ├─ store/
│  │  ├─ gameStore.ts          # 단일 진실 소스: state 보관·dispatch·tick·subscribe
│  │  └─ persistence.ts        # envelope 직렬화, 스키마 버전, migrate 체인, 복구 사다리
│  │
│  └─ styles/main.css          # 베이지 토큰, 세이프에어리어, 폰트 스택
│
├─ tests/
│  ├─ additivity.test.ts       # advance 가산성 프로퍼티
│  ├─ curves.test.ts           # 밥→피크→수그러듦 곡선
│  ├─ neglect.test.ts          # 2주 방치 → 휴면, NaN 0, 값 유계
│  ├─ clock.test.ts            # 시계 역행·대점프 방어
│  ├─ migration.test.ts        # 버전별 픽스처 → 최신 스키마
│  └─ notifyPlan.test.ts       # 알림 시각 계산
│
├─ android/                    # `cap add android` 산출물 — 레포 안에 둔다(§6)
└─ docs/
   ├─ SIM_DESIGN.md            # 곡선·상수 튜닝 근거(판단 기록)
   └─ RELEASE.md               # 빌드·서명·에뮬 절차(podoal README에서 이식)
```

**의존 방향(강제 규칙):** `sim` ← `store` ← (`ui`, `render`) / `platform`은 `app.ts`가 주입.
sim은 아무것도 import하지 않는다(three·DOM·Capacitor·Date 전부 금지). ESLint `no-restricted-imports`로 잠근다.

**각 모듈 공개 인터페이스(요약):**

| 모듈 | 공개 API | 책임 |
|---|---|---|
| `sim` | `advance`, `applyAction`, `deriveSnapshot`, `planNotifications`, `initialState(seed, now)` | 게임 규칙 전부. 결정론·불변 |
| `store/gameStore` | `getState`, `getSnapshot`, `dispatch(action)`, `tick(now)`, `subscribe(fn)` | 상태 보관, sim 호출, 저장 트리거 |
| `store/persistence` | `save(state)`, `load(): LoadResult`, `migrate(envelope)` | 직렬화·버전·복구 |
| `render/SceneHost` | `mount(canvas)`, `setParams(v: VisualParams)`, `start()`, `stop()`, `dispose()` | GL 수명주기 |
| `render/visualMap` | `toVisualParams(snap): VisualParams`, `smooth(prev, target, dt)` | 상태→시각 번역+스무딩 |
| `platform/*` | `Clock`, `StorageAdapter`, `NotifierPort`, `onLifecycle(cb)` | 부수효과 포트 |
| `ui/router` | `show(screen)`, `back()` | 화면 전환 |

---

## 2. 시뮬레이션 코어 계약

### 상태 타입

```ts
// sim/types.ts
export interface SimState {
  // 시간 회계
  lastSimAt: number;      // 마지막으로 시뮬된 wall-clock (epoch ms)
  remainderMs: number;    // 고정 스텝(60s) 미만 잔여 — 가산성의 핵심
  rngSeed: number;        // 결정론 랜덤(기포 배치 등 시뮬 내 확률 이벤트)

  // 생리 변수 (전부 0..1 정규화, 매 스텝 clamp)
  fullness: number;       // 배부름 — 밥 주면 1, 온도별 속도로 감소
  activity: number;       // 효모 활력 — 규칙적으로 먹이면 상승, 방치·저온이면 하강
  rise: number;           // 현재 부풀기 0..1 — 밥 직후 상승→피크→수그러듦 곡선
  sourness: number;       // 시큼함 — 배고픈 시간 누적으로 상승, 밥으로 서서히 희석
  temperature: 'cold' | 'room' | 'warm';  // 사용자가 정하는 보관 위치(냉장/실온/따뜻한 곳)

  // 진행
  maturityMs: number;     // 성숙도 — activity가 임계 이상인 시간의 누적(레시피 해금 축)
  dormant: boolean;       // 휴면(장기 방치) — 죽음 아님, 부활 의식으로 복귀
  reviveStep: number;     // 부활 의식 진행 단계(0=비활성)

  // 기록
  name: string;
  createdAt: number;
  feedCount: number;
  bakes: BakeRecord[];    // { recipeId, bakedAt, quality } — 컬렉션
}

export type Action =
  | { type: 'feed'; at: number }                    // 밥(물+밀가루)
  | { type: 'stir'; at: number }                    // 젓기(소량 활력, 쿨다운)
  | { type: 'setTemperature'; at: number; to: SimState['temperature'] }
  | { type: 'harvest'; at: number; recipeId: string }  // 떼어 굽기
  | { type: 'reviveStep'; at: number }              // 부활 의식 1단계 진행
  | { type: 'rename'; at: number; name: string };
```

### 핵심 함수 시그니처

```ts
// 순수. 인자 불변, 새 상태 반환. Date.now() 절대 호출 금지 — now는 항상 밖에서 주입
export function advance(state: SimState, dtMs: number): SimState;
export function applyAction(state: SimState, action: Action): { state: SimState; events: SimEvent[] };
export function deriveSnapshot(state: SimState): Snapshot;   // UI·렌더용 읽기 전용 뷰
export function planNotifications(state: SimState): NotifyPlan; // { nextFeedAt, hungryAt, dormantWarnAt }
export function initialState(seed: number, now: number): SimState;
```

`SimEvent`(액션·advance가 방출: `'peaked' | 'becameHungry' | 'wentDormant' | 'recipeUnlocked' | ...`)는
UI 토스트·연출 트리거용. 상태에 넣지 않고 반환값으로만 흘린다.

### 결정론 보장 (테스트 가능성의 뿌리)

1. **고정 스텝 적산**: `STEP_MS = 60_000`. `advance`는 `(remainderMs + dtMs)`를 60초 스텝으로 양자화해 스텝 함수를 반복 적용하고, 나머지를 `remainderMs`에 저장한다.
2. **가산성 계약(명문화)**: 모든 `a, b ≥ 0`에 대해
   `advance(s, a + b) ≡ advance(advance(s, a), b)`.
   remainder 저장이 이를 정확히 성립시킨다. 이 성질이 vitest 프로퍼티 테스트 1번이고, "앱을 언제 껐다 켜도 결과가 같다"는 제품 보증 그 자체다.
3. **랜덤은 시드 PRNG만**: `rng.ts`(mulberry32). 시드는 state 안에 살고 스텝마다 전진. `Math.random` 금지(ESLint로 잠금).
4. **2주 방치 = 스텝 약 2만 회** — 스텝 함수는 곱셈 몇 개라 1ms급. 상한(§ 시계 방어)으로 유계.

### 시간 소스 주입 — 시계 조작 방어

```ts
// platform/clock.ts
export interface Clock { now(): number }        // epoch ms
export const systemClock: Clock = { now: () => Date.now() };
// 테스트: FakeClock { now() { return this.t } }
```

- sim은 Clock조차 모른다. **오케스트레이터(gameStore.tick)**만 clock을 받아 `dt`를 계산해 넘긴다:
  ```ts
  const dt = clamp(clock.now() - state.lastSimAt, 0, MAX_CATCHUP_MS); // MAX = 90일
  ```
- **시계 역행**(사용자가 기기 시계를 과거로): `dt < 0 → 0` — 크래시 없음, 페널티 없음, `lastSimAt`만 now로 갱신. 코지 톤과 정합(치터 처벌 안 함 — 어차피 로컬 싱글).
- **시계 대점프**(미래로): `MAX_CATCHUP_MS = 90일` 상한. 그 이상은 어차피 휴면 수렴 상태라 시뮬 결과가 같다. 루프 폭주도 막는다.
- 포그라운드 tick 주기: 5초 setInterval(rAF 아님 — 백그라운드에서 멈추는 rAF에 게임 시간을 태우지 않는다는 확정 결정 1). rAF는 렌더 전용.
- **액션 순서 불변식**: `dispatch(action)`은 반드시 `tick(now)`(catch-up)를 먼저 수행한 뒤 `applyAction`을 적용한다 — 같은 시각의 같은 액션이 마지막 tick 시점에 따라 다른 상태 위에 떨어지면 결정론이 조용히 깨진다. gameStore 파이프라인에 계약으로 박는다.

### rAF/월클럭 역할 분리 (규칙)

| 시간축 | 담당 | 예 |
|---|---|---|
| wall-clock (`Clock`) | sim | 배부름 감소, 부풀기 곡선, 휴면, 성숙도 |
| rAF `uTime` | render | 숨쉬기, wobble 감쇠, 기포 흔들림, 스무딩 |

sim 변수는 느리게(분 단위) 변하고, 렌더는 그 목표값을 프레임마다 지수 스무딩으로 쫓아간다. 트위닝·이징은 전부 render 책임 — sim에 애니메이션 개념을 넣지 않는다.

---

## 3. 저장 설계

### 포맷 — envelope + 스키마 버전

```ts
interface SaveEnvelope {
  schemaVersion: number;   // 마이그레이션 축 (SimState 밖 — sim은 버전을 모른다)
  savedAt: number;
  state: SimState;
}
```

키: `levain:save`(주), `levain:save:prev`(last-known-good 1세대 전).

### 저장 시점

- **모든 액션 직후** (dispatch 파이프라인 끝에서 동기 저장 — localStorage는 동기라 유실 창 0)
- **`visibilitychange → hidden`** (웹·웹뷰 공통)
- **Capacitor `App.pause`** (네이티브 — visibilitychange가 씹히는 케이스 백스톱)
- **포그라운드 60초마다** (tick 경과 반영 — 강제종료 대비)

셋 다 같은 `persistence.save()` 하나를 부른다(경로 단일화). 쓰기 순서: 현재 주 슬롯이 파싱 가능하면 → `prev`로 복사 → 주 슬롯에 새 값. 손상된 값이 백업을 덮는 일이 없다.

### localStorage 주 + Capacitor Preferences 미러 — 선택과 이유

- **주 = localStorage**: 동기 읽기라 부트 시 비동기 대기·깜빡임 없음. 웹 빌드와 코드 동일.
- **미러 = Capacitor Preferences**(네이티브에서만, 저장 성공 후 fire-and-forget 비동기): Android WebView의 로컬 스토리지는 드물게 **저장소 압박 시 OS가 비울 수 있다**. Preferences는 SharedPreferences 기반이라 evict 대상이 아니다 — 실질 보험. 웹에서는 어댑터가 no-op.
- 인터페이스는 `StorageAdapter` 하나로 추상화 — iOS로 갈 때도 이 층만 재검증하면 된다.

### 손상 데이터 복구 — 사다리

```
load(): 주 슬롯 파싱·검증(스키마 가드) 성공 → migrate → 사용
  실패 ↓
prev 슬롯 → 성공 시 사용 + 조용히 주 슬롯 복원
  실패 ↓
Preferences 미러 → 성공 시 사용
  실패 ↓
새 게임 + 담백한 안내 모달("저장된 기록을 읽을 수 없어 새로 시작해요")
```

검증은 필드 타입·범위 가드 함수(런타임 스키마 라이브러리 불필요 — 필드 20개, 손으로 충분). NaN·범위 밖 숫자는 **버리지 말고 clamp로 살린다**(저장 유실 0 원칙 — 반쯤 깨진 저장도 최대한 회수).

### 마이그레이션

```ts
const migrations: Record<number, (old: any) => any> = {
  1: (v0) => ({ ...v0, sourness: 0 }),   // 예: v1에서 시큼함 추가
  // schemaVersion n-1 → n 순차 체인
};
```
- 버전별 픽스처 JSON을 `tests/fixtures/`에 얼려 두고 `migration.test.ts`가 전 체인을 최신까지 돌린다.
- v1 출시 전이라도 스캐폴드는 M2에서 만든다 — 출시 후 첫 스키마 변경 때 넣으면 늦다.

---

## 4. 렌더러 구조

### 상태 주입 — VisualParams 단방향 파이프

```
SimState → deriveSnapshot() → visualMap.toVisualParams() → [프레임 스무딩] → uniforms/scale
   (sim)        (sim)               (render — 번역표)          (render — rAF)
```

```ts
interface VisualParams {
  riseScale: number;   // 부풀기 → 전체 스케일 + 돔 높이 (rise 0..1 → 0.85..1.25)
  sag: number;         // 배고픔·꺼짐 → 윗면 함몰 (uSag)
  tint: [r, g, b];     // 건강 크림색 ↔ 시큼 회백 ↔ 휴면 회갈 보간 — 베이지 팔레트 안에서만
  bubbleAmount: number;// activity → 기포 개수·크기 (uBubble)
  breatheSpeed: number;// activity → 숨쉬기 주기(활발할수록 빠르고 얕게)
  breatheDepth: number;
}
```

- `visualMap`이 유일한 번역표다. sim 필드명이 렌더에 새지 않고, 렌더 상수 튜닝이 sim을 건드리지 않는다.
- 스무딩: rAF마다 `current += (target - current) * (1 - exp(-dt/τ))` (τ ≈ 0.6s). 밥 준 순간 부풀기가 뚝 바뀌어도 화면은 유기적으로 차오른다.

### 기존 셰이더 확장 (미학 보존이 최우선)

- 버텍스: 현행 범프 4개·sin/cos 노이즈·wobble **그대로**. 추가 uniform:
  - `uRise` — `position.y` 성분에 돔 프로파일 가산(스케일과 병행, 과하면 스케일만)
  - `uSag` — 중심부 함몰(범프의 음수 버전 1개, 배고플 때)
- 프래그먼트: 현행 아날리틱 노멀 재구성 **그대로**. 추가:
  - `uTint` — `uColor` 대체가 아니라 곱 보간(팔레트 이탈 방지)
  - `uBubble` + `uSeedTime` — 기포는 **프래그먼트에서 시드 기반 이동 범프 6~10개**로 표현(작은 원형 하이라이트가 천천히 떠올라 커지다 사라짐). 지오메트리 추가·파티클 시스템 없이 현행 기법(가우시안 범프)의 연장이라 미학이 흔들리지 않고 드로콜 증가 0.
- 셰이더는 `.glsl` 파일 + Vite `?raw` 임포트(플러그인 불필요).

### 씬 수명주기 (SceneHost)

- `mount(canvas)` — renderer·scene·camera·mesh 구축. **`setPixelRatio(min(devicePixelRatio, 2))` 상한 유지**(프로토타입 값 계승 — 고DPI 폰 발열·배터리).
- `start()/stop()` — rAF 루프 시작/정지. **르방 화면이 아닐 때·hidden일 때 stop**(레시피 목록 보는 동안 GPU를 태우지 않는다).
- resize: `#stage`에 `ResizeObserver`. 프로토타입의 `viewH 3.4 / bottom -1.52` 구도 공식 계승.
- `dispose()` — geometry·material·renderer 해제(화면 전환에서 dispose하지 않고 stop만 — dispose는 앱 종료 시).

### WebGL 컨텍스트 유실 복구

- `canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.stop(); })`
- `'webglcontextrestored'` → **SceneHost 전체 재구축이 복구 전략**(dispose → mount → 마지막 VisualParams 재주입 → start). 씬이 메시 2개라 재구축이 1프레임 미만 — 부분 복구 로직의 버그 표면을 사지 않는다.
- 게임 상태는 sim/store에 있으므로 렌더 재구축으로 잃는 것이 없다(분리 구조의 배당).

---

## 5. UI 구조

### 프레임워크 없이 vanilla TS + DOM — 근거

1. 화면 6개(홈/레시피/굽기/컬렉션/설정/온보딩), 상태 원천이 `gameStore` 하나 — diff 렌더링이 이길 복잡도가 아니다.
2. 주인공은 three.js 캔버스이고 UI는 그 위 오버레이 — 프레임워크가 캔버스에 주는 것이 없다.
3. 번들 최소·의존성 0이 오프라인 네이티브 앱과 정합. WebView 기동도 빠르다.
4. 구독 모델은 `gameStore.subscribe(snapshot => screen.update(snapshot))` — 각 화면이 자기 DOM만 갱신. 이것으로 충분하다.

### 화면 목록

| 화면 | 내용 | 비고 |
|---|---|---|
| **온보딩** | 첫 실행 1회: 병에 첫 반죽 → 이름 짓기 → 첫 밥 주기 튜토리얼 | 완료 플래그는 저장에 |
| **홈(르방)** | 캔버스 전면 + 상단 상태 문구("6시간 전에 밥을 먹었어요") + 하단 액션 바(밥·젓기·온도) | 캔버스 rAF는 이 화면에서만 |
| **레시피** | 성숙도로 해금되는 카드 목록. 잠긴 카드는 해금 조건 표시 | 빈 껍데기였던 탭을 실콘텐츠로 |
| **굽기** | 레시피 선택 → 반죽 떼기(수확) 연출 → 결과 카드 | `harvest` 액션. 떼면 rise 감소 |
| **컬렉션** | 구운 빵 기록(`bakes`) 그리드 | |
| **설정** | 알림 시각·온오프, 이름 변경, 데이터 초기화(2단 확인) | 시스템어 금지 — "무슨 일+행동"만 |

- 하단 탭: 르방 / 레시피 / 컬렉션 / 설정(4탭). 굽기는 레시피에서 진입하는 스택 화면.
- **모달은 전부 중앙 팝업**(`ui/components/modal.ts` 하나로 강제, 바닥 시트 금지 — 사용자 규칙). 되돌림 방지 주석을 컴포넌트에 남긴다.
- 문구는 담백한 한국어("밥 주기", "따뜻한 곳으로 옮기기"). 내부 용어(sim, catch-up, 스키마)는 UI에 절대 노출 금지.
- 세로 고정(`android:screenOrientation="portrait"`), 세이프에어리어 `env(safe-area-inset-*)`.

---

## 6. Capacitor 통합

### 프로젝트 배치 — podoal과 반대 구성 (핵심 차이)

podoal 셸(`D:\podoal-shell-spike`)은 **원격 URL 셸**이다: `server.url → vercel`, `www/`는 자리표시자, 웹 배포=앱 갱신. **르방이는 정반대**: 백엔드 0·완전 로컬이므로 **웹 번들을 앱에 싣는다**.

- `android/`는 **levain 레포 안**에 둔다(별도 셸 레포 불필요 — podoal이 셸을 분리한 이유는 원격 URL 모드였기 때문이고, 번들 모드에선 분리가 동기화 비용만 낳는다).
- `capacitor.config.ts`:
  ```ts
  export default {
    appId: 'com.levain.app',        // 확정 전 자리값 — Play 등록 전 1회만 결정 가능, 사용자 확인 필요
    appName: '르방이',
    webDir: 'dist',
    // server.url 없음 — 번들 모드. cleartext 불필요
  };
  ```
- 릴리스 절차: `npm run build && npx cap sync android` → Gradle.

### podoal 경험에서 재사용하는 것 (코드가 아니라 절차)

| 재사용 | 출처 | 르방이 적용 |
|---|---|---|
| Capacitor 8 빌드체인 | shell-spike README | `JAVA_HOME=D:/android-toolchain/jdk21 ./gradlew assembleDebug`, `local.properties`는 기기별 |
| 에뮬 기동·함정 6가지 | README §에뮬레이터 | AVD_HOME 지정, `-no-window -feature -Vulkan`, MSYS 경로 변환, 네트워크 사망 시 `-wipe-data`, 로그는 파일로 |
| `@capacitor/assets` | README §아이콘 | `--iconBackgroundColor "#E8D9C4"` — 생성된 밀도별 스플래시 비트맵은 삭제하고 단색 `windowSplashScreen*`으로 대체(같은 정리 절차) |
| 서명 AAB·Play 내부테스트 | podoal 메모리 | **keystore는 신규**(`D:\keys\levain` — podoal 키 재사용 금지). Play App Signing 권장 |
| WebView CDP 디버깅 | README | `adb forward tcp:9222 localabstract:webview_devtools_remote_$(pidof)` |

**재사용하지 않는 것**: FCM/push-notifications(르방이는 서버 알림 금지 — 로컬 알림만), google-services.json(Firebase 불필요 — 크래시 게이트 자체가 없어짐), UA 마커·딥링크·OAuth 핸드오프(백엔드 0), AdMob(수익화 v1 없음).

**CI**: GitHub Actions는 결제 문제로 꺼져 있음(2026-08-23 메모리) — **검증·빌드는 전부 로컬**(vitest + `vite build` + 로컬 Gradle). CI green을 기대하는 절차를 설계에 넣지 않는다.

### Local Notifications 전략

- 플러그인: `@capacitor/local-notifications` (podoal의 `push-notifications`와 다르다 — 혼동 주의).
- **권한**: Android 13+ `POST_NOTIFICATIONS` 런타임 권한 — 온보딩 말미(첫 밥 준 직후, 가치를 본 뒤)에 요청. 거부해도 게임 전체 정상 동작(알림은 부가).
- **정밀도**: inexact 알람으로 충분(`SCHEDULE_EXACT_ALARM` 권한 회피 — 밥 리마인더에 분 단위 정밀도 불필요, Play 심사 마찰도 줄인다).
- **예약 전략 — 전량 취소 후 재계산**:
  1. `sim/notifyPlan.ts`(순수)가 상태로부터 시각 목록 산출: 다음 밥 시간, 배고픔 경계, 휴면 임박 — 최대 3건.
  2. `platform/notifications.ts`가 **고정 id 슬롯**(1=밥, 2=배고픔, 3=휴면)으로 `cancel` → `schedule`. 슬롯 고정이라 중복·누수 없음.
  3. 트리거: 모든 액션 직후 + `App.pause` 시. (상태가 바뀌면 다음 밥 시간이 바뀐다.)
- **resume 흐름**: `App.resume`/`visibilitychange visible` → `gameStore.tick(now)`(catch-up) → 스냅샷 반영 → 알림 재계산·재예약. 지나간 알림은 OS가 이미 소비했거나 취소된다.
- 알림 id·예약 상태는 **sim 상태에 넣지 않는다** — 플랫폼 소관. sim은 시각 계산만.
- 채널 1개("르방이 돌보기"), 문구는 담백하게("르방이가 배고파해요").
- 웹 빌드: `NotifierPort` no-op 구현 — 코드 분기는 platform 층에서 끝난다(플랫폼 중립 원칙, iOS 확장 대비).
- **M6에서 검증할 항목 2건**(지금 단정하지 않는다): (a) 기기 재부팅 후 예약 알림 생존 여부 — 플러그인이 reboot 재예약을 안 해주면 `App.resume` 재예약만으로 커버되는지 실기기 판정, (b) 플러그인 manifest merge가 `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`을 끌고 오는지 — 오면 manifest override로 제거(이 설계는 exact 알람이 불필요하고, 해당 권한은 Play 심사 마찰만 낳는다).

---

## 7. 테스트 전략

### vitest — sim 코어 (environment: node, DOM 불필요)

| 테스트 | 검증 내용 |
|---|---|
| `additivity` | 프로퍼티: 랜덤 dt를 임의 분할해도 `advance(s, a+b) ≡ advance(advance(s,a), b)` (시드 고정 100케이스) |
| `curves` | 밥 직후 rise 상승 → 온도별 피크 도달 시각 → 수그러듦. 피크 시각이 `notifyPlan`과 정합 |
| `neglect` | 2주(20,160스텝) 방치: 휴면 도달, 전 필드 NaN 없음·범위 내, 부활 의식 완주 시 activity 회복 |
| `clock` | dt 음수 → no-op(크래시 0), 90일 초과 → MAX_CATCHUP clamp, remainder 보존 |
| `migration` | 버전별 픽스처 JSON → 최신 스키마 도달, 손상 JSON → 복구 사다리 단계별 폴백 |
| `notifyPlan` | 상태별 다음 밥/경고 시각. 휴면 중엔 반복 알림 없음(스팸 금지) |
| `recipes` | 성숙도 경계값에서 해금 판정, harvest 시 rise 차감·bake 기록 |

FakeClock으로 시간 완전 제어. 렌더·UI는 vitest 대상에서 제외(수동 QA로).

### 수동 QA 체크리스트 (릴리스 게이트)

- [ ] 강제종료 → 6시간 뒤 재실행: 상태가 경과 시간만큼 진행돼 있고 문구 정합
- [ ] 기기 시계를 하루 뒤로/앞으로 → 크래시 없음, 뒤로는 무변화·앞으로는 catch-up
- [ ] 밥 직후 알림 예약 확인(`adb shell dumpsys notification` 또는 실기기 대기) → 시각에 수신 → 탭하면 앱 홈
- [ ] 알림 권한 거부 상태에서 전 기능 정상
- [ ] 기기 재부팅 → 예약 알림 생존(또는 resume 재예약으로 커버) 확인
- [ ] 저장 손상 주입(주 슬롯에 쓰레기 문자열) → prev 폴백, 둘 다 손상 → 미러, 셋 다 → 새 게임 안내
- [ ] 레시피 탭↔홈 왕복 시 rAF 정지/재개(개발자 도구 GPU 프로파일)
- [ ] `chrome://webview` CDP로 컨텍스트 유실 강제(`loseContext` 익스텐션) → 자동 복구
- [ ] 저사양 프로필(에뮬 swiftshader)에서 60fps 근접·발열 체크, pixelRatio 상한 동작
- [ ] 세로 고정·세이프에어리어(펀치홀·제스처 바)·키보드(이름 입력) 겹침 없음
- [ ] 온보딩 완주 → 재실행 시 온보딩 스킵
- [ ] 모든 모달이 중앙 팝업인지, 시스템어 노출 문구 0건인지 전수 확인

---

## 8. 구현 순서 — 마일스톤

각 마일스톤은 그 시점에 실행해 눈으로 확인 가능한 단위다. 태그: **[기계적]** = 하위 모델 위임 후보(Sonnet 5 이상 — haiku 금지, 사용자 규칙), **[판단]** = 본 세션 직접.

### M0 — 스캐폴드 + 프로토타입 무손실 이식 (확인: 웹에서 현 프로토타입과 픽셀 동급)
- Vite+TS+vitest 부트, 디렉터리 골격, ESLint(sim import 잠금·Math.random 금지) **[기계적]**
- three npm 전환, 셰이더 `.glsl` 분리, SceneHost·input 이식(ResizeObserver 포함) **[기계적]**
- 이식 후 시각 동일성 비교(스크린샷 대조) **[판단]**

### M1 — sim 코어 (확인: vitest green, 데모 스크립트로 곡선 출력)
- 타입·상수·`advance`·`applyAction`·rng·`initialState` — 곡선 설계·상수 1차값 **[판단]**
- additivity·curves·neglect·clock 테스트 작성 **[기계적]** (시나리오 명세는 §7 표 그대로)
- `docs/SIM_DESIGN.md`에 곡선 근거 기록 **[판단]**

### M2 — 저장 + 수명주기 (확인: 새로고침·탭 숨김·강제종료 후 상태 보존, catch-up 동작)
- persistence(envelope·복구 사다리·마이그레이션 스캐폴드)·StorageAdapter **[기계적]**
- gameStore(tick·dispatch·subscribe·저장 트리거)·lifecycle 통합 **[기계적]**
- migration 픽스처 테스트 **[기계적]**

### M3 — 상태→시각 연결 (확인: 밥 주면 차오르고, 방치하면 꺼지는 화면)
- visualMap + 스무딩, uniform 확장(uRise·uSag·uTint·uBubble), 기포 프래그먼트 구현 **[판단]** (미학 직결)
- rAF start/stop 게이팅 **[기계적]**

### M4 — UI 루프 (확인: 온보딩→홈에서 풀 돌봄 루프)
- router·modal(중앙 팝업)·toast·statusCard 컴포넌트 **[기계적]**
- 홈 HUD·액션 바·온보딩·설정 화면 + 한국어 문구 **[판단]** (사용자 대면 문구 규칙)

### M5 — 레시피·굽기·컬렉션 (확인: 해금→수확→기록 루프 완주)
- recipes 데이터·해금 조건·굽기 품질 판정 **[판단]**
- 레시피/굽기/컬렉션 화면 **[기계적]** (디자인 토큰·컴포넌트는 M4 산출물 재사용)

### M6 — Capacitor (확인: 에뮬에서 APK 기동, 알림 수신·탭, pause/resume catch-up)
- `cap add android`, config, 세로 고정, 아이콘·스플래시(@capacitor/assets + 비트맵 정리) **[기계적]** (절차는 §6 표)
- notifications 포트 + notifyPlan 연결 + 권한 플로우 **[기계적]** (전략은 §6에 확정)
- appId 확정(사용자 결정 필요)·신규 keystore 생성·서명 AAB·Play 내부테스트 등록 **[판단]** (되돌릴 수 없는 결정 포함)

### M7 — 폴리시·QA (확인: §7 수동 체크리스트 전항 통과)
- 컨텍스트 유실 복구 검증, 성능 프로파일, 문구 전수 감수, 병 시각 업그레이드(옵션) **[판단]**
- 체크리스트 실행·기록 **[기계적]** (판정 뒤집힘 가능 항목은 본 세션 재확인)

의존: M0→M1→M2→M3→M4→M5→M6→M7 순이 기본이되, M1(sim)은 M0와 병렬 가능(렌더와 무의존 — 분리 구조의 첫 배당).

---

## 9. 리스크·미결정 (착수 전 확인 1건)

- **appId** (`com.levain.app`은 자리값): Play 등록 후 변경 불가. M6 전까지만 확정하면 됨 — 사용자 결정.
- 곡선 상수(밥 주기 목표 12시간? 휴면 진입 5일?)는 M1에서 1차값을 넣고 `constants.ts` 한 곳에서 튜닝 — 설계를 막지 않는다.
- iOS는 설계상 이미 대비됨(platform 포트·번들 모드·podoal의 Codemagic 경험) — v1 범위 밖.