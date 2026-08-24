// 식빵 — 팬 모양 각진 덩어리, 윗면만 리지형 돔. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 `assets/breads/specs/loaf.json`(워크스페이스 원본은
// assets/breads/work/loaf/). 스테이션·프로필·색은 그 스펙의 전사이며, 수치를 고칠 때는
// author_spec.py를 먼저 고치고 여기로 옮긴다.
//
// scone.ts의 "프로필 링을 스테이션(길이축)을 따라 스윕" 패턴을 재사용하되, scone과 반대로
// 여기서는 PROFILE(단면)이 열린 리스트가 아니라 닫힌 루프(중심-오른벽-돔-정상-왼돔-왼벽)이고
// STATIONS(X, 길이축)가 열린 스윕이다 — scone은 처음에 이 반대 구조로 시도했다가(둥근-삼각형
// 아웃라인을 중심으로 균일 스케일) 크랙이 정렬 안 되는 문제로 폐기했지만, 식빵은 애초에
// "길이축을 따라 일정한 단면을 스윕"하는 진짜 프리즘이라 이 구조가 맞다.
// 돔은 크라운 한 점으로 수렴하는 mound가 아니라 길이 방향으로 거의 평평한 ridge다
// (loaf-2.png 정면 뷰가 레벨탑 아치로 확인) — pancake/scone처럼 아웃라인을 중심으로 스케일하면
// mound가 되므로 쓰지 않는다.
import * as THREE from 'three';
import type { BreadBuilder } from './types';
import { facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvCylindrical } from './lib';

// 팔레트 — assets/prompts/breads/loaf.json geometry.crust 손 전사 (JSON import 금지, types.ts §8)
const DOME_COLOR = 0xc68958; // "thin golden-brown crust confined to the domed top only"
const SIDE_COLOR = 0xf4ead4; // "smooth matte cream sides, unbrowned"

// 실측 비율 (assets/breads/src/loaf-2.png 정면 · loaf-3.png 탑다운). Z 반폭=1.0 기준.
// width=1.0 단위: length=1.673, height=1.096 (image-analysis.json 참조). 절대 스케일은
// 무의미 — 런타임이 최장축 1.6으로 리핏한다 (types.ts §7).
const LENGTH = 1.673; // 반길이 — X는 -LENGTH..+LENGTH
const LOAF_HEIGHT = 1.096;
const RIM_HFRAC = 0.62; // 전체 높이의 62%에서 색 경계(테두리) — front elevation 색 전환 지점

// 단면 프로필 (닫힌 루프, zFrac·hFrac): 바닥중심 → 오른벽 → 오른돔 → 정상 → 왼돔 → 왼벽 → 바닥중심.
// 12점, 12갭(랩어라운드). 몸통 = p0..p3, p9..p11(wrap); 돔 = p3..p9.
const PROFILE: readonly (readonly [number, number])[] = [
  [0.0, 0.0], // p0 bottom center
  [0.95, 0.0], // p1 bottom edge (right)
  [1.0, 0.03], // p2 foot bevel
  [1.0, RIM_HFRAC], // p3 rim (shared boundary, right)
  [0.85, 0.78], // p4
  [0.55, 0.94], // p5
  [0.0, 1.0], // p6 crest
  [-0.55, 0.94], // p7
  [-0.85, 0.78], // p8
  [-1.0, RIM_HFRAC], // p9 rim (shared boundary, left)
  [-1.0, 0.03], // p10 foot bevel
  [-0.95, 0.0], // p11 bottom edge (left)
] as const;
// 몸통 갭을 먼저, 돔 갭을 나중에 순회하도록 명시 — sliceTriangles가 요구하는 연속 경계를
// 만든다(scone.ts와 동일한 재정렬 트릭; 프로필이 순수 순차 0..11이면 몸통이 두 토막
// [p0-3]·[p9-11-wrap]으로 쪼개져 연속 구간이 안 나온다).
const PROFILE_GAPS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [9, 10],
  [10, 11],
  [11, 0],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
];
const BODY_GAP_COUNT = 6; // PROFILE_GAPS의 처음 6개(위 순서대로) = 몸통, 나머지 6개 = 돔

// 스테이션(X, 길이축) — 중앙은 일정 단면, 양 끝 몇 스테이션만 zScale(발자국)·domeHeightScale
// (돔만, 벽/림은 항상 풀 높이)을 낮춰 코너를 둥글린다. loaf-3.png 탑다운에서 관찰된 완만한
// 모서리 라운딩 근사.
interface Station {
  x: number;
  zScale: number;
  domeHeightScale: number; // hFrac > RIM_HFRAC인 점에만 적용
}
// v3 (tier1 + aligned-crop comparison against ref-aligned.png): v2's taper zone was too wide -
// the reference's corners are fairly angular with only a small bevel, while v2's 3-station
// taper over ~0.37 length units read as noticeably more rounded/egg-shaped at both tips,
// lowering silhouette IoU despite a near-perfect aspect/scale match (0.0106). Compressed the
// taper to the last ~0.15 length units (closer to loaf-3.png's visibly tight corner radius)
// while keeping 2 intermediate steps so the crease from v1 does not come back.
const STATIONS: readonly Station[] = [
  { x: -LENGTH, zScale: 0.3, domeHeightScale: 0.6 },
  { x: -1.62, zScale: 0.75, domeHeightScale: 0.9 },
  { x: -1.55, zScale: 0.95, domeHeightScale: 0.99 },
  { x: -1.5, zScale: 1.0, domeHeightScale: 1.0 },
  { x: -0.65, zScale: 1.0, domeHeightScale: 1.0 },
  { x: 0.0, zScale: 1.0, domeHeightScale: 1.0 },
  { x: 0.65, zScale: 1.0, domeHeightScale: 1.0 },
  { x: 1.5, zScale: 1.0, domeHeightScale: 1.0 },
  { x: 1.55, zScale: 0.95, domeHeightScale: 0.99 },
  { x: 1.62, zScale: 0.75, domeHeightScale: 0.9 },
  { x: LENGTH, zScale: 0.3, domeHeightScale: 0.6 },
];

const JITTER_AMP = 0.006; // scone(0.01)보다 낮다 — 이 빵의 정체성은 매끈함(CRIB 명시 지시)

function loafPosition(station: Station, profilePoint: readonly [number, number]): [number, number, number] {
  const [zFrac, hFrac] = profilePoint;
  const isDome = hFrac > RIM_HFRAC + 1e-6;
  const heightScale = isDome ? station.domeHeightScale : 1.0;
  // 돔 구간만 낮출 때 림(RIM_HFRAC)을 고정점으로 스케일해야 벽 높이가 안 흔들린다.
  const scaledHFrac = isDome ? RIM_HFRAC + (hFrac - RIM_HFRAC) * heightScale : hFrac;
  return [zFrac * station.zScale, scaledHFrac * LOAF_HEIGHT, station.x];
}
// 참고: 여기서 "z"(프로필의 폭 방향)를 최종 X로, station.x(길이축)를 최종 Z로 담아 반환하지
// 않고 buildLoaf에서 축을 배정한다 — 카메라 방향 실험 결과(scone 참조)를 반영해 조립 단계에서
// 한 곳에 모아 뒤집기 쉽게 했다.

function buildLoaf(rng: () => number): { geometry: THREE.BufferGeometry } {
  const stationCount = STATIONS.length;
  const profileCount = PROFILE.length;

  // positions[stationIndex][profileIndex] = flat index into position buffer
  const positions: number[] = [];
  const indexOf = (si: number, pi: number): number => si * profileCount + pi;

  for (let si = 0; si < stationCount; si++) {
    const station = STATIONS[si];
    for (let pi = 0; pi < profileCount; pi++) {
      const [zLocal, y, xLocal] = loafPosition(station, PROFILE[pi]);
      // 길이축(X) = station.x, 폭축(Z) = 프로필의 zFrac. 카메라 "+X가 길이축" 관례
      // (lib.ts uvCylindrical 주석)을 그대로 따른다.
      positions.push(zLocal, y, xLocal);
    }
  }

  const index: number[] = [];
  for (const [pA, pB] of PROFILE_GAPS) {
    for (let si = 0; si < stationCount - 1; si++) {
      const a0 = indexOf(si, pA);
      const b0 = indexOf(si, pB);
      const a1 = indexOf(si + 1, pA);
      const b1 = indexOf(si + 1, pB);
      // v2: (a0,a1,b1)/(a0,b1,b0)에서 뒤집음 — 첫 시도는 안팎이 뒤집혀 렌더됨(법선 안쪽).
      index.push(a0, b1, a1);
      index.push(a0, b0, b1);
    }
  }

  // 끝단 캡 — 스테이션이 열린 스윕이라 양 끝의 프로필 루프가 닫혀있지 않다(zScale이 0으로
  // 안 가므로 pancake/scone의 극점 처리와 달리 진짜 구멍이 남는다). 부채꼴 삼각분할로 막는다.
  // 거의 안 보이는 끝단이라 전부 몸통 재질로 붙인다.
  const fanCap = (si: number, flip: boolean): void => {
    const start = indexOf(si, 0);
    for (let k = 1; k < profileCount - 1; k++) {
      const b = indexOf(si, k);
      const c = indexOf(si, k + 1);
      if (flip) index.push(start, c, b);
      else index.push(start, b, c);
    }
  };
  // v3: the two caps face OPPOSITE directions (-X vs +X), so they need OPPOSITE flip values -
  // verified analytically in assets/breads/work/loaf/check_cap_winding.py rather than guessed
  // a third time by re-rendering (v2's "flip both the same way" left a hole: one cap's normal
  // pointed inward, invisible to the front-face-culled default material).
  fanCap(0, true);
  fanCap(stationCount - 1, false);
  // 인덱스 순서 = 몸통 6갭 → 돔 6갭 → 끝단 캡 2개(append라 캡은 항상 맨 뒤).
  // 구간 경계 계산은 createLoaf가 갭·스테이션 수에서 직접 유도한다(sliceTriangles 3구간).

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  jitterVertices(geometry, rng, JITTER_AMP);
  return { geometry };
}

export const createLoaf: BreadBuilder = (rng) => {
  const group = new THREE.Group();
  const domeMat = stdMaterial({ color: DOME_COLOR });
  const sideMat = stdMaterial({ color: SIDE_COLOR });

  const { geometry } = buildLoaf(rng);
  const baked = facet(geometry);
  const total = baked.attributes.position.count / 3;
  // 갭 순서: 몸통 6갭 → 돔 6갭 → 끝단 캡 2개. 캡도 몸통 재질이므로 몸통 경계는
  // "돔 갭 시작 전"과 "돔 갭 끝(=캡 시작)" 두 지점을 알아야 한다 — buildLoaf가 반환하는
  // bodyTriangles는 몸통+캡을 합친 개수가 아니라 몸통 6갭만의 경계이도록 재계산한다.
  const stationCount = STATIONS.length;
  const bodyOnlyTriangles = BODY_GAP_COUNT * (stationCount - 1) * 2;
  const domeTriangles = (PROFILE_GAPS.length - BODY_GAP_COUNT) * (stationCount - 1) * 2;
  const domeEnd = bodyOnlyTriangles + domeTriangles;

  const bodyGeo1 = sliceTriangles(baked, 0, bodyOnlyTriangles);
  const domeGeo = sliceTriangles(baked, bodyOnlyTriangles, domeEnd);
  const bodyGeo2 = sliceTriangles(baked, domeEnd, total); // 끝단 캡 (몸통 재질)

  for (const geo of [bodyGeo1, domeGeo, bodyGeo2]) uvCylindrical(geo, 'x');

  group.add(new THREE.Mesh(bodyGeo1, sideMat));
  group.add(new THREE.Mesh(bodyGeo2, sideMat));
  group.add(new THREE.Mesh(domeGeo, domeMat));

  return mergeByMaterial(group);
};
