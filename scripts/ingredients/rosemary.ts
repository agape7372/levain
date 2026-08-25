// 로즈마리 — 잔가지 1개 + 바늘잎 다수. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/rosemary.json(워크스페이스 원본은
// assets/ingredients/work/rosemary/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// R4 최우선 적용 대상(types.ts): 바늘잎은 지터 생략 — 얇은 실루엣이 빵 스케일 지터를 먹으면
// 뭉개진다. 대신 advisor 권고대로 "적고 굵게": 바늘 16개, 각각 4정점 사면체(뿌리·끝점 + 좌우 날개
// 2점)의 청키 저폴리 프리즘. 순색 2버킷(바늘 sage-green · 줄기 olive-tan) — 프롬프트 JSON의 hex
// 4개 중 그늘진 아랫면(#4F6B41)·윗면 하이라이트(#9BB183) 2개는 올리브 선례처럼 드롭한다(런타임
// 키라이트의 N·L 감쇠가 페이셋마다 제각각 향하는 바늘에 이미 그 효과를 공짜로 낸다).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/rosemary.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const NEEDLE_COLOR = 0x6e8a5a; // "sage-green needles"
const STEM_COLOR = 0x7c7a54; // "the woody stem is a muted olive-tan"

// 실측 비율 (assets/ingredients/src/rosemary.png 3/4 · rosemary-2.png 정면 · rosemary-3.png 탑다운
// — 세 장 다 같은 잔가지를 다른 프레이밍으로 보여준다. 줄기는 로컬 X축에 짓고, "약간 대각선으로
// 눕는다"는 원근이 3/4 카메라에서 자연히 만들어준다(추가 회전 없음).
const STEM_HALF_LENGTH = 0.85;
const STEM_RADIUS_BASE = 0.052; // 굵은 밑동(t=0)
const STEM_RADIUS_TIP = 0.024; // 가는 끝(t=1)
const STEM_SEGMENTS = 6; // 각진 페이셋 — rosemary.png 실측: 매끈한 원통이 아니라 목질 다각형
const STEM_JITTER_AMP = 0.004; // R4 — 줄기는 바늘보다 두꺼워 완전 생략까진 필요 없지만 최소로

const NEEDLE_COUNT = 24; // cmp-1 실측: 16개·좁은 폭은 성글어 보였다 — advisor 권고 상한 쪽으로,
// tri 예산이 900 중 76만 써서(96%가 남았다) 여유를 "굵게"에 더 쓴다.
const NEEDLE_LENGTH_BASE = 0.46; // 밑동 쪽(t=0) 바늘 길이
const NEEDLE_LENGTH_TIP = 0.3; // 끝 쪽(t=1) 바늘은 더 짧다(어린 잎, rosemary.png 실측)
const NEEDLE_WIDTH = 0.092; // 날개 폭 — cmp-1 대비 확대(청키), 서로 겹쳐 실루엣이 꽉 차게

/**
 * 바늘잎 1개 = 4정점 사면체(뿌리·끝·좌우 날개). 지터 없음(R4) — 페이셋 노멀만 facet()으로 굽는다.
 * 폭이 가장 넓은 지점은 뿌리 쪽으로 살짝 치우친다(뿌리~42% 지점, rosemary.png 실측: 잎이 밑동
 * 근처에서 가장 넓고 끝으로 갈수록 매끈하게 좁아진다).
 */
function buildNeedle(root: THREE.Vector3, tip: THREE.Vector3, width: number): THREE.BufferGeometry {
  const dir = tip.clone().sub(root).normalize();
  let wing = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
  if (wing.lengthSq() < 1e-6) wing.set(1, 0, 0);
  wing.normalize().multiplyScalar(width / 2);
  const mid = root.clone().lerp(tip, 0.42);
  const wingA = mid.clone().add(wing);
  const wingB = mid.clone().sub(wing);

  const positions = [
    root.x, root.y, root.z,
    tip.x, tip.y, tip.z,
    wingA.x, wingA.y, wingA.z,
    wingB.x, wingB.y, wingB.z,
  ];
  const index = [
    0, 2, 1, // root-wingA-tip
    0, 1, 3, // root-tip-wingB
    0, 3, 2, // root-wingB-wingA
    1, 2, 3, // tip-wingA-wingB
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

function buildStem(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(
    [
      [1, -1],
      [1, 1],
    ],
    STEM_SEGMENTS,
    STEM_HALF_LENGTH,
    (_hFrac, ringIndex) => (ringIndex === 0 ? [STEM_RADIUS_BASE, STEM_RADIUS_BASE] : [STEM_RADIUS_TIP, STEM_RADIUS_TIP]),
  );
  jitterVertices(geometry, rng, STEM_JITTER_AMP);
  // Y축 원통을 로컬 X축으로 눕힌다: rotateZ(-90deg) => new_x=old_y, new_y=-old_x. 밑동(old_y=-L,
  // 두꺼움)이 new_x=-L로, 끝(old_y=+L, 가늚)이 new_x=+L로 온다 — t=0(밑동)이 -X, t=1(끝)이 +X.
  geometry.rotateZ(-Math.PI / 2);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

interface NeedleDef {
  t: number; // 0..1 줄기 길이 비율 (0=밑동 두꺼운 쪽, 1=끝 가는 쪽)
  side: 1 | -1; // 1=줄기 위쪽으로, -1=줄기 아래쪽으로 — rosemary-2.png 실측: 정면에서 보면 바늘이
  // 줄기 위/아래 가장자리에서 번갈아 나는 "생선뼈" 패턴이지, 원통 둘레로 방사하는 패턴이 아니다.
  angleJitter: number;
  zJitter: number; // 깊이 방향(Z) 소폭 변주 — 완전 평면 카드처럼 보이지 않게 하는 정도만
}

function makeNeedleDefs(rng: () => number): NeedleDef[] {
  const defs: NeedleDef[] = [];
  for (let i = 0; i < NEEDLE_COUNT; i++) {
    const raw = i / (NEEDLE_COUNT - 1);
    const t = Math.pow(raw, 0.55); // 끝(t=1)쪽에 밀집 — "denser toward the tip" (prompt JSON)
    const side: 1 | -1 = i % 2 === 0 ? 1 : -1;
    defs.push({ t, side, angleJitter: (rng() - 0.5) * 0.3, zJitter: (rng() - 0.5) * 0.4 });
  }
  return defs;
}

export const createRosemary: IngredientBuilder = (rng) => {
  const group = new THREE.Group();

  const needleMat = stdMaterial({ color: NEEDLE_COLOR });
  const stemMat = stdMaterial({ color: STEM_COLOR });

  group.add(new THREE.Mesh(buildStem(rng), stemMat));

  const defs = makeNeedleDefs(rng);
  for (const def of defs) {
    const stemR = STEM_RADIUS_BASE + (STEM_RADIUS_TIP - STEM_RADIUS_BASE) * def.t;
    const x = -STEM_HALF_LENGTH + 2 * STEM_HALF_LENGTH * def.t;
    // 주 벌어짐은 Y(위/아래, side로 부호 결정) — Z는 입체감용 소폭 변주만(생선뼈 패턴, rosemary-2.png).
    // cmp-1 대비 baseAngle을 올려(더 수직에 가깝게) 더 풍성해 보이게, alongX는 낮춰 뒤로 눕는
    // 정도를 줄였다 — 레퍼런스는 바늘이 줄기에 거의 수직으로 촘촘히 뻗는다.
    const baseAngle = 1.18 + def.angleJitter; // 줄기축 기준 라디안(~68°) — Y성분의 기울기
    const dirY = Math.cos(baseAngle) * def.side;
    const dirZ = def.zJitter;
    const root = new THREE.Vector3(x, dirY * stemR, dirZ * stemR);
    const length = NEEDLE_LENGTH_BASE + (NEEDLE_LENGTH_TIP - NEEDLE_LENGTH_BASE) * def.t;
    const alongX = 0.08 + rng() * 0.06; // 끝(줄기 tip) 방향으로 살짝만 기울어 뻗는다
    const tipDir = new THREE.Vector3(alongX, dirY, dirZ).normalize();
    const tip = root.clone().addScaledVector(tipDir, length);
    group.add(new THREE.Mesh(buildNeedle(root, tip, NEEDLE_WIDTH), needleMat));
  }

  return mergeByMaterial(group);
};
