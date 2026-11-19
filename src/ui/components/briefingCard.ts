// 복귀 브리핑 카드 — 부재 중 있었던 일을 시간순으로 (GDD §8-1). 정보만, 조작 없음.
import { copy } from '../copy';
import { openModal } from './modal';
import { briefingText } from '../format';
import type { BriefingKey, SmellBand } from '../../sim';

export function openBriefingCard(keys: BriefingKey[], smell: SmellBand, onClose?: () => void): void {
  if (keys.length === 0) {
    onClose?.();
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'observe-rows briefing-rows'; // 행 문법은 관찰 카드, 정렬은 목록(점 옆에 문장)
  for (const k of keys) {
    const row = document.createElement('div');
    row.className = 'row';
    const dot = document.createElement('span');
    dot.className = 'k';
    dot.textContent = '·';
    const v = document.createElement('span');
    v.className = 'v';
    v.textContent = briefingText(k, smell);
    row.append(dot, v);
    wrap.appendChild(row);
  }
  openModal(wrap, { title: copy.briefing.title, onClose });
}
