// 로컬 번들 셸 — server.url 없음. 웹 빌드(dist)가 앱에 실린다 (ARCHITECTURE §6).
// appId는 Play 등록 후 변경 불가 — 사용자 확정 2026-08-23.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zaballgam.levain',
  appName: '르방이',
  webDir: 'dist',
  // 상태바 뒤 흰 띠 방지 — WebView·윈도 배경을 앱 배경색과 일치 (에뮬 실측)
  backgroundColor: '#E8D9C4',
  plugins: {
    // OTA — 자동 모드 금지. 확인·다운로드·적용 시점을 src/platform/ota.ts가 직접 쥔다
    // (세션 중 화면 교체 금지·오프라인 우선 계약). 정본: docs/RELEASE.md OTA 절.
    CapacitorUpdater: {
      autoUpdate: 'off',
      // ⚠ 기본값은 Capgo 클라우드(plugin.capgo.app)로 향한다 — 빈 문자열로 전부 차단.
      // 우리 업데이트 확인은 ota.ts가 자체 정적 manifest를 GET할 뿐, 기기 정보를 보내지 않는다.
      // 방침(docs/PRIVACY.md)과 직결되므로 되돌리지 말 것.
      updateUrl: '',
      statsUrl: '',
      channelUrl: '',
      // 네이티브(APK) 버전이 올라가면 받아 둔 웹 번들을 버리고 내장 번들로 돌아간다
      resetWhenUpdate: true,
      // notifyAppReady()를 이 시간 안에 못 받으면 이전 번들로 자동 롤백 (부팅 실패 안전장치)
      appReadyTimeout: 10000,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
    },
  },
};

export default config;
