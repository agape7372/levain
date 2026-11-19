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
//   유리 너머 = 잔 · 중간 · 렌즈 주머니 3층, 윗면 = 바늘구멍 1층 + 가장자리 잔거품 1층. 해시는 칸 번호를 37로 접는다(아래 hash3).
uniform float uTime;
uniform vec3 uColor;
uniform float uSpecStr;
uniform float uCrust;
uniform float uFlourDust;  // 밥 주기 마른 가루 덮개 0~1 — 윗면만(옆벽 X), fbm 덩어리 가장자리
uniform float uFlourSwirl; // 덮개 소용돌이 각(rad) — 밥 주기 시작 뒤 젓는 위상(SceneHost)
uniform float uMarble;     // 밥 주기 줄무늬 세기 0~1 — 저을수록 가늘고 옅어진다
uniform float uMarblePhase; // 줄무늬 소용돌이 위상(rad) — 젓는 각도를 따라 돈다
uniform float uWet;
uniform float uRipe;
uniform float uCollapse;
uniform float uKahm;
uniform float uMold;
uniform float uSeed;
uniform float uLevel;      // (구 uLiquid) 형상 — 평평함. vert와 같은 소스
uniform float uFluid;      // 흐름 — 슬로싱·진행파 조명 짝
uniform float uCohesion;   // 응집 — 메니스커스 세기
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
uniform vec4 uTip;         // 손끝 (머리 x, z, 패임 깊이, 앞 둔덕 높이) — vert와 같은 소스(STIR_FIELD)
uniform vec4 uTipB;        // (진행 방향 x, z, 꼬리 x, z)
uniform vec2 uSwirl[9];    // 반경 칸 노드 (Θ 누적 각, ω 각속도) — r = i/8 · uRBody
uniform vec4 uMem[28];     // 저은 자리 기억 — 재료 좌표 극좌표 7 × 16칸을 vec4로 묶음(DoughMesh MEM_NR · MEM_NA)
uniform vec4 uStirK;       // (접힌 주름 높이, 저은 자리 광, 시큼 광 흐름, 0) — 되기 · 숙성별(CPU)
uniform vec2 uPokePos;
uniform float uPokeAmt;
uniform float uPokeK;
uniform vec2 uGrabPos;     // 밑동 둔덕 가운데(오브젝트) — vert와 같은 소스
uniform vec4 uGrab;        // x = 밑자락 둔덕 높이, y = 끌려 모임 세기, z = 높이 주름 · 무늬 끌림 세기
uniform vec4 uPile;        // 더미 (x, z, 높이, 반경)
uniform float uRXZMax;
uniform float uSlopeAspect; // 월드 기울기 진값 = 1 / XZ_SCALE (A1-05)
varying vec2 vXZ;
varying float vTop;
varying vec3 vBaseN;
varying float vY;          // 월드 높이 (vert와 단일 소스)
varying float vWallY;      // 몸통 내 정규화 높이 0~1

/** 오브젝트 → 월드 XZ 배율 — DoughMesh XZ_SCALE과 같은 값(tests/doughSurface가 잠근다) */
const float XZ_W = 1.3;
/** 터진 기포 바늘구멍 깊이 — bubbles.ts SCAR_AMP와 같은 값(tests/doughSurface가 잠근다) */
const float SCAR_AMP = 0.004;

// FBM · 음영 — StrandMesh FBM_GLSL · DOUGH_SHADE(가닥 셰이더와 같은 소스)를 DoughMesh가 끼운다
// #fbm

// 아래 표지 줄은 DoughMesh가 jar.ts HOOCH_COVER로 바꿔 끼운다(hooch 윗면과 같은 소스)
// #hoochCover
// 젓기 v3 · fbmG(버텍스와 같은 소스, DoughMesh STIR_FIELD) · 줄무늬 띠(hooch와 같은 소스, jar.ts MARBLE_GLSL)
// #stirField
// #marble
// #grabField
// #doughShade

// 칸 해시 · 칸 기포(hash3 · cellBubble) — 가닥 frag 기포 틈과 같은 소스(StrandMesh CELL_BUBBLE, DoughMesh가 끼운다)
// #cellBubble

// 느린 자람 — 칸마다 위상이 다른 부드러운 삼각파(trig 0). 흐르는 스크롤이 아니라 제자리에서 수십 초에 걸쳐 커졌다 준다
float slowGrow(float phase, float speed) {
  float t = abs(fract(uTime * speed + phase) - 0.5) * 2.0;
  return 0.88 + 0.12 * t * t * (3.0 - 2.0 * t);
}

void main() {
  // 소용돌이(젓기 v3) — 반경마다 Θ만큼 돈 무늬 도메인 q. 모틀 · 바늘구멍 · 잔 광택이 q에서 읽혀 젓는 손을 따라 돈다(S2).
  // 옆벽은 |vXZ| = R이라 Θ = 0(테두리 고정) — 윗면 · 옆벽 이음매가 없다
  vec4 sw = swirlAt(length(vXZ));
  vec2 q = liftQ(swirlQ(vXZ, sw.x), sw.x); // 들기 끌림 · 더미 꼬임 — 점 · 모틀이 잡은 점 쪽 결이 된다(GRAB_FIELD)
  // 알베도(모틀 · 젖음) = DOUGH_ALBEDO — 가닥 frag와 같은 함수. 모틀은 젓은 물결의 휨에도 같은 값을 쓴다(추가 FBM 0)
  float mott;
  vec3 base = doughAlbedo(q, mott);

  // ── 밥 주기 가루 · 줄무늬(2026-11-19 섞는 맛 M3, S4) — 알베도에 섞어 조명이 그대로 먹는다. 둘 다 무광(아래 광택에서 뺀다).
  //    옛 덮개는 sin×sin 체크무늬를 조명 뒤 상수 색으로 덮어 옆벽까지 하얀 세로줄 컵이 됐다 ──
  float matte = 0.0;
  if (uMarble > 0.004 && vTop > 0.5) {
    float mb = marbleBand(vXZ / uRBody, uMarblePhase, uMarble, mott * 0.35);
    base = mix(base, vec3(0.99, 0.975, 0.945), mb * 0.6);
    matte = max(matte, mb * 0.8);
  }
  float cover = 0.0;
  if (uFlourDust > 0.001) {
    // 덩어리 가장자리 — 덮개가 fbm 낮은 데부터 차오른다. 옆벽은 vTop이 0이라 하얘지지 않는다.
    // 소용돌이(F2) — 표본 좌표를 젓는 위상만큼 가운데 둘레로 돌린다(가운데 많이 · 테두리 0) → 덮개가 나선 팔로 늘어난다
    float sw = uFlourSwirl * 0.45 * (1.0 - smoothstep(0.0, 1.0, length(vXZ) / uRBody));
    vec2 sq = mat2(cos(sw), sin(sw), -sin(sw), cos(sw)) * vXZ;
    // 고르게 걷힘(F2) — fbm을 0~1로 펴고(이 배율에서 10~90% ≈ −0.5~0.45) 넓은 문턱 ±0.2로 1.2s부터 바로 옅어진다.
    // 옛 uFlourDust·1.3 문턱은 0.77 밑에서야 구멍이 나 0.4s에 몰려 사라졌다(덩어리 얼룩)
    float e = clamp(fbm(sq * 3.3 + 7.0) / 1.2 + 0.5, 0.0, 1.0);
    cover = smoothstep(e - 0.2, e + 0.2, uFlourDust * 1.4 - 0.2) * vTop;
    base = mix(base, vec3(1.0, 0.985, 0.955) * (0.975 + 0.025 * mott), cover * 0.92);
    matte = max(matte, cover);
  }

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
  // 젓기 v3 — 손끝 패임 · 앞 둔덕 · 나선 굴곡(버텍스와 같은 함수의 기울기). 비용 때문에 윗면에서만 — 옆벽은 테두리 높이만 따른다
  float tipWet = 0.0;      // 갓 판 손끝 패임 몫 — 젖은 광 · 바늘구멍 지움 · 따뜻한 그늘
  float stirM = 0.0;       // 저은 넓이(S1) — 지나간 넓은 자리. 바늘구멍 지움 · 반들 · 밝은 흰 결
  float foldH = 0.0;       // 패임 · 둔덕 · 접힌 주름 높이(월드) — 마루 밝게 · 골 그늘
  if (vTop > 0.5) {
    float mem = memAt(length(vXZ), q);
    vec4 sf = stirField(vXZ, sw, q, mem);
    dBs += sf.yz;
    foldH = sf.x;
    tipWet = sf.w * clamp(uTip.z / 0.02, 0.0, 1.0);
    stirM = mem * (1.0 - smoothstep(0.85, 1.0, length(vXZ) / uRBody));
    // 시큼 광 흐름(fGJz 55~60s) — 돌아간 q의 잔 광택이 각속도 · 저은 자리만큼 세져 수면 위를 흘러간다(묽을 때만, uStirK.z)
    if (uStirK.z > 1e-4) {
      vec2 gl = fbmG(q * 3.2 + 7.0);
      float cs = cos(sw.x), si = sin(sw.x);
      dBs += vec2(cs * gl.x - si * gl.y, si * gl.x + cs * gl.y) * (uStirK.z * max(clamp(abs(sw.y) / 2.0, 0.0, 1.0), stirM));
    }
  }
  // 저은 자리는 조금 밝은 흰 결 — 같은 Θ로 돌아 늘어난 모틀(q)의 밝은 쪽이 결로 남는다(UPQ94 2s→3s 기포 무광 → 매끈한 흰 결).
  // 0.08 + 0.17은 추정 — 실측 없음
  base = mix(base, vec3(0.99, 0.975, 0.945), stirM * (0.08 + 0.17 * smoothstep(-0.1, 0.35, mott)));
  // 마루는 밝고 골은 그늘(빛 각도와 무관한 틈 그늘) — 낮은 빛만으론 1배에서 주름이 흐렸다(r5). ±9%는 추정 — 실측 없음
  base *= 1.0 + 0.09 * clamp(foldH / 0.03, -1.0, 1.0);
  // 들기 밑자락 · 높이 주름 · 더미 겹 고리(GRAB_FIELD liftH) — 버텍스와 같은 함수의 앞 차분 기울기(잡는 중 · 더미 · 흔적이 있을 때만, 윗면만)
  if (uGrab.x + uGrab.z + uPile.z > 1e-5 && vTop > 0.5) dBs += liftGrad(vXZ);
  // 더미 · 반들 자국 — 갓 떨어진 매끈한 반죽은 반들하고(젖은 광) 조금 밝다. 더미가 꺼진 뒤에도 반들 자국(uPileB.x)이 8~15s 남는다.
  // 광 +0.5 · 밝기 +4%는 추정 — 실측 없음(UPQ94 13s 더미가 둘레보다 밝은 것만 봤다)
  float pileM = vTop > 0.5 ? pileSheen(vXZ) : 0.0;
  base *= 1.0 + 0.04 * pileM;
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
  // 슬로싱 수면 기울기 — 기울어진 수면이 빛을 다르게 받는다 (버텍스와 같은 식, 윗물이 덮으면 끈다 — SURF_TILT)
  dBs += uWobble * (surfTiltK() * (1.0 - hoochSpread(uHooch)) * vTop);
  // 유휴 진행파 기울기 — 반사광이 수면 위를 흘러간다 (버텍스와 위상 동기)
  dBs += vec2(0.90, 0.44) * (0.009 * 11.0 * cos(dot(vXZ, vec2(0.90, 0.44)) * 11.0 - uTime * 1.3)) * uFluid * vTop;
  dBs += vec2(-0.50, 0.87) * (0.6 * 0.009 * 17.0 * cos(dot(vXZ, vec2(-0.50, 0.87)) * 17.0 + uTime * 1.6)) * uFluid * vTop;
  // 갓 밥준 젓은 물결 — 한 방향 물결을 모틀로 휘게 한다. 조명(특히 젖은 광)만 바꾸는 옅은 결(R1 justfed)
  if (uStir > 0.01) {
    vec2 rd = vec2(0.62, 0.78);
    dBs += rd * (cos(dot(vXZ, rd) * 12.0 + mott * 9.0) * 12.0 * 0.006 * uStir * vTop);
  }
  // FBM 마이크로 — 해석적. 2026-11-19 R2-07 · A1-05: 0.1125 + 0.15·ripe(회색 덩어리의 주범) → 잔 광택 0.03만.
  // 젓기 v3: 도메인 q에서 읽고 기울기를 Θ만큼 되돌린다(잔 광택도 반죽과 같이 돈다)
  {
    vec2 gm = fbmG(q * 5.0);
    float cs = cos(sw.x), si = sin(sw.x);
    dBs += vec2(cs * gm.x - si * gm.y, si * gm.x + cs * gm.y) * 0.03;
  }

  // 벽 밴드 — 유리에 눌린 옆면. 윗면 하이트필드는 윗면 문법이다 — vXZ 단독 필드가 옆벽을 따라 세로 홈으로 번지지 않게 지운다
  float wallM = (1.0 - smoothstep(0.55, 0.95, abs(vBaseN.y))) * smoothstep(0.02, 0.16, vWallY);
  dBs *= 1.0 - 0.75 * wallM;

  // ── 노멀·확산 — 몸통(vBaseN) 위에 하이트필드 기울기 (§0-B: 형태 음영 복구) ──
  // 마른 가루 · 흰 줄은 빛을 흩어 굴곡 그늘이 옅다 — 흰 덮개 위 고랑 그늘이 회색 얼룩으로 읽혔다(S4)
  // 하이트필드 노멀 = (−∂h/∂x, 1, −∂h/∂z) — dBs는 ∇h라 뺀다. 2026-11-19 시각 고침 1차: 옛 식은 더해서 굴곡 음영이 뒤집혀 있었다
  // (빛은 왼쪽인데 혹은 오른쪽이 밝음 = 패인 자리로 읽힘). 더미가 짙은 얼룩 · 고랑이 흐린 짙은 덩이로 읽힌 뿌리(.work/feel2/flipN)
  vec3 nrm = normalize(vBaseN - vec3(dBs.x, 0.0, dBs.y) * (uSlopeAspect * (1.0 - 0.7 * matte)));
  // 음영(반구 앰비언트 · wrap diffuse · 소프트박스 광 · 경사 페널티) = DOUGH_SHADE — 가닥 셰이더와 같은 함수.
  // 갓 판 패임 · 저은 넓은 자리는 반들하다(S1 · S8 oelv 214+3-5). 옛 marbleBand 감긴 결 광은 뺐다 — 이제 모틀 · 광택 도메인이 직접 돈다.
  // 저은 자리 광 = uStirK.y(되직 무광 0.15 · 피크 반들 0.7 · 묽음 0.6) — 추정 — 실측 없음
  float ndl;
  vec3 col = doughShade(nrm, base, vXZ, min(1.0, uWet + 0.4 * tipWet + uStirK.y * stirM + 0.5 * pileM), matte, ndl);
  // 고랑 그늘을 따뜻하게(시각 고침 2차 B-5) — 밝기는 두고 그늘 쪽(ndl 낮음)만 채도를 반죽 쪽으로 1.3배(반투명 반죽 속 산란).
  // 같은 채도로 어두워지기만 하면 갓 밥준 고랑이 회색 기로 탁했다(hi1_stir). 1.3 · 문턱 0.3~0.6은 추정 — 실측 없음
  {
    float sh = tipWet * (1.0 - smoothstep(0.3, 0.6, ndl));
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(lum) + (col - vec3(lum)) * 1.3, sh);
  }

  // ── 윗면 바늘구멍 · 잔거품 띠(R2-07) — 반죽보다 살짝 어두운 열린 구멍(검정 금지), 크기 제각각.
  //    피크 = 성기고 들쭉날쭉 + 큰 칸만 밝은 테(작은 분화구) · 배고픔 = 고른 잔 점 · 오르는 중 = 유리 닿는 가장자리 잔거품 ──
  // 저은 자리는 바늘구멍 · 거품이 잔잔하다 — 갓 판 고랑 · 저은 띠 둘 다(S4 UPQ94 2s→3s 저은 자리 기포가 약 1s에 사라짐)
  float calm = 1.0 - 0.9 * max(max(tipWet, stirM), pileM); // 더미도 기공을 덮는다 · 저은 넓은 자리는 바늘구멍이 지워진다(S1)
  if (vTop > 0.5 && uPin + uFoam > 0.004) {
    vec2 tw = q * XZ_W; // 바늘구멍도 도는 도메인에서 — 점이 손을 따라 돈다(S2)
    // S4 눈물방울(구멍 도메인을 진행 방향으로 늘이기)은 해 보고 뺐다(§6-19) — 선분마다 방향이 달라 이음매에서 도메인이 칸 2~3개씩
    // 튀었고(원 젓기 0.55R · 선분 0.49rad), 머리가 움직이면 구멍이 미끄러졌다. 저은 자리 지움(calm)만 남긴다
    vec2 ut = tw / 0.07;
    ut.x += fract(floor(ut.y) * 0.618); // 줄마다 무리수 밀림 — 세로 열이 서지 않는다
    vec4 pin = cellBubble(ut, vec2(0.07), uPin * 0.7,
                          mix(0.007, 0.005, uRipe), mix(0.011, 0.022, uRipe), 1.0, 1.0);
    float rr = length(vXZ) / uRBody;
    // 피크는 큰 구멍만 남긴다 — 찢긴 틈(S7 8uAT 76s). 「큰」 문턱 smoothstep(0.5, 0.9, 크기)는 추정 — 실측 없음(구멍 크기 분포를 못 잰다)
    float calmPin = 1.0 - (1.0 - calm) * (1.0 - uRipe * smoothstep(0.5, 0.9, pin.w));
    // 유리에 올라붙은 메니스커스 끝(rr 0.94~)은 거의 수직이라 xz 칸이 화면에서 1px 폭 세로 실선으로 늘어난다 —
    // 테 바로 아래 매달린 실선(판정 L2)의 원인. 벽 기포를 꺼도 남았다(wallCells=0 캡처). 구멍 · 거품 점만 거기서 끊는다
    float flatTop = 1.0 - smoothstep(0.93, 0.985, rr);
    float crater = pin.y * pin.w * pin.w * uRipe * flatTop; // 큰 구멍만 테가 밝다
    // 따뜻한 그늘(실물 07) — 회색 점은 후추 · 먼지로 읽힌다. 피크(uRipe)는 2배로 짙게(판정 M5 — 실물 sdL 6.5~14 대 렌더 1.9)
    col *= 1.0 - vec3(0.055, 0.068, 0.09) * pin.x * (1.0 + uRipe) * flatTop * calmPin * (1.0 - cover); // 덮개 위 회색 점 금지(F4)
    col += vec3(0.05, 0.042, 0.03) * crater * (0.6 + 0.6 * uSpecStr) * calmPin;
    float edge = smoothstep(0.80, 0.97, rr) * uFoam * calm;
    if (edge > 0.01) {
      vec4 fb = cellBubble(tw / 0.032, vec2(0.032), 0.85 * edge, 0.003, 0.008, 1.0, 1.0);
      col = mix(col, col * vec3(1.025, 1.03, 1.04), edge * 0.45); // 거품은 살짝 밝고 차갑다(R1 #dedfdc)
      col *= 1.0 - 0.06 * fb.x * flatTop;
    }
  }
  // 터진 기포가 남긴 바늘구멍 — 몇 초에 걸쳐 옅어진다(bubbles.ts SCAR_SEC)
  col *= 1.0 - 0.08 * min(scar, 1.0) * vTop * calm * (1.0 - cover); // 가루 덮개 아래에선 안 비친다(F4)

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
