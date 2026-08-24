// 설정 — 중앙 모달. 소리·진동·알림 토글 + 기록 내보내기/불러오기 + 초기화(2단 확인).
import { copy } from '../copy';
import { LABEL_STAGE } from '../../sim';
import { confirmModal, openModal } from './modal';
import { toast } from './toast';
import type { GameApi } from '../gameApi';

function toggleRow(label: string, on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'settings-row';
  const span = document.createElement('span');
  span.textContent = label;
  const sw = document.createElement('button');
  sw.className = 'switch' + (on ? ' on' : '');
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-checked', String(on));
  sw.addEventListener('click', () => {
    const next = !sw.classList.contains('on');
    sw.classList.toggle('on', next);
    sw.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  row.append(span, sw);
  return row;
}

function actionRow(label: string, onClick: () => void): HTMLElement {
  const row = document.createElement('button');
  row.className = 'settings-row';
  row.textContent = label;
  row.addEventListener('click', onClick);
  return row;
}

export function openSettings(api: GameApi): void {
  const s = api.getSettings();
  const wrap = document.createElement('div');
  wrap.className = 'settings-rows';

  wrap.appendChild(toggleRow(copy.settings.sound, !s.muted, (v) => api.setSettings({ muted: !v })));
  wrap.appendChild(toggleRow(copy.settings.haptics, s.haptics, (v) => api.setSettings({ haptics: v })));
  wrap.appendChild(
    toggleRow(copy.settings.notify, s.notifyEnabled, (v) => {
      api.setSettings({ notifyEnabled: v });
      if (v) {
        void api.requestNotifyPermission().then((r) => {
          if (r === 'denied') {
            toast(copy.notify.permissionSettings);
            api.openNotifySettings();
          }
        });
      }
    }),
  );

  wrap.appendChild(
    actionRow(copy.settings.exportSave, () => {
      void api.exportSave().then(() => toast(copy.settings.exported));
    }),
  );
  wrap.appendChild(
    actionRow(copy.settings.importSave, () => {
      void api.importSave().then((ok) => toast(ok ? copy.settings.imported : copy.settings.importFailed));
    }),
  );
  // 병 이름표 — 5단계(노포) 해금 보상 (GDD §4)
  if (api.getSnapshot().stage >= LABEL_STAGE) {
    wrap.appendChild(
      actionRow(api.labelText() ? `이름표: ${api.labelText()}` : '이름표 붙이기', () => {
        const box = document.createElement('div');
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 12;
        input.value = api.labelText() ?? '';
        input.placeholder = '이름표';
        input.style.cssText =
          'width:100%;box-sizing:border-box;border:1.5px solid var(--bg-deep);border-radius:12px;padding:12px 14px;font:15px/1 inherit;font-family:inherit;color:var(--ink);background:var(--bg);outline:none';
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        const ok = document.createElement('button');
        ok.className = 'btn btn-primary';
        ok.textContent = '붙이기';
        ok.addEventListener('click', () => {
          api.rename(input.value);
          h.close();
        });
        actions.appendChild(ok);
        box.append(input, actions);
        const h = openModal(box, { title: '병 이름표' });
        input.focus();
      }),
    );
  }

  wrap.appendChild(
    actionRow(copy.settings.reset, () => {
      confirmModal({
        body: copy.settings.resetConfirm,
        confirmLabel: copy.settings.reset,
        cancelLabel: '그만두기',
        onConfirm: () =>
          confirmModal({
            body: copy.settings.resetConfirm2,
            confirmLabel: copy.settings.reset,
            cancelLabel: '그만두기',
            onConfirm: () => api.resetGame(),
          }),
      });
    }),
  );

  openModal(wrap, { title: copy.settings.title });
}
