// 튜닝·QA용 씬 프리뷰. 실서비스 부트스트랩과 분리해 demo 모드에서만 로드한다.
import { SceneHost } from './render/SceneHost';
import { toRenderParams } from './render/renderParams';
import * as sim from './sim';

export async function startDemo(query: URLSearchParams): Promise<void> {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const stage = document.getElementById('stage') as HTMLElement;
  const scene = new SceneHost(canvas, stage);
  scene.mount();
  scene.start();

  const now = Date.now();
  let state = sim.initialState(now - 1);
  const ratio = query.get('ratio');
  if (ratio === '1:2:2' || ratio === '1:5:5') {
    state = { ...state, maturity: 45, createdAt: now - 40 * 24 * sim.HOUR, feedRatio: ratio };
  }
  const demoH = Number(query.get('demo') || '5');
  state = {
    ...state,
    lastFedAt: now - demoH * sim.HOUR,
    locAnchorAt: now - demoH * sim.HOUR,
    lastSimulatedAt: now - demoH * sim.HOUR,
  };
  const loc = query.get('loc');
  if (loc === 'window' || loc === 'fridge') {
    state = sim.applyAction(
      { ...state, maturity: Math.max(state.maturity, 45), createdAt: now - 40 * 24 * sim.HOUR },
      { type: 'setLocation', to: loc },
      now - demoH * sim.HOUR,
    ).state;
  }
  state = sim.advance(state, now);
  const acid = query.get('acid');
  if (acid !== null) state = { ...state, acidity: Number(acid) };

  scene.setSeed(state.createdAt); // 곰팡이 단계 튜닝(demo=170+)에도 반점 자리 고정
  scene.snapParams(toRenderParams(sim.deriveSnapshot(state, now)));
  setInterval(() => {
    const tickNow = Date.now();
    state = sim.advance(state, tickNow);
    scene.setTargetParams(toRenderParams(sim.deriveSnapshot(state, tickNow)));
  }, 5000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) scene.stop();
    else scene.start();
  });
}
