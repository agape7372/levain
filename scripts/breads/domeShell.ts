// 불(fire) 계열 돔 셸 공유 골격 — campagne·wholewheat이 같은 실루엣 계열이라 빌더 골격을
// 공유한다(팀 지시). 슬래시·크럼(campagne 전용)·스페클(wholewheat 전용)은 이 모듈이 반환한
// pre-jitter 지오메트리 위에 각 빌더가 이어 붙인 뒤 스스로 jitterVertices를 호출한다 — 지터는
// indexed 마지막 단계라야 한다(types.ts §3), 그 앞에 얹는 변위 순서는 호출자 재량.
import * as THREE from 'three';
import { buildRevolvedShell } from './lib';

export interface DomeShellSpec {
  domeHeight: number;
  segments: number;
  grooveCount: number;
  grooveZone: readonly [number, number]; // tFrac (0=밑변, 1=꼭짓점)
  grooveHalfWidthT: number;
  grooveDepth: number;
  wobble: { lobe3: number; lobe7: number; noise: number };
}

/** 타원 프로필 반지름 — r(t)=sqrt(1-t²) (t=0 밑변 r=1, t=1 꼭짓점 r=0). */
export function baseRadius(t: number): number {
  return Math.sqrt(Math.max(0, 1 - t * t));
}

/**
 * 돔 프로필 — 바네통 그루브를 프로필 자체에 굽는다(축대칭이라 섹터 격자 불필요, pancake
 * 기포와의 핵심 차이). 각 그루브는 3점(어깨-바닥-어깨) V노치.
 *
 * ⚠ t 오름차순 정렬 필수: 고정 꼬리 [0.9, 0.94, 0.97, 1.0]는 grooveZone 상한이 낮을 때(예:
 * campagne 0.97) 가정하고 넣은 값이라, grooveZone이 넓어져 마지막 그루브의 tOut이 0.9를
 * 넘으면(campagne 8그루브 시 tOut≈0.928) 삽입 순서 그대로 이어붙일 경우 0.928→0.9로
 * **역행**한다 — buildRevolvedShell은 배열 순서대로 링을 잇는 lathe라 이 역행이 그대로
 * 자기교차 접힘(pleat)이 되어 꼭짓점 부근 옆면에 주름 밴드를 만든다(본세션 코드 리뷰 지적,
 * campagne·wholewheat 둘 다 영향 — rye는 별도 로컬 프로필이라 무관). 그래서 밑면 두 점([0,0]·
 * [1,0])만 고정하고 나머지는 전부 모아 t로 정렬한 뒤 ε(1e-4) 이내 근접 중복만 제거한다.
 * 정렬은 rng와 무관 — 결정론(types.ts §5)이 깨지지 않는다.
 */
export function buildDomeProfile(spec: DomeShellSpec): [number, number][] {
  const rest: [number, number][] = [];
  for (const t of [0.015, 0.03]) rest.push([baseRadius(t), t]);
  for (let i = 0; i < spec.grooveCount; i++) {
    const tc = spec.grooveZone[0] + ((spec.grooveZone[1] - spec.grooveZone[0]) * (i + 0.5)) / spec.grooveCount;
    const tIn = tc - spec.grooveHalfWidthT;
    const tOut = tc + spec.grooveHalfWidthT;
    rest.push([baseRadius(tIn), tIn]);
    rest.push([baseRadius(tc) - spec.grooveDepth, tc]);
    rest.push([baseRadius(tOut), tOut]);
  }
  for (const t of [0.9, 0.94, 0.97, 1.0]) rest.push([baseRadius(t), t]);
  rest.sort((a, b) => a[1] - b[1]);
  const EPS = 1e-4;
  const deduped: [number, number][] = [];
  for (const p of rest) {
    if (deduped.length === 0 || p[1] - deduped[deduped.length - 1][1] > EPS) deduped.push(p);
  }
  return [[0, 0], [1, 0], ...deduped];
}

/** 손으로 부은 테두리 흔들림 — pancake.ts makeWobble과 동일 패턴(반지름 배율, 섹터 함수). */
export function makeDomeWobble(segments: number, rng: () => number, wobble: DomeShellSpec['wobble']): number[] {
  const phase3 = rng() * Math.PI * 2;
  const phase7 = rng() * Math.PI * 2;
  const radius: number[] = [];
  for (let s = 0; s < segments; s++) {
    const t = (s / segments) * Math.PI * 2;
    radius.push(
      1 + wobble.lobe3 * Math.sin(3 * t + phase3) + wobble.lobe7 * Math.sin(7 * t + phase7) + (rng() - 0.5) * wobble.noise,
    );
  }
  return radius;
}

/** ringPhase — 그루브 위상(1=마루/융기 0=골/그루브), 지오메트리와 텍스처가 공유하는 함수. */
export function ringPhase(t: number, spec: DomeShellSpec): number {
  const cyclePos = ((t - spec.grooveZone[0]) / (spec.grooveZone[1] - spec.grooveZone[0])) * spec.grooveCount;
  return (Math.cos(2 * Math.PI * cyclePos) + 1) / 2;
}

/**
 * 그루브+워블 적용된 indexed 돔 셸(지터 전). 반환된 geometry의 position은 이미 그루브
 * 프로필+워블 반영. 슬래시 등 빵별 추가 변위는 ringStart로 (ring, sector) 인덱스를 계산해
 * 호출자가 얹은 뒤 jitterVertices를 직접 호출할 것.
 */
export function buildGroovedDomeShell(
  spec: DomeShellSpec,
  rng: () => number,
): { geometry: THREE.BufferGeometry; ringStart: number[]; profile: [number, number][]; wobble: number[] } {
  const profile = buildDomeProfile(spec);
  const { geometry, ringStart } = buildRevolvedShell(profile, spec.segments, spec.domeHeight);
  const wobble = makeDomeWobble(spec.segments, rng, spec.wobble);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let ri = 0; ri < profile.length; ri++) {
    const [rFrac] = profile[ri];
    if (rFrac <= 1e-6) continue;
    for (let s = 0; s < spec.segments; s++) {
      const idx = ringStart[ri] + s;
      pos.setXYZ(idx, pos.getX(idx) * wobble[s], pos.getY(idx), pos.getZ(idx) * wobble[s]);
    }
  }
  pos.needsUpdate = true;
  return { geometry, ringStart, profile, wobble };
}
