// OTA(웹 번들 무선 갱신) — platform 층에 격리. sim·store는 이 파일의 존재를 모른다.
// 계약 3줄:
//   ① 부팅 즉시 notifyAppReady() — 안 부르면 플러그인이 "깨진 번들"로 보고 이전 번들로 롤백한다.
//   ② 세션 중에는 절대 화면을 갈아끼우지 않는다 — 받아만 두고 next()로 예약한다.
//      ⚠ 실측(에뮬 2026-08-23): 예약분이 적용되는 시점은 "앱 종료 후 재시작"이 아니라
//      **백그라운드로 나갔다 돌아올 때**다. force-stop→재시작만으로는 builtin이 계속 뜬다.
//   ③ 네트워크는 있으면 좋은 것 — 실패는 조용히 삼킨다. 오프라인에서도 앱은 완전히 동작한다.
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { isNative } from './native';

/** 정적 배포처 — 서버 로직 없음(manifest.json + bundles/*.zip 두 종류뿐) */
const OTA_BASE = 'https://levain-ota.vercel.app';
const MANIFEST_URL = `${OTA_BASE}/manifest.json`;
const FETCH_TIMEOUT_MS = 6000;

interface OtaManifest {
  version: string;
  url: string;
  checksum: string;
  size?: number;
  releasedAt?: string;
  /** 이 번들이 요구하는 최소 네이티브 버전 — 낮은 셸이면 건너뛴다 */
  minNative?: string;
}

/** "1.2.3" 비교 — a>b면 1, 같으면 0, a<b면 -1. 숫자 아닌 조각은 0으로 본다 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function fetchManifest(): Promise<OtaManifest | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (typeof json !== 'object' || json === null) return null;
    const m = json as Record<string, unknown>;
    if (typeof m.version !== 'string' || typeof m.url !== 'string' || typeof m.checksum !== 'string') return null;
    return {
      version: m.version,
      url: m.url,
      checksum: m.checksum,
      size: typeof m.size === 'number' ? m.size : undefined,
      releasedAt: typeof m.releasedAt === 'string' ? m.releasedAt : undefined,
      minNative: typeof m.minNative === 'string' ? m.minNative : undefined,
    };
  } catch {
    return null; // 오프라인·타임아웃·형식 오류 — 전부 "업데이트 없음"과 같게 취급
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 부팅 시 1회 호출. 롤백 방지 신호를 먼저 보내고, 그다음 조용히 새 번들을 확인한다.
 * 반환값 없음 — UI는 OTA를 기다리지 않는다.
 */
export function initOta(): void {
  if (!isNative()) return; // 웹(dev·브라우저)에선 OTA 개념 자체가 없다

  // ① 롤백 방지: 지금 실행 중인 번들이 정상 부팅했음을 알린다. 실패해도 앱은 계속 간다.
  void CapacitorUpdater.notifyAppReady().catch(() => undefined);

  // ② 확인·다운로드는 부팅 경로를 막지 않게 뒤로 미룬다
  setTimeout(() => void checkAndStage(), 3000);
}

async function checkAndStage(): Promise<void> {
  try {
    const manifest = await fetchManifest();
    if (!manifest) return;

    const cur = await CapacitorUpdater.current();
    const currentVersion = cur.bundle.version; // 내장 번들이면 "builtin"
    const nativeVersion = cur.native;

    // 네이티브가 요구 버전보다 낮으면 이 번들은 못 쓴다 (플러그인 추가 등 — APK 재배포 몫)
    if (manifest.minNative && compareVersions(nativeVersion, manifest.minNative) < 0) return;

    // builtin은 버전 비교 대상이 아니다 — 매니페스트가 네이티브보다 새로우면 받는다
    const base = currentVersion === 'builtin' ? nativeVersion : currentVersion;
    if (compareVersions(manifest.version, base) <= 0) return;

    // 이미 받아 둔 같은 버전이 있으면 다시 받지 않는다
    const list = await CapacitorUpdater.list();
    const staged = list.bundles.find((b) => b.version === manifest.version);
    const bundle = staged ?? (await CapacitorUpdater.download({
      url: manifest.url,
      version: manifest.version,
      checksum: manifest.checksum,
    }));

    // ③ 다음 앱 시작에 적용 — 세션 중 화면을 갈아끼우지 않는다(코지 계약)
    await CapacitorUpdater.next({ id: bundle.id });

    // 오래된 번들 정리 — 현재/다음 것만 남긴다
    for (const b of list.bundles) {
      if (b.id !== bundle.id && b.version !== currentVersion) {
        await CapacitorUpdater.delete({ id: b.id }).catch(() => undefined);
      }
    }
  } catch {
    // 다운로드 실패·체크섬 불일치·디스크 부족 — 전부 조용히 넘어간다. 다음 실행에 다시 시도.
  }
}
