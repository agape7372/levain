// motionlab 스크린샷 CLI — 물성·유리벽 검수 루프용 (breadlab-shot.mjs와 같은 축, 서브에이전트 공용).
// 사용: node scripts/motionlab-shot.mjs "<query>" <out.png>
//   예: node scripts/motionlab-shot.mjs "preset=peak" work/peak.png
//       node scripts/motionlab-shot.mjs "preset=justfed&wallCells=0.6" work/jf.png
// 여러 프리셋을 한 번에: node scripts/motionlab-shot.mjs --all <out-dir>
// 콘솔 오류(셰이더 컴파일 실패 포함)를 stdout에 그대로 뱉는다 — GLSL은 런타임에만 터지므로
// 이 스크립트가 사실상 셰이더 컴파일 게이트다.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchBrowser } from './lib/launch-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRESETS = ['justfed', 'rising', 'peak', 'falling', 'hungry', 'sour', 'dormant', 'moldy'];

const [arg1, arg2] = process.argv.slice(2);
if (!arg1 || !arg2) {
  console.error('사용법: node scripts/motionlab-shot.mjs "<query>" <out.png>');
  console.error('        node scripts/motionlab-shot.mjs --all <out-dir>');
  process.exit(1);
}
const all = arg1 === '--all';
const jobs = all
  ? PRESETS.map((p) => ({ query: `preset=${p}`, out: path.join(arg2, `${p}.png`) }))
  : [{ query: arg1, out: arg2 }];

async function main() {
  const puppeteer = (await import('puppeteer')).default;

  const vite = spawn('npx', ['vite', '--port', '5197'], { cwd: root, shell: true, stdio: 'pipe' });
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
  let bad = 0;
  try {
    for (const job of jobs) {
      const page = await browser.newPage();
      const problems = [];
      page.on('console', (m) => {
        if (m.type() !== 'error' && m.type() !== 'warning') return;
        // favicon 404는 dev 하네스 상수 잡음 — URL 없는 일반 메시지라 여기서 걸러야 한다.
        // 잡음이 섞이면 게이트를 안 보게 된다
        if (m.text().includes('Failed to load resource')) return;
        problems.push(`[${m.type()}] ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`[pageerror] ${String(e)}`));
      page.on('response', (r) => {
        // favicon 404는 dev 하네스의 상수 잡음 — 그 외 404는 진짜 문제다
        if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) {
          problems.push(`[http ${r.status()}] ${r.url()}`);
        }
      });
      await page.setViewport({ width: 380, height: 680, deviceScaleFactor: 2 });
      await page.goto(`${baseUrl}motionlab.html?${job.query}&shot=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__done === true', { timeout: 30000 });
      const err = await page.evaluate('window.__error');
      const outPath = path.resolve(root, job.out);
      mkdirSync(path.dirname(outPath), { recursive: true });
      const el = await page.$('#stage');
      if (!el) throw new Error('#stage 없음');
      await el.screenshot({ path: outPath });
      const label = job.query;
      if (err) problems.push(`[__error] ${err}`);
      if (problems.length) {
        bad++;
        console.log(`FAIL ${label}\n  ${problems.join('\n  ')}`);
      } else {
        console.log(`ok   ${label} -> ${job.out}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
    killTree(vite);
  }
  if (bad) process.exit(1);
}

// Windows에서 shell:true 자식의 kill()은 cmd 래퍼만 죽인다 — 프로세스 트리째 종료
// (export-breads.mjs와 같은 함정. 안 하면 vite가 호출마다 살아남아 쌓인다)
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
  console.error(String(e));
  process.exit(1);
});
