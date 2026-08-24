// 빵 쇼케이스 화면 — Screen push (모달 아님: 중앙 팝업 규칙과 무충돌, 바닥 시트도 아님).
// 단일 캔버스를 재사용해 GLB 턴테이블을 보여준다. 백 계약은 Router가 그대로 처리.
import { copy } from '../copy';
import type { Screen } from '../router';

export interface ShowcaseScreenDeps {
  /** onHide에서 씬 복원 — scene.exitShowcase() + 탭 기준 stage 가시성 재정리 */
  onExit: () => void;
  /** 닫기 버튼 → router.back() */
  onClose: () => void;
  onShow: () => void;
  /** "다시 만들기" — 닫고 굽기 모달 재진입 (감상 진입 전용, 결과 연출에선 생략) */
  onRebake?: () => void;
}

export function createShowcaseScreen(
  recipeId: string,
  headline: string,
  large: boolean,
  deps: ShowcaseScreenDeps,
): Screen {
  const el = document.createElement('div');
  el.className = 'screen screen--overlay';

  const top = document.createElement('div');
  top.className = 'showcase-top';
  const title = document.createElement('div');
  title.className = 'showcase-title';
  title.textContent = copy.recipes.names[recipeId] ?? recipeId;
  const sub = document.createElement('div');
  sub.className = large ? 'showcase-headline large' : 'showcase-headline';
  sub.textContent = headline;
  top.append(title, sub);

  const bottom = document.createElement('div');
  bottom.className = 'showcase-bottom';
  if (deps.onRebake) {
    const rebake = document.createElement('button');
    rebake.className = 'btn btn-ghost';
    rebake.textContent = copy.recipes.bakeAgain;
    rebake.addEventListener('click', () => {
      deps.onClose(); // 씬 정리 먼저 — 굽기 모달은 홈 캔버스 위에 뜬다
      deps.onRebake?.();
    });
    bottom.appendChild(rebake);
  }
  const close = document.createElement('button');
  close.className = 'btn btn-primary';
  close.textContent = '좋아요';
  close.addEventListener('click', () => deps.onClose());
  bottom.appendChild(close);

  el.append(top, bottom);

  return {
    id: `showcase-${recipeId}`,
    el,
    onShow: () => deps.onShow(),
    onHide: () => deps.onExit(),
  };
}
