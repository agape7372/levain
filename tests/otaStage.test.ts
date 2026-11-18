// OTA 확인·예약(platform/ota.ts) — 플러그인·Preferences 목업. 감사 T3-05 · T2-07 · T2-20 · T2-05 회귀.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import liveManifest from '../ota/manifest.json';
import liveHistory from '../ota/history.json';
import { APP_VERSION } from '../src/version';

const h = vi.hoisted(() => ({
  calls: [] as string[],
  prefs: new Map<string, string>(),
  current: { bundle: { version: 'builtin', id: 'builtin' }, native: '1.0.0' },
  failed: null as null | { bundle: { version: string } },
  manifest: null as unknown,
}));

vi.mock('@capgo/capacitor-updater', () => ({
  CapacitorUpdater: {
    notifyAppReady: async () => { h.calls.push('notifyAppReady'); },
    getFailedUpdate: async () => { const f = h.failed; h.failed = null; return f; }, // 플러그인처럼 1회 읽으면 비워진다
    current: async () => h.current,
    list: async () => ({ bundles: [] }),
    download: async (o: { version: string; url: string }) => { h.calls.push(`download ${o.version} ${o.url}`); return { id: `id-${o.version}`, version: o.version }; },
    next: async (o: { id: string }) => { h.calls.push(`next ${o.id}`); },
    delete: async () => undefined,
  },
}));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: h.prefs.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => { h.prefs.set(key, value); },
  },
}));
vi.mock('../src/platform/native', () => ({ isNative: () => true }));

import { initOta, markOtaReady, otaKey } from '../src/platform/ota';
import { signManifest, type SignedFields } from '../scripts/ota-sign.mjs';

// 시험용 키 쌍(웹 crypto → PEM): 게시 스크립트(scripts/ota-sign.mjs)로 서명하고 앱(src/platform/ota.ts)이 확인한다
// = 두 쪽의 서명 글 형식이 맞는지도 본다. 진짜 개인 키는 레포 밖이라 시험은 키를 갈아 끼운다.
const b64 = (b: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(b)));
async function pair(): Promise<{ pem: string; spki: string }> {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const body = b64(await crypto.subtle.exportKey('pkcs8', k.privateKey)).match(/.{1,64}/g)!.join('\n');
  return { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`, spki: b64(await crypto.subtle.exportKey('spki', k.publicKey)) };
}
const shipped = otaKey.spki; // 앱에 박힌 진짜 공개 키
const mine = await pair();
const theirs = await pair();
otaKey.spki = mine.spki;
const sign = <T extends SignedFields>(m: T, pem = mine.pem): T & { sig: string } => signManifest(m, pem);

const SUM = 'a'.repeat(64);
/** APP_VERSION의 patch를 n만큼 올린 버전 — package.json이 바뀌어도 테스트가 버틴다 */
function bump(n: number): string {
  const [a, b, c] = APP_VERSION.split('.').map(Number);
  return `${a}.${b}.${c + n}`;
}
/** 서명된 manifest. over는 서명 뒤에 덮는다(= 서명 뒤 바꿈) */
function man(version: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...sign({ version, url: `https://levain-ota.vercel.app/bundles/${version}.zip`, checksum: SUM }), ...over };
}
function downloads(): string[] {
  return h.calls.filter((c) => c.startsWith('download'));
}

async function boot(opts?: { deferReady?: boolean }): Promise<void> {
  vi.useFakeTimers();
  initOta(opts);
  await vi.advanceTimersByTimeAsync(3500);
  vi.useRealTimers();
  await new Promise((r) => setTimeout(r, 10));
}

beforeEach(() => {
  h.calls.length = 0;
  h.prefs.clear();
  h.failed = null;
  h.current = { bundle: { version: 'builtin', id: 'builtin' }, native: '1.0.0' };
  vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => h.manifest }));
});

describe('T3-05 내장 번들의 비교 기준 = 번들에 박힌 APP_VERSION', () => {
  it('versionName이 낮게 남아 있어도 내장 웹과 같은 버전 매니페스트는 받지 않는다', async () => {
    h.manifest = man(APP_VERSION);
    await boot();
    expect(downloads()).toEqual([]);
  });

  it('내장 웹보다 높은 버전이면 받는다', async () => {
    h.manifest = man(bump(1));
    await boot();
    expect(downloads().length).toBe(1);
    expect(h.calls).toContain(`next id-${bump(1)}`);
  });
});

describe('T2-07 부팅 실패로 롤백된 번들은 다시 받지 않는다', () => {
  it('실패 기록 = 매니페스트 버전 → 이번 세션도 다음 세션도 download 0', async () => {
    h.failed = { bundle: { version: bump(1) } };
    h.manifest = man(bump(1));
    await boot();
    expect(downloads()).toEqual([]);
    expect(h.prefs.get('levain:ota:bad')).toBe(bump(1));
    await boot(); // 플러그인 기록은 비워졌고 Preferences 기록만 남은 다음 세션
    expect(downloads()).toEqual([]);
  });

  it('더 높은 버전이 나오면 정상 진행', async () => {
    h.prefs.set('levain:ota:bad', bump(1));
    h.manifest = man(bump(2));
    await boot();
    expect(downloads().length).toBe(1);
  });
});

describe('T2-20 매니페스트 방어', () => {
  it('OTA_BASE/bundles/ 밖 url은 무시', async () => {
    h.manifest = man(bump(1), { url: 'http://evil.example/x.zip' });
    await boot();
    expect(downloads()).toEqual([]);
  });

  it('sha256 hex 64자가 아닌 checksum은 무시(빈 값이면 플러그인이 검증을 건너뛴다)', async () => {
    h.manifest = man(bump(1), { checksum: '' });
    await boot();
    expect(downloads()).toEqual([]);
  });

  it('발행된 manifest·history의 url·checksum은 전부 가드를 통과한다(라이브 OTA가 끊기지 않음)', async () => {
    for (const entry of [liveManifest, ...liveHistory]) {
      h.calls.length = 0;
      h.manifest = sign({ ...entry, version: bump(1), minNative: undefined });
      await boot();
      expect(downloads()).toEqual([`download ${bump(1)} ${entry.url}`]);
    }
  });
});

// 2026-11-18 어뷰징 점검: Vercel이 털려 manifest·zip을 같이 바꿔도 개인 키(레포 밖)가 없으면 앱이 안 받는다
describe('판 목록 서명', () => {
  const v = (): string => bump(1);
  const plain = (): Record<string, unknown> => ({ version: v(), url: `https://levain-ota.vercel.app/bundles/${v()}.zip`, checksum: SUM });

  it('정상 서명 판은 받고 다음 시작에 예약한다', async () => {
    h.manifest = man(v());
    await boot();
    expect(downloads()).toEqual([`download ${v()} https://levain-ota.vercel.app/bundles/${v()}.zip`]);
    expect(h.calls).toContain(`next id-${v()}`);
  });

  it('서명 없음 · 빈 서명 · 문자열 아닌 서명 · 다른 키 서명이면 받지도 예약하지도 않는다', async () => {
    for (const m of [plain(), { ...plain(), sig: '' }, { ...plain(), sig: 1 }, sign(plain() as SignedFields, theirs.pem)]) {
      h.calls.length = 0;
      h.manifest = m;
      await boot();
      expect(h.calls.filter((c) => c !== 'notifyAppReady')).toEqual([]);
    }
  });

  it('서명 뒤 묶음 바꿔치기(체크섬) · 같은 호스트 다른 zip(주소) · 판 번호를 바꾸면 안 받는다', async () => {
    const other = `https://levain-ota.vercel.app/bundles/${bump(9)}.zip`;
    for (const over of [{ checksum: 'b'.repeat(64) }, { url: other }, { version: bump(2) }]) {
      h.calls.length = 0;
      h.manifest = man(v(), over);
      await boot();
      expect(h.calls.filter((c) => c !== 'notifyAppReady')).toEqual([]);
    }
  });

  it('앱에 박힌 공개 키는 웹 crypto가 읽는 P-256 SPKI(개인 키와의 짝은 ota-release가 빌드 전에 맞대 본다)', async () => {
    const raw = Uint8Array.from(atob(shipped), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('spki', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    expect((key.algorithm as EcKeyAlgorithm).namedCurve).toBe('P-256');
  });
});

describe('T2-05 준비: 롤백 방지 신호를 부팅 끝으로 옮길 수 있게', () => {
  it('기본 initOta()는 지금처럼 신호를 바로 보낸다', async () => {
    h.manifest = null;
    await boot();
    expect(h.calls[0]).toBe('notifyAppReady');
  });

  it('deferReady면 initOta는 신호를 보내지 않고 markOtaReady()가 보낸다', async () => {
    h.manifest = null;
    await boot({ deferReady: true });
    expect(h.calls).not.toContain('notifyAppReady');
    markOtaReady();
    await new Promise((r) => setTimeout(r, 0));
    expect(h.calls).toContain('notifyAppReady');
  });
});
