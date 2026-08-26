// 치즈 — 둥글린 큐브 3개 물리적 스택. 계약은 types.ts 주석이 정본. 재료 배치B 4번째(마지막).
//
// 유래: img2threejs 스펙 assets/ingredients/specs/cheese.json(워크스페이스 원본은
// assets/ingredients/work/cheese/). 수치·색은 그 스펙(author_spec.py)의 전사이며, 수치를 고칠
// 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// 이 배치에서 유일한 박스 계열 재료(올리브/초코/크랜베리/블루베리는 전부 lathe). buildRevolvedShell
// 재사용 불가 — 큐브 6면을 직접 짓는다. 모서리 라운딩은 sdRoundBox 표면점 공식(순수 위치 함수)을
// 정점마다 적용 — 인접 면이 공유하는 모서리/꼭짓점 정점은 좌표가 같으므로 동일하게 매핑돼
// **인덱스 공유 없이도** 이음매가 안 벌어진다(6면을 독립 그리드로 지어도 안전).
//
// ⚠ 지터 생략(R4 예외): 6면이 정점을 공유하지 않는 독립 그리드라 jitterVertices를 걸면 같은
// 위치의 이웃 면 정점이 다른 난수를 받아 모서리가 찢어진다(팀리드가 지적한 함정). 웰디드 단일
// 인덱스로 다시 짓는 대신 **지터 자체를 생략**한다 — 레퍼런스도 표면이 완전히 매끈해 지터가
// 애초에 불필요(risk rounding-seam-tear-if-jittered 참조).
//
// 색 버킷: 프롬프트 hex 4개(#E8B75A 몸통 / #C9903A 그늘진 면 / #C0562F 테두리 rind / #D8A448 구멍).
// 그늘진 면은 평평한 큐브 면들이 방향마다 다른 N·L 밝기를 이미 공짜로 낸다(올리브 교훈을 곡면 대신
// 평면에 적용). 남는 버킷 2개: **몸통(텍스처, 구멍 포함) + rind(순색)**.
//
// ═══ 2026-08-26 전체 화면 쇼케이스 수리 (되돌리지 말 것) ═══
// 검증을 64px 썸네일 판독으로만 했던 게 아래 둘을 놓친 이유다. 재료도 빵과 **같은 쇼케이스에서
// 같은 크기로** 확대돼 보인다(breadShowcase의 FIT_SIZE는 패밀리를 안 가린다). 예산도 그래서 빵과
// 같아졌다(개당 250KB/8000tri, 정본 = scripts/lib/families.mjs).
//
// ① 구멍 = 지오메트리 함몰 → **텍스처**.
//   디버그 이력(cmp-1~3 상한 소진 + shot-*-debug.png들, 전부 파일명 감사 흔적): 처음 본 지그재그는
//   홀 위치를 반대쪽 코너로 옮겨도(v2), 앞면만 촘촘한 격자를 써도(v3 SEGMENTS_FRONT=6), 라운딩
//   반지름을 낮춰도(0.13->0.085) 안 없어졌다. 전 면 SEGMENTS=5로 통일해 T-접합 가설도 검증했지만
//   그대로였다 — **격리 테스트**(shot-isolation-debug.png, 두 홀 깊이를 0으로)로 확정: 원인은 홀
//   함몰 그 자체였다. 정점을 당겨 만드는 함몰은 주변 평면과의 경계에서 벽 삼각형 노멀이 급격히
//   꺾이고, 그 급경사가 오블리크 카메라에서 지그재그 명암으로 읽힌다. 당시 해법이던 "깊이를 얕게"는
//   64px에서만 통했고 전체 화면에서는 계단식 명암 띠로 그대로 드러났다(수리 전 az=90 실측).
//   ★**격자 밀도를 올리는 방향은 이미 실패한 길**이므로 되풀이하지 않는다. 함몰 지오메트리를 통째로
//   빼고 프롬프트 자신의 구멍 hex(#D8A448)로 구워 넣는다 — 프롬프트 notes_ko도 "구멍은 가장자리
//   어두운 테두리 없이 색으로만"이라 원안에 더 가깝다. 지오메트리가 평평해지니 지그재그의 원인 자체가
//   사라진다. **구멍을 다시 지오메트리로 파지 말 것.**
// ② rind = -X 면 전체 → **모서리를 감는 띠**.
//   면 하나를 통째로 칠하면 턴테이블에서 붉은 면이 켜졌다 꺼진다(수리 전 az=180에서 rind도 구멍도
//   안 보여 갈색 상자 3개였다). 프롬프트 산문("한쪽 모서리를 따라 얇은 띠")과 cheese.png 실측이
//   모두 띠다 — 이전 주석의 "면 하나 전체" 판독은 틀렸다. 띠가 **윗면 모서리를 넘어가게** 두면
//   3/4 부감 카메라에서 윗면이 늘 보이므로 **모든 방위각에서 rind가 보인다.**
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { bakeTexture, facet, mergeByMaterial, scaleHex, stdMaterial } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/cheese.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0xe8b75a; // "a rich butter-yellow body"
const RIND_COLOR = 0xc0562f; // "a thin warm wax rind" — 산문·실측 모두 "한쪽 모서리를 따라" 난 띠
const HOLE_COLOR = 0xd8a448; // "two or three small round holes"
const HOLE_SHADE = scaleHex(HOLE_COLOR, 0.78); // 구멍 안쪽 윗벽 그늘 — lib.scaleHex 결정론 유도(types.ts §7)

const CUBE_HALF = 0.5;
const ROUND_RADIUS = 0.13; // 반폭 대비 26% — cheese.png의 모서리는 꽤 두툼하게 둥글다

// ── 면 격자: 필렛(모서리) 표본은 전 면 공유, 안쪽 균일 표본만 면마다 다르다 ────────────────
// ★이 분리가 성립하는 근거 두 가지(둘 다 필요, 되돌리지 말 것):
//   (a) 안쪽 구간에서 인접 면이 만나는 모서리는 **직선**이다 — 표본 밀도가 달라도 T-접합이
//       기하학적으로 무해하다(같은 직선 위에 점이 더 있을 뿐 틈이 안 생긴다).
//   (b) 필렛 표본은 아래 axisSamples의 **한 공식**을 전 면이 그대로 쓴다 — 그래서 모서리·꼭짓점
//       구면 영역의 정점 좌표가 면끼리 정확히 일치한다. 여기가 어긋나면 꼭짓점에 실금이 생기고
//       그건 부호부피 검사(vol.mjs)로는 안 잡힌다. **필렛 표본을 면별로 바꾸지 말 것.**
const FILLET_STEPS = 2; // 면당 필렛 스트립 수 → 모서리 하나가 4페이싯(22.5°씩). 레퍼런스도 이 정도 각짐
const INNER_PLAIN = 1; // 평평한 안쪽은 삼각형이 아무 정보를 안 실으니 큰 사각 하나로 충분
const INNER_BAND = 7; // rind 띠 경계가 놓일 면만 — 경계선을 넣을 격자선이 필요하다
const RIND_CUT = 0.265; // 띠 경계(큐브 로컬 좌표). 사각형 중심값 0.211과 0.317 **사이**로 잡아
// 부동소수 동률을 피한다 — 결과 띠 폭 = 면의 23.6%(cheese.png 실측 15~20%대와 같은 급).

// ── 텍스처: 256² 2x2 아틀라스(R3 상한 준수). 타일 3장은 구멍 배치 변주, 1장은 무지 ──────────
// 옆면 4장에 서로 다른 타일을 물려 주사위처럼 똑같아 보이는 걸 막는다. 윗면·아랫면은 무지 —
// cheese.png에서도 윗면엔 구멍이 없다. 구멍은 모두 타일 v≤0.71 안에 있어 rind 띠에 안 잘린다.
const TEX_PX = 256;
const TEX_TILES = 2;
const UV_INSET = 0.06; // 타일 가장자리 여백 — 밉맵에서 옆 타일이 번지는 걸 막는다
const PLAIN_TILE: readonly [number, number] = [1, 1];
/** [타일좌표, [중심u, 중심v, 반지름] 목록] — 전부 타일 정규 좌표. */
const HOLE_TILES: readonly (readonly [readonly [number, number], readonly (readonly [number, number, number])[]])[] = [
  [[0, 0], [[0.4, 0.5, 0.155], [0.63, 0.28, 0.075]]],
  [[1, 0], [[0.57, 0.46, 0.15], [0.34, 0.3, 0.07]]],
  [[0, 1], [[0.47, 0.42, 0.16], [0.7, 0.6, 0.062]]],
];

function hexCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/**
 * 구멍 1개 = 평면 2톤(저폴리 페이싯 룩). 아래쪽 밝은 원(#D8A448) + 위쪽 초승달 그늘.
 * 키라이트가 좌상단이라 구멍 안쪽 **윗벽**이 그늘진다(cheese.png의 구멍도 위가 어둡다).
 * 프롬프트가 금지한 "가장자리 어두운 테두리"(전체를 두르는 링)가 아니라 한쪽 초승달이다.
 */
function paintHole(
  ctx: CanvasRenderingContext2D,
  px: (u: number) => number,
  py: (v: number) => number,
  scale: number,
  [cu, cv, r]: readonly [number, number, number],
): void {
  const x = px(cu);
  const y = py(cv);
  const rad = r * scale;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = hexCss(HOLE_SHADE);
  ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  ctx.fillStyle = hexCss(HOLE_COLOR);
  ctx.beginPath();
  // 캔버스 y는 아래로 자라므로 +0.22r = 구멍의 아래쪽(밝은 바닥). 남는 위쪽이 초승달 그늘.
  ctx.arc(x, y + rad * 0.22, rad * 0.86, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintCheese(ctx: CanvasRenderingContext2D, size: number): void {
  const tile = size / TEX_TILES;
  ctx.fillStyle = hexCss(BODY_COLOR);
  ctx.fillRect(0, 0, size, size);
  for (const [[tx, ty], holes] of HOLE_TILES) {
    // uv(0,0) = 캔버스 좌하단(three CanvasTexture flipY 기본) — v를 위로 자라게 변환한다.
    const px = (u: number) => (tx + u) * tile;
    const py = (v: number) => size - (ty + v) * tile;
    for (const hole of holes) paintHole(ctx, px, py, tile, hole);
  }
}

type Axis = 'x' | 'y' | 'z';
interface FaceDef {
  readonly n: Axis; // 법선 축
  readonly nSign: 1 | -1;
  readonly u: Axis; // 격자 i 방향 축
  readonly uSign: 1 | -1;
  readonly v: Axis; // 격자 j 방향 축
  readonly vSign: 1 | -1;
}

// N = U x V(우수 좌표계, 바깥 방향 노멀 보장) — 각 면별로 검산됨(렌더에서 face 유실이 없으면
// 와인딩이 맞다는 뜻). 옆면 4장은 전부 v='y'(vSign 1)라 텍스처의 위쪽이 월드 위쪽과 일치한다 —
// 구멍 그늘이 네 옆면에서 모두 같은 방향을 향하는 근거다.
const FACES: readonly FaceDef[] = [
  { n: 'x', nSign: 1, u: 'z', uSign: -1, v: 'y', vSign: 1 }, // +X
  { n: 'x', nSign: -1, u: 'z', uSign: 1, v: 'y', vSign: 1 }, // -X
  { n: 'y', nSign: 1, u: 'x', uSign: 1, v: 'z', vSign: -1 }, // +Y top
  { n: 'y', nSign: -1, u: 'x', uSign: 1, v: 'z', vSign: 1 }, // -Y bottom
  { n: 'z', nSign: 1, u: 'x', uSign: 1, v: 'y', vSign: 1 }, // +Z front
  { n: 'z', nSign: -1, u: 'x', uSign: -1, v: 'y', vSign: 1 }, // -Z back
];

/** rind 띠가 감는 모서리 = 윗면(+Y)과 이 옆면이 만나는 선. */
interface RindEdge {
  readonly axis: 'x' | 'z';
  readonly sign: 1 | -1;
}

type RindRole = 'top' | 'side' | 'none';

function rindRole(def: FaceDef, edge: RindEdge): RindRole {
  if (def.n === 'y') return def.nSign === 1 ? 'top' : 'none';
  return def.n === edge.axis && def.nSign === edge.sign ? 'side' : 'none';
}

function setAxis(v: THREE.Vector3, axis: Axis, value: number): void {
  if (axis === 'x') v.x = value;
  else if (axis === 'y') v.y = value;
  else v.z = value;
}

function getAxis(v: THREE.Vector3, axis: Axis): number {
  return axis === 'x' ? v.x : axis === 'y' ? v.y : v.z;
}

/**
 * 한 축의 표본 좌표(오름차순, 0 대칭). 안쪽 균일 구간 [-inner, inner] + 양쪽 필렛.
 * 필렛 표본은 라운딩 원호를 등각으로 나눈 위치다: 좌표 inner + r·tan(φ)가 roundBoxVertex를
 * 통과하면 정확히 각도 φ의 원호 위로 간다(면 하나가 커버하는 구간은 0~45°, 나머지 45°는 이웃 면 몫).
 */
function axisSamples(inner: number): number[] {
  const flat = CUBE_HALF - ROUND_RADIUS;
  const fillet = (k: number) =>
    k === FILLET_STEPS ? CUBE_HALF : flat + ROUND_RADIUS * Math.tan((Math.PI / 4) * (k / FILLET_STEPS));
  const out: number[] = [];
  for (let k = FILLET_STEPS; k >= 1; k--) out.push(-fillet(k));
  for (let i = 0; i <= inner; i++) out.push(-flat + (2 * flat * i) / inner);
  for (let k = 1; k <= FILLET_STEPS; k++) out.push(fillet(k));
  return out;
}

/**
 * sdRoundBox 표면점 공식 — 순수 위치 함수라 같은 좌표의 정점(인접 면이 공유하는 모서리/꼭짓점)은
 * 항상 같은 결과로 매핑된다. 면 내부(모서리에서 ROUND_RADIUS보다 먼 정점)는 그대로 통과한다.
 */
function roundBoxVertex(p: THREE.Vector3, half: number, r: number): THREE.Vector3 {
  const inner = half - r;
  const cx = THREE.MathUtils.clamp(p.x, -inner, inner);
  const cy = THREE.MathUtils.clamp(p.y, -inner, inner);
  const cz = THREE.MathUtils.clamp(p.z, -inner, inner);
  const d = new THREE.Vector3(p.x - cx, p.y - cy, p.z - cz);
  const len = d.length() || 1;
  return new THREE.Vector3(cx, cy, cz).addScaledVector(d, r / len);
}

interface FaceParts {
  readonly body: THREE.BufferGeometry;
  readonly rind: THREE.BufferGeometry | null;
}

/**
 * 면 1개 = 비균일 격자 -> 라운딩 -> 사각형 단위로 몸통/rind 분류 -> facet.
 * 색 경계는 **사각형 경계**를 따라간다(정점 마스크가 아니라) — 격자선과 정확히 일치하는 수밀한
 * 경계라 types.ts §2의 "vertex paint 금지"를 지오메트리 엣지로 만족시킨다.
 */
function buildFace(def: FaceDef, edge: RindEdge, tile: readonly [number, number]): FaceParts {
  const role = rindRole(def, edge);
  // 띠 경계가 놓이는 축에만 안쪽 격자선을 넣는다(윗면은 edge.axis, 옆면은 y).
  const bandAxis: Axis | null = role === 'top' ? edge.axis : role === 'side' ? 'y' : null;
  const uSamples = axisSamples(def.u === bandAxis ? INNER_BAND : INNER_PLAIN);
  const vSamples = axisSamples(def.v === bandAxis ? INNER_BAND : INNER_PLAIN);

  const positions: number[] = [];
  const uvs: number[] = [];
  for (let j = 0; j < vSamples.length; j++) {
    for (let i = 0; i < uSamples.length; i++) {
      const p = new THREE.Vector3();
      setAxis(p, def.n, def.nSign * CUBE_HALF);
      setAxis(p, def.u, def.uSign * uSamples[i]);
      setAxis(p, def.v, def.vSign * vSamples[j]);
      const rounded = roundBoxVertex(p, CUBE_HALF, ROUND_RADIUS);
      positions.push(rounded.x, rounded.y, rounded.z);
      // UV는 면 자신의 (u,v) 파라미터로 — uSign/vSign을 곱하지 않는다(옆면 4장의 텍스처 위쪽이
      // 월드 위쪽으로 정렬되는 이유). 타일 안쪽으로 UV_INSET만큼 밀어 밉맵 번짐을 막는다.
      const su = (uSamples[i] + CUBE_HALF) / (2 * CUBE_HALF);
      const sv = (vSamples[j] + CUBE_HALF) / (2 * CUBE_HALF);
      uvs.push(
        (tile[0] + UV_INSET + su * (1 - 2 * UV_INSET)) / TEX_TILES,
        (tile[1] + UV_INSET + sv * (1 - 2 * UV_INSET)) / TEX_TILES,
      );
    }
  }

  const isRind = (cu: number, cv: number): boolean => {
    if (role === 'none') return false;
    const c = new THREE.Vector3();
    setAxis(c, def.n, def.nSign * CUBE_HALF);
    setAxis(c, def.u, def.uSign * cu);
    setAxis(c, def.v, def.vSign * cv);
    return role === 'top' ? edge.sign * getAxis(c, edge.axis) > RIND_CUT : c.y > RIND_CUT;
  };

  const bodyIndex: number[] = [];
  const rindIndex: number[] = [];
  const stride = uSamples.length;
  for (let j = 0; j < vSamples.length - 1; j++) {
    for (let i = 0; i < stride - 1; i++) {
      const a = j * stride + i;
      const b = j * stride + i + 1;
      const c = (j + 1) * stride + i;
      const d = (j + 1) * stride + i + 1;
      // U,V,N 우수 조합이라 (i,j)->(i+1,j)->(i+1,j+1)->(i,j+1) 순회가 바깥 방향 CCW.
      const into = isRind((uSamples[i] + uSamples[i + 1]) / 2, (vSamples[j] + vSamples[j + 1]) / 2)
        ? rindIndex
        : bodyIndex;
      into.push(a, b, d);
      into.push(a, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // 지터 없음(R4 예외, 헤드 주석 참조) — indexed에서 바로 facet(uv는 toNonIndexed가 실어 나른다).
  geometry.setIndex(bodyIndex);
  const body = facet(geometry);
  let rind: THREE.BufferGeometry | null = null;
  if (rindIndex.length > 0) {
    geometry.setIndex(rindIndex);
    rind = facet(geometry);
  }
  return { body, rind };
}

interface CubeDef {
  offset: readonly [number, number]; // world XZ
  yaw: number;
  stacked: boolean;
  rind: RindEdge; // 큐브마다 다른 모서리에 띠 — cheese.png도 왼쪽 큐브는 왼쪽, 오른쪽 큐브는 오른쪽
}

// assets/ingredients/work/cheese/object-sculpt-spec.json CUBES 전사(+ rind 모서리).
const CUBES: Record<'bottomA' | 'bottomB' | 'top', CubeDef> = {
  bottomA: { offset: [-0.58, -0.05], yaw: -0.12, stacked: false, rind: { axis: 'x', sign: -1 } },
  bottomB: { offset: [0.58, 0.05], yaw: 0.15, stacked: false, rind: { axis: 'x', sign: 1 } },
  top: { offset: [0.0, -0.15], yaw: 0.55, stacked: true, rind: { axis: 'z', sign: 1 } },
};

export const createCheese: IngredientBuilder = () => {
  const bodyMat = stdMaterial({ map: bakeTexture(TEX_PX, paintCheese) }); // color=흰색 × map
  const rindMat = stdMaterial({ color: RIND_COLOR });
  const cluster = new THREE.Group();
  const subGroups: Record<string, THREE.Group> = {};

  (Object.keys(CUBES) as (keyof typeof CUBES)[]).forEach((key, cubeIndex) => {
    const def = CUBES[key];
    const sub = new THREE.Group();
    let sideOrder = 0;
    for (const face of FACES) {
      // 옆면은 구멍 타일을 돌려 가며, 윗면·아랫면은 무지 타일(레퍼런스도 윗면엔 구멍이 없다).
      const tile = face.n === 'y' ? PLAIN_TILE : HOLE_TILES[(cubeIndex + sideOrder++) % HOLE_TILES.length][0];
      const parts = buildFace(face, def.rind, tile);
      sub.add(new THREE.Mesh(parts.body, bodyMat));
      if (parts.rind) sub.add(new THREE.Mesh(parts.rind, rindMat));
    }
    sub.rotation.set(0, def.yaw, 0);
    sub.position.set(def.offset[0], 0, def.offset[1]);
    subGroups[key] = sub;
  });

  // 바닥 두 큐브 — 각자 회전 후 bbox 바닥을 world y=0에 맞춘다(types.ts R1, 대부분의 재료와 동일).
  for (const key of ['bottomA', 'bottomB'] as const) {
    const sub = subGroups[key];
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;
    cluster.add(sub);
  }

  // 윗 큐브 — ★이 재료만의 예외: world y=0이 아니라 "바닥 두 큐브의 결합 bbox 위"에 얹는다
  // (진짜 물리적 스택, CRIB의 flat-mound 관례와 다름 — object-sculpt-spec.json risk
  // stack-not-flat-mound 참조). 두 바닥 큐브를 먼저 배치한 뒤 그 Box3.max.y를 측정해서 쓴다.
  const lowerBox = new THREE.Box3();
  lowerBox.union(new THREE.Box3().setFromObject(subGroups.bottomA));
  lowerBox.union(new THREE.Box3().setFromObject(subGroups.bottomB));
  const topSub = subGroups.top;
  topSub.updateMatrixWorld(true);
  const topBoxLocal = new THREE.Box3().setFromObject(topSub);
  topSub.position.y += lowerBox.max.y - topBoxLocal.min.y;
  cluster.add(topSub);

  return mergeByMaterial(cluster);
};
