// 프로토타입 버텍스 셰이더의 확장 — 범프 4개 하드코딩을 공유 uniform 배열 8슬롯으로 승격.
// 슬롯 0~3 = 레거시 혹(amp -0.40 고정 좌표), 슬롯 4~7 = 동적 기포(bubbles.ts 생명주기).
// 버텍스 첨도 = uBumpK, 프래그먼트 첨도 = uBumpK×3.0 — 한 소스 구동 (VISUAL §0 함정 노트).
uniform float uTime;
uniform vec2 uWobble;
uniform float uNoiseSpeed;
uniform vec2 uBumpPos[8];
uniform float uBumpAmp[8];
uniform float uBumpK[8];
uniform vec2 uPokePos;
uniform float uPokeAmt;
uniform float uStir;
varying vec2 vXZ;

void main() {
  vec3 p = position;

  // 젓기 소용돌이 — 중심이 강한 XZ 회전장 (M5 연출)
  if (uStir > 0.001) {
    float r = length(p.xz);
    float ang = uStir * 2.2 * exp(-r * 1.6);
    float c = cos(ang); float s = sin(ang);
    p.xz = mat2(c, -s, s, c) * p.xz;
  }

  float n = sin(p.x * 3.2 + uTime * 0.35 * uNoiseSpeed) * cos(p.z * 2.8 - uTime * 0.28 * uNoiseSpeed);

  float disp = 0.0;
  for (int i = 0; i < 8; i++) {
    vec2 d = p.xz - uBumpPos[i];
    float e = exp(-dot(d, d) * uBumpK[i]);
    disp += uBumpAmp[i] * e;
  }

  // 탭 눌림 — 가우시안 덴트 (VISUAL §5)
  vec2 pd = p.xz - uPokePos;
  disp -= uPokeAmt * exp(-dot(pd, pd) * 30.0);

  vXZ = p.xz;
  p += normal * (n * 0.035 + disp);
  p.x += uWobble.x * (0.12 + p.z * 0.04);
  p.z += uWobble.y * (0.12 + p.x * 0.04);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
