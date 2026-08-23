// 반죽 메시 — 상태 uniform + 젓기 촉감 상태기(손가락 시어장·끈적한 실·탭 덴트).
// RenderParams(순수 매핑 결과)를 받아 uniform·스케일을 구동한다. sim을 모른다.
import * as THREE from 'three';
import vert from './dough.vert.glsl?raw';
import frag from './dough.frag.glsl?raw';
import type { RenderParams } from '../renderParams';
import { BubbleSystem } from '../bubbles';

const BASE_Y = 0.5;
export const XZ_SCALE = 1.3; // 월드→오브젝트 XZ 변환에 입력층이 사용
const Y_SCALE = 0.78;
const R = 0.62; // 지오메트리 반지름

const TRAIL_N = 4;
const TRAIL_SAMPLE_S = 0.04; // 실 능선 샘플 간격
const TRAIL_DECAY = 2.0;     // amp × e^(-2t) ≈ 0.5s 감쇠
const STIR_IDLE_S = 0.08;    // 마지막 입력 후 이 시간 지나면 '놓음'으로 간주

export class DoughMesh {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly wobble = new THREE.Vector2();
  readonly bubbles = new BubbleSystem();

  /** 현재 적용 중인 파라미터 (스무딩 완료값) */
  private params: RenderParams | null = null;
  private lastT = -1;
  private pokeAge = Infinity; // 탭 눌림 경과(s) — Infinity = 비활성
  private pokeAmp = 0.06;     // 양수 = 덴트, 음수 = 부풂(홀드)

  // ── 젓기 상태 — 입력층이 setStirInput으로 밀어 넣고, tick이 스프링·감쇠를 굴린다 ──
  private stirTarget = new THREE.Vector2();
  private stirVecTarget = new THREE.Vector2();
  private stirVec = new THREE.Vector2();      // uStirVec 현재값
  private stirVecVel = new THREE.Vector2();   // 놓은 뒤 damped spring 속도항
  private lastStirInputT = -Infinity;
  private trail: Array<{ x: number; z: number; amp: number }> = [];
  private trailIdx = 0;
  private lastTrailT = -Infinity;
  /** 젓는 세기 0~1 — 기포 가속·젖은 광 부스트·사운드 게인의 공통 소스 */
  agitation = 0;

  constructor() {
    const bumpPos = Array.from({ length: 8 }, () => new THREE.Vector2());
    const trailPos = Array.from({ length: TRAIL_N }, () => new THREE.Vector2(9, 9)); // 화면 밖
    for (let i = 0; i < TRAIL_N; i++) this.trail.push({ x: 9, z: 9, amp: 0 });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWobble: { value: new THREE.Vector2() },
        uColor: { value: new THREE.Color(0xf4ead4) },
        uNoiseSpeed: { value: 1.0 },
        uSpecStr: { value: 1.0 },
        uCrust: { value: 0 },
        uFlourDust: { value: 0 },
        uWet: { value: 0 },
        uRipe: { value: 0 },
        uCollapse: { value: 0 },
        uPoreDensity: { value: 0 },
        uKahm: { value: 0 },
        uMold: { value: 0 },
        uMoldSeed: { value: 0.37 },
        uBumpPos: { value: bumpPos },
        uBumpAmp: { value: new Float32Array(8) },
        uBumpK: { value: new Float32Array(8) },
        uTrailPos: { value: trailPos },
        uTrailAmp: { value: new Float32Array(TRAIL_N) },
        uPokePos: { value: new THREE.Vector2() },
        uPokeAmt: { value: 0 },
        uStirPos: { value: new THREE.Vector2() },
        uStirVec: { value: new THREE.Vector2() },
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
    u.uRipe.value = p.ripe;
    u.uCollapse.value = p.collapse;
    u.uPoreDensity.value = p.bubbleDensity * 0.8;
    u.uKahm.value = p.kahm;
    u.uMold.value = p.mold;
    // uWet은 tick에서 agitation 부스트와 합성
  }

  /** 곰팡이 반점 시드 — 개체 정체성(createdAt 해시). 세션 간 자리 고정 */
  setMoldSeed(seed: number): void {
    this.material.uniforms.uMoldSeed.value = (Math.abs(seed) % 100000) / 100000 + 0.11;
  }

  /** 탭 눌림(양수)·홀드 부풂(음수) — 오브젝트 공간 XZ. damped spring으로 복귀(VISUAL §5) */
  pokeAt(x: number, z: number, amp = 0.06): void {
    (this.material.uniforms.uPokePos.value as THREE.Vector2).set(x, z);
    this.pokeAmp = amp;
    this.pokeAge = 0;
  }

  /**
   * 젓기 입력 — 오브젝트 공간 위치 + 프레임 속도(단위/s). 입력이 끊기면(0.08s)
   * tick이 자동으로 '놓음' 처리해 damped spring 복귀를 돌린다.
   */
  setStirInput(x: number, z: number, vx: number, vz: number): void {
    this.stirTarget.set(x, z);
    // 점성 게인 — 빠른 드래그도 반죽은 반 박자 늦게, 상한으로 찢어짐 방지
    this.stirVecTarget.set(
      THREE.MathUtils.clamp(vx * 0.10, -0.22, 0.22),
      THREE.MathUtils.clamp(vz * 0.10, -0.22, 0.22),
    );
    this.lastStirInputT = this.lastT;
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

    const dt = this.lastT < 0 ? 1 / 60 : Math.min(t - this.lastT, 0.1);
    this.lastT = t;
    const u = this.material.uniforms;

    // ── 젓기 스프링·실 감쇠 ──
    const stirring = t - this.lastStirInputT < STIR_IDLE_S;
    const stirPos = u.uStirPos.value as THREE.Vector2;
    if (stirring) {
      // 손가락 추종 — 빠른 지수 수렴, 놓기 전까지 스프링 비활성
      stirPos.lerp(this.stirTarget, 1 - Math.exp(-14 * dt));
      this.stirVec.lerp(this.stirVecTarget, 1 - Math.exp(-12 * dt));
      this.stirVecVel.set(0, 0);
      // 실 능선 샘플
      if (t - this.lastTrailT >= TRAIL_SAMPLE_S) {
        this.lastTrailT = t;
        const seg = this.trail[this.trailIdx];
        seg.x = stirPos.x;
        seg.z = stirPos.y;
        seg.amp = 0.035 * Math.min(1, this.stirVec.length() * 8 + 0.3);
        this.trailIdx = (this.trailIdx + 1) % TRAIL_N;
      }
    } else if (this.stirVec.lengthSq() > 1e-8) {
      // 놓음 — damped spring e^(-5t)cos(12t) 감각 (ω≈12, 오버슈트 1회)
      const ax = -144 * this.stirVec.x - 10 * this.stirVecVel.x;
      const az = -144 * this.stirVec.y - 10 * this.stirVecVel.y;
      this.stirVecVel.x += ax * dt;
      this.stirVecVel.y += az * dt;
      this.stirVec.x += this.stirVecVel.x * dt;
      this.stirVec.y += this.stirVecVel.y * dt;
    } else {
      this.stirVec.set(0, 0);
      this.stirVecVel.set(0, 0);
    }
    (u.uStirVec.value as THREE.Vector2).copy(this.stirVec);
    this.agitation = Math.min(1, this.stirVec.length() * 6);

    const trailPos = u.uTrailPos.value as THREE.Vector2[];
    const trailAmp = u.uTrailAmp.value as Float32Array;
    const decay = Math.exp(-TRAIL_DECAY * dt);
    for (let i = 0; i < TRAIL_N; i++) {
      this.trail[i].amp *= decay;
      trailPos[i].set(this.trail[i].x, this.trail[i].z);
      trailAmp[i] = this.trail[i].amp;
    }

    // ── 기포 — 젓는 동안 부상·팝 가속 (agitation) ──
    this.bubbles.update(t, p?.bubbleDensity ?? 0.4, p?.bubbleScale ?? 1, this.agitation);
    const posArr = u.uBumpPos.value as THREE.Vector2[];
    for (let i = 0; i < 8; i++) posArr[i].set(this.bubbles.pos[i * 2], this.bubbles.pos[i * 2 + 1]);
    (u.uBumpAmp.value as Float32Array).set(this.bubbles.amp);
    (u.uBumpK.value as Float32Array).set(this.bubbles.k);

    // 젖은 광 — 상태 기본값 + 젓기 부스트
    u.uWet.value = Math.min(1, (p?.wet ?? 0) + 0.3 * this.agitation);

    u.uTime.value = t;
    // 프레임률 독립 감쇠 — 60fps 기준 ×0.9/frame과 등가(e^{-6·1/60}≈0.905)
    this.wobble.multiplyScalar(Math.exp(-6 * dt));
    (u.uWobble.value as THREE.Vector2).copy(this.wobble);

    // 탭 눌림 스프링 복귀 e^(-5t)·cos(12t) — 눌렸다 살짝 되튀고 정착
    if (this.pokeAge < 1.1) {
      this.pokeAge += dt;
      const a = this.pokeAge;
      u.uPokeAmt.value = a >= 1.1 ? 0 : this.pokeAmp * Math.exp(-5 * a) * Math.cos(12 * a);
    } else if ((u.uPokeAmt.value as number) !== 0) {
      u.uPokeAmt.value = 0;
    }
  }
}
