uniform float uTime;
uniform vec2 uWobble;
varying vec2 vXZ;
void addBump(inout float bump, inout vec2 dB, vec2 p, vec2 c, float k) {
  vec2 d = p - c;
  float e = exp(-dot(d, d) * k);
  bump += e;
  dB += e * (-2.0 * k) * d;
}
void main() {
  vec3 p = position;
  float n = sin(p.x * 3.2 + uTime * 0.35) * cos(p.z * 2.8 - uTime * 0.28);
  float bump = 0.0;
  vec2 dB = vec2(0.0);
  addBump(bump, dB, p.xz, vec2( 0.20,  0.04), 20.0);
  addBump(bump, dB, p.xz, vec2(-0.10,  0.20), 24.0);
  addBump(bump, dB, p.xz, vec2( 0.06, -0.18), 22.0);
  addBump(bump, dB, p.xz, vec2(-0.26, -0.06), 18.0);
  vXZ = p.xz;
  p += normal * (n * 0.035 - bump * 0.40);
  p.x += uWobble.x * (0.12 + p.z * 0.04);
  p.z += uWobble.y * (0.12 + p.x * 0.04);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
