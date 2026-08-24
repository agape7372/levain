// 통밀빵 — 단일 연속 돔(불 계열). 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 `assets/breads/specs/wholewheat.json`(워크스페이스 원본은
// assets/breads/work/wholewheat/). 수치·색은 그 스펙(work/wholewheat/author_spec.py)의 전사.
//
// campagne와 같은 실루엣 계열이라 scripts/breads/domeShell.ts(그루브+워블 골격)를 그대로
// 공유한다(팀 지시) — 다만 DOME_HEIGHT 등 비율은 이 빵 자신의 레퍼런스 실측값(CRIB: 이미지가
// 비율 정본, JSON은 색만)이라 campagne보다 둥글고 높다. campagne와 다른 점:
//   - 슬래시 없음 → 단일 메시·단일 머티리얼(≤2 계약 안에서 가장 단순한 경우)
//   - 밀가루 더스팅(능선 편중) 대신 균일 스페클(전면 고른 분포)
//   - 크러스트가 campagne보다 한 톤 어둡다(#8C5A32) — 두 빵을 가르는 1차 신호
import * as THREE from 'three';
import type { BreadBuilder } from './types';
import { bakeTexture, facet, jitterVertices, mergeByMaterial, scaleHex, stdMaterial, uvDome } from './lib';
import { buildGroovedDomeShell, ringPhase as domeRingPhase, type DomeShellSpec } from './domeShell';

// 팔레트 — assets/prompts/breads/wholewheat.json geometry.crust 손 전사 + 문서화된 유도.
const CRUST = 0x8c5a32; // "caramel brown surface #8C5A32, one full shade darker than a plain campagne crust"
// 그라데이션 어두운 끝 — campagne와 같은 기법(고정 배율), 계열 hex 없음.
const CRUST_DARK = scaleHex(CRUST, 0.72);
// 스페클 알갱이 — 계열에 hex 없어 채택한 결정론적 유도(크러스트를 밝히는 배율).
// campagne 밀가루(#EFE7D2, 거의 흰 더스팅)와 구분되도록 더 따뜻한/진한 톤을 남긴다.
const SPECKLE = scaleHex(CRUST, 1.55);

// 실측 비율 (assets/breads/src/wholewheat-2.png 정면 · wholewheat-3.png 탑다운)
// 반복 1: 전면 정면도 픽셀 추정(0.596)으로 렌더했더니 breadlab compare 콜라주(3/4 카메라, 레퍼런스와
// 동일 프레이밍이라 직접 비교 가능)에서 레퍼런스가 렌더보다 확연히 둥글었다 — 거의 공에 가깝다.
// 반복 2(0.85)도 여전히 낮았다(콜라주 실측 비율 렌더 0.72 vs 레퍼런스 0.90) — 1.05로 재검증.
const DOME_HEIGHT = 1.05;
const SEGMENTS = 32; // campagne와 동일(공유 domeShell 워블 코드)
// 반복 1: GROOVE_COUNT=10이 tri 2304로 예산(1200~2000)을 초과했다 — campagne와 같은 8로.
// 실측 12~13링과의 괴리는 텍스처의 연속 ringPhase 밴드가 물리 그루브보다 촘촘하게 보완한다.
const GROOVE_COUNT = 8;
const GROOVE_ZONE: readonly [number, number] = [0.06, 0.98]; // 레퍼런스가 가장자리까지 링으로 덮여 campagne보다 더 넓게
const GROOVE_HALF_WIDTH_T = 0.012;
const GROOVE_DEPTH = 0.026;
const WOBBLE = { lobe3: 0.018, lobe7: 0.01, noise: 0.01 };
const JITTER_AMP = 0.006;

const DOME_SPEC: DomeShellSpec = {
  domeHeight: DOME_HEIGHT,
  segments: SEGMENTS,
  grooveCount: GROOVE_COUNT,
  grooveZone: GROOVE_ZONE,
  grooveHalfWidthT: GROOVE_HALF_WIDTH_T,
  grooveDepth: GROOVE_DEPTH,
  wobble: WOBBLE,
};

// --- 크러스트 텍스처: 그라데이션 + 통곡물 스페클, 지오메트리 그루브와 위상 공유 --------------
const TEX_SIZE = 160;

function paintCrustTexture(rng: () => number): THREE.CanvasTexture {
  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    const dark: [number, number, number] = [(CRUST_DARK >> 16) & 0xff, (CRUST_DARK >> 8) & 0xff, CRUST_DARK & 0xff];
    const mid: [number, number, number] = [
      Math.round((((CRUST_DARK >> 16) & 0xff) + ((CRUST >> 16) & 0xff)) / 2),
      Math.round((((CRUST_DARK >> 8) & 0xff) + ((CRUST >> 8) & 0xff)) / 2),
      Math.round(((CRUST_DARK & 0xff) + (CRUST & 0xff)) / 2),
    ];
    const light: [number, number, number] = [(CRUST >> 16) & 0xff, (CRUST >> 8) & 0xff, CRUST & 0xff];
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size;
        const v = (py + 0.5) / size;
        const dx = u - 0.5;
        const dy = v - 0.5;
        const cr = Math.min(1, Math.hypot(dx, dy) * 2);
        const t = Math.sqrt(Math.max(0, 1 - cr * cr)); // t=1 꼭짓점 (campagne와 동일 관례)
        const ridge = t >= GROOVE_ZONE[0] && t <= GROOVE_ZONE[1] ? domeRingPhase(t, DOME_SPEC) : 0.5;
        const score = 0.6 * ridge + 0.4 * t; // 꼭짓점/능선 밝게 — campagne와 동일 방향
        const c = score < 0.33 ? dark : score < 0.66 ? mid : light;
        const o = (py * size + px) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // 통곡물 스페클 — campagne 밀가루와 달리 능선 편중 없이 돔 전면에 고르게(주입 rng, 결정론).
    const SPECKLE_COUNT = 220;
    ctx.globalAlpha = 0.6;
    let placed = 0;
    let attempts = 0;
    while (placed < SPECKLE_COUNT && attempts < SPECKLE_COUNT * 6) {
      attempts++;
      const u = rng();
      const v = rng();
      const dx = u - 0.5;
      const dy = v - 0.5;
      const cr = Math.hypot(dx, dy) * 2;
      if (cr > 0.98) continue; // 돔 UV 원판 밖은 버린다
      const r = (0.004 + rng() * 0.008) * size;
      const dark2 = rng() < 0.3; // 일부는 어두운 통곡물 알갱이(레퍼런스의 다크 스펙)
      const col = dark2 ? CRUST_DARK : SPECKLE;
      ctx.fillStyle = `rgb(${(col >> 16) & 0xff}, ${(col >> 8) & 0xff}, ${col & 0xff})`;
      ctx.beginPath();
      ctx.arc(u * size, v * size, r, 0, Math.PI * 2);
      ctx.fill();
      placed++;
    }
    ctx.globalAlpha = 1;
  });
}

export const createWholewheat: BreadBuilder = (rng) => {
  const { geometry } = buildGroovedDomeShell(DOME_SPEC, rng);
  jitterVertices(geometry, rng, JITTER_AMP);
  const baked = facet(geometry);
  uvDome(baked);

  const mat = stdMaterial({ map: paintCrustTexture(rng), color: 0xffffff });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(baked, mat));
  return mergeByMaterial(group);
};
