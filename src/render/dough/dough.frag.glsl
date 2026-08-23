// 도우 프래그먼트 — 무광 페이스트 개편: 같은 uBump/uTrail 배열을 1.6배 첨도로 읽어
// 아날리틱 노멀 재구성 + FBM 마이크로 노멀. 2로브 스펙(상시 시트 + uWet 젖은 광),
// 알베도 모틀링, 표면 포어, kahm 막, 곰팡이 보풀(고정 시드 — 세션 간 자리 불변).
// 주의: precision 선언 금지 — three 프렐류드와 버텍스/프래그 공유 uniform 정밀도가 어긋난다.
uniform float uTime;
uniform vec3 uColor;
uniform float uSpecStr;
uniform float uCrust;
uniform float uFlourDust;
uniform float uWet;
uniform float uRipe;
uniform float uPoreDensity;
uniform float uKahm;
uniform float uMold;
uniform float uMoldSeed;
uniform vec2 uBumpPos[8];
uniform float uBumpAmp[8];
uniform float uBumpK[8];
uniform vec2 uTrailPos[4];
uniform float uTrailAmp[4];
varying vec2 vXZ;

float fbm(vec2 p) {
  mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
  float v = 0.6 * sin(p.x) * cos(p.y);
  p = R * p * 1.9 + 13.7;
  v += 0.3 * sin(p.x) * cos(p.y);
  p = R * p * 1.9 + 5.1;
  v += 0.15 * sin(p.x) * cos(p.y);
  return v;
}

float hash1(float x) { return fract(sin(x) * 43758.5453); }

void main() {
  // ── 아날리틱 노멀: 범프8 + 트레일4 그라디언트 + FBM 마이크로 (유한차분) ──
  vec2 dBs = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    float k = uBumpK[i] * 1.6; // 라이팅 첨도 — ×3은 '그려진 데칼'로 읽혀 ×1.6로 완화 (VISUAL §0)
    vec2 d = vXZ - uBumpPos[i];
    dBs += uBumpAmp[i] * exp(-dot(d, d) * k) * (-2.0 * k) * d;
  }
  for (int i = 0; i < 4; i++) {
    float k = 42.0;
    vec2 d = vXZ - uTrailPos[i];
    dBs += uTrailAmp[i] * exp(-dot(d, d) * k) * (-2.0 * k) * d;
  }
  float e = 0.05;
  float hC = fbm(vXZ * 5.0);
  vec2 micro = vec2(fbm(vXZ * 5.0 + vec2(e * 5.0, 0.0)) - hC, fbm(vXZ * 5.0 + vec2(0.0, e * 5.0)) - hC);
  dBs += micro * 0.45;

  vec3 nrm = normalize(vec3(dBs.x, 1.0, dBs.y));
  vec3 L = normalize(vec3(-0.7, 0.45, 0.45));
  float ndl = max(0.0, dot(nrm, L));

  // ── 2로브 스펙: 상시 광폭 시트(무광 페이스트의 은은한 결) + 급여 직후 젖은 광 ──
  float spec = pow(ndl, 6.0) * 0.10 + pow(ndl, 40.0) * 0.50 * uWet;
  float slope = length(nrm.xz);

  // 알베도 모틀링 ±3% — 균일 플라스틱 탈피
  vec3 base = uColor * (1.0 + fbm(vXZ * 1.4 + 11.0) * 0.03);

  // 틸트 뷰 명도 보정(프로토 0.62+0.48) + 따뜻한 키라이트 색(씬 0xffe2b0과 톤 일치)
  vec3 col = base * (0.70 + 0.44 * ndl) * vec3(1.04, 0.985, 0.915);
  col += vec3(0.28, 0.16, 0.08) * spec * uSpecStr;
  col -= vec3(0.06, 0.045, 0.03) * slope; // 0.14 → 0.06: 함몰 경사 회색 얼룩 제거

  // 표면 포어 — 발효 기공 핀홀 (활성도 따라 밀도 변조)
  float pore = smoothstep(0.55, 0.78, fbm(vXZ * 14.0 + 3.0)) * uPoreDensity;
  col -= vec3(0.10, 0.085, 0.06) * pore;

  // 피크 crackle — 표면이 당겨지며 갈라지는 미세 스트리크 (윗면 중심부만)
  if (uRipe > 0.02) {
    float crk = smoothstep(0.80, 0.95, abs(fbm(vXZ * vec2(9.0, 3.5) + 7.7)));
    float cFade = 1.0 - smoothstep(0.3, 0.5, length(vXZ));
    col -= vec3(0.05, 0.04, 0.03) * crk * uRipe * cFade;
  }

  // 휴면 마른 껍질 — 크랙 음영 (격자 sin·sin → 도메인 워프 FBM)
  if (uCrust > 0.001) {
    float crack = fbm(vXZ * 11.0 + fbm(vXZ * 4.0) * 1.6);
    float line = smoothstep(0.62, 0.85, abs(crack));
    float centerFade = 1.0 - smoothstep(0.32, 0.5, length(vXZ)); // 측면 재봉선 아티팩트 방지 — 윗면만
    col = mix(col, col * vec3(0.995, 0.975, 0.945), uCrust);
    col -= vec3(0.05, 0.045, 0.04) * line * uCrust * centerFade;
  }

  // 밥주기 밀가루 덮임 (M5 연출)
  if (uFlourDust > 0.001) {
    float f = 0.5 + 0.5 * sin(vXZ.x * 47.0) * sin(vXZ.y * 43.0);
    col = mix(col, vec3(0.985, 0.972, 0.945), uFlourDust * (0.55 + 0.35 * f));
  }

  // kahm 효모 막 — 주름진 흰 막 (무해한 오판 유발자, 곰팡이와 구분되는 '주름' 문법)
  if (uKahm > 0.01) {
    float wrinkle = 0.5 + 0.5 * sin(vXZ.x * 24.0 + fbm(vXZ * 6.0) * 4.0 + vXZ.y * 9.0);
    float film = uKahm * (1.0 - smoothstep(0.30, 0.48, length(vXZ)));
    col = mix(col, vec3(0.93, 0.91, 0.85), film * (0.30 + 0.30 * wrinkle));
  }

  // 곰팡이 보풀 — 흰/초록 반점, 다이제틱(UI 빨강 금지 — VISUAL §7-1).
  // 시드 고정(createdAt 해시) — 세션마다 자리가 바뀌면 안 된다. 확산 = 반점 수·반경 증가
  if (uMold > 0.001) {
    float m = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float ang = hash1(uMoldSeed * 12.9898 + fi * 78.233) * 6.2831;
      float rad = 0.10 + 0.30 * hash1(uMoldSeed * 39.346 + fi * 11.135);
      vec2 c = vec2(cos(ang), sin(ang)) * rad;
      float gate = step(fi * 0.2, uMold * 1.4); // 확산할수록 반점이 늘어난다
      float rr = 0.05 + 0.11 * uMold;
      m += gate * smoothstep(rr, rr * 0.3, length(vXZ - c));
    }
    m = min(m, 1.0) * (0.72 + 0.28 * (0.5 + 0.5 * fbm(vXZ * 18.0 + uMoldSeed * 7.0))); // 보풀 털
    // 저대비 수정: 반점 몸통은 어두운 녹회색(바랜 반죽 위에서도 읽힘) + 흰 솜털 중심
    vec3 moldCol = mix(vec3(0.60, 0.63, 0.50), vec3(0.38, 0.44, 0.33), smoothstep(0.3, 1.0, uMold));
    col = mix(col, moldCol, m * (0.55 + 0.45 * uMold));
    float fuzzHi = smoothstep(0.5, 0.9, fbm(vXZ * 22.0 + uMoldSeed * 13.0));
    col = mix(col, vec3(0.94, 0.95, 0.90), m * fuzzHi * 0.5);
  }

  gl_FragColor = vec4(col, 1.0);
}
