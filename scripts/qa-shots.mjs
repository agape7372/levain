/**
 * 전 화면 실측 하네스 — 픽스처 세이브 × 뷰포트 × 화면을 실제 클릭으로 돌며 PNG와 측정값을 남긴다.
 *
 * 사용:
 *   node scripts/qa/make-fixtures.mjs                      # (1회) 픽스처 굽기 — 실제 store·sim 사용
 *   node scripts/qa-shots.mjs <outDir>                     # 전 픽스처 × 전 뷰포트
 *   node scripts/qa-shots.mjs <outDir> --only=F3,F4 --viewport=p390,t800
 *   node scripts/qa-shots.mjs <outDir> --screens=settings,help          # 화면 id 부분 일치만
 *   node scripts/qa-shots.mjs <outDir> --textzoom=1.3 --reduced-motion   # 글자 배율 근사 · 모션 감소
 *   node scripts/qa/aggregate.mjs <outDir>                 # metrics.json → 결함 표(마크다운)
 *
 * 결정성: Date·Math.random·시간대(Asia/Seoul)를 고정한다. Date.now는 픽스처 기준 시각(QA_NOW)에서 멈춘다.
 * vite dev를 포트 5212(--strictPort)로 직접 띄우고 끝나면 자기 자식 프로세스만 끈다.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchBrowser } from './lib/launch-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixDir = path.join(root, 'scripts', 'qa', 'fixtures');
const PORT = 5212;
const SAVE_KEY = 'levain:save';

// ── 인자 ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const outDir = path.resolve(root, argv.find((a) => !a.startsWith('--')) ?? 'work/qa-shots');
const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const has = (name) => argv.includes(`--${name}`);
const onlyFx = flag('only')?.split(',');
const onlyVp = flag('viewport')?.split(',');
const onlyScreens = flag('screens')?.split(',');
const TEXTZOOM = Number(flag('textzoom') ?? 1);
const REDUCED = has('reduced-motion');
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = {
  p360: { width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  p390: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  p412: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  t800: { width: 800, height: 1280, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  land: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  // 기본 스윕에는 안 든다(--viewport=로만) — 스토어 태블릿 스크린샷 크기
  t1200: { width: 1200, height: 1920, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  t1600: { width: 1600, height: 2560, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  // 실기기에 가까운 태블릿 — DPR 2 (WebGL 버퍼 크기 확인용)
  t800d2: { width: 800, height: 1280, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  t1600d2: { width: 1600, height: 2560, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const DEFAULT_VP = ['p360', 'p390', 'p412', 't800', 'land'];
/** 핵심 화면만 도는 뷰포트 — 확장 화면은 p360·p390·t800에서만 */
const FULL_VP = new Set(['p360', 'p390', 't800', 't1200', 't1600', 't800d2', 't1600d2']);

const FIXTURE_IDS = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'];
const meta = existsSync(path.join(fixDir, '_meta.json'))
  ? JSON.parse(readFileSync(path.join(fixDir, '_meta.json'), 'utf8'))
  : { qaNow: Date.UTC(2026, 10, 12, 3, 0, 0), fixtures: {} };
const QA_NOW = meta.qaNow;
const loadSave = (id) => (id === 'F0' ? null : readFileSync(path.join(fixDir, `${id}.json`), 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── vite ──────────────────────────────────────────────────────────────────────
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const vite = spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: root, stdio: 'pipe',
});
let viteLog = '';
vite.stdout.on('data', (d) => (viteLog += String(d)));
vite.stderr.on('data', (d) => (viteLog += String(d)));
const baseUrl = `http://127.0.0.1:${PORT}/`;
await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error(`vite 기동 시간 초과\n${viteLog}`)), 40000);
  const tick = async () => {
    try {
      const r = await fetch(baseUrl);
      if (r.ok) { clearTimeout(to); res(); return; }
    } catch { /* 아직 */ }
    setTimeout(tick, 300);
  };
  vite.on('exit', () => rej(new Error(`vite dev가 죽었습니다\n${viteLog}`)));
  void tick();
});

// ── 페이지 안에서 도는 측정기 ─────────────────────────────────────────────────
/* eslint-disable */
function measureInPage() {
  const vw = innerWidth;
  const vh = innerHeight;
  const out = {
    viewport: [vw, vh], scope: '', smallText: [], tap: [], hscroll: [], offscreen: [], clip: [],
    contrast: [], modal: null, docOverflowX: document.documentElement.scrollWidth > vw + 1,
    docScrollW: document.documentElement.scrollWidth, textLen: 0, dupTexts: [], buttonsNoName: [],
  };
  const backdrops = [...document.querySelectorAll('.modal-backdrop.open')];
  const celebrate = document.querySelector('.celebrate-layer.show');
  const roots = [];
  if (backdrops.length) { roots.push(backdrops[backdrops.length - 1]); out.scope = 'modal'; }
  else if (document.querySelector('.showcase-top')) { roots.push(document.querySelector('#ui-root')); out.scope = 'showcase'; }
  else if (document.querySelector('.onboard')) { roots.push(document.querySelector('#ui-root')); out.scope = 'onboard'; }
  else { roots.push(document.querySelector('#ui-root'), document.querySelector('#tabs')); out.scope = 'screen'; }
  if (celebrate) { roots.push(celebrate); out.scope += '+celebrate'; }
  const toast = document.querySelector('.toast-container');
  if (toast && toast.children.length) roots.push(toast);
  const rootSet = roots.filter(Boolean);

  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = [...el.classList].filter((c) => !/^(open|show|active|selected)$/.test(c)).slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    const p = el.parentElement;
    if (p && p !== document.body) {
      let ps = p.tagName.toLowerCase();
      const pc = [...p.classList].slice(0, 1);
      if (pc.length) ps += '.' + pc[0];
      s = ps + '>' + s;
    }
    return s;
  };
  const txt = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28);
  const parseColor = (str) => {
    let m = /^rgba?\(([^)]+)\)$/.exec(str);
    if (m) {
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    m = /^color\(srgb ([^)]+)\)$/.exec(str);
    if (m) {
      const p = m[1].split(/[ /]+/).filter(Boolean).map(Number);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  };
  const over = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
      g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
      b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
      a,
    };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

  /** 배경색 조상 탐색 — 그라디언트·이미지 조상을 만나면 null(미상) */
  const backdrop = (el) => {
    let acc = { r: 0, g: 0, b: 0, a: 0 };
    let approx = false;
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none') return { unknown: true };
      const bg = parseColor(cs.backgroundColor);
      if (bg && bg.a > 0) acc = over(acc, bg);
      if (acc.a >= 0.999) break;
      if (n.classList && n.classList.contains('screen--overlay')) approx = true;
    }
    if (acc.a < 0.999) {
      // 캔버스 위 HUD — #stage 라디얼 그라디언트 중앙 근사색(#E8D9C4)
      acc = over(acc, { r: 232, g: 217, b: 196, a: 1 });
      approx = true;
    }
    return { color: acc, approx };
  };
  const effOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.body; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    return o;
  };
  /** 닿는 넓이 — 투명 의사 요소로 넓힌 탭 영역(main.css T5-09)까지 합친다. 음수 inset만 넓이를 키운다 */
  const hitSize = (el, r) => {
    let { left, top, right, bottom } = r;
    for (const p of ['::before', '::after']) {
      const ps = getComputedStyle(el, p);
      if (ps.content === 'none' || ps.display === 'none' || ps.position !== 'absolute') continue;
      const px = (v) => (v.endsWith('px') ? parseFloat(v) : 0);
      left = Math.min(left, r.left + px(ps.left));
      top = Math.min(top, r.top + px(ps.top));
      right = Math.max(right, r.right - px(ps.right));
      bottom = Math.max(bottom, r.bottom - px(ps.bottom));
    }
    return { width: right - left, height: bottom - top };
  };
  /** 보이지 않는 의사 요소(탭 넓이용)인가 — 가로 넘침 측정에서 뺀다 */
  const invisiblePseudo = (el, p) => {
    const ps = getComputedStyle(el, p);
    if (ps.content === 'none' || ps.display === 'none' || ps.position !== 'absolute') return false;
    const bg = parseColor(ps.backgroundColor);
    return (!bg || bg.a === 0) && ps.backgroundImage === 'none' && ps.boxShadow === 'none' &&
      parseFloat(ps.borderTopWidth) + parseFloat(ps.borderLeftWidth) === 0 && /^["']{0,2}$/.test(ps.content);
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return null;
      if (parseFloat(cs.opacity) < 0.05) return null;
    }
    return r;
  };

  // 가로 넘침은 탭 넓이용 투명 의사 요소를 끈 채로 먼저 잰다 — 그 상자가 scrollWidth를 2~7px 키운다(보이지 않는 넘침)
  const hscrollEls = new Map(); // el → 의사 요소를 끈 scrollWidth
  {
    const st = document.createElement('style');
    st.textContent = '.qa-nohit-b::before,.qa-nohit-a::after{display:none!important}';
    document.head.appendChild(st);
    const marked = [];
    for (const rootEl of rootSet) for (const el of [rootEl, ...rootEl.querySelectorAll('*')]) {
      if (invisiblePseudo(el, '::before')) { el.classList.add('qa-nohit-b'); marked.push(el); }
      if (invisiblePseudo(el, '::after')) { el.classList.add('qa-nohit-a'); marked.push(el); }
    }
    for (const rootEl of rootSet) for (const el of [rootEl, ...rootEl.querySelectorAll('*')]) {
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) hscrollEls.set(el, el.scrollWidth);
    }
    for (const el of marked) el.classList.remove('qa-nohit-a', 'qa-nohit-b');
    st.remove();
  }
  const seenText = new Map();
  const seen = new Set();
  const TAP = 'button, a[href], [role="button"], [role="switch"], select, input, summary';
  for (const rootEl of rootSet) {
    const all = [rootEl, ...rootEl.querySelectorAll('*')];
    for (const el of all) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.tagName === 'CANVAS' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      const r = visible(el);
      if (!r) continue;
      const cs = getComputedStyle(el);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
      if (hasText) {
        const t = txt(el);
        out.textLen += t.length;
        const fs = parseFloat(cs.fontSize);
        if (fs < 13) out.smallText.push({ sel: sel(el), text: t, size: +fs.toFixed(1), numeric: /^[\d+×x.,\s/%]+$/.test(t) });
        // 대비
        const fg = parseColor(cs.color);
        const bd = backdrop(el);
        if (fg && !bd.unknown) {
          const op = effOpacity(el);
          let f = { ...fg, a: fg.a * op };
          const bgc = bd.color;
          const blended = over(f, bgc);
          const cr = ratio(blended, bgc);
          const bold = parseInt(cs.fontWeight, 10) >= 700;
          const large = fs >= 24 || (fs >= 18.66 && bold);
          const need = large ? 3 : 4.5;
          if (cr < need) out.contrast.push({ sel: sel(el), text: t, ratio: +cr.toFixed(2), need, size: +fs.toFixed(1), approx: bd.approx });
        }
        seenText.set(t, (seenText.get(t) || 0) + 1);
        // 잘림
        const ox = cs.overflowX, oy = cs.overflowY;
        const clipsX = ox === 'hidden' || ox === 'clip';
        const clipsY = oy === 'hidden' || oy === 'clip';
        if ((clipsX && el.scrollWidth > el.clientWidth + 1) || (clipsY && el.scrollHeight > el.clientHeight + 1)) {
          out.clip.push({
            sel: sel(el), text: t, sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight,
            ellipsis: cs.textOverflow === 'ellipsis', lineClamp: cs.webkitLineClamp && cs.webkitLineClamp !== 'none',
          });
        }
      }
      // 탭 대상
      if (el.matches(TAP)) {
        const dis = el.disabled === true;
        const hit = hitSize(el, r);
        if ((hit.width < 44 || hit.height < 44) && !dis) {
          out.tap.push({ sel: sel(el), text: txt(el) || el.getAttribute('aria-label') || '', w: +hit.width.toFixed(1), h: +hit.height.toFixed(1) });
        }
        const name = (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent || el.title || '').trim();
        if (!name && el.tagName !== 'INPUT' && !el.querySelector('img[alt]')) out.buttonsNoName.push({ sel: sel(el) });
      }
      // 가로 넘침 (스크롤러 제외)
      if (hscrollEls.has(el)) {
        const ox = cs.overflowX;
        if (ox !== 'auto' && ox !== 'scroll' && ox !== 'hidden' && ox !== 'clip' && cs.display !== 'inline') {
          out.hscroll.push({ sel: sel(el), sw: hscrollEls.get(el), cw: el.clientWidth });
        }
      }
      // 화면 밖으로 나간 요소 — 클리핑 조상이 없을 때만
      if (r.right > vw + 1 || r.left < -1) {
        let clipped = false;
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const c2 = getComputedStyle(n);
          if (c2.overflowX !== 'visible') { clipped = true; break; }
        }
        if (!clipped) out.offscreen.push({ sel: sel(el), text: txt(el), left: +r.left.toFixed(1), right: +r.right.toFixed(1) });
      }
    }
  }
  for (const [t, n] of seenText) if (n > 1 && t.length >= 8) out.dupTexts.push({ text: t, count: n });

  const card = backdrops.length ? backdrops[backdrops.length - 1].querySelector('.modal-card') : null;
  if (card) {
    const r = card.getBoundingClientRect();
    const scroller = card.querySelector('.modal-scroll') || card;
    out.modal = {
      role: card.getAttribute('role'), ariaModal: card.getAttribute('aria-modal'),
      ariaLabel: card.getAttribute('aria-label'), labelledby: card.getAttribute('aria-labelledby'),
      title: card.querySelector('.modal-title')?.textContent || null,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
      exceedsViewport: r.top < -1 || r.bottom > vh + 1 || r.left < -1 || r.right > vw + 1,
      scrolls: scroller.scrollHeight > scroller.clientHeight + 1,
      scrollH: scroller.scrollHeight, clientH: scroller.clientHeight,
      activeInside: card.contains(document.activeElement),
      active: document.activeElement ? sel(document.activeElement) : null,
      footerVisible: card.querySelector('.modal-footer') ? (() => { const f = card.querySelector('.modal-footer').getBoundingClientRect(); return f.bottom <= vh + 1; })() : null,
    };
  }
  return out;
}
/* eslint-enable */

// ── 글자 배율 근사: CSS·TS 응답의 px 글자 크기를 배율 곱 ─────────────────────
function scaleFonts(body, z) {
  const f = (n) => `${(parseFloat(n) * z).toFixed(2)}px`;
  return body
    .replace(/(font-size:\s*)([\d.]+)px/g, (_, a, n) => a + f(n))
    .replace(/(font:\s*)([\d.]+)px/g, (_, a, n) => a + f(n))
    .replace(/(--fs-[a-z]+:\s*)([\d.]+)px/g, (_, a, n) => a + f(n));
}

// ── 시드: Date·random·세이브 ─────────────────────────────────────────────────
function seedScript({ now, save, key }) {
  return `(() => {
    const FIXED = ${now};
    const RealDate = Date;
    window.__qaNow = FIXED;
    class QDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(window.__qaNow); else super(...a); }
      static now() { return window.__qaNow; }
    }
    globalThis.Date = QDate;
    let s = 0x1badf00d;
    Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    try {
      if (!sessionStorage.getItem('__qaSeeded')) {
        sessionStorage.setItem('__qaSeeded', '1');
        localStorage.clear();
        ${save === null ? '' : `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(save)});`}
      }
    } catch (e) {}
  })();`;
}

// ── 화면 정의 ─────────────────────────────────────────────────────────────────
// core: 모든 뷰포트에서 / 아니면 FULL_VP에서만. fx: 적용 픽스처(생략 = F1~F9)
const NOT_F0 = FIXTURE_IDS.filter((f) => f !== 'F0');
const STAGE3PLUS = ['F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'];
const ALIVE = ['F1', 'F2', 'F3', 'F4', 'F8', 'F9'];

const SCREENS = [];
const def = (id, opts, run) => SCREENS.push({ id, fx: NOT_F0, core: false, mutates: false, ...opts, run });

// ── F0 온보딩 ──
def('onboarding', { fx: ['F0'], core: true }, async (c) => {
  await c.snap('onb-1-welcome');
  await c.clickText('시작하기');
  await sleep(500);
  await c.snap('onb-2-stir');
  const t = await c.canvasHit();
  await c.snapNote(`onb-2 캔버스 hit-test: ${JSON.stringify(t)}`);
  // 절반 정도 젓기
  await c.drag(350);
  await c.snap('onb-2b-stir-half');
  await c.drag(500);
  await sleep(600);
  await c.snap('onb-3-born');
  await c.clickText('좋아요');
  await sleep(1200);
  await c.snap('onb-4-gift-picker');
  // 선물 고르기 — 첫 카드
  await c.clickSel('.modal-card .chip'); // 선물 창 = 칩 그리드(T5-14)
  await sleep(900);
  await c.snap('onb-5-celebrate-gift');
  await sleep(2600);
  await c.reset();
  await c.snap('onb-6-home-after');
});

// ── 부트 모달 (브리핑 · 곰팡이) ──
def('boot-modal', { fx: ['F7', 'F9'], core: true }, async (c) => {
  if (await c.modalOpen()) await c.snap(c.fixture === 'F7' ? 'boot-mold-modal' : 'boot-briefing-modal');
  else await c.snapNote('부트 모달 없음');
  await c.reset();
});

def('home', { core: true }, async (c) => {
  await c.reset();
  await sleep(300);
  await c.snap('home');
  // 콜드 스타트는 천이 덮여 있다 — 걷는 게 첫 리추얼. 캔버스를 눌러 걷고 르방 상태를 본다
  const vp = await c.page.evaluate(() => [innerWidth, innerHeight]);
  await c.page.mouse.click(vp[0] / 2, vp[1] * 0.55);
  await sleep(2200);
  await c.snap('home-uncovered');
});

def('jar', { core: true }, async (c) => {
  await c.reset();
  if (!(await c.exists('.pantry-jar')) || (await c.hidden('.pantry-jar'))) { await c.snapNote('항아리 없음'); return; }
  const locked = await c.attr('.pantry-jar', 'aria-disabled');
  await c.clickSel('.pantry-jar');
  await sleep(400);
  await c.snap(locked === 'true' ? 'toast-jar-locked' : 'split-confirm');
  await c.reset();
});

def('observe', { core: true }, async (c) => {
  await c.reset();
  await c.clickSel('.hud-status');
  await sleep(350);
  await c.snap('observe-card');
  if (await c.has('.observe-actions .btn')) {
    await c.clickSel('.observe-actions .btn');
    await sleep(350);
    await c.snap(await c.modalOpen() ? 'observe-flake-next' : 'observe-flake-toast');
  }
  await c.reset();
});

def('feed', { core: true, fx: ['F1', 'F2', 'F3', 'F4', 'F8', 'F9'] }, async (c) => {
  await c.reset();
  await c.clickSel('.hud-bottom .btn-primary');
  await sleep(350);
  await c.snap('feed-ratio');
  if (await c.hasText('자세히')) {
    await c.clickText('자세히');
    await sleep(300);
    await c.snap('feed-detail');
  }
  await c.reset();
});

def('starter-add', { core: false }, async (c) => {
  await c.reset();
  await c.clickSel('.hud-chip-row .chip-nav:last-of-type');
  await sleep(350);
  await c.snap('starter-add-confirm');
  await c.reset();
});

def('starter-switch', { fx: ['F4', 'F8'] }, async (c) => {
  await c.reset();
  await c.clickSel('.hud-actions .chip-nav:last-of-type');
  await sleep(1100);
  await c.snap('starter-switched');
  await c.clickSel('.hud-actions .chip-nav:first-of-type');
  await sleep(1100);
  await c.reset();
});

def('settings', { core: true }, async (c) => {
  await c.reset();
  await c.clickSel('.hud-corner-btns .icon-btn:last-of-type');
  await sleep(350);
  await c.snap('settings');
  await c.scrollModal('bottom');
  await c.snap('settings-bottom');
  // 오픈소스 고지 — 닫으면 설정으로 돌아온다. 「문의하기」는 메일 앱을 열어 누르지 않는다
  if (await c.hasText('오픈소스 라이선스')) {
    await c.clickText('오픈소스 라이선스');
    await sleep(600);
    await c.snap('settings-license');
    await c.scrollModal('bottom');
    await c.snap('settings-license-bottom');
    await c.closeTop();
    await sleep(350);
    if (!(await c.has('.modal-backdrop.open .modal-card .settings-rows'))) {
      await c.reset();
      await c.clickSel('.hud-corner-btns .icon-btn:last-of-type');
      await sleep(350);
    }
  }
  await c.scrollModal('top');
  await c.clickText('알림', { exact: true });
  await sleep(350);
  await c.snap('settings-notify');
  await c.clickText('방해 없는 시간');
  await sleep(350);
  await c.snap('settings-quiet');
  await c.closeTop();
  // 하위 모달은 위 모달을 닫고 연다(T5-15, 모달 위 모달 금지) — 알림이 닫혀 있으면 다시 연다
  if (!(await c.has('.modal-backdrop.open .modal-card .switch'))) {
    await c.reset();
    await c.clickSel('.hud-corner-btns .icon-btn:last-of-type');
    await sleep(350);
    await c.clickText('알림', { exact: true });
    await sleep(350);
  }
  // 마스터 끄기 → 잠금 표시
  await c.clickSel('.modal-card .switch');
  await sleep(300);
  await c.snap('settings-notify-locked');
  await c.closeTop();
  await c.closeTop();
  await c.reset();
});

def('settings-extra', { fx: ['F4', 'F8'] }, async (c) => {
  await c.reset();
  await c.clickSel('.hud-corner-btns .icon-btn:last-of-type');
  await sleep(300);
  await c.clickText('이름표');
  await sleep(350);
  await c.snap('settings-label');
  await c.closeTop();
  // 이름표도 설정을 닫고 열면(T5-15) 설정을 다시 연다
  if (!(await c.has('.modal-backdrop.open .modal-card .settings-rows'))) {
    await c.reset();
    await c.clickSel('.hud-corner-btns .icon-btn:last-of-type');
    await sleep(350);
  }
  // 개발자 모드 7탭
  for (let i = 0; i < 7; i++) { await c.clickText('르방이 v', { sel: '.hint' }); await sleep(60); }
  await sleep(300);
  await c.scrollModal('bottom');
  await c.snap('settings-dev');
  await c.clickText('처음부터 다시 시작');
  await sleep(350);
  await c.snap('settings-reset-confirm');
  await c.reset();
});

def('help', { core: true }, async (c) => {
  await c.reset();
  await c.clickSel('.hud-corner-btns .icon-btn:first-of-type');
  await sleep(350);
  await c.snap('help');
  await c.scrollModal('bottom');
  await c.snap('help-bottom');
  await c.reset();
});

// ── 레시피 탭 ──
def('recipes', { core: true }, async (c) => {
  await c.reset();
  await c.clickSel('#tabs button:nth-child(2)');
  await sleep(500);
  await c.snap('recipes-bread');
  await c.scrollScreen('bottom');
  await c.snap('recipes-bread-bottom');
  await c.scrollScreen('top');
  if (await c.has('.recipe-card.locked')) {
    await c.clickSel('.recipe-card.locked');
    await sleep(350);
    await c.snap('toast-locked-card');
  }
  await c.clickSel('.recipes-seg button:nth-child(2)');
  await sleep(400);
  await c.snap('recipes-shelf');
  await c.scrollScreen('bottom');
  await c.snap('recipes-shelf-bottom');
  await c.scrollScreen('top');
  await c.clickSel('.recipes-seg button:nth-child(3)');
  await sleep(400);
  await c.snap('recipes-ingredient');
  await c.scrollScreen('bottom');
  await c.snap('recipes-ingredient-bottom');
  await c.scrollScreen('top');
  if (await c.has('.chip--mystery')) {
    await c.clickSel('.chip--mystery');
    await sleep(350);
    await c.snap('toast-ingredient-locked');
  }
  await c.clickSel('#tabs button:nth-child(1)');
  await sleep(300);
});

def('bread-sheet', { core: true, fx: ['F3', 'F4', 'F8'] }, async (c) => {
  await c.reset();
  await c.clickSel('#tabs button:nth-child(2)');
  await sleep(400);
  await c.clickSel('.recipes-seg button:nth-child(1)');
  await sleep(300);
  // 해금된 마지막 카드 — 칩이 많은 빵
  const idx = await c.lastUnlockedCard();
  await c.clickNth('.recipe-card', idx);
  await sleep(500);
  await c.snap('sheet-base');
  if (await c.has('.chip:not(.chip--missing):not(.chip--mystery) .chip-count')) {
    await c.clickSel('.modal-card .chip:has(.chip-count)');
    await sleep(350);
    await c.snap('sheet-variant');
  }
  if (await c.has('.modal-card .chip--missing')) {
    await c.clickSel('.modal-card .chip--missing');
    await sleep(350);
    await c.snap('sheet-missing-toast');
  }
  await c.scrollModal('bottom');
  await c.snap('sheet-bottom');
  await c.reset();
  await c.clickSel('#tabs button:nth-child(1)');
});

def('shelf-card', { fx: ['F4', 'F8'] }, async (c) => {
  await c.reset();
  await c.clickSel('#tabs button:nth-child(2)');
  await sleep(400);
  await c.clickSel('.recipes-seg button:nth-child(2)');
  await sleep(400);
  await c.clickSel('.shelf-tile');
  await sleep(500);
  await c.snap('shelf-card');
  await c.reset();
  await c.clickSel('#tabs button:nth-child(1)');
});

def('exchange', { core: true }, async (c) => {
  await c.reset();
  await c.clickSel('#tabs button:nth-child(2)');
  await sleep(400);
  await c.clickSel('.recipes-seg button:nth-child(3)');
  await sleep(400);
  const gift = await c.hasText('첫 재료를');
  if (gift) {
    await c.clickText('첫 재료를');
    await sleep(400);
    await c.snap('gift-picker');
    await c.reset();
    await c.clickText('가루 모으기');
    await sleep(350);
    await c.snap('missions');
    await c.reset();
  } else {
    await c.clickText('재료 바꾸기');
    await sleep(450);
    await c.snap('exchange');
    await c.clickSel('.modal-card .chip');
    await sleep(300);
    await c.snap('exchange-selected');
    await c.scrollModal('bottom');
    await c.snap('exchange-bottom');
    await c.clickText('가루 모으기');
    await sleep(350);
    await c.snap('missions');
    await c.reset();
  }
  await c.clickSel('#tabs button:nth-child(1)');
});

// ── 상태 변경이 있는 화면 (순서상 맨 끝) ──
def('ingredient-view', { fx: ['F4', 'F8'], mutates: true }, async (c) => {
  await c.reset();
  await c.clickSel('#tabs button:nth-child(2)');
  await sleep(400);
  await c.clickSel('.recipes-seg button:nth-child(3)');
  await sleep(400);
  await c.clickSel('.chip:not(.chip--mystery)');
  await sleep(2500);
  await c.snap(await c.has('.showcase-top') ? 'showcase-ingredient-3d' : 'showcase-ingredient-card');
  await c.reset();
  await c.clickSel('#tabs button:nth-child(1)');
});

def('shelf-3d', { fx: ['F4', 'F8'], mutates: true }, async (c) => {
  await c.reset();
  await c.clickSel('#tabs button:nth-child(2)');
  await sleep(400);
  await c.clickSel('.recipes-seg button:nth-child(2)');
  await sleep(400);
  await c.clickSel('.shelf-tile');
  await sleep(450);
  await c.clickText('3D로 보기');
  await sleep(3000);
  await c.snap(await c.has('.showcase-top') ? 'showcase-bread-3d' : 'showcase-bread-fallback');
  await c.reset();
  await c.clickSel('#tabs button:nth-child(1)');
});

def('bake-result', { fx: ['F3', 'F4', 'F8'], mutates: true }, async (c) => {
  await c.reset();
  await c.clickSel('#tabs button:nth-child(2)');
  await sleep(400);
  await c.clickSel('.recipes-seg button:nth-child(1)');
  await sleep(300);
  await c.clickNth('.recipe-card', 3); // flatbread(해금 3단계) — 통 30g
  await sleep(450);
  await c.clickSel('.modal-footer .btn-primary');
  await sleep(2800);
  await c.snap(await c.has('.showcase-top') ? 'bake-result-3d' : 'bake-result-card');
  await c.reset();
  await c.clickSel('#tabs button:nth-child(1)');
});

def('celebrate-buy', { fx: ['F4'], mutates: true }, async (c) => {
  await c.reset();
  await c.clickSel('#tabs button:nth-child(2)');
  await sleep(400);
  await c.clickSel('.recipes-seg button:nth-child(3)');
  await sleep(400);
  await c.clickText('재료 바꾸기');
  await sleep(450);
  // 수량 0인 칩(미보유) 고르기 — 마지막 칩
  await c.clickNth('.modal-card .chip', 25);
  await sleep(250);
  await c.clickText('가져오기', { sel: '.modal-footer .btn' });
  await sleep(900);
  await c.snap('celebrate-ingredient');
  await sleep(3000);
  await c.reset();
  await c.clickSel('#tabs button:nth-child(1)');
});

def('gift-claim', { fx: ['F1'], mutates: true }, async (c) => {
  await c.reset();
  await c.clickSel('#tabs button:nth-child(2)');
  await sleep(400);
  await c.clickSel('.recipes-seg button:nth-child(3)');
  await sleep(400);
  await c.clickText('첫 재료를');
  await sleep(400);
  await c.clickSel('.modal-card .chip'); // 선물 창 = 칩 그리드(T5-14)
  await sleep(900);
  await c.snap('celebrate-gift');
  await sleep(2800);
  await c.reset();
  await c.clickSel('#tabs button:nth-child(1)');
});

def('revive', { fx: ['F5'], mutates: true }, async (c) => {
  await c.reset();
  await c.clickSel('.hud-bottom .btn-primary');
  await sleep(500);
  await c.snap('toast-revive');
  await c.reset();
});

def('mold-modal-reopen', { fx: ['F7'], mutates: true }, async (c) => {
  await c.reset();
  await c.clickSel('.hud-bottom .btn-primary');
  await sleep(350);
  await c.snap('mold-modal');
  await c.reset();
});

// ── 스윕 본체 ────────────────────────────────────────────────────────────────
const puppeteer = (await import('puppeteer')).default;
const browser = await launchBrowser(puppeteer, {
  args: [
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--enable-webgl', '--hide-scrollbars', '--no-sync', '--disable-background-timer-throttling',
  ],
});

// 이전 실행분은 이어 붙인다(같은 픽스처×뷰포트 조합만 교체) — 긴 스윕을 나눠 돌릴 수 있다
const metricsPath = path.join(outDir, 'metrics.json');
let shots = [];
if (!has('fresh') && existsSync(metricsPath)) {
  try { shots = JSON.parse(readFileSync(metricsPath, 'utf8')).shots ?? []; } catch { shots = []; }
}
const startedAt = Date.now();

function makeCtx(page, fixture, vpName, consoleBuf) {
  const base = `${fixture}-${vpName}`;
  const ctx = {
    fixture, vpName, page,
    async snap(name) {
      await sleep(150);
      const file = `${base}-${name}.png`;
      const rec = { file, fixture, viewport: vpName, screen: name, status: 'ok', textzoom: TEXTZOOM, reduced: REDUCED };
      try {
        await page.screenshot({ path: path.join(outDir, file), type: 'png' });
        rec.metrics = await page.evaluate(measureInPage);
      } catch (e) {
        rec.status = 'fail';
        rec.error = String(e).slice(0, 300);
      }
      rec.console = consoleBuf.splice(0, consoleBuf.length);
      rec.blocked = ctx.pendingBlocked.splice(0, ctx.pendingBlocked.length);
      rec.notes = ctx.pendingNotes.splice(0, ctx.pendingNotes.length);
      shots.push(rec);
    },
    pendingBlocked: [],
    pendingNotes: [],
    async snapNote(text) { ctx.pendingNotes.push(text); },
    async evalScope(fn, ...args) {
      return page.evaluate(fn, ...args);
    },
    async exists(s) { return page.evaluate((q) => !!document.querySelector(q), s); },
    async has(s) { return page.evaluate((q) => { try { return !!document.querySelector(q); } catch { return false; } }, s); },
    async hidden(s) { return page.evaluate((q) => { const e = document.querySelector(q); return !e || getComputedStyle(e).display === 'none'; }, s); },
    async attr(s, a) { return page.evaluate((q, n) => document.querySelector(q)?.getAttribute(n) ?? null, s, a); },
    async hasText(text) {
      return page.evaluate((t) => [...document.querySelectorAll('button, [role=button]')].some((b) => (b.innerText || '').replace(/\s+/g, ' ').includes(t)), text);
    },
    async modalOpen() { return page.evaluate(() => !!document.querySelector('.modal-backdrop.open')); },
    async canvasHit() {
      return page.evaluate(() => {
        const e = document.elementFromPoint(innerWidth / 2, innerHeight * 0.4);
        const c = document.getElementById('c');
        const r = c.getBoundingClientRect();
        return { hit: e ? e.tagName + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ')[0] : '') : null, canvasRect: [Math.round(r.width), Math.round(r.height)], stageVis: getComputedStyle(document.getElementById('stage')).visibility };
      });
    },
    async clickAt(x, y, label) {
      // 클릭 지점의 실제 최상단 요소를 확인(막힘 감지)
      await page.mouse.click(x, y);
      return label;
    },
    async clickHandle(h, label) {
      const box = await h.boundingBox();
      if (!box) throw new Error(`클릭 대상 박스 없음: ${label}`);
      await h.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
      await sleep(60);
      const b2 = await h.boundingBox();
      const x = b2.x + b2.width / 2;
      const y = b2.y + b2.height / 2;
      const hit = await h.evaluate((el, px, py) => {
        const t = document.elementFromPoint(px, py);
        if (!t) return 'null';
        if (el.contains(t) || t.contains(el)) return null;
        return t.tagName.toLowerCase() + (t.className ? '.' + String(t.className).split(' ')[0] : '');
      }, x, y);
      if (hit) {
        ctx.pendingBlocked.push({ target: label, hitBy: hit, at: [Math.round(x), Math.round(y)] });
        if (/toast/.test(hit)) await sleep(3100); // 토스트는 2.6s + 0.3s — 사라진 뒤 다시 누른다
      }
      await page.mouse.click(x, y);
    },
    async clickSel(s) {
      const h = await page.evaluateHandle((q) => {
        const bd = [...document.querySelectorAll('.modal-backdrop.open')];
        const scope = bd.length ? bd[bd.length - 1] : document;
        const list = [...scope.querySelectorAll(q)];
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
        return list.find(vis) || list[0] || null;
      }, s);
      const el = h.asElement();
      if (!el) throw new Error('요소 없음: ' + s);
      await ctx.clickHandle(el, s);
    },
    async clickNth(s, n) {
      const h = await page.evaluateHandle((q, i) => {
        const bd = [...document.querySelectorAll('.modal-backdrop.open')];
        const scope = bd.length ? bd[bd.length - 1] : document;
        const list = [...scope.querySelectorAll(q)];
        return list[Math.min(i, list.length - 1)] || null;
      }, s, n);
      const el = h.asElement();
      if (!el) throw new Error(`요소 없음: ${s}[${n}]`);
      await ctx.clickHandle(el, `${s}[${n}]`);
    },
    async clickText(text, opts = {}) {
      const h = await page.evaluateHandle((t, o) => {
        const bd = [...document.querySelectorAll('.modal-backdrop.open')];
        const scope = bd.length ? bd[bd.length - 1] : document;
        const q = o.sel || 'button, [role=button], a, .row, .hint';
        const list = [...scope.querySelectorAll(q)].filter((e) => {
          const r = e.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return false;
          const s = (e.innerText || '').replace(/\s+/g, ' ').trim();
          return o.exact ? s === t : s.includes(t);
        });
        return list[0] || null;
      }, text, opts);
      const el = h.asElement();
      if (!el) throw new Error(`텍스트 요소 없음: ${text}`);
      await ctx.clickHandle(el, `text:${text}`);
    },
    async drag(dist) {
      const box = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
      const cx = box.w / 2;
      const cy = box.h * 0.4;
      await page.mouse.move(cx - 60, cy);
      await page.mouse.down();
      let moved = 0;
      let dir = 1;
      let x = cx - 60;
      while (moved < dist) {
        x += dir * 20;
        if (x > cx + 60 || x < cx - 60) dir *= -1;
        await page.mouse.move(x, cy + (moved % 40));
        moved += 20;
      }
      await page.mouse.up();
      await sleep(200);
    },
    async scrollModal(where) {
      await page.evaluate((w) => {
        const bd = [...document.querySelectorAll('.modal-backdrop.open')];
        const card = bd.length ? bd[bd.length - 1].querySelector('.modal-card') : null;
        if (!card) return;
        const sc = card.querySelector('.modal-scroll') || card;
        sc.scrollTop = w === 'bottom' ? sc.scrollHeight : 0;
      }, where);
      await sleep(200);
    },
    async scrollScreen(where) {
      await page.evaluate((w) => {
        const s = document.querySelector('.screen--solid');
        if (s) s.scrollTop = w === 'bottom' ? s.scrollHeight : 0;
      }, where);
      await sleep(250);
    },
    async lastUnlockedCard() {
      return page.evaluate(() => {
        const cards = [...document.querySelectorAll('.recipe-card')];
        let idx = 0;
        cards.forEach((c, i) => { if (!c.classList.contains('locked')) idx = i; });
        return idx;
      });
    },
    async closeTop() {
      // 맨 위 모달 백드롭 모서리를 실제로 눌러 닫는다
      if (!(await ctx.modalOpen())) return;
      await page.mouse.click(2, 2);
      await sleep(320);
    },
    async reset() {
      for (let i = 0; i < 8; i++) {
        const st = await page.evaluate(() => ({
          modal: !!document.querySelector('.modal-backdrop.open'),
          show: !!document.querySelector('.showcase-bottom'),
          cel: !!document.querySelector('.celebrate-layer.show'),
        }));
        if (st.modal) { await page.mouse.click(2, 2); await sleep(330); continue; }
        if (st.cel) { await page.mouse.click(2, 2); await sleep(400); continue; }
        if (st.show) { await ctx.clickSel('.showcase-bottom .btn-primary'); await sleep(500); continue; }
        break;
      }
    },
  };
  return ctx;
}

async function runCombo(fixture, vpName) {
  const vp = VIEWPORTS[vpName];
  shots = shots.filter((x) => !(x.fixture === fixture && x.viewport === vpName && x.textzoom === TEXTZOOM && x.reduced === REDUCED));
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const consoleBuf = [];
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') consoleBuf.push({ type: t, text: m.text().slice(0, 240), url: m.location()?.url?.replace(baseUrl, '/') ?? '' });
  });
  page.on('pageerror', (e) => consoleBuf.push({ type: 'pageerror', text: String(e).slice(0, 240) }));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (/favicon/.test(u)) return;
    consoleBuf.push({ type: 'requestfailed', text: `${r.failure()?.errorText} ${u.replace(baseUrl, '/')}` });
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !/favicon/.test(r.url())) consoleBuf.push({ type: 'http', text: `${r.status()} ${r.url().replace(baseUrl, '/')}` });
  });
  await page.setViewport(vp);
  await page.emulateTimezone('Asia/Seoul');
  if (REDUCED) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9' });
  if (TEXTZOOM !== 1) {
    await page.setRequestInterception(true);
    page.on('request', async (req) => {
      const u = req.url();
      if (!u.startsWith(baseUrl) || !/(\.css|\.ts)(\?|$)/.test(u)) { void req.continue(); return; }
      try {
        const h = { ...req.headers() };
        delete h['if-none-match']; delete h['if-modified-since'];
        const r = await fetch(u, { headers: h });
        const body = scaleFonts(await r.text(), TEXTZOOM);
        const headers = {};
        r.headers.forEach((v, k) => { if (!/^(content-length|content-encoding|etag)$/i.test(k)) headers[k] = v; });
        await req.respond({ status: r.status, headers, body });
      } catch { void req.continue(); }
    });
  }
  await page.evaluateOnNewDocument(seedScript({ now: QA_NOW, save: loadSave(fixture), key: SAVE_KEY }));
  const ctx = makeCtx(page, fixture, vpName, consoleBuf);
  const bootFail = async (e) => {
    shots.push({ file: null, fixture, viewport: vpName, screen: '(부팅)', status: 'fail', textzoom: TEXTZOOM, reduced: REDUCED, error: String(e).slice(0, 300), console: consoleBuf.splice(0) });
  };
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('#tabs') || document.querySelector('.onboard'), { timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2200);
  } catch (e) {
    await bootFail(e);
    await context.close();
    return;
  }
  const list = SCREENS.filter((s) =>
    s.fx.includes(fixture)
    && (s.core || FULL_VP.has(vpName))
    && (!onlyScreens || onlyScreens.some((k) => s.id.includes(k))));
  // 변경 없는 화면 먼저, 변경 있는 화면 나중 (정의 순서 유지)
  const ordered = [...list.filter((s) => !s.mutates), ...list.filter((s) => s.mutates)];
  for (const s of ordered) {
    try {
      await s.run(ctx);
    } catch (e) {
      shots.push({
        file: null, fixture, viewport: vpName, screen: s.id, status: 'fail', textzoom: TEXTZOOM, reduced: REDUCED, error: String(e).slice(0, 300), // 배율·모션 칸: 없으면 다시 돌려도 옛 실패가 안 지워졌다
        console: consoleBuf.splice(0, consoleBuf.length),
      });
      // 실패한 화면은 건너뛰고 복구 시도
      try { await ctx.reset(); } catch { /* 계속 */ }
    }
  }
  await context.close();
}

try {
  for (const fx of FIXTURE_IDS) {
    if (onlyFx && !onlyFx.includes(fx)) continue;
    for (const vpName of onlyVp ?? DEFAULT_VP) {
      if (!VIEWPORTS[vpName]) throw new Error('모르는 뷰포트: ' + vpName);
      const t0 = Date.now();
      await runCombo(fx, vpName);
      const mine = shots.filter((x) => x.fixture === fx && x.viewport === vpName && x.textzoom === TEXTZOOM && x.reduced === REDUCED);
      const n = mine.length;
      const fails = mine.filter((s) => s.status !== 'ok').length;
      console.log(`${fx} ${vpName}: 화면 ${n}개 실패 ${fails} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      // 중간 저장 — 중단돼도 지금까지는 남긴다
      writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify({
        meta: { qaNow: QA_NOW, textzoom: TEXTZOOM, reducedMotion: REDUCED, startedAt, fixtures: meta.fixtures },
        shots,
      }));
    }
  }
} finally {
  await browser.close().catch(() => undefined);
  vite.kill();
  console.log(`끝: 총 ${shots.length}건, ${((Date.now() - startedAt) / 1000).toFixed(0)}s → ${outDir}`);
  process.exit(0);
}
