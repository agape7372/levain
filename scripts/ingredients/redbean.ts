// 팥 — 소용돌이 페이스트 마운드 + 통팥 3알. 계약은 types.ts 주석이 정본. 재료 배치4 1번째.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/redbean.json(워크스페이스 원본은
// assets/ingredients/work/redbean/). 프로필·오프셋·색은 전부 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// 기술 계보: 마운드는 chestnut.ts의 단일-셸 + CREASE(고정 섹터 함몰) 패턴을 그대로 쓰되, CREASE_SECTOR가
// **링마다 이동**하도록 일반화했다 — 소용돌이 각도 함수 grooveTargetAngleDeg(hFrac)가 링의 hFrac에서
// 목표 각도를 계산해 그 각도 둘레(±half-width)를 반지름 축소 + Y 함몰시킨다. 색 버킷 분리가 필요 없다
// (블루베리 왕관과 달리 이음매 자체가 별도 색이 아니다) — sliceTriangles/마스크 없이 단일 재질 셸.
// 통팥 3알은 olive.ts의 rotateZ(-90deg) 눕히기 규칙으로 만든 독립 타원체이며, **같은 각도 함수**로
// 마운드 표면(hFrac 보간)에 배치한다 — 이음매와 통팥이 항상 같은 나선 위에 있도록 수식을 공유한다.
//
// ★2026-08-26 전체화면 쇼케이스 수리(texbug) — 네 군데가 바뀌었고 전부 되돌리지 말 것:
//
//  (1) **통팥 3알이 구덩이로 읽혔다.** 옛 코드는 알 중심을 그 높이의 마운드 표면 반지름 그대로 두고
//      (radius*cos, y + BEAN_RADIUS*0.5, radius*sin) 에 놓았다 — 표면 위에 중심이 있으니 절반이
//      파묻히고, 게다가 스펙 색 #3D1818이 몸통 #6B2E2E보다 **어두워서** 노출된 꼭대기가 주변보다
//      어두웠다. 사람 눈은 "주변보다 어두운 둥근 얼룩"을 볼록이 아니라 오목으로 읽는다.
//      → 중심을 **표면 법선 방향**으로 밀어내고(아래 BEAN_PROTRUDE) 알을 몸통보다 **밝게** 바꿨다.
//      Y로만 올리던 옛 방식은 적도처럼 법선이 거의 수평인 자리에서 아무 효과가 없었다.
//  (2) BEAN_COLOR를 스펙의 #3D1818 -> 같은 JSON의 #85453B("warmer lit ridge along the outer coil")로
//      재배정했다. 스펙 충실도 패스가 무심코 되돌리지 않도록 못을 박아 둔다: 2D 일러스트에선 어두운
//      알이 대비를 주지만, 3D 셸에서는 같은 키라이트를 받는 볼록면끼리라 **어두운 = 파인 것**으로만
//      읽힌다. 몸통의 그늘(#522020)은 마운드 자체의 N·L 감쇠가 계속 낸다.
//  (3) SEGMENTS 16 -> 32, PROFILE 10점 -> 19점, 통팥도 8 -> 14세그먼트. 예산이 100KB/2500tri ->
//      250KB/8000tri로 상향됐고(families.mjs 2026-08-26 주석) 재료도 빵과 같은 쇼케이스에서 같은
//      크기로 확대돼 보인다. 옛 격자는 전체화면에서 각진 돌덩이였다.
//  (4) 소용돌이 함몰을 "섹터 ±1 균일 축소"에서 **각도 기준 코사인 감쇠**로 바꿨다. 섹터 개수 기준은
//      SEGMENTS에 종속이라(32로 올리면 폭이 반토막) 나선이 실금이 된다 — 각도(도)로 잡으면 격자
//      밀도와 무관하고, 감쇠 덕에 V자 칼금이 아니라 골짜기가 된다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { angleDeltaDeg, buildRevolvedShell, facet, jitterVertices, mergeByMaterial, stdMaterial, uvDome } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/redbean.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
// "#522020"(소용돌이 그늘)은 버킷을 안 만든다 — 볼록/함몰 마운드의 N·L 감쇠 + 이음매 자체의 페이싯
// 노멀 대비가 이미 공짜로 표현한다(올리브/밤/블루베리 몸통과 동일 논리).
const BODY_COLOR = 0x6b2e2e; // "a deep maroon-red paste body"
const BEAN_COLOR = 0x85453b; // "a warmer lit ridge (#85453B)" — 위 (2) 참조. 스펙의 통팥 hex(#3D1818)를
// 쓰지 않는 것은 의도된 재배정이다.

// 실측 비율 (assets/ingredients/src/redbean.png 3/4 · redbean-2.png 정면 · redbean-3.png 탑다운).
const MOUND_RADIUS = 0.5;
const MOUND_HEIGHT = 0.9; // 높이:너비 ~0.9:1 (redbean-2.png 정면도 실측)
const SEGMENTS = 32;

// (반지름비, 높이비) — hFrac 0(바닥 극점) .. 1(꼭대기 극점). 가장 넓은 지점(rFrac 1.0)이 hFrac 0.30 —
// 이음매 구간은 여기서부터(등고선이 내려가는 상반부) 시작한다.
type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, 0.0],
  [0.42, 0.02],
  [0.62, 0.05],
  [0.78, 0.1],
  [0.9, 0.16],
  [0.965, 0.23],
  [1.0, 0.3], // 적도/최대폭 — 이음매 구간 시작
  [0.985, 0.365],
  [0.945, 0.43],
  [0.895, 0.49],
  [0.84, 0.545],
  [0.765, 0.61],
  [0.68, 0.665],
  [0.585, 0.725],
  [0.48, 0.78],
  [0.37, 0.84],
  [0.245, 0.9], // 이음매 각도 구간 끝
  [0.13, 0.955],
  [0.0, 1.0],
];

// 소용돌이 이음매 — hFrac에 따라 움직이는 목표 **각도**(섹터 아님)를 링마다 계산해 그 둘레를
// 코사인 감쇠로 반지름 축소 + Y 함몰시킨다.
// 각도 함수의 정의역(SPIRAL_H_*)과 실제 함몰을 적용하는 링 범위(GROOVE_DIP_H_MAX)를 분리한다 —
// cmp-1/cmp-2 판정: 정의역 끝단(hFrac 0.78~0.90)은 반지름이 이미 작아 축소 + 지터가 겹치면 극점 쪽으로
// 뾰족하게 찌그러지는 스파이크/이중 뿔 아티팩트가 생겼다. 함몰은 반지름이 충분히 큰 하반부
// (0.30~0.66)에만 적용하고, 각도 함수 자체는 원래 정의역(0.30~0.90)을 유지해 통팥 3알의 각도 분산
// (공식 공유)은 그대로 둔다.
const SPIRAL_H_START = 0.3;
const SPIRAL_H_END = 0.9;
const GROOVE_DIP_H_MAX = 0.67; // 함몰은 hFrac 0.665 링까지 — 그 위와 극점은 매끈하게 둔다
const GROOVE_ANGLE_START_DEG = 150;
const GROOVE_TURNS = 1.2;
const GROOVE_HALF_WIDTH_DEG = 30; // 골짜기 반폭(도). ★섹터 개수로 되돌리지 마라 — SEGMENTS 종속이다.
const GROOVE_RADIUS_PULL = 0.16; // 골짜기 중심에서의 반지름 축소율(가장자리로 갈수록 0)
const GROOVE_Y_DIP = 0.022; // ★2026-08-26 2차: 0.03에서 완화 — 코사인 감쇠로 골이 넓어진 뒤에도
// 깊이를 유지하니 마운드가 "주름 잡힌 자루"처럼 보였다. 나선은 원래 저폴리에서 완전히는 안 읽힌다
// (risk spiral-may-not-survive-64px) — 읽히지도 않는 골 때문에 실루엣을 망칠 이유가 없다.

/** 소용돌이 각도 함수 — 이음매 함몰과 통팥 배치가 공유한다(항상 같은 나선 위에 있도록). */
function grooveTargetAngleDeg(hFrac: number): number {
  const frac = (hFrac - SPIRAL_H_START) / (SPIRAL_H_END - SPIRAL_H_START);
  return GROOVE_ANGLE_START_DEG - frac * GROOVE_TURNS * 360;
}

/**
 * PROFILE 상반부(최대폭 링부터 꼭대기까지, hFrac·rFrac 모두 단조)만 선형보간. 통팥 표면 반지름 조회용.
 * ★최대폭 링을 인덱스 상수로 박지 마라(옛 코드는 3으로 박혀 있었다) — 프로필을 촘촘히 하는 순간
 * 조용히 엉뚱한 구간을 읽어 통팥이 뜨거나 파묻힌다.
 */
function rFracAtHFrac(target: number): number {
  let widest = 0;
  for (let i = 1; i < PROFILE.length; i++) if (PROFILE[i][0] > PROFILE[widest][0]) widest = i;
  for (let i = widest; i < PROFILE.length - 1; i++) {
    const [r0, h0] = PROFILE[i];
    const [r1, h1] = PROFILE[i + 1];
    if (target >= h0 && target <= h1) {
      const t = (target - h0) / (h1 - h0);
      return r0 + (r1 - r0) * t;
    }
  }
  return 0;
}

const JITTER_AMP = 0.011; // ★0.018에서 축소 — SEGMENTS를 32로 올리면 같은 진폭이 고주파 잔물결이
// 되어 페이스트가 사포처럼 보인다. 큰 굴곡은 소용돌이 골짜기가 맡는다.

function buildMound(rng: () => number): THREE.BufferGeometry {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, SEGMENTS, MOUND_HEIGHT, () => [MOUND_RADIUS, MOUND_RADIUS]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  // 소용돌이 함몰 — 지터/facet 전, 이음매 구간 링마다 목표 각도 둘레를 코사인 감쇠로 눌러 내린다.
  for (let ri = 0; ri < PROFILE.length; ri++) {
    const hFrac = PROFILE[ri][1];
    if (hFrac < SPIRAL_H_START - 1e-6 || hFrac > GROOVE_DIP_H_MAX + 1e-6) continue;
    const targetDeg = grooveTargetAngleDeg(hFrac);
    const start = ringStart[ri];
    const end = ri + 1 < ringStart.length ? ringStart[ri + 1] : pos.count;
    for (let i = start; i < end; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const d = angleDeltaDeg((Math.atan2(z, x) * 180) / Math.PI, targetDeg);
      if (d >= GROOVE_HALF_WIDTH_DEG) continue;
      const w = 0.5 * (1 + Math.cos((Math.PI * d) / GROOVE_HALF_WIDTH_DEG)); // 중심 1 -> 가장자리 0
      const pull = 1 - GROOVE_RADIUS_PULL * w;
      pos.setXYZ(i, x * pull, pos.getY(i) - GROOVE_Y_DIP * w, z * pull);
    }
  }

  // 지터 — indexed 상태에서(types.ts §5), 함몰 이후.
  jitterVertices(geometry, rng, JITTER_AMP);

  const baked = facet(geometry);
  uvDome(baked);
  return baked;
}

// 통팥 — 작은 타원체(pole-ring-ring-pole), 눕히기(olive.ts rotateZ(-90deg) 규칙과 동일)로 장축을
// 로컬 X로 돌린다. 지터 없음(작은 부속 파트, R4).
const BEAN_RADIUS = 0.082; // 깊이 묻는 만큼(BEAN_PROTRUDE) 노출 렌즈가 읽히도록 살짝 키운다
const BEAN_LENGTH = 0.118;
const BEAN_SEGMENTS = 14;
const BEAN_TILT_DEG = 22; // 접선 정렬에서 알마다 ±이만큼 어긋나게 — 기계적으로 나란해 보이지 않도록
const BEAN_PROTRUDE = -0.22; // 중심을 표면 법선 방향으로 BEAN_RADIUS의 22%만큼 **안으로** 넣는다.
// 알 두께의 ~61%가 묻히고 얕은 렌즈만 솟는다 — 스펙 문구 그대로 "set into / nestled into the
// surface". ★2026-08-26 3차: +0.28 -> +0.18 -> -0.22로 내렸다. 많이 돌출시킬수록 어느 방위에선가
// 알이 마운드 실루엣을 뚫고 "귀"로 걸린다(턴테이블이라 전 각도가 노출된다). 볼록으로 읽히게 만드는
// 건 돌출량이 아니라 **몸통보다 밝은 색**이다(위 (2)) — 밝기는 유지하고 돌출만 깎는다.
// ⚠ 색을 다시 어둡게 되돌리면서 이 값을 그대로 두면 옛 "구덩이" 버그가 그대로 돌아온다. 둘은 한 쌍이다.
const BEAN_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.45, -0.86],
  [0.78, -0.55],
  [1.0, 0.0],
  [0.78, 0.55],
  [0.45, 0.86],
  [0.0, 1.0],
];
// hFrac만 지정 — outer -> mid -> inner. redbean-3.png 탑다운 실측.
// cmp-1/cmp-3 판정: inner를 0.84 근처에 두면 통팥 장반경이 그 높이의 마운드 반지름과 맞먹어 실루엣
// 밖으로 길쭉하게 튀어나와 "뿔"처럼 보였다. ★2026-08-26: outer도 적도(0.30)에서 0.44로 올렸다 —
// 적도에 두면 법선이 수평이라 밀어낸 알이 실루엣 윤곽에 혹으로 걸려 "귀"처럼 읽혔다. 셋 다 윗면
// 돔에 두면 부감 카메라(고도 ~52도)가 알을 정면으로 본다.
// ★2026-08-26 2차/3차: 0.44는 어깨가 거의 수직이라 밀어낸 알이 옆으로 튀어나왔고, 0.78까지 올리니
// 그 높이의 마운드 반지름(0.24)이 알 길이(0.21)와 맞먹어 더 크게 삐져나왔다. 중간대로 되돌린다 —
// 삐져나옴의 진짜 원인은 높이가 아니라 **장축 방향**이었다(아래 rotation.y 주석).
const BEAN_HFRACS: readonly number[] = [0.46, 0.6, 0.73];

function buildBean(): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(BEAN_PROFILE, BEAN_SEGMENTS, BEAN_LENGTH, () => [BEAN_RADIUS, BEAN_RADIUS]);
  geometry.rotateZ(-Math.PI / 2); // 빌드축(Y) -> 로컬 X가 장축
  const baked = facet(geometry);
  uvDome(baked);
  return baked;
}

/** 회전면의 바깥 법선 (반지름 성분, Y 성분) — 프로필 유한차분. 통팥을 표면에서 밀어낼 방향. */
function surfaceNormalAt(hFrac: number): readonly [number, number] {
  const eps = 0.02;
  const dR = (rFracAtHFrac(Math.min(1, hFrac + eps)) - rFracAtHFrac(Math.max(0, hFrac - eps))) * MOUND_RADIUS;
  const dY = 2 * eps * MOUND_HEIGHT;
  const len = Math.hypot(dY, dR) || 1;
  return [dY / len, -dR / len];
}

export const createRedbean: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const beanMat = stdMaterial({ color: BEAN_COLOR });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(buildMound(rng), bodyMat));

  BEAN_HFRACS.forEach((hFrac, i) => {
    const angleRad = (grooveTargetAngleDeg(hFrac) * Math.PI) / 180;
    const [nR, nY] = surfaceNormalAt(hFrac);
    const radius = rFracAtHFrac(hFrac) * MOUND_RADIUS + nR * BEAN_RADIUS * BEAN_PROTRUDE;
    const y = hFrac * MOUND_HEIGHT + nY * BEAN_RADIUS * BEAN_PROTRUDE;

    const beanMesh = new THREE.Mesh(buildBean(), beanMat);
    // ★2026-08-26 3차 — 고정 yaw(옛 BEAN_YAW_DEG=125도)를 버리고 **원둘레 접선 정렬**로 되돌린다.
    // 고정 yaw는 카메라 한 방위만 보고 고른 값이라, 세 알의 방위각(약 49도·-66도·-167도)에 대해
    // 장축이 반지름 방향에 가까워지는 알이 생겼다 — 그 알이 마운드 실루엣 **밖으로** 길게 삐져나와
    // "귀"로 읽혔다(네 방위 렌더에서 매번 다른 알이 그랬다). 턴테이블은 사용자가 전 각도를 보므로
    // 특정 카메라를 노린 고정값은 애초에 성립하지 않는다.
    // 지오메트리: rotateZ(-90도) 뒤 장축은 로컬 +X이고, rotation.y=φ는 그 축을 (cos φ, 0, -sin φ)로
    // 보낸다. 방위 θ의 반지름 방향 (cos θ, 0, sin θ)와의 내적이 cos(φ+θ)이므로 **φ = 90도 - θ**면
    // 정확히 접선이다(옛 주석의 angleRad+90deg는 이 부호를 틀렸다). ±BEAN_TILT_DEG로 흐트러뜨린다.
    beanMesh.rotation.y = Math.PI / 2 - angleRad + ((i - 1) * BEAN_TILT_DEG * Math.PI) / 180;
    beanMesh.position.set(radius * Math.cos(angleRad), y, radius * Math.sin(angleRad));
    group.add(beanMesh);
  });

  // 공유 지면 y=0 — 통팥은 마운드 표면에 붙어 있으므로 그룹 전체를 한 번만 스냅한다(types.ts R1).
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
  group.updateMatrixWorld(true);

  return mergeByMaterial(group);
};
