// 부트스트랩. ?demo=<유효경과 h>[&ratio=][&loc=][&acid=]는 store 없는 씬 프리뷰(튜닝·QA용).
import './styles/main.css';

const q = new URLSearchParams(location.search);

if (q.has('demo')) {
  void (async () => {
    const { startDemo } = await import('./demo');
    await startDemo(q);
  })();
} else {
  void (async () => {
    const { startApp } = await import('./app');
    await startApp();
  })();
}
