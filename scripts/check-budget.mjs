// GLB 예산 검사 — 패밀리별 상한 (VISUAL §8). 사용: npm run check-budget
//
// 예산 정본 = scripts/lib/families.mjs. 빵은 베이스 10종 + 변형(유한한 호환성 규칙 수만큼)이라
// 고정 합계(8192KB = OTA 묶음 몫, families.mjs §빵 예산 개정), 재료는 12 → 30종으로 자라니 **개수 비례**(160KB/개)로 잰다 — 고정 상수면
// 재료가 늘 때마다 손으로 올리게 되고 그건 예산을 지킨 게 아니라 예산을 결과에 맞춘 것이다.
// 빵 합계는 묶음 안 것만 센다(2026-11-16) — 원격 변형(families.isRemoteBread)은 개당 상한만 보고 합계는 참고로 찍는다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FAMILIES, FAMILY_KEYS, isRemoteBread } from './lib/families.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

let fail = false;
let checked = 0;

for (const famKey of FAMILY_KEYS) {
  const fam = FAMILIES[famKey];
  const dir = path.join(root, 'public', fam.outDir);
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.glb'));
  } catch {
    // 아직 GLB가 없는 패밀리는 건너뛴다 — 재료 파이프라인 구축 중에 빵 검사가 막히면 안 된다
    console.log(`— ${famKey}: public/${fam.outDir}/ 없음 (건너뜀)`);
    continue;
  }
  if (files.length === 0) {
    console.log(`— ${famKey}: GLB 0개 (건너뜀)`);
    continue;
  }
  checked += files.length;

  let total = 0;
  let remoteTotal = 0;
  let remoteCount = 0;
  for (const f of files) {
    const p = path.join(dir, f);
    const kb = statSync(p).size / 1024;
    // 원격 변형(묶음 밖)은 개당 상한만 — 합계는 OTA 묶음 몫이라 묶음 안 것만 센다(families.mjs §묶음 안 / 원격)
    const remote = famKey === 'bread' && isRemoteBread(f.slice(0, -'.glb'.length));
    if (remote) {
      remoteTotal += kb;
      remoteCount++;
    } else total += kb;
    const tris = triCount(p);
    const overSize = kb > fam.perKB;
    const overTri = tris !== null && tris > fam.maxTri;
    if (overSize || overTri) fail = true;
    console.log(
      `${overSize || overTri ? '✗' : '✓'} ${famKey}/${f}  ${kb.toFixed(0)}KB${overSize ? ` > ${fam.perKB}KB` : ''}` +
        (tris !== null ? `  ${tris}tri${overTri ? ` > ${fam.maxTri}` : ''}` : ''),
    );
  }

  // 고정 합계(닫힌 집합) 또는 개수 비례(자라는 집합)
  const cap = fam.totalKB ?? fam.perItemKB * files.length;
  const capLabel = fam.totalKB ? `${cap}KB` : `${cap}KB (${fam.perItemKB}KB × ${files.length}종)`;
  const overTotal = total > cap;
  if (overTotal) fail = true;
  const scope = remoteCount > 0 ? `(묶음 안 ${files.length - remoteCount}종)` : '';
  console.log(`${overTotal ? '✗' : '✓'} ${famKey} 합계${scope} ${total.toFixed(0)}KB / ${capLabel}`);
  if (remoteCount > 0) console.log(`  참고: 원격 ${remoteCount}종 ${(remoteTotal / 1024).toFixed(1)}MB (합계 상한 없음)`);
  console.log('');
}

if (checked === 0) {
  console.error('전 패밀리 GLB 0개 — 파이프라인 먼저.');
  process.exit(1);
}
process.exit(fail ? 1 : 0);
