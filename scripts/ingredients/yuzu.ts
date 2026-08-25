// 유자 — 통째 감귤류 한 알. 계약은 types.ts 주석이 정본. 재료 2차 배치(신규 4종) 2번째.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/yuzu.json(워크스페이스 원본은
// assets/ingredients/work/yuzu/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// 레몬과 갈리는 유일한 단서가 "울퉁불퉁한 뒴프 + 납작하고 둥근 형태"라 정체성이 통째로 표면
// 노이즈에 있다 — 올리브/무화과보다 훨씬 굵은 지터(JITTER_AMP가 반지름의 ~9%, R4 통상치의
// 2배 이상)와 촘촘한 세그먼트로 뒴프를 지오메트리에 직접 굽는다(텍스처 탈출구 불필요).
// 꼭지 자리 다임플은 처음에 프로필 비단조 딥(반지름은 계속 줄고 높이만 되돌아오는 깔때기)으로
// 시도했으나, buildRevolvedShell의 pole 케이스 와인딩 공식이 "다음 링이 더 높은 정상적인 돔"
// 전제로 유도된 것이라 반대 방향(다음 링이 더 낮은 오목한 깔때기)에서 뒤집힐 위험이 있어
// **더 안전한 pumpkin/fig 꼭지 패턴으로 대체**했다 — 짧고 얕게 파묻힌 원반을 꼭지 극점에 얹어
// 다임플의 어두운 반점만 표현한다(진짜 오목 함몰 아님, risk dimple-flat-not-concave 참조).
// "cavity/recess" 토큰을 이름에 넣지 않아 스킬 strict-quality의 implicit-topology 하드게이트도
// 애초에 피한다(CRIB "스킬 스펙 검증 하드게이트" 절 참조).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, stdMaterial, uvDome, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/yuzu.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const RIND_COLOR = 0xd4c13a; // "a warm mustard-yellow rind"
const DIMPLE_COLOR = 0x7a6b2e; // "a small darker olive dimple ... marking the stem-end indentation"
// 그늘진 톤(#B39D2A)과 밝은 상단 톤(#E6D766)은 별도 버킷을 안 만든다 — 볼록한 셸이 런타임 키라이트
// N·L 감쇠로 이미 공짜로 밝기 대비를 낸다(올리브 shaded-underside-hue-dropped와 동일 논리,
// 스펙 risk rind-shading-hue-dropped 참조).

// 실측 비율 (assets/ingredients/src/yuzu.png 3/4 · yuzu-2.png 정면 · yuzu-3.png 탑다운 — 셋 다 거의
// 동일한 "위에서 본" 각도라 납작함이 특히 top-down에서 뚜렷하다).
const YUZU_RADIUS = 0.62; // 적도 반지름
const YUZU_HALF_HEIGHT = 0.52; // 극-극 절반 높이 (양극이 살짝 눌린 납작한 구, 비율 ~0.84:1)
const YUZU_SEGMENTS = 16; // 뒴프가 지오메트리 노이즈라 fig/olive(12)보다 촘촘하게

type ProfilePoint = readonly [number, number];
// (반지름비, 높이비) — heightFrac -1(아랫극, 살짝 눌림) .. +1(윗극, 살짝 눌림). 양극 다 마지막
// 두 세그먼트에서 반지름이 완만히 줄어 "pointed가 아니라 flattened"로 마무리된다.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.55, -0.94],
  [0.85, -0.78],
  [0.98, -0.42],
  [1.0, -0.05],
  [0.98, 0.35],
  [0.88, 0.65],
  [0.62, 0.86],
  [0.32, 0.95],
  [0.12, 0.99],
  [0.0, 1.0],
];

const JITTER_AMP = 0.055; // ~8.9% of YUZU_RADIUS — R4 예외적으로 굵게: 뒴프 자체가 정체성이라
// fig/olive(반지름의 3~4%)보다 훨씬 크게 잡았다.

const DIMPLE_RADIUS = 0.13; // 꼭지 다임플 원반 — cmp-1 실측: 0.09는 노출 면적이 너무 작아 거의 안
// 보였다(크레센트 한 조각만 삐져나옴). 몸통 반지름의 21%로 키웠다.
const DIMPLE_HEIGHT = 0.06;
const DIMPLE_SEGMENTS = 7; // 각진 페이셋(다른 꼭지류와 동일 관례)
const DIMPLE_EMBED = 0.014; // cmp-1: 0.035 임베드는 원반을 거의 다 파묻어 반점이 안 읽혔다 — 얕게 줄여
// 원반 윗면 대부분이 노출되게 한다(그래도 "돌출 꼭지"보다는 "박힌 반점"에 가깝게 남긴다).
const DIMPLE_JITTER_AMP = 0.006;

function buildDimple(rng: () => number): THREE.BufferGeometry {
  // cmp-1/cmp-2/cmp-3 실측: pumpkin/fig 꼭지처럼 2점(둘 다 비극) 프로필을 그대로 쓰면
  // buildRevolvedShell이 옆면만 짓고 **끝면을 안 닫는다**(극이 있어야 팬 캡이 생긴다) — 가늘고 긴
  // 꼭지는 안 보여서 무해했지만, 여기는 넓적한 원반이라 뚫린 윗면이 크게 비어 보여 "크레센트"처럼
  // 옆벽 한 조각만 읽혔다(파라미터를 세 번 바꿔도 렌더가 안 바뀐 원인 — 로직 문제였지 캐싱이 아니었다).
  // 양 끝에 극(반지름 0)을 추가해 위아래 다 팬 캡으로 닫는다.
  const { geometry } = buildRevolvedShell(
    [
      [0, -1],
      [1, -1],
      [1, 1],
      [0, 1],
    ],
    DIMPLE_SEGMENTS,
    DIMPLE_HEIGHT / 2,
    () => [DIMPLE_RADIUS, DIMPLE_RADIUS],
  );
  jitterVertices(geometry, rng, DIMPLE_JITTER_AMP);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  baked.translate(0, YUZU_HALF_HEIGHT - DIMPLE_EMBED, 0);
  return baked;
}

export const createYuzu: IngredientBuilder = (rng) => {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, YUZU_SEGMENTS, YUZU_HALF_HEIGHT, () => [YUZU_RADIUS, YUZU_RADIUS]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  // 꼭지 부근 링일수록 지터를 줄인다 — cmp-1/cmp-2 실측: 0.35배 균일 축소로도 극점(폴 정점) 자체가
  // 흔들려 다임플 원반의 얕은 노출 높이(DIMPLE_EMBED)와 다투는 바람에 원반이 조각난 크레센트로만
  // 보였다. 극점(마지막 링, ri=10)은 아예 지터 0으로 고정하고 그 앞 두 링도 단계적으로 줄여, 다임플이
  // 앉는 크라운 일대를 매끈하게 남긴다 — 몸통 전체 표면적의 일부일 뿐이라 "울퉁불퉁함" 정체성은
  // 유지된다.
  const lastRing = ringStart.length - 1;
  function ringAmpScale(ringIndex: number): number {
    if (ringIndex >= lastRing) return 0; // 극점 자체 — 다임플이 직접 얹히는 자리
    if (ringIndex === lastRing - 1) return 0; // 다임플 림 바로 아래 — 완전히 매끈하게
    if (ringIndex === lastRing - 2) return 0.3;
    return 1;
  }
  for (let i = 0; i < pos.count; i++) {
    let ringIndex = lastRing;
    for (let ri = 0; ri < lastRing; ri++) {
      if (i >= ringStart[ri] && i < ringStart[ri + 1]) {
        ringIndex = ri;
        break;
      }
    }
    const amp = JITTER_AMP * ringAmpScale(ringIndex);
    if (amp > 0) {
      pos.setXYZ(i, pos.getX(i) + (rng() - 0.5) * 2 * amp, pos.getY(i) + (rng() - 0.5) * 2 * amp, pos.getZ(i) + (rng() - 0.5) * 2 * amp);
    }
  }
  pos.needsUpdate = true;

  const baked = facet(geometry);
  uvDome(baked);

  const rindMat = stdMaterial({ color: RIND_COLOR });
  const dimpleMat = stdMaterial({ color: DIMPLE_COLOR });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(baked, rindMat));
  group.add(new THREE.Mesh(buildDimple(rng), dimpleMat));

  return mergeByMaterial(group);
};
