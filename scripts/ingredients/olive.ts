// 올리브 — 알 3개 군집. 계약은 types.ts 주석이 정본. 재료 파일럿(첫 IngredientBuilder).
//
// 유래: img2threejs 스펙 assets/ingredients/specs/olive.json(워크스페이스 원본은
// assets/ingredients/work/olive/). 프로파일·오프셋·색은 전부 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★쇼케이스 수리: 곡면 그린은 데칼, 평면 스텀프는 스티커 캡. 뭉툭한 끝은 같은 높이 극+림
// (CRIB 평면 캡) 뒤 극점만 안쪽으로 밀어 과육 구덩이를 만들고, 마스크는 ringStart[0]뿐.
// 꼭지는 작은 평면 캡으로 바늘 첨점을 없앤다. 절단면 yaw를 갈라 턴테이블에서 한 알은 보이게.
// #4A3A36 그늘 버킷은 드롭 유지.
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
  scaleHex,
  splitTrianglesByVertexMask,
  stdMaterial,
  uvTopPlanar,
} from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/olive.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
// "#4A3A36"(그늘진 아랫면)은 의도적으로 버킷을 안 만든다 — mesh<=2 예산이 2버킷을 강제하는데,
// 런타임 키라이트가 볼록한 셸의 아랫면을 N·L 감쇠로 이미 공짜로 어둡게 만든다. 지오메트리에 두 번째
// 어두운 톤을 칠하면 이중으로 어두워진다(스펙 risk shaded-underside-hue-dropped 참조).
// Lambert가 어두운 보석색을 한 단 내려 검은 바위로 읽히므로 알베도만 살짝 올린다(apricot 선례).
const BODY_BASE = 0x3b2f2f; // "a deep aubergine-black body"
const BODY_COLOR = scaleHex(BODY_BASE, 1.14);
const CAP_COLOR = 0x5c6b3e; // "a muted olive-green cast ... catching the upper faces"

// 실측 비율 (assets/ingredients/src/olive.png 3/4 · olive-2.png 정면 · olive-3.png 탑다운).
// 절대 스케일은 무의미 — 런타임이 군집 전체 최장축을 1.6으로 리핏한다 (types.ts §6).
const OLIVE_RADIUS = 0.44; // 적도 반지름
const OLIVE_HALF_LENGTH = 0.775; // 극-극 절반 길이 (길이:너비 ~= 1.55:1, olive-2.png 실측)
const OLIVE_SEGMENTS = 32; // 12·16은 각진 결정체. 32면 페이셋은 남고 실루엣이 타원으로 읽힌다.
const CUT_RIM = 0.58; // 뭉툭한 끝 구덩이 입구 반지름비
const CUT_INSET = 0.16; // 극점을 +Y(내부)로 — 마스크가 아니라 구덩이 깊이. Y임계 마스크 아님.

// (반지름비, 높이비) — heightFrac -1(뭉툭한 끝 = 과육 구덩이) .. +1(꼭지 끝).
// 앞 두 점·뒤 두 점은 같은 hFrac → pole-fan이 평면(CRIB). 꼭지 평면은 몸통색(마스크 안 함).
type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [CUT_RIM, -1.0],
  [0.8, -0.8],
  [0.95, -0.52],
  [1.0, -0.22],
  [1.0, 0.06],
  [0.94, 0.32],
  [0.8, 0.54],
  [0.6, 0.72],
  [0.36, 0.88],
  [0.16, 1.0],
  [0.0, 1.0],
];

const JITTER_AMP = 0.0035; // 세그↑이면 지터↓ (types.ts R2). 구덩이 입구가 찢어지지 않게 낮춘다.

interface OliveDef {
  offset: readonly [number, number]; // world XZ
  yaw: number; // world Y 회전 — 절단면 방향을 알마다 갈라 턴테이블에서 숨지 않게
  tiltZ: number; // 추가 world Z 회전 (뭉툭한 끝 구덩이를 카메라 쪽으로 들어올림)
  tilted: boolean;
  scale: number; // 알별 미세 크기 — 동일 회전체 3개가 암석 표본처럼 안 보이게
  flatten: number; // radialScale sx. 알마다 납작함을 달리 해 복사-붙여넣기처럼 안 보이게
}

// assets/ingredients/work/olive/object-sculpt-spec.json OLIVES 전사 + 절단면 방위만 분산.
// olive-a = "one tilted to show its blunt end" (geometry.silhouette, olive.json).
const OLIVES: Record<'a' | 'b' | 'c', OliveDef> = {
  a: { offset: [-0.38, 0.16], yaw: -0.45, tiltZ: 0.78, tilted: true, scale: 1.05, flatten: 0.9 },
  b: { offset: [0.38, 0.14], yaw: 2.05, tiltZ: 0.4, tilted: false, scale: 0.94, flatten: 0.84 },
  c: { offset: [0.02, -0.52], yaw: -2.15, tiltZ: 0.32, tilted: false, scale: 0.86, flatten: 0.78 },
};

/**
 * 알 1개 = 회전체 셸(뭉툭한 끝 구덩이 + 꼭지 평면) + 캡 마스크(링 0 극점) + 지터
 * + 캡/몸통 삼각형 분리 + 눕히기.
 */
function buildOlive(
  rng: () => number,
  flatten: number,
): {
  bodyGeo: THREE.BufferGeometry;
  capGeo: THREE.BufferGeometry;
} {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, OLIVE_SEGMENTS, OLIVE_HALF_LENGTH, () => [
    OLIVE_RADIUS * flatten,
    OLIVE_RADIUS,
  ]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  // 캡 마스크 — 좌표 임계값 금지. 극점(ring 0)만 찍으면 OR-of-3가 폴 팬(구덩이 과육)만 넘긴다.
  // 림을 찍으면 옆면 첫 밴드까지 번진다. 극점을 +Y로 밀어 입구보다 깊게 — 플러시 스텀프가 아니다.
  const pole = ringStart[0];
  pos.setY(pole, pos.getY(pole) + CUT_INSET);
  const mask = new Uint8Array(pos.count);
  mask[pole] = 1;
  pos.needsUpdate = true;

  // 눕히기: rotateZ(-90deg) => new_x = old_y, new_y = -old_x. 장축이 로컬 X, 구덩이는 -X 끝.
  geometry.rotateZ(-Math.PI / 2);

  // 지터 — indexed 상태에서(공유 정점이 함께 움직여야 캡/몸통 경계가 안 찢어진다, types.ts §5).
  jitterVertices(geometry, rng, JITTER_AMP);

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
    const { bodyGeo, capGeo } = buildOlive(rng, def.flatten);

    const sub = new THREE.Group();
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    const capMesh = new THREE.Mesh(capGeo, capMat);
    sub.add(bodyMesh, capMesh);

    // 배치: yaw(world Y) + tiltZ(구덩이를 카메라로 들어올리는 추가 회전).
    sub.scale.setScalar(def.scale);
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
