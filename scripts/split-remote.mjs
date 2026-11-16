// 빌드 후처리 — 원격 변형(families.isRemoteBread)의 GLB·썸네일을 dist에서 빼고 dist/remote-assets.json을 쓴다.
// package.json build의 마지막 단계. 호스트 폴더(ota/assets/)로 옮기는 건 ota-release.mjs 몫이다.
//
// 맵 = { "breads/<id>.glb": "<sha256 앞 10자>", "breads/thumbs/<id>.png": "…" } — 키 정렬이라 같은 소스면 같은 바이트.
// 해시는 public/ 원본으로 잰다(dist 복사본이 아니라 — 지난 빌드 잔재가 섞여도 맵이 흔들리지 않게).
// ★파일 단위 unlinkSync — 이 환경에선 rmSync 디렉터리 삭제가 조용히 실패한다(ota-release.mjs emptyDir 주석).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { isRemoteBread } from './lib/families.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** public/에서 원격 파일 맵을 만든다(읽기 전용, 키 정렬). */
export function buildRemoteMap(publicDir = path.join(root, 'public')) {
  const entries = [];
  const scan = (sub, ext) => {
    const dir = path.join(publicDir, sub);
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(ext) || !isRemoteBread(f.slice(0, -ext.length))) continue;
      const hash = createHash('sha256').update(readFileSync(path.join(dir, f))).digest('hex').slice(0, 10);
      entries.push([`${sub}/${f}`, hash]);
    }
  };
  scan('breads', '.glb');
  scan('breads/thumbs', '.png');
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries);
}

function main() {
  const dist = path.join(root, 'dist');
  const map = buildRemoteMap();
  // dist에 있는 원격 파일은 맵에 없더라도(지난 빌드 잔재) 전부 뺀다
  let removed = 0;
  for (const [sub, ext] of [['breads', '.glb'], ['breads/thumbs', '.png']]) {
    const dir = path.join(dist, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith(ext) && isRemoteBread(f.slice(0, -ext.length))) {
        unlinkSync(path.join(dir, f));
        removed++;
      }
    }
  }
  writeFileSync(path.join(dist, 'remote-assets.json'), JSON.stringify(map, null, 1) + '\n');
  const n = Object.keys(map).length;
  const glb = Object.keys(map).filter((k) => k.endsWith('.glb')).length;
  console.log(`split-remote: dist에서 ${removed}개 뺌 · remote-assets.json ${n}항목 (GLB ${glb} · 썸네일 ${n - glb})`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
