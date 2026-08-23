// 홈 — 캔버스 위 HUD 오버레이. 상태 문구 탭 = 관찰 카드, 반죽 탭 = poke(게임필).
import { copy } from '../copy';
import { agoText, untilText } from '../format';
import { openModal } from '../components/modal';
import { openObserveCard } from '../components/observeCard';
import { openSettings } from '../components/settingsModal';
import { toast } from '../components/toast';
import type { GameApi } from '../gameApi';
import type { FeedRatio, Location, Snapshot } from '../../sim';
import { RATIOS } from '../../sim';
import type { Screen } from '../router';

const LOCATIONS: Location[] = ['room', 'window', 'fridge'];
const FRIDGE_STAGE = 3;

export function createHomeScreen(api: GameApi): Screen & { update(snap: Snapshot): void } {
  const el = document.createElement('div');
  el.className = 'screen screen--overlay';

  // ── 상단 HUD ──
  const top = document.createElement('div');
  top.className = 'hud-top';
  const status = document.createElement('button');
  status.className = 'hud-status';
  status.style.cssText = 'border:0;background:transparent;font:inherit;color:inherit;cursor:pointer';
  const sub = document.createElement('div');
  sub.className = 'hud-sub';
  const chip = document.createElement('div');
  chip.className = 'hud-stage-chip';
  top.append(status, sub, chip);
  status.addEventListener('click', () => openObserveCard(api));

  // ── 우상단 설정 ──
  const corner = document.createElement('div');
  corner.className = 'hud-corner';
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'icon-btn';
  settingsBtn.textContent = '⚙';
  settingsBtn.setAttribute('aria-label', copy.settings.title);
  settingsBtn.addEventListener('click', () => openSettings(api));
  corner.appendChild(settingsBtn);

  // ── 하단: 위치 세그먼트 + 밥 버튼 ──
  const bottom = document.createElement('div');
  bottom.className = 'hud-bottom';

  const seg = document.createElement('div');
  seg.className = 'seg';
  const segBtns = new Map<Location, HTMLButtonElement>();
  for (const loc of LOCATIONS) {
    const b = document.createElement('button');
    b.textContent = copy.actions.move[loc];
    b.addEventListener('click', () => {
      const events = api.dispatch({ type: 'setLocation', to: loc });
      if (events.some((e) => e.type === 'locationLocked')) {
        toast(copy.recipes.lockedHint(copy.stage.names[FRIDGE_STAGE]));
      }
    });
    segBtns.set(loc, b);
    seg.appendChild(b);
  }

  const feedBtn = document.createElement('button');
  feedBtn.className = 'btn btn-primary btn-wide';
  feedBtn.addEventListener('click', () => onFeedTap());

  bottom.append(seg, feedBtn);
  el.append(top, corner, bottom);

  function onFeedTap(): void {
    const snap = api.getSnapshot();
    if (snap.phase === 'dormant') {
      // 부활 의식 — 실온 확인 후 급여 (비율 선택 없이 기본 1:1:1, 의식은 담백하게)
      const events = api.dispatch({ type: 'feed', ratio: '1:1:1' });
      if (events.some((e) => e.type === 'needRoom')) toast(copy.revive.needRoom);
      return;
    }
    openRatioModal(snap);
  }

  let lastRatio: FeedRatio = '1:1:1';

  function openRatioModal(snap: Snapshot): void {
    const wrap = document.createElement('div');
    wrap.className = 'option-list';
    const ratios = (Object.keys(RATIOS) as FeedRatio[]).filter((r) => snap.stage >= RATIOS[r].stage);
    let selected: FeedRatio = ratios.includes(lastRatio) ? lastRatio : '1:1:1';

    const items = new Map<FeedRatio, HTMLButtonElement>();
    for (const r of ratios) {
      const item = document.createElement('button');
      item.className = 'option-item';
      const name = document.createElement('span');
      name.textContent = r;
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = copy.feed.ratioHint[r];
      item.append(name, hint);
      item.addEventListener('click', () => {
        selected = r;
        items.forEach((elBtn, key) => elBtn.classList.toggle('selected', key === r));
      });
      items.set(r, item);
      wrap.appendChild(item);
    }
    items.get(selected)?.classList.add('selected');

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const ok = document.createElement('button');
    ok.className = 'btn btn-primary';
    ok.textContent = copy.actions.feed;
    ok.addEventListener('click', () => {
      handle.close();
      lastRatio = selected;
      api.dispatch({ type: 'feed', ratio: selected });
    });
    actions.appendChild(ok);
    wrap.appendChild(actions);

    const handle = openModal(wrap, { title: copy.feed.ratioTitle });
  }

  function update(snap: Snapshot): void {
    const now = api.now();
    const phaseKey =
      snap.phase === 'active'
        ? snap.activity >= 0.85
          ? 'peak'
          : 'active'
        : snap.phase === 'dormant' && snap.dormancy < 1
          ? 'reviving'
          : snap.phase;
    status.textContent = copy.phase[phaseKey];

    if (snap.phase === 'active') {
      sub.textContent = `${copy.observe.lastFed(agoText(api.lastFedAt(), now))} · ${copy.observe.nextFeed(untilText(snap.nextFeedAt, now) + ' 뒤')}`;
    } else {
      sub.textContent = copy.observe.lastFed(agoText(api.lastFedAt(), now));
    }

    const label = api.labelText();
    chip.textContent = label ? `${label} · ${copy.stage.names[snap.stage]}` : copy.stage.names[snap.stage];

    feedBtn.textContent = snap.phase === 'dormant' ? copy.actions.wake : copy.actions.feed;

    // 위치 세그먼트 — 냉장은 3단계 해금 전 비활성 (문구 대신 옅은 비활성 — 사용자 규칙)
    const loc = api.location();
    segBtns.forEach((b, key) => {
      b.classList.toggle('active', key === loc);
      if (key === 'fridge') b.disabled = snap.stage < FRIDGE_STAGE;
    });
  }

  const unsub = api.subscribe((snap) => update(snap));

  return {
    id: 'home',
    el,
    update,
    onShow() {
      update(api.getSnapshot());
    },
    onHide() {
      void unsub; // 홈은 루트 — 실제 해제는 앱 종료 시
    },
  };
}
