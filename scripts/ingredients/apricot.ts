// 살구 — 말린 살구 반쪽 3개, 자른 면(씨 자국 오목함)이 위를 향한 채로 한 줄. 계약은 types.ts
// 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/apricot.json(워크스페이스 원본은
// assets/ingredients/work/apricot/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
// ⚠ v3(2026-08-26) 개편은 **레포 코드만** 고쳤다 — 스펙 파일은 이 작업의 쓰기 범위 밖
// (배정이 scripts/ingredients/<id>.ts로 한정)이라 "스펙 먼저"를 못 지켰다. 지금은 이 파일이
// 실측 정본이다. 다음에 스펙을 만지는 사람이 여기서 역전사할 것.
//
// ★raisin과 같은 배치 계열(팀리드 지시)이지만 반대 극단이다 — raisin은 몸통 전체에 도는 플루트로
// 실루엣을 깨고, apricot은 몸체 자체가 매끈한 회전체지만 "윗극이 아래로 파인" 프로필(반지름은
// 단조 감소, 높이는 림에서 정점을 향해 다시 낮아짐)로 오목한 씨 자국을 만든다 — LatheGeometry
// 금지 규칙과는 무관(여전히 buildRevolvedShell + 단일 셸), 프로필의 (r,h) 곡선만 비단조 h로 구부린
// 것뿐이다(그릇/접시 단면과 동일한 표준 회전체 패턴).
//
// 씨 자국은 mesh<=2 예산 안에서 별도 색 버킷(HOLLOW_COLOR, 프롬프트 hex 그대로)으로 낸다 —
// advisor 권고: 오목 지오메트리 하나에 색 버킷까지 걸쳐서 "얕은 그릇이라 N·L 대비가 약할 수 있다"는
// 위험(pancake 기포 교훈: 벽이 서야 보인다)을 헤지한다. 경계는 sliceTriangles로, 밴드 tri 수는
// PROFILE에서 계산해서 반환한다(하드코딩 금지) — bandTriCounts 참조.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, scaleHex, sliceTriangles, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/apricot.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
// 가장자리 쭈글거림의 무단 앰버(#C4813F)·상면 하이라이트(#EFC08A)는 드롭 — body와 색상 거리가
// 가까워(둘 다 따뜻한 오렌지 계열) 별도 버킷을 만들 가치가 없고, 주름은 지오메트리(림 웨이브)로,
// 하이라이트는 런타임 N·L로 이미 커버된다(olive shaded-underside-hue-dropped와 같은 논리).
// a2 실측: 그릇은 보이는데 세 알 전체가 **갈색**으로 읽혔다(살구는 주황이다). 하네스는 무광
// Lambert에 앰비언트가 높아 각진 면들이 albedo보다 한참 아래로 내려앉는다 — 알베도를 한 단
// 올려야 화면에서 살구색이 된다(§8 결정론 유도, 원 hex는 아래에 보존).
const BODY_BASE_COLOR = 0xe0a05c; // "a warm burnt-orange body"
const BODY_COLOR = scaleHex(BODY_BASE_COLOR, 1.1);
// ★v3 (2026-08-26): 프롬프트 hex #B97538을 그대로 쓰면 BODY와 명도차가 작아 전체화면에서 홀로우가
// "살짝 그늘진 같은 색"으로 뭉갰다. scaleHex 0.82로 한 단 더 내린다(§8 결정론 유도, 원 hex는 아래
// 상수에 보존). 되돌리지 마라 — 지오메트리 낙차만 키우고 색을 그대로 두면 아래 v3 (2)가 반쯤만 산다.
// a1 실측 후 되돌림: 0.82까지 내렸더니 그릇이 보이긴 하는데 세 알이 **초콜릿 컵**처럼 어두워져
// 살구색을 잃었다. 낙차를 2.3배 키운 지오메트리가 이미 음영을 만들고 있으므로 색은 스펙 hex
// 그대로 쓴다(0.94는 그릇 바닥이 림보다 확실히 가라앉아 보이게 하는 최소한의 보정).
const HOLLOW_BASE_COLOR = 0xb97538; // "a deeper shadowed pit hollow sunk into the center of each half"
const HOLLOW_COLOR = scaleHex(HOLLOW_BASE_COLOR, 0.94);

// 실측 비율 (assets/ingredients/src/apricot.png 3/4 · apricot-2.png 정면 · apricot-3.png 탑다운).
//
// ★v3 (2026-08-26, 전체화면 쇼케이스 판독 수리 — identity 배치). 되돌리지 마라.
// 판정: "정체성인 씨 자국 오목함이 거의 안 보인다" — 세 알이 갈색 감자 덩어리로 읽혔다. 원인 2가지:
//  (1) 세그먼트 12는 100KB/2500tri 시절 수치다. 12각 실루엣 + 지터 0.018이 만든 굵은 페이셋이
//      얕은 그릇의 음영 경계를 통째로 삼켰다. 26세그 + 지터 0.012로 바꾼다.
//  (2) v2의 낙차(림 0.4 → 중심 0.03, half-length 0.42 기준 절대 0.155)는 폭 1.10 대비 14%뿐이라
//      부감 카메라에서 "평평한 윗면"과 구분이 안 됐다. **림을 세우고 중심을 적도 아래까지** 끌어
//      내려 절대 낙차 0.155 → 0.354(폭 대비 31%)로 2.3배 키운다. 동시에 몸체를 납작하게
//      (half-length 0.42 → 0.34, 반지름 0.55 → 0.58) 만들어 말린 살구 특유의 "디스크" 비율로 간다.
const APRICOT_RADIUS = 0.58; // 적도(최대) 반지름
const APRICOT_HALF_LENGTH = 0.34; // 극-극 절반 길이 — 말린 살구 반쪽은 올리브보다 훨씬 납작하다
const APRICOT_SEGMENTS = 26;

type ProfilePoint = readonly [number, number];
// (반지름비, 높이비) — heightFrac -1(둥근 아랫극, 바닥에 닿는 지점) .. +1은 안 씀(마지막 점이
// 씨 자국 중심으로 아래로 되접힌다). r은 처음부터 끝까지 단조 비증가는 아니고(적도까지 증가 후
// 감소) 표준 회전체 프로필 — 등고선처럼 반지름이 늘었다 줄었다 해도 buildRevolvedShell은
// 인접 링만 잇기 때문에 문제 없다(그릇 단면과 동일 패턴).
//
// v3(2026-08-26): 위 상수 블록의 근거 참조. 림 마루(index 6, h=0.62)에서 씨 자국 중심(index 10,
// h=-0.30)까지 h 낙차 0.92 x half-length 0.34 = 절대 0.313. 폭(2 x 0.58 = 1.16) 대비 27%로,
// 3/4 부감(고도 ~36도)에서 전 방위 그릇으로 읽힌다.
// (a1 실측 후 -0.42에서 -0.30으로 소폭 되돌림 — 더 깊이면 과일이 아니라 **컵**으로 읽히기 시작했다.
//  v2의 0.155가 너무 얕았고 첫 수정의 0.354가 살짝 과했다. 이 사이가 목표다.)
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0], // 바닥 극(둥근 아랫면 꼭지)
  [0.42, -0.92],
  [0.72, -0.72],
  [0.92, -0.4],
  [1.0, 0.0], // 적도(최대 반지름)
  [0.99, 0.42], // 바깥 림 벽 — 거의 수직으로 선다(pancake 교훈: 벽이 서야 오목함이 보인다)
  [0.86, 0.62], // 림 마루 — BODY/HOLLOW 경계
  [0.66, 0.44], // 홀로우 안쪽 벽, 급하게 떨어진다
  [0.44, 0.14],
  [0.22, -0.16],
  [0.0, -0.3], // 씨 자국 중심 — 적도보다 아래까지 파인다
];
const HOLLOW_FIRST_BAND = 6; // 림 마루(index 6) 이후가 HOLLOW — PROFILE을 고치면 여기도 고칠 것

const JITTER_AMP = 0.012; // ~2.1% of APRICOT_RADIUS — v3에서 축소(굵은 지터가 그릇 음영을 삼켰다)

// 쭈글쭈글한 림 — 26세그 격자에서 개별 정점을 당기면 뾰족한 스파이크가 되므로(v2의 6개 섹터 당김은
// 12세그 전용 수치였다) **연속 cos(k*theta) 변조**로 바꾼다. 마루 링과 바깥 림 벽에 가중치를 달리
// 줘서 림이 파도치듯 말려 보이게 한다. raisin의 전체 길이 플루트보다 얕고 국소적이다.
const RIM_WRINKLE_LOBES = 8;
const RIM_WRINKLE_RINGS: readonly number[] = [5, 6]; // 바깥 림 벽, 림 마루
const RIM_WRINKLE_WEIGHTS: readonly number[] = [0.55, 1.0];
const RIM_WRINKLE_DEPTH = 0.075;

function modulateRimWrinkles(pos: THREE.BufferAttribute, ringStart: number[], segments: number): void {
  for (let k = 0; k < RIM_WRINKLE_RINGS.length; k++) {
    const base = ringStart[RIM_WRINKLE_RINGS[k]];
    const weight = RIM_WRINKLE_WEIGHTS[k];
    for (let s = 0; s < segments; s++) {
      const t = (s / segments) * Math.PI * 2;
      // cos(정수배 theta) — 이음매(s=0)에서 연속이라 seam 실금이 안 생긴다.
      const scale = 1 - RIM_WRINKLE_DEPTH * weight * 0.5 * (1 + Math.cos(RIM_WRINKLE_LOBES * t));
      const idx = base + s;
      pos.setXYZ(idx, pos.getX(idx) * scale, pos.getY(idx), pos.getZ(idx) * scale);
    }
  }
}

/** 밴드별 삼각형 수 — buildRevolvedShell의 내부 인덱싱 규칙(극 인접 밴드는 segments개, 그 외는
 * segments*2개)을 그대로 재현해 슬라이스 경계를 프로필에서 계산한다(하드코딩 금지, advisor 권고). */
function bandTriCounts(profile: readonly ProfilePoint[], segments: number): number[] {
  const counts: number[] = [];
  for (let ri = 0; ri < profile.length - 1; ri++) {
    const aPole = profile[ri][0] <= 1e-6;
    const bPole = profile[ri + 1][0] <= 1e-6;
    counts.push(aPole || bPole ? segments : segments * 2);
  }
  return counts;
}

interface ApricotDef {
  offset: readonly [number, number]; // world XZ
  yaw: number; // world Y 회전
}

// assets/ingredients/work/apricot/object-sculpt-spec.json APRICOTS 전사. "resting cut-side up in
// a small row" — tiltZ 없음(전부 평평하게 안착), advisor 권고대로 서로 붙여 한 줄로 배치.
// v3: 반지름을 0.55 -> 0.58로 키웠으므로 간격도 같은 비율(x1.055)로 벌려 겹침 비율을 유지한다 —
// 간격을 그대로 두면 세 알이 더 깊이 파고들어 그릇 림이 서로를 먹는다.
const APRICOTS: Record<'a' | 'b' | 'c', ApricotDef> = {
  a: { offset: [-0.82, 0.03], yaw: 0.2 },
  b: { offset: [0.02, -0.06], yaw: -0.35 },
  c: { offset: [0.82, 0.05], yaw: 0.65 },
};

/**
 * 살구 반쪽 1개 = 회전체 셸(적도 아래로 치우친 프로필 + 오목 씨 자국) + 림 웨이브(격자 인덱스) +
 * 지터 + 페이셋 + BODY/HOLLOW 삼각형 슬라이스. 프로필 자체가 이미 "바닥 극이 아래, 씨 자국 극이
 * 위"로 지어져 있어 raisin/cranberry와 달리 눕히기(rotateZ) 회전이 필요 없다 — 회전체를 세운 그
 * 자체가 "cut-side up" 자세다.
 */
function buildApricot(rng: () => number): { bodyGeo: THREE.BufferGeometry; hollowGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, APRICOT_SEGMENTS, APRICOT_HALF_LENGTH, () => [
    APRICOT_RADIUS,
    APRICOT_RADIUS,
  ]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  modulateRimWrinkles(pos, ringStart, APRICOT_SEGMENTS);
  pos.needsUpdate = true;

  jitterVertices(geometry, rng, JITTER_AMP);

  const baked = facet(geometry);
  const counts = bandTriCounts(PROFILE, APRICOT_SEGMENTS);
  // BODY = 밴드 0..HOLLOW_FIRST_BAND-1(바닥 극 -> 적도 -> 림 마루), HOLLOW = 그 이후(림 마루 ->
  // 씨 자국 중심). 경계는 PROFILE에서 계산 — 하드코딩 금지(advisor 권고, v3에서 상수화).
  const bodyEnd = counts.slice(0, HOLLOW_FIRST_BAND).reduce((a, b) => a + b, 0);
  const total = counts.reduce((a, b) => a + b, 0);

  const bodyGeo = sliceTriangles(baked, 0, bodyEnd);
  const hollowGeo = sliceTriangles(baked, bodyEnd, total);
  uvTopPlanar(bodyGeo);
  uvTopPlanar(hollowGeo);
  return { bodyGeo, hollowGeo };
}

export const createApricot: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const hollowMat = stdMaterial({ color: HOLLOW_COLOR });

  const cluster = new THREE.Group();

  (Object.keys(APRICOTS) as (keyof typeof APRICOTS)[]).forEach((key) => {
    const def = APRICOTS[key];
    const { bodyGeo, hollowGeo } = buildApricot(rng);

    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(bodyGeo, bodyMat), new THREE.Mesh(hollowGeo, hollowMat));
    sub.rotation.set(0, def.yaw, 0);
    sub.position.set(def.offset[0], 0, def.offset[1]);

    // 공유 지면 y=0 — 이 반쪽만의 회전 후 bbox를 구해 바닥을 원점에 맞춘다(types.ts R1).
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;

    cluster.add(sub);
  });

  return mergeByMaterial(cluster);
};
