// 살구 — 말린 살구 반쪽 3개, 자른 면(씨 자국 오목함)이 위를 향한 채로 한 줄. 계약은 types.ts
// 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/apricot.json(워크스페이스 원본은
// assets/ingredients/work/apricot/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
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
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/apricot.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
// 가장자리 쭈글거림의 무단 앰버(#C4813F)·상면 하이라이트(#EFC08A)는 드롭 — body와 색상 거리가
// 가까워(둘 다 따뜻한 오렌지 계열) 별도 버킷을 만들 가치가 없고, 주름은 지오메트리(림 웨이브)로,
// 하이라이트는 런타임 N·L로 이미 커버된다(olive shaded-underside-hue-dropped와 같은 논리).
const BODY_COLOR = 0xe0a05c; // "a warm burnt-orange body"
const HOLLOW_COLOR = 0xb97538; // "a deeper shadowed pit hollow sunk into the center of each half"

// 실측 비율 (assets/ingredients/src/apricot.png 3/4 · apricot-2.png 정면 · apricot-3.png 탑다운).
const APRICOT_RADIUS = 0.55; // 적도(최대) 반지름
const APRICOT_HALF_LENGTH = 0.42; // 극-극 절반 길이 — 살구 반쪽은 올리브보다 훨씬 납작하다
const APRICOT_SEGMENTS = 12;

type ProfilePoint = readonly [number, number];
// (반지름비, 높이비) — heightFrac -1(둥근 아랫극, 바닥에 닿는 지점) .. +1은 안 씀(마지막 점이
// 씨 자국 중심으로 아래로 되접힌다). r은 처음부터 끝까지 단조 비증가는 아니고(적도까지 증가 후
// 감소) 표준 회전체 프로필 — 등고선처럼 반지름이 늘었다 줄었다 해도 buildRevolvedShell은
// 인접 링만 잇기 때문에 문제 없다(그릇 단면과 동일 패턴).
//
// v2(cmp-1 판정 후): 원래 림(0.32)->중심(0.2) 낙차가 0.12뿐이라 전체 높이(0.42) 대비 얕아서
// 씨 자국이 거의 안 보였다(색 버킷은 있는데 지오메트리 낙차가 없어 음영 대비가 안 났다 — pancake
// 기포 교훈: 벽이 서야 보인다). 림을 더 밀어올리고(0.32->0.4) 중심을 적도 근처까지 끌어내려
// (0.2->0.03) 낙차를 0.12->0.37로 3배 키웠다.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0], // 바닥 극(둥근 아랫면 꼭지)
  [0.6, -0.82],
  [0.9, -0.46],
  [1.0, -0.05], // 적도(최대 반지름) — 살구 반쪽은 적도가 아래쪽에 치우친다(둥근 아랫면이 더 크다)
  [0.93, 0.4], // 림 라인(플럼프한 윗면 / 쭈글 웨이브 링) — BODY/HOLLOW 경계
  [0.62, 0.44], // 안쪽 림, 홀로우로 기울기 시작
  [0.3, 0.22], // 홀로우 벽 — 급하게 떨어진다
  [0.0, 0.03], // 씨 자국 중심(적도 바로 위까지 깊게 파인다 — 오목함이 지배적으로 읽히게)
];

const JITTER_AMP = 0.018; // ~3.3% of APRICOT_RADIUS — R4, olive/fig와 같은 자릿수

// 쭈글쭈글한 림 — 프로필 인덱스 4(림 라인, hFrac=0.32)의 (링,섹터) 격자를 번갈아 당겨 웨이브를
// 낸다. raisin의 전체 길이 플루트보다 훨씬 얕고 국소적(링 1개) — "softly wrinkled" 요구가
// raisin의 "deep puckered wrinkles"보다 약하다.
const RIM_RING_INDEX = 4;
const RIM_WRINKLE_SECTORS: readonly number[] = [0, 2, 4, 6, 8, 10];
const RIM_WRINKLE_DEPTH = 0.14;

function pullRimWrinkles(pos: THREE.BufferAttribute, ringStart: number[], ringIndex: number, sectors: readonly number[], segments: number, depth: number): void {
  const base = ringStart[ringIndex];
  for (const sector of sectors) {
    const idx = base + ((sector % segments) + segments) % segments;
    const x = pos.getX(idx);
    const z = pos.getZ(idx);
    pos.setXYZ(idx, x * (1 - depth), pos.getY(idx), z * (1 - depth));
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
const APRICOTS: Record<'a' | 'b' | 'c', ApricotDef> = {
  a: { offset: [-0.78, 0.03], yaw: 0.2 },
  b: { offset: [0.02, -0.06], yaw: -0.35 },
  c: { offset: [0.78, 0.05], yaw: 0.65 },
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

  pullRimWrinkles(pos, ringStart, RIM_RING_INDEX, RIM_WRINKLE_SECTORS, APRICOT_SEGMENTS, RIM_WRINKLE_DEPTH);
  pos.needsUpdate = true;

  jitterVertices(geometry, rng, JITTER_AMP);

  const baked = facet(geometry);
  const counts = bandTriCounts(PROFILE, APRICOT_SEGMENTS);
  // BODY = 밴드 0..3(바닥 극 -> 적도 -> 림 라인), HOLLOW = 밴드 4..6(림 라인 -> 씨 자국 중심).
  const bodyEnd = counts.slice(0, 4).reduce((a, b) => a + b, 0);
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
