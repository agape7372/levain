// 유리병 — 3패스 고정 renderOrder(굴절·transmission 금지) + 눈금 + 고무줄 마커.
// 정본: docs/VISUAL.md §1-2. 알파 소팅 오류를 renderOrder로 구조적으로 차단한다.
import * as THREE from 'three';

export const JAR_RADIUS = 0.92; // 프로토타입 토러스 반경 계승
export const JAR_HEIGHT = 1.9;

const glassVert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

// 뒷면: 은은한 내벽 톤 + 하단으로 갈수록 두꺼워지는 유리 암시
const glassBackFrag = /* glsl */ `
  precision mediump float;
  varying vec3 vLocal;
  void main() {
    float yn = clamp((vLocal.y + 0.95) / 1.9, 0.0, 1.0);
    float alpha = 0.10 + 0.06 * (1.0 - yn);
    gl_FragColor = vec4(0.98, 0.94, 0.88, alpha);
  }
`;

// 앞면: 프레넬 림 + 수직 하이라이트 스트릭 2줄(키라이트 방위 정렬).
// (절차 눈금은 저각에서 얼룩 아티팩트로 번져 제거 — 부피 표시는 고무줄 마커가 정본.
//  눈금 재도입은 M3에서 각도 보정과 함께 재설계. implementation-notes Deviations 참조)
const glassFrontFrag = /* glsl */ `
  precision mediump float;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  void main() {
    float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewDir))), 2.0);
    float alpha = 0.08 + 0.45 * fresnel;
    // 수직 스트릭 — 씬 키라이트(좌상단) 방위 부근 2줄, 상하 페이드
    float az = atan(vLocal.x, vLocal.z);
    float band = exp(-pow((az - 2.30) * 3.0, 2.0)) + 0.6 * exp(-pow((az + 0.85) * 3.5, 2.0));
    float yn = clamp((vLocal.y + 0.95) / 1.9, 0.0, 1.0);
    float vfade = smoothstep(0.03, 0.28, yn) * (1.0 - smoothstep(0.72, 0.97, yn));
    alpha += 0.10 * band * vfade;
    gl_FragColor = vec4(1.0, 0.965, 0.91, alpha); // #FFF6E8
  }
`;

export interface Jar {
  group: THREE.Group;
  /** 고무줄 마커 — 마지막 밥 시점 반죽 높이 표시 (부피 정보의 정본 표시 장치) */
  band: THREE.Mesh;
  /** hooch(부유액) 층 — 방치 신호. setHooch(amt, y)로 구동 */
  hooch: THREE.Mesh;
  setHooch(amt: number, y: number, t: number): void;
}

const hoochVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const hoochFrag = /* glsl */ `
  precision mediump float;
  uniform float uAmt;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float edge = 1.0 - smoothstep(0.42, 0.5, length(c));
    float flow = 0.5 + 0.5 * sin(vUv.x * 9.0 + uTime * 0.3) * sin(vUv.y * 8.0 - uTime * 0.22);
    float a = uAmt * (0.5 + 0.3 * uAmt) * edge * (0.8 + 0.2 * flow);
    gl_FragColor = vec4(0.612, 0.573, 0.498, a); // #9C927F
  }
`;

export function createJar(): Jar {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(JAR_RADIUS, JAR_RADIUS, JAR_HEIGHT, 48, 1, true);

  const back = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      vertexShader: glassVert,
      fragmentShader: glassBackFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
    }),
  );
  back.renderOrder = 1;

  const front = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      vertexShader: glassVert,
      fragmentShader: glassFrontFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    }),
  );
  front.renderOrder = 3;

  back.position.y = JAR_HEIGHT / 2;
  front.position.y = JAR_HEIGHT / 2;

  // 입구 립 — 살짝 벌어진 유리 테
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(JAR_RADIUS + 0.02, 0.018, 10, 48),
    new THREE.MeshPhysicalMaterial({ color: 0xfff6e8, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.5 }),
  );
  lip.rotation.x = Math.PI / 2;
  lip.position.y = JAR_HEIGHT;
  lip.renderOrder = 3;
  group.add(back, front, lip);

  // 고무줄 마커 — 프로토타입 토러스의 재해석 (테라코타 #C4784A)
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(JAR_RADIUS + 0.035, 0.025, 12, 48),
    new THREE.MeshPhysicalMaterial({ color: 0xc4784a, roughness: 0.55, metalness: 0.05 }),
  );
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.98; // 급여 시점 반죽 꼭대기 높이 — SceneHost.setBandY로 상태 연결
  band.renderOrder = 0;
  group.add(band);

  // hooch(부유액) 층 — 반죽 윗면 위 얇은 반투명 디스크 (VISUAL §3-3)
  const hoochMat = new THREE.ShaderMaterial({
    vertexShader: hoochVert,
    fragmentShader: hoochFrag,
    uniforms: { uAmt: { value: 0 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
  });
  const hooch = new THREE.Mesh(new THREE.CircleGeometry(0.8, 40), hoochMat);
  hooch.rotation.x = -Math.PI / 2;
  hooch.position.y = 1.0;
  hooch.renderOrder = 2;
  group.add(hooch);

  const setHooch = (amt: number, y: number, t: number): void => {
    hoochMat.uniforms.uAmt.value = amt;
    hoochMat.uniforms.uTime.value = t;
    hooch.position.y = y;
    hooch.visible = amt > 0.01;
  };

  return { group, band, hooch, setHooch };
}
