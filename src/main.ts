// 부트스트랩. ?demo=<유효경과 h>[&ratio=][&loc=][&acid=]는 store 없는 씬 프리뷰(튜닝·QA용).
import './styles/main.css';
import { startApp } from './app';

const q = new URLSearchParams(location.search);

if (q.has('demo')) {
  void (async () => {
    const { SceneHost } = await import('./render/SceneHost');
    const { toRenderParams } = await import('./render/renderParams');
    const sim = await import('./sim');

    const canvas = document.getElementById('c') as HTMLCanvasElement;
    const stage = document.getElementById('stage') as HTMLElement;
    const scene = new SceneHost(canvas, stage);
    scene.mount();
    scene.start();

    const now = Date.now();
    let state = sim.initialState(now - 1);
    const ratio = q.get('ratio');
    if (ratio === '1:2:2' || ratio === '1:5:5') {
      state = { ...state, maturity: 45, createdAt: now - 40 * 24 * sim.HOUR, feedRatio: ratio };
    }
    const demoH = Number(q.get('demo') || '5');
    state = { ...state, lastFedAt: now - demoH * sim.HOUR, locAnchorAt: now - demoH * sim.HOUR, lastSimulatedAt: now - demoH * sim.HOUR };
    const loc = q.get('loc');
    if (loc === 'window' || loc === 'fridge') {
      state = sim.applyAction(
        { ...state, maturity: Math.max(state.maturity, 45), createdAt: now - 40 * 24 * sim.HOUR },
        { type: 'setLocation', to: loc },
        now - demoH * sim.HOUR,
      ).state;
    }
    state = sim.advance(state, now);
    const acid = q.get('acid');
    if (acid !== null) state = { ...state, acidity: Number(acid) };

    scene.setMoldSeed(state.createdAt); // 곰팡이 단계 튜닝(demo=170+)에도 반점 자리 고정
    scene.snapParams(toRenderParams(sim.deriveSnapshot(state, now)));
    setInterval(() => {
      state = sim.advance(state, Date.now());
      scene.setTargetParams(toRenderParams(sim.deriveSnapshot(state, Date.now())));
    }, 5000);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) scene.stop();
      else scene.start();
    });
  })();
} else {
  void startApp();
}
