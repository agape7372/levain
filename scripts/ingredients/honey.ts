// 꿀 — 벌집 블록(육각 셀 격자) + 모서리에 얹힌 꿀 덩이 + 꿀이 찬 셀. 계약은 types.ts 주석이 정본.
//
// ★v4 (2026-08-26 재감사 수리): 지면 퍼들 폐기 → 모서리 덩이 하나. 근거·되돌림 금지 사유는
//   아래 "꿀 덩이" 섹션 머리 주석이 정본이다. **거기부터 읽어라.**
//
// 유래: img2threejs 스펙 assets/ingredients/specs/honey.json(워크스페이스 원본은
// assets/ingredients/work/honey/). 색은 그 스펙(author_spec.py)의 전사다.
// ⚠ 이번 v3 개편은 **레포 코드만** 고쳤다 — 스펙 파일은 이 작업의 쓰기 범위 밖(배정이
// scripts/ingredients/<id>.ts로 한정)이라 "스펙 먼저 고치고 옮긴다"는 원 규칙을 지키지 못했다.
// 다음에 스펙을 만지는 사람이 이 파일을 정본으로 역전사할 것.
//
// ★v3 (2026-08-26, 전체화면 쇼케이스 판독 수리 — identity 배치). 되돌리지 마라.
// 판정: "갈색 벽돌 위 육각 고리 5개와 갈색 돌멩이". 지오메트리는 멀쩡한데 정체가 실패했다.
// v2의 설계 전제 3개가 전부 틀렸다:
//
//  (1) **볼록 벽 + 조명이 셀 바닥을 어둡게 해준다** — 틀렸다. 셀 "바닥"으로 의도한 면이 슬래브
//      윗면, 즉 +Y였다. 하네스 키라이트는 위에서 온다 → 바닥이 벽보다 **더 밝게** 받아 의도가
//      정확히 뒤집혔다. 게다가 세 톤(0xC99A3D/0xA67A28/0x8F5F1D)이 전부 같은 갈색 대역이라
//      무광 Lambert에서 뭉갰다. → v3는 셀을 **진짜로 파고**(바닥을 아래로 내리고 안쪽 벽을
//      세운다), 색은 조명에 맡기지 않고 능선(밝음)/셀 속(어두움)을 알베도로 직접 벌린다.
//
//  (2) **셀은 적고 큼직한 게 64px에서 유리하다** — 판정 기준을 잘못 잡았다. 재료는 빵과 같은
//      쇼케이스에서 같은 크기로 확대돼 보인다. 그리고 **벌집 정체성은 맞닿음(테셀레이션)에 있다**:
//      v2는 셀 간격 0.42 vs 지름 0.38이라 0.04씩 떨어져 있어 "고리 5개"였다. → v3는 육각 격자
//      (지그재그, 이웃 간격 = √3 x 외접반지름)로 **벽을 공유**시킨다. 인접 셀의 바깥벽 쿼드는
//      정확히 겹쳐 등을 맞대므로 양쪽 다 컬링되어 보이지 않는다(무해 — vol.mjs의 outward 비율이
//      이것 때문에 조금 내려가는 건 정상).
//
//  (3) **꿀 덩이는 구형 블롭으로 족하다** — 흘러내림 단서가 0이라 흙덩이/브라우니로 읽혔다.
//      → v3는 모서리 위에 고인 웅덩이에서 바깥 벽을 타고 흘러내려 바닥에 퍼지는 **연속된 흐름**
//      으로 바꾼다. 꿀은 형태로 알아보는 물질이지 색으로 알아보는 물질이 아니다.
//      ⚠ **(3)의 처방은 v4에서 철회됐다** — 진단("덩이만으론 꿀로 안 읽힌다")은 유효한데 처방이
//      틀렸다. 흘러내림을 그리려다 파트가 얇아졌고, **바닥면이 없는 씬에서 얇은 파트는 뜬다.**
//      지금은 다시 덩어리 하나다. 흘러내림 단서는 FILLED_CELLS(꿀이 찬 칸/빈 칸)가 대신 진다.
//      자세한 근거는 아래 "꿀 덩이" 섹션 머리 주석.
//
// 예산: 1728tri / 164.4KB (상한 8000tri / 250KB). v2는 252tri였는데, 그 절약이 바로 위 (2)의
// 오판에서 나온 것이다 — 폴리곤을 아껴 각지게 만들 이유가 이 패밀리엔 없다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { bakeTexture, facet, jitterVertices, mergeByMaterial, scaleHex, stdMaterial } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/honey.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
// (스펙의 "a warm golden amber comb body" #C99A3D는 v2 슬래브 색이었다. v3에선 슬래브라는 파트
//  자체가 사라지고 벌집 벽이 표면 전체를 이루므로 버킷을 안 만든다 — 아래 밝기 비교의 기준선으로만
//  남긴다.)
const SPEC_RECESSED = 0xa67a28; // "darker recessed hexagonal cells"
const SPEC_RIDGE = 0xe0b65c; // 원문의 밝은 능선 하이라이트 — v2는 "런타임 N·L이 공짜로 낸다"며
// 버킷을 안 만들었다. 그게 위 (1)의 실패다: 능선(벽 상단)이 아니라 셀 바닥이 +Y였다.
// v3에서 **능선을 실제 버킷으로 승격**한다 — 벌집 표면의 대부분이 이 색이다.
// a1 실측: SPEC_RIDGE 그대로면 하네스 조명(무광 Lambert + 앰비언트 0.75)에서 갈색 대역으로
// 내려앉아 "밀랍"이 아니라 "흙"에 가까웠다 — 레퍼런스 honey.png는 훨씬 밝은 금색이다. 한 단 올린다(§8).
const COMB_COLOR = scaleHex(SPEC_RIDGE, 1.08);
const CELL_COLOR = scaleHex(SPEC_RECESSED, 0.82); // 유도(§8): 셀이 진짜로 깊어졌으므로 한 단 더 내린다
const HONEY_COLOR = 0xf0972a; // ★스펙 산문("a deeper amber pooled honey blob", #8F5F1D)에서 벗어난다.
// 근거: 팀리드 판정이 "덩이가 꿀이 아니라 흙/브라우니로 보인다 → 슬래브보다 밝은 호박색"으로
// 명시했다. #8F5F1D는 v2 슬래브(#C99A3D)보다 **어두워서** 그 자체가 오독의 원인이었다.
// cinnamon.ts POWDER_COLOR와 같은 선례(관찰이 산문을 이긴다, 2026-08-25 specStr 판정).

// ── 벌집 블록 ────────────────────────────────────────────────────────────────
// 셀 1개 = 닫힌 솔리드: 바깥 프리즘 벽(바닥~상단) + 상단 애뉼러스 + 안쪽 벽(상단~셀 바닥) +
// 셀 바닥 육각 + 블록 바닥 육각. 육각형이 평면을 빈틈없이 덮으므로 블록 바닥도 수밀하다.
const HEX_SEGMENTS = 6;
const CELL_OUTER_R = 0.3; // 외접반지름(정점까지)
const CELL_INNER_R = 0.235; // 벽 두께 0.065 — 이웃과 공유되어 실제 벽은 0.13(셀 폭 0.6의 22%)
const BLOCK_BOTTOM = -0.3;
const CELL_FLOOR = -0.04; // 셀 깊이 0.26 = 셀 폭 대비 43% (레퍼런스 honey.png 실측 비율)
const COMB_TOP = 0.22;

// 지그재그 육각 격자 — 이 육각형은 정점이 ±X에 있으므로(각도 0에서 시작) 이웃 방향은
// 30/90/150/210/270/330도, 이웃 간 거리는 √3·R. 열(X)은 1.5R씩, 행(Z)은 √3R씩 가고
// 홀수 열만 √3R/2 어긋난다. 이 수치를 바꾸면 벽이 다시 떨어져 "고리 모음"으로 돌아간다.
const LATTICE_DX = 1.5 * CELL_OUTER_R;
const LATTICE_DZ = Math.sqrt(3) * CELL_OUTER_R;
const COL_RANGE: readonly number[] = [-3, -2, -1, 0, 1, 2, 3]; // 7열
const ROW_RANGE: readonly number[] = [-2, -1, 0, 1]; // 4행 — 가로:세로 ≈ 1.41 (레퍼런스는 ~1.5)

function cellCenter(i: number, j: number): readonly [number, number] {
  const odd = ((i % 2) + 2) % 2;
  return [i * LATTICE_DX, j * LATTICE_DZ + odd * (LATTICE_DZ / 2) - LATTICE_DZ / 4];
}

// ── 꿀 덩이 ──────────────────────────────────────────────────────────────────
// ★v4 (2026-08-26 재감사 수리). **되돌리지 마라 — 여기가 세 번 틀린 자리다.**
//
// v3까지는 "모서리 셀 브림 → 바깥 벽을 타고 → **지면에 퍼진 웅덩이 원반**"이라는 흐름이었다.
// 재감사 판정은 "떨어져 있다"가 아니라 **"떠 있다"**였다(실루엣 분리섬은 1개 = 한 덩어리인데도).
//   180°: 돔+납작한 타원이 벌집 **왼쪽 바깥 허공**에 통째로 나와 그 아래로 배경이 그대로 비쳤다.
//   270°: 상판 위를 부유하는 **얇은 주황 동전**.
//    90°: 벌집 앞면에 매달린 원통 아래 접시가 달린 **압정/버섯** — 접시 아래는 전부 허공.
//     0°: 그나마 흘러내림으로 읽히지만 퍼들 원반의 바깥 절반은 지지 없이 떴다.
//
// ★근본 원인: **이 씬에는 바닥면이 없다.** 지면 퍼들은 "받쳐주는 지면이 그려져 있다"는 전제를
// 깔고 있는 형태인데, 쇼케이스는 투명 배경 + 3/4 부감이라 지면이 한 번도 그려지지 않는다.
// 그러니 지면 높이에 놓인 납작한 원반은 무엇에도 안 닿은 **판**으로만 보인다. 얇을수록,
// 그리고 블록 실루엣 **밖으로** 나갈수록 더 그렇다 — v3는 둘 다였다(두께 0인 원반이 x=2.10까지).
//
// ★해법 = 레퍼런스(assets/ingredients/src/honey.png)로 되돌아간다. 거기엔 **지면 퍼들이 없다.**
// 뭉친 꿀 덩어리 하나가 벌집 모서리에 얹혀·박혀 있을 뿐이다. 그래서 v4는 흐름·퍼들을 전부 지우고
// 덩어리 하나로 대체한다. 아래 네 조건은 **서로 대체재가 아니라 한 세트**다 — 하나만 풀어도 다시 뜬다:
//   (a) **얇은 파트를 0으로.** 판이 없으면 "뜬 판"이 원천적으로 불가능하다.
//   (b) **중심을 모서리 셀 바깥 면보다 안쪽에.** 코너 셀 (3,1)의 +X+Z 바깥 면에서 0.17 안쪽,
//       반지름은 0.46 — 60%만 밖으로 나온다. 어느 azimuth에서도 실루엣이 블록에 물려 있어
//       덩이와 블록 사이로 배경이 새지 않는다. **밖으로 더 밀지 마라**(v3가 그래서 떴다).
//   (c) **위아래로 블록 두께를 통째로 걸친다** (y = BLOCK_BOTTOM … COMB_TOP+0.03). 위는 모서리 셀
//       림에 물리고 아래는 블록 바닥과 **같은 평면**에서 끝나 접지선을 블록과 공유한다.
//   (d) **바닥을 평평하게 자른다**(마지막 링 = 반지름 0.31 원반 캡). 구를 접점 하나로 세우면
//       "굴러가려는 공"이 된다 — 액체 덩이는 눌린 발이 있어야 놓인 것으로 읽힌다.
//
// ⚠ 색은 레퍼런스를 따라가지 마라. 레퍼런스 덩이는 어두운 갈색(≈#A0692F)인데 그게 바로 v2 판정에서
//   "흙/브라우니"로 읽힌 색이다. **레퍼런스는 형태 정본이지 색 정본이 아니다**(색 정본은 프롬프트 JSON,
//   그리고 여기선 관찰이 이긴 HONEY_COLOR). 아래 HONEY_COLOR 주석 참조.
//
// 과거 시도 요약(같은 실패를 다시 밟지 않도록 보존):
//   a1 가느다란 기둥 → az=90에서 "앞에 따로 선 주황색 마개", az=270에선 뒤편의 점.
//   a2 상판 위 넓은 타원 한 장 → 벌집 위에 **얹힌 팬케이크/노른자**.
//   a3 잘록한 허리 → 넓은 머리·좁은 허리·넓은 발 = **버섯/성배** 실루엣.
//   a4 벽을 타고 내려가 지면에 퍼진 웅덩이 → 이번에 파손 판정된 형태(위 참조).
//   공통 교훈: 액체를 **흐름의 궤적**으로 그리려 할수록 얇아지고, 얇아지면 지면 없는 씬에서 뜬다.
const BLOB_SEGMENTS = 24; // 레퍼런스 덩이도 저폴리 각짐이라 24면 스타일상 맞다(facet로 플랫 노멀)
const BLOB_TOP_RISE = 0.08; // 꼭짓점 y = 0.20+0.08 = 0.28 = COMB_TOP(0.22) 위 0.06.
// ★a1 실측 후 상향(0.05→0.08 + 상단 링 비대): 머리가 림보다 겨우 0.03 높으면 az=225/270처럼
// 덩이가 **블록 뒤로 가는 각도**에서 상판 너머로 거의 안 보여 꿀 덩이가 실종된다. 배는 그대로 두고
// 머리만 키우는 게 정답이다 — 배를 키우면 옆으로·아래로 더 나가서 (b) 조건이 약해진다.
const BLOB_JITTER_AMP = 0.006; // types.ts R2: 극 팬 뒤집힘 방지. 상단 링 컬럼 간격 ≈ π·0.28/24 = 0.037
// → 진폭 0.006은 그 6분의 1. 세그먼트를 올리면 이 값도 같이 내려라.
interface BlobRing {
  readonly y: number;
  readonly cx: number;
  readonly cz: number;
  readonly rx: number;
  readonly rz: number;
}
// 링 테이블 = 위 (b)(c)(d)의 수치 구현. 마지막 링의 y는 BLOCK_BOTTOM과 **같아야 한다** —
// 더 내려가면 접지 스냅(group.position.y = -box.min.y)이 꿀을 기준으로 잡혀 벌집이 공중에 뜨고,
// 덜 내려가면 덩이가 블록 바닥선 위에서 끝나 그 자체가 뜬 것으로 읽힌다.
// cx/cz가 아래로 갈수록 아주 조금씩 커지는 건 흘러내려 주저앉은 기울기다(0.07 이내 — 더 주면
// 위가 벽에서 떨어진다).
// ⚠ 상단 링 반지름의 상한은 **이웃 셀 침범**이 정한다. 덩이 중심 (1.40, 0.69)에서 이웃 셀
// (2,1)·(3,0) 안쪽 공동까지가 0.36/0.33이라, 액면(FILLED_CELLS 0.17)과 같은 높이에서 반지름이
// 그보다 커지면 이웃 칸의 육각 액면과 껍질이 같은 높이에서 만나 z-파이팅 후보가 된다.
// 지금 y=0.17 환산 반지름은 ≈0.32 — 아슬하게 아래다. 상단 링을 더 벌리려면 FILLED_CELLS의
// (2,1)·(3,0) 액면부터 내려라.
const BLOB_RINGS: readonly BlobRing[] = [
  { y: 0.2, cx: 1.4, cz: 0.69, rx: 0.28, rz: 0.27 }, // 코너 셀 림 위로 부풀어 넘친 머리
  { y: 0.1, cx: 1.41, cz: 0.695, rx: 0.4, rz: 0.38 },
  { y: 0.0, cx: 1.43, cz: 0.705, rx: 0.45, rz: 0.43 },
  { y: -0.1, cx: 1.45, cz: 0.715, rx: 0.47, rz: 0.45 }, // 최대 배 — 블록 바깥 면 밖으로 0.30
  { y: -0.19, cx: 1.46, cz: 0.72, rx: 0.45, rz: 0.43 },
  { y: -0.26, cx: 1.47, cz: 0.725, rx: 0.39, rz: 0.37 },
  { y: BLOCK_BOTTOM, cx: 1.47, cz: 0.725, rx: 0.31, rz: 0.3 }, // 눌린 발 — 블록과 같은 접지 평면
];

// 꿀이 찬 셀 — [열, 행, 액면 y]. 모서리(3,1)가 브림까지 차고 안쪽으로 갈수록 낮아진다.
// 액면은 육각 디스크 1장(6tri)이면 충분하다: 그 위쪽 안쪽 벽은 어두운 채로 남아 "덜 찬 칸"의
// 깊이 단서가 되고, 아래는 어차피 안 보인다.
const FILL_INSET = 0.004; // 안쪽 벽과 겹쳐 z-파이팅 나지 않게 살짝 안으로
const FILLED_CELLS: readonly (readonly [number, number, number])[] = [
  [3, 1, COMB_TOP - 0.01],
  [2, 1, COMB_TOP - 0.05],
  [3, 0, COMB_TOP - 0.05],
  [2, 0, COMB_TOP - 0.11],
  [1, 1, COMB_TOP - 0.11],
  [3, -1, COMB_TOP - 0.12],
  [1, 0, COMB_TOP - 0.17],
  [2, -1, COMB_TOP - 0.18],
];

// ── 아틀라스 텍스처 ───────────────────────────────────────────────────────────
// mesh<=2 상한에서 색이 3개다(능선·셀 속·꿀). 능선은 순색 버킷을 쓰고, 나머지 둘은 한 장의
// 아틀라스에 순색 패치로 싣고 **상수 UV**로 한 점씩 찍는다(투영 UV가 없으니 늘림 결함 불가).
// flipY=true(CanvasTexture 기본) — 캔버스 위쪽(작은 py)이 메시 V=1 근처다.
const TEX_SIZE = 32;
const CELL_UV: readonly [number, number] = [0.75, 0.25]; // 캔버스 우하단 = 셀 속
const HONEY_UV: readonly [number, number] = [0.25, 0.75]; // 캔버스 좌상단 = 꿀

function hexToRgb(hex: number): string {
  return `rgb(${(hex >> 16) & 0xff}, ${(hex >> 8) & 0xff}, ${hex & 0xff})`;
}

function bakeAtlasTexture(): THREE.CanvasTexture {
  return bakeTexture(TEX_SIZE, (ctx, size) => {
    ctx.fillStyle = hexToRgb(CELL_COLOR);
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = hexToRgb(HONEY_COLOR);
    ctx.fillRect(0, 0, size / 2, size / 2);
  });
}

/** 지오메트리 전체에 한 점짜리 UV를 박는다(아틀라스 패치 고정). 순색 버킷에도 붙인다 —
 * mergeByMaterial의 attribute 일관성 조건(types.ts §4). */
function setConstantUv(g: THREE.BufferGeometry, uv: readonly [number, number]): void {
  const count = g.attributes.position.count;
  const arr = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    arr[i * 2] = uv[0];
    arr[i * 2 + 1] = uv[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
}

function hexRingPositions(cx: number, cz: number, radius: number, y: number, out: number[]): number[] {
  const idx: number[] = [];
  for (let k = 0; k < HEX_SEGMENTS; k++) {
    const t = (k / HEX_SEGMENTS) * Math.PI * 2;
    idx.push(out.length / 3);
    out.push(cx + Math.cos(t) * radius, y, cz + Math.sin(t) * radius);
  }
  return idx;
}

/**
 * 셀 1개의 지오메트리 — 밝은 파트(바깥벽·상단 애뉼러스·블록 바닥)와 어두운 파트(안쪽 벽·셀 바닥)를
 * 따로 반환한다. 와인딩은 전부 외적으로 검산했다(아래 각 주석). 관례: 각도 t가 증가하는 순서로
 * 감으면 (center, v_k, v_k1)의 법선은 **-Y**다.
 */
function buildCell(cx: number, cz: number): { comb: THREE.BufferGeometry; cavity: THREE.BufferGeometry } {
  // ── 밝은 파트
  const combPos: number[] = [];
  const outTop = hexRingPositions(cx, cz, CELL_OUTER_R, COMB_TOP, combPos);
  const inTop = hexRingPositions(cx, cz, CELL_INNER_R, COMB_TOP, combPos);
  const outBot = hexRingPositions(cx, cz, CELL_OUTER_R, BLOCK_BOTTOM, combPos);
  const botCenter = combPos.length / 3;
  combPos.push(cx, BLOCK_BOTTOM, cz);

  const combIdx: number[] = [];
  for (let k = 0; k < HEX_SEGMENTS; k++) {
    const k1 = (k + 1) % HEX_SEGMENTS;
    // 상단 애뉼러스 (+Y): 검산 (u x v)_y = (r-R)·r·sin(t_k - t_k1) > 0
    combIdx.push(outTop[k], inTop[k], inTop[k1]);
    combIdx.push(outTop[k], inTop[k1], outTop[k1]);
    // 바깥 벽 (바깥 방향): 검산 dot(n, 면 중점의 반지름 방향) = R²·d·sin(t_k1 - t_k) > 0
    combIdx.push(outTop[k], outBot[k1], outBot[k]);
    combIdx.push(outTop[k], outTop[k1], outBot[k1]);
    // 블록 바닥 (-Y)
    combIdx.push(botCenter, outBot[k], outBot[k1]);
  }
  const combGeo = new THREE.BufferGeometry();
  combGeo.setAttribute('position', new THREE.Float32BufferAttribute(combPos, 3));
  combGeo.setIndex(combIdx);

  // ── 어두운 파트 (셀 속). 안쪽 벽은 바깥 벽의 **반대 와인딩** — 셀은 공동이라 보이는 면이
  // 축을 향한다.
  const cavPos: number[] = [];
  const cTop = hexRingPositions(cx, cz, CELL_INNER_R, COMB_TOP, cavPos);
  const cBot = hexRingPositions(cx, cz, CELL_INNER_R, CELL_FLOOR, cavPos);
  const floorCenter = cavPos.length / 3;
  cavPos.push(cx, CELL_FLOOR, cz);

  const cavIdx: number[] = [];
  for (let k = 0; k < HEX_SEGMENTS; k++) {
    const k1 = (k + 1) % HEX_SEGMENTS;
    cavIdx.push(cTop[k], cBot[k], cBot[k1]);
    cavIdx.push(cTop[k], cBot[k1], cTop[k1]);
    cavIdx.push(floorCenter, cBot[k1], cBot[k]); // 셀 바닥 (+Y — 위를 보게)
  }
  const cavGeo = new THREE.BufferGeometry();
  cavGeo.setAttribute('position', new THREE.Float32BufferAttribute(cavPos, 3));
  cavGeo.setIndex(cavIdx);

  // 지터 없음 — 육각 벽은 각지고 매끈한 인공 구조물이라 유기적 노이즈가 정체성을 흐린다
  // (레퍼런스도 벽면이 완전히 매끈하다). facet만 걸어 플랫 노멀을 굽는다.
  return { comb: facet(combGeo), cavity: facet(cavGeo) };
}

/** 셀 하나의 꿀 액면 — 육각 디스크(+Y). (center, v_k1, v_k) 순서가 위를 본다. */
function buildFillSurface(cx: number, cz: number, level: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const ring = hexRingPositions(cx, cz, CELL_INNER_R - FILL_INSET, level, positions);
  const center = positions.length / 3;
  positions.push(cx, level, cz);
  const index: number[] = [];
  for (let k = 0; k < HEX_SEGMENTS; k++) index.push(center, ring[(k + 1) % HEX_SEGMENTS], ring[k]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return facet(geometry);
}

/**
 * 꿀 덩이 — 수평 타원 링을 잇는 튜브 + 위 팬 캡(뾰족) + 아래 평평한 원반 캡.
 * 와인딩은 셀 바깥벽과 같은 관례이고 외적으로 검산했다:
 *   측벽 (a_s, b_s1, b_s) → n·radial = r·sinΔ·… > 0 (바깥)
 *   위 캡 (topPole, ring_s1, ring_s) → n_y > 0
 *   아래 캡 (botPole, ring_s, ring_s1) → n_y < 0  (botPole의 y가 마지막 링과 같아 평면 원반이 된다)
 * ⚠ 아래 캡은 블록 바닥 육각들과 같은 평면(y=BLOCK_BOTTOM)에 −Y로 놓이지만 z-파이팅 걱정은 없다:
 *   서로 겹치는 영역이 없고(둘 다 −Y 향 FrontSide), 3/4 부감 카메라는 이 평면 아래로 내려가지 않는다.
 */
function buildBlob(rng: () => number): THREE.BufferGeometry {
  const positions: number[] = [];
  const ringStart: number[] = [];
  for (const r of BLOB_RINGS) {
    ringStart.push(positions.length / 3);
    for (let s = 0; s < BLOB_SEGMENTS; s++) {
      const t = (s / BLOB_SEGMENTS) * Math.PI * 2;
      positions.push(r.cx + Math.cos(t) * r.rx, r.y, r.cz + Math.sin(t) * r.rz);
    }
  }
  const first = BLOB_RINGS[0];
  const last = BLOB_RINGS[BLOB_RINGS.length - 1];
  const topPole = positions.length / 3;
  positions.push(first.cx, first.y + BLOB_TOP_RISE, first.cz);
  const botPole = positions.length / 3;
  positions.push(last.cx, last.y, last.cz);

  const index: number[] = [];
  for (let ri = 0; ri < BLOB_RINGS.length - 1; ri++) {
    const a0 = ringStart[ri];
    const b0 = ringStart[ri + 1];
    for (let s = 0; s < BLOB_SEGMENTS; s++) {
      const s1 = (s + 1) % BLOB_SEGMENTS;
      index.push(a0 + s, b0 + s1, b0 + s);
      index.push(a0 + s, a0 + s1, b0 + s1);
    }
  }
  const lastStart = ringStart[BLOB_RINGS.length - 1];
  for (let s = 0; s < BLOB_SEGMENTS; s++) {
    const s1 = (s + 1) % BLOB_SEGMENTS;
    index.push(topPole, ringStart[0] + s1, ringStart[0] + s); // 위 캡 (+Y)
    index.push(botPole, lastStart + s, lastStart + s1); // 아래 캡 (-Y, 평면 원반)
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  jitterVertices(geometry, rng, BLOB_JITTER_AMP); // indexed 상태에서 — 이음매가 안 찢어진다(§5)
  return facet(geometry);
}

// 벌집은 전부 결정론 기하(rng 미사용)이고 꿀 덩이만 jitterVertices에 rng를 쓴다 —
// IngredientBuilder 계약대로 인자 rng를 받아 덩이에만 넘긴다.
export const createHoney: IngredientBuilder = (rng) => {
  const combMat = stdMaterial({ color: COMB_COLOR });
  const atlasMat = stdMaterial({ map: bakeAtlasTexture(), color: 0xffffff });

  const group = new THREE.Group();
  for (const i of COL_RANGE) {
    for (const j of ROW_RANGE) {
      const [cx, cz] = cellCenter(i, j);
      const { comb, cavity } = buildCell(cx, cz);
      setConstantUv(comb, CELL_UV); // 순색 버킷 — 패치는 아무거나(attribute 일관성용)
      setConstantUv(cavity, CELL_UV);
      group.add(new THREE.Mesh(comb, combMat));
      group.add(new THREE.Mesh(cavity, atlasMat));
    }
  }
  for (const [i, j, level] of FILLED_CELLS) {
    const [cx, cz] = cellCenter(i, j);
    const fill = buildFillSurface(cx, cz, level);
    setConstantUv(fill, HONEY_UV);
    group.add(new THREE.Mesh(fill, atlasMat));
  }
  const blob = buildBlob(rng);
  setConstantUv(blob, HONEY_UV);
  group.add(new THREE.Mesh(blob, atlasMat));

  // 공유 지면 y=0 + XZ 중심 정렬 — 덩이가 +X·+Z로 튀어나와 있어 정렬을 안 하면 쇼케이스 리핏이
  // 피사체를 한쪽으로 밀어낸다(types.ts R1 / §6).
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.set(-center.x, -box.min.y, -center.z);
  group.updateMatrixWorld(true);

  return mergeByMaterial(group);
};
