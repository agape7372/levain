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
import { exportEnvelope, pickImportFile } from './platform/saveTransfer';
import {
  setMuted, sfxBubble, sfxFed, sfxRevived, sfxUnlock, suspendAudio, resumeAudio, unlockAudio,
  sfxStirStart, sfxStirUpdate, sfxStirEnd, sfxCloth,
} from './audio/sounds';
import { copy } from './ui/copy';
import { toast } from './ui/components/toast';
import { openModal } from './ui/components/modal';
import { openMoldModal } from './ui/components/moldModal';
import { openBriefingCard } from './ui/components/briefingCard';
import { Router } from './ui/router';
import { createHomeScreen } from './ui/screens/home';
import { createRecipesScreen } from './ui/screens/recipes';
import { createShowcaseScreen } from './ui/screens/showcase';
import { mountOnboarding } from './ui/screens/onboarding';
import type { GameApi } from './ui/gameApi';
import type { BakeGrade, SimEvent } from './sim';

export async function startApp(): Promise<void> {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const stage = document.getElementById('stage') as HTMLElement;
  const uiRoot = document.getElementById('ui-root') as HTMLElement;

  const storage = createStorage();
  const notifier = createNotifier();
  const { store, isNew, loadSource, briefing } = await initGameStore({
    clock: systemClock,
    storage,
    onNotifyPlan: (plan) => void notifier.applyPlan(plan),
  });

  // ── 씬 ──
  const scene = new SceneHost(canvas, stage);
  scene.mount();
  scene.snapParams(toRenderParams(store.getSnapshot())); // 앱 오픈 = 즉시 스냅
  scene.start();
  scene.setMoldSeed(store.getEnvelope().sim.createdAt); // 반점 자리 = 개체 정체성

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
    now: () => systemClock.now(),
    getSnapshot: () => store.getSnapshot(),
    lastFedAt: () => store.getEnvelope().sim.lastFedAt,
    labelText: () => store.getEnvelope().sim.label,
    location: () => store.getEnvelope().sim.location,
    flakeMadeAt: () => store.getEnvelope().sim.flake?.madeAt ?? null,
    dispatch: (a) => store.dispatch(a),
    subscribe: (fn) => store.subscribe(fn),
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
        const env = validateAndClamp(JSON.parse(text));
        if (!env) return false;
        const migrated = migrate(env);
        if (!migrated) return false;
        save(migrated, storage);
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
    openNotifySettings: () => void notifier.openSettings(),
    pendingBake: () => store.getEnvelope().flags.pendingBake,
    clearPendingBake: () => store.setFlags({ pendingBake: null }),
  };

  // ── 화면·탭 ──
  const router = new Router(uiRoot, {
    onRootBack: () => {
      // 루트에서 백 = 최소화(종료 아님 — 다마고치는 백그라운드 생존이 자연)
      if (isNative()) void CapApp.minimizeApp().catch(() => undefined);
    },
    trySkipSequence: () => scene.skipSequence(),
  });

  const home = createHomeScreen(api);

  // 3D 쇼케이스 — Screen push로 단일 캔버스 재사용. GLB 미비(404)면 false → 카드 폴백
  const restoreStage = (): void => {
    const onLevain = tabLevain.classList.contains('active');
    stage.style.visibility = onLevain ? 'visible' : 'hidden';
    if (onLevain && !document.hidden) scene.start();
    else scene.stop();
  };
  const openShowcase = async (recipeId: string, headline: string, large: boolean): Promise<boolean> => {
    try {
      await scene.enterShowcase(`/breads/${recipeId}.glb`);
    } catch {
      return false;
    }
    const screen = createShowcaseScreen(recipeId, headline, large, {
      onShow: () => {
        stage.style.visibility = 'visible';
        scene.start();
        scene.spawnSteam(); // 갓 구운 김
      },
      onExit: () => {
        scene.exitShowcase();
        restoreStage();
      },
      onClose: () => router.handleBack(),
    });
    router.push(screen);
    return true;
  };

  const recipes = createRecipesScreen(api, () => store.getEnvelope().sim.collection, openShowcase);

  const tabs = document.createElement('nav');
  tabs.id = 'tabs';
  const tabLevain = document.createElement('button');
  tabLevain.textContent = copy.tabs.levain;
  const tabRecipes = document.createElement('button');
  tabRecipes.textContent = copy.tabs.recipes;
  tabs.append(tabLevain, tabRecipes);
  document.body.appendChild(tabs);

  const showTab = (which: 'levain' | 'recipes'): void => {
    tabLevain.classList.toggle('active', which === 'levain');
    tabRecipes.classList.toggle('active', which === 'recipes');
    router.setRoot(which === 'levain' ? home : recipes);
    // 캔버스 rAF는 홈에서만 (배터리 — VISUAL §8)
    if (which === 'levain' && !document.hidden) scene.start();
    else scene.stop();
    stage.style.visibility = which === 'levain' ? 'visible' : 'hidden';
  };
  tabLevain.addEventListener('click', () => showTab('levain'));
  tabRecipes.addEventListener('click', () => showTab('recipes'));
  showTab('levain');

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
          toast(copy.stage.up(copy.stage.names[e.stage] ?? ''));
          if (e.stage === 5) toast(copy.stage.labelUnlocked);
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
          scene.setMoldSeed(store.getEnvelope().sim.createdAt); // 새 개체 = 새 반점 자리
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
      },
    });
  } else if (loadSource === 'mirror') {
    // 주 저장 손상 → 미러 복구 — 조용히 (사용자에게 시스템 사정 노출 금지)
  }

  // ── 부트 브리핑 → (필요시) 곰팡이 종결 모달 — 중앙 팝업 순차, 겹치지 않게 ──
  if (!isNew && store.getEnvelope().flags.onboarded) {
    scene.coverCloth(); // 콜드 스타트 = 천이 덮인 채 시작 — 걷는 게 첫 리추얼
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
}
