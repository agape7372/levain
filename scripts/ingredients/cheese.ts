// 치즈 — 둥글린 큐브 3개 물리적 스택. 계약은 types.ts 주석이 정본. 재료 배치B 4번째(마지막).
//
// 유래: img2threejs 스펙 assets/ingredients/specs/cheese.json(워크스페이스 원본은
// assets/ingredients/work/cheese/). 수치·색은 그 스펙(author_spec.py)의 전사이며, 수치를 고칠
// 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// 이 배치에서 유일한 박스 계열 재료(올리브/초코/크랜베리/블루베리는 전부 lathe). buildRevolvedShell
// 재사용 불가 — 큐브 6면을 직접 짓는다. 모서리 라운딩은 sdRoundBox 표면점 공식(순수 위치 함수)을
// 정점마다 적용 — 인접 면이 공유하는 모서리/꼭짓점 정점은 좌표가 같으므로 동일하게 매핑돼
// **인덱스 공유 없이도** 이음매가 안 벌어진다(6면을 독립 그리드로 지어도 안전).
//
// ⚠ 지터 생략(R4 예외): 6면이 정점을 공유하지 않는 독립 그리드라 jitterVertices를 걸면 같은
// 위치의 이웃 면 정점이 다른 난수를 받아 모서리가 찢어진다(팀리드가 지적한 함정). 웰디드 단일
// 인덱스로 다시 짓는 대신 **지터 자체를 생략**한다 — 레퍼런스도 표면이 완전히 매끈해 지터가
// 애초에 불필요(risk rounding-seam-tear-if-jittered 참조).
//
// 색 버킷: 프롬프트 hex 4개(#E8B75A 몸통 / #C9903A 그늘진 면 / #C0562F 테두리 rind / #D8A448 구멍)
// 중 2개를 드롭한다 — 그늘진 면은 평평한 큐브 면들이 방향마다 다른 N·L 밝기를 이미 공짜로 내고
// (올리브 교훈을 곡면 대신 평면에 적용), 구멍은 cracker의 도킹홀처럼 순수 함몰(무색). 남는 2버킷:
// 몸통(5면) + rind(1면, +X). ★rind는 프롬프트 산문("한쪽 모서리를 따라 얇은 띠")과 달리 실제
// 레퍼런스에서 면 하나 전체가 칠해져 있다 — 이미지가 형태 정본이라 면 전체로 짓는다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { facet, mergeByMaterial, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/cheese.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0xe8b75a; // "a rich butter-yellow body"
const RIND_COLOR = 0xc0562f; // "a thin warm wax rind" — 실측은 면 전체(레퍼런스 정본)

const CUBE_HALF = 0.5;
// 디버그 이력(cmp-1~3 상한 소진 + 이후 shot-*-debug.png들로 계속 추적, 전부 파일명 감사 흔적으로
// 남김): 처음 본 지그재그는 홀 위치를 반대쪽 코너로 옮겨도(v2), 앞면만 촘촘한 격자를 써도(v3
// SEGMENTS_FRONT=6), 라운딩 반지름을 낮춰도(0.13->0.085) 안 없어졌다. 전 면 SEGMENTS=5로
// 통일해 T-접합 가설도 검증했지만(shot-uniform-debug.png) 그대로였다 — **격리 테스트**
// (shot-isolation-debug.png, 두 홀 깊이를 0으로)로 확정: 원인은 홀 함몰 그 자체였다. 정점을
// 당겨 만드는 함몰은(정점 1개든 2x2 블록이든 동일하게) 주변 평면과의 경계에서 벽 삼각형 노멀이
// 급격히 꺾이고, 그 급경사가 오블리크 카메라에서 지그재그 명암으로 읽힌다 — cracker.ts 도킹홀이
// 매끈한 건 16x16의 훨씬 촘촘한 격자로 깊이/셀폭 비가 작기 때문이라 이 예산에서는 못 따라간다.
// 최종 해법은 지오메트리 구조가 아니라 **깊이를 얕게**(shot-shallow/-mid-debug.png로 재조정) —
// 2x2 블록(벽 4변 기울기가 균일해 정점 1개보다는 낫다)과 얕은 깊이를 함께 쓴다.
const ROUND_RADIUS = 0.1; // 반폭 대비 20%
// SEGMENTS=4(576tri, 목표 안)로는 라운딩 안 먹는 내부 정점이 3x3(1..3)뿐이라 2x2 블록 두 개를
// 라운딩 테두리에 안 닿고 서로도 안 겹치게 뗄 자리가 없었다 — 앞면(구멍용)만 5로 올려 내부를
// 4x4(1..4)로 넓힌다. 나머지 5면은 구멍이 없으니 4로 충분(전 면을 5로 통일한 실측에서도
// 지그재그가 안 없어졌다 — 즉 면 간 격자 밀도 불일치는 무해하다고 확정됐다, 위 디버그 이력).
// 630tri(목표 300~700 안) — 앞면만 올려 800->630으로 되돌렸다.
const SEGMENTS_PLAIN = 4; // 몸통·rind 등 구멍 없는 5면
const SEGMENTS_FRONT = 5; // 앞면(+Z, 구멍) 전용
const HOLE_DEPTH_BIG = 0.038; // 얕게(위 디버그 이력) — 0.07/0.05는 지그재그, 0.025/0.018은
const HOLE_DEPTH_SMALL = 0.028; // 거의 안 보임. 이 값이 가독성/매끈함 중간 지점(shot-mid-debug.png).
// 앞면(+Z) 내부 격자 앵커(2x2 블록의 좌하 정점, i,j는 1..SEGMENTS-2, 라운딩 테두리 제외) — 큰
// 구멍 좌상, 작은 구멍 우하(cheese.png 실측). 두 블록의 영향 범위가 안 겹치는 반대쪽 코너.
const HOLE_BIG: readonly [number, number] = [1, 3];
const HOLE_SMALL: readonly [number, number] = [3, 1];

type Axis = 'x' | 'y' | 'z';
interface FaceDef {
  readonly n: Axis; // 법선 축
  readonly nSign: 1 | -1;
  readonly u: Axis; // 격자 i 방향 축
  readonly uSign: 1 | -1;
  readonly v: Axis; // 격자 j 방향 축
  readonly vSign: 1 | -1;
  readonly rind?: boolean;
  readonly holes?: boolean;
}

// N = U x V(우수 좌표계, 바깥 방향 노멀 보장) — 각 면별로 검산됨(head 주석 없이 표 자체가 근거,
// 렌더에서 face 유실이 없으면 와인딩이 맞다는 뜻).
// v2(cmp-1 판정 후): rind를 +X에 뒀더니 하네스 히어로 카메라(-1.6,2.2,2.6 — 음수 X쪽에서 봄)가
// 정확히 반대쪽(-X)만 비춰서 rind가 3알 다 안 보였다. -X로 옮긴다.
const FACES: readonly FaceDef[] = [
  { n: 'x', nSign: 1, u: 'z', uSign: -1, v: 'y', vSign: 1 }, // +X
  { n: 'x', nSign: -1, u: 'z', uSign: 1, v: 'y', vSign: 1, rind: true }, // -X — rind, 카메라 쪽
  { n: 'y', nSign: 1, u: 'x', uSign: 1, v: 'z', vSign: -1 }, // +Y top
  { n: 'y', nSign: -1, u: 'x', uSign: 1, v: 'z', vSign: 1 }, // -Y bottom
  { n: 'z', nSign: 1, u: 'x', uSign: 1, v: 'y', vSign: 1, holes: true }, // +Z front — 구멍
  { n: 'z', nSign: -1, u: 'x', uSign: -1, v: 'y', vSign: 1 }, // -Z back
];

function setAxis(v: THREE.Vector3, axis: Axis, value: number): void {
  if (axis === 'x') v.x = value;
  else if (axis === 'y') v.y = value;
  else v.z = value;
}

/**
 * sdRoundBox 표면점 공식 — 순수 위치 함수라 같은 좌표의 정점(인접 면이 공유하는 모서리/꼭짓점)은
 * 항상 같은 결과로 매핑된다. 면 내부(모서리에서 ROUND_RADIUS보다 먼 정점)는 그대로 통과한다.
 */
function roundBoxVertex(p: THREE.Vector3, half: number, r: number): THREE.Vector3 {
  const inner = half - r;
  const cx = THREE.MathUtils.clamp(p.x, -inner, inner);
  const cy = THREE.MathUtils.clamp(p.y, -inner, inner);
  const cz = THREE.MathUtils.clamp(p.z, -inner, inner);
  const d = new THREE.Vector3(p.x - cx, p.y - cy, p.z - cz);
  const len = d.length() || 1;
  return new THREE.Vector3(cx, cy, cz).addScaledVector(d, r / len);
}

/** 면 1개 = (S+1)x(S+1) indexed 격자 -> 라운딩 -> (앞면이면) 구멍 함몰 -> facet. */
function buildFace(def: FaceDef, S: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let j = 0; j <= S; j++) {
    for (let i = 0; i <= S; i++) {
      const p = new THREE.Vector3();
      setAxis(p, def.n, def.nSign * CUBE_HALF);
      setAxis(p, def.u, def.uSign * ((i / S) * 2 - 1) * CUBE_HALF);
      setAxis(p, def.v, def.vSign * ((j / S) * 2 - 1) * CUBE_HALF);
      const rounded = roundBoxVertex(p, CUBE_HALF, ROUND_RADIUS);
      positions.push(rounded.x, rounded.y, rounded.z);
    }
  }

  if (def.holes) {
    // 2x2 정점 블록을 같은 깊이로 당겨 평평한 바닥의 분지를 만든다 — 정점 1개짜리 뾰족한 각뿔은
    // 벽 삼각형 노멀이 서로 크게 벌어져 오블리크 카메라에서 지그재그로 읽혔다(헤드 주석 디버그
    // 이력 참조). 블록 바닥은 평평(노멀 균일)하고 벽면 기울기도 네 변이 고르다.
    const pushBlock = (anchor: readonly [number, number], depth: number) => {
      const [i0, j0] = anchor;
      for (const j of [j0, j0 + 1]) {
        for (const i of [i0, i0 + 1]) {
          const idx = j * (S + 1) + i;
          const p = new THREE.Vector3(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]);
          setAxis(p, def.n, def.nSign * (CUBE_HALF - depth));
          positions[idx * 3] = p.x;
          positions[idx * 3 + 1] = p.y;
          positions[idx * 3 + 2] = p.z;
        }
      }
    };
    pushBlock(HOLE_BIG, HOLE_DEPTH_BIG);
    pushBlock(HOLE_SMALL, HOLE_DEPTH_SMALL);
  }

  const index: number[] = [];
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const a = j * (S + 1) + i;
      const b = j * (S + 1) + i + 1;
      const c = (j + 1) * (S + 1) + i;
      const d = (j + 1) * (S + 1) + i + 1;
      // U,V,N 우수 조합이라 (i,j)->(i+1,j)->(i+1,j+1)->(i,j+1) 순회가 바깥 방향 CCW.
      index.push(a, b, d);
      index.push(a, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  // 지터 없음(R4 예외, 헤드 주석 참조) — indexed에서 바로 facet.
  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

interface CubeDef {
  offset: readonly [number, number]; // world XZ
  yaw: number;
  stacked: boolean;
}

// assets/ingredients/work/cheese/object-sculpt-spec.json CUBES 전사.
const CUBES: Record<'bottomA' | 'bottomB' | 'top', CubeDef> = {
  bottomA: { offset: [-0.58, -0.05], yaw: -0.12, stacked: false },
  bottomB: { offset: [0.58, 0.05], yaw: 0.15, stacked: false },
  top: { offset: [0.0, -0.15], yaw: 0.55, stacked: true },
};

export const createCheese: IngredientBuilder = () => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const rindMat = stdMaterial({ color: RIND_COLOR });
  const cluster = new THREE.Group();
  const subGroups: Record<string, THREE.Group> = {};

  (Object.keys(CUBES) as (keyof typeof CUBES)[]).forEach((key) => {
    const def = CUBES[key];
    const sub = new THREE.Group();
    for (const face of FACES) {
      const geo = buildFace(face, face.holes ? SEGMENTS_FRONT : SEGMENTS_PLAIN);
      sub.add(new THREE.Mesh(geo, face.rind ? rindMat : bodyMat));
    }
    sub.rotation.set(0, def.yaw, 0);
    sub.position.set(def.offset[0], 0, def.offset[1]);
    subGroups[key] = sub;
  });

  // 바닥 두 큐브 — 각자 회전 후 bbox 바닥을 world y=0에 맞춘다(types.ts R1, 대부분의 재료와 동일).
  for (const key of ['bottomA', 'bottomB'] as const) {
    const sub = subGroups[key];
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;
    cluster.add(sub);
  }

  // 윗 큐브 — ★이 재료만의 예외: world y=0이 아니라 "바닥 두 큐브의 결합 bbox 위"에 얹는다
  // (진짜 물리적 스택, CRIB의 flat-mound 관례와 다름 — object-sculpt-spec.json risk
  // stack-not-flat-mound 참조). 두 바닥 큐브를 먼저 배치한 뒤 그 Box3.max.y를 측정해서 쓴다.
  const lowerBox = new THREE.Box3();
  lowerBox.union(new THREE.Box3().setFromObject(subGroups.bottomA));
  lowerBox.union(new THREE.Box3().setFromObject(subGroups.bottomB));
  const topSub = subGroups.top;
  topSub.updateMatrixWorld(true);
  const topBoxLocal = new THREE.Box3().setFromObject(topSub);
  topSub.position.y += lowerBox.max.y - topBoxLocal.min.y;
  cluster.add(topSub);

  return mergeByMaterial(cluster);
};
