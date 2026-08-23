// 복귀 브리핑 카드 — 부재 중 있었던 일을 시간순으로 (GDD §8-1). 정보만, 조작 없음.
import { copy } from '../copy';
import { openModal } from './modal';
import type { BriefingKey } from '../../sim';

export function openBriefingCard(keys: BriefingKey[], onClose?: () => void): void {
  if (keys.length === 0) {
    onClose?.();
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'observe-rows';
  for (const k of keys) {
    const row = document.createElement('div');
    row.className = 'row';
    const dot = document.createElement('span');
    dot.className = 'k';
    dot.textContent = '·';
    const v = document.createElement('span');
    v.className = 'v';
    v.textContent = copy.briefing[k];
    row.append(dot, v);
    wrap.appendChild(row);
  }
  openModal(wrap, { title: copy.briefing.title, onClose });
}
