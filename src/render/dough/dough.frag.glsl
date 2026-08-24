// 도우 프래그먼트 — 반유동체 개편 (2026-08-24, 오푸스 상담 §0·§2 반영):
//   ① 젖은 광 부활 — 기존 pow(ndl,40)은 이 라이트·카메라 기하에서 수학적으로 0(≈1e-13)이었다.
//      "병 위 소프트박스" 상수 하프벡터(HS)로 분리 — 젖은 음식 촬영 문법.
//   ② 조명이 몸통(vBaseN)과 변형 전부(poke·ripe·collapse·수면 기울기·진행파)를 본다.
//   ③ FBM 마이크로 노멀 유한차분(3회 호출) → 해석적 그라디언트 1회 — 추가분 예산 상쇄.
// 주의: precision 선언 금지 — three 프렐류드와 버텍스/프래그 공유 uniform 정밀도가 어긋난다.
uniform float uTime;
uniform vec3 uColor;
uniform float uSpecStr;
uniform float uCrust;
uniform float uFlourDust;
uniform float uWet;
uniform float uRipe;
uniform float uCollapse;
uniform float uPoreDensity;
uniform float uKahm;
uniform float uMold;
uniform float uMoldSeed;
uniform float uLiquid;
uniform vec2 uWobble;
uniform vec2 uBumpPos[8];
uniform float uBumpAmp[8];
uniform float uBumpK[8];
uniform vec2 uTrailPos[4];
uniform float uTrailAmp[4];
uniform float uTrailK[4];
uniform vec2 uPokePos;
uniform float uPokeAmt;
uniform float uPokeK;
uniform vec2 uGrabPos;
uniform vec2 uGrabDisp;
uniform float uRXZMax;
uniform float uSlopeAspect; // 진값 ≈ 0.6·fill — 1.0에서 시작, 실기기에서 하향 튜닝
varying vec2 vXZ;
varying float vStretch;
varying float vTop;
varying vec3 vBaseN;

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

float hash1(float x) { return fract(sin(x) * 43758.5453); }

void main() {
  // ── 하이트필드 그라디언트 합성: 범프8 + 트레일4 + poke + ripe/collapse + 기울기 + 파동 + FBM ──
  vec2 dBs = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    float k = uBumpK[i] * 1.6; // 라이팅 첨도 — ×1.6 (VISUAL §0)
    vec2 d = vXZ - uBumpPos[i];
    dBs += uBumpAmp[i] * exp(-dot(d, d) * k) * (-2.0 * k) * d;
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
  { // 피크 돔 / 과숙 크레이터
    float k1 = 4.0;
    dBs += (uRipe * 0.05) * exp(-dot(vXZ, vXZ) * k1) * (-2.0 * k1) * vXZ;
    float k2 = 3.2;
    dBs += (-uCollapse * 0.08) * exp(-dot(vXZ, vXZ) * k2) * (-2.0 * k2) * vXZ;
  }
  // 슬로싱 수면 기울기 — 기울어진 수면이 빛을 다르게 받는다 (버텍스와 동일 계수)
  dBs += uWobble * (0.14 * uLiquid * vTop);
  // 유휴 진행파 기울기 — 반사광이 수면 위를 흘러간다 (버텍스와 위상 동기)
  dBs += vec2(0.90, 0.44) * (0.009 * 11.0 * cos(dot(vXZ, vec2(0.90, 0.44)) * 11.0 - uTime * 1.3)) * uLiquid * vTop;
  dBs += vec2(-0.50, 0.87) * (0.6 * 0.009 * 17.0 * cos(dot(vXZ, vec2(-0.50, 0.87)) * 17.0 + uTime * 1.6)) * uLiquid * vTop;
  // FBM 마이크로 — 해석적 (구 유한차분 Δ0.25 × 0.45 = ×0.1125 진폭 등가)
  dBs += fbmG(vXZ * 5.0) * 0.1125;

  // ── 노멀·확산 — 몸통(vBaseN) 위에 하이트필드 기울기 (§0-B: 형태 음영 복구) ──
  vec3 nrm = normalize(vBaseN + vec3(dBs.x, 0.0, dBs.y) * uSlopeAspect);
  vec3 L = normalize(vec3(-0.7, 0.45, 0.45));
  // wrap diffuse — 반투명 페이스트의 부드러운 터미네이터
  float ndl = clamp((dot(nrm, L) + 0.35) / 1.35, 0.0, 1.0);
  float slope = length(nrm.xz);

  // 알베도 — 모틀링 ±3% + 젖으면 어두워지고 진해진다(마른 밝음이 아니라)
  vec3 base = uColor * (1.0 + fbm(vXZ * 1.4 + 11.0) * 0.03);
  base *= mix(1.0, 0.90, uWet);

  // 반구 앰비언트 — 윗면 밝기 유지, 어깨·측면 하강 = 부피감 + 유리 접촉 그늘
  vec3 col = base * (0.58 + 0.16 * nrm.y + 0.44 * ndl) * vec3(1.04, 0.985, 0.915);

  // ── 스펙 재설계 (§2-1): "병 위 소프트박스" 상수 하프벡터 — 확산광 L과 분리 ──
  {
    vec3 HS = normalize(vec3(-0.30, 1.0, 0.22));
    float sheet = pow(max(dot(nrm, HS), 0.0), 22.0);
    // 균일 밝힘은 '반사'로 안 읽힌다 — 완만한 띠로 잘라 창 모양을 준다
    float band = 0.45 + 0.55 * smoothstep(-0.55, 0.30, dot(vXZ, vec2(-0.62, 0.78)));
    vec3 HC = vec3(-0.405, 0.693, 0.597); // normalize(L+V) — 직교 카메라 상수
    float spec = sheet * band * (0.10 + 0.55 * uWet)
               + pow(max(dot(nrm, HC), 0.0), 5.0) * 0.05;
    col += vec3(0.28, 0.16, 0.08) * spec * uSpecStr;
  }
  // 경사 페널티 최소화 — 입체감은 ndl·반구가 담당
  col -= vec3(0.03, 0.022, 0.015) * slope;

  // 발효 거품 표면 — 두 스케일 기공 (§4-2b 준수: 얕은 음영 + 밝은 림)
  float f1 = fbm(vXZ * 14.0 + 3.0);
  float pin = smoothstep(0.40, 0.62, f1) * uPoreDensity;
  float f2 = fbm(vXZ * 6.5 - 8.0);
  float crater = smoothstep(0.55, 0.78, f2) * uPoreDensity;
  float rim = smoothstep(0.44, 0.56, f2) * (1.0 - crater) * uPoreDensity;
  col -= vec3(0.085, 0.075, 0.055) * pin;
  col -= vec3(0.055, 0.050, 0.038) * crater;
  col += vec3(0.055, 0.045, 0.030) * rim * (0.6 + 0.6 * uWet);

  // 윈도우페인 — grab 신장부가 얇아지며 밝아진다 (§4-2-4)
  float wpane = clamp(vStretch * 1.6, 0.0, 0.4);
  col = mix(col, col * vec3(1.16, 1.12, 1.05) + vec3(0.035, 0.03, 0.02), wpane);

  // 겹(글루텐 가닥) — 당김 직교 사인 줄무늬, 신장부에만
  if (vStretch > 0.01) {
    vec2 sdir = normalize(uGrabDisp + vec2(1e-5, 0.0));
    float sOrtho = dot(vXZ - uGrabPos, vec2(-sdir.y, sdir.x));
    float strand = 0.5 + 0.5 * sin(sOrtho * 46.0 + fbm(vXZ * 4.0) * 3.0);
    col -= vec3(0.045, 0.038, 0.028) * strand * clamp(vStretch * 1.4, 0.0, 0.5);
  }

  // 팝 링 하이라이트 — 함몰 잔상 대신 밝은 링 (음수 진폭 슬롯만, q·e^-q)
  float ringHi = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = uBumpAmp[i];
    if (a < -0.001) {
      vec2 d = vXZ - uBumpPos[i];
      float q = dot(d, d) * uBumpK[i];
      ringHi += -a * q * exp(-q) * 2.2;
    }
  }
  col += vec3(0.22, 0.14, 0.07) * min(ringHi, 0.25);

  // ── 용기 접촉 (§2-3): 벽 쪽 접촉 그늘 + 벽을 타고 오른 밝은 메니스커스 테 ──
  {
    float rr2 = length(vXZ);
    col *= 1.0 - 0.10 * smoothstep(0.40, 0.62, rr2);
    col += vec3(0.20, 0.17, 0.13) * smoothstep(0.58, uRXZMax, rr2) * (0.35 + 0.65 * uWet) * vTop * uLiquid;
  }

  // 피크 crackle — 표면이 당겨지며 갈라지는 미세 스트리크 (윗면, 초타원 확장 반영 0.46~0.66)
  if (uRipe > 0.02) {
    float crk = smoothstep(0.80, 0.95, abs(fbm(vXZ * vec2(9.0, 3.5) + 7.7)));
    float cFade = 1.0 - smoothstep(0.46, 0.66, length(vXZ));
    col -= vec3(0.05, 0.04, 0.03) * crk * uRipe * cFade;
  }

  // 휴면 마른 껍질 — 크랙 음영
  if (uCrust > 0.001) {
    float crack = fbm(vXZ * 11.0 + fbm(vXZ * 4.0) * 1.6);
    float line = smoothstep(0.62, 0.85, abs(crack));
    float centerFade = 1.0 - smoothstep(0.48, 0.68, length(vXZ));
    col = mix(col, col * vec3(0.995, 0.975, 0.945), uCrust);
    col -= vec3(0.05, 0.045, 0.04) * line * uCrust * centerFade;
  }

  // 밥주기 밀가루 덮임 (M5 연출)
  if (uFlourDust > 0.001) {
    float f = 0.5 + 0.5 * sin(vXZ.x * 47.0) * sin(vXZ.y * 43.0);
    col = mix(col, vec3(0.985, 0.972, 0.945), uFlourDust * (0.55 + 0.35 * f));
  }

  // kahm 효모 막 — 수면 전체를 덮는 주름진 흰 막 (초타원 확장 반영 0.52~0.70)
  if (uKahm > 0.01) {
    float wrinkle = 0.5 + 0.5 * sin(vXZ.x * 24.0 + fbm(vXZ * 6.0) * 4.0 + vXZ.y * 9.0);
    float film = uKahm * (1.0 - smoothstep(0.52, 0.70, length(vXZ)));
    col = mix(col, vec3(0.93, 0.91, 0.85), film * (0.30 + 0.30 * wrinkle));
  }

  // 곰팡이 보풀 — 흰/초록 반점, 다이제틱 (시드 고정)
  if (uMold > 0.001) {
    float m = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float ang = hash1(uMoldSeed * 12.9898 + fi * 78.233) * 6.2831;
      float rad = 0.10 + 0.30 * hash1(uMoldSeed * 39.346 + fi * 11.135);
      vec2 c = vec2(cos(ang), sin(ang)) * rad;
      float gate = step(fi * 0.2, uMold * 1.4);
      float rr = 0.05 + 0.11 * uMold;
      m += gate * smoothstep(rr, rr * 0.3, length(vXZ - c));
    }
    m = min(m, 1.0) * (0.72 + 0.28 * (0.5 + 0.5 * fbm(vXZ * 18.0 + uMoldSeed * 7.0)));
    vec3 moldCol = mix(vec3(0.60, 0.63, 0.50), vec3(0.38, 0.44, 0.33), smoothstep(0.3, 1.0, uMold));
    col = mix(col, moldCol, m * (0.55 + 0.45 * uMold));
    float fuzzHi = smoothstep(0.5, 0.9, fbm(vXZ * 22.0 + uMoldSeed * 13.0));
    col = mix(col, vec3(0.94, 0.95, 0.90), m * fuzzHi * 0.5);
  }

  gl_FragColor = vec4(col, 1.0);
}
