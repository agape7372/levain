#!/usr/bin/env node
/**
 * 오픈소스 고지 생성 — 앱에 실려 나가는 패키지의 라이선스 전문을 public/licenses.txt 한 파일로 모은다.
 * 설정 > 오픈소스 라이선스가 이 파일을 그대로 보여준다(src/ui/components/settingsModal.ts).
 *
 *   node scripts/gen-licenses.mjs
 *
 * 의존성을 더하거나 올린 뒤 다시 돌려 커밋한다. 대상 = package.json dependencies(빌드 도구 제외).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
/** 기기에 실리지 않는 것 */
const BUILD_ONLY = new Set(['@capacitor/cli']);

/** npm 밖에서 온 것 — 전문은 각 주소에 있다(폰트는 파일 메타데이터에 라이선스가 들어 있다) */
const EXTRA = [
  ['Pretendard (글꼴)', 'SIL Open Font License 1.1', 'https://github.com/orioncactus/pretendard'],
  ['AndroidX · Android Gradle 구성 요소', 'Apache License 2.0', 'https://developer.android.com/jetpack/androidx'],
  ['Google Mobile Ads SDK', 'Google 약관', 'https://developers.google.com/admob/terms'],
];

const names = Object.keys(pkg.dependencies ?? {}).filter((n) => !BUILD_ONLY.has(n)).sort();
const head = ['르방이에 쓰인 오픈소스', ''];
const body = [];
for (const name of names) {
  const dir = path.join(root, 'node_modules', name);
  const meta = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const file = readdirSync(dir).find((f) => /^licen[cs]e(\.md|\.txt)?$/i.test(f));
  if (!file || !existsSync(path.join(dir, file))) {
    console.error(`라이선스 파일 없음: ${name}`);
    process.exit(1);
  }
  head.push(`${name} ${meta.version} · ${meta.license}`);
  body.push('', '────────────', `${name} ${meta.version}`, '', readFileSync(path.join(dir, file), 'utf8').trim());
}
for (const [name, license, url] of EXTRA) head.push(`${name} · ${license} · ${url}`);

const out = path.join(root, 'public', 'licenses.txt');
writeFileSync(out, [...head, ...body, ''].join('\n'));
console.log(`저장: public/licenses.txt (${names.length}개 패키지)`);
