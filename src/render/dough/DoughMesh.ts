// 반죽 메시 — 상태 uniform + 촉감 상태기(grab 점탄성·젓기 시어장·탭 덴트·슬로싱).
// RenderParams(순수 매핑 결과)를 받아 uniform·스케일을 구동한다. sim을 모른다.
// 반유동체 개편(2026-08-24): 초타원체 실루엣·감쇠 진동자 슬로싱·점성 기억.
// 축 개편(2026-08-25): 구 liquidity 1축이 형상과 물성을 동시에 몰던 것을 4축으로 쪼갰다 —
// levelness(형상) / fluidity(흐름: 슬로싱 ζ·poke 아묾) / cohesion(응집: 실 능선 기억) /
// elasticity(되돌아옴: poke 스프링·grab ζ). 한 축으로 되돌리지 말 것.
// 반죽 모델 v2(2026-11-19): 초타원체(IcosahedronGeometry) → 「병 채움」 매개 메시. 옆벽은 유리에 붙은 원기둥,
// 바닥은 y=0에 평평, 윗면이 하이트필드다(dough.vert.glsl 머리 주석). 높이는 RenderParams.height(월드)를
// uniform으로 받고, mesh.scale.y는 숨쉬기만 맡는다 — 바닥 피벗이 y=0이라 숨이 바닥을 움직이지 않는다.
import * as THREE from 'three';
import vert from './dough.vert.glsl?raw';
import frag from './dough.frag.glsl?raw';
import type { RenderParams } from '../renderParams';
import { BubbleSystem, DYN_SLOTS } from '../bubbles';
import { createFillGeometry, FILL_RADIUS, HOOCH_COVER, JAR_HEIGHT, MARBLE_GLSL } from '../jar';

export const XZ_SCALE = 1.3; // 월드→오브젝트 XZ 변환에 입력층이 사용 (월드 XZ = 오브젝트 XZ × XZ_SCALE)
/** 옆벽 반경(오브젝트) — 유리 안쪽 FILL_RADIUS(0.912 월드) */
export const R_BODY = FILL_RADIUS / XZ_SCALE;
/** 메시 해상도 — 둘레 · 윗면 링 · 옆벽 행 (A1-04: 구 720 tri는 어깨가 각졌다) */
const SEG = 128;
const RINGS = 30;
const ROWS = 20;
/** 돔·크레이터 커널의 테두리 값 — vert의 exp(−c2·k·kR)에서 c2 = R_BODY²일 때 */
const DOME_RIM = Math.exp(-2.5 * 0.3844);
const CRATER_RIM = Math.exp(-2.0 * 0.3844);
/** 롱프레스 — 0.03까지 천천히 부풀고(τ), 떼면 easeOut 지수 감쇠(VISUAL §5) */
const HOLD_AMP = 0.03;
const HOLD_RISE_TAU = 0.6;
const HOLD_FALL_TAU = 0.3;
/** 하강 꺼짐 깊이(월드) — 가운데 기준, 테두리는 0(유리에 붙어 남는다). vert uSink 항과 같은 값 */
const SINK_DEPTH = 0.05;
/** 곰팡이 군락 수 — 확산(uMold)에 따라 1→5개가 드러난다(반점 1~2개 · 퍼짐 3~5개). 셰이더 uMoldA 길이와 같다(테스트가 잠근다) */
export const MOLD_N = 5;

/** 시드 → 0~1 난수열(mulberry32) — 곰팡이 군락 자리. 같은 시드면 같은 자리 */
function seededRandom(seed: number): () => number {
  let a = Math.floor(Math.abs(seed)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 고랑 자취(2026-11-19 섞는 맛 M2) — 실 능선 4점 가우시안 솟음을 버리고 손끝 자취를 고랑으로 판다.
//    점 TRAIL_N개를 잇는 선분 TRAIL_N − 1개(캡슐 거리), 단면 f = −A(1−2q)e^(−q), q = r²K — 가운데 고랑 −A · 양옆 둔덕 +0.45A.
//    맨 끝 점(머리)은 손끝을 따라다니다 TRAIL_STEP만큼 멀어지면 굳고 새 머리가 생긴다 → 손끝 밑 = 고랑 끝의 둥근 패임 ──
/** 자취 점 수 — 셰이더 uTrail* 길이(선분 루프는 TRAIL_N − 1)와 같다(테스트가 잠근다) */
export const TRAIL_N = 8;
/** 갓 판 고랑 깊이(월드) — 셰이더 TRAIL_A와 단일 소스(TRAIL_GROOVE에 끼운다) */
const TRAIL_A = 0.016;
const TRAIL_STEP = 0.19;     // 자취 점 간격(오브젝트) — 굳은 6선분 ≈ 손끝 뒤 0.6바퀴(F3: 0.13은 쉼표 한 토막으로 읽혔다)
const TRAIL_K0 = 90;         // 갓 판 고랑 첨도 — 반폭(q 0.5) ≈ 0.075. 나이 들수록 넓어진다(하한 K0/3)
const TRAIL_TAU_THICK = 1.6; // 메워짐 τ(s) — 되직(stirThickness 1)
const TRAIL_TAU_FLUID = 0.3; //                묽음(0)
const TRAIL_TAU_RIPE = 1.5;  // 피크(ripe 1)는 τ × (1 + 1.5) — 공기가 빠진 자리는 덜 메워진다
const STIR_IDLE_S = 0.08;    // (stir 전용) 마지막 입력 후 이 시간 지나면 '놓음' — grab은 pointerup 기준
/** 되기 정규화 — fluidity 0.1 이하 = 되직 1, 0.65 이상 = 묽음 0 (갓 밥준 0.22 → 0.78 · 시큼 0.66 → 0) */
const THICK_FLUID_LO = 0.1;
const THICK_FLUID_HI = 0.65;
/** 피크 젓기 꺼짐 — 젓는 거리(오브젝트) × ripe × 0.1이 쌓이고(상한 0.6) τ20s로 돌아온다. uSink에 더한다 */
const KNOCK_GAIN = 0.1;
const KNOCK_MAX = 0.6;
const KNOCK_TAU = 20;
/** 줄무늬 — 혼자 τ6s, 손으로 한 바퀴(경로 2π·0.55R)마다 ×0.38. 0.05 아래로 손이 떨어뜨리면 다 섞임 */
const MARBLE_TAU = 6;
const MARBLE_LOOP = 2 * Math.PI * 0.55 * R_BODY;
const MARBLE_PER_LOOP = 0.38;
const MARBLE_DONE = 0.05;
const MIX_GLINT = 0.25;      // 다 섞임 젖은 광 +0.25, τ1.5s
const MIX_GLINT_TAU = 1.5;
/** hooch 탁해짐 — 젓는 동안 τ0.6s로 오르고 τ5s로 가라앉는다 */
const MURK_RISE_TAU = 0.6;
const MURK_FALL_TAU = 5;

/**
 * 고랑 함수 — 버텍스(높이 x)와 프래그(기울기 yz · 갓 저은 정도 w)가 이 소스 하나를 쓴다(규칙 8).
 * 가장 가까운 선분 하나만 본다(q 최소) — 이웃 선분을 더하면 이음매마다 두 번 패여 구슬 줄이 된다.
 * uTrailK 음수 = 그 점이 새 획의 시작이라 앞 점과 잇지 않는다(크기는 절댓값).
 */
export const TRAIL_GROOVE = /* glsl */ `
const float TRAIL_A = ${TRAIL_A};
vec4 trailGroove(vec2 p) {
  float bq = 1e9;
  float bA = 0.0;
  float bK = 1.0;
  vec2 bd = vec2(0.0);
  for (int i = 0; i < ${TRAIL_N - 1}; i++) {
    float kb = uTrailK[i + 1];
    if (kb < 0.0 || max(uTrailAmp[i], uTrailAmp[i + 1]) < 1e-5) continue;
    vec2 a = uTrailPos[i];
    vec2 ab = uTrailPos[i + 1] - a;
    float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
    vec2 d = p - a - ab * h;
    float K = mix(abs(uTrailK[i]), kb, h);
    float q = dot(d, d) * K;
    if (q < bq) { bq = q; bA = mix(uTrailAmp[i], uTrailAmp[i + 1], h); bK = K; bd = d; }
  }
  if (bq > 9.0) return vec4(0.0);
  float e = exp(-bq);
  return vec4(-bA * (1.0 - 2.0 * bq) * e, bA * e * (3.0 - 2.0 * bq) * 2.0 * bK * bd,
              clamp(bA / TRAIL_A, 0.0, 1.0) * exp(-0.7 * bq));
}
`;
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
  private pokeAmp = 0.06;     // 양수 = 덴트
  /** 롱프레스 홀드 — 탭과 같은 poke uniform을 쓰되 상태기는 따로(A1-15) */
  private holding = false;
  private holdLevel = 0;

  // ── 젓기 상태 — 입력층이 setStirInput으로 밀어 넣고, tick이 스프링·감쇠를 굴린다 ──
  private stirTarget = new THREE.Vector2();
  private stirVecTarget = new THREE.Vector2();
  private stirVec = new THREE.Vector2();      // uStirVec 현재값
  private stirVecVel = new THREE.Vector2();   // 놓은 뒤 damped spring 속도항
  private lastStirInputT = -Infinity;
  private stirDrivesWobble = true;
  private lastHandStirT = -Infinity;
  private wasStirring = false;
  private prevStirTarget = new THREE.Vector2();
  /** 슬로싱 진동자 속도항 — wobble은 감쇠 진동(1.5Hz), ζ는 fluidity가 정한다 */
  private wobbleVel = new THREE.Vector2();
  private wobbleTgt = new THREE.Vector2();
  /** 고랑 자취 링버퍼 — trailHead가 손끝을 따라다니는 머리, brk = 새 획의 첫 점(앞 점과 안 잇는다) */
  private trail: Array<{ x: number; z: number; amp: number; bornAt: number; brk: boolean }> = [];
  private trailHead = 0;
  /** 젓는 세기 0~1 — 기포 가속·젖은 광 부스트·사운드 게인의 공통 소스 */
  agitation = 0;
  /** 피크 젓기 꺼짐 0~0.6 — uSink에 더한다(τ20s 회복) */
  private knock = 0;
  /** 밥 주기 줄무늬 세기 0~1 · 소용돌이 위상(rad) — 연출이 setMarble로 넣고, 옅어짐은 tick이 굴린다 */
  marble = 0;
  marblePhase = 0;
  /** 이번 tick에 손 젓기가 줄무늬를 0.05 아래로 떨어뜨렸나 — SceneHost.onMixed가 읽는다 */
  mixedThisFrame = false;
  private mixGlint = 0;
  /** hooch 탁해짐 0~1 — SceneHost가 jar.setMurk로 넘긴다 */
  murk = 0;
  /** 개체별 호흡 위상 — 두 르방이 같은 박자로 숨쉬지 않게 한다 (setSeed) */
  private seedPhase = 0;

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
    const bumpPos = Array.from({ length: DYN_SLOTS }, () => new THREE.Vector2());
    const trailPos = Array.from({ length: TRAIL_N }, () => new THREE.Vector2(9, 9)); // 화면 밖
    for (let i = 0; i < TRAIL_N; i++) this.trail.push({ x: 9, z: 9, amp: 0, bornAt: 0, brk: true });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWobble: { value: new THREE.Vector2() },
        uColor: { value: new THREE.Color(0xf4ead4) },
        uNoiseSpeed: { value: 1.0 },
        uSpecStr: { value: 1.0 },
        uCrust: { value: 0 },
        uFlourDust: { value: 0 },
        uFlourSwirl: { value: 0 },
        // 밥 주기 줄무늬(2026-11-19 M3) — 세기 0~1 · 소용돌이 위상
        uMarble: { value: 0 },
        uMarblePhase: { value: 0 },
        uWet: { value: 0 },
        uRipe: { value: 0 },
        uCollapse: { value: 0 },
        // 윗면 질감(2026-11-19 P1b) — 바늘구멍 · 가장자리 잔거품 · 하강 꺼짐 · 젓은 물결
        uPin: { value: 0 },
        uFoam: { value: 0 },
        uSink: { value: 0 },
        uStir: { value: 0 },
        // 곰팡이 군락 MOLD_N(5)개 — (x, z, 크기 배율, 색 종류 0 흰 · 1 회녹 · 2 분홍빛 검정). setSeed가 채운다
        uMoldA: { value: Array.from({ length: MOLD_N }, () => new THREE.Vector4(0, 0, 1, 0)) },
        uKahm: { value: 0 },
        uMold: { value: 0 },
        uHooch: { value: 0 },
        uSeed: { value: 0.37 },
        uBumpPos: { value: bumpPos },
        uBumpAmp: { value: new Float32Array(DYN_SLOTS) },
        uBumpK: { value: new Float32Array(DYN_SLOTS) },
        uTrailPos: { value: trailPos },
        uTrailAmp: { value: new Float32Array(TRAIL_N) },
        uTrailK: { value: new Float32Array(TRAIL_N).fill(-TRAIL_K0) },
        uPokePos: { value: new THREE.Vector2() },
        uPokeAmt: { value: 0 },
        uPokeK: { value: POKE_K0 },
        uStirPos: { value: new THREE.Vector2() },
        uStirVec: { value: new THREE.Vector2() },
        // 구 uLiquid 분해 (2026-08-25) — uLevel=형상, uFluid=흐름, uCohesion=응집.
        // 한 축으로 되돌리지 말 것: 갓 밥준 르방은 "평평하지만 되직하다"라 1축으로 표현 불가
        uLevel: { value: 0.5 },
        uFluid: { value: 0.3 },
        uCohesion: { value: 0.6 },
        // 옆벽 반경(오브젝트). 프래그 반경 밴드 정규화와 **단일 소스**
        uRBody: { value: R_BODY },
        uWallCell: { value: new THREE.Vector2(0, 60) }, // x=세기, y=주파수
        uRXZMax: { value: R_BODY },
        uHeight: { value: 0.76 },
        uPull: { value: 0 },
        uMenH: { value: 0 },
        // 기울기 진값 — 하이트필드는 오브젝트 xz(월드 ÷ XZ_SCALE) 위 월드 y 변위라 월드 기울기 = dBs / XZ_SCALE.
        // 높이가 y 스케일이 아니라 uHeight라서 fill과 무관하다. 옛 1.0 고정은 노멀 교란을 1.3배 키워 얼룩을 키웠다(A1-05)
        uSlopeAspect: { value: 1 / XZ_SCALE },
        uGrabPos: { value: new THREE.Vector2() },
        uGrabDisp: { value: new THREE.Vector2() },
        uGrabDispLag: { value: new THREE.Vector2() },
        uGrabShape: { value: new THREE.Vector2(GRAB_DEFAULTS.kernelK, GRAB_DEFAULTS.lift) },
        uGrabWrinkle: { value: 0 },
      },
      vertexShader: vert.replace('// #trailGroove', TRAIL_GROOVE),
      fragmentShader: frag
        .replace('// #hoochCover', HOOCH_COVER)
        .replace('// #trailGroove', TRAIL_GROOVE)
        .replace('// #marble', MARBLE_GLSL),
    });
    const geo = createFillGeometry(SEG, RINGS, ROWS);
    // 셰이더가 높이를 정하므로 자리 기준 구를 손으로 준다 — 병 전체(바닥~피크 상한)를 덮는다
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.4);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.y = 0;
    this.mesh.scale.set(XZ_SCALE, 1, XZ_SCALE);
    this.mesh.renderOrder = 2;
    this.layoutMold(26000); // setSeed 전 기본 자리(uSeed 0.37과 같은 시드)
  }

  applyParams(p: RenderParams): void {
    this.params = p;
    const u = this.material.uniforms;
    (u.uColor.value as THREE.Color).setRGB(p.color[0], p.color[1], p.color[2]);
    u.uNoiseSpeed.value = p.noiseSpeed;
    u.uSpecStr.value = p.specStr;
    u.uCrust.value = p.crust;
    u.uHooch.value = p.hoochAmt;
    u.uRipe.value = p.ripe;
    u.uCollapse.value = p.collapse;
    u.uPin.value = p.pinholes;
    u.uFoam.value = p.foam;
    u.uSink.value = p.sink;
    u.uStir.value = p.stir;
    u.uKahm.value = p.kahm;
    u.uMold.value = p.mold;
    u.uLevel.value = p.levelness;
    u.uFluid.value = p.fluidity;
    u.uCohesion.value = p.cohesion;
    u.uHeight.value = p.height;
    u.uPull.value = p.pull / XZ_SCALE;
    u.uMenH.value = this.menH();
    (u.uWallCell.value as THREE.Vector2).set(p.wallCells, p.cellFreq);
    this.bubbles.spawnR = 0.6 * R_BODY;
    // uWet은 tick에서 agitation 부스트와 합성
  }

  /**
   * 개체 시드 — createdAt 해시. 세션 간 자리 고정 (파생 가능하므로 저장하지 않는다).
   * 2026-08-25 일반화: 곰팡이 반점 자리에만 쓰던 것을 **정지 실루엣 FBM 오프셋**과
   * **호흡 위상**으로 확장했다. 곰팡이는 평생 한 번 볼까 말까라 개체 식별에 기여가 0이었다 —
   * 이제 르방마다 덩어리 생김새와 숨 타이밍이 다르다. 이름표가 아니라 얼굴이다 (§4-3).
   */
  setSeed(seed: number): void {
    const s = (Math.abs(seed) % 100000) / 100000 + 0.11;
    this.material.uniforms.uSeed.value = s;
    this.seedPhase = s * Math.PI * 2;
    this.layoutMold(seed);
  }

  /** 곰팡이 군락 — 윗면 안쪽 0.15~0.65·R(유리 테두리에 붙지 않게), 크기 0.75~1.15배, 색 종류는 군락마다(R2-10) */
  private layoutMold(seed: number): void {
    const rnd = seededRandom(seed * 7 + 13);
    // 방위는 황금각으로 돌리며 흔든다 — 순수 난수는 5개 중 둘셋이 한 덩이로 겹쳐 「몇 개 더」가 안 보였다
    const ang0 = rnd() * Math.PI * 2;
    (this.material.uniforms.uMoldA.value as THREE.Vector4[]).forEach((c, i) => {
      const ang = ang0 + i * 2.39996 + (rnd() - 0.5) * 0.6;
      const rad = (0.15 + 0.5 * rnd()) * R_BODY;
      c.set(Math.cos(ang) * rad, Math.sin(ang) * rad, 0.75 + 0.4 * rnd(), Math.min(2, Math.floor(rnd() * 3)));
    });
  }

  /** 탭 눌림 — 오브젝트 공간 XZ. 되튐/아묾은 elasticity가 가른다(tick) */
  pokeAt(x: number, z: number, amp = 0.06): void {
    (this.material.uniforms.uPokePos.value as THREE.Vector2).set(x, z);
    this.pokeAmp = amp;
    this.pokeAge = 0;
    this.holding = false;
    this.holdLevel = 0;
  }

  /** 롱프레스 시작 — 손가락 쪽 표면이 아주 천천히 0.03 부푼다(눈 없이 「알아챈다」만, VISUAL §5) */
  holdStart(x: number, z: number): void {
    (this.material.uniforms.uPokePos.value as THREE.Vector2).set(x, z);
    this.pokeAge = Infinity;
    this.holding = true;
  }

  /** 롱프레스 끝 — easeOut으로 가라앉는다. 홀드 중이 아니면 아무 일도 없다 */
  holdEnd(): void {
    this.holding = false;
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
  setStirInput(x: number, z: number, vx: number, vz: number, driveWobble = true, hand = driveWobble): void {
    this.stirTarget.set(x, z);
    this.stirDrivesWobble = driveWobble;
    if (hand) this.lastHandStirT = this.lastT;
    // 점성 게인 — 빠른 드래그도 반죽은 반 박자 늦게, 상한으로 찢어짐 방지
    this.stirVecTarget.set(
      THREE.MathUtils.clamp(vx * 0.10, -0.22, 0.22),
      THREE.MathUtils.clamp(vz * 0.10, -0.22, 0.22),
    );
    this.lastStirInputT = this.lastT;
  }

  /** 손이 젓고 있나 — 밥 주기 자동 젓기가 손에 양보한다(SceneHost) */
  isHandStirring(): boolean {
    return this.lastT - this.lastHandStirT < STIR_IDLE_S;
  }

  /** 되기 0 묽음 ~ 1 되직 — 1 − fluidity 정규화. 젓기 소리 몸통 음높이(app.ts)와 고랑 메워짐이 같이 쓴다 */
  stirThickness(): number {
    const f = this.params?.fluidity ?? 0.3;
    return THREE.MathUtils.clamp((THICK_FLUID_HI - f) / (THICK_FLUID_HI - THICK_FLUID_LO), 0, 1);
  }

  /** 줄무늬 세기(0~1) · 위상 — 밥 주기 연출이 넣는다. 옅어짐 · 다 섞임은 tick */
  setMarble(v: number, phase = this.marblePhase): void {
    this.marble = THREE.MathUtils.clamp(v, 0, 1);
    this.marblePhase = phase;
  }

  /** 르방 전환 · 추가 · 버리기 · 앱 열기(SceneHost.snapParams) — 지난 르방의 젓기 · 밥 주기 일시 상태를 새 르방에 넘기지 않는다 */
  resetTransient(): void {
    this.knock = 0;
    this.marble = 0;
    this.marblePhase = 0;
    this.murk = 0;
    this.mixGlint = 0;
    this.mixedThisFrame = false;
    this.lastStirInputT = this.lastHandStirT = -Infinity; // 지난 르방의 획을 잇지 않는다
    for (const s of this.trail) {
      s.amp = 0;
      s.brk = true;
    }
    this.writeTrail(this.lastT);
  }

  /** 젓기 · 밥 주기 연출이 만드는 출렁 배율 — 되직 0 ~ 묽음 1 */
  sloshGain(): number {
    return THREE.MathUtils.smoothstep(this.params?.fluidity ?? 0.3, 0.3, 0.7);
  }

  /** 메니스커스 높이(월드) — 응집이 높고 평평할수록 유리를 타고 오른다. vert uMenH와 단일 소스 */
  private menH(): number {
    const p = this.params;
    return 0.018 * (0.3 + 0.7 * (p?.cohesion ?? 0.6)) * (p?.levelness ?? 0.5);
  }

  /** 반죽 높이(월드, 숨 제외) — RenderParams.height */
  height(): number {
    return this.params?.height ?? 0.76;
  }

  /** 몸통 XZ 반경(오브젝트 공간) — 입력 히트 테스트 전용. 옆벽은 늘 유리 안쪽(R_BODY)에 붙어 있다 */
  bodyRadius(): number {
    return this.material.uniforms.uRBody.value as number;
  }

  /** 테두리(반죽이 유리에 닿는 선) 월드 y — 유리 자국 수면·hooch 아랫단. 돔·크레이터 테두리 몫과 숨 포함 */
  levelY(): number {
    const p = this.params;
    const rim = this.height() + this.menH()
      + 0.05 * (p?.ripe ?? 0) * DOME_RIM - 0.08 * (p?.collapse ?? 0) * CRATER_RIM;
    return rim * this.mesh.scale.y;
  }

  /** 반죽 가운데 꼭대기 월드 y — 레이캐스트 평면·밀가루 낙하 자리. 피크 돔·과숙 크레이터·숨까지(A1-11) */
  topY(): number {
    const p = this.params;
    return (this.height() + 0.05 * (p?.ripe ?? 0) - 0.08 * (p?.collapse ?? 0) - SINK_DEPTH * this.sinkNow())
      * this.mesh.scale.y;
  }

  /** 하강 꺼짐 + 피크 젓기 꺼짐 — uSink · topY 공통 */
  private sinkNow(): number {
    return Math.min(1, (this.params?.sink ?? 0) + this.knock);
  }

  /** t = 렌더 시계(초, CPU 로직 전부). shaderT = 셰이더 uTime — 생략하면 t. 호출자가 원점을 옮긴 작은 값을 넘겨 float32 해상도를 지킨다 */
  tick(t: number, shaderT = t): void {
    const p = this.params;
    const fluid = p?.fluidity ?? 0.3;
    const ela = p?.elasticity ?? 0.5;
    const amp = p?.breatheAmp ?? 0.006;
    const period = p?.breathePeriod ?? 3.5;
    const breathe = 1 + amp * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / period + this.seedPhase));
    // 병에 갇힌 반죽은 폭이 아니라 수위가 숨쉰다. 바닥이 y=0 피벗이라 scale.y만 곱해도 바닥 고정
    this.mesh.scale.set(XZ_SCALE, breathe, XZ_SCALE);
    this.mesh.position.y = 0;

    // 시계 역행 방어(A1-18) — 하한 0. 역행이면 CPU 시각 기록을 그만큼 옮겨 연속성을 지킨다
    if (this.lastT >= 0 && t < this.lastT) this.shiftClock(t - this.lastT);
    const dt = this.lastT < 0 ? 1 / 60 : Math.min(Math.max(t - this.lastT, 0), 0.1);
    this.lastT = t;
    const u = this.material.uniforms;

    // ── 젓기 스프링 · 고랑 자취 ──
    const stirring = t - this.lastStirInputT < STIR_IDLE_S;
    const hand = t - this.lastHandStirT < STIR_IDLE_S;
    const stirPos = u.uStirPos.value as THREE.Vector2;
    this.mixedThisFrame = false;
    let pathLen = 0;
    if (stirring) {
      const fresh = !this.wasStirring;
      if (fresh) {
        // 새 획 — 손끝 자리로 바로(지난 획 끝에서 끌려오며 고랑을 긋지 않게)
        stirPos.copy(this.stirTarget);
        this.prevStirTarget.copy(this.stirTarget);
      }
      // 손가락 추종 — 빠른 지수 수렴, 놓기 전까지 스프링 비활성
      stirPos.lerp(this.stirTarget, 1 - Math.exp(-14 * dt));
      this.stirVec.lerp(this.stirVecTarget, 1 - Math.exp(-12 * dt));
      this.stirVecVel.set(0, 0);
      pathLen = this.stirTarget.distanceTo(this.prevStirTarget);
      // 소용돌이 위상 — 손끝이 가운데를 도는 각도를 따라간다(손 · 연출 둘 다)
      if (this.prevStirTarget.lengthSq() > 1e-4 && this.stirTarget.lengthSq() > 1e-4) {
        const a0 = Math.atan2(this.prevStirTarget.y, this.prevStirTarget.x);
        const a1 = Math.atan2(this.stirTarget.y, this.stirTarget.x);
        this.marblePhase += Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
      }
      this.prevStirTarget.copy(this.stirTarget);
      this.pushTrail(t, stirPos, fresh);
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
    this.wasStirring = stirring;
    (u.uStirVec.value as THREE.Vector2).copy(this.stirVec);
    this.agitation = Math.min(1, this.stirVec.length() * 6);

    // ── 피크 젓기 꺼짐 — 젓는 거리 × ripe로 쌓이고 τ20s로 돌아온다 ──
    this.knock = Math.min(KNOCK_MAX, this.knock * Math.exp(-dt / KNOCK_TAU) + pathLen * (p?.ripe ?? 0) * KNOCK_GAIN);
    if (this.knock < 1e-5) this.knock = 0;
    u.uSink.value = this.sinkNow();

    // ── 줄무늬 — 손으로 저으면 한 바퀴마다 ×0.38, 아니면 혼자 τ6s. 손이 0.05 아래로 떨어뜨린 순간 = 다 섞임 ──
    if (this.marble > 0) {
      const before = this.marble;
      this.marble *= hand ? Math.pow(MARBLE_PER_LOOP, pathLen / MARBLE_LOOP) : Math.exp(-dt / MARBLE_TAU);
      if (this.marble < MARBLE_DONE) {
        if (hand && before >= MARBLE_DONE) {
          this.mixedThisFrame = true;
          this.mixGlint = MIX_GLINT;
        }
        if (hand || this.marble < 0.005) this.marble = 0;
      }
    }
    u.uMarble.value = this.marble;
    u.uMarblePhase.value = this.marblePhase;
    this.mixGlint *= Math.exp(-dt / MIX_GLINT_TAU);

    // ── hooch 탁해짐 — 젓는 동안 오르고 천천히 가라앉는다(sim hooch 값은 그대로) ──
    this.murk += ((stirring ? 1 : 0) - this.murk) * (1 - Math.exp(-dt / (stirring ? MURK_RISE_TAU : MURK_FALL_TAU)));
    if (this.murk < 1e-4) this.murk = 0;

    // ── grab 2시간척도 (SLS 근사, §4-2-2·3) — 모든 감쇠는 1-exp(-k·dt) 주사율 독립 ──
    const czeta = this.grabTuning.grabReturnZeta ?? p?.grabReturnZeta ?? 0.95;
    const cgain = this.grabTuning.grabCreepGain ?? p?.grabCreepGain ?? 0.5;
    // 릴리즈 시상수 분리 — 리프트가 먼저 죽고(중력 τ0.35), 주름(τ0.25), 커널은 퍼진다(합류)
    const relAge = this.grabbing ? 0 : this.grabReleaseAge;
    if (!this.grabbing && Number.isFinite(relAge)) this.grabReleaseAge += dt;
    const k0 = this.grabParam('kernelK');
    const kEff = this.grabbing ? k0 : Math.max(k0 / (1 + relAge / 1.0), k0 / 2.5);
    // 헤드룸 클램프(판정 M4, 2026-11-19) — 리본 끝(topY + |변위|·lift·1.7, vert 리프트 식)이 병 입구 + 0.12를 넘지 않게.
    // 피크 수위 1.6에선 여유가 0.3뿐이라 그대로 두면 병 위로 원뿔이 솟는다. 잠금값 grabMax · ζ는 건드리지 않는다
    const liftCap = (JAR_HEIGHT + 0.12 - this.topY()) / (Math.max(this.grabMax(), 1e-3) * 1.7);
    const liftEff = Math.max(0, Math.min(this.grabParam('lift'), liftCap))
      * (this.grabbing ? 1 : Math.exp(-relAge / 0.35));
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

    // ── 고랑 메워짐 — 묽으면 τ0.3s · 되직하면 1.6s, 피크는 덜 메워진다. 메워지며 넓어진다(첨도 K0 → K0/3) ──
    const tau = (TRAIL_TAU_FLUID + (TRAIL_TAU_THICK - TRAIL_TAU_FLUID) * this.stirThickness())
      * (1 + TRAIL_TAU_RIPE * (p?.ripe ?? 0));
    const decay = Math.exp(-dt / tau);
    for (let i = 0; i < TRAIL_N; i++) {
      const s = this.trail[i];
      if (!(stirring && i === this.trailHead)) s.amp *= decay; // 머리는 손끝이 계속 판다
      if (s.amp < 1e-5) s.amp = 0;
    }
    this.writeTrail(t);

    // ── 기포 — 젓는 동안 부상·팝 가속 (agitation) ──
    this.bubbles.update(t, p?.bubbleDensity ?? 0.4, p?.bubbleScale ?? 1, this.agitation);
    const posArr = u.uBumpPos.value as THREE.Vector2[];
    for (let i = 0; i < DYN_SLOTS; i++) posArr[i].set(this.bubbles.pos[i * 2], this.bubbles.pos[i * 2 + 1]);
    (u.uBumpAmp.value as Float32Array).set(this.bubbles.amp);
    (u.uBumpK.value as Float32Array).set(this.bubbles.k);

    // 젖은 광 — 상태 기본값 + 젓기 부스트
    u.uWet.value = Math.min(1, (p?.wet ?? 0) + 0.3 * this.agitation + this.mixGlint);

    u.uTime.value = shaderT;
    // ── 슬로싱 — 감쇠 진동자(1.5Hz). 액체일수록 오래 출렁(ζ 0.55→0.10).
    //    셰이더는 이 값을 "수면 기울기"(액체)와 잔여 강체 시프트(고체)로 나눠 그린다 ──
    if (stirring && this.stirDrivesWobble) {
      // 되직한 반죽은 젓는다고 판째 기울지 않는다 — 출렁 목표 × smoothstep(0.3, 0.7, fluidity)
      this.wobbleTgt.copy(this.stirVec).multiplyScalar(5.0 * this.sloshGain());
      if (this.wobbleTgt.length() > 0.6) this.wobbleTgt.setLength(0.6);
    } else {
      this.wobbleTgt.set(0, 0);
    }
    {
      const om = 2 * Math.PI * 1.5;
      // 흐름 축 구동 — 구 liquidity에선 갓 밥준이 0.82라 ζ 0.18(=물, 5~6회 출렁)이었다.
      // 되직한 페이스트는 두 번 안쪽에서 멎는다. 시큼(fluidity 0.66)만 여전히 출렁의 무대
      const zeta = 0.62 - 0.5 * fluid;
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

    // ── 롱프레스 홀드 — 쥐는 동안 0.03까지 천천히, 떼면 easeOut (A1-15) ──
    if (this.holding || this.holdLevel > 0) {
      this.holdLevel = this.holding
        ? this.holdLevel + (1 - this.holdLevel) * (1 - Math.exp(-dt / HOLD_RISE_TAU))
        : this.holdLevel * Math.exp(-dt / HOLD_FALL_TAU);
      if (!this.holding && this.holdLevel <= 1e-4) this.holdLevel = 0;
      u.uPokeAmt.value = -HOLD_AMP * this.holdLevel;
      u.uPokeK.value = POKE_K0 / 2; // 덴트보다 넓게 — 부풂은 손끝보다 크다
    } else if (this.pokeAge < 8) {
      // ── 탭 자국 — 고체는 스프링(되튐 1회), 액체는 "넓어지며 얕아지는" 점성 아묾 ──
      this.pokeAge += dt;
      const a = this.pokeAge;
      const springAmt = this.pokeAmp * Math.exp(-5 * a) * Math.cos(12 * a);
      // 되직할수록(fluid 낮을수록) 자국이 오래 남는다 — 갓 밥준 τ≈1.33s, 시큼 τ≈0.77s
      const tauR = 0.35 + 1.25 * (1 - fluid);
      const viscAmt = (this.pokeAmp * Math.exp(-a / tauR)) / (1 + a / 0.9);
      // 되튐이냐 아묾이냐를 가르는 건 흐름이 아니라 **탄성**이다 — 기공이 받쳐야 튕긴다
      const amt = springAmt * ela + viscAmt * (1 - ela);
      u.uPokeAmt.value = Math.abs(amt) < 5e-4 && a > 1.1 ? 0 : amt;
      u.uPokeK.value = Math.max(POKE_K0 / (1 + (a / 0.9) * (0.35 + 0.65 * fluid)), POKE_K0 / 3);
      if ((u.uPokeAmt.value as number) === 0) this.pokeAge = Infinity;
    } else if ((u.uPokeAmt.value as number) !== 0) {
      u.uPokeAmt.value = 0;
    }
    this.recoverNaN();
  }

  /** 자취 머리를 손끝으로 옮기고, 앞 점에서 TRAIL_STEP 멀어지면 굳혀 새 머리를 낸다. fresh = 새 획 */
  private pushTrail(t: number, at: THREE.Vector2, fresh: boolean): void {
    const live = TRAIL_A * Math.min(1, 0.35 + (this.stirVec.length() / 0.22) * 0.65);
    if (fresh || this.headStep() >= TRAIL_STEP) {
      this.trailHead = (this.trailHead + 1) % TRAIL_N;
      const next = this.trail[this.trailHead];
      next.brk = fresh;
      next.amp = 0;
    }
    const head = this.trail[this.trailHead];
    head.x = at.x;
    head.z = at.y;
    head.amp = Math.max(head.amp, live);
    head.bornAt = t;
  }

  /** 머리와 바로 앞 점 사이 거리(오브젝트) */
  private headStep(): number {
    const head = this.trail[this.trailHead];
    const prev = this.trail[(this.trailHead + TRAIL_N - 1) % TRAIL_N];
    return Math.hypot(head.x - prev.x, head.z - prev.z);
  }

  /** 링버퍼 → uniform(옛 점부터 차례로). 꼬리 두 점은 머리가 나아간 만큼 이어서 가늘어진다 — 덮어쓸 때 툭 끊기지 않게 */
  private writeTrail(t: number): void {
    const u = this.material.uniforms;
    const pos = u.uTrailPos.value as THREE.Vector2[];
    const amp = u.uTrailAmp.value as Float32Array;
    const kk = u.uTrailK.value as Float32Array;
    const N = TRAIL_N;
    const prog = this.trail[this.trailHead].brk ? 0 : Math.min(1, this.headStep() / TRAIL_STEP);
    for (let j = 0; j < N; j++) {
      const s = this.trail[(this.trailHead + 1 + j) % N];
      const age = Math.max(0, t - s.bornAt);
      pos[j].set(s.x, s.z);
      amp[j] = s.amp * THREE.MathUtils.clamp((j - prog) / 2, 0, 1);
      const k = Math.max(TRAIL_K0 / (1 + age / 0.8), TRAIL_K0 / 3);
      kk[j] = s.brk ? -k : k;
    }
  }

  /** 시계 역행 — CPU 시각 기록을 delta만큼 옮긴다(프로덕션 performance.now는 단조라 방어용) */
  private shiftClock(delta: number): void {
    this.lastStirInputT += delta;
    this.lastHandStirT += delta;
    for (const s of this.trail) s.bornAt += delta;
    this.bubbles.shift(delta);
  }

  /**
   * NaN 자가 복구(A1-18) — 상태기 하나가 NaN이 되면(시계 역행 · 비정상 입력) 영원히 고착되던 것을 끊는다.
   * NaN 비교는 늘 거짓이라 기존 「작으면 0」 수렴 조건으로는 빠져나오지 못했다.
   */
  private recoverNaN(): void {
    const ok = (v: THREE.Vector2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);
    const zero = (...vs: THREE.Vector2[]): void => vs.forEach((v) => v.set(0, 0));
    if (!ok(this.wobble) || !ok(this.wobbleVel)) zero(this.wobble, this.wobbleVel);
    if (!ok(this.stirVec) || !ok(this.stirVecVel)) zero(this.stirVec, this.stirVecVel);
    const grab = [this.grabTarget, this.grabElastic, this.grabElasticVel, this.grabCreep, this.grabLag];
    if (!grab.every(ok)) zero(...grab);
    for (const s of this.trail) if (!Number.isFinite(s.amp)) s.amp = 0;
    if (!Number.isFinite(this.holdLevel)) this.holdLevel = 0;
    const u = this.material.uniforms;
    (u.uWobble.value as THREE.Vector2).copy(this.wobble);
    (u.uStirVec.value as THREE.Vector2).copy(this.stirVec);
    if (!ok(u.uGrabDisp.value as THREE.Vector2)) (u.uGrabDisp.value as THREE.Vector2).set(0, 0);
    (u.uGrabDispLag.value as THREE.Vector2).copy(this.grabLag);
    if (!Number.isFinite(this.knock)) this.knock = 0;
    if (!Number.isFinite(this.marble)) this.marble = 0;
    if (!Number.isFinite(this.marblePhase)) this.marblePhase = 0;
    if (!Number.isFinite(this.murk)) this.murk = 0;
    this.writeTrail(this.lastT);
    if (!Number.isFinite(u.uPokeAmt.value as number)) u.uPokeAmt.value = 0;
  }
}
