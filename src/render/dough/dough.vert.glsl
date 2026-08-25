// 도우 버텍스 — 반유동체 개편 (2026-08-24, 오푸스 상담 반영):
//   회전 초타원체(n=8) 실루엣 — 액체는 병을 채운다(평평한 윗면·바닥·둥근 어깨, 적도·극 스케일 1)
//   grab 2중 커널(몸통 Ricker + 좁은 리본) + 층별 위상(리드/지연) + 바닥 접착
//   슬로싱 = 수면 기울기(액체) + 잔여 강체 시프트(고체) / 유휴 진행파 / 소프트 니 반경 클램프
// 버텍스 첨도 = uBumpK, 프래그 첨도 = uBumpK×1.6 — 한 소스 구동 (VISUAL §0 함정 노트).
uniform float uTime;
uniform vec2 uWobble;
uniform float uNoiseSpeed;
uniform vec2 uBumpPos[8];
uniform float uBumpAmp[8];
uniform float uBumpK[8];
uniform vec2 uPokePos;
uniform float uPokeAmt;
uniform float uPokeK;
uniform vec2 uStirPos;
uniform vec2 uStirVec;
uniform vec2 uGrabPos;
uniform vec2 uGrabDisp;
uniform vec2 uGrabDispLag; // 하층 지연 위상(τ≈0.12s) — 층별 출렁임
uniform vec2 uGrabShape;   // x = 커널 첨도 k(릴리즈 후 퍼짐), y = 수직 리프트(릴리즈 후 τ0.35 감쇠)
uniform float uGrabWrinkle; // 리본 주름 게이트 — 놓으면 τ0.25로 먼저 소멸
uniform vec2 uTrailPos[4];
uniform float uTrailAmp[4];
uniform float uTrailK[4];  // 실 능선 첨도 — 나이 들수록 퍼진다(점성 기억)
uniform float uRipe;
uniform float uCollapse;
uniform float uLevel;      // (구 uLiquid) 0=돔(고체·마름) ~ 1=병 단면을 채운 수평면 — 형상 전용
uniform float uFluid;      // 흐름 — 슬로싱 배분·유휴 진행파. 형상과 분리(2026-08-25)
uniform float uRBody;      // 몸통 적도 반경(오브젝트) = R × wallFill. 프래그 밴드 정규화와 단일 소스
uniform float uRXZMax;     // 실루엣 반경 상한 — 유리 내벽 연동(CPU 계산)
uniform float uSeed;       // 개체 시드 — 정지 실루엣 덩어리 자리 (르방마다 다른 생김새)
varying vec2 vXZ;
varying float vStretch;
varying float vTop;        // 윗면 마스크 — 기울기·파동·메니스커스용
varying vec3 vBaseN;       // 변형 기준 노멀 — 프래그 폼셰이딩용
varying vec2 vWallUV;      // 유리벽 기공 도메인 (월드 단위, atan 없음 = 이음매 없음)
varying float vWallY;      // 몸통 내 정규화 높이 0~1 — 기공 크기 구배용

// 무리수 회전 3옥타브 트리그 FBM — 텍스처 fetch 0 (VISUAL §8)
float fbm(vec2 p) {
  mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
  float v = 0.6 * sin(p.x) * cos(p.y);
  p = R * p * 1.9 + 13.7;
  v += 0.3 * sin(p.x) * cos(p.y);
  p = R * p * 1.9 + 5.1;
  v += 0.15 * sin(p.x) * cos(p.y);
  return v;
}

void main() {
  vec3 p = position;

  // ── 회전 초타원체 (자오면 n=8) — 액체는 수위를 찾는다. IcosahedronGeometry의 normal은
  //    단위구 좌표라 공짜. 적도(y=0)·극(r=0)에서 스케일 1 → 반경 클램프·바닥 피벗 산수 불변,
  //    어깨(45°)만 최대 1.297배 → 평평한 윗면 + 평평한 바닥 + 둥근 어깨 ──
  vec3 q = normal;
  float rGeo = dot(position, normal);    // = R (position = R·normal) — sqrt 없이 정확
  float rr = dot(q.xz, q.xz);
  float yy = q.y * q.y;
  float r8 = rr * rr; r8 = r8 * r8;
  float y8 = yy * yy; y8 = y8 * y8;
  float sSE = sqrt(sqrt(sqrt(r8 + y8))); // (r⁸+y⁸)^(1/8) — pow 없음
  p *= mix(1.0, 1.0 / max(sSE, 1e-3), uLevel);
  // 유리에 닿는다 — 초타원 스케일은 적도에서 정확히 1이라 몸통 최대 반경이 어느 상태든 R에 묶였고,
  // 유리 내벽(0.92)과 12.4% 틈이 영구적이었다. 소프트 니 클램프(아래)도 그래서 평생 안 눌렸다.
  p.xz *= uRBody / rGeo;
  // 변형 방향 = 초타원체 아날리틱 노멀 ∇(r⁸+y⁸) ∝ (x·r⁶, y⁷, z·r⁶)
  float r6 = rr * rr * rr;
  vec3 nSE = normalize(vec3(q.x * r6, q.y * yy * yy * yy, q.z * r6) + vec3(0.0, 1e-6, 0.0));
  vec3 nd = normalize(mix(q, nSE, uLevel));
  vBaseN = nd;
  vTop = smoothstep(0.05, 0.45, p.y);
  vWallY = clamp(p.y / (2.0 * rGeo) + 0.5, 0.0, 1.0);
  // 벽 기공 도메인 — (수평 투영 A, 높이 + 수평 투영 B×0.55). atan을 안 쓰므로 ±π 분기컷이 없고,
  // 나선 전단이라 정면 좌우 미러도 안 보인다. modelMatrix 스케일로 월드 단위 정규화 →
  // fill이 변해도 셀 크기가 안 변한다(부풀면 셀이 같이 커지는 건 폼이 아니라 풍선이다)
  float sXZ = length(modelMatrix[0].xyz);
  float sY = length(modelMatrix[1].xyz);
  vWallUV = vec2(dot(p.xz, vec2(0.94, 0.34)) * sXZ,
                 p.y * sY + dot(p.xz, vec2(-0.34, 0.94)) * sXZ * 0.55);

  // ── grab 점탄성 변위 (확장기획 §4-2 A안) — 가장 먼저: 이후의 모든 변형장이 함께 끌린다 ──
  vStretch = 0.0;
  if (dot(uGrabDisp, uGrabDisp) + dot(uGrabDispLag, uGrabDispLag) > 1e-6) {
    // 층별 위상: 위층 = 리드(uGrabDisp), 아래층 = 지연(uGrabDispLag) — 층이 밀리며 출렁인다.
    // 바닥 접착: 병 바닥에 붙은 반죽은 안 딸려온다 (마스크는 초타원 평탄 바닥 기준 재조정)
    float baseGlue = smoothstep(-0.58, -0.28, p.y);
    float hw = smoothstep(0.25, 0.55, p.y);
    vec2 eff = mix(uGrabDispLag, uGrabDisp, hw) * baseGlue;
    float elen = length(eff);
    if (elen > 1e-4) {
      vec2 gdir = eff / elen;
      vec2 gperp = vec2(-gdir.y, gdir.x);
      vec2 gd = p.xz - uGrabPos;
      float d2 = dot(gd, gd);
      // 2중 커널 (실물: 몸통은 통에 남고 좁은 리본만 딸려 올라온다)
      float q1 = d2 * uGrabShape.x;                 // 넓은 커널 — 몸통이 살짝 기운다
      float w = (1.0 - 0.35 * q1) * exp(-0.5 * q1); // Ricker형 — 주변 약한 반작용 포함
      float wp = max(w, 0.0);
      float wN = exp(-d2 * uGrabShape.x * 6.0);     // 좁은 커널 — 리본(들어올려지는 목)
      // 신장은 리본에 집중 + 체적 보존 necking
      float s = elen * (0.3 * wp + 1.1 * wN);
      float along = dot(gd, gdir);
      float ortho = dot(gd, gperp);
      p.xz = uGrabPos + gdir * (along * (1.0 + s)) + gperp * (ortho * inversesqrt(1.0 + s));
      // 몸통은 살짝(w), 리본은 강하게(wN) 끌려온다
      p.xz += eff * (0.45 * max(w, -0.12) + 0.55 * wN);
      // 리프트 = 리본 전용 — 놓으면 CPU가 τ0.35로 죽인다(중력이 먼저)
      p.y += elen * uGrabShape.y * hw * wN * 1.7;
      // 리본 주름 — 놓으면 τ0.25로 먼저 소멸(주름 남은 리본 = 고체 문법)
      p.xz += gperp * (sin(along * 24.0 + p.y * 8.0) * 0.05 * min(s, 0.7) * hw * uGrabWrinkle);
      vStretch = s;
    }
  }

  // 손가락 추종 점성 시어장 — 범프 평가 전 적용(기포가 반죽과 함께 끌려간다) + 약한 컬
  vec2 sd = p.xz - uStirPos;
  float sfall = exp(-dot(sd, sd) * 3.5);
  p.xz += uStirVec * sfall;
  p.xz += vec2(-uStirVec.y, uStirVec.x) * sfall * 0.35;

  // ── 슬로싱 — 액체는 수면이 기울고(§오푸스 2), 고체는 몸이 밀린다. 진동은 CPU 진동자 소관 ──
  // ⚠ 아래 2줄의 계수는 frag의 조명 기울기 짝과 반드시 같아야 한다 (dough.frag.glsl 슬로싱 항)
  float rigid = (1.0 - 0.7 * uLevel) * (0.4 + 0.6 * vTop);
  p.x += uWobble.x * (0.12 + p.z * 0.04) * rigid;
  p.z += uWobble.y * (0.12 + p.x * 0.04) * rigid;
  p.y += dot(p.xz, uWobble) * 0.14 * uLevel * (0.5 + 0.5 * uFluid) * vTop;

  // 정지 실루엣 — 평평할수록·흐를수록 영구 혹을 못 가진다.
  // 피크에선 이 저주파 혹을 눌러 준다 — 안 그러면 정수리에 소프트아이스크림 꼭지가 하나 선다
  float silhouette = fbm(p.xz * 1.8 + vec2(3.1, 7.4) + uSeed * 37.0) * 0.045
                   * (1.0 - 0.55 * uLevel - 0.30 * uFluid) * (1.0 - 0.5 * uRipe);
  // 살아있는 표면 — 시간 흐르는 FBM
  float n = fbm(p.xz * 2.6 + vec2(uTime * 0.30 * uNoiseSpeed, -uTime * 0.24 * uNoiseSpeed));

  float disp = 0.0;
  for (int i = 0; i < 8; i++) {
    vec2 d = p.xz - uBumpPos[i];
    disp += uBumpAmp[i] * exp(-dot(d, d) * uBumpK[i]);
  }

  // 끈적한 실 — 드래그 경로 능선(링버퍼 4점, τ≈1.2s) — 옅어지며 퍼진다(uTrailK)
  for (int i = 0; i < 4; i++) {
    vec2 td = p.xz - uTrailPos[i];
    disp += uTrailAmp[i] * exp(-dot(td, td) * uTrailK[i]);
  }
  disp += length(uStirVec) * 0.35 * sfall;

  // 피크 돔(uRipe) / 과숙 크레이터(uCollapse) — 중심 광폭 가우시안.
  // uRBody 확장으로 p.xz 범위가 늘었으므로 커널 폭을 상대화한다 (0.3844 = R², R=0.62).
  // ⚠ frag의 돔/크레이터 짝(계수 4.0 / 3.2)도 같은 kR을 곱해야 한다
  float kR = 0.3844 / (uRBody * uRBody);
  float c2 = dot(p.xz, p.xz);
  disp += uRipe * 0.05 * exp(-c2 * 2.5 * kR);
  disp -= uCollapse * 0.08 * exp(-c2 * 2.0 * kR);

  // 피크 정수리 크래그 — 실사진 판정 기준은 '높이'가 아니라 **'하나의 매끈한 돔이냐 잘게 부서진
  // 기공 크러스트냐'**다(같은 높이에서도 갈린다). 도메인 5.0은 프래그의 마이크로 노멀
  // fbmG(vXZ*5.0)와 **같은 필드** — 새 프래그 FBM 호출 0, 조명과 지오메트리가 한 소스
  disp += fbm(p.xz * 5.0) * 0.030 * uRipe * vTop;

  // 탭 자국 — 첨도(uPokeK)는 액체일수록 아물며 퍼진다 (CPU 소관)
  vec2 pd = p.xz - uPokePos;
  disp -= uPokeAmt * exp(-dot(pd, pd) * uPokeK);

  // 유휴 진행파 — 액체 수면 찰랑임. 실제 광은 프래그 기울기가 그린다 (위상 상수 프래그와 동기)
  float wave = sin(dot(p.xz, vec2(0.90, 0.44)) * 11.0 - uTime * 1.3)
             + 0.6 * sin(dot(p.xz, vec2(-0.50, 0.87)) * 17.0 + uTime * 1.6);
  disp += wave * 0.009 * uFluid * vTop;

  vXZ = p.xz;
  p += nd * (n * 0.035 + silhouette + disp);

  // 실루엣 반경 — 소프트 니: 유리에 눌려 퍼지는 느낌 (하드 클램프 C1 불연속 제거)
  float fCl = length(p.xz) / uRXZMax;
  p.xz *= mix(1.0, 1.0 / max(fCl, 1e-4), smoothstep(0.86, 1.06, fCl));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
