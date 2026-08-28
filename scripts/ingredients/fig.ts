// 무화과 — 세로로 반 자른 단일 과일. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/fig.json(워크스페이스 원본은
// assets/ingredients/work/fig/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// olive와 다른 점: 레퍼런스 3장(3/4·정면·탑다운)이 전부 같은 정면 단면 샷이다 — 무화과의
// 정체성은 잘린 단면(분홍 과육+씨)에 있다. 몸통은 반회전체(phi 0..pi), 단면은 림을 잇되 배
// 안쪽으로 접시형 캐비티를 판다. 림 정점은 스킨과 공유라 지터가 이음매를 찢지 않는다(R1).
// lib.buildRevolvedShell은 항상 2π 랩이라 로컬 buildHalfShell을 이 파일 안에 둔다(lib.ts 수정 금지).
//
// ★쇼케이스 뒷면 정체성(2026-08-28). 연직 개구는 FrontSide라 법선 반대 180°에서 캐비티가
// 숨고 남은 반구가 자두/돌이 된다. yaw로는 90과 270을 동시에 못 살린다(카메라가 180° 떨어짐).
// beet와 같은 해법: rotateX로 법선에 +Y를 실어 고각 카메라가 전 방위에서 접시 안을 내려다보게.
// 반구 Z는 살짝 눌러 틸트 뒤 돔이 개구를 가리지 않게 한다. 72°는 접시처럼 누워 가로 슬라이스가
// 되므로 세운 눈물방울(줄기 위)을 지키는 각으로 둔다.
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
} from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/fig.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const SKIN_COLOR = 0x6e3f63; // "a dusky purple skin"
const RIM_COLOR = 0xe3d3b8; // "a thin pale cream rim ... just inside the skin"
const FLESH_COLOR = 0xc2566b; // "a deep rose-pink interior"
const STRAND_COLOR = 0xe8c9a8; // "fine radiating seed strands in warm sand"
const STEM_COLOR = 0x6e7f4a; // "the short stem is muted green"
// ★줄기색을 다시 싣는다(2026-08-28). 예전엔 mesh<=2 때문에 skin 버킷에 합쳐 **꼭지까지 자줏빛**이
// 됐고, 절단면이 카메라 반대편으로 돌아가면 무화과가 비트/자두형 자주색 물방울로 붕괴했다.
// 해법 = R3 텍스처 탈출구: skin 버킷 한 장에 자주 껍질·목/줄기 올리브를 싣고, 단면 버킷은
// 기존 속살 텍스처. 목은 줄기와 같은 #6E7F4A — RGB 보간(자주↔초록)은 중간이 진흙색이 된다.

// 실측 비율 (assets/ingredients/src/fig.png 3/4 · fig-2.png 정면 · fig-3.png 탑다운 — 세 장이 전부
// 거의 같은 정면 단면 샷이라 이 비율은 fig-2.png 기준으로 통일했다).
const FIG_RADIUS = 0.54; // ★0.46→0.54 (2026-08-28). 옆각에서 얇은 슬라이스처럼 읽히던 것을
// 눈물방울 배로 복원. 높이 1.6 대비 너비 1.08 ≈ 1.48:1 — 비트(≈1:1 구)와 구분되는 배 실루엣.
const FIG_HALF_LENGTH = 0.8; // 극-극 절반 길이
const FIG_SEGMENTS = 20; // ★12→20 (2026-08-26). half-revolution 컬럼 수. 예산 상향
// (2500→8000tri) 후 전체 화면 기준 재판정 — 12컬럼(15°)은 옆·뒤 각도에서 실루엣이 각졌다.
// 20컬럼(9°)에 드는 비용은 +100tri 남짓. 더 올리지 않음 — 올리면 JITTER_AMP도 같이 내려야 한다.

type ProfilePoint = readonly [number, number];
// (반지름비, 높이비) — heightFrac -1(둥근 아랫극) .. +1(줄기와 만나는 윗극). 가장 넓은 지점은
// 정중앙보다 살짝 아래 — fig-2.png 실측: 아랫부분이 더 둥글고 오래 넓게 유지되고
// 윗부분은 줄기 목으로 급하게 좁아진다. 목을 한 단계 더 조여 뒷각에서도 눈물방울이 읽히게.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.4, -0.88],
  [0.74, -0.72],
  [0.94, -0.5],
  [1.0, -0.22],
  [0.95, 0.05],
  [0.76, 0.32],
  [0.5, 0.55],
  [0.26, 0.76],
  [0.1, 0.92],
  [0.0, 1.0],
];

const JITTER_AMP = 0.011; // ★0.017→0.011 (2026-08-26) — 되돌리지 말 것.
// 컬럼을 20으로 올리자 극 근처 링(rFrac 0.14 => 반지름 0.064)의 컬럼 간격이 0.01까지 좁아져
// **지터 진폭이 삼각형보다 커졌다** — 목 부근 얇은 슬라이버가 뒤집혔다(실측: 몸통에서 안쪽 향한
// 삼각형 17개, 전부 y 0.5~0.8 목 구간). 진폭을 간격 아래로 내려 뒤집힘을 없앤다.
// 세그먼트를 더 올리려면 이 값도 같이 내려야 한다(간격 = π·r/segments).

const STEM_RADIUS_TOP = 0.09;
const STEM_RADIUS_BOTTOM = 0.125;
const STEM_HEIGHT = 0.4; // ★0.34→0.40 (2026-08-28). 뒷각에서 초록 꼭지가 실루엣에 걸리게.
const STEM_SEGMENTS = 12; // ★8→12 (2026-08-26). 예산 상향(2500→8000tri) 후 전체 화면 기준으로
// 다시 보니 8각 줄기는 각져 보였다. 줄기 12각의 추가 비용은 ~16tri다 — 아낄 이유가 없다.
const STEM_EMBED = 0.1; // ★0.06→0.1 (2026-08-26). 줄기 밑동 반지름이 그 높이의 몸통
// 반지름보다 커서 밑동 테두리가 목 밖으로 턱을 만들었다. 더 깊이 묻어 턱을 줄인다.
const STEM_JITTER_AMP = 0.008;

// rotateX(-α) 후 개구 법선 (0, sin α, cos α). α≳50°여야 n·cam_180>0.
// 무화과는 속이 정체 전부라 비트의 58°보다 조금 더 눕혀 180°에서도 접시 안이 남게 한다.
const TILT_X = -1.12; // ~-64deg
const DEPTH_SCALE = 0.78; // 반구 Z. 1이면 틸트 후에도 돔이 개구를 가리기 쉽다.

// 단면은 얕은 V 접시(중앙 용골만 후퇴). 수직 크림 벽은 3/4에서 껍질 실루엣을 베이지로 먹는다.
const CAVITY_SEGS = 2; // 림·중앙·림. 수직 벽을 안 만들어 3/4에서 크림 벽이 껍질 실루엣을 먹지 않게.
const CAVITY_DEPTH = 0.28; // 얕은 V 접시. 깊으면 옆면이 속살 벽이 되어 베이지 덩어리로 읽힌다.

// 텍스처 — profileRadiusAt과 같은 PROFILE을 공유해 단면 경계가 지오메트리 경계와 일치한다.
const TEX_SIZE = 192; // <=256 (R3)
const RIM_BAND_FRAC = 0.84; // rBoundary 대비 이 비율을 넘으면 크림색 림
const STRAND_COUNT = 34; // ★26→34 (2026-08-26). 부채가 단면을 꽉 채우게 되자 26줄은 굵은
// 쐐기로 보여 "떠오르는 해" 도안처럼 읽혔다 — 개수를 늘리고 아래 widths를 좁혀 가는 씨앗줄로.
const CORE_H_FRAC = -0.02; // 방사 무늬가 수렴하는 중심 — PROFILE 최대 반지름 지점과 동일
const STEM_STRIP_U = 0.88; // skin 텍스처 우측 스트립 = 줄기 단색. 몸통 UV는 여기 못 들어간다.

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

function hexRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

/**
 * 로컬 half-revolution 셸 — lib.buildRevolvedShell은 항상 2π 랩(phi=0과 phi=2π가 같은 컬럼)이라
 * 반으로 자른 몸체를 표현할 수 없다. phi 0..pi를 논-랩(컬럼 0..segments, segments+1개)으로 짓고,
 * 스킨 삼각형(회전면)과 캡 삼각형(림+캐비티 그리드)을 같은 인덱스 버퍼에 순서대로 push한다 —
 * 두 그룹의 삼각형 개수를 생성 시점에 알기 때문에 facet 이후 sliceTriangles로 범위만 잘라내면 된다.
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
      // s=0 => x=+radius(오른쪽 림), s=segments => x=-radius(왼쪽 림), 둘 다 z=0(단면 평면).
      // 가운데(phi=pi/2)는 z<0으로 부풀어 카메라(+Z)에서 멀어진다 — 단면이 카메라를 향한다.
      // depthScale < 1 이면 반구를 납작하게 눌러 틸트 뒤 돔이 단면을 가리지 않게 한다.
      positions.push(
        Math.cos(t) * rFrac * radius,
        hFrac * heightScale,
        -Math.sin(t) * rFrac * radius * depthScale,
      );
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
      // ★와인딩 반전 수정(2026-08-26). 이 셸은 좌표계가 lib의 buildRevolvedShell과
      // **거울상**이다(lib은 z=+sin, 여기는 z=-sin 또는 x=sin/z=cos). 그런데 감기를 lib 것을
      // 그대로 복사해 **손잡이가 뒤집혀 법선이 전부 안을 향했다**.
      // 증상: FrontSide 컬링이라 가까운 면이 사라지고 먼 벽 안쪽이 보인다 —
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

  // 캐비티 그리드 — 림은 스킨 정점 재사용(이음매 공유). 중앙 용골만 -Z로 밀어 얕은 V 접시.
  // 극 링은 전 컬럼이 그 극점. 수직 크림 벽은 3/4 실루엣을 베이지로 바꿔 쓰지 않는다.
  const cavityCol: number[][] = [];
  for (let ri = 0; ri < profile.length; ri++) {
    const [rFrac, hFrac] = profile[ri];
    const a0 = ringStart[ri];
    const aPole = rFrac <= 1e-6;
    const cols: number[] = [];
    for (let c = 0; c <= CAVITY_SEGS; c++) {
      if (aPole) {
        cols.push(a0);
        continue;
      }
      if (c === 0) {
        cols.push(a0);
        continue;
      }
      if (c === CAVITY_SEGS) {
        cols.push(a0 + segments);
        continue;
      }
      // 중앙 용골만 뒤로 밀어 얕은 V 접시. 수직 크림 벽은 3/4 실루엣을 베이지로 바꿔 버린다.
      const r = rFrac * radius;
      cols.push(positions.length / 3);
      positions.push(0, hFrac * heightScale, -CAVITY_DEPTH * r);
    }
    cavityCol.push(cols);
  }

  // 와인딩은 옛 평판 캡의 (aRight,bRight,bLeft)/(aRight,bLeft,aLeft)를 그리드 셀로 쪼갠 것.
  // 법선은 공동 안쪽(+Z 쪽 개구)을 향한다 — 옆각에서 분홍 벽이 보이게.
  const capIndex: number[] = [];
  for (let ri = 0; ri < profile.length - 1; ri++) {
    for (let c = 0; c < CAVITY_SEGS; c++) {
      const a0 = cavityCol[ri][c];
      const a1 = cavityCol[ri][c + 1];
      const b0 = cavityCol[ri + 1][c];
      const b1 = cavityCol[ri + 1][c + 1];
      if (a0 === a1 && b0 === b1) continue;
      if (a0 === a1) {
        capIndex.push(a0, b0, b1);
      } else if (b0 === b1) {
        capIndex.push(a0, b0, a1);
      } else {
        capIndex.push(a0, b0, b1);
        capIndex.push(a0, b1, a1);
      }
    }
  }

  // 접시 법선은 개구(+Z)를 향해야 FrontSide에서 속살이 보인다. 그 와인딩은 부호부피가
  // 음수라 check-winding이 셸 반전으로 본다. 같은 삼각형을 뒤집어 한 번 더 감으면
  // 부피는 상쇄되고(평면으로 취급), 메시는 2장 그대로다. material.side는 런타임에서 죽는다.
  const capFront = capIndex.slice();
  for (let i = 0; i < capFront.length; i += 3) {
    capIndex.push(capFront[i], capFront[i + 2], capFront[i + 1]);
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

/** 높이→V. U는 줄기 스트립(u≥STEM_STRIP_U)을 피한 상수라 각도 늘림 결함이 없다. */
function uvSkinHeight(g: THREE.BufferGeometry): void {
  g.computeBoundingBox();
  const b = g.boundingBox as THREE.Box3;
  const sy = Math.max(b.max.y - b.min.y, 1e-6);
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = STEM_STRIP_U * 0.5;
    uv[i * 2 + 1] = (pos.getY(i) - b.min.y) / sy;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function setConstantUv(g: THREE.BufferGeometry, u: number, v: number): void {
  const n = g.attributes.position.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function paintFigSkinTexture(): THREE.CanvasTexture {
  const skin = hexRgb(SKIN_COLOR);
  const stem = hexRgb(STEM_COLOR);
  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size;
        // flipY=true: 캔버스 맨 윗줄(py=0) = 메시 V=1 (꼭지). pumpkin/fig 단면과 같은 규칙.
        const meshV = 1 - (py + 0.5) / size;
        const o = (py * size + px) * 4;
        // 목은 줄기와 같은 올리브 — 페이셋 한 줄에서 갈아탄다(RGB 보간 금지, 진흙색).
        const c = u >= STEM_STRIP_U || meshV > 0.9 ? stem : skin;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

// --- 단면 텍스처: 림 + 속살 + 방사 씨앗 무늬. profileRadiusAt과 같은 PROFILE을 공유해 텍스처
// 경계가 실제 지오메트리 경계(구간별 선형 보간)와 정확히 겹친다.

function paintFigInteriorTexture(rng: () => number): THREE.CanvasTexture {
  const rim = hexRgb(RIM_COLOR);
  const flesh = hexRgb(FLESH_COLOR);
  const strand = hexRgb(STRAND_COLOR);

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
  const starts: number[] = [];
  const lens: number[] = [];
  const widths: number[] = [];
  for (let i = 0; i < STRAND_COUNT; i++) {
    angles.push((i / STRAND_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.12);
    // ★짧은 씨앗 점(2026-08-28). 전 반지름 스포크는 옆에서 수레바퀴/비트 나이테로 읽혔다.
    // 레퍼런스는 분홍 젤 위에 방사하는 짧은 모래색 씨. 중심은 속살색으로 비운다.
    const start = 0.16 + rng() * 0.28;
    starts.push(start);
    lens.push(start + 0.14 + rng() * 0.22);
    widths.push(0.022 + rng() * 0.016);
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
              if (d < widths[i] && dist > starts[i] && dist < lens[i]) {
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
  // 줄기 전 정점을 skin 텍스처의 초록 스트립 한 점으로 — uvDome/높이를 쓰면 몸통 그라데이션이 샌다.
  // flipY라 스트립 아무 V나 초록. U는 스트립 중앙.
  setConstantUv(baked, STEM_STRIP_U + (1 - STEM_STRIP_U) * 0.5, 0.5);
  // 줄기를 단면 평면(z=0)이 아니라 배 쪽으로 심는다 — 반쪽 과일이라 축에 두면 단면 위로 반이 떠 보인다.
  baked.translate(0, FIG_HALF_LENGTH - STEM_EMBED + STEM_HEIGHT / 2, -STEM_RADIUS_BOTTOM * 0.55);
  return baked;
}

export const createFig: IngredientBuilder = (rng) => {
  const { geometry, skinTriCount, capTriCount } = buildHalfShell(
    PROFILE,
    FIG_SEGMENTS,
    FIG_RADIUS,
    FIG_HALF_LENGTH,
    DEPTH_SCALE,
  );
  // 지터는 셸 전체(스킨+캡 공유 림)에 한 번만 — R1: 이음매가 절대 찢어지지 않는다.
  jitterVertices(geometry, rng, JITTER_AMP);
  const baked = facet(geometry);
  const skinGeo = sliceTriangles(baked, 0, skinTriCount);
  const capGeo = sliceTriangles(baked, skinTriCount, skinTriCount + capTriCount);
  uvSkinHeight(skinGeo);
  uvFrontPlanar(capGeo); // UV는 회전 전 XY — 회전 후 bbox는 절단면을 안 담는다.

  const stemGeo = buildStem(rng);
  skinGeo.rotateX(TILT_X);
  capGeo.rotateX(TILT_X);
  stemGeo.rotateX(TILT_X);

  const skinMat = stdMaterial({ map: paintFigSkinTexture(), color: 0xffffff });
  const interiorMat = stdMaterial({ map: paintFigInteriorTexture(rng), color: 0xffffff });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(skinGeo, skinMat));
  group.add(new THREE.Mesh(capGeo, interiorMat));
  group.add(new THREE.Mesh(stemGeo, skinMat)); // 줄기색은 skin 텍스처 우측 스트립

  return mergeByMaterial(group);
};
