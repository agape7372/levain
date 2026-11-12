// 곰팡이 사망 모달 — 사실 서술 + 위로 한 문장, 종결 선택 2종 (GDD §3-4-1).
// 앱을 열 때마다 재노출되는 것이 올바른 동작 — moldy에서 가능한 일은 이 둘뿐이다.
import { copy } from '../copy';
import { openModal } from './modal';
import { toast } from './toast';
import type { GameApi } from '../gameApi';

/** onClose — 모달이 닫힌 뒤(곰팡이가 아니라 안 열렸으면 바로) 다음 모달을 잇는 자리 */
export function openMoldModal(api: GameApi, onClose?: () => void): void {
  const snap = api.getSnapshot();
  if (snap.phase !== 'moldy') {
    onClose?.();
    return;
  }

  const wrap = document.createElement('div');
  const body = document.createElement('p');
  body.className = 'modal-body';
  body.textContent = copy.mold.comfort;
  const hint = document.createElement('p');
  hint.className = 'modal-body';
  hint.textContent = snap.hasFlake ? copy.mold.hasFlake : copy.mold.noFlake;
  wrap.append(body, hint);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const discard = document.createElement('button');
  discard.className = snap.hasFlake ? 'btn btn-ghost' : 'btn btn-primary';
  discard.textContent = copy.mold.discard;
  discard.addEventListener('click', () => {
    handle.close();
    api.dispatch({ type: 'discardStarter' });
    toast(copy.mold.discarded);
  });
  actions.appendChild(discard);

  if (snap.hasFlake) {
    const restore = document.createElement('button');
    restore.className = 'btn btn-primary';
    restore.textContent = copy.mold.restore;
    restore.addEventListener('click', () => {
      handle.close();
      api.dispatch({ type: 'restoreFlake' });
      toast(copy.mold.restored);
    });
    actions.appendChild(restore);
  }

  wrap.appendChild(actions);
  const handle = openModal(wrap, { title: copy.mold.deadTitle, onClose });
}
