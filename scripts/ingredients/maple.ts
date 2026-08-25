// 메이플 — 단풍잎 모양 슈거 캔디 3개. 계약은 types.ts 주석이 정본. 재료 배치4 2번째.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/maple.json(워크스페이스 원본은
// assets/ingredients/work/maple/). 외곽선·색은 전부 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★이 배치의 유일한 비원형 실루엣 — buildRevolvedShell(원형 회전체 전용) 재사용 불가. 잎 외곽선
// (10점: 뾰족점 5 + 골 5, 비원형)을 직접 손으로 짓는다(cheese.ts처럼 손수 정점/인덱스 배열).
//
// ★설계 변경 이력(중요): 레퍼런스(maple.png)는 테두리가 안쪽 평면보다 실제로 솟은 진짜 2단(rim
// 단차 + 베벨벽) 구조를 보여준다 — 처음엔 그렇게 지었다. 그런데 R1-R2(테두리)/R2-R3(베벨)/R3-center
// (안쪽 팬) 3단 링 구조에서, 뾰족점 근처 특정 각도(카메라 방향에 가까운 뾰족점 1개)에 배경색이
// 그대로 뚫려 보이는 결함이 발생했다 — cmp 3회 상한 소진 + DoubleSide/와이어프레임/슬라이스 우회/
// 밴드별 격리 렌더(rim-top만/베벨+안쪽만/베벨 제거 등) 다중 진단으로 각 밴드가 개별로는 전부
// 올바른 와인딩(외적 전수 검사 통과)과 비퇴화 삼각형(면적>0 전수 확인)임을 확인했음에도 원인을
// 100% 특정하지 못했다(risk hairline-seam-root-cause-undetermined). 베벨 단차를 2배로 키워도
// 안 없어져 "벽이 너무 얇아 서브픽셀"이라는 가설도 기각됐다.
// **실용적 해법**: 베벨벽(R2-R3 전이) 자체를 없앤다 — 테두리 상판과 안쪽 평면을 **같은 높이**
// (TOP_Y)에서 만나게 해 문제의 밴드를 아예 제거했다. 색 경계(2 버킷)는 그대로 유지하되, "솟은
// 테두리"라는 3D 단차 연출은 포기한다 — 레퍼런스 대비 정직한 절충(risk rim-step-simplified-to-flat).
// 잎맥(vein)은 여전히 3번째 색이 아니라 — chestnut.ts CREASE를 **5개 방향(각 뾰족점)**으로 일반화한
// 정점 함몰이다: 안쪽 평면의 부채꼴 팬을 뾰족점마다 중심-뾰족점 스포크에서 쪼개 vein-mid 정점을
// 살짝 눌러 골을 만든다 — 색 버킷 추가 없이 페이싯 명암 대비로만 표현.
//
// 와인딩: OUTLINE의 각도가 인덱스 증가에 따라 "감소"한다(90->62->34->...). 테두리 상판/안쪽 팬은
// "자연 순서"(외곽->안쪽, center->다음점)가 이미 +Y를 낸다(외적으로 실측), 바닥 팬은 자연 순서가
// 이미 -Y라 그대로 쓴다, 옆벽은 buildRevolvedShell의 검증된 (a0,b0) 링 전이 패턴을 그대로 쓴다
// (바깥 방향 법선 보장, lib.ts 헤더 주석 근거).
//
// R4: 지터 전면 생략 — 얇고 뾰족한 5갈래 로브가 이 예산에서 작은 무작위 흔들림도 못 견딘다
// (cheese의 박스 모서리 지터 생략과 같은 예외 부류).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { facet, mergeByMaterial, sliceTriangles, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/maple.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
// "#8F6224"(잎맥 골)·"#D9A85C"(도드라진 면 하이라이트)는 버킷을 안 만든다 — 잎맥은 진짜 정점 함몰
// (아래 VEIN_DIP)로, 하이라이트는 안쪽 평면 자체의 페이싯 N·L 감쇠로 이미 공짜.
const RIM_COLOR = 0xe8c787; // "a light cream edge ... tracing the leaf's thin candy rim"
const BODY_COLOR = 0xb8823a; // "a warm caramel-tan body"

// 외곽선 — 10점(뾰족점 5 + 골 5), 메인 뾰족점(90°) 축에 대해 좌우 대칭. angle은 표준 수학 관례
// (0°=+X, CCW), r은 LEAF_RADIUS 대비 비율. assets/ingredients/src/maple-3.png 탑다운 실측.
interface OutlinePoint {
  readonly angleDeg: number;
  readonly r: number;
  readonly tip: boolean;
}
const OUTLINE: readonly OutlinePoint[] = [
  { angleDeg: 90, r: 1.0, tip: true }, // 메인 뾰족점
  { angleDeg: 62, r: 0.55, tip: false },
  { angleDeg: 34, r: 0.82, tip: true }, // 오른쪽 위 뾰족점
  { angleDeg: 0, r: 0.42, tip: false },
  { angleDeg: -34, r: 0.58, tip: true }, // 오른쪽 아래(밑동) 뾰족점
  { angleDeg: -90, r: 0.2, tip: false }, // 꼭지 자리 골(가장 깊다 — 바닥 중앙)
  { angleDeg: -146, r: 0.58, tip: true }, // 왼쪽 아래(밑동) 뾰족점
  { angleDeg: -180, r: 0.42, tip: false },
  { angleDeg: -214, r: 0.82, tip: true }, // 왼쪽 위 뾰족점
  { angleDeg: -242, r: 0.55, tip: false },
];
const N = OUTLINE.length; // 10

const LEAF_RADIUS = 0.42;
const TOP_Y = 0.05; // 테두리·안쪽 평면 공통 높이(베벨벽 제거 — 헤더 주석 설계 변경 이력)
const BOTTOM_Y = -0.05;
const INNER_SCALE = 0.78; // 안쪽 링 반지름 = 외곽선 반지름 * 이 값 — 테두리 밴드 폭
const VEIN_FRAC = 0.55; // 중심->뾰족점 스포크에서 vein-mid 정점 위치
const VEIN_DIP = 0.016; // vein-mid의 추가 Y 함몰 — 잎맥 골

function outlinePos(p: OutlinePoint, radiusScale: number, y: number): THREE.Vector3 {
  const rad = (p.angleDeg * Math.PI) / 180;
  const r = p.r * LEAF_RADIUS * radiusScale;
  return new THREE.Vector3(Math.cos(rad) * r, y, Math.sin(rad) * r);
}

/**
 * 캔디 1개 = 손수 지은 인덱스 지오메트리. 빌드 순서: 테두리 상판 밴드(20tri) -> 옆벽(20tri)
 * [테두리 버킷, 40tri 연속] -> 안쪽 평면 팬+잎맥(20tri) -> 바닥 팬(10tri) [몸통 버킷, 30tri 연속]
 * = 70tri. sliceTriangles(0,40)/(40,70)로 분리(마스크 아님, 연속 구간).
 */
function buildCandy(): { rimGeo: THREE.BufferGeometry; bodyGeo: THREE.BufferGeometry } {
  const positions: number[] = [];
  const index: number[] = [];
  const push = (v: THREE.Vector3) => (positions.push(v.x, v.y, v.z), positions.length / 3 - 1);

  // 링 3개: R1 바깥(테두리 top), R_INNER 안쪽(테두리 top과 같은 Y — 베벨 없음), R4 바깥-하단(바닥).
  const R1 = OUTLINE.map((p) => push(outlinePos(p, 1, TOP_Y)));
  const R_INNER = OUTLINE.map((p) => push(outlinePos(p, INNER_SCALE, TOP_Y)));
  const R4 = OUTLINE.map((p) => push(outlinePos(p, 1, BOTTOM_Y)));
  const C_TOP = push(new THREE.Vector3(0, TOP_Y, 0));
  const C_BOT = push(new THREE.Vector3(0, BOTTOM_Y, 0));

  // 테두리 상판 밴드(+Y) — "자연" 순서(외곽->안쪽)가 이미 +Y를 낸다(외적 실측).
  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    index.push(R1[i], R1[i1], R_INNER[i1]);
    index.push(R1[i], R_INNER[i1], R_INNER[i]);
  }
  // 옆벽(R1->R4, 바깥 법선) — buildRevolvedShell의 검증된 (a0,b0) 링 전이 패턴 그대로.
  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    index.push(R1[i], R4[i1], R1[i1]);
    index.push(R1[i], R4[i], R4[i1]);
  }
  const rimTriCount = index.length / 3; // 40

  // 안쪽 평면 팬(+Y, 자연 순서) — 뾰족점 방향마다 vein-mid로 중심 공유 변을 쪼갠다. R_INNER[i]가
  // 뾰족점이면 그 스포크(C_TOP->R_INNER[i])에 vein-mid를 심는다; 모든 base 삼각형이 뾰족점 변
  // 하나를 반드시 물고 있으므로(뾰족점/골이 번갈아 배치) 10개 전부가 쪼개져 20tri가 된다.
  const veinMid = new Map<number, number>(); // outline index(tip) -> vertex index
  for (let i = 0; i < N; i++) {
    if (!OUTLINE[i].tip) continue;
    const spokeEnd = outlinePos(OUTLINE[i], INNER_SCALE, TOP_Y);
    const mid = new THREE.Vector3(0, TOP_Y, 0).lerp(spokeEnd, VEIN_FRAC);
    mid.y -= VEIN_DIP;
    veinMid.set(i, push(mid));
  }
  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    // base 삼각형(+Y 자연 순서) = (C_TOP, R_INNER[i], R_INNER[i1]).
    const tipHere = OUTLINE[i].tip ? i : OUTLINE[i1].tip ? i1 : -1;
    if (tipHere === -1) {
      // 방어적 폴백(외곽선이 뾰족점/골 교대가 아니면 발생) — 실제 OUTLINE 배치에선 안 걸린다.
      index.push(C_TOP, R_INNER[i], R_INNER[i1]);
      continue;
    }
    const m = veinMid.get(tipHere) as number;
    if (tipHere === i) {
      // (C_TOP, R_INNER[i], R_INNER[i1]) 에서 C_TOP-R_INNER[i] 변(1-2번째 정점)을 m으로 쪼갠다.
      index.push(C_TOP, m, R_INNER[i1]);
      index.push(m, R_INNER[i], R_INNER[i1]);
    } else {
      // tipHere === i1 — C_TOP-R_INNER[i1] 변(1-3번째 정점, wrap)을 m으로 쪼갠다.
      index.push(C_TOP, R_INNER[i], m);
      index.push(m, R_INNER[i], R_INNER[i1]);
    }
  }

  // 바닥 팬(-Y, 반전 순서) — 잎맥 없음(숨겨진 밑면).
  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    index.push(C_BOT, R4[i1], R4[i]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  // 지터 없음(R4 예외, 헤더 주석) — indexed에서 바로 facet.
  const baked = facet(geometry);
  const total = baked.attributes.position.count / 3;
  const rimGeo = sliceTriangles(baked, 0, rimTriCount);
  const bodyGeo = sliceTriangles(baked, rimTriCount, total);
  uvTopPlanar(rimGeo);
  uvTopPlanar(bodyGeo);
  return { rimGeo, bodyGeo };
}

interface CandyDef {
  offset: readonly [number, number]; // world XZ
  yaw: number;
}

// assets/ingredients/work/maple/object-sculpt-spec.json CANDIES 전사. maple-3.png 탑다운 실측 —
// 3개가 밑동에서 느슨하게 겹치는 삼각 배치, front가 뒤 둘 사이에 끼어든다. 전부 평평하게 눕는다
// (rotation은 yaw뿐) — 레퍼런스 자체가 3장 다 평평하고, 고정 3/4 카메라가 원근만으로 두께를 보여준다.
const CANDIES: Record<'backLeft' | 'backRight' | 'front', CandyDef> = {
  backLeft: { offset: [-0.36, 0.22], yaw: 0.35 },
  backRight: { offset: [0.38, 0.18], yaw: -0.5 },
  front: { offset: [0.02, -0.3], yaw: 3.05 },
};

export const createMaple: IngredientBuilder = () => {
  const rimMat = stdMaterial({ color: RIM_COLOR });
  const bodyMat = stdMaterial({ color: BODY_COLOR });

  const group = new THREE.Group();
  (Object.keys(CANDIES) as (keyof typeof CANDIES)[]).forEach((key) => {
    const def = CANDIES[key];
    const { rimGeo, bodyGeo } = buildCandy();
    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(rimGeo, rimMat));
    sub.add(new THREE.Mesh(bodyGeo, bodyMat));
    sub.rotation.set(0, def.yaw, 0);
    sub.position.set(def.offset[0], 0, def.offset[1]);
    group.add(sub);
  });

  // 공유 지면 y=0 — 프리즘 바닥이 인스턴스마다 이미 BOTTOM_Y로 평평하므로(회전이 yaw뿐이라 바닥이
  // 안 기운다) 올리브식 개별 bbox 스냅이 필요 없다. 그룹 전체를 한 번만 스냅한다(types.ts R1).
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
  group.updateMatrixWorld(true);

  return mergeByMaterial(group);
};
