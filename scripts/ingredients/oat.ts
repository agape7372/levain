// 귀리 — 압착 플레이크가 겹겹이 쌓인 더미 + 앞쪽에 분리된 낱장 3장. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/oat.json(워크스페이스 원본은
// assets/ingredients/work/oat/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
// ⚠ v3의 수치는 스펙 JSON에 아직 역전사되지 않았다 — 이 배치의 파일 권한이 `scripts/ingredients/*.ts`
//   뿐이었다. 다음에 스펙을 만질 사람은 v3 상수를 스펙으로 올려라.
//
// 정체성은 "납작하게 눌린 원반"이다 — 통곡 낟알(타원체)이 아니라 얇은 원판+테두리 벽을 가진
// 코인 형태로 짓는다. buildRevolvedShell을 세워서(Y=두께축, X/Z=넓적한 판면) 짓기 때문에
// 올리브/크랜베리처럼 눕히는 rotateZ가 필요 없다 — 프로필의 h축이 이미 "두께"다.
//
// ═══ v3 (2026-08-26, 전체 화면 쇼케이스 파손 수정) ═══
//
// v2는 더미를 **매끈한 단일 돔**으로 지었다(matcha/cinnamon 패턴 재사용). 64px에서는 통했지만
// 전체 화면에서는 셋 다 무너졌다:
//   · az180/225/315에서 돔이 앞 낱장 3장을 삼켜 **귀 두 개 달린 감자**로 읽힌다.
//   · 돔 표면이 완전 단색(넓은 매끈면 = 노멀이 거의 같음)이라 압착 귀리가 아니라 감자 슬라이스·자갈이다.
//
// ★해법은 돔을 손보는 게 아니라 **없애는 것**이다. 레퍼런스(assets/ingredients/src/oat.png)의
// 더미는 처음부터 돔이 아니라 **낱장이 겹겹이 쌓인 무더기**다. 그러니 더미도 낱장으로 짓는다:
// 바닥층 5장 + 윗층 3장, 그리고 그 사이 틈으로 배경이 비치지 않도록 **안쪽에 숨은 채움 돔**을 둔다
// (뚫린 구멍 = 파손 판정 항목이라 112tri짜리 보험이 싸다).
// 이러면 어느 각도에서 돌아도 실루엣이 "겹친 원반들"이라 감자가 될 수 없고, 낱장마다 다른 각도로
// 누워 있어 표면 명암이 저절로 갈린다 — 단색 문제도 같은 수로 풀린다.
//
// 낱장 자체도 고쳤다: 10 → 20세그먼트(전체 화면 실루엣), 프로필 6점 → 8점(모서리 둥글림),
// 그리고 **컬(curl)** — 긴 축 양끝을 들어 올려 "slightly curled edge"(스펙 문구)를 만든다.
// 평평한 원반은 윗면 팬 삼각형이 전부 같은 평면이라 한 톤으로 죽는데, 컬이 그걸 깨뜨린다.
// ⚠ 되돌리지 말 것: 더미를 단일 돔으로 되돌리면 감자가, 세그먼트를 낮추면 각진 원반이 돌아온다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, pickTriangles, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/oat.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0xd7c7a3; // "a warm tan body" — 채움 돔 + 낱장 넓적면
const RIM_COLOR = 0x8f7a54; // "a darker umber edge ridge tracing each flake's curled rim"
// 드롭: 눌린 골 그늘 #B8A47D(N·L 감쇠가 넓적면 가장자리를 공짜로 어둡게 함)와
// 크림 하이라이트 #EDE0C4(림 컬러가 이미 대비를 맡는다 — 4색을 2버킷으로 압축).

type ProfilePoint = readonly [number, number];

// ── 낱장 ─────────────────────────────────────────────────────────────────────
const FRONT_SEGMENTS = 20; // 앞줄 3장 — 가장 크게 보이는 파트라 여기에 세그먼트를 쓴다
const PILE_SEGMENTS = 14; // 더미 구성 낱장 — 서로 가려서 조금 낮춰도 각져 보이지 않는다
const FLAKE_RADIUS = 0.46;
const FLAKE_ASPECT = 0.62; // 타원 종횡비 (Z/X) — 압착 귀리는 원이 아니라 길쭉한 타원(oat.png 실측)
const FLAKE_HALF_HEIGHT = 0.1; // 아주 얇은 원반 — R4: 얇은 파트라 지터를 억제한다(아래)
const FLAKE_JITTER_AMP = 0.006; // R4 — 얇은 파트 지터 축소(빵 크러스트 스케일을 그대로 쓰지 않는다)
// 컬 — 긴 축(±X) 양끝을 들고 짧은 축(±Z) 양옆을 내린다(안장면). 스펙의 "slightly curled edge"이자
// **단색 방지 장치**다: 평평한 윗면은 팬 삼각형 노멀이 전부 같아 한 톤으로 죽는다.
// v3.1: 0.62는 과했다 — 낱장이 그릇·조개껍데기처럼 오목해져 "눌린 원반"이 흐려졌다. 0.36으로 낮춰
// 명암만 갈리고 형태는 납작하게 남긴다.
const FLAKE_CURL = 0.36; // 반두께 대비 비율

// 바닥 극점 -> 아랫면 -> 테두리 벽(링3,4) -> 윗면 -> 위 극점. h는 단조 증가(types.ts §8).
// v3.1: 벽(링3↔4)을 ±0.30 → ±0.44로 키웠다. 이 밴드가 통째로 움버 림이라, 낮으면 테두리 결이
// 안 보여 "완전 단색" 지적이 그대로 남는다.
const FLAKE_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.62, -0.94],
  [0.95, -0.7],
  [1.0, -0.44],
  [1.0, 0.44],
  [0.95, 0.7],
  [0.62, 0.94],
  [0.0, 1.0],
];
// 림 밴드 — 벽 밴드(링3→링4) **하나만**. v2는 정점 마스크(OR-of-3)로 골라서 위아래 테이퍼까지
// 딸려와 낱장의 절반이 움버색이 됐다. 밴드 인덱스로 자르면 정확히 벽만 떨어진다(pancake 선례).
const RIM_BAND = 3;

/** 프로필/세그먼트로부터 밴드 b의 삼각형 구간 [from,to)를 센다 — 극점 밴드는 segments, 나머지는 2×segments. */
function bandTriRange(profile: readonly ProfilePoint[], segments: number, band: number): [number, number] {
  let from = 0;
  for (let b = 0; b < band; b++) {
    const isPole = profile[b][0] <= 1e-6 || profile[b + 1][0] <= 1e-6;
    from += isPole ? segments : segments * 2;
  }
  const isPole = profile[band][0] <= 1e-6 || profile[band + 1][0] <= 1e-6;
  return [from, from + (isPole ? segments : segments * 2)];
}

function buildFlake(rng: () => number, segments: number, radius: number): { bodyGeo: THREE.BufferGeometry; rimGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(FLAKE_PROFILE, segments, FLAKE_HALF_HEIGHT, () => [
    radius,
    radius * FLAKE_ASPECT,
  ]);

  // 컬 — 극점을 뺀 모든 링에 cos(2θ) 높이 오프셋. θ=0(=+X, 긴 축)에서 +, θ=90°(짧은 축)에서 −.
  // ⚠ indexed 상태에서 해야 한다. facet() 뒤에는 같은 정점의 사본끼리 값이 갈려 메시가 찢어진다.
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let ri = 0; ri < FLAKE_PROFILE.length; ri++) {
    if (FLAKE_PROFILE[ri][0] <= 1e-6) continue;
    for (let s = 0; s < segments; s++) {
      const i = ringStart[ri] + s;
      const t = (s / segments) * Math.PI * 2;
      pos.setY(i, pos.getY(i) + FLAKE_CURL * FLAKE_HALF_HEIGHT * Math.cos(2 * t));
    }
  }
  pos.needsUpdate = true;

  jitterVertices(geometry, rng, FLAKE_JITTER_AMP);

  const baked = facet(geometry);
  const [rimFrom, rimTo] = bandTriRange(FLAKE_PROFILE, segments, RIM_BAND);
  const total = baked.attributes.position.count / 3;
  const rimTris: number[] = [];
  const bodyTris: number[] = [];
  for (let t = 0; t < total; t++) (t >= rimFrom && t < rimTo ? rimTris : bodyTris).push(t);

  const rimGeo = pickTriangles(baked, rimTris);
  const bodyGeo = pickTriangles(baked, bodyTris);
  uvTopPlanar(rimGeo);
  uvTopPlanar(bodyGeo);
  return { bodyGeo, rimGeo };
}

// ── 채움 돔 ───────────────────────────────────────────────────────────────────
// 낱장 더미 **안쪽**에 숨는 낮은 돔. 낱장 사이 틈으로 배경이 비치는 것(=뚫린 구멍)만 막는 보험이라
// 낱장보다 낮고 좁게 잡는다. 이게 보이기 시작하면 v2의 감자가 돌아온 것이니 반지름을 줄여라.
const FILL_SEGMENTS = 16;
const FILL_RADIUS = 0.42;
const FILL_HALF_HEIGHT = 0.15;
const FILL_JITTER_AMP = 0.012;
const FILL_PROFILE: readonly ProfilePoint[] = [
  [0.9, -1.0],
  [1.0, -0.4],
  [0.86, 0.25],
  [0.5, 0.72],
  [0.0, 1.0],
];

function buildFill(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(FILL_PROFILE, FILL_SEGMENTS, FILL_HALF_HEIGHT, () => [FILL_RADIUS, FILL_RADIUS]);
  jitterVertices(geometry, rng, FILL_JITTER_AMP);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

// ── 배치 ─────────────────────────────────────────────────────────────────────
function placeAndGround(child: THREE.Object3D, offset: readonly [number, number], yaw: number): THREE.Group {
  const sub = new THREE.Group();
  sub.add(child);
  sub.rotation.set(0, yaw, 0);
  sub.position.set(offset[0], 0, offset[1]);
  sub.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sub);
  sub.position.y -= box.min.y;
  return sub;
}

/** 더미 구성 낱장 — 높이를 명시로 준다(층층이 파묻히므로 개별 접지하면 안 된다). */
function placeAt(child: THREE.Object3D, x: number, y: number, z: number, yaw: number, tiltX: number, tiltZ: number): THREE.Group {
  const sub = new THREE.Group();
  sub.add(child);
  sub.rotation.set(tiltX, yaw, tiltZ);
  sub.position.set(x, y, z);
  return sub;
}

interface PileDef {
  angle: number; // 더미 중심에서의 방위(rad)
  dist: number;
  y: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
}
// 바닥층 5장(방사형) + 윗층 3장(안쪽·더 높이). 윗층은 아랫층 두께의 30~50%만큼 파묻혀
// 낱장끼리 관통한다 — 관통은 안 보이고 **틈이 보이면 파손**이다(advisor 지적).
const PILE: readonly PileDef[] = [
  { angle: 0.0, dist: 0.24, y: 0.03, yaw: 0.35, tiltX: 0.16, tiltZ: -0.1 },
  { angle: 1.257, dist: 0.26, y: 0.02, yaw: -0.9, tiltX: -0.12, tiltZ: 0.17 },
  { angle: 2.513, dist: 0.25, y: 0.04, yaw: 1.5, tiltX: 0.1, tiltZ: 0.14 },
  { angle: 3.77, dist: 0.26, y: 0.02, yaw: 2.4, tiltX: -0.15, tiltZ: -0.12 },
  { angle: 5.027, dist: 0.24, y: 0.03, yaw: -2.0, tiltX: 0.13, tiltZ: 0.1 },
  { angle: 0.7, dist: 0.13, y: 0.17, yaw: 0.9, tiltX: 0.2, tiltZ: 0.12 },
  { angle: 2.8, dist: 0.14, y: 0.16, yaw: -1.7, tiltX: -0.18, tiltZ: 0.2 },
  { angle: 4.9, dist: 0.12, y: 0.18, yaw: 2.9, tiltX: 0.14, tiltZ: -0.2 },
];

interface FlakeDef {
  offset: readonly [number, number];
  yaw: number;
}
// oat.png/-2/-3 실측: 앞쪽 3장이 서로 다른 각도로 흩어져 놓인다. 오프셋은 더미 밑동과
// 안 겹치게(R1) 짧게 유지 — 빈 공간이 늘면 리핏 확대로 64px에서 더 작아진다.
const FLAKES: Record<'a' | 'b' | 'c', FlakeDef> = {
  a: { offset: [-0.6, 0.72], yaw: 0.4 },
  b: { offset: [0.06, 0.94], yaw: -0.55 },
  c: { offset: [0.66, 0.7], yaw: 1.15 },
};

export const createOat: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const rimMat = stdMaterial({ color: RIM_COLOR });

  const cluster = new THREE.Group();

  // 더미 — 채움 돔 위에 낱장 8장을 층층이. 전체를 한 그룹으로 묶어 **마지막에 한 번만** 접지한다
  // (개별 접지하면 층이 무너져 전부 바닥에 눕는다).
  const heap = new THREE.Group();
  heap.add(new THREE.Mesh(buildFill(rng), bodyMat));
  for (const p of PILE) {
    const { bodyGeo, rimGeo } = buildFlake(rng, PILE_SEGMENTS, FLAKE_RADIUS);
    const flake = new THREE.Group();
    flake.add(new THREE.Mesh(bodyGeo, bodyMat));
    flake.add(new THREE.Mesh(rimGeo, rimMat));
    heap.add(placeAt(flake, Math.cos(p.angle) * p.dist, p.y, Math.sin(p.angle) * p.dist, p.yaw, p.tiltX, p.tiltZ));
  }
  cluster.add(placeAndGround(heap, [0, 0], 0.15));

  (Object.keys(FLAKES) as (keyof typeof FLAKES)[]).forEach((key) => {
    const def = FLAKES[key];
    const { bodyGeo, rimGeo } = buildFlake(rng, FRONT_SEGMENTS, FLAKE_RADIUS);
    const flake = new THREE.Group();
    flake.add(new THREE.Mesh(bodyGeo, bodyMat));
    flake.add(new THREE.Mesh(rimGeo, rimMat));
    cluster.add(placeAndGround(flake, def.offset, def.yaw));
  });

  return mergeByMaterial(cluster);
};
