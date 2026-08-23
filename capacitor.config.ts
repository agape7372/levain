// 로컬 번들 셸 — server.url 없음. 웹 빌드(dist)가 앱에 실린다 (ARCHITECTURE §6).
// appId는 Play 등록 후 변경 불가 — 사용자 확정 2026-08-23.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zaballgam.levain',
  appName: '르방이',
  webDir: 'dist',
  // 상태바 뒤 흰 띠 방지 — WebView·윈도 배경을 앱 배경색과 일치 (에뮬 실측)
  backgroundColor: '#E8D9C4',
};

export default config;
