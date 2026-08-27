// 호두 — 단일 회전체 셸(반쪽 알맹이, 두 엽 + 중앙 골). 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/walnut.json(워크스페이스 원본은
// assets/ingredients/work/walnut/). 프로필·오프셋·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
// ⚠ v3(2026-08-26) 개편은 **레포 코드만** 고쳤다 — 스펙 파일은 이 작업의 쓰기 범위 밖
// (배정이 scripts/ingredients/<id>.ts로 한정)이라 "스펙 먼저"를 못 지켰다. 지금은 이 파일이
// 실측 정본이다. 다음에 스펙을 만지는 사람이 여기서 역전사할 것.
//
// R1(types.ts) 단일체 정본 순서: 한 덩어리 indexed 타원 셸(lib.buildRevolvedShell, 반경만 타원)
// -> 돔 링에 cos(2*theta) Y변조로 두 엽+골 접기 -> 지터(v4.2부터 링별 진폭 jitterTapered)
// -> facet -> 밑단 팬+첫 밴드들을 림 버킷으로 분리(sliceTriangles). 호두는 방사대칭이 아니라
// 골 축(로컬 Z) 기준 양측대칭 -- 올리브/밤의 (ring,sector) 마스크나 buildRevolvedShell 단독으로는
// 못 낸다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { buildRevolvedShell, facet, mergeByMaterial, sliceTriangles, stdMaterial, uvDome } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/walnut.json geometry.surface 손 전사 (JSON import 금지, types.ts §7).
// "#9A6E42"(원문: 골 안쪽)은 골 색이 아니라 **림(밑단/평평한 테두리) 색으로 재배치**했다 -- 골은
// 오목한 지오메트리라 런타임 키라이트의 N·L 감쇠가 이미 어둡게 만든다(두 번 어둡게 칠하면 과함,
// 올리브의 shaded-underside 패턴과 동일). "#E0C79A"(솟은 능선의 하이라이트)는 볼록한 엽 꼭대기가
// 키라이트를 자연히 더 밝게 받으므로 버킷을 만들지 않는다.
const KERNEL_COLOR = 0xc89b6a; // "a warm tan kernel"
const RIM_COLOR = 0x9a6e42; // 원문 "deeper amber ... folds and grooves" -> 림으로 재배치 (스펙 risk 참조)

// 실측 비율 (assets/ingredients/src/walnut.png 3/4 · walnut-2.png 정면 · walnut-3.png 탑다운).
//
// ★v3 (2026-08-26, 전체화면 쇼케이스 판독 수리 — identity 배치). 되돌리지 마라.
// 판정: az 0/180은 호두 반쪽으로 잘 읽히는데 az 45/90/135/270에서는 골과 두 엽이 전부 사라져
// **무늬 없는 매끈한 갈색 무더기**가 됐다. 각도에 따라 정체가 갈렸다.
// 근본 원인: 정체성 신호가 **축 1개짜리** cos(2*theta) 골 하나뿐이었다. 그 축을 옆에서 보면
// 신호가 0이 되므로, 각도로 정체가 갈리는 건 우연이 아니라 구조적으로 보장된 결과다.
// 해법: 골은 그대로 두고, **방위 주기가 4/6/10인 주름 필드**를 돔 전체에 얹는다 — 호두 알맹이의
// 뇌주름은 실제로 전 방위에 있고, 정수 주기라 s=0 이음매에서 연속이다(seam 실금 없음).
// 어느 azimuth에서도 최소 두 개의 주름 마루가 실루엣과 명암에 걸린다.
// 함께: 세그먼트 18 -> 40(예산이 2500 -> 8000tri로 올라 각지게 아낄 이유가 없어졌다),
// 돔 링 4개 -> 9개(주름을 담을 해상도. v4.1에서 극점 바로 아래 링을 하나 더해 10개).
//
// ★남은 결함(정직하게 기록): 크라운 극점의 **꼬집힌 자국**. 40장 팬이 안장(saddle) 중심에서
// 만나는 구조라 팬 웨지가 부채꼴로 보인다. v4.1(극점 팬 축소)·v4.2(주름 크라운 감쇠 + 링별
// 지터)로 상당히 줄었지만 없애려면 크라운의 Y 변조를 0으로 눕혀야 하고, 그러면 실루엣 노치가
// 0.066 -> 0.026으로 줄어 az 90/270의 "두 엽" 단서가 죽는다. **정체성을 지키는 쪽을 택했다.**
const SEGMENTS = 40;
const RADIUS_X = 0.44; // 짧은 축 (엽 분리 방향)
const RADIUS_Z = 0.6; // 긴 축 (골 방향), 비율 ~1.36:1 (walnut-3.png 탑다운 실측)
// ★a5에서 재실측(walnut-2.png 정면도): 알맹이 높이가 긴 축 폭의 **0.45배**다. 0.62는 너무 높아
// 옆에서 보면 봉긋한 무더기가 됐다.
// v4: 0.56 → 0.46. 아래 v4 주석 참조 — 선반을 없애도 몸통이 높으면 옆에서 원뿔로 남는다.
// 실측 총높이 ≈0.54, 긴 축 폭 ≈1.10 → 0.49로 위 "0.45배"에 근접한다(0.56일 때는 0.59였다).
const HEIGHT_SCALE = 0.46;

// (반지름비, 높이비) — heightFrac 0(바닥) .. 0.91(크라운 극점).
// ⚠ 앞 4점(극점·밑단 테두리·아래벽·림 경계)의 **개수**는 건드리지 마라 — rimTriangles 슬라이스
// 공식이 "맨 앞 RIM_TRANSITIONS개 전이"라는 전제 위에 서 있다(값은 바꿔도 된다).
type ProfilePoint = readonly [number, number];
//
// ═══ v4 (2026-08-26 재감사 — "90/270에서 챙 넓은 모자") ═══════════════════════════════════
// ★a5의 **림 선반(flange)을 철회한다.** 선반은 "모든 azimuth에서 보이는 형태 단서"를 노렸지만
// 그 단서가 호두가 아니라 **모자챙**이었다. 원인은 기하학적으로 명확하다:
//   · 선반이 rFrac 1.0으로 **최대 반지름**인데 높이가 0(맨 바닥)이다.
//   · 그 위 돔은 rFrac 0.86에서 시작해 계속 좁아진다(로브 변조 최대 반지름 0.847 < 0.86).
//   ⇒ 실루엣이 "바닥의 넓적한 테 + 그 위에 얹힌 좁은 원뿔" = 챙 넓은 모자로 **반드시** 읽힌다.
//     az 0/180이 멀쩡했던 건 골 노치가 크라운을 갈라 모자로 안 보였을 뿐이고,
//     골이 숨는 az 45/90/135/225/270에서는 구조가 그대로 드러났다.
// 해법: **최대 반지름을 몸통 중턱으로 올린다.** 밑단을 0.76으로 좁히고 벽을 바깥위로 flare시켜
// 로브 마루(변조 후 rFrac ≈1.02, h≈0.53)가 전체 최대가 되게 했다 — 실측 오버행 0.095rFrac.
// 그러면 실루엣은 "밑이 좁고 중턱이 부풀어 위로 둥근" 호두 반쪽 옆모습이 된다(레퍼런스
// walnut-2.png의 옆모습이 정확히 이것 — 평평한 밑면 + 볼록한 옆구리).
// 림 버킷은 남기되 **튀어나오지 않는 밑동 띠**(h 0~0.18, 전체 높이의 15%)로 돌렸다 —
// 접지 그늘로 읽혀 오브젝트를 바닥에 앉히는 일만 한다.
// ⚠ 되돌리지 마라: 프로필 index 1~3의 rFrac을 1.0으로 올리면 챙이 그대로 돌아온다.
const PROFILE: readonly ProfilePoint[] = [
  [0.0, 0.0], // 바닥 중심 극점
  [0.76, 0.0], // 밑단 테두리 — 평평한 디스크 경계(몸통 최대보다 **좁게**)
  [0.86, 0.08], // 아래 벽 — 바깥위로 flare
  [0.92, 0.18], // 림 버킷 경계 (RIM_TRANSITIONS)
  [0.9, 0.3],
  [0.86, 0.42],
  [0.79, 0.53],
  [0.7, 0.63],
  [0.58, 0.72],
  [0.44, 0.8],
  [0.3, 0.86],
  [0.14, 0.9], // v4.1 신설 — 극점 팬을 작게 만드는 링(아래 주석)
  [0.0, 0.915], // 크라운 극점 — 로브 정점(0.487)보다 낮게: 0.915*0.46 = 0.421
];
const RIM_TRANSITIONS = 3; // pole fan + 밑동 띠 2밴드 = 림 버킷
const DOME_FIRST_RING = 4; // 이 링부터 돔 — 골·주름 변조 대상(밑동 띠는 평평하게 유지)

// 두 엽 + 골 접기 — 돔 링에 지터 전 cos(2*theta) 변조를 Y와 반지름 둘 다에 건다.
// theta=0/180도(세계 +-X, 짧은 축)에서 엽이 위로+바깥으로 부풀고, theta=90/270도(세계 +-Z, 긴
// 축)에서 골이 아래로+안으로 파인다 -- 두 골 자오선이 모든 rFrac에서 x=0을 그려 긴 축 전체를
// 잇는 하나의 연속된 골이 된다.
// cmp-1 판정: Y만 변조(GROOVE_AMP=0.09)했더니 완만한 물결로만 보여 "두 엽+골"이라는 정체성이
// 안 읽혔다 -- 반지름도 함께 변조해 엽이 옆으로도 부풀게 하고 진폭을 크게 올렸다.
// cmp-2 판정: 림에 가까운 링의 weight가 낮아 골이 위쪽 노치로만 보였다 -- 아래쪽 weight를 올렸다.
// v3: 링 인덱스 배열을 hFrac 함수로 바꿨다 — 프로필 링 수가 바뀔 때마다 인덱스 표를 손으로
// 다시 맞추면 조용히 어긋난다(그 표가 이번 각도 실패의 절반이었다).
const GROOVE_AMP = 0.16; // Y 변조 진폭
const GROOVE_RADIAL_AMP = 0.22; // 반지름 배율 변조 진폭 (1 +- 이 값 x weight x cos(2t))

// 뇌주름 필드 — 방위 주기 5/9의 합. 둘 다 정수라 theta=0에서 연속(seam 안전).
// hFrac을 위상에 섞어 주름이 자오선을 따라 사행(蛇行)하게 만든다(직선 세로줄이 되면 멜론이 된다).
// ★a1 실측 후 증폭 (되돌리지 마라): 0.055/0.032로는 az 90에서 **여전히 매끈한 무더기**였다.
// 하네스 앰비언트가 0.75로 높아 얕은 기복은 명암이 안 생기고(VISUAL: "shadow terminator에
// 기대지 말 것"), 페이셋 노이즈로만 보인다. 진폭을 2.5배 올려 **실루엣에 걸리게** 한다 —
// 반지름 ±0.14는 월드 ±0.062, 폭 1.2 대비 10%라 능선이 윤곽선을 물결치게 만든다.
// 주기도 6/10/4 -> 5/9로 줄여 능선을 넓고 굵게(호두 뇌주름은 가는 빗살이 아니라 굵은 접힘이다).
const WRINKLE_RADIAL_AMP = 0.16;
const WRINKLE_Y_AMP = 0.1;

const JITTER_AMP = 0.012; // v3에서 축소 — 40세그에선 0.016이 주름 마루를 지글거리게 만든다

/** 골·주름 가중치 — 림(h=0.12)에서 0, 돔 중간에서 1, 크라운 극점 근처에서 다시 완만히 감소.
 * 림 쪽 0은 골 바닥이 평평한 림 벽 아래로 접혀 들어가는 것을 막고, 크라운 쪽 감소는 극점 인근
 * 작은 반지름에서 변조가 상대적으로 폭발해 뾰족해지는 것을 막는다. */
function reliefWeight(hFrac: number): number {
  // v4: 램프 폭을 0.20~0.44 → 0.18~0.70으로 넓혔다. 두 가지를 동시에 산다.
  //   ① 골 자오선(θ=90°) 높이의 **단조성**. y = h·HEIGHT_SCALE − GROOVE_AMP·weight 이므로
  //      ramp가 가파르면 링 간 weight 증가분이 높이 증가분을 이겨 골이 아래로 접힌다
  //      (0.20~0.44 + HEIGHT_SCALE 0.46 조합에서 ring4→ring5가 −0.007로 실제 역전됐다).
  //      넓힌 뒤 실측 골 높이 0.116 → 0.122 → 0.124 → 0.138 → 0.198 로 단조.
  //   ② 밑동 띠 바로 위에서 로브가 급격히 부푸는 것(버섯 갓)을 막는다 — ring4 최대 반지름
  //      0.90·1.051 = 0.947 로 밑동(0.92) 바로 위에서 완만하게 넘어선다.
  const up = smoothstep(0.18, 0.7, hFrac);
  // v4.1: 감쇠 구간을 0.62~0.86 → 0.60~0.915(=크라운 극점 높이)로 늘리고 깊이를 0.45 → 0.55로.
  // r1 렌더의 유일한 남은 결함이 **크라운 극점의 별 주름**이었다: 40개 자오선의 주름·골 변조가
  // 한 정점으로 수렴하면서 구겨진 종이 꼭짓점이 됐다. 극점 바로 아래 링까지 변조를 살려두면
  // 팬 삼각형 40장이 전부 다른 방향으로 꺾인다. 감쇠를 극점까지 이어 그 수렴을 죽인다.
  // 실측: 마지막 링(h=0.90) weight 0.454 → 로브 정점 0.487 vs 크라운 0.421, 노치 0.066 유지.
  const down = 1 - 0.55 * smoothstep(0.6, 0.915, hFrac);
  return up * down;
}

/** 주름 전용 추가 감쇠 — 크라운(h 0.60~0.90)에서 0으로 죽인다.
 * ★v4.2: r2에서도 크라운에 **소용돌이 주름**이 남았다. 원인은 골(cos 2θ)이 아니라 주름 필드다:
 * 위상에 hFrac이 섞여 있어(사행 목적) 극점으로 갈수록 5·9주기 마루가 회전하면서 수렴한다 —
 * 반지름이 0으로 줄어드는 링에서 그 회전이 소용돌이로 보인다.
 * 크라운에서 주름만 끄면 남는 변조는 **매끈한 2주기 골뿐**이라 안장(saddle)으로 깔끔하게 닫힌다.
 * 실제 호두도 접힘은 옆구리에 몰려 있고 두 엽의 꼭대기는 매끈하다 — 레퍼런스와도 맞다. */
function wrinkleFalloff(hFrac: number): number {
  return 1 - smoothstep(0.6, 0.9, hFrac);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 뇌주름 값 [-1, 1] — 정수 방위 주기 2개의 합을 정규화한 뒤 **각지게 성형**한다.
 * ★a2 실측: 순수 사인파는 az 90/270에서 "부드러운 기복"으로만 보였다(그 각도에선 골이 로브 뒤로
 * 숨어 주름이 유일한 정체성 신호다 — 카메라가 로브 축을 정면으로 보기 때문이며 구조적이다).
 * |w|^0.6 성형으로 마루를 넓고 평평하게, 골을 좁고 깊게 만들어 호두 알맹이의 접힘에 가깝게 한다. */
function wrinkleField(theta: number, hFrac: number): number {
  const a = Math.cos(5 * theta + 3.0 * hFrac);
  const b = Math.cos(9 * theta - 4.6 * hFrac + 1.1);
  const w = (a + 0.5 * b) / 1.5;
  return Math.sign(w) * Math.pow(Math.abs(w), 0.6);
}

// 전체 요(yaw) — advisor 사전 리뷰: 골을 로컬 Z에 그대로 두면 정면 카메라에서 옆으로만 보인다.
// 레퍼런스(walnut.png)는 골이 프레임을 대각선으로 가로지른다. geometry.rotateY로 구워 GLB
// 자체가 방향을 가지게 한다(types.ts §6 "정면" 규칙).
// ⚠ v3에서도 손대지 않았다 — az 0/180이 지금 잘 읽히는 이유가 이 각도다.
const YAW_RADIANS = (-32 * Math.PI) / 180;

/**
 * 링별로 진폭을 조절하는 지터. lib.jitterVertices와 rng 소비 순서(정점당 3회)가 같다.
 * ★v4.2: 크라운의 **소용돌이/별 주름**의 진짜 원인이 여기였다. types.ts R2가 경고하는
 * "지터 진폭 > 극 근처 링의 컬럼 간격" 조건을 이 재료가 정확히 밟고 있었다:
 * 40세그먼트에서 rFrac 0.30 링의 컬럼 간격은 2π·(0.30·0.52)/40 ≈ 0.024인데 진폭이 0.012라
 * 이웃 정점끼리 자리를 넘나들 만큼 흔들렸다. 몸통에서는 같은 진폭이 페이셋 결로 잘 보인다 —
 * **한 값으로 통일할 수 없는 문제**라 링 반지름에 비례해 상한을 건다(간격의 35%).
 * 극점(반지름 0)은 팬 40장의 공유 꼭짓점이라 아예 제외한다(poppyseed의 jitterExceptPoles 선례).
 * rng는 극점에서도 소비해 시드 스트림을 단순하게 유지한다.
 */
function jitterTapered(geometry: THREE.BufferGeometry, ringStart: readonly number[], rng: () => number): void {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const ampByVertex = new Float64Array(pos.count);
  for (let ri = 0; ri < PROFILE.length; ri++) {
    const rFrac = PROFILE[ri][0];
    if (rFrac <= 1e-6) continue; // 극점 — amp 0으로 남긴다
    const meanRadius = rFrac * 0.5 * (RADIUS_X + RADIUS_Z);
    const columnSpacing = (2 * Math.PI * meanRadius) / SEGMENTS;
    const amp = Math.min(JITTER_AMP, 0.35 * columnSpacing);
    for (let s = 0; s < SEGMENTS; s++) ampByVertex[ringStart[ri] + s] = amp;
  }
  for (let i = 0; i < pos.count; i++) {
    const amp = ampByVertex[i];
    pos.setXYZ(
      i,
      pos.getX(i) + (rng() - 0.5) * 2 * amp,
      pos.getY(i) + (rng() - 0.5) * 2 * amp,
      pos.getZ(i) + (rng() - 0.5) * 2 * amp,
    );
  }
  pos.needsUpdate = true;
}

function buildWalnut(rng: () => number): { kernelGeo: THREE.BufferGeometry; rimGeo: THREE.BufferGeometry } {
  const { geometry, ringStart } = buildRevolvedShell(PROFILE, SEGMENTS, HEIGHT_SCALE, () => [RADIUS_X, RADIUS_Z]);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  // 두 엽 + 골 + 뇌주름 변조 — 지터/facet 전, 돔 링에만 적용(림 벽은 평평하게 유지).
  // 골(cos 2t)은 Y와 반지름(X/Z) 둘 다에 걸어 엽이 위+옆으로 부풀고 골이 아래+안으로 파이게 하고,
  // 주름 필드는 그 위에 방위 4/6/10 주기로 얹혀 **어느 azimuth에서도** 마루가 실루엣에 걸리게 한다
  // (v3의 핵심 — 헤더 주석 참조. 이 루프를 골 하나로 되돌리면 az 45/90/135/270이 다시 죽는다).
  for (let ri = DOME_FIRST_RING; ri < PROFILE.length; ri++) {
    const hFrac = PROFILE[ri][1];
    if (PROFILE[ri][0] <= 1e-6) continue; // 극점 링은 정점 1개 — 방위 변조 대상이 아니다
    const weight = reliefWeight(hFrac);
    if (weight <= 0) continue;
    const wrinkleWeight = weight * wrinkleFalloff(hFrac);
    const base = ringStart[ri];
    for (let s = 0; s < SEGMENTS; s++) {
      const t = (s / SEGMENTS) * Math.PI * 2;
      const c2t = Math.cos(2 * t);
      const wr = wrinkleField(t, hFrac);
      const idx = base + s;
      const radialScale = 1 + c2t * GROOVE_RADIAL_AMP * weight + wr * WRINKLE_RADIAL_AMP * wrinkleWeight;
      pos.setX(idx, pos.getX(idx) * radialScale);
      pos.setZ(idx, pos.getZ(idx) * radialScale);
      pos.setY(idx, pos.getY(idx) + c2t * GROOVE_AMP * weight + wr * WRINKLE_Y_AMP * wrinkleWeight);
    }
  }

  // 지터 — indexed 상태에서(공유 정점이 함께 움직여야 림/돔 경계가 안 찢어진다, types.ts §5).
  // 극 근처 링은 진폭을 줄인다(아래 함수 주석). 극점 자체는 지터하지 않는다.
  jitterTapered(geometry, ringStart, rng);

  // 전체 요 — geometry에 굽는다(월드 회전이 아니라 지오메트리 자체 방향으로, 결정론 유지).
  geometry.rotateY(YAW_RADIANS);

  // facet 전 원본 index로 림 트라이앵글 개수 계산 — buildRevolvedShell은 profile 순서 그대로
  // index를 이어붙이므로, 처음 RIM_TRANSITIONS개 전이(극점->밑단 fan, 밑단->림벽상단 band)가
  // 항상 맨 앞 트라이앵글들이다.
  const rimTriangles = SEGMENTS * (1 + 2 * (RIM_TRANSITIONS - 1));
  const baked = facet(geometry);

  const rimGeo = sliceTriangles(baked, 0, rimTriangles);
  const kernelGeo = sliceTriangles(baked, rimTriangles, baked.attributes.position.count / 3);
  uvDome(kernelGeo);
  uvDome(rimGeo);
  return { kernelGeo, rimGeo };
}

export const createWalnut: IngredientBuilder = (rng) => {
  const kernelMat = stdMaterial({ color: KERNEL_COLOR });
  const rimMat = stdMaterial({ color: RIM_COLOR });

  const { kernelGeo, rimGeo } = buildWalnut(rng);

  const group = new THREE.Group();
  group.add(new THREE.Mesh(kernelGeo, kernelMat));
  group.add(new THREE.Mesh(rimGeo, rimMat));

  // 공유 지면 y=0 — 지터가 바닥 정점을 살짝 밀어낼 수 있어 최종 bbox로 스냅한다(types.ts R1).
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y -= box.min.y;
  group.updateMatrixWorld(true);

  return mergeByMaterial(group);
};
