// 관찰 카드 — 정보 + 그 정보에 대한 응답 **1개**(말려두기)까지 (GDD §5, 개정 2026-08-25).
// 상태 문구 탭으로 진입. ★조작 1개 상한: 여기를 액션 서랍으로 만들지 말 것.
// 말려두기가 여기 있는 이유 = 이 카드가 "잃을 수도 있다"를 말하는 유일한 화면이고,
// 말려두기는 그에 대한 유일한 응답이기 때문이다. 다른 액션은 자기 자리를 따로 찾을 것.
import { copy } from '../copy';
import { agoText, untilText } from '../format';
import { confirmModal, openModal } from './modal';
import { FLAKE_COST_G, FLAKE_STAGE, SEED_G } from '../../sim';
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
    // 피크는 구간 — 단정 대신 범위 (§19-1). 구간 안이면 "한창때"
    if (now < snap.peakAt) {
      rows.push(['부풀기', copy.observe.peak(untilText(snap.peakAt, now), untilText(snap.peakEndAt, now))]);
    } else if (now < snap.peakEndAt) {
      rows.push(['부풀기', copy.observe.peakNow]);
    }
    rows.push(['다음 밥', copy.observe.nextFeed(untilText(snap.nextFeedAt, now) + ' 뒤')]);
  }

  // 진단 행 — 곰팡이로 오판하기 쉬운 상태들을 구분해 준다 (실사육의 오판 1순위)
  if (snap.phase !== 'moldy') {
    if (snap.moldStage === 'spot') rows.push(['표면', copy.diagnosis.moldSpot]);
    else if (snap.moldStage === 'spread') rows.push(['표면', copy.diagnosis.moldSpread]);
    else if (snap.kahm) rows.push(['표면', copy.diagnosis.kahm]);
    else if (snap.phase === 'dormant' && snap.dormancy >= 1) rows.push(['표면', copy.diagnosis.greySurface]);
    if (snap.moldStage === 'spot' || snap.moldStage === 'spread') {
      rows.push(['조심', copy.diagnosis.moldDeadline(untilText(snap.moldDeadAt, now) + ' 뒤')]);
    }
  }

  const flakeAt = api.flakeMadeAt();
  if (flakeAt !== null) rows.push(['보관', copy.flake.hasOne(agoText(flakeAt, now))]);
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

  // 말려두기 — 3단계 전엔 행 자체가 없다(초반 카드는 개정 전과 동일).
  // 게이트는 홈에 있던 것과 **같은 쌍**이다: 노출만 옮기고 비활성 조건을 빠뜨리면
  // 휴면·곰팡이에서 늘 눌리는데 조용히 아무 일도 안 하는 버튼이 된다(flakeBlocked를 아무도 안 읽는다).
  let actions: HTMLDivElement | null = null;
  if (snap.stage >= FLAKE_STAGE) {
    actions = document.createElement('div');
    actions.className = 'modal-actions observe-actions';
    const flakeBtn = document.createElement('button');
    flakeBtn.className = 'btn btn-ghost';
    flakeBtn.textContent = copy.flake.action;
    flakeBtn.disabled = snap.phase !== 'active' || snap.mass < SEED_G + FLAKE_COST_G;
    flakeBtn.addEventListener('click', () => {
      handle.close(); // 모달 위 모달 금지 — 닫고 나서 확인 (recipes.ts 굽기 흐름과 같은 순서)
      confirmModal({
        body: copy.flake.confirm,
        confirmLabel: copy.flake.action,
        cancelLabel: '다음에요',
        onConfirm: () => void api.dispatch({ type: 'makeFlake' }),
      });
    });
    actions.appendChild(flakeBtn);
  }

  const handle = openModal(wrap, { title: copy.actions.observe });
  if (actions) wrap.appendChild(actions);
}
