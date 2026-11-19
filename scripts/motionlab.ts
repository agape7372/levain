// Motion Lab — 촉감(grab 점탄성) 튜닝 하네스 (dev 전용). 확장기획 §4-2·Phase 1.
// 프로덕션 SceneHost·DoughMesh·input을 그대로 물려 씬·조명·카메라·제스처 파리티 보장.
//
// URL 파라미터가 전체 상태(HMR 리로드 안전, breadlab 패턴):
//   ?preset=justfed|rising|peak|falling|hungry|sour|dormant|moldy|split|fridge|stage0|fake|stage1|rye   상태 프리셋 (기본 peak)
//     — 2026-11-19부터 실제 sim 궤적(밥 준 뒤 시간). ?h= 로 시각을 바꾼다
//   ?grabMax=&creepGain=&zeta=&elasticTau=&creepDelay=&creepTau=&releaseTau=&omega=
//     — grab 물성 오버라이드 (비우면 프리셋 상태의 RenderParams 매핑값 사용)
//   ?stage=0..5&fakeRise=1&flour=white|wholewheat|rye&loc=room|window|fridge&massRatio=&hooch=
//     — 프리셋 Snapshot 덮어쓰기(2026-11-19 반죽 모델 v2). ?cam=도 = 카메라 고도 비교
// 완료 기준(§15 Phase 1): 이 하네스에서 목표 장면(§4-1)을 실기기 촬영과 비교.
import { SceneHost } from '../src/render/SceneHost';
import { toRenderParams } from '../src/render/renderParams';
import type { Snapshot } from '../src/sim';
import { simSnap, STATE_HOURS, type SimSnapOpts } from './lib/simSnap';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;

// ── 상태 프리셋 — 실제 sim 궤적(2026-11-19 판정 H2). 옛 손 고정값(falling = riseFill 1.2 + hunger 0.3 ·
//    휴면/곰팡이 hooch 0)은 sim이 못 만드는 스냅샷이라 하강 자국 · 꺼짐 공백(H1)과 전면 hooch를 가렸다.
//    60일 묵은 5단계 르방을 밥 준 뒤 h시간 advance → deriveSnapshot(scripts/lib/simSnap.ts). 시각 표 = STATE_HOURS ──
type Preset = { label: string; h: number; opts?: SimSnapOpts; massRatio?: number };
const PRESETS: Record<string, Preset> = {
  justfed: { label: '갓 밥준', h: STATE_HOURS.justfed },
  rising:  { label: '차오르는', h: STATE_HOURS.rising },
  peak:    { label: '피크', h: STATE_HOURS.peak },
  falling: { label: '내려앉는', h: STATE_HOURS.falling },
  hungry:  { label: '배고픔', h: STATE_HOURS.hungry },
  sour:    { label: '시큼', h: STATE_HOURS.sour },
  dormant: { label: '휴면', h: STATE_HOURS.dormant },
  moldy:   { label: '곰팡이', h: STATE_HOURS.moldy },
  split:   { label: '떼어낸 뒤', h: STATE_HOURS.rising, massRatio: 0.33 },
  fridge:  { label: '냉장', h: STATE_HOURS.rising, opts: { location: 'fridge' } },
  stage0:  { label: '0단계 한창', h: STATE_HOURS.peak, opts: { stage: 0, ageD: 0.5 } },
  fake:    { label: '가짜 부풀기', h: STATE_HOURS.peak, opts: { stage: 0, ageD: 1.5 } },
  stage1:  { label: '잠잠기 한창', h: STATE_HOURS.peak, opts: { stage: 1 } },
  rye:     { label: '호밀 피크', h: STATE_HOURS.peak, opts: { flour: 'rye' } },
};

// ── 튜닝 노브 — [key, 라벨, min, max, step] ──
const KNOBS = [
  ['grabMax', '끊김 길이 눈금', 0.04, 0.6, 0.01],
  ['creepGain', '흔들림 잔류 비율', 0, 1, 0.05],
  ['zeta', '밑동 둔덕 ζ', 0.5, 1.2, 0.01],
  ['elasticTau', '끝 추종 τ(s)', 0.03, 0.4, 0.01],
  ['creepDelay', '버팀 지연(s)', 0, 2, 0.1],
  ['creepTau', '버팀 짧아짐 τ', 0.5, 5, 0.1],
  ['releaseTau', '흔들림 해소 τ', 0.3, 3, 0.1],
  ['omega', '밑동 둔덕 ω', 4, 24, 0.5],
] as const;
type KnobKey = (typeof KNOBS)[number][0];
// URL 키 → DoughMesh.grabTuning 키
const TUNE_KEY: Record<KnobKey, string> = {
  grabMax: 'grabMax', creepGain: 'grabCreepGain', zeta: 'grabReturnZeta',
  elasticTau: 'elasticTau', creepDelay: 'creepDelay', creepTau: 'creepTau',
  releaseTau: 'releaseTau', omega: 'omega',
};

const params = new URLSearchParams(location.search);
let preset = params.get('preset') ?? 'peak';
if (!(preset in PRESETS)) preset = 'peak';

// 덮어쓰기 — 단계 · 가짜 부풀기 · 밀가루 · 위치 · 밥 준 뒤 시간(?h=)은 sim 입력으로 넣어 다시 굴린다(가능한 스냅샷만).
// 질량비 · hooch만 결과 값 덮어쓰기(시각 비교용)
const SNAP_KEYS = ['stage', 'fakeRise', 'flour', 'loc', 'h', 'massRatio', 'hooch'] as const;
function snapOf(id: string): Snapshot {
  const pr = PRESETS[id];
  const num = (k: string): number | null => {
    const v = params.get(k);
    return v !== null && Number.isFinite(Number(v)) ? Number(v) : null;
  };
  const o: SimSnapOpts = { ...pr.opts };
  const stage = num('stage');
  if (stage !== null) o.stage = Math.max(0, Math.min(5, Math.round(stage)));
  if (params.get('fakeRise') === '1') { o.stage = 0; o.ageD = 1.5; } // sim의 D2 가짜 부풀기 = 0단계 둘째 날
  const flour = params.get('flour');
  if (flour === 'white' || flour === 'wholewheat' || flour === 'rye') o.flour = flour;
  const loc = params.get('loc');
  if (loc === 'room' || loc === 'window' || loc === 'fridge') o.location = loc;
  const s = simSnap(num('h') ?? pr.h, o);
  const mr = num('massRatio') ?? pr.massRatio ?? null;
  if (mr !== null) {
    s.massRatio = mr;
    s.fill = Math.max(0.6, Math.min(1.6, s.riseFill * mr));
  }
  const hooch = num('hooch');
  if (hooch !== null) s.hooch = hooch;
  return s;
}
const overrides = new Map<KnobKey, number>();
for (const [key] of KNOBS) {
  const v = params.get(key);
  if (v !== null && Number.isFinite(Number(v))) overrides.set(key, Number(v));
}

// ── 시각 축 노브 (2026-08-25 축 개편) — grabTuning(DoughMesh 경로)과 **별도 채널**이다.
// 이쪽은 RenderParams를 덮어써서 주입한다. §4-2b가 트라이포포비아 판정을 실기기 관찰로
// 못박았으므로 wallCells·cellFreq 노브는 선택이 아니라 필수 ──
const VIS_KNOBS = [
  ['wallCells', '유리벽 기공', 0, 1, 0.02],
  ['cellFreq', '기공 주파수', 30, 90, 1],
  ['levelness', '평평함', 0, 1, 0.02],
  ['fluidity', '흐름', 0, 1, 0.02],
  ['cohesion', '응집', 0, 1, 0.02],
  ['pull', '윗가 물러남', 0, 0.04, 0.002],
  ['height', '수위', 0.2, 1.7, 0.01],
  ['residue', '유리 자국', 0, 1, 0.02],
] as const;
type VisKey = (typeof VIS_KNOBS)[number][0];
const visOverrides = new Map<VisKey, number>();
for (const [key] of VIS_KNOBS) {
  const v = params.get(key);
  if (v !== null && Number.isFinite(Number(v))) visOverrides.set(key, Number(v));
}
// 스크린샷 자동화(scripts/motionlab-shot.mjs) — UI 숨김 + 렌더 후 window.__done
const shotMode = params.get('shot') === '1';
declare global {
  interface Window {
    __done?: boolean;
    __error?: string;
  }
}

// ── 씬 — 프로덕션 그대로 ──
const scene = new SceneHost(canvas, stage);
scene.mount();
const camDeg = Number(params.get('cam'));
if (params.get('cam') !== null && Number.isFinite(camDeg)) scene.setCameraElevation(camDeg);
const dough = scene.dough!;
// applyState()·start()는 UI 요소 선언 뒤(파일 하단)에서 — TDZ 회피

function currentTuning(): Record<string, number> {
  const tuning: Record<string, number> = {};
  for (const [key, v] of overrides) tuning[TUNE_KEY[key]] = v;
  return tuning;
}

function applyState(): void {
  const mapped = toRenderParams(snapOf(preset));
  // 시각 축은 매핑 결과를 덮어써서 주입 — 프리셋 물성은 그대로 두고 한 축만 흔들어 볼 수 있다
  const vis: Record<string, number> = {};
  for (const [key, v] of visOverrides) vis[key] = v;
  scene.snapParams({ ...mapped, ...vis });
  dough.grabTuning = currentTuning();
  syncUrl();
  renderPresetButtons();
  renderSliders();
}

function syncUrl(): void {
  const q = new URLSearchParams();
  q.set('preset', preset);
  for (const [key, v] of overrides) q.set(key, String(v));
  for (const [key, v] of visOverrides) q.set(key, String(v));
  for (const key of [...SNAP_KEYS, 'cam']) {
    const v = params.get(key);
    if (v !== null) q.set(key, v);
  }
  if (shotMode) q.set('shot', '1');
  history.replaceState(null, '', `?${q.toString()}`);
}

// ── UI ──
const presetsEl = document.getElementById('presets')!;
function renderPresetButtons(): void {
  presetsEl.innerHTML = '';
  for (const [id, p] of Object.entries(PRESETS)) {
    const b = document.createElement('button');
    b.textContent = p.label;
    b.classList.toggle('on', id === preset);
    b.addEventListener('click', () => {
      preset = id;
      applyState();
    });
    presetsEl.appendChild(b);
  }
}

const slidersEl = document.getElementById('sliders')!;
function renderSliders(): void {
  // legend만 남기고 재구성
  [...slidersEl.querySelectorAll('.row')].forEach((r) => r.remove());
  const mapped = toRenderParams(snapOf(preset));
  const presetDefault: Record<string, number> = {
    grabMax: mapped.grabMax, creepGain: mapped.grabCreepGain, zeta: mapped.grabReturnZeta,
    // GRAB_DEFAULTS와 동기 (사용자 확정 2026-08-24 저녁)
    elasticTau: 0.07, creepDelay: 0.7, creepTau: 2.5, releaseTau: 1.2, omega: 5.5,
  };
  for (const [key, label, min, max, step] of KNOBS) {
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const cur = overrides.get(key) ?? presetDefault[key];
    input.value = String(cur);
    const out = document.createElement('output');
    out.textContent = cur.toFixed(2);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      overrides.set(key, v);
      out.textContent = v.toFixed(2);
      dough.grabTuning = currentTuning();
      syncUrl();
    });
    row.append(name, input, out);
    slidersEl.appendChild(row);
  }
  // 시각 축 — 같은 패널 아래쪽. 값을 바꾸면 스냅으로 즉시 반영(보간 대기 없음)
  for (const [key, label, min, max, step] of VIS_KNOBS) {
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const cur = visOverrides.get(key) ?? (mapped[key] as number);
    input.value = String(cur);
    const out = document.createElement('output');
    out.textContent = cur.toFixed(2);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      visOverrides.set(key, v);
      out.textContent = v.toFixed(2);
      const next: Record<string, number> = {};
      for (const [k, vv] of visOverrides) next[k] = vv;
      scene.snapParams({ ...toRenderParams(snapOf(preset)), ...next });
      syncUrl();
    });
    row.append(name, input, out);
    slidersEl.appendChild(row);
  }
}

document.getElementById('copyUrl')!.addEventListener('click', () => {
  // http+LAN IP(폰 튜닝)는 비보안 오리진 — clipboard API 부재. prompt 폴백으로 수동 복사
  if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(location.href);
  else window.prompt('현재 튜닝 URL — 길게 눌러 복사:', location.href);
});
document.getElementById('reset')!.addEventListener('click', () => {
  overrides.clear();
  applyState();
});

applyState();
scene.start();

if (shotMode) {
  // 패널·계기판을 숨기고 몇 프레임 굴린 뒤 신호 — 셰이더 컴파일 실패는 콘솔로 새어나가므로
  // 촬영 스크립트가 page.on('console')로 함께 받는다
  document.getElementById('panel')?.setAttribute('style', 'display:none');
  document.getElementById('hud')?.setAttribute('style', 'display:none');
  let n = 0;
  const wait = (): void => {
    if (++n < 20) requestAnimationFrame(wait);
    else window.__done = true;
  };
  requestAnimationFrame(wait);
}

// ── 계기판 — grab 상태·FPS ──
const hud = document.getElementById('hud')!;
let frames = 0;
let fps = 0;
let lastFpsT = performance.now();
function hudLoop(): void {
  frames++;
  const now = performance.now();
  if (now - lastFpsT >= 500) {
    fps = Math.round((frames * 1000) / (now - lastFpsT));
    frames = 0;
    lastFpsT = now;
  }
  const g = dough.grabDebug();
  hud.textContent =
    `preset  ${preset}\n` +
    `fps     ${fps}\n` +
    `grab    ${g.held ? '잡는 중' : '놓음'}  stretch ${dough.grabStretch01().toFixed(2)}\n` +
    `가닥    길이 ${g.len.toFixed(2)} / 끊김 ${g.breakLen.toFixed(2)}  붙은 몫 ${g.attached.toFixed(2)}\n` +
    `agitation ${dough.agitation.toFixed(2)}`;
  requestAnimationFrame(hudLoop);
}
hudLoop();
