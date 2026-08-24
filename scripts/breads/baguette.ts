// 바게트 — 긴 가는 테이퍼 원통 + 사선 슬래시(귀+크럼 노출). 계약은 types.ts 주석이 정본.
//
// 유래: img2threejs 스펙 `assets/breads/specs/baguette.json`(워크스페이스 원본은
// assets/breads/work/baguette/). 스테이션·슬래시 파라미터는 그 스펙의 전사이며, 수치를 고칠
// 때는 station_gen.py/check_slash_coverage.py/check_winding.py를 먼저 고치고 여기로 옮긴다.
//
// pancake.ts의 "링(=여기선 스테이션, X축)×섹터(원형, 랩어라운드)" 패턴을 재사용하되 스윕축을
// Y에서 X로 돌렸다 — loaf에서 겪은 함정 그대로: 축을 바꾸면 pancake의 (a0,a1,b1)/(a0,b0,b1)
// 와인딩 관례가 그대로 옮지 않는다. 여기서는 렌더 전에 check_winding.py로 4가지 삼각형
// 패턴을 각각 독립 검증해 정답을 구했다: 슬롯1=(a0,b1,a1), 슬롯2=(a0,b0,b1) — 두 삼각형이
// "같이 뒤집힌다"는 순진한 가정이 틀렸었다(한쪽만 뒤집혀 있어 전체의 정확히 50%가 안쪽을
// 향했다). 양끝은 진짜 극점(반지름 0)이라 loaf의 팬 캡이 필요 없다.
//
// 슬래시 메커니즘: scone의 "격자 셀 최근접 매칭"을 1차원 Z-밴드에서 2차원 방향성 타원 풋프린트로
// 일반화했다. 각 (station, sector) 격자 정점을 슬래시 자체 축 기준 (along, across) 좌표로
// 회전시켜, 타원 안쪽이면 트렌치(안쪽 절반, 크럼 색)나 귀(바깥쪽 절반, 크러스트 색으로 살짝
// 융기)로 분류한다. 삼각형은 정점 다수결로 크럼/크러스트를 정하고, 크러스트 먼저·크럼 나중
// 순서로 인덱스를 쌓아 sliceTriangles가 요구하는 연속 경계를 만든다(scone의 body/face 분리
// 트릭을 공유 링 하나에서 슬래시 4개로 일반화).
import * as THREE from 'three';
import type { BreadBuilder } from './types';
import { facet, jitterVertices, mergeByMaterial, sliceTriangles, stdMaterial, uvCylindrical } from './lib';

// 팔레트 — assets/prompts/breads/baguette.json geometry.crust 손 전사 (JSON import 금지, types.ts §8)
const CRUST_COLOR = 0xa9713f; // "deep golden brown surface along the entire length"
const CRUMB_COLOR = 0xf4ead4; // "cream-colored crumb visible inside each open slash"

// 비율 — 레퍼런스 실측 L/D는 11.365(정면 픽셀 바운딩박스)였으나 **스타일라이즈 5.0으로 확정**
// (사용자 판정 2026-08-24: 도감 카드·쇼케이스의 최장축 1.6 리핏에서 두께가 소멸해 "콩알"로
// 보임 — 게임 에셋 가독성이 실측 충실도보다 우선). 되돌리지 말 것.
const RADIUS = 1.0;
const HALF_LENGTH = 5.0; // L/D = 5.0 (실측 11.365의 스타일라이즈 압축)
// v4(cmp-3.png 이후): 스테이션 밀도를 올려도(v3, 슬래시당 8스테이션) 여전히 들쭉날쭉했다 —
// check_slash_coverage.py로 확인하니 스테이션당 트렌치 셀이 1.5개뿐, 즉 폭(섹터) 해상도가
// 진짜 병목이었다. SEGMENTS를 24→32로 올리고 스테이션 밀도는 다시 낮춰 예산을 맞췄다.
const SEGMENTS = 32;

// 스테이션 3구간 — assets/breads/work/baguette/station_gen.py와 동일 공식(반드시 동기화 유지).
// v6: 폭을 고정한 뒤 다시 길이 방향(스테이션) 해상도가 병목이었다(슬래시당 5스테이션 →
// 계단식 셰브런). 슬래시당 스테이션을 늘려 tri가 CRIB 목표(800~1500)를 넘지만, 이 빵만은
// 정체성 피처가 실제로 해상도를 요구하고 하드 캡(8000tri/250KB)엔 여유가 있어 받아들인다.
const DENSE_HALF_SPAN = 3.0;
const SPARSE_HALF_SPAN = 4.0; // L/D 5.0에 맞춰 6.25에서 축소(테이퍼 구간 = 4.0~5.0)
const DENSE_STATIONS = 26;
const SPARSE_STATIONS_PER_SIDE = 1;
const TAPER_STATIONS_PER_SIDE = 3;

interface Station {
  x: number;
  r: number;
}

function buildStations(): Station[] {
  const stations: Station[] = [];
  for (let i = 0; i < DENSE_STATIONS; i++) {
    const t = i / (DENSE_STATIONS - 1);
    stations.push({ x: -DENSE_HALF_SPAN + t * (2 * DENSE_HALF_SPAN), r: 1.0 });
  }
  for (const side of [-1, 1]) {
    for (let i = 1; i <= SPARSE_STATIONS_PER_SIDE; i++) {
      const t = i / SPARSE_STATIONS_PER_SIDE;
      stations.push({ x: side * (DENSE_HALF_SPAN + t * (SPARSE_HALF_SPAN - DENSE_HALF_SPAN)), r: 0.99 });
    }
  }
  for (const side of [-1, 1]) {
    for (let i = 1; i <= TAPER_STATIONS_PER_SIDE; i++) {
      const t = i / TAPER_STATIONS_PER_SIDE;
      const x = side * (SPARSE_HALF_SPAN + t * (HALF_LENGTH - SPARSE_HALF_SPAN));
      const r = Math.max(0.97 * Math.cos((t * Math.PI) / 2), 0);
      stations.push({ x, r });
    }
  }
  stations.sort((a, b) => a.x - b.x);
  return stations;
}

const STATIONS = buildStations();

// 슬래시 파라미터 — check_slash_coverage.py로 검증(각 슬래시 트렌치 7~8셀, 5개 스테이션 걸침).
// v5(cmp-4.png/shot-90.png): 연결성은 맞았지만(연속 대각선 확인) 모양이 레퍼런스의 통통한
// 렌즈가 아니라 가느다란 체크마크였다 — TRENCH_FRACTION 0.5 x halfWidth 0.42면 실제 트렌치
// 반폭이 0.21로 너무 좁다. 폭과 트렌치 비율을 함께 늘렸다(트렌치 반폭 0.21→0.44).
const SLASH_AXIS_ANGLE_DEG = 32; // 길이축(X) 대비 슬래시 자체 축 기울기
const SLASH_HALF_LENGTH = 1.0;
const SLASH_HALF_WIDTH = 0.65;
const TRENCH_FRACTION = 0.68; // 폭 봉투의 안쪽 비율 = 트렌치(크럼), 바깥쪽 = 귀(크러스트, 융기)
const SLASH_CENTERS_X: readonly number[] = [-2.25, -0.75, 0.75, 2.25];
// v2 (cmp-1.png): 0.12/0.05 read as tiny scattered marks, not a lens-shaped opening with a
// raised lip - too shallow at this grid resolution to read from the three-quarter camera.
const TRENCH_DEPTH = 0.26;
const EAR_RAISE = 0.11;

const JITTER_AMP = 0.012; // scone(0.01)보다 살짝 높다 — 레퍼런스가 셋 중 패싯 밀도가 제일 높다

interface SlashClass {
  kind: 'trench' | 'ear';
}

/** 정점 하나를 슬래시 4개에 대해 분류한다 — 첫 매치를 채택(슬래시끼리 겹치지 않게 배치됨). */
function classifyVertex(x: number, arcFromTop: number): SlashClass | null {
  const a = (SLASH_AXIS_ANGLE_DEG * Math.PI) / 180;
  for (const centerX of SLASH_CENTERS_X) {
    const dx = x - centerX;
    const ds = arcFromTop;
    const along = dx * Math.cos(a) + ds * Math.sin(a);
    if (Math.abs(along) >= SLASH_HALF_LENGTH) continue;
    const across = -dx * Math.sin(a) + ds * Math.cos(a);
    const envelope = SLASH_HALF_WIDTH * Math.sqrt(Math.max(0, 1 - (along / SLASH_HALF_LENGTH) ** 2));
    if (Math.abs(across) >= envelope) continue;
    return { kind: Math.abs(across) < envelope * TRENCH_FRACTION ? 'trench' : 'ear' };
  }
  return null;
}

function buildBaguette(rng: () => number): { geometry: THREE.BufferGeometry; crustTriangles: number } {
  const stationCount = STATIONS.length;
  const positions: number[] = [];
  const vertexClass: (SlashClass | null)[] = [];
  const indexOf = (si: number, sec: number): number => si * SEGMENTS + sec;

  for (let si = 0; si < stationCount; si++) {
    const { x, r } = STATIONS[si];
    for (let sec = 0; sec < SEGMENTS; sec++) {
      const t = (sec / SEGMENTS) * Math.PI * 2;
      const dt = t <= Math.PI ? t : t - Math.PI * 2; // top(0) 기준 부호 있는 각도, [-pi,pi]
      const arcFromTop = dt * Math.max(r, 1e-6);
      const cls = r > 1e-6 ? classifyVertex(x, arcFromTop) : null;
      vertexClass.push(cls);
      let rr = r;
      if (cls?.kind === 'trench') rr -= TRENCH_DEPTH;
      else if (cls?.kind === 'ear') rr += EAR_RAISE;
      positions.push(x, rr * Math.cos(t), rr * Math.sin(t));
    }
  }
  // 극점은 별도 정점 하나씩 — 스테이션 배열엔 r=0인 첫/끝 스테이션이 이미 있으므로 그 행의
  // SEGMENTS개 정점이 전부 원점 근처에 겹쳐 찍힌다(반지름 0이므로 문제 없음, pancake과 동일
  // 방식으로 sector별 정점을 그대로 두고 팬 삼각분할에서 첫 sector만 쓴다 — 별도 pole 인덱스
  // 불필요, ringPositions(x,0,...)이 전부 (x,0,0)이라 자동으로 축퇴한다).

  // 삼각형을 두 목록(크러스트/크럼)에 각각 모았다가 크러스트 먼저 이어붙인다 —
  // sliceTriangles가 요구하는 단일 연속 경계를 만들기 위해서다(scone과 동일 원칙).
  const crustTris: number[] = [];
  const crumbTris: number[] = [];
  const isCrumbVote = (a: number, b: number, c: number): boolean => {
    const votes = [vertexClass[a]?.kind === 'trench', vertexClass[b]?.kind === 'trench', vertexClass[c]?.kind === 'trench'];
    return votes.filter(Boolean).length >= 2;
  };
  const pushTri = (a: number, b: number, c: number): void => {
    (isCrumbVote(a, b, c) ? crumbTris : crustTris).push(a, b, c);
  };

  for (let si = 0; si < stationCount - 1; si++) {
    const rA = STATIONS[si].r;
    const rB = STATIONS[si + 1].r;
    if (rA <= 1e-6 || rB <= 1e-6) {
      // 극점 갭 — 부채꼴 삼각분할. check_winding.py로 검증한 flip 값을 그대로 쓴다.
      const poleIsA = rA <= 1e-6;
      const poleSi = poleIsA ? si : si + 1;
      const ringSi = poleIsA ? si + 1 : si;
      const pole = indexOf(poleSi, 0); // r=0이라 모든 sector가 같은 점 — sector 0만 쓴다
      const flip = poleIsA; // start pole flip=True, end pole flip=False (check_winding.py)
      for (let s = 0; s < SEGMENTS; s++) {
        const s1 = (s + 1) % SEGMENTS;
        const rs = indexOf(ringSi, s);
        const rs1 = indexOf(ringSi, s1);
        if (flip) pushTri(pole, rs1, rs);
        else pushTri(pole, rs, rs1);
      }
      continue;
    }
    for (let s = 0; s < SEGMENTS; s++) {
      const s1 = (s + 1) % SEGMENTS;
      const a0 = indexOf(si, s);
      const b0 = indexOf(si, s1);
      const a1 = indexOf(si + 1, s);
      const b1 = indexOf(si + 1, s1);
      // check_winding.py로 검증한 정답 조합: 슬롯1=(a0,b1,a1), 슬롯2=(a0,b0,b1).
      pushTri(a0, b1, a1);
      pushTri(a0, b0, b1);
    }
  }

  const index = [...crustTris, ...crumbTris];
  const crustTriangles = crustTris.length / 3;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  jitterVertices(geometry, rng, JITTER_AMP);
  return { geometry, crustTriangles };
}

export const createBaguette: BreadBuilder = (rng) => {
  const group = new THREE.Group();
  const crustMat = stdMaterial({ color: CRUST_COLOR });
  const crumbMat = stdMaterial({ color: CRUMB_COLOR });

  const { geometry, crustTriangles } = buildBaguette(rng);
  const baked = facet(geometry);
  const total = baked.attributes.position.count / 3;

  const crustGeo = sliceTriangles(baked, 0, crustTriangles);
  const crumbGeo = sliceTriangles(baked, crustTriangles, total);
  uvCylindrical(crustGeo, 'x');
  uvCylindrical(crumbGeo, 'x');

  group.add(new THREE.Mesh(crustGeo, crustMat));
  group.add(new THREE.Mesh(crumbGeo, crumbMat));

  return mergeByMaterial(group);
};
