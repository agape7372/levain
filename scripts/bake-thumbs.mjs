// GLB → 썸네일 PNG 베이커 (빌드 타임, 로컬 전용 — CI 없음 원칙과 정합).
// 사용: npm run thumbs  (vite dev 서버를 스스로 띄우고 puppeteer로 512² 캡처)
// 전제: public/breads/<id>.glb 존재. 산출: public/breads/thumbs/<id>.png
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchBrowser } from './lib/launch-browser.mjs';

const IDS = ['pancake', 'cracker', 'scone', 'flatbread', 'focaccia', 'loaf', 'baguette', 'campagne', 'rye', 'wholewheat'];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5199;

async function main() {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    console.error('puppeteer가 없습니다: npm i -D puppeteer 후 다시 실행하세요.');
    process.exit(1);
  }

  const targets = IDS.filter((id) => existsSync(path.join(root, 'public', 'breads', `${id}.glb`)));
  if (targets.length === 0) {
    console.error('public/breads/*.glb 가 없습니다 — 파이프라인(이미지→generate_3d→최적화) 먼저.');
    process.exit(1);
  }
  mkdirSync(path.join(root, 'public', 'breads', 'thumbs'), { recursive: true });

  // 고정 포트는 잔존 프로세스에 취약 — 선호 포트만 주고 실제 URL은 배너에서 파싱
  const vite = spawn('npx', ['vite', '--port', String(PORT)], {
    cwd: root,
    shell: true,
    stdio: 'pipe',
  });
  let viteLog = '';
  vite.stdout.on('data', (d) => (viteLog += String(d)));
  vite.stderr.on('data', (d) => (viteLog += String(d)));
  const baseUrl = await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error(`vite dev 기동 시간 초과\n${viteLog}`)), 30000);
    vite.stdout.on('data', (d) => {
      // vite 배너의 "Local:"은 ANSI 코드가 끼어 있어 스트립 후 매치해야 한다
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
    await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
    for (const id of targets) {
      await page.goto(`${baseUrl}thumbs.html?id=${id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__done === true', { timeout: 20000 });
      const err = await page.evaluate('window.__error');
      if (err) {
        console.error(`✗ ${id}: ${err}`);
        continue;
      }
      const canvas = await page.$('#c');
      await canvas.screenshot({
        path: path.join(root, 'public', 'breads', 'thumbs', `${id}.png`),
        omitBackground: true,
      });
      console.log(`✓ ${id}`);
    }
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
