// 메이플 — 단풍잎 모양 슈거 캔디 3개. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/maple.json. 색은 maple.json geometry.surface
// 손 전사 (JSON import 금지, types.ts §7).
//
// ★쇼케이스 수리 (별 쿠키 → 단풍잎 사탕): 이전 10점 외곽(뾰족점 5 + 골 5)은 72° 등간격에
// 가까운 오각별로 읽혔다. 톱니·꼭지가 쇼케이스에서 증발한 원인. 고친 축은 실루엣:
//   ① 5엽 길이를 불균등하게 (중심 1.05 · 위옆 0.78 · 밑동 0.38) — 별의 5-fold를 깬다
//   ② 엽 사이 사이너스를 r≈0.14~0.18까지 깊게 — 팔이 갈라진 단풍잎
//   ③ 각 엽 가장자리에 톱니 3~5 (본엽 끝이 아니라 더 짧은 지그재그 — 별점을 늘리지 않는다)
//   ④ 밑동에 직사각 꼭지(엽병)를 돌출 — 골로 파낸 노치가 아님
//   ⑤ 잎맥은 꼭지 부착점에서 5엽 끝으로 뻗는 정점 함몰(색 버킷 추가 없음)
//
// ★2링 유지 (CRIB 함정): 테두리/베벨/안쪽 3링은 뾰족점 근처 배경 구멍을 냈다. 테두리와
// 안쪽 평면을 같은 높이에서 만나게 한다(중간 링 없음). 지터 전면 생략(R4).
//
// 얇은 사탕은 런타임 FrontSide라 material.side가 죽는다(CRIB). 열린 카드 대신 옆벽+바닥
// 팬으로 닫힌 프리즘을 지어 뒷면 사본 없이 전 각도에서 실루엣이 남게 한다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { facet, mergeByMaterial, sliceTriangles, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/maple.json geometry.surface[0] 손 전사.
// "#8F6224"(잎맥 골)·"#D9A85C"(도드라진 면 하이라이트)는 버킷을 안 만든다 — 잎맥은 VEIN_DIP
// 함몰, 하이라이트는 페이싯 N·L 감쇠로 공짜.
const RIM_COLOR = 0xe8c787; // "a light cream edge ... tracing the leaf's thin candy rim"
const BODY_COLOR = 0xb8823a; // "a warm caramel-tan body"

type Role = 'vein' | 'tooth' | 'sinus' | 'stem';
interface OutlinePoint {
  readonly x: number;
  readonly z: number;
  readonly role: Role;
}

const LEAF_SCALE = 0.52;
const INNER_SCALE = 0.8;
const TOP_Y = 0.05;
const INNER_Y = 0.05; // 림과 같은 높이 — 뾰족 톱니에서 경사 림이 구멍을 낼 여지를 없앤다(CRIB 2링)
const BOTTOM_Y = -0.05;
const VEIN_FRAC_A = 0.34;
const VEIN_FRAC_B = 0.68;
const VEIN_DIP = 0.01; // 얕게 — 깊은 함몰은 속살이 별 인레이로 읽힌다. 정체성은 실루엣.

function polar(deg: number, r: number, role: Role): OutlinePoint {
  const a = (deg * Math.PI) / 180;
  return { x: Math.cos(a) * r * LEAF_SCALE, z: Math.sin(a) * r * LEAF_SCALE, role };
}

function cart(x: number, z: number, role: Role): OutlinePoint {
  return { x: x * LEAF_SCALE, z: z * LEAF_SCALE, role };
}

// 시계방향(각도 감소, +Y 상판 와인딩과 동일한 관례). 오른쪽 반을 짓고 x 거울.
// 각도 간격이 72°가 아니고, 엽 끝 r이 1.00/0.84/0.56으로 갈라져 오각별이 될 수 없다.
function buildOutline(): OutlinePoint[] {
  const right: OutlinePoint[] = [
    // 중심 엽 (톱니 5 = 끝 + 좌우 2). 끝이 위옆·밑동보다 분명히 길다.
    polar(90, 1.05, 'vein'),
    polar(85, 0.9, 'tooth'),
    polar(81, 0.68, 'sinus'),
    polar(76, 0.88, 'tooth'),
    polar(72, 0.66, 'sinus'),
    polar(68, 0.82, 'tooth'),
    polar(58, 0.18, 'sinus'), // 중심↔위옆 깊은 사이너스

    // 위옆 엽 (톱니 4) — 옆을 가리켜 별의 72° 점을 피한다
    polar(50, 0.52, 'tooth'),
    polar(44, 0.4, 'sinus'),
    polar(36, 0.78, 'vein'),
    polar(28, 0.42, 'sinus'),
    polar(22, 0.58, 'tooth'),
    polar(16, 0.4, 'sinus'),
    polar(6, 0.14, 'sinus'), // 위옆↔밑동 깊은 사이너스

    // 밑동 엽 (톱니 3) — 작고 아래·옆. 별의 세 번째 점(-54°)이 아니다
    polar(-4, 0.32, 'tooth'),
    polar(-14, 0.22, 'sinus'),
    polar(-28, 0.38, 'vein'),
    polar(-42, 0.26, 'tooth'),

    // 직사각 꼭지(엽병). 크림 림만 채움(innerPos). 옆각에서 막대가 되지 않을 길이.
    cart(0.13, -0.08, 'stem'),
    cart(0.1, -0.5, 'stem'),
  ];
  const left = right
    .slice(1)
    .map((p) => ({ x: -p.x, z: p.z, role: p.role }))
    .reverse();
  return [...right, ...left];
}

const OUTLINE = buildOutline();
const N = OUTLINE.length;

function xz(p: OutlinePoint, scale: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(p.x * scale, y, p.z * scale);
}

const STEM_ATTACH_Z = -0.05 * LEAF_SCALE;
const STEM_END_Z = -0.15 * LEAF_SCALE;

/** 안쪽 링. 꼭지(stem) 정점은 잎 몸통 부착선으로 접어, 속살 버킷이 꼭지를 채우지 않게 한다.
 *  꼭지 상판·옆벽은 림(크림) 버킷만 담당 — 어두운 막대 손잡이로 읽히는 걸 막는다. */
function innerPos(p: OutlinePoint): THREE.Vector3 {
  if (p.role === 'stem') {
    const side = p.x >= 0 ? 1 : -1;
    const xFrac = p.z < STEM_END_Z ? 0.055 : 0.1;
    return new THREE.Vector3(side * xFrac * LEAF_SCALE, INNER_Y, STEM_ATTACH_Z);
  }
  return xz(p, INNER_SCALE, INNER_Y);
}

/**
 * 캔디 1개 = 손수 지은 인덱스 프리즘.
 * 테두리 상판 밴드(2N tri) + 옆벽(2N) [림 버킷] → 안쪽 평원+잎맥 + 바닥 팬 [몸통 버킷].
 * 연속 구간이라 sliceTriangles로 가른다(마스크 아님).
 */
function buildCandy(): { rimGeo: THREE.BufferGeometry; bodyGeo: THREE.BufferGeometry } {
  const positions: number[] = [];
  const index: number[] = [];
  const push = (v: THREE.Vector3) => (positions.push(v.x, v.y, v.z), positions.length / 3 - 1);

  const R1 = OUTLINE.map((p) => push(xz(p, 1, TOP_Y)));
  const R_INNER = OUTLINE.map((p) => push(innerPos(p)));
  const R4 = OUTLINE.map((p) => push(xz(p, 1, BOTTOM_Y)));
  // 팬 원점: 잎 몸통 안, 꼭지보다 위. 방사 페이싯이 별 중심이 아니라 엽병에서 퍼지게.
  const hubZ = 0.08 * LEAF_SCALE;
  const C_TOP = push(new THREE.Vector3(0, INNER_Y, hubZ));
  const C_BOT = push(new THREE.Vector3(0, BOTTOM_Y, hubZ));

  // 테두리 상판(+Y) — 외곽→안쪽 순서가 이미 +Y (기존 10점 실측과 같은 감기).
  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    index.push(R1[i], R1[i1], R_INNER[i1]);
    index.push(R1[i], R_INNER[i1], R_INNER[i]);
  }
  // 옆벽(바깥 법선) — buildRevolvedShell (a0,b0) 링 전이.
  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    index.push(R1[i], R4[i1], R1[i1]);
    index.push(R1[i], R4[i], R4[i1]);
  }
  const rimTriCount = index.length / 3;

  // 잎맥: 꼭지 부착점(원점)에서 5엽 끝으로. 스포크당 함몰점 2개 — 페이싯 경계가 긴 골이 된다.
  const veinPts = new Map<number, { a: number; b: number }>();
  for (let i = 0; i < N; i++) {
    if (OUTLINE[i].role !== 'vein') continue;
    const end = innerPos(OUTLINE[i]);
    const hub = new THREE.Vector3(0, INNER_Y, hubZ);
    const a = hub.clone().lerp(end, VEIN_FRAC_A);
    const b = hub.clone().lerp(end, VEIN_FRAC_B);
    a.y -= VEIN_DIP * 1.2;
    b.y -= VEIN_DIP;
    veinPts.set(i, { a: push(a), b: push(b) });
  }
  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    const va = veinPts.get(i);
    const vb = veinPts.get(i1);
    if (va) {
      index.push(C_TOP, va.a, R_INNER[i1]);
      index.push(va.a, va.b, R_INNER[i1]);
      index.push(va.b, R_INNER[i], R_INNER[i1]);
    } else if (vb) {
      index.push(C_TOP, R_INNER[i], vb.a);
      index.push(vb.a, R_INNER[i], vb.b);
      index.push(vb.b, R_INNER[i], R_INNER[i1]);
    } else {
      index.push(C_TOP, R_INNER[i], R_INNER[i1]);
    }
  }

  // 바닥 팬(-Y). 잎맥 없음 — 몰드 뒷면.
  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    index.push(C_BOT, R4[i1], R4[i]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  const baked = facet(geometry);
  const total = baked.attributes.position.count / 3;
  const rimGeo = sliceTriangles(baked, 0, rimTriCount);
  const bodyGeo = sliceTriangles(baked, rimTriCount, total);
  uvTopPlanar(rimGeo);
  uvTopPlanar(bodyGeo);
  return { rimGeo, bodyGeo };
}

interface CandyDef {
  offset: readonly [number, number];
  yaw: number;
  pitch: number;
}

// 삼각 군집. yaw를 벌려 전 방위에서 꼭지·톱니가 실루엣에 걸리게. 앞장은 조금 더 기울여
// 옆두께를 보여준다. pitch가 있으면 바닥이 한 평면에 안 남으므로 인스턴스별 bbox 스냅(R1).
const CANDIES: readonly CandyDef[] = [
  { offset: [-0.46, 0.24], yaw: 0.7, pitch: 0.1 },
  { offset: [0.5, 0.14], yaw: -1.35, pitch: 0.08 },
  { offset: [0.04, -0.44], yaw: 2.5, pitch: 0.2 },
];

export const createMaple: IngredientBuilder = () => {
  const rimMat = stdMaterial({ color: RIM_COLOR });
  const bodyMat = stdMaterial({ color: BODY_COLOR });

  const group = new THREE.Group();
  for (const def of CANDIES) {
    const { rimGeo, bodyGeo } = buildCandy();
    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(rimGeo, rimMat));
    sub.add(new THREE.Mesh(bodyGeo, bodyMat));
    sub.rotation.set(def.pitch, def.yaw, 0);
    sub.position.set(def.offset[0], 0, def.offset[1]);
    group.add(sub);
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;
  }

  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
  group.updateMatrixWorld(true);

  return mergeByMaterial(group);
};
