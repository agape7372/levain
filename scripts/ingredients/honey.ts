// 꿀 — 벌집 조각 + 굳은 꿀 덩이. 계약은 types.ts 주석이 정본. 재료 2차 배치(신규 4종) 4번째,
// 이 배치의 최대 난제(팀리드 브리핑 — 육각 격자가 정체성 전부).
//
// 유래: img2threejs 스펙 assets/ingredients/specs/honey.json(워크스페이스 원본은
// assets/ingredients/work/honey/). 수치·색은 그 스펙(author_spec.py)의 전사이며, 수치를 고칠
// 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★격자를 텍스처가 아니라 **지오메트리**로 판다 — 육각 홈을 오목 함몰(정점 함몰)로 파면 cheese의
// 실측 함정(저해상도 격자의 정점 함몰은 오블리크 카메라에서 지그재그로 깨진다, CRIB 참조)을 그대로
// 반복한다. 대신 **볼록**한 육각 테두리 벽(annulus 프리즘)을 슬래브 윗면에 얹는다 — 볼록 형태는
// 오목 함몰과 달리 급격한 법선 반전이 없어 오블리크 카메라에서 안전하고, 벽 사이로 보이는 슬래브
// 윗면(어두운 A67A28)이 "함몰된 셀 바닥"처럼 읽힌다. 밝은 능선(#E0B65C)은 별도 버킷 없이 런타임
// 키라이트 N·L 감쇠가 평평한 벽 상단 vs 수직 벽면의 밝기 차이를 공짜로 낸다(올리브
// shaded-underside-hue-dropped와 동일 논리). CRIB의 "군집은 3개가 상한" 교훈을 셀 개수에도
// 적용해 촘촘한 9x6 격자(레퍼런스 원본) 대신 **큼직한 셀 5개**로 줄였다 — 64px에서 뭉개지는 것보다
// 적고 뚜렷한 게 낫다(cranberry 6→3알 선례와 동일 논리).
//
// 굳은 꿀 덩이는 슬래브 윗면과 다른 색(#8F5F1D)이 필요한데 mesh<=2가 이미 {몸통, 윗면} 두 버킷을
// 다 쓴다 — pumpkin의 "예비 텍스처 패치" 트릭을 재사용: 윗면 텍스처의 한 귀퉁이에 덩이색 패치를
// 심고 덩이 메시는 그 좌표에 상수 UV로 고정한다. 단 pumpkin의 uvDome(원판 투영)과 달리 여기 윗면은
// **사각형→사각형 uvTopPlanar라 네 귀퉁이 전부가 실제로 샘플된다** — "가장자리는 원판 밖이라
// 안전"이라는 pumpkin의 전제가 안 통해서, 윗면 UV를 안쪽으로 인셋(margin)해 귀퉁이 띠를 텍스처
// 샘플링에서 아예 배제하고 그 띠 안에 패치를 둔다(로컬 uvTopPlanarInset, lib.ts 수정 없음).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { bakeTexture, buildRevolvedShell, facet, jitterVertices, mergeByMaterial, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/honey.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0xc99a3d; // "a warm golden amber comb body" — 슬래브 옆면·바닥 + 벽 프리즘
const RECESSED_COLOR = 0xa67a28; // "darker recessed hexagonal cells" — 윗면 텍스처 바탕(셀 바닥으로 읽힘)
const BLOB_COLOR = 0x8f5f1d; // "a deeper amber pooled honey blob hardened at one corner"
// 밝은 능선(#E0B65C)은 버킷을 안 만든다 — 벽 프리즘의 평평한 상단(+Y 향함)이 수직 옆면보다 런타임
// 키라이트 N·L을 더 많이 받아 이미 밝게 나온다(스펙 risk ridge-highlight-hue-dropped 참조).

const SLAB_HALF_X = 0.8; // 길쭉한 방향
const SLAB_HALF_Y = 0.22; // 두께 — "thick rectangular slab"
const SLAB_HALF_Z = 0.55;

const HEX_SEGMENTS = 6;
const CELL_OUTER_R = 0.19;
const CELL_INNER_R = 0.13; // 벽 두께 = OUTER-INNER
const CELL_WALL_HEIGHT = 0.075; // 얕게(CRIB "깊이를 얕게" 교훈을 볼록 벽 높이에도 보수적으로 적용)

// 셀 배치 — 2행 x 3열에서 앞줄 우측 한 칸을 비워 꿀 덩이 자리로 남긴다(honey.png 실측: 덩이가
// 우측-앞 모서리에 걸쳐 있다). 총 5셀 — CRIB "군집 상한 3" 교훈을 완화 적용(격자 정체성 자체가
// 반복에 있어 3개까지 줄이면 "격자"로 안 읽힐 위험이 더 크다고 판단, 5로 절충).
const CELL_POSITIONS: readonly (readonly [number, number])[] = [
  [-0.42, -0.22],
  [0.0, -0.22],
  [0.42, -0.22],
  [-0.42, 0.2],
  [0.0, 0.2],
];

const BLOB_RADIUS = 0.24;
const BLOB_HALF_HEIGHT = 0.22;
const BLOB_SEGMENTS = 10;
const BLOB_EMBED = 0.05;
const BLOB_JITTER_AMP = 0.02;
const BLOB_OFFSET: readonly [number, number] = [0.5, 0.32]; // 앞-우측 모서리, 비워둔 셀 자리

type ProfilePoint = readonly [number, number];
const BLOB_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.6, -0.85],
  [0.9, -0.5],
  [1.0, -0.05],
  [0.92, 0.35],
  [0.65, 0.7],
  [0.3, 0.92],
  [0.0, 1.0],
];

const TEX_SIZE = 128; // <=256 (R3) — 두 톤짜리 평면 패치라 이만큼도 넉넉하다
const TOP_MARGIN = 0.14; // 슬래브 윗면 UV 인셋 비율 — 이 폭 바깥(네 변 테두리 띠)은 절대 안 샘플된다
const PATCH_FRAC = 0.11; // 예비 패치 크기(TOP_MARGIN보다 작게 — 테두리 띠 안에 완전히 들어가야 한다)

type Axis = 'x' | 'y' | 'z';
interface FaceDef {
  readonly n: Axis;
  readonly nSign: 1 | -1;
  readonly u: Axis;
  readonly uSign: 1 | -1;
  readonly v: Axis;
  readonly vSign: 1 | -1;
}

// N = U x V(우수 좌표계, 바깥 방향 노멀 보장) — cheese.ts FACES 표와 동일 관례.
const SIDE_FACES: readonly FaceDef[] = [
  { n: 'x', nSign: 1, u: 'z', uSign: -1, v: 'y', vSign: 1 }, // +X
  { n: 'x', nSign: -1, u: 'z', uSign: 1, v: 'y', vSign: 1 }, // -X
  { n: 'y', nSign: -1, u: 'x', uSign: 1, v: 'z', vSign: 1 }, // -Y bottom
  { n: 'z', nSign: 1, u: 'x', uSign: 1, v: 'y', vSign: 1 }, // +Z front
  { n: 'z', nSign: -1, u: 'x', uSign: -1, v: 'y', vSign: 1 }, // -Z back
];
const TOP_FACE: FaceDef = { n: 'y', nSign: 1, u: 'x', uSign: 1, v: 'z', vSign: -1 }; // +Y top — 별도 버킷(텍스처)

function halfOf(axis: Axis): number {
  return axis === 'x' ? SLAB_HALF_X : axis === 'y' ? SLAB_HALF_Y : SLAB_HALF_Z;
}

function setAxis(v: THREE.Vector3, axis: Axis, value: number): void {
  if (axis === 'x') v.x = value;
  else if (axis === 'y') v.y = value;
  else v.z = value;
}

/** 슬래브 면 1개 = 단일 평평한 쿼드(구독·라운딩 없음 — 벽 프리즘/텍스처가 이미 디테일을 낸다). */
function buildSlabFace(def: FaceDef): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const j of [0, 1]) {
    for (const i of [0, 1]) {
      const p = new THREE.Vector3();
      setAxis(p, def.n, def.nSign * halfOf(def.n));
      setAxis(p, def.u, def.uSign * (i * 2 - 1) * halfOf(def.u));
      setAxis(p, def.v, def.vSign * (j * 2 - 1) * halfOf(def.v));
      positions.push(p.x, p.y, p.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 3, 0, 3, 2]);
  return facet(geometry);
}

/** uvTopPlanar(X,Z)를 [margin, 1-margin] 범위로 인셋 — 테두리 띠를 예비 패치용으로 비운다. */
function uvTopPlanarInset(g: THREE.BufferGeometry, margin: number): void {
  g.computeBoundingBox();
  const b = g.boundingBox as THREE.Box3;
  const sx = Math.max(b.max.x - b.min.x, 1e-6);
  const sz = Math.max(b.max.z - b.min.z, 1e-6);
  const scale = 1 - margin * 2;
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = margin + ((pos.getX(i) - b.min.x) / sx) * scale;
    uv[i * 2 + 1] = margin + ((pos.getZ(i) - b.min.z) / sz) * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * 육각 테두리 벽(annulus 프리즘) — 볼록 형태라 지터·오목 함몰 위험이 없다(cheese 교훈 회피,
 * 위 헤드 주석 참조). 삼각형 와인딩은 손으로 유도해 확정(외적 계산으로 바깥/윗 방향 검산 완료):
 * 윗면 annulus = (outerTop[k], innerTop[k], innerTop[k1]) + (outerTop[k], innerTop[k1], outerTop[k1]),
 * 바깥벽 = (outerTop[k], outerBottom[k1], outerBottom[k]) + (outerTop[k], outerTop[k1], outerBottom[k1]).
 * 안쪽 벽(inner wall)은 생략 — 벽 안쪽은 얇은 틈이라 이 스케일의 3/4 카메라에서 보이지 않는다.
 */
function buildHexRing(outerR: number, innerR: number, wallHeight: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const outerTop: number[] = [];
  const innerTop: number[] = [];
  const outerBottom: number[] = [];
  for (let k = 0; k < HEX_SEGMENTS; k++) {
    const t = (k / HEX_SEGMENTS) * Math.PI * 2;
    outerTop.push(positions.length / 3);
    positions.push(Math.cos(t) * outerR, wallHeight, Math.sin(t) * outerR);
  }
  for (let k = 0; k < HEX_SEGMENTS; k++) {
    const t = (k / HEX_SEGMENTS) * Math.PI * 2;
    innerTop.push(positions.length / 3);
    positions.push(Math.cos(t) * innerR, wallHeight, Math.sin(t) * innerR);
  }
  for (let k = 0; k < HEX_SEGMENTS; k++) {
    const t = (k / HEX_SEGMENTS) * Math.PI * 2;
    outerBottom.push(positions.length / 3);
    positions.push(Math.cos(t) * outerR, 0, Math.sin(t) * outerR);
  }
  const index: number[] = [];
  for (let k = 0; k < HEX_SEGMENTS; k++) {
    const k1 = (k + 1) % HEX_SEGMENTS;
    index.push(outerTop[k], innerTop[k], innerTop[k1]);
    index.push(outerTop[k], innerTop[k1], outerTop[k1]);
    index.push(outerTop[k], outerBottom[k1], outerBottom[k]);
    index.push(outerTop[k], outerTop[k1], outerBottom[k1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  // 지터 없음(cheese 정본과 동일 예외) — 육각 벽은 각지고 매끈한 인공 구조물이라 유기적 노이즈가
  // 오히려 정체성을 흐린다(레퍼런스도 벽면이 완전히 매끈하다).
  const baked = facet(geometry);
  uvTopPlanar(baked); // 순색 버킷 — 어떤 투영이든 무방, attribute 일관성만 필요(pumpkin cutface 관례).
  return baked;
}

function paintHoneyTopTexture(): THREE.CanvasTexture {
  const floor: [number, number, number] = [(RECESSED_COLOR >> 16) & 0xff, (RECESSED_COLOR >> 8) & 0xff, RECESSED_COLOR & 0xff];
  const blob: [number, number, number] = [(BLOB_COLOR >> 16) & 0xff, (BLOB_COLOR >> 8) & 0xff, BLOB_COLOR & 0xff];
  const patchPx = Math.round(TEX_SIZE * PATCH_FRAC);

  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const o = (py * size + px) * 4;
        const inPatch = px < patchPx && py < patchPx; // 좌상단 귀퉁이 — uvTopPlanarInset의 테두리 띠 안
        const c = inPatch ? blob : floor;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function buildBlob(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(BLOB_PROFILE, BLOB_SEGMENTS, BLOB_HALF_HEIGHT, () => [BLOB_RADIUS, BLOB_RADIUS]);
  jitterVertices(geometry, rng, BLOB_JITTER_AMP);
  const baked = facet(geometry);
  // 예비 패치에 상수 UV 고정(pumpkin 꼭지 정본 — CanvasTexture flipY=true라 캔버스 좌상단(작은 py)이
  // 메시 V=1 근처에 매핑된다).
  const u = PATCH_FRAC / 2;
  const v = 1 - PATCH_FRAC / 2;
  const uv = new Float32Array(baked.attributes.position.count * 2);
  for (let i = 0; i < uv.length; i += 2) {
    uv[i] = u;
    uv[i + 1] = v;
  }
  baked.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  baked.translate(BLOB_OFFSET[0], SLAB_HALF_Y - BLOB_EMBED + BLOB_HALF_HEIGHT, BLOB_OFFSET[1]);
  return baked;
}

// 슬래브·벽은 전부 결정론 기하(rng 미사용)이고 blob만 jitterVertices에 rng를 쓴다 —
// IngredientBuilder 계약대로 인자 rng를 받아 blob에만 넘긴다.
export const createHoney: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const topMat = stdMaterial({ map: paintHoneyTopTexture(), color: 0xffffff });

  const group = new THREE.Group();
  for (const def of SIDE_FACES) {
    const faceGeo = buildSlabFace(def);
    uvTopPlanar(faceGeo); // 순색 버킷 — 어떤 투영이든 무방(cheese 관례), attribute 일관성만 필요.
    group.add(new THREE.Mesh(faceGeo, bodyMat));
  }

  const topGeo = buildSlabFace(TOP_FACE);
  uvTopPlanarInset(topGeo, TOP_MARGIN);
  group.add(new THREE.Mesh(topGeo, topMat));

  for (const [cx, cz] of CELL_POSITIONS) {
    const ring = buildHexRing(CELL_OUTER_R, CELL_INNER_R, CELL_WALL_HEIGHT);
    ring.translate(cx, SLAB_HALF_Y, cz);
    group.add(new THREE.Mesh(ring, bodyMat));
  }
  group.add(new THREE.Mesh(buildBlob(rng), topMat));

  return mergeByMaterial(group);
};
