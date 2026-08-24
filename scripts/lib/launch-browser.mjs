// puppeteer 브라우저 기동 헬퍼 — 손상 캐시 폴백 포함.
// 배경: 이 PC에서 chrome@152 캐시의 chrome.exe가 0바이트로 반복 손상됨(디펜더 추정).
// 기본 launch가 EFTYPE 등으로 실패하면 캐시에서 크기>0인 chrome.exe 중 최신을 골라 재시도한다.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export async function launchBrowser(puppeteer, options = {}) {
  try {
    return await puppeteer.launch({ headless: true, ...options });
  } catch (first) {
    const exe = findIntactChrome();
    if (!exe) throw first;
    console.warn(`기본 Chrome 기동 실패 — 캐시 폴백 사용: ${exe}`);
    return puppeteer.launch({ headless: true, ...options, executablePath: exe });
  }
}

function findIntactChrome() {
  const base = path.join(homedir(), '.cache', 'puppeteer', 'chrome');
  if (!existsSync(base)) return null;
  const candidates = [];
  for (const dir of readdirSync(base)) {
    const exe = path.join(base, dir, 'chrome-win64', 'chrome.exe');
    try {
      if (statSync(exe).size > 0) candidates.push({ dir, exe });
    } catch {
      /* 없음 — 스킵 */
    }
  }
  // 버전 디렉터리명(win64-<semverish>) 내림차순 — 멀쩡한 것 중 최신
  candidates.sort((a, b) => b.dir.localeCompare(a.dir, undefined, { numeric: true }));
  return candidates[0]?.exe ?? null;
}
