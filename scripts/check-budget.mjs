// GLB 예산 검사 — 개당 ≤250KB, 합계 ≤2.5MB, 트라이앵글 ≤8k (VISUAL §8 개정 예산).
// 사용: npm run check-budget
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'breads');
const PER_KB = 250;
const TOTAL_KB = 2560;
const MAX_TRI = 8000;

function triCount(file) {
  // GLB: 12B 헤더 → JSON 청크(길이·타입 'JSON') — accessors/meshes에서 인덱스 수 합산
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) return null; // 'glTF'
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  let tris = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.indices !== undefined) tris += (json.accessors[prim.indices].count ?? 0) / 3;
      else if (prim.attributes?.POSITION !== undefined) tris += (json.accessors[prim.attributes.POSITION].count ?? 0) / 3;
    }
  }
  return Math.round(tris);
}

let files;
try {
  files = readdirSync(dir).filter((f) => f.endsWith('.glb'));
} catch {
  console.error(`${dir} 없음 — GLB가 아직 없습니다.`);
  process.exit(1);
}
if (files.length === 0) {
  console.error('GLB 0개 — 파이프라인 먼저.');
  process.exit(1);
}

let total = 0;
let fail = false;
for (const f of files) {
  const p = path.join(dir, f);
  const kb = statSync(p).size / 1024;
  total += kb;
  const tris = triCount(p);
  const overSize = kb > PER_KB;
  const overTri = tris !== null && tris > MAX_TRI;
  if (overSize || overTri) fail = true;
  console.log(
    `${overSize || overTri ? '✗' : '✓'} ${f}  ${kb.toFixed(0)}KB${overSize ? ` > ${PER_KB}KB` : ''}` +
      (tris !== null ? `  ${tris}tri${overTri ? ` > ${MAX_TRI}` : ''}` : ''),
  );
}
console.log(`합계 ${total.toFixed(0)}KB / ${TOTAL_KB}KB`);
if (total > TOTAL_KB) fail = true;
process.exit(fail ? 1 : 0);
