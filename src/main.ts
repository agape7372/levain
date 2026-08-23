// 부트스트랩 — M0: 씬만. 저장·store 배선은 M2, UI는 M4에서 app.ts로 승격.
import './styles/main.css';
import { SceneHost } from './render/SceneHost';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;

const scene = new SceneHost(canvas, stage);
scene.mount();
scene.start();

// 배터리 가드: 숨겨지면 렌더 완전 정지 (VISUAL §8)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) scene.stop();
  else scene.start();
});
