// Levain Lab — 상태·시간·저장 하네스 (dev 전용, 확장기획 §6·Phase 5).
// 실제 앱(startApp)을 그대로 부팅하되 두 가지만 주입한다:
//   저장 = `levain:lab-save` (정식 `levain:save` 절대 불가침) / 시계 = 오프셋 FakeClock.
// 기능: 시나리오 픽스처(타임스탬프 역산) 단일·멀티 설치, 시간 이동(역행 포함),
//       알림 플랜 덤프(planNotificationsAll 검증기), v1→v2 마이그레이션 미리보기.
// 재료 지급 버튼은 Phase 6에서 추가됨(§6 예고분) — 변형 해금 QA 진입로.
import '../src/styles/main.css';
import { startApp } from '../src/app';
import { createStorage } from '../src/platform/storage';
import type { Clock } from '../src/platform/clock';
import type { GameStore } from '../src/store/gameStore';
import {
  SCHEMA_VERSION, emptyInventory, migrate, save, validateAndClamp, type SaveEnvelope,
} from '../src/store/persistence';
import { emptyEconomy } from '../src/store/economy';
import { copy } from '../src/ui/copy';
import {
  DAY, HOUR, INGREDIENTS, advance, deriveSnapshot, initialState, planNotificationsAll,
} from '../src/sim';
import type { SimState } from '../src/sim';

const LAB_SAVE_KEY = 'levain:lab-save';
const LAB_OFFSET_KEY = 'levain:lab-clock-offset';
/** 설치 대기열 — 리로드 직전 저장 레이스를 피한다 (install() 주석) */
const LAB_PENDING_KEY = 'levain:lab-pending-install';

// ── 시계 — 오프셋은 리로드를 살아남는다 (픽스처 설치 = save + reload 패턴이라 필수) ──
let offset = Number(localStorage.getItem(LAB_OFFSET_KEY) ?? '0') || 0;
const labClock: Clock = { now: () => Date.now() + offset };

// ── 시나리오 픽스처 — 전부 타임스탬프 역산 (닫힌 함수: lastFedAt만 밀면 그 상태가 된다) ──
interface Fixture { key: string; label: string; make(now: number): SimState }

function mature(now: number): SimState {
  return { ...initialState(now), createdAt: now - 40 * DAY, maturity: 45 };
}
function fedAgo(s: SimState, now: number, h: number): SimState {
  return advance(
    { ...s, lastFedAt: now - h * HOUR, locAnchorAt: now - h * HOUR, lastSimulatedAt: now - h * HOUR },
    now,
  );
}

const FIXTURES: Fixture[] = [
  { key: 'born', label: '갓 반죽', make: (n) => initialState(n) },
  { key: 'fakeout', label: '가짜 부풀기', make: (n) => fedAgo({ ...initialState(n), createdAt: n - 30 * HOUR }, n, 2) },
  { key: 'quiet', label: '잠잠기', make: (n) => fedAgo({ ...initialState(n), createdAt: n - 4 * DAY, maturity: 3 }, n, 3) },
  { key: 'rising', label: '차오르는', make: (n) => fedAgo(mature(n), n, 3) },
  { key: 'peak', label: '피크', make: (n) => fedAgo(mature(n), n, 5) },
  { key: 'falling', label: '내려앉는', make: (n) => fedAgo(mature(n), n, 7) },
  { key: 'hungry', label: '배고픔', make: (n) => fedAgo(mature(n), n, 16) },
  { key: 'sour', label: '시큼', make: (n) => fedAgo(mature(n), n, 40) },
  { key: 'hooch', label: '후치', make: (n) => fedAgo(mature(n), n, 50) },
  { key: 'kahm', label: 'kahm 막', make: (n) => fedAgo({ ...mature(n), location: 'window' }, n, 40) },
  { key: 'fridge', label: '냉장 5일', make: (n) => fedAgo({ ...mature(n), location: 'fridge' }, n, 5 * 24) },
  { key: 'dormant', label: '휴면', make: (n) => fedAgo(mature(n), n, 130) },
  { key: 'reviving', label: '부활 1회차', make: (n) => ({ ...fedAgo(mature(n), n, 2), reviveProgress: 1 }) },
  { key: 'spot', label: '반점', make: (n) => fedAgo(mature(n), n, 170) },
  { key: 'spread', label: '확산', make: (n) => fedAgo(mature(n), n, 250) },
  { key: 'moldy', label: '곰팡이 사망', make: (n) => fedAgo(mature(n), n, 340) },
  { key: 'flaked', label: '피크+조각', make: (n) => ({ ...fedAgo(mature(n), n, 5), flake: { madeAt: n - 2 * DAY, maturity: 30 } }) },
];

function envelopeOf(fixes: Fixture[], now: number): SaveEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: now,
    starters: fixes.map((f, i) => ({
      id: `s${i + 1}`,
      name: f.label.slice(0, 12),
      ordinal: i + 1,
      sim: f.make(now),
    })),
    activeStarterId: 's1',
    nextStarterOrdinal: fixes.length + 1,
    shared: { collection: {}, inventory: emptyInventory(), economy: emptyEconomy() },
    settings: { muted: true, haptics: false, notifyEnabled: true },
    flags: { onboarded: true, pendingBake: null, retapHints: 0 },
  };
}

const labStorage = createStorage(LAB_SAVE_KEY);

function install(fixes: Fixture[]): void {
  // ⚠ lab-save에 바로 쓰면 안 된다: reload가 visibilitychange(hidden)를 일으키고
  // app.ts의 saveNow()가 **설치본 위에 현재 상태를 덮는다**(2026-08-24 실측 — 멀티 설치가
  // 조용히 1마리로 되돌아왔다). 대기열 키에 넣고 다음 부팅이 집어가게 한다.
  localStorage.setItem(LAB_PENDING_KEY, JSON.stringify(envelopeOf(fixes, labClock.now())));
  location.reload(); // 가장 안전한 재부트 — importSave와 같은 패턴
}

// 대기열 소비 — startApp 이전(= 앱이 저장을 읽기 전)이어야 한다
const pendingRaw = localStorage.getItem(LAB_PENDING_KEY);
if (pendingRaw !== null) {
  localStorage.removeItem(LAB_PENDING_KEY);
  labStorage.saveRaw(pendingRaw);
}

// 첫 진입 — lab 저장이 없으면 피크 하나를 깔아 온보딩 게이트를 건너뛴다
if (labStorage.loadRaw() === null) {
  save(envelopeOf(FIXTURES.filter((f) => f.key === 'peak'), labClock.now()), labStorage);
}

// ── 앱 부팅 (실제 앱 전체 — 씬·HUD·탭·알림 플랜까지 프로덕션 경로) ──
const { store } = await startApp({ clock: labClock, storage: labStorage });

// ── 패널 ──
const panel = document.getElementById('lab-panel')!;
const toggle = document.getElementById('lab-toggle')!;
toggle.addEventListener('click', () => panel.classList.toggle('hidden'));

function h3(text: string): HTMLElement {
  const el = document.createElement('h3');
  el.textContent = text;
  return el;
}
function row(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'lab-row';
  return el;
}
function btn(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

// 1) 단일 픽스처 설치
panel.appendChild(h3('픽스처 설치 (단일 — 탭하면 리로드)'));
const single = row();
for (const f of FIXTURES) single.appendChild(btn(f.label, () => install([f])));
panel.appendChild(single);

// 2) 멀티 프로토 — 체크된 픽스처를 starters로 깔기 (사용자가 원한 "전 단계 동시 확인")
panel.appendChild(h3('멀티 르방 설치 (체크 → 설치. 슬롯 상한 무시 — Lab 특권)'));
const multi = row();
const checks: Array<{ f: Fixture; box: HTMLInputElement }> = [];
for (const f of FIXTURES) {
  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  if (['rising', 'peak', 'hungry'].includes(f.key)) box.checked = true;
  label.append(box, document.createTextNode(f.label));
  multi.appendChild(label);
  checks.push({ f, box });
}
panel.appendChild(multi);
const multiActions = row();
multiActions.appendChild(
  btn('체크한 것들로 설치', () => {
    const picked = checks.filter((c) => c.box.checked).map((c) => c.f);
    if (picked.length > 0) install(picked);
  }, 'primary'),
);
multiActions.appendChild(btn('전 단계 5종', () => install(FIXTURES.filter((f) => ['born', 'quiet', 'rising', 'peak', 'hungry'].includes(f.key)))));
panel.appendChild(multiActions);

// 2b) 재료 지급 (Phase 6 — 프로덕션 획득 경로는 Phase 7. Lab 특권 진입로)
panel.appendChild(h3('재료 지급 (+3씩 — 변형 해금 QA)'));
const grant = row();
// ⚠ 이름 테이블을 여기 다시 쓰지 마라. 4종 시절 하드코딩(`ING_LABEL`)이 남아 있어서
//   12종 확장 때부터 신규 재료가 전부 "undefined +3"으로 떴다 — 조용히 깨져 있었다.
//   정본은 copy.ts 하나뿐이고(GDD §10), Lab도 예외가 아니다.
for (const ing of INGREDIENTS) {
  grant.appendChild(btn(`${copy.recipes.ingredientNames[ing.id] ?? ing.id} +3`, () => {
    store.grantIngredient(ing.id, 3);
    refreshDump();
  }));
}
panel.appendChild(grant);

// 3) 시간 이동 — FakeClock 오프셋 (역행 = 재정박 실검증)
panel.appendChild(h3('시간 이동 (오프셋 저장 — 리로드 생존)'));
const time = row();
const shifts: Array<[string, number]> = [
  ['+1h', HOUR], ['+6h', 6 * HOUR], ['+12h', 12 * HOUR], ['+1d', DAY], ['+3d', 3 * DAY],
  ['−1d(역행)', -DAY],
];
for (const [label, ms] of shifts) {
  time.appendChild(
    btn(label, () => {
      offset += ms;
      localStorage.setItem(LAB_OFFSET_KEY, String(offset));
      store.tick();
      refreshDump();
    }),
  );
}
time.appendChild(
  btn('오프셋 0', () => {
    offset = 0;
    localStorage.setItem(LAB_OFFSET_KEY, '0');
    store.tick();
    refreshDump();
  }, 'danger'),
);
panel.appendChild(time);

// 4) 계기판 — 활성 스냅샷 + 알림 플랜(planNotificationsAll 실출력)
panel.appendChild(h3('상태·알림 플랜'));
const dumpRow = row();
dumpRow.appendChild(btn('새로고침', () => refreshDump()));
dumpRow.appendChild(btn('lab 저장 삭제', () => {
  localStorage.removeItem(LAB_SAVE_KEY);
  localStorage.setItem(LAB_OFFSET_KEY, '0');
  location.reload();
}, 'danger'));
panel.appendChild(dumpRow);
const dump = document.createElement('div');
dump.className = 'lab-dump';
panel.appendChild(dump);

function refreshDump(): void {
  const now = labClock.now();
  const env = store.getEnvelope();
  const lines: string[] = [];
  lines.push(`시계 오프셋 ${(offset / HOUR).toFixed(1)}h · lab시각 ${new Date(now).toLocaleString('ko-KR')}`);
  for (const r of env.starters) {
    const snap = deriveSnapshot(advance(r.sim, now), now);
    const mark = r.id === env.activeStarterId ? '▶' : ' ';
    lines.push(`${mark} ${r.name ?? `르방이 ${r.ordinal}`} [${r.id}] ${snap.phase} · 단계${snap.stage} · 산미${snap.sourness.toFixed(2)} · fill${snap.fill.toFixed(2)}`);
  }
  const plan = planNotificationsAll(env.starters.map((r) => r.sim), now);
  lines.push('── 알림 플랜 (병합) ──');
  if (plan.slots.length === 0) lines.push('(없음)');
  for (const s of plan.slots) {
    lines.push(`슬롯${s.id} ${s.copyKey}${s.count ? `×${s.count}` : ''}${s.weekly ? ' 주간' : ''} @ ${new Date(s.at).toLocaleString('ko-KR')}`);
  }
  dump.textContent = lines.join('\n');
}
refreshDump();

// 5) v1→v2 마이그레이션 미리보기 (읽기 전용 — 설치하지 않는다)
panel.appendChild(h3('마이그레이션 미리보기 (v1 JSON 붙여넣기)'));
const migrateBox = document.createElement('textarea');
migrateBox.id = 'lab-migrate';
migrateBox.placeholder = '{"schemaVersion":1, ...}';
panel.appendChild(migrateBox);
const migrateRow = row();
const migrateOut = document.createElement('div');
migrateOut.className = 'lab-dump';
migrateRow.appendChild(
  btn('변환 결과 보기', () => {
    try {
      const migrated = migrate(JSON.parse(migrateBox.value));
      const env = migrated === null ? null : validateAndClamp(migrated);
      migrateOut.textContent = env === null ? '읽을 수 없음 → 새 게임 경로' : JSON.stringify(env, null, 1);
    } catch (e) {
      migrateOut.textContent = `JSON 파싱 실패: ${String(e)}`;
    }
  }),
);
panel.appendChild(migrateRow);
panel.appendChild(migrateOut);
