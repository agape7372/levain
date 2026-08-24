// breadlab 스크린샷 CLI — 모델링 검수 루프용 (서브에이전트 공용 도구).
// 사용: node scripts/breadlab-shot.mjs "<query>" <out.png>
//   예: node scripts/breadlab-shot.mjs "id=pancake&view=34&shot=1" work/render-34.png
//       node scripts/breadlab-shot.mjs "id=pancake&compare=1" work/cmp.png   (레퍼런스+렌더 콜라주)
// stdout에 window.__stats(JSON)·__error를 출력한다 — 숫자 판정은 이미지 없이 이걸로.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchBrowser } from './lib/launch-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [query, outPng] = process.argv.slice(2);
if (!query || !outPng) {
  console.error('사용법: node scripts/breadlab-shot.mjs "<query>" <out.png>');
  process.exit(1);
}

async function main() {
  const puppeteer = (await import('puppeteer')).default;

  const vite = spawn('npx', ['vite', '--port', '5196'], { cwd: root, shell: true, stdio: 'pipe' });
  let viteLog = '';
  vite.stdout.on('data', (d) => (viteLog += String(d)));
  vite.stderr.on('data', (d) => (viteLog += String(d)));
  const baseUrl = await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error(`vite 기동 시간 초과\n${viteLog}`)), 30000);
    vite.stdout.on('data', (d) => {
      const m = String(d).replace(/\x1b\[[0-9;]*m/g, '').match(/Local:\s+(http:\/\/localhost:\d+\/)/);
      if (m) {
        clearTimeout(to);
        res(m[1]);
      }
    });
    vite.on('exit', () => rej(new Error(`vite dev가 죽었습니다\n${viteLog}`)));
  });

  const browser = await launchBrowser(puppeteer);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 600, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}breadlab.html?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__done === true', { timeout: 30000 });
    const err = await page.evaluate('window.__error');
    const stats = await page.evaluate('window.__stats');
    if (stats) console.log(`stats ${stats}`);
    if (err) {
      console.error(`error ${err}`);
      process.exit(1);
    }
    const target = query.includes('compare=1') ? '#cmp' : '#stage';
    const el = await page.$(target);
    if (!el) throw new Error(`${target} 없음`);
    mkdirSync(path.dirname(path.resolve(root, outPng)), { recursive: true });
    await el.screenshot({ path: path.resolve(root, outPng) });
    console.log(`✓ ${outPng}`);
  } finally {
    await browser.close();
    killTree(vite);
  }
}

// Windows에서 shell:true 자식의 kill()은 cmd 래퍼만 죽인다 — 프로세스 트리째 종료
function killTree(child) {
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* 이미 종료 */
    }
  } else child.kill();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
