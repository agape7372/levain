// 코코넛 — 말린 채(shred) 무더기. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/coconut.json(워크스페이스 원본은
// assets/ingredients/work/coconut/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★CRIB 1순위 위험군(가는 가닥 + 세트 유일 크림색): 몸통색 #EFE6D2가 도감 카드 배경(#F2E6D3)과
// 거의 같다(advisor 실측: ΔRGB 3/0/1) — 64px에서 배경에 녹아 사라질 위험이 가장 큰 재료.
// 대응: (1) 토스트 버킷(#8F6B3C, 더 어두운 쪽을 골라 대비 폭 확보) 비중을 후하게 잡는다 — 가닥의
// 15%는 통째로 토스트(뭉친 갈색 조각), 35%는 끝만 토스트. (2) rosemary의 "적고 굵게" 교훈을
// 그대로 계승 — 바늘 대신 3세그먼트 체인 카드로 완만한 웨이브를 준다. (3) 지터 생략(R4) — 얇은
// 카드는 빵 스케일 지터를 먹으면 뭉개진다.
//
// v2(cmp-1 판정 후): 넓은 나선 스캐터(반지름 0.82) + 누적 상향 컬(pitch가 매 세그먼트 커짐)이
// 낱낱이 흩어진 "색종이 조각"으로 렌더됐다 — 레퍼런스는 촘촘히 겹쳐 쌓인 무더기다. 원인 둘 다
// 고쳤다: ① 스캐터를 3개 층(LAYERS, 반지름·높이 감소)으로 바꿔 진짜 3D 더미 실루엣을 만들고
// ② pitch를 누적 상승 대신 세그먼트마다 소폭 +-웨이브로 바꿨다. 그라운딩도 개별 가닥 bbox가
// 아니라 **더미 전체 bbox 1회**로 바꿨다 — 개별 그라운딩은 각 층의 상대 높이를 지워 더미를
// 납작하게 눌러버린다(R1 "공유 지면"은 더미 전체의 최저점 얘기지, 층마다 바닥에 닿으라는 뜻이
// 아니다).
//
// v3(cmp-2 판정 후): 여전히 낱개 다이아몬드로 흩어져 보였다 — 세그먼트마다 폭을 "그 세그먼트의
// 중점 t"로 독립 계산해서 이음매에서 폭이 어긋나고(네킹), 매 세그먼트 pitch/yaw를 큰 폭(±0.5/±0.6
// rad)으로 무작위로 꺾어서 3조각이 서로 다른 방향을 보는 것처럼 렌더됐다. 세그먼트를 3->2로 줄이고
// (rosemary "적고 굵게"를 한 번 더 밀어붙임), 굴곡을 "완만한 활 모양 1회"로 바꿨다(무작위 지그재그
// 아님) — 1세그먼트는 거의 수평, 2세그먼트가 살짝만 위/옆으로 굽는다. 폭도 크게 키워(0.19->0.1)
// 개별 조각의 존재감을 확보했다. 층 개수도 21->24로 늘려 밀도를 더 채웠다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { facet, mergeByMaterial, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/coconut.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
// 가장자리 밝은 토스트(#B08A52)는 드롭 — mesh<=2 예산 안에서 "아이보리 vs 진한 토스트" 2버킷이
// 배경-대비를 최대화하는 조합이라, 중간 톤을 넣으면 오히려 대비가 흐려진다(advisor 권고 반영).
const IVORY_COLOR = 0xefe6d2; // "a near-white ivory shred body"
const TOASTED_COLOR = 0x8f6b3c; // "a few deeper toasted-brown flecks scattered through the pile"

const SEGMENTS_PER_SHRED = 2; // v3: 3->2 — 이음매가 줄수록 폭 불연속(네킹)도 준다
// v4 계속: 반지름을 줄인 뒤에도(레이어 주석 참조) 가닥 길이(0.4~0.58)가 레이어 반지름보다 훨씬
// 커서, 무작위 방향으로 뻗은 긴 가닥들이 더미 밖으로 삐져나와 "성게 가시" 실루엣이 됐다. 길이를
// 레이어 반지름과 같은 자릿수로 줄여 대부분의 가닥이 더미 발자국 안에 머물게 한다.
const SHRED_LENGTH_MIN = 0.2;
const SHRED_LENGTH_MAX = 0.32;
const SHRED_WIDTH_BASE = 0.19; // 밑동 폭 — v3: 0.105->0.19, "few and chunky" 더 세게(rosemary 선례)
const SHRED_WIDTH_TIP = 0.1;
const BEND_PITCH_MIN = 0.12; // 1->2세그먼트 사이 완만한 활 모양(무작위 지그재그 아님)
const BEND_PITCH_MAX = 0.42;
const BEND_YAW_JITTER = 0.22;

// 더미 층 — 아래로 갈수록 넓고 낮게, 위로 갈수록 좁고 높게(카이언 더미와 동일 원리). 합계 28가닥.
// v4(production thumb 판정 후): cmp-3까지도 낱낱이 흩어진 조각으로 보였다 — 원인은 가닥 길이
// (0.4~0.58) 대비 더미 반지름(0.52)이 너무 커서 겹침이 부족했다. 런타임이 최장축을 1.6으로
// 리핏하므로 절대값은 무의미하지만(types.ts §6) **비율**은 실루엣을 결정한다 — 반지름을
// 대폭 줄여(0.52->0.3) 같은 길이의 가닥이 더미 전체를 촘촘히 가로지르게 했다(가닥이 상대적으로
// 커진 효과). 개수도 24->28로 늘려 밀도를 더했다.
const LAYERS: readonly { y: number; radius: number; count: number }[] = [
  { y: 0.0, radius: 0.3, count: 11 },
  { y: 0.14, radius: 0.21, count: 9 },
  { y: 0.26, radius: 0.12, count: 8 },
];

/** 카드 세그먼트 1개 = 4정점 사면체(뿌리·끝·좌우 날개). rosemary.ts의 buildNeedle과 같은 기법을
 * coconut.ts 로컬로 독립 구현(다른 재료 파일 수정 금지 — CRIB 관례: fig/pumpkin도 각자 로컬 헬퍼). */
function buildCard(root: THREE.Vector3, tip: THREE.Vector3, width: number): THREE.BufferGeometry {
  const dir = tip.clone().sub(root).normalize();
  const wing = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
  if (wing.lengthSq() < 1e-6) wing.set(1, 0, 0);
  wing.normalize().multiplyScalar(width / 2);
  const mid = root.clone().lerp(tip, 0.45);
  const wingA = mid.clone().add(wing);
  const wingB = mid.clone().sub(wing);

  const positions = [
    root.x, root.y, root.z,
    tip.x, tip.y, tip.z,
    wingA.x, wingA.y, wingA.z,
    wingB.x, wingB.y, wingB.z,
  ];
  const index = [
    0, 2, 1,
    0, 1, 3,
    0, 3, 2,
    1, 2, 3,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  const baked = facet(geometry);
  uvTopPlanar(baked);
  return baked;
}

interface ShredCategory {
  fullToast: boolean; // 통째로 토스트(뭉친 갈색 조각 — "deeper toasted-brown flecks")
  tipToast: boolean; // 끝 세그먼트만 토스트
}

function pickCategory(rng: () => number): ShredCategory {
  const r = rng();
  if (r < 0.15) return { fullToast: true, tipToast: false };
  if (r < 0.5) return { fullToast: false, tipToast: true };
  return { fullToast: false, tipToast: false };
}

/**
 * 채 1개 = 2세그먼트 체인 카드. 1세그먼트는 거의 수평, 2세그먼트가 완만한 활 모양으로 한 번만
 * 굽는다(BEND_PITCH) — 무작위 지그재그 아님. 폭은 밑동->끝으로 테이퍼하되 세그먼트 경계값(t0/t1)을
 * 그대로 써서 이음매에서 폭이 어긋나지(네킹) 않는다. 지터 없음(R4).
 */
function buildShred(root: THREE.Vector3, baseYaw: number, rng: () => number): { geo: THREE.BufferGeometry; toasted: boolean }[] {
  const length = SHRED_LENGTH_MIN + rng() * (SHRED_LENGTH_MAX - SHRED_LENGTH_MIN);
  const segLen = length / SEGMENTS_PER_SHRED;

  const category = pickCategory(rng);
  const parts: { geo: THREE.BufferGeometry; toasted: boolean }[] = [];

  let cursor = root.clone();
  let pitch = (rng() - 0.5) * 0.16; // 1세그먼트는 거의 수평
  let yaw = baseYaw;
  for (let s = 0; s < SEGMENTS_PER_SHRED; s++) {
    if (s === 1) {
      pitch += BEND_PITCH_MIN + rng() * (BEND_PITCH_MAX - BEND_PITCH_MIN); // 완만한 활, 1회만
      yaw += (rng() - 0.5) * BEND_YAW_JITTER;
    }
    const dir = new THREE.Vector3(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
    const tip = cursor.clone().addScaledVector(dir, segLen);
    // 세그먼트 경계값(t0/t1)을 그대로 써서 이음매 폭이 정확히 이어진다(v3: 중점 t 방식은 네킹).
    const widthAtRoot = SHRED_WIDTH_BASE + (SHRED_WIDTH_TIP - SHRED_WIDTH_BASE) * (s / SEGMENTS_PER_SHRED);
    const widthAtTip = SHRED_WIDTH_BASE + (SHRED_WIDTH_TIP - SHRED_WIDTH_BASE) * ((s + 1) / SEGMENTS_PER_SHRED);
    const width = (widthAtRoot + widthAtTip) / 2;
    const toasted = category.fullToast || (category.tipToast && s === SEGMENTS_PER_SHRED - 1);
    parts.push({ geo: buildCard(cursor, tip, width), toasted });
    cursor = tip;
  }
  return parts;
}

export const createCoconut: IngredientBuilder = (rng) => {
  const ivoryMat = stdMaterial({ color: IVORY_COLOR });
  const toastedMat = stdMaterial({ color: TOASTED_COLOR });

  const group = new THREE.Group();

  for (const layer of LAYERS) {
    for (let i = 0; i < layer.count; i++) {
      const angle = (i / layer.count) * Math.PI * 2 + (rng() - 0.5) * 0.9;
      const r = layer.radius * (0.35 + 0.65 * rng()); // 층 안에서도 중심 쪽에 더 몰리게(가장자리 성김 방지)
      const root = new THREE.Vector3(Math.cos(angle) * r, layer.y, Math.sin(angle) * r);
      const baseYaw = rng() * Math.PI * 2;

      for (const part of buildShred(root, baseYaw, rng)) {
        group.add(new THREE.Mesh(part.geo, part.toasted ? toastedMat : ivoryMat));
      }
    }
  }

  // 공유 지면 y=0 — 더미 전체 bbox 1회로만 맞춘다(개별 가닥 그라운딩은 층 구조를 눌러버린다).
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;

  return mergeByMaterial(group);
};
