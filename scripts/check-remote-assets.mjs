// 배포 확인 — 원격 변형 자산이 호스트에 다 떴는지 HEAD로 잰다. 사용(배포 뒤):
//   node scripts/check-remote-assets.mjs [--base=URL] [--map=path]
// 기본 맵 = dist/remote-assets.json(방금 릴리스한 판), 기본 base = 앱에 박힌 ASSET_BASE.
// 원격 404는 앱에서 조용히 베이스 빵으로 물러나 아무도 모른다 — 그래서 하나라도 200이 아니면 exit 1.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { hashedPath } from './lib/families.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def;
const base = arg('base', 'https://levain-ota.vercel.app/assets').replace(/\/$/, '');
const mapPath = path.resolve(root, arg('map', 'dist/remote-assets.json'));

const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const urls = Object.entries(map).map(([key, hash]) => `${base}/${hashedPath(key, hash)}`);

const bad = [];
let next = 0;
async function worker() {
  while (next < urls.length) {
    const url = urls[next++];
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.status !== 200) bad.push(`${res.status} ${url}`);
    } catch (e) {
      bad.push(`ERR ${url} (${e?.cause?.code ?? e?.message ?? e})`);
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

for (const b of bad) console.log(b);
console.log(`원격 자산 ${urls.length}개 중 실패 ${bad.length}개 (${base})`);
process.exit(bad.length > 0 ? 1 : 0);
