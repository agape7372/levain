// 도우 버텍스 — 반죽 모델 v2(2026-11-19): 「병 채움」 매개 메시 (jar.ts createFillGeometry).
//   position.xz = 단위 방향 × rN, position.y = h.
//   윗면(h = 1)  = 극좌표 하이트필드 — 변형장 전부(기포·탭/홀드·젓기 시어·실 능선·grab 리본·슬로싱·진행파·
//                 피크 돔·과숙 크레이터·정지 혹·시간 FBM·메니스커스)가 여기서만 돈다.
//   옆벽(h < 1)  = 유리 내벽에 붙은 곧은 원기둥. 높이는 같은 방위의 테두리를 따라가고(h × 테두리 y),
//                 xz 변형은 h²로 따라간다 — 바닥(h = 0)은 절대 변형되지 않는다(A1-01·A1-10).
//   마름·배고픔은 윗가장자리만 유리에서 물러난다(uPull, 위 12% 높이 · A1-02).
//   오브젝트 공간: 월드 XZ = 오브젝트 XZ × XZ_SCALE, 월드 y = 오브젝트 y × 숨쉬기(바닥 y = 0 고정).
// 버텍스 첨도 = uBumpK, 프래그 첨도 = uBumpK×1.6 — 한 소스 구동 (VISUAL §0 함정 노트).
// 2026-11-19 섞는 맛(M2): 손끝 밑 섬(|uStirVec|·0.35·sfall)과 실 능선 4점 솟음을 지우고 고랑 자취(trailGroove, 8점 · 선분 7개)로.
//   시어 끌림 · grab xz · 슬로싱 강체 xz는 테두리(r/R 0.8→1.0)에서 0 — 옆면은 유리에서 뜨거나 밀리지 않는다(pin).
// 2026-11-19 P1b: 피크 크래그(fbm·0.030·uRipe)를 지웠다 — 회색 FBM 덩어리의 한 축이었다(R2-07). 그 자리(같은 fbm 도메인 5.0)는
//   하강 주름(uSink)이 쓴다. 곰팡이 군락은 살짝 솟는다(uMoldA, R2-10). 옆벽 기공 도메인은 프래그가 원통 매개로 푼다(vY).
uniform float uTime;
uniform vec2 uWobble;
uniform float uNoiseSpeed;
uniform vec2 uBumpPos[4];
uniform float uBumpAmp[4];
uniform float uBumpK[4];
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
uniform vec2 uTrailPos[8];
uniform float uTrailAmp[8];
uniform float uTrailK[8];  // 고랑 첨도 — 나이 들수록 넓어진다. 음수 = 새 획 첫 점(앞 점과 안 잇는다)
uniform float uRipe;
uniform float uCollapse;
uniform float uLevel;      // 0=돔(고체·마름) ~ 1=수평면 — 슬로싱 기울기·메니스커스 배분
uniform float uFluid;      // 흐름 — 슬로싱 배분·유휴 진행파
uniform float uRBody;      // 옆벽 반경(오브젝트) = FILL_RADIUS / XZ_SCALE. 프래그 밴드 정규화와 단일 소스
uniform float uRXZMax;     // 반경 상한 — 유리 내벽(CPU)
uniform float uSeed;       // 개체 시드 — 정지 혹 자리 (르방마다 다른 생김새)
uniform float uHeight;     // 테두리 수위(월드 y) = RenderParams.height
uniform float uPull;       // 윗가장자리 물러남(오브젝트) — RenderParams.pull / XZ_SCALE
uniform float uMenH;       // 메니스커스 높이(월드) — 응집이 높을수록 유리를 타고 오른다
uniform float uSink;       // 하강 꺼짐 0~1 — 가운데 0.05월드, 테두리 0 (DoughMesh SINK_DEPTH)
uniform float uMold;       // 곰팡이 확산 0~1
uniform vec4 uMoldA[5];    // 곰팡이 군락 (x, z, 크기 배율, 색 종류) — 프래그와 단일 소스(규칙 8)
varying vec2 vXZ;
varying float vStretch;
varying float vTop;        // 윗면 마스크 — 기울기·파동·메니스커스용 (옆벽 0)
varying vec3 vBaseN;       // 변형 기준 노멀 — 윗면 +y, 옆벽 바깥
varying float vY;          // 월드 높이 — 유리 너머 기포 단면 도메인(프래그가 호 길이와 짝짓는다)
varying float vWallY;      // 옆벽 정규화 높이 0~1(윗면 1) — 기포 크기 구배용

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

// 고랑 자취 — DoughMesh가 TRAIL_GROOVE(프래그와 같은 소스)를 여기 끼운다
// #trailGroove

// 윗면 한 점의 변형 — xz0 = 휴지 자리(오브젝트), layer = 1(윗면) ~ 0(바닥 쪽 층, grab 지연 위상 배분)
vec3 topPoint(vec2 xz0, float layer, out float stretch) {
  vec3 p = vec3(xz0.x, uHeight, xz0.y);
  stretch = 0.0;
  // 테두리 고정 — 옆면은 유리에 붙어 있다. xz로 미는 변형장(grab · 시어 · 슬로싱 강체)은 r/R 0.8→1.0에서 0
  float pin = 1.0 - smoothstep(0.8, 1.0, length(xz0) / uRBody);

  // ── grab 점탄성 변위 (확장기획 §4-2 A안) — 가장 먼저: 이후의 모든 변형장이 함께 끌린다 ──
  if (dot(uGrabDisp, uGrabDisp) + dot(uGrabDispLag, uGrabDispLag) > 1e-6) {
    // 층별 위상: 위층 = 리드(uGrabDisp), 아래층 = 지연(uGrabDispLag) — 층이 밀리며 출렁인다
    vec2 eff = mix(uGrabDispLag, uGrabDisp, layer);
    float elen = length(eff);
    if (elen > 1e-4) {
      vec2 grabXZ = p.xz;
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
      p.xz += eff * (0.45 * max(w, -0.12) + 0.55 * wN);
      // 리프트 = 리본 전용 — 놓으면 CPU가 τ0.35로 죽인다(중력이 먼저)
      p.y += elen * uGrabShape.y * layer * wN * 1.7;
      // 리본 주름 — 놓으면 τ0.25로 먼저 소멸(주름 남은 리본 = 고체 문법)
      p.xz += gperp * (sin(along * 24.0 + p.y * 8.0) * 0.05 * min(s, 0.7) * layer * uGrabWrinkle);
      p.xz = grabXZ + (p.xz - grabXZ) * pin;
      stretch = s;
    }
  }

  // 손가락 추종 점성 시어장 — 범프 평가 전 적용(기포가 반죽과 함께 끌려간다) + 약한 컬
  vec2 sd = p.xz - uStirPos;
  float sfall = exp(-dot(sd, sd) * 3.5);
  p.xz += uStirVec * sfall * pin;
  p.xz += vec2(-uStirVec.y, uStirVec.x) * sfall * 0.35 * pin;

  // ── 슬로싱 — 액체는 수면이 기울고, 고체는 몸이 밀린다. 진동은 CPU 진동자 소관 ──
  // ⚠ 아래 계수는 frag의 조명 기울기 짝과 반드시 같아야 한다 (dough.frag.glsl 슬로싱 항)
  float rigid = (1.0 - 0.7 * uLevel) * (0.4 + 0.6 * layer);
  p.x += uWobble.x * (0.12 + p.z * 0.04) * rigid * pin;
  p.z += uWobble.y * (0.12 + p.x * 0.04) * rigid * pin;
  p.y += dot(p.xz, uWobble) * 0.14 * uLevel * (0.5 + 0.5 * uFluid);

  // 정지 혹 — 평평할수록·흐를수록 영구 혹을 못 가진다. 피크에선 눌러 준다(소프트아이스크림 꼭지 방지)
  float silhouette = fbm(p.xz * 1.8 + vec2(3.1, 7.4) + uSeed * 37.0) * 0.045
                   * (1.0 - 0.55 * uLevel - 0.30 * uFluid) * (1.0 - 0.5 * uRipe);
  // 살아있는 표면 — 시간 흐르는 FBM. 실물은 초 단위로 정지해 있어 약하게만(R2-15: 0.035 → 0.012)
  float n = fbm(p.xz * 2.6 + vec2(uTime * 0.30 * uNoiseSpeed, -uTime * 0.24 * uNoiseSpeed));

  float disp = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 d = p.xz - uBumpPos[i];
    disp += uBumpAmp[i] * exp(-dot(d, d) * uBumpK[i]);
  }
  // 고랑 자취 — 손끝 뒤로 패인 골 + 양옆 둔덕, 묽기만큼 메워진다(CPU τ). 손끝 밑 = 고랑 끝의 둥근 패임
  disp += trailGroove(p.xz).x;

  // 피크 돔(uRipe) / 과숙 크레이터(uCollapse) — 중심 광폭 가우시안, 윗면 전용(바닥 극 없음).
  // ⚠ frag의 돔/크레이터 짝(계수 4.0 / 3.2)도 같은 kR을 곱해야 한다 (0.3844 = 구 R²)
  float kR = 0.3844 / (uRBody * uRBody);
  float c2 = dot(p.xz, p.xz);
  disp += uRipe * 0.05 * exp(-c2 * 2.5 * kR);
  disp -= uCollapse * 0.08 * exp(-c2 * 2.0 * kR);
  // 하강 꺼짐(R2-06) — 가운데가 먼저 꺼지고 테두리는 유리에 붙어 남는다(테두리 값 0.3156 = exp(−3·0.3844)를 빼서 0).
  // 부드러운 주름 — −√(f²+ε)·0.02, f = fbm(xz·6+2). 프래그가 같은 식의 기울기를 쓴다(접힌 골, 덩어리 아님)
  if (uSink > 0.001) {
    float bowl = max(exp(-c2 * 3.0 * kR) - 0.3156, 0.0) / 0.6844;
    float f = fbm(p.xz * 6.0 + 2.0);
    disp -= uSink * bowl * (0.05 + 0.02 * sqrt(f * f + 0.02));
  }
  // 곰팡이 군락 — 살짝 솟은 보송한 덩어리(+0.008월드). 반경 · 문턱은 프래그와 같은 식
  if (uMold > 0.001) {
    for (int i = 0; i < 5; i++) {
      vec4 m = uMoldA[i];
      float th = i == 0 ? 0.0 : 0.2 + 0.09 * float(i);
      float gate = smoothstep(th, th + 0.08, uMold);
      float rad = uRBody * (0.07 + 0.2 * uMold) * m.z;
      vec2 md = p.xz - m.xy;
      disp += 0.008 * gate * exp(-dot(md, md) / (rad * rad));
    }
  }

  // 탭 자국 · 홀드 부풂 — 첨도(uPokeK)는 액체일수록 아물며 퍼진다 (CPU 소관)
  vec2 pd = p.xz - uPokePos;
  disp -= uPokeAmt * exp(-dot(pd, pd) * uPokeK);

  // 유휴 진행파 — 액체 수면 찰랑임. 실제 광은 프래그 기울기가 그린다 (위상 상수 프래그와 동기)
  float wave = sin(dot(p.xz, vec2(0.90, 0.44)) * 11.0 - uTime * 1.3)
             + 0.6 * sin(dot(p.xz, vec2(-0.50, 0.87)) * 17.0 + uTime * 1.6);
  disp += wave * 0.009 * uFluid;

  // 메니스커스 — 유리에 닿은 가장자리가 살짝 타고 오른다(R1 justfed 03)
  disp += uMenH * smoothstep(0.78, 1.0, length(xz0) / uRBody);

  p.y += n * 0.012 + silhouette + disp;
  return p;
}

void main() {
  float h = position.y;
  float rN = length(position.xz);
  vec2 dir = rN > 1e-5 ? position.xz / rN : vec2(1.0, 0.0);
  bool top = h > 0.9995;
  float rTop = uRBody - uPull;
  // 윗면은 자기 자리, 옆벽은 같은 방위의 테두리 점을 기준으로 삼는다
  vec2 xz0 = (top ? position.xz : dir) * rTop;
  float stretch;
  vec3 rimP = topPoint(xz0, top ? 1.0 : h, stretch);
  vec3 p = rimP;
  if (!top) {
    // 위 12% 높이만 물러난다 — 아래·바닥은 늘 유리에 붙는다
    float r = uRBody - uPull * smoothstep(0.88, 1.0, h);
    p.xz = dir * r + (rimP.xz - xz0) * h * h;
    p.y = h * rimP.y;
    stretch *= h;
  }

  // 반경 상한 — 유리 안쪽에서만 한쪽으로 부드럽게 포화(안쪽 점은 안 민다)
  float fCl = length(p.xz) / uRXZMax;
  if (fCl > 0.97) p.xz *= (0.97 + 0.03 * (1.0 - exp(-(fCl - 0.97) / 0.03))) / fCl;

  vStretch = stretch;
  vTop = top ? 1.0 : 0.0;
  vWallY = top ? 1.0 : h;
  vBaseN = top
    ? (rN > 0.9999 ? normalize(vec3(dir.x, 1.0, dir.y)) : vec3(0.0, 1.0, 0.0))
    : vec3(dir.x, 0.0, dir.y);
  vXZ = p.xz;
  // 옛 평면 투영(나선 전단) 도메인은 세로 줄 · 4엽 별을 만들어 폐기(A1-06). 높이만 넘기고 호 길이는 프래그가 atan으로
  vY = p.y * length(modelMatrix[1].xyz);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
