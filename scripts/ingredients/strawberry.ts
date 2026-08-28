// 딸기 — 회전체 몸통 + 납작 씨 다이아몬드 + 꽃받침 잎 5장 + 꼭지. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/strawberry.json. v3 이후 수리는
// **이 파일이 실측 정본**(스펙 역전사 미완, INGREDIENTS.md).
//
// R3: hex 5개 vs 머티리얼 2. 그늘/하이라이트는 N·L. 씨+꽃받침은 상수 UV 아틀라스.
// 잎은 앞면+뒤집힌 뒷면을 함께 굽는다(runtime material.side 소실).
//
// ★v3: 씨 텍스처+uvCylindrical = 스캔라인. 몸통에 map을 되돌리지 마라.
// ★v4: 가시 피하다 씨·잎 증발. ★v5b: 씨 lift 0.02가 실루엣 가시 조각.
// ★v6: 몸통 쿼드를 씨로 칠하면 체커보드. 격자 페인트 금지.
// ★v7 (2026-08-28). 되돌리지 마라.
// 씨는 작은 납작 마름모, 와인딩은 +N에서 CCW(v7까지 CW라 FrontSide가 씨를 삼킴).
// ★v8 (2026-08-29): 꽃받침 CAP_R 0.28→0.13 · TIP_R 0.5→0.28 (큰 모자 → 꼭지 별, 닫힌 원판 유지).
// 씨는 외접 프로필이 아니라 페이셋 몸통에 closest-point 투영 + 면 중심으로 당겨 실루엣 부유를 없앤다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import {
  bakeTexture,
  buildRevolvedShell,
  facet,
  jitterVertices,
  mergeByMaterial,
  scaleHex,
  stdMaterial,
  uvCylindrical,
} from '../breads/lib';

const BODY_BASE = 0xc0392f;
const BODY_COLOR = scaleHex(BODY_BASE, 1.28);
const SEED_COLOR = 0xf4e3c4;
const CALYX_BASE = 0x6b7e4a;
const CALYX_COLOR = scaleHex(CALYX_BASE, 1.22);

const SEGMENTS = 18;
const BODY_RADIUS = 0.5;
const BODY_HEIGHT = 1.06;

type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, 0.0],
  [0.28, 0.06],
  [0.52, 0.18],
  [0.75, 0.34],
  [0.93, 0.48],
  [1.0, 0.62],
  [0.92, 0.76],
  [0.72, 0.88],
  [0.42, 0.96],
  [0.0, 1.0],
];

const JITTER_AMP = 0.003; // 씨 표면 투영 오프셋보다 작게

const TEX_SIZE = 32;
const SEED_UV: readonly [number, number] = [0.25, 0.75];
const CALYX_UV: readonly [number, number] = [0.75, 0.25];

function hexToRgb(hex: number): string {
  return `rgb(${(hex >> 16) & 0xff}, ${(hex >> 8) & 0xff}, ${hex & 0xff})`;
}

function bakeAtlasTexture(): THREE.CanvasTexture {
  return bakeTexture(TEX_SIZE, (ctx, size) => {
    ctx.fillStyle = hexToRgb(CALYX_COLOR);
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = hexToRgb(SEED_COLOR);
    ctx.fillRect(0, 0, size / 2, size / 2);
  });
}

function setConstantUv(g: THREE.BufferGeometry, uv: readonly [number, number]): void {
  const count = g.attributes.position.count;
  const arr = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    arr[i * 2] = uv[0];
    arr[i * 2 + 1] = uv[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
}

function buildBody(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(PROFILE, SEGMENTS, BODY_HEIGHT, () => [BODY_RADIUS, BODY_RADIUS]);
  jitterVertices(geometry, rng, JITTER_AMP);
  const baked = facet(geometry);
  uvCylindrical(baked, 'y');
  return baked;
}

const SEED_ROWS = 8;
const SEED_H_RANGE: readonly [number, number] = [0.14, 0.86];
const SEED_ARC_SPACING = 0.2;
const SEED_MIN_PER_ROW = 6;
const SEED_MAX_PER_ROW = 11;
const SEED_HALF_LEN = 0.02;
const SEED_HALF_WIDTH = 0.013;
/** 페이셋 면에 붙인 뒤 법선으로만 띄운다. 프로필 원주(외접원)에 놓으면 현·면 사이가 떠 보인다. */
const SEED_LIFT = 0.004;

interface SurfaceSample {
  r: number;
  y: number;
  nr: number;
  ny: number;
  tr: number;
  ty: number;
}

function sampleProfile(hFrac: number): SurfaceSample {
  let i = 0;
  while (i < PROFILE.length - 2 && PROFILE[i + 1][1] < hFrac) i++;
  const [r0, h0] = PROFILE[i];
  const [r1, h1] = PROFILE[i + 1];
  const t = (hFrac - h0) / Math.max(h1 - h0, 1e-6);
  const dr = (r1 - r0) * BODY_RADIUS;
  const dy = (h1 - h0) * BODY_HEIGHT;
  const len = Math.hypot(dr, dy) || 1e-6;
  return {
    r: (r0 + (r1 - r0) * t) * BODY_RADIUS,
    y: hFrac * BODY_HEIGHT,
    tr: dr / len,
    ty: dy / len,
    nr: dy / len,
    ny: -dr / len,
  };
}

function pushTri(out: number[], a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, c: THREE.Vector3Tuple): void {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

const _seedProbe = new THREE.Vector3();
const _seedHit = new THREE.Vector3();
const _seedN = new THREE.Vector3();
const _seedT = new THREE.Vector3();
const _seedB = new THREE.Vector3();
const _seedA = new THREE.Vector3();
const _seedC = new THREE.Vector3();
const _seedD = new THREE.Vector3();
const _seedTri = new THREE.Triangle();
const _seedClosest = new THREE.Vector3();
const _seedCentroid = new THREE.Vector3();

function projectOntoBody(
  body: THREE.BufferGeometry,
  probe: THREE.Vector3,
  hit: THREE.Vector3,
  normal: THREE.Vector3,
): void {
  const pos = body.attributes.position;
  const nrm = body.attributes.normal;
  let best = Infinity;
  let bestI = 0;
  for (let i = 0; i < pos.count; i += 3) {
    _seedA.fromBufferAttribute(pos, i);
    _seedC.fromBufferAttribute(pos, i + 1);
    _seedD.fromBufferAttribute(pos, i + 2);
    _seedTri.set(_seedA, _seedC, _seedD);
    _seedTri.closestPointToPoint(probe, _seedClosest);
    const d = _seedClosest.distanceToSquared(probe);
    if (d < best) {
      best = d;
      bestI = i;
      hit.copy(_seedClosest);
      _seedCentroid.set(
        (_seedA.x + _seedC.x + _seedD.x) / 3,
        (_seedA.y + _seedC.y + _seedD.y) / 3,
        (_seedA.z + _seedC.z + _seedD.z) / 3,
      );
    }
  }
  // 면 가장자리에 떨어지면 마름모 꼭짓점이 옆면 밖으로 삐져 실루엣에 뜬다. 중심 쪽으로 당긴다.
  hit.lerp(_seedCentroid, 0.22);
  if (nrm) {
    normal.set(nrm.getX(bestI), nrm.getY(bestI), nrm.getZ(bestI)).normalize();
  } else {
    _seedA.fromBufferAttribute(pos, bestI);
    _seedC.fromBufferAttribute(pos, bestI + 1);
    _seedD.fromBufferAttribute(pos, bestI + 2);
    _seedTri.set(_seedA, _seedC, _seedD);
    _seedTri.getNormal(normal);
  }
  if (normal.x * hit.x + normal.y * (hit.y - BODY_HEIGHT * 0.5) + normal.z * hit.z < 0) {
    normal.negate();
  }
}

function pushSeed(out: number[], body: THREE.BufferGeometry, theta: number, hFrac: number): void {
  const s = sampleProfile(hFrac);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  _seedProbe.set(ct * s.r, s.y, st * s.r);
  projectOntoBody(body, _seedProbe, _seedHit, _seedN);
  _seedT.set(ct * s.tr, s.ty, st * s.tr);
  _seedT.addScaledVector(_seedN, -_seedT.dot(_seedN));
  if (_seedT.lengthSq() < 1e-10) {
    _seedT.set(0, 1, 0).addScaledVector(_seedN, -_seedN.y);
  }
  _seedT.normalize();
  _seedB.crossVectors(_seedN, _seedT).normalize();
  const corner = (tu: number, bu: number): THREE.Vector3Tuple => [
    _seedHit.x + _seedN.x * SEED_LIFT + _seedT.x * tu + _seedB.x * bu,
    _seedHit.y + _seedN.y * SEED_LIFT + _seedT.y * tu + _seedB.y * bu,
    _seedHit.z + _seedN.z * SEED_LIFT + _seedT.z * tu + _seedB.z * bu,
  ];
  const top = corner(SEED_HALF_LEN, 0);
  const right = corner(0, SEED_HALF_WIDTH);
  const bot = corner(-SEED_HALF_LEN, 0);
  const left = corner(0, -SEED_HALF_WIDTH);
  // +N(바깥)에서 보아 CCW. v7까지 top-left-bot은 CW라 법선이 몸통 안쪽 → FrontSide 컬링으로 씨 증발.
  pushTri(out, top, right, bot);
  pushTri(out, top, bot, left);
}

function buildSeeds(body: THREE.BufferGeometry): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let row = 0; row < SEED_ROWS; row++) {
    const hFrac = SEED_H_RANGE[0] + ((row + 0.5) / SEED_ROWS) * (SEED_H_RANGE[1] - SEED_H_RANGE[0]);
    const s = sampleProfile(hFrac);
    const raw = Math.round((2 * Math.PI * s.r) / SEED_ARC_SPACING);
    const count = Math.min(SEED_MAX_PER_ROW, Math.max(SEED_MIN_PER_ROW, raw));
    const phase = (row % 2) * (Math.PI / count);
    for (let k = 0; k < count; k++) {
      pushSeed(positions, body, phase + (k / count) * Math.PI * 2, hFrac);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  setConstantUv(geo, SEED_UV);
  return geo;
}

const LEAF_COUNT = 5;
const CAP_R = 0.13;
const CAP_SEGS = 10;
const TIP_R = 0.28;
const LEAF_RIDGE_HEIGHT = 0.012;
const LEAF_PITCH = (20 * Math.PI) / 180;
const LEAF_HALF = Math.PI / LEAF_COUNT;

/** 안쪽은 막힌 원판, 잎은 원판 바깥에만. 반각을 안·밖에서 다르게 하면 옆잎과 교차해
 * 히어로에서 앞골로 몸통이 비쳤다. 허브는 꼭지를 삼키게 내려 심는다. */
function buildCalyxStar(): THREE.BufferGeometry {
  const positions: number[] = [];
  const droop = (r: number): number => {
    const t = Math.max(0, (r - CAP_R) / Math.max(TIP_R - CAP_R, 1e-6));
    return -Math.sin(LEAF_PITCH) * t * (TIP_R - CAP_R);
  };
  const xz = (r: number, a: number): readonly [number, number] => [r * Math.sin(a), r * Math.cos(a)];
  const pt = (x: number, y: number, z: number): THREE.Vector3Tuple => [x, y, z];
  const down = (p: THREE.Vector3Tuple): THREE.Vector3Tuple => [p[0], p[1] - 0.008, p[2]];
  const at = (r: number, a: number, y: number): THREE.Vector3Tuple => {
    const [x, z] = xz(r, a);
    return pt(x, y, z);
  };
  const emit = (a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, c: THREE.Vector3Tuple): void => {
    pushTri(positions, a, b, c);
    pushTri(positions, down(a), down(c), down(b));
  };

  const origin: THREE.Vector3Tuple = [0, 0, 0];
  for (let i = 0; i < CAP_SEGS; i++) {
    const a0 = (i * 2 * Math.PI) / CAP_SEGS;
    const a1 = ((i + 1) * 2 * Math.PI) / CAP_SEGS;
    emit(origin, at(CAP_R, a0, 0), at(CAP_R, a1, 0));
  }

  for (let i = 0; i < LEAF_COUNT; i++) {
    const am = (i * 2 * Math.PI) / LEAF_COUNT;
    const aL = am - LEAF_HALF;
    const aR = am + LEAF_HALF;
    const yTip = droop(TIP_R);
    const cL = at(CAP_R, aL, 0);
    const cR = at(CAP_R, aR, 0);
    const cM = at(CAP_R, am, 0);
    const ridge = at((CAP_R + TIP_R) * 0.55, am, droop((CAP_R + TIP_R) * 0.55) + LEAF_RIDGE_HEIGHT);
    const tip = at(TIP_R, am, yTip);
    emit(cL, cM, ridge);
    emit(cM, cR, ridge);
    emit(cL, ridge, tip);
    emit(ridge, cR, tip);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  setConstantUv(geo, CALYX_UV);
  return geo;
}

const STEM_RADIUS = 0.028;
const STEM_HEIGHT = 0.1;
const STEM_SEGMENTS = 8;

function buildStem(): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    STEM_SEGMENTS,
    STEM_HEIGHT,
    () => [STEM_RADIUS, STEM_RADIUS],
  );
  const baked = facet(geometry);
  setConstantUv(baked, CALYX_UV);
  return baked;
}

const HUB_RADIUS = 0.115;
const HUB_HEIGHT = 0.04;
const HUB_SEGMENTS = 10;

function buildHub(): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    HUB_SEGMENTS,
    HUB_HEIGHT,
    () => [HUB_RADIUS, HUB_RADIUS],
  );
  const baked = facet(geometry);
  setConstantUv(baked, CALYX_UV);
  return baked;
}

const CALYX_SINK = 0.028;

function buildCalyx(): THREE.BufferGeometry[] {
  const y0 = BODY_HEIGHT - CALYX_SINK;
  const hub = buildHub();
  hub.translate(0, y0, 0);
  const star = buildCalyxStar();
  star.translate(0, y0 + HUB_HEIGHT + 0.004, 0);
  const stem = buildStem();
  stem.translate(0, y0 + HUB_HEIGHT + 0.004, 0);
  return [hub, star, stem];
}

export const createStrawberry: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const atlasMat = stdMaterial({ map: bakeAtlasTexture(), color: 0xffffff });
  const group = new THREE.Group();
  const bodyGeo = buildBody(rng);
  group.add(new THREE.Mesh(bodyGeo, bodyMat));
  group.add(new THREE.Mesh(buildSeeds(bodyGeo), atlasMat));
  for (const geo of buildCalyx()) {
    group.add(new THREE.Mesh(geo, atlasMat));
  }
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
  group.updateMatrixWorld(true);
  return mergeByMaterial(group);
};
