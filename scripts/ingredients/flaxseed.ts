// 아마씨 — 낮은 더미 + 앞쪽에 분리된 납작 타원 씨앗 3개. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/flaxseed.json(워크스페이스 원본은
// assets/ingredients/work/flaxseed/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// 낱알 형태 = cranberry.ts의 FLATTEN_X 눕히기 공식(반지름축 하나를 짓눌러 두께를 낸다) +
// olive.ts의 비대칭 테이퍼 프로필(한쪽 끝만 뾰족) 결합 — 크랜베리는 좌우대칭 타원이지만
// 아마씨는 한쪽 끝만 뾰족한 "눈물방울"이라 프로필이 다르다. 하이라이트는 올리브 캡과 같은
// (링,섹터) 격자지만 폭을 넓혀 "납작한 윗면 전체"를 덮는다(포피시드의 점 하이라이트와 다른 용도).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, pickTriangles, splitTrianglesByVertexMask, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/flaxseed.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0x58381a; // "a dark chocolate-brown body" — 더미 + 낱알 대부분
const HIGHLIGHT_COLOR = 0xa8794a; // "a warm amber highlight catching the flat top facet" — 낱알 윗면 전용
// 드롭: 뾰족한 끝에 고이는 그늘 #3E2611(N·L 감쇠가 공짜로 어둡게 함)과
// 테두리의 연한 꿀색 림 #C79A5C(하이라이트 버킷과 명도가 가까워 중복 — 4색을 2버킷으로 압축).

const SEED_SEGMENTS = 10;
const SEED_RADIUS = 0.3;
const SEED_HALF_LENGTH = 0.46; // v2(cmp-1 판정 후): 0.72는 오프셋 간격보다 훨씬 커서 3알이 한
// 덩어리로 겹쳐 보였다 — 줄여서 배치 간격 안에 들어오게 했다.
const FLATTEN_X = 0.34; // radialScale sx — 눕힌 뒤 두께(new Y)가 되는 축. 크랜베리(0.68)보다 훨씬 얇게
// 눌러 "flat"을 강조한다(flaxseed는 cranberry보다 명백히 납작한 씨앗).
const SEED_JITTER_AMP = 0.01; // ~3.3% of SEED_RADIUS — 얇은 파트라 R4 적용

type ProfilePoint = readonly [number, number];
// 비대칭 테이퍼 — 한쪽 끝(hFrac=-1)만 뾰족하게, 반대쪽(hFrac=+1)은 완만하게 둥글다(올리브와
// 반대 방향: 올리브는 뭉툭이 완만/꼭지가 급함이었는데, 아마씨는 뾰족한 쪽 하나만 있고 반대는
// 그냥 둥근 끝이라 완만함의 정도가 더 크다).
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.3, -0.85],
  [0.65, -0.5],
  [0.9, -0.1],
  [1.0, 0.25],
  [0.85, 0.6],
  [0.5, 0.85],
  [0.0, 1.0],
];
// 하이라이트 — sectorCenter(=segments/2)가 눕힌 뒤 "위"를 향한다(올리브 공식과 동일 좌표계).
// 포피시드의 점 캡과 달리 "납작한 윗면 전체"를 덮어야 하므로 섹터 폭을 넓히고(half=2) 중간
// 링 여러 개(양끝 뾰족한 부분 제외)를 마킹한다.
// v2(cmp-1 판정 후): 링4개×half=2(반원)는 몸통 대비 하이라이트가 너무 넓어 낱알이 "짙은 갈색+
// 밝은 호박색 반반"으로 갈라져 보였다 — 링을 2개로, 폭을 half=1로 좁혀 BODY가 우세하게 했다.
const HIGHLIGHT_RING_INDICES: readonly number[] = [3, 4];
const HIGHLIGHT_SECTOR_HALF_WIDTH = 1; // segments=10일 때 3칸 폭

function buildSeed(rng: () => number): { bodyGeo: THREE.BufferGeometry; highlightGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, SEED_SEGMENTS, SEED_HALF_LENGTH, () => [
    SEED_RADIUS * FLATTEN_X,
    SEED_RADIUS,
  ]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  const mask = new Uint8Array(pos.count);
  const sectorCenter = Math.floor(SEED_SEGMENTS / 2);
  for (const ri of HIGHLIGHT_RING_INDICES) {
    const base = ringStart[ri];
    for (let d = -HIGHLIGHT_SECTOR_HALF_WIDTH; d <= HIGHLIGHT_SECTOR_HALF_WIDTH; d++) {
      const s = (sectorCenter + d + SEED_SEGMENTS) % SEED_SEGMENTS;
      mask[base + s] = 1;
    }
  }

  // 눕히기: rotateZ(-90deg) => new_x = old_y(길이), new_y = -old_x(두께, FLATTEN_X 적용축).
  geometry.rotateZ(-Math.PI / 2);

  jitterVertices(geometry, rng, SEED_JITTER_AMP);

  const originalIndex = (geometry.index as THREE.BufferAttribute).array as ArrayLike<number>;
  const baked = facet(geometry);
  const { trueTris, falseTris } = splitTrianglesByVertexMask(originalIndex, mask);

  const highlightGeo = pickTriangles(baked, trueTris);
  const bodyGeo = pickTriangles(baked, falseTris);
  uvTopPlanar(highlightGeo);
  uvTopPlanar(bodyGeo);
  return { bodyGeo, highlightGeo };
}

// 더미 — oat/matcha와 같은 굵은 지터 힙(단일 버킷). "수백 알 흩뿌림" 금지 규칙(팀리드 지시).
const MOUND_SEGMENTS = 14;
const MOUND_RADIUS = 0.66;
const MOUND_HALF_HEIGHT = 0.3;
const MOUND_JITTER_AMP = 0.024; // v2(cmp-1 판정 후): 0.04는 명암 대비가 과해 더미가 거의
// 검게 읽혔다 — 낮춰서 BODY_COLOR의 초콜릿 갈색이 드러나게 했다.
const MOUND_PROFILE: readonly ProfilePoint[] = [
  [0.8, -1.0],
  [0.97, -0.55],
  [1.0, -0.1],
  [0.68, 0.4],
  [0.3, 0.75],
  [0.0, 1.0],
];

function buildMound(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(MOUND_PROFILE, MOUND_SEGMENTS, MOUND_HALF_HEIGHT, () => [MOUND_RADIUS, MOUND_RADIUS]);
  jitterVertices(geometry, rng, MOUND_JITTER_AMP);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

function placeAndGround(child: THREE.Object3D, offset: readonly [number, number], yaw: number): THREE.Group {
  const sub = new THREE.Group();
  sub.add(child);
  sub.rotation.set(0, yaw, 0);
  sub.position.set(offset[0], 0, offset[1]);
  sub.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sub);
  sub.position.y -= box.min.y;
  return sub;
}

interface SeedDef {
  offset: readonly [number, number];
  yaw: number;
}
// flaxseed.png/-2/-3 실측: 앞쪽 3알이 서로 다른 각도로 흩어져 놓인다. 더미 밑동과 안 겹치게(R1).
// v2(cmp-1 판정 후): SEED_HALF_LENGTH를 줄인 만큼 간격도 넓혀 3알이 뚜렷이 분리되게 했다.
const SEEDS: Record<'a' | 'b' | 'c', SeedDef> = {
  a: { offset: [-0.68, 0.62], yaw: 0.5 },
  b: { offset: [0.0, 0.92], yaw: -0.35 },
  c: { offset: [0.7, 0.58], yaw: 1.3 },
};

export const createFlaxseed: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const highlightMat = stdMaterial({ color: HIGHLIGHT_COLOR });

  const cluster = new THREE.Group();

  const moundMesh = new THREE.Mesh(buildMound(rng), bodyMat);
  cluster.add(placeAndGround(moundMesh, [0, 0], -0.2));

  (Object.keys(SEEDS) as (keyof typeof SEEDS)[]).forEach((key) => {
    const def = SEEDS[key];
    const { bodyGeo, highlightGeo } = buildSeed(rng);
    const seed = new THREE.Group();
    seed.add(new THREE.Mesh(bodyGeo, bodyMat));
    seed.add(new THREE.Mesh(highlightGeo, highlightMat));
    cluster.add(placeAndGround(seed, def.offset, def.yaw));
  });

  return mergeByMaterial(cluster);
};
