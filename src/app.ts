// 오케스트레이터 — 층을 배선하는 유일한 곳 (ARCHITECTURE §1).
// sim ← store ← (ui, render) / platform은 여기서 주입.
import { SceneHost } from './render/SceneHost';
import { toRenderParams } from './render/renderParams';
import { initGameStore } from './store/gameStore';
import { validateAndClamp, migrate, save } from './store/persistence';
import { createStorage } from './platform/storage';
import { systemClock } from './platform/clock';
import { createNotifier } from './platform/notifications';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { onLifecycle } from './platform/lifecycle';
import { haptic, setHapticsEnabled } from './platform/haptics';
import { isNative } from './platform/native';
import { initOta, markOtaReady } from './platform/ota';
import { glbUrl, loadRemoteAssets } from './platform/remoteAssets';
import { exportEnvelope, pickImportFile } from './platform/saveTransfer';
import {
  setMuted, sfxBubble, sfxFed, sfxRevived, sfxUnlock, suspendAudio, resumeAudio, unlockAudio,
  sfxStirStart, sfxStirUpdate, sfxStirEnd, sfxCloth, sfxBaked, sfxPour, sfxSetDown, sfxPinch,
} from './audio/sounds';
import type { Clock } from './platform/clock';
import type { StorageAdapter } from './platform/storage';
import type { GameStore } from './store/gameStore';
import { copy } from './ui/copy';
import { toast } from './ui/components/toast';
import { hasOpenModal, openModal } from './ui/components/modal';
import { openMoldModal } from './ui/components/moldModal';
import { openBriefingCard } from './ui/components/briefingCard';
import { Router } from './ui/router';
import { createHomeScreen } from './ui/screens/home';
import { createRecipesScreen } from './ui/screens/recipes';
import { createShowcaseScreen } from './ui/screens/showcase';
import { mountOnboarding } from './ui/screens/onboarding';
import { openStarterGift } from './ui/components/ingredientPicker';
import { celebrateIngredients, celebrateStageUp, dismissCelebrate } from './ui/components/celebrate';
import { variantName } from './ui/components/breadSheet';
import { openOvenVeil, skipOvenVeil } from './ui/components/ovenVeil';
import type { GameApi } from './ui/gameApi';
import { RECIPES, INGREDIENTS } from './sim';
import { adPrivacyOptionsRequired, adsAvailable, showAdPrivacyOptions, showRewarded } from './platform/ads';
import { basesCompleted, missionViews } from './store/economy';
import type { BakeGrade, NotifySlot, SimEvent } from './sim';
import { ruleByVariantId } from './sim';

/** 굽기 결과 소리가 올라가는 음 수 — 등급이 높을수록 끝까지 (sounds.sfxBaked) */
const BAKE_NOTES: Record<BakeGrade, 2 | 3 | 4> = { best: 4, good: 3, flat: 2 };

/** 쇼케이스가 원격 변형 GLB를 기다리는 최대 시간 — 넘기면 베이스 빵 */
const SHOWCASE_WAIT_MS = 4000;
const within = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('slow')), ms))]);

export interface StartAppDeps {
  /** Levain Lab 전용 주입점 — 프로덕션은 생략(systemClock·정식 저장 키) */
  clock?: Clock;
  storage?: StorageAdapter;
}

export async function startApp(deps: StartAppDeps = {}): Promise<{ store: GameStore }> {
  // OTA 확인·다운로드는 내부에서 뒤로 미루므로 부팅을 막지 않는다 (platform/ota.ts 계약).
  // 롤백 방지 신호는 여기서 보내지 않는다 — 이 함수 맨 끝의 markOtaReady()가 보낸다. 첫 화면까지 뜬
  // 뒤여야 「JS는 뜨는데 그 뒤에 죽는」 번들도 되돌려진다(감사 T2-05). ★두 줄은 한 쌍이다: 끝의
  // markOtaReady()가 빠지면 모든 OTA 번들이 30초 뒤 롤백된다.
  initOta({ deferReady: true });
  // 원격 빵 자산 맵 — 묶음 안 로컬 파일이라 저장 읽기와 나란히 끝난다. 화면(썸네일)을 만들기 전에 기다린다
  const assetsReady = loadRemoteAssets();

  const canvas = document.getElementById('c') as HTMLCanvasElement;
  // 보조기술 라벨 — 캔버스는 그림이자 상호작용면인데 접근성 트리에선 빈 노드였다 (2026-08-30 a11y)
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', copy.a11y.canvas);
  const stage = document.getElementById('stage') as HTMLElement;
  const uiRoot = document.getElementById('ui-root') as HTMLElement;

  const clock = deps.clock ?? systemClock;
  const storage = deps.storage ?? createStorage();
  const notifier = createNotifier();
  // 저장 실패 토스트 — 주기 tick(60초) 저장도 이 경로를 타므로 30분에 1회만 말한다.
  // 지속 실패(용량 초과·프라이빗 모드)에서 매 분 토스트는 스팸이고, 1회는 놓치면 끝이라 중간값.
  let saveFailToldAt = -Infinity;
  const { store, isNew, briefing, stageUps: bootStageUps, brokenSave } = await initGameStore({
    clock,
    storage,
    onNotifyPlan: (plan) => void notifier.applyPlan(plan), // 본문 르방 이름은 슬롯 label(store가 싣는다)
    onSaveFailed: () => {
      const t = clock.now();
      if (t - saveFailToldAt < 30 * 60_000) return;
      saveFailToldAt = t;
      toast(copy.save.writeFailed);
    },
  });
  await assetsReady;
  // 관리자 모드 기기(flags.dev)는 켤 때마다 레시피가 다 열려 있다 — dev 서버(import.meta.env.DEV)는 제외해 성장 흐름을 시험할 수 있게 둔다
  if (store.getEnvelope().flags.dev === true) store.devUnlockRecipes();

  // ── 씬 ──
  const scene = new SceneHost(canvas, stage);
  scene.mount();
  scene.snapParams(toRenderParams(store.getSnapshot())); // 앱 오픈 = 즉시 스냅
  scene.start();
  scene.setSeed(store.getActiveStarter().sim.createdAt); // 반점 자리 = 개체 정체성

  // 햅틱 예산: 젓기 세션당 첫 팝 1회만 — '희소' 규칙 (VISUAL §5 개정)
  let stirHapticUsed = false;
  scene.onBubblePop = () => {
    sfxBubble();
    const ag = scene.dough?.agitation ?? 0;
    if (ag > 0.25) {
      if (!stirHapticUsed) {
        stirHapticUsed = true;
        haptic('light');
      }
    } else {
      stirHapticUsed = false;
    }
  };
  // 승급 연출 — 천이 덮여 있으면(콜드 부트·긴 부재 뒤 복귀) 걷을 때까지 미룬다. 병이 안 보이는 채로
  // 터뜨리면 장면이 반쪽이고, 천 걷기가 첫 손짓이라 소리도 그때부터 난다.
  type StageUp = { stage: number; from: number }; // from = 그 승급 전의 집 최고 단계(새로 열린 빵을 세는 기준)
  let stageQueue: StageUp[] = [];
  const cheerStages = (ups: StageUp[]): void => {
    if (ups.length === 0) return;
    // 두 단계를 한 번에 넘어도 소리·진동·기포는 한 번
    sfxUnlock();
    haptic('success');
    scene.celebrate(); // 기포 3연속 팝 — 다이제틱 축하
    // 토스트 2줄(단계·이름표)을 획득 연출 레이어가 대신한다 — 새로 열린 빵까지 같이 보여준다.
    // 냉장·비율·이름표 해금 문구는 celebrate.ts가 단계에서 파생한다(GDD §5 획득 연출 행).
    for (const u of ups) celebrateStageUp(api, u.stage, u.from);
  };
  const onStageUps = (ups: StageUp[]): void => {
    if (scene.isClothCovering()) stageQueue.push(...ups);
    else cheerStages(ups);
  };
  scene.onClothOpen = () => {
    sfxCloth();
    if (stageQueue.length === 0) return;
    const queued = stageQueue;
    stageQueue = [];
    setTimeout(() => cheerStages(queued), 700); // 천이 걷힌 뒤에
  };
  scene.onStirStart = () => sfxStirStart();
  scene.onStirMove = (s) => sfxStirUpdate(s);
  scene.onStirEnd = () => sfxStirEnd();
  // 당기기도 같은 반죽 소리 — 늘어난 만큼만 작게, 놓을 때 톡 (감사 T4-6)
  scene.onGrabStart = () => sfxStirStart();
  scene.onGrabMove = (s) => sfxStirUpdate(s * 0.6);
  scene.onGrabEnd = () => { sfxStirEnd(); haptic('light'); };

  // ── 설정 반영 ──
  const applySettings = (): void => {
    const s = store.getEnvelope().settings;
    setMuted(s.muted);
    setHapticsEnabled(s.haptics);
  };
  applySettings();

  // 불러오기·초기화가 저장을 마치고 reload하는 중 — 언로드의 hidden 분기가 saveNow를 건너뛴다 (T2-01)
  let reloading = false;

  // ── GameApi 어댑터 ──
  const api: GameApi = {
    now: () => clock.now(),
    getSnapshot: () => store.getSnapshot(),
    lastFedAt: () => store.getActiveStarter().sim.lastFedAt,
    labelText: () => store.getActiveStarter().name,
    rename: (name) => store.renameActive(name),
    starters: () => {
      const env = store.getEnvelope();
      const index = Math.max(0, env.starters.findIndex((r) => r.id === env.activeStarterId));
      const rec = env.starters[index];
      return { count: env.starters.length, index, name: rec.name, ordinal: rec.ordinal };
    },
    switchStarter: (dir) => {
      const env = store.getEnvelope();
      if (env.starters.length < 2) return;
      scene.skipSequence(); // 연출 중 전환 금지(§5-5) — 남은 연출은 스킵으로 정리
      const index = Math.max(0, env.starters.findIndex((r) => r.id === env.activeStarterId));
      const next = env.starters[(index + dir + env.starters.length) % env.starters.length];
      // 캔버스를 방향대로 밀어내고 화면 밖에서 교체한다 — 이름만으로 르방을 구별하기 어렵다는
      // 피드백의 절반은 전환이 무예고 컷이라서다(§5-5가 처방했으나 실장 안 됨). 나머지 절반은 개체 지문.
      scene.slideSwap(dir, () => {
        if (!store.switchStarter(next.id)) return;
        sfxSetDown(); // 다른 병이 자리에 놓인다
        // 컷 계약은 그대로 — 경과 시간을 재생하지 않는다: 즉시 스냅 + 개체 시드 재설정
        scene.snapParams(toRenderParams(store.getSnapshot()));
        scene.setSeed(store.getActiveStarter().sim.createdAt);
      });
    },
    location: () => store.getActiveStarter().sim.location,
    flakeMadeAt: () => store.getActiveStarter().sim.flake?.madeAt ?? null,
    dispatch: (a) => store.dispatch(a),
    subscribe: (fn) => store.subscribe(fn),
    inventory: () => store.getInventory(),
    pantry: () => store.getPantry(),
    houseStage: () => store.getHouseStage(),
    pantryQuality: () => store.getPantryQuality(),
    doughFor: (recipeId) => store.getDoughFor(recipeId),
    collection: () => store.getCollection(),
    feedRatio: () => store.getActiveStarter().sim.feedRatio,
    bakeVariant: (variantId) => store.bakeVariant(variantId),
    starterNameOf: (id) => {
      const rec = store.getEnvelope().starters.find((r) => r.id === id);
      return rec ? rec.name ?? copy.starter.defaultName(rec.ordinal) : null;
    },
    addStarter: () => {
      const rec = store.addStarter();
      if (rec === null) return false;
      sfxSetDown(); // 새 병
      // addStarter는 새 르방을 활성으로 전환한다 — 씬 컷 계약 동일 적용
      scene.snapParams(toRenderParams(store.getSnapshot()));
      scene.setSeed(store.getActiveStarter().sim.createdAt);
      return true;
    },
    economy: () => {
      const eco = store.getEconomy();
      const m = missionViews(eco);
      return {
        flour: store.getFlour(),
        feed: m.feed,
        bake: m.bake,
        basesDone: basesCompleted(store.getCollection()),
        basesTotal: RECIPES.length,
        giftPending: !eco.gifted,
      };
    },
    buyIngredient: (id) => store.buyIngredient(id),
    exchangeIngredient: (id) => store.exchangeIngredient(id),
    claimStarterGift: (id) => store.claimStarterGift(id),

    ads: {
      available: () => adsAvailable(),
      deliveryRemaining: () => store.adDeliveryRemaining(),
      watchForDelivery: async () => {
        const result = await showRewarded();
        if (result !== 'rewarded') return null;
        return store.adDeliveryReward();
      },
      privacyOptionsRequired: () => adPrivacyOptionsRequired(),
      showPrivacyOptions: () => showAdPrivacyOptions(),
    },

    dev: {
      matureActive: () => store.devMatureActive(),
      grantAllIngredients: () => {
        // 카탈로그에서 뽑는다 — 하드코딩하면 재료를 늘릴 때마다 개발자 모드가 조용히 낡는다
        const inv = store.getInventory();
        const fresh = INGREDIENTS.filter((ing) => (inv[ing.id] ?? 0) === 0).map((ing) => ing.id);
        for (const ing of INGREDIENTS) store.grantIngredient(ing.id, 9);
        // 0→1이 된 것만 연출한다 — 300ms 수집 창이 30종을 한 장으로 묶는다(celebrate.ts)
        if (fresh.length > 0) celebrateIngredients(api, fresh);
      },
      completeCollection: () => store.devCompleteCollection(),
      unlockRecipes: () => store.devUnlockRecipes(),
    },
    getSettings: () => ({ ...store.getEnvelope().settings }),
    setSettings: (patch) => {
      store.setSettings(patch);
      applySettings();
    },
    exportSave: () => exportEnvelope(store.getEnvelope()),
    importSave: async () => {
      const text = await pickImportFile();
      if (text === null) return false;
      try {
        // 마이그레이션 먼저 — 검증은 현행 스키마만 안다 (persistence.parseEnvelope와 동일 순서)
        const migrated = migrate(JSON.parse(text));
        if (!migrated) return false;
        const env = validateAndClamp(migrated);
        if (!env) return false;
        // 언로드의 hidden 저장이 옛 메모리 env로 새 기록을 덮지 않게 먼저 막는다 (T2-01)
        reloading = true;
        store.stopTicking();
        if (!save(env, storage)) {
          // 실패하고 reload하면 옛 기록으로 조용히 돌아온다 — 그대로 이어간다
          reloading = false;
          store.startTicking();
          return false;
        }
        location.reload(); // 가장 안전한 재부트 — 전 상태 재구축
        return true;
      } catch {
        return false;
      }
    },
    resetGame: () => {
      store.startNewGame();
      reloading = true; // 불러오기와 같은 순서 — 언로드 저장을 건너뛴다
      store.stopTicking();
      location.reload();
    },
    requestNotifyPermission: () => notifier.requestPermission(),
    checkNotifyPermission: () => notifier.checkPermission(),
    // 개발자 도구 판정은 여기 한 곳 — 출시 빌드는 기록 불러오기로 flags.dev를 심은 기기만
    devToolsEnabled: () => import.meta.env.DEV || store.getEnvelope().flags.dev === true,
    // 암호는 해시로만 둔다 — 번들을 열어도 원문이 안 나온다
    unlockDevTools: async (code) => {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code.trim()));
      const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
      if (hex !== 'f16ea3f72d2f5f1cdadba70960d3db2321f3371df571dabe21c7c5079969a777') return false;
      store.setFlags({ dev: true });
      return true;
    },
    pendingBake: () => store.getEnvelope().flags.pendingBake,
    clearPendingBake: () => store.setFlags({ pendingBake: null }),
  };

  // ── 배경 좌우 스와이프 = 르방 전환 (§5-5) ──
  // 칩 ‹ › 와 같은 경로(api.switchStarter). 연출 중 차단은 SceneHost가 얹는다 —
  // 칩은 skipSequence로 넘어가는 의도적 비대칭: 버튼은 명시 의사, 스와이프는
  // 급여 2.8s 중의 손가락 흔들림일 수 있다.
  let showcaseActive = false;
  scene.canSwipe = () => api.starters().count > 1 && !hasOpenModal() && !showcaseActive;
  scene.onSwipe = (dir) => api.switchStarter(dir);

  // ── 화면·탭 ──
  const router = new Router(uiRoot, {
    onRootBack: () => {
      // 레시피 탭 루트에서 백 = 르방이 탭 복귀 (사용자 지시 2026-08-24 — 최소화로 빠지면
      // "돌아갈 길이 없다"로 읽힌다). 르방이 탭 루트에서만 최소화(종료 아님 — 백그라운드 생존이 자연).
      if (currentTab === 'recipes') {
        showTab('levain');
        return;
      }
      if (isNative()) void CapApp.minimizeApp().catch(() => undefined);
    },
    trySkipSequence: () => dismissCelebrate() || skipOvenVeil() || scene.skipSequence(), // 획득 연출 레이어가 먼저
  });
  let currentTab: 'levain' | 'recipes' = 'levain';

  const home = createHomeScreen(api);

  // 3D 쇼케이스 — Screen push로 단일 캔버스 재사용. GLB 미비(404)면 false → 카드 폴백
  const restoreStage = (): void => {
    const onLevain = tabLevain.classList.contains('active');
    stage.style.visibility = onLevain ? 'visible' : 'hidden';
    if (onLevain && !document.hidden) scene.start();
    else scene.stop();
  };
  let showcaseLoading = false;
  // 굽기 결과가 **실제로 보이는 순간** 할 일(결과음·햅틱·pendingBake 걷기 타이머). onEvents가 커밋 때 맡기고
  // 바로 뒤 openShowcase가 같은 자산 id로 가져간다. 커밋 때 울리면 원격 변형 GLB를 기다리는 4초 동안
  // 타이머가 먼저 돌아 결과를 보기도 전에 pendingBake가 걷혔다(2026-11-17).
  let bakeReveal: { id: string; run: () => void } | null = null;
  const openShowcase = async (
    id: string, headline: string, large: boolean,
    opts?: { onRebake?: () => void; kind?: 'bread' | 'ingredient'; name?: string },
  ): Promise<boolean> => {
    // 굽기 결과면 이 요청이 가져간다 — 다른 id(감상 진입)면 남은 것은 버린다(엉뚱한 때 울리지 않게)
    let reveal = bakeReveal?.id === id ? bakeReveal.run : null;
    bakeReveal = null;
    // 로딩 중·표시 중 재진입은 먼저 온 요청이 화면을 띄운다 — true라 호출부가 2D 카드 폴백을 겹쳐 띄우지 않는다 (T7-02).
    // 굽기 결과가 여기 걸리면 보여 준 적이 없으니 소리 없이 pendingBake를 남긴다 → 다음 부팅의 복구 모달이 보여 준다
    if (showcaseLoading || showcaseActive) return true;
    showcaseLoading = true;
    const kind = opts?.kind ?? 'bread';
    const dir = kind === 'ingredient' ? 'ingredients' : 'breads';
    const tabAtRequest = currentTab;
    // 굽는 사이 연출 — 굽기 결과일 때만. 받는 시간이 길면 덮고, 짧으면 최소 길이만 채운다(ovenVeil.ts)
    const veil = reveal ? openOvenVeil() : null;
    const show = (): void => {
      if (!reveal) return; // onShow는 위 화면이 닫혀 돌아올 때 또 불린다 — 결과음은 한 번
      reveal();
      reveal = null;
      veil?.lift();
      // 첫 김(onShow)은 걷히는 막 뒤에 반쯤 묻힌다 — 막이 걷힌 뒤 한 번 더 피워 「갓 나온」 순간을 잇는다
      setTimeout(() => { if (scene.isShowcasing()) scene.spawnSteam(); }, 450);
    };
    // 받는 동안 멈춘 듯 보이지 않게 — 로컬 로드는 대개 이 안에 끝나 표시가 안 뜬다(main.css body.is-fetching).
    // 굽는 사이 연출이 떠 있으면 그것이 기다림을 말한다
    const waitMark = veil ? undefined : setTimeout(() => document.body.classList.add('is-fetching'), 300);
    try {
      try {
        // 원격 변형은 최대 4초 기다린다. 넘기면 베이스로 물러나고 받기는 뒤에서 이어 가 캐시에 든다(다음엔 변형)
        const url = kind === 'bread' ? await within(glbUrl(id), SHOWCASE_WAIT_MS) : `/${dir}/${id}.glb`;
        await scene.enterShowcase(url, kind === 'bread'); // 빵은 전부 툰(toonMaterial.ts)
      } catch (err) {
        // 변형 GLB는 대부분 없다 — 베이스 GLB로 한 번 더 (썸네일의 베이스 PNG 폴백과 같은 규칙, T4-2)
        const base = id.split('--')[0];
        if (base === id) throw err;
        await scene.enterShowcase(`/${dir}/${base}.glb`, kind === 'bread');
      }
      await veil?.ready;
    } catch {
      // 2D 결과 카드로 물러난다 — 호출부가 이 false를 받자마자 카드를 띄우니 지금이 「보이는 순간」이다
      await veil?.ready;
      show();
      return false;
    } finally {
      showcaseLoading = false;
      clearTimeout(waitMark);
      document.body.classList.remove('is-fetching');
    }
    // 로드 중 탭을 옮겼으면 띄우지 않는다 (T7-10) — 호출부의 카드 폴백이 결과를 보인다
    if (currentTab !== tabAtRequest) {
      scene.exitShowcase();
      restoreStage();
      show();
      return false;
    }
    // 변형(id가 copy.recipes(.ingredientNames)에 없다)은 호출부가 name을 직접 넘긴다
    const name =
      opts?.name ?? (kind === 'ingredient' ? copy.recipes.ingredientNames[id] : copy.recipes.names[id]) ?? id;
    const screen = createShowcaseScreen(id, name, headline, large, {
      onShow: () => {
        showcaseActive = true;
        stage.style.visibility = 'visible';
        scene.start();
        // 김은 **갓 구운 빵**의 다이제틱 신호다 — 생재료에서 김이 나면 거짓말이 된다
        if (kind === 'bread') scene.spawnSteam();
        show();
      },
      onExit: () => {
        showcaseActive = false;
        scene.exitShowcase();
        restoreStage();
      },
      onClose: () => router.handleBack(),
      onRebake: opts?.onRebake,
    });
    router.push(screen);
    return true;
  };

  // 탭 루트 백버튼은 폐지됐다(2026-09-03) — 탭바가 복귀 수단이고, 하드웨어 백 계약은
  // router.onRootBack이 그대로 지킨다(레시피 루트 백 = 르방이 탭).
  const recipes = createRecipesScreen(api, () => store.getCollection(), { openShowcase });

  const tabs = document.createElement('nav');
  tabs.id = 'tabs';
  const tabLevain = document.createElement('button');
  tabLevain.textContent = copy.tabs.levain;
  const tabRecipes = document.createElement('button');
  tabRecipes.textContent = copy.tabs.recipes;
  tabs.append(tabLevain, tabRecipes);
  document.body.appendChild(tabs);

  const showTab = (which: 'levain' | 'recipes'): void => {
    currentTab = which;
    document.body.dataset.tab = which; // 토스트 자리 등 탭별 CSS의 기준 (main.css body[data-tab])
    tabLevain.classList.toggle('active', which === 'levain');
    tabRecipes.classList.toggle('active', which === 'recipes');
    router.setRoot(which === 'levain' ? home : recipes);
    // 캔버스 rAF는 홈에서만 (배터리 — VISUAL §8)
    if (which === 'levain' && !document.hidden) scene.start();
    else scene.stop();
    stage.style.visibility = which === 'levain' ? 'visible' : 'hidden';
  };
  tabLevain.addEventListener('click', () => showTab('levain'));
  tabRecipes.addEventListener('click', () => {
    // 재탭 상태 전이 (§8-1 표): 루트에서 재탭 = 빵 → 선반 → 재료 순환, 하위 상세에선 루트 복귀
    if (currentTab === 'recipes') {
      if (router.current()?.id !== 'recipes') {
        showTab('recipes'); // setRoot가 스택을 루트 하나로 되돌린다
        return;
      }
      recipes.cycleSegment();
      return;
    }
    showTab('recipes');
  });
  showTab('levain');

  // ── 알림 탭 딥링크 (2026-09-03) ──
  // 콜드 스타트로 들어오면 브리핑·곰팡이 모달이 먼저 뜰 수 있다 — 모달이 닫힐 때까지
  // 400ms 간격으로 기다렸다가 연다(최대 10회 = 4초). 여전히 열려 있으면 탭만 옮긴다:
  // home.openFeed가 스스로 hasOpenModal을 확인하므로 모달이 겹치는 일은 없다.
  const openForNotify = (copyKey: NotifySlot['copyKey']): void => {
    // 한창때(peak)도 르방 탭 — 09-05 개정 뒤 한창때는 떼기 적기이고 떼는 자리는 홈의 통이다 (T7-18)
    showTab('levain');
    if (copyKey === 'feedTime' || copyKey === 'fridgeWeek' || copyKey === 'reviveSecond' || copyKey === 'sour') {
      home.openFeed();
    }
  };
  notifier.onTapped((copyKey) => {
    if (!store.getEnvelope().flags.onboarded) return; // 온보딩 전엔 화면 자체가 없다
    let tries = 0;
    const run = (): void => {
      if (hasOpenModal() && tries < 10) {
        tries += 1;
        setTimeout(run, 400);
        return;
      }
      openForNotify(copyKey);
    };
    run();
  });

  // ── 이벤트 → 사운드·햅틱·토스트 ──
  const onEvents = (events: SimEvent[]): void => {
    const ups: StageUp[] = [];
    for (const e of events) {
      switch (e.type) {
        case 'fed':
          sfxPour(); // 가루가 들어가는 소리 위로 2음
          sfxFed();
          haptic('light');
          scene.playFeed(false);
          break;
        case 'stageUp':
          ups.push({ stage: e.stage, from: houseSeen });
          break;
        case 'reviveStarted':
          sfxPour();
          toast(copy.revive.started);
          haptic('light');
          scene.playFeed(true); // 따라내기 선행
          break;
        case 'reviveTooSoon':
          toast(copy.revive.tooSoon);
          break;
        case 'revived':
          sfxRevived();
          haptic('medium');
          toast(copy.revive.done);
          scene.playFeed(false);
          setTimeout(() => scene.playWatch(), 2800); // 지켜보기 — 급여 연출 뒤
          break;
        case 'baked': {
          // 강제종료 안전: 결과를 flags에 심는 건 커밋 순간 그대로다
          const planted = { recipeId: e.recipeId, grade: e.grade, ...(e.variantId ? { variantId: e.variantId } : {}) };
          store.setFlags({ pendingBake: planted });
          // 소리·햅틱·걷기는 결과가 보이는 순간(openShowcase의 bakeReveal) — 3초 살아있으면(= 결과를 봤으면) 걷는다
          bakeReveal = {
            id: e.variantId ?? e.recipeId,
            run: () => {
              // 보상 소리는 하나이고 결과는 「어디까지 올라가느냐」로만 다르다 (sounds.sfxBaked)
              sfxBaked(BAKE_NOTES[e.grade]);
              haptic('success');
              // 자기가 심은 값일 때만 걷는다 — 3초 안에 또 구우면 두 번째 기록이 1초 만에 지워졌다 (T2-12)
              setTimeout(() => {
                if (store.getEnvelope().flags.pendingBake === planted) store.setFlags({ pendingBake: null });
              }, 3000);
            },
          };
          break;
        }
        case 'bakedDiscard':
          bakeReveal = {
            id: e.variantId ?? e.recipeId,
            run: () => {
              sfxBaked(2);
              haptic('light');
            },
          };
          break;
        case 'moved':
          sfxSetDown();
          break;
        case 'split':
          sfxPinch();
          haptic('light');
          break;
        case 'flourEarned':
          toast(copy.economy.earned(e.amount));
          break;
        case 'flakeMade':
          haptic('light');
          toast(copy.flake.made);
          break;
        case 'flakeBlocked':
          toast(e.reason === 'mass' ? copy.flake.blockedMass : copy.flake.blockedPhase);
          break;
        case 'flakeRestored':
          sfxPour();
          haptic('medium');
          scene.playFeed(true); // 물을 주는 손길 — 따라내기 연출 재사용
          break;
        case 'starterDiscarded':
          sfxSetDown(); // 새 병
          scene.snapParams(toRenderParams(store.getSnapshot())); // 새 반죽 — 즉시 스냅
          scene.setSeed(store.getActiveStarter().sim.createdAt); // 새 개체 = 새 반점 자리
          break;
        case 'moldBlocked':
          openMoldModal(api); // 다른 일은 없다 — 종결 모달로 되돌린다
          break;
        default:
          break;
      }
    }
    onStageUps(ups);
  };

  // 승급 연출이 「새로 열린 빵」을 셀 기준 — 이 통지 직전의 집 최고 단계 (T7-08)
  let houseSeen = store.getHouseStage();
  store.subscribe((snap, events) => {
    scene.setTargetParams(toRenderParams(snap));
    onEvents(events);
    houseSeen = store.getHouseStage();
  });

  // ── 수명주기 ──
  let hiddenAt = 0;
  const CLOTH_ABSENCE_MS = 30 * 60_000; // 30분 넘게 자리를 비우면 천이 덮여 있다
  onLifecycle((visible) => {
    if (visible) {
      const resumeBriefing = store.resumeWithBriefing(); // catch-up + 부재 브리핑
      scene.snapParams(toRenderParams(store.getSnapshot())); // 복귀 = 즉시 스냅
      if (tabLevain.classList.contains('active') || showcaseActive) scene.start(); // 쇼케이스는 레시피 탭에서 열린다 (T4-1)
      store.startTicking();
      store.replanNotifications();
      resumeAudio();
      if (store.getEnvelope().flags.onboarded) {
        if (hiddenAt > 0 && clock.now() - hiddenAt > CLOTH_ABSENCE_MS) scene.coverCloth();
        if (!hasOpenModal()) openBriefingCard(resumeBriefing, () => openMoldModal(api)); // 모달 위 모달 금지
      }
    } else {
      hiddenAt = clock.now();
      if (!reloading) store.saveNow();
      store.stopTicking();
      scene.stop();
      suspendAudio();
    }
  });
  store.startTicking();

  // ── Android 하드웨어 백 + 상태바 ──
  if (isNative()) {
    void CapApp.addListener('backButton', () => router.handleBack()).catch(() => undefined);
    // Style.Light = 밝은 배경용 어두운 콘텐츠. 상태바 배경은 MainActivity decor 베이지가 담당
    void StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
  }

  // ── 오디오 언락 (첫 제스처) ──
  window.addEventListener('pointerdown', () => unlockAudio(), { once: true });

  // ── 온보딩 게이트 ──
  if (isNew || !store.getEnvelope().flags.onboarded) {
    tabs.style.display = 'none';
    // 젓기 단계에서 온보딩 레이어가 투명해지면 밑의 홈 HUD(밥·설정·+)가 눌렸다 (T7-05). 캔버스 젓기는 그대로
    home.el.style.visibility = 'hidden';
    mountOnboarding({
      root: uiRoot,
      canvas,
      requestNotifyPermission: () => notifier.requestPermission(),
      onComplete: () => {
        // 창조 의식 완료 시각이 진짜 탄생 시각 — 온보딩 도중 닫았다 며칠 뒤 마쳐도 그날 태어난다.
        // flags만 깨진 저장본(기록이 있는 집)은 persistence.flagsOf가 onboarded=true로 착륙시켜
        // 여기 오지 않는다(T2-02). 여기 온 저장본은 온보딩 전 것뿐이라 새로 써도 잃는 게 없다.
        store.startNewGame();
        store.setFlags({ onboarded: true });
        scene.snapParams(toRenderParams(store.getSnapshot()));
        tabs.style.display = '';
        home.el.style.visibility = '';
        // 첫 재료 선물 (§9) — 창조 의식 직후가 유일한 자연 자리. 이미 받은 기록이면 열지 않는다
        if (api.economy().giftPending) openStarterGift(api);
      },
    });
  }

  // ── 미표시 굽기 결과 재노출 (강제종료 안전) — 브리핑·곰팡이 체인이 끝난 뒤에 연다 (모달 위 모달 금지) ──
  const showPendingBake = (): void => {
    const pending = api.pendingBake();
    if (!pending) return;
    const wrap = document.createElement('div');
    const p = document.createElement('p');
    p.className = 'modal-body';
    const rule = pending.variantId ? ruleByVariantId(pending.variantId) : undefined;
    const name = rule ? variantName(rule) : copy.recipes.names[pending.recipeId] ?? pending.recipeId;
    // 제목 = 빵 이름, 본문 = 등급 한 줄
    p.textContent = copy.recipes.grades[pending.grade as BakeGrade] ?? '';
    wrap.appendChild(p);
    openModal(wrap, { title: name, onClose: () => api.clearPendingBake() });
  };

  // ── 부트 브리핑 → (필요시) 곰팡이 종결 모달 — 중앙 팝업 순차, 겹치지 않게 ──
  if (!isNew && store.getEnvelope().flags.onboarded) {
    scene.coverCloth(); // 콜드 스타트 = 천이 덮인 채 시작 — 걷는 게 첫 리추얼
    // 첫 재료 선물을 여기서 자동으로 열지 않는다 (2026-08-25 사용자 지적):
    // 백드롭으로 닫으면 claimStarterGift가 안 불려 gifted가 false로 남고 → 매 콜드부팅마다
    // 다시 떴다. "한 번 권한다"가 아니라 매번이었다. 선물 진입로는 온보딩 직후 1회와
    // 재료 탭 배너 버튼(screens/recipes.ts) 둘뿐이다 — 되돌리지 말 것.
    openBriefingCard(briefing, () => openMoldModal(api, showPendingBake));
    // 앱이 꺼져 있는 동안 넘은 단계 — 천이 덮여 있으니 걷을 때 연출이 뜬다(onStageUps). 승급은 대부분
    // 날짜 조건이 차서 오므로 이 길이 가장 흔하다(감사 T8-01)
    if (bootStageUps.length > 0) {
      const from = bootStageUps[0] - 1;
      onStageUps(bootStageUps.map((stage) => ({ stage, from })));
    }
  } else {
    showPendingBake();
  }
  // 읽을 수 없는 저장본이 있어 새로 시작한 경우 — 원문은 따로 보관돼 있다(storage.keepBroken, 감사 T2-03)
  if (brokenSave) toast(copy.save.corrupted, 7000); // 기록을 잃었다는 말 — 읽을 시간을 준다

  markOtaReady(); // 첫 화면까지 떴다 — 맨 위 initOta({ deferReady: true })와 한 쌍
  return { store }; // Levain Lab 계기판용 — 프로덕션(main.ts)은 무시
}
