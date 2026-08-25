// 무화과 — 세로로 반 자른 단일 과일. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/fig.json(워크스페이스 원본은
// assets/ingredients/work/fig/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// olive와 다른 점: 레퍼런스 3장(3/4·정면·탑다운)이 전부 같은 정면 단면 샷이다 — 무화과의
// 정체성은 통째로 잘린 단면에 있다. 그래서 몸통을 "반회전체(phi 0..pi)"로만 짓고, 나머지 절반의
// phi 공간은 그 셸의 phi=0/phi=pi 림 컬럼을 그대로 잇는 "룰드 서피스" 단면 캡으로 채운다 — 캡은
// 새 정점을 하나도 만들지 않으므로 지터가 셸/단면 이음매를 찢을 수 없다(R1, olive 캡 마스크
// 방식보다 더 강한 보장). lib.buildRevolvedShell은 항상 2π로 감아서 이 half-revolution을 표현할
// 수 없어 로컬 buildHalfShell을 이 파일 안에 둔다(lib.ts 수정 금지).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import {
  bakeTexture,
  buildRevolvedShell,
  facet,
  jitterVertices,
  mergeByMaterial,
  sliceTriangles,
  stdMaterial,
  uvTopPlanar,
} from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/fig.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const SKIN_COLOR = 0x6e3f63; // "a dusky purple skin"
const RIM_COLOR = 0xe3d3b8; // "a thin pale cream rim ... just inside the skin"
const FLESH_COLOR = 0xc2566b; // "a deep rose-pink interior"
const STRAND_COLOR = 0xe8c9a8; // "fine radiating seed strands in warm sand"
// 줄기색(#6E7F4A "the short stem is muted green")은 의도적으로 버킷을 안 만든다 — mesh<=2 예산이
// {skin, interior-textured} 두 버킷을 강제하는데, 줄기는 64px 썸네일에서 ~3px라 olive의 그늘진
// 아랫면 색 드롭 선례와 동일 논리로 skin 버킷에 합친다(스펙 risk stem-hue-dropped).

// 실측 비율 (assets/ingredients/src/fig.png 3/4 · fig-2.png 정면 · fig-3.png 탑다운 — 세 장이 전부
// 거의 같은 정면 단면 샷이라 이 비율은 fig-2.png 기준으로 통일했다).
const FIG_RADIUS = 0.46; // 적도(가장 넓은 지점) 반지름
const FIG_HALF_LENGTH = 0.8; // 극-극 절반 길이
const FIG_SEGMENTS = 12; // half-revolution 컬럼 수 (0..12 => 컬럼 13개, phi 0..pi)

type ProfilePoint = readonly [number, number];
// (반지름비, 높이비) — heightFrac -1(둥근 아랫극) .. +1(줄기와 만나는 윗극). 가장 넓은 지점은
// 정중앙보다 살짝 아래(heightFrac -0.02) — fig-2.png 실측: 아랫부분이 더 둥글고 오래 넓게 유지되고
// 윗부분은 줄기 목으로 급하게 좁아진다.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.35, -0.9],
  [0.68, -0.76],
  [0.9, -0.55],
  [1.0, -0.28],
  [0.97, -0.02],
  [0.82, 0.25],
  [0.58, 0.5],
  [0.34, 0.72],
  [0.14, 0.9],
  [0.0, 1.0],
];

const JITTER_AMP = 0.017; // ~3.7% of FIG_RADIUS — R4, olive(0.016/0.44)와 같은 자릿수

const STEM_RADIUS_TOP = 0.085;
const STEM_RADIUS_BOTTOM = 0.115;
const STEM_HEIGHT = 0.34;
const STEM_SEGMENTS = 8;
const STEM_EMBED = 0.06; // 줄기 밑동이 몸통 윗극보다 STEM_EMBED만큼 내려가 파묻혀 뜨는 부분이 없다.
const STEM_JITTER_AMP = 0.008;

// 단면 텍스처 — profileRadiusAt과 같은 PROFILE을 공유해 텍스처 경계가 실제 지오메트리 경계와
// 정확히 일치한다(campagne의 ringPhase 공유 패턴과 동일 원리).
const TEX_SIZE = 192; // <=256 (R3)
const RIM_BAND_FRAC = 0.84; // rBoundary 대비 이 비율을 넘으면 크림색 림
const STRAND_COUNT = 26;
const CORE_H_FRAC = -0.02; // 방사 무늬가 수렴하는 중심 — PROFILE 최대 반지름 지점과 동일

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
 * 로컬 half-revolution 셸 — lib.buildRevolvedShell은 항상 2π 랩(phi=0과 phi=2π가 같은 컬럼)이라
 * 반으로 자른 몸체를 표현할 수 없다. phi 0..pi를 논-랩(컬럼 0..segments, segments+1개)으로 짓고,
 * 스킨 삼각형(회전면)과 캡 삼각형(phi=0/phi=segments 림 컬럼을 잇는 룰드 서피스)을 같은 인덱스
 * 버퍼에 순서대로 push한다 — 두 그룹의 삼각형 개수를 생성 시점에 알기 때문에 올리브처럼 정점
 * 마스크가 필요 없고, facet 이후 sliceTriangles로 범위만 잘라내면 된다.
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
      // s=0 => x=+radius(오른쪽 림), s=segments => x=-radius(왼쪽 림), 둘 다 z=0(단면 평면).
      // 가운데(phi=pi/2)는 z<0으로 부풀어 카메라(+Z)에서 멀어진다 — 단면이 카메라를 향한다.
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

  // 룰드 단면 캡 — 같은 셸의 phi=0(오른쪽 림)·phi=segments(왼쪽 림) 컬럼을 링 순서대로 잇는다.
  // 새 정점 없음(둘 다 이미 스킨의 경계 정점). 와인딩은 손으로 유도(법선 +Z, 카메라 향함):
  // 삼각형 (aRight,bRight,bLeft)의 cross(bRight-aRight, bLeft-aRight).z = 2*dh*r2 >= 0 (dh>0,r2>=0),
  // (aRight,bLeft,aLeft)의 cross(...).z = 2*dh*r1 >= 0 — 둘 다 +Z 향해 일관됨.
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

/** uvTopPlanar(X,Z)는 캡(z~=0 평면)에서 V축이 0폭으로 퇴화한다 — 로컬 정면투영(X,Y) 대체. */
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

// --- 단면 텍스처: 림 + 속살 + 방사 씨앗 무늬. profileRadiusAt과 같은 PROFILE을 공유해 텍스처
// 경계가 실제 지오메트리 경계(구간별 선형 보간)와 정확히 겹친다.

function paintFigInteriorTexture(rng: () => number): THREE.CanvasTexture {
  const rim: [number, number, number] = [(RIM_COLOR >> 16) & 0xff, (RIM_COLOR >> 8) & 0xff, RIM_COLOR & 0xff];
  const flesh: [number, number, number] = [(FLESH_COLOR >> 16) & 0xff, (FLESH_COLOR >> 8) & 0xff, FLESH_COLOR & 0xff];
  const strand: [number, number, number] = [(STRAND_COLOR >> 16) & 0xff, (STRAND_COLOR >> 8) & 0xff, STRAND_COLOR & 0xff];

  // 방사 스파이크 — 각도/길이/폭을 주입 rng로 결정론 생성(Math.random 금지).
  // 길이는 월드 단위(FIG_RADIUS와 같은 자)로 잡는다 — UV(u,v)는 X폭(0.92)과 Y높이(1.6)의 스케일이
  // 서로 달라(비등방) atan2/hypot을 UV 공간에서 바로 쓰면 별 무늬가 찌그러진다(디버그 렌더로 확인:
  // no-strand 버전은 림/속살 경계가 정상이었는데 strand를 켜면 무너졌다 — 원인이 여기 있었다).
  const angles: number[] = [];
  const lens: number[] = [];
  const widths: number[] = [];
  for (let i = 0; i < STRAND_COUNT; i++) {
    angles.push((i / STRAND_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.12);
    lens.push((0.5 + rng() * 0.4) * FIG_RADIUS * 0.85);
    widths.push(0.03 + rng() * 0.018);
  }

  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size;
        // cmp-1/cmp-2 실측: py를 그대로 v로 쓰는 쪽(flipY 보정 없음)이 core 위치를 중앙 부근에 둔다 —
        // flipY 보정을 넣었더니(cmp-2) core가 맨 위로 밀려났다(반대 방향). 원래 매핑을 유지한다.
        const v = (py + 0.5) / size;
        const localX = (u - 0.5) * 2 * FIG_RADIUS;
        const hFrac = v * 2 - 1;
        const rBoundary = profileRadiusAt(hFrac) * FIG_RADIUS;
        let c = rim;
        if (rBoundary > 1e-4) {
          const cr = Math.abs(localX) / rBoundary;
          if (cr <= RIM_BAND_FRAC) {
            // 등방(월드 단위) 좌표에서 각도/거리 계산 — localX는 이미 월드 단위, localY도 같은 자로
            // 맞춘다(uv가 아니라 hFrac*FIG_HALF_LENGTH). CORE도 같은 월드 좌표계로 변환.
            const localY = hFrac * FIG_HALF_LENGTH;
            const coreY = CORE_H_FRAC * FIG_HALF_LENGTH;
            const dx = localX;
            const dy = localY - coreY;
            const dist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            let onStrand = false;
            for (let i = 0; i < STRAND_COUNT; i++) {
              let d = Math.abs(angle - angles[i]);
              if (d > Math.PI) d = Math.PI * 2 - d;
              if (d < widths[i] && dist > 0.015 && dist < lens[i]) {
                onStrand = true;
                break;
              }
            }
            c = onStrand ? strand : flesh;
          }
        }
        const o = (py * size + px) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function buildStem(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(
    [
      [1, -1],
      [1, 1],
    ],
    STEM_SEGMENTS,
    STEM_HEIGHT / 2,
    (_hFrac, ringIndex) => (ringIndex === 0 ? [STEM_RADIUS_BOTTOM, STEM_RADIUS_BOTTOM] : [STEM_RADIUS_TOP, STEM_RADIUS_TOP]),
  );
  jitterVertices(geometry, rng, STEM_JITTER_AMP);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  baked.translate(0, FIG_HALF_LENGTH - STEM_EMBED + STEM_HEIGHT / 2, 0);
  return baked;
}

export const createFig: IngredientBuilder = (rng) => {
  const { geometry, skinTriCount, capTriCount } = buildHalfShell(PROFILE, FIG_SEGMENTS, FIG_RADIUS, FIG_HALF_LENGTH);
  // 지터는 셸 전체(스킨+캡 공유 정점)에 한 번만 — R1: 이음매가 절대 찢어지지 않는다.
  jitterVertices(geometry, rng, JITTER_AMP);
  const baked = facet(geometry);
  const skinGeo = sliceTriangles(baked, 0, skinTriCount);
  const capGeo = sliceTriangles(baked, skinTriCount, skinTriCount + capTriCount);
  uvTopPlanar(skinGeo);
  uvFrontPlanar(capGeo);

  const skinMat = stdMaterial({ color: SKIN_COLOR });
  const interiorMat = stdMaterial({ map: paintFigInteriorTexture(rng), color: 0xffffff });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(skinGeo, skinMat));
  group.add(new THREE.Mesh(capGeo, interiorMat));
  group.add(new THREE.Mesh(buildStem(rng), skinMat)); // 줄기색 드롭 — skin 버킷에 합류(risk stem-hue-dropped)

  return mergeByMaterial(group);
};
