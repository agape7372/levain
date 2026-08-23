// 프로토타입 프래그먼트의 확장 — 같은 uBumpPos/uBumpAmp 배열을 3배 첨도로 읽어
// 아날리틱 노멀 재구성(레거시 기법 계승). 상태 uniform: uSpecStr·uCrust·uFlourDust.
// 주의: precision 선언 금지 — three 프렐류드와 버텍스/프래그 공유 uniform 정밀도가 어긋난다.
uniform vec3 uColor;
uniform float uSpecStr;
uniform float uCrust;
uniform float uFlourDust;
uniform vec2 uBumpPos[8];
uniform float uBumpAmp[8];
uniform float uBumpK[8];
varying vec2 vXZ;

void main() {
  vec2 dBs = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    float k = uBumpK[i] * 3.0; // 프래그먼트는 날카롭게 — 라이팅 첨도 (레거시 54~72 ≈ 18~24×3)
    vec2 d = vXZ - uBumpPos[i];
    float e = exp(-dot(d, d) * k);
    dBs += uBumpAmp[i] * e * (-2.0 * k) * d;
  }
  vec3 n = normalize(vec3(dBs.x, 1.0, dBs.y));
  vec3 L = normalize(vec3(-0.7, 0.45, 0.45));
  float ndl = max(0.0, dot(n, L));
  float spec = pow(ndl, 28.0);
  float slope = length(n.xz);
  // 틸트 뷰 명도 보정(프로토 0.62+0.48) + 따뜻한 키라이트 색(씬 0xffe2b0과 톤 일치)
  vec3 col = uColor * (0.70 + 0.44 * ndl) * vec3(1.04, 0.985, 0.915);
  col += vec3(0.28, 0.16, 0.08) * spec * uSpecStr;
  col -= vec3(0.14, 0.10, 0.06) * slope;

  // 휴면 마른 껍질 — 고주파 크랙 음영 + 채도 감쇠 (VISUAL §3-2 uCrust)
  if (uCrust > 0.001) {
    float crack = sin(vXZ.x * 34.0) * sin(vXZ.y * 31.0 + 1.7);
    float line = smoothstep(0.86, 0.98, abs(crack));
    float centerFade = 1.0 - smoothstep(0.32, 0.5, length(vXZ)); // 측면 재봉선 아티팩트 방지 — 윗면만
    col = mix(col, col * vec3(0.995, 0.975, 0.945), uCrust);
    col -= vec3(0.05, 0.045, 0.04) * line * uCrust * centerFade;
  }

  // 밥주기 밀가루 덮임 (M5 연출)
  if (uFlourDust > 0.001) {
    float f = 0.5 + 0.5 * sin(vXZ.x * 47.0) * sin(vXZ.y * 43.0);
    col = mix(col, vec3(0.985, 0.972, 0.945), uFlourDust * (0.55 + 0.35 * f));
  }

  gl_FragColor = vec4(col, 1.0);
}
