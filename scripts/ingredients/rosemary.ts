// 로즈마리 — 잔가지 1개 + 바늘잎 다수. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/rosemary.json(워크스페이스 원본은
// assets/ingredients/work/rosemary/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// R4 최우선 적용 대상(types.ts): 바늘잎은 지터 생략 — 얇은 실루엣이 빵 스케일 지터를 먹으면
// 뭉개진다. 대신 advisor 권고대로 "적고 굵게": 바늘 24개, 각각 닫힌 방추 솔리드(뿌리·끝 꼭짓점 +
// 중간 링 3개). 순색 2버킷(바늘 sage-green · 줄기 olive-tan) — 프롬프트 JSON의 hex
// 4개 중 그늘진 아랫면(#4F6B41)·윗면 하이라이트(#9BB183) 2개는 올리브 선례처럼 드롭한다(런타임
// 키라이트의 N·L 감쇠가 페이셋마다 제각각 향하는 바늘에 이미 그 효과를 공짜로 낸다).
//
// ★2026-08-26 전체 화면 쇼케이스 수리 (되돌리지 말 것):
//   ① 바늘잎이 **두께 0인 평면 카드**였다 → 실제 부피가 있는 방추로. 상세 근거는 buildNeedle 주석.
//   ② 줄기 원통이 **양끝이 뚫린 관**이었다 → 극(pole) 링으로 양끝을 막았다. 상세는 buildStem 주석.
//   검증을 64px 썸네일 판독으로만 했던 게 놓친 이유다. 재료도 빵과 **같은 쇼케이스에서 같은 크기로**
//   확대돼 보인다(breadShowcase FIT_SIZE는 패밀리를 안 가린다). 예산도 그래서 빵과 같아졌다
//   (개당 250KB/8000tri, 정본 = scripts/lib/families.mjs) — 폴리곤을 아껴 각지게 만들 이유가 없다.
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
const STEM_SEGMENTS = 8; // 각진 페이셋 — rosemary.png 실측: 매끈한 원통이 아니라 목질 다각형.
// 6 → 8: 전체 화면에서 6각형은 줄기가 납작한 판자로 읽힌다. 자른 밑동의 다각형 단면도 8쪽이 낫다.
const STEM_JITTER_AMP = 0.004; // R4 — 줄기는 바늘보다 두꺼워 완전 생략까진 필요 없지만 최소로

const NEEDLE_COUNT = 24; // cmp-1 실측: 16개·좁은 폭은 성글어 보였다 — advisor 권고 상한 쪽으로.
const NEEDLE_LENGTH_BASE = 0.46; // 밑동 쪽(t=0) 바늘 길이
const NEEDLE_LENGTH_TIP = 0.3; // 끝 쪽(t=1) 바늘은 더 짧다(어린 잎, rosemary.png 실측)
const NEEDLE_WIDTH = 0.096; // 넓은 축(e1)의 최대 폭 — 이전 평면 카드의 날개 폭 0.092를 계승
const NEEDLE_THICK_RATIO = 0.55; // 얇은 축(e2)/넓은 축. 1.0(원기둥)은 솔잎이 아니라 철사로 보이고
// 0.3 이하는 다시 카드로 돌아간다 — rosemary.png의 잎은 납작하되 분명한 두께가 있다.
const NEEDLE_RING_SIDES = 6; // 단면 링 정점 수
// 링 배치 [축 위치 t, 폭 배율] — 뿌리~46% 지점이 가장 넓고 끝으로 매끈하게 좁아진다(rosemary.png).
const NEEDLE_RINGS: readonly (readonly [number, number])[] = [
  [0.2, 0.7],
  [0.46, 1],
  [0.76, 0.58],
];
const NEEDLE_BEND = 0.1; // 길이 대비 활처럼 휘는 양 — 레퍼런스의 잎은 줄기 끝 방향으로 쓸린다

/**
 * 바늘잎 1개 = 닫힌 방추 솔리드. 뿌리 꼭짓점 + 중간 링 3개(각 6점) + 끝 꼭짓점 = 20정점 / 36tri.
 * 지터 없음(R4) — 페이셋 노멀만 facet()으로 굽는다.
 *
 * ★되돌리지 말 것 (2026-08-26 수리의 핵심):
 * 이전 구현은 주석에 "4정점 사면체"라고 썼지만 실제로는 root·tip·wingA·wingB 네 점이 **한 평면**에
 * 놓여 있었다(사면체 부피 실측 3.6e-20 = 사실상 0). wingA/wingB가 축 위 mid에서 같은 wing 벡터의
 * ±방향으로만 벌어져 네 점이 (축, wing) 평면을 못 벗어나기 때문이다. 즉 두께 0인 양면 카드였고,
 * 시선과 평행해지는 각도에서 폭이 0으로 붕괴해 **1px 머리카락 선**이 됐다. 턴테이블이라 회전할
 * 때마다 여러 개가 그 각도를 통과해서 화면에 난 긁힘처럼 보였다(수리 전 0/90/180/270 전 각도에서 관찰).
 * 해법은 단면에 실제 부피를 주는 것뿐이다: 볼록 다각형 단면은 어느 방향으로 투영해도 폭이
 * [얇은 축, 넓은 축] 사이에 갇히므로 **어떤 각도에서도 선으로 붕괴하지 않는다.** 이게 이 형상의
 * 존재 이유다 — tri를 아끼려고 평면 카드(4·6정점 리본 포함)로 되돌리지 말 것.
 */
function buildNeedle(root: THREE.Vector3, tip: THREE.Vector3, width: number): THREE.BufferGeometry {
  const dir = tip.clone().sub(root).normalize();
  // e1 = 넓은 축(수평 날개, 이전 구현의 wing과 같은 방향이라 정면 실루엣이 보존된다),
  // e2 = 얇은 축. e1 x e2 = dir(우수)이라 아래 감기 순서가 바깥 노멀을 낸다.
  const e1 = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
  if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0);
  e1.normalize();
  const e2 = new THREE.Vector3().crossVectors(dir, e1);
  // 굽힘 방향 = +X의 축 수직 성분(줄기 끝 쪽으로 쓸린다). 축이 X와 나란하면 e1로 폴백.
  const bend = new THREE.Vector3(1, 0, 0).addScaledVector(dir, -dir.x);
  if (bend.lengthSq() < 1e-6) bend.copy(e1);
  else bend.normalize();
  const length = tip.distanceTo(root);
  const halfWide = width / 2;

  const positions: number[] = [];
  const push = (p: THREE.Vector3) => positions.push(p.x, p.y, p.z);
  push(root); // 0 = 뿌리 꼭짓점 (줄기 안쪽 — makeNeedleDefs가 축에서 0.4·stemR 위치에 심는다)
  for (const [t, scale] of NEEDLE_RINGS) {
    const center = root
      .clone()
      .lerp(tip, t)
      .addScaledVector(bend, NEEDLE_BEND * length * Math.sin(Math.PI * t));
    for (let m = 0; m < NEEDLE_RING_SIDES; m++) {
      const a = (m / NEEDLE_RING_SIDES) * Math.PI * 2;
      push(
        center
          .clone()
          .addScaledVector(e1, halfWide * scale * Math.cos(a))
          .addScaledVector(e2, halfWide * NEEDLE_THICK_RATIO * scale * Math.sin(a)),
      );
    }
  }
  const tipIndex = positions.length / 3;
  push(tip);

  const ring = (k: number, m: number) => 1 + k * NEEDLE_RING_SIDES + (m % NEEDLE_RING_SIDES);
  const index: number[] = [];
  for (let m = 0; m < NEEDLE_RING_SIDES; m++) {
    index.push(0, ring(0, m + 1), ring(0, m)); // 뿌리 팬 — 역순이 -dir(바깥) 노멀
    for (let k = 0; k < NEEDLE_RINGS.length - 1; k++) {
      index.push(ring(k, m), ring(k, m + 1), ring(k + 1, m + 1));
      index.push(ring(k, m), ring(k + 1, m + 1), ring(k + 1, m));
    }
    index.push(tipIndex, ring(NEEDLE_RINGS.length - 1, m), ring(NEEDLE_RINGS.length - 1, m + 1)); // 끝 팬
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

/**
 * 줄기 — 8각 절두원뿔. ★양끝을 극(pole) 링으로 막는다(되돌리지 말 것): 이전 프로필은
 * [[1,-1],[1,1]] 두 링뿐이라 **양끝이 뚫린 관**이었다. FrontSide 렌더에서 잘린 단면이
 * 구멍으로 읽히고, 레퍼런스(rosemary.png)는 밑동에 다각형 자른 면이 밝게 보인다.
 * ⚠ 극 링이 앞뒤로 붙으면서 실제 원통 링의 ringIndex가 0·1 → 1·2로 밀렸다(radialScale 조건 주의).
 */
function buildStem(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(
    [
      [0, -1], // 밑동 캡 중심(극)
      [1, -1],
      [1, 1],
      [0, 1], // 끝 캡 중심(극)
    ],
    STEM_SEGMENTS,
    STEM_HALF_LENGTH,
    (_hFrac, ringIndex) => (ringIndex === 1 ? [STEM_RADIUS_BASE, STEM_RADIUS_BASE] : [STEM_RADIUS_TIP, STEM_RADIUS_TIP]),
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
  zJitter: number; // 깊이 방향(Z) 소폭 변주 — 잔가지 **배열 전체**가 한 평면에 눕지 않게 하는 정도만
  // (바늘 하나하나의 두께는 buildNeedle의 단면이 책임진다 — 별개 문제다)
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
    // 뿌리는 줄기 **표면이 아니라 축에서 ~0.4·stemR** 지점, 즉 줄기 안쪽에 심는다 — 부피가 생긴
    // 바늘이 표면에 점으로 붙으면 각도에 따라 덜 붙은 것처럼 보인다(떠 있는 파트). 관통은 안 보인다.
    const root = new THREE.Vector3(x, dirY * stemR, dirZ * stemR);
    const length = NEEDLE_LENGTH_BASE + (NEEDLE_LENGTH_TIP - NEEDLE_LENGTH_BASE) * def.t;
    const alongX = 0.08 + rng() * 0.06; // 끝(줄기 tip) 방향으로 살짝만 기울어 뻗는다
    const tipDir = new THREE.Vector3(alongX, dirY, dirZ).normalize();
    const tip = root.clone().addScaledVector(tipDir, length);
    group.add(new THREE.Mesh(buildNeedle(root, tip, NEEDLE_WIDTH), needleMat));
  }

  return mergeByMaterial(group);
};
