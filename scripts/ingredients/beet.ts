// 비트 — 세로로 반 자른 단일 뿌리. 계약은 types.ts 주석이 정본. 재료 2차 배치(신규 4종) 1번째.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/beet.json(워크스페이스 원본은
// assets/ingredients/work/beet/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// fig와 같은 half-revolution+ruled-cap 패턴(fig.ts의 buildHalfShell 로컬 함수를 그대로 복제) —
// 레퍼런스 3장이 전부 절단면을 카메라로 정면으로 향한 거의 완전한 구체(비트는 무화과와 달리
// 위아래가 거의 대칭인 둥근 뿌리)라 PROFILE만 대칭에 가깝게 다시 잡았다. 절단면 무늬는 무화과의
// 각도 기반 방사 씨앗줄 대신 **거리 기반 동심원**(나이테)이라 훨씬 단순하다 — atan2 불필요.
//
// ★2026-08-28 턴테이블 수리 — 되돌리지 말 것.
// 연직 절단면(+Z)은 FrontSide라 azimuth 180에서 껍질만 남아 자주색 돌이 됐다. yaw로는
// 앞·뒤가 180° 떨어져 동시에 속을 못 보여 준다. rotateX로 법선에 +Y를 싣고(sweetpotato
// ROTATE_X · CRIB "절단면류 법선에 +Y 성분") 반구 Z를 납작하게 해 고각 카메라에서 전 방위
// 나이테가 남게 했다. 아랫극만 짧게 모아 스침각 실루엣이 뿌리지, 긴 주근은 당근이 된다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { bakeTexture, buildRevolvedShell, facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/beet.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const SKIN_COLOR = 0x5c2438; // "a thin deep maroon-brown skin rim"
const RING_DARK = 0x7a2350; // "deeper plum-magenta" — 링 교대색 + 중심 점
const RING_PALE = 0xc4548a; // "paler dusty pink" — 링 교대색
// 기본 톤(#A83368 "a matte magenta cut face")은 별도 버킷을 안 만든다 — 명시된 두 교대색(RING_DARK/
// RING_PALE)만으로 이미 레퍼런스의 나이테 패턴을 재현하고, 세 번째 미묘한 톤은 64px에서 두 교대색과
// 구분이 안 될 만큼 가깝다(스펙 risk base-tone-merged-into-alternation 참조).

// 실측 비율 (assets/ingredients/src/beet.png 3/4 · beet-2.png 정면 · beet-3.png 탑다운 — 세 장
// 전부 절단면이 카메라를 거의 정면으로 향해 찍혀 몸통 옆모습 정보가 없다. 무화과와 달리 비트는
// 위아래 거의 대칭인 둥근 뿌리라 프로필을 대칭에 가깝게 잡았다).
const BEET_RADIUS = 0.6; // 적도(절단면) 반지름
const BEET_HALF_LENGTH = 0.6; // 극-극 절반 길이 — 거의 구형(비율 1:1). 아랫극만 살짝 아래로.
const BEET_SEGMENTS = 20; // ★12→20 (2026-08-26, fig와 동일 밀도 유지). 예산 상향
// (2500→8000tri) 후 전체 화면 기준 재판정 — 12컬럼(15°)은 @180/@270에서 실루엣이 각졌다.

type ProfilePoint = readonly [number, number];
// (반지름비, 높이비) — 아랫극 .. +1(윗극, 스텁). 몸통은 둥근 비트, 아래만 짧게 모아 스침각에서
// 뿌리로 읽히게 한다. hFrac -1.48 주근은 히어로가 눈물방울/당근이 되어 버렸다 — 되돌리지 말 것.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.1],
  [0.42, -0.96],
  [0.72, -0.74],
  [0.92, -0.48],
  [1.0, -0.08],
  [0.96, 0.28],
  [0.82, 0.55],
  [0.58, 0.78],
  [0.3, 0.93],
  [0.1, 0.99],
  [0.0, 1.0],
];

const JITTER_AMP = 0.01; // ★0.018→0.012 (2026-08-26) →0.01. 윗극 링(rFrac 0.1) 간격 ≈0.0094
// 아래로 둔다. 세그먼트를 더 올리면 같이 내릴 것.

const STUB_RADIUS_BOTTOM = 0.11;
const STUB_RADIUS_TOP = 0.08;
const STUB_HEIGHT = 0.14; // "a short trimmed stub" — pumpkin/fig 꼭지보다 짧게
const STUB_SEGMENTS = 12; // ★7→12 (2026-08-26). 12각의 추가 비용은 ~20tri라 아낄 이유가 없다.
const STUB_EMBED = 0.07; // ★0.05→0.07 (2026-08-26). 밑동 반지름이 몸통보다 커서 턱이 생겼다 — 묻는다.
const STUB_JITTER_AMP = 0.006;

// rotateX(-α) 후 법선 (0, sin α, cos α). α>50°여야 n·cam_180>0 (2.2 sinα − 2.6 cosα).
// 72°는 접시처럼 눕고, 58°는 180에서 나이테가 스친다. 64°가 세운 반쪽과 뒷면 속살의 타협.
const TILT_X = -1.12; // ~-64deg
const DEPTH_SCALE = 0.76; // 반구 Z. 1이면 틸트 후에도 돔이 단면을 가리기 쉽다.

// 단면 텍스처 — 거리 기반 동심원(나이테). 무화과의 각도 기반 방사 씨앗줄과 달리 atan2가 필요 없다.
const TEX_SIZE = 192; // <=256 (R3)
const RING_COUNT = 6; // beet-2.png 정면 실측: 절단면 가장자리에서 중심 점까지 교대 밴드 ~6개
const BAND_LOW = -0.15;
const BAND_HIGH = 0.15;
const CORE_H_FRAC = -0.05; // 나이테가 수렴하는 중심 — PROFILE 최대 반지름 지점 근처
const RIM_INNER = 0.84; // 스펙 "thin deep maroon-brown skin rim" — 스침각에서 속살·껍질 경계
const RIM_OUTER = 0.98;

const H_MIN = PROFILE[0][1];
const H_MAX = PROFILE[PROFILE.length - 1][1];

function profileRadiusAt(hFrac: number): number {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [r0, h0] = PROFILE[i];
    const [r1, h1] = PROFILE[i + 1];
    if (hFrac >= h0 && hFrac <= h1) {
      const t = h1 === h0 ? 0 : (hFrac - h0) / (h1 - h0);
      return r0 + (r1 - r0) * t;
    }
  }
  return 0;
}

/**
 * 로컬 half-revolution 셸 — fig.ts의 buildHalfShell을 그대로 복제(lib.ts에 없음, 재료마다 로컬
 * 보유가 확립된 관례 — fig.ts 머리 주석 참조). phi 0..pi를 논-랩(컬럼 0..segments)으로 짓고,
 * 스킨(회전면)과 캡(phi=0/phi=segments 림을 잇는 룰드 서피스)을 한 인덱스 버퍼에 순서대로 push —
 * 두 그룹의 삼각형 개수를 생성 시점에 알아 정점 마스크 없이 sliceTriangles로 가른다.
 */
function buildHalfShell(
  profile: readonly ProfilePoint[],
  segments: number,
  radius: number,
  heightScale: number,
  depthScale: number,
): { geometry: THREE.BufferGeometry; skinTriCount: number; capTriCount: number } {
  const positions: number[] = [];
  const ringStart: number[] = [];
  for (const [rFrac, hFrac] of profile) {
    ringStart.push(positions.length / 3);
    if (rFrac <= 1e-6) {
      positions.push(0, hFrac * heightScale, 0);
      continue;
    }
    for (let s = 0; s <= segments; s++) {
      const t = (s / segments) * Math.PI; // phi in [0, pi]
      positions.push(Math.cos(t) * rFrac * radius, hFrac * heightScale, -Math.sin(t) * rFrac * radius * depthScale);
    }
  }

  const skinIndex: number[] = [];
  for (let ri = 0; ri < profile.length - 1; ri++) {
    const a0 = ringStart[ri];
    const b0 = ringStart[ri + 1];
    const aPole = profile[ri][0] <= 1e-6;
    const bPole = profile[ri + 1][0] <= 1e-6;
    for (let s = 0; s < segments; s++) {
      const s1 = s + 1;
      if (aPole) {
      // ★와인딩 반전 수정(2026-08-26). 이 셸의 좌표계가 lib의 buildRevolvedShell과
      // **거울상**이다(lib은 z=+sin, 여기는 z=-sin). 감기를 lib 것을 그대로 복사해
      // 손잡이가 뒤집혀 법선이 전부 안을 향했다. FrontSide 컬링이라 가까운 벽이 사라지고
      // 먼 벽 안쪽이 보인다 — "떠 있는 꼭지". ⚠ 캡은 이 좌표계에서 손으로 유도한 것이라 스킨만 뒤집는다.
        skinIndex.push(a0, b0 + s1, b0 + s);
      } else if (bPole) {
        skinIndex.push(a0 + s, a0 + s1, b0);
      } else {
        skinIndex.push(a0 + s, a0 + s1, b0 + s1);
        skinIndex.push(a0 + s, b0 + s1, b0 + s);
      }
    }
  }

  const capIndex: number[] = [];
  for (let ri = 0; ri < profile.length - 1; ri++) {
    const a0 = ringStart[ri];
    const b0 = ringStart[ri + 1];
    const aPole = profile[ri][0] <= 1e-6;
    const bPole = profile[ri + 1][0] <= 1e-6;
    const aRight = a0;
    const aLeft = aPole ? a0 : a0 + segments;
    const bRight = b0;
    const bLeft = bPole ? b0 : b0 + segments;
    if (aPole) {
      capIndex.push(aRight, bRight, bLeft);
    } else if (bPole) {
      capIndex.push(aRight, bLeft, aLeft);
    } else {
      capIndex.push(aRight, bRight, bLeft);
      capIndex.push(aRight, bLeft, aLeft);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([...skinIndex, ...capIndex]);
  return { geometry, skinTriCount: skinIndex.length / 3, capTriCount: capIndex.length / 3 };
}

/** uvTopPlanar(X,Z)는 캡(z~=0 평면)에서 V축이 0폭으로 퇴화한다 — 로컬 정면투영(X,Y) 대체(fig.ts 동일 함정). */
function uvFrontPlanar(g: THREE.BufferGeometry): void {
  g.computeBoundingBox();
  const b = g.boundingBox as THREE.Box3;
  const sx = Math.max(b.max.x - b.min.x, 1e-6);
  const sy = Math.max(b.max.y - b.min.y, 1e-6);
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - b.min.x) / sx;
    uv[i * 2 + 1] = (pos.getY(i) - b.min.y) / sy;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function paintBeetCutfaceTexture(): THREE.CanvasTexture {
  const dark: [number, number, number] = [(RING_DARK >> 16) & 0xff, (RING_DARK >> 8) & 0xff, RING_DARK & 0xff];
  const pale: [number, number, number] = [(RING_PALE >> 16) & 0xff, (RING_PALE >> 8) & 0xff, RING_PALE & 0xff];
  const rim: [number, number, number] = [(SKIN_COLOR >> 16) & 0xff, (SKIN_COLOR >> 8) & 0xff, SKIN_COLOR & 0xff];
  const yMin = H_MIN * BEET_HALF_LENGTH;
  const yMax = H_MAX * BEET_HALF_LENGTH;
  const ySpan = Math.max(yMax - yMin, 1e-6);
  const coreY = CORE_H_FRAC * BEET_HALF_LENGTH;

  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size;
        // CanvasTexture flipY=true: 캔버스 맨 윗줄(py=0) = 메시 V=1 (uvFrontPlanar 윗극).
        const v = 1 - (py + 0.5) / size;
        const localX = (u - 0.5) * 2 * BEET_RADIUS;
        const localY = yMin + v * ySpan;
        const hFrac = localY / BEET_HALF_LENGTH;
        const dist = Math.min(Math.hypot(localX, localY - coreY) / BEET_RADIUS, 1.02);
        const stripe = Math.cos(RING_COUNT * Math.PI * dist);
        const t = smoothstep(BAND_LOW, BAND_HIGH, stripe); // t=1 at stripe peak(dist=0) => 중심은 어두운 점
        const rBound = Math.max(profileRadiusAt(hFrac) * BEET_RADIUS, 1e-6);
        const edge = Math.abs(localX) / rBound;
        const rimT = smoothstep(RIM_INNER, RIM_OUTER, edge);
        const o = (py * size + px) * 4;
        img.data[o] = lerpChannel(lerpChannel(pale[0], dark[0], t), rim[0], rimT);
        img.data[o + 1] = lerpChannel(lerpChannel(pale[1], dark[1], t), rim[1], rimT);
        img.data[o + 2] = lerpChannel(lerpChannel(pale[2], dark[2], t), rim[2], rimT);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function buildStub(rng: () => number): THREE.BufferGeometry {
  // ★뚜껑 링 추가(2026-08-26) — 되돌리지 말 것.
  // 이전 프로필은 [[1,-1],[1,1]] 두 링뿐이라 **옆벽만 있고 양 끝이 뚫린 통**이었다.
  // stdMaterial은 FrontSide라 뚫린 윗면으로 통 안쪽이 보이고, 실측상 @180/@270에서 스텁이
  // 두 개의 뿔("고양이 귀")로, @0/@90에서는 속이 보이는 컵으로 읽혔다.
  // rFrac=0 극점 링을 양 끝에 붙이면 buildRevolvedShell의 aPole/bPole 분기가 원판 뚜껑을 만든다
  // (극점 hFrac을 림과 같게 둬 높이 불변 — 잘라낸 자리라 평평한 게 맞다).
  // 링이 4개가 됐으므로 radialScale은 ringIndex<=1(아랫극·아랫림) 기준으로 갈라야 한다.
  const { geometry } = buildRevolvedShell(
    [
      [0, -1],
      [1, -1],
      [1, 1],
      [0, 1],
    ],
    STUB_SEGMENTS,
    STUB_HEIGHT / 2,
    (_hFrac, ringIndex) => (ringIndex <= 1 ? [STUB_RADIUS_BOTTOM, STUB_RADIUS_BOTTOM] : [STUB_RADIUS_TOP, STUB_RADIUS_TOP]),
  );
  jitterVertices(geometry, rng, STUB_JITTER_AMP);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  baked.translate(0, BEET_HALF_LENGTH - STUB_EMBED + STUB_HEIGHT / 2, 0);
  return baked;
}

export const createBeet: IngredientBuilder = (rng) => {
  const { geometry, skinTriCount, capTriCount } = buildHalfShell(
    PROFILE,
    BEET_SEGMENTS,
    BEET_RADIUS,
    BEET_HALF_LENGTH,
    DEPTH_SCALE,
  );
  // 지터는 셸 전체(스킨+캡 공유 정점)에 한 번만 — R1: 이음매가 절대 찢어지지 않는다.
  jitterVertices(geometry, rng, JITTER_AMP);
  const baked = facet(geometry);
  const skinGeo = sliceTriangles(baked, 0, skinTriCount);
  const capGeo = sliceTriangles(baked, skinTriCount, skinTriCount + capTriCount);
  uvTopPlanar(skinGeo);
  uvFrontPlanar(capGeo); // UV는 회전 전 절단면(XY)에서 — 회전 후 bbox는 절단면을 안 담는다.

  const stubGeo = buildStub(rng);
  skinGeo.rotateX(TILT_X);
  capGeo.rotateX(TILT_X);
  stubGeo.rotateX(TILT_X);

  const skinMat = stdMaterial({ color: SKIN_COLOR });
  const cutfaceMat = stdMaterial({ map: paintBeetCutfaceTexture(), color: 0xffffff });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(skinGeo, skinMat));
  group.add(new THREE.Mesh(capGeo, cutfaceMat));
  group.add(new THREE.Mesh(stubGeo, skinMat)); // 스텁은 skin 버킷과 합류(잎을 자르고 남은 뿌리색)

  return mergeByMaterial(group);
};
