// 유리병 — 3패스 고정 renderOrder(굴절·transmission 금지) + hooch 액체층.
// 정본: docs/VISUAL.md §1-2. 알파 소팅 오류를 renderOrder로 구조적으로 차단한다.
import * as THREE from 'three';

export const JAR_RADIUS = 0.92; // 프로토타입 토러스 반경 계승
export const JAR_HEIGHT = 1.9;
/** 반죽·hooch가 닿는 유리 안쪽 반경(월드) — 48각 유리의 현 중점(0.92·cos(π/48) ≈ 0.918)보다 안 */
export const FILL_RADIUS = 0.912;

/**
 * 「병 채움」 매개 메시(인덱스, 2026-11-19 반죽 모델 v2) — position.xz = 단위 방향 × rN, position.y = h.
 * 윗면: h = 1, rN ∈ [0,1] 링 `rings`개(테두리 쪽 촘촘). 옆벽: rN = 1, h ∈ [0,1) 행 `rows`개.
 * 테두리(rN = 1, h = 1)는 윗면 마지막 링이자 옆벽 맨 윗줄 — **같은 정점**이라 틈이 0이다.
 * 바닥 면은 만들지 않는다(카메라는 늘 위에서 보고, 유리 바닥 원판이 받친다).
 * 반죽(DoughMesh)과 hooch가 같은 생성기를 쓴다 — 실제 높이·반경은 셰이더/스케일이 정한다.
 */
export function createFillGeometry(seg: number, rings: number, rows: number): THREE.BufferGeometry {
  const pos: number[] = [0, 1, 0];
  const ring = (r: number, h: number): void => {
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * r, h, Math.sin(a) * r);
    }
  };
  // 테두리 쪽이 촘촘하다 — 메니스커스·실루엣이 거기 있다
  for (let i = 1; i <= rings; i++) ring(i === rings ? 1 : 1 - Math.pow(1 - i / rings, 1.5), 1);
  for (let k = rows - 1; k >= 0; k--) ring(1, k / rows);

  const idx: number[] = [];
  for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j);
  // 가운데에서 바깥으로, 테두리에서 아래로 — 같은 꿰매기가 윗면은 +y, 옆벽은 바깥 노멀을 낸다
  const bands = rings - 1 + rows;
  for (let b = 0; b < bands; b++) {
    const i0 = 1 + b * seg;
    const o0 = i0 + seg;
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      idx.push(i0 + j, o0 + j1, o0 + j, i0 + j, i0 + j1, o0 + j1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const glassVert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

// 유리 자국 · 김서림 — 앞/뒤 유리 공통 소스. FBM 0회(전량 sin·exp·hash), 드로우콜 증가 0.
// 자국(2026-11-19 R2-06·A1-14): 지금 수면부터 최고 수위까지 반투명 크림색 막 + 또렷한 윗선 + 그 아래 옅은
// 그늘선 + 짧고 가는 흘러내림 몇 줄. 색은 배경보다 살짝 어둡고 따뜻한 매트 크림 — 회색·진한 색 금지(더러운 병).
// 흘러내림은 0.15월드 이하(콧물 금지).
const glassCommonGlsl = /* glsl */ `
  uniform float uMassY;   // 반죽 테두리 월드 y
  uniform float uMarkY;   // 이번 사이클 최고 수위 월드 y
  uniform float uResidue; // 0~1 마른 자국
  uniform float uWetRim;  // 0~1 갓 밥준 젖은 테
  uniform float uChill;   // 0~1 냉장 김서림
  uniform float uWarm;    // 0~1 창가
  // 고전 sin 해시 — 곱이 커서 fp16(mediump)에선 fract가 0이 된다. 그래서 이 소스를 쓰는 프래그는 highp다(R-M1)
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // 알파 합성 — 위에 얹는 층(lc, la)
  void over(inout vec3 c, inout float a, vec3 lc, float la) {
    float na = a + la * (1.0 - a);
    c = (c * a * (1.0 - la) + lc * la) / max(na, 1e-4);
    a = na;
  }
  // 반환: x = 막(흘러내림 포함), y = 윗선, z = 그늘선
  vec3 residueAmt(float wy, float az) {
    if (uResidue <= 0.004) return vec3(0.0);
    float above = smoothstep(uMassY + 0.004, uMassY + 0.05, wy);
    float below = 1.0 - smoothstep(uMarkY - 0.004, uMarkY + 0.003, wy);
    // 얼룩 — 넓고 낮은 대비 저주파 2개(구 19줄 세로 스트릭 폐기)
    float blot = 0.78 + 0.22 * sin(az * 3.0 + 1.3 + sin(az * 7.0) * 0.8) * sin(wy * 9.0 + az * 2.0);
    // 흘러내림 — 둘레 9칸 중 절반쯤, 최고 수위 아래로 0.05~0.15만
    float k = az * 1.4324 + 4.5;            // 9 / 2π
    float cell = floor(k);
    float f = fract(k) - 0.5;
    float hs = hash21(vec2(cell, 3.7));
    float len = 0.05 + 0.10 * hs;
    float drip = step(0.45, hs) * exp(-f * f * 900.0) * (1.0 - smoothstep(0.0, len, uMarkY - wy)) * below;
    float film = above * below * blot;
    // 윗선 = 막이 가장 두껍게 마른 테(최고 수위 바로 아래) + 그 위 밝은 실선
    float edge = exp(-pow((wy - uMarkY + 0.007) / 0.007, 2.0));
    float hi = exp(-pow((wy - uMarkY - 0.006) / 0.004, 2.0));
    return uResidue * vec3(min(1.0, film + 0.7 * drip), edge, hi);
  }
  // 자국·김서림을 한 번에 얹는다. overDough = 앞면 가림 보정(반죽 윗면 위로는 옅게)
  void glassLayers(inout vec3 c, inout float a, float wy, float az, float overDough, float face) {
    vec3 r = residueAmt(wy, az);
    float fm = mix(1.0, 0.04, overDough);
    float lm = mix(1.0, 0.25, overDough);
    over(c, a, vec3(0.824, 0.761, 0.671), r.x * 0.90 * fm * face);   // #d2c2ab 매트 크림 막 — 깨끗한 유리 대비 ΔL* 5↑
    over(c, a, vec3(0.80, 0.735, 0.645), r.y * 0.62 * lm * face);    // 마른 테 — 막과 같은 계열, 진하게
    over(c, a, vec3(0.99, 0.965, 0.92), r.z * 0.55 * lm * face);     // 밝은 실선
    // 냉장 — 옅은 서리 막 + 잔물방울(칸마다 자리·크기·유무가 다르다 — 격자 금지)
    if (uChill > 0.01) {
      over(c, a, vec3(0.93, 0.95, 0.96), 0.17 * uChill * face);
      vec2 g = vec2(az * 0.92 * 24.0, wy * 24.0);
      vec2 id = floor(g);
      vec2 off = (vec2(hash21(id), hash21(id + 7.1)) - 0.5) * 0.55;
      float rad = 0.10 + 0.16 * hash21(id + 3.3);
      float d = length(fract(g) - 0.5 - off);
      float drop = step(0.70, hash21(id + 5.7)) * (1.0 - smoothstep(rad * 0.55, rad, d));
      over(c, a, vec3(0.99, 0.995, 1.0), drop * 0.30 * uChill * face);
    }
    if (uWarm > 0.01) over(c, a, vec3(1.0, 0.93, 0.80), 0.04 * uWarm * face);
  }
`;

// 뒷면: 은은한 내벽 톤 + 하단으로 갈수록 두꺼워지는 유리 암시. 자국이 가장 잘 읽히는 면이다
// (부감에서 수위 위 「먼 쪽」 벽이 반죽 윗면과 안 겹친다)
const glassBackFrag = /* glsl */ `
  precision highp float; // R-M1 — hash21(sin ×43758)는 fp16에서 0으로 무너진다. WebGL2는 프래그 highp 필수 지원
  varying vec3 vLocal;
  ${glassCommonGlsl}
  void main() {
    float yn = clamp((vLocal.y + 0.95) / 1.9, 0.0, 1.0);
    // 림 바로 아래 내부 환형 — 배경색이 그대로 비쳐 반죽 위에 뜬 베이지 링으로 보이던 구간만 덮는다
    float rim = smoothstep(0.75, 1.0, yn);
    float alpha = 0.10 + 0.06 * (1.0 - yn) + 0.24 * rim;
    vec3 tint = mix(vec3(0.98, 0.94, 0.88), vec3(0.28, 0.21, 0.14), rim);
    glassLayers(tint, alpha, vLocal.y + 0.95, atan(vLocal.x, vLocal.z), 0.0, 1.0);
    gl_FragColor = vec4(tint, alpha);
  }
`;

// 앞면: 프레넬 림 + 수직 하이라이트 스트릭 2줄(키라이트 방위 정렬).
// (절차 눈금은 저각에서 얼룩 아티팩트로 번져 제거. 고무줄 마커도 사용자 확정으로 제거(2026-08-23)
//  — 부피 정보는 도우 높이 + 유리 최고 수위 자국 + 관찰 카드가 정본)
const glassFrontFrag = /* glsl */ `
  precision highp float; // R-M1 — glassBackFrag와 같은 이유
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${glassCommonGlsl}
  void main() {
    float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewDir))), 2.0);
    float alpha = 0.08 + 0.45 * fresnel;
    // 수직 스트릭 — 씬 키라이트(좌상단) 방위 부근 2줄, 상하 페이드
    float az = atan(vLocal.x, vLocal.z);
    float band = exp(-pow((az - 2.30) * 3.0, 2.0)) + 0.6 * exp(-pow((az + 0.85) * 3.5, 2.0));
    float yn = clamp((vLocal.y + 0.95) / 1.9, 0.0, 1.0);
    float vfade = smoothstep(0.03, 0.28, yn) * (1.0 - smoothstep(0.72, 0.97, yn));
    alpha += 0.10 * band * vfade;
    vec3 tint = vec3(1.0, 0.965, 0.91); // #FFF6E8
    float wy = vLocal.y + 0.95;
    // 이 유리 조각 너머로 반죽 윗면이 보이나 — 직교 카메라 시선을 수면까지 따라간다(A1-14)
    vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    float tHit = (wy - uMassY) / max(-fwd.y, 1e-3);
    vec2 hit = vLocal.xz + fwd.xz * tHit;
    float overDough = (1.0 - smoothstep(0.80, 0.95, length(hit))) * step(uMassY, wy);
    glassLayers(tint, alpha, wy, az, overDough, 1.0);
    // 갓 밥준 젖은 테 — 자국과 반대 신호. 수위 바로 위 얇은 광택 띠
    alpha += exp(-pow((wy - uMassY - 0.012) * 55.0, 2.0)) * uWetRim * 0.12;
    gl_FragColor = vec4(tint, alpha);
  }
`;

export interface Jar {
  group: THREE.Group;
  /** hooch(부유액) 층 — 방치 신호. setHooch로 구동 */
  hooch: THREE.Mesh;
  /** amt 0~1 · 반죽 테두리 월드 y · 반죽 높이(두께 산정) · 셰이더 시계 */
  setHooch(amt: number, levelY: number, doughH: number, t: number): void;
  /** 유리 자국 — 수위·최고 수위(월드 y)·자국 세기·젖은 테. 배선은 SceneHost */
  setLevel(massY: number, markY: number, residue: number, wet: number): void;
  /** 위치 톤 — 냉장 김서림(chill) · 창가 따뜻함(warm), 둘 다 0~1 */
  setClimate(chill: number, warm: number): void;
  /** 젓는 동안 hooch 탁해짐 0~1 · 줄무늬 위상 · 반죽 색(sRGB 0~1) — DoughMesh.murk · marblePhase */
  setMurk(murk: number, phase: number, color: readonly [number, number, number]): void;
}

/**
 * hooch 덮임 0~1 — 단위 원판 반경 rN · 방위 ang · 양 amt. 유리 가장자리 고리(amt 0~0.35) → 윗면 전체.
 * hooch 윗면 셰이더와 반죽 잔금(덮인 곳은 젖어 있어 마른 금이 없다)이 이 소스 하나를 쓴다(2026-11-19 다듬기).
 * 안쪽 경계는 넓고 불규칙하게 — 또렷한 동심원은 과녁 · 계란프라이로 읽혔다(판정 L3). 각도 저주파 흔들림 +
 * 번지는 중엔 전이 폭 0.25(고리 단계는 0.10 그대로 — 가장자리 실선이 옅어지지 않게)
 */
export const HOOCH_COVER = /* glsl */ `
float hoochCover(float rN, float ang, float amt) {
  float spread = smoothstep(0.30, 0.80, amt);
  float ringW = mix(0.10, 1.25, spread) + spread * (1.0 - spread) * (0.24 * sin(3.0 * ang + 1.3) + 0.14 * sin(5.0 * ang - 0.7));
  return smoothstep(1.0 - ringW, 1.0 - ringW + mix(0.10, 0.25, spread), rN) * smoothstep(0.0, 0.05, amt);
}
`;

/**
 * 줄무늬 띠 0~1 — 가운데 둘레 3갈래 나선 띠(반경 방향 3줄, 반 바퀴마다 끊긴 결). 밥 주기 가루가 저어지며
 * 남는 흰 줄(반죽)과 젓는 동안 탁해지는 hooch가 같은 소스를 쓴다(2026-11-19 섞는 맛 M3). n = 테두리 1로 맞춘 xz,
 * w = 세기(줄면 띠가 가늘고 옅어진다), warp = 휨(반죽은 fbm 모틀을 넘긴다). 각도 배수가 정수라 atan 이음매가 없다.
 * 지렁이 · 격자 · 점 무늬 금지 — 띠는 길고, 고주파 흔들림을 넣지 않는다.
 */
export const MARBLE_GLSL = /* glsl */ `
float marbleBand(vec2 n, float phase, float w, float warp) {
  if (w < 0.004) return 0.0;
  float r = length(n);
  float a = atan(n.y, n.x) - phase;
  float u = r * 3.0 - a * 0.47746 + 0.09 * sin(a * 2.0 + r * 5.0) + warp; // 3갈래 — 한 갈래 4줄 나선은 과녁 · 레코드판으로 읽혔다
  float d = abs(fract(u) - 0.5) * 2.0;
  float wid = mix(0.12, 0.34, w);
  float line = 1.0 - smoothstep(wid * 0.35, wid, d);
  // 띠가 한 바퀴 내내 이어지면 모기향 · 과녁 — 반 바퀴마다 끊어 길쭉한 결 몇 가닥으로
  float arc = smoothstep(-0.35, 0.75, sin(a * 2.0 + r * 4.0 + 1.0));
  return line * arc * w * smoothstep(0.06, 0.22, r) * (1.0 - smoothstep(0.86, 0.98, r));
}
`;

const hoochVert = /* glsl */ `
  varying vec3 vP;   // x,z = 단위 원판 좌표, y = 옆띠 높이 0~1(윗면 1)
  varying vec3 vWorld;
  void main() {
    vP = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// hooch — 반죽 위에 수평으로 앉은 반투명 액체층(2026-11-19 R2-05). 두께 0 원판 폐기.
// 진행: 유리 가장자리를 도는 얇은 고리(amt 0~0.35) → 윗면 전체를 덮고 옆벽 위쪽에 칼같이 수평인 띠.
// 색 R1: 가장자리 #9f977f · 옆 띠 호박색 #998064 · 짙은 띠 #867562. 광택 높음(매트 반죽과 대비가 가장 큼).
// 불투명 진갈색 금지(흙·썩음).
const hoochFrag = /* glsl */ `
  precision highp float; // R-M1 — 유리와 같은 판정(fp16 실폰에서 흐름 · 광 무늬가 뭉개지지 않게)
  uniform float uAmt;
  uniform float uTime;
  uniform float uMurk;      // 젓는 동안 탁해짐 0~1 — 반죽 색 쪽으로 0.6까지 + 나선 띠(sim hooch 값과 무관)
  uniform float uMurkPhase; // 반죽 줄무늬와 같은 소용돌이 위상
  uniform vec3 uDoughCol;
  varying vec3 vP;
  varying vec3 vWorld;
  ${HOOCH_COVER}
  ${MARBLE_GLSL}
  void main() {
    float rN = length(vP.xz);
    float spread = smoothstep(0.30, 0.80, uAmt);          // 고리 → 전면
    float show = smoothstep(0.0, 0.05, uAmt); // 시큼 초반부터 고리가 보이게(판정 M1 — 옛 0.02~0.12는 늦었다)
    if (vP.y < 0.999) {
      // 옆 띠 — 위는 밝은 액면선, 아래 경계는 짙은 수평선
      vec3 c = mix(vec3(0.525, 0.459, 0.384), vec3(0.600, 0.502, 0.392), smoothstep(0.0, 0.35, vP.y)); // #867562 → #998064
      float topLine = smoothstep(0.80, 0.97, vP.y);
      c = mix(c, vec3(0.80, 0.74, 0.62), topLine * 0.6);
      float a = (0.55 + 0.12 * spread) * show + 0.2 * smoothstep(0.0, 0.08, vP.y) * (1.0 - smoothstep(0.08, 0.2, vP.y)) * show;
      c = mix(c, uDoughCol, 0.6 * uMurk);
      gl_FragColor = vec4(c, a);
      return;
    }
    // 윗면 — 가장자리 먼저. 안쪽은 맑아 아래 반죽이 비친다
    float cover = hoochCover(rN, atan(vP.z, vP.x), uAmt);
    vec3 c = mix(vec3(0.64, 0.60, 0.51), vec3(0.624, 0.592, 0.498), smoothstep(0.6, 1.0, rN)); // 가장자리 #9f977f
    float flow = 0.5 + 0.5 * sin(vP.x * 9.0 + uTime * 0.3) * sin(vP.z * 8.0 - uTime * 0.22);
    float a = cover * (0.34 + 0.20 * smoothstep(0.55, 1.0, rN) + 0.05 * flow);
    // 탁해짐 — 반죽이 풀려 옅은 베이지로(불투명 갈색 금지: 반죽 색 쪽이라 밝아진다). 같은 나선 띠가 비친다
    float mb = marbleBand(vP.xz, uMurkPhase, uMurk, 0.0);
    c = mix(c, uDoughCol, 0.6 * uMurk + 0.25 * mb);
    a = mix(a, cover * 0.62, 0.5 * uMurk);
    // 광 — 안쪽 뒤 왼편에 치우친 넓고 흐린 길쭉한 얼룩 하나(소프트박스가 비친 액면). 옛 평행 대각선 두 줄은
    // 유리판 · 뚜껑으로 읽혔다(2026-11-19 다듬기). 대비는 낮게, 가장자리는 흐름으로 살짝 흔들린다
    vec2 q = mat2(0.91, 0.42, -0.42, 0.91) * (vP.xz - vec2(-0.34, -0.12));
    float sheen = exp(-(q.x * q.x / 0.12 + q.y * q.y / 0.03) * (0.85 + 0.3 * flow));
    c = mix(c, vec3(1.0, 0.99, 0.965), sheen * 0.85);
    a = max(a, sheen * 0.55 * cover);
    // 유리에 닿은 액면 테 — 얇은 밝은 실선(메니스커스가 빛을 모은다)
    float rim = smoothstep(0.975, 0.997, rN);
    c = mix(c, vec3(0.95, 0.92, 0.85), rim * 0.7);
    a = max(a, rim * 0.6 * show);
    gl_FragColor = vec4(c, a);
  }
`;

// 병 바닥 — 두꺼운 유리 바닥 톤. 반죽이 바닥 모서리까지 채우므로 거의 가려지고, 장면에서 가장 어두운
// 요소가 아니어야 한다(R2-09 — 구 진갈색 L*27 원판 폐기). 테두리 고리만 살짝 어둡다(ΔL* −6 안팎).
const floorVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const floorFrag = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    vec3 center = vec3(0.902, 0.863, 0.796); // #e6dccb
    vec3 edge = vec3(0.835, 0.792, 0.722);
    gl_FragColor = vec4(mix(center, edge, smoothstep(0.85, 1.0, d)), 1.0);
  }
`;

export function createJar(): Jar {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(JAR_RADIUS, JAR_RADIUS, JAR_HEIGHT, 48, 1, true);

  // 앞·뒤 유리가 같은 uniform 집합을 쓴다 — 값은 setLevel·setClimate가 양쪽에 함께 넣는다
  const glassUniforms = (): Record<string, { value: number }> => ({
    uMassY: { value: 0 },
    uMarkY: { value: 0 },
    uResidue: { value: 0 },
    uWetRim: { value: 0 },
    uChill: { value: 0 },
    uWarm: { value: 0 },
  });

  const back = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: glassUniforms(),
      vertexShader: glassVert,
      fragmentShader: glassBackFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
    }),
  );
  back.renderOrder = 1;

  const front = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: glassUniforms(),
      vertexShader: glassVert,
      fragmentShader: glassFrontFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    }),
  );
  front.renderOrder = 3;

  back.position.y = JAR_HEIGHT / 2;
  front.position.y = JAR_HEIGHT / 2;

  // 입구 립 — 살짝 벌어진 유리 테
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(JAR_RADIUS + 0.02, 0.018, 10, 48),
    new THREE.MeshPhysicalMaterial({ color: 0xfff6e8, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.5 }),
  );
  lip.rotation.x = Math.PI / 2;
  lip.position.y = JAR_HEIGHT;
  lip.renderOrder = 3;
  group.add(back, front, lip);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(JAR_RADIUS, 48),
    new THREE.ShaderMaterial({ vertexShader: floorVert, fragmentShader: floorFrag }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.renderOrder = 2;
  group.add(floor);

  // 고무줄 마커는 제거(사용자 확정 2026-08-23) — 림 2개가 겹쳐 어수선.
  // 부피는 도우 높이 자체가 표현하고, 고무줄 문법은 천 덮개 착색에만 남긴다.

  // hooch 액체층 — 반죽과 같은 병 채움 생성기(윗면 6링 + 옆띠 1행). 반경은 반죽 옆벽 바로 바깥
  const hoochMat = new THREE.ShaderMaterial({
    vertexShader: hoochVert,
    fragmentShader: hoochFrag,
    uniforms: {
      uAmt: { value: 0 },
      uTime: { value: 0 },
      uMurk: { value: 0 },
      uMurkPhase: { value: 0 },
      uDoughCol: { value: new THREE.Color(0xf4ead4) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const hooch = new THREE.Mesh(createFillGeometry(128, 6, 1), hoochMat);
  hooch.scale.set(FILL_RADIUS + 0.002, 0.01, FILL_RADIUS + 0.002);
  hooch.renderOrder = 2;
  hooch.visible = false;
  group.add(hooch);

  const setHooch = (amt: number, levelY: number, doughH: number, t: number): void => {
    hoochMat.uniforms.uAmt.value = amt;
    hoochMat.uniforms.uTime.value = t;
    // 두께 — 고리 단계는 얇게, 덮으면 반죽 높이의 최대 11%. 아랫단은 테두리 살짝 아래(틈 0)
    const thick = 0.006 + 0.11 * doughH * THREE.MathUtils.smoothstep(amt, 0.3, 1.0);
    hooch.position.y = levelY - 0.006;
    hooch.scale.y = thick + 0.006;
    hooch.visible = amt > 0.01;
  };

  const forGlass = (f: (u: Record<string, THREE.IUniform>) => void): void => {
    for (const m of [back, front]) f((m.material as THREE.ShaderMaterial).uniforms);
  };
  const setLevel = (massY: number, markY: number, residue: number, wet: number): void =>
    forGlass((u) => {
      u.uMassY.value = massY;
      u.uMarkY.value = markY;
      u.uResidue.value = residue;
      u.uWetRim.value = wet;
    });
  const setClimate = (chill: number, warm: number): void =>
    forGlass((u) => {
      u.uChill.value = chill;
      u.uWarm.value = warm;
    });

  const setMurk = (murk: number, phase: number, color: readonly [number, number, number]): void => {
    hoochMat.uniforms.uMurk.value = murk;
    hoochMat.uniforms.uMurkPhase.value = phase;
    (hoochMat.uniforms.uDoughCol.value as THREE.Color).setRGB(color[0], color[1], color[2]);
  };

  return { group, hooch, setHooch, setLevel, setClimate, setMurk };
}
