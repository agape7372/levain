// Capacitor 감지 + 플러그인 지연 로드 (ARCHITECTURE §1). 웹/네이티브 분기는 platform/ 안에서 끝난다.
// 플러그인은 M6에서 설치된다 — 그 전까지 loadPlugin은 항상 null이고 모든 포트는 no-op으로 산다.

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

export function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/**
 * 네이티브에서만 플러그인 모듈을 로드한다. 부재·실패 시 null — 호출 측은 조용히 no-op.
 * 문자열 변수 경유 + @vite-ignore: 아직 node_modules에 없는 패키지라 vite가 정적 해석하면 빌드가 죽는다.
 */
export async function loadPlugin<T>(pkg: string): Promise<T | null> {
  if (!isNative()) return null;
  const spec = pkg;
  try {
    return (await import(/* @vite-ignore */ spec)) as T;
  } catch {
    return null;
  }
}
