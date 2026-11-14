// Blender 빵 GLB 내보내기 — scripts/blender/breads/<id>.py → public/breads/<id>.glb (docs/BREADS.md §Blender).
// 사용: npm run breads:blender -- <id…>
//   1) Blender 헤드리스 모델링·굽기 → .work/blender/<id>/raw.glb (+ 굽기 PNG · stats.json)
//   2) glTF Transform 정리 + meshopt(양자화 포함) → public/breads/<id>.glb  (런타임 디코더는 이미 실려 있다)
// Blender 위치 = 환경변수 BLENDER, 없으면 기본 설치 경로(5.1).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLENDER = process.env.BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe';
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (ids.length === 0) {
  console.error('사용법: npm run breads:blender -- <id…>  (scripts/blender/breads/<id>.py)');
  process.exit(1);
}
if (!existsSync(BLENDER)) {
  console.error(`Blender 없음: ${BLENDER} — 환경변수 BLENDER로 경로를 주세요`);
  process.exit(1);
}

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

let fail = false;
for (const id of ids) {
  const work = path.join(root, '.work', 'blender', id);
  mkdirSync(work, { recursive: true });
  try {
    // --python-exit-code: 스크립트 예외를 종료 코드로 (없으면 Blender는 예외 뒤에도 0으로 끝난다)
    execFileSync(
      BLENDER,
      ['-b', '--factory-startup', '--python-exit-code', '1', '-P', path.join(root, 'scripts/blender/run.py'), '--', id, work],
      { stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (e) {
    console.error(`✗ ${id}: Blender 실패 (exit ${e.status})`);
    fail = true;
    continue;
  }
  const stats = JSON.parse(readFileSync(path.join(work, 'stats.json'), 'utf8'));
  const doc = await io.read(path.join(work, 'raw.glb'));
  await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(root, 'public', 'breads', `${id}.glb`);
  await io.write(out, doc);
  const kb = statSync(out).size / 1024;
  console.log(`✓ ${id}  ${kb.toFixed(0)}KB (raw ${(stats.bytes / 1024).toFixed(0)}KB)  ${stats.tris}tri  ${stats.seconds}s`);
}
process.exit(fail ? 1 : 0);
