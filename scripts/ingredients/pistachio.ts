// 피스타치오 — 통 알맹이 3개 + 반으로 쪼개진 알 1개(반쪽 2개). 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/pistachio.json(워크스페이스 원본은
// assets/ingredients/work/pistachio/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// 기술 계보: 알맹이 셸은 olive.ts와 동일한 회전체(buildRevolvedShell) + rotateZ(-90deg) 눕히기
// 패턴(단, 올리브의 비대칭 테이퍼 대신 양끝이 비슷하게 둥근 대칭 프로필).
//
// ═══ v2 (2026-08-26 쇼케이스 수리) — 되돌리지 말 것 ═══════════════════════════════════════
// ★스펙(assets/ingredients/work/pistachio/object-sculpt-spec.json)의 배치와 "홈(자른 면)" 기법은
//   **둘 다 깨져 있다.** 이 파일이 그 스펙보다 앞선다 — 스펙에서 복원하지 마라. 근거 셋:
//
//   (1) 배치 관통. 알 하나는 1.24×0.8인데 옛 오프셋들의 상호 거리가 0.45~0.61이었다. 알을
//       캡슐(축 반길이 0.22 · 반지름 0.4)로 근사해 선분-선분 거리를 재보면 6알 중 **8쌍이
//       기준 0.80을 밑돌고 최악이 0.212**다. 렌더는 주석이 말하는 "느슨한 원형"이 아니라
//       초록 덩어리 하나였다. → 알을 **방사 로제트**(중심에서 바깥으로 뻗는 꽃잎 배치)로 다시
//       깔고, 모든 쌍의 캡슐 거리를 0.80 이상으로 맞췄다(최악 0.822). 개수도 6 → 5로 줄였다
//       (겹침을 없애면 자리를 더 먹으므로, 남는 알을 키우는 게 전체 화면에서 이득 — 64px 게이트의
//       "인스턴스를 줄이고 하나를 키운다"와 같은 방향이다).
//       ⚠ 오프셋을 다시 좁히면 관통이 그대로 돌아온다. 좁히려면 캡슐 거리를 먼저 계산해라.
//
//   (2) 자른 면. 옛 기법은 (링,섹터) 한 줄의 반지름을 42% 당겨 "홈"을 판 것이었는데, 그건
//       평면이 아니라 세로 골이라 아이보리 영역이 **알보다 큰 베이지 돌덩이/찢긴 종이**로 읽혔다.
//       게다가 두 조각이 각각 통 알맹이 크기여서 "쪼개진 알 하나"가 아니라 "홈 파인 알 둘"이었다.
//       → 진짜 평면 절단으로 바꿨다: 눕힌 뒤 y > Y_CUT 인 정점을 전부 Y_CUT으로 눌러 **적도에서
//         자른 실제 반쪽**을 만든다. 눌린 정점 = 마스크 = 아이보리 버킷이라 지오메트리(평평함)와
//         색 경계가 정의상 일치한다. 클램프는 **지터 이전**에 적용한다 — 그래야 마스크가 지터
//         스트림과 무관하게 결정론적이다(CRIB의 "좌표 임계값 금지"는 지터 후 임계값 얘기고,
//         여기서는 평면 절단 자체가 의도라 평면이 곧 정의다).
//
//   (3) 각짐. SEGMENTS 8 · 프로필 6점은 전체 화면에서 대놓고 각졌다. 예산이 100KB/2500tri →
//       250KB/8000tri로 상향됐고(families.mjs) 재료도 빵과 같은 크기로 확대돼 보인다.
//       SEGMENTS 8 → 20, 프로필 6 → 9점.
//
// ⚠ v2의 (2)는 v3에서 다시 뒤집혔다 — **적도 수평 절단은 "쪼개진 알"이 아니었다.**
//   근거와 대체 기법은 아래 Z_CUT 위 v3 주석에.
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

// 팔레트 — assets/prompts/ingredients/pistachio.json geometry.surface[0] 손 전사 (JSON import 금지,
// types.ts §7). "#6E8A38"(그늘진 아랫면)은 올리브/밤과 같은 이유로 버킷을 안 만든다(볼록 셸의 N·L
// 감쇠가 공짜). "#8B5D6E"(자주빛 속껍질 잔흔)도 드롭한다 — mesh<=2 예산이 이미 몸통+자른면 2버킷을
// 다 썼다(정직한 한계, spec risk mauve-skin-remnant-dropped).
const BODY_COLOR = 0x8fa84a; // "a soft yellow-green body"
const CUT_COLOR = 0xede4c0; // "a pale ivory groove ... inside the split kernel's cleft"

// 실측 비율 (assets/ingredients/src/pistachio.png). 길이:너비 ~1.55:1 — 올리브와 비슷하지만
// 양끝이 비슷하게 둥글다(올리브의 비대칭 뭉툭/뾰족 대신).
const KERNEL_RADIUS = 0.4;
const KERNEL_HALF_LENGTH = 0.62;
const SEGMENTS = 20; // v2: 8 → 20 (전체 화면에서 8각 단면이 그대로 보였다)

type ProfilePoint = readonly [number, number];
// v2: 6 → 9점. 실루엣 계열은 그대로 두고(최대 반지름은 hFrac≈-0.08, 양끝은 둥근 극점) 사이만 채웠다.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.42, -0.86],
  [0.72, -0.64],
  [0.92, -0.36],
  [1.0, -0.08],
  [0.97, 0.22],
  [0.82, 0.52],
  [0.52, 0.8],
  [0.0, 1.0],
];

// v2: 0.014 → 0.012. SEGMENTS를 20으로 올려 한 변이 짧아졌고(R4), 자른 면의 평평함도 지켜야 한다.
const JITTER_AMP = 0.012;

// ═══ v3 (2026-08-26 재감사 — "적도 절단이라 분홍 테두리 단서 없음") ═══════════════════════
// v2는 **적도(수평) 절단**이었다: 눕힌 알의 y > Y_CUT 을 눌러 위쪽 절반을 날렸다. 그래서
// 아이보리 면이 알 **윗면 전체**를 덮었고, 두 반쪽이 로제트의 서로 다른 자리에 흩어져 있었다.
//   ⇒ 읽히는 것: "윗면이 베이지인 콩 두 개"(잘린 아몬드/누에콩). 프롬프트가 요구하는
//     "one kernel split lengthwise into two lobes to reveal the groove between them"의
//     **벌어진 틈**이 아예 존재하지 않았다 — 틈을 만들 두 조각이 한 알이 아니었기 때문이다.
// v3의 두 가지 변경:
//   ① 절단면을 **세로(장축을 품는 평면)**로 돌렸다: z > Z_CUT 클램프. 반쪽은 길이·높이는 그대로고
//      두께만 절반인 진짜 "lengthwise half"가 된다(1.24 × 0.8 × 0.42).
//   ② 두 반쪽을 **한 쌍으로 묶어** 펼친 책처럼 벌린다(등이 아래, 자른 면이 위+바깥).
//      자른 면 법선 = (0, cos τ, ±sin τ) — CRIB "절단면류 법선에 +Y 성분을 실어라"를 만족하면서
//      두 면이 서로 반대쪽으로 기울어 **어느 azimuth에서도 최소 한 면이 정면으로** 잡힌다.
//      몸통은 아래안쪽으로 기울어 바닥 중앙에서 서로 맞물리므로 사이로 배경이 비치지 않는다.
// ⚠ 되돌리지 마라: 절단을 y축으로 돌리면 ①이, 두 반쪽을 로제트에 흩으면 ②가 그대로 돌아온다.
//
// 자른 면 = 평면 절단. 눕힌 뒤(장축이 로컬 X) z > Z_CUT 인 정점을 Z_CUT으로 누른다.
// 중앙(z=0)보다 살짝 바깥 → "반쪽보다 아주 조금 큰" 조각. 끝으로 갈수록 링 반지름이 줄어 z가
// Z_CUT을 못 넘으므로 자른 면이 저절로 뾰족하게 좁아진다(별도 테이퍼 코드 불필요).
const Z_CUT = 0.03;

/**
 * 알맹이 1개. isSplit=true면 평면 절단을 적용해 { bodyGeo, cutGeo } 둘 다 반환하고,
 * false면 cutGeo는 비운다(통 알맹이는 단일 재질).
 */
function buildKernel(rng: () => number, isSplit: boolean): { bodyGeo: THREE.BufferGeometry; cutGeo: THREE.BufferGeometry | null } {
  const { geometry } = buildRevolvedShell(PROFILE, SEGMENTS, KERNEL_HALF_LENGTH, () => [KERNEL_RADIUS, KERNEL_RADIUS]);

  // 눕히기: rotateZ(-90deg) — olive.ts와 동일 관례. 장축이 로컬 X로, 로컬 Y가 "위"가 된다.
  geometry.rotateZ(-Math.PI / 2);

  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const mask = new Uint8Array(pos.count);
  if (isSplit) {
    // ⚠ 지터 **이전**에 자른다 — 마스크가 rng와 무관해야 색 경계가 결정론적이다.
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) > Z_CUT) {
        pos.setZ(i, Z_CUT);
        mask[i] = 1;
      }
    }
    pos.needsUpdate = true;
  }

  // 지터 — indexed 상태에서(공유 정점이 함께 움직여야 경계가 안 찢어진다, types.ts §5).
  jitterVertices(geometry, rng, JITTER_AMP);

  if (!isSplit) {
    const baked = facet(geometry);
    uvTopPlanar(baked);
    return { bodyGeo: baked, cutGeo: null };
  }

  // facet 전에 원본 index 보존 — splitTrianglesByVertexMask는 facet() 이전 indexed 배열을 요구한다.
  const originalIndex = (geometry.index as THREE.BufferAttribute).array as ArrayLike<number>;
  const baked = facet(geometry);
  const { trueTris, falseTris } = splitTrianglesByVertexMask(originalIndex, mask);
  const cutGeo = pickTriangles(baked, trueTris);
  const bodyGeo = pickTriangles(baked, falseTris);
  uvTopPlanar(cutGeo);
  uvTopPlanar(bodyGeo);
  return { bodyGeo, cutGeo };
}

interface KernelDef {
  /** 로제트 각도(deg) — 중심에서 이 방향으로 밀어낸다. 0deg = +X, 90deg = +Z. */
  deg: number;
  /** 중심에서의 거리. 이웃 알과의 캡슐 거리를 결정하는 주 손잡이. */
  radius: number;
  /** 장축을 순수 방사에서 살짝 비튼다(정확한 꽃잎 대칭은 인공적으로 보인다). */
  skew: number;
  /** 길이 방향으로 살짝 흔들리게(로컬 Z 롤). */
  tiltZ: number;
}

// v2 배치 = 방사 로제트(각 알의 장축이 중심에서 바깥으로, yaw = -deg). 관통 0을 만든 구조라
// v3도 그대로 쓴다. 다만 **자리 하나를 쪼개진 한 쌍이 통째로 차지**하므로 항목이 5 → 4가 됐고,
// 쌍은 폭이 통 알(0.8)의 1.7배(≈1.34)라 그만큼 이웃과의 각 간격·반지름을 벌렸다.
// v3 캡슐 실측(축 반길이 0.22 · 반지름 0.4, 쌍은 반지름 0.67로 취급):
//   쌍↔w3 1.08 / 쌍↔w1 1.11 (요구 1.07) · 통↔통 최악 1.03 (요구 0.80) — 전부 여유.
// ⚠ 좁히려면 캡슐 거리를 먼저 계산해라(v1의 초록 덩어리가 그렇게 돌아온다).
const WHOLE_KERNELS: Record<'w1' | 'w2' | 'w3', KernelDef> = {
  w1: { deg: 220, radius: 1.0, skew: -0.1, tiltZ: 0.06 },
  w2: { deg: 300, radius: 1.02, skew: 0.09, tiltZ: -0.05 },
  w3: { deg: 20, radius: 1.0, skew: 0.14, tiltZ: 0.04 },
};

// 쪼개진 알 — 기본 3/4 카메라 쪽(deg 121.6 = 카메라 (-1.6, 2.2, 2.6)의 방위)에 둔다.
// 자른 면이 이 재료의 유일한 읽을거리라 앞자리를 준다.
const SPLIT_DEG = 121.6;
const SPLIT_RADIUS = 0.86;
const SPLIT_SKEW = 0.05;
/** 자른 면 법선이 +Y에서 기운 각(τ). 법선 = (0, cos τ, ±sin τ) — 자른 면 자체는 수평에서 τ만큼 눕는다.
 * ★v3.1에서 25° → 34°. 하네스 카메라는 수직에서 **54°**(고도 35.8°)라, τ가 작으면 두 면이
 * 거의 수평으로 누워 az 225~315에서 **아이보리 원반 두 장**으로만 읽혔다(초록 몸통이 안 보였다 —
 * CRIB "넓은 마스크가 의도를 뒤집는다"의 정확한 재현). τ=34°면 카메라 쪽 면은 내적 cos20°=0.94로
 * 정면에 가깝게 잡히고, 반대쪽 면은 내적 0.03으로 시선에 스쳐 **초록 등짝**이 대신 보인다 —
 * 어느 방위에서도 아이보리와 초록이 함께 잡힌다. 두 면의 이면각 112°(펼친 책). */
const SPLIT_OPEN = (34 * Math.PI) / 180;
/** 두 반쪽의 중심 간 거리 절반. 자른 면 안쪽(높은) 모서리가 중앙에서 만나는 값이 τ=34°에서
 * 0.332라 0.27이면 위쪽에서 0.124 겹쳐 능선이 붙고 아래는 몸통끼리 맞물린다 — 배경이 안 비친다. */
const SPLIT_HALF_GAP = 0.27;
/** 두 반쪽을 길이축으로 어긋나게 놓는다. 정확히 나란하면 az 90/270에서 두 면이 투영상 포개져
 * 큰 베이지 덩어리 하나가 된다 — 어긋내면 옆에서도 조각 둘로 갈린다.
 * v3.2: 0.09 → 0.16(총 어긋남 0.32 = 길이 1.24의 26%). 0.18(15%)로는 az 270에서 두 면이
 * 여전히 하나의 베이지 원반으로 뭉쳤다. 더 키우면 "쪼개진 한 알"이 아니라 미끄러진 두 조각이 된다. */
const SPLIT_STAGGER = 0.16;

/** 로제트 한 자리를 차지하는 서브그룹 — 회전 후 자기 bbox로 접지한다(types.ts R1, olive.ts 관례). */
function placeInRosette(child: THREE.Object3D, deg: number, radius: number, skew: number, tiltZ: number): THREE.Group {
  const sub = new THREE.Group();
  sub.add(child);
  // yaw = -angle 이면 장축(로컬 +X)이 (cos angle, 0, sin angle) — 즉 로제트 반지름 방향이 된다.
  const angle = (deg * Math.PI) / 180;
  sub.rotation.set(0, -angle + skew, tiltZ);
  sub.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  sub.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sub);
  sub.position.y -= box.min.y;
  return sub;
}

/**
 * 쪼개진 알 한 쌍 — 펼친 책(등이 아래, 자른 면이 위+바깥).
 * side=+1 반쪽은 자른 면 법선이 +Z 그대로라 rotation.x = -(90°-τ) 로 눕히면 법선이
 * (0, cos τ, +sin τ)가 된다. side=-1은 yaw π 로 법선을 -Z로 돌린 뒤 반대 부호로 눕힌다.
 * ⚠ 거울 스케일(scale.z = -1)로 만들지 마라 — 와인딩이 뒤집혀 면이 안쪽을 향한다.
 * 회전과 이동을 한 Object3D에 몰지 않고 그룹을 겹치는 것도 의도다(적용 순서 함정, flaxseed 선례).
 */
function buildSplitPair(rng: () => number, bodyMat: THREE.Material, cutMat: THREE.Material): THREE.Group {
  const pair = new THREE.Group();
  for (const side of [1, -1] as const) {
    const { bodyGeo, cutGeo } = buildKernel(rng, true);
    const lobe = new THREE.Group();
    lobe.add(new THREE.Mesh(bodyGeo, bodyMat));
    if (cutGeo) lobe.add(new THREE.Mesh(cutGeo, cutMat));

    const yawed = new THREE.Group();
    yawed.rotation.y = side === 1 ? 0 : Math.PI;
    yawed.add(lobe);

    const roller = new THREE.Group();
    roller.rotation.x = -side * (Math.PI / 2 - SPLIT_OPEN);
    // 완전 대칭은 인공적이다 — 한쪽만 길이축으로 조금 더 돌린다(결정론, rng 무관).
    roller.rotation.y = side === 1 ? 0.07 : -0.04;
    roller.position.set(side * SPLIT_STAGGER, 0, side * SPLIT_HALF_GAP);
    roller.add(yawed);
    pair.add(roller);
  }
  return pair;
}

export const createPistachio: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const cutMat = stdMaterial({ color: CUT_COLOR });

  const cluster = new THREE.Group();

  (Object.keys(WHOLE_KERNELS) as (keyof typeof WHOLE_KERNELS)[]).forEach((key) => {
    const def = WHOLE_KERNELS[key];
    const { bodyGeo } = buildKernel(rng, false);
    const kernel = new THREE.Group();
    kernel.add(new THREE.Mesh(bodyGeo, bodyMat));
    cluster.add(placeInRosette(kernel, def.deg, def.radius, def.skew, def.tiltZ));
  });

  // 쌍은 **한 덩어리로 한 번만** 접지한다 — 반쪽을 따로 접지하면 벌어진 각도가 눌려
  // 두 조각이 나란히 눕고 "펼친 책"이 사라진다(CRIB 더미 그라운딩 규칙과 같은 이유).
  cluster.add(placeInRosette(buildSplitPair(rng, bodyMat, cutMat), SPLIT_DEG, SPLIT_RADIUS, SPLIT_SKEW, 0));

  return mergeByMaterial(cluster);
};
