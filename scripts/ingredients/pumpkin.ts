// 단호박 — 웨지 한 조각을 잘라낸 납작한 호박. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/pumpkin.json(워크스페이스 원본은
// assets/ingredients/work/pumpkin/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// fig의 half-revolution+ruled-cap 패턴을 웨지(작은 각도만 제거)로 일반화했다: 셸은 phi를
// wedgeHalfAngle .. 2π-wedgeHalfAngle 구간(논-랩)으로만 짓고, 빠진 쐐기 구간의 두 절단면은 각각
// "중심축 컬럼 <-> 셸의 해당 림 컬럼"을 잇는 룰드 서피스로 채운다(fig의 "왼쪽 림<->오른쪽 림" 대신
// "중심축<->림" 한 쌍씩 두 번). 홈(그루브)·꼭지색은 지오메트리가 아니라 스킨 텍스처로 싣는다
// (R3 텍스처 탈출구 확정 후보, CRIB 참조) — 세그먼트를 낮게 유지해 예산을 지키기 위함
// (지오메트리 로브 방식은 세그먼트를 30+로 올려야 매끈해 tri 예산을 초과한다).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { bakeTexture, buildRevolvedShell, facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvDome, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/pumpkin.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const SKIN_LIGHT = 0xd98b3a; // "a warm orange skin"
const SKIN_DARK = 0xb96f27; // "deeper amber sunk into the rib grooves"
const CUTFACE_COLOR = 0xefa84e; // "a bright golden cut face"
const STEM_COLOR = 0x6e7f4a; // "a short muted-green stem"
// 씨방(#F5D08A "a paler seed hollow at its center")은 드롭 — 자른면 버킷은 순색(텍스처 없음)이라
// 실을 자리가 없고, 64px 썸네일에서 서브 판독 디테일이다(스펙 risk seed-hollow-dropped).

// 실측 비율 (assets/ingredients/src/pumpkin.png 3/4 · pumpkin-2.png 정면 · pumpkin-3.png 탑다운).
// 탑다운(pumpkin-3.png)이 특히 유용 — 골 개수·웨지 각도를 직접 셀 수 있다.
const PUMPKIN_RADIUS = 0.62; // 적도 반지름
const PUMPKIN_HALF_HEIGHT = 0.3; // 정점-정점 절반 높이 (높이:너비 ~= 0.48:1, pumpkin-2.png 실측)
const SEGMENTS = 18; // 큰 호(웨지 제외) 컬럼 수 — 골은 지오메트리가 아니라 텍스처라 낮게 유지 가능
const WEDGE_HALF_ANGLE = 0.39; // ~22.4deg 편측, 웨지 총각 ~45deg (pumpkin-3.png 탑다운 실측)

type ProfilePoint = readonly [number, number];
// (반지름비, 높이비) — heightFrac -1(바닥 극) .. +1(꼭지 밑동, 윗극). pumpkin-2.png 실측: 가장 넓은
// 지점은 살짝 아래쪽(heightFrac 0.05 부근), 아랫면은 완만하게, 윗면은 어깨를 이루며 좁아진다.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.55, -0.85],
  [0.85, -0.55],
  [0.98, -0.15],
  [1.0, 0.05],
  [0.92, 0.35],
  [0.72, 0.62],
  [0.42, 0.82],
  [0.18, 0.95],
  [0.0, 1.0],
];

const JITTER_AMP = 0.02; // ~3.2% of PUMPKIN_RADIUS — R4, olive/fig와 같은 자릿수

const STEM_RADIUS_BOTTOM = 0.14;
const STEM_RADIUS_TOP = 0.11;
const STEM_HEIGHT = 0.22;
const STEM_SEGMENTS = 7; // 각진 페이셋 — pumpkin.png 실측: 매끈한 원통이 아니라 다각형 꼭지
const STEM_EMBED = 0.05;
const STEM_JITTER_AMP = 0.006;

// 스킨 텍스처 — 골(홈그늘)은 uvDome(X,Z 탑다운 극좌표) 각도에 cos(RIB_COUNT*angle) 줄무늬로 굽는다.
// uvDome은 u·v 둘 다 같은 반지름 r로 정규화해 등방(異방성 없음) — fig의 uvFrontPlanar 버그(§비등방
// UV로 별 무늬가 찌그러짐, fig.ts 참조)를 애초에 피한다.
const TEX_SIZE = 192; // <=256 (R3)
const RIB_COUNT = 13; // pumpkin-3.png 탑다운 실측 골 개수
const GROOVE_LOW = -0.97; // stripe(cos) 이 값 이하 = 완전 그루브(어두운 amber) — cmp-1 실측: 그루브가
// 너무 넓어 전체가 칙칙해 보였다(레퍼런스는 밝은 주황이 우세, 그루브는 가는 선). 폭을 좁혔다.
const GROOVE_HIGH = -0.82; // 이 값 이상 = 완전 능선(밝은 orange). 사이는 smoothstep(부드러운 골, "soft ribs")
const STEM_PATCH_PX = 26; // 텍스처 좌상단 예비 영역(꼭지색) — uvDome은 원판 안쪽만 실사용하므로 모서리는 항상 비어 있다.

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * 웨지 셸 — phi를 wedgeHalfAngle..2pi-wedgeHalfAngle(논-랩)로만 짓는다. fig의 half-revolution과
 * 같은 원리를 더 작은 결손 각도로 일반화: x=r*sin(phi), z=r*cos(phi)라 phi=0(빠진 쐐기 중심)이
 * +Z(카메라)를 향한다. 두 절단면(cutface)은 매 링마다 "중심축(x=z=0) <-> 셸의 s=0/s=segments 림"을
 * 잇는 룰드 서피스 — fig 캡과 동일 패턴(중심축이 fig의 "반대쪽 림" 자리를 대신한다)이라 새 정점은
 * 셸 자체의 림과 별도 중심축 컬럼(링당 1개, 극점은 셸 정점 자체가 이미 축 위에 있어 재사용)뿐이다.
 */
function buildWedgeShell(
  profile: readonly ProfilePoint[],
  segments: number,
  radius: number,
  heightScale: number,
  wedgeHalfAngle: number,
): { geometry: THREE.BufferGeometry; skinTriCount: number; cutfaceTriCount: number } {
  const positions: number[] = [];
  const ringStart: number[] = [];
  const axisIndex: number[] = [];
  const isPole: boolean[] = [];

  for (const [rFrac, hFrac] of profile) {
    const pole = rFrac <= 1e-6;
    isPole.push(pole);
    ringStart.push(positions.length / 3);
    if (pole) {
      positions.push(0, hFrac * heightScale, 0);
      axisIndex.push(positions.length / 3 - 1); // 극점 = 이미 축 위, 재사용
      continue;
    }
    for (let s = 0; s <= segments; s++) {
      const phi = wedgeHalfAngle + (s / segments) * (Math.PI * 2 - 2 * wedgeHalfAngle);
      positions.push(Math.sin(phi) * rFrac * radius, hFrac * heightScale, Math.cos(phi) * rFrac * radius);
    }
  }
  // 논-극 링만 별도 중심축 정점 추가 (극 링은 위에서 이미 axisIndex를 채웠다).
  for (let ri = 0; ri < profile.length; ri++) {
    if (isPole[ri]) continue;
    const [, hFrac] = profile[ri];
    positions.push(0, hFrac * heightScale, 0);
    axisIndex.push(positions.length / 3 - 1);
  }

  const skinIndex: number[] = [];
  for (let ri = 0; ri < profile.length - 1; ri++) {
    const a0 = ringStart[ri];
    const b0 = ringStart[ri + 1];
    const aPole = isPole[ri];
    const bPole = isPole[ri + 1];
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

  // 절단면 — rimAt(ring, "start"|"end")과 axisIndex[ring]을 링 순서대로 잇는다. 와인딩은 첫 렌더로
  // 검증(figCap 유도와 같은 원리지만 극좌표 부호가 달라 재유도 대신 실측으로 확정).
  function buildCutface(rimAt: (ri: number) => number): number[] {
    const idx: number[] = [];
    for (let ri = 0; ri < profile.length - 1; ri++) {
      const aPole = isPole[ri];
      const bPole = isPole[ri + 1];
      const aRim = rimAt(ri);
      const aAxis = axisIndex[ri];
      const bRim = rimAt(ri + 1);
      const bAxis = axisIndex[ri + 1];
      if (aPole) {
        idx.push(aRim, bRim, bAxis);
      } else if (bPole) {
        idx.push(aRim, bAxis, aAxis);
      } else {
        idx.push(aRim, bRim, bAxis);
        idx.push(aRim, bAxis, aAxis);
      }
    }
    return idx;
  }
  const cutface1 = buildCutface((ri) => (isPole[ri] ? ringStart[ri] : ringStart[ri]));
  const cutface2 = buildCutface((ri) => (isPole[ri] ? ringStart[ri] : ringStart[ri] + segments));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([...skinIndex, ...cutface1, ...cutface2]);
  return { geometry, skinTriCount: skinIndex.length / 3, cutfaceTriCount: (cutface1.length + cutface2.length) / 3 };
}

function paintPumpkinSkinTexture(): THREE.CanvasTexture {
  const light: [number, number, number] = [(SKIN_LIGHT >> 16) & 0xff, (SKIN_LIGHT >> 8) & 0xff, SKIN_LIGHT & 0xff];
  const dark: [number, number, number] = [(SKIN_DARK >> 16) & 0xff, (SKIN_DARK >> 8) & 0xff, SKIN_DARK & 0xff];
  const stemPatch: [number, number, number] = [(STEM_COLOR >> 16) & 0xff, (STEM_COLOR >> 8) & 0xff, STEM_COLOR & 0xff];

  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const o = (py * size + px) * 4;
        // 예비 꼭지색 패치 — uvDome은 원판(반지름<=0.5) 안쪽만 실제 셸 정점이 샘플하므로 모서리는
        // 항상 비어 있다(원 밖 = 셸 밖). 좌상단 모서리에 안전하게 꼭지 전용 단색을 둔다.
        if (px < STEM_PATCH_PX && py < STEM_PATCH_PX) {
          img.data[o] = stemPatch[0];
          img.data[o + 1] = stemPatch[1];
          img.data[o + 2] = stemPatch[2];
          img.data[o + 3] = 255;
          continue;
        }
        const u = (px + 0.5) / size;
        const v = (py + 0.5) / size;
        const dx = u - 0.5;
        const dy = v - 0.5;
        const angle = Math.atan2(dy, dx);
        const stripe = Math.cos(RIB_COUNT * angle);
        const t = smoothstep(GROOVE_LOW, GROOVE_HIGH, stripe);
        img.data[o] = lerpChannel(dark[0], light[0], t);
        img.data[o + 1] = lerpChannel(dark[1], light[1], t);
        img.data[o + 2] = lerpChannel(dark[2], light[2], t);
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
  // 꼭지는 skin 머티리얼(텍스처 보유)을 공유하므로 uvDome이 아니라 예비 패치 좌표로 강제한다 —
  // uvDome을 쓰면 꼭지 위치(원판 중심 근처)가 텍스처의 골 무늬 중앙(마찬가지로 중심 근처)과 겹친다.
  // CanvasTexture 기본 flipY=true: 캔버스 row0(맨 위, 예비 패치를 그린 자리)이 메시 V=1에 매핑된다
  // (fig.ts에서 실측된 것과 같은 규칙). 패치가 캔버스 상단에 있으므로 V는 1에 가깝게 잡아야 한다.
  const uv = new Float32Array(baked.attributes.position.count * 2);
  for (let i = 0; i < uv.length; i += 2) {
    uv[i] = STEM_PATCH_PX / 2 / TEX_SIZE;
    uv[i + 1] = 1 - STEM_PATCH_PX / 2 / TEX_SIZE;
  }
  baked.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  baked.translate(0, PUMPKIN_HALF_HEIGHT - STEM_EMBED + STEM_HEIGHT / 2, 0);
  return baked;
}

export const createPumpkin: IngredientBuilder = (rng) => {
  const { geometry, skinTriCount, cutfaceTriCount } = buildWedgeShell(PROFILE, SEGMENTS, PUMPKIN_RADIUS, PUMPKIN_HALF_HEIGHT, WEDGE_HALF_ANGLE);
  jitterVertices(geometry, rng, JITTER_AMP); // 셸+절단면 공유 정점 전체에 한 번만 — R1 이음매 보장
  const baked = facet(geometry);
  const skinGeo = sliceTriangles(baked, 0, skinTriCount);
  const cutfaceGeo = sliceTriangles(baked, skinTriCount, skinTriCount + cutfaceTriCount);
  uvDome(skinGeo);
  uvTopPlanar(cutfaceGeo); // 순색 버킷 — 어떤 투영이든 무방, attribute 일관성만 필요

  const skinMat = stdMaterial({ map: paintPumpkinSkinTexture(), color: 0xffffff });
  const cutfaceMat = stdMaterial({ color: CUTFACE_COLOR });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(skinGeo, skinMat));
  group.add(new THREE.Mesh(cutfaceGeo, cutfaceMat));
  group.add(new THREE.Mesh(buildStem(rng), skinMat)); // 꼭지색은 skin 텍스처의 예비 패치로 합류

  return mergeByMaterial(group);
};
