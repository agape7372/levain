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
import { bakeTexture, buildRevolvedShell, facet, jitterVertices, mergeByMaterial, scaleHex, sliceTriangles, stdMaterial, uvDome, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/pumpkin.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const SKIN_LIGHT = 0xd98b3a; // "a warm orange skin"
const SKIN_DARK = 0xb96f27; // "deeper amber sunk into the rib grooves"
const CUTFACE_SPEC = 0xefa84e; // "a bright golden cut face"
// ★자른면 밝기 상향(2026-08-26) — 되돌리지 말 것.
// 스펙 원색(#EFA84E)은 껍질(#D98B3A)과 명도·색상이 너무 가까워, 전체 화면에서 자른 단면이
// "잘린 속살"이 아니라 **그림자 진 껍질 안쪽 벽**으로 읽혔다(절단면은 측면을 향해 키라이트를
// 거의 못 받아 렌더에서 한 단계 더 어두워진다 — 팔레트 차이보다 화면 차이가 더 좁았다).
// 순색 버킷이라 텍스처로 대비를 줄 자리가 없으므로 색 자체를 벌린다. 새 hex를 지어내지 않고
// types.ts §7대로 lib.scaleHex로 결정론 유도(R 채널은 255에서 클램프돼 노란 쪽으로 기운다 —
// 프롬프트 JSON이 말하는 씨방(#F5D08A)의 "paler" 방향과 같은 쪽이라 팔레트에서 벗어나지 않는다).
const CUTFACE_COLOR = scaleHex(CUTFACE_SPEC, 1.28); // = #FFD764
const STEM_COLOR = 0x6e7f4a; // "a short muted-green stem"
// 씨방(#F5D08A "a paler seed hollow at its center")은 드롭 — 자른면 버킷은 순색(텍스처 없음)이라
// 실을 자리가 없고, 64px 썸네일에서 서브 판독 디테일이다(스펙 risk seed-hollow-dropped).

// 실측 비율 (assets/ingredients/src/pumpkin.png 3/4 · pumpkin-2.png 정면 · pumpkin-3.png 탑다운).
// 탑다운(pumpkin-3.png)이 특히 유용 — 골 개수·웨지 각도를 직접 셀 수 있다.
const PUMPKIN_RADIUS = 0.62; // 적도 반지름
const PUMPKIN_HALF_HEIGHT = 0.3; // 정점-정점 절반 높이 (높이:너비 ~= 0.48:1, pumpkin-2.png 실측)
const SEGMENTS = 30; // ★18→30 (2026-08-26). 큰 호(웨지 제외) 컬럼 수.
// 골이 텍스처라 예전엔 18로 낮게 뒀지만, 골 무늬는 uvDome **정점 UV의 선형 보간**으로 면 위에
// 펴지므로 컬럼이 골(13개)보다 촘촘하지 않으면 골 선이 큰 면 안에서 꺾인다 — 실측에서 골이
// 물결치듯 휘어 보이던 원인이다. 예산 상향(2500→8000tri) 후엔 조일 이유도 없다.
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

const JITTER_AMP = 0.013; // ★0.02→0.013 (2026-08-26) — 되돌리지 말 것.
// 컬럼을 30으로 올리자 윗극 근처 링(rFrac 0.18 => 반지름 0.11)의 컬럼 간격이 0.023까지 좁아지고,
// 극 팬 삼각형은 그보다 더 얇다 — **지터 진폭이 삼각형보다 커져** 윗극 슬라이버가 뒤집혔다.
// 진폭을 간격 아래로 내린다. 세그먼트를 더 올리면 이 값도 같이 내릴 것.

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
  // ★axisIndex는 **링 번호로 직접 주소를 매긴다**(2026-08-26 수정) — 되돌리지 말 것.
  // 예전엔 두 루프에서 각각 push했다: 1) 극 링을 만나면 그 자리에서 push, 2) 그 뒤 논-극 링을
  // 몰아서 push. 그래서 배열 순서가 링 순서와 어긋났다(프로필 10링 중 0·9가 극이면
  // axisIndex = [극0, 극9, 링1축, 링2축, ...] → axisIndex[1]이 **맨 위 극점**이었다).
  // 그런데 아래 buildCutface는 axisIndex[ri]로 읽는다. 결과: 절단면 삼각형이 아래쪽 림을
  // 반대편 끝 높이의 축점에 이어 붙여 **실루엣 밖으로 길게 삐져나온 얇은 날개**가 생겼다
  // (@90에서 몸통 왼쪽 위로 뻗은 판, @270에서 오른쪽 판 — 파손으로 읽히던 정체가 이것이다).
  const axisIndex: number[] = new Array<number>(profile.length).fill(-1);
  const isPole: boolean[] = [];

  for (let ri = 0; ri < profile.length; ri++) {
    const [rFrac, hFrac] = profile[ri];
    const pole = rFrac <= 1e-6;
    isPole.push(pole);
    ringStart.push(positions.length / 3);
    if (pole) {
      positions.push(0, hFrac * heightScale, 0);
      axisIndex[ri] = positions.length / 3 - 1; // 극점 = 이미 축 위, 재사용
      continue;
    }
    for (let s = 0; s <= segments; s++) {
      const phi = wedgeHalfAngle + (s / segments) * (Math.PI * 2 - 2 * wedgeHalfAngle);
      positions.push(Math.sin(phi) * rFrac * radius, hFrac * heightScale, Math.cos(phi) * rFrac * radius);
    }
  }
  // 논-극 링만 별도 중심축 정점 추가 (극 링은 위에서 이미 axisIndex[ri]를 채웠다).
  for (let ri = 0; ri < profile.length; ri++) {
    if (isPole[ri]) continue;
    const [, hFrac] = profile[ri];
    positions.push(0, hFrac * heightScale, 0);
    axisIndex[ri] = positions.length / 3 - 1;
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
      // ★와인딩 반전 수정(2026-08-26). 이 셀브는 좌표계가 lib의 buildRevolvedShell과
      // **거울상**이다(lib은 z=+sin, 여기는 z=-sin 또는 x=sin/z=cos). 그런데 감기를 lib 것을
      // 그대로 복사해 **손잡이가 뒤집혀 법선이 전부 안을 향했다**.
      // 증상: FrontSide 컴링이라 가까운 벙이 사라지고 먼 벽 안쪽이 보인다 —
      // 일부 각도에서 몸통이 통째로 사라지고 꼭지만 남아 "떠 있는 꼭지"로 보였다.
      // 실측(수정 전): 바깥향 삼각형 5~8% · 부호부피 음수(정상인 olive는 97%/양수).
      // ⚠ 캡(단면)은 **이 좌표계에서 손으로 유도**한 것이라 그대로 둔다. 스킨만 뒤집는다.
        skinIndex.push(a0, b0 + s1, b0 + s);
      } else if (bPole) {
        skinIndex.push(a0 + s, a0 + s1, b0);
      } else {
        skinIndex.push(a0 + s, a0 + s1, b0 + s1);
        skinIndex.push(a0 + s, b0 + s1, b0 + s);
      }
    }
  }

  // 절단면 — rimAt(ring)과 axisIndex[ring]을 링 순서대로 잇는다.
  // ★와인딩(2026-08-26 재유도) — 되돌리지 말 것.
  // 아래 감기가 만드는 법선은 항상 (d × ŷ)·Δh·r 방향이다(d = 그 림 컬럼의 수평 단위벡터).
  //   · 시작 림(phi=+w): 고체는 phi가 커지는 쪽 → 바깥 = (-cos w, 0, sin w) = d × ŷ  → 그대로 OK
  //   · 끝 림(phi=2π-w): 고체는 phi가 작아지는 쪽 → 바깥 = (cos w, 0, sin w) = **-(d × ŷ)** → 뒤집어야 함
  // 즉 두 절단면은 감기가 서로 반대여야 하는데 예전엔 같은 함수를 그대로 두 번 써서
  // **끝 림 절단면 법선이 몸통 안쪽을 향했다**(FrontSide 컬링이라 그 면이 사라지고 반대편
  // 안쪽 벽이 비친다). 예전 주석은 "첫 렌더로 실측 확정"이라 적었지만, 그 렌더는 위 axisIndex
  // 버그로 절단면 자체가 엉뚱한 모양이라 와인딩을 판정할 수 있는 그림이 아니었다.
  function buildCutface(rimAt: (ri: number) => number, flip: boolean): number[] {
    const idx: number[] = [];
    const push3 = (a: number, b: number, c: number) => (flip ? idx.push(a, c, b) : idx.push(a, b, c));
    for (let ri = 0; ri < profile.length - 1; ri++) {
      const aPole = isPole[ri];
      const bPole = isPole[ri + 1];
      const aRim = rimAt(ri);
      const aAxis = axisIndex[ri];
      const bRim = rimAt(ri + 1);
      const bAxis = axisIndex[ri + 1];
      if (aPole) {
        push3(aRim, bRim, bAxis);
      } else if (bPole) {
        push3(aRim, bAxis, aAxis);
      } else {
        push3(aRim, bRim, bAxis);
        push3(aRim, bAxis, aAxis);
      }
    }
    return idx;
  }
  const cutface1 = buildCutface((ri) => ringStart[ri], false);
  const cutface2 = buildCutface((ri) => (isPole[ri] ? ringStart[ri] : ringStart[ri] + segments), true);

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
  // ★뚜껑 링 추가(2026-08-26) — 되돌리지 말 것.
  // 이전 프로필은 [[1,-1],[1,1]] 두 링뿐이라 **옆벽만 있고 양 끝이 뚫린 통**이었다.
  // stdMaterial은 FrontSide라 뚫린 윗면 너머로 통 안쪽(뒷면 컬링)이 보이고, 실측상 전 각도에서
  // 꼭지가 홈 파인 두 뿔("고양이 귀")로 읽혔다 — 호박에서 가장 눈에 띄던 파손이다.
  // rFrac=0 극점 링을 양 끝에 붙이면 buildRevolvedShell의 aPole/bPole 분기가 원판 뚜껑을 만든다
  // (극점 hFrac을 림과 같게 둬 높이 불변 — 잘린 꼭지라 평평한 윗면이 맞다).
  // 링이 4개가 됐으므로 radialScale은 ringIndex<=1(아랫극·아랫림) 기준으로 갈라야 한다.
  const { geometry } = buildRevolvedShell(
    [
      [0, -1],
      [1, -1],
      [1, 1],
      [0, 1],
    ],
    STEM_SEGMENTS,
    STEM_HEIGHT / 2,
    (_hFrac, ringIndex) => (ringIndex <= 1 ? [STEM_RADIUS_BOTTOM, STEM_RADIUS_BOTTOM] : [STEM_RADIUS_TOP, STEM_RADIUS_TOP]),
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
