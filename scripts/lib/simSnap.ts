// 실제 sim 궤적의 시점 스냅샷 — motionlab 프리셋 · 렌더 테스트 공용(판정 H2, 2026-11-19).
// 손으로 짠 Snapshot은 sim이 만들 수 없는 조합(riseFill 1.2 + hunger 0.3 등)이 되어 실제 화면을 가렸다.
// 60일 묵은 5단계 르방을 T0에 밥 준 뒤 h시간을 advance → deriveSnapshot으로 굴린다(.work/judge-1119/judge.ts와 같은 식).
import { initialState, advance, deriveSnapshot } from '../../src/sim';
import type { FeedRatio, Flour, Location, SimState, Snapshot } from '../../src/sim';
import { STAGES } from '../../src/sim/constants';

const H = 3_600_000;
const D = 24 * H;
export const T0 = 1_800_000_000_000;

export interface SimSnapOpts {
  ratio?: FeedRatio;
  stage?: number;
  flour?: Flour;
  location?: Location;
  /** 르방 나이(일) — 생략하면 그 단계 구간의 가운데. 0단계 1.5일 = D2 가짜 부풀기 구간, 0.5일 = 첫날 */
  ageD?: number;
}

export function simState(o: SimSnapOpts = {}): SimState {
  const stage = o.stage ?? 5;
  const st = STAGES[stage];
  const ageD = o.ageD ?? (stage === 5 ? 60 : (st.days + STAGES[stage + 1].days) / 2);
  return {
    ...initialState(T0 - ageD * D),
    lastFedAt: T0, locAnchorAt: T0, lastSimulatedAt: T0,
    maturity: stage === 5 ? 999 : st.cycles,
    feedRatio: o.ratio ?? '1:1:1',
    acidity: 20,
    ...(o.flour ? { flour: o.flour } : {}),
    ...(o.location ? { location: o.location } : {}),
  };
}

/** 밥 준 뒤 h시간의 Snapshot */
export function simSnap(h: number, o: SimSnapOpts = {}): Snapshot {
  const t = T0 + h * H;
  return deriveSnapshot(advance(simState(o), t), t);
}

/**
 * 상태별 대표 시각(1:1:1 · 5단계, 밥 준 뒤 시간) — motionlab 프리셋과 렌더 테스트가 같은 표를 쓴다.
 * 배고픔은 경계 14h 직후가 아니라 한가운데(28h — 평평 · 고른 바늘구멍), 곰팡이는 번짐(260h)
 */
export const STATE_HOURS = {
  justfed: 0, rising: 3, peak: 5, falling: 9, hungry: 28, sour: 84, dormant: 144, moldy: 260,
} as const;
