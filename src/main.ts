// 부트스트랩 — M3: sim→render 수직 슬라이스.
// ?demo=<유효경과 h>[&ratio=1:2:2][&loc=fridge][&acid=50] 로 상태 프리뷰 (수동 QA·튜닝용).
// 저장·store 배선은 app.ts로 승격 예정(M4).
import './styles/main.css';
import { SceneHost } from './render/SceneHost';
import { toRenderParams } from './render/renderParams';
import { deriveSnapshot, initialState, applyAction, advance, HOUR } from './sim';
import type { SimState } from './sim';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;

const scene = new SceneHost(canvas, stage);
scene.mount();
scene.start();

// ── 데모 상태 구성 ─────────────────────────────────────────────
const q = new URLSearchParams(location.search);
const now = Date.now();
let state: SimState = initialState(now - 1);

const ratio = q.get('ratio');
if (ratio === '1:2:2' || ratio === '1:5:5') {
  // 데모: 단계 게이트 우회 — 성숙 상태를 직접 구성
  state = { ...state, maturity: 45, createdAt: now - 40 * 24 * HOUR, feedRatio: ratio };
}
const demoH = Number(q.get('demo') ?? '5'); // 기본: 피크 부근
state = { ...state, lastFedAt: now - demoH * HOUR, locAnchorAt: now - demoH * HOUR, lastSimulatedAt: now - demoH * HOUR };
const loc = q.get('loc');
if (loc === 'window' || loc === 'fridge') {
  state = applyAction({ ...state, maturity: Math.max(state.maturity, 45), createdAt: now - 40 * 24 * HOUR }, { type: 'setLocation', to: loc }, now - demoH * HOUR).state;
}
state = advance(state, now);
const acid = q.get('acid');
if (acid !== null) state = { ...state, acidity: Number(acid) };

// 스냅샷 → 파라미터 → 씬 (앱 오픈 = 즉시 스냅)
const snap = deriveSnapshot(state, now);
scene.snapParams(toRenderParams(snap));
scene.setBandY(0.98);

// 라이브 진행 — 5초마다 tick (rAF 아님)
setInterval(() => {
  state = advance(state, Date.now());
  scene.setTargetParams(toRenderParams(deriveSnapshot(state, Date.now())));
}, 5000);

console.log('[demo] snapshot', snap);

// 배터리 가드: 숨겨지면 렌더 완전 정지 (VISUAL §8)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) scene.stop();
  else scene.start();
});
