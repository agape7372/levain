// advance(state, now) — 닫힌 함수 모델의 유일한 누적 갱신: 산미 적분 + 시계 방어.
// 적분 루프 없음 — 상태 전이 경계(최대 3개)로 구간을 잘라 요율×유효시간을 더할 뿐. O(1).
// 정본: docs/GDD.md §3-5·§3-8.
import type { SimState } from './types';
import {
  ACID_MAX,
  ACID_RATE,
  HOUR,
  MAX_CATCHUP_MS,
  REWIND_TOLERANCE_MS,
  TEMP_MULT,
} from './constants';
import { boundariesH, clamp } from './derive';

/**
 * 시계 역행: 모든 타임스탬프를 delta만큼 당겨 상대 간격을 보존한다 (GDD §3-8).
 * export 이유: 멀티 르방에서 역행은 "전 starter + 전역 도감"에 같은 delta로 적용돼야
 * 한다(확장기획 §5-1) — 그 순회는 store 층(gameStore)이 돈다. 새 타임스탬프 필드를
 * 추가하면 여기와 tests/clock.test.ts를 동시 갱신할 것.
 */
export function reanchor(state: SimState, delta: number): SimState {
  return {
    ...state,
    createdAt: state.createdAt - delta,
    lastFedAt: state.lastFedAt - delta,
    lastSimulatedAt: state.lastSimulatedAt - delta,
    locAnchorAt: state.locAnchorAt - delta,
    lastDiscardBakeAt: state.lastDiscardBakeAt === null ? null : state.lastDiscardBakeAt - delta,
    flake: state.flake === null ? null : { ...state.flake, madeAt: state.flake.madeAt - delta },
  };
}

export function advance(state: SimState, now: number): SimState {
  let s = state;

  if (now < s.lastSimulatedAt - REWIND_TOLERANCE_MS) {
    s = reanchor(s, s.lastSimulatedAt - now);
  }
  if (now <= s.lastSimulatedAt) return s; // 허용 오차 내 역행 — 무시

  const t0 = s.lastSimulatedAt;
  const t1 = Math.min(now, t0 + MAX_CATCHUP_MS); // 초과분은 포화 상태라 관측 차이 없음

  // 산미 적분 — [t0, t1]을 상태 전이 경계로 분할 (오프라인 중 위치·비율 불변이 전제:
  // 위치·급여는 액션이고, 액션은 tick(advance) 선행 후 적용된다)
  const mult = TEMP_MULT[s.location];
  const b = boundariesH(s);
  const wallFor = (h: number): number => s.locAnchorAt + Math.max(0, h * HOUR - s.effBaseMs) / mult;
  const cuts = [t0, wallFor(b.hungry), wallFor(b.sour), wallFor(b.dormant), t1]
    .filter((t) => t >= t0 && t <= t1)
    .sort((a, c) => a - c);

  let acidity = s.acidity;
  for (let i = 0; i < cuts.length - 1; i++) {
    const segStart = cuts[i];
    const segEnd = cuts[i + 1];
    if (segEnd <= segStart) continue;
    const effHours = ((segEnd - segStart) * mult) / HOUR;
    let rate: number;
    if (s.reviveProgress === 1) {
      rate = ACID_RATE.dormant; // 부활 의식 중 — 여전히 잠에서 깨는 중
    } else {
      const mid = (segStart + segEnd) / 2;
      const effH = (s.effBaseMs + Math.max(0, mid - s.locAnchorAt) * mult) / HOUR;
      if (effH < b.hungry) rate = ACID_RATE.active;
      else if (effH < b.sour) rate = ACID_RATE.hungry;
      else if (effH < b.dormant) rate = ACID_RATE.sour;
      else rate = ACID_RATE.dormant;
    }
    acidity += rate * effHours;
  }

  return { ...s, acidity: clamp(acidity, 0, ACID_MAX), lastSimulatedAt: now };
}
