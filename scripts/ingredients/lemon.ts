// 레몬 — 슬라이스 2장, 하나는 세워 서고 다른 하나는 기대어 눕는다. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/lemon.json(워크스페이스 원본은
// assets/ingredients/work/lemon/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★lemon↔banana가 이 배치의 혼동쌍(팀리드 지시) — 둘 다 얇은 원반(코인) 슬라이스라 형태 하나로는
// 안 갈린다. 두 가지 축으로 분리한다: (1) 배치 실루엣 — 레몬은 두 장이 "세워서/기대어" 서고
// (rotation.x로 원반을 세운다), 바나나는 세 장이 "눕혀서" 겹친다(bananan.ts 참조). (2) 속 무늬 —
// 레몬은 방사 웨지(막선 + 교대 명암) + 중심 심, 바나나는 씨점 링. 색도 이미 갈렸다(레몬 황록
// #C8D63E, 바나나 연노랑 #E8D46A) — 형태·무늬·색 셋 다 겹치지 않게 짰다.
//
// 원반 지오메트리는 buildRevolvedShell을 "두께가 얇은 축(Y)"으로 그대로 쓴다(팬케이크 디스크와
// 동일 원리 — 회전축=Y가 원반의 두께 방향, 반지름이 실제 보이는 원판). 세우기/기대기는 지오메트리
// 회전이 아니라 인스턴스 Group.rotation(올리브·크랜베리가 배치에 쓰는 것과 같은 메커니즘)만으로
// 처리 — geometry.rotateZ 트릭이 필요 없다(그라운딩은 항상 bbox 기반이라 최종 방향에 무관하다).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { bakeTexture, buildRevolvedShell, facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvDome, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/lemon.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const RIND_COLOR = 0xc8d63e; // "a vivid yellow-green rind ring"
const PULP_COLOR = 0xdccb33; // "a bright yellow pulp body"
const PULP_SHADE = 0xa89426; // "a deeper golden-yellow shading the lower shaded segments" — 웨지 교대 음영
const PITH_COLOR = 0xf5f0d6; // "thin ivory-white pith membranes" + 중심 심

// 실측 비율 (assets/ingredients/src/lemon.png 3/4 · lemon-2.png 정면 · lemon-3.png 탑다운).
const LEMON_RADIUS = 0.62;
const LEMON_HALF_THICKNESS = 0.1; // 두께:지름 ~= 0.16:1, 얇은 코인 슬라이스
const LEMON_SEGMENTS = 16;

type ProfilePoint = readonly [number, number];
// (반지름비, 높이비) — heightFrac -1(밑면 중심) .. +1(윗면 중심). 회전축(Y)이 두께라 이 프로필은
// "옆에서 본 얇은 원반 단면"이다: 극 -> 과육면(평평) -> 림 챔퍼 -> 껍질 벽(수직) -> 림 챔퍼 ->
// 과육면 -> 극.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.55, -0.985],
  [0.9, -0.94],
  [1.0, -0.42],
  [1.0, 0.42],
  [0.9, 0.94],
  [0.55, 0.985],
  [0.0, 1.0],
];

const JITTER_AMP = 0.014; // ~2.3% of LEMON_RADIUS — 원반 윤곽을 지우지 않을 만큼 낮게(R4)

/** 밴드별 삼각형 수 — buildRevolvedShell 내부 인덱싱 규칙을 그대로 재현해 슬라이스 경계를
 * 프로필에서 계산한다(하드코딩 금지, advisor 권고). */
function bandTriCounts(profile: readonly ProfilePoint[], segments: number): number[] {
  const counts: number[] = [];
  for (let ri = 0; ri < profile.length - 1; ri++) {
    const aPole = profile[ri][0] <= 1e-6;
    const bPole = profile[ri + 1][0] <= 1e-6;
    counts.push(aPole || bPole ? segments : segments * 2);
  }
  return counts;
}

// --- 과육 텍스처: 방사 웨지(막선 + 교대 명암) + 중심 심. uvDome(X,Z 로컬 극좌표)를 과육 양면에
// 그대로 써 등방 매핑을 얻는다(fig의 uvFrontPlanar 비등방 함정을 pumpkin처럼 uvDome으로 회피).
const TEX_SIZE = 160; // <=256 (R3)
const WEDGE_COUNT = 10; // 레몬-3.png 탑다운 실측: 방사 칸 8~11개 범위
const PITH_RADIUS = 0.1; // 정규화 반지름(0~0.5가 원판 전체) 대비 중심 심 크기
const MEMBRANE_HALF_WIDTH = 0.05; // cos(angle*WEDGE_COUNT) 값 기준 막선 폭

function paintLemonPulpTexture(): THREE.CanvasTexture {
  const pulp: [number, number, number] = [(PULP_COLOR >> 16) & 0xff, (PULP_COLOR >> 8) & 0xff, PULP_COLOR & 0xff];
  const shade: [number, number, number] = [(PULP_SHADE >> 16) & 0xff, (PULP_SHADE >> 8) & 0xff, PULP_SHADE & 0xff];
  const pith: [number, number, number] = [(PITH_COLOR >> 16) & 0xff, (PITH_COLOR >> 8) & 0xff, PITH_COLOR & 0xff];

  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size - 0.5;
        const v = (py + 0.5) / size - 0.5;
        const dist = Math.hypot(u, v);
        const angle = Math.atan2(v, u);
        let c: [number, number, number];
        if (dist < PITH_RADIUS) {
          c = pith;
        } else {
          const stripe = Math.cos(angle * WEDGE_COUNT);
          if (stripe > 1 - MEMBRANE_HALF_WIDTH) {
            c = pith; // 웨지 경계 막선
          } else {
            const wedgeIndex = Math.floor(((angle / (Math.PI * 2)) * WEDGE_COUNT + WEDGE_COUNT) % WEDGE_COUNT);
            c = wedgeIndex % 2 === 0 ? pulp : shade; // 교대 명암 — "wedge-shaped ... segments" 가독성
          }
        }
        const o = (py * size + px) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

interface SliceDef {
  offset: readonly [number, number]; // world XZ
  rotation: readonly [number, number, number]; // (x,y,z) — x가 원반을 세우는 축
}

// assets/ingredients/work/lemon/object-sculpt-spec.json SLICES 전사. rotation.x = PI/2에 가까울수록
// "세워서" 과육면이 카메라를 향한다. b는 x를 줄여 뒤로 살짝 기대고, a 뒤에 겹친다("leaning behind
// it with its base slightly overlapping").
const SLICES: Record<'a' | 'b', SliceDef> = {
  a: { offset: [-0.05, 0.08], rotation: [Math.PI / 2, 0.12, 0.04] },
  b: { offset: [0.32, -0.18], rotation: [Math.PI / 2 - 0.42, -0.22, -0.1] },
};

function buildSlice(rng: () => number): { rindGeo: THREE.BufferGeometry; pulpBottomGeo: THREE.BufferGeometry; pulpTopGeo: THREE.BufferGeometry } {
  const { geometry } = buildRevolvedShell(PROFILE, LEMON_SEGMENTS, LEMON_HALF_THICKNESS, () => [LEMON_RADIUS, LEMON_RADIUS]);
  jitterVertices(geometry, rng, JITTER_AMP);

  const baked = facet(geometry);
  const counts = bandTriCounts(PROFILE, LEMON_SEGMENTS);
  const cum: number[] = [];
  counts.reduce((acc, c) => {
    const next = acc + c;
    cum.push(next);
    return next;
  }, 0);
  // PULP(밑면) = 밴드 0..1, RIND = 밴드 2..4(챔퍼+수직 벽+챔퍼), PULP(윗면) = 밴드 5..6.
  const pulpBottomEnd = cum[1];
  const rindEnd = cum[4];
  const total = cum[cum.length - 1];

  const pulpBottomGeo = sliceTriangles(baked, 0, pulpBottomEnd);
  const rindGeo = sliceTriangles(baked, pulpBottomEnd, rindEnd);
  const pulpTopGeo = sliceTriangles(baked, rindEnd, total);
  uvDome(pulpBottomGeo);
  uvDome(pulpTopGeo);
  uvTopPlanar(rindGeo);
  return { rindGeo, pulpBottomGeo, pulpTopGeo };
}

export const createLemon: IngredientBuilder = (rng) => {
  const rindMat = stdMaterial({ color: RIND_COLOR });
  const pulpMat = stdMaterial({ map: paintLemonPulpTexture(), color: 0xffffff });

  const cluster = new THREE.Group();

  (Object.keys(SLICES) as (keyof typeof SLICES)[]).forEach((key) => {
    const def = SLICES[key];
    const { rindGeo, pulpBottomGeo, pulpTopGeo } = buildSlice(rng);

    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(rindGeo, rindMat), new THREE.Mesh(pulpBottomGeo, pulpMat), new THREE.Mesh(pulpTopGeo, pulpMat));
    sub.rotation.set(def.rotation[0], def.rotation[1], def.rotation[2]);
    sub.position.set(def.offset[0], 0, def.offset[1]);

    // 공유 지면 y=0 — 세운/기댄 회전 후 bbox를 구해 바닥을 원점에 맞춘다(types.ts R1).
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;

    cluster.add(sub);
  });

  return mergeByMaterial(cluster);
};
