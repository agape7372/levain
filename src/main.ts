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
  })().catch(async (e: unknown) => {
    // 부트 예외(WebGL 컨텍스트 생성 실패 등)면 빈 화면 대신 안내 한 줄 (T7-06)
    console.error(e);
    const { copy } = await import('./ui/copy');
    const p = document.createElement('p');
    p.textContent = copy.app.bootFailed;
    p.style.cssText = 'padding:40vh 24px 0;text-align:center;color:var(--ink)';
    document.getElementById('ui-root')?.appendChild(p);
  });
}
