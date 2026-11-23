// OTA 예비 서명 키 쌍 만들기 (vc5, docs/RELEASE.md §8 「키 둘」).
// 사용: node scripts/ota-keygen.mjs <개인 키를 쓸 경로 — 레포 밖>
// 개인 키(P-256 PKCS#8 PEM)는 그 경로에만 쓰고 화면엔 공개 키(SPKI base64)만 찍는다 → src/platform/ota.ts otaKeys 둘째 자리에 넣는다.
// 레포 안 경로 · 이미 있는 파일은 거부한다(키를 커밋하거나 덮어쓰지 않게).
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const arg = process.argv[2];
if (!arg) {
  console.error('사용: node scripts/ota-keygen.mjs <개인 키 경로(레포 밖)>');
  process.exit(1);
}
const out = path.resolve(arg);
const dir = path.dirname(out);
if (!existsSync(dir)) {
  console.error(`폴더가 없다: ${dir}`);
  process.exit(1);
}
// 정션 · 심볼릭 링크로 레포를 가리키는 폴더도 레포 안으로 본다
const rel = path.relative(root, path.join(realpathSync(dir), path.basename(out)));
// 본 레포 · 다른 워크트리 · 다른 git 레포 안도 거부 — 어느 작업 트리든 실수로 add될 수 있다
const inGit = spawnSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' }).stdout?.trim() === 'true';
if ((!rel.startsWith('..') && !path.isAbsolute(rel)) || inGit) {
  console.error(`레포(git 작업 트리) 안 경로는 거부한다: ${out} — 개인 키는 레포 밖 매체에 둔다`);
  process.exit(1);
}
if (existsSync(out)) {
  console.error(`이미 있다: ${out} — 덮어쓰지 않는다`);
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
writeFileSync(out, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
console.log(`개인 키 저장: ${out}`);
console.log('공개 키(SPKI base64) — src/platform/ota.ts otaKeys 둘째 자리에 넣는다:');
console.log(publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
