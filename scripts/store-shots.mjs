/**
 * Play 스토어용 스크린샷 캡처(폰 1080×1920 · 7인치 · 10인치).
 * 사용: node scripts/store-shots.mjs <outDir>   (포트: 환경 변수 STORE_SHOTS_PORT, 기본 5197)
 * vite dev를 띄우고 태블릿 뷰포트로 홈·레시피를 찍는다. 세이브 픽스처(scripts/qa/fixtures/F4.json)를 심어
 * 온보딩을 건너뛰고, Date를 픽스처 저장 시각(_meta.json qaNow)에 고정한다(qa-shots.mjs와 같은 방식).
 * launch-browser 헬퍼는 GPU 스위치를 주지 않는다 — 아래 GPU_ARGS를 직접 넘긴다(이 PC에서 3D·60fps가 나오는 조합).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchBrowser } from './lib/launch-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(root, process.argv[2] ?? 'work/store-shots');
mkdirSync(outDir, { recursive: true });

// 10인치는 1600×2560@1 대신 800×1280@2 — 같은 픽셀 수지만 실기기와 같은 CSS 크기·DPR로 찍는다
const SIZES = [
  { name: 'phone', width: 360, height: 640, dsf: 3 }, // 1080×1920 — 폰 스크린샷도 같은 픽스처로
  { name: 'tablet7', width: 1200, height: 1920, dsf: 1 },
  { name: 'tablet10', width: 800, height: 1280, dsf: 2 },
];

// 세이브 픽스처 — 없으면 온보딩 1단계(불투명 배경)를 찍게 된다
const fixDir = path.join(root, 'scripts', 'qa', 'fixtures');
const { qaNow } = JSON.parse(readFileSync(path.join(fixDir, '_meta.json'), 'utf8'));
const save = readFileSync(path.join(fixDir, 'F4.json'), 'utf8');
const seedScript = `(() => {
  const FIXED = ${qaNow};
  const RealDate = Date;
  class QDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
    static now() { return FIXED; }
  }
  globalThis.Date = QDate;
  try {
    if (!sessionStorage.getItem('__shotsSeeded')) {
      sessionStorage.setItem('__shotsSeeded', '1');
      localStorage.clear();
      localStorage.setItem('levain:save', ${JSON.stringify(save)});
    }
  } catch (e) {}
})();`;

// node로 vite를 직접 띄운다 — shell:true면 vite.kill()이 셸만 죽이고 vite가 남는다
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const vite = spawn(process.execPath, [viteBin, '--port', process.env.STORE_SHOTS_PORT ?? '5197', '--strictPort'], { cwd: root, stdio: 'pipe' });
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
const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await launchBrowser(puppeteer, { args: GPU_ARGS });
try {
  for (const size of SIZES) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(seedScript);
    await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: size.dsf });
    await page.goto(baseUrl, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 6000));
    // 콜드 스타트는 천이 덮여 있다 — 병을 한 번 눌러 걷은 뒤 찍는다(스토어 그림은 르방이 보여야 한다)
    await page.mouse.click(size.width / 2, size.height * 0.55);
    await new Promise((r) => setTimeout(r, 2600));
    await page.screenshot({ path: path.join(outDir, `${size.name}-home.png`), type: 'png' });
    // 하단 탭 라벨을 훑어 레시피로 이동
    const moved = await page.evaluate(() => {
      const hit = Array.from(document.querySelectorAll('button, a')).find((el) =>
        /레시피/.test(el.textContent ?? ''),
      );
      if (hit) { hit.click(); return true; }
      return false;
    });
    if (moved) {
      await new Promise((r) => setTimeout(r, 3000));
      await page.screenshot({ path: path.join(outDir, `${size.name}-recipes.png`), type: 'png' });
    }
    console.log(`${size.name} ${size.width}x${size.height}@${size.dsf} 레시피이동=${moved}`);
    await page.close();
  }
} finally {
  await browser.close();
  vite.kill();
  process.exit(0);
}
