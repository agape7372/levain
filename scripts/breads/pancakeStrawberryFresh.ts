// 딸기 팬케이크 — 반죽 위에 **얹은** 토핑 더미(크림 돌롭 + 딸기 + 소스 드립). 계약은 types.ts 주석이 정본.
//
// 계열 첫 변형이다. 지금까지의 변형 3종(초코칩·올리브·잼 스월)은 전부 반죽 **안에** 박힌
// 인클루전이었고, 별개 물체를 위에 쌓는 건 처음이다. 여기서 정한 예산·구성 규칙이 나머지 18종의 틀이다.
//
// 유래·계승 (docs/BREADS.md 변형 규칙 — 계승 대상은 수치이지 절차가 아니다):
//   · 반죽 = `scripts/breads/pancakeStack.ts` (계열 공유 모듈). 두께는 v5 JSON 전사.
//   · 딸기 = `scripts/ingredients/strawberry.ts`에서 **수치와 함정만** 전사. 그 파일 머리 주석의
//     "되돌리지 마라" 항목을 여기서도 지킨다:
//       ★v6 몸통 쿼드를 씨로 칠하면 체커보드 → **씨는 텍스처가 아니라 지오메트리**다.
//       ★v7 씨 와인딩은 +N에서 CCW. CW면 FrontSide 컬링이 씨를 통째로 삼킨다.
//       ★v8 꽃받침 CAP_R 0.13 / TIP_R 0.28 (그 위로 키우면 큰 모자가 된다).
//       ★잎은 앞면+뒤집힌 뒷면을 함께 굽는다 — 런타임이 material.side를 승계하지 않는다.
//     단 씨 배치는 closest-point 투영을 쓰지 않는다. 저 파일은 몸통이 facet(다면)이라 필요했고,
//     여기 몸통은 스무스라 프로필 해석 법선이 곧 표면 법선이다.
//   · 색 = `assets/prompts/breads/pancake--strawberry-fresh.json` (notes_ko 기준 v5) 손 전사.
//     JSON import 금지 — hex가 문장 안에 박혀 있다 (types.ts §8).
//
// 마감: 전부 indexed 유지 + `computeVertexNormals()` (CRIB §마감 계약 스무스 클레이).
// `facet()`·`toNonIndexed()`를 쓰지 않으므로 머티리얼 1벌로 다 합쳐진다 — ⚠ 한 버킷에 indexed와
// non-indexed를 섞으면 `mergeGeometries`가 실패한다(BufferGeometryUtils.js:156). 나중에 딸기만
// 플랫으로 올리고 싶어지면 그건 **반드시 두 번째 머티리얼**이어야 한다.
import * as THREE from 'three';
import type { BreadBuilder } from './types';
import { buildRevolvedShell, mergeByMaterial, orientToward, stdMaterial, bakeTexture, scaleHex } from './lib';
import {
  ATLAS_PX,
  FRONT_ANGLE,
  TOP_ZONE,
  buildPancakeStack,
  ensureIndexed,
  hexRgb,
  rampRect,
  setConstantUv,
  setRampUv,
  rampUv,
} from './pancakeStack';

// ---------------------------------------------------------------------------
// 팔레트 — pancake--strawberry-fresh.json 손 전사
// ---------------------------------------------------------------------------

// geometry.body: "warm caramel brown (#B9793F) at the centre ... fading through toasty golden
// (#CF9455) into light golden (#D9A76B) toward the rim"
const TOP_CENTER = 0xb9793f;
const TOP_MID = 0xcf9455;
const TOP_RIM = 0xd9a76b;
// geometry.body: "The side wall of every pancake is the pale cream of the risen crumb (#F1DDB0)"
const CRUMB = 0xf1ddb0;
// toppings[WHIPPED CREAM]: "lightly whipped cream (#FFF8EC)"
const CREAM = 0xfff8ec;
// toppings[STRAWBERRIES]: "five fresh, ripe strawberries in glossy red (#D8322E)" / calyx "(#4F7A3A)"
const BERRY = 0xd8322e;
const CALYX = 0x4f7a3a;
// toppings[SAUCE]: "glossy, translucent strawberry sauce (#B8202A)"
// ★정본 상수로 남겨 두되 머티리얼에는 안 먹인다 — 아래 SAUCE_RENDER가 실제로 쓰인다.
//   `focacciaOliveFlesh.ts`의 OLIVE_COLOR와 같은 취급이다(출처는 보존, 값은 보정본을 쓴다).
const SAUCE = 0xb8202a;
void SAUCE;
// 씨 — v5 JSON은 "tiny pale yellow seeds"라고만 하고 hex를 안 준다. 레포의 딸기 씨 정본
// `scripts/ingredients/strawberry.ts` SEED_COLOR를 그대로 쓴다(같은 과일이 두 색이면 안 된다).
const SEED = 0xf4e3c4;
// 옆벽 위쪽 구운 띠 — v5 body "meeting the browned top in a soft blurred edge". hex가 따로 없어
// 윗면 림(#D9A76B)과 중간톤(#CF9455)을 섞어 유도한다(픽셀 샘플링 금지, types.ts §8).
const WALL_TOAST = 0xd49f62;
/** hex 두 개를 비율로 섞는다 — campagneStrawberryJam.ts의 mixHex와 같은 이유(픽셀 샘플링 금지). */
function mixHex(a: number, b: number, t: number): number {
  const ch = (shift: number): number =>
    Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t) & 0xff;
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// 절단면 심 — JSON "the pale pink-white heart fading into red flesh".
// ★scaleHex(BERRY, 1.72)로 만들면 안 된다 — 포화 적색은 R이 255에 붙어 클리핑되고 결과가
//   연분홍이 아니라 더 쨍한 주홍이 된다(CRIB §색 진단: 밝은 색은 밝기가 아니라 **채널 비**로 맞춰라).
//   흰색 쪽으로 섞어야 채도가 실제로 떨어진다.
const BERRY_HEART = mixHex(BERRY, 0xffffff, 0.7);
const BERRY_FLESH = mixHex(BERRY, 0xffffff, 0.28);

// ── 렌더 타깃 보정 (CRIB §색 진단 — 배율이 아니라 3쌍으로 기록한다) ─────────────────────────
// 전역 게인은 금지다(대비가 죽는다). 아래는 **파트별 알베도** 보정이고, 정본 hex는 위에 출처로 남긴다.
// 측정면은 top-down 고정(같은 껍질이 3/4에서 238, top-down에서 222로 읽힌 선례 때문).
//
// 딸기 껍질 3쌍:
//   쓴 알베도 #D8322E(정본) → 나온 렌더 (220,49,47) → 목표 (201,37,9)
//     = 레퍼런스 `-3.png` top-down의 포화 적색 마스크 중앙값 #C92509
//   조명 리그가 알베도를 거의 1:1로 재현하므로(윗면 파리티 재보정, docs/BREADS.md) 차이는
//   셰이딩이 아니라 **정본 hex 자체가 레퍼런스보다 푸르고 밝다**는 뜻이다. 파랑을 내려 맞춘다.
const BERRY_RENDER = 0xce2814;
// 소스 3쌍:
//   쓴 알베도 #B8202A(정본) → 나온 렌더 (144,27,36) → 목표 (155,6,2) = 레퍼런스 top-down 중앙값 #9B0602
//   밝기는 이미 근사하고 어긋난 건 **채도**다(G·B가 높다). campagne 잼 라운드에서 밝기 손실을
//   통째로 되돌렸다가 형광 분홍이 된 실패가 있으므로 전량 보정하지 않고 목표 쪽으로 절반쯤만 간다.
const SAUCE_RENDER = 0xd0242c;
// 보정 후 재측정(top-down): 소스 (153,9,9)로 목표에 붙었으나, **레퍼런스 콜라주와 나란히 놓으니
// 너무 어두웠다** — 목표로 삼은 #9B0602는 웅덩이 그늘까지 포함한 중앙값이라 사람이 읽는 밝기보다
// 어둡다. CRIB이 경계한 과보정(campagne 형광 분홍)의 반대 방향 실패다. 0xBE100C → 0xD0242C로
// 되돌렸다. 교훈: 중앙값 하나로 목표를 잡지 말고 **콜라주에서 눈으로 한 번 더 견줘라**.
// 딸기 (221,43,21) — 색조는 맞고
// R이 20 정도 높은데, 이건 top-down에서 위로 향한 면이 리그의 키라이트를 정면으로 받기 때문이다.
// 더 내리면 3/4(출하 카메라)에서 탁해진다 — 여기서 멈춘다.

// 슈가파우더 — 끄고 켠 64² 차이를 보는 게 판독 게이트의 일부다(껐을 때와 구분이 안 되면
// 바이트만 쓰는 셈이다). 검수 때 이 상수 하나로 뒤집는다.
const SUGAR = true;

// ---------------------------------------------------------------------------
// 스택 수치 — v5 JSON 전사
// ---------------------------------------------------------------------------

// geometry.silhouette "약 2.5cm/장, 높이≈폭의 60%" + body "the stack is about 60% as tall as it is
// wide". 3장이 약 5% 겹치므로 장당 두께 = 0.60 / 2.9 ≈ 0.207 (지름 대비). 반지름 1.0 = 지름 2.0이라
// 빌더 단위로는 0.414. (레퍼런스 PIL 실측 0.182~0.20은 대조용일 뿐 출처가 아니다 — 수치 정본은 JSON.)
const DISK_HEIGHT = 0.414;
const STACK_STEP = 0.368; // 겹침 약 11% — 원반이 서로 눌린다("the edges kiss softly")
// body: "A few tiny pinprick pores sit near the rim of the top pancake, barely visible."
// 베이스 빌더는 8·8·22개였다. v5는 그걸 원하지 않는다 — 평판형 빵의 정체성은 구멍이 아니라
// 2톤(갈색 윗면 + 크림 옆벽)이 지고, 윗면 점 무리는 곰팡이로 읽힌다(assets/prompts/README.md v4 교훈).
const PORE_COUNTS: readonly [number, number, number] = [2, 2, 6];
const SEGMENTS = 22; // 20에서는 탑다운 테두리가 눈에 띄게 다각형이었다(육안 검수)

// ---------------------------------------------------------------------------
// 딸기 — scripts/ingredients/strawberry.ts 수치 전사
// ---------------------------------------------------------------------------

type ProfilePoint = readonly [number, number];

/** 딸기 몸통 프로필(반지름비, 높이비). 재료 빌더 PROFILE 전사. */
const BERRY_PROFILE: readonly ProfilePoint[] = [
  [0.0, 0.0],
  [0.28, 0.06],
  [0.52, 0.18],
  [0.75, 0.34],
  [0.93, 0.48],
  [1.0, 0.62],
  [0.92, 0.76],
  [0.72, 0.88],
  [0.42, 0.96],
  [0.0, 1.0],
];
const BERRY_H_OVER_W = 1.06;
/** 반쪽 셸이 도는 각도. π보다 넓게 돌려야 옆에서 봐도 두께가 남는다. */
const HALF_SPAN = Math.PI * 1.28; // 재료 빌더 BODY_HEIGHT 1.06 / (BODY_RADIUS 0.5 × 2)

// 씨 — 재료 빌더 SEED_* 전사. 반지름 0.5 기준 값이라 여기선 딸기 스케일에 비례시킨다.
const SEED_HALF_LEN = 0.02 / 0.5;
const SEED_HALF_WIDTH = 0.013 / 0.5;
const SEED_LIFT = 0.004 / 0.5;
const SEED_H_RANGE: readonly [number, number] = [0.14, 0.86];

// 꽃받침 — 재료 빌더 v8 값에서 출발하되 **키웠다**.
// v8이 0.5→0.28로 줄인 건 딸기 하나가 화면을 꽉 채우는 재료 쇼케이스에서 "큰 모자"로 보였기
// 때문이다. 여기 딸기는 팬케이크 위 토핑이라 화면에서 훨씬 작고, 붉은 덩어리 위 초록은 64²
// 카드에서 살아남는 몇 안 되는 신호다(실측: 초록이 28~30px). 그래서 0.28 → 0.40으로 되돌리되
// v8이 경계했던 0.5까지는 안 간다. 드룹도 줄여 잎 끝이 실루엣에 걸리게 한다.
const CALYX_LEAVES = 5;
const CALYX_CAP_R = 0.16 / 0.5;
const CALYX_TIP_R = 0.4 / 0.5;
const CALYX_PITCH = (12 * Math.PI) / 180;
const CALYX_BACK_OFFSET = 0.008 / 0.5;

// ---------------------------------------------------------------------------
// 아틀라스
// ---------------------------------------------------------------------------

const RAMP = {
  crumb: 'A0',
  cream: 'A1',
  berry: 'A2',
  heart: 'A3',
  sauce: 'B0',
  calyx: 'B1',
  seed: 'B2',
} as const;

function paintRampBand(
  ctx: CanvasRenderingContext2D,
  slot: keyof typeof RAMP,
  stops: readonly (readonly [number, number])[],
): void {
  const r = rampRect(RAMP[slot]);
  const grad = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
  for (const [t, hex] of stops) grad.addColorStop(Math.max(0, Math.min(1, t)), hexRgb(hex));
  ctx.fillStyle = grad;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

/**
 * 256² 아틀라스 1장. 존 배치·가드 밴드 규약은 pancakeStack.ts 머리 주석 참조.
 *
 * 슈가파우더는 세 층이다(assets/prompts/breads/…json toppings[FINISHING] "a barely-there **haze**
 * … **settling in** the seed dimples and the **folds**"):
 *   1) 헤이즈 — 저주파. 밉맵이 뭉개도 살아남는다.
 *   2) 결에 고이기 — 램프 t가 형상(법선 위쪽·오목한 곳)을 읽으므로 색이 형상을 따라간다.
 *   3) 알갱이 — 소수·크게(반지름 ≥2px)·연하게(alpha ≤0.3). **포화 적색 위에는 안 뿌린다**
 *      (흰 미세 반점이 좁쌀·곰팡이로 읽힌 campagneStrawberryJam 실측 때문).
 */
function paintAtlas(rng: () => number): THREE.CanvasTexture {
  return bakeTexture(ATLAS_PX, (ctx) => {
    // 존 밖(가드 밴드)은 중립 크럼색으로 채운다 — 밉맵이 존 밖을 끌어와도 튀지 않게.
    ctx.fillStyle = hexRgb(CRUMB);
    ctx.fillRect(0, 0, ATLAS_PX, ATLAS_PX);

    // ── 윗면 2D 존: 중앙 진한 캐러멜 → 림 밝은 골드 ─────────────────────────────
    const cx = TOP_ZONE.x + TOP_ZONE.w / 2;
    const cy = TOP_ZONE.y + TOP_ZONE.h / 2;
    const R = TOP_ZONE.w / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, hexRgb(TOP_CENTER));
    g.addColorStop(0.55, hexRgb(TOP_MID));
    g.addColorStop(1, hexRgb(TOP_RIM));
    ctx.fillStyle = g;
    ctx.fillRect(TOP_ZONE.x, TOP_ZONE.y, TOP_ZONE.w, TOP_ZONE.h);

    // 얼룩 — "a few slightly darker freckles and one paler patch where a bubble lifted the batter,
    // the way real pancakes never brown evenly". 저주파라 카드 크기에서 톤으로 남는다.
    ctx.save();
    ctx.beginPath();
    ctx.rect(TOP_ZONE.x, TOP_ZONE.y, TOP_ZONE.w, TOP_ZONE.h);
    ctx.clip();
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2;
      const rr = 0.25 + rng() * 0.6;
      const px = cx + Math.cos(a) * rr * R;
      const py = cy + Math.sin(a) * rr * R;
      const rad = 9 + rng() * 13;
      const dark = i < 5;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, rad);
      grad.addColorStop(0, dark ? 'rgba(120,72,32,0.30)' : 'rgba(246,222,178,0.34)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    if (SUGAR) {
      // 1층 헤이즈 — 림 쪽에 뽀얗게. 카드 배경(#F2E6D3)이 크림색이라 옆벽 위 흰 기운은 안 보인다.
      // 갈색 윗면이 유일하게 대비가 나오는 무대다.
      const ring = ctx.createRadialGradient(cx, cy, R * 0.45, cx, cy, R);
      ring.addColorStop(0, 'rgba(255,255,255,0)');
      ring.addColorStop(1, 'rgba(255,255,255,0.16)');
      ctx.fillStyle = ring;
      ctx.fillRect(TOP_ZONE.x, TOP_ZONE.y, TOP_ZONE.w, TOP_ZONE.h);
      // 3층 알갱이 — 반지름 2~3.4px, alpha 0.22. 개수는 26개(=존 면적의 0.2% 미만).
      // 육안 검수에서 "가루가 아니라 표면 하이라이트로 읽힌다"는 판정이 나와 세기와 개수를 올렸다.
      // 상한은 곰팡이 게이트다 — 64²에서 크림 외 흰 점이 3개를 넘거나 딸기에 걸리면 되돌린다.
      // ★크고 성긴 점은 가루가 아니라 **반죽 기포**로 읽힌다(육안 검수 2회 연속 판정).
      //   가루는 입자가 가늘고 촘촘해야 가루다. 반지름을 2~3.4px → 1.2~2.2px로 줄이고
      //   개수를 44 → 120으로 올린다. 카드(60px)에서는 밉맵이 이걸 헤이즈로 녹여 주고,
      //   쇼케이스 전체화면에서 비로소 입자로 읽힌다 — 두 크기에서 다른 답이 나오는 게 맞다.
      //   곰팡이 상한은 그대로 게이트가 지킨다(포화 적색 위 금지 + 64² 흰 점 ≤3개).
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 120; i++) {
        const a = rng() * Math.PI * 2;
        const rr = Math.sqrt(0.22 + rng() * 0.78); // 바깥쪽에 몰리게(림에 뿌린다)
        const px = cx + Math.cos(a) * rr * R * 0.94;
        const py = cy + Math.sin(a) * rr * R * 0.94;
        ctx.beginPath();
        ctx.arc(px, py, 1.2 + rng() * 1.0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // ── 램프 존 ──────────────────────────────────────────────────────────────
    // 옆벽: 밑면(t=0) 그늘 → 크럼 본색 → **위쪽 테두리에 구운 갈색 띠**(t≥0.82).
    // ★레퍼런스 콜라주 대조에서 가장 큰 차이가 이거였다. 팬케이크가 팬케이크로 읽히는 건
    //   구운 윗면과 크림색 옆벽의 2톤 때문인데, 그 경계에 실제로는 **띠**가 있다 — 반죽이 팬에
    //   닿아 익은 자리다. 이게 없으면 원반이 창백한 스펀지로 보인다.
    //   v5 body: "meeting the browned top in a soft blurred edge rather than a hard line" — 그래서
    //   경계는 부드럽게 물린다(0.82에서 시작해 1.0에서 TOP_RIM에 닿음).
    // ★띠는 **넓어야** 보인다. 처음엔 t 0.82~1.0만 갈색으로 뒀는데, 옆벽에서 실제로 보이는 구간은
    //   적도(t≈0.58) 언저리라 맨 위 링 하나만 물들어 화면에서 사라졌다. 0.62부터 물들인다.
    //   벽의 구운 자리는 윗면 림보다 한 톤 진하다 — 팬에 닿은 면이라.
    paintRampBand(ctx, 'crumb', [
      [0, scaleHex(CRUMB, 0.86)],
      [0.42, CRUMB],
      [0.62, mixHex(CRUMB, WALL_TOAST, 0.3)],
      [0.85, mixHex(CRUMB, WALL_TOAST, 0.78)],
      [1, WALL_TOAST],
    ]);
    // 크림: 주름 골(t=0)은 살짝 그늘, 능선(t=1)은 밝고 설탕이 앉는다.
    paintRampBand(ctx, 'cream', [
      [0, scaleHex(CREAM, 0.87)],
      [0.6, CREAM],
      [1, CREAM],
    ]);
    // 딸기 껍질: 아래로 향한 면(t=0)은 과육 본색, 위로 향한 면(t=1)에 설탕이 앉는다.
    // ★알갱이(3층)는 여기 안 뿌린다 — 포화 적색 위 흰 점이 곰팡이로 읽힌 실측 때문. 헤이즈만.
    paintRampBand(ctx, 'berry', [
      [0, scaleHex(BERRY_RENDER, 0.82)],
      [0.5, BERRY_RENDER],
      [1, SUGAR ? scaleHex(BERRY_RENDER, 1.16) : BERRY_RENDER],
    ]);
    // 절단면: 중심 연분홍 심(t=0) → 가장자리 과육(t=1).
    paintRampBand(ctx, 'heart', [
      [0, BERRY_HEART],
      [0.42, BERRY_FLESH],
      [1, BERRY_RENDER],
    ]);
    // 소스: 몸통(t=0)은 진하고, 드립 능선(t=1)에 밝은 립. 광택은 재질로 못 내니 그려 넣는다
    // (런타임이 Lambert로 바꿔 specular가 죽는다, types.ts §2).
    paintRampBand(ctx, 'sauce', [
      [0, scaleHex(SAUCE_RENDER, 0.78)],
      [0.6, SAUCE_RENDER],
      [1, scaleHex(SAUCE_RENDER, 1.45)],
    ]);
    // 꽃받침: 잎 밑동(t=0) 진하고 끝(t=1) 밝게.
    paintRampBand(ctx, 'calyx', [
      [0, scaleHex(CALYX, 0.8)],
      [1, scaleHex(CALYX, 1.25)],
    ]);
    // 씨: 단색.
    paintRampBand(ctx, 'seed', [
      [0, SEED],
      [1, SEED],
    ]);

    // ── 포스터라이즈 ─────────────────────────────────────────────────────────
    // 256² 아틀라스가 GLB의 43%(63.7KB)를 먹었다. 원인은 픽셀이 거의 다 유일해서 PNG가 못 눌리는 것
    // — 방사 그라디언트 + 부드러운 얼룩 + 알파 알갱이가 겹치면 런이 안 생긴다.
    // 채널을 STEP 단위로 계단화하면 같은 값이 뭉쳐 런이 길어진다. 카드(60px)에서도, 쇼케이스
    // 전체화면에서도 밴딩은 안 보인다 — 원래 음식 아이콘 룩이 단순화된 면이라 그렇다.
    // ⚠ 이걸 지우면 파일이 다시 60KB대로 돌아간다.
    const STEP = 9;
    const img = ctx.getImageData(0, 0, ATLAS_PX, ATLAS_PX);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.round(d[i] / STEP) * STEP);
      d[i + 1] = Math.min(255, Math.round(d[i + 1] / STEP) * STEP);
      d[i + 2] = Math.min(255, Math.round(d[i + 2] / STEP) * STEP);
    }
    ctx.putImageData(img, 0, 0);
  });
}

// ---------------------------------------------------------------------------
// 토핑 지오메트리
// ---------------------------------------------------------------------------

function pushTri(out: number[], a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, c: THREE.Vector3Tuple): void {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

/** 프로필 위 한 지점의 반지름·높이·법선(자오선 평면 안에서). */
function sampleBerryProfile(hFrac: number): { r: number; y: number; nr: number; ny: number } {
  let i = 0;
  while (i < BERRY_PROFILE.length - 2 && BERRY_PROFILE[i + 1][1] < hFrac) i++;
  const [r0, h0] = BERRY_PROFILE[i];
  const [r1, h1] = BERRY_PROFILE[i + 1];
  const t = (hFrac - h0) / Math.max(h1 - h0, 1e-6);
  const dr = r1 - r0;
  const dy = (h1 - h0) * BERRY_H_OVER_W;
  const len = Math.hypot(dr, dy) || 1e-6;
  return { r: r0 + dr * t, y: hFrac * BERRY_H_OVER_W, nr: dy / len, ny: -dr / len };
}

/**
 * 씨 — 표면에 붙인 작은 납작 마름모.
 * ★와인딩: +N(바깥)에서 보아 CCW. 재료 빌더 v7까지 CW라 FrontSide 컬링이 씨를 통째로 삼켰다.
 * ★텍스처로 칠하지 않는다 — 몸통 쿼드를 씨색으로 칠하면 체커보드가 된다(재료 빌더 v6).
 */
function pushSeed(out: number[], theta: number, hFrac: number, scale: number): void {
  const s = sampleBerryProfile(hFrac);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const n: THREE.Vector3Tuple = [ct * s.nr, s.ny, st * s.nr];
  const hit: THREE.Vector3Tuple = [
    (ct * s.r + n[0] * SEED_LIFT) * scale,
    (s.y + n[1] * SEED_LIFT) * scale,
    (st * s.r + n[2] * SEED_LIFT) * scale,
  ];
  // 접선(자오선 방향)과 종법선(둘레 방향)
  const tan: THREE.Vector3Tuple = [-ct * s.ny, s.nr, -st * s.ny];
  const bi: THREE.Vector3Tuple = [-st, 0, ct];
  const L = SEED_HALF_LEN * scale;
  const W = SEED_HALF_WIDTH * scale;
  const corner = (tu: number, bu: number): THREE.Vector3Tuple => [
    hit[0] + tan[0] * tu + bi[0] * bu,
    hit[1] + tan[1] * tu + bi[1] * bu,
    hit[2] + tan[2] * tu + bi[2] * bu,
  ];
  const top = corner(L, 0);
  const right = corner(0, W);
  const bot = corner(-L, 0);
  const left = corner(0, -W);
  pushTri(out, top, right, bot);
  pushTri(out, top, bot, left);
}

interface BerryParts {
  body: THREE.BufferGeometry;
  seeds: THREE.BufferGeometry;
}

/** 통딸기 몸통 + 씨. scale = 지름(빵 반지름 1.0 기준). */
function buildWholeBerry(scale: number, segments: number, seedRows: number): BerryParts {
  const { geometry } = buildRevolvedShell(BERRY_PROFILE, segments, BERRY_H_OVER_W * scale, () => [scale, scale]);
  geometry.computeVertexNormals();
  orientToward(geometry, (c) => new THREE.Vector3(c.x, 0, c.z));
  const wholeNrm = geometry.attributes.normal as THREE.BufferAttribute;
  // t = 위로 향한 정도. 설탕은 위에 앉는다(색이 형상을 따라간다).
  setRampUv(geometry, RAMP.berry, (i) => Math.max(0, Math.min(1, 0.5 + 0.5 * wholeNrm.getY(i))));

  const positions: number[] = [];
  for (let row = 0; row < seedRows; row++) {
    const hFrac = SEED_H_RANGE[0] + ((row + 0.5) / seedRows) * (SEED_H_RANGE[1] - SEED_H_RANGE[0]);
    const s = sampleBerryProfile(hFrac);
    const count = Math.max(4, Math.min(7, Math.round((2 * Math.PI * s.r * scale) / (0.2 * scale))));
    const phase = (row % 2) * (Math.PI / count);
    for (let k = 0; k < count; k++) pushSeed(positions, phase + (k / count) * Math.PI * 2, hFrac, scale);
  }
  const seeds = new THREE.BufferGeometry();
  seeds.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  seeds.computeVertexNormals();
  setConstantUv(seeds, rampUv(RAMP.seed, 0.5));
  return { body: geometry, seeds: ensureIndexed(seeds) };
}

/**
 * 반쪽 딸기 — 자오선을 따라 반만 돌린 셸 + 평평한 절단면.
 * 절단면이 카드에서 딸기를 딸기로 만드는 유일한 신호라(붉은 덩어리에 연분홍 심), 램프로
 * 심→과육 그라디언트를 준다.
 */
function buildHalfBerry(scale: number, columns: number): { body: THREE.BufferGeometry; face: THREE.BufferGeometry } {
  const rings = BERRY_PROFILE;
  const positions: number[] = [];
  const index: number[] = [];
  const ringStart: number[] = [];
  const H = BERRY_H_OVER_W * scale;
  for (const [rFrac, hFrac] of rings) {
    ringStart.push(positions.length / 3);
    if (rFrac <= 1e-6) {
      positions.push(0, hFrac * H, 0);
      continue;
    }
    for (let c = 0; c <= columns; c++) {
      // ★정확히 반(π)만 돌리면 옆에서 볼 때 종잇장처럼 얇아진다(육안 검수 실측, azimuth 90/270).
      //   실제 반으로 자른 딸기도 칼이 축을 정확히 지나지는 않는다 — 조금 넘겨 돌려 두께를 만든다.
      const a = HALF_SPAN * (c / columns - 0.5) + Math.PI / 2;
      positions.push(Math.cos(a) * rFrac * scale, hFrac * H, Math.sin(a) * rFrac * scale);
    }
  }
  for (let ri = 0; ri < rings.length - 1; ri++) {
    const a0 = ringStart[ri];
    const b0 = ringStart[ri + 1];
    const aPole = rings[ri][0] <= 1e-6;
    const bPole = rings[ri + 1][0] <= 1e-6;
    for (let c = 0; c < columns; c++) {
      if (aPole) index.push(a0, b0 + c, b0 + c + 1);
      else if (bPole) index.push(a0 + c + 1, a0 + c, b0);
      else {
        index.push(a0 + c, b0 + c + 1, a0 + c + 1);
        index.push(a0 + c, b0 + c, b0 + c + 1);
      }
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  body.setIndex(index);
  body.computeVertexNormals();
  const bodyNrm = body.attributes.normal as THREE.BufferAttribute;
  setRampUv(body, RAMP.berry, (i) => Math.max(0, Math.min(1, 0.5 + 0.5 * bodyNrm.getY(i))));

  // 절단면 — 자오선 단면 폴리곤. 평면이라 법선은 ±z.
  //
  // ★가로로 **열을 나눠서** 짠다. 처음엔 ±r 두 체인만으로 스트립을 만들었는데, 그러면 축(x=0)에
  //   정점이 없어서 램프 t(=|x|/scale)가 어느 정점에서도 0이 안 된다 — 즉 "연분홍 심"이 그려질
  //   자리가 아예 없고 절단면이 통째로 과육색으로 칠해진다(실측: 위에서 봐도 심이 0.3%뿐이었다).
  //   심은 이 빵에서 딸기를 딸기로 만드는 신호라 정점을 대는 값이 있다(면당 +18tri).
  // ★격자를 **인덱스로** 짠다. 삼각형 수프로 뱉으면 정점이 3배가 되는데, 절단면만으로
  //   반쪽당 216정점(전체의 20%)을 먹었다 — 계열 20종이 고정 2560KB를 나눠 쓰므로 그건 못 낸다.
  const FACE_COLUMNS = 4; // x = −r … 0 … +r 을 4구간으로 (열 5개)
  const facePos: number[] = [];
  const faceIdx: number[] = [];
  // 셸이 π보다 넓게 도므로 절단면도 그만큼 안쪽으로 들어온다(=실제 칼자국 폭).
  const faceHalfWidth = Math.cos((HALF_SPAN - Math.PI) / 2);
  const colX = (r: number, c: number): number =>
    (-1 + (2 * c) / FACE_COLUMNS) * r * scale * faceHalfWidth;
  for (const [r, h] of rings) {
    for (let c = 0; c <= FACE_COLUMNS; c++) facePos.push(colX(r, c), h * H, 0);
  }
  const faceCols = FACE_COLUMNS + 1;
  for (let ri = 0; ri < rings.length - 1; ri++) {
    const r0 = rings[ri][0];
    const r1 = rings[ri + 1][0];
    for (let c = 0; c < FACE_COLUMNS; c++) {
      const a0 = ri * faceCols + c;
      const a1 = a0 + 1;
      const b0 = (ri + 1) * faceCols + c;
      const b1 = b0 + 1;
      // −z를 보게 감는다(셸이 +z 반구라 절단면은 반대쪽을 향한다).
      // 극점 링(r=0)에서는 한쪽 삼각형이 퇴화하므로 건너뛴다.
      if (r0 > 1e-6) faceIdx.push(a1, a0, b0);
      if (r1 > 1e-6) faceIdx.push(a1, b0, b1);
    }
  }
  const face = new THREE.BufferGeometry();
  face.setAttribute('position', new THREE.Float32BufferAttribute(facePos, 3));
  face.setIndex(faceIdx);
  face.computeVertexNormals();
  const facePosAttr = face.attributes.position as THREE.BufferAttribute;
  const half = Math.max(scale, 1e-6);
  setRampUv(face, RAMP.heart, (i) => Math.min(1, Math.abs(facePosAttr.getX(i)) / half));
  // ★열린 조각은 만들 때 방향을 선언한다 — 셸은 +z(볼록한 쪽), 절단면은 −z.
  //   안 하면 FrontSide 컬링으로 통째로 사라지는데 tri·KB·판독 게이트가 전부 통과한다(실측).
  orientToward(body, new THREE.Vector3(0, 0, 1));
  orientToward(face, new THREE.Vector3(0, 0, -1));
  return { body, face: ensureIndexed(face) };
}

/**
 * 꽃받침 — 재료 빌더 v8 별 모양 전사. 안쪽은 막힌 원판, 잎은 그 바깥에만.
 * ★앞면과 **뒤집힌 뒷면**을 함께 굽는다 — 런타임이 `material.side`를 승계하지 않아
 * 한 면만 구우면 각도에 따라 사라진다.
 */
function buildCalyx(scale: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const capR = CALYX_CAP_R * scale;
  const tipR = CALYX_TIP_R * scale;
  const droop = (r: number): number => {
    const t = Math.max(0, (r - capR) / Math.max(tipR - capR, 1e-6));
    return -Math.sin(CALYX_PITCH) * t * (tipR - capR);
  };
  const at = (r: number, a: number, y: number): THREE.Vector3Tuple => [r * Math.sin(a), y, r * Math.cos(a)];
  const down = (p: THREE.Vector3Tuple): THREE.Vector3Tuple => [p[0], p[1] - CALYX_BACK_OFFSET * scale, p[2]];
  const emit = (a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, c: THREE.Vector3Tuple): void => {
    pushTri(positions, a, b, c);
    pushTri(positions, down(a), down(c), down(b));
  };
  const origin: THREE.Vector3Tuple = [0, 0, 0];
  const capSegs = 8;
  for (let i = 0; i < capSegs; i++) {
    emit(origin, at(capR, (i * 2 * Math.PI) / capSegs, 0), at(capR, ((i + 1) * 2 * Math.PI) / capSegs, 0));
  }
  const halfAngle = Math.PI / CALYX_LEAVES;
  for (let i = 0; i < CALYX_LEAVES; i++) {
    const am = (i * 2 * Math.PI) / CALYX_LEAVES;
    const midR = (capR + tipR) * 0.55;
    const cL = at(capR, am - halfAngle, 0);
    const cR = at(capR, am + halfAngle, 0);
    const cM = at(capR, am, 0);
    const ridge = at(midR, am, droop(midR) + 0.012 * scale);
    const tip = at(tipR, am, droop(tipR));
    emit(cL, cM, ridge);
    emit(cM, cR, ridge);
    emit(cL, ridge, tip);
    emit(ridge, cR, tip);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const p = geo.attributes.position as THREE.BufferAttribute;
  setRampUv(geo, RAMP.calyx, (i) => Math.min(1, Math.hypot(p.getX(i), p.getZ(i)) / Math.max(tipR, 1e-6)));
  return ensureIndexed(geo);
}

/**
 * 크림 돌롭 — 숟가락으로 떨군 모양("dropped from a spoon, not piped"): 로브가 부드럽고
 * 아래가 치마처럼 퍼진다. 회전 셸에 각도 변조를 걸어 낸다.
 */
function buildCream(radius: number, height: number, segments: number, lobes: number): THREE.BufferGeometry {
  const profile: readonly ProfilePoint[] = [
    [1.0, 0.0],
    [0.98, 0.16],
    [0.86, 0.36],
    [0.68, 0.56],
    [0.46, 0.74],
    [0.26, 0.88],
    [0.0, 1.0],
  ];
  const { geometry } = buildRevolvedShell(profile, segments, height, (hFrac) => {
    // 아래쪽 로브가 깊고 위로 갈수록 사라진다 — 주름이 치마에만 있다.
    const depth = 0.1 * (1 - hFrac) * (1 - hFrac);
    return [radius * (1 + depth), radius * (1 + depth)];
  });
  // 각도 로브를 정점에 직접 건다(radialScale은 링 단위라 방위각을 못 본다).
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const a = Math.atan2(z, x);
    const hFrac = pos.getY(i) / Math.max(height, 1e-6);
    // 로브를 키운다 — 2번째 렌더에서 크림이 매끈한 달걀로 읽혔다. 숟가락으로 떨군 크림은
    // 치마에 주름이 있어야 크림으로 읽힌다.
    const wave = 1 + 0.13 * Math.cos(lobes * a) * (1 - hFrac) * (1 - hFrac);
    pos.setX(i, (x / r) * r * wave);
    pos.setZ(i, (z / r) * r * wave);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  const nrm = geometry.attributes.normal as THREE.BufferAttribute;
  setRampUv(geometry, RAMP.cream, (i) => {
    // 위로 향한 면은 밝고(설탕이 앉고) 주름 골은 그늘 — 색이 형상을 따라간다.
    return Math.max(0, Math.min(1, 0.45 + 0.55 * nrm.getY(i)));
  });
  return orientToward(geometry, new THREE.Vector3(0, 1, 0));
}

/**
 * 소스 — 윗면에 고인 불규칙 캡 + 앞으로 흐르는 드립.
 * ★잼은 텍스처가 아니라 지오메트리다(campagneStrawberryJam 선례). 색만 칠하면 스티커로 읽힌다.
 * 반대로 지오메트리만 있고 색이 형상을 안 따라가면 "붙인 테이프"가 된다 — 그래서 램프 t를
 * 드립 능선(위로 향한 정도)에서 뽑아 하이라이트가 솟은 자리에 저절로 앉게 한다.
 */
function buildSaucePool(
  radius: number,
  heightAt: (rFrac: number) => number,
  topRadius: number,
  rng: () => number,
  segments: number,
): THREE.BufferGeometry {
  const rings = 5;
  const positions: number[] = [];
  const index: number[] = [];
  const wob: number[] = [];
  const phaseA = rng() * Math.PI * 2;
  const phaseB = rng() * Math.PI * 2;
  for (let s = 0; s < segments; s++) {
    const a = (s / segments) * Math.PI * 2;
    // ★진폭을 낮췄다. 0.22+0.13은 섹터 20에서 각진 톱니가 되어 액체가 아니라 찢어진 딱지로 읽혔다.
    wob.push(1 + 0.11 * Math.sin(3 * a + phaseA) + 0.06 * Math.sin(5 * a + phaseB));
  }
  for (let ri = 0; ri <= rings; ri++) {
    const t = ri / rings;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const rr = radius * t * wob[s];
      // ★윗면 돔을 **따라간다**. 평평하게 두면 돔이 웅덩이를 들락거려 조각조각 잘린 얼룩이 된다
      //   (육안 검수 실측: "액체가 아니라 찢어진 종이"). 두께는 가운데가 조금 두껍다.
      const y = heightAt(rr / Math.max(topRadius, 1e-6)) + 0.014 + 0.016 * (1 - t) * (1 - t);
      positions.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
    }
  }
  for (let ri = 0; ri < rings; ri++) {
    const a0 = ri * segments;
    const b0 = (ri + 1) * segments;
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      index.push(a0 + s, b0 + s1, a0 + s1);
      index.push(a0 + s, b0 + s, b0 + s1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  setRampUv(geo, RAMP.sauce, (i) => Math.max(0, Math.min(1, nrm.getY(i))));
  // 링을 안→밖으로 쌓아 원반 윗면과 감기 방향이 반대다. 방향을 못 박는다(첫 렌더에서 통째로 컬링됐다).
  return orientToward(geo, new THREE.Vector3(0, 1, 0));
}

/** 드립 한 줄 — 원반 옆벽을 타고 내려가며 가늘어지는 리본. 끝은 방울로 뭉친다. */
function buildDrip(
  angle: number,
  startY: number,
  length: number,
  width: number,
  radiusAt: (y: number) => number,
  steps: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const tx = -sa;
  const tz = ca;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    // 끝에서 부푸는 방울 — "rounding into a soft bead at its tip"
    // 끝 방울 — "rounding into a soft bead at its tip". 진폭이 작으면 그냥 뚝 끊긴 선으로 보인다.
    const bead = 1 + 1.15 * Math.exp(-Math.pow((t - 0.94) / 0.075, 2));
    const w = width * (1 - 0.4 * t) * bead;
    const y = startY - length * t;
    // ★반지름을 스택 실루엣에서 받아온다. 상수로 두면 적도에서 파묻히고 잘록한 데서 뜬다.
    //   단 **국소 최대**로 받는다 — 원반 사이 잘록한 자리에서 실루엣을 그대로 따라가면 리본이
    //   안으로 파고들었다가 아래에서 다시 나와 **방울이 떨어져 나온 것처럼** 보인다(육안 검수).
    //   실제 소스도 잘록한 데를 타고 흐르지 않고 가로질러 흐른다.
    const yStep = length / steps;
    const r = Math.max(radiusAt(y), radiusAt(y + yStep), radiusAt(y - yStep)) + 0.014;
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      positions.push(ca * r + tx * w * sgn, y, sa * r + tz * w * sgn);
    }
    // 바깥으로 살짝 띄운 능선 — 하이라이트가 앉을 자리(광택을 재질로 못 내니 형상으로 만든다)
    positions.push(ca * (r + 0.022), y, sa * (r + 0.022));
  }
  const stride = 3;
  for (let k = 0; k < steps; k++) {
    const a = k * stride;
    const b = (k + 1) * stride;
    // 좌 → 능선 → 우 두 폭
    index.push(a + 0, b + 0, a + 2);
    index.push(a + 2, b + 0, b + 2);
    index.push(a + 2, b + 2, a + 1);
    index.push(a + 1, b + 2, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  setRampUv(geo, RAMP.sauce, (i) => ((i % stride) === 2 ? 1 : 0.25));
  return orientToward(geo, new THREE.Vector3(ca, 0, sa));
}

// ---------------------------------------------------------------------------
// 조립
// ---------------------------------------------------------------------------

function place(g: THREE.BufferGeometry, pos: THREE.Vector3, rotX = 0, rotY = 0, rotZ = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4()
    .makeTranslation(pos.x, pos.y, pos.z)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')));
  return g.applyMatrix4(m);
}

export const createPancakeStrawberryFresh: BreadBuilder = (rng) => {
  const stack = buildPancakeStack(rng, {
    diskHeight: DISK_HEIGHT,
    stackStep: STACK_STEP,
    poreCounts: PORE_COUNTS,
    segments: SEGMENTS,
  });

  const material = stdMaterial({ map: paintAtlas(rng) });
  const group = new THREE.Group();
  for (const d of stack.disks) {
    group.add(new THREE.Mesh(d.side, material));
    group.add(new THREE.Mesh(d.top, material));
  }

  const topY = stack.topY;
  const cx = stack.topCenter.x;
  const cz = stack.topCenter.z;
  const front = FRONT_ANGLE;
  // 배치는 전부 **극좌표(방위각, 반지름비)**로 쓴다 — 카메라가 front 방향에 있으므로 방위각이
  // 곧 "카메라에서 앞이냐 뒤냐"다. xy로 쓰면 매번 다시 계산해야 하고 형제 변형이 못 베낀다.
  // v5 FINISHING: "toppings gather toward the front-left so the browned pancake surface stays
  // visible on the opposite side" — 그래서 front−1.8 ~ front+0.6 호 안에만 놓는다.
  const at = (az: number, rFrac: number, y: number): THREE.Vector3 =>
    new THREE.Vector3(cx + Math.cos(az) * rFrac * stack.topRadius, y, cz + Math.sin(az) * rFrac * stack.topRadius);

  // 크림 — 한 덩어리 흰 면으로 남아야 한다(조각으로 흩으면 64²에서 사라진다).
  // 카메라 쪽(front)에 두어 딸기가 뒤에서 기대게 한다. 첫 렌더는 딸기 뒤에 숨어 흰 면이 1.5%였다.
  // ★반경 주의: 3번째 렌더에서 0.44로 키웠더니 크림 발자국이 반쪽 딸기 자리를 삼켜
  //   절단면(연분홍 심)이 위에서 봐도 95% 가려졌다. 크림 반경 + 딸기 배치 반경은 항상
  //   두 중심 거리보다 작아야 한다.
  const cream = buildCream(0.33, 0.42, 20, 7);
  group.add(new THREE.Mesh(place(cream, at(front - 0.25, 0.2, topY - 0.01)), material));

  // 통딸기 1 — 세우지 않고 크림에 **기댄다**. 세우면 총높이가 폭을 넘어 리핏이 높이를 잡고,
  // 카드에서 팬케이크가 통째로 작아진다(breadlab __stats.refitAxis로 확인).
  const berryScale = 0.4;
  const whole = buildWholeBerry(berryScale, 12, 4);
  const wholePos = at(front - 1.0, 0.34, topY + 0.12);
  // ★기울기: 2번째 렌더에서 1.15rad(거의 눕힘) + 꼭지를 카메라로 보냈더니 꼭지 정면 조준이 되어
  //   토마토처럼 읽혔다. 옆모습이 보여야 딸기다 — 살짝만 기울이고 꼭지는 **뒤쪽**으로 보낸다.
  const wholeTilt = 0.5;
  // yaw 유도: Euler YXZ에서 로컬 +Y(꼭지)의 방위각은 (π/2 − yaw)다. 꼭지를 카메라 반대(front + π)로
  //   보내려면 yaw = π/2 − (front + π).
  // 꼭지를 정확히 뒤(front + π)로 보내면 꽃받침이 뒤통수로 넘어가 초록이 거의 안 잡힌다.
  // 뒤-왼쪽(front + 2.2)으로 살짝 돌려 왕관이 카메라 쪽으로 기울게 한다.
  const wholeYaw = Math.PI / 2 - (front + 2.2);
  group.add(new THREE.Mesh(place(whole.body, wholePos, wholeTilt, wholeYaw, 0), material));
  group.add(new THREE.Mesh(place(whole.seeds, wholePos, wholeTilt, wholeYaw, 0), material));
  const calyx = buildCalyx(berryScale);
  // 꽃받침은 몸통 꼭대기에 앉는다(로컬 y = 몸통 높이). 붉은 덩어리 위 초록은 64²에서 살아남는
  // 몇 안 되는 신호라 기울여서라도 보이게 둔다.
  calyx.translate(0, BERRY_H_OVER_W * berryScale * 0.98, 0);
  group.add(new THREE.Mesh(place(calyx, wholePos, wholeTilt, wholeYaw, 0), material));

  // 반쪽 3 — 절단면을 위로.
  const halfScale = 0.36;
  // ★기울기와 배치 방위각을 **분리한다**. 4번째 렌더에서 절단면이 완전히 수평이라
  //   3/4 카메라(고도 약 40°)에서 심하게 단축돼 연분홍 심이 2%밖에 안 잡혔다.
  //   절단면 법선은 Rx(π/2 + lean) 뒤 (0, cos lean, sin lean)이고, Ry(yaw)를 먹이면 그 기울기의
  //   방위각이 (π/2 − yaw)가 된다. 카메라 쪽으로 눕히려면 yaw = π/2 − front 근처여야 하는데,
  //   그건 배치 방위각과 다른 값이다 — 그래서 두 개를 따로 준다.
  // 개수는 **판독 게이트가 정한다**(CRIB 군집 실질 상한 3). 레퍼런스의 6~7조각은 64²에서 한
  // 덩어리로 융합하고, 2조각은 육안으로 성기다. 3조각으로 두되 사이에 반죽·크림이 보이도록 벌린다.
  const halves: { az: number; rr: number; lean: number; leanAz: number }[] = [
    { az: front + 0.62, rr: 0.62, lean: 0.48, leanAz: front - 0.15 },
    { az: front - 1.8, rr: 0.6, lean: 0.38, leanAz: front + 0.35 },
    { az: front - 0.7, rr: 0.66, lean: 0.55, leanAz: front + 0.05 },
  ];
  for (const h of halves) {
    const { body, face } = buildHalfBerry(halfScale, 10);
    // ★절단면이 위를 보려면 Rx(**+**π/2)다. 절단면 법선 −z에 Rx(θ)를 먹이면 (0, sinθ, −cosθ)이라
    //   sinθ = 1이어야 +y가 된다. 첫 렌더는 −π/2라 절단면이 바닥을 보고 돔이 위로 섰다(연분홍 심 0px).
    //   Rx(+π/2)면 로컬 +Y(길이축)가 월드 +Z가 되어 반쪽이 눕고, 돔은 아래로 부풀어 −0.34까지 내려간다.
    //   그래서 topY + 0.30에 놓아 살짝 눌린 채로 앉게 한다.
    const p = at(h.az, h.rr, topY + 0.3);
    const yaw = Math.PI / 2 - h.leanAz;
    group.add(new THREE.Mesh(place(body, p, Math.PI / 2 + h.lean, yaw, 0), material));
    group.add(new THREE.Mesh(place(face, p, Math.PI / 2 + h.lean, yaw, 0), material));
  }

  // 소스 — 윗면 고임 + 앞으로 드립 2줄.
  // 웅덩이 반지름은 0.56 → 0.68 → 0.58로 두 번 움직였다. 작으면 뭉친 얼룩으로, 크면 윗면을 다 덮어
  // 토핑이 소스에 파묻힌 것으로 읽힌다(둘 다 육안 검수 판정). 구운 윗면이 소스 둘레로 보여야 한다.
  const poolLocalHeight = (rFrac: number): number => stack.topFaceHeightAt(rFrac) - topY;
  group.add(
    new THREE.Mesh(
      // ★섹터를 반죽에서 물려받지 않는다. 22각형이면 웅덩이 테두리에 직선 구간이 보여
      //   액체로 안 읽힌다(육안 검수). 웅덩이는 링이 얇아 섹터를 올려도 정점 비용이 작다.
      place(buildSaucePool(0.58, poolLocalHeight, stack.topRadius, rng, 34), new THREE.Vector3(cx, topY, cz)),
      material,
    ),
  );
  // 드립은 길이를 다르게 — v5 SAUCE "three uneven drips of different lengths and widths".
  // 반지름은 스택 실루엣의 국소 최대를 따라간다(위 buildDrip 주석). 카메라 쪽 호에 둬야 보인다.
  const radiusAt = stack.silhouetteRadiusAt;
  // ★출발 높이는 크라운이 아니라 **테두리**다. 크라운(topY)에서 시작하면 그 높이의 실루엣 반지름이
  //   작아 드립이 원반 안에서 출발했다가 아래에서야 튀어나와, 웅덩이와 끊긴 갈고리로 보였다
  //   (육안 검수 실측). 테두리 높이 = 윗면 rFrac 1.0 지점.
  const dripStartY = stack.topFaceHeightAt(1) + 0.01;
  // 길이: 레퍼런스 실물은 맨 아래 원반까지 흐른다. 2단째에서 끊기면 흐르다 만 것으로 보인다(육안 검수).
  group.add(new THREE.Mesh(buildDrip(front + 0.12, dripStartY, 0.96, 0.08, radiusAt, 18), material));
  group.add(new THREE.Mesh(buildDrip(front - 0.62, dripStartY, 0.5, 0.058, radiusAt, 11), material));

  return mergeByMaterial(group);
};
