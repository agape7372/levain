// 반죽 메시 — 프로토타입 셰이더(제품의 얼굴)를 무손실 계승. uniform 확장은 M3.
// 셰이더 원문: dough.vert.glsl / dough.frag.glsl (프로토타입 main.js에서 추출).
import * as THREE from 'three';
import vert from './dough.vert.glsl?raw';
import frag from './dough.frag.glsl?raw';

const BASE_Y = 0.5;          // 병 안 반죽 기준 높이
const XZ_SCALE = 1.3;        // 반지름 0.62×1.3 ≈ 0.81 — 병벽(0.92)과 여유
const Y_SCALE = 0.78;        // 눌린 반죽 실루엣
const BREATHE_AMP = 0.04;    // 프로토타입 ±4%
const BREATHE_PERIOD = 3.5;  // 프로토타입 3.5s

export class DoughMesh {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  /** 터치 출렁임 — input.ts가 목표값을 쓰고 tick이 감쇠 */
  readonly wobble = new THREE.Vector2();

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWobble: { value: new THREE.Vector2(0, 0) },
        uColor: { value: new THREE.Color(0xf4ead4) },
      },
      vertexShader: vert,
      fragmentShader: frag,
    });
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 5), this.material);
    this.mesh.position.y = BASE_Y;
    this.mesh.renderOrder = 2; // 병 3패스의 내용물 층 (VISUAL §1-2)
  }

  tick(t: number): void {
    const breathe = 1 + BREATHE_AMP * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / BREATHE_PERIOD));
    this.mesh.scale.set(XZ_SCALE * breathe, Y_SCALE * breathe, XZ_SCALE * breathe);
    this.material.uniforms.uTime.value = t;
    this.wobble.multiplyScalar(0.9); // 프로토타입 감쇠 계승
    (this.material.uniforms.uWobble.value as THREE.Vector2).copy(this.wobble);
  }
}
