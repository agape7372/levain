// 올리브 — 알 3개 군집. 계약은 types.ts 주석이 정본. 재료 파일럿(첫 IngredientBuilder).
//
// 유래: img2threejs 스펙 assets/ingredients/specs/olive.json(워크스페이스 원본은
// assets/ingredients/work/olive/). 프로파일·오프셋·색은 전부 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// R1(types.ts) 군집 정본 순서: 알 1개 = 한 덩어리 indexed 셸(lib.buildRevolvedShell) →
// jitterVertices → facet → 삼각형을 버킷 2개(몸통/그린캡)로 분리. 알끼리는 정점을 공유하지
// 않으므로(pancake 디스크 3장과 동일 패턴) 알마다 독립적으로 셸을 짓고 mesh 변환으로 배치한다 —
// 통짜 positions 배열 하나에 3알을 우겨넣지 않는다. jitterVertices는 "이 알의" 공유 캡 경계링만
// 지키면 된다(알간 공유 링은 애초에 없다).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import {
  buildRevolvedShell,
  facet,
  jitterVertices,
  mergeByMaterial,
  pickTriangles,
  splitTrianglesByVertexMask,
  stdMaterial,
  uvTopPlanar,
} from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/olive.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
// "#4A3A36"(그늘진 아랫면)은 의도적으로 버킷을 안 만든다 — mesh<=2 예산이 2버킷을 강제하는데,
// 런타임 키라이트가 볼록한 셸의 아랫면을 N·L 감쇠로 이미 공짜로 어둡게 만든다. 지오메트리에 두 번째
// 어두운 톤을 칠하면 이중으로 어두워진다(스펙 risk shaded-underside-hue-dropped 참조).
const BODY_COLOR = 0x3b2f2f; // "a deep aubergine-black body"
const CAP_COLOR = 0x5c6b3e; // "a muted olive-green cast ... catching the upper faces"

// 실측 비율 (assets/ingredients/src/olive.png 3/4 · olive-2.png 정면 · olive-3.png 탑다운).
// 절대 스케일은 무의미 — 런타임이 군집 전체 최장축을 1.6으로 리핏한다 (types.ts §6).
const OLIVE_RADIUS = 0.44; // 적도 반지름
const OLIVE_HALF_LENGTH = 0.775; // 극-극 절반 길이 (길이:너비 ~= 1.55:1, olive-2.png 실측)
const OLIVE_SEGMENTS = 12;

// (반지름비, 높이비) — heightFrac -1(뭉툭한 끝 극점) .. +1(꼭지 끝 극점). 비대칭 테이퍼:
// 뭉툭한 끝은 완만하게 넓어지고(반지름이 -0.80까지 0.55 이상 유지) 꼭지 끝은 급하게 좁아진다
// (0.80을 지나면 반지름 0.22 밑) — olive-2.png에서 관찰된 전형적 올리브 비대칭.
type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.55, -0.8],
  [0.9, -0.46],
  [1.0, -0.08],
  [0.88, 0.22],
  [0.58, 0.54],
  [0.22, 0.8],
  [0.0, 1.0],
];

// 그린 캡 마스크 — cmp-1/cmp-2 실측: Y좌표 임계값(로컬 Y > k*OLIVE_RADIUS) 방식은 실패했다.
// 카메라가 위쪽에서 내려다보는 3/4 뷰라 "위를 향한 면"이 애초에 시야의 절반 가까이를 차지해서,
// k를 0.1에서 0.55로 올려도(원주 점유율 47%->31%) 카메라에 늘 보이는 중심부(t=180 정점)는 두
// 경우 다 포함되어 렌더가 거의 안 바뀌었다. 좌표 기반 임계값 대신 (링, 섹터) 격자 좌표로 직접
// 지정한다 — buildRevolvedShell이 돌려주는 ringStart를 그대로 쓴다.
// splitTrianglesByVertexMask는 "정점 3개 중 하나라도 true면 삼각형 true"라 마스크를 링 2개(2,3)에
// 찍으면 그 사이/양옆 세 밴드(1-2, 2-3, 3-4)가 전부 걸려 length의 절반이 물든다(shot-90/180/270
// 실측 — azimuth를 돌려도 항상 절반 가까이 초록으로 읽혔다). 링을 1개(3, 가장 넓은 링)로,
// 섹터도 중심 1칸만(half=0)으로 좁혀 걸리는 밴드를 2-3/3-4 두 개로, 폭도 최소로 줄였다.
const CAP_RING_INDICES: readonly number[] = [3];
const CAP_SECTOR_HALF_WIDTH = 0; // 중심 섹터 1칸만 (segments=12일 때 1/12 = 30도 폭)

const JITTER_AMP = 0.016; // ~3.6% of OLIVE_RADIUS — R4: 빵 크러스트 스케일(0.008/반지름1.0)보다 낮춤

interface OliveDef {
  offset: readonly [number, number]; // world XZ
  yaw: number; // world Y 회전 (배치 방향 다양화)
  tiltZ: number; // 추가 world Z 회전 (뭉툭한 끝을 카메라 쪽으로 들어올림)
  tilted: boolean;
}

// assets/ingredients/work/olive/object-sculpt-spec.json OLIVES 전사.
// olive-a = "one tilted to show its blunt end" (geometry.silhouette, olive.json).
const OLIVES: Record<'a' | 'b' | 'c', OliveDef> = {
  a: { offset: [-0.62, 0.3], yaw: -0.55, tiltZ: 0.32, tilted: true },
  b: { offset: [0.6, 0.22], yaw: 0.3, tiltZ: 0.0, tilted: false },
  c: { offset: [0.02, -0.55], yaw: 1.55, tiltZ: 0.0, tilted: false },
};

/**
 * 알 1개 = 회전체 셸(극점 2개) + 캡 마스크(링/섹터 격자 인덱스) + 지터 + 캡/몸통 삼각형 분리
 * + 눕히기. buildRevolvedShell은 항상 Y축으로 돌리므로, 세워 지은 상태에서 ringStart로 캡
 * 마스크를 먼저 찍고(격자 인덱스라 지터·회전에 안 흔들림), 그 다음 geometry.rotateZ(-90deg)로
 * "눕히기"를 지오메트리에 굽는다(장축 old Y -> new X, old X -> new Y="위").
 */
function buildOlive(rng: () => number): {
  bodyGeo: THREE.BufferGeometry;
  capGeo: THREE.BufferGeometry;
} {
  // PROFILE의 rFrac(0..1)에 상수 OLIVE_RADIUS를 곱해 실제 반지름을, heightScale=OLIVE_HALF_LENGTH로
  // hFrac(-1..1)에 곱해 실제 길이를 낸다 — radialScale은 링마다 다를 필요가 없어 상수를 반환한다.
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, OLIVE_SEGMENTS, OLIVE_HALF_LENGTH, () => [
    OLIVE_RADIUS,
    OLIVE_RADIUS,
  ]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  // 캡 마스크 — 지터/회전 전, (링, 섹터) 격자 인덱스로 직접 지정(좌표 임계값 재발명 금지).
  // 섹터 중심(=segments/2)이 old_x=-rFrac*R 방향(cos t=-1)이고, rotateZ(-90deg) 후 new_y=-old_x가
  // 최대가 되는 지점이라 "눕힌 뒤 위"로 온다 — 링별 시작 인덱스는 buildRevolvedShell이 이미 계산해
  // 반환한 ringStart를 그대로 쓴다(재추론 없음).
  const mask = new Uint8Array(pos.count);
  const sectorCenter = Math.floor(OLIVE_SEGMENTS / 2);
  for (const ri of CAP_RING_INDICES) {
    const base = ringStart[ri];
    for (let d = -CAP_SECTOR_HALF_WIDTH; d <= CAP_SECTOR_HALF_WIDTH; d++) {
      const s = (sectorCenter + d + OLIVE_SEGMENTS) % OLIVE_SEGMENTS;
      mask[base + s] = 1;
    }
  }

  // 눕히기: rotateZ(-90deg) => new_x = old_y, new_y = -old_x. 장축이 로컬 X로, 로컬 Y가 "위"가 된다.
  geometry.rotateZ(-Math.PI / 2);

  // 지터 — indexed 상태에서(공유 정점이 함께 움직여야 캡/몸통 경계가 안 찢어진다, types.ts §5).
  // 마스크는 인덱스 기반이라 지터 전/후 순서에 영향받지 않는다.
  jitterVertices(geometry, rng, JITTER_AMP);

  // facet 전에 원본 index를 보존 — splitTrianglesByVertexMask는 facet() 이전 indexed 배열을 요구한다.
  const originalIndex = (geometry.index as THREE.BufferAttribute).array as ArrayLike<number>;
  const baked = facet(geometry);
  const { trueTris, falseTris } = splitTrianglesByVertexMask(originalIndex, mask);

  const capGeo = pickTriangles(baked, trueTris);
  const bodyGeo = pickTriangles(baked, falseTris);
  uvTopPlanar(capGeo);
  uvTopPlanar(bodyGeo);
  return { bodyGeo, capGeo };
}

export const createOlive: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const capMat = stdMaterial({ color: CAP_COLOR });

  const cluster = new THREE.Group();

  (Object.keys(OLIVES) as (keyof typeof OLIVES)[]).forEach((key) => {
    const def = OLIVES[key];
    const { bodyGeo, capGeo } = buildOlive(rng);

    const sub = new THREE.Group();
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    const capMesh = new THREE.Mesh(capGeo, capMat);
    sub.add(bodyMesh, capMesh);

    // 배치: yaw(world Y) + tiltZ(뭉툭한 끝을 카메라로 들어올리는 추가 회전, olive-a만).
    sub.rotation.set(0, def.yaw, def.tiltZ);
    sub.position.set(def.offset[0], 0, def.offset[1]);

    // 공유 지면 y=0 — 이 알만의 회전 후 bbox를 구해 바닥을 원점에 맞춘다(types.ts R1).
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;

    cluster.add(sub);
  });

  return mergeByMaterial(cluster);
};
