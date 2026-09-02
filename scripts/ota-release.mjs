// OTA 릴리스 패키저 — dist/를 빌드·zip으로 묶어 ota/bundles·manifest.json·history.json에 배치.
// 사용: npm run ota:release -- <version> [--dry-run] [--min-native=X.Y]
// 예: npm run ota:release -- 1.1.0
// 배포(vercel)는 이 스크립트가 하지 않는다 — 마지막에 안내만 출력, 실행은 사람 몫.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collectFiles, makeZip } from './lib/zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BASE = 'https://levain-ota.vercel.app';
const KEEP = 4; // ota/bundles/에 남길 최근 번들 수

function usage() {
  console.error('사용: npm run ota:release -- <version> [--dry-run] [--min-native=X.Y]');
  console.error('예:   npm run ota:release -- 1.1.0');
}

function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const minNativeArg = args.find((a) => a.startsWith('--min-native='));
const minNative = minNativeArg ? minNativeArg.slice('--min-native='.length) : '1.0';

if (!version) {
  usage();
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`버전 형식이 잘못됐습니다: "${version}" (semver 예: 1.1.0)`);
  process.exit(1);
}

// APP_VERSION 단일 출처(2026-09-03) — 수동 계좌 드리프트(1.3.7 vs 1.3.9 실사고) 방지
if (!dryRun) {
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`package.json version → ${version}`);
}

// ★dist/를 먼저 비운다 — 빌드가 스스로 비우지 않는다.
//
// 산출물 파일명이 내용 해시라 빌드마다 새 이름이 생기고 옛 파일은 **그대로 남는다.**
// index.html은 최신 진입점 하나만 가리키므로 앱은 정상 동작하지만, zip은 디렉터리를 통째로
// 담으므로 죽은 코드가 전부 실려 나간다. 실측(1.3.3 발행 전): dist/assets 449개 중 진짜
// 산출물은 **9개**(깨끗한 디렉터리로 빌드해 대조), 나머지 440개 42.6MB가 누적분이었다.
// 1.2.4~1.3.2 네 번의 릴리스가 이 상태로 나갔다 — 사용자가 매번 안 쓰는 JS를 같이 내려받았다.
//
// ★**디렉터리째 지우지 않는다.** 이 환경에서 `rmSync(dist, {recursive:true, force:true})`는
// **에러 없이 실패한다**(호출 직후 `existsSync`가 여전히 true). vite의 `emptyOutDir`도 같은
// 이유로 안 먹는다. 파일 단위 `unlinkSync`는 전부 성공하므로, 디렉터리는 남기고 **내용만** 비운다.
// 조용히 실패하는 경로라 마지막에 잔존 수를 세서 확인한다 — 안 세면 다음 사람이 또 속는다.
function emptyDir(dir) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      n += emptyDir(p);
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {
        /* 디렉터리 제거는 막힐 수 있다 — 내용만 비면 충분하다 */
      }
    } else {
      unlinkSync(p);
      n++;
    }
  }
  return n;
}
const distPath = path.join(root, 'dist');
console.log(`dist/ 정리: 파일 ${emptyDir(distPath)}개 삭제`);
const leftover = existsSync(distPath) ? collectFiles(distPath).length : 0;
if (leftover > 0) {
  console.error(`dist/ 에 ${leftover}개가 남았습니다 — 지난 빌드 산출물이 번들에 섞입니다.`);
  console.error('열려 있는 dev 서버(npm run dev)나 파일 잠금을 확인하고 다시 실행하세요.');
  process.exit(1);
}

console.log('빌드: npm run build');
const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
if (build.status !== 0) {
  console.error('빌드 실패 — 릴리스를 중단합니다.');
  process.exit(1);
}

const distDir = path.join(root, 'dist');
if (!existsSync(distDir)) {
  console.error('dist/ 없음 — 빌드가 산출물을 만들지 않았습니다.');
  process.exit(1);
}

const files = collectFiles(distDir);
if (files.length === 0) {
  console.error('dist/ 가 비어 있습니다.');
  process.exit(1);
}
if (!files.some((f) => f.name === 'index.html')) {
  console.error('zip 루트에 index.html이 없습니다 — dist/ 구조를 확인하세요.');
  process.exit(1);
}

const zipBuf = makeZip(files);
const checksum = createHash('sha256').update(zipBuf).digest('hex');
const size = zipBuf.length;

console.log(`zip 완료: 파일 ${files.length}개, ${size.toLocaleString('en-US')}bytes`);
console.log(`sha256: ${checksum}`);

if (dryRun) {
  console.log('--dry-run: 파일 쓰기는 생략합니다.');
  process.exit(0);
}

const base = process.env.LEVAIN_OTA_BASE || DEFAULT_BASE;
const manifest = {
  version,
  url: `${base}/bundles/${version}.zip`,
  checksum,
  size,
  releasedAt: new Date().toISOString(),
  minNative,
};

const otaDir = path.join(root, 'ota');
const bundlesDir = path.join(otaDir, 'bundles');
mkdirSync(bundlesDir, { recursive: true });

const bundlePath = path.join(bundlesDir, `${version}.zip`);
writeFileSync(bundlePath, zipBuf);
console.log(`저장: ${path.relative(root, bundlePath)}`);

writeFileSync(path.join(otaDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('저장: ota/manifest.json');

const historyPath = path.join(otaDir, 'history.json');
let history = [];
if (existsSync(historyPath)) {
  try {
    const parsed = JSON.parse(readFileSync(historyPath, 'utf8'));
    if (Array.isArray(parsed)) history = parsed;
    else console.error('ota/history.json이 배열이 아닙니다 — 새로 시작합니다.');
  } catch {
    console.error('ota/history.json 파싱 실패 — 새로 시작합니다.');
  }
}
history.push(manifest);
writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n');
console.log('저장: ota/history.json');

// 오래된 번들 정리 — 파일명 버전(semver) 정렬 기준으로 최신 KEEP개만 남긴다.
const zips = readdirSync(bundlesDir).filter((f) => f.endsWith('.zip'));
if (zips.length > KEEP) {
  const sorted = zips.sort((a, b) => compareSemver(a.replace(/\.zip$/, ''), b.replace(/\.zip$/, '')));
  const toDelete = sorted.slice(0, sorted.length - KEEP);
  for (const f of toDelete) unlinkSync(path.join(bundlesDir, f));
  console.log(`정리: ${toDelete.join(', ')} 삭제`);
}

console.log('');
console.log('다음: cd ota && npx vercel --prod --scope jirings-projects');
