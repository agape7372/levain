// 호두 — 단일 회전체 셸(반쪽 알맹이, 두 엽 + 중앙 골). 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/walnut.json(워크스페이스 원본은
// assets/ingredients/work/walnut/). 프로필·오프셋·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// R1(types.ts) 단일체 정본 순서: 한 덩어리 indexed 타원 셸(lib.buildRevolvedShell, 반경만 타원)
// -> 돔 링에 cos(2*theta) Y변조로 두 엽+골 접기 -> jitterVertices -> facet -> 밑단 팬+첫 벽 밴드를
// 림 버킷으로 분리(sliceTriangles). 호두는 방사대칭이 아니라 골 축(로컬 Z)을 기준으로 한
// 양측대칭 -- 올리브/밤의 (ring,sector) 마스크나 buildRevolvedShell 단독으로는 못 낸다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvDome } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/walnut.json geometry.surface 손 전사 (JSON import 금지, types.ts §7).
// "#9A6E42"(원문: 골 안쪽)은 골 색이 아니라 **림(밑단/평평한 테두리) 색으로 재배치**했다 -- 골은
// 오목한 지오메트리라 런타임 키라이트의 N·L 감쇠가 이미 어둡게 만든다(두 번 어둡게 칠하면 과함,
// 올리브의 shaded-underside 패턴과 동일). "#E0C79A"(솟은 능선의 하이라이트)는 볼록한 엽 꼭대기가
// 키라이트를 자연히 더 밝게 받으므로 버킷을 만들지 않는다.
const KERNEL_COLOR = 0xc89b6a; // "a warm tan kernel"
const RIM_COLOR = 0x9a6e42; // 원문 "deeper amber ... folds and grooves" -> 림으로 재배치 (스펙 risk 참조)

// 실측 비율 (assets/ingredients/src/walnut.png 3/4 · walnut-2.png 정면 · walnut-3.png 탑다운).
const SEGMENTS = 18;
const RADIUS_X = 0.44; // 짧은 축 (엽 분리 방향)
const RADIUS_Z = 0.6; // 긴 축 (골 방향), 비율 ~1.36:1 (walnut-3.png 탑다운 실측)
const HEIGHT_SCALE = 0.62; // 림-꼭대기 전체 높이 (~0.68 x 너비, walnut-2.png 정면도 실측)

// (반지름비, 높이비) — heightFrac 0(바닥) .. ~0.84(크라운 극점). advisor 사전 리뷰 교정: 크라운
// 극점이 로브 정점(0.80*0.62+GROOVE_AMP=0.586)보다 높으면 정면 실루엣이 "두 로브 사이 골"이 아니라
// "중앙 단일 피크"로 읽힌다 -- 0.84*0.62=0.521 < 0.586로 반드시 낮게 잡는다.
type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, 0.0], // 바닥 중심 극점
  [1.0, 0.0], // 밑단 테두리 — 평평한 디스크 경계
  [1.0, 0.12], // 림 벽 상단 — 공유 경계 (RIM_TRANSITIONS)
  [0.88, 0.26],
  [0.72, 0.42],
  [0.52, 0.6],
  [0.3, 0.8],
  [0.0, 0.84], // 크라운 극점 — 로브 정점보다 낮게
];
const RIM_TRANSITIONS = 2; // pole->ring1 fan + ring1->ring2 band = 림 버킷

// 두 엽 + 골 접기 — 돔 링(인덱스 3..6)에 지터 전 cos(2*theta) 변조를 Y와 반지름 둘 다에 건다.
// theta=0/180도(세계 +-X, 짧은 축)에서 엽이 위로+바깥으로 부풀고, theta=90/270도(세계 +-Z, 긴
// 축)에서 골이 아래로+안으로 파인다 -- 두 골 자오선이 모든 rFrac에서 x=0을 그려 긴 축 전체를
// 잇는 하나의 연속된 골이 된다. weight는 크라운 쪽으로 갈수록 커지고 림 쪽으로 갈수록 작아진다
// (골 바닥이 평평한 림 벽 아래로 접혀 들어가는 것을 방지).
// cmp-1 판정: Y만 변조(GROOVE_AMP=0.09)했더니 완만한 물결로만 보여 "두 엽+골"이라는 정체성이
// 안 읽혔다(매끈한 갈색 덩어리에 가까움) -- 반지름도 함께 변조해 엽이 옆으로도 부풀게 하고
// 진폭을 크게 올렸다.
// cmp-2 판정: 크라운 쪽(ring5·6)은 뚜렷했지만 림에 가까운 ring3·4의 weight가 낮아 골이 위쪽
// 노치로만 보이고 아래쪽은 다시 뭉친 덩어리로 읽혔다 -- 레퍼런스는 골이 거의 전체 길이를 관통한다.
// 아래쪽 weight를 올려 골이 더 길게 이어지게 한다.
const GROOVE_AMP = 0.16; // Y 변조 진폭
const GROOVE_RADIAL_AMP = 0.22; // 반지름 배율 변조 진폭 (1 +- 이 값 x weight x cos(2t))
const GROOVE_RING_INDICES = [3, 4, 5, 6];
const GROOVE_RING_WEIGHTS = [0.6, 0.85, 1.0, 0.85];

// 전체 요(yaw) — advisor 사전 리뷰: 골을 로컬 Z에 그대로 두면 정면 카메라에서 옆으로만 보인다.
// 레퍼런스(walnut.png)는 골이 프레임을 대각선으로 가로지른다. geometry.rotateY로 구워 GLB
// 자체가 방향을 가지게 한다(types.ts §6 "정면" 규칙).
const YAW_RADIANS = (-32 * Math.PI) / 180;

const JITTER_AMP = 0.016; // ~3.6% of RADIUS_X — R4, olive/chestnut과 동일 비율

function buildWalnut(rng: () => number): { kernelGeo: THREE.BufferGeometry; rimGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, SEGMENTS, HEIGHT_SCALE, () => [RADIUS_X, RADIUS_Z]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  // 두 엽 + 골 변조 — 지터/facet 전, 돔 링에만 적용(림 벽은 평평하게 유지). Y와 반지름(X/Z) 둘 다
  // cos(2t)로 변조해 엽이 위+옆으로 부풀고 골이 아래+안으로 파이게 한다(Y만으로는 완만한 물결로만
  // 읽혔다 — cmp-1 판정).
  for (let wi = 0; wi < GROOVE_RING_INDICES.length; wi++) {
    const ri = GROOVE_RING_INDICES[wi];
    const weight = GROOVE_RING_WEIGHTS[wi];
    const base = ringStart[ri];
    for (let s = 0; s < SEGMENTS; s++) {
      const t = (s / SEGMENTS) * Math.PI * 2;
      const c2t = Math.cos(2 * t);
      const idx = base + s;
      const radialScale = 1 + c2t * GROOVE_RADIAL_AMP * weight;
      pos.setX(idx, pos.getX(idx) * radialScale);
      pos.setZ(idx, pos.getZ(idx) * radialScale);
      pos.setY(idx, pos.getY(idx) + c2t * GROOVE_AMP * weight);
    }
  }

  // 지터 — indexed 상태에서(공유 정점이 함께 움직여야 림/돔 경계가 안 찢어진다, types.ts §5).
  jitterVertices(geometry, rng, JITTER_AMP);

  // 전체 요 — geometry에 굽는다(월드 회전이 아니라 지오메트리 자체 방향으로, 결정론 유지).
  geometry.rotateY(YAW_RADIANS);

  // facet 전 원본 index로 림 트라이앵글 개수 계산 — buildRevolvedShell은 profile 순서 그대로
  // index를 이어붙이므로, 처음 RIM_TRANSITIONS개 전이(극점->밑단 fan, 밑단->림벽상단 band)가
  // 항상 맨 앞 트라이앵글들이다.
  const rimTriangles = SEGMENTS * (1 + 2 * (RIM_TRANSITIONS - 1));
  const baked = facet(geometry);

  const rimGeo = sliceTriangles(baked, 0, rimTriangles);
  const kernelGeo = sliceTriangles(baked, rimTriangles, baked.attributes.position.count / 3);
  uvDome(kernelGeo);
  uvDome(rimGeo);
  return { kernelGeo, rimGeo };
}

export const createWalnut: IngredientBuilder = (rng) => {
  const kernelMat = stdMaterial({ color: KERNEL_COLOR });
  const rimMat = stdMaterial({ color: RIM_COLOR });

  const { kernelGeo, rimGeo } = buildWalnut(rng);

  const group = new THREE.Group();
  group.add(new THREE.Mesh(kernelGeo, kernelMat));
  group.add(new THREE.Mesh(rimGeo, rimMat));

  // 공유 지면 y=0 — 지터가 바닥 정점을 살짝 밀어낼 수 있어 최종 bbox로 스냅한다(types.ts R1).
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
  group.updateMatrixWorld(true);

  return mergeByMaterial(group);
};
