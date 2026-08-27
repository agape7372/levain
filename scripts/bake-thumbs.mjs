// GLB → 썸네일 PNG 베이커 (빌드 타임, 로컬 전용 — CI 없음 원칙과 정합).
// 사용: npm run thumbs              (빵 + 재료 전 패밀리)
//       npm run thumbs -- --family=ingredient   (한 패밀리만)
// 전제: public/<family>/<id>.glb 존재. 산출: public/<family>/thumbs/<id>.png
//
// ⚠ 대상 id는 **디렉터리 글롭**으로 잡는다(예전엔 하드코딩 배열이었다). 재료가 12 → 30종으로
//   자라는데 손으로 유지하는 목록은 그때마다 편집을 요구하고, 빠뜨리면 조용히 안 구워진다.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchBrowser } from './lib/launch-browser.mjs';
import { FAMILIES, FAMILY_KEYS } from './lib/families.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5199;

// --family 지정이 없으면 전 패밀리 (npm run thumbs 한 방으로 다 굽는다)
const flag = process.argv.find((a) => a.startsWith('--family='));
const targetKeys = flag ? [flag.slice('--family='.length)] : FAMILY_KEYS;
for (const k of targetKeys) {
  if (!FAMILIES[k]) {
    console.error(`알 수 없는 family: ${k} — 가능: ${FAMILY_KEYS.join(', ')}`);
    process.exit(1);
  }
}

/** public/<outDir>/*.glb 를 훑어 id 목록을 만든다. 디렉터리가 없으면 빈 배열. */
function idsOf(fam) {
  try {
    return readdirSync(path.join(root, 'public', fam.outDir))
      .filter((f) => f.endsWith('.glb'))
      .map((f) => f.slice(0, -'.glb'.length))
      .sort();
  } catch {
    return [];
  }
}

async function main() {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    console.error('puppeteer가 없습니다: npm i -D puppeteer 후 다시 실행하세요.');
    process.exit(1);
  }

  // [{ fam, id }] 평탄 목록 — 패밀리별로 GLB가 있는 것만
  const jobs = targetKeys.flatMap((k) => idsOf(FAMILIES[k]).map((id) => ({ fam: FAMILIES[k], id })));
  if (jobs.length === 0) {
    console.error(
      `대상 GLB 0개 (${targetKeys.join(', ')}) — export 먼저: npm run breads:export / npm run ingredients:export`,
    );
    process.exit(1);
  }
  for (const k of targetKeys) mkdirSync(path.join(root, 'public', FAMILIES[k].outDir, 'thumbs'), { recursive: true });

  // 고정 포트는 잔존 프로세스에 취약 — 선호 포트만 주고 실제 URL은 배너에서 파싱
  // POSIX에선 detached로 그룹 리더를 만들어야 killTree가 그룹째 죽일 수 있다
  const vite = spawn('npx', ['vite', '--port', String(PORT)], {
    cwd: root,
    shell: true,
    stdio: 'pipe',
    detached: process.platform !== 'win32',
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
    for (const { fam, id } of jobs) {
      await page.goto(`${baseUrl}thumbs.html?family=${fam.key}&id=${id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__done === true', { timeout: 20000 });
      const err = await page.evaluate('window.__error');
      if (err) {
        console.error(`✗ ${fam.key}/${id}: ${err}`);
        continue;
      }
      const canvas = await page.$('#c');
      await canvas.screenshot({
        path: path.join(root, 'public', fam.outDir, 'thumbs', `${id}.png`),
        omitBackground: true,
      });
      console.log(`✓ ${fam.key}/${id}`);
    }
  } finally {
    await browser.close();
    killTree(vite);
  }
}

// Windows에서 shell:true 자식의 kill()은 cmd 래퍼만 죽인다 — 프로세스 트리째 종료
// POSIX도 child.kill()은 sh 래퍼만 죽인다 — detached 그룹째(-pid) 죽인다.
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
