// 고구마 — 세로로 반 자른 단일 덩이뿌리. 계약은 types.ts 주석이 정본. 재료 2차
// 배치(신규 4종) 3번째.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/sweetpotato.json(워크스페이스 원본은
// assets/ingredients/work/sweetpotato/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★2026-08-28 턴테이블 수리. 옛 토폴로지는 한쪽 끝만 자른 통짜 회전체(buildRevolvedShell +
// 같은 높이 극·림 원판 캡)였다. 히어로(az 0)에서는 원형 단면이 보였지만 az 180/225/270에서는
// 단면이 몸통에 가려 어두운 껍질만 남아 "갈색 돌/덩이"로 정체가 붕괴했다 — 끝단면은 반대편에서
// 구조적으로 안 보인다. fig/beet와 같은 half-revolution+룰드 캡으로 바꿔 절단면을 긴 타원
// (덩이 종단면)으로 키우고, rotateX로 법선에 +Y를 실어 3/4 카메라가 궤도 뒷면에서도 속살을
// 내려다보게 한다. lib.buildRevolvedShell은 항상 2π 랩이라 반쪽을 못 지어, 로컬 buildHalfShell을
// 이 파일에 둔다(lib.ts 수정 금지, fig.ts 선례).
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { angleDeltaDeg, bakeTexture, facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/sweetpotato.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const SKIN_COLOR = 0x4a2f5c; // "a deep plum-purple skin"
const FLESH_COLOR = 0x7a5296; // "a vivid violet-purple cut flesh"
const FLECK_COLOR = 0x9b79b0; // "faint pale lilac starch flecks radiating from the center"
// 능선의 밝은 광택(#5F3E73 "a lighter violet sheen along its ridges")은 별도 버킷을 안 만든다 —
// 몸통이 볼록한 회전체라 런타임 키라이트 N·L 감쇠가 능선 하이라이트를 이미 공짜로 낸다
// (올리브 shaded-underside-hue-dropped와 동일 논리, 스펙 risk skin-sheen-hue-dropped 참조).

// 실측 비율(assets/ingredients/src/sweetpotato.png 3/4). 길이:너비 ~= 2:1의 늘씬한 덩이뿌리.
// 반쪽 종단면이 정체 실루엣이므로 RADIUS=종단면 반폭, HALF_LENGTH=종단면 반길이.
const RADIUS = 0.46;
const HALF_LENGTH = 0.88;
const SEGMENTS = 24; // half-revolution 컬럼. 24면 7.5° — 전체화면에서 림이 각지지 않을 밀도.
// 옛 통짜 셸 SEGMENTS 32는 원주 전체 예산이었고, 반쪽은 같은 각밀도를 더 적은 컬럼으로 낸다.

type ProfilePoint = readonly [number, number];
// (반지름비, 높이비) — heightFrac -1(뭉툭한 끝) .. +1(가느다란 둥근 끝). 양쪽 다 극점(r=0).
// 가장 넓은 지점은 정중앙보다 아래(hFrac ≈ -0.18) — 고구마는 한쪽이 더 두껍다.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.32, -0.94],
  [0.62, -0.82],
  [0.85, -0.64],
  [0.97, -0.42],
  [1.0, -0.18],
  [0.96, 0.08],
  [0.86, 0.30],
  [0.72, 0.50],
  [0.56, 0.68],
  [0.38, 0.82],
  [0.22, 0.92],
  [0.10, 0.975],
  [0.0, 1.0],
];

const JITTER_AMP = 0.005; // SEGMENTS 24, 극 근처 rFrac 0.10 → 컬럼 간격 ≈ π·0.046/24 ≈ 0.006.
// 지터가 이 간격을 넘으면 극 팬이 뒤집힌다(types.ts R2). 세그먼트를 올리면 이 값도 내린다.

// 저주파 혹 — "softly knobby" 실루엣을 정점 난수가 아니라 각도·높이의 매끈한 합성 사인으로 낸다.
const KNOB_AMP = 0.03;

// 배치 회전 — 세워서 지은(장축=Y, 단면=XY·법선 +Z, 몸통 −Z) 반쪽을 눕혀 단면이 위를 보게 한다.
// rotateX(θ) 후 단면 법선은 (0, −sin θ, cos θ). θ≈−80°면 ny/nz≈5.7이라 3/4 카메라(y=2.2 고정,
// 궤도 뒷면에서 z_cam≈−3)에서도 n·cam > 0 — FrontSide 컬링으로 단면이 사라지지 않는다.
// 옛 끝단면+rotateX(−110°)는 히어로에서만 단면이 카메라로 향했고 뒷면은 몸통이 가렸다.
const ROTATE_X = -1.40; // ≈ −80deg
const ROTATE_Y = 0.40; // ≈ 23deg — 장축을 화면 대각선으로(레퍼런스 3/4 구도)

const TEX_SIZE = 256; // <=256 (R3)
const FLECK_COUNT = 18; // 스펙은 "**faint** starch flecks scattered" — 폭죽/해바라기가 되지 않게
const RIM_BAND_FRAC = 0.88; // 종단면 윤곽 바로 안쪽의 껍질색 띠(fig 크림 림과 같은 역할)
const CORE_H_FRAC = -0.18; // 방사 반점이 수렴하는 중심 — PROFILE 최대 반지름 지점과 동일

function profileRadiusAt(hFrac: number): number {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [r0, h0] = PROFILE[i];
    const [r1, h1] = PROFILE[i + 1];
    if (hFrac >= h0 && hFrac <= h1) {
      const t = h1 === h0 ? 0 : (hFrac - h0) / (h1 - h0);
      return r0 + (r1 - r0) * t;
    }
  }
  return 0;
}

/**
 * 로컬 half-revolution 셸 — fig.ts/beet.ts의 buildHalfShell을 복제(lib.ts에 없음).
 * phi 0..π를 논-랩(컬럼 0..segments)으로 짓고, 스킨(회전면)과 캡(phi=0/phi=segments 림을
 * 잇는 룰드 서피스)을 한 인덱스 버퍼에 순서대로 push한다. 삼각형 개수를 생성 시점에 알아
 * facet 이후 sliceTriangles로 가른다. 캡은 새 정점 0개라 지터가 이음매를 못 찢는다(R1).
 */
function buildHalfShell(
  profile: readonly ProfilePoint[],
  segments: number,
  radius: number,
  heightScale: number,
): { geometry: THREE.BufferGeometry; skinTriCount: number; capTriCount: number; ringStart: number[] } {
  const positions: number[] = [];
  const ringStart: number[] = [];
  for (const [rFrac, hFrac] of profile) {
    ringStart.push(positions.length / 3);
    if (rFrac <= 1e-6) {
      positions.push(0, hFrac * heightScale, 0);
      continue;
    }
    for (let s = 0; s <= segments; s++) {
      const t = (s / segments) * Math.PI; // phi in [0, pi]
      // s=0 => x=+radius(오른쪽 림), s=segments => x=-radius(왼쪽 림), 둘 다 z=0(단면 평면).
      // 가운데(phi=π/2)는 z<0으로 부풀어 카메라(+Z)에서 멀어진다 — 단면이 카메라를 향한다.
      positions.push(Math.cos(t) * rFrac * radius, hFrac * heightScale, -Math.sin(t) * rFrac * radius);
    }
  }

  const skinIndex: number[] = [];
  for (let ri = 0; ri < profile.length - 1; ri++) {
    const a0 = ringStart[ri];
    const b0 = ringStart[ri + 1];
    const aPole = profile[ri][0] <= 1e-6;
    const bPole = profile[ri + 1][0] <= 1e-6;
    for (let s = 0; s < segments; s++) {
      const s1 = s + 1;
      if (aPole) {
        // ★와인딩 반전(fig/beet 2026-08-26과 동일). 이 셸은 lib.buildRevolvedShell과 거울상
        // (lib은 z=+sin, 여기는 z=−sin). 감기를 lib 그대로 복사하면 법선이 전부 안을 향한다.
        // FrontSide 컬링이라 가까운 벽이 사라지고 먼 벽 안쪽이 보인다. 캡은 이 좌표계에서
        // 손으로 유도한 것이라 그대로 두고 스킨만 뒤집는다.
        skinIndex.push(a0, b0 + s1, b0 + s);
      } else if (bPole) {
        skinIndex.push(a0 + s, a0 + s1, b0);
      } else {
        skinIndex.push(a0 + s, a0 + s1, b0 + s1);
        skinIndex.push(a0 + s, b0 + s1, b0 + s);
      }
    }
  }

  // 룰드 단면 캡 — 같은 셸의 phi=0(오른쪽)·phi=segments(왼쪽) 컬럼을 링 순서대로 잇는다.
  // 와인딩은 손으로 유도(법선 +Z, 카메라 향함): (aRight,bRight,bLeft)의
  // cross(bRight-aRight, bLeft-aRight).z = 2*dh*r2 >= 0.
  const capIndex: number[] = [];
  for (let ri = 0; ri < profile.length - 1; ri++) {
    const a0 = ringStart[ri];
    const b0 = ringStart[ri + 1];
    const aPole = profile[ri][0] <= 1e-6;
    const bPole = profile[ri + 1][0] <= 1e-6;
    const aRight = a0;
    const aLeft = aPole ? a0 : a0 + segments;
    const bRight = b0;
    const bLeft = bPole ? b0 : b0 + segments;
    if (aPole) {
      capIndex.push(aRight, bRight, bLeft);
    } else if (bPole) {
      capIndex.push(aRight, bLeft, aLeft);
    } else {
      capIndex.push(aRight, bRight, bLeft);
      capIndex.push(aRight, bLeft, aLeft);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([...skinIndex, ...capIndex]);
  return { geometry, skinTriCount: skinIndex.length / 3, capTriCount: capIndex.length / 3, ringStart };
}

/** uvTopPlanar(X,Z)는 캡(z≈0 평면)에서 V축이 0폭으로 퇴화한다 — 로컬 정면투영(X,Y) 대체(fig.ts 동일). */
function uvFrontPlanar(g: THREE.BufferGeometry): void {
  g.computeBoundingBox();
  const b = g.boundingBox as THREE.Box3;
  const sx = Math.max(b.max.x - b.min.x, 1e-6);
  const sy = Math.max(b.max.y - b.min.y, 1e-6);
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - b.min.x) / sx;
    uv[i * 2 + 1] = (pos.getY(i) - b.min.y) / sy;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function paintFleshTexture(rng: () => number): THREE.CanvasTexture {
  const rim: [number, number, number] = [(SKIN_COLOR >> 16) & 0xff, (SKIN_COLOR >> 8) & 0xff, SKIN_COLOR & 0xff];
  const base: [number, number, number] = [(FLESH_COLOR >> 16) & 0xff, (FLESH_COLOR >> 8) & 0xff, FLESH_COLOR & 0xff];
  const fleck: [number, number, number] = [(FLECK_COLOR >> 16) & 0xff, (FLECK_COLOR >> 8) & 0xff, FLECK_COLOR & 0xff];

  // 방사 반점 — 각도/길이를 주입 rng로 결정론 생성(Math.random 금지).
  // ★각도는 **도(deg)** 로 잡고 차이는 lib.angleDeltaDeg에 맡긴다. 옛 라디안 손랩은
  //     let d = Math.abs(angle - angles[i]); if (d > Math.PI) d = Math.PI*2 - d;
  // 가 `% 2π` 없이 atan2(−π,π] vs 배열[0,2π)를 만나 d가 음수가 되어 단면 절반을 반점색으로
  // 메웠다(fig.ts 동일 버그). angleDeltaDeg는 내부에서 `% 360` 후 접는다 — 되돌리지 말 것.
  const anglesDeg: number[] = [];
  const inner: number[] = [];
  const lens: number[] = [];
  const widthsDeg: number[] = [];
  const mixes: number[] = [];
  for (let i = 0; i < FLECK_COUNT; i++) {
    anglesDeg.push((i / FLECK_COUNT) * 360 + (rng() - 0.5) * 14);
    const i0 = 0.08 + rng() * 0.28;
    inner.push(i0);
    lens.push(i0 + 0.22 + rng() * 0.42);
    widthsDeg.push(3.2 + rng() * 2.4);
    mixes.push(0.4 + rng() * 0.55);
  }

  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size;
        // ★flipY 정합(fig.ts 2026-08-26과 동일) — CanvasTexture 기본 flipY=true라
        // 캔버스 맨 윗줄(py=0)이 메시 V=1(프로필 +1 끝)에 붙는다. v=py/size로 칠하면
        // 굵은 끝·가는 끝이 세로로 뒤집혀 림 띠 폭이 윤곽과 안 맞는다.
        const v = 1 - (py + 0.5) / size;
        const localX = (u - 0.5) * 2 * RADIUS;
        const hFrac = v * 2 - 1;
        const rBoundary = profileRadiusAt(hFrac) * RADIUS;
        let c = rim;
        if (rBoundary > 1e-4) {
          const cr = Math.abs(localX) / rBoundary;
          if (cr <= RIM_BAND_FRAC) {
            const nx = localX / RADIUS;
            const ny = hFrac - CORE_H_FRAC;
            const dist = Math.hypot(nx, ny);
            const angleDeg = (Math.atan2(ny, nx) * 180) / Math.PI;
            c = base;
            for (let i = 0; i < FLECK_COUNT; i++) {
              const d = angleDeltaDeg(angleDeg, anglesDeg[i]);
              if (d < widthsDeg[i] && dist > inner[i] && dist < lens[i]) {
                const m = mixes[i];
                c = [
                  Math.round(base[0] + (fleck[0] - base[0]) * m),
                  Math.round(base[1] + (fleck[1] - base[1]) * m),
                  Math.round(base[2] + (fleck[2] - base[2]) * m),
                ];
                break;
              }
            }
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

/**
 * 자른 원판 조각 — 윗면(살, 법선 정확히 +Y) + 테두리·아랫면(껍질).
 * 프로필 4점 = 아랫극·아랫림·윗림·윗극. 극과 림의 높이를 같게 둬 buildRevolvedShell의 극 팬
 * 분기가 그대로 평평한 원판 뚜껑이 된다(몸통 절단면과 같은 트릭 — CRIB "같은 높이의 극+림 두 점").
 * 생성 순서가 아랫면 팬 SEG · 옆 테두리 2·SEG · 윗면 팬 SEG라 윗면만 sliceTriangles로 가른다.
 */
function buildSlice(rng: () => number): { fleshGeo: THREE.BufferGeometry; skinGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(
    [
      [0, -1],
      [1, -1],
      [1, 1],
      [0, 1],
    ],
    SLICE_SEGMENTS,
    SLICE_HALF_THICKNESS,
    () => [SLICE_RADIUS, SLICE_RADIUS],
  );

  // 테두리 두 링(1·2)에만 저주파 혹 — 두 링에 같은 각도 함수를 먹여 윤곽이 정원을 벗어나되
  // 옆벽은 수직으로 남는다(링마다 다르게 주면 테두리가 비틀린다). 극점은 반지름 0이라 제외.
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const phase = rng() * Math.PI * 2;
  for (const ri of [1, 2]) {
    for (let i = ringStart[ri]; i < ringStart[ri + 1]; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const theta = Math.atan2(z, x);
      const wave = Math.sin(3 * theta + phase) + 0.5 * Math.sin(5 * theta - phase);
      const m = 1 + (SLICE_KNOB_AMP * wave) / 1.5; // /1.5 = 최대 진폭 정규화
      pos.setXYZ(i, x * m, pos.getY(i), z * m);
    }
  }
  pos.needsUpdate = true;

  jitterVertices(geometry, rng, JITTER_AMP); // 두께 0.17에 진폭 0.008 — R4 여유 충분
  const baked = facet(geometry);
  const triCount = baked.attributes.position.count / 3;
  const skinGeo = sliceTriangles(baked, 0, triCount - SLICE_SEGMENTS);
  const fleshGeo = sliceTriangles(baked, triCount - SLICE_SEGMENTS, triCount);
  uvTopPlanar(fleshGeo); // 절단면이 로컬 XZ 평면 — 몸통 절단면과 같은 정투영이라 텍스처를 공유한다
  uvTopPlanar(skinGeo);
  for (const g of [skinGeo, fleshGeo]) g.translate(SLICE_OFFSET_X, 0, SLICE_OFFSET_Z);
  return { fleshGeo, skinGeo };
}

/** 조각들을 공유 지면 y=0에 앉힌다(R1 "뜨는 파트 금지") — 회전을 다 구운 뒤 bbox를 재서 내린다. */
function groundPiece(geos: readonly THREE.BufferGeometry[]): void {
  const box = new THREE.Box3();
  for (const g of geos) {
    g.computeBoundingBox();
    box.union(g.boundingBox as THREE.Box3);
  }
  for (const g of geos) g.translate(0, -box.min.y, 0);
}

export const createSweetpotato: IngredientBuilder = (rng) => {
  const { geometry, skinTriCount, capTriCount, ringStart } = buildHalfShell(PROFILE, SEGMENTS, RADIUS, HALF_LENGTH);

  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const knobPhase1 = rng() * Math.PI * 2;
  const knobPhase2 = rng() * Math.PI * 2;
  for (let ri = 0; ri < PROFILE.length; ri++) {
    const hFrac = PROFILE[ri][1];
    const start = ringStart[ri];
    const end = ri + 1 < ringStart.length ? ringStart[ri + 1] : pos.count;
    if (end - start < 2) continue; // 극점(정점 1개)은 건드리지 않는다
    for (let i = start; i < end; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const theta = Math.atan2(z, x);
      const wave = Math.sin(3 * theta + knobPhase1 + 2.1 * hFrac) + 0.55 * Math.sin(5 * theta + knobPhase2 - 3.3 * hFrac);
      const m = 1 + (KNOB_AMP * wave) / 1.55;
      pos.setXYZ(i, x * m, pos.getY(i), z * m);
    }
  }
  pos.needsUpdate = true;

  jitterVertices(geometry, rng, JITTER_AMP); // 셸 전체(스킨+캡 공유 정점)에 한 번만 — R1.
  const baked = facet(geometry);
  const skinGeo = sliceTriangles(baked, 0, skinTriCount);
  const capGeo = sliceTriangles(baked, skinTriCount, skinTriCount + capTriCount);
  uvTopPlanar(skinGeo); // 순색 버킷 — attribute 일관성만 필요
  uvFrontPlanar(capGeo); // 단면은 로컬 XY — XZ 정투영은 V가 퇴화한다.

  // 회전은 UV를 낸 뒤에 굽는다 — position/normal만 바뀌고 UV는 그대로라 텍스처가 안 틀어진다.
  capGeo.rotateX(ROTATE_X);
  capGeo.rotateY(ROTATE_Y);
  skinGeo.rotateX(ROTATE_X);
  skinGeo.rotateY(ROTATE_Y);
  groundPiece([skinGeo, capGeo]);

  const slice = buildSlice(rng);
  groundPiece([slice.skinGeo, slice.fleshGeo]);

  // 공유 지면 y=0 (R1). 런타임이 bbox 중심으로 다시 정규화하므로 샷 프레이밍에는 영향 0.
  const box = new THREE.Box3().setFromBufferAttribute(skinGeo.attributes.position as THREE.BufferAttribute);
  box.union(new THREE.Box3().setFromBufferAttribute(capGeo.attributes.position as THREE.BufferAttribute));
  const ground = -box.min.y;
  skinGeo.translate(0, ground, 0);
  capGeo.translate(0, ground, 0);

  const skinMat = stdMaterial({ color: SKIN_COLOR });
  // 텍스처 1장을 두 절단면이 공유한다 — 머티리얼 인스턴스가 같아야 mergeByMaterial이 mesh 2개로 접는다.
  const fleshMat = stdMaterial({ map: paintFleshTexture(rng), color: 0xffffff });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(skinGeo, skinMat));
  group.add(new THREE.Mesh(capGeo, fleshMat));
  group.add(new THREE.Mesh(slice.skinGeo, skinMat));
  group.add(new THREE.Mesh(slice.fleshGeo, fleshMat));

  return mergeByMaterial(group);
};
