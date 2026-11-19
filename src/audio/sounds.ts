// WebAudio 전량 합성 — 에셋 0 (VISUAL §6). 첫 제스처에서 생성·resume, hidden 시 suspend.
// 마스터: Gain 0.25 → LPF 3kHz. 리버브 금지. 휴면 진입 = 무음(침묵이 표현).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function setMuted(m: boolean): void {
  muted = m;
}

/** 이미 만들어진 컨텍스트만 돌려준다. 생성은 unlockAudio(첫 제스처)만 한다 —
 *  유휴 기포 팝이 제스처 전에 컨텍스트를 만들면 자동재생 경고가 나고 생성 비용(수십 ms)이
 *  유휴 프레임에 걸린다 (2026-11-12 감사 T4-5). 제스처 전의 소리는 그냥 나지 않는다. */
function ensureCtx(): AudioContext | null {
  if (!ctx) return null;
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 첫 사용자 제스처에서 호출 — 컨텍스트 생성 + 모바일 자동재생 정책 해제 */
export function unlockAudio(): void {
  if (!ctx && typeof AudioContext !== 'undefined') {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.25;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 3000;
    master.connect(lpf).connect(ctx.destination);
  }
  ensureCtx();
}

export function suspendAudio(): void {
  if (ctx?.state === 'running') void ctx.suspend();
}
export function resumeAudio(): void {
  if (ctx?.state === 'suspended') void ctx.resume();
}

function tone(freq: number, at: number, dur: number, type: OscillatorType, peak: number, glideTo?: number): void {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (glideTo) osc.frequency.linearRampToValueAtTime(glideTo, at + dur * 0.6);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0004, at + dur);
  osc.connect(g).connect(master);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

let bubbleVoices = 0;

/** 기포 뽀글 — sine 400→700Hz 글라이드, 피치 ±15% 랜덤, 동시 최대 3성 */
export function sfxBubble(): void {
  if (muted || !ensureCtx() || !ctx) return;
  if (bubbleVoices >= 3) return;
  bubbleVoices++;
  setTimeout(() => bubbleVoices--, 140);
  const r = 1 + (Math.random() * 0.3 - 0.15);
  tone(400 * r, ctx.currentTime, 0.12, 'sine', 0.5, 700 * r);
}

/** 다 섞임(M4) — 맑은 사인 한 점 A6 + 옥타브 배음 약하게, 0.22s. sfxFed 2음보다 작다 */
export function sfxMixed(): void {
  if (muted || !ensureCtx() || !ctx) return;
  const t = ctx.currentTime;
  tone(1760, t, 0.22, 'sine', 0.3);
  tone(3520, t, 0.12, 'sine', 0.05);
}

/** 밥 완료 — triangle 2음 C5→E5, 마림바 느낌 */
export function sfxFed(): void {
  if (muted || !ensureCtx() || !ctx) return;
  const t = ctx.currentTime;
  tone(523.25, t, 0.35, 'triangle', 0.55);
  tone(659.25, t + 0.12, 0.4, 'triangle', 0.5);
}

/** 해금·빵 완성 — triangle 3음 G4–C5–E5, 유일한 보상 사운드 */
export function sfxUnlock(): void {
  if (muted || !ensureCtx() || !ctx) return;
  const t = ctx.currentTime;
  tone(392.0, t, 0.32, 'triangle', 0.5);
  tone(523.25, t + 0.09, 0.34, 'triangle', 0.5);
  tone(659.25, t + 0.18, 0.5, 'triangle', 0.48);
  tone(987.77, t + 0.2, 0.4, 'triangle', 0.12); // 끝음 5도 배음 살짝
}

/** 굽기 결과 — 보상 소리는 하나(G4–C5–E5)이고, 결과는 「어디까지 올라가느냐」로만 다르다.
 *  2 = 둘째 음에서 멈춤(납작·덜어낸 반죽 굽기), 3 = 세 음(잘 구움), 4 = 끝음 배음까지(최고 = sfxUnlock) */
export function sfxBaked(rungs: 2 | 3 | 4): void {
  if (rungs === 4) {
    sfxUnlock();
    return;
  }
  if (muted || !ensureCtx() || !ctx) return;
  const t = ctx.currentTime;
  tone(392.0, t, 0.32, 'triangle', 0.45);
  tone(523.25, t + 0.09, rungs === 2 ? 0.45 : 0.34, 'triangle', 0.45);
  if (rungs === 3) tone(659.25, t + 0.18, 0.5, 'triangle', 0.44);
}

/** 부활 성공 — 재사용 조합 */
export function sfxRevived(): void {
  sfxBubble();
  setTimeout(() => sfxFed(), 160);
}

// ── 젓기 squelch + 천 사락 — 절차 노이즈 버퍼 1개 재사용 (에셋 0 유지, v1 5종 개정) ──

let noiseBuf: AudioBuffer | null = null;
function ensureNoise(): AudioBuffer | null {
  if (!ctx) return null;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

let stirSrc: AudioBufferSourceNode | null = null;
let stirGain: GainNode | null = null;
let stirFilter: BiquadFilterNode | null = null;
let stirThick = 0.5;
let stirPlan: StirPlan = { nextAt: 0, tickIn: 2 };

/** 젓기 3겹(M4) 일정 — 찰박을 다음 시각(ctx.currentTime 기준)까지 들고 있다가 update 때 미리 예약한다 */
export interface StirPlan {
  /** 다음 찰박 시각(초) */
  nextAt: number;
  /** 다음 끈적 틱까지 남은 찰박 수 */
  tickIn: number;
}
/** 이만큼 앞까지 예약 — update(포인터 이동 ≈ 프레임) 간격보다 길게 */
export const STIR_LOOKAHEAD_S = 0.12;
/** 이 속도 미만이면 찰박 없음(몸통만) */
const STIR_SLAP_MIN_SPEED = 0.05;

/** 찰박 간격 — clamp(0.9 − 0.6·speed, 0.25, 0.9)s에 ±25% 흔들림(rnd 0~1) */
export function stirSlapGap(speed: number, rnd: number): number {
  return Math.min(0.9, Math.max(0.25, 0.9 - 0.6 * speed)) * (1 + (rnd * 2 - 1) * 0.25);
}

/** 몸통 잡음 중심 — 180~500Hz, 되직할수록(thick 1) 낮고 빠를수록 조금 높다 */
export function stirBodyHz(thick: number, speed: number): number {
  const c = (v: number): number => Math.min(1, Math.max(0, v));
  return 180 + 220 * (1 - c(thick)) + 100 * c(speed);
}

/** now ~ now+LOOKAHEAD 안의 찰박 · 틱 일정. 순수 — 새 plan을 돌려준다. 멈췄다 다시 저으면 밀린 사건 없이 지금부터 */
export function planStirEvents(
  plan: StirPlan,
  now: number,
  speed: number,
  rnd: () => number,
): { plan: StirPlan; events: { at: number; tick: boolean }[] } {
  const events: { at: number; tick: boolean }[] = [];
  if (speed < STIR_SLAP_MIN_SPEED) return { plan, events };
  let { nextAt, tickIn } = plan;
  if (nextAt < now) nextAt = now;
  while (nextAt < now + STIR_LOOKAHEAD_S) {
    tickIn--;
    const tick = tickIn <= 0;
    if (tick) tickIn = rnd() < 0.5 ? 2 : 3;
    events.push({ at: nextAt, tick });
    nextAt += stirSlapGap(speed, rnd());
  }
  return { plan: { nextAt, tickIn }, events };
}

/** 젓기 시작 — ① 몸통 저역 잡음 루프(게인 0에서 대기, update가 속도 추종). thick = 되기 0 묽음 ~ 1 되직 */
export function sfxStirStart(thick = 0.5): void {
  if (muted || !ensureCtx() || !ctx || !master) return;
  if (stirSrc) return;
  const buf = ensureNoise();
  if (!buf) return;
  stirThick = thick;
  stirPlan = { nextAt: 0, tickIn: 2 };
  stirSrc = ctx.createBufferSource();
  stirSrc.buffer = buf;
  stirSrc.loop = true;
  stirFilter = ctx.createBiquadFilter();
  stirFilter.type = 'bandpass';
  stirFilter.frequency.value = stirBodyHz(thick, 0);
  stirFilter.Q.value = 1.4;
  stirGain = ctx.createGain();
  stirGain.gain.value = 0;
  stirSrc.connect(stirFilter).connect(stirGain).connect(master);
  stirSrc.start();
}

/** 젓는 속도(0~1) 추종 — 몸통 게인 · 중심, ② 찰박 · ③ 끈적 틱 미리 예약. slaps = false면 몸통만(당기기) */
export function sfxStirUpdate(speed: number, slaps = true): void {
  if (!ctx || !stirGain || !stirFilter) return;
  const t = ctx.currentTime;
  const s = Math.min(1, Math.max(0, speed));
  stirGain.gain.setTargetAtTime(0.16 * s, t, 0.06);
  stirFilter.frequency.setTargetAtTime(stirBodyHz(stirThick, s), t, 0.08);
  if (!slaps) return;
  const r = planStirEvents(stirPlan, t, s, Math.random);
  stirPlan = r.plan;
  for (const e of r.events) {
    // ② 찰박 — 500~1200Hz 짧은 대역 잡음(되직할수록 낮게), 살짝 내려앉는다
    const f = (1200 - 700 * stirThick) * (0.88 + Math.random() * 0.12);
    noiseBurst({ type: 'bandpass', freq: f, to: f * 0.75, q: 2, peak: 0.2 * (0.4 + 0.6 * s), attack: 0.006, dur: 0.04 + Math.random() * 0.03, at: e.at });
    // ③ 끈적 틱 — 3~6kHz 아주 짧고 작게, 찰박 끝자락에
    if (e.tick) noiseBurst({ type: 'bandpass', freq: 3000 + Math.random() * 3000, q: 3, peak: 0.05, attack: 0.002, dur: 0.018, at: e.at + 0.03 });
  }
}

export function sfxStirEnd(): void {
  if (!ctx || !stirSrc || !stirGain) {
    stirSrc = null;
    stirGain = null;
    stirFilter = null;
    return;
  }
  const src = stirSrc;
  stirGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
  setTimeout(() => {
    try {
      src.stop();
    } catch {
      /* 이미 정지 */
    }
  }, 300);
  stirSrc = null;
  stirGain = null;
  stirFilter = null;
}

/** 노이즈 한 숨 — 필터를 지나 사라지는 짧은 소리. 사락·탁·쩍이 전부 이 하나에서 나온다 */
function noiseBurst(o: {
  type: BiquadFilterType;
  freq: number;
  /** 주면 freq에서 여기로 미끄러진다 */
  to?: number;
  q?: number;
  peak: number;
  attack: number;
  dur: number;
  rate?: number;
  /** 예약 시각(ctx 시계) — 없으면 지금 */
  at?: number;
}): void {
  if (muted || !ensureCtx() || !ctx || !master) return;
  const buf = ensureNoise();
  if (!buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = o.rate ?? 1;
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  const t = Math.max(ctx.currentTime, o.at ?? 0);
  f.frequency.setValueAtTime(o.freq, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  if (o.q) f.Q.value = o.q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.peak, t + o.attack);
  g.gain.exponentialRampToValueAtTime(0.0004, t + o.dur);
  src.connect(f).connect(g).connect(master);
  // 버퍼(1초)의 아무 데서나 시작 — 같은 소리가 매번 똑같이 들리지 않게
  src.start(t, Math.random() * 0.4);
  src.stop(t + o.dur + 0.05);
}

/** 천 덮개 사락 — 하이패스 노이즈 버스트 0.25s (마스터 LPF 3kHz와 만나 1.2~3k 대역) */
export function sfxCloth(): void {
  noiseBurst({ type: 'highpass', freq: 1200, peak: 0.22, attack: 0.02, dur: 0.25, rate: 0.9 + Math.random() * 0.2 });
}

/** 가루 붓는 사락 — 천보다 길고 여리게. 밥·부활 시작·말린 조각 되살리기(전부 병에 무언가 들어가는 순간) */
export function sfxPour(): void {
  noiseBurst({ type: 'highpass', freq: 1500, peak: 0.13, attack: 0.09, dur: 0.6, rate: 0.9 + Math.random() * 0.2 });
}

/** 병을 내려놓는 탁 — 자리 옮기기·르방 바꾸기·새 병. 낮은 한 점 + 유리 닿는 짧은 틱 */
export function sfxSetDown(): void {
  if (muted || !ensureCtx() || !ctx) return;
  tone(150, ctx.currentTime, 0.1, 'sine', 0.55, 85);
  noiseBurst({ type: 'highpass', freq: 1600, peak: 0.09, attack: 0.002, dur: 0.035 });
}

/** 반죽 떼는 쩍 — 끈적한 것이 끊어지는 짧은 내림. 젓기와 같은 대역(밴드패스)이라 한 재료로 들린다.
 *  gain = 크기 배율 — 당기기 가는 가닥 끊김은 0.45 */
export function sfxPinch(gain = 1): void {
  noiseBurst({ type: 'bandpass', freq: 560, to: 240, q: 2.2, peak: 0.3 * gain, attack: 0.012, dur: 0.17 });
}
