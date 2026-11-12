/**
 * QA 픽스처 굽기 — vite의 ssrLoadModule로 make-fixtures.ts(실제 store·sim 사용)를 실행해
 * scripts/qa/fixtures/<id>.json 으로 쓴다. 사용: node scripts/qa/make-fixtures.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'scripts', 'qa', 'fixtures');
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true },
});
try {
  const mod = await server.ssrLoadModule('/scripts/qa/make-fixtures.ts');
  const all = mod.buildFixtures();
  const meta = { qaNow: mod.QA_NOW, fixtures: {} };
  for (const [id, f] of Object.entries(all)) {
    writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(f.save));
    meta.fixtures[id] = f.desc;
    const st = f.save.starters;
    console.log(id, `르방 ${st.length}개`, `통 ${f.save.shared.pantry}g`, `도감 ${Object.keys(f.save.shared.collection).length}`, f.desc);
  }
  writeFileSync(path.join(outDir, '_meta.json'), JSON.stringify(meta, null, 2));
} finally {
  await server.close();
}
