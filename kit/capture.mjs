// Capture one moment of a live page as a smooth 30 fps clip (spec 7.1 stage 4).
// Method (Task 2, DECISIONS.md captureMethod "virtual-time"): the page's clock is frozen and moved
// forward 1/30 s per frame (requestAnimationFrame, performance.now, Date and every CSS animation and
// transition), with one screenshot per frame. It cannot stutter on a slow machine, only take longer.
//
// What it may do on someone else's live product (spec 5.5, coordinator ruling R2): hover, scroll,
// wait, and click only the page's own demo links and example buttons (elements.json roles demo-link
// and example-button), tabs, menus ([role=tab], [role=menuitem], [aria-haspopup]), summary and
// details' summary. Any other click, and any typing or form filling, is refused and nothing is
// written. The target is checked again after the pointer arrives, just before the press, so a
// hover-opened overlay cannot slip another button under the click (ruling R12).
// Every main-frame navigation and redirect is re-checked like the scout does (kit/scout.mjs).
//
// Coordinates: action x, y are document CSS pixels, the same units as elements.json boxes. The
// returned cursor path is in clip pixels (viewport CSS px x deviceScaleFactor), the units the shot
// list's camera rects and cursor points use for a clip.
//
// CLI: node kit/capture.mjs --shotlist <f> --moment <id> --actions <json> --work <dir> [--url <url>]
// The URL defaults to <work>/facts.json "source"; the clip goes to <work>/<moment source.file>.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { VIEWPORTS, linkGuard, guardRequests, dismissBanner } from './scout.mjs';
import { browserPath } from '../lib/paths.mjs';
import { memorySampler } from '../lib/machine.mjs';
import paceLib from '../lib/pace.cjs';

export const FPS = 30;
const SCROLL_SEC = 0.8; // an animated scroll takes this long
const IDLE_CAP_MS = 15_000;
// A clip is recorded for its moment's plan-seconds (the video plays it pace times faster, lib/pace.cjs),
// so the cap is a whole video's plan length.
const MAX_DURATION_SEC = Math.round(20 * paceLib.pace() * 100) / 100;
const ACTIONS = new Set(['hover', 'click', 'scroll', 'wait']);
const TYPING = new Set(['type', 'fill', 'press', 'keyboard', 'insertText', 'input', 'select', 'submit', 'upload']);
const CLICK_ROLES = new Set(['demo-link', 'example-button']);
// Not `details`: anything inside an open details body would match it through closest() (R12).
const TAB_OR_MENU = '[role=tab], [role=menuitem], [aria-haspopup]:not([aria-haspopup=false]), summary';
const INTERACTIVE = `a[href], button, input, select, textarea, label, [role=button], [role=link], ${TAB_OR_MENU}`;
const BOX_TOLERANCE = 4; // CSS px between a clicked element's box and its elements.json box

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

// True when the click target is a tab, menu or summary, or is the very element the scout
// listed as a demo link or example button (matched by its box).
export function allowedClick(target, elements = []) {
  if (target.matchesTabOrMenu) return true;
  const near = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) <= BOX_TOLERANCE);
  return elements.some((e) => CLICK_ROLES.has(e.role) && e.box && near(e.box, target.box));
}

export function checkActions(actions, durationSec) {
  if (!Array.isArray(actions)) throw new Error('actions must be a list');
  actions.forEach((a, i) => {
    const n = `action ${i + 1}`;
    if (TYPING.has(a?.type) || 'text' in (a ?? {}) || 'value' in (a ?? {})) {
      throw new Error(`${n}: typing and form filling are never allowed on a live product (spec 5.5)`);
    }
    if (!ACTIONS.has(a?.type)) throw new Error(`${n}: "${a?.type}" is not an allowed action; use hover, click, scroll or wait`);
    if (!isNum(a.atSec) || a.atSec < 0 || a.atSec >= durationSec) throw new Error(`${n}: atSec must be from 0 to below ${durationSec}`);
    if ((a.type === 'hover' || a.type === 'click') && !(typeof a.selector === 'string' || (isNum(a.x) && isNum(a.y)))) {
      throw new Error(`${n}: ${a.type} needs a selector (an elements.json id such as "e3", or CSS) or x and y`);
    }
    if (a.type === 'scroll' && !isNum(a.dy)) throw new Error(`${n}: scroll needs dy (CSS px, positive scrolls down)`);
  });
}

// Injected before any page script. Freezes time; window.__vt.advance(ms) moves it forward.
// From spikes/capture-spike.mjs (Task 2).
function virtualClock() {
  const epoch = Date.now();
  const RealDate = Date;
  let now = 0;
  let rafQueue = [];
  let rafId = 0;
  const seen = new WeakMap(); // Animation -> { base: its currentTime when first seen, at: virtual time then }

  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { rafQueue.push({ id: ++rafId, cb }); return rafId; };
  window.cancelAnimationFrame = (id) => { rafQueue = rafQueue.filter((r) => r.id !== id); };
  class VDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(epoch + now); else super(...a); }
    static now() { return epoch + now; }
  }
  window.Date = VDate;

  function sync() {
    for (const a of document.getAnimations()) {
      if (!seen.has(a)) { a.pause(); seen.set(a, { base: a.currentTime || 0, at: now }); }
      const s = seen.get(a);
      a.currentTime = s.base + (now - s.at);
    }
  }
  window.__vt = {
    sync,
    advance(ms) {
      now += ms;
      const queue = rafQueue; rafQueue = [];
      for (const r of queue) r.cb(now);
      sync();
    },
  };
  document.addEventListener('DOMContentLoaded', sync);
}

// Runs in the page: what would a click at viewport point (vx, vy) land on?
function targetAt({ vx, vy, interactive, tabOrMenu }) {
  const hit = document.elementFromPoint(vx, vy);
  if (!hit) return null;
  const el = hit.closest(interactive) || hit;
  const r = el.getBoundingClientRect();
  const label = (el.innerText || el.getAttribute('aria-label') || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return {
    matchesTabOrMenu: el.matches(tabOrMenu),
    box: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
    desc: `<${el.tagName.toLowerCase()}>${label ? ` "${label}"` : ''}`,
  };
}

function encode(framesDir, outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', join(framesDir, 'f%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', outPath], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg could not encode the clip: ${(r.stderr || r.error?.message || '').trim()}`);
}

export async function captureMoment({ url, format, actions = [], durationSec, outPath, elements = [], allowHosts = [] }) {
  const viewport = VIEWPORTS[format];
  if (!viewport) throw new Error(`Unknown format "${format}"; use wide or tall.`);
  if (!isNum(durationSec) || durationSec < 0.5 || durationSec > MAX_DURATION_SEC) throw new Error(`durationSec must be 0.5 to ${MAX_DURATION_SEC}`);
  checkActions(actions, durationSec);

  const guard = linkGuard(allowHosts);
  const first = await guard(url);
  if (!first.ok) throw new Error(first.reason);

  const frames = Math.round(durationSec * FPS);
  const step = 1000 / FPS;
  const dpr = viewport.deviceScaleFactor;
  const framesDir = mkdtempSync(join(tmpdir(), 'capture-frames-'));
  const browser = await puppeteer.launch({
    executablePath: browserPath(),
    headless: true,
    args: ['--block-new-web-contents', '--hide-scrollbars', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    const guarded = await guardRequests(page, guard);
    const refused = () => { if (guarded.refusal()) throw new Error(guarded.refusal()); };
    await page.evaluateOnNewDocument(virtualClock);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: IDLE_CAP_MS });
    } catch (e) {
      refused();
      if (e.name !== 'TimeoutError') throw new Error(`The page could not be loaded (${e.message.replace(/^net::/, '')}).`);
    }
    refused();
    await page.evaluate(() => document.fonts.ready);

    // Run fn(page) in the current document; if a click navigated away, wait for the new one.
    const inPage = async (fn, arg) => {
      try { return await page.evaluate(fn, arg); } catch (e) {
        if (!/context was destroyed|detached|navigat/i.test(e.message)) throw e;
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: IDLE_CAP_MS }).catch(() => {});
        refused();
        return page.evaluate(fn, arg);
      }
    };
    const advance = (ms) => inPage((m) => window.__vt?.advance(m), ms);

    // scout's dismissBanner waits 600 ms real time; the virtual clock then needs the same 600 ms
    if (await dismissBanner(page)) for (let t = 0; t < 600; t += step) await advance(step);

    // Scrolls at atSec 0 are jumps taken before the first frame, so a clip can start further down.
    const jumps = actions.filter((a) => a.type === 'scroll' && a.atSec < 0.5 / FPS);
    for (const a of jumps) await page.evaluate((dy) => window.scrollBy({ left: 0, top: dy, behavior: 'instant' }), a.dy);
    if (jumps.length) { await wait(500); await page.evaluate(() => document.fonts.ready); }
    await inPage(() => window.__vt?.sync());

    const byFrame = new Map();
    for (const [i, a] of actions.entries()) {
      if (jumps.includes(a)) continue;
      const f = Math.round(a.atSec * FPS);
      byFrame.set(f, [...(byFrame.get(f) ?? []), { ...a, n: i + 1 }]);
    }
    const scrolls = []; // { from, dy, start }
    const cursor = [];
    // Headless Chrome drops :hover on the next frame after a script scroll unless the pointer is
    // moved twice (found in Task 7). So every pointer move is sent twice, and repeated after scrolls.
    let mouse = null;
    const pointTo = async ({ vx, vy }) => {
      mouse = { vx, vy };
      await page.mouse.move(vx, vy);
      await page.mouse.move(vx, vy);
    };

    const pointFor = async (a) => {
      const scroll = await inPage(() => ({ x: scrollX, y: scrollY, w: innerWidth, h: innerHeight }));
      let x = a.x, y = a.y;
      if (typeof a.selector === 'string') {
        const el = elements.find((e) => e.id === a.selector);
        const box = el ? el.box : await inPage((sel) => {
          const node = document.querySelector(sel);
          if (!node) return null;
          const r = node.getBoundingClientRect();
          return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
        }, a.selector);
        if (!box) throw new Error(`action ${a.n}: nothing matches selector "${a.selector}"`);
        x = box.x + box.w / 2; y = box.y + box.h / 2;
      }
      const vx = x - scroll.x, vy = y - scroll.y;
      if (vx < 0 || vy < 0 || vx >= scroll.w || vy >= scroll.h) {
        throw new Error(`action ${a.n}: point (${Math.round(x)}, ${Math.round(y)}) is off screen at ${a.atSec}s; scroll to it first`);
      }
      return { vx, vy };
    };

    for (let i = 0; i < frames; i++) {
      if (i > 0) await advance(step);
      const t = i / FPS;
      for (const a of byFrame.get(i) ?? []) {
        if (a.type === 'scroll') {
          const from = await inPage(() => scrollY);
          scrolls.push({ from, dy: a.dy, start: t });
        } else if (a.type === 'hover' || a.type === 'click') {
          const { vx, vy } = await pointFor(a);
          if (a.type === 'click') {
            const check = async () => {
              const target = await inPage(targetAt, { vx, vy, interactive: INTERACTIVE, tabOrMenu: TAB_OR_MENU });
              if (!target || !allowedClick(target, elements)) {
                throw new Error(`action ${a.n}: not allowed to click ${target?.desc ?? 'that point'}; only the page's own demo links and example buttons, tabs, menus and summary may be clicked (spec 5.5)`);
              }
              return target;
            };
            const before = await check();
            await pointTo({ vx, vy });
            // the hover may have opened something over the point: check what the press would land on now
            const now = await check();
            if (now.desc !== before.desc || ['x', 'y', 'w', 'h'].some((k) => now.box[k] !== before.box[k])) {
              throw new Error(`action ${a.n}: not allowed to click; the target changed under the pointer from ${before.desc} to ${now.desc}`);
            }
            await page.mouse.down();
            await page.mouse.up();
            await wait(250); // let a click's handlers and any navigation start
          } else await pointTo({ vx, vy });
          cursor.push({ atSec: a.atSec, x: Math.round(vx * dpr), y: Math.round(vy * dpr), click: a.type === 'click' });
        }
      }
      for (const s of scrolls) {
        if (t - s.start > SCROLL_SEC + 0.5 / FPS) continue;
        const p = Math.min(1, (t - s.start) / SCROLL_SEC);
        await inPage((y) => window.scrollTo({ left: 0, top: y, behavior: 'instant' }), s.from + s.dy * easeInOut(p));
        if (mouse) await pointTo(mouse);
      }
      await inPage(() => window.__vt?.sync()); // freeze transitions a hover, click or scroll started
      refused();
      // page.screenshot, not a separate CDP session: emulation (deviceScaleFactor) is per session,
      // and a new session's screenshots come out at CSS size.
      writeFileSync(join(framesDir, `f${String(i).padStart(5, '0')}.jpg`), await page.screenshot({ type: 'jpeg', quality: 90, captureBeyondViewport: false }));
    }
    refused();
    encode(framesDir, outPath);
    return { file: outPath, fps: FPS, frames, cursor };
  } finally {
    await browser.close().catch(() => {});
    rmSync(framesDir, { recursive: true, force: true });
  }
}

async function cli(args) {
  const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const [shotlistPath, momentId, actionsJson, work] = [flag('shotlist'), flag('moment'), flag('actions'), flag('work')];
  if (!shotlistPath || !momentId || !work) {
    console.error('usage: node kit/capture.mjs --shotlist <f> --moment <id> --actions <json> --work <dir> [--url <url>]');
    return 2;
  }
  const shot = JSON.parse(readFileSync(shotlistPath, 'utf8'));
  const m = (shot.moments ?? []).find((x) => x.id === momentId);
  if (!m) { console.error(`no moment "${momentId}" in the shot list`); return 2; }
  if (m.source?.type !== 'clip' || typeof m.source.file !== 'string') { console.error(`moment ${momentId} is not a clip moment`); return 2; }
  const outPath = resolve(work, m.source.file);
  if (!outPath.startsWith(resolve(work) + sep)) { console.error('the clip file must be inside the work folder'); return 2; }
  let url = flag('url');
  if (!url) {
    const factsPath = join(work, 'facts.json');
    if (!existsSync(factsPath)) { console.error('no --url and no facts.json in the work folder'); return 2; }
    url = JSON.parse(readFileSync(factsPath, 'utf8')).source;
  }
  const elementsPath = join(work, 'captures', 'elements.json');
  const elements = existsSync(elementsPath) ? JSON.parse(readFileSync(elementsPath, 'utf8')) : [];
  const actions = actionsJson ? JSON.parse(actionsJson) : [];
  // wallMs and machine: what the capture cost on this machine (Task 13).
  const started = Date.now();
  const mem = memorySampler();
  const result = await captureMoment({ url, format: shot.format, actions, durationSec: m.endSec - m.startSec, outPath, elements });
  console.log(JSON.stringify({ ...result, wallMs: Date.now() - started, machine: mem.stop() }));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  cli(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    console.error(`capture refused or failed: ${e.message}`);
    process.exit(1);
  });
}
