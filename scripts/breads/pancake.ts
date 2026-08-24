// 팬케이크 — 3단 스택. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 `assets/breads/specs/pancake.json`(워크스페이스 원본은
// assets/breads/work/pancake/). 프로파일·비율·개수는 전부 그 스펙의 전사이며,
// 수치를 고칠 때는 스펙(work/pancake/author_spec.py)을 먼저 고치고 여기로 옮긴다.
//
// 스킬 팩토리(createPancakeStackModel.ts)는 LatheGeometry + 트랜스폼까지만 낸다.
// 아래 세 가지는 팩토리가 못 내므로 여기서 구현한다:
//   1. 링을 직접 짜서 φ-seam 정점 중복을 없앤다. LatheGeometry는 UV 랩용으로 seam 열을
//      복제하는데, 그 상태로 jitter하면 복제된 두 정점이 따로 움직여 한 방위각에 실금이 뜬다.
//   2. 윗면·몸통을 **한 덩어리 indexed 지오메트리**로 만든 뒤 마지막에 삼각형을 갈라
//      머티리얼 2벌로 나눈다. 따로 만들어 각각 jitter하면 공유 테두리 링이 찢어진다.
//   3. 기포 딤플 = 정점 함몰(추가 메시 아님). tri 0 증가.
import * as THREE from 'three';
import type { BreadBuilder } from './types';
import { facet, jitterVertices, mergeByMaterial, stdMaterial, uvTopPlanar } from './lib';

// 팔레트 — assets/prompts/breads/pancake.json geometry.crust 손 전사 (JSON import 금지, types.ts §8)
const TOP_COLOR = 0xc68958; // "top surface of each disk in soft clay matte medium brown #C68958"
const RIM_COLOR = 0xa9713f; // "underside and edge rim of each disk in deeper golden brown #A9713F"

// 실측 비율 (assets/breads/src/pancake-2.png 정면 · pancake-3.png 탑다운)
// 반지름 1.0 기준. 절대 스케일은 무의미 — 런타임이 최장축 1.6으로 리핏한다 (types.ts §7).
const DISK_HEIGHT = 0.222; // 두께/지름 0.111 (실측 0.100~0.1125)
const STACK_STEP = 0.21; // 층 간격 = DISK_HEIGHT - 0.012 겹침. 스택높이/지름 0.321 (실측 0.325)

/** (반지름비, 높이비) — 높이비 1.0 = 디스크 1장 높이. */
type ProfilePoint = readonly [number, number];

// 몸통: 밑면 → 아래 림 → 적도(최대 반지름, 중간 높이) → 위 림 → 테두리 링.
// 마지막 점 [0.93, 0.90]이 윗면 프로파일의 첫 점과 같다 = 투톤 경계 링.
const BODY_PROFILE: readonly ProfilePoint[] = [
  [0.0, 0.09],
  [0.82, 0.0],
  [0.975, 0.26],
  [1.0, 0.52],
  [0.985, 0.74],
  [0.93, 0.9],
];
// 윗면: 테두리에서 안쪽으로. 중앙이 0.024만큼 봉긋하고 가장자리가 처진다.
// 링을 촘촘히 쓰는 이유는 곡률이 아니라 **기포 벽 기울기** 때문이다 — 링 간격이 곧
// 구멍의 반지름이라, 성기면 벽이 17°밖에 안 서고 Lambert 대비가 7%라 안 보인다.
// 섹터는 24로 묶어둔다(테두리 다각형이 레퍼런스 18~22면과 맞아야 한다) — 즉 반지름 방향으로만 조밀하게.
const FACE_PROFILE_DENSE: readonly ProfilePoint[] = [
  [0.93, 0.9],
  [0.87, 0.924],
  [0.8, 0.951],
  [0.73, 0.966],
  [0.65, 0.98],
  [0.56, 0.99],
  [0.46, 0.998],
  [0.35, 1.004],
  [0.22, 1.008],
  [0.0, 1.012],
];
const FACE_PROFILE_COARSE: readonly ProfilePoint[] = [
  [0.93, 0.9],
  [0.8, 0.948],
  [0.67, 0.979],
  [0.53, 0.996],
  [0.38, 1.004],
  [0.2, 1.009],
  [0.0, 1.012],
];

interface DiskSpec {
  radius: number;
  segments: number;
  face: readonly ProfilePoint[];
  pores: number;
  offset: readonly [number, number];
  yaw: number;
}

// 섹터는 세 장 모두 30으로 통일한다. 24였을 때 접선 방향 셀 폭이 0.15라 기포 벽이 22°밖에
// 안 서서 출하 카메라(azimuth 0, 키라이트가 카메라와 같은 쪽)에서 구멍이 주름으로 뭉갰다.
// 30이면 접선 0.12 / 반지름 0.09로 셀이 거의 정사각이라 벽이 사방으로 선다.
// 위 디스크만 윗면 링을 더 준다 — 아래 두 장은 윗면이 초승달만 보인다.
const DISKS: readonly DiskSpec[] = [
  { radius: 0.99, segments: 30, face: FACE_PROFILE_COARSE, pores: 8, offset: [0.0, 0.0], yaw: 0.0 },
  { radius: 1.0, segments: 30, face: FACE_PROFILE_COARSE, pores: 8, offset: [0.03, -0.02], yaw: 0.9 },
  { radius: 0.97, segments: 30, face: FACE_PROFILE_DENSE, pores: 22, offset: [-0.02, -0.05], yaw: 2.1 },
];

// 기포 크기 등급. 탑다운 실측 지름(930px 대비 크레이터 7.5% · 중 5% · 소 2% · 극소 1.3%)을
// 연속 좌표의 감쇠 반지름으로 쓰면 **하나도 안 보인다** — 반지름 0.018~0.075가 윗면 격자의
// 정점 간격(~0.16)보다 작아서 감쇠 원 안에 드는 정점이 0개다.
// 그래서 구멍은 격자 위에서 판다: 정점 하나를 고정 깊이로 내리고, 큰 등급만 이웃까지 끌어내려
// 폭을 넓힌다. 결과로 나오는 다각형 원뿔이 레퍼런스의 패싯 구멍 모양과 실제로 같다.
// 깊이는 탑다운 실측(0.031)보다 크게 잡았다 — 격자 한 칸이 실제 구멍보다 넓어서,
// 실측 깊이를 그대로 쓰면 벽이 안 서고 구멍이 사라진다. 폭을 못 줄이니 깊이로 기울기를 만든다.
// radialSpread = 안쪽/바깥쪽 링까지 같이 내려 구멍을 반지름 방향으로 넓히는 비율(크레이터만).
// 접선 방향으로는 안 퍼뜨린다 — 퍼뜨리면 다시 완만해진다.
const PORE_CLASSES = [
  { depth: 0.075, radialSpread: 0.45, share: 0.14 }, // 크레이터 — 벽 접선 32° / 반지름 40°
  { depth: 0.058, radialSpread: 0.0, share: 0.27 }, //  중
  { depth: 0.038, radialSpread: 0.0, share: 0.36 }, //  소
  { depth: 0.022, radialSpread: 0.0, share: 0.23 }, //  극소
] as const;
const PORE_MAX_R = 0.8; // 윗면은 0.93까지 — 바깥 8%(지름 기준)는 기포 없는 여백

const JITTER_AMP = 0.008;

/**
 * 손으로 부은 테두리 흔들림 — 섹터 각도만의 순수 함수.
 * 몸통·윗면이 같은 값을 쓰므로 공유 링이 구조적으로 붙어 있다.
 */
function makeWobble(segments: number, rng: () => number): { radius: number[]; rimLift: number[] } {
  const phase3 = rng() * Math.PI * 2;
  const phase7 = rng() * Math.PI * 2;
  const radius: number[] = [];
  const rimLift: number[] = [];
  for (let s = 0; s < segments; s++) {
    const t = (s / segments) * Math.PI * 2;
    radius.push(1 + 0.028 * Math.sin(3 * t + phase3) + 0.018 * Math.sin(7 * t + phase7) + (rng() - 0.5) * 0.024);
    rimLift.push((rng() - 0.5) * 0.03 * DISK_HEIGHT);
  }
  return { radius, rimLift };
}

/** rng 하나로 결정론적 셔플 (Fisher-Yates). */
function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * 격자 좌표 (링, 섹터) 위에 기포를 고른다.
 * 이미 고른 구멍과 격자 거리 1 이내면 거부 — 붙으면 구멍이 아니라 고랑이 된다.
 * 후보를 다 훑고 끝나므로 종료가 보장된다(모자라면 그냥 개수 부족으로 받는다).
 */
function pickPoreCells(
  ringCount: number,
  segments: number,
  count: number,
  rng: () => number,
): { ring: number; sector: number; cls: (typeof PORE_CLASSES)[number] }[] {
  const candidates = shuffle(
    Array.from({ length: ringCount * segments }, (_, n) => ({
      ring: Math.floor(n / segments),
      sector: n % segments,
    })),
    rng,
  );
  // 등급별 목표 개수를 먼저 확정 — 등급을 매번 rng로 뽑으면 큰 크레이터가 0개인 시드가 나온다.
  const quota = PORE_CLASSES.map((c) => Math.max(1, Math.round(count * c.share)));
  const picked: { ring: number; sector: number; cls: (typeof PORE_CLASSES)[number] }[] = [];
  let ci = 0;
  for (const cell of candidates) {
    while (ci < quota.length && quota[ci] === 0) ci++;
    if (ci >= quota.length || picked.length >= count) break;
    const tooClose = picked.some((p) => {
      const ds = Math.abs(p.sector - cell.sector);
      return Math.abs(p.ring - cell.ring) <= 1 && Math.min(ds, segments - ds) <= 1;
    });
    if (tooClose) continue;
    picked.push({ ...cell, cls: PORE_CLASSES[ci] });
    quota[ci]--;
  }
  return picked;
}

/**
 * 디스크 1장을 indexed 지오메트리 하나로 짠다.
 * 몸통 삼각형이 인덱스 앞쪽에 몰리도록 링을 몸통→윗면 순으로 쌓고,
 * 경계 인덱스 하나(bodyTriangles)만 반환하면 나중에 자를 수 있다.
 */
function buildDisk(disk: DiskSpec, rng: () => number): { geometry: THREE.BufferGeometry; bodyTriangles: number } {
  const { segments, radius: R, face } = disk;
  const wobble = makeWobble(segments, rng);

  // 두 프로파일을 하나로 잇는다 — 공유 링 [0.93, 0.90]은 한 번만 넣는다.
  const rings: ProfilePoint[] = [...BODY_PROFILE, ...face.slice(1)];
  const sharedRingIndex = BODY_PROFILE.length - 1;

  const positions: number[] = [];
  const ringStart: number[] = [];

  for (let ri = 0; ri < rings.length; ri++) {
    const [rFrac, hFrac] = rings[ri];
    ringStart.push(positions.length / 3);
    if (rFrac <= 1e-6) {
      // 축 위의 극점 — 섹터 하나로 접는다
      positions.push(0, hFrac * DISK_HEIGHT, 0);
      continue;
    }
    for (let s = 0; s < segments; s++) {
      const t = (s / segments) * Math.PI * 2;
      const rr = rFrac * R * wobble.radius[s];
      // 테두리로 갈수록 높이 노이즈를 키운다 — 축 근처가 출렁이면 크라운이 깨진다
      const y = hFrac * DISK_HEIGHT + wobble.rimLift[s] * rFrac;
      positions.push(Math.cos(t) * rr, y, Math.sin(t) * rr);
    }
  }

  // 기포 함몰 — 윗면 링 중 여백 안쪽만. 극점(중앙)은 후보에서 뺀다.
  // 삼각형 수는 그대로 늘지 않는다.
  const poreRings = rings
    .map((r, ri) => ({ ri, rFrac: r[0] }))
    .filter((r) => r.ri > sharedRingIndex && r.rFrac > 1e-6 && r.rFrac <= PORE_MAX_R)
    .map((r) => r.ri);
  const dip = (ri: number, sector: number, amount: number): void => {
    if (ri < 0 || ri >= poreRings.length) return;
    positions[(ringStart[poreRings[ri]] + ((sector + segments) % segments)) * 3 + 1] -= amount;
  };
  for (const p of pickPoreCells(poreRings.length, segments, disk.pores, rng)) {
    dip(p.ring, p.sector, p.cls.depth);
    if (p.cls.radialSpread > 0) {
      const side = p.cls.depth * p.cls.radialSpread;
      dip(p.ring - 1, p.sector, side);
      dip(p.ring + 1, p.sector, side);
    }
  }

  const index: number[] = [];
  let bodyTriangles = 0;
  for (let ri = 0; ri < rings.length - 1; ri++) {
    const a0 = ringStart[ri];
    const b0 = ringStart[ri + 1];
    const aPole = rings[ri][0] <= 1e-6;
    const bPole = rings[ri + 1][0] <= 1e-6;
    // 와인딩 = 바깥에서 봤을 때 CCW. position이 (cos t, y, sin t)라 t 증가 방향이
    // 위에서 볼 때 시계방향이라, 순진하게 (s, s1, ...) 순으로 감으면 법선이 전부 안쪽을 향한다.
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      if (aPole) {
        index.push(a0, b0 + s, b0 + s1);
      } else if (bPole) {
        index.push(a0 + s1, a0 + s, b0);
      } else {
        index.push(a0 + s, b0 + s1, a0 + s1);
        index.push(a0 + s, b0 + s, b0 + s1);
      }
    }
    // 공유 링에 닿기 전까지가 몸통(림+밑면), 그 이후가 윗면.
    if (ri < sharedRingIndex) bodyTriangles = index.length / 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  // indexed 상태에서 지터 — 공유 정점이 함께 움직여야 면이 안 벌어진다 (types.ts §3)
  jitterVertices(geometry, rng, JITTER_AMP);
  return { geometry, bodyTriangles };
}

/** non-indexed 지오메트리에서 삼각형 [from, to) 구간만 떼어낸다. */
function sliceTriangles(source: THREE.BufferGeometry, from: number, to: number): THREE.BufferGeometry {
  const src = source.attributes.position.array as ArrayLike<number>;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(Array.prototype.slice.call(src, from * 9, to * 9), 3));
  out.computeVertexNormals();
  return out;
}

export const createPancake: BreadBuilder = (rng) => {
  const group = new THREE.Group();
  const topMat = stdMaterial({ color: TOP_COLOR });
  const rimMat = stdMaterial({ color: RIM_COLOR });

  DISKS.forEach((disk, i) => {
    const { geometry, bodyTriangles } = buildDisk(disk, rng);
    // 페이셋 베이크 후 자른다 — toNonIndexed는 인덱스 순서대로 펼치므로 경계가 그대로 보존된다.
    // (런타임 Lambert 교체는 flatShading을 승계하지 않는다 — 지오메트리에 구워야 한다, types.ts §3)
    const baked = facet(geometry);
    const total = baked.attributes.position.count / 3;
    const parts: [THREE.BufferGeometry, THREE.Material][] = [
      [sliceTriangles(baked, 0, bodyTriangles), rimMat],
      [sliceTriangles(baked, bodyTriangles, total), topMat],
    ];
    for (const [geo, mat] of parts) {
      uvTopPlanar(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(disk.offset[0], i * STACK_STEP, disk.offset[1]);
      mesh.rotation.y = disk.yaw;
      group.add(mesh);
    }
  });

  return mergeByMaterial(group);
};
