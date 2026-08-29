// 설정 — 중앙 모달. 소리·진동·알림 토글 + 기록 내보내기/불러오기 + 초기화(2단 확인).
import { copy } from '../copy';
import { LABEL_STAGE } from '../../sim';
import { confirmModal, openModal } from './modal';
import { toast } from './toast';
import type { GameApi } from '../gameApi';
import { APP_VERSION } from '../../version';

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

  // 한창때 알림 — 옵트인(기본 off). 마스터 토글(notifyEnabled)이 꺼져 있으면 플랜 자체가
  // 비니 여기서 따로 게이트하지 않는다 — 켜두면 마스터를 켤 때 같이 살아난다.
  wrap.appendChild(
    toggleRow(copy.settings.notifyPeak, s.notifyPeak, (v) => api.setSettings({ notifyPeak: v })),
  );

  // 방해 없는 시간 — 시 단위 2선택. 시작=끝이면 조용시간 없음 (copy.quietValue가 '없음'으로 말한다)
  const quietRow = actionRow('', () => openQuietModal(api, syncQuietLabel));
  const syncQuietLabel = (): void => {
    const cur = api.getSettings();
    quietRow.textContent = `${copy.settings.quiet}: ${copy.settings.quietValue(cur.quietStartH, cur.quietEndH)}`;
  };
  syncQuietLabel();
  wrap.appendChild(quietRow);

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

  // ── 버전 표시 + 개발자 모드 진입 (7탭 — 사용자 본인 치트, 배포 UI에선 그냥 버전 텍스트) ──
  const version = document.createElement('div');
  version.className = 'hint';
  version.style.cssText = 'text-align:center;padding:10px 0 2px;color:var(--ink-soft,#8a6a4a);user-select:none';
  version.textContent = `르방이 v${APP_VERSION}`;
  let taps = 0;
  version.addEventListener('click', () => {
    taps += 1;
    if (taps === 7 && !wrap.querySelector('.dev-rows')) {
      toast(copy.devMode.on);
      wrap.insertBefore(buildDevRows(api), version);
    }
  });
  wrap.appendChild(version);

  openModal(wrap, { title: copy.settings.title });
}

/** 방해 없는 시간 편집 — 변경 즉시 저장·재예약(setSettings가 replan까지 태운다) */
function openQuietModal(api: GameApi, onChanged?: () => void): void {
  const s = api.getSettings();
  const wrap = document.createElement('div');

  const body = document.createElement('p');
  body.className = 'modal-body';
  body.textContent = copy.settings.quietBody;
  wrap.appendChild(body);

  const hourSelect = (value: number, onChange: (h: number) => void): HTMLSelectElement => {
    const sel = document.createElement('select');
    sel.className = 'quiet-select';
    for (let h = 0; h < 24; h++) {
      const opt = document.createElement('option');
      opt.value = String(h);
      opt.textContent = `${h}시`;
      if (h === value) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => onChange(Number(sel.value)));
    return sel;
  };

  const rows = document.createElement('div');
  rows.className = 'settings-rows';
  rows.style.marginTop = '12px';
  const addRow = (label: string, sel: HTMLSelectElement): void => {
    const row = document.createElement('div');
    row.className = 'settings-row';
    const span = document.createElement('span');
    span.textContent = label;
    row.append(span, sel);
    rows.appendChild(row);
  };
  addRow(copy.settings.quietFrom, hourSelect(s.quietStartH, (h) => {
    api.setSettings({ quietStartH: h });
    onChanged?.();
  }));
  addRow(copy.settings.quietTo, hourSelect(s.quietEndH, (h) => {
    api.setSettings({ quietEndH: h });
    onChanged?.();
  }));
  wrap.appendChild(rows);

  openModal(wrap, { title: copy.settings.quiet });
}

/** 개발자 섹션 — 성장·재료·멀티·도감 치트. 게이트(슬롯 상한 등)는 store 규칙 그대로 */
function buildDevRows(api: GameApi): HTMLElement {
  const box = document.createElement('div');
  box.className = 'dev-rows';
  const title = document.createElement('div');
  title.className = 'hint';
  title.style.cssText = 'margin:8px 0 4px;font-weight:600';
  title.textContent = copy.devMode.title;
  box.appendChild(title);
  box.appendChild(actionRow(copy.devMode.mature, () => {
    api.dev.matureActive();
    toast(copy.devMode.done);
  }));
  box.appendChild(actionRow(copy.devMode.ingredients, () => {
    api.dev.grantAllIngredients();
    toast(copy.devMode.done);
  }));
  box.appendChild(actionRow(copy.devMode.addStarter, () => {
    toast(api.addStarter() ? copy.devMode.done : copy.devMode.slotsFull);
  }));
  box.appendChild(actionRow(copy.devMode.collection, () => {
    api.dev.completeCollection();
    toast(copy.devMode.done);
  }));
  return box;
}
