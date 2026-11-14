// 설정 — 중앙 모달. 소리·진동 토글 + 알림(하위 모달) + 기록 내보내기/불러오기 + 초기화(2단 확인).
// 알림 항목은 2026-09-03부터 openNotifyModal 하위 모달이 소유한다 — 본문은 진입 행 하나.
import { copy } from '../copy';
import { LABEL_STAGE } from '../../sim';
import { confirmModal, openModal } from './modal';
import { toast } from './toast';
import type { GameApi } from '../gameApi';
import { APP_VERSION } from '../../version';

/** 문의 받는 곳 — 처리방침(docs/PRIVACY.md)에 적힌 주소와 같아야 한다 */
const CONTACT_MAIL = 'zaballgam@gmail.com';

function toggleRow(label: string, on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'settings-row';
  const span = document.createElement('span');
  span.textContent = label;
  const sw = document.createElement('button');
  sw.className = 'switch' + (on ? ' on' : '');
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-label', label);
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

/**
 * 잠글 수 있는 토글 행 (2026-09-03) — 마스터(알림 받기)가 꺼져 있을 때의 하위 항목용.
 * ★:disabled를 쓰지 않는다: 클릭이 죽으면 "왜 안 눌리는지" 말해 줄 기회가 사라진다
 * (항아리·냉장 세그·교환소와 같은 규약). 흐림은 인라인 — main.css는 이 라운드 범위 밖.
 */
function lockableToggleRow(
  label: string,
  on: boolean,
  onChange: (v: boolean) => void,
  onLockedTap: () => void,
): { el: HTMLElement; setLocked(v: boolean): void } {
  const row = document.createElement('div');
  row.className = 'settings-row';
  const span = document.createElement('span');
  span.textContent = label;
  const sw = document.createElement('button');
  sw.className = 'switch' + (on ? ' on' : '');
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-label', label);
  sw.setAttribute('aria-checked', String(on));
  let locked = false;
  sw.addEventListener('click', () => {
    if (locked) {
      onLockedTap();
      return;
    }
    const next = !sw.classList.contains('on');
    sw.classList.toggle('on', next);
    sw.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  row.append(span, sw);
  return {
    el: row,
    setLocked(v: boolean): void {
      locked = v;
      sw.classList.toggle('is-locked', v);
      sw.setAttribute('aria-disabled', String(v));
      row.classList.toggle('is-locked', v); // 흐림은 CSS(.settings-row.is-locked) — 인라인 style 금지

    },
  };
}

export function openSettings(api: GameApi): void {
  const s = api.getSettings();
  const wrap = document.createElement('div');
  wrap.className = 'settings-rows';

  wrap.appendChild(toggleRow(copy.settings.sound, !s.muted, (v) => api.setSettings({ muted: !v })));
  wrap.appendChild(toggleRow(copy.settings.haptics, s.haptics, (v) => api.setSettings({ haptics: v })));
  // 알림 — 항목이 6개(마스터+옵트인 4+방해 없는 시간)로 늘어 설정 본문을 잡아먹었다.
  // 진입 행 하나로 접고 하위 모달로 내린다 (2026-09-03).
  // 하위 모달은 설정을 닫고 연다 — 모달 위 모달 금지 (ARCHITECTURE §5, T7-09). 하위(알림·라이선스)를 닫으면 설정으로 돌아온다
  wrap.appendChild(actionRow(copy.settings.notifyTitle, () => {
    handle.close();
    openNotifyModal(api);
  }));

  wrap.appendChild(
    actionRow(copy.settings.exportSave, () => {
      void api.exportSave().then((ok) => {
        if (ok) toast(copy.settings.exported);
      });
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
      actionRow(api.labelText() ? copy.settings.label(api.labelText() ?? '') : copy.settings.labelAdd, () => {
        handle.close();
        const box = document.createElement('div');
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 12;
        input.value = api.labelText() ?? '';
        input.placeholder = copy.settings.labelPlaceholder;
        input.style.cssText =
          'width:100%;box-sizing:border-box;border:1.5px solid var(--bg-deep);border-radius:12px;padding:12px 14px;font-size:15px;line-height:1;font-family:inherit;color:var(--ink);background:var(--bg);outline:none';
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        const ok = document.createElement('button');
        ok.className = 'btn btn-primary';
        ok.textContent = copy.settings.labelApply;
        ok.addEventListener('click', () => {
          api.rename(input.value);
          h.close();
        });
        actions.appendChild(ok);
        box.append(input, actions);
        const h = openModal(box, { title: copy.settings.labelTitle });
        input.focus();
      }),
    );
  }

  // 처리방침 링크 — §13 요건(광고 SDK 도입 시 앱 내 링크 필수). window.open('_system')은
  // Capacitor WebView에서 외부 네비게이션을 시스템 브라우저로 위임하는 관례적 트리거.
  const privacyRow = actionRow(copy.settings.privacy, () => {
    window.open('https://levain-ota.vercel.app/privacy.html', '_system');
  });
  wrap.appendChild(privacyRow);
  // 광고 동의 다시 고르기 — 동의가 필요한 지역(EEA·UK 등)에서만 행이 생긴다 (Google UMP 요건, 감사 T2-08)
  void api.ads.privacyOptionsRequired().then((required) => {
    if (required) privacyRow.after(actionRow(copy.settings.adPrivacy, () => void api.ads.showPrivacyOptions()));
  });
  // 문의 (감사 T8-07). 오픈소스 라이선스 줄은 2026-11-13 사용자 요청으로 뺌
  wrap.appendChild(
    actionRow(copy.settings.contact, () => {
      const subject = encodeURIComponent(copy.settings.version(APP_VERSION));
      window.open(`mailto:${CONTACT_MAIL}?subject=${subject}`, '_system');
    }),
  );

  wrap.appendChild(
    actionRow(copy.settings.reset, () => {
      handle.close();
      confirmModal({
        body: copy.settings.resetConfirm,
        confirmLabel: copy.settings.reset,
        cancelLabel: copy.common.stop,
        onConfirm: () =>
          confirmModal({
            body: copy.settings.resetConfirm2,
            confirmLabel: copy.settings.reset,
            cancelLabel: copy.common.stop,
            onConfirm: () => api.resetGame(),
          }),
      });
    }),
  );

  // ── 버전 표시 + 개발자 모드 진입 (7탭 — 사용자 본인 치트, 배포 UI에선 그냥 버전 텍스트) ──
  const version = document.createElement('div');
  version.className = 'hint';
  version.style.cssText = 'text-align:center;padding:10px 0 2px;color:var(--ink-soft);user-select:none';
  version.textContent = copy.settings.version(APP_VERSION);
  let taps = 0;
  // 출시 빌드는 누구에게나 열리던 치트였다 (T7-07) — 판정은 api.devToolsEnabled() 한 곳
  // 허용 안 된 기기(출시 빌드)는 7탭 뒤 암호를 묻는다 — 맞으면 flags.dev가 심겨 그 기기만 열린다
  version.addEventListener('click', () => {
    taps += 1;
    if (taps !== 7 || wrap.querySelector('.dev-rows')) return;
    const open = (): void => {
      api.dev.unlockRecipes(); // 관리자 모드 = 레시피 전부 열림 (2026-11-14 사용자 요청)
      toast(copy.devMode.on);
      wrap.insertBefore(buildDevRows(api), version);
    };
    if (api.devToolsEnabled()) return open();
    taps = 0;
    const code = window.prompt('');
    if (code) void api.unlockDevTools(code).then((ok) => ok && open());
  });
  wrap.appendChild(version);

  const handle = openModal(wrap, { title: copy.settings.title });
}

/**
 * 알림 하위 모달 (2026-09-03) — 마스터 토글 + 항목 4종 + 방해 없는 시간 + 권한 안내.
 * 중앙 팝업 규약 그대로. 마스터가 꺼져 있어도 항목을 숨기지 않는다 —
 * "무엇을 켤 수 있는지"가 마스터를 켤 이유이므로, 잠근 채 보여주고 탭하면 이유를 말한다.
 */
function openNotifyModal(api: GameApi): void {
  const s = api.getSettings();
  const wrap = document.createElement('div');
  const rows = document.createElement('div');
  rows.className = 'settings-rows';
  wrap.appendChild(rows);

  const items: Array<{ setLocked(v: boolean): void }> = [];
  const syncLocked = (): void => {
    const locked = !api.getSettings().notifyEnabled;
    for (const it of items) it.setLocked(locked);
  };

  // 마스터 — 켤 때만 권한을 묻는다(끌 때 묻는 건 무의미). 거부하면 시스템 설정 안내.
  const master = lockableToggleRow(
    copy.settings.notify,
    s.notifyEnabled,
    (v) => {
      api.setSettings({ notifyEnabled: v });
      syncLocked();
      if (!v) return;
      void api.requestNotifyPermission().then((r) => {
        if (r === 'denied') {
          toast(copy.notify.permissionSettings);
          // 안내 줄은 열 때만 계산됐다 — 거부 결과를 그 자리에서 반영 (T7-16)
          permHint.textContent = copy.settings.notifyPermissionOff;
          permHint.hidden = false;
        }
      });
    },
    () => undefined, // 마스터는 잠기지 않는다
  );
  rows.appendChild(master.el);

  const addItem = (label: string, on: boolean, set: (v: boolean) => void): void => {
    const row = lockableToggleRow(label, on, set, () => toast(copy.settings.notifyMasterOff));
    items.push(row);
    rows.appendChild(row.el);
  };
  addItem(copy.settings.notifyPeak, s.notifyPeak, (v) => api.setSettings({ notifyPeak: v }));
  addItem(copy.settings.notifySour, s.notifySour, (v) => api.setSettings({ notifySour: v }));
  addItem(copy.settings.notifyStage, s.notifyStage, (v) => api.setSettings({ notifyStage: v }));
  addItem(copy.settings.notifyFirstWeek, s.notifyFirstWeek, (v) =>
    api.setSettings({ notifyFirstWeek: v }),
  );
  syncLocked();

  // 방해 없는 시간 — 시 단위 2선택. 시작=끝이면 조용시간 없음 (copy.quietValue가 '없음'으로 말한다)
  let toQuiet = false;
  const quietRow = actionRow('', () => {
    toQuiet = true; // 아래 onClose가 설정으로 돌아가지 않게
    handle.close(); // 모달 위 모달 금지 — 알림 모달을 닫고 연다
    openQuietModal(api);
  });
  quietRow.textContent = `${copy.settings.quiet}: ${copy.settings.quietValue(s.quietStartH, s.quietEndH)}`;
  rows.appendChild(quietRow);

  // 시스템 권한 안내 — 조회 전용이라 여기서 권한 팝업이 뜨지 않는다.
  // 웹('unavailable')에선 행 자체가 없다: 켤 시스템 설정이 없는데 안내만 남으면 거짓말이 된다.
  const permHint = document.createElement('div');
  permHint.className = 'settings-hint';
  permHint.hidden = true;
  wrap.appendChild(permHint);
  void api.checkNotifyPermission().then((state) => {
    if (state !== 'denied') return;
    permHint.textContent = copy.settings.notifyPermissionOff;
    permHint.hidden = false;
  });

  // 닫으면 한 단계 위(설정)로 — 하드웨어 백도 같은 길을 탄다
  const handle = openModal(wrap, {
    title: copy.settings.notifyTitle,
    onClose: () => {
      if (!toQuiet) openSettings(api);
    },
  });
}

/** 방해 없는 시간 편집 — 변경 즉시 저장·재예약(setSettings가 replan까지 태운다) */
function openQuietModal(api: GameApi): void {
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
  addRow(copy.settings.quietFrom, hourSelect(s.quietStartH, (h) => api.setSettings({ quietStartH: h })));
  addRow(copy.settings.quietTo, hourSelect(s.quietEndH, (h) => api.setSettings({ quietEndH: h })));
  wrap.appendChild(rows);

  // 닫으면 알림 창으로 돌아간다 — 바꾼 시간이 그 창의 행에 바로 보인다
  openModal(wrap, { title: copy.settings.quiet, onClose: () => openNotifyModal(api) });
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
