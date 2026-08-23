// 접지 소프트 섀도 — 라디얼 알파 평면 1장. 실시간 섀도맵 금지 (VISUAL §1-3).
// 배경 라디얼 그라디언트는 CSS(#stage)가 담당 — 캔버스는 투명.
import * as THREE from 'three';
import { JAR_RADIUS } from './jar';

const shadowVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const shadowFrag = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.55, 1.0, d)) * 0.12;
    gl_FragColor = vec4(0.29, 0.196, 0.125, a); // #4A3220
  }
`;

export function createGroundShadow(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(JAR_RADIUS * 1.7, 40),
    new THREE.ShaderMaterial({
      vertexShader: shadowVert,
      fragmentShader: shadowFrag,
      transparent: true,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.001;
  mesh.renderOrder = -1;
  return mesh;
}
