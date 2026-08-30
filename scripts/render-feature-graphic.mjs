/**
 * assets/feature-graphic.svg → assets/feature-graphic.png (1024×500)
 * Pretendard(public/fonts)를 @font-face로 물려 헤드리스 크롬에서 굽는다.
 * 실행: node scripts/render-feature-graphic.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(path.join(root, 'assets/feature-graphic.svg'), 'utf8');
const fontB64 = (await readFile(path.join(root, 'public/fonts/PretendardVariable.woff2'))).toString('base64');

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face {
  font-family: 'Pretendard Variable';
  src: url(data:font/woff2;base64,${fontB64}) format('woff2-variations');
  font-weight: 100 900;
}
html, body { margin: 0; padding: 0; background: transparent; }
svg { display: block; }
</style>${svg}`;

const browser = await puppeteer.launch({ headless: 'new', args: ['--font-render-hinting=none'] });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 500, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluateHandle('document.fonts.ready');
const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1024, height: 500 } });
await writeFile(path.join(root, 'assets/feature-graphic.png'), buf);
await browser.close();
console.log('assets/feature-graphic.png 재생성 (1024x500)');
