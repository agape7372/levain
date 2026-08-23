// 천 덮개 — 병 입구 린넨 디스크 1메시(고무줄 링은 프래그 반경 착색, draw call +1).
// 실물 관행: 밀폐 금기 — 천+고무줄이 표준. 콜드 스타트·오랜 부재 복귀에만 덮여 있고,
// 위로 플릭(또는 탭)으로 걷는 오프닝 리추얼. 걷힌 뒤 visible=false로 예산 반납.
import * as THREE from 'three';
import { JAR_RADIUS, JAR_HEIGHT } from './jar';

const CLOTH_R = JAR_RADIUS + 0.25;
const OPEN_DUR = 0.6; // cubic-bezier(0.22,1,0.36,1) — 이징 3종의 '등장' 곡선 역재생 감각

const clothVert = /* glsl */ `
  varying vec2 vUv;
  varying float vR;
  void main() {
    vUv = uv;
    vR = length(position.xz);
    vec3 p = position;
    // 립 밖 처짐 — 반경이 병을 넘어서면 아래로 늘어진다
    float over = max(0.0, vR - ${JAR_RADIUS.toFixed(2)});
    p.y -= over * over * 1.6;
    // 잔주름 — 낮은 진폭, 격자 아니게 무리수 주파수
    p.y += 0.012 * sin(p.x * 9.3 + 1.7) * cos(p.z * 8.1 - 0.6);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const clothFrag = /* glsl */ `
  precision mediump float;
  uniform float uFade;
  varying vec2 vUv;
  varying float vR;
  void main() {
    // 린넨 결 — 초고주파 저진폭 직물 노이즈 (텍스처 fetch 0)
    float weave = sin(vUv.x * 210.0) * sin(vUv.y * 214.0);
    vec3 linen = vec3(0.955, 0.93, 0.885) * (0.97 + 0.03 * weave);
    // 고무줄 — 병 립 반경 부근 테라코타 밴드 (같은 메시, 프래그 착색)
    float band = smoothstep(0.035, 0.012, abs(vR - ${(JAR_RADIUS + 0.02).toFixed(2)}));
    vec3 col = mix(linen, vec3(0.769, 0.471, 0.29), band * 0.9); // #C4784A
    // 가장자리 살짝 어둡게 — 천의 두께 암시
    float edge = smoothstep(${CLOTH_R.toFixed(2)}, ${(CLOTH_R - 0.06).toFixed(2)}, vR);
    col *= 0.9 + 0.1 * edge;
    gl_FragColor = vec4(col, uFade);
  }
`;

export class Cloth {
  readonly mesh: THREE.Mesh;
  /** 덮여 있어 반죽 조작이 막히는가 */
  covering = false;
  private mat: THREE.ShaderMaterial;
  private openT0 = -1;
  private onOpened: (() => void) | null = null;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: clothVert,
      fragmentShader: clothFrag,
      uniforms: { uFade: { value: 1 } },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(CLOTH_R, 48), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = JAR_HEIGHT + 0.06;
    this.mesh.renderOrder = 4; // 유리 앞면(3)보다 위
    this.mesh.visible = false;
  }

  /** 덮기 — 콜드 스타트·오랜 부재 복귀 */
  cover(): void {
    this.covering = true;
    this.openT0 = -1;
    this.mesh.visible = true;
    this.mesh.position.set(0, JAR_HEIGHT + 0.06, 0);
    this.mesh.rotation.set(-Math.PI / 2, 0, 0);
    this.mat.uniforms.uFade.value = 1;
  }

  /** 걷기 시작 — 완료 시 콜백 (사락 사운드·밀가루 모트는 호출자 배선) */
  open(onOpened?: () => void): void {
    if (!this.covering || this.openT0 >= 0) return;
    this.covering = false; // 조작 차단은 즉시 해제 — 연출이 입력을 막지 않는다 (game-feel)
    this.onOpened = onOpened ?? null;
    this.openT0 = -2; // tick이 첫 프레임에 t0을 채운다
  }

  /** 프레임 구동 — SceneHost loop에서 호출 */
  tick(t: number): void {
    if (this.openT0 === -1 || !this.mesh.visible) return;
    if (this.openT0 === -2) this.openT0 = t;
    const u = Math.min(1, (t - this.openT0) / OPEN_DUR);
    // cubic-bezier(0.22,1,0.36,1) 근사 — easeOutQuint 계열
    const e = 1 - Math.pow(1 - u, 4);
    // 위로 들리며 오른쪽으로 걷힌다 + 살짝 말리는 회전
    this.mesh.position.y = JAR_HEIGHT + 0.06 + 1.1 * e;
    this.mesh.position.x = 0.9 * e;
    this.mesh.rotation.z = -0.7 * e;
    this.mesh.scale.setScalar(1 - 0.25 * e);
    this.mat.uniforms.uFade.value = 1 - Math.pow(u, 2);
    if (u >= 1) {
      this.mesh.visible = false;
      this.openT0 = -1;
      const cb = this.onOpened;
      this.onOpened = null;
      cb?.();
    }
  }
}
