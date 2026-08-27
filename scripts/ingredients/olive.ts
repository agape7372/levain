// 올리브 — 알 3개 군집. 계약은 types.ts 주석이 정본. 재료 파일럿(첫 IngredientBuilder).
//
// 유래: img2threejs 스펙 assets/ingredients/specs/olive.json(워크스페이스 원본은
// assets/ingredients/work/olive/). 프로파일·오프셋·색은 전부 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// R1(types.ts) 군집 정본 순서: 알 1개 = 한 덩어리 indexed 셸(lib.buildRevolvedShell) →
// jitterVertices → facet → 삼각형을 버킷 2개(몸통/그린캡)로 분리. 알끼리는 정점을 공유하지
// 않으므로(pancake 디스크 3장과 동일 패턴) 알마다 독립적으로 셸을 짓고 mesh 변환으로 배치한다 —
// 통짜 positions 배열 하나에 3알을 우겨넣지 않는다. jitterVertices는 "이 알의" 공유 캡 경계링만
// 지키면 된다(알간 공유 링은 애초에 없다).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import {
  buildRevolvedShell,
  facet,
  jitterVertices,
  mergeByMaterial,
  pickTriangles,
  splitTrianglesByVertexMask,
  stdMaterial,
  uvTopPlanar,
} from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/olive.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
// "#4A3A36"(그늘진 아랫면)은 의도적으로 버킷을 안 만든다 — mesh<=2 예산이 2버킷을 강제하는데,
// 런타임 키라이트가 볼록한 셸의 아랫면을 N·L 감쇠로 이미 공짜로 어둡게 만든다. 지오메트리에 두 번째
// 어두운 톤을 칠하면 이중으로 어두워진다(스펙 risk shaded-underside-hue-dropped 참조).
const BODY_COLOR = 0x3b2f2f; // "a deep aubergine-black body"
const CAP_COLOR = 0x5c6b3e; // "a muted olive-green cast ... catching the upper faces"

// 실측 비율 (assets/ingredients/src/olive.png 3/4 · olive-2.png 정면 · olive-3.png 탑다운).
// 절대 스케일은 무의미 — 런타임이 군집 전체 최장축을 1.6으로 리핏한다 (types.ts §6).
const OLIVE_RADIUS = 0.44; // 적도 반지름
const OLIVE_HALF_LENGTH = 0.775; // 극-극 절반 길이 (길이:너비 ~= 1.55:1, olive-2.png 실측)
// v2: 12 -> 20. 432tri는 예산(8000tri)의 5%였고 쇼케이스 전체 화면에서 "각진 돌덩이"로 읽혔다
// (핸드오프 약함 판정). 극 근처 링을 뭉툭하게(rFrac 0.46/0.38) 잡아 컬럼 간격을 벌린 뒤 올렸다.
const OLIVE_SEGMENTS = 20;

// (반지름비, 높이비) — heightFrac -1(뭉툭한 끝 극점) .. +1(꼭지 끝 극점). 비대칭 테이퍼:
// 뭉툭한 끝은 완만하게 넓어지고 꼭지 끝은 급하게 좁아진다 — olive-2.png에서 관찰된 전형적 비대칭.
//
// v2: 8점 -> 10점. 구 프로필은 극 직전 링이 0.55/0.22로 급해서 양 끝이 원뿔처럼 뾰족했다
// (64px 시트에서 "돌 파편/연" 실루엣). 끝 링을 0.46/0.38로 뭉툭하게 올리고 중간 링을 촘촘히
// 넣어 길이 방향 곡률도 부드럽게 했다. hFrac은 여전히 단조(types.ts §8).
type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.46, -0.93],
  [0.75, -0.76],
  [0.93, -0.5],
  [1.0, -0.14],
  [0.98, 0.16],
  [0.88, 0.44],
  [0.68, 0.68],
  [0.38, 0.88],
  [0.0, 1.0],
];

// 그린 캡 마스크 — cmp-1/cmp-2 실측: Y좌표 임계값(로컬 Y > k*OLIVE_RADIUS) 방식은 실패했다.
// 카메라가 위쪽에서 내려다보는 3/4 뷰라 "위를 향한 면"이 애초에 시야의 절반 가까이를 차지해서,
// k를 0.1에서 0.55로 올려도(원주 점유율 47%->31%) 카메라에 늘 보이는 중심부(t=180 정점)는 두
// 경우 다 포함되어 렌더가 거의 안 바뀌었다. 좌표 기반 임계값 대신 (링, 섹터) 격자 좌표로 직접
// 지정한다 — buildRevolvedShell이 돌려주는 ringStart를 그대로 쓴다.
// splitTrianglesByVertexMask는 "정점 3개 중 하나라도 true면 삼각형 true"라 마스크를 링 2개(2,3)에
// 찍으면 그 사이/양옆 세 밴드(1-2, 2-3, 3-4)가 전부 걸려 length의 절반이 물든다(shot-90/180/270
// 실측 — azimuth를 돌려도 항상 절반 가까이 초록으로 읽혔다). 링을 1개(3, 가장 넓은 링)로,
// 섹터도 중심 1칸만(half=0)으로 좁혀 걸리는 밴드를 2-3/3-4 두 개로, 폭도 최소로 줄였다.
// ⚠ 이 "링을 좁혀라" 결론은 v2b에서 뒤집혔다 — 아래 참조. 원문은 왜 좁혔었는지의 근거로 남긴다.
//
// ★v2 — "패치가 데칼(스티커)로 읽힌다"(핸드오프 약함 판정)의 처방은 마스크 크기가 아니라
// **경계가 형태를 따르게 만드는 것**이다. 구버전은 매끈한 셸 위에 놓인 균일한 초록 다각형이라
// 경계가 어떤 형태 단서와도 안 맞았다 — 64px 시트에서 "검은 돌에 붙은 잎"으로 읽혔다.
// 두 가지를 같이 바꿨다:
//   ① 마스크를 등적 덩어리(링1×섹터1)에서 **장축 방향 띠**로 재배치 —
//      프롬프트의 "catching the upper faces"가 길이를 따라 도는 하이라이트라는 뜻에 맞다.
//   ② 마스크 정점을 반지름 방향으로 CAP_WELT만큼 밀어 **미세 융기**를 만든다. OR-of-3 때문에
//      융기 정점에 닿는 삼각형 전체가 초록이라, 초록 영역 = 평평한 정수리 + 기울어진 테두리
//      밴드가 되고 그 테두리가 N·L 그라데이션을 만든다 → 경계가 색 경계가 아니라 능선이 된다.
//      오목이 아니라 볼록으로 뒤집은 건 CRIB "오목보다 볼록"(cheese 지그재그) 교훈.
//
// ★v2b — ①만으로는 안 풀렸다. 링 4·5만 마킹하니 초록이 **몸통 한가운데 떠 있는 닫힌 섬**이
// 되어 "붙인 알약"으로 읽혔다(r1 8각도 전수 확인). 색 영역이 데칼로 읽히는 진짜 조건은 크기가
// 아니라 **경계가 형태의 어떤 선과도 안 만나는 것**이다 — 섬은 정의상 그렇다.
// 그래서 마스크를 **극점 제외 전 링**으로 늘렸다: 초록 띠가 장축을 따라 흐르다 양 끝 팬
// 삼각형으로 수렴해 **실루엣 밖으로 빠져나간다**. 닫힌 섬이 사라지고 경계는 옆구리를 타고
// 내려가는 능선선 + 양 끝 수렴점만 남는다.
//
// ★v2c — 폭 결정은 실측으로 갈렸다. half=1(컬럼 3칸 마킹 → 초록 섹터 4칸 = 72도)은
// **CRIB "넓은 마스크가 의도를 뒤집는다"에 정확히 걸렸다**: 카메라가 3/4 부감이라 위쪽 72도가
// 보이는 반원의 40%를 차지해, 8각도 전부에서 초록이 지배하고 아랫배만 검은 "초록 올리브"가 됐다
// (r2 실측). 원주 점유율이 20%뿐인데도 그렇다 — **점유율이 아니라 카메라가 보는 쪽 점유율**이
// 기준이다. half=0으로 되돌리되(초록 섹터 2칸 = 36도) 링은 전 링을 유지한다:
// "닫힌 섬을 없애는 것"과 "폭을 좁히는 것"은 서로 독립된 축이고, 데칼 판정을 만든 건 전자였다.
// 결과는 장축을 따라 흐르다 양 끝에서 수렴하는 **한 줄기 봉합선(suture) 하이라이트**다.
const CAP_SECTOR_HALF_WIDTH = 0; // 중심 섹터 1칸 마킹 (segments=20 → 초록 섹터 2칸 = 36도)
const CAP_WELT = 0.045; // 반지름의 4.5% 바깥 융기 ≈ 0.020 — 지터(0.009)의 2배여야 능선이 산다.
// half=0이면 융기가 컬럼 1개짜리 **얕은 능선**이 된다. 실제 올리브의 봉합선과 같은 단서라
// v2b(전 길이 평평한 고원)보다 이쪽이 형태적으로 정당하다 — 그래서 0.035에서 조금 올렸다.

const JITTER_AMP = 0.009; // R2: segments 12->20이면 극 근처 컬럼 간격이 절반 이하 — 0.016에서 내렸다.
// 실측 여유: 최소 링 반지름 0.38*0.44=0.167, 컬럼 간격 2π·0.167/20=0.052 > 지터 진폭 0.009.

interface OliveDef {
  offset: readonly [number, number]; // world XZ
  yaw: number; // world Y 회전 (배치 방향 다양화)
  tiltZ: number; // 추가 world Z 회전 (뭉툭한 끝을 카메라 쪽으로 들어올림)
  tilted: boolean;
}

// assets/ingredients/work/olive/object-sculpt-spec.json OLIVES 전사.
// olive-a = "one tilted to show its blunt end" (geometry.silhouette, olive.json).
// 1회 수정(advisor 리뷰 반영, 오실레이션 아님): 최초 오프셋은 레퍼런스의 밀착된 무더기보다
// 넓게 퍼져 있었다(cmp-sheet.png 자기 리뷰에서 지적) — 절반으로 좁혀 서로 닿게 했다.
// tiltZ도 0.32->0.5로 올렸다 — tilted-blunt-end-cue 피처 리뷰가 0.55점(important 기준 0.65 미달).
const OLIVES: Record<'a' | 'b' | 'c', OliveDef> = {
  a: { offset: [-0.33, 0.18], yaw: -0.55, tiltZ: 0.5, tilted: true },
  b: { offset: [0.33, 0.15], yaw: 0.3, tiltZ: 0.0, tilted: false },
  // c의 Z만 -0.30 -> -0.45로 되돌림: -0.30은 a/b 사이 정중앙 뒤라 고정 카메라에서 거의 완전히
  // 가려졌다(R1 "서로 가리지 않게" 위반, roundtrip.png 실측). 원래 -0.55보다는 여전히 좁혔다.
  c: { offset: [0.0, -0.45], yaw: 1.55, tiltZ: 0.0, tilted: false },
};

/**
 * 알 1개 = 회전체 셸(극점 2개) + 캡 마스크(링/섹터 격자 인덱스) + 지터 + 캡/몸통 삼각형 분리
 * + 눕히기. buildRevolvedShell은 항상 Y축으로 돌리므로, 세워 지은 상태에서 ringStart로 캡
 * 마스크를 먼저 찍고(격자 인덱스라 지터·회전에 안 흔들림), 그 다음 geometry.rotateZ(-90deg)로
 * "눕히기"를 지오메트리에 굽는다(장축 old Y -> new X, old X -> new Y="위").
 */
function buildOlive(rng: () => number): {
  bodyGeo: THREE.BufferGeometry;
  capGeo: THREE.BufferGeometry;
} {
  // PROFILE의 rFrac(0..1)에 상수 OLIVE_RADIUS를 곱해 실제 반지름을, heightScale=OLIVE_HALF_LENGTH로
  // hFrac(-1..1)에 곱해 실제 길이를 낸다 — radialScale은 링마다 다를 필요가 없어 상수를 반환한다.
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, OLIVE_SEGMENTS, OLIVE_HALF_LENGTH, () => [
    OLIVE_RADIUS,
    OLIVE_RADIUS,
  ]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  // 캡 마스크 — 지터/회전 전, (링, 섹터) 격자 인덱스로 직접 지정(좌표 임계값 재발명 금지).
  // 섹터 중심(=segments/2)이 old_x=-rFrac*R 방향(cos t=-1)이고, rotateZ(-90deg) 후 new_y=-old_x가
  // 최대가 되는 지점이라 "눕힌 뒤 위"로 온다 — 링별 시작 인덱스는 buildRevolvedShell이 이미 계산해
  // 반환한 ringStart를 그대로 쓴다(재추론 없음).
  // v2b: 링을 골라 찍는 대신 극점을 뺀 전 링에 같은 컬럼 집합을 찍는다 — 띠가 장축을 따라
  // 흐르고 양 끝 팬 삼각형으로 수렴한다. 극점 정점은 안 찍는다(찍으면 끝이 통째로 초록이 된다).
  const mask = new Uint8Array(pos.count);
  // v3b (리드 마감): 센터를 정수리(segments/2)에서 3칸(54°) 비킨다 — 정중앙 대칭 봉합선은
  // 090/270에서 커피콩 홈으로 읽혔다(r3 실측·CRIB "센터를 카메라 정면에서 비켜라").
  // 어깨에 걸린 하이라이트가 되면 "빛 받는 능선"으로 읽히고 대칭 오독이 사라진다.
  const sectorCenter = Math.floor(OLIVE_SEGMENTS / 2) + 3;
  for (let ri = 0; ri < PROFILE.length; ri++) {
    if (PROFILE[ri][0] <= 1e-6) continue; // 극점
    const base = ringStart[ri];
    for (let d = -CAP_SECTOR_HALF_WIDTH; d <= CAP_SECTOR_HALF_WIDTH; d++) {
      const s = (sectorCenter + d + OLIVE_SEGMENTS) % OLIVE_SEGMENTS;
      mask[base + s] = 1;
    }
  }

  // 미세 융기 — 마스크 정점만 XZ 반지름 방향으로 밀어낸다(세워진 좌표계에서, 회전 전).
  // indexed 상태라 공유 정점이 함께 움직여 경계가 안 찢어진다.
  for (let i = 0; i < pos.count; i++) {
    if (!mask[i]) continue;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const k = 1 + CAP_WELT;
    pos.setXYZ(i, x * k, pos.getY(i), z * k);
  }
  pos.needsUpdate = true;

  // 눕히기: rotateZ(-90deg) => new_x = old_y, new_y = -old_x. 장축이 로컬 X로, 로컬 Y가 "위"가 된다.
  geometry.rotateZ(-Math.PI / 2);

  // 지터 — indexed 상태에서(공유 정점이 함께 움직여야 캡/몸통 경계가 안 찢어진다, types.ts §5).
  // 마스크는 인덱스 기반이라 지터 전/후 순서에 영향받지 않는다.
  jitterVertices(geometry, rng, JITTER_AMP);

  // facet 전에 원본 index를 보존 — splitTrianglesByVertexMask는 facet() 이전 indexed 배열을 요구한다.
  const originalIndex = (geometry.index as THREE.BufferAttribute).array as ArrayLike<number>;
  const baked = facet(geometry);
  const { trueTris, falseTris } = splitTrianglesByVertexMask(originalIndex, mask);

  const capGeo = pickTriangles(baked, trueTris);
  const bodyGeo = pickTriangles(baked, falseTris);
  uvTopPlanar(capGeo);
  uvTopPlanar(bodyGeo);
  return { bodyGeo, capGeo };
}

export const createOlive: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const capMat = stdMaterial({ color: CAP_COLOR });

  const cluster = new THREE.Group();

  (Object.keys(OLIVES) as (keyof typeof OLIVES)[]).forEach((key) => {
    const def = OLIVES[key];
    const { bodyGeo, capGeo } = buildOlive(rng);

    const sub = new THREE.Group();
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    const capMesh = new THREE.Mesh(capGeo, capMat);
    sub.add(bodyMesh, capMesh);

    // 배치: yaw(world Y) + tiltZ(뭉툭한 끝을 카메라로 들어올리는 추가 회전, olive-a만).
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
