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
import { initOta } from './platform/ota';
import { exportEnvelope, pickImportFile } from './platform/saveTransfer';
import {
  setMuted, sfxBubble, sfxFed, sfxRevived, sfxUnlock, suspendAudio, resumeAudio, unlockAudio,
  sfxStirStart, sfxStirUpdate, sfxStirEnd, sfxCloth,
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
import { celebrateIngredients, celebrateStageUp } from './ui/components/celebrate';
import type { GameApi } from './ui/gameApi';
import { RECIPES, INGREDIENTS, adRemaining } from './sim';
import { adsAvailable, showRewarded } from './platform/ads';
import { basesCompleted, missionViews } from './store/economy';
import type { BakeGrade, NotifySlot, SimEvent } from './sim';

export interface StartAppDeps {
  /** Levain Lab 전용 주입점 — 프로덕션은 생략(systemClock·정식 저장 키) */
  clock?: Clock;
  storage?: StorageAdapter;
}

export async function startApp(deps: StartAppDeps = {}): Promise<{ store: GameStore }> {
  // OTA는 가장 먼저 — 롤백 방지 신호(notifyAppReady)가 늦으면 정상 번들도 되돌려진다.
  // 확인·다운로드는 내부에서 뒤로 미루므로 부팅을 막지 않는다 (platform/ota.ts 계약).
  initOta();

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
  const { store, isNew, loadSource, briefing } = await initGameStore({
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
  scene.onClothOpen = () => sfxCloth();
  scene.onStirStart = () => sfxStirStart();
  scene.onStirMove = (s) => sfxStirUpdate(s);
  scene.onStirEnd = () => sfxStirEnd();

  // ── 설정 반영 ──
  const applySettings = (): void => {
    const s = store.getEnvelope().settings;
    setMuted(s.muted);
    setHapticsEnabled(s.haptics);
  };
  applySettings();

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
      deliveryRemaining: () => adRemaining(store.getAdLedger(), clock.now(), 'delivery'),
      watchForDelivery: async () => {
        const result = await showRewarded();
        if (result !== 'rewarded') return null;
        return store.adDeliveryReward();
      },
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
        save(env, storage);
        location.reload(); // 가장 안전한 재부트 — 전 상태 재구축
        return true;
      } catch {
        return false;
      }
    },
    resetGame: () => {
      store.startNewGame();
      location.reload();
    },
    requestNotifyPermission: () => notifier.requestPermission(),
    checkNotifyPermission: () => notifier.checkPermission(),
    openNotifySettings: () => void notifier.openSettings(),
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
    trySkipSequence: () => scene.skipSequence(),
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
  const openShowcase = async (
    id: string, headline: string, large: boolean,
    opts?: { onRebake?: () => void; kind?: 'bread' | 'ingredient'; name?: string },
  ): Promise<boolean> => {
    const kind = opts?.kind ?? 'bread';
    const dir = kind === 'ingredient' ? 'ingredients' : 'breads';
    try {
      await scene.enterShowcase(`/${dir}/${id}.glb`);
    } catch {
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
    // 첫 2~3회 힌트 — "한 번 더 누르면 선반·재료" (발견 가능성 보조)
    const hints = store.getEnvelope().flags.retapHints;
    if (hints < 3) {
      toast(copy.recipes.retapHint);
      store.setFlags({ retapHints: hints + 1 });
    }
  });
  showTab('levain');

  // ── 알림 탭 딥링크 (2026-09-03) ──
  // 콜드 스타트로 들어오면 브리핑·곰팡이 모달이 먼저 뜰 수 있다 — 모달이 닫힐 때까지
  // 400ms 간격으로 기다렸다가 연다(최대 10회 = 4초). 여전히 열려 있으면 탭만 옮긴다:
  // home.openFeed가 스스로 hasOpenModal을 확인하므로 모달이 겹치는 일은 없다.
  const openForNotify = (copyKey: NotifySlot['copyKey']): void => {
    if (copyKey === 'peak') {
      showTab('recipes'); // 한창때 = 지금 굽기 좋은 때
      return;
    }
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
    for (const e of events) {
      switch (e.type) {
        case 'fed':
          sfxFed();
          haptic('light');
          scene.playFeed(false);
          break;
        case 'stageUp':
          sfxUnlock();
          haptic('success');
          scene.celebrate(); // 기포 3연속 팝 — 다이제틱 축하
          // 토스트 2줄(단계·이름표)을 획득 연출 레이어가 대신한다 — 새로 열린 빵까지 같이 보여준다.
          // 냉장·비율·이름표 해금 문구는 celebrate.ts가 단계에서 파생한다(GDD §5 획득 연출 행).
          celebrateStageUp(api, e.stage);
          break;
        case 'reviveStarted':
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
        case 'baked':
          sfxUnlock();
          haptic('success');
          // 강제종료 안전: 결과를 flags에 심고, 3초 살아있으면(= 결과 모달을 봤으면) 걷는다
          store.setFlags({ pendingBake: { recipeId: e.recipeId, grade: e.grade } });
          setTimeout(() => store.setFlags({ pendingBake: null }), 3000);
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
          haptic('medium');
          scene.playFeed(true); // 물을 주는 손길 — 따라내기 연출 재사용
          break;
        case 'starterDiscarded':
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
  };

  store.subscribe((snap, events) => {
    scene.setTargetParams(toRenderParams(snap));
    onEvents(events);
  });

  // ── 수명주기 ──
  let hiddenAt = 0;
  const CLOTH_ABSENCE_MS = 30 * 60_000; // 30분 넘게 자리를 비우면 천이 덮여 있다
  onLifecycle((visible) => {
    if (visible) {
      const resumeBriefing = store.resumeWithBriefing(); // catch-up + 부재 브리핑
      scene.snapParams(toRenderParams(store.getSnapshot())); // 복귀 = 즉시 스냅
      if (tabLevain.classList.contains('active')) scene.start();
      store.startTicking();
      store.replanNotifications();
      resumeAudio();
      if (store.getEnvelope().flags.onboarded) {
        if (hiddenAt > 0 && Date.now() - hiddenAt > CLOTH_ABSENCE_MS) scene.coverCloth();
        openBriefingCard(resumeBriefing, () => openMoldModal(api));
      }
    } else {
      hiddenAt = Date.now();
      store.saveNow();
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
    mountOnboarding({
      root: uiRoot,
      canvas,
      requestNotifyPermission: () => notifier.requestPermission(),
      onComplete: () => {
        store.startNewGame(); // 창조 의식 완료 시각이 진짜 탄생 시각
        store.setFlags({ onboarded: true });
        scene.snapParams(toRenderParams(store.getSnapshot()));
        tabs.style.display = '';
        toast(copy.onboarding.born);
        openStarterGift(api); // 첫 재료 선물 (§9) — 창조 의식 직후가 유일한 자연 자리
      },
    });
  } else if (loadSource === 'mirror') {
    // 주 저장 손상 → 미러 복구 — 조용히 (사용자에게 시스템 사정 노출 금지)
  }

  // ── 부트 브리핑 → (필요시) 곰팡이 종결 모달 — 중앙 팝업 순차, 겹치지 않게 ──
  if (!isNew && store.getEnvelope().flags.onboarded) {
    scene.coverCloth(); // 콜드 스타트 = 천이 덮인 채 시작 — 걷는 게 첫 리추얼
    // 첫 재료 선물을 여기서 자동으로 열지 않는다 (2026-08-25 사용자 지적):
    // 백드롭으로 닫으면 claimStarterGift가 안 불려 gifted가 false로 남고 → 매 콜드부팅마다
    // 다시 떴다. "한 번 권한다"가 아니라 매번이었다. 선물 진입로는 온보딩 직후 1회와
    // 재료 탭 배너 버튼(screens/recipes.ts) 둘뿐이다 — 되돌리지 말 것.
    openBriefingCard(briefing, () => openMoldModal(api));
  }

  // ── 미표시 굽기 결과 재노출 (강제종료 안전) ──
  const pending = api.pendingBake();
  if (pending) {
    const wrap = document.createElement('div');
    const p = document.createElement('p');
    p.className = 'modal-body';
    const name = copy.recipes.names[pending.recipeId] ?? pending.recipeId;
    const grade = copy.recipes.grades[pending.grade as BakeGrade] ?? '';
    p.textContent = `${name} — ${grade}`;
    wrap.appendChild(p);
    openModal(wrap, { title: '구운 빵', onClose: () => api.clearPendingBake() });
  }

  return { store }; // Levain Lab 계기판용 — 프로덕션(main.ts)은 무시
}
