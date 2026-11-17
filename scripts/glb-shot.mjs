// GLB 검수 캡처 — public/<family>/<id>.glb를 앱과 같은 재질·조명으로 여러 각도에서 찍는다.
// 사용: node scripts/glb-shot.mjs <id> <outDir> [--family=bread] [--az=0,90,180,270] [--size=768]
// 산출: <outDir>/<id>-az<도>.png (투명 배경). 턴테이블 게이트·레퍼런스 대조용 (docs/BREADS.md §Blender).
// 선택: --glb=<루트 기준 경로> (public 밖 GLB) · --query=<쿼리 문자열> (예: style=toon&line=6&ramp=0.6,0.8,1).
// 썸네일 하네스(thumbs.html)를 그대로 쓴다 — ?az·?size만 얹는다. vite·브라우저는 한 번만 띄운다.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchBrowser } from './lib/launch-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const [id, outDir] = args.filter((a) => !a.startsWith('--'));
if (!id || !outDir) {
  console.error('사용법: node scripts/glb-shot.mjs <id> <outDir> [--family=bread] [--az=0,90,180,270] [--size=768]');
  process.exit(1);
}
const family = flag('family', 'bread');
const azs = flag('az', '0,90,180,270').split(',').map(Number);
const size = Number(flag('size', '768'));
const glb = flag('glb', ''); // 루트 기준 GLB 경로(예: .work/blender/<id>/raw.glb) — 하네스 ?glb=
const query = flag('query', ''); // 하네스에 그대로 덧붙일 쿼리(예: style=toon&line=6)
const extra = `${glb ? `&glb=${encodeURIComponent(glb)}` : ''}${query ? `&${query}` : ''}`;

function killTree(child) {
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* 이미 종료 */
    }
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill();
    }
  }
}

async function main() {
  const puppeteer = (await import('puppeteer')).default;
  const vite = spawn('npx', ['vite', '--port', '5197'], {
    cwd: root,
    shell: true,
    stdio: 'pipe',
    detached: process.platform !== 'win32',
  });
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
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    mkdirSync(path.resolve(root, outDir), { recursive: true });
    for (const az of azs) {
      await page.goto(`${baseUrl}thumbs.html?family=${family}&id=${id}&az=${az}&size=${size}${extra}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForFunction('window.__done === true', { timeout: 30000 });
      const err = await page.evaluate('window.__error');
      if (err) throw new Error(`${id} az${az}: ${err}`);
      const out = path.resolve(root, outDir, `${id}-az${az}.png`);
      await (await page.$('#c')).screenshot({ path: out, omitBackground: true });
      console.log(out);
    }
  } finally {
    await browser.close();
    killTree(vite);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
