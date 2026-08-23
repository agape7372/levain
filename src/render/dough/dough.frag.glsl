uniform vec3 uColor;
varying vec2 vXZ;
void addBump(inout float bump, inout vec2 dB, vec2 p, vec2 c, float k) {
  vec2 d = p - c;
  float e = exp(-dot(d, d) * k);
  bump += e;
  dB += e * (-2.0 * k) * d;
}
void main() {
  float bump = 0.0;
  vec2 dB = vec2(0.0);
  addBump(bump, dB, vXZ, vec2( 0.20,  0.04), 60.0);
  addBump(bump, dB, vXZ, vec2(-0.10,  0.20), 72.0);
  addBump(bump, dB, vXZ, vec2( 0.06, -0.18), 66.0);
  addBump(bump, dB, vXZ, vec2(-0.26, -0.06), 54.0);
  vec3 n = normalize(vec3(-dB.x * 0.40, 1.0, -dB.y * 0.40));
  vec3 L = normalize(vec3(-0.7, 0.45, 0.45));
  float ndl = max(0.0, dot(n, L));
  float spec = pow(ndl, 28.0);
  float slope = length(n.xz);
  vec3 col = uColor * (0.70 + 0.44 * ndl); // 틸트 뷰 명도 보정 (프로토 0.62+0.48 — 원샷 노트 참조)
  col += vec3(0.28, 0.16, 0.08) * spec;
  col -= vec3(0.14, 0.10, 0.06) * slope;
  gl_FragColor = vec4(col, 1.0);
}
