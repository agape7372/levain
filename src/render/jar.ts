// 유리병 — 3패스 고정 renderOrder(굴절·transmission 금지) + hooch 층.
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

// 유리 자국 — 수위와 최고 수위 사이의 마른 필름 + 최고 수위 선. 앞/뒤 유리 공통 소스.
// 실제 병에서 "여긴 발효 중이다"와 "한 번 여기까지 올라왔다 주저앉았다"를 문구 없이 말해주는
// 유일한 다이제틱 신호다. FBM 0회(전량 sin·exp), 드로우콜 증가 0.
const residueGlsl = /* glsl */ `
  uniform float uMassY;   // 반죽 윗면 월드 y
  uniform float uMarkY;   // 이번 사이클 최고 수위 월드 y
  uniform float uResidue; // 0~1 마른 자국
  uniform float uWetRim;  // 0~1 갓 밥준 젖은 테
  // wy = 월드 y. 반환값 r을 alpha·tint에 섞는다
  float residueAmt(float wy) {
    if (uResidue <= 0.004) return 0.0;
    float above = smoothstep(uMassY - 0.015, uMassY + 0.045, wy);
    float below = 1.0 - smoothstep(uMarkY - 0.060, uMarkY + 0.015, wy);
    // 앞면은 z>0 구간만 보이므로 atan 분기컷이 화면에 안 걸린다 (기존 스트릭과 같은 관행)
    float az2 = atan(vLocal.x, vLocal.z);
    float s = 0.5 + 0.5 * sin(az2 * 19.0 + sin(az2 * 5.0 + 1.3) * 2.1);
    float streak = mix(0.35, 1.0, s * s);          // 흘러내린 줄 몇 개 + 넓은 얼룩 (저대비)
    float fade = 1.0 - smoothstep(uMassY, uMarkY + 0.02, wy);
    float film = above * below * streak * (0.30 + 0.70 * fade);
    float line = exp(-(wy - uMarkY) * (wy - uMarkY) * 1600.0); // σ≈0.018 최고 수위 선
    return uResidue * (film * 0.9 + line * 0.55);
  }
`;

// 뒷면: 은은한 내벽 톤 + 하단으로 갈수록 두꺼워지는 유리 암시
const glassBackFrag = /* glsl */ `
  precision mediump float;
  varying vec3 vLocal;
  ${residueGlsl}
  void main() {
    float yn = clamp((vLocal.y + 0.95) / 1.9, 0.0, 1.0);
    // 림 바로 아래 내부 환형 — 원래 공식은 위로 갈수록 알파가 낮아져 배경색(#E8D9C4)이
    // 그대로 비쳐 반죽 위에 뜬 베이지 링(#e8d5b8)으로 보임. 그 구간만 어둡게·덜 투명하게 덮는다.
    float rim = smoothstep(0.75, 1.0, yn);
    float alpha = 0.10 + 0.06 * (1.0 - yn) + 0.24 * rim;
    vec3 tint = mix(vec3(0.98, 0.94, 0.88), vec3(0.28, 0.21, 0.14), rim);
    // 55도 부감에서 수위 위 '먼 쪽' 벽이 크게 보인다 — 자국이 가장 잘 읽히는 면이다
    float r = residueAmt(vLocal.y + 0.95) * 0.7;
    alpha += r * 0.30;
    tint = mix(tint, vec3(0.90, 0.855, 0.78), clamp(r * 1.4, 0.0, 0.85));
    gl_FragColor = vec4(tint, alpha);
  }
`;

// 앞면: 프레넬 림 + 수직 하이라이트 스트릭 2줄(키라이트 방위 정렬).
// (절차 눈금은 저각에서 얼룩 아티팩트로 번져 제거. 고무줄 마커도 사용자 확정으로 제거(2026-08-23)
//  — 부피 정보는 도우 fill 표현 + 관찰 카드가 정본. 눈금 재도입은 백로그(각도 보정과 함께 재설계))
const glassFrontFrag = /* glsl */ `
  precision mediump float;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${residueGlsl}
  void main() {
    float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewDir))), 2.0);
    float alpha = 0.08 + 0.45 * fresnel;
    // 수직 스트릭 — 씬 키라이트(좌상단) 방위 부근 2줄, 상하 페이드
    float az = atan(vLocal.x, vLocal.z);
    float band = exp(-pow((az - 2.30) * 3.0, 2.0)) + 0.6 * exp(-pow((az + 0.85) * 3.5, 2.0));
    float yn = clamp((vLocal.y + 0.95) / 1.9, 0.0, 1.0);
    float vfade = smoothstep(0.03, 0.28, yn) * (1.0 - smoothstep(0.72, 0.97, yn));
    alpha += 0.10 * band * vfade;
    vec3 tint = vec3(1.0, 0.965, 0.91); // #FFF6E8
    float wy = vLocal.y + 0.95;
    float r = residueAmt(wy);
    alpha += r * 0.30;
    tint = mix(tint, vec3(0.90, 0.855, 0.78), clamp(r * 1.4, 0.0, 0.85)); // 마른 반죽 톤 (빨강 0)
    // 갓 밥준 젖은 테 — 자국과 반대 신호. 수위 바로 위 얇은 광택 띠
    alpha += exp(-pow((wy - uMassY - 0.012) * 55.0, 2.0)) * uWetRim * 0.12;
    gl_FragColor = vec4(tint, alpha);
  }
`;

export interface Jar {
  group: THREE.Group;
  /** hooch(부유액) 층 — 방치 신호. setHooch(amt, y)로 구동 */
  hooch: THREE.Mesh;
  setHooch(amt: number, y: number, t: number): void;
  /** 유리 자국 — 수위·최고 수위(월드 y)·자국 세기·젖은 테. 배선은 SceneHost */
  setLevel(massY: number, markY: number, residue: number, wet: number): void;
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

// 병 바닥 그늘 — 중심 밝고 가장자리 어두운 라디얼 그라디언트. 배경 톤과 겹치지 않는 어두운 브라운.
const floorFrag = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    vec3 center = vec3(0.235, 0.157, 0.098);
    vec3 edge = vec3(0.145, 0.090, 0.050);
    gl_FragColor = vec4(mix(center, edge, smoothstep(0.0, 1.0, d)), 1.0);
  }
`;

export function createJar(): Jar {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(JAR_RADIUS, JAR_RADIUS, JAR_HEIGHT, 48, 1, true);

  // 앞·뒤 유리가 같은 자국 uniform 집합을 쓴다 — 값은 setLevel이 양쪽에 함께 넣는다
  const residueUniforms = (): Record<string, { value: number }> => ({
    uMassY: { value: 0 },
    uMarkY: { value: 0 },
    uResidue: { value: 0 },
    uWetRim: { value: 0 },
  });

  const back = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: residueUniforms(),
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
      uniforms: residueUniforms(),
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

  // 병 바닥 — 반죽이 병 반지름을 다 못 채울 때 그 틈으로 배경이 링으로 비치는 것 차단.
  // 불투명 + 림보다 어두운 그늘 톤이라 배경(#E8D9C4)과 확실히 구분된다.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(JAR_RADIUS, 40),
    new THREE.ShaderMaterial({ vertexShader: hoochVert, fragmentShader: floorFrag }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.renderOrder = 2;
  group.add(floor);

  // 고무줄 마커는 제거(사용자 확정 2026-08-23) — 림 2개가 겹쳐 어수선.
  // 부피는 도우 fill 자체가 표현하고, 고무줄 문법은 천 덮개 착색에만 남긴다.

  // hooch(부유액) 층 — 반죽 윗면 위 얇은 반투명 디스크 (VISUAL §3-3)
  const hoochMat = new THREE.ShaderMaterial({
    vertexShader: hoochVert,
    fragmentShader: hoochFrag,
    uniforms: { uAmt: { value: 0 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
  });
  // 반죽 윗면 월드 반경이 초타원 실루엣으로 0.69×1.3≈0.897까지 커짐 — 도넛 방지 (2026-08-24)
  const hooch = new THREE.Mesh(new THREE.CircleGeometry(0.86, 40), hoochMat);
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

  const setLevel = (massY: number, markY: number, residue: number, wet: number): void => {
    for (const m of [back, front]) {
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uMassY.value = massY;
      u.uMarkY.value = markY;
      u.uResidue.value = residue;
      u.uWetRim.value = wet;
    }
  };

  return { group, hooch, setHooch, setLevel };
}
