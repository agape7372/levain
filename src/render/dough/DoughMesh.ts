// 반죽 메시 — 프로토타입 셰이더 계승 + 상태 uniform 확장(M3).
// RenderParams(순수 매핑 결과)를 받아 uniform·스케일을 구동한다. sim을 모른다.
import * as THREE from 'three';
import vert from './dough.vert.glsl?raw';
import frag from './dough.frag.glsl?raw';
import type { RenderParams } from '../renderParams';
import { BubbleSystem } from '../bubbles';

const BASE_Y = 0.5;
const XZ_SCALE = 1.3;
const Y_SCALE = 0.78;
const R = 0.62; // 지오메트리 반지름

export class DoughMesh {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly wobble = new THREE.Vector2();
  readonly bubbles = new BubbleSystem();

  /** 현재 적용 중인 파라미터 (스무딩 완료값) */
  private params: RenderParams | null = null;

  constructor() {
    const bumpPos = Array.from({ length: 8 }, () => new THREE.Vector2());
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWobble: { value: new THREE.Vector2() },
        uColor: { value: new THREE.Color(0xf4ead4) },
        uNoiseSpeed: { value: 1.0 },
        uSpecStr: { value: 1.0 },
        uCrust: { value: 0 },
        uFlourDust: { value: 0 },
        uBumpPos: { value: bumpPos },
        uBumpAmp: { value: new Float32Array(8) },
        uBumpK: { value: new Float32Array(8) },
        uPokePos: { value: new THREE.Vector2() },
        uPokeAmt: { value: 0 },
        uStir: { value: 0 },
      },
      vertexShader: vert,
      fragmentShader: frag,
    });
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 5), this.material);
    this.mesh.position.y = BASE_Y;
    this.mesh.renderOrder = 2;
  }

  applyParams(p: RenderParams): void {
    this.params = p;
    const u = this.material.uniforms;
    (u.uColor.value as THREE.Color).setRGB(p.color[0], p.color[1], p.color[2]);
    u.uNoiseSpeed.value = p.noiseSpeed;
    u.uSpecStr.value = p.specStr;
    u.uCrust.value = p.crust;
  }

  /** 반죽 꼭대기 월드 y — hooch 층·고무줄 배치용. 바닥 고정 피벗 기준 */
  topY(): number {
    const fill = this.params?.fillY ?? 1;
    const h = R * Y_SCALE;
    return BASE_Y - h + 2 * h * fill;
  }

  tick(t: number): void {
    const p = this.params;
    const amp = p?.breatheAmp ?? 0.04;
    const period = p?.breathePeriod ?? 3.5;
    const fill = p?.fillY ?? 1;
    const breathe = 1 + amp * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / period));
    this.mesh.scale.set(XZ_SCALE * breathe, Y_SCALE * breathe * fill, XZ_SCALE * breathe);
    // 부풀기는 바닥 고정 — 병 바닥에 앉은 채 위로만 차오른다
    const h = R * Y_SCALE;
    this.mesh.position.y = BASE_Y - h + h * fill;

    this.bubbles.update(t, p?.bubbleDensity ?? 0.4, p?.bubbleScale ?? 1);
    const u = this.material.uniforms;
    const posArr = u.uBumpPos.value as THREE.Vector2[];
    for (let i = 0; i < 8; i++) posArr[i].set(this.bubbles.pos[i * 2], this.bubbles.pos[i * 2 + 1]);
    (u.uBumpAmp.value as Float32Array).set(this.bubbles.amp);
    (u.uBumpK.value as Float32Array).set(this.bubbles.k);

    u.uTime.value = t;
    this.wobble.multiplyScalar(0.9);
    (u.uWobble.value as THREE.Vector2).copy(this.wobble);
  }
}
