// 크랜베리 — 납작 타원 6알 군집. 계약은 types.ts 주석이 정본. 재료 배치B 2번째.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/cranberry.json(워크스페이스 원본은
// assets/ingredients/work/cranberry/). 프로필·오프셋·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★blueberry와의 대비가 이 배치의 핵심 난제(팀리드 지시): 크랜베리=쭈글·납작·타원,
// 블루베리=매끈·구형·왕관. 크랜베리는 (a) radialScale로 납작하게(FLATTEN_X<1) (b) 눕히기 전
// (ring,sector) 격자를 축 쪽으로 당겨 접힘 주름을 새긴다. 주름을 극점에서 방사형으로 내면
// pumpkin(같은 배치의 다른 재료)과 헷갈린다 — 반드시 눕히기 전에 "긴 축과 나란한" 주름을 새기고
// 그 다음 눕힌다(올리브의 캡 마스크 좌표계 교훈을 색이 아니라 깊이에 적용).
//
// R1(types.ts) 군집 정본: 알 1개 = 한 덩어리 indexed 셸(lib.buildRevolvedShell) ->
// (ring,sector) 격자를 축으로 당겨 주름 조각 -> jitterVertices -> rotateZ(-90deg) 눕히기 ->
// facet. 올리브와 순서가 다르다(주름은 눕히기 **전** 좌표계에서 판정 — CRIB "마스크 판정은
// 회전을 지오메트리에 구운 뒤 그 좌표계에서" 규칙의 역: 여기선 주름이 색이 아니라 깊이라 회전
// 전에 세워진 좌표계에서 판정해야 sectorCenter가 눕힌 뒤 "위"를 향한다는 올리브 공식이 그대로
// 성립한다). 알끼리 정점 공유 없음 — 알마다 독립 셸을 짓고 mesh 변환으로 배치.
//
// 색 버킷: 프롬프트 hex 3개(#B3324A 몸통 / #8E2438 주름 그늘 / #D9707F 상면 홍조) 중 2개를
// 드롭한다 — 주름 그늘은 이제 실제 지오메트리(조각된 홈)라 페이싯 노멀이 공짜로 어둡게 하고
// (cracker의 도킹홀과 같은 메커니즘), 홍조는 올리브/초코 선례의 N·L 상면 하이라이트.
// 결과: mesh=1(머티리얼 1개) — choco와 함께 이 배치에서 가장 단순한 색 예산.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/cranberry.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0xb3324a; // "a deep saturated crimson body"

// 실측 비율 (assets/ingredients/src/cranberry.png 3/4 · cranberry-2.png 정면 · cranberry-3.png 탑다운).
// 절대 스케일은 무의미 — 런타임이 군집 전체 최장축을 1.6으로 리핏한다 (types.ts §6).
// v4: 알을 6개 → 3개로 줄이면서 반지름을 키웠다(0.5 → 0.62). 개수를 줄이기만 하면 프레임이
// 비어 리핏이 확대해 버리고, 그러면 "작은 열매 여럿"이라는 인상이 사라진다 — 크기로 채운다.
const CRANBERRY_RADIUS = 0.62;
const CRANBERRY_HALF_LENGTH = 0.69; // length:width ~= 1.12:1 유지 — 통통하고 살짝만 길쭉 (cranberry-3.png)
const CRANBERRY_SEGMENTS = 10;

type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.65, -0.85],
  [0.95, -0.45],
  [1.0, 0.0],
  [0.95, 0.45],
  [0.65, 0.85],
  [0.0, 1.0],
];

const FLATTEN_X = 0.68; // radialScale sx — 눕힌 뒤 world-up이 되는 축, 납작함(R4).
// v2(cmp-1 판정 후): 0.75는 레퍼런스보다 덜 납작해 보였다 — 0.68로 더 눌렀다.
const JITTER_AMP = 0.016; // ~3.2% of CRANBERRY_RADIUS — olive 비율과 일치

// 주름 — sectorCenter(=segments/2)가 눕힌 뒤 "위"를 향한다(올리브 캡 공식과 동일 좌표계,
// CRIB: 마스크/변위 판정은 좌표 임계값이 아니라 격자 인덱스로). 주 주름은 중심이 가장 깊고
// 양옆으로 얕아지는 테이퍼(균일 깊이 3섹터는 cmp-1에서 넓고 얕은 뭉툭한 홈으로 뭉개져
// "주름 선"으로 안 읽혔다 — v2: 테이퍼로 뾰족한 골 하나를 만든다). 보조 주름은 알마다 rng로
// 고른 1섹터 — "each slightly wrinkled"의 알별 변주.
// v3(cmp-2 판정 후): 3섹터 균등 테이퍼(0.22/0.42/0.22)는 완만한 깔때기형 핀치로 뭉개져
// 페이싯 명암 대비가 약했다 — 중심 1섹터를 훨씬 깊게(0.6), 양옆은 거의 원래 높이(0.08)로
// 남겨 급격한 V자 골을 만든다. 급경사면이 키라이트 반대쪽을 향해 확실한 음영 대비를 낸다.
const SECTOR_CENTER = Math.floor(CRANBERRY_SEGMENTS / 2); // = 5
const CREASE_PRIMARY: readonly (readonly [number, number])[] = [
  [SECTOR_CENTER - 1, 0.08],
  [SECTOR_CENTER, 0.6],
  [SECTOR_CENTER + 1, 0.08],
];
const CREASE_SECONDARY_DEPTH = 0.34;

interface BerryDef {
  offset: readonly [number, number]; // world XZ
  yaw: number; // world Y 회전
  tiltZ: number; // 추가 world Z 회전 (알별 변주, olive-a 패턴)
}

// assets/ingredients/work/cranberry/object-sculpt-spec.json BERRIES 전사.
//
// ★v4 (2026-08-26, 64px 판독 실패 수정): 알 **6개 → 3개**, 간격 확대.
// 6개를 2줄로 촘촘히 놓으니 64px 다운샘플에서 개별 경계가 전부 사라지고 **붉은 얼룩 하나**로
// 뭉쳤다("과일"이라는 인상 자체가 약했다). tri·KB·roundtrip은 다 통과한 상태였는데도 그랬다 —
// 숫자 예산이 판독을 보증하지 않는다는 CRIB 최종 게이트가 정확히 이 사례다.
//
// 고친 방향은 폴리곤이 아니라 **실루엣**이다(CRIB 규칙 그대로): 개수를 줄이고 하나를 키우고,
// 알 사이에 네거티브 스페이스를 확보해 경계가 축소본에서도 살아남게 했다.
// 같은 군집 재료들이 전부 3개인 것과도 맞다(olive 3알 · blueberry 3알 · cheese 3큐브).
// 납작함(FLATTEN_X)과 V자 주름은 그대로 — 블루베리(매끈·구형·왕관)와의 형태 대비가 정체성이다.
const BERRIES: Record<'a' | 'b' | 'c', BerryDef> = {
  a: { offset: [-0.78, -0.20], yaw: 0.35, tiltZ: 0.0 },
  b: { offset: [0.78, -0.12], yaw: 1.1, tiltZ: 0.0 },
  c: { offset: [0.0, 0.72], yaw: -0.7, tiltZ: 0.14 },
};

/**
 * (ring, sector) 격자 정점을 로컬 축(old X,Z — 눕히기 전) 쪽으로 당겨 주름 홈을 새긴다.
 * 극점(ri=0, 마지막)은 제외 — 극점을 당기면 셸 전체가 찌그러진다. 지터·눕히기 전, indexed
 * 상태에서 호출(공유 정점이 함께 움직여야 이웃 링과 안 찢어진다, types.ts §5).
 */
function pullCrease(pos: THREE.BufferAttribute, ringStart: number[], sector: number, depth: number): void {
  for (let ri = 1; ri < ringStart.length - 1; ri++) {
    const base = ringStart[ri];
    const idx = base + ((sector % CRANBERRY_SEGMENTS) + CRANBERRY_SEGMENTS) % CRANBERRY_SEGMENTS;
    const x = pos.getX(idx);
    const z = pos.getZ(idx);
    pos.setXYZ(idx, x * (1 - depth), pos.getY(idx), z * (1 - depth));
  }
}

/**
 * 알 1개 = 회전체 셸(납작 타원, radialScale sx=FLATTEN_X) + 주름 홈(눕히기 전 격자 인덱스로
 * 당김) + 지터 + 눕히기(rotateZ) + 페이싯. 올리브와 순서 차이: 주름은 색이 아니라 깊이라
 * 눕히기 **전** 좌표계에서 판정해야 sectorCenter가 눕힌 뒤 "위"를 향한다.
 */
function buildBerry(rng: () => number): THREE.BufferGeometry {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, CRANBERRY_SEGMENTS, CRANBERRY_HALF_LENGTH, () => [
    CRANBERRY_RADIUS * FLATTEN_X,
    CRANBERRY_RADIUS,
  ]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  for (const [sector, depth] of CREASE_PRIMARY) pullCrease(pos, ringStart, sector, depth);
  const secondarySector = Math.floor(rng() * CRANBERRY_SEGMENTS);
  pullCrease(pos, ringStart, secondarySector, CREASE_SECONDARY_DEPTH);
  pos.needsUpdate = true;

  // 눕히기: rotateZ(-90deg) => new_x = old_y, new_y = -old_x. 장축이 로컬 X로, FLATTEN_X가
  // 적용된 축(old X)이 로컬 Y("위")가 된다 — 주름은 이미 이 축 쪽으로 당겨져 있었으므로
  // 눕힌 뒤에도 "위"를 향한다(올리브의 sectorCenter 공식과 동일 좌표계).
  geometry.rotateZ(-Math.PI / 2);

  // 지터 — indexed 상태에서(공유 정점이 함께 움직여야 안 찢어진다, types.ts §5).
  jitterVertices(geometry, rng, JITTER_AMP);

  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

export const createCranberry: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const cluster = new THREE.Group();

  (Object.keys(BERRIES) as (keyof typeof BERRIES)[]).forEach((key) => {
    const def = BERRIES[key];
    const geo = buildBerry(rng);

    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(geo, bodyMat));

    sub.rotation.set(0, def.yaw, def.tiltZ);
    sub.position.set(def.offset[0], 0, def.offset[1]);

    // 공유 지면 y=0 — 이 알만의 회전 후 bbox를 구해 바닥을 원점에 맞춘다(types.ts R1).
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;

    cluster.add(sub);
  });

  return mergeByMaterial(cluster);
};
