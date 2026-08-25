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
const BEET_HALF_LENGTH = 0.6; // 극-극 절반 길이 — 거의 구형(비율 1:1)
const BEET_SEGMENTS = 12; // half-revolution 컬럼 수 (fig와 동일 밀도)

type ProfilePoint = readonly [number, number];
// (반지름비, 높이비) — heightFrac -1(아랫극) .. +1(윗극, 스텁과 만남). 거의 대칭이되 살짝 아래쪽이
// 더 넓다(beet.png 3/4뷰 실측 — 절단면 원이 정중앙보다 살짝 위에서 시작해 아래로 넓어진다).
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.55, -0.88],
  [0.85, -0.65],
  [0.97, -0.35],
  [1.0, -0.05],
  [0.97, 0.28],
  [0.82, 0.55],
  [0.58, 0.78],
  [0.3, 0.93],
  [0.1, 0.99],
  [0.0, 1.0],
];

const JITTER_AMP = 0.018; // ~3% of BEET_RADIUS — R4, olive/fig와 같은 자릿수

const STUB_RADIUS_BOTTOM = 0.11;
const STUB_RADIUS_TOP = 0.08;
const STUB_HEIGHT = 0.14; // "a short trimmed stub" — pumpkin/fig 꼭지보다 짧게
const STUB_SEGMENTS = 7;
const STUB_EMBED = 0.05;
const STUB_JITTER_AMP = 0.006;

// 단면 텍스처 — 거리 기반 동심원(나이테). 무화과의 각도 기반 방사 씨앗줄과 달리 atan2가 필요 없다.
const TEX_SIZE = 192; // <=256 (R3)
const RING_COUNT = 6; // beet-2.png 정면 실측: 절단면 가장자리에서 중심 점까지 교대 밴드 ~6개
const BAND_LOW = -0.15;
const BAND_HIGH = 0.15; // 사이는 smoothstep — 레퍼런스의 밴드는 폭이 고르게 나뉘어 있어(pumpkin 홈보다
// 대칭적으로) 좁힐 필요가 없었다.
const CORE_H_FRAC = -0.05; // 나이테가 수렴하는 중심 — PROFILE 최대 반지름 지점과 동일

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
      positions.push(Math.cos(t) * rFrac * radius, hFrac * heightScale, -Math.sin(t) * rFrac * radius);
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
        skinIndex.push(a0, b0 + s, b0 + s1);
      } else if (bPole) {
        skinIndex.push(a0 + s1, a0 + s, b0);
      } else {
        skinIndex.push(a0 + s, b0 + s1, a0 + s1);
        skinIndex.push(a0 + s, b0 + s, b0 + s1);
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

  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size;
        // fig.ts 실측과 동일 관례: py를 그대로 v로 쓴다(flipY 보정 없음) — core가 캔버스 중앙 부근에 온다.
        const v = (py + 0.5) / size;
        const localX = (u - 0.5) * 2 * BEET_RADIUS;
        const hFrac = v * 2 - 1;
        const localY = hFrac * BEET_HALF_LENGTH;
        const coreY = CORE_H_FRAC * BEET_HALF_LENGTH;
        // 거리만 필요(각도 무관) — 동심원은 나이테라 방향성이 없다.
        const dist = Math.hypot(localX, localY - coreY) / BEET_RADIUS;
        const stripe = Math.cos(RING_COUNT * Math.PI * dist);
        const t = smoothstep(BAND_LOW, BAND_HIGH, stripe); // t=1 at stripe peak(dist=0) => 중심은 어두운 점
        const o = (py * size + px) * 4;
        img.data[o] = lerpChannel(pale[0], dark[0], t);
        img.data[o + 1] = lerpChannel(pale[1], dark[1], t);
        img.data[o + 2] = lerpChannel(pale[2], dark[2], t);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function buildStub(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(
    [
      [1, -1],
      [1, 1],
    ],
    STUB_SEGMENTS,
    STUB_HEIGHT / 2,
    (_hFrac, ringIndex) => (ringIndex === 0 ? [STUB_RADIUS_BOTTOM, STUB_RADIUS_BOTTOM] : [STUB_RADIUS_TOP, STUB_RADIUS_TOP]),
  );
  jitterVertices(geometry, rng, STUB_JITTER_AMP);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  baked.translate(0, BEET_HALF_LENGTH - STUB_EMBED + STUB_HEIGHT / 2, 0);
  return baked;
}

export const createBeet: IngredientBuilder = (rng) => {
  const { geometry, skinTriCount, capTriCount } = buildHalfShell(PROFILE, BEET_SEGMENTS, BEET_RADIUS, BEET_HALF_LENGTH);
  // 지터는 셸 전체(스킨+캡 공유 정점)에 한 번만 — R1: 이음매가 절대 찢어지지 않는다.
  jitterVertices(geometry, rng, JITTER_AMP);
  const baked = facet(geometry);
  const skinGeo = sliceTriangles(baked, 0, skinTriCount);
  const capGeo = sliceTriangles(baked, skinTriCount, skinTriCount + capTriCount);
  uvTopPlanar(skinGeo);
  uvFrontPlanar(capGeo);

  const skinMat = stdMaterial({ color: SKIN_COLOR });
  const cutfaceMat = stdMaterial({ map: paintBeetCutfaceTexture(), color: 0xffffff });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(skinGeo, skinMat));
  group.add(new THREE.Mesh(capGeo, cutfaceMat));
  group.add(new THREE.Mesh(buildStub(rng), skinMat)); // 스텁은 skin 버킷과 합류(잎을 자르고 남은 뿌리색)

  return mergeByMaterial(group);
};
