// 관찰 카드 — 정보만, 조작 없음 (GDD §5). 상태 문구 탭으로 진입.
import { copy } from '../copy';
import { agoText, untilText } from '../format';
import { openModal } from './modal';
import type { GameApi } from '../gameApi';

export function openObserveCard(api: GameApi): void {
  const snap = api.getSnapshot();
  const now = api.now();

  const wrap = document.createElement('div');
  wrap.className = 'observe-rows';

  const rows: Array<[string, string]> = [
    ['냄새', copy.smell[snap.smell]],
    ['마지막 밥', copy.observe.lastFed(agoText(api.lastFedAt(), now))],
  ];
  if (snap.phase === 'active') {
    if (now < snap.peakAt) rows.push(['부풀기', copy.observe.peak(untilText(snap.peakAt, now) + ' 뒤')]);
    rows.push(['다음 밥', copy.observe.nextFeed(untilText(snap.nextFeedAt, now) + ' 뒤')]);
  }
  rows.push(['양', copy.observe.massG(snap.mass)]);

  for (const [k, v] of rows) {
    const row = document.createElement('div');
    row.className = 'row';
    const kEl = document.createElement('span');
    kEl.className = 'k';
    kEl.textContent = k;
    const vEl = document.createElement('span');
    vEl.className = 'v';
    vEl.textContent = v;
    row.append(kEl, vEl);
    wrap.appendChild(row);
  }

  openModal(wrap, { title: copy.actions.observe });
}
