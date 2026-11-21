// 팬케이크 스택 공유 모듈 — 계열 20종(베이스 1 + 변형 19)이 반죽을 여기서 가져간다.
// 계약은 types.ts 주석이 정본. 선례는 domeShell.ts(campagne 계열이 같은 방식으로 공유한다).
//
// 왜 공유 모듈인가 (2026-09-02): 팬케이크 변형은 `src/sim/ingredients.ts`에 19줄이 이미 있고
// 레퍼런스도 20종이 다 나와 있다. 변형마다 원반 스택을 다시 짜면 19벌의 미묘하게 다른 반죽이
// 생긴다. 여기에 반죽을 두고 변형은 **토핑 목록 + 아틀라스 존 목록**만 쓴다.
//
// ## 베이스 pancake.ts와의 관계
// 수치(프로필·wobble·오프셋/yaw·기포 등급)는 `scripts/breads/pancake.ts`에서 전사했다.
// 절차는 계승하지 않았다(docs/BREADS.md 변형 규칙). 두 가지가 실제로 다르다:
//   1. **마감**: pancake.ts는 `facet`(플랫 노멀, 2026-08-24 파일럿 정본)인데 여기는
//      indexed 유지 + `computeVertexNormals()`(2026-08-30 스무스 클레이 정본, CRIB §마감 계약).
//      GLB 정점이 1/3이라 계열 20종을 고정 2560KB 예산 안에 넣으려면 이 쪽이어야 한다.
//   2. **팔레트·두께**: pancake.ts는 `assets/prompts/breads/pancake.json`의 v2 `geometry.crust`를
//      전사했는데 그 블록은 v5에서 삭제됐다. v5는 윗면이 3단 그라디언트, **옆벽이 연한 크림**이고
//      장당 두께가 약 1.8배다. 여기는 v5를 따른다.
// 베이스 GLB는 아직 옛 빌더 산출물이다 — 재제작은 별도 라운드.
//
// ## 아틀라스 규약 (계열 공용)
// 머티리얼은 1벌, 텍스처는 256² 1장. 런타임이 Lambert로 강제 교체해 map·color만 살아남으므로
// 다색은 전부 이 한 장에서 나온다(types.ts §2).
//   - **spatial 존**: 윗면처럼 2D 변화가 필요한 곳. uv를 좌표로 매핑한다.
//   - **ramp 존**: 나머지 전부. 1D 띠에서 t(0~1)로 샘플한다. 단색은 t 무시.
// ★밉맵을 끄지 않는다. 끄면 슈가파우더 알갱이가 성기게 점 샘플링돼 하드 도트가 되고, 그게 곰팡이로
//   읽힌다(assets/prompts/README.md v4 교훈). 대신 존 사이에 가드 밴드를 크게 둔다 — 카드(60px)에서
//   실제로 샘플되는 밉 레벨에서도 이웃 존이 안 섞이도록.
import * as THREE from 'three';
import { ensureIndexed, jitterVertices, orientToward } from './lib';

// lib으로 옮긴 유틸을 계열 빌더가 여기서 받아 쓰도록 재수출한다(임포트 출처를 하나로).
export { ensureIndexed };

// ---------------------------------------------------------------------------
// 아틀라스 좌표계
// ---------------------------------------------------------------------------

export const ATLAS_PX = 256;

/** 윗면 전용 2D 사분면 — 좌상 128×128. 방사 그라디언트·기포 얼룩·설탕이 전부 여기 산다. */
export const TOP_ZONE = { x: 0, y: 0, w: 128, h: 128 } as const;

/**
 * 1D 램프 존 8칸. 각 칸은 높이 32px이고 **세로 중앙**에서 샘플한다 —
 * 가드 16px이 남아 카드에서 샘플되는 밉 레벨(대략 64² 상당)에서도 이웃 색이 안 섞인다.
 * A열: x 0~256 / y 128~256 (4칸) — 반죽 옆벽처럼 넓게 쓰는 것
 * B열: x 128~256 / y 0~128 (4칸) — 토핑
 */
export type RampSlot = 'A0' | 'A1' | 'A2' | 'A3' | 'B0' | 'B1' | 'B2' | 'B3';

interface RampRect { x: number; y: number; w: number; h: number }

const RAMP_RECTS: Record<RampSlot, RampRect> = {
  A0: { x: 0, y: 128, w: 256, h: 32 },
  A1: { x: 0, y: 160, w: 256, h: 32 },
  A2: { x: 0, y: 192, w: 256, h: 32 },
  A3: { x: 0, y: 224, w: 256, h: 32 },
  B0: { x: 128, y: 0, w: 128, h: 32 },
  B1: { x: 128, y: 32, w: 128, h: 32 },
  B2: { x: 128, y: 64, w: 128, h: 32 },
  B3: { x: 128, y: 96, w: 128, h: 32 },
};

export function rampRect(slot: RampSlot): RampRect {
  return RAMP_RECTS[slot];
}

/**
 * 램프 존의 UV. t는 0~1이며 **양 끝에서 안쪽으로 물러난다** — 램프 끝 텍셀은 이웃 존과
 * 맞닿아 있어 밉 레벨에서 오염되기 때문이다.
 */
export function rampUv(slot: RampSlot, t: number): [number, number] {
  const r = RAMP_RECTS[slot];
  const inset = 3; // px
  const clamped = Math.max(0, Math.min(1, t));
  const px = r.x + inset + clamped * (r.w - inset * 2);
  const py = r.y + r.h / 2;
  return [px / ATLAS_PX, 1 - py / ATLAS_PX];
}

/** 윗면 2D 존의 UV. u·v는 0~1(존 로컬), 가장자리 4px은 가드로 남긴다. */
export function topZoneUv(u: number, v: number): [number, number] {
  const inset = 4;
  const px = TOP_ZONE.x + inset + Math.max(0, Math.min(1, u)) * (TOP_ZONE.w - inset * 2);
  const py = TOP_ZONE.y + inset + Math.max(0, Math.min(1, v)) * (TOP_ZONE.h - inset * 2);
  return [px / ATLAS_PX, 1 - py / ATLAS_PX];
}

/** 존 하나를 통째로 한 색으로 칠할 때 쓰는 캔버스 좌표(패딩 포함) — 가드까지 같은 색이어야 번짐이 없다. */
export function fillRamp(ctx: CanvasRenderingContext2D, slot: RampSlot, paint: (x: number, w: number) => void): void {
  const r = RAMP_RECTS[slot];
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  paint(r.x, r.w);
  ctx.restore();
}

/** 지오메트리 전체에 상수 UV를 박는다(단색 존). */
export function setConstantUv(g: THREE.BufferGeometry, uv: readonly [number, number]): void {
  const count = g.attributes.position.count;
  const arr = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    arr[i * 2] = uv[0];
    arr[i * 2 + 1] = uv[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
}

/** 정점별로 t를 계산해 램프 UV를 박는다(그라디언트 존). */
export function setRampUv(g: THREE.BufferGeometry, slot: RampSlot, tOf: (i: number, p: THREE.BufferAttribute) => number): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const arr = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const uv = rampUv(slot, tOf(i, pos));
    arr[i * 2] = uv[0];
    arr[i * 2 + 1] = uv[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
}

export function hexRgb(h: number): string {
  return `rgb(${(h >> 16) & 0xff}, ${(h >> 8) & 0xff}, ${h & 0xff})`;
}

// ---------------------------------------------------------------------------
// 원반 스택
// ---------------------------------------------------------------------------

/** (반지름비, 높이비) — 높이비 1.0 = 디스크 1장 높이. pancake.ts에서 전사. */
type ProfilePoint = readonly [number, number];

// 몸통: 밑면 → 아래 림 → 적도(최대 반지름) → 위 림 → 테두리 링.
// 마지막 점이 윗면 프로파일 첫 점과 같은 자리다 = 투톤 경계(여기서 UV가 갈린다).
const BODY_PROFILE: readonly ProfilePoint[] = [
  [0.0, 0.09],
  [0.82, 0.0],
  [0.975, 0.26],
  [1.0, 0.52],
  [0.985, 0.74],
  [0.93, 0.9],
];

// 윗면: 테두리에서 안쪽으로. 중앙이 봉긋하고 가장자리가 처진다.
// 링을 촘촘히 쓰는 이유는 곡률이 아니라 **기포 벽 기울기** — 링 간격이 곧 구멍의 반지름이라
// 성기면 벽이 안 서고 Lambert 대비가 사라진다 (pancake.ts 주석 전사).
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

/** 투톤 경계의 반지름비 — 여기 바깥이 옆벽, 안쪽이 구운 윗면. */
export const RIM_FRAC = 0.93;

export interface StackOptions {
  /** 원반 1장 두께(반지름 1.0 기준). v5 = 지름의 약 0.207 → 0.41. */
  diskHeight: number;
  /** 층 간격. diskHeight보다 살짝 작아야 원반이 서로 눌린다. */
  stackStep: number;
  /** 원반별 기포 개수(아래→위). v5는 "윗면 림 근처 핀헤드 몇 개"라 베이스보다 훨씬 적다. */
  poreCounts: readonly [number, number, number];
  /** 섹터 수. 접선 셀 폭이 기포 벽 기울기를 정한다. */
  segments?: number;
  /** 지터 진폭(수평). 수직은 두께에 비례해 스케일된다 — 아래 JITTER 주석 참조. */
  jitterAmp?: number;
}

interface DiskSpec {
  radius: number;
  face: readonly ProfilePoint[];
  offset: readonly [number, number];
  yaw: number;
}

// 손으로 놓은 오프셋 — v5 body: "the middle one shifted a little to the right, the top one a little back".
const DISKS: readonly DiskSpec[] = [
  { radius: 0.99, face: FACE_PROFILE_COARSE, offset: [0.0, 0.0], yaw: 0.0 },
  { radius: 1.0, face: FACE_PROFILE_COARSE, offset: [0.03, -0.02], yaw: 0.9 },
  { radius: 0.97, face: FACE_PROFILE_DENSE, offset: [-0.02, -0.05], yaw: 2.1 },
];

// 기포 등급. 구멍은 격자 위에서 판다 — 감쇠 반지름이 정점 간격보다 작으면 조용히 사라진다.
// ★깊이는 pancake.ts 값을 **그대로 쓰지 않는다**. 저기 값(0.022~0.075)은 diskHeight 0.222에
// 맞춘 것이고, 여기는 0.41이라 링 간격이 벌어져 같은 깊이면 벽이 눕는다. 아래 poreDepth()가
// 두께에 비례해 다시 낸다(CRIB 벽 기울기 ≥30°).
const PORE_CLASSES = [
  { depthFrac: 0.34, radialSpread: 0.45, share: 0.14 }, // 크레이터
  { depthFrac: 0.26, radialSpread: 0.0, share: 0.27 },
  { depthFrac: 0.17, radialSpread: 0.0, share: 0.36 },
  { depthFrac: 0.1, radialSpread: 0.0, share: 0.23 },
] as const;
const PORE_MAX_R = 0.8;

const DEFAULT_SEGMENTS = 26;
const DEFAULT_JITTER = 0.008;

/** 손으로 부은 테두리 흔들림 — 섹터 각도만의 순수 함수. 몸통·윗면이 같은 값을 써야 링이 붙는다. */
function makeWobble(segments: number, rng: () => number, diskHeight: number): { radius: number[]; rimLift: number[] } {
  const phase3 = rng() * Math.PI * 2;
  const phase7 = rng() * Math.PI * 2;
  const radius: number[] = [];
  const rimLift: number[] = [];
  for (let s = 0; s < segments; s++) {
    const t = (s / segments) * Math.PI * 2;
    radius.push(1 + 0.028 * Math.sin(3 * t + phase3) + 0.018 * Math.sin(7 * t + phase7) + (rng() - 0.5) * 0.024);
    rimLift.push((rng() - 0.5) * 0.03 * diskHeight);
  }
  return { radius, rimLift };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** 격자 (링, 섹터) 위에 기포를 고른다. 격자 거리 1 이내면 거부 — 붙으면 구멍이 아니라 고랑이 된다. */
function pickPoreCells(
  ringCount: number,
  segments: number,
  count: number,
  rng: () => number,
): { ring: number; sector: number; cls: (typeof PORE_CLASSES)[number] }[] {
  if (count <= 0) return [];
  const candidates = shuffle(
    Array.from({ length: ringCount * segments }, (_, n) => ({ ring: Math.floor(n / segments), sector: n % segments })),
    rng,
  );
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

export interface DiskBuild {
  /** 옆벽·밑면(림 바깥) — 연한 크림 크럼. */
  side: THREE.BufferGeometry;
  /** 구운 윗면(림 안쪽). */
  top: THREE.BufferGeometry;
  /** 이 원반의 월드 y 오프셋과 xz 오프셋 — 토핑을 앉힐 때 쓴다. */
  origin: THREE.Vector3;
  radius: number;
}

/**
 * 원반 1장을 짠다. 몸통(옆벽)과 윗면을 **경계 링을 복제해** 두 지오메트리로 낸다.
 *
 * 왜 복제하나: 두 가지 이유가 겹친다.
 *  1. UV — 옆벽은 크림 램프, 윗면은 2D 존이라 같은 정점이 서로 다른 UV를 요구한다.
 *  2. 노멀 — 공유하면 평균 노멀이 45°가 되어 테두리 한 셀이 통째로 모따기로 읽힌다
 *     (쿠션처럼 보이고 "부친 팬케이크"의 선이 사라진다. CRIB §마감 계약 rim 모따기 함정).
 * ★복제 링은 **지터 뒤에 원본 좌표를 재복사**한다 — 안 하면 두 링이 따로 움직여 실금이 뜬다.
 */
function buildDisk(disk: DiskSpec, opts: Required<StackOptions>, poreCount: number, rng: () => number): DiskBuild {
  const segments = opts.segments;
  const R = disk.radius;
  const H = opts.diskHeight;
  const wobble = makeWobble(segments, rng, H);

  const sideRings = BODY_PROFILE;
  const topRings = disk.face;

  const ringPos = (rFrac: number, hFrac: number): number[] => {
    const out: number[] = [];
    if (rFrac <= 1e-6) {
      out.push(0, hFrac * H, 0);
      return out;
    }
    for (let s = 0; s < segments; s++) {
      const t = (s / segments) * Math.PI * 2;
      const rr = rFrac * R * wobble.radius[s];
      // 테두리로 갈수록 높이 노이즈를 키운다 — 축 근처가 출렁이면 크라운이 깨진다
      const y = hFrac * H + wobble.rimLift[s] * rFrac;
      out.push(Math.cos(t) * rr, y, Math.sin(t) * rr);
    }
    return out;
  };

  const build = (rings: readonly ProfilePoint[]): { geo: THREE.BufferGeometry; ringStart: number[]; positions: number[] } => {
    const positions: number[] = [];
    const ringStart: number[] = [];
    for (const [rFrac, hFrac] of rings) {
      ringStart.push(positions.length / 3);
      positions.push(...ringPos(rFrac, hFrac));
    }
    const index: number[] = [];
    for (let ri = 0; ri < rings.length - 1; ri++) {
      const a0 = ringStart[ri];
      const b0 = ringStart[ri + 1];
      const aPole = rings[ri][0] <= 1e-6;
      const bPole = rings[ri + 1][0] <= 1e-6;
      // 와인딩 = 바깥에서 봤을 때 CCW. position이 (cos t, y, sin t)라 t 증가가 위에서 볼 때
      // 시계방향이므로 순진하게 감으면 법선이 전부 안쪽을 향한다(check-winding.mjs의 유래).
      for (let s = 0; s < segments; s++) {
        const s1 = (s + 1) % segments;
        if (aPole) index.push(a0, b0 + s, b0 + s1);
        else if (bPole) index.push(a0 + s1, a0 + s, b0);
        else {
          index.push(a0 + s, b0 + s1, a0 + s1);
          index.push(a0 + s, b0 + s, b0 + s1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(index);
    return { geo, ringStart, positions };
  };

  const side = build(sideRings);
  const top = build(topRings);

  // 기포 — 윗면 링 중 여백 안쪽만. 극점(중앙)은 후보에서 뺀다. tri는 안 늘어난다.
  const poreRings = topRings
    .map((r, ri) => ({ ri, rFrac: r[0] }))
    .filter((r) => r.ri > 0 && r.rFrac > 1e-6 && r.rFrac <= PORE_MAX_R)
    .map((r) => r.ri);
  const topPos = top.geo.attributes.position as THREE.BufferAttribute;
  const dip = (ri: number, sector: number, amount: number): void => {
    if (ri < 0 || ri >= poreRings.length) return;
    const base = top.ringStart[poreRings[ri]] + ((sector + segments) % segments);
    topPos.setY(base, topPos.getY(base) - amount);
  };
  for (const p of pickPoreCells(poreRings.length, segments, poreCount, rng)) {
    const depth = p.cls.depthFrac * H;
    dip(p.ring, p.sector, depth);
    if (p.cls.radialSpread > 0) {
      const sideDepth = depth * p.cls.radialSpread;
      dip(p.ring - 1, p.sector, sideDepth);
      dip(p.ring + 1, p.sector, sideDepth);
    }
  }
  topPos.needsUpdate = true;

  // 지터 — indexed 상태에서. 수직 성분은 두께에 비례시킨다:
  // 두께만 키우고 지터를 그대로 두면 링 간격 대비 상대 진폭이 줄어 옆벽이 매끈한 플라스틱이 되고,
  // 반대로 얇은 빵에 큰 진폭을 쓰면 가로 계단 밴딩이 생긴다(sconeChocoChip 실측 교훈).
  const ampScale = H / 0.222; // 0.222 = pancake.ts의 기준 두께
  jitterVertices(side.geo, rng, opts.jitterAmp);
  jitterVertices(top.geo, rng, opts.jitterAmp * ampScale);

  // ★복제 링 원좌표 재복사 — 옆벽의 마지막 링과 윗면의 첫 링은 같은 자리여야 한다.
  const sideLast = side.ringStart[sideRings.length - 1];
  const topFirst = top.ringStart[0];
  const sidePos = side.geo.attributes.position as THREE.BufferAttribute;
  for (let s = 0; s < segments; s++) {
    topPos.setXYZ(topFirst + s, sidePos.getX(sideLast + s), sidePos.getY(sideLast + s), sidePos.getZ(sideLast + s));
  }
  topPos.needsUpdate = true;

  side.geo.computeVertexNormals();
  top.geo.computeVertexNormals();
  // 면 방향을 선언한다 — 옆벽은 반지름 바깥, 윗면은 위. 둘 다 경계가 열린 조각이라
  // check-winding.mjs(부호부피)도 mergeByMaterial의 사전 경고도 판정할 수 없다.
  // 뒤집히면 런타임 FrontSide 컬링으로 각도에 따라 통째로 사라진다 — 만들 때 못 박는 게 유일한 방어다.
  orientToward(side.geo, (c) => new THREE.Vector3(c.x, 0, c.z));
  orientToward(top.geo, new THREE.Vector3(0, 1, 0));

  // UV — 옆벽은 높이 램프(t=0 밑면 → 1 테두리), 윗면은 2D 존(반지름 극좌표).
  setRampUv(side.geo, 'A0', (i, p) => {
    const y = p.getY(i);
    return Math.max(0, Math.min(1, y / (H * 0.9)));
  });
  const topUv = new Float32Array(topPos.count * 2);
  for (let i = 0; i < topPos.count; i++) {
    const x = topPos.getX(i);
    const z = topPos.getZ(i);
    const rFrac = Math.min(1, Math.hypot(x, z) / (R * RIM_FRAC));
    const ang = Math.atan2(z, x);
    // 존 로컬 극좌표 → 정사각 매핑. 방사 그라디언트와 얼룩·설탕이 같은 좌표계를 쓴다.
    const uv = topZoneUv(0.5 + 0.5 * rFrac * Math.cos(ang), 0.5 + 0.5 * rFrac * Math.sin(ang));
    topUv[i * 2] = uv[0];
    topUv[i * 2 + 1] = uv[1];
  }
  top.geo.setAttribute('uv', new THREE.BufferAttribute(topUv, 2));

  return {
    side: side.geo,
    top: top.geo,
    origin: new THREE.Vector3(disk.offset[0], 0, disk.offset[1]),
    radius: R,
  };
}

export interface StackBuild {
  /** 아래→위 순서. 각 원반은 이미 자기 자리로 옮겨져 있다. */
  disks: DiskBuild[];
  /** 맨 위 원반의 윗면 중심 y — 토핑을 여기 얹는다. */
  topY: number;
  topRadius: number;
  topCenter: THREE.Vector3;
  /**
   * 높이 y에서 스택 바깥 실루엣의 반지름. 시럽·소스·꿀 드립이 옆면을 **타고** 흐르게 하는 데 쓴다.
   * 상수 반지름으로 드립을 세우면 적도에서는 파묻히고 잘록한 데서는 공중에 뜬 띠가 된다(실측).
   * 계열 20종 중 흘러내리는 토핑이 있는 것(메이플·꿀·초코 드리즐)이 전부 이걸 쓴다.
   */
  silhouetteRadiusAt(y: number): number;
  /**
   * 맨 위 원반 윗면의 높이 y(반지름비 rFrac 0~1). 고이는 토핑(소스 웅덩이·시럽·버터 녹은 자리)을
   * 여기에 앉힌다. 평평한 원반으로 두면 돔을 뚫고 들락거려 **찢어진 얼룩**처럼 보인다(실측).
   * 계열에서 위에 뭔가 고이는 변형(메이플·꿀·초코·잼)이 전부 이걸 쓴다.
   */
  topFaceHeightAt(rFrac: number): number;
}

/**
 * 3단 스택을 짠다. 반환 지오메트리는 전부 **월드 좌표로 이동·회전이 끝난 indexed** 상태다
 * (호출자는 머티리얼만 붙여 mergeByMaterial에 넘기면 된다).
 */
export function buildPancakeStack(rng: () => number, options: StackOptions): StackBuild {
  const opts: Required<StackOptions> = {
    segments: options.segments ?? DEFAULT_SEGMENTS,
    jitterAmp: options.jitterAmp ?? DEFAULT_JITTER,
    diskHeight: options.diskHeight,
    stackStep: options.stackStep,
    poreCounts: options.poreCounts,
  };
  const disks: DiskBuild[] = [];
  DISKS.forEach((spec, i) => {
    const d = buildDisk(spec, opts, opts.poreCounts[i], rng);
    const m = new THREE.Matrix4()
      .makeTranslation(spec.offset[0], i * opts.stackStep, spec.offset[1])
      .multiply(new THREE.Matrix4().makeRotationY(spec.yaw));
    d.side.applyMatrix4(m);
    d.top.applyMatrix4(m);
    d.origin.set(spec.offset[0], i * opts.stackStep, spec.offset[1]);
    disks.push(d);
  });
  const last = disks[disks.length - 1];
  // 몸통 프로필을 (높이비 → 반지름비)로 뒤집은 표. BODY_PROFILE의 첫 점은 밑면 극점이라 뺀다
  // (극점을 넣으면 h가 단조가 아니게 되고, CRIB의 "프로필 t는 단조" 규칙과도 어긋난다).
  const silhouette = BODY_PROFILE.slice(1).map(([r, h]) => [h, r] as const);
  const radiusOfDisk = (hFrac: number): number => {
    if (hFrac <= silhouette[0][0]) return silhouette[0][1];
    for (let i = 0; i < silhouette.length - 1; i++) {
      const [h0, r0] = silhouette[i];
      const [h1, r1] = silhouette[i + 1];
      if (hFrac <= h1) return r0 + ((r1 - r0) * (hFrac - h0)) / Math.max(h1 - h0, 1e-6);
    }
    // 테두리 위쪽은 윗면이 맡는다 — 급히 좁아진다
    const t = Math.min(1, (hFrac - 0.9) / 0.112);
    return silhouette[silhouette.length - 1][1] * (1 - 0.35 * t);
  };
  const silhouetteRadiusAt = (y: number): number => {
    let best = 0;
    DISKS.forEach((spec, i) => {
      const y0 = i * opts.stackStep;
      const hFrac = (y - y0) / opts.diskHeight;
      if (hFrac < -0.05 || hFrac > 1.05) return;
      const r = radiusOfDisk(Math.max(0, Math.min(1.012, hFrac))) * spec.radius;
      if (r > best) best = r;
    });
    return best > 0 ? best : DISKS[0].radius * 0.5;
  };
  // 윗면 프로필을 (반지름비 → 높이비)로 뒤집은 표. 맨 위 원반은 DENSE를 쓴다.
  const faceTable = DISKS[DISKS.length - 1].face;
  const topFaceHeightAt = (rFrac: number): number => {
    const r = Math.max(0, Math.min(RIM_FRAC, rFrac * RIM_FRAC));
    // faceTable은 rFrac 내림차순(0.93 → 0)
    for (let i = 0; i < faceTable.length - 1; i++) {
      const [r0, h0] = faceTable[i];
      const [r1, h1] = faceTable[i + 1];
      if (r <= r0 && r >= r1) {
        const t = (r0 - r) / Math.max(r0 - r1, 1e-6);
        return last.origin.y + (h0 + (h1 - h0) * t) * opts.diskHeight;
      }
    }
    return last.origin.y + faceTable[0][1] * opts.diskHeight;
  };
  return {
    disks,
    topFaceHeightAt,
    topY: last.origin.y + opts.diskHeight * 1.012,
    topRadius: last.radius,
    topCenter: last.origin.clone(),
    silhouetteRadiusAt,
  };
}

/**
 * 정면 방위 — 3/4 카메라 (-1.6, 2.2, 2.6)가 보는 쪽.
 * `atan2(2.6, -1.6)` = 121.6°. 비대칭 구성(소스 드립·토핑 쏠림)은 이 방향을 향해야 한다.
 * 비대칭 빵은 방향을 1반복차에 확인하라는 CRIB 규칙(scone: 180° 회전만으로 IoU 0.659→0.821).
 */
export const FRONT_ANGLE = Math.atan2(2.6, -1.6);
