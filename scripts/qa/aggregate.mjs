/**
 * qa-shots의 metrics.json을 집계해 결함 표(마크다운)를 stdout으로 낸다.
 * 사용: node scripts/qa/aggregate.mjs <outDir> [--min=N]   (같은 항목이 N개 이상의 화면에서 나온 것만 위로)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? 'work/qa-shots');
const data = JSON.parse(readFileSync(path.join(dir, 'metrics.json'), 'utf8'));
const shots = data.shots;

const group = (items, keyFn) => {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!m.has(k)) m.set(k, { item: it, screens: new Set(), vps: new Set(), fx: new Set(), n: 0 });
    const g = m.get(k);
    g.screens.add(it.__screen);
    g.vps.add(it.__vp);
    g.fx.add(it.__fx);
    g.n += 1;
  }
  return [...m.values()].sort((a, b) => b.screens.size - a.screens.size || b.n - a.n);
};
const tag = (s, arr) => (arr ?? []).map((x) => ({ ...x, __screen: s.screen, __vp: s.viewport, __fx: s.fixture }));
const collect = (pick) => shots.flatMap((s) => tag(s, pick(s)));
const list = (set) => [...set].sort().join(',');
const row = (cells) => `| ${cells.join(' | ')} |`;

const ok = shots.filter((s) => s.status === 'ok');
const failed = shots.filter((s) => s.status !== 'ok');
console.log(`# qa-shots 집계 (${dir})`);
console.log(`- 캡처 ${ok.length}장 · 실패 ${failed.length}건 · 글자배율 ${data.meta.textzoom} · 모션감소 ${data.meta.reducedMotion}`);
console.log(`- 뷰포트: ${list(new Set(shots.map((s) => s.viewport)))} · 픽스처: ${list(new Set(shots.map((s) => s.fixture)))}\n`);

console.log('## 화면 진입 실패');
if (failed.length === 0) console.log('없음\n');
else {
  console.log(row(['픽스처', '뷰포트', '화면', '오류']), '\n| - | - | - | - |');
  for (const f of failed) console.log(row([f.fixture, f.viewport, f.screen, String(f.error).replace(/\|/g, '/').slice(0, 120)]));
  console.log();
}

const section = (title, items, keyFn, fmt, limit = 40) => {
  const g = group(items, keyFn);
  console.log(`## ${title} (고유 ${g.length}건)`);
  if (g.length === 0) { console.log('없음\n'); return; }
  console.log(row(['항목', '값', '화면 수', '뷰포트', '픽스처']), '\n| - | - | - | - | - |');
  for (const x of g.slice(0, limit)) console.log(row([...fmt(x.item), x.screens.size, list(x.vps), list(x.fx)]));
  if (g.length > limit) console.log(`… 외 ${g.length - limit}건`);
  console.log();
};

section('13px 미만 글자(숫자 pill 제외)', collect((s) => s.metrics?.smallText).filter((x) => !x.numeric),
  (x) => `${x.sel}|${x.text}|${x.size}`, (x) => [`\`${x.sel}\` "${x.text}"`, `${x.size}px`]);
section('13px 미만 숫자 pill(12px 허용 규약)', collect((s) => s.metrics?.smallText).filter((x) => x.numeric),
  (x) => `${x.sel}|${x.size}`, (x) => [`\`${x.sel}\` "${x.text}"`, `${x.size}px`], 8);
section('탭 대상 44×44 미만', collect((s) => s.metrics?.tap),
  (x) => `${x.sel}|${x.w}|${x.h}`, (x) => [`\`${x.sel}\` "${x.text}"`, `${x.w}×${x.h}`]);
section('가로 넘침 (scrollWidth > clientWidth)', collect((s) => s.metrics?.hscroll),
  (x) => `${x.sel}|${x.sw}|${x.cw}`, (x) => [`\`${x.sel}\``, `${x.sw}>${x.cw}`]);
section('화면 밖으로 나간 요소', collect((s) => s.metrics?.offscreen),
  (x) => `${x.sel}|${x.left}|${x.right}`, (x) => [`\`${x.sel}\` "${x.text}"`, `${x.left}~${x.right}`]);
section('잘린 글자 (overflow hidden + 넘침)', collect((s) => s.metrics?.clip),
  (x) => `${x.sel}|${x.text}`, (x) => [`\`${x.sel}\` "${x.text}"`, `${x.sw}x${x.sh}/${x.cw}x${x.ch}${x.ellipsis ? ' ellipsis' : ''}${x.lineClamp ? ' clamp' : ''}`]);
section('대비 4.5:1(큰 글자 3:1) 미만', collect((s) => s.metrics?.contrast),
  (x) => `${x.sel}|${x.ratio}`, (x) => [`\`${x.sel}\` "${x.text}"${x.approx ? ' (배경 근사)' : ''}`, `${x.ratio}:1 (${x.size}px)`], 60);
section('콘솔 오류·경고·요청 실패', collect((s) => s.console),
  (x) => `${x.type}|${x.text}`, (x) => [x.type, x.text.replace(/\|/g, '/').slice(0, 140)]);
section('다른 요소가 가로챈 탭', collect((s) => s.blocked),
  (x) => `${x.target}|${x.hitBy}`, (x) => [`${x.target}`, `가로챈 요소 ${x.hitBy}`]);
section('이름 없는 버튼', collect((s) => s.metrics?.buttonsNoName),
  (x) => x.sel, (x) => [`\`${x.sel}\``, '']);
section('같은 문구가 한 화면에 2번 이상', collect((s) => s.metrics?.dupTexts),
  (x) => x.text, (x) => [`"${x.text}"`, `x${x.count}`], 15);

const modals = shots.filter((s) => s.metrics?.modal);
const exceed = modals.filter((s) => s.metrics.modal.exceedsViewport);
const noFooter = modals.filter((s) => s.metrics.modal.footerVisible === false);
const noLabel = modals.filter((s) => !s.metrics.modal.ariaLabel && !s.metrics.modal.labelledby);
const noFocus = modals.filter((s) => !s.metrics.modal.activeInside);
console.log('## 모달 점검');
console.log(`- 모달 캡처 ${modals.length}장: 뷰포트 밖으로 나간 것 ${exceed.length} · footer가 화면 밖 ${noFooter.length} · 접근 가능한 이름(aria-label/labelledby) 없음 ${noLabel.length} · 포커스가 모달 안에 없음 ${noFocus.length}`);
for (const s of exceed.slice(0, 20)) console.log(`  - 초과: ${s.file} rect=${s.metrics.modal.rect}`);
for (const s of noFooter.slice(0, 20)) console.log(`  - footer 밖: ${s.file}`);
const docOver = shots.filter((s) => s.metrics?.docOverflowX);
console.log(`- 문서 가로 넘침: ${docOver.length}장${docOver.length ? ' (' + list(new Set(docOver.map((s) => s.viewport))) + ')' : ''}`);
