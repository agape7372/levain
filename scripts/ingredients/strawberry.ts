// 딸기 — 회전체 몸통(텍스처 1장: 다홍 바탕+씨 점) + 꽃받침 잎 5장(양측 페이싯) + 꼭지. 계약은
// types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/strawberry.json(워크스페이스 원본은
// assets/ingredients/work/strawberry/). 프로필·색·잎 배치는 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// R3(types.ts) 텍스처 탈출구: hex 5개(바탕·그늘·하이라이트·씨·잎) vs 머티리얼 2개 상한 —
// 그늘/하이라이트는 올리브·밤·호두와 같은 이유로 N·L 감쇠에 맡겨 드롭, 남은 3색 중 씨앗만
// 지오메트리로 못 담아(전신에 흩뿌려진 점 다수) 몸통 버킷에 작은 캔버스 텍스처로 얹는다
// (pumpkin 선례). 잎은 별도 flat 버킷(순색).
// ⚠ 런타임 MeshLambertMaterial 스왑은 map·color만 승계 — material.side는 안 살아남는다(types.ts
// §2 확인, breadlab.ts/thumbsHarness.ts/breadShowcase.ts 3곳 전부 동일). 그래서 잎은 진짜 평면 1장이
// 아니라 **앞면+뒤집힌 뒷면 트라이앵글을 함께 굽는다** — material.doubleSided는 스펙 기록용일 뿐,
// 실제 양면 가시성은 지오메트리로 해결한다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { bakeTexture, buildRevolvedShell, facet, jitterVertices, mergeByMaterial, stdMaterial, uvCylindrical } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/strawberry.json geometry.surface 손 전사 (JSON import 금지,
// types.ts §7). "#96271F"(그늘)·"#DC6151"(하이라이트)은 볼록한 몸통의 N·L 감쇠가 공짜로 표현하므로
// 버킷을 안 만든다(올리브/밤/호두와 동일 논리).
const BODY_COLOR = 0xc0392f; // "a saturated scarlet body"
const SEED_COLOR = 0xf4e3c4; // "small pale seed dimples"
const CALYX_COLOR = 0x6b7e4a; // "the calyx leaves are a fresh green"

const SEGMENTS = 14;
const BODY_RADIUS = 0.5;
// cmp-1 판정: 0.85(높이:너비 0.85:1)는 런타임의 "최장축->1.6" 리핏이 **너비**를 최장축으로 골라
// 딸기가 옆으로 넓적하게 렌더됐다(레퍼런스는 세로로 긴 하트형, ~1.3:1). 높이를 확실히 최장축으로.
const BODY_HEIGHT = 1.3; // 바닥 뾰족한 끝 -> 어깨 위 꼭지 부착점까지 전체 높이

// (반지름비, 높이비) — heightFrac 0(뾰족한 바닥) .. 1(윗쪽 극점, 꽃받침 부착부). 가장 넓은 지점은
// 위쪽 58% 지점 (strawberry-2.png 정면도 실측 — "widest near the top").
type ProfilePoint = readonly [number, number];
const PROFILE: readonly ProfilePoint[] = [
  [0.0, 0.0], // 바닥 극점 (뾰족한 끝)
  [0.3, 0.1],
  [0.6, 0.24],
  [0.85, 0.4],
  [1.0, 0.58], // 어깨 — 가장 넓은 지점
  [0.93, 0.76],
  [0.7, 0.9],
  [0.4, 0.98],
  [0.0, 1.0], // 윗 극점 (꽃받침 아래)
];

const JITTER_AMP = 0.018; // ~3.6% of BODY_RADIUS — R4

// 씨 점 텍스처 — bakeTexture(rye.ts 얼룩 패턴 재사용) + uvCylindrical('y'). 256px 상한 훨씬 아래
// 96px로 조인다(types.ts R3). 격자 칸을 u=0/1 랩 경계에서 비껴 놓아(칸 중심이 항상 경계에서
// 떨어짐) 씨가 이음매에서 잘리는 문제를 원천 차단한다(advisor 사전 리뷰 지적).
// cmp-1 판정: 6x5=30개 점을 지터 ±0.08/±0.04로 흩뿌렸더니 서로 겹쳐 지그재그 얼룩으로 뭉쳤다 —
// 개수를 줄이고 지터를 좁히고 점을 작게 해 서로 안 닿게 했다(cmp-2, 성공). cmp-2 판정: 안 겹치는
// 건 확인됐으니 레퍼런스의 촘촘한 스티플에 맞춰 다시 밀도를 올린다(크기는 그대로 작게 유지).
const TEX_SIZE = 96;
const SEED_ROWS = 7;
const SEED_COLS = 5;
const SEED_V_RANGE: readonly [number, number] = [0.18, 0.82]; // 양쪽 극점 근처는 비운다

function hexToRgb(hex: number): string {
  return `rgb(${(hex >> 16) & 0xff}, ${(hex >> 8) & 0xff}, ${hex & 0xff})`;
}

function bakeBodyTexture(rng: () => number): THREE.CanvasTexture {
  return bakeTexture(TEX_SIZE, (ctx, size) => {
    ctx.fillStyle = hexToRgb(BODY_COLOR);
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = hexToRgb(SEED_COLOR);
    for (let row = 0; row < SEED_ROWS; row++) {
      for (let col = 0; col < SEED_COLS; col++) {
        const u = (col + 0.5) / SEED_COLS + (rng() - 0.5) * 0.03;
        const vFrac = (row + 0.5) / SEED_ROWS;
        const v = SEED_V_RANGE[0] + vFrac * (SEED_V_RANGE[1] - SEED_V_RANGE[0]) + (rng() - 0.5) * 0.02;
        const px = u * size;
        const py = (1 - v) * size;
        const rx = size * 0.014;
        const ry = size * 0.02;
        ctx.save();
        ctx.translate(px, py);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  });
}

function buildBody(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(PROFILE, SEGMENTS, BODY_HEIGHT, () => [BODY_RADIUS, BODY_RADIUS]);
  jitterVertices(geometry, rng, JITTER_AMP);
  const baked = facet(geometry);
  uvCylindrical(baked, 'y');
  return baked;
}

// 꽃받침 잎 1장 — 중앙 능선으로 접힌 마름모(밑동 극점 -> 중간 폭 3점 -> 끝 극점, 4tri) +
// 뒤집힌 뒷면 사본(법선 반대, 같은 위치, +4tri) = 8tri. R4: 얇은 파트라 지터 생략.
const LEAF_LENGTH = 0.34;
const LEAF_HALF_WIDTH = 0.09;
const LEAF_RIDGE_HEIGHT = 0.035;

function buildLeaf(): THREE.BufferGeometry {
  const base: THREE.Vector3Tuple = [0, 0, 0];
  const midLeft: THREE.Vector3Tuple = [-LEAF_HALF_WIDTH, 0, LEAF_LENGTH * 0.42];
  const midRidge: THREE.Vector3Tuple = [0, LEAF_RIDGE_HEIGHT, LEAF_LENGTH * 0.42];
  const midRight: THREE.Vector3Tuple = [LEAF_HALF_WIDTH, 0, LEAF_LENGTH * 0.42];
  const tip: THREE.Vector3Tuple = [0, 0, LEAF_LENGTH];

  // 앞면 4개 (와인딩: 위에서 보아 시계반대 == 법선 +Y쪽)
  const front: THREE.Vector3Tuple[] = [
    base, midLeft, midRidge,
    base, midRidge, midRight,
    midLeft, tip, midRidge,
    midRidge, tip, midRight,
  ];
  // 뒷면 — 같은 정점, 반대 와인딩(법선 -Y쪽) — material.side가 런타임 스왑에서 안 살아남으므로
  // (헤더 주석 참조) 지오메트리로 양면을 굽는다.
  const back: THREE.Vector3Tuple[] = [
    base, midRidge, midLeft,
    base, midRight, midRidge,
    midLeft, midRidge, tip,
    midRidge, midRight, tip,
  ];

  const positions = new Float32Array([...front, ...back].flat());
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

// 꼭지 — 짧은 원통(직선 lathe 프로필, 위아래 캡 포함).
const STEM_RADIUS = 0.045;
const STEM_HEIGHT = 0.12;
const STEM_SEGMENTS = 8;

function buildStem(): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    STEM_SEGMENTS,
    STEM_HEIGHT,
    () => [STEM_RADIUS, STEM_RADIUS],
  );
  return facet(geometry);
}

// 꽃받침 배치 — 5장을 72도 간격 방사 배열, 몸통 위쪽 극점(0, BODY_HEIGHT, 0)에서 바깥+아래로
// 처지게 로컬 X축 피치를 준다. 앞/뒷면을 함께 구웠으므로 카메라 방위와 무관하게 항상 보인다.
const LEAF_COUNT = 5;
// cmp-1 판정: 밑동을 몸통 극점(반지름 0)에 그대로 두고 50도로 늘어뜨렸더니, 처지는 만큼 축
// 쪽으로 당겨져(cos 성분) 그 높이의 몸통 반지름보다 안쪽에 들어가 몸통 속에 파묻혀 안 보였다.
// 밑동을 바깥으로 먼저 밀어내고(BASE_OFFSET) 처짐 각도를 줄여 어느 높이에서도 몸통 표면
// 바깥에 머물게 한다.
const LEAF_BASE_OFFSET = 0.3; // 회전 전, 로컬 +Z로 밑동을 미리 밀어내는 거리
const LEAF_PITCH = (30 * Math.PI) / 180; // 잎 끝을 어깨 쪽으로 늘어뜨리는 각도

function buildCalyx(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < LEAF_COUNT; i++) {
    const leaf = buildLeaf();
    leaf.translate(0, 0, LEAF_BASE_OFFSET);
    leaf.rotateX(LEAF_PITCH);
    leaf.rotateY((i * (2 * Math.PI)) / LEAF_COUNT);
    leaf.translate(0, BODY_HEIGHT, 0);
    parts.push(leaf);
  }
  const stem = buildStem();
  stem.translate(0, BODY_HEIGHT, 0);
  parts.push(stem);
  return parts;
}

export const createStrawberry: IngredientBuilder = (rng) => {
  const bodyMat = stdMaterial({ map: bakeBodyTexture(rng), color: 0xffffff });
  const calyxMat = stdMaterial({ color: CALYX_COLOR });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(buildBody(rng), bodyMat));
  for (const geo of buildCalyx()) {
    group.add(new THREE.Mesh(geo, calyxMat));
  }

  // 공유 지면 y=0 — 지터가 바닥 정점을 살짝 밀어낼 수 있어 최종 bbox로 스냅한다(types.ts R1).
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
  group.updateMatrixWorld(true);

  return mergeByMaterial(group);
};
