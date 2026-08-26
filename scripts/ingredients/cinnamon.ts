// 계피 — 말린 스틱(퀼) 2개 + 가루 더미. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/cinnamon.json(워크스페이스 원본은
// assets/ingredients/work/cinnamon/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
// ⚠ v3(2026-08-26) 가루 더미 개편은 **레포 코드만** 고쳤다 — 스펙 파일은 이 작업의 쓰기 범위 밖
// (배정이 scripts/ingredients/<id>.ts로 한정)이라 "스펙 먼저"를 못 지켰다. 지금은 이 파일이
// 실측 정본이다. 다음에 스펙을 만지는 사람이 여기서 역전사할 것.
//
// 스틱의 정체성(말린 껍질 나선)은 지오메트리가 아니라 절단면 텍스처로 싣는다 — 진짜 3D 롤 형태를
// 만들려면 파트가 훨씬 늘고 mesh<=2 예산과 충돌한다. 껍질 원통(순색) + 양끝 캡(텍스처: 나선 무늬 +
// 가루 예비 패치, pumpkin의 stem-atlas 패턴 재사용)으로 2버킷을 유지한다.
// 가루 더미는 advisor 지시대로 페이셋 지오메트리 둔덕이다 — 파티클 시스템 참조 금지(GLB는 정적
// 자산). 표면의 거친 알갱이 느낌은 굵은 지터로 낸다(가루는 얇은 파트가 아니라 R4 대상이 아니다).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { bakeTexture, buildRevolvedShell, facet, jitterVertices, mergeByMaterial, scaleHex, sliceTriangles, stdMaterial, uvDome } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/cinnamon.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const BARK_COLOR = 0x9a5b34; // "a warm russet bark on the outside"
const SCROLL_LIGHT_COLOR = 0xb87a4c; // "a lighter tan inside the rolled scroll ends"
const HOLLOW_COLOR = scaleHex(BARK_COLOR, 0.42); // 유도: 롤 중심 구멍의 그늘 — 손 hex 없음(§8 결정론 유도)
const SPIRAL_DARK_COLOR = scaleHex(BARK_COLOR, 0.68); // 유도: 나선 밴드용 — bark 자체보다 한 단 더
// 어둡게(§8) 잡아 SCROLL_LIGHT_COLOR와의 명암비를 키운다. debug-1/2 실측: bark vs light만으로는
// 끝면 조명 각도(그늘)에 묻혀 나선이 거의 안 보였다.
// ★v2 (2026-08-26, 64px 판독 애매 수정): 가루를 스틱에서 **색으로** 떼어냈다.
// 원래 `#8C4E2A`("a deeper red-brown powder heap")는 스틱 `#9A5B34`와 명도·색상이 거의 같아
// 64px 다운샘플에서 둘이 하나로 붙었다 — "덩어리 + 막대"가 아니라 "갈색 뭉치"로 읽혔다.
// 나선 텍스처는 그 배율에서 어차피 증발하니 정체성을 실루엣이 아니라 **2원 색 대비**로 옮긴다.
// 프롬프트 산문의 "deeper red-brown"에서 벗어나지만, 실제 계피 가루는 스틱보다 밝고 붉다 —
// 관찰이 산문을 이긴다(레포 선례: 2026-08-25 specStr 판정). tri는 1도 안 늘었다.
const POWDER_COLOR = 0xc9773d; // 밝은 황토빛 계피 가루 — 스틱(#9A5B34)과 명도차를 벌린다
// 더스팅 하이라이트(#A9683C, "a paler dusting on its lit upper slope")는 드롭 — 런타임 키라이트의
// N·L 감쇠가 둔덕 위쪽 면을 이미 밝게 비춘다(올리브 그늘진 아랫면 드롭과 대칭적인 이유).
// bark(#9A5B34) vs powder(#8C4E2A) 대비를 지켜야 가루 더미가 세 번째 스틱처럼 안 보인다(advisor).

const STICK_RADIUS = 0.14;
const STICK_HALF_LENGTH = 0.75;
const STICK_SEGMENTS = 10; // 각진 페이셋 — 매끈한 원통이 아니라 말린 나무껍질 느낌
const STICK_JITTER_AMP = 0.006;

// 스틱 배치 — cinnamon.png 3/4 실측: 두 퀼이 나란히, 살짝 다른 길이·각도로 눕는다.
interface StickDef {
  offset: readonly [number, number]; // world XZ
  yaw: number;
  lengthScale: number;
}
const STICKS: Record<'a' | 'b', StickDef> = {
  a: { offset: [-0.05, 0.0], yaw: 0.06, lengthScale: 1.0 },
  b: { offset: [0.2, 0.24], yaw: -0.1, lengthScale: 0.86 },
};

// 절단면 텍스처 — uvDome(X,Z 탑다운 극좌표, 등방)로 각도+반지름 위상에 나선을 굽는다.
const TEX_SIZE = 176; // <=256 (R3)
const SPIRAL_WRAPS = 1.3; // 총 감김 수 — debug-1~3 실측: 2.4는 캡이 화면에서 작아(스틱 반지름
// 0.14) 밴드가 밉맵/축소로 뭉개져 안 보였다. 감김을 줄여 밴드 폭을 넓혔다.
const HOLLOW_FRAC = 0.16; // 이 반지름비 안쪽 = 중심 구멍 그늘
const POWDER_PATCH_PX = 24; // 좌상단 예비 영역(가루색) — uvDome 원판 밖(모서리)이라 항상 비어 있다.

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function paintStickEndTexture(): THREE.CanvasTexture {
  const bark: [number, number, number] = [(SPIRAL_DARK_COLOR >> 16) & 0xff, (SPIRAL_DARK_COLOR >> 8) & 0xff, SPIRAL_DARK_COLOR & 0xff];
  const light: [number, number, number] = [(SCROLL_LIGHT_COLOR >> 16) & 0xff, (SCROLL_LIGHT_COLOR >> 8) & 0xff, SCROLL_LIGHT_COLOR & 0xff];
  const hollow: [number, number, number] = [(HOLLOW_COLOR >> 16) & 0xff, (HOLLOW_COLOR >> 8) & 0xff, HOLLOW_COLOR & 0xff];
  const powder: [number, number, number] = [(POWDER_COLOR >> 16) & 0xff, (POWDER_COLOR >> 8) & 0xff, POWDER_COLOR & 0xff];

  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const o = (py * size + px) * 4;
        if (px < POWDER_PATCH_PX && py < POWDER_PATCH_PX) {
          img.data[o] = powder[0];
          img.data[o + 1] = powder[1];
          img.data[o + 2] = powder[2];
          img.data[o + 3] = 255;
          continue;
        }
        const u = (px + 0.5) / size;
        const v = (py + 0.5) / size;
        const dx = u - 0.5;
        const dy = v - 0.5;
        const dist = Math.min(1, Math.hypot(dx, dy) * 2); // 0=중심 .. 1=림
        const angle = Math.atan2(dy, dx);
        let c: [number, number, number];
        if (dist < HOLLOW_FRAC) {
          c = hollow;
        } else {
          const phase = angle + dist * SPIRAL_WRAPS * Math.PI * 2;
          const stripe = Math.cos(phase);
          const t = smoothstep(-0.08, 0.08, stripe); // debug-1 실측: 밴드가 너무 흐려 거의 안 보였다 — 좁혀서 선명하게
          c = [lerpChannel(bark[0], light[0], t), lerpChannel(bark[1], light[1], t), lerpChannel(bark[2], light[2], t)];
        }
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

/**
 * 스틱 1개 = 열린 원통 벽(순색) + 양끝 캡 팬(중심 정점 1개씩, 텍스처). 캡은 셸과 정점을 공유해
 * (림 컬럼 재사용) 지터가 이음매를 찢지 않는다(R1과 동일 원리, fig/pumpkin 캡 패턴의 완전 원판판).
 */
function buildStick(rng: () => number): { wallGeo: THREE.BufferGeometry; capGeo: THREE.BufferGeometry } {
  const positions: number[] = [];
  const ringStart: number[] = [];
  for (const h of [-STICK_HALF_LENGTH, STICK_HALF_LENGTH]) {
    ringStart.push(positions.length / 3);
    for (let s = 0; s < STICK_SEGMENTS; s++) {
      const t = (s / STICK_SEGMENTS) * Math.PI * 2;
      positions.push(Math.cos(t) * STICK_RADIUS, h, Math.sin(t) * STICK_RADIUS);
    }
  }
  const centerBottom = positions.length / 3;
  positions.push(0, -STICK_HALF_LENGTH, 0);
  const centerTop = positions.length / 3;
  positions.push(0, STICK_HALF_LENGTH, 0);

  const wallIndex: number[] = [];
  const a0 = ringStart[0];
  const b0 = ringStart[1];
  for (let s = 0; s < STICK_SEGMENTS; s++) {
    const s1 = (s + 1) % STICK_SEGMENTS;
    wallIndex.push(a0 + s, b0 + s1, a0 + s1);
    wallIndex.push(a0 + s, b0 + s, b0 + s1);
  }
  // 와인딩: cross(P1-P0,P2-P0)로 유도(fig.ts 캡과 같은 방식) — 첫 렌더(debug-1~4)에서 두 캡 모두
  // 안쪽을 향해 백페이스 컬링되어 텍스처가 안 보였다(터널 안쪽 그늘이 대신 비쳤다). 순서를 뒤집었다:
  // 아래쪽(y=-H)은 (center,a0+s,a0+s1)일 때 normal_y = R²·sin(t_s-t_s1) < 0 (바깥, -Y) — 맞음.
  const capIndex: number[] = [];
  for (let s = 0; s < STICK_SEGMENTS; s++) {
    const s1 = (s + 1) % STICK_SEGMENTS;
    capIndex.push(centerBottom, a0 + s, a0 + s1); // 아래쪽 캡, -Y 바깥으로
    capIndex.push(centerTop, b0 + s1, b0 + s); // 위쪽 캡, +Y 바깥으로
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([...wallIndex, ...capIndex]);
  jitterVertices(geometry, rng, STICK_JITTER_AMP);
  const baked = facet(geometry);
  const wallGeo = sliceTriangles(baked, 0, wallIndex.length / 3);
  const capGeo = sliceTriangles(baked, wallIndex.length / 3, (wallIndex.length + capIndex.length) / 3);
  uvDome(capGeo); // 등방 극좌표 — 나선 텍스처와 같은 각도/반지름 공식을 그대로 쓸 수 있다.
  return { wallGeo, capGeo };
}

// 가루 더미 — 페이셋 지오메트리 둔덕(파티클 금지).
//
// ★v3 (2026-08-26, 전체화면 쇼케이스 판독 수리 — identity 배치).
// 되돌리지 마라. az=0에서 더미가 **공중에 뜬 각진 돌멩이**로 읽혔다. 원인 3가지를 전부 고쳤다:
//  (1) 밑면이 열려 있었다 — 프로필이 [0.78,-1.0] 링으로 시작해 바닥 팬이 없었고, 그래서 낮은
//      각도에서 셸 안쪽(백페이스 컬링된 빈 구멍)이 비쳐 "밑면이 말려 들어간" 실루엣이 됐다.
//      apricot.ts와 동일하게 **극점 [0.0,-1.0]을 앞에 붙여** buildRevolvedShell의 팬 경로로
//      바닥을 닫는다.
//  (2) 실루엣이 돌멩이였다 — 최대 반지름(1.0)이 h=-0.15, 즉 바닥보다 한참 위에 있어 언더컷이
//      생겼다(가루 더미는 안식각 때문에 밑이 제일 넓다). 반지름을 바닥에서부터 **단조 감소**로
//      바꾸고 높이/너비를 0.54 → 0.31로 낮춰 "쌓인 가루"로 만든다.
//  (3) 각졌다 — 세그먼트 14 + 지터 0.05는 8000tri 예산이 100KB/2500tri였던 시절 수치다.
//      28세그 + 지터 0.022로 실루엣을 매끈하게 하고 거칠기는 페이셋에 맡긴다.
// tri 130 → 392 (전체 206 → 468), 예산 8000tri/250KB 대비 무시할 수준.
const POWDER_SEGMENTS = 28;
const POWDER_RADIUS = 0.62;
const POWDER_HALF_HEIGHT = 0.17; // 총 높이 0.34 vs 폭 1.24 — 안식각 ~29도
// (a1 실측 후 0.20 -> 0.17: 매끈한 돔이 만두/빵처럼 부풀어 보였다. 낮출수록 "쌓인 가루"로 읽힌다.)
const POWDER_JITTER_AMP = 0.028; // 얇은 파트가 아니므로 R4 미적용 — 알갱이 느낌을 위해 조금 더
type ProfilePoint = readonly [number, number];
const POWDER_PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0], // ★바닥 극점 — 팬으로 밑면을 닫는다(v3에서 신설, 위 (1) 참조)
  [0.62, -1.0], // 바닥 디스크
  [1.0, -0.97], // 최대 반지름을 지면 바로 위에 둔다 — 언더컷 제거
  [0.94, -0.72],
  [0.82, -0.36],
  [0.66, 0.06],
  [0.46, 0.48],
  [0.24, 0.8],
  [0.0, 1.0],
];

function buildPowderMound(rng: () => number): THREE.BufferGeometry {
  const { geometry } = buildRevolvedShell(POWDER_PROFILE, POWDER_SEGMENTS, POWDER_HALF_HEIGHT, () => [POWDER_RADIUS, POWDER_RADIUS]);
  jitterVertices(geometry, rng, POWDER_JITTER_AMP);
  const baked = facet(geometry);
  uvDome(baked);
  // 가루색 예비 패치 샘플 — pumpkin.ts와 동일한 flipY 보정(캔버스 맨 위에 그린 패치는 메시 V=1 근처).
  const uv = baked.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, POWDER_PATCH_PX / 2 / TEX_SIZE, 1 - POWDER_PATCH_PX / 2 / TEX_SIZE);
  }
  uv.needsUpdate = true;
  return baked;
}

/** child(메시 또는 이미 파트를 담은 그룹)를 offset/yaw로 배치하고, 그 자신의 회전 후 bbox를
 * 구해 바닥(y=0)에 맞춘다 — 공유 지면 규칙(R1), olive.ts와 같은 패턴. */
function placeAndGround(child: THREE.Object3D, offset: readonly [number, number], yaw: number): THREE.Group {
  const sub = new THREE.Group();
  sub.add(child);
  sub.rotation.set(0, yaw, 0);
  sub.position.set(offset[0], 0, offset[1]);
  sub.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sub);
  sub.position.y -= box.min.y;
  return sub;
}

export const createCinnamon: IngredientBuilder = (rng) => {
  const barkMat = stdMaterial({ color: BARK_COLOR });
  const texMat = stdMaterial({ map: paintStickEndTexture(), color: 0xffffff });

  const cluster = new THREE.Group();

  (Object.keys(STICKS) as (keyof typeof STICKS)[]).forEach((key) => {
    const def = STICKS[key];
    const { wallGeo, capGeo } = buildStick(rng);
    // 길이 스케일은 지오메트리 재생성 없이 X축(로컬 길이축) 스케일로 — 로컬 X가 눕히기 전 원통의
    // 회전축이므로 rotateZ(-90deg) 전에 적용해야 길이 방향에 정확히 먹는다.
    wallGeo.scale(1, def.lengthScale, 1);
    capGeo.scale(1, def.lengthScale, 1);
    wallGeo.rotateZ(-Math.PI / 2); // Y축 원통을 로컬 X로 눕힌다(rosemary.ts와 동일 관례)
    capGeo.rotateZ(-Math.PI / 2);

    const stick = new THREE.Group();
    stick.add(new THREE.Mesh(wallGeo, barkMat));
    stick.add(new THREE.Mesh(capGeo, texMat));
    cluster.add(placeAndGround(stick, def.offset, def.yaw));
  });

  const powderMesh = new THREE.Mesh(buildPowderMound(rng), texMat);
  // ★v3 배치 (2026-08-26) — 되돌리지 마라. [1.15,-0.85]는 "완전 분리"를 노렸는데, 3/4 부감에서
  // -Z는 **화면 위쪽**이라 더미가 스틱 위에 배경 간격을 두고 떠 있는 것처럼 보였다(접지 자체는
  // 정상이었다 — 뜬 게 아니라 뒤에 있었을 뿐인데 눈은 그걸 구분 못 한다).
  // 해법은 다시 분리가 아니라 **접촉**이다: 스틱 오른쪽 끝(x≈0.70~0.85)에 더미 자락이 닿게 당겨
  // 두 파트가 한 바닥을 공유한다는 단서를 준다. 겹침은 스틱 끝 하단 ~20%뿐이라(더미 표면 y≈0.06
  // vs 스틱 반지름 0.14) "가루가 스틱에 쌓였다"로 읽히고, 정체성인 **왼쪽 나선 캡 두 개는 전혀
  // 가리지 않는다**(캡은 x≈-0.80/-0.45 쪽).
  cluster.add(placeAndGround(powderMesh, [1.0, -0.42], 0.3));

  return mergeByMaterial(cluster);
};
