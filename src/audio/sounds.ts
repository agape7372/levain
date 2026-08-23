// WebAudio 전량 합성 — 에셋 0, v1 3종 (VISUAL §6). 첫 제스처에서 resume, hidden 시 suspend.
// 마스터: Gain 0.25 → LPF 3kHz. 리버브 금지. 휴면 진입 = 무음(침묵이 표현).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function setMuted(m: boolean): void {
  muted = m;
}

function ensureCtx(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.25;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 3000;
    master.connect(lpf).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 첫 사용자 제스처에서 호출 — 모바일 자동재생 정책 해제 */
export function unlockAudio(): void {
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

/** 부활 성공 — 재사용 조합 */
export function sfxRevived(): void {
  sfxBubble();
  setTimeout(() => sfxFed(), 160);
}
