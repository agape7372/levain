// 홈 — 캔버스 위 HUD 오버레이. 상태 문구 탭 = 관찰 카드, 반죽 탭 = poke(게임필).
import { copy } from '../copy';
import { agoText, untilText } from '../format';
import { confirmModal, openModal } from '../components/modal';
import { openMoldModal } from '../components/moldModal';
import { openObserveCard } from '../components/observeCard';
import { openSettings } from '../components/settingsModal';
import { toast } from '../components/toast';
import type { GameApi } from '../gameApi';
import type { FeedRatio, Flour, Location, SimEvent, Snapshot } from '../../sim';
import {
  RATIOS, FRIDGE_STAGE, SEED_G,
  FLOUR_STAGE, HOUR, rateMult,
} from '../../sim';
// MASS_MAX는 sim/index가 재수출하지 않는다 — persistence.ts:10과 같은 직접 임포트
// (ESLint no-restricted-imports는 src/sim/** 안쪽에만 걸린다)
import { MASS_MAX } from '../../sim/constants';
import type { Screen } from '../router';

const LOCATIONS: Location[] = ['room', 'window', 'fridge'];

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
  // 멀티 르방 전환 — 스와이프의 접근성 대체이자 v1 진입로(§5-5). 한 마리면 숨김
  const chipRow = document.createElement('div');
  chipRow.className = 'hud-chip-row';
  const prevBtn = document.createElement('button');
  prevBtn.className = 'chip-nav';
  prevBtn.textContent = '‹';
  prevBtn.setAttribute('aria-label', copy.starter.prev);
  prevBtn.addEventListener('click', () => api.switchStarter(-1));
  const nextBtn = document.createElement('button');
  nextBtn.className = 'chip-nav';
  nextBtn.textContent = '›';
  nextBtn.setAttribute('aria-label', copy.starter.next);
  nextBtn.addEventListener('click', () => api.switchStarter(1));
  // 새 르방이 추가 — 정식 UI (2026-08-24 사용자 확정. 이름은 자동 "르방이 N", 개명은 5단계 게이트)
  const addBtn = document.createElement('button');
  addBtn.className = 'chip-nav';
  addBtn.textContent = '+';
  addBtn.setAttribute('aria-label', copy.starter.add);
  addBtn.addEventListener('click', () => {
    confirmModal({
      body: copy.starter.addConfirm,
      confirmLabel: copy.starter.add,
      cancelLabel: '다음에요',
      onConfirm: () => toast(api.addStarter() ? copy.starter.added : copy.starter.slotsFull),
    });
  });
  // prev/next는 하단 밥 주기 좌우에 산다 (사용자 지정 자리 — 화면 맨 위는 엄지가 안 닿는다).
  // 칩은 이름·순번만 표시한다.
  chipRow.append(chip, addBtn);
  // ── 발효 타임라인 — sub 문장("N시간 전에 밥 · N시간 뒤 배고픔")의 그림 ──
  // 축은 **유효시간**이다. wall-clock으로 그리면 냉장에 넣는 순간 점이 뒤로 점프한다
  // (nextFeedAt이 103시간 밀려서 5/14=36% → 5/117=4%). 르방이에겐 아무 일도 안 일어났는데
  // 화면이 "되감겼다"고 말하는 셈이다. 유효시간이면 위치는 그대로고 속도만 1/12.5로 떨어진다.
  const timeline = document.createElement('div');
  timeline.className = 'hud-timeline';
  timeline.setAttribute('aria-hidden', 'true'); // 같은 정보를 바로 위 sub 문장이 말한다
  const peakBand = document.createElement('div');
  peakBand.className = 'tl-peak';
  const nowDot = document.createElement('div');
  nowDot.className = 'tl-now';
  timeline.append(peakBand, nowDot);

  top.append(status, sub, timeline, chipRow);
  status.addEventListener('click', () => openObserveCard(api));

  // ── 우상단: 설정 + 보관 통 ──
  // 하단 = 세션마다 반복되는 조작의 자리(위 chipRow 주석), 여기 = 저빈도·읽기 위주 오브젝트의 자리.
  // 떼어내기는 canSplit이 유효 6h를 요구해 구조상 하루 1~2회가 상한이고, 잔량은 보기만 해도
  // 읽히므로 엄지 비용이 0이다 — 두 주석은 충돌이 아니라 같은 규칙의 양면이다.
  const corner = document.createElement('div');
  corner.className = 'hud-corner';
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'icon-btn';
  settingsBtn.textContent = '⚙';
  settingsBtn.setAttribute('aria-label', copy.settings.title);
  settingsBtn.addEventListener('click', () => openSettings(api));

  // 보관 통 — 떼어내기 버튼·잔량 칩·힌트 셋을 흡수한 오브젝트 (GDD §6-2).
  // 잔량은 수위로 읽힌다: 숫자 없이 양이 보이는 게 요점이라 라벨은 aria에만 둔다.
  const pantryJar = document.createElement('button');
  pantryJar.className = 'pantry-jar';
  const jarLid = document.createElement('span');
  jarLid.className = 'jar-lid';
  const jarBody = document.createElement('span');
  jarBody.className = 'jar-body';
  pantryJar.append(jarLid, jarBody);
  pantryJar.addEventListener('click', () => {
    const g = api.getSnapshot().mass - SEED_G;
    confirmModal({
      body: copy.split.confirm(g),
      confirmLabel: copy.split.action,
      cancelLabel: '다음에요',
      onConfirm: () => {
        const events = api.dispatch({ type: 'split' });
        const done = events.find((e): e is Extract<SimEvent, { type: 'split' }> => e.type === 'split');
        if (done) toast(copy.split.done(done.amount));
      },
    });
  });

  // 빈 통일 때만 뜨는 한 줄 — 병이 물건이 된 이상 "이게 뭐냐"에 답할 책임이 생긴다
  const pantryHint = document.createElement('span');
  pantryHint.className = 'pantry-hint';
  pantryHint.textContent = copy.pantry.hint;

  corner.append(settingsBtn, pantryJar, pantryHint);

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

  // 밥 주기 좌우 = 이전·다음 르방 (사용자 지정)
  // 하단은 2행이다 — 떼어내기는 우상단 보관 통으로, 말려두기는 관찰 카드로 옮겼다(2026-08-25).
  // 셋째 행을 되살리지 말 것: 밀집이 원래 불만이었다.
  const actionsRow = document.createElement('div');
  actionsRow.className = 'hud-actions';
  actionsRow.append(prevBtn, feedBtn, nextBtn);

  bottom.append(seg, actionsRow);
  el.append(top, corner, bottom);

  function onFeedTap(): void {
    const snap = api.getSnapshot();
    if (snap.phase === 'moldy') {
      openMoldModal(api);
      return;
    }
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
    type Choice = FeedRatio | 'fridgePrep';
    let selected: Choice = ratios.includes(lastRatio) ? lastRatio : '1:1:1';

    const items = new Map<Choice, HTMLButtonElement>();
    const addItem = (key: Choice, nameText: string, hintText: string): void => {
      const item = document.createElement('button');
      item.className = 'option-item';
      const name = document.createElement('span');
      name.textContent = nameText;
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = hintText;
      item.append(name, hint);
      item.addEventListener('click', () => {
        selected = key;
        items.forEach((elBtn, k) => elBtn.classList.toggle('selected', k === key));
      });
      items.set(key, item);
      wrap.appendChild(item);
    };
    for (const r of ratios) addItem(r, r, copy.feed.ratioHint[r]);
    // 냉장 갈 준비 — 밥(1:1:1) + 냉장 이동 묶음, 2탭을 1탭으로 (§7-1. 냉장 해금 후·냉장 밖에서만)
    if (snap.stage >= FRIDGE_STAGE && api.location() !== 'fridge') {
      addItem('fridgePrep', copy.feed.fridgePrep, copy.feed.fridgePrepHint);
    }
    items.get(selected)?.classList.add('selected');

    // ── 상세 펼치기 (§7-1 — 성숙 4단계 해금): 밀가루 선택 + 피크 범위 예보 ──
    // 기본값 = 현재 가루(스냅샷) — 앱 재시작에도 "쓰던 가루 유지"가 자연스럽다
    let selectedFlour: Flour = snap.flour;
    if (snap.stage >= FLOUR_STAGE) {
      const detail = document.createElement('div');
      detail.className = 'feed-detail';
      detail.style.display = 'none';

      const flourTitle = document.createElement('div');
      flourTitle.className = 'hint';
      flourTitle.textContent = copy.feed.flourTitle;
      flourTitle.style.cssText = 'margin:10px 0 6px';

      const flourRow = document.createElement('div');
      flourRow.className = 'seg';
      const flourBtns = new Map<Flour, HTMLButtonElement>();
      const FLOURS: Flour[] = ['white', 'wholewheat', 'rye'];

      const forecast = document.createElement('div');
      forecast.className = 'hint';
      forecast.style.cssText = 'margin-top:8px;text-align:center';

      const updateForecast = (): void => {
        // 피크 예보 — 선택한 비율·가루 + 현재 위치 기준. 범위로 말한다 (§19-1)
        const r = RATIOS[selected === 'fridgePrep' ? '1:1:1' : selected];
        const mult = rateMult({ location: api.location(), flour: selectedFlour });
        const now = api.now();
        const from = untilText(now + (r.peakStartH * HOUR) / mult, now);
        const to = untilText(now + (r.peakEndH * HOUR) / mult, now);
        forecast.textContent =
          copy.feed.peakForecast(from, to) +
          (api.location() === 'window' ? '' : ` · ${copy.feed.peakForecastWindow}`);
      };

      for (const f of FLOURS) {
        const b = document.createElement('button');
        b.textContent = copy.feed.flourNames[f];
        b.title = copy.feed.flourHint[f];
        b.classList.toggle('active', f === selectedFlour);
        b.addEventListener('click', () => {
          selectedFlour = f;
          flourBtns.forEach((btn, key) => btn.classList.toggle('active', key === f));
          updateForecast();
        });
        flourBtns.set(f, b);
        flourRow.appendChild(b);
      }

      detail.append(flourTitle, flourRow, forecast);

      const toggle = document.createElement('button');
      toggle.className = 'btn btn-ghost';
      toggle.style.cssText = 'width:100%;margin-top:4px';
      toggle.textContent = copy.feed.detailOpen;
      toggle.addEventListener('click', () => {
        const open = detail.style.display === 'none';
        detail.style.display = open ? '' : 'none';
        toggle.textContent = open ? copy.feed.detailClose : copy.feed.detailOpen;
        if (open) updateForecast();
      });

      // 비율 선택이 바뀌면 예보 갱신 — 기존 항목 클릭 핸들러 위에 얹는다
      items.forEach((btn) => btn.addEventListener('click', updateForecast));

      wrap.append(toggle, detail);
    }

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const ok = document.createElement('button');
    ok.className = 'btn btn-primary';
    ok.textContent = copy.actions.feed;
    ok.addEventListener('click', () => {
      handle.close();
      if (selected === 'fridgePrep') {
        api.dispatch({ type: 'feed', ratio: '1:1:1', flour: selectedFlour });
        api.dispatch({ type: 'setLocation', to: 'fridge' });
        return;
      }
      lastRatio = selected;
      api.dispatch({ type: 'feed', ratio: selected, flour: selectedFlour });
    });
    actions.appendChild(ok);
    wrap.appendChild(actions);

    const handle = openModal(wrap, { title: copy.feed.ratioTitle });
  }

  let lastStage = -1;

  function update(snap: Snapshot): void {
    const now = api.now();
    // 단계 승급 — 칩 펄스 (한 번, 되돌아오는 팝)
    if (lastStage >= 0 && snap.stage > lastStage) {
      chip.classList.remove('pulse');
      void chip.offsetWidth; // 재트리거용 리플로우
      chip.classList.add('pulse');
    }
    lastStage = snap.stage;
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

    // 타임라인은 sub가 두 마디일 때만 산다 — 같은 문장의 그림이라 조건도 같다.
    // peak에서도 스타일은 안 바꾼다: 점이 밴드 안에 있다는 기하가 곧 신호다.
    const showTimeline = snap.phase === 'active';
    timeline.classList.toggle('on', showTimeline);
    if (showTimeline) {
      const r = RATIOS[api.feedRatio()];
      const p = Math.min(1, Math.max(0, snap.effSinceFeedMs / (r.hungryH * HOUR)));
      timeline.style.setProperty('--p', p.toFixed(4));
      peakBand.style.setProperty('--from', (r.peakStartH / r.hungryH).toFixed(4));
      peakBand.style.setProperty('--to', (r.peakEndH / r.hungryH).toFixed(4));
    }

    const st = api.starters();
    const multi = st.count > 1;
    prevBtn.style.display = multi ? '' : 'none';
    nextBtn.style.display = multi ? '' : 'none';
    if (multi) {
      // ‹ 르방이 2 · 2/3 › — 빈 이름은 표시 시점 파생 (§5-3, 저장 안 함)
      const name = st.name ?? copy.starter.defaultName(st.ordinal);
      const next = copy.starter.pill(name, st.index, st.count);
      // 전환 방향으로 살짝 밀리며 교체 — 캔버스 슬라이드(SceneHost.slideSwap)와 같은 문법.
      // 칩이 제자리에서 글자만 바뀌면 '다른 르방으로 왔다'가 안 읽힌다
      if (chip.textContent !== next && chip.textContent !== '') {
        chip.classList.remove('chip-swap');
        void chip.offsetWidth; // 재트리거용 리플로우
        chip.classList.add('chip-swap');
      }
      chip.textContent = next;
    } else {
      chip.textContent = st.name
        ? `${st.name} · ${copy.stage.names[snap.stage]}`
        : copy.stage.names[snap.stage];
    }

    feedBtn.textContent =
      snap.phase === 'moldy' ? copy.actions.observe
      : snap.phase === 'dormant' ? copy.actions.wake
      : copy.actions.feed;

    // 보관 통 — 곰팡이엔 숨김(그 화면엔 다른 말이 없다). 휴면은 뗄 수 없지만 통에 남은 게
    // 있으면 재고는 계속 읽혀야 하므로, 빈 통일 때만 같이 숨긴다.
    const pantry = api.pantry();
    const splittable = snap.phase !== 'moldy' && snap.phase !== 'dormant';
    const showJar = snap.phase !== 'moldy' && (splittable || pantry > 0);
    pantryJar.style.display = showJar ? '' : 'none';
    // 뚜껑 = 조작 어포던스, 몸통 = 재고 readout. canSplit이 급여 후 6h 게이트라 자주 false인데
    // 그때마다 재고 표시까지 죽으면 안 된다 — 비활성은 뚜껑에만 준다(CSS가 분리 처리).
    pantryJar.disabled = !snap.canSplit || !splittable;
    // 수위 = 병 용량(MASS_MAX) 대비. 1:1:1 한 판(120g) = 25% → 네 사이클이면 가득.
    // 하한 10%는 굽기 잔돈 구간에서 "조금 남았다"와 "다 썼다"를 가른다.
    const fill = pantry === 0 ? 0 : Math.min(100, Math.max(10, (pantry / MASS_MAX) * 100));
    jarBody.style.setProperty('--fill', `${fill.toFixed(1)}%`);
    pantryJar.setAttribute('aria-label', pantry > 0 ? copy.pantry.label(pantry) : copy.pantry.empty);
    // 힌트는 빈 통일 때만 — 병이 뭘 하는 물건인지 한 번은 말해 줘야 발견이 막히지 않는다
    const showHint = showJar && pantry === 0;
    pantryHint.style.display = showHint ? '' : 'none';

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
