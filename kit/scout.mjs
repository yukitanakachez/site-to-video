// Scout a page: full-page and first-screen screenshots, an element list and the visible text,
// so the model can direct the video from what is really on the page.
import { copyFileSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { checkLink } from '../lib/link.mjs';
import { browserPath } from '../lib/paths.mjs';

export const VIEWPORTS = {
  wide: { width: 1440, height: 810, deviceScaleFactor: 2 },
  tall: { width: 412, height: 732, deviceScaleFactor: 4, isMobile: true, hasTouch: true },
};
export const MAX_PAGE_HEIGHT = 12000; // CSS px

const BLOCK_PATTERN = /just a moment|verify you are human|attention required|access denied|enable javascript and cookies/i;
export const DISMISS_PATTERN = /^(reject|decline|close|no thanks|only necessary|necessary only)/i;
export const NEVER_PATTERN = /accept|agree|allow/i;
const IDLE_CAP_MS = 15_000;
const NAV_CAP_MS = 45_000;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs inside the page. Everything it needs is passed in; it returns plain data.
function extractInPage({ maxHeight, blockSource, blockFlags }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sx = window.scrollX, sy = window.scrollY;
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };
  const boxOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + sx), y: Math.round(r.top + sy), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const textOf = (el) => norm(el.innerText || el.textContent).slice(0, 300);

  const pageHeight = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
  const limit = Math.min(pageHeight, maxHeight);
  const inRange = (b) => b.y < limit;

  // --- blocking and script share
  const bodyText = (document.body && document.body.innerText) || '';
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  let words = 0;
  for (const s of segmenter.segment(bodyText)) if (s.isWordLike) words++;
  const blockRe = new RegExp(blockSource, blockFlags);
  const blockedBy = blockRe.test(document.title) ? document.title : (bodyText.slice(0, 1500).match(blockRe) || [])[0] || null;
  let latin = 0, letters = 0;
  for (const ch of bodyText) {
    if (/\p{L}/u.test(ch)) { letters++; if (/\p{Script=Latin}/u.test(ch)) latin++; }
  }

  // --- animation hints
  const animated = new Set();
  for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (t) animated.add(t); }
  const animates = (el) => {
    if (getComputedStyle(el).animationName !== 'none') return true;
    for (const t of animated) if (el === t || el.contains(t)) return true;
    return false;
  };
  const hoverable = (el) => {
    if (el.closest('a[href], button, summary, [role=button], [role=tab], [role=menuitem], [aria-haspopup]')) return true;
    return getComputedStyle(el).cursor === 'pointer';
  };

  // --- text blocks
  const PRIMARY = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,button,a,summary,label,dt,dd,td,th';
  const textBlocks = [];
  const taken = new Set();
  const skipTag = /^(script|style|noscript|template)$/i;
  for (const el of document.body.querySelectorAll(`${PRIMARY},div,span`)) {
    if (skipTag.test(el.tagName)) continue;
    const primary = el.matches(PRIMARY);
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    const leaf = primary && !el.querySelector(PRIMARY);
    if (!(ownText || leaf)) continue;
    if (el.tagName === 'A' && el.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,figcaption')) continue;
    let covered = false;
    for (let p = el.parentElement; p; p = p.parentElement) if (taken.has(p)) { covered = true; break; }
    if (covered || !visible(el)) continue;
    const text = textOf(el);
    if (!text) continue;
    const box = boxOf(el);
    if (!inRange(box)) continue;
    taken.add(el);
    textBlocks.push({ text, tag: el.tagName.toLowerCase(), box });
  }
  textBlocks.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);

  // --- elements
  const roles = new Map(); // element -> role (first writer wins)
  const give = (el, role) => { if (!roles.has(el) && visible(el) && inRange(boxOf(el))) roles.set(el, role); };
  const all = (sel) => [...document.body.querySelectorAll(sel)];

  const h1 = all('h1').find(visible) || all('h2').find(visible);
  if (h1) give(h1, 'headline');
  if (h1) {
    const hb = boxOf(h1);
    const sub = all('p,h2,h3').find((el) => {
      if (el === h1 || !visible(el) || !(h1.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
      const b = boxOf(el);
      return b.y >= hb.y && b.y - (hb.y + hb.h) < 400 && norm(el.innerText).length > 15;
    });
    if (sub) give(sub, 'subhead');
  }

  const logo = all('header img, header svg, nav img, nav svg, [role=banner] img, [role=banner] svg').find((el) => {
    if (!visible(el)) return false;
    const b = boxOf(el);
    return b.y < 200 && b.w <= 320 && b.h <= 120;
  });
  if (logo) give(logo, 'logo');

  const origin = (u) => { try { return new URL(u, location.href).hostname.replace(/^www\./, ''); } catch { return null; } };
  const here = origin(location.href);
  const clickable = all('a[href], button, [role=button], input[type=button], input[type=submit]').filter(visible);
  for (const el of clickable) {
    const text = norm(el.innerText || el.value || el.getAttribute('aria-label'));
    const isLink = el.tagName === 'A';
    if (!isLink && /example|sample|preset/i.test(text)) give(el, 'example-button');
  }
  const demoHrefs = [];
  for (const el of clickable) {
    if (el.tagName !== 'A') continue;
    const text = norm(el.innerText || el.getAttribute('aria-label'));
    const href = el.href;
    if (!/^https?:/.test(href) || origin(href) !== here) continue;
    if (!/\b(try|demo|playground|sandbox|live)/i.test(text)) continue;
    if (/log-?in|sign-?(in|up)|register|pricing|checkout/i.test(href)) continue;
    give(el, 'demo-link');
    if (!demoHrefs.includes(href)) demoHrefs.push(href);
  }

  for (const el of all('[role=tab]')) give(el, 'tab');
  for (const el of all('[role=menuitem], [aria-haspopup]:not([aria-haspopup=false]), summary')) give(el, 'menu');

  for (const el of clickable) {
    const b = boxOf(el);
    if (b.y > vh * 1.5 || el.closest('header, nav, [role=banner], [role=navigation]')) continue;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
    const alpha = bg ? (bg[1].split(',')[3] === undefined ? 1 : parseFloat(bg[1].split(',')[3])) : 0;
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    if (alpha > 0.1 && pad >= 12 && norm(el.innerText || el.value)) give(el, 'cta');
  }

  for (const el of all('img, picture, video')) {
    if (el.closest('picture') && el.tagName === 'IMG' && el.parentElement.tagName === 'PICTURE') continue;
    if (visible(el) && boxOf(el).w > vw * 0.3) give(el, 'image');
  }

  // repeated siblings (3 or more) are feature blocks
  const featureGroups = new Map();
  for (const el of document.body.querySelectorAll('*')) {
    if (!el.parentElement || el.closest('header, nav, footer, [role=banner], [role=navigation]')) continue;
    if (!/^(div|li|article|section|a)$/i.test(el.tagName) || !visible(el)) continue;
    if (norm(el.innerText).length < 10) continue;
    const key = `${el.tagName}|${el.className}`;
    const perParent = featureGroups.get(el.parentElement) || new Map();
    perParent.set(key, [...(perParent.get(key) || []), el]);
    featureGroups.set(el.parentElement, perParent);
  }
  let featureCount = 0;
  for (const perParent of featureGroups.values()) {
    for (const group of perParent.values()) {
      if (group.length < 3 || featureCount > 12) continue;
      if (group.some((el) => boxOf(el).w > vw * 0.9)) continue;
      for (const el of group) { give(el, 'feature'); featureCount++; }
    }
  }

  const entries = [...roles].map(([el, role]) => ({ role, box: boxOf(el), text: role === 'image' || role === 'logo' ? norm(el.alt || el.getAttribute('aria-label') || el.title || '') : textOf(el), hoverable: hoverable(el), animates: animates(el) }));
  entries.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);

  return { pageHeight, words, blockedBy, latinShare: letters ? latin / letters : 1, textBlocks, entries, demoHrefs, finalUrl: location.href };
}

// allowHosts lets a test server on loopback through; everything else goes through checkLink.
export function linkGuard(allowHosts = []) {
  return async (target) => {
    let u;
    try { u = new URL(target); } catch { return { ok: false, reason: 'That is not a valid link.' }; }
    if (!/^https?:$/.test(u.protocol)) return { ok: false, reason: 'Only http and https links can be filmed.' };
    if (allowHosts.includes(u.hostname)) return { ok: true };
    return checkLink(target);
  };
}

// Checks every request the page makes: each main-frame navigation and redirect hop on its own,
// subresources once per origin. A refused main-frame hop is remembered; refusal() returns it.
export async function guardRequests(page, guard) {
  let refusal = null;
  const verdicts = new Map(); // origin -> Promise<verdict>
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    try {
      const target = req.url();
      if (/^(data|blob|about):/.test(target)) return void req.continue();
      const isMain = req.isNavigationRequest() && req.frame() === page.mainFrame();
      let origin;
      try { origin = new URL(target).origin; } catch { return void req.abort('blockedbyclient'); }
      let verdict;
      if (isMain) verdict = await guard(target); // every hop, with its own port
      else {
        if (!verdicts.has(origin)) verdicts.set(origin, guard(target));
        verdict = await verdicts.get(origin);
      }
      if (verdict.ok) return void req.continue();
      if (isMain && !refusal) refusal = verdict.reason;
      await req.abort('blockedbyclient');
    } catch { /* request already handled */ }
  });
  return { refusal: () => refusal };
}

// Dismisses a cookie or consent banner with a reject/close-type button, never an accept one.
// Returns the clicked button's text, or null. Also used by kit/capture.mjs.
export async function dismissBanner(page) {
  const clicked = await page.evaluate((dismiss, never) => {
    const dismissRe = new RegExp(dismiss.source, dismiss.flags);
    const neverRe = new RegExp(never.source, never.flags);
    for (const el of document.querySelectorAll('button, [role=button], a[href], input[type=button]')) {
      const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      const r = el.getBoundingClientRect();
      if (!text || r.width < 1 || r.height < 1 || !el.checkVisibility()) continue;
      if (!dismissRe.test(text) || neverRe.test(text)) continue;
      el.click();
      return text;
    }
    return null;
  }, { source: DISMISS_PATTERN.source, flags: DISMISS_PATTERN.flags }, { source: NEVER_PATTERN.source, flags: NEVER_PATTERN.flags });
  if (clicked) await wait(600);
  return clicked;
}

async function scrollThrough(page, limit, step) {
  for (let y = 0; y < limit; y += step) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await wait(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(500);
}

// Some pages navigate themselves after loading (raycast.com at phone width reloads once), which
// destroys the context an evaluate is running in. Let the page settle and read it once more.
const NAV_RACE = /Execution context was destroyed|Cannot find context with specified id|detached Frame/i;
export async function readAfterNavigation(page, read) {
  try {
    return await read();
  } catch (e) {
    if (!NAV_RACE.test(e?.message ?? '')) throw e;
    await page.waitForNetworkIdle({ idleTime: 500, timeout: IDLE_CAP_MS }).catch(() => {});
    return read();
  }
}

// What a scout leaves in its folder: the four files the model reads, and scout.json, the record of
// what was scouted ({ url, format, result }) that a later scout of the same page can reuse.
export const SCOUT_FILES = ['first-screen.png', 'page.png', 'elements.json', 'text.json'];
const RECORD = 'scout.json';

const sameUrl = (a, b) => {
  try { return new URL(a).href === new URL(b).href; } catch { return false; }
};

// R21: the scout stage often films the very page the visit scouted, at the same format. Copy that
// scout's files instead of loading the page again (about 100 s on raycast.com on the work machine).
// Only an unblocked scout of the same page (the link or where it ended up) at the same format counts.
export function reuseScout({ url, format, outDir, from }) {
  let record;
  try { record = JSON.parse(readFileSync(join(from, RECORD), 'utf8')); } catch { return null; }
  const r = record?.result;
  if (!r?.ok || r.blocked || record.format !== format) return null;
  if (!sameUrl(url, record.url) && !sameUrl(url, r.finalUrl)) return null;
  const started = Date.now();
  mkdirSync(outDir, { recursive: true });
  try {
    for (const f of [...SCOUT_FILES, RECORD]) copyFileSync(join(from, f), join(outDir, f));
  } catch { return null; } // a file is missing: scout again
  return { ...r, reused: true, ms: { reuse: Date.now() - started } };
}

// A main document that answers 400 or above is an error page (Task 13 run r1: a Cloudflare 522
// page has plenty of text and passed as an ordinary page). There is nothing of the product to film.
const httpRefusal = (status) => ({
  ok: false,
  reason: `The page answered with an error (HTTP ${status}) instead of its content, so there is nothing to film.`,
});

export async function scout({ url, format, outDir, allowHosts = [], reuseFrom }) {
  const viewport = VIEWPORTS[format];
  if (!viewport) return { ok: false, reason: `Unknown format "${format}"; use wide or tall.` };
  if (reuseFrom) {
    const reused = reuseScout({ url, format, outDir, from: reuseFrom });
    if (reused) return reused;
  }

  const guard = linkGuard(allowHosts);
  const first = await guard(url);
  if (!first.ok) return { ok: false, reason: first.reason };

  mkdirSync(outDir, { recursive: true });
  // A record may only sit beside the files of the scout that wrote it: drop any older one now, so an
  // early return below can never leave it describing another page's screenshots.
  rmSync(join(outDir, RECORD), { force: true });
  // Where the time goes on the work machine (Task 13): launch, load, read (banner, scroll, extract), shots.
  const ms = {};
  let t = Date.now();
  const lap = (name) => { const now = Date.now(); ms[name] = now - t; t = now; };
  const browser = await puppeteer.launch({
    executablePath: browserPath(),
    headless: true,
    args: ['--block-new-web-contents', '--hide-scrollbars', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    lap('launch');

    const guarded = await guardRequests(page, guard);
    // The status of the main document as it finally arrived (after any redirects or a reload).
    let status = null;
    page.on('response', (res) => {
      if (res.request().isNavigationRequest() && res.frame() === page.mainFrame() && !(res.status() >= 300 && res.status() < 400)) status = res.status();
    });

    let gotoStatus = null;
    try {
      gotoStatus = (await page.goto(url, { waitUntil: 'networkidle2', timeout: IDLE_CAP_MS }))?.status() ?? null;
    } catch (e) {
      if (guarded.refusal()) return { ok: false, reason: guarded.refusal(), ms };
      if (e.name !== 'TimeoutError') return { ok: false, reason: `The page could not be loaded (${e.message.replace(/^net::/, '')}).`, ms };
      // the page was still busy after the cap; film what is there
    }
    if (guarded.refusal()) return { ok: false, reason: guarded.refusal(), ms };
    lap('load');
    // If the listener saw no main-document response, fall back to the one page.goto returned.
    if (status === null) status = gotoStatus;
    if (status >= 400) return { ...httpRefusal(status), ms };

    const read = async () => {
      t = Date.now(); // a second read (after the page navigated itself) is timed on its own
      await page.evaluate(() => document.fonts.ready);
      await dismissBanner(page);
      const pageHeight = await page.evaluate(() => Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)));
      await scrollThrough(page, Math.min(pageHeight, MAX_PAGE_HEIGHT), viewport.height);
      await page.evaluate(() => document.fonts.ready);
      if (guarded.refusal()) return { data: null, refusal: guarded.refusal() }; // a late meta refresh or script redirect

      const data = await page.evaluate(extractInPage, { maxHeight: MAX_PAGE_HEIGHT, blockSource: BLOCK_PATTERN.source, blockFlags: BLOCK_PATTERN.flags });
      if (guarded.refusal()) return { data: null, refusal: guarded.refusal() };

      lap('read');
      // Pixels first: even a blocked page is worth a look for whoever reads the report.
      await page.screenshot({ path: join(outDir, 'first-screen.png'), type: 'png' });
      const shotHeight = Math.min(data.pageHeight, MAX_PAGE_HEIGHT);
      await page.screenshot({
        path: join(outDir, 'page.png'),
        type: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: viewport.width, height: shotHeight },
      });
      lap('shots');
      return { data, refusal: null };
    };
    const got = await readAfterNavigation(page, read);
    if (got.refusal) return { ok: false, reason: got.refusal, ms };
    if (status >= 400) { // the page reloaded itself into an error; its pictures are not worth keeping
      for (const f of ['first-screen.png', 'page.png']) rmSync(join(outDir, f), { force: true });
      return { ...httpRefusal(status), ms };
    }
    const { data } = got;
    const finalUrl = data.finalUrl;
    const capped = data.pageHeight > MAX_PAGE_HEIGHT;
    const shotHeight = Math.min(data.pageHeight, MAX_PAGE_HEIGHT);
    const elements = data.entries.map((e, i) => ({ id: `e${i + 1}`, ...e }));
    const text = data.textBlocks.map((t, i) => ({ id: `t${i + 1}`, ...t }));
    writeFileSync(join(outDir, 'elements.json'), JSON.stringify(elements, null, 2));
    writeFileSync(join(outDir, 'text.json'), JSON.stringify(text, null, 2));

    let result;
    if (data.blockedBy) result = { ok: true, blocked: true, reason: `The page shows a bot challenge or access block ("${data.blockedBy}").` };
    else if (data.words < 20) result = { ok: true, blocked: true, reason: `The page shows almost no readable text (${data.words} words); it may be blocked or need JavaScript.` };
    else {
      result = {
        ok: true,
        finalUrl,
        pageHeight: shotHeight,
        capped,
        latinShare: Math.round(data.latinShare * 1000) / 1000,
        demoLinks: data.demoHrefs,
        blocked: false,
      };
    }
    writeFileSync(join(outDir, RECORD), JSON.stringify({ url, format, result }, null, 2));
    return { ...result, ms };
  } finally {
    await browser.close().catch(() => {});
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const [url, format, outDir, reuseFrom] = [flag('url'), flag('format'), flag('out'), flag('reuse')];
  if (!url || !format || !outDir) {
    console.error('usage: node kit/scout.mjs --url <url> --format <wide|tall> --out <dir> [--reuse <an earlier scout folder>]');
    process.exit(2);
  }
  const timer = setTimeout(() => { console.error('scout timed out'); process.exit(2); }, NAV_CAP_MS + 120_000);
  try {
    const result = await scout({ url, format, outDir, reuseFrom });
    console.log(JSON.stringify(result));
    process.exit(result.ok ? 0 : 1);
  } catch (e) {
    console.error(`the scout could not run: ${e.message}`);
    process.exit(2);
  } finally { clearTimeout(timer); }
}
