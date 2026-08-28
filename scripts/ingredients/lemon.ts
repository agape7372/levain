// 레몬 — 슬라이스 2장, 같은 각도로 나란히 기대 서고 화면에서 겹친다. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/lemon.json(워크스페이스 원본은
// assets/ingredients/work/lemon/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★lemon↔banana가 이 배치의 혼동쌍(팀리드 지시) — 둘 다 얇은 원반(코인) 슬라이스라 형태 하나로는
// 안 갈린다. 두 가지 축으로 분리한다: (1) 배치 실루엣 — 레몬은 두 장이 기울여 "기대어" 서고
// (TILT), 바나나는 세 장이 "눕혀서" 겹친다(banana.ts 참조). (2) 속 무늬 —
// 레몬은 방사 웨지(막선 + 교대 명암) + 중심 심 + 바깥 흰 심 링, 바나나는 씨점 링. 색도 이미
// 갈렸다(레몬 황록 #C8D63E, 바나나 연노랑 #E8D46A) — 형태·무늬·색 셋 다 겹치지 않게 짰다.
//
// 원반 지오메트리는 buildRevolvedShell을 "두께가 얇은 축(Y)"으로 그대로 쓴다(팬케이크 디스크와
// 동일 원리 — 회전축=Y가 원반의 두께 방향, 반지름이 실제 보이는 원판). 세우기/기대기는 지오메트리
// 회전이 아니라 인스턴스 Group 쿼터니언(올리브·크랜베리가 배치에 쓰는 것과 같은 메커니즘)만으로
// 처리 — geometry.rotateZ 트릭이 필요 없다(그라운딩은 항상 bbox 기반이라 최종 방향에 무관하다).
//
// ═══ v2 (2026-08-26 쇼케이스 수리) — 되돌리지 말 것 ═══════════════════════════════════════
// ★스펙(assets/ingredients/work/lemon/object-sculpt-spec.json)의 SLICES 배치는 **깨져 있다.**
//   이 파일이 그 배치보다 앞선다 — 스펙에서 복원하지 마라. 근거 두 가지:
//
//   (1) 관통. 옛 배치는 a=(-0.05,0.08) b=(0.32,-0.18)으로 중심 거리가 0.45인데 원반 반지름은
//       0.62이고 두 평면의 각도차가 ~24도였다. 원반 둘이 **반드시 교차한다** — az=180에서 뒤
//       슬라이스의 밝은 껍질 링이 앞 슬라이스 과육 한복판을 단면 없이 뚫고 나와 "분리돼 떠 있는
//       껍질 링"으로 보였다. 겹침은 실루엣에서만 내고 지오메트리는 떨어뜨려야 한다.
//       → 두 슬라이스에 **완전히 동일한 평면 방향**(같은 YAW·TILT)을 주고, b를 평면 법선 방향으로
//         민다. 두께합이 2×0.1=0.2이므로 평면이 평행인 한 **어떤 각도에서도 교차가 불가능하다**.
//         화면 겹침은 면내 가로 오프셋(LATERAL)이 만든다. 각도를 다시 벌리면 관통이 돌아온다.
//
//   (2) 색. 옛 배치는 rotation.x=PI/2로 원반을 세워 과육면 법선이 거의 수평이 됐고,
//       키라이트와의 N·L이 0.31밖에 안 나왔다. 실측 과육 #957e17 — 레몬이 아니라 카키.
//       → TILT를 눕히고 팔레트를 함께 올렸다. 기울기만 되돌리거나 색만 되돌리면 한쪽이 다시 카키.
//
//   세그먼트는 16 → 40. 예산을 아껴 각지게 만들지 마라.
//
// ═══ v3 (2026-08-28 쇼케이스 수리) — 되돌리지 말 것 ═══════════════════════════════════════
//   (1) 뒷면 과육 올리브. 채도 높은 노랑은 앰비언트-only 면에서 카키가 된다. 과육·음영을 pith와
//       섞어 B를 살리고, JSON 껍질 #C8D63E는 G>R이라 R을 G에 맞춰 어두운 면이 올리브가 안 되게 한다.
//   (2) 핀홀. 지터가 극을 움푹 파고 림 이음매를 뒤집는다. 얇은 원반은 R4대로 지터 생략. 극+캡 링을
//       같은 높이의 평면 캡으로 닫고(closeCaps), facet 후 법선을 바깥으로 강제(ensureOutward),
//       과육 XZ를 1.06배로 껍질 챔퍼 밑에 겹친다. 별도 심 플러그는 안 쓴다 — 얇은 옆벽이 270°에서
//       새 구멍을 낸다.
//   (3) TILT 1.05→0.40 (23°). 카메라 고도 ~36°에서 n·view가 전 방위 양수(0.24~0.85). 0.82는
//       az=135/180에서 n·view≤0이라 아랫면·에지온 막대가 된다. 바나나는 거의 수평 3장 — 레몬은
//       2장+23°+심 링. 0.82로 되돌리지 말 것.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { bakeTexture, buildRevolvedShell, facet, mergeByMaterial, scaleHex, sliceTriangles, stdMaterial, uvDome, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/lemon.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const RIND_SRC = 0xc8d63e; // "a vivid yellow-green rind ring"
const PULP_SRC = 0xdccb33; // "a bright yellow pulp body"
const SHADE_SRC = 0xa89426; // "a deeper golden-yellow shading the lower shaded segments"
const PITH_COLOR = 0xf5f0d6; // "thin ivory-white pith membranes" + 중심 심

/** JSON hex 두 개를 t로 섞는다 — 채널 클립 없이 B를 살리는 노출 보정 (types.ts §7). */
function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

// v3: 1.15 배율은 R채널 천장. scaleHex로 밝힌 뒤 pith와 섞어 크림 레몬.
// JSON #C8D63E는 G>R. 어두운 Lambert 면에선 올리브라, R을 G에 맞춘 노랑을 밝힌다.
const rindR = (RIND_SRC >> 16) & 0xff;
const rindG = (RIND_SRC >> 8) & 0xff;
const rindB = RIND_SRC & 0xff;
const RIND_EVEN = (Math.max(rindR, rindG) << 16) | (rindG << 8) | rindB;
const RIND_COLOR = mixHex(scaleHex(RIND_EVEN, 1.22), PITH_COLOR, 0.22);
const PULP_COLOR = mixHex(scaleHex(PULP_SRC, 1.22), PITH_COLOR, 0.38);
const PULP_SHADE = mixHex(scaleHex(SHADE_SRC, 1.5), PITH_COLOR, 0.45);

// 실측 비율 (assets/ingredients/src/lemon.png 3/4 · lemon-2.png 정면 · lemon-3.png 탑다운).
const LEMON_RADIUS = 0.62;
const LEMON_HALF_THICKNESS = 0.1; // 두께:지름 ~= 0.16:1
const LEMON_SEGMENTS = 40;

type ProfilePoint = readonly [number, number];
// 극과 캡 링을 **같은 높이**로 둬 평면 디스크 캡이 되게 한다.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [0.22, -1.0],
  [0.55, -0.988],
  [0.9, -0.95],
  [1.0, -0.5],
  [1.0, 0.5],
  [0.9, 0.95],
  [0.55, 0.988],
  [0.22, 1.0],
  [0.0, 1.0],
];

/** 밴드별 삼각형 수 — buildRevolvedShell 내부 인덱싱 규칙을 그대로 재현. */
function bandTriCounts(profile: readonly ProfilePoint[], segments: number): number[] {
  const counts: number[] = [];
  for (let ri = 0; ri < profile.length - 1; ri++) {
    const aPole = profile[ri][0] <= 1e-6;
    const bPole = profile[ri + 1][0] <= 1e-6;
    counts.push(aPole || bPole ? segments : segments * 2);
  }
  return counts;
}

/** 극점을 축에 고정하고 캡 링 Y를 극과 같게 해 평면 캡이 안 접히게 한다. */
function closeCaps(geometry: THREE.BufferGeometry, ringStart: readonly number[], segments: number, halfT: number): void {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const last = ringStart.length - 1;
  pos.setXYZ(ringStart[0], 0, -halfT, 0);
  pos.setXYZ(ringStart[last], 0, halfT, 0);
  for (let s = 0; s < segments; s++) {
    const lo = ringStart[1] + s;
    pos.setXYZ(lo, pos.getX(lo), -halfT, pos.getZ(lo));
    const hi = ringStart[last - 1] + s;
    pos.setXYZ(hi, pos.getX(hi), halfT, pos.getZ(hi));
  }
  pos.needsUpdate = true;
}

function scaleXZ(geometry: THREE.BufferGeometry, s: number): void {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) * s);
    pos.setZ(i, pos.getZ(i) * s);
  }
  pos.needsUpdate = true;
}

/**
 * FrontSide 컬링에서 배경이 비치지 않게, 삼각형 감기를 원점 기준 바깥으로 맞춘다.
 * 원반은 볼록체라 n·centroid>0이면 바깥. 챔퍼를 XZ-only로 판정하면 빗면이 뒤집혀
 * 림 이음매에서 세이지가 샌다(실측 az=180/225).
 */
function ensureOutward(g: THREE.BufferGeometry): void {
  const arr = g.attributes.position.array as Float32Array;
  for (let i = 0; i < arr.length; i += 9) {
    const ax = arr[i];
    const ay = arr[i + 1];
    const az = arr[i + 2];
    const bx = arr[i + 3];
    const by = arr[i + 4];
    const bz = arr[i + 5];
    const cx = arr[i + 6];
    const cy = arr[i + 7];
    const cz = arr[i + 8];
    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const mx = (ax + bx + cx) / 3;
    const my = (ay + by + cy) / 3;
    const mz = (az + bz + cz) / 3;
    if (nx * mx + ny * my + nz * mz >= 0) continue;
    arr[i + 3] = cx;
    arr[i + 4] = cy;
    arr[i + 5] = cz;
    arr[i + 6] = bx;
    arr[i + 7] = by;
    arr[i + 8] = bz;
  }
  g.computeVertexNormals();
}

const TEX_SIZE = 160; // <=256 (R3)
const WEDGE_COUNT = 10;
const PITH_RADIUS = 0.11;
const PITH_RING_INNER = 0.435;
const MEMBRANE_HALF_WIDTH = 0.07;

function paintLemonPulpTexture(): THREE.CanvasTexture {
  const pulp: [number, number, number] = [(PULP_COLOR >> 16) & 0xff, (PULP_COLOR >> 8) & 0xff, PULP_COLOR & 0xff];
  const shade: [number, number, number] = [(PULP_SHADE >> 16) & 0xff, (PULP_SHADE >> 8) & 0xff, PULP_SHADE & 0xff];
  const pith: [number, number, number] = [(PITH_COLOR >> 16) & 0xff, (PITH_COLOR >> 8) & 0xff, PITH_COLOR & 0xff];

  const tex = bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size - 0.5;
        const v = (py + 0.5) / size - 0.5;
        const dist = Math.hypot(u, v);
        const angle = Math.atan2(v, u);
        let c: [number, number, number];
        if (dist < PITH_RADIUS || dist > PITH_RING_INNER) {
          c = pith;
        } else {
          const stripe = Math.cos(angle * WEDGE_COUNT);
          if (stripe > 1 - MEMBRANE_HALF_WIDTH) {
            c = pith;
          } else {
            const wedgeIndex = Math.floor(((angle / (Math.PI * 2)) * WEDGE_COUNT + WEDGE_COUNT) % WEDGE_COUNT);
            c = wedgeIndex % 2 === 0 ? pulp : shade;
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
  tex.flipY = true;
  return tex;
}

const TILT = 0.4; // 23°. 전 방위 윗면. 0.82는 az=180에서 아랫면.
const YAW = -0.5522; // = atan2(-1.6, 2.6)

const LAT: readonly [number, number] = [Math.cos(YAW), -Math.sin(YAW)];
const OUT: readonly [number, number] = [Math.sin(YAW), Math.cos(YAW)];

// 평면 간격 = NORMAL_GAP × sin(TILT) = 0.56 × 0.389 = 0.218 > 두께합 0.212(과육 0.006 돌출 포함) → 교차 불가.
// 0.60은 az=180에서 두 장 사이 세이지 슬릿이 4px 구멍으로 잡혔다. 평행 보장은 유지한 채 틈만 좁힌다.
const LATERAL = 0.6;
const NORMAL_GAP = 0.56;

interface SliceDef {
  uv: readonly [number, number];
  roll: number;
  /** 눕힘 각 (rad, 0=수평). a·b가 다르다 — 위 v4 주석. */
  tilt: number;
}

const SLICES: Record<'a' | 'b', SliceDef> = {
  a: { uv: [-0.28, 0.3], roll: 0, tilt: TILT_A },
  b: { uv: [0.28, -0.3], roll: 0.314, tilt: TILT_B },
};

function buildSlice(): { rindGeo: THREE.BufferGeometry; pulpBottomGeo: THREE.BufferGeometry; pulpTopGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, LEMON_SEGMENTS, LEMON_HALF_THICKNESS, () => [LEMON_RADIUS, LEMON_RADIUS]);
  closeCaps(geometry, ringStart, LEMON_SEGMENTS, LEMON_HALF_THICKNESS);

  const baked = facet(geometry);
  const counts = bandTriCounts(PROFILE, LEMON_SEGMENTS);
  const cum: number[] = [];
  counts.reduce((acc, c) => {
    const next = acc + c;
    cum.push(next);
    return next;
  }, 0);
  // PULP(밑면) = 밴드 0..2, RIND = 밴드 3..5, PULP(윗면) = 밴드 6..8.
  const pulpBottomEnd = cum[2];
  const rindEnd = cum[5];
  const total = cum[cum.length - 1];

  const pulpBottomGeo = sliceTriangles(baked, 0, pulpBottomEnd);
  const rindGeo = sliceTriangles(baked, pulpBottomEnd, rindEnd);
  const pulpTopGeo = sliceTriangles(baked, rindEnd, total);
  ensureOutward(pulpBottomGeo);
  ensureOutward(rindGeo);
  ensureOutward(pulpTopGeo);
  uvDome(pulpBottomGeo);
  uvDome(pulpTopGeo);
  uvTopPlanar(rindGeo);
  // 과육면을 살짝 키우고 바깥으로 밀어 림 챔퍼 이음매의 스침 틈(실측 az=180/225, 2~5px 세이지 누수)을 덮는다.
  scaleXZ(pulpBottomGeo, 1.06);
  scaleXZ(pulpTopGeo, 1.06);
  pulpBottomGeo.translate(0, -0.006, 0);
  pulpTopGeo.translate(0, 0.006, 0);
  return { rindGeo, pulpBottomGeo, pulpTopGeo };
}

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

export const createLemon: IngredientBuilder = (_rng) => {
  const rindMat = stdMaterial({ color: RIND_COLOR });
  const pulpMat = stdMaterial({ map: paintLemonPulpTexture(), color: 0xffffff });

  const cluster = new THREE.Group();

  (Object.keys(SLICES) as (keyof typeof SLICES)[]).forEach((key) => {
    const def = SLICES[key];
    const { rindGeo, pulpBottomGeo, pulpTopGeo } = buildSlice();

    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(rindGeo, rindMat), new THREE.Mesh(pulpBottomGeo, pulpMat), new THREE.Mesh(pulpTopGeo, pulpMat));
    sub.quaternion
      .setFromAxisAngle(AXIS_Y, YAW)
      .multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, def.tilt))
      .multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_Y, def.roll));
    sub.position.set(def.uv[0] * LAT[0] + def.uv[1] * OUT[0], 0, def.uv[0] * LAT[1] + def.uv[1] * OUT[1]);

    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;

    cluster.add(sub);
  });

  return mergeByMaterial(cluster);
};
