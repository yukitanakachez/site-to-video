import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { scout, VIEWPORTS, MAX_PAGE_HEIGHT, readAfterNavigation } from '../kit/scout.mjs';
import { startServer, pngWidth, pngSize } from './helpers.mjs';

let srv, outDir;
const allowHosts = ['127.0.0.1'];
const read = (name) => JSON.parse(readFileSync(join(outDir, name), 'utf8'));

before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });
beforeEach(() => { outDir = mkdtempSync(join(tmpdir(), 'scout-')); srv.clicked.length = 0; });

test('constants match the brief', () => {
  assert.equal(MAX_PAGE_HEIGHT, 12000);
  assert.deepEqual(VIEWPORTS.wide, { width: 1440, height: 810, deviceScaleFactor: 2 });
  assert.equal(VIEWPORTS.tall.deviceScaleFactor, 4);
});

test('scout writes page.png, first-screen.png, elements.json, text.json for a landing page', async () => {
  const r = await scout({ url: `${srv.base}/landing.html`, format: 'wide', outDir, allowHosts });
  assert.equal(r.ok, true); assert.equal(r.blocked, false); assert.equal(r.capped, false);
  assert.deepEqual(Object.keys(r.ms), ['launch', 'load', 'read', 'shots']); // Task 13: where the time goes
  const els = read('elements.json');
  assert.ok(els.some((e) => e.role === 'headline' && e.text === 'Ship faster with Fixture'));
  assert.ok(els.some((e) => e.role === 'cta' && e.hoverable && e.text === 'Get started'));
  assert.ok(els.some((e) => e.role === 'logo'));
  assert.ok(els.some((e) => e.role === 'image'));
  assert.equal(els.filter((e) => e.role === 'feature').length, 3);
  assert.ok(els.find((e) => e.role === 'headline').animates);
  assert.deepEqual(els.map((e) => e.id), els.map((_, i) => `e${i + 1}`));
  for (const e of els) assert.ok(e.box.w > 0 && e.box.h > 0);
  const text = read('text.json');
  assert.ok(text.some((t) => t.tag === 'h1' && t.text === 'Ship faster with Fixture'));
  assert.deepEqual(text.map((t) => t.id), text.map((_, i) => `t${i + 1}`));
  assert.equal(pngWidth(join(outDir, 'page.png')), 2880);
  assert.deepEqual(pngSize(join(outDir, 'first-screen.png')), { width: 2880, height: 1620 });
  assert.equal(r.finalUrl, `${srv.base}/landing.html`);
});

test('tall format captures at phone width x4', async () => {
  const r = await scout({ url: `${srv.base}/landing.html`, format: 'tall', outDir, allowHosts });
  assert.equal(r.ok, true);
  assert.equal(pngWidth(join(outDir, 'page.png')), 1648);
});

test('scout caps a 50000px page at MAX_PAGE_HEIGHT', async () => {
  const r = await scout({ url: `${srv.base}/long.html`, format: 'wide', outDir, allowHosts });
  assert.equal(r.ok, true);
  assert.equal(r.capped, true);
  assert.equal(r.pageHeight, 12000);
  assert.equal(pngSize(join(outDir, 'page.png')).height, 24000);
  assert.ok(read('elements.json').every((e) => e.box.y < 12000));
  assert.ok(read('text.json').every((t) => t.box.y < 12000));
});

// Task 12 run 2: raycast.com at phone width navigated itself while the scout read it, and the
// scout died twice with "Execution context was destroyed".
test('readAfterNavigation retries once after the page navigates mid-read, and only for that', async () => {
  let settled = 0;
  const page = { waitForNetworkIdle: async () => { settled++; } };
  let calls = 0;
  const flaky = async () => { if (++calls === 1) throw new Error('Execution context was destroyed, most likely because of a navigation.'); return 'read'; };
  assert.equal(await readAfterNavigation(page, flaky), 'read');
  assert.equal(calls, 2); assert.equal(settled, 1);

  calls = 0;
  const always = async () => { calls++; throw new Error('Execution context was destroyed, most likely because of a navigation.'); };
  await assert.rejects(readAfterNavigation(page, always), /Execution context/);
  assert.equal(calls, 2);

  calls = 0;
  const other = async () => { calls++; throw new Error('something else'); };
  await assert.rejects(readAfterNavigation(page, other), /something else/);
  assert.equal(calls, 1);
});

test('scout reports blocked on a challenge page', async () => {
  const r = await scout({ url: `${srv.base}/challenge.html`, format: 'wide', outDir, allowHosts });
  assert.equal(r.ok, true); assert.equal(r.blocked, true);
  assert.match(r.reason, /challenge|blocked|human/i);
});

test('scout dismisses a cookie banner with a reject/close button and never clicks accept', async () => {
  const r = await scout({ url: `${srv.base}/cookie.html`, format: 'wide', outDir, allowHosts });
  assert.equal(r.ok, true);
  assert.deepEqual(srv.clicked, ['reject']);
  assert.ok(!read('text.json').some((t) => /cookies/i.test(t.text)));
});

test('scout aborts when a navigation resolves to a private address', async () => {
  for (const path of ['/redirect-private.html', '/redirect302']) {
    const r = await scout({ url: `${srv.base}${path}`, format: 'wide', outDir, allowHosts });
    assert.equal(r.ok, false, path);
    assert.match(r.reason, /private/, path);
  }
});

test('scout refuses a loopback link when it is not allow-listed', async () => {
  const r = await scout({ url: `${srv.base}/landing.html`, format: 'wide', outDir });
  assert.equal(r.ok, false);
  assert.match(r.reason, /private|port/i);
  assert.equal(existsSync(join(outDir, 'page.png')), false);
});

test('scout reports dominant script', async () => {
  const jp = await scout({ url: `${srv.base}/japanese.html`, format: 'wide', outDir, allowHosts });
  assert.equal(jp.ok, true); assert.equal(jp.blocked, false);
  assert.ok(jp.latinShare < 0.6, `japanese ${jp.latinShare}`);
  const en = await scout({ url: `${srv.base}/landing.html`, format: 'wide', outDir, allowHosts });
  assert.ok(en.latinShare > 0.9, `english ${en.latinShare}`);
});

test('scout lists same-site demo links and example buttons', async () => {
  const r = await scout({ url: `${srv.base}/landing.html`, format: 'wide', outDir, allowHosts });
  assert.deepEqual(r.demoLinks, [`${srv.base}/playground`]);
  const els = read('elements.json');
  assert.ok(els.some((e) => e.role === 'demo-link' && e.text === 'Try it'));
  assert.ok(els.some((e) => e.role === 'example-button' && e.text === 'Try an example'));
});

// Task 13 run r1: a Cloudflare 522 error page passed as an ordinary page (blocked: false).
test('scout refuses a main document that answers with an HTTP error, and films nothing', async () => {
  for (const code of [500, 522]) {
    const r = await scout({ url: `${srv.base}/status${code}`, format: 'wide', outDir, allowHosts });
    assert.equal(r.ok, false, String(code));
    assert.match(r.reason, new RegExp(`HTTP ${code}`), r.reason);
    assert.equal(existsSync(join(outDir, 'page.png')), false);
    assert.ok(r.ms && typeof r.ms.launch === 'number', 'timings come back on a refusal too');
  }
});

test('scout refuses a redirect into an error and a page that reloads itself into one', async () => {
  for (const path of ['/r302', '/selfbreak']) {
    const r = await scout({ url: `${srv.base}${path}`, format: 'wide', outDir, allowHosts });
    assert.equal(r.ok, false, path);
    assert.match(r.reason, /HTTP 404/, r.reason);
  }
});

test('a refusing scout into a folder leaves nothing for reuse to hand over', async () => {
  const url = `${srv.base}/landing.html`;
  assert.equal((await scout({ url, format: 'wide', outDir, allowHosts })).ok, true);
  const bad = await scout({ url: `${srv.base}/selfbreak`, format: 'wide', outDir, allowHosts });
  assert.equal(bad.ok, false);
  const again = mkdtempSync(join(tmpdir(), 'scout-again-'));
  try {
    const r = await scout({ url, format: 'wide', outDir: again, allowHosts, reuseFrom: outDir });
    assert.ok(!r.reused);
    assert.equal(existsSync(join(outDir, 'scout.json')), false);
  } finally { rmSync(again, { recursive: true, force: true }); }
});

test('scout reports its timings on a blocked page too', async () => {
  const r = await scout({ url: `${srv.base}/challenge.html`, format: 'wide', outDir, allowHosts });
  assert.equal(r.blocked, true);
  assert.deepEqual(Object.keys(r.ms), ['launch', 'load', 'read', 'shots']);
});

// R21: when the page to film is the link itself at the same format, the scout stage reuses the
// visit's files instead of loading the page again (about 100 s on raycast.com on the work machine).
const SCOUT_FILES = ['first-screen.png', 'page.png', 'elements.json', 'text.json'];
const sameBytes = (a, b) => readFileSync(a).equals(readFileSync(b));

test('scout reuses an earlier scout of the same page at the same format', async () => {
  const url = `${srv.base}/landing.html`;
  const first = await scout({ url, format: 'wide', outDir, allowHosts });
  const again = mkdtempSync(join(tmpdir(), 'scout-again-'));
  try {
    for (const asked of [url, first.finalUrl, url.replace("http:", "HTTP:")]) {
      const r = await scout({ url: asked, format: 'wide', outDir: again, allowHosts, reuseFrom: outDir });
      assert.equal(r.reused, true, asked);
      const { ms, reused, ...rest } = r;
      const { ms: _m, ...firstRest } = first;
      assert.deepEqual(rest, firstRest);
      for (const f of SCOUT_FILES) assert.ok(sameBytes(join(outDir, f), join(again, f)), f);
    }
  } finally { rmSync(again, { recursive: true, force: true }); }
});

test('scout loads the page again when the format or the page differs, or there is nothing to reuse', async () => {
  const url = `${srv.base}/landing.html`;
  await scout({ url, format: 'wide', outDir, allowHosts });
  const again = mkdtempSync(join(tmpdir(), 'scout-again-'));
  try {
    const tall = await scout({ url, format: 'tall', outDir: again, allowHosts, reuseFrom: outDir });
    assert.equal(tall.ok, true); assert.ok(!tall.reused);
    assert.equal(pngWidth(join(again, 'page.png')), 1648);

    const other = await scout({ url: `${srv.base}/long.html`, format: 'wide', outDir: again, allowHosts, reuseFrom: outDir });
    assert.ok(!other.reused); assert.equal(other.capped, true);

    const none = await scout({ url, format: 'wide', outDir: again, allowHosts, reuseFrom: join(again, 'missing') });
    assert.equal(none.ok, true); assert.ok(!none.reused);
  } finally { rmSync(again, { recursive: true, force: true }); }
});

test('scout never reuses a blocked scout', async () => {
  const url = `${srv.base}/challenge.html`;
  await scout({ url, format: 'wide', outDir, allowHosts });
  const again = mkdtempSync(join(tmpdir(), 'scout-again-'));
  try {
    const r = await scout({ url, format: 'wide', outDir: again, allowHosts, reuseFrom: outDir });
    assert.equal(r.blocked, true); assert.ok(!r.reused);
  } finally { rmSync(again, { recursive: true, force: true }); }
});

test('the scout command line takes --reuse', async () => {
  const url = `${srv.base}/landing.html`;
  await scout({ url, format: 'wide', outDir, allowHosts });
  const again = mkdtempSync(join(tmpdir(), 'scout-again-'));
  try {
    const script = new URL('../kit/scout.mjs', import.meta.url).pathname;
    const run = spawnSync(process.execPath, [script, '--url', url, '--format', 'wide', '--out', again, '--reuse', outDir], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).reused, true);
    for (const f of SCOUT_FILES) assert.ok(existsSync(join(again, f)), f);
  } finally { rmSync(again, { recursive: true, force: true }); }
});
