/**
 * 앱(웹 번들) 버전 — 설정 하단 표시 + 개발자 모드 진입(7탭) 앵커.
 * package.json version이 유일 출처 — vite define으로 주입. 수동 갱신 금지,
 * `npm run ota:release -- <ver>`가 package.json을 올린다.
 */
export const APP_VERSION = __APP_VERSION__;
