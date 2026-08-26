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
const FIG_SEGMENTS = 20; // ★12→20 (2026-08-26). half-revolution 컬럼 수. 예산 상향
// (2500→8000tri) 후 전체 화면 기준 재판정 — 12컬럼(15°)은 옆·뒤 각도에서 실루엣이 각졌다.
// 20컬럼(9°)에 드는 비용은 +100tri 남짓이고 전체는 여전히 400tri/8000이다.

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

const JITTER_AMP = 0.011; // ★0.017→0.011 (2026-08-26) — 되돌리지 말 것.
// 컬럼을 20으로 올리자 극 근처 링(rFrac 0.14 => 반지름 0.064)의 컬럼 간격이 0.01까지 좁아져
// **지터 진폭이 삼각형보다 커졌다** — 목 부근 얇은 슬라이버가 뒤집혔다(실측: 몸통에서 안쪽 향한
// 삼각형 17개, 전부 y 0.5~0.8 목 구간). 진폭을 간격 아래로 내려 뒤집힘을 없앤다.
// 세그먼트를 더 올리려면 이 값도 같이 내려야 한다(간격 = π·r/segments).

const STEM_RADIUS_TOP = 0.085;
const STEM_RADIUS_BOTTOM = 0.115;
const STEM_HEIGHT = 0.34;
const STEM_SEGMENTS = 12; // ★8→12 (2026-08-26). 예산 상향(2500→8000tri) 후 전체 화면 기준으로
// 다시 보니 8각 줄기는 각져 보였다. 줄기 12각의 추가 비용은 ~16tri다 — 아낄 이유가 없다.
const STEM_EMBED = 0.1; // ★0.06→0.1 (2026-08-26). 줄기 밑동 반지름(0.115)이 그 높이의 몸통
// 반지름보다 커서 밑동 테두리가 목 밖으로 턱을 만들었다. 더 깊이 묻어 턱을 줄인다.
const STEM_JITTER_AMP = 0.008;

// 단면 텍스처 — profileRadiusAt과 같은 PROFILE을 공유해 텍스처 경계가 실제 지오메트리 경계와
// 정확히 일치한다(campagne의 ringPhase 공유 패턴과 동일 원리).
const TEX_SIZE = 192; // <=256 (R3)
const RIM_BAND_FRAC = 0.84; // rBoundary 대비 이 비율을 넘으면 크림색 림
const STRAND_COUNT = 34; // ★26→34 (2026-08-26). 부채가 단면을 꽉 채우게 되자 26줄은 굵은
// 쐐기로 보여 "떠오르는 해" 도안처럼 읽혔다 — 개수를 늘리고 아래 widths를 좁혀 가는 씨앗줄로.
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
  // ★길이 단위 변경(2026-08-26) — 되돌리지 말 것.
  // 예전엔 월드 단위(반경 0.23~0.41)로 잡았다. 그런데 단면은 0.92 x 1.6짜리 **세로로 긴 타원**이라
  // 월드 등방 원은 세로를 29~51%밖에 못 채운다 — 부채가 단면 한가운데 작은 원반으로 뭉쳐
  // "무늬가 윤곽과 안 맞는다"로 읽혔다. 그래서 길이·거리·각도를 전부 **정규화 타원 좌표**
  // (nx = x/FIG_RADIUS, ny = (y-coreY)/FIG_HALF_LENGTH = hFrac-CORE_H_FRAC)에서 잰다.
  // 이 좌표에서 dist=1이 곧 윤곽선이라
  // 부채가 단면을 꽉 채우고, 넘치는 부분은 아래 rim 밴드 검사(cr <= RIM_BAND_FRAC)가 잘라준다.
  // ⚠ 옛 주석이 경계하던 "UV 공간 비등방"과는 다른 이야기다 — UV는 캔버스 정사각 기준이라
  //   가로세로 배율이 어긋나지만, 여기 정규화는 **실제 반경/반높이로 나눈** 것이라 윤곽과 일치한다.
  const angles: number[] = [];
  const lens: number[] = [];
  const widths: number[] = [];
  for (let i = 0; i < STRAND_COUNT; i++) {
    angles.push((i / STRAND_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.12);
    lens.push(0.86 + rng() * 0.34); // 정규화 반경 — 1.0이 윤곽선
    widths.push(0.018 + rng() * 0.012); // 반각(rad) — 줄 간격 0.185rad의 20~32%
  }

  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size;
        // ★flipY 정합(2026-08-26) — 되돌리지 말 것.
        // CanvasTexture 기본 flipY=true라 **캔버스 맨 윗줄(py=0)이 메시 V=1**에 붙는다
        // (pumpkin.ts의 꼭지 예비 패치가 같은 규칙 위에서 이미 정상 동작 중이다).
        // 예전 코드는 v = py/size를 그대로 써서 프로필에서 뽑은 rBoundary가 **세로로 뒤집힌 채**
        // 칠해졌다: 몸통은 아래가 넓고 위가 좁은데 텍스처는 그 반대라 크림 림 띠 폭이 제각각이고
        // 속살 창이 렌즈 모양으로 잘려 부채가 한쪽 절반에만 남았다.
        // core가 중앙 근처(CORE_H_FRAC=-0.02)라 옛 실측(cmp-1/cmp-2)에서는 이 뒤집힘이
        // "core 위치"로는 드러나지 않았다 — 그 관찰로 매핑을 확정한 것이 오진이었다.
        const v = 1 - (py + 0.5) / size;
        const localX = (u - 0.5) * 2 * FIG_RADIUS;
        const hFrac = v * 2 - 1;
        const rBoundary = profileRadiusAt(hFrac) * FIG_RADIUS;
        let c = rim;
        if (rBoundary > 1e-4) {
          const cr = Math.abs(localX) / rBoundary;
          if (cr <= RIM_BAND_FRAC) {
            // 정규화 타원 좌표 — nx=1이 적도 윤곽, ny=1이 극. 위 lens 주석 참조.
            const nx = localX / FIG_RADIUS; // ±1 = 적도 윤곽
            const ny = hFrac - CORE_H_FRAC; // hFrac이 이미 ±1 정규화(극 = ±1)
            const dist = Math.hypot(nx, ny);
            const angle = Math.atan2(ny, nx);
            let onStrand = false;
            for (let i = 0; i < STRAND_COUNT; i++) {
              // ★각도차 접기에 `% 2π`가 빠져 있었다(2026-08-26 수정) — 되돌리지 말 것.
              // atan2는 (-π, π]를 주는데 angles[i]는 [0, 2π)로 만든다. 그래서 단면 아래쪽
              // (angle<0)에서 |angle - angles[i]|가 **2π를 넘고**, 그때 `d = 2π - d`는 음수가 된다.
              // 음수는 어떤 width보다도 작으니 onStrand가 무조건 참 → **코어 아래 절반이 통째로
              // 씨앗색으로 칠해졌다**(부채가 위쪽 절반에만 있는 것처럼 보이던 정체가 이것이다).
              // lib.angleDeltaDeg가 `% 360`을 먼저 하는 것과 같은 접기다 — 그 관례를 따른다.
              let d = Math.abs(angle - angles[i]) % (Math.PI * 2);
              if (d > Math.PI) d = Math.PI * 2 - d;
              if (d < widths[i] && dist > 0.04 && dist < lens[i]) {
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
  // ★뚜껑 링 추가(2026-08-26) — 되돌리지 말 것.
  // 이전 프로필은 [[1,-1],[1,1]] 두 링뿐이라 **옆벽만 있고 양 끝이 뚫린 통**이었다.
  // stdMaterial은 FrontSide라 뚫린 윗면으로 통 안쪽(뒷면 컬링)이 보이고, 그 구멍이
  // 전 각도에서 "속이 보이는 컵" 또는 실루엣 상단의 V홈("고양이 귀")으로 읽혔다.
  // rFrac=0인 극점 링을 양 끝에 붙이면 buildRevolvedShell이 aPole/bPole 분기로 원판 뚜껑을
  // 만들어 닫는다(극점 hFrac을 림과 같게 둬 높이는 그대로, 뚜껑은 평평한 절단면).
  // 그래서 radialScale은 ringIndex 0/1(아랫극·아랫림) vs 2/3(윗림·윗극)으로 갈라야 한다.
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
