// 메이플 — 단풍잎 모양 슈거 캔디 3개. 계약은 types.ts 주석이 정본. 재료 배치4 2번째.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/maple.json(워크스페이스 원본은
// assets/ingredients/work/maple/). 외곽선·색은 전부 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★이 배치의 유일한 비원형 실루엣 — buildRevolvedShell(원형 회전체 전용) 재사용 불가. 잎 외곽선을
// 직접 손으로 짓는다(cheese.ts처럼 손수 정점/인덱스 배열).
//
// ★★설계 변경 이력 — 3링으로 돌아가지 마라 (v1, 원인 미확정 렌더 결함) ★★
// 레퍼런스(maple.png)는 테두리가 안쪽 평면보다 실제로 솟은 진짜 2단(rim 단차 + 베벨벽) 구조를
// 보여준다 — 처음엔 그렇게 지었다. 그런데 R1-R2(테두리)/R2-R3(베벨)/R3-center(안쪽 팬) 3단 링
// 구조에서, 뾰족점 근처 특정 각도(카메라 방향에 가까운 뾰족점 1개)에 배경색이 그대로 뚫려 보이는
// 결함이 발생했다 — cmp 3회 상한 소진 + DoubleSide/와이어프레임/슬라이스 우회/밴드별 격리 렌더
// 다중 진단으로 각 밴드가 개별로는 전부 올바른 와인딩(외적 전수 검사 통과)과 비퇴화 삼각형
// (면적>0 전수 확인)임을 확인했음에도 원인을 100% 특정하지 못했다
// (risk hairline-seam-root-cause-undetermined). 베벨 단차를 2배로 키워도 안 없어져 "벽이 너무
// 얇아 서브픽셀"이라는 가설도 기각됐다.
// **실용적 해법**: 베벨벽(R2-R3 전이) 자체를 없앤다 — 테두리 상판과 안쪽 평면을 **같은 높이**
// (TOP_Y)에서 만나게 해 문제의 밴드를 아예 제거했다. 색 경계(2 버킷)는 그대로 유지하되, "솟은
// 테두리"라는 3D 단차 연출은 포기한다(risk rim-step-simplified-to-flat).
// CRIB.md「커스텀 프리즘 — 링을 3개 이상 쌓지 마라」가 이 기록에서 나온 규칙이다.
//
// ═══ v3 (2026-08-27 정체 수리) — 되돌리지 말 것 ═══════════════════════════════════════════
// 재감사 판정: **"톱니·꼭지·잎맥 없어 별 쿠키"**. 단풍잎 정체성 3요소가 전부 빠져 있어서
// 5각 별 쿠키로 읽혔다 — 프롬프트 JSON notes_ko가 "단풍잎 실루엣이 정체성의 전부"라고
// 못박아 둔 그 실루엣을 못 낸 것이다. 세 요소를 각각 **다른 축**으로 넣었다(2링 유지):
//
//   1. 톱니 — 외곽 프로필 정점 추가. 링을 늘리지 않고 **같은 2링의 점 수만** 10 -> 50으로 늘린다
//      (TOOTH_TS/TOOTH_DR). 안쪽 링도 같은 비율로 스케일하므로 크림색 테두리 리본이 톱니를
//      따라 돌아 실루엣 단서를 두 번 낸다.
//   2. 잎맥 — v1의 정점 함몰(VEIN_DIP 0.016)은 전체 화면에서 **아예 안 보였다**(두께 0.1 대비
//      16%짜리 골이 페이싯 명암으로 흡수된다). 지오메트리를 파는 대신 R3 탈출구인 ≤256²
//      텍스처로 옮겼다 — 프롬프트 JSON의 잎맥색 #8F6224를 실제로 쓸 수 있고(순색 버킷 2개로는
//      3번째 색을 못 낸다), 정점 함몰이 만들던 저해상도 오목 함몰의 지그재그 위험(CRIB cheese)도
//      같이 사라진다. 함몰을 없앴으니 안쪽 팬은 순수 평면 팬으로 단순화됐다.
//   3. 꼭지(잎자루) — 밑동 골에서 뻗는 가는 프리즘 파트. 별도 mesh가 아니라 몸통 버킷에 병합해
//      mesh≤2 계약을 지킨다. 잎 상·하판과 **같은 평면을 피하려고** Y를 STEM_Y_INSET만큼 안으로
//      집어넣었다(코플래너 z-fighting 방지). 밑동 골(r 0.2)보다 안쪽(0.10)에서 시작해 잎 솔리드에
//      묻히므로 이음매 틈이 원리적으로 없다.
//
// 와인딩: OUTLINE의 각도가 인덱스 증가에 따라 "감소"한다(90->62->34->...). 테두리 상판/안쪽 팬은
// "자연 순서"(외곽->안쪽, center->다음점)가 이미 +Y를 낸다(외적으로 실측), 바닥 팬은 자연 순서가
// 이미 -Y라 그대로 쓴다, 옆벽은 buildRevolvedShell의 검증된 (a0,b0) 링 전이 패턴을 그대로 쓴다
// (바깥 방향 법선 보장, lib.ts 헤더 주석 근거). 톱니는 각도 순서를 안 바꾸고 반지름만 흔들므로
// 이 와인딩 관례가 그대로 유효하다. 꼭지 프리즘만은 손 감기를 안 믿고 **면 법선을 계산해 검산**한다
// (pushQuad) — 위 구멍 버그 이력 때문에 새 커스텀 면에는 검산을 코드에 남긴다.
//
// R4: 지터 전면 생략 — 얇고 뾰족한 5갈래 로브가 이 예산에서 작은 무작위 흔들림도 못 견딘다
// (cheese의 박스 모서리 지터 생략과 같은 예외 부류). 톱니를 넣은 뒤에는 더 그렇다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { bakeTexture, facet, mergeByMaterial, sliceTriangles, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/maple.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const RIM_COLOR = 0xe8c787; // "a light cream edge ... tracing the leaf's thin candy rim"
const BODY_COLOR = 0xb8823a; // "a warm caramel-tan body"
const VEIN_COLOR = 0x8f6224; // "a deeper toffee-brown groove sunk into the leaf's veins" — v3에서 텍스처로 실현
// 드롭: "#D9A85C"(도드라진 면 하이라이트)는 버킷도 텍스처 톤도 안 만든다 — 안쪽 평면 자체의
// 페이싯 N·L 감쇠가 이미 공짜로 만들고, 텍스처에 3번째 톤을 넣으면 64px에서 잎맥선과 섞여
// 얼룩이 된다(64px 판독이 이 자산의 최고 강점이라 지키는 쪽을 골랐다).

// 외곽선 기준점 — 10점(뾰족점 5 + 골 5), 메인 뾰족점(90°) 축에 대해 좌우 대칭. angle은 표준 수학
// 관례(0°=+X, CCW), r은 LEAF_RADIUS 대비 비율. assets/ingredients/src/maple-3.png 탑다운 실측.
interface OutlinePoint {
  readonly angleDeg: number;
  readonly r: number;
  readonly tip: boolean;
}
const BASE_OUTLINE: readonly OutlinePoint[] = [
  { angleDeg: 90, r: 1.0, tip: true }, // 메인 뾰족점
  { angleDeg: 62, r: 0.55, tip: false },
  { angleDeg: 34, r: 0.82, tip: true }, // 오른쪽 위 뾰족점
  { angleDeg: 0, r: 0.42, tip: false },
  { angleDeg: -34, r: 0.58, tip: true }, // 오른쪽 아래(밑동) 뾰족점
  { angleDeg: -90, r: 0.2, tip: false }, // 꼭지 자리 골(가장 깊다 — 바닥 중앙)
  { angleDeg: -146, r: 0.58, tip: true }, // 왼쪽 아래(밑동) 뾰족점
  { angleDeg: -180, r: 0.42, tip: false },
  { angleDeg: -214, r: 0.82, tip: true }, // 왼쪽 위 뾰족점
  { angleDeg: -242, r: 0.55, tip: false },
];

// 톱니 — 기준점 사이 변마다 내부점 4개를 끼워 "돌출-함몰-돌출-함몰"을 만든다(변 10개 × 2톱니 =
// 외곽 20톱니). 각도는 선형 보간만 하고 **반지름만 흔든다** — 각도 단조를 깨지 않아야 위 와인딩
// 관례가 유지된다. 진폭은 r 비율 단위: 0.045 × LEAF_RADIUS = 0.019 world, 톱니 간격(≈0.13 world)의
// 1/7 — 간격보다 작게 잡아야 톱니로 읽히고 안 뭉갠다.
const TOOTH_TS: readonly number[] = [0.2, 0.4, 0.6, 0.8];
const TOOTH_DR: readonly number[] = [0.045, -0.02, 0.045, -0.02];

function buildOutline(): readonly OutlinePoint[] {
  const out: OutlinePoint[] = [];
  for (let i = 0; i < BASE_OUTLINE.length; i++) {
    const a = BASE_OUTLINE[i];
    const b = BASE_OUTLINE[(i + 1) % BASE_OUTLINE.length];
    out.push(a);
    // 각도는 인덱스 증가에 따라 감소하는 게 정본 — 마지막 변(-242 -> 90)에서는 90을 -270으로
    // 접어 단조를 유지한다(안 접으면 그 변만 348° 역주행해 외곽선이 자기를 가로지른다).
    let bAngle = b.angleDeg;
    while (bAngle > a.angleDeg) bAngle -= 360;
    for (let k = 0; k < TOOTH_TS.length; k++) {
      const t = TOOTH_TS[k];
      out.push({
        angleDeg: a.angleDeg + (bAngle - a.angleDeg) * t,
        r: a.r + (b.r - a.r) * t + TOOTH_DR[k],
        tip: false,
      });
    }
  }
  return out;
}
const OUTLINE = buildOutline();
const N = OUTLINE.length; // 50

const LEAF_RADIUS = 0.42;
const TOP_Y = 0.05; // 테두리·안쪽 평면 공통 높이(베벨벽 제거 — 헤더 주석 설계 변경 이력)
const BOTTOM_Y = -0.05;
const INNER_SCALE = 0.78; // 안쪽 링 반지름 = 외곽선 반지름 * 이 값 — 테두리 밴드 폭

// ── 꼭지(잎자루) ────────────────────────────────────────────────────────────────────────
const STEM_ANGLE_DEG = -90; // 밑동 골(가장 깊은 곳)에서 뻗는다 — 실제 단풍잎의 잎자루 위치
const STEM_R_IN = 0.1; // LEAF_RADIUS 비율. 밑동 골(0.2)보다 **안쪽**에서 시작해 잎 솔리드에 묻힌다
const STEM_R_OUT = 0.7; // 길이 = (0.7-0.1)×0.42 = 0.25 world. 더 길게 하면 그룹 bbox가 커져
// 런타임 리핏(최장축 1.6)에서 잎 자체가 작아진다 — 꼭지는 단서이지 주역이 아니다.
const STEM_HALF_W_IN = 0.1; // 폭 0.084 world ≈ 두께 0.1과 같은 자릿수. 더 얇게 하면 칼날 슬리버가 된다
const STEM_HALF_W_OUT = 0.075; // 끝으로 살짝 좁아진다
const STEM_Y_INSET = 0.006; // 잎 상·하판과 **동일 평면 회피** — 코플래너 z-fighting 방지

function outlinePos(p: OutlinePoint, radiusScale: number, y: number): THREE.Vector3 {
  const rad = (p.angleDeg * Math.PI) / 180;
  const r = p.r * LEAF_RADIUS * radiusScale;
  return new THREE.Vector3(Math.cos(rad) * r, y, Math.sin(rad) * r);
}

/**
 * 사각면 1장 — 와인딩을 손으로 세지 않고 **면 법선을 실제로 계산해** outward와 부호가 맞을 때만
 * 그 순서로 넣는다(어긋나면 뒤집어 넣는다). 헤더의 구멍 버그 이력 때문에 새로 추가하는 커스텀
 * 면에는 손 감기 대신 검산을 코드에 남긴다. quad는 반드시 순환 순서(a-b-c-d)로 줄 것.
 */
function pushQuad(
  positions: readonly number[],
  index: number[],
  quad: readonly [number, number, number, number],
  outward: THREE.Vector3,
): void {
  const at = (i: number) => new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  const [a, b, c, d] = quad;
  const n = new THREE.Vector3().subVectors(at(b), at(a)).cross(new THREE.Vector3().subVectors(at(c), at(a)));
  if (n.dot(outward) < 0) {
    index.push(a, c, b);
    index.push(a, d, c);
  } else {
    index.push(a, b, c);
    index.push(a, c, d);
  }
}

/**
 * 캔디 1개 = 손수 지은 인덱스 지오메트리. 빌드 순서:
 *   테두리 상판 밴드(2N tri) -> 옆벽(2N tri)            [테두리 버킷, 연속 구간]
 *   안쪽 평면 팬(N tri) -> 바닥 팬(N tri) -> 꼭지 프리즘(12 tri)  [몸통 버킷, 연속 구간]
 * N=50이므로 100+100+50+50+12 = 312tri. sliceTriangles로 두 구간을 가른다(마스크 아님).
 */
function buildCandy(): { rimGeo: THREE.BufferGeometry; bodyGeo: THREE.BufferGeometry } {
  const positions: number[] = [];
  const index: number[] = [];
  const push = (v: THREE.Vector3) => (positions.push(v.x, v.y, v.z), positions.length / 3 - 1);

  // 링 2개(+바닥 링): R1 바깥(테두리 top), R_INNER 안쪽(테두리 top과 같은 Y — 베벨 없음),
  // R4 바깥-하단(바닥). 3단 링 프리즘으로 되돌리지 말 것(헤더).
  const R1 = OUTLINE.map((p) => push(outlinePos(p, 1, TOP_Y)));
  const R_INNER = OUTLINE.map((p) => push(outlinePos(p, INNER_SCALE, TOP_Y)));
  const R4 = OUTLINE.map((p) => push(outlinePos(p, 1, BOTTOM_Y)));
  const C_TOP = push(new THREE.Vector3(0, TOP_Y, 0));
  const C_BOT = push(new THREE.Vector3(0, BOTTOM_Y, 0));

  // 테두리 상판 밴드(+Y) — "자연" 순서(외곽->안쪽)가 이미 +Y를 낸다(외적 실측).
  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    index.push(R1[i], R1[i1], R_INNER[i1]);
    index.push(R1[i], R_INNER[i1], R_INNER[i]);
  }
  // 옆벽(R1->R4, 바깥 법선) — buildRevolvedShell의 검증된 (a0,b0) 링 전이 패턴 그대로.
  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    index.push(R1[i], R4[i1], R1[i1]);
    index.push(R1[i], R4[i], R4[i1]);
  }
  const rimTriCount = index.length / 3; // 2N

  // 안쪽 평면 팬(+Y, 자연 순서) — v3에서 잎맥 정점 함몰을 텍스처로 옮겨 순수 평면 팬이 됐다.
  for (let i = 0; i < N; i++) {
    index.push(C_TOP, R_INNER[i], R_INNER[(i + 1) % N]);
  }
  // 바닥 팬(-Y, 반전 순서).
  for (let i = 0; i < N; i++) {
    index.push(C_BOT, R4[(i + 1) % N], R4[i]);
  }

  // 꼭지 프리즘 — dir이 뻗는 방향, side가 그 수직(둘 다 XZ 평면). 6면 전부 pushQuad 검산.
  const stemRad = (STEM_ANGLE_DEG * Math.PI) / 180;
  const dir = new THREE.Vector3(Math.cos(stemRad), 0, Math.sin(stemRad));
  const side = new THREE.Vector3(-Math.sin(stemRad), 0, Math.cos(stemRad));
  const stemTop = TOP_Y - STEM_Y_INSET;
  const stemBot = BOTTOM_Y + STEM_Y_INSET;
  const stemVert = (rFrac: number, wFrac: number, sign: number, y: number) =>
    push(
      new THREE.Vector3()
        .addScaledVector(dir, rFrac * LEAF_RADIUS)
        .addScaledVector(side, sign * wFrac * LEAF_RADIUS)
        .setY(y),
    );
  const inTopL = stemVert(STEM_R_IN, STEM_HALF_W_IN, -1, stemTop);
  const inTopR = stemVert(STEM_R_IN, STEM_HALF_W_IN, 1, stemTop);
  const outTopR = stemVert(STEM_R_OUT, STEM_HALF_W_OUT, 1, stemTop);
  const outTopL = stemVert(STEM_R_OUT, STEM_HALF_W_OUT, -1, stemTop);
  const inBotL = stemVert(STEM_R_IN, STEM_HALF_W_IN, -1, stemBot);
  const inBotR = stemVert(STEM_R_IN, STEM_HALF_W_IN, 1, stemBot);
  const outBotR = stemVert(STEM_R_OUT, STEM_HALF_W_OUT, 1, stemBot);
  const outBotL = stemVert(STEM_R_OUT, STEM_HALF_W_OUT, -1, stemBot);
  const UP = new THREE.Vector3(0, 1, 0);
  pushQuad(positions, index, [inTopL, inTopR, outTopR, outTopL], UP);
  pushQuad(positions, index, [inBotL, inBotR, outBotR, outBotL], UP.clone().negate());
  pushQuad(positions, index, [inTopR, outTopR, outBotR, inBotR], side);
  pushQuad(positions, index, [inTopL, outTopL, outBotL, inBotL], side.clone().negate());
  pushQuad(positions, index, [outTopL, outTopR, outBotR, outBotL], dir); // 끝면
  pushQuad(positions, index, [inTopL, inTopR, inBotR, inBotL], dir.clone().negate()); // 밑동(잎 안에 묻힌다)

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  // 지터 없음(R4 예외, 헤더 주석) — indexed에서 바로 facet.
  const baked = facet(geometry);
  const total = baked.attributes.position.count / 3;
  const rimGeo = sliceTriangles(baked, 0, rimTriCount);
  const bodyGeo = sliceTriangles(baked, rimTriCount, total);
  uvTopPlanar(rimGeo); // 테두리 버킷은 순색 — UV는 mergeByMaterial의 attribute 일관성용
  uvLeafLocal(bodyGeo); // 몸통 버킷은 잎맥 텍스처 — 잎 로컬 좌표에 고정해야 잎맥이 뾰족점을 향한다
  return { rimGeo, bodyGeo };
}

// ── 잎맥 텍스처 ────────────────────────────────────────────────────────────────────────
// uvTopPlanar/uvDome은 **지오메트리 bbox**로 정규화하는데, 잎 외곽선은 중심 대칭이 아니라
// (윗 로브 r=1.0 vs 밑동 r=0.58) bbox 중심이 잎 중심과 다르다 — 그 UV를 쓰면 잎맥 6방향이
// 뾰족점에서 어긋난다. 그래서 **LEAF_RADIUS로 직접 정규화하는 잎 로컬 투영**을 쓴다
// (빌더 로컬 헬퍼 — lib.ts는 건드리지 않는다).
const UV_SPAN = LEAF_RADIUS * 2.2; // 톱니가 r=1.045까지 나가고 꼭지가 0.7까지 뻗는다 — 여유 포함
function uvLeafLocal(g: THREE.BufferGeometry): void {
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / UV_SPAN + 0.5;
    uv[i * 2 + 1] = pos.getZ(i) / UV_SPAN + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const TEX_SIZE = 256; // R3 상한. 잎 지름이 텍스처 전폭이라 1px ≈ 0.0036 world — 잎맥선 폭 5px
// 잎맥 방향 — 뾰족점 5개 + 잎자루(-90°). 중앙에서 여섯 갈래로 뻗는 palmate 잎맥이 단풍잎의
// 교과서적 단서다. 뾰족점 각도는 BASE_OUTLINE에서 뽑아 하드코딩을 피한다.
const VEIN_ANGLES_DEG: readonly number[] = [...BASE_OUTLINE.filter((p) => p.tip).map((p) => p.angleDeg), STEM_ANGLE_DEG];
const VEIN_HALF_WIDTH = 0.018; // world. 중심에서 이 폭, 끝으로 갈수록 좁아진다
const VEIN_TAPER = 0.6; // 끝에서 (1-이 값)배 폭

function paintVeinTexture(): THREE.CanvasTexture {
  const body: readonly [number, number, number] = [(BODY_COLOR >> 16) & 0xff, (BODY_COLOR >> 8) & 0xff, BODY_COLOR & 0xff];
  const vein: readonly [number, number, number] = [(VEIN_COLOR >> 16) & 0xff, (VEIN_COLOR >> 8) & 0xff, VEIN_COLOR & 0xff];
  const rays = VEIN_ANGLES_DEG.map((d) => (d * Math.PI) / 180);

  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      // CanvasTexture 기본 flipY=true — 캔버스 맨 윗줄(py=0)이 메시 V=1이다(fig.ts 실측 관례).
      const v = 1 - (py + 0.5) / size;
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size;
        const localX = (u - 0.5) * UV_SPAN;
        const localZ = (v - 0.5) * UV_SPAN;
        const dist = Math.hypot(localX, localZ);
        const theta = Math.atan2(localZ, localX); // uvLeafLocal과 같은 관례(x=cos, z=sin)
        const halfWidth = VEIN_HALF_WIDTH * (1 - VEIN_TAPER * Math.min(1, dist / LEAF_RADIUS));
        let onVein = false;
        for (const phi of rays) {
          // 광선까지의 수직거리 — 반대쪽 반평면(cos<0)은 제외해야 잎맥이 양방향으로 안 뻗는다.
          const d = theta - phi;
          if (Math.cos(d) <= 0) continue;
          if (dist * Math.abs(Math.sin(d)) < halfWidth) {
            onVein = true;
            break;
          }
        }
        const c = onVein ? vein : body;
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

interface CandyDef {
  offset: readonly [number, number]; // world XZ
  yaw: number;
}

// assets/ingredients/work/maple/object-sculpt-spec.json CANDIES 전사. maple-3.png 탑다운 실측 —
// 3개가 밑동에서 느슨하게 겹치는 삼각 배치, front가 뒤 둘 사이에 끼어든다. 전부 평평하게 눕는다
// (rotation은 yaw뿐) — 레퍼런스 자체가 3장 다 평평하고, 고정 3/4 카메라가 원근만으로 두께를 보여준다.
// v3: 꼭지가 붙어 잎마다 한쪽으로 0.25 길어졌다 — 꼭지가 **클러스터 안쪽을 향하면** 그 끝이
// 잎 사이 빈 공간 한복판에 놓여, 밑동이 앞 잎에 가려 "떠 있는 나뭇조각"으로 읽힌다(r1 실측:
// front 잎의 꼭지 끝이 정확히 원점 = 세 잎 사이 구멍에 떨어졌다). yaw는 눈으로 고르지 말고
// **꼭지 끝 좌표를 계산해서** 검산한다: yaw θ에서 꼭지 방향은 (-sinθ, -cosθ), 끝은
// offset + 0.25×그 방향. 세 잎 다 끝이 클러스터 바깥(다른 두 잎 중심에서 0.6 이상)에 있어야 한다.
//   backLeft  θ=1.15  -> 끝 (-0.63, 0.10)  · 다른 두 잎까지 1.01 / 0.72
//   backRight θ=-1.30 -> 끝 ( 0.66, 0.10)  · 1.01 / 0.72
//   front     θ=-0.09 -> 끝 ( 0.05,-0.62)  · 0.91 / 0.84   (r1의 3.05는 끝이 원점이었다)
//
// ★front의 z를 -0.30에서 -0.33으로 밀었다 — 세 잎이 전부 **같은 Y 평면**(TOP_Y)에 눕는데
// -0.30에서는 톱니 끝 한 쌍이 backLeft와 XZ에서 겹쳤다(외곽선 다각형 교차 실측: 교차 4건).
// 코플래너 겹침은 깊이가 같아 z-fighting 후보다 — 렌더에 아직 안 나타났어도 남길 이유가 없다.
// -0.33에서 세 쌍 전부 교차 0이 되고 그룹 z 폭은 1.155 -> 1.185(+2.6%)만 늘어난다.
// 외곽선·톱니·꼭지 수치를 고치면 이 교차 검산을 다시 돌려라.
const CANDIES: Record<'backLeft' | 'backRight' | 'front', CandyDef> = {
  backLeft: { offset: [-0.36, 0.22], yaw: 1.15 },
  backRight: { offset: [0.38, 0.18], yaw: -1.3 },
  front: { offset: [0.02, -0.33], yaw: -0.09 },
};

export const createMaple: IngredientBuilder = () => {
  const rimMat = stdMaterial({ color: RIM_COLOR });
  // 텍스처가 색을 싣는다 — color는 흰색으로 두고 곱셈을 항등으로(lemon.ts 과육 패턴).
  const bodyMat = stdMaterial({ map: paintVeinTexture(), color: 0xffffff });

  const group = new THREE.Group();
  (Object.keys(CANDIES) as (keyof typeof CANDIES)[]).forEach((key) => {
    const def = CANDIES[key];
    const { rimGeo, bodyGeo } = buildCandy();
    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(rimGeo, rimMat));
    sub.add(new THREE.Mesh(bodyGeo, bodyMat));
    sub.rotation.set(0, def.yaw, 0);
    sub.position.set(def.offset[0], 0, def.offset[1]);
    group.add(sub);
  });

  // 공유 지면 y=0 — 프리즘 바닥이 인스턴스마다 이미 BOTTOM_Y로 평평하므로(회전이 yaw뿐이라 바닥이
  // 안 기운다) 올리브식 개별 bbox 스냅이 필요 없다. 그룹 전체를 한 번만 스냅한다(types.ts R1).
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
  group.updateMatrixWorld(true);

  return mergeByMaterial(group);
};
