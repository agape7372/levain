// OTA 릴리스 패키저 — dist/를 빌드·zip으로 묶어 ota/bundles·manifest.json·history.json에 배치.
// 묶음 밖 원격 변형 GLB·썸네일은 ota/assets/(해시 이름 + maps/<version>.json)로 복사한다(아래 「원격 변형 자산」).
// 사용: npm run ota:release -- <version> [--dry-run] [--min-native=X.Y]
// 예: npm run ota:release -- 1.1.0
// 배포(vercel)는 이 스크립트가 하지 않는다 — 마지막에 안내만 출력, 실행은 사람 몫.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, rmSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collectFiles, makeZip } from './lib/zip.mjs';
import { hashedPath } from './lib/families.mjs';
import { OTA_KEY, OTA_RESERVE, distKeys, pairProblem, signManifest, verifyManifest } from './ota-sign.mjs';

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

// 판 목록 서명(scripts/ota-sign.mjs, 2026-11-18): 키가 없으면 판을 못 낸다 — 서명 없는 판은 서명을 보는 앱이 안 받는다.
// 짝 확인은 빌드 뒤 · 쓰기 전에 **빌드된 dist에서 꺼낸 키 목록**으로 한다(vc5, 소스 ota.ts가 아니라 폰이 받는 묶음 기준).
// dist에 공개 키가 둘 없거나 예비 키 자리표시가 남았거나 짝이 안 맞으면 멈춘다. 공개 키가 없는 옛 코드도 여기서 멈춘다
// → 서명 바닥 판보다 옛 코드를 「더 높은 버전 재발행」으로 되돌려 내보내는 길이 막힌다(냥수제비 FLOOR와 같은 몫, docs/RELEASE.md §8).
if (!existsSync(OTA_KEY)) {
  console.error(`OTA 서명 키 없음: ${OTA_KEY} → 백업(D:\\keys\\backup-keys.ps1)에서 되살리거나 예비 키(LEVAIN_OTA_RESERVE_KEY)로 서명한다`);
  process.exit(1);
}
if (OTA_RESERVE) console.log(`★예비 키로 서명한다: ${OTA_KEY} (LEVAIN_OTA_RESERVE_KEY)`);
const otaPem = readFileSync(OTA_KEY, 'utf8');
let appKeys = []; // 빌드 뒤 dist에서 채운다
function signed(m) {
  const s = signManifest(m, otaPem);
  if (!appKeys.some((k) => verifyManifest(s, k))) {
    console.error('OTA 서명이 묶음(dist) 공개 키와 짝이 안 맞는다 → 멈춤');
    process.exit(1);
  }
  return s;
}

const historyPath = path.join(root, 'ota', 'history.json');
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

/** history에서 가장 높은 버전 — 없으면 null */
function latestVersion(entries) {
  const vs = entries.map((e) => e?.version).filter((v) => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v));
  return vs.sort(compareSemver).at(-1) ?? null;
}

// 같은 버전 재발행·다운그레이드 거부 — 기기는 지금 버전 이하 매니페스트를 무시하므로 아무에게도 가지 않는다(감사 T3-13)
const latest = latestVersion(history);
if (latest && compareSemver(version, latest) <= 0) {
  console.error(`${version}은 이미 발행된 최신 ${latest}보다 높지 않습니다 — 더 높은 버전으로 발행하세요.`);
  if (!dryRun) process.exit(1); // dry-run은 아무것도 쓰지 않으니 경고만
}

// APP_VERSION 단일 출처(2026-09-03) — 수동 계좌 드리프트(1.3.7 vs 1.3.9 실사고) 방지
const pkgPath = path.join(root, 'package.json');
const pkgOrig = readFileSync(pkgPath, 'utf8'); // 짝 확인에서 멈추면 되돌린다
if (!dryRun) {
  const pkg = JSON.parse(pkgOrig);
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

// 짝 확인(빌드 뒤 · 쓰기 전) — 어긋난 판이 나가면 모든 앱이 OTA를 못 받고 새 AAB로만 고친다
{
  const problem = pairProblem(otaPem, distDir);
  if (problem) {
    console.error(`짝 확인 실패: ${problem} → 멈춤`);
    if (!dryRun) writeFileSync(pkgPath, pkgOrig);
    process.exit(1);
  }
  appKeys = distKeys(distDir).keys;
  console.log(`짝 확인: 묶음 공개 키 ${appKeys.length}개 중 하나와 맞음`);
}

// ── 원격 변형 자산 (2026-11-16) — split-remote.mjs가 dist에서 뺀 GLB·썸네일을 호스트 폴더 ota/assets/로 ──
// 파일명에 내용 해시가 붙어 1년 immutable로 서빙된다(vercel.json). 같은 이름이 있으면 같은 내용이라 건너뛴다.
// 판마다 맵을 maps/<version>.json에 남기고, 최근 KEEP개 판의 맵이 가리키는 파일만 둔다
// (ota/bundles와 같은 수 — 그보다 옛 판으로 롤백할 일은 없다: 롤백은 새 버전 재발행뿐).
{
  const mapPath = path.join(distDir, 'remote-assets.json');
  if (!existsSync(mapPath)) {
    console.error('dist/remote-assets.json 없음 — build의 split-remote 단계를 확인하세요.');
    process.exit(1);
  }
  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  const assetsDir = path.join(root, 'ota', 'assets');
  const mapsDir = path.join(assetsDir, 'maps');
  const toCopy = [];
  for (const [key, hash] of Object.entries(map)) {
    const dst = path.join(assetsDir, hashedPath(key, hash));
    if (!existsSync(dst)) toCopy.push({ src: path.join(root, 'public', key), dst });
  }
  // 남길 판 = 지난 맵들 + 이번 판 중 최신 KEEP개
  const oldMaps = existsSync(mapsDir)
    ? readdirSync(mapsDir).filter((f) => /^\d+\.\d+\.\d+\.json$/.test(f)).map((f) => f.slice(0, -5))
    : [];
  const keepVersions = [...new Set([...oldMaps, version])].sort(compareSemver).slice(-KEEP);
  const keepFiles = new Set();
  for (const v of keepVersions) {
    const m = v === version ? map : JSON.parse(readFileSync(path.join(mapsDir, `${v}.json`), 'utf8'));
    for (const [key, hash] of Object.entries(m)) keepFiles.add(path.join(assetsDir, hashedPath(key, hash)));
  }
  const toPrune = [];
  for (const sub of ['breads', path.join('breads', 'thumbs')]) {
    const dir = path.join(assetsDir, sub);
    if (!existsSync(dir)) continue;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isFile() && !keepFiles.has(p)) toPrune.push(p);
    }
  }
  const staleMaps = oldMaps.filter((v) => !keepVersions.includes(v));
  const copyBytes = toCopy.reduce((s, c) => s + statSync(c.src).size, 0);
  console.log(
    `ota/assets: 맵 ${Object.keys(map).length}항목 · 새로 복사 ${toCopy.length}개(${(copyBytes / 1048576).toFixed(2)}MB)` +
      ` · 정리 ${toPrune.length}개 · 옛 맵 ${staleMaps.length}개 · 남길 판 ${keepVersions.join(', ')}`,
  );
  if (dryRun) {
    for (const p of toPrune) console.log(`  (dry-run) 정리 대상: ${path.relative(root, p)}`);
  } else {
    for (const { src, dst } of toCopy) {
      mkdirSync(path.dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
    mkdirSync(mapsDir, { recursive: true });
    writeFileSync(path.join(mapsDir, `${version}.json`), JSON.stringify(map, null, 1) + '\n');
    for (const p of toPrune) unlinkSync(p);
    for (const v of staleMaps) unlinkSync(path.join(mapsDir, `${v}.json`));
  }
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
const manifest = signed({
  version,
  url: `${base}/bundles/${version}.zip`,
  checksum,
  size,
  releasedAt: new Date().toISOString(),
  minNative,
});

const otaDir = path.join(root, 'ota');
// 지금 manifest에 sig가 없으면 이번이 첫 서명 판 — 그보다 옛 코드엔 서명 확인이 없다
let firstSigned = true;
try {
  firstSigned = typeof JSON.parse(readFileSync(path.join(otaDir, 'manifest.json'), 'utf8')).sig !== 'string';
} catch {
  /* manifest 없음 = 처음 */
}
const bundlesDir = path.join(otaDir, 'bundles');
mkdirSync(bundlesDir, { recursive: true });

const bundlePath = path.join(bundlesDir, `${version}.zip`);
writeFileSync(bundlePath, zipBuf);
console.log(`저장: ${path.relative(root, bundlePath)}`);

writeFileSync(path.join(otaDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('저장: ota/manifest.json');

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
if (firstSigned) {
  console.log(`첫 서명 판 ${version}: docs/RELEASE.md §8 「서명 바닥 판」을 ${version}으로 적어 커밋한다(그 전 묶음엔 서명 확인이 없다).`);
}
console.log('다음: cd ota && npx vercel --prod --scope jirings-projects');
console.log('배포 뒤: node scripts/check-remote-assets.mjs   (원격 빵 파일이 다 떴는지 — 404면 앱은 조용히 베이스로 물러난다)');
