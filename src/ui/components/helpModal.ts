// 설명서 — 우상단 ? 버튼. 읽기 전용(조작 0개)이라 관찰 카드의 "조작 1개 상한"(GDD §5)과
// 충돌하지 않는다. 여기에 버튼을 달지 말 것: 액션 서랍이 되는 순간 같은 규칙을 어긴다.
//
// 존재 이유: 상단 타임라인은 눈금 0개·숫자 0개·이름표 0개다(VISUAL §7-2, 그렇게 정했다).
// 발효 리듬을 아는 사람에게만 읽힌다는 뜻이라, 개념을 한 번은 말해 주는 자리가 필요하다.
import { copy } from '../copy';
import { openModal } from './modal';

/** 설명서 안의 축소판 타임라인 — 홈의 .hud-timeline 마크업을 그대로 쓰되 값은 고정. */
function timelineFigure(): HTMLElement {
  const fig = document.createElement('figure');
  fig.className = 'help-figure';

  const tl = document.createElement('div');
  // 홈과 같은 클래스 = 같은 그림. 여기서만 값을 고정한다(살아 있는 상태를 안 읽는다).
  tl.className = 'hud-timeline on';
  tl.setAttribute('aria-hidden', 'true');
  tl.style.setProperty('--p', '0.62'); // 밴드를 지난 자리 — 점과 진한 구간이 겹쳐 보이면 설명이 안 된다
  const peak = document.createElement('div');
  peak.className = 'tl-peak';
  peak.style.setProperty('--from', '0.32');
  peak.style.setProperty('--to', '0.43');
  const now = document.createElement('div');
  now.className = 'tl-now';
  tl.append(peak, now);

  // 이름표는 축소판에만 붙는다. 각 이름이 자기가 가리키는 지점 아래에 정확히 서야
  // 그림이 설명이 된다 — 그래서 균등 분배가 아니라 밴드 중심(37.5%)에 맞춘 절대 배치다.
  const legend = document.createElement('figcaption');
  legend.className = 'help-tl-legend';
  const fed = document.createElement('span');
  fed.className = 'at-start';
  fed.textContent = copy.help.timeline.fed;
  const peakLabel = document.createElement('span');
  peakLabel.className = 'at-peak';
  peakLabel.textContent = copy.help.timeline.peak;
  const hungry = document.createElement('span');
  hungry.className = 'at-end';
  hungry.textContent = copy.help.timeline.hungry;
  legend.append(fed, peakLabel, hungry);

  fig.append(tl, legend);
  return fig;
}

export function openHelp(): void {
  const wrap = document.createElement('div');
  wrap.className = 'help-doc';

  const intro = document.createElement('p');
  intro.className = 'help-intro';
  intro.textContent = copy.help.intro;
  wrap.appendChild(intro);

  copy.help.sections.forEach((s, i) => {
    const sec = document.createElement('section');
    sec.className = 'help-sec';
    const q = document.createElement('h3');
    q.className = 'help-q';
    q.textContent = s.q;
    const a = document.createElement('p');
    a.className = 'help-a';
    a.textContent = s.a;
    sec.append(q, a);
    // 그림은 "가는 선은 뭐예요" 절에만 — 말로만 하면 그 선을 못 찾는다
    if (i === 1) sec.appendChild(timelineFigure());
    wrap.appendChild(sec);
  });

  openModal(wrap, { title: copy.help.title });
}
