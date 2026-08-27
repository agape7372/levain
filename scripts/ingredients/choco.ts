// 초코칩 — 눈물방울(콘) 6알 군집. 계약은 types.ts 주석이 정본. 재료 배치B 1번째(4종 중 가장 단순).
//
// 유래: img2threejs 스펙 assets/ingredients/specs/choco.json(워크스페이스 원본은
// assets/ingredients/work/choco/). 프로필·오프셋·색은 전부 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// R1(types.ts) 군집 정본 순서: 칩 1개 = 한 덩어리 indexed 셸(lib.buildRevolvedShell, 극점 2개:
// 플랫 베이스 팬 + 꼭지 극점) -> jitterVertices -> facet. 올리브와 달리 칩은 똑바로 서므로
// 눕히기(rotateZ) 불필요 — 로컬 Y가 그대로 world Y(위)다. 칩끼리는 정점을 공유하지 않으므로
// 알마다 독립적으로 셸을 짓고 mesh 변환으로 배치한다(통짜 positions 배열 금지, olive.ts와 동일 패턴).
//
// 색 버킷: 프롬프트 hex 3개(#4A3428 몸통 / #6B4E3D 상면 하이라이트 / #37241B 이음새 그늘) 중 2개를
// 드롭한다 — 올리브 파일럿 교훈의 직접 확장:
//   - 상면 하이라이트(#6B4E3D)는 런타임 키라이트의 N·L 감쇠가 볼록한 콘 상단에서 이미 공짜로 낸다
//     (올리브의 그늘진 아랫면 드롭과 대칭 — 여기선 오히려 더 직접적이다).
//   - 이음새 그늘(#37241B)은 하네스가 렌더하지 않는 contact shadow 효과라 완전히 공짜는 아니지만,
//     64px 축소본에서는 칩 사이 색조 차이가 안 읽힌다(risk 기록, object-sculpt-spec.json 참조).
// 결과: mesh=1(머티리얼 1개) — 마스크 분리 불필요, 재료 중 가장 단순한 빌더.
//
// ═══ v2 (2026-08-27 턴테이블 재감사 수리) — "0°·180°에만 원뿔 사이 틈 20~26px" ═════════════
// 실제로는 0/180만이 아니었다. 전 각도 배경 뚫림 스캔(테두리에 안 닿는 배경 연결성분)에서
// az 0·45·135·180·225·315 **여섯 각도**에 갇힌 배경 주머니가 나왔고 최악은 az=315의 20×33px였다.
//
// ★기하: 인접한 두 원뿔 사이의 V자 골은 위로 열려 있어 그 자체론 "틈"이 아니다. **뒤/앞의
//   세 번째 칩이 그 V의 입구를 덮으면 그 순간 갇힌 주머니**가 된다. 옛 배치는 육각 2열(간격
//   0.87~0.93 vs 베이스 지름 1.0)로 베이스가 겨우 맞닿는 수준이라 V가 바닥까지 깊었다.
//   → 고칠 축 셋:
//     ① 간격  간격 0.72로 조여 베이스를 28% 겹치게 한다(V의 밑이 지면에서 한참 위로 올라온다).
//     ② 배치  2열 육각 → **중앙 1 + 오각 링 5**. 중앙 칩이 클러스터 한가운데를 막아
//              **관통 시선 자체를 없앤다**(2열 배치의 근본 약점이 열 사이 터널이었다).
//              발자국도 정사각에 가까워져 리핏 후 칩이 더 크게 잡힌다(2.24 vs 3.01 폭).
//     ③ 낮게  CHOCO_HALF_LENGTH 0.56 → 0.44 (h:w 1.05 → 0.88). 프롬프트 원문이
//              "piled in a **low mound**"인데 옛 수치는 뾰족한 봉우리 6개(az=315에서 산맥으로
//              읽혔다)였다. 낮아지면 V도 얕아져 ①과 같은 방향으로 일한다.
//   개수는 6 그대로다 — 프롬프트가 5~7개고, 늘리면 크랜베리 함정(뭉쳐서 얼룩)에 걸린다.
//   중앙 칩만 scale 1.16으로 키워 "더미의 정점"을 만든다(전부 같은 높이면 부감에서 평지다).
//   ⚠ 겹친 셸끼리는 교차한다. 단일 머티리얼·단색이라 교차선이 안 보이므로 무해하다
//     (lemon의 "떠 있는 껍질 링"은 **다른 색 버킷**이 관통해서 생긴 문제였다 — 여기엔 없다).
//   세그먼트 8 → 10(전체 화면에서 8각 베이스가 보였다), 지터 0.018 → 0.015 (R2 동반 하향).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, jitterVertices, mergeByMaterial, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/choco.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BODY_COLOR = 0x4a3428; // "a deep cocoa brown body"

// 실측 비율 (assets/ingredients/src/choco.png 3/4 · choco-2.png 정면 · choco-3.png 탑다운).
// 절대 스케일은 무의미 — 런타임이 군집 전체 최장축을 1.6으로 리핏한다 (types.ts §6).
const CHOCO_RADIUS = 0.5; // 베이스 반지름
// v2: 0.56 → 0.44 → **0.50**. 0.44는 과교정이었다 — 볼록 프로필과 겹쳐서 칩이 "둥근 자갈"로
// 읽혔다(r1 렌더). 초코칩의 정체 단서는 **넓은 평평한 밑동 + 또렷한 꼭지**이고 높이를 깎으면
// 그 꼭지가 먼저 죽는다. 주머니를 닫은 건 높이가 아니라 배치(②)였으니 높이는 되돌려도 된다.
const CHOCO_HALF_LENGTH = 0.5; // height:width = 1.0:1
const CHOCO_SEGMENTS = 10; // v2: 8 → 10

// (반지름비, 높이비) — heightFrac -1(플랫 베이스 극점) .. +1(꼭지 극점). 베이스 림(1.0,-1.0)이
// 베이스 극점(0,-1.0)과 같은 높이라 바닥이 완전 평평한 팬이 된다. 꼭지 직전 링(0.26,0.76)은
// 극점 페이싯 수를 늘려 "부드럽게 둥근" 끝을 낸다(단일 급경사 대신).
// v2: 측벽 어깨만 살짝 부풀리고 위쪽 테이퍼는 옛 값에 가깝게 되돌렸다
// (옛 0.82/0.56/0.32/0.13 → r1의 0.92/0.74/0.50/0.26은 돔이 되어 자갈로 읽혔다 → 0.88/0.68/0.44/0.21).
// 꼭지 직전 링을 0.13 → 0.21로 올린 건 지터 안전(R2)이 근거다: 반지름 0.065일 때 컬럼 간격이
// 0.041로 amp(0.015~0.018)에 근접해 극 팬이 뒤집힐 여지가 있었다 → 0.105에서 간격 0.066.
type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [1.0, -1.0],
  [1.0, -0.9],
  [0.88, -0.5],
  [0.68, 0.0],
  [0.44, 0.46],
  [0.21, 0.8],
  [0.0, 1.0],
];

const JITTER_AMP = 0.015; // ~3.0% of CHOCO_RADIUS — R4 (세그먼트 10 동반 하향)

interface ChipDef {
  offset: readonly [number, number]; // world XZ
  yaw: number; // world Y 회전 (배치 방향 다양화)
  scale: number; // 미세 스케일 — 중앙이 더미의 정점
}

// v2 배치 — 중앙 1 + 오각 링 5. 링 반지름 0.62이므로 링 이웃 간 간격은 2·0.62·sin36° = 0.729,
// 중앙-링 간격은 0.62다(베이스 지름 1.0 대비 각각 27%·38% 겹침). 오각 한 꼭지를 +Z(카메라 쪽)에
// 두고 나머지를 72도씩 돌린다 — 어느 az에서도 뒤 칩이 앞 칩에 정확히 가려지지 않는다.
// ★스펙(work/choco/object-sculpt-spec.json)의 2열 육각 CHIPS는 **이 파일이 앞선다** — 그 배치가
//   재감사에서 여섯 각도의 갇힌 배경 주머니를 낳았다. 스펙에서 복원하지 마라.
const RING_RADIUS = 0.62;
const RING_ANGLES: readonly number[] = [90, 162, 234, 306, 18].map((d) => (d * Math.PI) / 180);
const CHIPS: Record<'center' | 'ring1' | 'ring2' | 'ring3' | 'ring4' | 'ring5', ChipDef> = {
  center: { offset: [0, 0], yaw: 0.35, scale: 1.16 },
  ring1: { offset: [RING_RADIUS * Math.cos(RING_ANGLES[0]), RING_RADIUS * Math.sin(RING_ANGLES[0])], yaw: -0.7, scale: 1.02 },
  ring2: { offset: [RING_RADIUS * Math.cos(RING_ANGLES[1]), RING_RADIUS * Math.sin(RING_ANGLES[1])], yaw: 1.1, scale: 0.94 },
  ring3: { offset: [RING_RADIUS * Math.cos(RING_ANGLES[2]), RING_RADIUS * Math.sin(RING_ANGLES[2])], yaw: -1.3, scale: 1.06 },
  ring4: { offset: [RING_RADIUS * Math.cos(RING_ANGLES[3]), RING_RADIUS * Math.sin(RING_ANGLES[3])], yaw: 0.55, scale: 0.96 },
  ring5: { offset: [RING_RADIUS * Math.cos(RING_ANGLES[4]), RING_RADIUS * Math.sin(RING_ANGLES[4])], yaw: 2.0, scale: 1.08 },
};

/**
 * 칩 1개 = 회전체 셸(플랫 베이스 팬 극점 + 꼭지 극점) + 지터 + 페이싯. 칩은 똑바로 서므로
 * 올리브의 "눕히기(rotateZ)" 단계가 없다 — buildRevolvedShell이 짓는 로컬 Y가 그대로 world Y.
 */
function buildChip(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(PROFILE, CHOCO_SEGMENTS, CHOCO_HALF_LENGTH, () => [CHOCO_RADIUS, CHOCO_RADIUS]);

  // 지터 — indexed 상태에서(공유 정점이 함께 움직여야 베이스 팬이 안 찢어진다, types.ts §5).
  jitterVertices(geometry, rng, JITTER_AMP);

  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

export const createChoco: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const cluster = new THREE.Group();

  (Object.keys(CHIPS) as (keyof typeof CHIPS)[]).forEach((key) => {
    const def = CHIPS[key];
    const geo = buildChip(rng);

    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(geo, bodyMat));

    sub.rotation.set(0, def.yaw, 0);
    sub.scale.setScalar(def.scale);
    sub.position.set(def.offset[0], 0, def.offset[1]);

    // 공유 지면 y=0 — 이 칩만의 회전 후 bbox를 구해 바닥을 원점에 맞춘다(types.ts R1).
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;

    cluster.add(sub);
  });

  return mergeByMaterial(cluster);
};
