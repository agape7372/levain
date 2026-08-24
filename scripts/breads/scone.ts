// 스콘 — 둥근 스콘에서 자른 두툼한 웨지. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 `assets/breads/specs/scone.json`(워크스페이스 원본은
// assets/breads/work/scone/). 아웃라인·프로필·색은 그 스펙의 전사이며, 수치를 고칠 때는
// author_spec.py를 먼저 고치고 여기로 옮긴다.
//
// pancake.ts의 buildDisk 패턴을 원형이 아닌 손으로 지은 둥근-삼각형 아웃라인으로 일반화했다
// (lib.ts buildRevolvedShell은 링마다 단일 (sx,sz) 타원 배율만 허용해 섹터별로 다른 반지름이
// 필요한 이 아웃라인엔 맞지 않는다 — scone은 자체 링 구성을 쓴다). 세 가지는 여기서 구현한다:
//   1. OUTLINE은 원이 아니라 18점 직교좌표 폴리곤(assets/breads/work/scone/outline_gen.py에서
//      생성) — 꼭짓점은 필렛 처리하고 직선 컷 엣지엔 명시적 중간점을 둬서(균열이 걸릴 자리를
//      만들려고) 균일 각도 샘플링을 피했다.
//   2. 몸통·윗면을 **한 덩어리 indexed 지오메트리**로 만든 뒤 마지막에 삼각형을 갈라
//      머티리얼 2벌로 나눈다(pancake.ts sliceTriangles 패턴, lib.ts로 공유 승격).
//   3. 균열 = 정점 함몰(추가 메시 아님, tri 0 증가) — "격자 셀 최근접" 매칭으로 섹터마다
//      목표 Z에 가장 가까운 윗면 링을 찾아 판다(연속 좌표 감쇠 아님). 상세는 아래 FISSURE_MECHANISM.
import * as THREE from 'three';
import type { BreadBuilder } from './types';
import { facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvDome } from './lib';

// 팔레트 — assets/prompts/breads/scone.json geometry.crust 손 전사 (JSON import 금지, types.ts §8)
const TOP_COLOR = 0xd6a15c; // "top face only in pale golden brown #D6A15C"
const SIDE_COLOR = 0xf4ead4; // "side faces left uncolored cream #F4EAD4"

// 둥근-삼각형 아웃라인 (18점, 직교좌표) — assets/breads/work/scone/outline_gen.py 산출을 전사.
// 꼭짓점이 +Z(하네스 정면)를 향하고 +X쪽으로 살짝 기운다("pointed corner facing forward and
// slightly to the side", scone.json). 특성 반지름 ~1.0; 절대 스케일은 무의미(types.ts §7).
// v2(반복 1, cmp-1.png 판정 후): 꼭짓점 필렛이 너무 작아(비율 0.10) 나이프 포인트처럼
// 렌더됐다(tier1 bilateralSymmetryError 0.195·IoU 0.669) — 원본 꼭짓점을 안으로 당기고
// 필렛 비율을 0.10→0.26(꼭짓점)·0.16→0.30(뒷코너)로 크게 늘렸다.
// v3: apex_tip 정점이 자기 어깨점보다 여전히 66.8도로 튀어나와 있어 컷 방향 코너와 팁 위치를
// 분리(122.5도로 완화).
// v4(iteration 1 tier1 재판정): v3에서 apex_tip을 당기며 꼭짓점~뒷변 Z깊이가 1.31로 줄어
// X폭 1.92 대비 0.68(목표 ~0.88)로 얕아져 칼날처럼 보였다 — 뒷코너 Z를 -0.52/-0.58→
// -0.72/-0.78로 밀어 깊이를 복원. 상세는 outline_gen.py.
// v5(확정): 아웃라인 전체를 Y축 180° 강체 회전(x·z 동시 부호 반전 — 단순 Z반전과 달리
// 와인딩/법선이 보존된다). v4는 정렬 프레임에서 꼭짓점이 멀리/높게, 뒷변이 가까이/낮게 —
// 레퍼런스와 정반대였고, 회전 후 IoU 0.659→0.821로 확정(비대칭 빵은 방향을 1반복차에
// 확인하라는 CRIB 규칙의 유래 사례).
const OUTLINE: readonly (readonly [number, number])[] = [
  [0.1882, -0.4788], // apex_l
  [0.2918, -0.322], // left_edge_0
  [0.3954, -0.1652], // left_edge_1
  [0.4989, -0.0084], // left_edge_2
  [0.6025, 0.1485], // left_edge_3
  [0.659, 0.234], // bl_toward_apex
  [0.98, 0.72], // back_left_tip
  [0.7112, 0.7284], // bl_toward_arc
  [0.02, 0.85], // arc_mid (뒷변 바깥쪽 완만한 호 — 원 스콘의 크러스트 아크 근사)
  [-0.6712, 0.7716], // br_toward_arc
  [-0.94, 0.78], // back_right_tip
  [-0.685, 0.276], // br_toward_apex
  [-0.6027, 0.1134], // right_edge_0
  [-0.5204, -0.0492], // right_edge_1
  [-0.4382, -0.2119], // right_edge_2
  [-0.3559, -0.3745], // right_edge_3
  [-0.311, -0.4632], // apex_r
  [-0.05, -0.66], // apex_tip
] as const;
const SEGMENTS = OUTLINE.length; // 18

// 높이/폭 = 0.5 (scone.json notes_ko v3: "height = width/2인 두툼한 조각").
// 폭 = 2*특성반지름(~1.0) 이므로 높이 ~1.0.
const WEDGE_HEIGHT = 1.0;

// 몸통: 바닥 극점 → 바닥 엣지 → 살짝 발 플레어 → 공유 림(색 경계). 컷면이 거의 수직이라
// 테이퍼는 거의 없다.
const BODY_PROFILE: readonly (readonly [number, number])[] = [
  [0.0, 0.0],
  [0.97, 0.0],
  [1.0, 0.04],
  [1.0, 0.2],
  [0.99, 0.48],
  [0.98, 0.82],
];
// 윗면: 공유 림(BODY_PROFILE 마지막과 중복) → 돔 링 → 크라운 극점.
const FACE_PROFILE: readonly (readonly [number, number])[] = [
  [0.98, 0.82],
  [0.87, 0.87],
  [0.74, 0.92],
  [0.6, 0.96],
  [0.45, 0.99],
  [0.3, 1.02],
  [0.15, 1.04],
  [0.0, 1.05],
];
// 균열 매칭 후보 링(rFrac) — 공유 림(0.98)·크라운(0.0)은 제외해 경계 심과 크라운 단일 정점을
// 건드리지 않는다.
const FISSURE_RING_FRACS: readonly number[] = [0.87, 0.74, 0.6, 0.45, 0.3, 0.15];
// 목표 Z (꼭짓점=+1 .. 뒷변~-1). assets/breads/work/scone/check_fissures.py로 검증(v4 깊이
// 복원 후 재확인): 4/18, 7/18, 13/18 섹터 매칭 — 꼭짓점 쪽이 자연히 짧아진다(레퍼런스와 일치).
const FISSURE_TARGETS_Z: readonly number[] = [-0.48, -0.28, -0.08]; // v5 회전(위 주석)에 맞춰 부호 반전된 값
const FISSURE_TOLERANCE = 0.18;
// surface-pass (iteration): 0.06 read too soft (feature score 0.62, below the 0.75 mustPass
// floor); 0.11 read clearly in shot-180 but was still faint from other angles. Bumped to 0.15 -
// still short of piercing the shared rim ring (hFrac gap rim->crown is 0.82->1.05, a 0.23 span).
const FISSURE_DEPTH = 0.15;
const WOBBLE_AMP = 0.02;
const JITTER_AMP = 0.01;

/**
 * 균열 함몰 — pancake의 기포 딤플을 점에서 선으로 일반화했다. 섹터마다, 목표 Z마다
 * FISSURE_RING_FRACS 중 그 섹터에서 실제 Z(ringFrac * outlineZ(sector))가 목표에 가장
 * 가까운 링을 찾아 허용오차(0.18) 안이면 그 (ring,sector) 정점만 판다 — 연속 좌표 감쇠가
 * 아니라 이미 존재하는 격자 정점을 스냅해 고르므로, 디테일이 정점 간격보다 작아 조용히
 * 사라지는 CRIB 함정을 구조적으로 피한다. 매칭 실패 섹터는 그냥 건너뛰어(펜스 없음)
 * 각 균열이 꼭짓점 쪽에서 자연히 짧아지게 둔다 — 레퍼런스의 관찰과 일치.
 * (첫 시도: 아웃라인 10점 전부 꼭짓점·뒷코너 필렛에만 써서 컷 엣지 중간에 격자가 없었고,
 * 꼭짓점 쪽 균열 2개가 3/10 섹터로만 걸렸다 — outline_gen.py가 엣지 중간점을 추가한 이유.)
 */
function dipFissures(positions: number[], ringStart: number[], rings: readonly (readonly [number, number])[]): void {
  for (let s = 0; s < SEGMENTS; s++) {
    const outlineZ = OUTLINE[s][1];
    for (const targetZ of FISSURE_TARGETS_Z) {
      let bestRingIndex = -1;
      let bestDelta = Infinity;
      for (let ri = 0; ri < rings.length; ri++) {
        const rFrac = rings[ri][0];
        if (!FISSURE_RING_FRACS.includes(rFrac)) continue;
        const z = rFrac * outlineZ;
        const delta = Math.abs(z - targetZ);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestRingIndex = ri;
        }
      }
      if (bestRingIndex >= 0 && bestDelta <= FISSURE_TOLERANCE) {
        const idx = ringStart[bestRingIndex] + s;
        positions[idx * 3 + 1] -= FISSURE_DEPTH;
      }
    }
  }
}

/** 섹터별 반지름 지터 — 아웃라인 자체가 이미 비대칭 삼각형이라 pancake보다 진폭을 낮췄다. */
function makeWobble(rng: () => number): { radius: number[]; rimLift: number[] } {
  const radius: number[] = [];
  const rimLift: number[] = [];
  for (let s = 0; s < SEGMENTS; s++) {
    radius.push(1 + (rng() - 0.5) * 2 * WOBBLE_AMP);
    rimLift.push((rng() - 0.5) * 2 * WOBBLE_AMP * WEDGE_HEIGHT * 0.3);
  }
  return { radius, rimLift };
}

function buildWedge(rng: () => number): { geometry: THREE.BufferGeometry; bodyTriangles: number } {
  const wobble = makeWobble(rng);
  const rings: readonly (readonly [number, number])[] = [...BODY_PROFILE, ...FACE_PROFILE.slice(1)];
  const sharedRingIndex = BODY_PROFILE.length - 1;

  const positions: number[] = [];
  const ringStart: number[] = [];
  for (let ri = 0; ri < rings.length; ri++) {
    const [rFrac, hFrac] = rings[ri];
    ringStart.push(positions.length / 3);
    if (rFrac <= 1e-6) {
      positions.push(0, hFrac * WEDGE_HEIGHT, 0);
      continue;
    }
    for (let s = 0; s < SEGMENTS; s++) {
      const [ox, oz] = OUTLINE[s];
      const rr = rFrac * wobble.radius[s];
      const y = hFrac * WEDGE_HEIGHT + wobble.rimLift[s] * rFrac;
      positions.push(ox * rr, y, oz * rr);
    }
  }

  // 균열은 지터 전, 베이스 아웃라인(pre-wobble) 좌표 기준으로 판다 — check_fissures.py와
  // 동일한 수치로 매칭해야 검증한 커버리지가 그대로 유지된다.
  dipFissures(positions, ringStart, rings);

  const index: number[] = [];
  let bodyTriangles = 0;
  for (let ri = 0; ri < rings.length - 1; ri++) {
    const a0 = ringStart[ri];
    const b0 = ringStart[ri + 1];
    const aPole = rings[ri][0] <= 1e-6;
    const bPole = rings[ri + 1][0] <= 1e-6;
    // 와인딩 관례는 pancake.ts와 동일(t 증가가 위에서 볼 때 시계방향이라 순진한 (s,s1,...)
    // 감기는 법선이 안쪽을 향한다) — 렌더에서 뒤집혀 보이면 이 두 분기의 s/s1 순서를 바꾼다.
    for (let s = 0; s < SEGMENTS; s++) {
      const s1 = (s + 1) % SEGMENTS;
      if (aPole) {
        index.push(a0, b0 + s, b0 + s1);
      } else if (bPole) {
        index.push(a0 + s1, a0 + s, b0);
      } else {
        index.push(a0 + s, b0 + s1, a0 + s1);
        index.push(a0 + s, b0 + s, b0 + s1);
      }
    }
    // 공유 림에 닿기 전까지가 몸통, 그 이후가 윗면.
    if (ri < sharedRingIndex) bodyTriangles = index.length / 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  // indexed 상태에서 지터 — 공유 정점이 함께 움직여야 면이 안 벌어진다 (types.ts §3)
  jitterVertices(geometry, rng, JITTER_AMP);
  return { geometry, bodyTriangles };
}

export const createScone: BreadBuilder = (rng) => {
  const group = new THREE.Group();
  const topMat = stdMaterial({ color: TOP_COLOR });
  const sideMat = stdMaterial({ color: SIDE_COLOR });

  const { geometry, bodyTriangles } = buildWedge(rng);
  // 페이싯 베이크 후 자른다 — toNonIndexed는 인덱스 순서대로 펼치므로 경계가 그대로 보존된다.
  const baked = facet(geometry);
  const total = baked.attributes.position.count / 3;

  const bodyGeo = sliceTriangles(baked, 0, bodyTriangles);
  const topGeo = sliceTriangles(baked, bodyTriangles, total);
  uvDome(bodyGeo);
  uvDome(topGeo);

  group.add(new THREE.Mesh(bodyGeo, sideMat));
  group.add(new THREE.Mesh(topGeo, topMat));

  return mergeByMaterial(group);
};
