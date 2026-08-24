// 반죽 메시 — 상태 uniform + 촉감 상태기(grab 점탄성·젓기 시어장·탭 덴트·슬로싱).
// RenderParams(순수 매핑 결과)를 받아 uniform·스케일을 구동한다. sim을 모른다.
// 반유동체 개편(2026-08-24, 오푸스 상담 반영): liquidity 축이 실루엣(회전 초타원체)·
// 슬로싱(감쇠 진동자)·점성 기억(poke·trail 확산 완화)·grab 릴리즈 시상수를 가른다.
import * as THREE from 'three';
import vert from './dough.vert.glsl?raw';
import frag from './dough.frag.glsl?raw';
import type { RenderParams } from '../renderParams';
import { BubbleSystem } from '../bubbles';

const BASE_Y = 0.5;
export const XZ_SCALE = 1.3; // 월드→오브젝트 XZ 변환에 입력층이 사용
const Y_SCALE = 0.78;
const R = 0.62; // 지오메트리 반지름
/** 실루엣 반경 상한 기본값(오브젝트) — 유리 내벽까지 여유 0.69×1.3 = 0.897 < 0.92 */
export const R_XZ_MAX_BASE = 0.69;
const JAR_RADIUS = 0.92;

const TRAIL_N = 4;
const TRAIL_SAMPLE_S = 0.04; // 실 능선 샘플 간격
const TRAIL_DECAY = 0.85;    // amp × e^(-0.85t) ≈ 1.2s 감쇠 — 점성 기억 (0.5s는 고무 문법)
const TRAIL_K0 = 26;         // 실 능선 첨도 — 나이 들수록 퍼진다 (26 → 하한 9)
const STIR_IDLE_S = 0.08;    // (stir 전용) 마지막 입력 후 이 시간 지나면 '놓음' — grab은 pointerup 기준
const POKE_K0 = 30;          // 탭 덴트 첨도 — 액체일수록 아물며 퍼진다 (하한 k0/3)

// ── grab 2시간척도 점탄성(SLS 근사) 기본값 — 확장기획 §4-2. 전부 튜닝 시작 가설,
//    상태 물성 3종(grabMax·creepGain·returnZeta)은 RenderParams, 나머지는 grabTuning 오버라이드 ──
// 수치 = 사용자 실기기 확정(2026-08-24 저녁, motionlab peak 프리셋 튜닝 결과)
const GRAB_DEFAULTS = {
  elasticTau: 0.07, // 잡는 동안 손가락 추종 τ(s) — 느슨하면 "답답"으로 읽힌다
  creepDelay: 0.7,  // 이 시간 이상 당기고 있어야 creep 축적 시작 (§4-2-2)
  creepTau: 1.0,    // 축적 τ(s)
  releaseTau: 1.2,  // 놓은 뒤 creep(측방 잔류) 해소 τ(s) — 릴리즈 시상수 중 가장 느림
  omega: 5.5,       // 복귀 고유진동수 — 12는 빠릿한 고무, 5.5가 무겁게 되돌아오는 반죽 (확정)
  kernelK: 1.6,     // 커널 첨도(영향 반경 1/√k ≈ 0.79) — 온몸이 넉넉히 따라온다 (확정)
  lift: 1.6,        // 수직 리프트 배율 — "쫙 늘어남"의 본체 (확정)
};
export type GrabTuning = Partial<
  typeof GRAB_DEFAULTS & { grabMax: number; grabCreepGain: number; grabReturnZeta: number }
>;

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
  private stirDrivesWobble = true;
  /** 슬로싱 진동자 속도항 — wobble은 감쇠 진동(1.5Hz), ζ는 liquidity가 정한다 */
  private wobbleVel = new THREE.Vector2();
  private wobbleTgt = new THREE.Vector2();
  private trail: Array<{ x: number; z: number; amp: number; bornAt: number }> = [];
  private trailIdx = 0;
  private lastTrailT = -Infinity;
  /** 젓는 세기 0~1 — 기포 가속·젖은 광 부스트·사운드 게인의 공통 소스 */
  agitation = 0;

  // ── grab 상태 — 잡은 지점이 손가락 "변위"를 따라온다 (§4-2-1. stir의 속도 채널과 별개) ──
  /** Motion Lab 전용 오버라이드 — 프로덕션 경로는 비워 둔다 */
  grabTuning: GrabTuning = {};
  private grabbing = false;
  private grabReleaseAge = Infinity; // 놓은 뒤 경과 — 릴리즈 시상수 분리(리프트→주름→퍼짐→측방)
  private grabAnchor = new THREE.Vector2();
  private grabTarget = new THREE.Vector2();  // 손가락-anchor 변위 (grabMax로 clamp)
  private grabElastic = new THREE.Vector2(); // 빠른 추종 성분 — 놓으면 스프링 복귀
  private grabElasticVel = new THREE.Vector2();
  private grabCreep = new THREE.Vector2();   // 느린 잔류 성분 — 놓아도 즉시 안 빠짐
  private grabLag = new THREE.Vector2();     // 하층 지연 위상(τ≈0.12s) — 층별 출렁임의 소스
  private grabHeldS = 0;

  constructor() {
    const bumpPos = Array.from({ length: 8 }, () => new THREE.Vector2());
    const trailPos = Array.from({ length: TRAIL_N }, () => new THREE.Vector2(9, 9)); // 화면 밖
    for (let i = 0; i < TRAIL_N; i++) this.trail.push({ x: 9, z: 9, amp: 0, bornAt: 0 });
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
        uTrailK: { value: new Float32Array(TRAIL_N).fill(TRAIL_K0) },
        uPokePos: { value: new THREE.Vector2() },
        uPokeAmt: { value: 0 },
        uPokeK: { value: POKE_K0 },
        uStirPos: { value: new THREE.Vector2() },
        uStirVec: { value: new THREE.Vector2() },
        uLiquid: { value: 0.5 },
        uRXZMax: { value: R_XZ_MAX_BASE },
        // 진값은 Y_SCALE·fill/XZ_SCALE ≈ 0.6·fill — 1.0에서 시작해 실기기에서 내리며 튜닝
        // (내리면 frag 범프 첨도 ×1.6 재튜닝 동반 — 오푸스 메모 §2-2b)
        uSlopeAspect: { value: 1.0 },
        uGrabPos: { value: new THREE.Vector2() },
        uGrabDisp: { value: new THREE.Vector2() },
        uGrabDispLag: { value: new THREE.Vector2() },
        uGrabShape: { value: new THREE.Vector2(GRAB_DEFAULTS.kernelK, GRAB_DEFAULTS.lift) },
        uGrabWrinkle: { value: 0 },
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
    u.uLiquid.value = p.liquidity;
    // uWet은 tick에서 agitation 부스트와 합성
  }

  /** 곰팡이 반점 시드 — 개체 정체성(createdAt 해시). 세션 간 자리 고정 */
  setMoldSeed(seed: number): void {
    this.material.uniforms.uMoldSeed.value = (Math.abs(seed) % 100000) / 100000 + 0.11;
  }

  /** 탭 눌림(양수)·홀드 부풂(음수) — 오브젝트 공간 XZ. 복귀는 liquidity가 가른다(tick) */
  pokeAt(x: number, z: number, amp = 0.06): void {
    (this.material.uniforms.uPokePos.value as THREE.Vector2).set(x, z);
    this.pokeAmp = amp;
    this.pokeAge = 0;
  }

  private grabParam(key: keyof typeof GRAB_DEFAULTS): number {
    return this.grabTuning[key] ?? GRAB_DEFAULTS[key];
  }
  private grabMax(): number {
    return this.grabTuning.grabMax ?? this.params?.grabMax ?? 0.2;
  }

  /** grab 시작 — anchor 기록 (오브젝트 공간 XZ). 놓기 판정은 grabEnd(pointerup) — §4 M2 해소 */
  grabStart(x: number, z: number): void {
    this.grabbing = true;
    this.grabHeldS = 0;
    this.grabReleaseAge = Infinity;
    this.grabAnchor.set(x, z);
    (this.material.uniforms.uGrabPos.value as THREE.Vector2).copy(this.grabAnchor);
  }

  /** grab 이동 — 변위 = 현재점 − anchor, 상태 물성(grabMax)으로 clamp */
  grabMove(x: number, z: number): void {
    if (!this.grabbing) return;
    this.grabTarget.set(x - this.grabAnchor.x, z - this.grabAnchor.y);
    const max = this.grabMax();
    if (this.grabTarget.length() > max) this.grabTarget.setLength(max);
  }

  /**
   * 놓기 — 릴리즈 시상수 분리(오푸스 메모 §1-5): 리프트 τ0.35(중력이 먼저) →
   * 주름 τ0.25 → 커널 퍼짐(합류) → creep τ1.2(측방 잔류가 마지막). tick이 굴린다.
   */
  grabEnd(): void {
    if (!this.grabbing) return;
    this.grabbing = false;
    this.grabReleaseAge = 0;
    // 연속성: 렌더 변위는 grab 중 elastic 단독 → 이후 elastic+creep.
    this.grabElastic.sub(this.grabCreep);
    this.grabElasticVel.set(0, 0);
  }

  /** 현재 신장 정도 0~1 — 사운드·햅틱 훅용 */
  grabStretch01(): number {
    const max = this.grabMax();
    return max <= 0 ? 0 : Math.min(1, this.grabTarget.length() / max);
  }

  /** Motion Lab 계기판용 — 내부 상태 스칼라만 노출 */
  grabDebug(): { elastic: number; creep: number; held: boolean } {
    return { elastic: this.grabElastic.length(), creep: this.grabCreep.length(), held: this.grabbing };
  }

  /**
   * 젓기 입력 — 오브젝트 공간 위치 + 프레임 속도(단위/s). 입력이 끊기면(0.08s)
   * tick이 자동으로 '놓음' 처리해 damped spring 복귀를 돌린다.
   * driveWobble=false: 연출(급여 시퀀스)이 wobble을 직접 연출할 때.
   */
  setStirInput(x: number, z: number, vx: number, vz: number, driveWobble = true): void {
    this.stirTarget.set(x, z);
    this.stirDrivesWobble = driveWobble;
    // 점성 게인 — 빠른 드래그도 반죽은 반 박자 늦게, 상한으로 찢어짐 방지
    this.stirVecTarget.set(
      THREE.MathUtils.clamp(vx * 0.10, -0.22, 0.22),
      THREE.MathUtils.clamp(vz * 0.10, -0.22, 0.22),
    );
    this.lastStirInputT = this.lastT;
  }

  /** 액체 보정 fill — 초타원 어깨 확장분 상쇄 (fill × (1 − 0.10·liquidity)) */
  private fillEff(): number {
    const fill = this.params?.fillY ?? 1;
    return fill * (1 - 0.1 * (this.params?.liquidity ?? 0.5));
  }

  /** 반죽 꼭대기 월드 y — hooch 층·레이캐스트 평면 배치용. 바닥 고정 피벗 기준 */
  topY(): number {
    const h = R * Y_SCALE;
    return BASE_Y - h + 2 * h * this.fillEff();
  }

  tick(t: number): void {
    const p = this.params;
    const liquid = p?.liquidity ?? 0.5;
    const amp = p?.breatheAmp ?? 0.04;
    const period = p?.breathePeriod ?? 3.5;
    const fill = this.fillEff();
    const breathe = 1 + amp * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / period));
    // 병에 갇힌 액체는 폭이 아니라 수위가 숨쉰다 — 숨은 Y 위주, XZ는 액체일수록 고정
    const bXZ = 1 + (breathe - 1) * (1 - 0.8 * liquid);
    this.mesh.scale.set(XZ_SCALE * bXZ, Y_SCALE * breathe * fill, XZ_SCALE * bXZ);
    // 부풀기는 바닥 고정 — 병 바닥에 앉은 채 위로만 차오른다
    const h = R * Y_SCALE;
    this.mesh.position.y = BASE_Y - h + h * fill;

    const dt = this.lastT < 0 ? 1 / 60 : Math.min(t - this.lastT, 0.1);
    this.lastT = t;
    const u = this.material.uniforms;

    // 반경 상한 — 숨쉬기 최대에도 유리 내벽(0.92) 관통 금지
    u.uRXZMax.value = Math.min(R_XZ_MAX_BASE, JAR_RADIUS / (XZ_SCALE * bXZ) - 0.005);

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
        seg.bornAt = t;
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

    // ── grab 2시간척도 (SLS 근사, §4-2-2·3) — 모든 감쇠는 1-exp(-k·dt) 주사율 독립 ──
    const czeta = this.grabTuning.grabReturnZeta ?? p?.grabReturnZeta ?? 0.95;
    const cgain = this.grabTuning.grabCreepGain ?? p?.grabCreepGain ?? 0.5;
    // 릴리즈 시상수 분리 — 리프트가 먼저 죽고(중력 τ0.35), 주름(τ0.25), 커널은 퍼진다(합류)
    const relAge = this.grabbing ? 0 : this.grabReleaseAge;
    if (!this.grabbing && Number.isFinite(relAge)) this.grabReleaseAge += dt;
    const k0 = this.grabParam('kernelK');
    const kEff = this.grabbing ? k0 : Math.max(k0 / (1 + relAge / 1.0), k0 / 2.5);
    const liftEff = this.grabParam('lift') * (this.grabbing ? 1 : Math.exp(-relAge / 0.35));
    (u.uGrabShape.value as THREE.Vector2).set(kEff, liftEff);
    u.uGrabWrinkle.value = this.grabbing ? 1 : Math.exp(-relAge / 0.25);
    const grabDisp = u.uGrabDisp.value as THREE.Vector2;
    if (this.grabbing) {
      this.grabHeldS += dt;
      // elastic — 손가락 빠른 추종. "잡고 멈춰도" 변위가 유지된다 (M1 해소)
      this.grabElastic.lerp(this.grabTarget, 1 - Math.exp(-dt / this.grabParam('elasticTau')));
      this.grabElasticVel.set(0, 0);
      // creep — 당긴 지 creepDelay부터 잔류분 축적 (놓을 때 남을 몫)
      if (this.grabHeldS >= this.grabParam('creepDelay')) {
        const ck = 1 - Math.exp(-dt / this.grabParam('creepTau'));
        this.grabCreep.x += (this.grabTarget.x * cgain - this.grabCreep.x) * ck;
        this.grabCreep.y += (this.grabTarget.y * cgain - this.grabCreep.y) * ck;
      }
      grabDisp.copy(this.grabElastic);
    } else if (this.grabElastic.lengthSq() > 1e-8 || this.grabCreep.lengthSq() > 1e-8) {
      // 놓음 — elastic만 임계감쇠 근처 스프링(오버슈트 ≤1회·낮게), creep은 지수 해소
      const w = this.grabParam('omega');
      const gax = -w * w * this.grabElastic.x - 2 * czeta * w * this.grabElasticVel.x;
      const gaz = -w * w * this.grabElastic.y - 2 * czeta * w * this.grabElasticVel.y;
      this.grabElasticVel.x += gax * dt;
      this.grabElasticVel.y += gaz * dt;
      this.grabElastic.x += this.grabElasticVel.x * dt;
      this.grabElastic.y += this.grabElasticVel.y * dt;
      this.grabCreep.multiplyScalar(Math.exp(-dt / this.grabParam('releaseTau')));
      grabDisp.set(this.grabElastic.x + this.grabCreep.x, this.grabElastic.y + this.grabCreep.y);
    } else {
      this.grabElastic.set(0, 0);
      this.grabElasticVel.set(0, 0);
      this.grabCreep.set(0, 0);
      grabDisp.set(0, 0);
    }
    // 하층 지연 위상 — 렌더 변위를 τ≈0.12s로 뒤따른다. 셰이더가 높이로 리드/지연을
    // 섞어 "층이 밀리는 출렁임"을 만든다
    const lagK = 1 - Math.exp(-dt / 0.12);
    this.grabLag.x += (grabDisp.x - this.grabLag.x) * lagK;
    this.grabLag.y += (grabDisp.y - this.grabLag.y) * lagK;
    if (this.grabLag.lengthSq() < 1e-8 && grabDisp.lengthSq() === 0) this.grabLag.set(0, 0);
    (u.uGrabDispLag.value as THREE.Vector2).copy(this.grabLag);

    // ── 실 능선 — 점성 기억: 옅어지며 "퍼진다"(첨도 26→9). 퍼짐이 점탄성의 시각 서명 ──
    const trailPos = u.uTrailPos.value as THREE.Vector2[];
    const trailAmp = u.uTrailAmp.value as Float32Array;
    const trailK = u.uTrailK.value as Float32Array;
    const decay = Math.exp(-TRAIL_DECAY * dt);
    for (let i = 0; i < TRAIL_N; i++) {
      this.trail[i].amp *= decay;
      const age = Math.max(0, t - this.trail[i].bornAt);
      trailK[i] = Math.max(TRAIL_K0 / (1 + age / 0.8), 9);
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
    // ── 슬로싱 — 감쇠 진동자(1.5Hz). 액체일수록 오래 출렁(ζ 0.55→0.10).
    //    셰이더는 이 값을 "수면 기울기"(액체)와 잔여 강체 시프트(고체)로 나눠 그린다 ──
    if (stirring && this.stirDrivesWobble) {
      this.wobbleTgt.copy(this.stirVec).multiplyScalar(5.0);
      if (this.wobbleTgt.length() > 0.6) this.wobbleTgt.setLength(0.6);
    } else {
      this.wobbleTgt.set(0, 0);
    }
    {
      const om = 2 * Math.PI * 1.5;
      const zeta = 0.55 - 0.45 * liquid;
      const wax = -om * om * (this.wobble.x - this.wobbleTgt.x) - 2 * zeta * om * this.wobbleVel.x;
      const waz = -om * om * (this.wobble.y - this.wobbleTgt.y) - 2 * zeta * om * this.wobbleVel.y;
      this.wobbleVel.x += wax * dt;
      this.wobbleVel.y += waz * dt;
      this.wobble.x += this.wobbleVel.x * dt;
      this.wobble.y += this.wobbleVel.y * dt;
      if (
        this.wobbleTgt.lengthSq() === 0 &&
        this.wobble.lengthSq() < 1e-8 &&
        this.wobbleVel.lengthSq() < 1e-6
      ) {
        this.wobble.set(0, 0);
        this.wobbleVel.set(0, 0);
      }
    }
    (u.uWobble.value as THREE.Vector2).copy(this.wobble);

    // ── 탭 자국 — 고체는 스프링(되튐 1회), 액체는 "넓어지며 얕아지는" 점성 아묾 ──
    if (this.pokeAge < 8) {
      this.pokeAge += dt;
      const a = this.pokeAge;
      const springAmt = this.pokeAmp * Math.exp(-5 * a) * Math.cos(12 * a);
      const tauR = 0.45 + 1.35 * liquid; // mix(0.45, 1.8, liquidity)
      const viscAmt = (this.pokeAmp * Math.exp(-a / tauR)) / (1 + a / 0.9);
      const amt = springAmt * (1 - liquid) + viscAmt * liquid;
      u.uPokeAmt.value = Math.abs(amt) < 5e-4 && a > 1.1 ? 0 : amt;
      u.uPokeK.value = Math.max(POKE_K0 / (1 + (a / 0.9) * liquid), POKE_K0 / 3);
      if ((u.uPokeAmt.value as number) === 0) this.pokeAge = Infinity;
    } else if ((u.uPokeAmt.value as number) !== 0) {
      u.uPokeAmt.value = 0;
    }
  }
}
