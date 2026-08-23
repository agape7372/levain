// deriveBriefing(preState, from, to) — 부재 중 일어난 일 요약(순수). 새 저장 상태 0개:
// pre-advance 상태의 경계 wall-clock이 (from, to]에 들면 시간순 수집.
// 오프라인 구간은 위치·비율 불변(액션은 앱에서만)이라 wall 환산이 단일 배율로 정확하다.
import type { BriefingKey, SimState } from './types';
import { BRIEFING_MIN_ABSENCE_H, HOUR, TEMP_MULT } from './constants';
import { boundariesH } from './derive';

export function deriveBriefing(state: SimState, from: number, to: number): BriefingKey[] {
  if (from >= to) return [];                                  // 역행 직후 — 오보 방지
  if (to - from < BRIEFING_MIN_ABSENCE_H * HOUR) return [];   // 짧은 부재 — 스팸 방지
  if (state.reviveProgress === 1) return [];                  // 부활 의식 중 — 경계 의미 없음

  const b = boundariesH(state);
  const mult = TEMP_MULT[state.location];
  const wallFor = (h: number): number =>
    state.locAnchorAt + Math.max(0, h * HOUR - state.effBaseMs) / mult;

  const entries: Array<[number, BriefingKey]> = [
    [wallFor(b.peakStart), 'peaked'],
    [wallFor(b.hungry), 'becameHungry'],
    [wallFor(b.sour), 'becameSour'],
    [wallFor(b.hooch), 'hoochAppeared'],
    [wallFor(b.dormant), 'wentDormant'],
    [wallFor(b.moldSpot), 'moldSpotted'],
    [wallFor(b.moldSpread), 'moldSpread'],
    [wallFor(b.moldDead), 'moldDied'],
  ];
  return entries
    .filter(([at]) => at > from && at <= to)
    .sort((a, c) => a[0] - c[0])
    .map(([, k]) => k);
}
