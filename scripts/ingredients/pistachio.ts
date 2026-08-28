// 피스타치오 — 통 알맹이 3개 + 반으로 쪼개진 알 1개(반쪽 2개). 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/pistachio.json(워크스페이스 원본은
// assets/ingredients/work/pistachio/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// 기술 계보: 알맹이 셸은 olive.ts와 동일한 회전체(buildRevolvedShell) + rotateZ(-90deg) 눕히기
// 패턴(단, 올리브의 비대칭 테이퍼 대신 양끝이 비슷하게 둥근 대칭 프로필).
//
// ═══ v2 (2026-08-26 쇼케이스 수리) — 되돌리지 말 것 ═══════════════════════════════════════
// ★스펙(assets/ingredients/work/pistachio/object-sculpt-spec.json)의 배치와 "홈(자른 면)" 기법은
//   **둘 다 깨져 있다.** 이 파일이 그 스펙보다 앞선다 — 스펙에서 복원하지 마라. 근거 셋:
//
//   (1) 배치 관통. 알 하나는 1.24×0.8인데 옛 오프셋들의 상호 거리가 0.45~0.61이었다. 알을
//       캡슐(축 반길이 0.22 · 반지름 0.4)로 근사해 선분-선분 거리를 재보면 6알 중 **8쌍이
//       기준 0.80을 밑돌고 최악이 0.212**다. 렌더는 주석이 말하는 "느슨한 원형"이 아니라
//       초록 덩어리 하나였다. → 알을 **방사 로제트**(중심에서 바깥으로 뻗는 꽃잎 배치)로 다시
//       깔고, 모든 쌍의 캡슐 거리를 0.80 이상으로 맞췄다(최악 0.822). 개수도 6 → 5로 줄였다
//       (겹침을 없애면 자리를 더 먹으므로, 남는 알을 키우는 게 전체 화면에서 이득 — 64px 게이트의
//       "인스턴스를 줄이고 하나를 키운다"와 같은 방향이다).
//       ⚠ 오프셋을 다시 좁히면 관통이 그대로 돌아온다. 좁히려면 캡슐 거리를 먼저 계산해라.
//
//   (2) 자른 면. 옛 기법은 (링,섹터) 한 줄의 반지름을 42% 당겨 "홈"을 판 것이었는데, 그건
//       평면이 아니라 세로 골이라 아이보리 영역이 **알보다 큰 베이지 돌덩이/찢긴 종이**로 읽혔다.
//       게다가 두 조각이 각각 통 알맹이 크기여서 "쪼개진 알 하나"가 아니라 "홈 파인 알 둘"이었다.
//       → 진짜 평면 절단으로 바꿨다: 눕힌 뒤 y > Y_CUT 인 정점을 전부 Y_CUT으로 눌러 **적도에서
//         자른 실제 반쪽**을 만든다. 눌린 정점 = 마스크 = 아이보리 버킷이라 지오메트리(평평함)과
//         색 경계가 정의상 일치한다. 클램프는 **지터 이전**에 적용한다 — 그래야 마스크가 지터
//         스트림과 무관하게 결정론적이다(CRIB의 "좌표 임계값 금지"는 지터 후 임계값 얘기고,
//         여기서는 평면 절단 자체가 의도라 평면이 곧 정의다).
//
//   (3) 각짐. SEGMENTS 8 · 프로필 6점은 전체 화면에서 대놓고 각졌다. 예산이 100KB/2500tri →
//       250KB/8000tri로 상향됐고(families.mjs) 재료도 빵과 같은 크기로 확대돼 보인다.
//       SEGMENTS 8 → 20, 프로필 6 → 9점.
//
// ═══ v3 (2026-08-28 정체성 수리) — 되돌리지 말 것 ═══════════════════════════════════════
// ★v2의 적도(y) 절단은 평평한 아이보리 "단추" 두 개였다. 피스타치오 정체는 (a) 한 알이 길이
//   방향으로 벌어져 두 엽이 되는 실루엣과 (b) 속 가장자리의 분홍/자줏빛 테두리인데, 둘 다
//   적도 평면 위에 안 실렸다. #8B5D6E는 mesh≤2가 몸통+자른면으로 소진돼 드롭됐었다.
//
//   (1) 절단 축. y-클램프를 z-클램프로 바꾼다 — 장축(X)을 따라 선 타원 단면. 두 반쪽을 속을
//       마주 보게 붙이면 한 알이 벌어지고, 부감에서는 틈이 분홍 테두리 선으로 모든 azimuth에
//       걸린다(호두 v3: 정체성 신호를 축 1개에 묶지 말 것). 반쪽을 로제트 꽃잎으로 떨어뜨리거나
//       y-클램프로 되돌리면 "단추 둘"로 돌아간다.
//
//   (2) 분홍. 두 번째 버킷은 순색 아이보리가 아니라 **아이보리 속 + 모브 테두리 텍스처**.
//       자른 면은 XY라 uvTopPlanar(X,Z)가 퇴화하므로 로컬 uvCutFace(X,Y)로 올린다. 세 번째
//       머티리얼 없이 JSON hex 네 개 중 모브를 회수한다(R3 탈출구).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import {
  bakeTexture,
  buildRevolvedShell,
  facet,
  jitterVertices,
  mergeByMaterial,
  pickTriangles,
  splitTrianglesByVertexMask,
  stdMaterial,
  uvTopPlanar,
} from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/pistachio.json geometry.surface[0] 손 전사 (JSON import 금지,
// types.ts §7). "#6E8A38"(그늘진 아랫면)은 올리브/밤과 같은 이유로 버킷을 안 만든다(볼록 셸의 N·L
// 감쇠가 공짜). "#8B5D6E"(자주빛 속껍질 잔흔)는 v3에서 자른면 텍스처 림으로 회수 — 세 번째
// 머티리얼을 만들지 않는다(types.ts R3).
const BODY_COLOR = 0x8fa84a; // "a soft yellow-green body"
const CUT_IVORY = 0xede4c0; // "a pale ivory groove ... inside the split kernel's cleft"
const CUT_MAUVE = 0x8b5d6e; // "a thin dusty-mauve skin remnant clinging to the edge of the split lobe"

// 실측 비율 (assets/ingredients/src/pistachio.png). 길이:너비 ~1.55:1 — 올리브와 비슷하지만
// 양끝이 비슷하게 둥글다(올리브의 비대칭 뭉툭/뾰족 대신).
const KERNEL_RADIUS = 0.4;
const KERNEL_HALF_LENGTH = 0.62;
const SEGMENTS = 20; // v2: 8 → 20 (전체 화면에서 8각 단면이 그대로 보였다)

type ProfilePoint = readonly [number, number];
// v2: 6 → 9점. 실루엣 계열은 그대로 두고(최대 반지름은 hFrac≈-0.08, 양끝은 둥근 극점) 사이만 채웠다.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.42, -0.86],
  [0.72, -0.64],
  [0.92, -0.36],
  [1.0, -0.08],
  [0.97, 0.22],
  [0.82, 0.52],
  [0.52, 0.8],
  [0.0, 1.0],
];

// v2: 0.014 → 0.012. SEGMENTS를 20으로 올려 한 변이 짧아졌고(R4), 자른 면의 평평함도 지켜야 한다.
const JITTER_AMP = 0.012;

// 자른 면 = **세로** 평면 절단. 눕힌 뒤(장축 로컬 X) z > Z_CUT 인 정점을 Z_CUT으로 누른다.
// v2의 y-클램프는 적도 단추(아이보리 원판이 위를 봄)라 옆·뒤에서 초록 타원만 남았다.
// z-클램프는 장축을 따라 선 타원 단면 → 두 엽을 마주 붙이면 한 알이 길이 방향으로 벌어진다.
// 끝으로 갈수록 링 반지름이 줄어 z가 Z_CUT을 못 넘으므로 틈이 극 앞에서 저절로 닫힌다.
const Z_CUT = 0.02;

// 속면은 거의 수직(+Z). OPEN_TILT는 법선에 +Y를 실어 부감(고도 36°)에서도 속·테두리가
// 면적으로 남게 한다. 0.35는 az 180에서 틈이 실선으로 접혔고, 0.9+는 다시 적도 단추다.
const OPEN_TILT = 0.55;
const PAIR_GAP = 0.3;
// 하네스 기본 카메라 XZ (-1.6, 2.6)에서 23° 빗겨, 틈이 히어로·180 모두에서 대각선으로 길게 읽히게.
const PAIR_YAW = Math.atan2(-1.6, 2.6) + 0.4;

const TEX_SIZE = 64; // ≤256 (R3)
// uvCutFace(X,Y) 정규화 반지름. 바깥 ~38%가 모브 — 옆 테두리와 부감의 틈 윗선이 동시에 읽히게.
const RIM_START = 0.62;

function paintCutTexture(): THREE.CanvasTexture {
  const ivory: [number, number, number] = [(CUT_IVORY >> 16) & 0xff, (CUT_IVORY >> 8) & 0xff, CUT_IVORY & 0xff];
  const mauve: [number, number, number] = [(CUT_MAUVE >> 16) & 0xff, (CUT_MAUVE >> 8) & 0xff, CUT_MAUVE & 0xff];
  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size - 0.5;
        const v = (py + 0.5) / size - 0.5;
        const r = Math.hypot(u, v) * 2;
        const c = r > RIM_START ? mauve : ivory;
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

/** non-indexed 지오메트리에 와인딩 반전 사본을 붙인다. 마주 보는 자른 면은 한 프리미티브로
 * 합치면 안쪽을 향한 얇은 렌즈가 되어 check-winding이 음수 부피로 떨어뜨린다. */
function withBackfaces(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = g.attributes.position.array as Float32Array;
  const triCount = src.length / 9;
  const out = new Float32Array(src.length * 2);
  out.set(src);
  for (let t = 0; t < triCount; t++) {
    const s = t * 9;
    const d = src.length + s;
    out[d] = src[s];
    out[d + 1] = src[s + 1];
    out[d + 2] = src[s + 2];
    out[d + 3] = src[s + 6];
    out[d + 4] = src[s + 7];
    out[d + 5] = src[s + 8];
    out[d + 6] = src[s + 3];
    out[d + 7] = src[s + 4];
    out[d + 8] = src[s + 5];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  geo.computeVertexNormals();
  return geo;
}

/** 세로 자른 면은 XY 평면(z≈상수). uvTopPlanar(X,Z)는 Z 폭이 0이라 퇴화한다(fig uvFrontPlanar). */
function uvCutFace(g: THREE.BufferGeometry): void {
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

/**
 * 알맹이 1개. isSplit=true면 평면 절단을 적용해 { bodyGeo, cutGeo } 둘 다 반환하고,
 * false면 cutGeo는 비운다(통 알맹이는 단일 재질).
 */
function buildKernel(rng: () => number, isSplit: boolean): { bodyGeo: THREE.BufferGeometry; cutGeo: THREE.BufferGeometry | null } {
  const { geometry } = buildRevolvedShell(PROFILE, SEGMENTS, KERNEL_HALF_LENGTH, () => [KERNEL_RADIUS, KERNEL_RADIUS]);

  // 눕히기: rotateZ(-90deg) — olive.ts와 동일 관례. 장축이 로컬 X로, 로컬 Y가 "위"가 된다.
  geometry.rotateZ(-Math.PI / 2);

  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const mask = new Uint8Array(pos.count);
  if (isSplit) {
    // ⚠ 지터 **이전**에 자른다 — 마스크가 rng와 무관해야 색 경계가 결정론적이다.
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) > Z_CUT) {
        pos.setZ(i, Z_CUT);
        mask[i] = 1;
      }
    }
    pos.needsUpdate = true;
  }

  // 지터 — indexed 상태에서(공유 정점이 함께 움직여야 경계가 안 찢어진다, types.ts §5).
  jitterVertices(geometry, rng, JITTER_AMP);
  if (isSplit) {
    // 자른 면은 평면이 정의. 지터가 마스크 정점을 밀어 부호부피가 생기면 와인딩 게이트에 걸린다.
    for (let i = 0; i < pos.count; i++) {
      if (mask[i]) pos.setZ(i, Z_CUT);
    }
    pos.needsUpdate = true;
  }

  if (!isSplit) {
    const baked = facet(geometry);
    uvTopPlanar(baked);
    return { bodyGeo: baked, cutGeo: null };
  }

  // facet 전에 원본 index 보존 — splitTrianglesByVertexMask는 facet() 이전 indexed 배열을 요구한다.
  const originalIndex = (geometry.index as THREE.BufferAttribute).array as ArrayLike<number>;
  const baked = facet(geometry);
  const { trueTris, falseTris } = splitTrianglesByVertexMask(originalIndex, mask);
  const cutGeo = withBackfaces(pickTriangles(baked, trueTris));
  const bodyGeo = pickTriangles(baked, falseTris);
  uvCutFace(cutGeo);
  uvTopPlanar(bodyGeo);
  return { bodyGeo, cutGeo };
}

interface WholeDef {
  /** 로제트 각도(deg) — 중심에서 이 방향으로 밀어낸다. 0deg = +X, 90deg = +Z. */
  deg: number;
  radius: number;
  skew: number;
}

// v3: 통 알만 바깥 고리. 중심 쌍 폭 ≈ 0.4+GAP+0.4 ≈ 1.04, 장축 0.62.
// 캡슐 거리 ≥0.80 → 반지름 1.22 근처.
const WHOLES: readonly WholeDef[] = [
  { deg: 200, radius: 1.22, skew: -0.1 },
  { deg: 320, radius: 1.24, skew: 0.09 },
  { deg: 80, radius: 1.2, skew: 0.14 },
];

export const createPistachio: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  // color=흰색 × map — 텍셀 hex가 그대로 보이게. 런타임 Lambert도 map·color만 승계.
  const cutMat = stdMaterial({ map: paintCutTexture(), color: 0xffffff });

  const cluster = new THREE.Group();

  WHOLES.forEach((def) => {
    const { bodyGeo } = buildKernel(rng, false);
    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(bodyGeo, bodyMat));

    const angle = (def.deg * Math.PI) / 180;
    sub.rotation.set(0, -angle + def.skew, 0);
    sub.position.set(Math.cos(angle) * def.radius, 0, Math.sin(angle) * def.radius);

    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;
    cluster.add(sub);
  });

  // 벌어진 쌍 — 두 반쪽을 한 그룹으로 묶고 bbox를 **한 번만** 그라운딩한다.
  // 반쪽마다 그라운딩하면 V의 의도한 열림이 눌려 다시 적도 단추로 돌아간다(CRIB 힙 규칙).
  const pair = new THREE.Group();
  const halves: readonly { z: number; rotY: number }[] = [
    { z: -PAIR_GAP / 2, rotY: 0 },
    { z: PAIR_GAP / 2, rotY: Math.PI },
  ];
  halves.forEach((h) => {
    const { bodyGeo, cutGeo } = buildKernel(rng, true);
    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(bodyGeo, bodyMat));
    if (cutGeo) sub.add(new THREE.Mesh(cutGeo, cutMat));
    // Euler XYZ: 먼저 속을 +Y로 기울이고, 한쪽은 Y 180으로 마주 보게.
    sub.rotation.set(-OPEN_TILT, h.rotY, 0);
    sub.position.z = h.z;
    pair.add(sub);
  });
  pair.rotation.y = PAIR_YAW;
  cluster.add(pair);
  pair.updateMatrixWorld(true);
  const pairBox = new THREE.Box3().setFromObject(pair);
  pair.position.y -= pairBox.min.y;

  return mergeByMaterial(cluster);
};
