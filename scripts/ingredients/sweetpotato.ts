// 고구마 — 한쪽 끝을 수직으로 자른 단일 덩이뿌리. 계약은 types.ts 주석이 정본. 재료 2차
// 배치(신규 4종) 3번째.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/sweetpotato.json(워크스페이스 원본은
// assets/ingredients/work/sweetpotato/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// beet/fig(반으로 가른 half-revolution)와 달리 고구마는 "한쪽 끝만" 잘려 몸통 대부분이 온전한
// 통짜 회전체다 — lib.buildRevolvedShell을 **그대로**(로컬 셸 재구현 없이) 쓴다. 자른 단면은
// PROFILE 맨 앞에 극점(반지름 0)과 절단 림(반지름>0)을 **같은 높이**로 잇달아 배치하는 트릭으로
// 만든다: buildRevolvedShell의 "aPole" 팬 로직이 원래 매끈한 극점을 만드는 코드인데, 두 프로필
// 점의 높이가 같으면 그 팬이 정확히 "평평한 원판 캡"이 된다(추가 코드 0줄, lib.ts 수정 없음).
// 절단면(첫 segments개 삼각형, 생성 순서로 자명)과 몸통(나머지)은 sliceTriangles로 가른다
// (pumpkin/fig와 동일 관례). 지오메트리는 세워서(장축=로컬 Y, 절단면=-Y) 짓고 UV까지 다 낸 뒤에야
// **마지막으로** geometry.rotateX/rotateY로 대각선 배치를 굽는다 — UV는 회전 전 평면(절단면은
// 로컬 XZ 평면)에서 계산되므로 이 순서를 지켜야 방사 반점 텍스처가 안 찌그러진다.
//
// ★2026-08-26 전체화면 쇼케이스 수리(texbug). 두 가지를 고쳤다 — 되돌리지 말 것:
//   (1) 절단면 텍스처의 각도 랩 버그(아래 paintFleshTexture 주석) — 단면 절반이 옅은 라일락으로
//       통째로 메워져 "곰팡이 핀 단면"으로 보였다.
//   (2) SEGMENTS 14 -> 32 + PROFILE 9점 -> 17점. 재료 예산이 100KB/2500tri에서 250KB/8000tri로
//       상향됐고(families.mjs 2026-08-26 주석), 재료도 빵과 **같은 쇼케이스에서 같은 크기로**
//       확대돼 보인다. 옛 격자는 64px 썸네일에서만 멀쩡했고 전체 화면에서는 각진 덩어리 +
//       뭉툭한 원뿔 끝으로 읽혔다. 폴리곤을 아껴서 각지게 만들지 마라.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { angleDeltaDeg, bakeTexture, buildRevolvedShell, facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/sweetpotato.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const SKIN_COLOR = 0x4a2f5c; // "a deep plum-purple skin"
const FLESH_COLOR = 0x7a5296; // "a vivid violet-purple cut flesh"
const FLECK_COLOR = 0x9b79b0; // "faint pale lilac starch flecks radiating from the center"
// 능선의 밝은 광택(#5F3E73 "a lighter violet sheen along its ridges")은 별도 버킷을 안 만든다 —
// 몸통이 볼록한 회전체라 런타임 키라이트 N·L 감쇠가 능선 하이라이트를 이미 공짜로 낸다
// (올리브 shaded-underside-hue-dropped와 동일 논리, 스펙 risk skin-sheen-hue-dropped 참조).

// 실측 비율(assets/ingredients/src/sweetpotato.png 3/4 — 세 장 다 절단면을 카메라로 향해 찍혀
// 몸통 옆모습은 이 3/4 샷이 가장 유용하다). 길이:너비 ~= 2:1의 늘씬한 덩이뿌리.
const RADIUS = 0.42; // 절단면 바로 뒤 어깨(가장 넓은 지점) 반지름
const HALF_LENGTH = 0.85; // 절단면-둥근끝 절반 길이
const SEGMENTS = 32; // ★14에서 상향(2026-08-26). 14는 전체화면에서 절단면 림이 눈에 띄는 14각형으로,
// 몸통은 각진 덩어리로 읽혔다. 32면 tri ~900 / GLB ~90KB로 상한(8000tri/250KB)에 한참 못 미친다.
const CUT_RIM_FRAC = 0.82; // 절단면 자체는 어깨보다 살짝 좁다(sweetpotato.png 실측 — 자른 자리가
// 몸통에서 살짝 들어가 있다) — 실루엣 정체성(길이:너비, 두 끝 뭉툭함)을 프로필로 명시한다.

type ProfilePoint = readonly [number, number];
// (반지름비, 높이비) — heightFrac -1(절단면) .. +1(둥근 끝 극점). 맨 앞 두 점이 트릭의 핵심:
// [0,-1]과 [CUT_RIM_FRAC,-1]이 같은 높이라 그 사이 팬이 평평한 원판이 된다.
// ★맨 앞 두 점의 **순서와 인접**은 계약이다 — 평평한 캡 트릭과 capTriCount=SEGMENTS가 둘 다
// 여기에 의존한다. 사이에 점을 끼워 넣지 마라.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, -1.0],
  [CUT_RIM_FRAC, -1.0],
  [0.905, -0.9],
  [0.95, -0.82],
  [0.985, -0.66],
  [1.0, -0.5],
  [0.985, -0.32],
  [0.92, -0.12],
  [0.84, 0.08],
  [0.74, 0.28],
  [0.63, 0.46],
  [0.52, 0.62],
  [0.42, 0.75],
  [0.31, 0.86], // ★끝단을 옛 [0.22,0.86] -> 원뿔에서 둥근 마무리로 바꿨다: 옛 프로필은 마지막
  [0.21, 0.93], // 한 구간에서 0.22 -> 0으로 떨어져 90도 각도에서 뾰족한 고추 끝처럼 보였다.
  [0.115, 0.975], // 스펙 실루엣은 "softly knobby rounded ends"다.
  [0.0, 1.0],
];

const JITTER_AMP = 0.008; // ★0.015에서 축소(2026-08-26). SEGMENTS를 32로 올린 뒤 옛 진폭을 그대로
// 두면 정점 지터가 고주파 잔물결이 되어 표면이 결정 덩어리로 보인다 — 큰 굴곡은 아래 KNOB이
// 맡고 지터는 미세 페이싯만 담당하도록 역할을 나눴다.

// 저주파 혹 — "softly knobby" 실루엣을 정점 난수가 아니라 각도·높이의 매끈한 합성 사인으로 낸다
// (난수 지터는 격자를 촘촘히 할수록 잔물결이 되지만, 이 곱셈자는 격자 밀도와 무관하게 같은
// 크기의 혹을 낸다). 위상만 rng에서 뽑아 결정론 유지(Math.random 금지, types.ts §5).
const KNOB_AMP = 0.03; // 반지름의 3%

// 배치 회전 — 세워 지은(장축=Y, 절단면=-Y) 지오메트리를 대각선으로 눕힌다. rotateX로 절단면이
// 카메라(+Z)를 향하며 살짝 위를 보게, rotateY로 축을 화면 대각선(장축 끝이 우상단·안쪽으로)으로
// 튼다. 두 각 다 -Y(절단면 바깥 노멀)를 (-0.42,0.17,0.89) 방향으로 보내도록 손으로 유도했다 —
// 카메라가 위(+Y)에서 내려다보므로 뒤쪽 끝은 실제 좌표는 살짝 아래(-Y)라도 원근 때문에 화면상
// 더 높게 찍힌다(3/4 카메라 관례, cmp 렌더로 검증).
const ROTATE_X = -1.92; // -110deg — cmp-2 실측: 순수 -90deg(법선이 정확히 (0,0,1))는 절단면 형태
// 자체는 잘 보였지만 64px에서 어둡게 죽었다. 하네스 카메라(-1.6,2.2,2.6)·키라이트 둘 다 위쪽에서
// 오므로 법선에 +Y 성분을 더 실어야(카메라 방향과의 내적이 (0,0,1)의 0.72 -> (0,0.34,0.94)의
// 0.89로 상승) 절단면이 더 밝게/더 카메라 정면으로 잡힌다.
const ROTATE_Y = 0; // 요는 생략 유지 — cmp-1에서 -25deg 요가 절단면을 오히려 거의 안 보이게 만들었다.

const TEX_SIZE = 256; // <=256 (R3) — 176에서 상한까지. 전체화면에서 절단면이 화면의 30% 가까이
// 차지하므로 176은 방사줄 가장자리가 눈에 띄게 계단졌다. R3의 256² 상한 자체는 그대로다.
const FLECK_COUNT = 22; // sweetpotato.png 실측: 중심에서 방사하는 옅은 전분 반점 개수 어림

function paintFleshTexture(rng: () => number): THREE.CanvasTexture {
  const base: [number, number, number] = [(FLESH_COLOR >> 16) & 0xff, (FLESH_COLOR >> 8) & 0xff, FLESH_COLOR & 0xff];
  const fleck: [number, number, number] = [(FLECK_COLOR >> 16) & 0xff, (FLECK_COLOR >> 8) & 0xff, FLECK_COLOR & 0xff];
  const capRadius = RADIUS * CUT_RIM_FRAC;

  // 방사 반점 — 각도/길이/폭을 주입 rng로 결정론 생성(Math.random 금지, fig.ts 방사 씨앗줄과 동일 기법).
  // ★각도는 **도(deg)** 로 잡는다(2026-08-26). 라디안으로 잡고 차이를 손으로 랩하던 옛 코드가
  // 아래 각도차 버그의 원인이었다 — 공용 lib.angleDeltaDeg(도)를 쓰면 그 버그 종류가 원천 봉쇄된다.
  const anglesDeg: number[] = [];
  const inner: number[] = [];
  const lens: number[] = [];
  const widthsDeg: number[] = [];
  const mixes: number[] = [];
  for (let i = 0; i < FLECK_COUNT; i++) {
    anglesDeg.push((i / FLECK_COUNT) * 360 + (rng() - 0.5) * 12);
    // ★안쪽 끝을 반점마다 다르게 잡는다(2026-08-26). 전부 중심에서 출발하면 22개 바퀴살이 한 점에
    // 모여 "폭죽/해바라기 도장"으로 읽힌다 — 스펙은 "**faint** starch flecks scattered"다.
    const i0 = (0.1 + rng() * 0.4) * capRadius;
    inner.push(i0);
    lens.push(i0 + (0.2 + rng() * 0.45) * capRadius);
    // 옛 값 0.025~0.041rad(1.4~2.35도)은 전체화면에서 실오라기처럼 가늘어 "긁힌 자국"으로 읽혔다.
    widthsDeg.push(2.4 + rng() * 1.8);
    mixes.push(0.45 + rng() * 0.55); // 반점마다 다른 농도 — 균일한 흰 선이 아니라 얼룩으로
  }

  return bakeTexture(TEX_SIZE, (ctx, size) => {
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size;
        const v = (py + 0.5) / size;
        // uvTopPlanar(X,Z) 정투영과 짝을 맞춘다 — 절단면이 로컬 XZ 평면(Y=-heightScale 고정)에
        // 눕혀 있으므로 등방 스케일(fig의 uvFrontPlanar 비등방 함정과 달리 X/Z 둘 다 같은 반지름 자).
        const localX = (u - 0.5) * 2 * capRadius;
        const localZ = (v - 0.5) * 2 * capRadius;
        const dist = Math.hypot(localX, localZ);
        const angleDeg = (Math.atan2(localZ, localX) * 180) / Math.PI;
        let c = base;
        for (let i = 0; i < FLECK_COUNT; i++) {
          // ★2026-08-26 버그 수정 — 되돌리지 말 것. 옛 코드는
          //     let d = Math.abs(angle - angles[i]); if (d > Math.PI) d = Math.PI*2 - d;
          // 였는데, angles[i]는 [0,2π)이고 Math.atan2는 [-π,π]라 차이의 절댓값이 2π를 넘는 경우가
          // 생기고 그때 d가 **음수**가 된다(예: |−3.0 − 6.0| = 9.0 → 2π−9.0 = −2.72 < width).
          // 음수는 어떤 width보다도 작으니 그 픽셀들이 전부 반점으로 칠해졌다 — 절단면 절반이
          // 옅은 라일락으로 통째로 메워져 "곰팡이 핀 단면"으로 보인 원인.
          // 랩은 손으로 하지 말고 공용 lib.angleDeltaDeg(mod 360 후 접기)에 맡긴다.
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

export const createSweetpotato: IngredientBuilder = (rng) => {
  // 마스크가 아니라 생성 순서(sliceTriangles)로 가르므로 ringStart는 필요 없다.
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, SEGMENTS, HALF_LENGTH, () => [RADIUS, RADIUS]);
  // 절단면(팬) 삼각형 개수 — PROFILE[0]이 극(aPole)이라 첫 전이가 정확히 segments개를 낸다.
  const capTriCount = SEGMENTS;

  // 저주파 혹 — 지터 이전, indexed 상태에서 반지름에 곱한다(redbean 소용돌이 함몰과 같은 후처리
  // 패턴). 절단면 림 링에도 그대로 걸려 단면 윤곽이 완전한 원이 아니게 되는데, 이건 의도다
  // (자른 덩이뿌리의 단면은 정원이 아니다) — 평평함은 링 0/1의 **높이가 같다**는 사실이 지키므로
  // 반지름을 흔들어도 캡은 평평하게 남는다.
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
      const m = 1 + (KNOB_AMP * wave) / 1.55; // /1.55 = 최대 진폭 정규화
      pos.setXYZ(i, x * m, pos.getY(i), z * m);
    }
  }
  pos.needsUpdate = true;

  jitterVertices(geometry, rng, JITTER_AMP); // 셸 전체(절단면 팬+몸통 공유 정점)에 한 번만 — R1.
  const baked = facet(geometry);
  const capGeo = sliceTriangles(baked, 0, capTriCount);
  const skinGeo = sliceTriangles(baked, capTriCount, baked.attributes.position.count / 3);
  uvTopPlanar(capGeo); // 절단면은 로컬 XZ 평면 — 정투영이 곧 정확한 투영.
  uvTopPlanar(skinGeo); // 순색 버킷 — 어떤 투영이든 무방, attribute 일관성만 필요(pumpkin cutface 관례).

  // 회전은 UV를 낸 뒤에 굽는다 — position/normal만 바뀌고 UV는 그대로라 텍스처가 안 틀어진다.
  capGeo.rotateX(ROTATE_X);
  capGeo.rotateY(ROTATE_Y);
  skinGeo.rotateX(ROTATE_X);
  skinGeo.rotateY(ROTATE_Y);

  const skinMat = stdMaterial({ color: SKIN_COLOR });
  const fleshMat = stdMaterial({ map: paintFleshTexture(rng), color: 0xffffff });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(skinGeo, skinMat));
  group.add(new THREE.Mesh(capGeo, fleshMat));

  return mergeByMaterial(group);
};
