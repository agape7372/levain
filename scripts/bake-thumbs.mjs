// GLB → 썸네일 PNG 베이커 (빌드 타임, 로컬 전용 — CI 없음 원칙과 정합).
// 사용: npm run thumbs  (vite dev 서버를 스스로 띄우고 puppeteer로 512² 캡처)
// 전제: public/breads/<id>.glb 존재. 산출: public/breads/thumbs/<id>.png
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: root,
    shell: true,
    stdio: 'pipe',
  });
  await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('vite dev 기동 시간 초과')), 30000);
    vite.stdout.on('data', (d) => {
      if (String(d).includes('Local:')) {
        clearTimeout(to);
        res();
      }
    });
    vite.on('exit', () => rej(new Error('vite dev가 죽었습니다')));
  });

  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
    for (const id of targets) {
      await page.goto(`http://localhost:${PORT}/thumbs.html?id=${id}`, { waitUntil: 'domcontentloaded' });
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
    vite.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
