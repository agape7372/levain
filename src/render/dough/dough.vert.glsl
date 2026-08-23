// 도우 버텍스 — 유기적 소프트 페이스트 (개편: 격자 정상파 → 회전 FBM, 중심고정 uStir → 손가락 추종 시어장).
// 슬롯 8 = 전부 동적 기포(양수 돔, bubbles.ts 생명주기). 레거시 음수 혹 폐기 — VISUAL §0 개정.
// 버텍스 첨도 = uBumpK, 프래그먼트 첨도 = uBumpK×1.6 — 한 소스 구동 (VISUAL §0 함정 노트).
uniform float uTime;
uniform vec2 uWobble;
uniform float uNoiseSpeed;
uniform vec2 uBumpPos[8];
uniform float uBumpAmp[8];
uniform float uBumpK[8];
uniform vec2 uPokePos;
uniform float uPokeAmt;
uniform vec2 uStirPos;
uniform vec2 uStirVec;
uniform vec2 uTrailPos[4];
uniform float uTrailAmp[4];
uniform float uRipe;
uniform float uCollapse;
varying vec2 vXZ;

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

  // 손가락 추종 점성 시어장 — 범프 평가 전 적용(기포가 반죽과 함께 끌려간다) + 약한 컬
  vec2 sd = p.xz - uStirPos;
  float sfall = exp(-dot(sd, sd) * 3.5);
  p.xz += uStirVec * sfall;
  p.xz += vec2(-uStirVec.y, uStirVec.x) * sfall * 0.35;

  // 정지 실루엣 — 시간 고정 저주파 FBM: 비대칭 유기 블롭 (완전 대칭 원반 탈피)
  float silhouette = fbm(p.xz * 1.8 + vec2(3.1, 7.4)) * 0.045;
  // 살아있는 표면 — 시간 흐르는 FBM (기존 sin·cos 격자 정상파 대체)
  float n = fbm(p.xz * 2.6 + vec2(uTime * 0.30 * uNoiseSpeed, -uTime * 0.24 * uNoiseSpeed));

  float disp = 0.0;
  for (int i = 0; i < 8; i++) {
    vec2 d = p.xz - uBumpPos[i];
    disp += uBumpAmp[i] * exp(-dot(d, d) * uBumpK[i]);
  }

  // 끈적한 실 — 드래그 경로 능선(링버퍼 4점, 0.5s 감쇠) + 손끝에 당겨 올라오는 리프트
  for (int i = 0; i < 4; i++) {
    vec2 td = p.xz - uTrailPos[i];
    disp += uTrailAmp[i] * exp(-dot(td, td) * 26.0);
  }
  disp += length(uStirVec) * 0.35 * sfall;

  // 피크 돔(uRipe) / 과숙 크레이터(uCollapse) — 중심 광폭 가우시안
  float c2 = dot(p.xz, p.xz);
  disp += uRipe * 0.05 * exp(-c2 * 2.5);
  disp -= uCollapse * 0.08 * exp(-c2 * 2.0);

  // 탭 눌림 — 가우시안 덴트 (VISUAL §5)
  vec2 pd = p.xz - uPokePos;
  disp -= uPokeAmt * exp(-dot(pd, pd) * 30.0);

  vXZ = p.xz;
  p += normal * (n * 0.035 + silhouette + disp);
  p.x += uWobble.x * (0.12 + p.z * 0.04);
  p.z += uWobble.y * (0.12 + p.x * 0.04);

  // 실루엣 반경 상한 — 오브젝트 공간. XZ_SCALE(1.3)×숨 최대(1.055) 곱해도
  // JAR_RADIUS(0.92) 안쪽에 여유 있게 들어온다(0.63×1.3×1.055≈0.864). 유리 내벽 충돌 방지.
  float rXZ = length(p.xz);
  const float R_XZ_MAX = 0.63;
  if (rXZ > R_XZ_MAX) p.xz *= R_XZ_MAX / rXZ;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
