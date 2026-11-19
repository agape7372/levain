// 도우 프래그먼트 — 반유동체 개편 (2026-08-24, 오푸스 상담 §0·§2 반영):
//   ① 젖은 광 부활 — 기존 pow(ndl,40)은 이 라이트·카메라 기하에서 수학적으로 0(≈1e-13)이었다.
//      "병 위 소프트박스" 상수 하프벡터(HS)로 분리 — 젖은 음식 촬영 문법.
//   ② 조명이 몸통(vBaseN)과 변형 전부(poke·ripe·collapse·수면 기울기·진행파)를 본다.
//   ③ FBM 마이크로 노멀 유한차분(3회 호출) → 해석적 그라디언트 1회 — 추가분 예산 상쇄.
// 주의: precision 선언 금지 — three 프렐류드와 버텍스/프래그 공유 uniform 정밀도가 어긋난다.
//   그래서 실제 정밀도는 three 기본값(renderer.capabilities.precision = 대부분 highp)이다(A1-12, VISUAL §8).
// 2026-11-19 반죽 모델 v2: 범프 4슬롯(동시 상한과 같다), 돔·크레이터 조명 짝은 윗면 전용(vTop),
//   카메라 하프벡터는 상수 대신 viewMatrix에서 뽑는다(고도를 바꿔도 짝이 맞는다).
// 2026-11-19 표면 질감 v2(P1b, VISUAL §2·§3-3): 줄무늬를 만들던 주기 sin 기공 함수·FBM 문턱 기공(pin·crater)·
//   피크 crackle·팝 링을 지우고 「칸마다 기포 하나」 지터 층으로 바꿨다(자기 칸만 본다 = 이웃 탐색 없음, trig 0).
//   유리 너머 = 잔 · 중간 · 렌즈 주머니 3층, 윗면 = 바늘구멍 1층 + 가장자리 잔거품 1층. 해시는 mediump에서도 버틴다.
uniform float uTime;
uniform vec3 uColor;
uniform float uSpecStr;
uniform float uCrust;
uniform float uFlourDust;
uniform float uWet;
uniform float uRipe;
uniform float uCollapse;
uniform float uKahm;
uniform float uMold;
uniform float uSeed;
uniform float uLevel;      // (구 uLiquid) 형상 — 평평함. vert와 같은 소스
uniform float uFluid;      // 흐름 — 슬로싱·진행파 조명 짝
uniform float uCohesion;   // 응집 — 겹 가닥·메니스커스 세기
uniform float uRBody;      // 몸통 적도 반경 = R × wallFill — **모든 반경 밴드의 정규화 기준**
uniform vec2 uWallCell;    // x = 유리 너머 기포 수 0~1, y = 크기 축 34(크고 성김) ~ 80(잘고 촘촘)
uniform float uNoiseSpeed; // 활동 — 유리 너머 기포가 자라는 빠르기
uniform float uPin;        // 윗면 바늘구멍 0~1
uniform float uFoam;       // 윗가장자리 잔거품 띠 0~1
uniform float uSink;       // 하강 꺼짐 0~1 — vert와 같은 소스
uniform float uStir;       // 갓 밥준 젓은 물결 0~1
uniform vec4 uMoldA[5];    // 곰팡이 군락 (x, z, 크기 배율, 색 종류) — vert와 단일 소스(규칙 8)
uniform float uHooch;      // hooch 양 0~1 — 덮인 곳엔 마른 금이 없다(jar.ts HOOCH_COVER와 같은 식)
uniform vec2 uWobble;
uniform vec2 uBumpPos[4];
uniform float uBumpAmp[4];
uniform float uBumpK[4];
uniform vec2 uTrailPos[4];
uniform float uTrailAmp[4];
uniform float uTrailK[4];
uniform vec2 uPokePos;
uniform float uPokeAmt;
uniform float uPokeK;
uniform vec2 uGrabPos;
uniform vec2 uGrabDisp;
uniform float uRXZMax;
uniform float uSlopeAspect; // 월드 기울기 진값 = 1 / XZ_SCALE (A1-05)
varying vec2 vXZ;
varying float vStretch;
varying float vTop;
varying vec3 vBaseN;
varying float vY;          // 월드 높이 (vert와 단일 소스)
varying float vWallY;      // 몸통 내 정규화 높이 0~1

/** 오브젝트 → 월드 XZ 배율 — DoughMesh XZ_SCALE과 같은 값(tests/doughSurface가 잠근다) */
const float XZ_W = 1.3;
/** 터진 기포 바늘구멍 깊이 — bubbles.ts SCAR_AMP와 같은 값(tests/doughSurface가 잠근다) */
const float SCAR_AMP = 0.004;

float fbm(vec2 p) {
  mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
  float v = 0.6 * sin(p.x) * cos(p.y);
  p = R * p * 1.9 + 13.7;
  v += 0.3 * sin(p.x) * cos(p.y);
  p = R * p * 1.9 + 5.1;
  v += 0.15 * sin(p.x) * cos(p.y);
  return v;
}

// 해석적 FBM 그라디언트 — sin·cos 도함수 체인 (유한차분 편향·매직 e 제거, §예산)
vec2 fbmG(vec2 p0) {
  mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
  mat2 J = mat2(1.52, -1.14, 1.14, 1.52); // 1.9R
  vec2 g = 0.6 * vec2(cos(p0.x) * cos(p0.y), -sin(p0.x) * sin(p0.y));
  vec2 p1 = R * p0 * 1.9 + 13.7;
  g += 0.3 * vec2(cos(p1.x) * cos(p1.y), -sin(p1.x) * sin(p1.y)) * J;
  vec2 p2 = R * p1 * 1.9 + 5.1;
  g += 0.15 * vec2(cos(p2.x) * cos(p2.y), -sin(p2.x) * sin(p2.y)) * (J * J);
  return g;
}

// 아래 표지 줄은 DoughMesh가 jar.ts HOOCH_COVER로 바꿔 끼운다(hooch 윗면과 같은 소스)
// #hoochCover

// 칸 해시 — 칸 번호를 37로 접어(정수라 fp16에서도 정확) 중간값을 16 아래로 묶는다. mediump(유효 11비트)에서도
// 소수 7비트(1/128)가 남아 지터가 뭉개지지 않는다. 옛 sin 큰 배율 해시는 fp16에서 줄무늬로 무너진다
vec3 hash3(vec2 c) {
  vec3 p = fract(mod(c.xyx, 37.0) * vec3(0.1031, 0.1030, 0.0973));
  p = fract(p + dot(p, p.yzx + 2.33));
  return fract((p.xxy + p.yzz) * p.zyx * 7.31);
}

// 칸 하나 = 기포 하나 — 자기 칸만 본다(이웃 탐색 없음). 기포는 칸 안에 들어가게 반지름을 묶고 중심을 지터한다.
//   uv = 칸 단위 좌표, cell = 칸 크기(월드), pres = 칸에 기포가 있을 확률(빈칸이 격자를 지운다),
//   r0·r1 = 반지름 범위(월드, 작은 것이 많다), asp = 세로/가로 비, grow = 크기 배율.
// 반환: x = 속(부드러운 가장자리) · y = 테두리 고리 · z = 국소 세로 좌표(위 +) · w = 크기 0~1
vec4 cellBubble(vec2 uv, vec2 cell, float pres, float r0, float r1, float asp, float grow) {
  vec3 h = hash3(floor(uv));
  if (h.z >= pres) return vec4(0.0);
  float h4 = fract(h.x * 5.37 + h.y * 2.91);
  float r = mix(r0, r1, h4 * h4) * grow;
  float a = asp * mix(0.8, 1.25, fract(h.y * 3.7 + h.z * 11.3)); // 칸마다 타원비
  vec2 rad = min(vec2(r * inversesqrt(a), r * sqrt(a)), cell * 0.36);
  vec2 lo = rad / cell;
  vec2 q = (fract(uv) - lo - (1.0 - 2.0 * lo) * h.xy) * cell / rad;
  // 휨 — 납작할수록 더 휜다(렌즈가 알약 · 씨앗 꼴로 줄서지 않게). 부호는 크기(h4)와 따로 놀아야 큰 칸이 다 같은 쪽으로
  // 휘지 않는다 — 위로 볼록한 회색 초승달이 줄지으면 「감은 눈」(판정 L1). 최대치 0.3 → 0.2
  q.y += (fract(h.x * 7.13 + h.z * 3.71) - 0.5) * 0.4 / a * q.x * q.x;
  float d = length(q);
  float ring = smoothstep(0.5, 0.88, d) * (1.0 - smoothstep(0.88, 1.15, d));
  return vec4(1.0 - smoothstep(0.62, 1.0, d), ring, q.y, h4);
}

// 느린 자람 — 칸마다 위상이 다른 부드러운 삼각파(trig 0). 흐르는 스크롤이 아니라 제자리에서 수십 초에 걸쳐 커졌다 준다
float slowGrow(float phase, float speed) {
  float t = abs(fract(uTime * speed + phase) - 0.5) * 2.0;
  return 0.88 + 0.12 * t * t * (3.0 - 2.0 * t);
}

void main() {
  // 알베도 모틀 — 젓은 물결의 휨에도 같은 값을 쓴다(추가 FBM 0)
  float mott = fbm(vXZ * 1.4 + 11.0);
  vec3 base = uColor * (1.0 + mott * 0.03);
  base *= mix(1.0, 0.93, uWet); // 젖으면 조금 진해진다(R2-12: 0.90 → 0.93, 젖은 광과 같이 다시 봄)

  // ── 하이트필드 그라디언트 합성: 범프4 + 트레일4 + poke + 돔/크레이터/꺼짐 + 기울기 + 파동 + 물결 + FBM ──
  vec2 dBs = vec2(0.0);
  float scar = 0.0; // 터진 기포 바늘구멍 — 음수 슬롯을 같은 루프에서 읽는다(exp 추가 0)
  for (int i = 0; i < 4; i++) {
    float k = uBumpK[i] * 1.6; // 라이팅 첨도 — ×1.6 (VISUAL §0)
    vec2 d = vXZ - uBumpPos[i];
    float a = uBumpAmp[i];
    dBs += a * exp(-dot(d, d) * k) * (-2.0 * k) * d;
    if (a < 0.0) scar += min(-a / SCAR_AMP, 1.0) * (1.0 - smoothstep(0.04, 0.28, dot(d, d) * uBumpK[i]));
  }
  for (int i = 0; i < 4; i++) {
    float k = uTrailK[i] * 1.6;
    vec2 d = vXZ - uTrailPos[i];
    dBs += uTrailAmp[i] * exp(-dot(d, d) * k) * (-2.0 * k) * d;
  }
  { // 탭 자국 — 조명이 봐야 "자국이 남았다 아문다"가 읽힌다 (§0-B)
    vec2 d = vXZ - uPokePos;
    float k = uPokeK * 1.6;
    dBs += (-uPokeAmt) * exp(-dot(d, d) * k) * (-2.0 * k) * d;
  }
  // 피크 돔 / 과숙 크레이터 / 하강 꺼짐 — kR은 vert와 같은 소스 (uRBody 확장 상대화)
  float kR = 0.3844 / (uRBody * uRBody);
  float c2 = dot(vXZ, vXZ);
  {
    float k1 = 4.0 * kR;
    dBs += (uRipe * 0.05 * vTop) * exp(-c2 * k1) * (-2.0 * k1) * vXZ;
  }
  if (uCollapse > 0.001) {
    float k2 = 3.2 * kR;
    dBs += (-uCollapse * 0.08 * vTop) * exp(-c2 * k2) * (-2.0 * k2) * vXZ;
  }
  float bowl = 0.0;
  if (uSink > 0.001) {
    float k3 = 3.0 * kR;
    float e3 = exp(-c2 * k3);
    bowl = max(e3 - 0.3156, 0.0) / 0.6844;
    dBs += (-uSink * 0.05 / 0.6844 * vTop) * e3 * (-2.0 * k3) * vXZ;
    // 부드러운 주름 — 높이 −√(f²+ε)·0.02: f = 0 자리가 골이 되는 접힌 결(덩어리가 아니라 주름). vert와 같은 식
    float f = fbm(vXZ * 6.0 + 2.0);
    dBs += (-f * inversesqrt(f * f + 0.02)) * fbmG(vXZ * 6.0 + 2.0) * (6.0 * 0.02 * uSink * bowl * vTop);
  }
  // 슬로싱 수면 기울기 — 기울어진 수면이 빛을 다르게 받는다 (버텍스와 동일 계수)
  dBs += uWobble * (0.14 * uLevel * (0.5 + 0.5 * uFluid) * vTop);
  // 유휴 진행파 기울기 — 반사광이 수면 위를 흘러간다 (버텍스와 위상 동기)
  dBs += vec2(0.90, 0.44) * (0.009 * 11.0 * cos(dot(vXZ, vec2(0.90, 0.44)) * 11.0 - uTime * 1.3)) * uFluid * vTop;
  dBs += vec2(-0.50, 0.87) * (0.6 * 0.009 * 17.0 * cos(dot(vXZ, vec2(-0.50, 0.87)) * 17.0 + uTime * 1.6)) * uFluid * vTop;
  // 갓 밥준 젓은 물결 — 한 방향 물결을 모틀로 휘게 한다. 조명(특히 젖은 광)만 바꾸는 옅은 결(R1 justfed)
  if (uStir > 0.01) {
    vec2 rd = vec2(0.62, 0.78);
    dBs += rd * (cos(dot(vXZ, rd) * 12.0 + mott * 9.0) * 12.0 * 0.006 * uStir * vTop);
  }
  // FBM 마이크로 — 해석적. 2026-11-19 R2-07 · A1-05: 0.1125 + 0.15·ripe(회색 덩어리의 주범) → 잔 광택 0.03만
  dBs += fbmG(vXZ * 5.0) * 0.03;

  // 벽 밴드 — 유리에 눌린 옆면. 윗면 하이트필드는 윗면 문법이다 — vXZ 단독 필드가 옆벽을 따라 세로 홈으로 번지지 않게 지운다
  float wallM = (1.0 - smoothstep(0.55, 0.95, abs(vBaseN.y))) * smoothstep(0.02, 0.16, vWallY);
  dBs *= 1.0 - 0.75 * wallM;

  // ── 노멀·확산 — 몸통(vBaseN) 위에 하이트필드 기울기 (§0-B: 형태 음영 복구) ──
  vec3 nrm = normalize(vBaseN + vec3(dBs.x, 0.0, dBs.y) * uSlopeAspect);
  // 반죽 전용 키 — 씬 KEY_POS보다 낮다(고도 28.6°). 얼룩 증폭은 노이즈 원천(fbmG · 기공)을 지워 해결했고,
  // 높이를 올리면 하강 주름 · 젓은 물결 · 돔의 결이 함께 죽어 그대로 둔다(A1-05 검토, VISUAL §1-3)
  vec3 L = normalize(vec3(-0.7, 0.45, 0.45));
  // wrap diffuse — 반투명 페이스트의 부드러운 터미네이터
  float ndl = clamp((dot(nrm, L) + 0.35) / 1.35, 0.0, 1.0);
  float slope = length(nrm.xz);

  // 반구 앰비언트 — 윗면 밝기 유지, 어깨·측면 하강 = 부피감 + 유리 접촉 그늘
  vec3 col = base * (0.58 + 0.16 * nrm.y + 0.44 * ndl) * vec3(1.04, 0.985, 0.915);

  // ── 광택(R2-12) — "병 위 소프트박스" 상수 하프벡터. 젖으면 넓고 부드럽게(지수 16 → 9), 세기는 uSpecStr이 상태를 나른다:
  //    갓 밥준 넓은 젖은 광 · 피크 새틴 · 배고픔 얇은 막 · 휴면 매트 ──
  {
    vec3 HS = normalize(vec3(-0.30, 1.0, 0.22));
    float sheet = pow(max(dot(nrm, HS), 0.0), mix(16.0, 9.0, uWet));
    // 균일 밝힘은 '반사'로 안 읽힌다 — 완만한 띠로 잘라 창 모양을 준다
    float band = 0.45 + 0.55 * smoothstep(-0.55, 0.30, dot(vXZ, vec2(-0.62, 0.78)));
    // normalize(L+V) — 직교 카메라라 V는 화면 전체에서 같다. viewMatrix 3행 = 카메라 +Z(월드)
    vec3 HC = normalize(L + vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
    float spec = sheet * band * (0.30 + 0.45 * uWet) + pow(max(dot(nrm, HC), 0.0), 5.0) * 0.05;
    col += vec3(0.28, 0.16, 0.08) * spec * uSpecStr;
  }
  // 경사 페널티 최소화 — 입체감은 ndl·반구가 담당
  col -= vec3(0.03, 0.022, 0.015) * slope;

  // ── 윗면 바늘구멍 · 잔거품 띠(R2-07) — 반죽보다 살짝 어두운 열린 구멍(검정 금지), 크기 제각각.
  //    피크 = 성기고 들쭉날쭉 + 큰 칸만 밝은 테(작은 분화구) · 배고픔 = 고른 잔 점 · 오르는 중 = 유리 닿는 가장자리 잔거품 ──
  if (vTop > 0.5 && uPin + uFoam > 0.004) {
    vec2 tw = vXZ * XZ_W;
    vec2 ut = tw / 0.07;
    ut.x += fract(floor(ut.y) * 0.618); // 줄마다 무리수 밀림 — 세로 열이 서지 않는다
    vec4 pin = cellBubble(ut, vec2(0.07), uPin * 0.7,
                          mix(0.007, 0.005, uRipe), mix(0.011, 0.022, uRipe), 1.0, 1.0);
    float rr = length(vXZ) / uRBody;
    // 유리에 올라붙은 메니스커스 끝(rr 0.94~)은 거의 수직이라 xz 칸이 화면에서 1px 폭 세로 실선으로 늘어난다 —
    // 테 바로 아래 매달린 실선(판정 L2)의 원인. 벽 기포를 꺼도 남았다(wallCells=0 캡처). 구멍 · 거품 점만 거기서 끊는다
    float flatTop = 1.0 - smoothstep(0.93, 0.985, rr);
    float crater = pin.y * pin.w * pin.w * uRipe * flatTop; // 큰 구멍만 테가 밝다
    // 따뜻한 그늘(실물 07) — 회색 점은 후추 · 먼지로 읽힌다. 피크(uRipe)는 2배로 짙게(판정 M5 — 실물 sdL 6.5~14 대 렌더 1.9)
    col *= 1.0 - vec3(0.055, 0.068, 0.09) * pin.x * (1.0 + uRipe) * flatTop;
    col += vec3(0.05, 0.042, 0.03) * crater * (0.6 + 0.6 * uSpecStr);
    float edge = smoothstep(0.80, 0.97, rr) * uFoam;
    if (edge > 0.01) {
      vec4 fb = cellBubble(tw / 0.032, vec2(0.032), 0.85 * edge, 0.003, 0.008, 1.0, 1.0);
      col = mix(col, col * vec3(1.025, 1.03, 1.04), edge * 0.45); // 거품은 살짝 밝고 차갑다(R1 #dedfdc)
      col *= 1.0 - 0.06 * fb.x * flatTop;
    }
  }
  // 터진 기포가 남긴 바늘구멍 — 몇 초에 걸쳐 옅어진다(bubbles.ts SCAR_SEC)
  col *= 1.0 - 0.08 * min(scar, 1.0) * vTop;

  // ── 유리 너머 기포 단면(R2-04 · A1-06) — 「반죽이 아니라 르방」의 단일 최강 단서. 원통 매개(호 길이 × 높이, 월드)라
  //    유리에 붙은 기포가 화면 가장자리에서 자연스럽게 눌려 보인다. atan 분기컷은 병 뒤쪽(보이지 않는 옆벽)이다.
  //    잔 기포(아래 촘촘) · 중간(위로 갈수록 크고 성김, 피크엔 세로 터널) · 큰 주머니(피크 윗면 아래 띠) 3층.
  //    속 = 반죽보다 조금 어둡고 차가운 회색(R1 #aaa8af), 위 테두리만 부드럽게 밝다. 막 등고선 · 별 · 줄무늬 없음 ──
  if (uWallCell.x > 0.004 && vTop < 0.5) {
    vec2 wuv = vec2(atan(vXZ.x, vXZ.y) * uRBody * XZ_W, vY);
    float dens = uWallCell.x;
    float big = clamp((80.0 - uWallCell.y) / 46.0, 0.0, 1.0); // 0 잘다(갓 밥준) ~ 1 크다(피크)
    float up = vWallY;
    float sp = 0.004 + 0.012 * uNoiseSpeed / 1.6;            // 활동이 높을수록 조금 빨리 자란다(주기 50~250초)
    vec2 ua = wuv / 0.05;
    ua.x += fract(floor(ua.y) * 0.618);
    vec4 fa = cellBubble(ua, vec2(0.05), dens * mix(0.6, 0.32, up), 0.006, mix(0.009, 0.016, big) * mix(0.8, 1.15, up),
                         1.0, 1.0);
    vec2 ub = wuv / vec2(0.11, 0.13) + vec2(0.37, 0.0);
    ub.x += fract(floor(ub.y) * 0.618);
    float popUp = 1.0 - 0.6 * uSink * smoothstep(0.5, 0.9, up); // 하강 = 위쪽 기포가 터져 듬성듬성
    vec4 fb = cellBubble(ub, vec2(0.11, 0.13), dens * (0.15 + 0.5 * big) * mix(0.35, 0.75, up) * popUp,
                         0.012, mix(0.022, 0.04, big) * mix(0.75, 1.2, up), mix(1.0, 1.9, uRipe),
                         slowGrow(fract(floor(ub.x) * 0.37 + floor(ub.y) * 0.61), sp));
    vec4 fc = vec4(0.0);
    // 윗면 바로 아래 큰 공기 주머니 띠(실물 09) — 둥글고 크기 제각각 · 서로 붙어 있다. 납작한 가로 렌즈가 같은 방향으로
    // 늘어서면 쌀알 · 씨앗 · 감은 눈으로 읽혔다(2026-11-19 아트 판정) → 타원비 ≈1 · 정사각에 가까운 칸 · 위 띠에만
    if (uRipe > 0.05 && up > 0.55) {
      vec2 uc = wuv / vec2(0.21, 0.18) + vec2(0.71, 0.29);
      uc.x += fract(floor(uc.y) * 0.618);
      fc = cellBubble(uc, vec2(0.21, 0.18), dens * uRipe * 0.6 * smoothstep(0.6, 0.86, up),
                      0.04, 0.068, 0.9, slowGrow(fract(floor(uc.x) * 0.53 + floor(uc.y) * 0.29), sp * 0.6));
    }
    // 속 색 — 세 층 모두 따뜻한 그늘(실물 07 · 09). 차가운 회색 · 밝은 회백은 먼지 · 눈알로 읽혔다
    // 회색 잔점은 먼지 · 물감 튄 자국으로 읽혔다(P1b 첫 캡처)
    float w = smoothstep(0.0, 0.02, 1.0 - vWallY) * smoothstep(0.0, 0.04, vWallY); // 윗선 · 바닥에서 끊는다
    vec3 warmSh = vec3(0.925, 0.895, 0.845);
    col *= mix(vec3(1.0), warmSh, fa.x * 0.75 * w);
    col *= mix(vec3(1.0), vec3(0.905, 0.87, 0.815), fb.x * w); // 중간 기포는 한 단계 더 짙은 그늘(실물 07 · ΔL* ≈ −10)
    // 큰 주머니 = 다른 층과 같은 따뜻한 옅은 그늘, 테두리 선 없음. 밝은 회백 속에 짙은 테를 두르면 흰 원 + 고리 = 눈알 ·
    // 진주로 읽혔다(2026-11-19 아트 판정). 위 테만 살짝 밝혀 오목한 주머니로
    col *= mix(vec3(1.0), vec3(0.95, 0.925, 0.885), fc.x * w);
    float rimHi = max(max(fa.y * 0.4 * clamp(fa.z, 0.0, 1.0), fb.y * clamp(fb.z, 0.0, 1.0)), fc.y * 0.6 * clamp(fc.z, 0.0, 1.0));
    col += vec3(0.05, 0.044, 0.034) * rimHi * w;
  }

  // 윈도우페인 — grab 신장부가 얇아지며 밝아진다 (§4-2-4)
  float wpane = clamp(vStretch * 1.6, 0.0, 0.4);
  col = mix(col, col * vec3(1.16, 1.12, 1.05) + vec3(0.035, 0.03, 0.02), wpane);

  // 겹(글루텐 가닥) — 당김 직교 사인 줄무늬, 신장부에만
  if (vStretch > 0.01) {
    vec2 sdir = normalize(uGrabDisp + vec2(1e-5, 0.0));
    float sOrtho = dot(vXZ - uGrabPos, vec2(-sdir.y, sdir.x));
    float strand = 0.5 + 0.5 * sin(sOrtho * 46.0 + fbm(vXZ * 4.0) * 3.0);
    // 겹은 글루텐 망이 만든다 — 시큼(응집 0)에선 사라진다. "끊겼다"가 눈으로 읽히는 지점
    col -= vec3(0.045, 0.038, 0.028) * strand * clamp(vStretch * 1.4, 0.0, 0.5)
         * (0.35 + 0.65 * uCohesion);
  }

  // ── 용기 접촉 (§2-3): 벽 쪽 접촉 그늘 + 벽을 타고 오른 밝은 메니스커스 테 ──
  {
    float rr2 = length(vXZ);
    // 반경 밴드는 전부 uRBody 상대. 접촉 그늘은 윗면 가장자리 전용 — 옆벽은 rr2가 늘 uRBody라 통째로 회색이 된다(v2)
    col *= 1.0 - 0.10 * smoothstep(uRBody * 0.645, uRBody, rr2) * vTop;
    // 유리 너머 옆벽 — 정면 확산광이 약한 수직면이라 크림이 회색으로 죽는다. 유리에 눌린 단면 톤으로 올린다
    col *= 1.0 + 0.08 * (1.0 - vTop);
    // 메니스커스 — 끈적할수록(cohesion) 벽을 더 타고 오른다
    col += vec3(0.20, 0.17, 0.13) * smoothstep(uRBody * 0.86, uRBody, rr2)
         * (0.25 + 0.45 * uWet + 0.30 * uCohesion) * vTop * uLevel;
  }

  // 휴면 마른 껍질 — 매트 + 잔금. 잔금은 FBM 0 등고선을 다른 저주파 FBM으로 잘라 짧게 끊긴 가는 금 몇 줄만 남긴다 —
  // 이어진 등고선은 닫힌 칸 그물(지도 · 기린 무늬 · 핏줄)로 읽혔다(2026-11-19 다듬기). hooch가 덮인 곳은 젖어 있어 금이 없다
  if (uCrust > 0.001) {
    float crack = fbm(vXZ * 9.0 + fbm(vXZ * 4.0) * 0.7); // 휨을 줄여 곧은 금 — 굽이치는 선은 핏줄로 읽혔다
    float line = 1.0 - smoothstep(0.012, 0.04, abs(crack));
    line *= smoothstep(0.2, 0.42, fbm(vXZ * 3.1 + 23.0 + uSeed * 11.0));
    float centerFade = 1.0 - smoothstep(uRBody * 0.774, uRBody * 1.097, length(vXZ));
    float dry = 1.0 - hoochCover(length(vXZ) / uRBody, atan(vXZ.y, vXZ.x), uHooch);
    col = mix(col, col * vec3(0.995, 0.975, 0.945), uCrust);
    col -= vec3(0.034, 0.03, 0.026) * line * uCrust * centerFade * dry * vTop;
  }

  // 밥주기 밀가루 덮임 (M5 연출)
  if (uFlourDust > 0.001) {
    float f = 0.5 + 0.5 * sin(vXZ.x * 47.0) * sin(vXZ.y * 43.0);
    col = mix(col, vec3(0.985, 0.972, 0.945), uFlourDust * (0.55 + 0.35 * f));
  }

  // kahm 효모 막 — 수면 전체를 덮는 주름진 흰 막 (초타원 확장 반영 0.52~0.70)
  if (uKahm > 0.01) {
    float wrinkle = 0.5 + 0.5 * sin(vXZ.x * 24.0 + fbm(vXZ * 6.0) * 4.0 + vXZ.y * 9.0);
    float film = uKahm * (1.0 - smoothstep(uRBody * 0.839, uRBody * 1.129, length(vXZ)));
    col = mix(col, vec3(0.93, 0.91, 0.85), film * (0.30 + 0.30 * wrinkle));
  }

  // ── 곰팡이(R2-10, 개정 2026-11-19 다듬기) — 「흰 솜털 반점」(실물 25 · 26 · 27). 군락 = 반죽보다 희고 덜 노란 몸통 +
  //    고주파로 흐리게 부푼 솜털 테 + 비껴 앉은 옅은 기운(시드별 흰 · 청록 · 분홍빛 회색). 짙은 가운데 덩어리는
  //    재 · 먼지 · 얼룩으로 읽혀 뺐다. 완전 매트(상수 색으로 섞어 광을 지운다). 반경 · 문턱은 vert와 같은 식 ──
  if (uMold > 0.001 && vTop > 0.5) {
    float edgeN = fbm(vXZ * 9.0 + uSeed * 7.0);   // 테 흔들림(저주파)
    float fuzz = fbm(vXZ * 23.0 - uSeed * 5.0);   // 솜털 결
    // 솜털 끝 — 1~2px 칸 해시 디더(고주파). sin FBM을 고주파로 올리면 테가 톱니 · 구름 꼴로 규칙적으로 물결쳤다
    float hair = hash3(floor(vXZ * 380.0)).x;
    float body = 0.0;
    float coreW = 0.0;
    vec3 coreSum = vec3(0.0);
    for (int i = 0; i < 5; i++) {
      vec4 m = uMoldA[i];
      float th = i == 0 ? 0.0 : 0.2 + 0.09 * float(i); // 반점 1~2개 → 퍼짐에서 5개까지
      float gate = smoothstep(th, th + 0.08, uMold);
      vec2 md = (vXZ - m.xy) / (uRBody * (0.07 + 0.2 * uMold) * m.z);
      float d = length(md) + edgeN * 0.26 + fuzz * 0.07;
      body = max(body, (1.0 - smoothstep(0.35, 1.05, d)) * gate);
      // 기운은 몸통 중심에서 비껴 있고 솜털 결로 테가 찢긴다 — 둥근 눈동자가 되지 않게
      float dc = length(md - vec2(0.24, -0.15)) + fuzz * 0.3 + edgeN * 0.15;
      float cr = (1.0 - smoothstep(0.0, 0.55, dc)) * gate;
      vec3 cc = m.w < 0.5 ? vec3(0.90, 0.90, 0.885) : (m.w < 1.5 ? vec3(0.79, 0.855, 0.83) : vec3(0.88, 0.79, 0.785));
      coreSum += cc * cr;
      coreW += cr;
    }
    float shade = 0.9 + 0.1 * ndl;
    // 몸통이 옅어지는 테에서만 디더가 듬성듬성 갉아 솜털이 된다(속은 꽉 찬 흰색)
    float fluff = clamp((body - 0.4 * hair) / 0.6, 0.0, 1.0);
    col = mix(col, vec3(0.965, 0.96, 0.945) * (0.97 + 0.03 * fuzz) * shade, fluff * 0.92);
    col = mix(col, coreSum / max(coreW, 1e-3) * shade, min(coreW, 1.0) * 0.38 * fluff);
  }

  gl_FragColor = vec4(col, 1.0);
}
