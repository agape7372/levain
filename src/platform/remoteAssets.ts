// 원격 빵 자산 — 묶음 밖 변형 GLB·썸네일을 처음 볼 때 받는다(2026-11-16, docs/BREADS.md 변형 143종 라운드).
// platform 층에 격리 — sim·store는 이 파일을 모른다(ota.ts와 같은 규율). 계약:
//   ① 맵(`./remote-assets.json`, 빌드가 쓴다)에 없는 id는 지금처럼 로컬 경로. 맵을 못 읽으면 전부 로컬
//      (dev 서버는 맵이 없고 index.html을 돌려줄 수 있다 → 빈 맵).
//   ② 네트워크는 있으면 좋은 것 — 실패는 조용히 삼킨다. 받지 못하면 호출부가 베이스 빵으로 물러난다.
//   ③ 기기 정보·쿠키를 보내지 않는다(credentials omit). 주소에 붙는 건 파일 내용 해시뿐이다.
//   ④ GLB blob URL은 id당 하나, 세션 내내 revoke하지 않는다 — breadShowcase.ts의 url 캐시와
//      SceneHost의 WebGL 컨텍스트 복구가 같은 url을 다시 읽는다.

/** 원격 자산 호스트 — ota.ts의 OTA_BASE(매니페스트 출처 검사)와 따로 둔다 */
export const ASSET_BASE = 'https://levain-ota.vercel.app/assets';
const CACHE_NAME = 'levain-assets';
/** 받기 자체의 중단 시한 — 쇼케이스가 기다리는 시간(app.ts 4초)과 별개로 넉넉히 */
const FETCH_TIMEOUT_MS = 30_000;
const PREFETCH_DELAY_MS = 400;

export type AssetMap = Readonly<Record<string, string>>;

const KEY_RE = /^breads\/(thumbs\/)?[a-z0-9-]+\.(glb|png)$/;
const HASH_RE = /^[0-9a-f]{10}$/;

/** 맵 형식 검사 — 하나라도 어긋나면 빈 맵(전부 로컬) */
export function parseAssetMap(json: unknown): AssetMap {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(json)) {
    if (!KEY_RE.test(k) || typeof v !== 'string' || !HASH_RE.test(v)) return {};
    out[k] = v;
  }
  return out;
}

/** 맵에 있으면 `${ASSET_BASE}/breads/<id>.<hash>.glb` 꼴, 없으면 null (scripts/lib/families.mjs hashedPath와 같은 꼴) */
export function remoteUrl(map: AssetMap, key: string): string | null {
  const hash = map[key];
  if (!hash) return null;
  const dot = key.lastIndexOf('.');
  return `${ASSET_BASE}/${key.slice(0, dot)}.${hash}${key.slice(dot)}`;
}

let map: AssetMap = {};

/** 부팅 때 1회 — 로컬 파일이라 부팅을 거의 막지 않는다. 실패해도 reject하지 않는다 */
export async function loadRemoteAssets(): Promise<void> {
  try {
    const res = await fetch('./remote-assets.json');
    if (!res.ok) return;
    map = parseAssetMap(await res.json());
  } catch {
    return; // 맵 없음 = 전부 로컬
  }
  if (Object.keys(map).length > 0) setTimeout(() => void pruneCache(), 15_000);
}

/** 썸네일 주소 — 원격이면 원격(WebView HTTP 캐시에 맡긴다), 아니면 지금 경로 */
export function thumbUrl(id: string): string {
  return remoteUrl(map, `breads/thumbs/${id}.png`) ?? `/breads/thumbs/${id}.png`;
}

const blobs = new Map<string, Promise<string>>();

/** 빵 GLB 주소 — 로컬이면 그대로, 원격이면 캐시 → 받기 → blob URL. 같은 id 동시 요청은 한 Promise */
export function glbUrl(id: string): Promise<string> {
  const remote = remoteUrl(map, `breads/${id}.glb`);
  if (!remote) return Promise.resolve(`/breads/${id}.glb`);
  let p = blobs.get(id);
  if (!p) {
    p = fetchBlobUrl(remote);
    blobs.set(id, p);
    p.catch(() => blobs.delete(id)); // 실패는 다음에 다시 시도
  }
  return p;
}

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function fetchBlobUrl(url: string): Promise<string> {
  const cache = await openCache();
  const hit = await cache?.match(url).catch(() => undefined);
  if (hit) return URL.createObjectURL(await hit.blob());
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: ctl.signal });
    if (!res.ok) throw new Error(`asset ${res.status}`);
    const blob = await res.blob();
    // 캐시가 없거나 실패해도 받은 것으로 blob URL은 만든다
    await cache?.put(url, new Response(blob, { headers: { 'Content-Type': 'model/gltf-binary' } })).catch(() => undefined);
    return URL.createObjectURL(blob);
  } finally {
    clearTimeout(timer);
  }
}

let prefetchTimer: ReturnType<typeof setTimeout> | null = null;

/** 고른 변형 하나를 조용히 미리 받는다 — 칩을 빠르게 넘기면 마지막 것만(400ms) */
export function prefetchGlb(id: string): void {
  if (!remoteUrl(map, `breads/${id}.glb`)) return;
  if (prefetchTimer !== null) clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(() => {
    prefetchTimer = null;
    glbUrl(id).catch(() => undefined);
  }, PREFETCH_DELAY_MS);
}

/** 옛 해시 항목 정리 — 지금 맵에 없는 캐시 키를 지운다 */
async function pruneCache(): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  try {
    const live = new Set(Object.keys(map).map((k) => remoteUrl(map, k)));
    for (const req of await cache.keys()) {
      if (!live.has(req.url)) await cache.delete(req);
    }
  } catch {
    /* 정리는 다음 부팅에 */
  }
}
