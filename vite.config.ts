import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2020',
    // ⚠ 명시해 뒀지만 **이 환경에선 안 먹는다** — dist/ 디렉터리 제거 자체가 조용히 실패해서
    // 옛 산출물이 계속 쌓인다(실측: 449개 중 진짜는 9개, 나머지 42.6MB가 누적분).
    // 그래서 릴리스 경로는 `scripts/ota-release.mjs`가 **파일 단위로** 비우고 잔존 수를 검사한다.
    // 여기 값에 기대지 말 것 — dev 빌드로 확인할 땐 dist/가 오염돼 있을 수 있다.
    emptyOutDir: true,
  },
});
