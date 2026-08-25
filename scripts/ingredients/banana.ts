// 바나나 — 코인 슬라이스 3장, 살짝 겹치며 눕는다. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/banana.json(워크스페이스 원본은
// assets/ingredients/work/banana/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★lemon과 이 배치의 혼동쌍(팀리드 지시) — lemon.ts 머리 주석 참조. 분리 축 셋: (1) 배치 —
// 레몬은 두 장이 "세워서/기대어"(rotation.x ~= PI/2), 바나나는 세 장이 거의 "눕혀서" 살짝만
// 기울여 겹친다(rotation.x가 0에 가까움) — 3/4 상단 카메라가 과육면을 자연히 내려다본다.
// (2) 속 무늬 — 레몬은 방사 웨지+막선, 바나나는 중심의 작은 씨점 링(seed-fleck ring)뿐이다.
// (3) 색 — 레몬 황록(#C8D63E), 바나나 연노랑(#E8D46A). advisor 권고대로 씨점은 "적고 크게"
// (7개, 굵은 반점) — 촘촘한 잔점은 64px에서 증발한다(CRIB rosemary/cinnamon 교훈과 동일 원리).
//
// 원반 지오메트리는 lemon.ts와 같은 buildRevolvedShell 원반 패턴이지만 파일을 공유하지 않는다
// (fig/pumpkin이 각자 로컬 half/wedge 셸을 두는 것과 같은 관례 — 다른 재료 파일을 건드리지 않는다).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { bakeTexture, buildRevolvedShell, facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvDome, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/banana.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
// 아랫면 그늘(#D0BA52)은 드롭 — body와 색상 거리가 가깝고, 양면이 같은 텍스처를 공유하는 편이
// mesh<=2 예산 안에서 더 단순하다(런타임 N·L이 실제 명암 차이를 공짜로 낸다).
const RIND_COLOR = 0xc4a83e; // "a thin golden-brown peel rim"
const PULP_COLOR = 0xe8d46a; // "a soft yellow flesh body"
const SEED_COLOR = 0x8a6b2e; // "a small ring of dark seed-flecks marking the center"

// 실측 비율 (assets/ingredients/src/banana.png 3/4 · banana-2.png 정면 · banana-3.png 탑다운).
// 레몬보다 더 얇은 진짜 "코인" 비율.
const BANANA_RADIUS = 0.6;
const BANANA_HALF_THICKNESS = 0.085; // 두께:지름 ~= 0.14:1
const BANANA_SEGMENTS = 14;

type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.6, -0.97],
  [0.92, -0.9],
  [1.0, -0.35],
  [1.0, 0.35],
  [0.92, 0.9],
  [0.6, 0.97],
  [0.0, 1.0],
];

const JITTER_AMP = 0.012; // ~2% of BANANA_RADIUS — 얇은 코인 실루엣 보존(R4)

/** 밴드별 삼각형 수 — lemon.ts와 동일 계산 방식(하드코딩 금지, advisor 권고). */
function bandTriCounts(profile: readonly ProfilePoint[], segments: number): number[] {
  const counts: number[] = [];
  for (let ri = 0; ri < profile.length - 1; ri++) {
    const aPole = profile[ri][0] <= 1e-6;
    const bPole = profile[ri + 1][0] <= 1e-6;
    counts.push(aPole || bPole ? segments : segments * 2);
  }
  return counts;
}

// --- 과육 텍스처: 균일 살빛 + 중심 씨점 링(굵은 반점 7개). uvDome을 과육 양면에 그대로 쓴다.
const TEX_SIZE = 128; // <=256 (R3) — 씨점 하나뿐이라 레몬보다 더 작게 잡아도 충분
const SEED_RING_R = 0.11; // 정규화 반지름(0~0.5가 원판 전체) 대비 씨점 링 반지름
const SEED_DOT_R = 0.045; // 개별 씨점 반지름 — "적고 크게"(advisor)
const SEED_COUNT = 7;

function paintBananaPulpTexture(rng: () => number): THREE.CanvasTexture {
  const pulp: [number, number, number] = [(PULP_COLOR >> 16) & 0xff, (PULP_COLOR >> 8) & 0xff, PULP_COLOR & 0xff];
  const seed: [number, number, number] = [(SEED_COLOR >> 16) & 0xff, (SEED_COLOR >> 8) & 0xff, SEED_COLOR & 0xff];

  const seedCenters: [number, number][] = [];
  for (let i = 0; i < SEED_COUNT; i++) {
    const angle = (i / SEED_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const r = SEED_RING_R * (0.9 + rng() * 0.2);
    seedCenters.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }

  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size - 0.5;
        const v = (py + 0.5) / size - 0.5;
        let c = pulp;
        for (const [sx, sy] of seedCenters) {
          if (Math.hypot(u - sx, v - sy) < SEED_DOT_R) {
            c = seed;
            break;
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
  rotation: readonly [number, number, number]; // (x,y,z) — x가 작을수록 "눕는다"(레몬과 반대)
}

// assets/ingredients/work/banana/object-sculpt-spec.json SLICES 전사. 셋 다 rotation.x가 작아
// 거의 눕혀 있고(레몬의 PI/2 근처와 대비), X를 따라 살짝씩 겹친다("overlapping row").
const SLICES: Record<'a' | 'b' | 'c', SliceDef> = {
  a: { offset: [-0.85, 0.05], rotation: [0.15, 0.2, 0.05] },
  b: { offset: [0.0, -0.08], rotation: [0.08, -0.3, 0.1] },
  c: { offset: [0.82, 0.1], rotation: [0.2, 0.6, -0.05] },
};

function buildSlice(rng: () => number): { rindGeo: THREE.BufferGeometry; pulpBottomGeo: THREE.BufferGeometry; pulpTopGeo: THREE.BufferGeometry } {
  const { geometry } = buildRevolvedShell(PROFILE, BANANA_SEGMENTS, BANANA_HALF_THICKNESS, () => [BANANA_RADIUS, BANANA_RADIUS]);
  jitterVertices(geometry, rng, JITTER_AMP);

  const baked = facet(geometry);
  const counts = bandTriCounts(PROFILE, BANANA_SEGMENTS);
  const cum: number[] = [];
  counts.reduce((acc, c) => {
    const next = acc + c;
    cum.push(next);
    return next;
  }, 0);
  // PULP(밑면) = 밴드 0..1, RIND = 밴드 2..4, PULP(윗면) = 밴드 5..6 — lemon.ts와 동일 배치.
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

export const createBanana: IngredientBuilder = (rng) => {
  const rindMat = stdMaterial({ color: RIND_COLOR });
  const pulpMat = stdMaterial({ map: paintBananaPulpTexture(rng), color: 0xffffff });

  const cluster = new THREE.Group();

  (Object.keys(SLICES) as (keyof typeof SLICES)[]).forEach((key) => {
    const def = SLICES[key];
    const { rindGeo, pulpBottomGeo, pulpTopGeo } = buildSlice(rng);

    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(rindGeo, rindMat), new THREE.Mesh(pulpBottomGeo, pulpMat), new THREE.Mesh(pulpTopGeo, pulpMat));
    sub.rotation.set(def.rotation[0], def.rotation[1], def.rotation[2]);
    sub.position.set(def.offset[0], 0, def.offset[1]);

    // 공유 지면 y=0 — 회전 후 bbox를 구해 바닥을 원점에 맞춘다(types.ts R1).
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;

    cluster.add(sub);
  });

  return mergeByMaterial(cluster);
};
