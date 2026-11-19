// 끊긴 뒤 더미 GLB 내보내기 — .work/blender/fx/dough_coil/raw.glb → public/fx/dough_coil.glb
// scripts/blender-export.mjs와 같은 방식(prune · dedup · meshopt). 재질 · 텍스처 · UV는 앱 셰이더가 안 쓰니 뺀다. 정점 색 COLOR_0(접힌 골 AO)은 남긴다.
// 사용: node scripts/blender/fx/export_glb.mjs
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = path.join(root, '.work/blender/fx/dough_coil/r2/raw.glb');
const out = path.join(root, 'public/fx/dough_coil.glb');

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);

for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    prim.setMaterial(null);
    for (const sem of prim.listSemantics()) if (sem !== 'POSITION' && sem !== 'NORMAL' && sem !== 'COLOR_0') prim.setAttribute(sem, null);
    for (const t of prim.listTargets()) {
      for (const sem of t.listSemantics()) if (sem !== 'POSITION' && sem !== 'NORMAL') t.setAttribute(sem, null);
    }
  }
}
await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(out, doc);

// 다시 읽어 확인 — 모프 수 · 이름 · tri · 바이트
const back = await io.read(out);
const col = (() => {
  const a = back.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('COLOR_0');
  if (!a) return null;
  let lo = 9, sum = 0, hi = 0; const n = a.getCount(); const e = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) { a.getElement(i, e); lo = Math.min(lo, e[0]); hi = Math.max(hi, e[0]); sum += e[0]; }
  return { min: +lo.toFixed(3), mean: +(sum / n).toFixed(3), max: +hi.toFixed(3), type: a.getType() };
})();
const m = back.getRoot().listMeshes()[0];
const p = m.listPrimitives()[0];
const tris = p.getIndices().getCount() / 3;
const names = m.getExtras()?.targetNames ?? null;
console.log(JSON.stringify({
  bytes: statSync(out).size,
  meshes: back.getRoot().listMeshes().length,
  prims: m.listPrimitives().length,
  targets: p.listTargets().length,
  targetNames: names,
  tris,
  verts: p.getAttribute('POSITION').getCount(),
  attrs: p.listSemantics(),
  targetAttrs: p.listTargets()[0]?.listSemantics(),
  materials: back.getRoot().listMaterials().length,
  rawBytes: readFileSync(src).length,
  color0: col,
}));
