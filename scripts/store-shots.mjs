/**
 * Play 스토어용 태블릿 스크린샷 캡처.
 * 사용: node scripts/store-shots.mjs <outDir>
 * vite dev를 띄우고 태블릿 뷰포트로 홈·도감을 찍는다. WebGL은 lib/launch-browser의 스위치를 그대로 쓴다.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchBrowser } from './lib/launch-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(root, process.argv[2] ?? 'work/store-shots');
mkdirSync(outDir, { recursive: true });

const SIZES = [
  { name: 'tablet7', width: 1200, height: 1920 },
  { name: 'tablet10', width: 1600, height: 2560 },
];

const vite = spawn('npx', ['vite', '--port', '5197'], { cwd: root, shell: true, stdio: 'pipe' });
let viteLog = '';
vite.stdout.on('data', (d) => (viteLog += String(d)));
vite.stderr.on('data', (d) => (viteLog += String(d)));
const baseUrl = await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error(`vite 기동 시간 초과\n${viteLog}`)), 30000);
  vite.stdout.on('data', (d) => {
    const m = String(d).replace(/\x1b\[[0-9;]*m/g, '').match(/Local:\s+(http:\/\/localhost:\d+\/)/);
    if (m) { clearTimeout(to); res(m[1]); }
  });
  vite.on('exit', () => rej(new Error(`vite dev가 죽었습니다\n${viteLog}`)));
});

const puppeteer = (await import('puppeteer')).default;
const browser = await launchBrowser(puppeteer);
try {
  for (const size of SIZES) {
    const page = await browser.newPage();
    await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 6000));
    await page.screenshot({ path: path.join(outDir, `${size.name}-home.png`), type: 'png' });
    // 하단 탭 라벨을 훑어 도감으로 이동
    const moved = await page.evaluate(() => {
      const hit = Array.from(document.querySelectorAll('button, a')).find((el) =>
        /도감/.test(el.textContent ?? ''),
      );
      if (hit) { hit.click(); return true; }
      return false;
    });
    if (moved) {
      await new Promise((r) => setTimeout(r, 3000));
      await page.screenshot({ path: path.join(outDir, `${size.name}-collection.png`), type: 'png' });
    }
    console.log(`${size.name} ${size.width}x${size.height} 도감이동=${moved}`);
    await page.close();
  }
} finally {
  await browser.close();
  vite.kill();
  process.exit(0);
}
