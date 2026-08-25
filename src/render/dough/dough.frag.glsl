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
uniform float uSeed;
uniform float uLevel;      // (구 uLiquid) 형상 — 평평함. vert와 같은 소스
uniform float uFluid;      // 흐름 — 슬로싱·진행파 조명 짝
uniform float uCohesion;   // 응집 — 겹 가닥·메니스커스 세기
uniform float uRBody;      // 몸통 적도 반경 = R × wallFill — **모든 반경 밴드의 정규화 기준**
uniform vec2 uWallCell;    // x=유리벽 기공 세기, y=주파수
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
varying vec2 vWallUV;      // 유리벽 기공 도메인 (vert와 단일 소스)
varying float vWallY;      // 몸통 내 정규화 높이 0~1

// 유리벽 기공 — 값과 기울기를 한 번에. sin·cos 곱의 도함수는 이미 뽑은 항의 재조합이라
// fbm+fbmG(18 trig)보다 싸다. 2옥타브 8 trig ≈ fbm 1.33회. 전치 규약은 fbmG와 동일
float cellField(vec2 p, out vec2 g) {
  mat2 Rm = mat2(0.80, -0.60, 0.60, 0.80);
  mat2 J = mat2(1.84, -1.38, 1.38, 1.84);   // 2.30·Rm — 연쇄법칙 야코비안
  float s0 = sin(p.x), c0 = cos(p.x), s1 = sin(p.y), c1 = cos(p.y);
  float v = s0 * c1;
  g = vec2(c0 * c1, -s0 * s1);
  vec2 q = Rm * p * 2.30 + 4.7;             // 무리수 회전 + 비정수 배율 = 격자 티 제거
  float s2 = sin(q.x), c2 = cos(q.x), s3 = sin(q.y), c3 = cos(q.y);
  v += 0.45 * s2 * c3;
  g += 0.45 * vec2(c2 * c3, -s2 * s3) * J;
  return v * 0.69;
}

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
  { // 피크 돔 / 과숙 크레이터 — kR은 vert와 같은 소스 (uRBody 확장 상대화)
    float kR = 0.3844 / (uRBody * uRBody);
    float k1 = 4.0 * kR;
    dBs += (uRipe * 0.05) * exp(-dot(vXZ, vXZ) * k1) * (-2.0 * k1) * vXZ;
    float k2 = 3.2 * kR;
    dBs += (-uCollapse * 0.08) * exp(-dot(vXZ, vXZ) * k2) * (-2.0 * k2) * vXZ;
  }
  // 슬로싱 수면 기울기 — 기울어진 수면이 빛을 다르게 받는다 (버텍스와 동일 계수)
  dBs += uWobble * (0.14 * uLevel * (0.5 + 0.5 * uFluid) * vTop);
  // 유휴 진행파 기울기 — 반사광이 수면 위를 흘러간다 (버텍스와 위상 동기)
  dBs += vec2(0.90, 0.44) * (0.009 * 11.0 * cos(dot(vXZ, vec2(0.90, 0.44)) * 11.0 - uTime * 1.3)) * uFluid * vTop;
  dBs += vec2(-0.50, 0.87) * (0.6 * 0.009 * 17.0 * cos(dot(vXZ, vec2(-0.50, 0.87)) * 17.0 + uTime * 1.6)) * uFluid * vTop;
  // FBM 마이크로 — 해석적 (구 유한차분 Δ0.25 × 0.45 = ×0.1125 진폭 등가).
  // 피크 크래그(vert의 disp += fbm(p.xz*5.0)*0.030*uRipe*vTop)의 기울기 짝을 같은 호출에 얹는다:
  // d/dx[0.030·fbm(5x)] = 0.030·5·fbmG(5x) = 0.15·fbmG. 추가 FBM 호출 0
  dBs += fbmG(vXZ * 5.0) * (0.1125 + 0.15 * uRipe * vTop);

  // 벽 밴드 — 유리에 눌린 옆면. vBaseN이 초타원 아날리틱 노멀이라 벽/윗면 경계가 기하학적으로
  // 정확하고 uLevel이 변해도 따라온다. abs()로 바닥면도 배제.
  // ⚠ 임계값 주의: 55° 부감에서 실제로 보이는 '벽'은 수직면이 아니라 **어깨**다. 처음 (0.30,0.70)으로
  // 잡았더니 어깨가 마스크 밖이라 세로 홈이 그대로 남았다(렌더 검수 2026-08-25 실측). 넓게 잡는다
  float wallM = (1.0 - smoothstep(0.55, 0.95, abs(vBaseN.y))) * smoothstep(0.02, 0.16, vWallY);
  // 윗면 하이트필드는 윗면 문법이다 — 실루엣이 원통에 가까울수록 vXZ 단독 필드가 벽을 따라
  // **세로 홈**으로 번진다(한 방위선은 높이가 달라도 vXZ가 같다). 기공을 얹기 전에 먼저 지운다
  dBs *= 1.0 - 0.75 * wallM;

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

  // 발효 거품 표면 — 두 스케일 기공 (§4-2b 준수: 얕은 음영 + 밝은 림).
  // 게이트 추가(2026-08-25): 죽은 상태(휴면·kahm·곰팡이)에선 uPoreDensity가 0이라 FBM 2회를 통째로
  // 건너뛴다 — 살아있는 분기와 죽은 분기를 상호배타로 만들어 예산 상한을 11 → 8로 내린다
  if (uPoreDensity > 0.004) {
    float f1 = fbm(vXZ * 14.0 + 3.0);
    float pin = smoothstep(0.40, 0.62, f1) * uPoreDensity;
    float f2 = fbm(vXZ * 6.5 - 8.0);
    float crater = smoothstep(0.55, 0.78, f2) * uPoreDensity;
    float rim = smoothstep(0.44, 0.56, f2) * (1.0 - crater) * uPoreDensity;
    // 윗면 기공은 윗면에만 — 벽에서는 아래 유리벽 기공이 대신한다
    float topOnly = 1.0 - 0.85 * wallM;
    col -= vec3(0.085, 0.075, 0.055) * pin * topOnly;
    col -= vec3(0.055, 0.050, 0.038) * crater * topOnly;
    col += vec3(0.055, 0.045, 0.030) * rim * (0.6 + 0.6 * uWet) * topOnly;
  }

  // ── 유리벽 기공 (2026-08-25 신설) — "반죽이 아니라 르방"의 단일 최강 단서 ──
  // 안전 규칙(§4-2b): 어두운 항은 볼록 돔의 아래쪽 램버트뿐(최대 −0.030 = 기존 다크 포어의 35%),
  // 닫힌 링이 아니다. 위쪽 하이라이트가 우세 → '빛은 위에서' 가정으로 볼록=부푼 반죽으로 읽힌다.
  // 셀이 서로 맞닿아 폼(테셀레이션)을 이루므로 '고립된 원형 구멍의 밀집 격자'가 아니다
  if (uWallCell.x > 0.004 && wallM > 0.01) {
    // 크기 구배 — 아래는 압력에 눌려 잘고 촘촘, 위는 합쳐져 크고 성글 (실물 병 사진의 문법)
    float freq = uWallCell.y * mix(1.25, 0.72, vWallY);
    // 피크에선 세로로 늘어난 터널 기포가 벽에 붙는다(실사진: "elongated/tunnel bubbles near wall").
    // 세로 도메인을 눌러 셀을 위아래로 길게 만든다 — 등방성 셀은 물방울이지 발효 기공이 아니다
    float stretch = mix(1.0, 0.62, smoothstep(0.55, 1.0, uWallCell.x));
    vec2 g;
    float v = cellField(vWallUV * vec2(freq, freq * stretch), g);
    float cell = smoothstep(0.02, 0.55, v);      // 넓은 전이 = 저대비 + 연속 크기 분포
    float memb = cell * (1.0 - cell) * 4.0;      // 셀 경계 능선(막) — 밝은 실선, 어두운 테두리 아님
    float hi = clamp(-g.y * 0.55, 0.0, 1.0);     // 위쪽 면
    float lo = clamp(g.y * 0.34, 0.0, 1.0);      // 아래쪽 면 — 밝은 쪽이 우세하도록 계수를 낮춘다
    float w = uWallCell.x * wallM;
    // 밝은 쪽만 키운다 — 어두운 항(0.030)은 그대로 두어 기존 다크 포어(0.085)의 35%를 유지한다.
    // 첫 실측에서 기공이 아예 안 읽혔다(렌더 검수 2026-08-25) — 대비가 아니라 **밝기**를 올린 것
    col += vec3(0.110, 0.091, 0.062) * hi * cell * w * (0.55 + 0.45 * uWet);
    col -= vec3(0.030, 0.026, 0.020) * lo * cell * w;
    col += vec3(0.045, 0.038, 0.027) * memb * w;
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
    // 반경 밴드는 전부 uRBody 상대 — 몸통이 유리까지 확장되면서 |vXZ| 상한이 0.62 → 0.690으로
    // 커졌다. 절대 상수로 두면 승인된 룩(접촉 그늘·메니스커스·crackle·crust·kahm)이 조용히 이동한다
    col *= 1.0 - 0.10 * smoothstep(uRBody * 0.645, uRBody, rr2);
    // 메니스커스 — 지금까지 rr2 최대(0.62)가 하한(0.58)을 겨우 넘어 **영원히 30% 세기**로 잠겨 있었다.
    // uRBody 확장으로 비로소 제대로 발동한다. 끈적할수록(cohesion) 벽을 더 타고 오른다
    col += vec3(0.20, 0.17, 0.13) * smoothstep(uRBody * 0.86, uRBody, rr2)
         * (0.25 + 0.45 * uWet + 0.30 * uCohesion) * vTop * uLevel;
  }

  // 피크 crackle — 표면이 당겨지며 갈라지는 미세 스트리크 (윗면, 초타원 확장 반영 0.46~0.66)
  if (uRipe > 0.02) {
    float crk = smoothstep(0.80, 0.95, abs(fbm(vXZ * vec2(9.0, 3.5) + 7.7)));
    float cFade = 1.0 - smoothstep(uRBody * 0.742, uRBody * 1.065, length(vXZ));
    col -= vec3(0.05, 0.04, 0.03) * crk * uRipe * cFade;
  }

  // 휴면 마른 껍질 — 크랙 음영
  if (uCrust > 0.001) {
    float crack = fbm(vXZ * 11.0 + fbm(vXZ * 4.0) * 1.6);
    float line = smoothstep(0.62, 0.85, abs(crack));
    float centerFade = 1.0 - smoothstep(uRBody * 0.774, uRBody * 1.097, length(vXZ));
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
    float film = uKahm * (1.0 - smoothstep(uRBody * 0.839, uRBody * 1.129, length(vXZ)));
    col = mix(col, vec3(0.93, 0.91, 0.85), film * (0.30 + 0.30 * wrinkle));
  }

  // 곰팡이 보풀 — 흰/초록 반점, 다이제틱 (시드 고정)
  if (uMold > 0.001) {
    float m = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float ang = hash1(uSeed * 12.9898 + fi * 78.233) * 6.2831;
      float rad = 0.10 + 0.30 * hash1(uSeed * 39.346 + fi * 11.135);
      vec2 c = vec2(cos(ang), sin(ang)) * rad;
      float gate = step(fi * 0.2, uMold * 1.4);
      float rr = 0.05 + 0.11 * uMold;
      m += gate * smoothstep(rr, rr * 0.3, length(vXZ - c));
    }
    m = min(m, 1.0) * (0.72 + 0.28 * (0.5 + 0.5 * fbm(vXZ * 18.0 + uSeed * 7.0)));
    vec3 moldCol = mix(vec3(0.60, 0.63, 0.50), vec3(0.38, 0.44, 0.33), smoothstep(0.3, 1.0, uMold));
    col = mix(col, moldCol, m * (0.55 + 0.45 * uMold));
    float fuzzHi = smoothstep(0.5, 0.9, fbm(vXZ * 22.0 + uSeed * 13.0));
    col = mix(col, vec3(0.94, 0.95, 0.90), m * fuzzHi * 0.5);
  }

  gl_FragColor = vec4(col, 1.0);
}
