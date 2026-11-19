// 끊긴 뒤 더미 메시(2026-11-19) — 블렌더로 접어 포갠 줄 더미(public/fx/dough_coil.glb, scripts/blender/fx/dough_coil.py)를
// StrandRig가 더미를 만드는 자리에 띄운다. 모프(K0 막 떨어짐 → K1 처짐 → K2 녹아 붙음)는 CPU에서 섞고(정점 1828 × 3, 보일 때만),
// 음영은 가닥 frag(STRAND_FRAG)를 그대로 쓴다 — 가닥 · 반죽과 같은 결이라 따로 놀지 않는다. 로드 전 · 실패면 아무것도 안 띄운다(높이장 더미만).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MOUND_H, STRAND_FRAG } from './StrandMesh';

export const COIL_URL = '/fx/dough_coil.glb';
/** 발자국 지름 = 2 × 더미 반지름 × COIL_FOOT (모델 발자국 지름 ≈ 1) */
export const COIL_FOOT = 0.95;
/** 높이 배율 = 발자국 × COIL_H (모델 높이 K0 0.2 ≈ 발자국의 0.2 — 실물 비) */
export const COIL_H = 1.0;
/** 메시가 보이는 동안 높이장 더미(uPile 높이)에 곱하는 몫 — 밑을 받치는 낮고 넓은 둔덕만. 추정 — 실측 없음 */
export const PILE_BASE_K = 0.2;

/** 더미 쌓인 양(peak ÷ MOUND_H)의 √로 발자국을 줄인다 — 가는 가닥 하나가 끊겨 쌓인 작은 더미(0.2 안팎)가 완성 더미 크기로 뜨지 않게.
 *  하한 0.45는 추정 — 실측 없음 */
const VOL_MIN = 0.45;

/** 더미 높이 비율 k(1 = 막 떨어짐 → 0)의 경계 — K0 → K1 · K1 → K2 · Y 배율 0 · 숨김 */
const K_K1 = 0.55;
const K_K2 = 0.15;
const K_FLAT = 0.05;
/** 모프 위치가 따라가는 τ(s) — 같은 자리에 또 떨어져 k가 튀어 올라도 모양이 톡 튀지 않게 */
const M_TAU = 0.12;

export interface CoilPhase {
  /** 모프 위치 0 K0 · 1 K1 · 2 K2 */
  m: number;
  yScale: number;
  visible: boolean;
}

/** k → 모프 위치 · Y 배율 · 보임(three 없는 순수 함수). runny 0~1 — 묽음은 K1에서 시작한다(짧고 굵게 합쳐짐) */
export function coilPhase(k: number, runny = 0): CoilPhase {
  const kk = Math.min(1, Math.max(0, k));
  const m = kk >= K_K1 ? (1 - kk) / (1 - K_K1) : 1 + Math.min(1, (K_K1 - kk) / (K_K1 - K_K2));
  const yScale = kk >= K_K2 ? 1 : Math.max(0, (kk - K_FLAT) / (K_K2 - K_FLAT));
  return { m: Math.max(m, Math.min(1, Math.max(0, runny))), yScale, visible: kk > K_FLAT };
}

/** 모프 위치 m → K0 · K1 · K2 가중치(합 1) */
export function coilWeights(m: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const c = Math.min(2, Math.max(0, m));
  out[0] = Math.max(0, 1 - c);
  out[1] = 1 - Math.abs(c - 1);
  out[2] = Math.max(0, c - 1);
  return out;
}

interface CoilData {
  /** 모프 3개 × (정점 × 3) — 절대 위치 · 노멀(노드 변환 구워짐) */
  pos: Float32Array[];
  nrm: Float32Array[];
  /** 정점 그늘 — COLOR_0 r(접힌 골 AO, 1 = 트임). 없으면 전부 1. 모프와 무관한 고정 속성 */
  ao: Float32Array;
  index: THREE.BufferAttribute;
}

let dataPromise: Promise<CoilData | null> | null = null;

/** 앱 시작 때 한 번 — 컨텍스트 복구로 씬을 다시 지어도 같은 약속을 쓴다. 실패는 null(console.warn 한 줄, 오류 표시 없음) */
export function loadCoilData(url = COIL_URL): Promise<CoilData | null> {
  dataPromise ??= (async () => {
    try {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(url);
      gltf.scene.updateMatrixWorld(true);
      let mesh: THREE.Mesh | null = null;
      gltf.scene.traverse((o) => {
        if (!mesh && o instanceof THREE.Mesh) mesh = o;
      });
      const found = mesh as THREE.Mesh | null;
      const geo = found?.geometry;
      const morphP = geo?.morphAttributes.position;
      const morphN = geo?.morphAttributes.normal;
      if (!found || !geo || !geo.index || !morphP || morphP.length < 3 || !morphN || morphN.length < 3) {
        throw new Error('모프 3개 없음');
      }
      // 노드 변환(양자화 보정 배율 · 이동)을 구워 둔다. 모프는 기본 모양 + 변위(상대). 노드 배율이 균일이라 노멀은 그대로
      const e = found.matrixWorld.elements;
      const bp = geo.getAttribute('position');
      const bn = geo.getAttribute('normal');
      const n = bp.count;
      const pos: Float32Array[] = [];
      const nrm: Float32Array[] = [];
      for (let i = 0; i < 3; i++) {
        const p = new Float32Array(n * 3);
        const q = new Float32Array(n * 3);
        for (let v = 0; v < n; v++) {
          const px = bp.getX(v) + morphP[i].getX(v);
          const py = bp.getY(v) + morphP[i].getY(v);
          const pz = bp.getZ(v) + morphP[i].getZ(v);
          p[v * 3] = e[0] * px + e[4] * py + e[8] * pz + e[12];
          p[v * 3 + 1] = e[1] * px + e[5] * py + e[9] * pz + e[13];
          p[v * 3 + 2] = e[2] * px + e[6] * py + e[10] * pz + e[14];
          const nx = bn.getX(v) + morphN[i].getX(v);
          const ny = bn.getY(v) + morphN[i].getY(v);
          const nz = bn.getZ(v) + morphN[i].getZ(v);
          const l = Math.hypot(nx, ny, nz) || 1;
          q[v * 3] = nx / l;
          q[v * 3 + 1] = ny / l;
          q[v * 3 + 2] = nz / l;
        }
        pos.push(p);
        nrm.push(q);
      }
      // COLOR_0(GLTF 로더가 'color'로 준다)이 있으면 r만, 없으면 1 — 그늘 없는 더미
      const col = geo.getAttribute('color');
      const ao = new Float32Array(n).fill(1);
      if (col) for (let v = 0; v < n; v++) ao[v] = col.getX(v);
      return { pos, nrm, ao, index: geo.index.clone() };
    } catch (err) {
      console.warn('[CoilMesh] 더미 메시 로드 실패 — 높이장 더미만 쓴다', err);
      return null;
    }
  })();
  return dataPromise;
}

// 가닥 frag가 읽는 varying을 다 채운다(vAO = 정점 그늘) — 기둥 결 꺼짐(vMain 0) · 가늘수록 밝음 꺼짐(vThin 0) 상수.
// Y만 줄어드는 비균일 배율이라 노멀은 모델 3×3의 역전치로(균일 가정이면 납작해질 때 음영이 안 눕는다)
const COIL_VERT = /* glsl */ `
attribute float aAO;
uniform float uCoilM;
varying float vAO;
varying vec3 vN;
varying vec3 vSide;
varying vec3 vW;
varying float vU;
varying float vAng;
varying float vThin;
varying float vMain;
varying vec3 vT;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  vSide = vec3(1.0, 0.0, 0.0);
  vT = vec3(0.0, 1.0, 0.0);
  vU = 0.5;
  vAng = 0.0;
  vThin = 0.0;
  vMain = 0.0;
  // 정점 그늘 — 모프가 녹을수록(uCoilM 0 → 1) 약하게. 접힌 골이 녹아 붙으면 그늘도 사라진다
  vAO = mix(1.0, aAO, 1.0 - uCoilM * 0.8);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/** 더미 메시 — draw call 1(보일 때만). uniforms = 가닥 머티리얼의 uniforms 객체 그대로(uColor · uWet · uNeck 등이 따로 놀지 않게) */
export class CoilMesh {
  readonly mesh: THREE.Mesh;
  /** 모프 진행 0..1(m ÷ 2) — 정점 그늘이 녹는 정도 */
  private readonly coilM: THREE.IUniform<number>;
  private data: CoilData | null = null;
  private posAttr: THREE.BufferAttribute | null = null;
  private nrmAttr: THREE.BufferAttribute | null = null;
  private peak = 0;
  private rot = 0;
  private m = -1;
  private lastM = -1;
  private readonly w: [number, number, number] = [0, 0, 0];

  constructor(strandUniforms: Record<string, THREE.IUniform>) {
    // 가닥 uniform 항목(IUniform)을 같은 객체로 공유한다 — uColor · uWet · uDetail 등이 따로 놀지 않게. uCoilM만 더미 몫
    this.coilM = { value: 0 };
    const material = new THREE.ShaderMaterial({
      uniforms: { ...strandUniforms, uCoilM: this.coilM },
      vertexShader: COIL_VERT,
      fragmentShader: STRAND_FRAG,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.frustumCulled = false; // 자리는 sync가 정한다
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
  }

  /** 앱 시작 때 한 번 — 못 받으면 조용히 false(높이장 더미만) */
  async load(): Promise<boolean> {
    const d = await loadCoilData();
    if (!d) return false;
    if (this.data) return true;
    this.data = d;
    const n = d.pos[0].length;
    const geo = this.mesh.geometry;
    this.posAttr = new THREE.BufferAttribute(new Float32Array(n), 3).setUsage(THREE.DynamicDrawUsage);
    this.nrmAttr = new THREE.BufferAttribute(new Float32Array(n), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('normal', this.nrmAttr);
    geo.setAttribute('aAO', new THREE.BufferAttribute(d.ao, 1));
    geo.setIndex(d.index);
    this.lastM = -1;
    return true;
  }

  /**
   * 매 프레임 — pile = StrandRig.pile(월드 x, z, 높이, 반경). surfaceY = 그 자리 반죽 윗면(월드).
   * rise = riseK(윗물 덮임) · runny = 묽음 몫. 반환 = 높이장 더미(uPile 높이)에 곱할 몫 — 메시가 보이면 PILE_BASE_K, 아니면 1
   */
  sync(
    pile: readonly number[], dt: number, show: boolean, runny: number, rise: number, surfaceY: (x: number, z: number) => number,
  ): number {
    const h = pile[2];
    if (!(h > 0)) this.peak = 0;
    else {
      if (this.peak === 0) {
        // 새 더미 — 자리 해시로 돌린다
        this.rot = ((Math.sin(pile[0] * 91.7 + pile[1] * 57.3 + h * 1234.5) * 43758.5453) % 1) * Math.PI * 2;
        this.m = -1;
      }
      this.peak = Math.max(this.peak, h); // 같은 자리에 또 떨어지면 기준 높이가 올라 k가 다시 1 쪽으로
    }
    const d = this.data;
    const ph = this.peak > 0 ? coilPhase(h / this.peak, runny) : null;
    const vis = !!d && show && !!ph && ph.visible;
    this.mesh.visible = vis;
    if (!vis || !d || !ph || !this.posAttr || !this.nrmAttr) return 1;
    // 모프 위치 — 처음엔 바로, 이후엔 τ로 따라간다
    this.m = this.m < 0 ? ph.m : this.m + (ph.m - this.m) * (1 - Math.exp(-Math.max(dt, 0) / M_TAU));
    this.coilM.value = Math.min(1, this.m / 2);
    if (Math.abs(this.m - this.lastM) > 1e-4) {
      this.lastM = this.m;
      const w = coilWeights(this.m, this.w);
      const P = this.posAttr.array as Float32Array;
      const N = this.nrmAttr.array as Float32Array;
      const [p0, p1, p2] = d.pos;
      const [n0, n1, n2] = d.nrm;
      for (let i = 0; i < P.length; i += 3) {
        P[i] = w[0] * p0[i] + w[1] * p1[i] + w[2] * p2[i];
        P[i + 1] = w[0] * p0[i + 1] + w[1] * p1[i + 1] + w[2] * p2[i + 1];
        P[i + 2] = w[0] * p0[i + 2] + w[1] * p1[i + 2] + w[2] * p2[i + 2];
        const x = w[0] * n0[i] + w[1] * n1[i] + w[2] * n2[i];
        const y = w[0] * n0[i + 1] + w[1] * n1[i + 1] + w[2] * n2[i + 1];
        const z = w[0] * n0[i + 2] + w[1] * n1[i + 2] + w[2] * n2[i + 2];
        const l = Math.hypot(x, y, z) || 1;
        N[i] = x / l;
        N[i + 1] = y / l;
        N[i + 2] = z / l;
      }
      this.posAttr.needsUpdate = true;
      this.nrmAttr.needsUpdate = true;
    }
    const foot = 2 * pile[3] * COIL_FOOT * Math.min(1, Math.max(VOL_MIN, Math.sqrt(this.peak / MOUND_H)));
    this.mesh.position.set(pile[0], surfaceY(pile[0], pile[1]), pile[1]);
    this.mesh.rotation.y = this.rot;
    this.mesh.scale.set(foot, foot * COIL_H * ph.yScale * rise, foot);
    return PILE_BASE_K;
  }
}
