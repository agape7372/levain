// 깜빠뉴 — 단일 연속 돔(불 계열). 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 `assets/breads/specs/campagne.json`(워크스페이스 원본은
// assets/breads/work/campagne/). 수치·색은 그 스펙(work/campagne/author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// pancake.ts와 다른 점 셋:
//   1. 바네통 나선 링은 섹터 무관 축대칭 함몰이라 프로필 자체에 굽는다(lib.ts buildRevolvedShell) —
//      pancake의 기포처럼 섹터 격자가 필요 없다. 링 함몰 = pancake 기포 수학의 "위도판".
//   2. 십자 슬래시는 4극 대칭 각도 기반 falloff(섹터 인덱스가 아니라 연속 각도차)로 얹는다 —
//      각 아치의 폭이 중심에서 넓고 끝으로 갈수록 좁아지는 실제 칼집 모양과 자연히 맞아떨어진다.
//   3. 연속 변화(그라데이션·밀가루 더스팅)는 지오메트리가 아니라 uvDome 텍스처로 굽는다 — 불연속
//      크러스트/크럼 경계만 머티리얼 분리(≤2, types.ts §1)로 낸다. 텍스처는 링 위상 함수를
//      지오메트리 그루브와 공유해 밝은 더스팅이 실제 융기 위에 오도록 상관시킨다.
import * as THREE from 'three';
import type { BreadBuilder } from './types';
import {
  angleDeltaDeg,
  bakeTexture,
  facet,
  jitterVertices,
  mergeByMaterial,
  pickTriangles,
  scaleHex,
  splitTrianglesByVertexMask,
  stdMaterial,
  uvDome,
} from './lib';
import { buildGroovedDomeShell, ringPhase as domeRingPhase, type DomeShellSpec } from './domeShell';

// 팔레트 — assets/prompts/breads/campagne.json geometry.crust 손 전사 + 문서화된 유도.
// 밝은 끝은 JSON 그대로. 어두운 끝은 JSON에 hex가 없어("darker brown blend"만 서술) 고정 배율
// 0.62로 어둡힌 결정론적 유도값(픽셀 샘플링 금지, types.ts §8) — wholewheat 크러스트(#8C5A32,
// campagne 대비 약 0.8배)보다는 확실히 어둡게 잡아 두 빵의 최암부가 서로 안 겹치게 했다.
const CRUST_LIGHT = 0xa9713f; // "#A9713F to a darker brown blend across the dome"
// 반복 2에서 0.62는 그루브 없는 구간(ridge=0.5 기본값)과 겹쳐 돔 하단이 지나치게 어두웠다.
// 0.70으로도 wholewheat 크러스트(#8C5A32=140,90,50)보다 채널별로 확실히 어둡다(118<140·79<90·44<50).
const CRUST_DARK = scaleHex(CRUST_LIGHT, 0.7);
// 밀가루 더스팅 — 계열 전체에 hex가 없어 채택한 일반 옅은 밀색.
const FLOUR = 0xefe7d2;
// 크럼(슬래시 단면) — 새로 만들지 않고 재사용: assets/prompts/breads/baguette.json이 같은
// 개념(슬래시에서 드러나는 속살)에 "cream-colored crumb #F4EAD4"를 명시한다. 계열 공용 상수로 채택.
const CRUMB = 0xf4ead4;

// 실측 비율 (assets/breads/src/campagne-2.png 정면 · campagne-3.png 탑다운)
const DOME_HEIGHT = 0.76; // 높이/지름 0.379 (실측 440px/1160px)
// 8의 배수 — 슬래시 45°/135°가 섹터 경계에 정확히 떨어진다(45/(360/32)=4, 135/(360/32)=12).
// 24에서 32로 올림(반복 1): halfAngle이 15°(24섹터 간격)보다 좁으면 크럼 기둥 바로 옆에
// "이어(귀)" 전용 열을 하나도 못 만든다 — 32섹터(11.25° 간격)라야 크럼 열 옆에 이어 열이 산다.
const SEGMENTS = 32;
const GROOVE_COUNT = 8;
// tFrac 범위(**t=0이 밑변, t=1이 꼭짓점** — buildDomeProfile 참조). ρ=baseRadius(t)는
// t=0 부근에서 기울기가 완만해(dρ/dt→0) 얕은 t 구간이 3/4 카메라의 옆면 시야각에서는 넓은
// 면적을 차지한다 — 반복 2에서 [0.53,0.96]으로 좁혔더니 옆면 하단이 통짜 민무늬로 보였다.
// 바네통 자국은 실제로 접촉면 전체(거의 밑변까지)에 남으므로 구간을 거의 전체로 넓힌다.
const GROOVE_ZONE: readonly [number, number] = [0.08, 0.97];
const GROOVE_HALF_WIDTH_T = 0.014;
const GROOVE_DEPTH = 0.03;
const SLASH_ANGLES_DEG = [45, 135, 225, 315] as const;
// 슬래시는 꼭짓점(t=1) 근방에서 전체 깊이, t=SLASH_T_FULL부터 SLASH_T_END까지 스무스스텝으로
// 0에 수렴 — 반복 1은 "t > SLASH_T_END면 0"으로 방향이 뒤집혀 슬래시가 밑변 전체를 덮었다.
// SLASH_T_END=0.6은 실측 반지름비 0.75~0.8을 ρ=baseRadius(t) 역산한 값(t=sqrt(1-0.775²)≈0.63).
const SLASH_T_FULL = 0.92;
const SLASH_T_END = 0.6;
// 32섹터(11.25° 간격) 기준: halfAngle=12°→이웃 열(11.25°)까지 포함, 다음 열(22.5°)은 제외 —
// 크럼 열 하나 + 양옆 이어 열 하나씩, 총 3열 폭. 9°/22.5°였던 반복 1은 24섹터(15° 간격)에서
// 이웃 열이 전부 걸러져 크럼과 이어가 같은 열로 겹쳐버렸다.
const SLASH_HALF_ANGLE_DEG = 12;
const SLASH_CRUMB_HALF_ANGLE_DEG = 5;
const SLASH_DEPTH = 0.09;
const EAR_HEIGHT = 0.02;
const WOBBLE = { lobe3: 0.02, lobe7: 0.012, noise: 0.012 };
const JITTER_AMP = 0.006;

// domeShell.ts와 공유하는 돔 스펙 — wholewheat.ts도 같은 셸 골격을 이 형태로 구성한다(팀 지시:
// campagne·wholewheat은 같은 실루엣 계열이므로 빌더 골격을 공유).
const DOME_SPEC: DomeShellSpec = {
  domeHeight: DOME_HEIGHT,
  segments: SEGMENTS,
  grooveCount: GROOVE_COUNT,
  grooveZone: GROOVE_ZONE,
  grooveHalfWidthT: GROOVE_HALF_WIDTH_T,
  grooveDepth: GROOVE_DEPTH,
  wobble: WOBBLE,
};

/**
 * 슬래시 falloff — 각도차(연속) × t 테이퍼. t=1(꼭짓점) 근방은 온전한 깊이, SLASH_T_FULL부터
 * SLASH_T_END로 내려가며(밑변 쪽으로) 스무스스텝으로 0에 수렴. SLASH_T_END 아래는 완전히 무효과.
 */
function slashFalloff(angleDeg: number, t: number, halfAngle: number): number {
  let minDelta = 999;
  for (const a of SLASH_ANGLES_DEG) minDelta = Math.min(minDelta, angleDeltaDeg(angleDeg, a));
  if (minDelta >= halfAngle || t < SLASH_T_END) return 0;
  const angularFalloff = Math.cos((minDelta / halfAngle) * (Math.PI / 2)); // 1 at center, 0 at edge
  const tTaper = t >= SLASH_T_FULL ? 1 : smoothstep(SLASH_T_END, SLASH_T_FULL, t);
  return angularFalloff * tTaper;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const v = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return v * v * (3 - 2 * v);
}

/**
 * 돔 1개를 indexed 지오메트리 하나로 짓는다. domeShell.buildGroovedDomeShell이 그루브+워블까지
 * 얹은 셸을 내주면, 그 위에 슬래시/이어 변위와 크럼 분류(mask)를 같은 (ring, sector) 순회로
 * 더한다 — ringStart 인덱스가 셸 반환값과 정확히 맞는다.
 */
function buildDome(rng: () => number): { geometry: THREE.BufferGeometry; crumbMask: Uint8Array } {
  const { geometry, ringStart, profile } = buildGroovedDomeShell(DOME_SPEC, rng);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  // 정점별 크럼 여부 — 슬래시 falloff가 SLASH_CRUMB_HALF_ANGLE_DEG 안에 있으면 크럼(속살),
  // 그 밖은 크러스트(벽면도 크러스트색 — 실제로 벽이 아직 탄 크러스트이기 때문).
  const vertexCrumb = new Uint8Array(pos.count);

  for (let ri = 0; ri < profile.length; ri++) {
    const [rFrac, t] = profile[ri];
    if (rFrac <= 1e-6) continue; // 극점은 셰이딩 상 의미 없음(모든 섹터 공유)
    for (let s = 0; s < SEGMENTS; s++) {
      const idx = ringStart[ri] + s;
      const angleDeg = (s / SEGMENTS) * 360;
      let y = pos.getY(idx);

      const trench = slashFalloff(angleDeg, t, SLASH_HALF_ANGLE_DEG);
      if (trench > 0) {
        const crumbFalloff = slashFalloff(angleDeg, t, SLASH_CRUMB_HALF_ANGLE_DEG);
        if (crumbFalloff > 0) {
          y -= SLASH_DEPTH * crumbFalloff;
          vertexCrumb[idx] = 1;
        } else {
          // 크럼 폭 밖 ~ halfAngle 안 = 이어(귀) 융기 밴드
          y -= SLASH_DEPTH * trench * 0.3; // 벽면도 살짝 패여야 트렌치 단면이 매끈하다
          y += EAR_HEIGHT * (trench - crumbFalloff);
        }
      }
      pos.setY(idx, y);
    }
  }
  pos.needsUpdate = true;
  jitterVertices(geometry, rng, JITTER_AMP);
  return { geometry, crumbMask: vertexCrumb };
}

// --- 크러스트 텍스처: 그라데이션 + 밀가루 더스팅, 지오메트리 그루브와 위상 공유 ------------
// bakeTexture는 브라우저 canvas API가 필요 — scripts/export-breads.mjs가 puppeteer(실 Chromium)로
// 돌기 때문에 안전하다(node 단독 실행이면 throw, 하네스가 항상 브라우저 경유이므로 여기선 무해).
// 반복 2 실측: 32섹터·1920tri에 256px 텍스처를 더하면 GLB가 217KB로 CRIB 목표(200KB)를 넘었다.
// 밴드+점묘뿐인 단순 이미지라 160px로도 시각 손실 없이 GLB를 줄일 수 있다.
const TEX_SIZE = 160;

function paintCrustTexture(rng: () => number): THREE.CanvasTexture {
  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    const dark: [number, number, number] = [(CRUST_DARK >> 16) & 0xff, (CRUST_DARK >> 8) & 0xff, CRUST_DARK & 0xff];
    const mid: [number, number, number] = [
      Math.round((((CRUST_DARK >> 16) & 0xff) + ((CRUST_LIGHT >> 16) & 0xff)) / 2),
      Math.round((((CRUST_DARK >> 8) & 0xff) + ((CRUST_LIGHT >> 8) & 0xff)) / 2),
      Math.round(((CRUST_DARK & 0xff) + (CRUST_LIGHT & 0xff)) / 2),
    ];
    const light: [number, number, number] = [(CRUST_LIGHT >> 16) & 0xff, (CRUST_LIGHT >> 8) & 0xff, CRUST_LIGHT & 0xff];
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size;
        const v = (py + 0.5) / size;
        const dx = u - 0.5;
        const dy = v - 0.5;
        const cr = Math.min(1, Math.hypot(dx, dy) * 2); // uvDome 정규화 반지름, 0=꼭짓점 1=밑변
        const t = Math.sqrt(Math.max(0, 1 - cr * cr)); // r(t)=sqrt(1-t²)의 자기역함수 성질로 t 근사(t=1 꼭짓점)
        const ridge = t >= GROOVE_ZONE[0] && t <= GROOVE_ZONE[1] ? domeRingPhase(t, DOME_SPEC) : 0.5;
        // 2~3단 톤 밴드 — 사진적 연속 그라데이션 금지(CRIB): score를 3구간으로 양자화한다.
        // t(꼭짓점=1)가 클수록 밝게 — 실측(campagne.png/-2.png): 크러스트가 꼭짓점/능선 쪽으로
        // 밝고 밑변 쪽으로 어둡다. 반복 1은 (1-t)로 넣어 꼭짓점이 새까맣게 나왔다.
        const score = 0.6 * ridge + 0.4 * t;
        const c = score < 0.33 ? dark : score < 0.66 ? mid : light;
        const o = (py * size + px) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // 밀가루 더스팅 — 마루(ridge 높은 곳)에 편중된 점묘, 전량 주입 rng(결정론, Math.random 금지)
    const DUST_COUNT = 140;
    ctx.globalAlpha = 0.55;
    let placed = 0;
    let attempts = 0;
    while (placed < DUST_COUNT && attempts < DUST_COUNT * 8) {
      attempts++;
      const u = rng();
      const v = rng();
      const dx = u - 0.5;
      const dy = v - 0.5;
      const cr = Math.hypot(dx, dy) * 2;
      if (cr > 0.98) continue; // 돔 UV 원판 밖(캔버스 모서리)은 버린다
      const t = Math.sqrt(Math.max(0, 1 - cr * cr));
      const ridge = t >= GROOVE_ZONE[0] && t <= GROOVE_ZONE[1] ? domeRingPhase(t, DOME_SPEC) : 0.5;
      if (rng() > ridge * ridge) continue; // 마루일수록 채택 확률이 높다(제곱으로 편중을 강조)
      const r = (0.006 + rng() * 0.012) * size;
      ctx.fillStyle = `rgb(${(FLOUR >> 16) & 0xff}, ${(FLOUR >> 8) & 0xff}, ${FLOUR & 0xff})`;
      ctx.beginPath();
      ctx.arc(u * size, v * size, r, 0, Math.PI * 2);
      ctx.fill();
      placed++;
    }
    ctx.globalAlpha = 1;
  });
}

export const createCampagne: BreadBuilder = (rng) => {
  const { geometry, crumbMask } = buildDome(rng);
  const baked = facet(geometry);
  // facet() 이전 인덱스 순서가 곧 non-indexed 삼각형 순서(toNonIndexed는 인덱스를 그대로 펼친다).
  const originalIndex = geometry.index!.array;
  const { trueTris: crumbTris, falseTris: crustTris } = splitTrianglesByVertexMask(originalIndex, crumbMask);

  const group = new THREE.Group();
  const crustGeo = pickTriangles(baked, crustTris);
  uvDome(crustGeo);
  const crustMat = stdMaterial({ map: paintCrustTexture(rng), color: 0xffffff });
  group.add(new THREE.Mesh(crustGeo, crustMat));

  const crumbGeo = pickTriangles(baked, crumbTris);
  uvDome(crumbGeo);
  const crumbMat = stdMaterial({ color: CRUMB });
  group.add(new THREE.Mesh(crumbGeo, crumbMat));

  return mergeByMaterial(group);
};
