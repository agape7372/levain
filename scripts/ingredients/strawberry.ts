// 딸기 — 회전체 몸통(텍스처 1장: 다홍 바탕+씨 점) + 꽃받침 잎 5장(양측 페이싯) + 꼭지. 계약은
// types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/strawberry.json(워크스페이스 원본은
// assets/ingredients/work/strawberry/). 프로필·색·잎 배치는 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
// ⚠ v3(2026-08-26) 개편은 **레포 코드만** 고쳤다 — 스펙 파일은 이 작업의 쓰기 범위 밖
// (배정이 scripts/ingredients/<id>.ts로 한정)이라 "스펙 먼저"를 못 지켰다. 지금은 이 파일이
// 실측 정본이다(특히 씨앗이 텍스처 -> 지오메트리로 바뀐 것). 다음 스펙 손질 때 역전사할 것.
//
// R3(types.ts) 텍스처 탈출구: hex 5개(바탕·그늘·하이라이트·씨·잎) vs 머티리얼 2개 상한 —
// 그늘/하이라이트는 올리브·밤·호두와 같은 이유로 N·L 감쇠에 맡겨 드롭.
// ⚠ 런타임 MeshLambertMaterial 스왑은 map·color만 승계 — material.side는 안 살아남는다(types.ts
// §2 확인, breadlab.ts/thumbsHarness.ts/breadShowcase.ts 3곳 전부 동일). 그래서 잎은 진짜 평면 1장이
// 아니라 **앞면+뒤집힌 뒷면 트라이앵글을 함께 굽는다** — material.doubleSided는 스펙 기록용일 뿐,
// 실제 양면 가시성은 지오메트리로 해결한다.
//
// ★v3 (2026-08-26, 전체화면 쇼케이스 판독 수리 — identity 배치). 되돌리지 마라.
// 판정: 씨앗이 창백한 평행 빗살/갈매기 줄무늬로 찍혀 **긁힌 자국·스캔라인 글리치**로 보였다
// (az 0 좌상단 어깨, az 270 중앙~우측).
// 원인: 씨를 96px 캔버스 위 1.3x1.9px 타원으로 그린 뒤 uvCylindrical(각도->v)로 감았다. 페이셋
// 삼각형마다 UV가 끊기고, 몸통 반지름이 높이에 따라 변해 각도 방향 텍셀이 세로로 늘어난다 —
// 늘어난 한 텍셀 줄이 화면에서 빗살로 찍힌 것이다. 텍스처 해상도를 올려도 **같은 계열의 결함이
// 각도만 바꿔서 재발한다**(늘림 자체가 원인).
// 해법: 씨앗을 **지오메트리로 옮기고 몸통 텍스처를 아예 없앤다**. 몸통은 순색 버킷,
// 씨앗+꽃받침+꼭지는 상수 UV 아틀라스 버킷(연노랑 패치/초록 패치) — UV 투영이 한 군데도 없으므로
// 늘림 결함이 구조적으로 불가능해진다. 예산이 2500 -> 8000tri로 올라 씨 90개(360tri)가 무료다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { bakeTexture, buildRevolvedShell, facet, jitterVertices, mergeByMaterial, stdMaterial, uvCylindrical } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/strawberry.json geometry.surface 손 전사 (JSON import 금지,
// types.ts §7). "#96271F"(그늘)·"#DC6151"(하이라이트)은 볼록한 몸통의 N·L 감쇠가 공짜로 표현하므로
// 버킷을 안 만든다(올리브/밤/호두와 동일 논리).
const BODY_COLOR = 0xc0392f; // "a saturated scarlet body"
const SEED_COLOR = 0xf4e3c4; // "small pale seed dimples"
const CALYX_COLOR = 0x6b7e4a; // "the calyx leaves are a fresh green"

const SEGMENTS = 30; // v3: 14 -> 30. 전체화면에서 14각 실루엣이 각져 보였다(예산 상향분 사용)
const BODY_RADIUS = 0.5;
// cmp-1 판정: 0.85(높이:너비 0.85:1)는 런타임의 "최장축->1.6" 리핏이 **너비**를 최장축으로 골라
// 딸기가 옆으로 넓적하게 렌더됐다(레퍼런스는 세로로 긴 하트형, ~1.3:1). 높이를 확실히 최장축으로.
const BODY_HEIGHT = 1.3; // 바닥 뾰족한 끝 -> 어깨 위 꼭지 부착점까지 전체 높이

// (반지름비, 높이비) — heightFrac 0(뾰족한 바닥) .. 1(윗쪽 극점, 꽃받침 부착부). 가장 넓은 지점은
// 위쪽 58% 지점 (strawberry-2.png 정면도 실측 — "widest near the top").
type ProfilePoint = readonly [number, number];
// v3: 링을 9 -> 15로 촘촘히(a1 실측: 플랫 셰이딩에서 링 간격이 넓어 가로 띠가 계단처럼 보였다).
const PROFILE: readonly ProfilePoint[] = [
  [0.0, 0.0], // 바닥 극점 (뾰족한 끝)
  [0.3, 0.1],
  [0.45, 0.17],
  [0.6, 0.24],
  [0.73, 0.32],
  [0.85, 0.4],
  [0.94, 0.49],
  [1.0, 0.58], // 어깨 — 가장 넓은 지점
  [0.99, 0.67],
  [0.93, 0.76],
  [0.83, 0.83],
  [0.7, 0.9],
  [0.56, 0.945],
  [0.4, 0.98],
  [0.0, 1.0], // 윗 극점 (꽃받침 아래)
];

const JITTER_AMP = 0.006; // v3: 0.018 -> 0.006. 씨앗을 해석적 표면에 심으므로 표면 변위를 조인다
// (최대 변위 = amp x sqrt(3) ~= 0.010 < SEED_EMBED 0.016 — 씨 밑동이 절대 뜨지 않는다)

// 아틀라스 텍스처 — 순색 패치 2개(연노랑 씨앗 / 초록 꽃받침)를 한 장에 싣고, 그 버킷의 모든
// 지오메트리가 **상수 UV**로 자기 패치 한 점만 샘플한다. 투영 UV가 없으니 늘림·이음매 결함이
// 원리적으로 불가능하다(v3의 요점 — 헤더 주석 참조. 몸통을 다시 텍스처로 되돌리지 마라).
// flipY=true(CanvasTexture 기본)라 캔버스 위쪽(작은 py)이 메시 V=1 근처다.
const TEX_SIZE = 32;
const SEED_UV: readonly [number, number] = [0.25, 0.75]; // 캔버스 좌상단 사분면 = 연노랑
const CALYX_UV: readonly [number, number] = [0.75, 0.25]; // 캔버스 우하단 사분면 = 초록

function hexToRgb(hex: number): string {
  return `rgb(${(hex >> 16) & 0xff}, ${(hex >> 8) & 0xff}, ${hex & 0xff})`;
}

function bakeAtlasTexture(): THREE.CanvasTexture {
  return bakeTexture(TEX_SIZE, (ctx, size) => {
    ctx.fillStyle = hexToRgb(CALYX_COLOR);
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = hexToRgb(SEED_COLOR);
    ctx.fillRect(0, 0, size / 2, size / 2); // 좌상단 사분면
  });
}

/** 지오메트리 전체에 한 점짜리 UV를 박는다(아틀라스 패치 고정). */
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
  // 순색 버킷이라 투영은 아무거나 무방 — attribute 일관성만 필요(cheese/pumpkin 관례).
  uvCylindrical(baked, 'y');
  return baked;
}

// ── 씨앗(수과) 지오메트리 ──────────────────────────────────────────────────────
// 표면 위 각 지점에 밑동을 살짝 파묻은 4면 피라미드를 심는다. 밑면은 굽지 않는다(파묻혀 있다).
// R4: 얇은 파트라 지터 없음 — 대신 행마다 황금각을 더해 세로 줄맞춤(멜론 무늬)을 깬다.
const SEED_ROWS = 9;
const SEED_H_RANGE: readonly [number, number] = [0.14, 0.9]; // 양쪽 극점 근처는 비운다
const SEED_ARC_SPACING = 0.19; // 목표 호 간격(월드) — 행 반지름에 따라 개수를 정한다
const SEED_MIN_PER_ROW = 5;
const SEED_MAX_PER_ROW = 13;
// ★a1 실측 후 납작하게 (되돌리지 마라): 높이 0.028은 실루엣에 가시처럼 돋아 **선인장/솔방울**로
// 보였다. 딸기 수과는 표면에 살짝 박힌 씨앗이지 돌기가 아니다. 높이를 반으로 줄이고 밑면을 넓혀
// "박힌 렌즈"로 만든다 — 정면 밝기 대비는 그대로 남으므로 판독은 안 잃는다.
const SEED_HALF_LEN = 0.033; // 자오선 방향(길쭉하다 — 실제 수과도 세로로 눕는다)
const SEED_HALF_WIDTH = 0.021;
const SEED_HEIGHT = 0.014;
const SEED_EMBED = 0.011;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface SurfaceSample {
  r: number;
  y: number;
  nr: number; // 법선의 반지름 성분
  ny: number;
  tr: number; // 자오선 접선(위 방향)의 반지름 성분
  ty: number;
}

/** PROFILE을 hFrac으로 선형 보간해 반지름·높이와 자오선 접선/법선을 낸다(회전면 로컬 2D). */
function sampleProfile(hFrac: number): SurfaceSample {
  let i = 0;
  while (i < PROFILE.length - 2 && PROFILE[i + 1][1] < hFrac) i++;
  const [r0, h0] = PROFILE[i];
  const [r1, h1] = PROFILE[i + 1];
  const t = (hFrac - h0) / Math.max(h1 - h0, 1e-6);
  const dr = (r1 - r0) * BODY_RADIUS;
  const dy = (h1 - h0) * BODY_HEIGHT;
  const len = Math.hypot(dr, dy) || 1e-6;
  // 법선 (dy, -dr)/len — 볼록한 회전면에서 바깥을 향한다(적도에서 dr=0, dy>0 -> 반지름 +).
  return { r: (r0 + (r1 - r0) * t) * BODY_RADIUS, y: hFrac * BODY_HEIGHT, tr: dr / len, ty: dy / len, nr: dy / len, ny: -dr / len };
}

/** 씨 1개 = 밑면 없는 4면 피라미드. 밑면 사각형은 (T,B) 평면에서 반시계(바깥=+N에서 볼 때),
 * 옆면은 (apex, c[k], c[k+1]) — 외적으로 검산: T x B = N인 우수 프레임이라 이 순서가 바깥이다. */
function pushSeed(out: number[], theta: number, hFrac: number): void {
  const s = sampleProfile(hFrac);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const p: THREE.Vector3Tuple = [ct * s.r, s.y, st * s.r];
  const N: THREE.Vector3Tuple = [ct * s.nr, s.ny, st * s.nr];
  const T: THREE.Vector3Tuple = [ct * s.tr, s.ty, st * s.tr];
  const B: THREE.Vector3Tuple = [-st, 0, ct];

  const base: THREE.Vector3Tuple[] = [];
  for (let k = 0; k < 4; k++) {
    const phi = (k / 4) * Math.PI * 2;
    const cl = Math.cos(phi) * SEED_HALF_LEN;
    const cw = Math.sin(phi) * SEED_HALF_WIDTH;
    base.push([
      p[0] - N[0] * SEED_EMBED + T[0] * cl + B[0] * cw,
      p[1] - N[1] * SEED_EMBED + T[1] * cl + B[1] * cw,
      p[2] - N[2] * SEED_EMBED + T[2] * cl + B[2] * cw,
    ]);
  }
  const apex: THREE.Vector3Tuple = [p[0] + N[0] * SEED_HEIGHT, p[1] + N[1] * SEED_HEIGHT, p[2] + N[2] * SEED_HEIGHT];
  for (let k = 0; k < 4; k++) {
    const a = base[k];
    const b = base[(k + 1) % 4];
    out.push(apex[0], apex[1], apex[2], a[0], a[1], a[2], b[0], b[1], b[2]);
  }
}

function buildSeeds(): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let row = 0; row < SEED_ROWS; row++) {
    const hFrac = SEED_H_RANGE[0] + ((row + 0.5) / SEED_ROWS) * (SEED_H_RANGE[1] - SEED_H_RANGE[0]);
    const s = sampleProfile(hFrac);
    const raw = Math.round((2 * Math.PI * s.r) / SEED_ARC_SPACING);
    const count = Math.min(SEED_MAX_PER_ROW, Math.max(SEED_MIN_PER_ROW, raw));
    const phase = row * GOLDEN_ANGLE;
    for (let k = 0; k < count; k++) {
      pushSeed(positions, phase + (k / count) * Math.PI * 2, hFrac);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  setConstantUv(geo, SEED_UV);
  return geo;
}

// 꽃받침 잎 1장 — 중앙 능선으로 접힌 마름모(밑동 극점 -> 중간 폭 3점 -> 끝 극점, 4tri) +
// 뒤집힌 뒷면 사본(법선 반대, 같은 위치, +4tri) = 8tri. R4: 얇은 파트라 지터 생략.
const LEAF_LENGTH = 0.4; // v3: 0.34 -> 0.40, 폭도 넓혀 다트가 아니라 잎으로 읽히게
const LEAF_HALF_WIDTH = 0.11;
const LEAF_RIDGE_HEIGHT = 0.04;

function buildLeaf(): THREE.BufferGeometry {
  const base: THREE.Vector3Tuple = [0, 0, 0];
  const midLeft: THREE.Vector3Tuple = [-LEAF_HALF_WIDTH, 0, LEAF_LENGTH * 0.42];
  const midRidge: THREE.Vector3Tuple = [0, LEAF_RIDGE_HEIGHT, LEAF_LENGTH * 0.42];
  const midRight: THREE.Vector3Tuple = [LEAF_HALF_WIDTH, 0, LEAF_LENGTH * 0.42];
  const tip: THREE.Vector3Tuple = [0, 0, LEAF_LENGTH];

  // 앞면 4개 (와인딩: 위에서 보아 시계반대 == 법선 +Y쪽)
  const front: THREE.Vector3Tuple[] = [
    base, midLeft, midRidge,
    base, midRidge, midRight,
    midLeft, tip, midRidge,
    midRidge, tip, midRight,
  ];
  // 뒷면 — 같은 정점, 반대 와인딩(법선 -Y쪽) — material.side가 런타임 스왑에서 안 살아남으므로
  // (헤더 주석 참조) 지오메트리로 양면을 굽는다.
  const back: THREE.Vector3Tuple[] = [
    base, midRidge, midLeft,
    base, midRight, midRidge,
    midLeft, midRidge, tip,
    midRidge, midRight, tip,
  ];

  const positions = new Float32Array([...front, ...back].flat());
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  // v3: 씨앗과 같은 버킷을 쓰므로 uv 필수 — 없으면 mergeByMaterial의 attribute 일관성 조건에
  // 걸려 던진다(types.ts §4).
  setConstantUv(geo, CALYX_UV);
  return geo;
}

// 꼭지 — 짧은 원통(직선 lathe 프로필, 위아래 캡 포함).
const STEM_RADIUS = 0.045;
const STEM_HEIGHT = 0.12;
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

// 꽃받침 배치 — 5장을 72도 간격 방사 배열, 몸통 위쪽 극점(0, BODY_HEIGHT, 0)에서 바깥+아래로
// 처지게 로컬 X축 피치를 준다. 앞/뒷면을 함께 구웠으므로 카메라 방위와 무관하게 항상 보인다.
const LEAF_COUNT = 5;
// cmp-1 판정: 밑동을 몸통 극점(반지름 0)에 그대로 두고 50도로 늘어뜨렸더니, 처지는 만큼 축
// 쪽으로 당겨져(cos 성분) 그 높이의 몸통 반지름보다 안쪽에 들어가 몸통 속에 파묻혀 안 보였다.
// 밑동을 바깥으로 먼저 밀어내고(BASE_OFFSET) 처짐 각도를 줄여 어느 높이에서도 몸통 표면
// 바깥에 머물게 한다.
const LEAF_BASE_OFFSET = 0.3; // 회전 전, 로컬 +Z로 밑동을 미리 밀어내는 거리
const LEAF_PITCH = (30 * Math.PI) / 180; // 잎 끝을 어깨 쪽으로 늘어뜨리는 각도

function buildCalyx(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < LEAF_COUNT; i++) {
    const leaf = buildLeaf();
    leaf.translate(0, 0, LEAF_BASE_OFFSET);
    leaf.rotateX(LEAF_PITCH);
    leaf.rotateY((i * (2 * Math.PI)) / LEAF_COUNT);
    leaf.translate(0, BODY_HEIGHT, 0);
    parts.push(leaf);
  }
  const stem = buildStem();
  stem.translate(0, BODY_HEIGHT, 0);
  parts.push(stem);
  return parts;
}

export const createStrawberry: IngredientBuilder = (rng) => {
  // 버킷 1 = 몸통(순색 다홍, 텍스처 없음) / 버킷 2 = 아틀라스(씨앗 연노랑 + 꽃받침 초록).
  // ⚠ 몸통에 다시 map을 얹지 마라 — v3가 고친 글리치가 그대로 돌아온다(헤더 주석).
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const atlasMat = stdMaterial({ map: bakeAtlasTexture(), color: 0xffffff });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(buildBody(rng), bodyMat));
  group.add(new THREE.Mesh(buildSeeds(), atlasMat));
  for (const geo of buildCalyx()) {
    group.add(new THREE.Mesh(geo, atlasMat));
  }

  // 공유 지면 y=0 — 지터가 바닥 정점을 살짝 밀어낼 수 있어 최종 bbox로 스냅한다(types.ts R1).
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
  group.updateMatrixWorld(true);

  return mergeByMaterial(group);
};
