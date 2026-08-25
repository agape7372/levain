// 블루베리 — 별(왕관) 꼭지 3알 군집. 계약은 types.ts 주석이 정본. 재료 배치B 3번째.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/blueberry.json(워크스페이스 원본은
// assets/ingredients/work/blueberry/). 링 구성·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★블루베리의 정체성은 왕관(calyx) — 이게 없으면 그냥 파란 공이다(팀리드 지시). 프롬프트 산문은
// "앞알만 왕관을 보여준다"지만 실제 레퍼런스 3장은 **세 알 전부**에 별/육각 홈이 보인다
// (INGREDIENTS.md 정본: 형태는 이미지가 정본, 프롬프트 JSON은 색만 정본 — 이미지를 따른다).
// 왕관은 색 마스크가 아니라 **진짜 오목 지오메트리**(scone.ts의 연속 구간 분리 패턴)로 짓는다 —
// 올리브식 마스크 분리는 "같은 링의 부분집합"에만 맞고, 별은 섹터별 반지름이 달라 buildRevolvedShell의
// radialScale(링당 단일 타원 배율)로 표현 불가 — 그래서 이 파일만 자체 링 빌더를 쓴다(scone.ts와
// 동일한 이유: OUTLINE이 원이 아니면 buildRevolvedShell을 못 쓴다).
//
// R1(types.ts) 군집 정본이지만 순서가 다르다: 알 1개 = **몸통 링 + 왕관 링을 한 indexed 배열에
// 이어 지어** bodyTriangles 경계를 기록 -> jitterVertices(전체, 작은 진폭 — 별 뾰족함 보존) ->
// facet -> sliceTriangles(0,bodyTriangles)/(bodyTriangles,total)로 몸통/왕관 분리(scone.ts와
// 동일 — 마스크 아님, 연속 삼각형 구간). 별도로 지어 붙이면 지터가 공유 림을 찢는다(cheese의
// welded-box 교훈과 동일).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/blueberry.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0x4c5a8c; // "a deep blue-violet body"
const CROWN_COLOR = 0x39456e; // "a small muted crown ... at the top" (그늘진 아랫면과 같은 hex)
// #8B9BC6(분백 bloom)은 드롭 — 실제 레퍼런스 렌더를 봐도 별도 패치가 없고 순수 그라데이션이라
// 런타임 키라이트 N·L 감쇠로 이미 공짜(올리브의 진짜 칠해진 패치와 다름). 왕관은 반대로
// **드롭하지 않는다** — 정체성 결정 피처라 이중 대비가 오히려 64px 판독에 도움된다(risk 기록).

const BLUEBERRY_RADIUS = 0.5;
const SEGMENTS = 12;
const SHARED_RING_INDEX = 5; // 림 링 — 이 인덱스 이전 전환이 몸통, 이후가 왕관

// 링 정의: hFrac(-1..1) + 반지름(정수 링은 상수, 별 링은 (짝수=뾰족점, 홀수=골)).
// assets/ingredients/work/blueberry/object-sculpt-spec.json RINGS 전사.
interface Ring {
  hFrac: number;
  pole?: boolean;
  r?: number; // 원형 링
  rStar?: readonly [number, number]; // [뾰족점, 골] — 섹터 짝/홀
}
const RINGS: readonly Ring[] = [
  { hFrac: -1.0, pole: true },
  { hFrac: -0.82, r: 0.62 },
  { hFrac: -0.48, r: 0.92 },
  { hFrac: -0.05, r: 1.0 },
  { hFrac: 0.35, r: 0.86 },
  { hFrac: 0.62, r: 0.6 }, // 림 — 공유 경계
  { hFrac: 0.7, rStar: [0.4, 0.18] }, // 별 뾰족점/골 (6꼭지, 12분할)
  { hFrac: 0.5, r: 0.12 }, // 구덩이 바닥 — 림보다 낮다(진짜 오목)
  { hFrac: 0.5, pole: true }, // 구덩이 바닥 중심 극점
];

const JITTER_AMP = 0.008; // olive/choco보다 작다 — 별 뾰족점을 뭉개지 않는다(R4)

interface BerryDef {
  offset: readonly [number, number]; // world XZ
  yaw: number; // world Y 회전
  tiltX: number; // 앞알만: 왕관을 카메라 쪽으로 기울인다
}

// assets/ingredients/work/blueberry/object-sculpt-spec.json BERRIES 전사.
const BERRIES: Record<'back1' | 'back2' | 'front', BerryDef> = {
  back1: { offset: [-0.42, -0.32], yaw: 0.4, tiltX: 0.0 },
  back2: { offset: [0.42, -0.3], yaw: -0.9, tiltX: 0.0 },
  front: { offset: [0.02, 0.34], yaw: 1.7, tiltX: 0.22 },
};

function ringRadius(ring: Ring, sector: number): number {
  if (ring.pole) return 0;
  if (ring.rStar) return sector % 2 === 0 ? ring.rStar[0] : ring.rStar[1];
  return ring.r ?? 0;
}

/**
 * 알 1개 = 몸통(하단 극점 -> 5개 링 -> 림) + 왕관(별 링 -> 구덩이 바닥 -> 중심 극점)을
 * 한 indexed 배열로 이어 짓는다(scone.ts의 buildWedge와 동일 패턴 — sharedRingIndex로
 * 몸통/왕관 삼각형 개수를 기록). 와인딩은 buildRevolvedShell·scone.ts와 동일 관례.
 */
function buildBerry(): { geometry: THREE.BufferGeometry; bodyTriangles: number } {
  const positions: number[] = [];
  const ringStart: number[] = [];

  for (const ring of RINGS) {
    ringStart.push(positions.length / 3);
    if (ring.pole) {
      positions.push(0, ring.hFrac * BLUEBERRY_RADIUS, 0);
      continue;
    }
    for (let s = 0; s < SEGMENTS; s++) {
      const t = (s / SEGMENTS) * Math.PI * 2;
      const r = ringRadius(ring, s) * BLUEBERRY_RADIUS;
      positions.push(Math.cos(t) * r, ring.hFrac * BLUEBERRY_RADIUS, Math.sin(t) * r);
    }
  }

  const index: number[] = [];
  let bodyTriangles = 0;
  for (let ri = 0; ri < RINGS.length - 1; ri++) {
    const a0 = ringStart[ri];
    const b0 = ringStart[ri + 1];
    const aPole = !!RINGS[ri].pole;
    const bPole = !!RINGS[ri + 1].pole;
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
    if (ri < SHARED_RING_INDEX) bodyTriangles = index.length / 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return { geometry, bodyTriangles };
}

export const createBlueberry: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const crownMat = stdMaterial({ color: CROWN_COLOR });
  const cluster = new THREE.Group();

  (Object.keys(BERRIES) as (keyof typeof BERRIES)[]).forEach((key) => {
    const def = BERRIES[key];
    const { geometry, bodyTriangles } = buildBerry();

    // 지터 — indexed 상태에서, 몸통/왕관 공유 경계(림)가 함께 움직여야 안 찢어진다(types.ts §5).
    jitterVertices(geometry, rng, JITTER_AMP);

    const baked = facet(geometry);
    const total = baked.attributes.position.count / 3;
    const bodyGeo = sliceTriangles(baked, 0, bodyTriangles);
    const crownGeo = sliceTriangles(baked, bodyTriangles, total);
    uvTopPlanar(bodyGeo);
    uvTopPlanar(crownGeo);

    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(bodyGeo, bodyMat));
    sub.add(new THREE.Mesh(crownGeo, crownMat));

    sub.rotation.set(def.tiltX, def.yaw, 0);
    sub.position.set(def.offset[0], 0, def.offset[1]);

    // 공유 지면 y=0 — 이 알만의 회전 후 bbox를 구해 바닥을 원점에 맞춘다(types.ts R1).
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;

    cluster.add(sub);
  });

  return mergeByMaterial(cluster);
};
