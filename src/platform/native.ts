// Capacitor 감지. 플러그인은 각 platform 모듈이 **정적 import**한다 —
// 번들 앱에서 동적 bare-import(import('@capacitor/x'))는 WebView가 해석 못 해
// 조용히 null이 되는 함정(에뮬 실측 2026-08-23). loadPlugin 패턴 금지.
export function isNative(): boolean {
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return w.Capacitor?.isNativePlatform?.() === true;
}
