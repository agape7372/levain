// 레몬 — 슬라이스 2장, 같은 각도로 나란히 기대 서고 화면에서 겹친다. 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 assets/ingredients/specs/lemon.json(워크스페이스 원본은
// assets/ingredients/work/lemon/). 프로필·색은 그 스펙(author_spec.py)의 전사이며,
// 수치를 고칠 때는 스펙을 먼저 고치고 여기로 옮긴다.
//
// ★lemon↔banana가 이 배치의 혼동쌍(팀리드 지시) — 둘 다 얇은 원반(코인) 슬라이스라 형태 하나로는
// 안 갈린다. 두 가지 축으로 분리한다: (1) 배치 실루엣 — 레몬은 두 장이 60도로 "기대어" 서고
// (TILT), 바나나는 세 장이 "눕혀서" 겹친다(banana.ts 참조). (2) 속 무늬 —
// 레몬은 방사 웨지(막선 + 교대 명암) + 중심 심, 바나나는 씨점 링. 색도 이미 갈렸다(레몬 황록
// #C8D63E, 바나나 연노랑 #E8D46A) — 형태·무늬·색 셋 다 겹치지 않게 짰다.
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
//         NORMAL_GAP·sin(TILT) = 0.295만큼 민다. 두께합이 2×0.1=0.2이므로 평면이 평행인 한
//         **어떤 각도에서도 교차가 불가능하다**(튜닝이 아니라 구성으로 보장). 화면 겹침은 면내
//         가로 오프셋(LATERAL)이 만든다. 둘이 쌍둥이로 안 보이게 하는 건 각자의 롤(웨지 위상)과
//         지터 스트림 차이지, 평면 각도차가 아니다 — 각도를 다시 벌리면 관통이 돌아온다.
//
//   (2) 색. 옛 배치는 rotation.x=PI/2로 원반을 세워 과육면 법선이 거의 수평(0,0,1)이 됐고,
//       키라이트 (-2,6,2)와의 N·L이 0.31밖에 안 나왔다. 실측 결과 과육이 #957e17 — 레몬이
//       아니라 말린 라임/카키다(앱은 breadlab보다 앰비언트가 0.75→0.55로 더 낮아 더 어둡다).
//       → TILT를 PI/2에서 1.05rad로 눕혀 법선 수평성분이 기본 3/4 카메라 쪽을 보게 했다
//         (N·L 0.31 → 0.81, 2.6배). 그래도 az=180은 **원리적으로 앰비언트 전용**이다
//         (뒷면은 어느 기울기에서도 dot(-n,L)<0) — 그래서 팔레트도 scaleHex로 함께 올렸다.
//         기울기만 되돌리거나 색만 되돌리면 둘 중 한 각도가 다시 카키가 된다.
//
//   세그먼트는 16 → 40. 예산이 100KB/2500tri → 250KB/8000tri로 상향됐고(families.mjs),
//   재료도 빵과 **같은 쇼케이스에서 같은 크기로** 확대돼 보인다. 16각형 원반은 전체 화면에서
//   눈에 띄게 각졌다 — 폴리곤을 아낄 이유가 없다.
import * as THREE from 'three';
import type { IngredientBuilder } from './types';
import { bakeTexture, buildRevolvedShell, facet, jitterVertices, mergeByMaterial, scaleHex, sliceTriangles, stdMaterial, uvDome, uvTopPlanar } from '../breads/lib';

// 팔레트 — assets/prompts/ingredients/lemon.json geometry.surface[0] 손 전사 (JSON import 금지, types.ts §7).
const RIND_SRC = 0xc8d63e; // "a vivid yellow-green rind ring"
const PULP_SRC = 0xdccb33; // "a bright yellow pulp body"
const SHADE_SRC = 0xa89426; // "a deeper golden-yellow shading the lower shaded segments" — 웨지 교대 음영
const PITH_COLOR = 0xf5f0d6; // "thin ivory-white pith membranes" + 중심 심

// 렌더 노출 보정 — JSON hex를 그대로 쓰면 얇은 원반의 과육면이 (기울여도) 카키로 앉는다.
// 씬 조명은 고정값이라(키 1.4·앰비언트 0.75, 앱은 0.55) 여기서 올리는 수밖에 없다. types.ts §7의
// "JSON에 없는 색은 scaleHex 결정론 유도 + 출처 주석" 경로. 실측: 옛 과육 #957e17(az=0)·#746412(az=180)
// → 신규 #cdab20 / #887616. 배율을 되돌리면 az=180이 다시 카키가 된다.
// ⚠ 1.15가 천장이다 — 과육 R채널이 220이라 1.16부터 255에서 잘리고, 잘리면 노랑이 아니라
// 라임-화이트로 색상이 틀어진다. 더 올리고 싶으면 배율이 아니라 hex 자체를 다시 잡아야 한다.
const RIND_COLOR = scaleHex(RIND_SRC, 1.12);
const PULP_COLOR = scaleHex(PULP_SRC, 1.15);
const PULP_SHADE = scaleHex(SHADE_SRC, 1.15);

// 실측 비율 (assets/ingredients/src/lemon.png 3/4 · lemon-2.png 정면 · lemon-3.png 탑다운).
const LEMON_RADIUS = 0.62;
const LEMON_HALF_THICKNESS = 0.1; // 두께:지름 ~= 0.16:1, 얇은 코인 슬라이스
// v2: 16 → 40. 전체 화면 쇼케이스에서 16각형 원반 실루엣이 그대로 보였다. 480tri/장 × 2장 = 960tri,
// 상향된 예산(8000tri/250KB) 안에서 여유. 원둘레 한 변 ≈ 0.097 — 지터(±0.011)보다 훨씬 크다.
const LEMON_SEGMENTS = 40;

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

// v2: 0.014 → 0.011. 세그먼트를 40으로 올리면 한 변이 짧아져 같은 진폭이 상대적으로 커진다(R4).
// 겸사겸사 두 평면 사이 여유(0.095)를 갉아먹는 양도 줄인다 — 지터 최악치가 양쪽 표면에서 0.022.
const JITTER_AMP = 0.011;

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

// ── 배치 (v2) ──────────────────────────────────────────────────────────────────────────
// 두 슬라이스는 **평면 방향이 완전히 같다**. 방향은 Euler가 아니라 쿼터니언 합성으로 준다:
//   q = Ryaw(YAW) · Rtilt(TILT) · Rroll(roll)
// roll은 원반 자기 축(local Y) 회전이라 **평면을 바꾸지 않는다** — 웨지 무늬 위상만 돌린다.
// 그래서 roll을 아무리 달리 줘도 평행 보장이 안 깨진다. (Euler 'XYZ'로 같은 걸 하려면 축 순서를
// 매번 따져야 해서 실수하기 쉽다 — 옛 코드가 그러다 두 평면을 24도 벌려놓고 관통했다.)
const TILT = 1.05; // 원반 평면의 수평 대비 기울기(rad, 60.2도). PI/2=세움 → 과육면이 위를 더 본다.
const YAW = -0.5522; // = atan2(-1.6, 2.6). 과육면 법선의 수평 성분을 기본 3/4 카메라 쪽으로 정렬.

// YAW로 돌린 수평 기저 2개 (XZ 평면). LAT = 면내(원반 표면을 따라 미끄러짐), OUT = 법선의 수평 성분.
const LAT: readonly [number, number] = [Math.cos(YAW), -Math.sin(YAW)]; // ≈ (0.852, 0.524)
const OUT: readonly [number, number] = [Math.sin(YAW), Math.cos(YAW)]; // ≈ (-0.524, 0.852)

// LATERAL = 화면상 겹침을 만드는 면내 이동(지름 1.24 대비 0.60 → 절반 조금 넘게 겹친다).
// NORMAL_GAP = 법선 방향 이격. 실제 평면 간격 = NORMAL_GAP × sin(TILT) = 0.295.
// 두께합 0.2 + 지터 최악 0.037 = 0.237 < 0.295 → **교차 불가**. 이 부등식이 이 파일의 계약이다.
// (지터는 축마다 독립으로 ±amp라 법선 방향 최악 변위는 amp×L1(n) = 0.011×(0.455+0.498+0.739)
//  ≈ 0.019, 마주 보는 두 면이니 0.037. amp나 TILT를 바꾸면 이 부등식을 다시 세워라.)
const LATERAL = 0.6;
const NORMAL_GAP = 0.34;

interface SliceDef {
  /** 위 두 기저의 계수 — [LAT 계수, OUT 계수]. 실제 XZ는 build 시 합성. */
  uv: readonly [number, number];
  /** 원반 자기 축 회전 — 웨지 무늬 위상만 바뀐다(평면 불변). */
  roll: number;
}

// a·b는 기저 좌표에서 정확히 대칭 — 클러스터가 스스로 중앙에 온다(런타임이 bbox로 다시 잡지만
// 대칭이면 두 슬라이스의 화면 비중이 az에 따라 덜 흔들린다).
// roll 차이 0.314rad ≈ 웨지 반 칸(WEDGE_COUNT=10 → 한 칸 0.628) — 무늬 위상이 최대로 어긋난다.
const SLICES: Record<'a' | 'b', SliceDef> = {
  a: { uv: [-LATERAL / 2, -NORMAL_GAP / 2], roll: 0 },
  b: { uv: [LATERAL / 2, NORMAL_GAP / 2], roll: 0.314 },
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

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

export const createLemon: IngredientBuilder = (rng) => {
  const rindMat = stdMaterial({ color: RIND_COLOR });
  const pulpMat = stdMaterial({ map: paintLemonPulpTexture(), color: 0xffffff });

  const cluster = new THREE.Group();

  (Object.keys(SLICES) as (keyof typeof SLICES)[]).forEach((key) => {
    const def = SLICES[key];
    const { rindGeo, pulpBottomGeo, pulpTopGeo } = buildSlice(rng);

    const sub = new THREE.Group();
    sub.add(new THREE.Mesh(rindGeo, rindMat), new THREE.Mesh(pulpBottomGeo, pulpMat), new THREE.Mesh(pulpTopGeo, pulpMat));
    // ⚠ quaternion만 쓴다 — rotation.set을 같이 부르면 나중 쓴 쪽이 이긴다(둘은 같은 상태다).
    sub.quaternion
      .setFromAxisAngle(AXIS_Y, YAW)
      .multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, TILT))
      .multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_Y, def.roll));
    sub.position.set(def.uv[0] * LAT[0] + def.uv[1] * OUT[0], 0, def.uv[0] * LAT[1] + def.uv[1] * OUT[1]);

    // 공유 지면 y=0 — 세운/기댄 회전 후 bbox를 구해 바닥을 원점에 맞춘다(types.ts R1).
    sub.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sub);
    sub.position.y -= box.min.y;

    cluster.add(sub);
  });

  return mergeByMaterial(cluster);
};
