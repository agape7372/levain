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

// 자른 면 = 평면 절단. 눕힌 뒤(장축이 로컬 X) y > Y_CUT 인 정점을 Y_CUT으로 누른다.
// 적도(y=0)보다 살짝 위 → "반쪽보다 아주 조금 큰" 조각. 끝으로 갈수록 링 반지름이 줄어 y가
// Y_CUT을 못 넘으므로 자른 면이 저절로 뾰족하게 좁아진다(별도 테이퍼 코드 불필요).
const Y_CUT = 0.02;

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
      if (pos.getY(i) > Y_CUT) {
        pos.setY(i, Y_CUT);
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
  /** 반쪽만: 길이 방향으로 살짝 흔들리게. ⚠ 크게 주면 자른 면이 "위"로 안 읽힌다 — 0.2 이하. */
  tiltZ: number;
  split: boolean;
}

// v2 배치 — 방사 로제트. 각 알의 장축이 중심에서 바깥으로 뻗고(yaw = -deg), 이웃끼리는 안쪽 끝에서
// 가장 가까워진다. 전 쌍의 캡슐 거리 실측: 최악 0.822 / 기준 0.80 (전부 접촉 이상, 관통 0).
// 로제트를 통째로 돌려 **쪼개진 반쪽 둘(hA·hB)이 기본 3/4 카메라 쪽(deg 121.6)에 오게** 맞췄다 —
// 자른 면이 이 재료의 읽을거리라 앞에 둬야 한다.
const KERNELS: Record<'w1' | 'w2' | 'w3' | 'hA' | 'hB', KernelDef> = {
  w1: { deg: 238, radius: 0.95, skew: -0.1, tiltZ: 0, split: false },
  w2: { deg: 310, radius: 0.97, skew: 0.09, tiltZ: 0, split: false },
  w3: { deg: 18, radius: 0.93, skew: 0.14, tiltZ: 0, split: false },
  hA: { deg: 90, radius: 0.97, skew: -0.08, tiltZ: -0.1, split: true },
  hB: { deg: 160, radius: 0.93, skew: 0.1, tiltZ: 0.1, split: true },
};

export const createPistachio: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ color: BODY_COLOR });
  const cutMat = stdMaterial({ color: CUT_COLOR });

  const cluster = new THREE.Group();

  (Object.keys(KERNELS) as (keyof typeof KERNELS)[]).forEach((key) => {
    const def = KERNELS[key];
    const { bodyGeo, cutGeo } = buildKernel(rng, def.split);

    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(bodyGeo, bodyMat));
    if (cutGeo) sub.add(new THREE.Mesh(cutGeo, cutMat));

    // yaw = -angle 이면 장축(로컬 +X)이 (cos angle, 0, sin angle) — 즉 로제트 반지름 방향이 된다.
    const angle = (def.deg * Math.PI) / 180;
    sub.rotation.set(0, -angle + def.skew, def.tiltZ);
    sub.position.set(Math.cos(angle) * def.radius, 0, Math.sin(angle) * def.radius);

    // 공유 지면 y=0 — 이 알만의 회전 후 bbox를 구해 바닥을 원점에 맞춘다(types.ts R1, olive.ts 관례).
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;

    cluster.add(sub);
  });

  return mergeByMaterial(cluster);
};
