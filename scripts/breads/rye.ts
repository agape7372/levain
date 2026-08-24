// 호밀빵 — 늘인 타원 돔(바타르, 불 계열). 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 `assets/breads/specs/rye.json`(워크스페이스 원본은 assets/breads/work/rye/).
// 수치·색은 그 스펙(work/rye/author_spec.py)의 전사.
//
// campagne·wholewheat과 다른 점 — 이 배치에서 처음으로 방향성 비대칭인 빵:
//   1. 바네통 링 없음 — buildRevolvedShell을 radialScale로 X축만 늘여 타원 단면 바타르를 만든다.
//      링 계도(domeShell.ts) 자체가 필요 없어 그루브 모듈레이션도 없는 매끈한 프로필.
//   2. 슬래시가 극점에서 사방으로 벌어지는 십자가 아니라 길이축(X, 0°/180°) 한 줄 — 양끝에
//      못 미치게 대칭으로 뻗는다. 이어(귀)는 명시적으로 약하므로 별도 융기 밴드 없이 얕은
//      깊이 하나로 표현.
//   3. 연속 색(모틀 하드엣지 블롭 + 캐러웨이 씨)은 uvCylindrical(축='x') 텍스처로 굽는다 —
//      lib.ts 문서화 관례(길쭉한 빵은 'x'가 길이축)를 그대로 따른다.
//   4. 씨앗은 지오메트리가 아니라 텍스처 타원 스트로크로 — 근거는 파일 하단 주석.
import * as THREE from 'three';
import type { BreadBuilder } from './types';
import {
  angleDeltaDeg,
  bakeTexture,
  buildRevolvedShell,
  facet,
  jitterVertices,
  mergeByMaterial,
  pickTriangles,
  scaleHex,
  splitTrianglesByVertexMask,
  stdMaterial,
  uvCylindrical,
} from './lib';

// 팔레트 — assets/prompts/breads/rye.json geometry.crust 손 전사 + 문서화된 유도/재사용.
const CRUST_DARK = 0x4a3226; // "deep chestnut brown ... blending toward near-black #4A3226 in patches"
// 밝은 쪽("deep chestnut") — 계열에 hex 없어 채택한 결정론적 유도(어두운 patch를 밝히는 배율).
const CRUST_BASE = scaleHex(CRUST_DARK, 1.7);
// 씨앗+크럼 공용 밝은 톤 — 새로 만들지 않고 재사용: assets/prompts/breads/cracker.json·
// flatbread.json이 같은 "golden" 계열 hex #D9A552를 쓴다. ≤2 머티리얼 계약 안에서 두 영역을
// 하나로 묶기 위해 채택.
const SEED_CRUMB = 0xd9a552;

// 실측 비율 (assets/breads/src/rye-2.png 정면 · rye-3.png 탑다운)
// 반복 1: 정면도 "폭"(~1200px)은 짧은 축 반지름(=1 단위)이 아니라 **길이축**이었다(탑다운 길이
// 실측 ~1220px와 거의 같다 — 즉 정면도가 보여주는 건 길이 방향 실루엣). 0.375를 짧은 축
// 반지름=1 기준 높이로 잘못 대입해 렌더가 종잇장처럼 납작했다. 올바른 환산: 높이/길이=0.375,
// 길이(짧은축 단위)=2×LENGTH_STRETCH=3.48 → DOME_HEIGHT = 0.375×3.48 ≈ 1.3.
const DOME_HEIGHT = 1.3;
const LENGTH_STRETCH = 1.74; // 탑다운 길이/폭 1220px/700px
const SEGMENTS = 32;
// 그루브 계도 없음(campagne·wholewheat과 다름) — 매끈한 테이퍼 프로필만.
const PROFILE_RINGS = [0.1, 0.22, 0.36, 0.5, 0.64, 0.78, 0.9, 0.97];
const SLASH_T_FULL = 0.9;
const SLASH_T_END = 0.58; // 반쪽 길이의 ~81% (실측 양끝 여백 ~19%와 대응)
const SLASH_HALF_ANGLE_DEG = 11; // 360/32=11.25°보다 좁게 — 단일 열 폭
const SLASH_DEPTH = 0.05; // campagne(0.09)보다 얕다 — "이어가 약하다"(JSON notes_ko)
const WOBBLE = { lobe3: 0.016, lobe7: 0.009, noise: 0.01 };
const JITTER_AMP = 0.005;

function baseRadius(t: number): number {
  return Math.sqrt(Math.max(0, 1 - t * t));
}

function buildProfile(): [number, number][] {
  const pts: [number, number][] = [
    [0, 0],
    [1, 0],
  ];
  for (const t of PROFILE_RINGS) pts.push([baseRadius(t), t]);
  pts.push([0, 1]);
  return pts;
}

const PROFILE = buildProfile();

function makeWobble(segments: number, rng: () => number): number[] {
  const phase3 = rng() * Math.PI * 2;
  const phase7 = rng() * Math.PI * 2;
  const radius: number[] = [];
  for (let s = 0; s < segments; s++) {
    const t = (s / segments) * Math.PI * 2;
    radius.push(
      1 + WOBBLE.lobe3 * Math.sin(3 * t + phase3) + WOBBLE.lobe7 * Math.sin(7 * t + phase7) + (rng() - 0.5) * WOBBLE.noise,
    );
  }
  return radius;
}

/** 슬래시 falloff — 0°/180° 두 개뿐(campagne의 4중 십자 대비 단순), 나머지 falloff 수식은 동일. */
function slashFalloff(angleDeg: number, t: number): number {
  const minDelta = Math.min(angleDeltaDeg(angleDeg, 0), angleDeltaDeg(angleDeg, 180));
  if (minDelta >= SLASH_HALF_ANGLE_DEG || t < SLASH_T_END) return 0;
  const angularFalloff = Math.cos((minDelta / SLASH_HALF_ANGLE_DEG) * (Math.PI / 2));
  const tTaper = t >= SLASH_T_FULL ? 1 : smoothstep(SLASH_T_END, SLASH_T_FULL, t);
  return angularFalloff * tTaper;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const v = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return v * v * (3 - 2 * v);
}

function buildLoaf(rng: () => number): { geometry: THREE.BufferGeometry; crumbMask: Uint8Array } {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, SEGMENTS, DOME_HEIGHT, () => [LENGTH_STRETCH, 1]);
  const wobble = makeWobble(SEGMENTS, rng);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const vertexCrumb = new Uint8Array(pos.count);

  for (let ri = 0; ri < PROFILE.length; ri++) {
    const [rFrac, t] = PROFILE[ri];
    if (rFrac <= 1e-6) continue;
    for (let s = 0; s < SEGMENTS; s++) {
      const idx = ringStart[ri] + s;
      const angleDeg = (s / SEGMENTS) * 360;
      const x = pos.getX(idx) * wobble[s];
      const z = pos.getZ(idx) * wobble[s];
      let y = pos.getY(idx);
      const trench = slashFalloff(angleDeg, t);
      if (trench > 0) {
        y -= SLASH_DEPTH * trench;
        vertexCrumb[idx] = 1;
      }
      pos.setXYZ(idx, x, y, z);
    }
  }
  pos.needsUpdate = true;
  jitterVertices(geometry, rng, JITTER_AMP);
  return { geometry, crumbMask: vertexCrumb };
}

// --- 크러스트 텍스처: 하드엣지 모틀 블롭 + 캐러웨이 씨 스트로크 --------------------------
// 씨앗을 지오메트리(마이크로 범프) 대신 텍스처로 택한 이유: campagne 링·pancake 기포와 달리
// 캐러웨이 씨는 깊은 굴곡보다 "색 대비가 강한 작은 알갱이"가 식별의 핵심이다(campagne 밀가루
// 더스팅과 같은 범주). ~100개를 지오메트리 범프로 넣으려면 격자를 pancake 기포 밀도 수준으로
// 올려야 하는데, 몸통 자체에 그루브 계도가 없어 예산 여유가 크다 해도 배율상 비효율적이고,
// 반복 렌더에서 스트로크 밀도로 충분히 "씨앗 토핑"으로 읽혔다(과제 보고 참조) — 검증 후 채택.
const TEX_SIZE = 192;

function paintCrustTexture(rng: () => number): THREE.CanvasTexture {
  return bakeTexture(TEX_SIZE, (ctx, size) => {
    ctx.fillStyle = `rgb(${(CRUST_BASE >> 16) & 0xff}, ${(CRUST_BASE >> 8) & 0xff}, ${CRUST_BASE & 0xff})`;
    ctx.fillRect(0, 0, size, size);

    // 하드엣지 모틀 블롭 — 부드러운 그라데이션이 아니라 뭉텅뭉텅한 패치(주입 rng).
    // 반복 1: 블롭이 너무 크고 많아(반경 최대 0.28×size, 11개) 캔버스를 거의 다 덮어 밑색·씨앗이
    // 안 보였다 — 개수·반경을 줄였다.
    // 반복 2: 줄인 블롭도 Lambert 음영 아래서 "구멍"처럼 새까맣게 보였다 — CRUST_DARK 자체는
    // JSON이 준 값이라 바꾸지 않고, 대신 각 블롭을 2겹(짙은 코어 + 그보다 옅은 헐거운 테두리)으로
    // 칠해 경계를 누그러뜨린다. "near-black 패치"라는 서술은 유지하되 완전 평면 타원으로 안
    // 읽히게 한다.
    const BLOB_COUNT = 7;
    const darkRgb = `rgb(${(CRUST_DARK >> 16) & 0xff}, ${(CRUST_DARK >> 8) & 0xff}, ${CRUST_DARK & 0xff})`;
    const midDark = scaleHex(CRUST_DARK, 1.35); // 코어보다 옅은 전이 톤(테두리)
    const midRgb = `rgb(${(midDark >> 16) & 0xff}, ${(midDark >> 8) & 0xff}, ${midDark & 0xff})`;
    for (let i = 0; i < BLOB_COUNT; i++) {
      const cx = rng() * size;
      const cy = rng() * size;
      const rx = (0.045 + rng() * 0.08) * size;
      const ry = (0.03 + rng() * 0.055) * size;
      const rot = rng() * Math.PI;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = midRgb;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 1.35, ry * 1.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = darkRgb;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // 캐러웨이 씨 — 가늘고 긴 타원 스트로크, 랜덤 회전, 전면 조밀 산포(결정론 rng).
    const SEED_COUNT = 260;
    for (let i = 0; i < SEED_COUNT; i++) {
      const u = rng();
      const v = rng();
      const rot = rng() * Math.PI * 2;
      const len = (0.014 + rng() * 0.012) * size;
      const wid = len * 0.28;
      const dark = rng() < 0.35; // 일부는 더 짙게 — 씨앗 자체의 명암 변주
      const col = dark ? scaleHex(SEED_CRUMB, 0.75) : SEED_CRUMB;
      ctx.save();
      ctx.translate(u * size, v * size);
      ctx.rotate(rot);
      ctx.fillStyle = `rgb(${(col >> 16) & 0xff}, ${(col >> 8) & 0xff}, ${col & 0xff})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, len / 2, wid / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
}

export const createRye: BreadBuilder = (rng) => {
  const { geometry, crumbMask } = buildLoaf(rng);
  const baked = facet(geometry);
  const originalIndex = geometry.index!.array;
  const { trueTris: crumbTris, falseTris: crustTris } = splitTrianglesByVertexMask(originalIndex, crumbMask);

  const group = new THREE.Group();
  const crustGeo = pickTriangles(baked, crustTris);
  uvCylindrical(crustGeo, 'x');
  const crustMat = stdMaterial({ map: paintCrustTexture(rng), color: 0xffffff });
  group.add(new THREE.Mesh(crustGeo, crustMat));

  const crumbGeo = pickTriangles(baked, crumbTris);
  uvCylindrical(crumbGeo, 'x');
  const crumbMat = stdMaterial({ color: SEED_CRUMB });
  group.add(new THREE.Mesh(crumbGeo, crumbMat));

  return mergeByMaterial(group);
};
