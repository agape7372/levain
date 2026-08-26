// 유자 — 통째 감귤류 한 알. 계약은 types.ts 주석이 정본. 재료 2차 배치(신규 4종) 2번째.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/yuzu.json(워크스페이스 원본은
// assets/ingredients/work/yuzu/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// 레몬과 갈리는 유일한 단서가 "울퉁불퉁한 뒴프 + 납작하고 둥근 형태"라 정체성이 통째로 표면
// 노이즈에 있다.
//
// ★2026-08-26 전체화면 쇼케이스 수리(texbug) — 이 파일은 세 군데가 바뀌었고 전부 되돌리지 말 것:
//
//  (1) **꼭지 다임플이 "몸통 위에 붙인 스티커/배터리 캡"이었다.** 옛 구현은 높이 0.06(반높이
//      0.03)짜리 원반을 DIMPLE_EMBED=0.014만 파묻어 얹었다 — 반높이보다 얕게 묻으니 원반 윗면이
//      극점보다 ~0.016 위로 솟고 옆벽이 통째로 노출됐다. 앱 카메라 고도가 ~52도라 위쪽 판독이
//      지배적이어서 네 방위 전부에서 "꼭대기에 박힌 어두운 팔각 마개"로 보였다.
//      → 진짜 오목한 접시(dish)로 바꿨다. 몸통 프로필을 **꼭지 극점 없이 림에서 끝내** 크라운을
//      열어 두고(buildRevolvedShell은 극점이 없으면 끝면을 안 닫는다 — 옛 주석이 지적한 그 성질을
//      이번엔 **일부러** 쓴다), 그 구멍을 같은 반지름·같은 SEGMENTS의 접시로 막는다. 접시는
//      와인딩을 뒤집어 감아(reverseWinding) 법선이 위·안쪽을 향하게 한다 — 안 뒤집으면 오목면이
//      뒷면이 되어 FrontSide 머티리얼에서 **뚫린 구멍**으로 보인다(stdMaterial은 side 미지정).
//      ⚠ scripts 밖 검수 도구(vol.mjs)는 이 다임플 프리미티브를 "부호부피 음수 / 바깥향 낮음"으로
//      찍는다. 오목한 열린 면이니 **그게 정상**이다 — 몸통 프리미티브가 vol>0·바깥향 90%대면 정상.
//
//  (2) SEGMENTS 16 -> 32, PROFILE 11점 -> 19점. 예산이 100KB/2500tri -> 250KB/8000tri로 상향됐고
//      (families.mjs 2026-08-26 주석) 재료도 빵과 같은 쇼케이스에서 같은 크기로 확대돼 보인다.
//      옛 격자는 전체화면에서 유자가 아니라 광물 결정처럼 보였다.
//
//  (3) 뒴프를 **정점 난수 지터에서 저주파 합성 사인으로** 옮겼다. 난수 지터는 격자를 촘촘히 할수록
//      혹이 아니라 고주파 잔물결이 된다(진폭은 그대로인데 파장만 짧아진다) — 32세그먼트에서 옛
//      0.055 지터를 그대로 쓰면 사포/결정 덩어리가 된다. 합성 사인은 격자 밀도와 무관하게 같은
//      크기의 혹을 내므로 "울퉁불퉁한 뒴프" 정체성이 밀도와 분리된다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, mergeByMaterial, stdMaterial, uvDome, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/yuzu.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const RIND_COLOR = 0xd4c13a; // "a warm mustard-yellow rind"
const DIMPLE_COLOR = 0xb39d2a; // "a deeper shaded tone (#B39D2A)" — 같은 JSON에서 재배정.
// ★스펙의 다임플 hex(#7A6B2E)를 쓰지 않는 것은 의도다(2026-08-26 실측). 오목 접시를 그 색으로
// 칠하니 꼭대기에 균일하게 어두운 원반이 생겨 **뚫린 구멍**으로 읽혔다 — 2D 일러스트에서는 어두운
// 올리브가 함몰을 뜻하지만, 3D에서는 오목면이 이미 키라이트 감쇠로 어두워지므로 재질색까지 어두우면
// 두 번 어두워져 구멍이 된다. 림 대비 ~84% 밝기인 #B39D2A면 "그늘진 꼭지 자리"로 읽힌다.
// 밝은 상단 톤(#E6D766)은 별도 버킷을 안 만든다 — 볼록한 셸이 런타임 키라이트 N·L 감쇠로 이미
// 공짜로 밝기 대비를 낸다(올리브 shaded-underside-hue-dropped와 동일 논리).

// 실측 비율 (assets/ingredients/src/yuzu.png 3/4 · yuzu-2.png 정면 · yuzu-3.png 탑다운 — 셋 다 거의
// 동일한 "위에서 본" 각도라 납작함이 특히 top-down에서 뚜렷하다).
const YUZU_RADIUS = 0.62; // 적도 반지름
const YUZU_HALF_HEIGHT = 0.52; // 극-극 절반 높이 (양극이 살짝 눌린 납작한 구, 비율 ~0.84:1)
const YUZU_SEGMENTS = 32; // ★16에서 상향. 다임플 접시도 **반드시 같은 값**을 쓴다(림 정점이 1:1로
// 맞아야 이음매가 벌어지지 않는다).

// 꼭지 개구부 — 몸통 프로필의 마지막 링이자 다임플 접시의 림. 두 수치는 몸통·접시가 **공유**한다.
const RIM_R_FRAC = 0.155; // ★0.21에서 축소 — 폭의 21%짜리 어두운 원은 "꼭지 자국"이 아니라 구멍으로
// 읽힌다. 스펙도 "a **small** darker olive dimple"이다.
const RIM_H_FRAC = 0.985;
const RIM_RADIUS = YUZU_RADIUS * RIM_R_FRAC;
const RIM_Y = YUZU_HALF_HEIGHT * RIM_H_FRAC;
const DIMPLE_DEPTH = 0.026; // 림에서 접시 바닥까지. ★얕게 유지할 것 — 깊게 파면 어두운 올리브색
// 구덩이가 되어 "뚫린 구멍"으로 읽힌다(지금 고치고 있는 바로 그 실패 유형).

type ProfilePoint = readonly [number, number];
// (반지름비, 높이비) — hFrac -1(아랫극, 살짝 눌림) .. RIM_H_FRAC(꼭지 림, **극점 아님**).
// ★마지막 점을 극점(반지름 0)으로 되돌리지 마라 — 크라운이 닫히면 다임플 접시가 그 밑에 묻혀
// 아예 안 보이고, 접시를 다시 위로 올리면 옛 "스티커" 버그가 그대로 재현된다.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.3, -0.985],
  [0.52, -0.95],
  [0.68, -0.9],
  [0.85, -0.8],
  [0.93, -0.66],
  [0.975, -0.5],
  [0.995, -0.3],
  [1.0, -0.05],
  [0.985, 0.18], // ★상반부를 옛 값보다 빨리 좁힌다 — 옛 프로필(0.995/0.97/0.925…)은 옆구리가
  [0.945, 0.38], // 거의 수직이라 매끈해진 크라운과 합쳐져 "뚜껑 달린 통"으로 보였다.
  [0.885, 0.55],
  [0.79, 0.7],
  [0.7, 0.8],
  [0.6, 0.86],
  [0.45, 0.92],
  [0.33, 0.955],
  [0.24, 0.975],
  [RIM_R_FRAC, RIM_H_FRAC],
];

// 뒴프 — 각도·높이의 합성 사인(저주파 2옥타브) + 아주 약한 결정론 난수. 진폭은 반지름 비율.
const BUMP_AMP = 0.068; // 적도 반지름의 6.8% (옛 지터 8.9%와 같은 자릿수지만 파장이 길어 혹으로 읽힌다)
const NOISE_AMP = 0.018; // 혹의 규칙성을 깨는 미세 난수(반지름 비율)
// 크라운 보호대 — 림 근처는 변위를 0으로 죽인다(접시 림과 정점이 정확히 맞아야 한다).
// ★링 인덱스가 아니라 **hFrac**으로 표현한다: 인덱스 기준으로 쓰면 프로필을 촘촘히 하는 순간
// 보호 구간이 조용히 얇아진다(옛 코드가 lastRing-1까지 인덱스로 잡고 있었다).
// ★2026-08-26 2차: 0.72/0.90 -> 0.90/0.965. 0.72부터 죽이니 윗면 전체가 매끈한 원판이 되어
// "울퉁불퉁한 몸통 + 매끈한 뚜껑"으로 보였다. 보호대는 접시 이음매를 지킬 만큼만(마지막 두 링) 좁게.
const CROWN_FADE_START = 0.9; // 여기부터 진폭이 줄기 시작
const CROWN_FADE_END = 0.965; // 여기부터 림까지는 완전히 매끈

function crownFade(hFrac: number): number {
  if (hFrac <= CROWN_FADE_START) return 1;
  if (hFrac >= CROWN_FADE_END) return 0;
  const t = (hFrac - CROWN_FADE_START) / (CROWN_FADE_END - CROWN_FADE_START);
  return 1 - t * t * (3 - 2 * t); // smoothstep
}

/**
 * 인덱스 지오메트리의 삼각형 감기를 뒤집는다 — 오목면(접시) 전용.
 * buildRevolvedShell의 와인딩은 "회전체의 바깥"을 향하도록 유도돼 있어서, 극점이 링보다 **아래**인
 * 깔때기/접시에 그대로 쓰면 법선이 아래·바깥을 향한다(= 위에서 보면 뒷면 = 구멍). lib.ts를 고치지
 * 않고(빵 10종 바이트 보존) 이 파일에서만 뒤집는다.
 */
function reverseWinding(g: THREE.BufferGeometry): void {
  const idx = g.getIndex();
  if (!idx) throw new Error('reverseWinding: 인덱스 지오메트리가 아님');
  const a = idx.array as unknown as { [i: number]: number; length: number };
  for (let i = 0; i < a.length; i += 3) {
    const t = a[i + 1];
    a[i + 1] = a[i + 2];
    a[i + 2] = t;
  }
  idx.needsUpdate = true;
}

/** 꼭지 오목 접시 — 림(hFrac 0)이 몸통 개구부와 정확히 겹치고 중심이 DIMPLE_DEPTH만큼 내려간다. */
function buildDimpleDish(): THREE.BufferGeometry {
  // 원호 단면 (r, -sqrt(1-r²)) 을 5점으로 — 얕은 접시라 이 이상 촘촘히 할 이유가 없다.
  const dish: readonly ProfilePoint[] = [
    [0.0, -1.0],
    [0.45, -0.89],
    [0.78, -0.63],
    [0.95, -0.31],
    [1.0, 0.0],
  ];
  const { geometry } = buildRevolvedShell(dish, YUZU_SEGMENTS, DIMPLE_DEPTH, () => [RIM_RADIUS, RIM_RADIUS]);
  reverseWinding(geometry); // ★필수 — 빼면 오목면이 뒷면이 되어 구멍으로 보인다.
  const baked = facet(geometry);
  uvTopPlanar(baked);
  baked.translate(0, RIM_Y, 0); // 림(hFrac 0 -> y 0)을 몸통 개구부 높이로. 지터는 걸지 않는다.
  return baked;
}

export const createYuzu: IngredientBuilder = (rng) => {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, YUZU_SEGMENTS, YUZU_HALF_HEIGHT, () => [YUZU_RADIUS, YUZU_RADIUS]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  const ph = [rng() * 6.283, rng() * 6.283, rng() * 6.283, rng() * 6.283];
  for (let ri = 0; ri < PROFILE.length; ri++) {
    const hFrac = PROFILE[ri][1];
    const fade = crownFade(hFrac);
    const start = ringStart[ri];
    const end = ri + 1 < ringStart.length ? ringStart[ri + 1] : pos.count;
    if (fade <= 0) continue; // 림·크라운은 손대지 않는다(접시 이음매 보호)
    for (let i = start; i < end; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const theta = Math.atan2(z, x);
      // ★평면파 4개의 **합**. 옛 코드는 sin(θ)·cos(h) 곱(분리형)이라 격자무늬가 생겨 표면이
      // 벽돌쌓기/파인애플 껍질처럼 규칙적으로 보였다 — 합은 마루가 대각으로 어긋나 유기적인 혹이 된다.
      const w =
        Math.sin(5 * theta + 3.1 * hFrac + ph[0]) +
        0.72 * Math.sin(7 * theta - 4.9 * hFrac + ph[1]) +
        0.55 * Math.sin(3 * theta + 8.3 * hFrac + ph[2]) +
        0.42 * Math.sin(9 * theta + 6.4 * hFrac + ph[3]);
      const bump = (w / 2.69) * BUMP_AMP * fade;
      const n = (rng() - 0.5) * 2 * NOISE_AMP * fade;
      const m = 1 + bump + n;
      pos.setXYZ(i, x * m, pos.getY(i) + (rng() - 0.5) * 2 * NOISE_AMP * YUZU_RADIUS * fade * 0.5, z * m);
    }
  }
  pos.needsUpdate = true;

  const baked = facet(geometry);
  uvDome(baked);

  const rindMat = stdMaterial({ color: RIND_COLOR });
  const dimpleMat = stdMaterial({ color: DIMPLE_COLOR });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(baked, rindMat));
  group.add(new THREE.Mesh(buildDimpleDish(), dimpleMat));

  return mergeByMaterial(group);
};
