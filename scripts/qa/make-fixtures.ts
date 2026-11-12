// QA 세이브 픽스처 생성기 — 손으로 JSON을 쓰지 않고 **실제 store·sim 함수**로 상태를 만든 뒤 직렬화한다.
// 실행: node scripts/qa/make-fixtures.mjs  (vite ssrLoadModule로 이 파일을 로드 → scripts/qa/fixtures/*.json)
// 시각 기준 QA_NOW는 고정값이다. qa-shots.mjs가 페이지의 Date를 같은 값으로 고정한다.
import { createGameStore } from '../../src/store/gameStore';
import type { GameStore } from '../../src/store/gameStore';
import type { SaveEnvelope } from '../../src/store/persistence';
import { FakeClock } from '../../src/platform/clock';
import type { StorageAdapter } from '../../src/platform/storage';
import { DAY, HOUR, INGREDIENTS } from '../../src/sim';

/** 2026-11-12 12:00 KST */
export const QA_NOW = Date.UTC(2026, 10, 12, 3, 0, 0);

const memStorage = (): StorageAdapter => ({
  loadRaw: () => null,
  saveRaw: () => true,
  mirror: () => undefined,
  loadMirror: async () => null,
});

interface Op { t: number; fn: (s: GameStore) => void }

interface Plan {
  /** NOW 기준 태어난 지 얼마 전 (ms) */
  ageMs: number;
  /** 마지막 시각 = NOW + endOffsetMs (기본 0). F9는 음수 — 이후 부재 */
  endOffsetMs?: number;
  ops: Op[];
  /** 마지막에 한 번 더 */
  finish?: (s: GameStore) => void;
}

function run(plan: Plan): SaveEnvelope {
  const start = QA_NOW - plan.ageMs;
  const clock = new FakeClock(start);
  const store = createGameStore({ clock, storage: memStorage() });
  const ops = [...plan.ops].sort((a, b) => a.t - b.t);
  for (const op of ops) {
    clock.set(Math.max(clock.now(), op.t));
    op.fn(store);
  }
  clock.set(QA_NOW + (plan.endOffsetMs ?? 0));
  store.tick();
  plan.finish?.(store);
  store.setFlags({ onboarded: true });
  store.saveNow();
  return JSON.parse(JSON.stringify(store.getEnvelope())) as SaveEnvelope;
}

/** 같은 간격으로 n번 밥 — 마지막 밥이 NOW - tail. 간격은 유효 6h 이상이어야 사이클이 쌓인다 */
function feeds(ageMs: number, n: number, tailMs: number, starter = 's1'): Op[] {
  const first = QA_NOW - ageMs + HOUR;
  const last = QA_NOW - tailMs;
  const gap = n > 1 ? (last - first) / (n - 1) : 0;
  if (n > 1 && gap < 6 * HOUR) throw new Error(`밥 간격 ${(gap / HOUR).toFixed(1)}h < 6h`);
  const out: Op[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      t: Math.round(first + gap * i),
      fn: (s) => {
        s.switchStarter(starter);
        s.dispatch({ type: 'feed', ratio: '1:1:1' });
      },
    });
  }
  return out;
}

const peakDough = { activity: 1, acidity: 12, flour: 'white' as const };

/** 도감 전부 채운 뒤 등급·횟수를 섞고 keepEvery 간격으로만 남긴다 */
function shapeCollection(env: SaveEnvelope, keepEvery: number): void {
  const keys = Object.keys(env.shared.collection).sort();
  const grades = ['best', 'good', 'flat'] as const;
  const next: SaveEnvelope['shared']['collection'] = {};
  keys.forEach((k, i) => {
    if (i % keepEvery !== 0) return;
    const e = env.shared.collection[k];
    next[k] = {
      ...e,
      bestGrade: e.bestGrade === null ? null : grades[i % 3],
      count: 1 + ((i * 7) % 5),
      firstAt: QA_NOW - (1 + (i % 20)) * DAY,
    };
  });
  env.shared.collection = next;
}

export function buildFixtures(): Record<string, { desc: string; save: SaveEnvelope }> {
  const out: Record<string, { desc: string; save: SaveEnvelope }> = {};

  // F1 갓 만든 0단계 (1시간 전 탄생, 선물 미수령)
  out.F1 = {
    desc: '0단계 갓 만든 르방 · 통 0 · 선물 미수령',
    save: run({ ageMs: HOUR, ops: [] }),
  };

  // F2 2단계 · 배고픔 (밥 후 16h)
  {
    const age = 6 * DAY;
    out.F2 = {
      desc: '2단계 · 배고픔 · 통 0',
      save: run({ ageMs: age, ops: feeds(age, 9, 16 * HOUR) }),
    };
  }

  // F3 3단계 · 피크(밥 후 5h) · 통 200g
  {
    const age = 10 * DAY;
    out.F3 = {
      desc: '3단계 · 피크 · 통 200g(피크 품질)',
      save: run({
        ageMs: age,
        ops: feeds(age, 14, 5 * HOUR),
        finish: (s) => s.grantPantry(200, peakDough),
      }),
    };
  }

  // F4 5단계 · 통 넉넉 · 도감 절반 · 재료 여럿 · 르방 3개 (밥 후 8h = 떼기 가능)
  {
    const age = 34 * DAY;
    const ops: Op[] = feeds(age, 50, 8 * HOUR);
    ops.push({ t: QA_NOW - 4 * DAY, fn: (s) => { s.addStarter(); s.dispatch({ type: 'feed', ratio: '1:1:1' }); } });
    for (const d of [3, 2, 1]) {
      ops.push({ t: QA_NOW - d * DAY, fn: (s) => { s.switchStarter('s2'); s.dispatch({ type: 'feed', ratio: '1:1:1' }); } });
    }
    ops.push({ t: QA_NOW - 2 * HOUR, fn: (s) => { s.addStarter(); s.dispatch({ type: 'feed', ratio: '1:1:1' }); } });
    const env = run({
      ageMs: age,
      ops,
      finish: (s) => {
        s.switchStarter('s1');
        s.devCompleteCollection();
        s.claimStarterGift('olive');
        INGREDIENTS.forEach((ing, i) => { if (i < 11) s.grantIngredient(ing.id, i < 6 ? 4 : 1); });
        s.grantPantry(160, { activity: 0.95, acidity: 18, flour: 'white' });
        s.grantPantry(140, { activity: 0.6, acidity: 45, flour: 'rye' });
        s.grantPantry(120, { activity: 0.35, acidity: 62, flour: 'white' });
      },
    });
    shapeCollection(env, 2);
    out.F4 = { desc: '5단계 · 통 420g · 도감 절반 · 재료 11종 · 르방 3개 · 떼기 가능', save: env };
  }

  // F5 휴면 (밥 후 130h)
  {
    const age = 12 * DAY;
    out.F5 = {
      desc: '3단계 · 휴면(밥 후 130h) · 통 120g',
      save: run({ ageMs: age, ops: feeds(age, 13, 130 * HOUR), finish: (s) => s.grantPantry(120, peakDough) }),
    };
  }

  // F6 반점 (밥 후 200h, 휴면 + 곰팡이 반점)
  {
    const age = 14 * DAY;
    out.F6 = {
      desc: '3단계 · 곰팡이 반점(밥 후 200h) · 통 90g',
      save: run({ ageMs: age, ops: feeds(age, 13, 200 * HOUR), finish: (s) => s.grantPantry(90, peakDough) }),
    };
  }

  // F7 곰팡이 사망 + 플레이크 (밥 후 400h, 사망 336h)
  {
    const age = 25 * DAY;
    const ops = feeds(age, 13, 400 * HOUR);
    ops.push({ t: QA_NOW - 398 * HOUR, fn: (s) => { s.dispatch({ type: 'makeFlake' }); } });
    out.F7 = {
      desc: '3단계 · 곰팡이 사망 · 플레이크 있음 · 통 300g',
      save: run({ ageMs: age, ops, finish: (s) => s.grantPantry(300, peakDough) }),
    };
  }

  // F8 전부 가득 — 도감 전체 · 재료 9개씩 · 통 큼 · 르방 3개 · 긴 이름표
  {
    const age = 40 * DAY;
    const ops: Op[] = feeds(age, 60, 3 * HOUR);
    ops.push({ t: QA_NOW - 6 * DAY, fn: (s) => { s.addStarter(); s.dispatch({ type: 'feed', ratio: '1:1:1' }); } });
    ops.push({ t: QA_NOW - 5 * DAY, fn: (s) => { s.addStarter(); s.dispatch({ type: 'feed', ratio: '1:1:1' }); } });
    ops.push({ t: QA_NOW - 2 * HOUR, fn: (s) => { s.switchStarter('s2'); s.dispatch({ type: 'feed', ratio: '1:1:1' }); } });
    const env = run({
      ageMs: age,
      ops,
      finish: (s) => {
        s.switchStarter('s1');
        s.renameActive('할머니네 노포 르방이');
        s.devCompleteCollection();
        s.claimStarterGift('olive');
        for (const ing of INGREDIENTS) s.grantIngredient(ing.id, 9);
        for (let i = 0; i < 6; i++) s.grantPantry(150, { activity: 0.9 - i * 0.1, acidity: 15 + i * 10, flour: i % 2 ? 'rye' : 'white' });
      },
    });
    out.F8 = { desc: '5단계 · 도감 전체 · 재료 30종×9 · 통 900g · 르방 3개 · 이름표 11자', save: env };
  }

  // F9 8시간 이상 부재 뒤 복귀 — 저장 시각은 NOW - 13h (밥 후 3h), 페이지 시계는 NOW
  {
    const age = 10 * DAY;
    const endOffset = -13 * HOUR;
    out.F9 = {
      desc: '3단계 · 13시간 부재 뒤 복귀(브리핑: 한창때 지남 · 배고파짐) · 통 100g',
      save: run({
        ageMs: age,
        endOffsetMs: endOffset,
        ops: feeds(age, 14, 16 * HOUR),
        finish: (s) => s.grantPantry(100, peakDough),
      }),
    };
  }

  return out;
}
