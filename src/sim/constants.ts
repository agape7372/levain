// 밸런스 상수 전부 이 파일 한 곳 — 수치 근거는 docs/GDD.md §3 (실제 르방 리듬)
import type { FeedRatio, Location } from './types';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** 온도 배율 — 모든 수치의 뿌리. 배고픔 14h ÷ 0.08 ≈ 7.3일 = 냉장 주 1회 */
export const TEMP_MULT: Record<Location, number> = {
  room: 1.0,
  window: 1.3,
  fridge: 0.08,
};

export interface RatioDef {
  /** 급여 후 총량 g (씨앗+가루+물) */
  mass: number;
  /** 활성 곡선 시간축 (유효시간 h) */
  latentH: number;
  peakStartH: number;
  peakEndH: number;
  hungryH: number;
  /** 급여 시 산미 희석 배수 */
  dilute: number;
  /** 해금 성장 단계 */
  stage: number;
}

/** 1:5:5는 씨앗 40g(실제 고배율 관행) — 40+200+200=440 ≤ 병 상한 480 */
export const RATIOS: Record<FeedRatio, RatioDef> = {
  '1:1:1': { mass: 180, latentH: 0.75, peakStartH: 4.5, peakEndH: 6, hungryH: 14, dilute: 0.55, stage: 0 },
  '1:2:2': { mass: 300, latentH: 0.75, peakStartH: 7, peakEndH: 9, hungryH: 20, dilute: 0.4, stage: 3 },
  '1:5:5': { mass: 440, latentH: 1.0, peakStartH: 10, peakEndH: 12, hungryH: 30, dilute: 0.3, stage: 4 },
};

/** 시큼·휴면은 배고픔 시점 기준 오프셋 (1:1:1이면 14h/36h/120h) */
export const SOUR_AFTER_HUNGRY_H = 22;
export const DORMANT_AFTER_HUNGRY_H = 106;
/** hooch(부유액) 시작: 배고픔 +34h (1:1:1이면 급여 후 48h) */
export const HOOCH_AFTER_HUNGRY_H = 34;

/**
 * 곰팡이 — 유일한 진짜 실패. 배고픔 기준 오프셋, 1:1:1 실온이면 급여 후 7일 반점 →
 * 10일 확산 → 14일 사망. 결정론(PRNG 금지) — 재정박이 간격을 보존해 시계 조작으로
 * 회피 불가. 창가는 더 이르고(더위가 곰팡이를 부른다), 냉장은 ≈175일로 밀린다.
 */
export const MOLD_SPOT_AFTER_HUNGRY_H = 154;   // 급여 후 168h = 7일 (휴면 +48h)
export const MOLD_SPREAD_AFTER_HUNGRY_H = 226; // 급여 후 240h = 10일 (휴면 +120h)
export const MOLD_DEAD_AFTER_HUNGRY_H = 322;   // 급여 후 336h = 14일 (휴면 +216h)

/** 건조 플레이크(죽음 보험): 3단계 해금, 활발 상태에서 -20g, 복원 시 maturity ×0.6 */
export const FLAKE_STAGE = 3;
export const FLAKE_COST_G = 20;
export const FLAKE_MATURITY_KEEP = 0.6;

/** 복귀 브리핑 최소 부재(wall-clock h) — 앱 전환 스팸 방지 */
export const BRIEFING_MIN_ABSENCE_H = 8;

/** 산미 누적 (유효시간당) */
export const ACID_RATE = { active: 0.3, hungry: 1.5, sour: 2.5, dormant: 0.5 } as const;
export const ACID_MAX = 100;

/** 냄새 구간 경계 (acidity) */
export const SMELL_BANDS: Array<[number, 'flour' | 'yogurt' | 'vinegar' | 'sharp' | 'acetone']> = [
  [15, 'flour'],
  [35, 'yogurt'],
  [60, 'vinegar'],
  [85, 'sharp'],
  [Infinity, 'acetone'],
];

/** maturity 적립 게이트: 직전 급여에서 유효 6h 이상 + phase가 활발·배고픔 */
export const MATURITY_MIN_GAP_H = 6;

/** 부활 의식: 1회차 급여 후 유효 8h 지나 2회차 급여 */
export const REVIVE_GAP_H = 8;

/** 병·씨앗 */
export const SEED_G = 60;
export const MASS_MAX = 480;
export const INITIAL_MASS = 180;

/** 성장 단계 게이트: [요구 사이클, 요구 일수] — max(둘 다 충족) */
export const STAGES: Array<{ cycles: number; days: number }> = [
  { cycles: 0, days: 0 },   // 0 갓 반죽
  { cycles: 3, days: 3 },   // 1 잠잠기
  { cycles: 7, days: 5 },   // 2 첫 기포
  { cycles: 12, days: 8 },  // 3 어린 르방
  { cycles: 21, days: 15 }, // 4 성숙 르방
  { cycles: 45, days: 30 }, // 5 노포
];

/** 냉장 보관 해금 단계 */
export const FRIDGE_STAGE = 3;

/** 굽기 판정 */
export const BAKE_ACTIVITY_W = 0.6;
export const BAKE_SOUR_W = 0.4;
export const GRADE_BEST = 0.85;
export const GRADE_GOOD = 0.6;

/** 띄워보기(float test) 통과 활성도 */
export const FLOAT_OK_ACTIVITY = 0.7;

/** 시계 방어 */
export const REWIND_TOLERANCE_MS = 5 * 60_000; // 5분 이내 역행은 무시(0 경과 취급)
/**
 * catch-up 상한 — 실온 곰팡이 종착(≤15일)+산미 포화가 고정점이라 그 이상은 관측 불변.
 * 곰팡이·phase는 파생이라 이 캡과 무관 — 캡은 acidity 적분의 안전벨트일 뿐.
 */
export const MAX_CATCHUP_MS = 60 * DAY;

/** 알림 */
export const QUIET_START_H = 22; // 로컬 시각 — 클램프 전용
export const QUIET_END_H = 8;
export const NOTIFY_SLOT_FEED = 1;
export const NOTIFY_SLOT_DORMANT = 2;
export const NOTIFY_SLOT_MOLD = 3; // 곰팡이 임박 경고 — 정확히 1건

/** 부피(fill) — 고무줄(급여 시점)=1.0 기준 */
export const FILL_MIN = 0.6;
export const FILL_MAX = 1.6;
export const FILL_PEAK_RISE = 0.6;   // 피크에서 1.0 + 0.6×stageFactor
export const FILL_HUNGRY = 0.8;
export const FILL_SOUR = 0.7;
export const FILL_DORMANT = 0.65;

/** 성장 단계별 부피 표현 계수 — 잠잠기(1단계)는 침묵기 억제 */
export const STAGE_FILL_FACTOR = [0.5, 0.3, 1.0, 1.0, 1.0, 1.0];
/** 0단계 D2 가짜 부풀기(실제 현상): 탄생 24~48h 구간의 부피 계수 */
export const FAKE_RISE_FACTOR = 1.2;
