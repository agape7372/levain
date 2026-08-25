// 빌더 → GLB 배치 내보내기 (bake-thumbs.mjs 패턴 — vite dev + puppeteer).
// 사용: npm run breads:export [-- id1 id2 …]        (빵. 인자 없으면 등록된 전부)
//       npm run ingredients:export [-- id1 id2 …]   (재료)
// GLTFExporter가 canvas/blob API에 의존해 Node 직접 실행 불가 — 브라우저 경유가 정본.
// 산출: public/<family>/<id>.glb  → 이후 npm run check-budget → npm run thumbs
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchBrowser } from './lib/launch-browser.mjs';
import { familyFromArgv, idsFromArgv } from './lib/families.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5198;
const family = familyFromArgv(process.argv.slice(2));

async function main() {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    console.error('puppeteer가 없습니다: npm i -D puppeteer 후 다시 실행하세요.');
    process.exit(1);
  }

  const wanted = idsFromArgv(process.argv.slice(2));
  const spec = wanted.length > 0 ? wanted.join(',') : 'all';

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
  let failed = false;
  try {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}breadlab.html?family=${family.key}&export=${encodeURIComponent(spec)}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction('window.__done === true', { timeout: 60000 });
    const err = await page.evaluate('window.__error');
    if (err) {
      console.error(`✗ 빌더 오류:\n${err}`);
      failed = true;
    }
    const glbs = await page.evaluate('window.__glbs');
    const entries = Object.entries(glbs ?? {});
    if (entries.length === 0) {
      const reg = family.key === 'ingredient' ? 'scripts/ingredients/index.ts' : 'scripts/breads/index.ts';
      console.error(`산출 GLB 0개 — 레지스트리(${reg})에 빌더가 등록됐는지 확인.`);
      process.exit(1);
    }
    mkdirSync(path.join(root, 'public', family.outDir), { recursive: true });
    for (const [id, b64] of entries) {
      const buf = Buffer.from(b64, 'base64');
      writeFileSync(path.join(root, 'public', family.outDir, `${id}.glb`), buf);
      const kb = buf.length / 1024;
      console.log(`${kb > family.perKB ? '✗' : '✓'} ${family.key}/${id}.glb ${kb.toFixed(1)}KB / ${family.perKB}KB`);
    }
  } finally {
    await browser.close();
    killTree(vite);
  }
  if (failed) process.exit(1);
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
