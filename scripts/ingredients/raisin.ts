// 건포도 — 3알 군집(프롬프트는 5알이나 CRIB 64px 판독 게이트에 따라 3알로 낮춤, cranberry v4 선례).
// 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/raisin.json(워크스페이스 원본은
// assets/ingredients/work/raisin/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★raisin·apricot이 이 배치의 같은 계열(팀리드 지시) — cranberry의 pullCrease 기법을 계승하되
// 적용 축이 다르다: 크랜베리는 링 1~2개에만 방사형 V홈을 파(눕히기 전 축 쪽으로 당김) "납작+홈
// 하나"를 만들었지만, 건포도는 "no smooth or glossy stretches"가 결정적 특징이라 홈을 국소가
// 아니라 몸통 전체 길이(극점을 뺀 전 링)에 걸쳐 번갈아 파서 세로 골이 도는 플루트(fluted) 단면을
// 만든다 — 올리브(매끈한 타원)와의 실루엣 차별화가 정체성의 전부라 홈 깊이를 소심하게 잡지 않는다
// (advisor 권고: cranberry가 0.42로도 뭉개져 0.6까지 갔다 — 같은 자릿수에서 시작).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/raisin.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
// 그늘진 홈 그림자(#1D130D)·능선 하이라이트(#55402A)는 드롭 — 홈이 이제 실제 지오메트리(플루트)라
// 페이셋 노멀이 공짜로 명암을 낸다(cranberry의 crease-shadow-drop과 동일 메커니즘). mesh=1.
const BODY_COLOR = 0x2e2018; // "a deep near-black brown body"

// 실측 비율 (assets/ingredients/src/raisin.png 3/4 · raisin-2.png 정면 · raisin-3.png 탑다운).
// 올리브보다 갸름한 타원(길이:너비 ~1.44:1) — "oblong" 실루엣.
const RAISIN_RADIUS = 0.5;
const RAISIN_HALF_LENGTH = 0.72;
const RAISIN_SEGMENTS = 10; // 짝수 — 골/능선이 정확히 번갈아 맞물린다(5쌍)

type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.55, -0.82],
  [0.88, -0.42],
  [1.0, 0.0],
  [0.88, 0.42],
  [0.55, 0.82],
  [0.0, 1.0],
];

const JITTER_AMP = 0.014; // ~2.8% of RAISIN_RADIUS — 플루트 윤곽을 지우지 않을 만큼 낮게(R4)

// 플루트 — 짝수 섹터(0,2,4,6,8)를 극점을 뺀 전체 링에서 축 쪽으로 당겨 세로 골을 낸다(cranberry의
// pullCrease를 "링 1개"에서 "전체 링"으로 일반화). 홀수 섹터(1,3,5,7,9)는 원래 반지름 그대로 남아
// 능선이 된다 — 결과는 별 모양 단면의 각기둥형 몸체. 골/능선이 원주 전체를 도는 패턴이라 크랜베리와
// 달리 좌표계(눕히기 전/후)가 결과에 영향을 안 준다 — 어느 방위에서도 같은 패턴이 보인다.
const FLUTE_SECTORS: readonly number[] = [0, 2, 4, 6, 8];
const FLUTE_DEPTH = 0.4;

function pullFlutes(pos: THREE.BufferAttribute, ringStart: number[], sectors: readonly number[], segments: number, depth: number): void {
  for (let ri = 1; ri < ringStart.length - 1; ri++) {
    const base = ringStart[ri];
    for (const sector of sectors) {
      const idx = base + ((sector % segments) + segments) % segments;
      const x = pos.getX(idx);
      const z = pos.getZ(idx);
      pos.setXYZ(idx, x * (1 - depth), pos.getY(idx), z * (1 - depth));
    }
  }
}

interface RaisinDef {
  offset: readonly [number, number]; // world XZ
  yaw: number; // world Y 회전
  tiltZ: number; // 추가 world Z 회전 (한 알만 기울여 쭈글쭈글한 끝을 보여준다)
}

// assets/ingredients/work/raisin/object-sculpt-spec.json RAISINS 전사.
// 5알(prompt) -> 3알로 감축(CRIB 64px 게이트, cranberry v4 선례 — "군집 상한은 3"). c를 tiltZ로
// 기울여 silhouette의 "one raisin tilted to show its wrinkled end"를 표현.
// v2(cmp-1 판정 후): c가 카메라 쪽(+Z)으로 너무 나와 있어 a/b와 겹쳐 3알 중 하나가 거의
// 안 보였다 — cranberry의 검증된 삼각 배치 비율(뒤-좌/뒤-우/앞-중앙)로 교체했지만 cmp-2에서도
// b/c가 여전히 한 덩어리로 겹쳐 보였다.
// v3(cmp-2 판정 후): 간격을 한 번 더 벌리고(±0.85, +0.78) c의 tiltZ를 0.5->0.3으로 줄여 b와
// 실루엣이 겹치는 각도를 줄였다 — tiltZ가 크면 c의 단면이 옆으로 퍼져 b 쪽 공간을 잠식했다.
const RAISINS: Record<'a' | 'b' | 'c', RaisinDef> = {
  a: { offset: [-0.85, -0.28], yaw: 0.35, tiltZ: 0.0 },
  b: { offset: [0.85, -0.18], yaw: -1.1, tiltZ: 0.0 },
  c: { offset: [0.0, 0.8], yaw: 1.35, tiltZ: 0.3 },
};

/**
 * 건포도 1개 = 회전체 셸(타원) + 전체 길이 플루트(짝수 섹터를 비극점 링 전체에서 축 쪽으로 당김)
 * + 지터 + 눕히기(rotateZ) + 페이셋.
 */
function buildRaisin(rng: () => number): THREE.BufferGeometry {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, RAISIN_SEGMENTS, RAISIN_HALF_LENGTH, () => [
    RAISIN_RADIUS,
    RAISIN_RADIUS,
  ]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  pullFlutes(pos, ringStart, FLUTE_SECTORS, RAISIN_SEGMENTS, FLUTE_DEPTH);
  pos.needsUpdate = true;

  // 눕히기: rotateZ(-90deg) => new_x=old_y, new_y=-old_x. 장축이 로컬 X로.
  geometry.rotateZ(-Math.PI / 2);

  // 지터 — indexed 상태에서(공유 정점이 함께 움직여야 안 찢어진다, types.ts §5).
  jitterVertices(geometry, rng, JITTER_AMP);

  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

export const createRaisin: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const cluster = new THREE.Group();

  (Object.keys(RAISINS) as (keyof typeof RAISINS)[]).forEach((key) => {
    const def = RAISINS[key];
    const geo = buildRaisin(rng);

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
