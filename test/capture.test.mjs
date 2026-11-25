import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { captureMoment, allowedClick } from '../kit/capture.mjs';
import { scout } from '../kit/scout.mjs';
import { startServer } from './helpers.mjs';
import paceLib from '../lib/pace.cjs';

const allowHosts = ['127.0.0.1'];
let srv, dir, elements;

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,codec_name', '-of', 'json', file], { encoding: 'utf8' });
  const s = JSON.parse(r.stdout).streams[0];
  const [a, b] = s.r_frame_rate.split('/').map(Number);
  return { width: s.width, height: s.height, fps: a / b, frames: Number(s.nb_read_frames), codec: s.codec_name };
}

// Mean absolute difference between two frames of a video, 0-255.
function frameDiff(file, t1, t2) {
  const grab = (t) => spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1',
    '-vf', 'scale=160:90', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 20 }).stdout;
  const a = grab(t1), b = grab(t2);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

before(async () => {
  srv = await startServer();
  dir = mkdtempSync(join(tmpdir(), 'capture-'));
  const r = await scout({ url: `${srv.base}/landing.html`, format: 'wide', outDir: join(dir, 'captures'), allowHosts });
  assert.equal(r.ok, true);
  elements = JSON.parse(readFileSync(join(dir, 'captures', 'elements.json'), 'utf8'));
});
after(async () => { await srv.close(); rmSync(dir, { recursive: true, force: true }); });

const box = (role, text) => elements.find((e) => e.role === role && (!text || e.text === text)).box;
const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

test('captureMoment records a hover at 30 fps', async () => {
  const outPath = join(dir, 'clips', 'hover.mp4');
  const cta = centre(box('cta', 'Get started'));
  const r = await captureMoment({
    url: `${srv.base}/landing.html`, format: 'wide', durationSec: 2, outPath, elements, allowHosts,
    actions: [{ atSec: 0.5, type: 'hover', ...cta }, { atSec: 1.0, type: 'scroll', dy: 300 }],
  });
  assert.equal(r.file, outPath);
  assert.equal(r.fps, 30);
  assert.equal(r.frames, 60);
  const p = probe(outPath);
  assert.equal(p.codec, 'h264');
  assert.equal(p.fps, 30);
  assert.ok(p.frames >= 29 * 2, `${p.frames} frames for 2 s`);
  assert.deepEqual([p.width, p.height], [2880, 1620]);
  // the scroll at 1.0 s moves the page; before it, nothing does
  assert.ok(frameDiff(outPath, 1.9, 0.9) > 2, 'the scroll should change the picture');
  // the cursor path for the shot list is returned in clip pixels (CSS px x DPR, viewport-relative)
  assert.deepEqual(r.cursor[0], { atSec: 0.5, x: Math.round(cta.x * 2), y: Math.round(cta.y * 2), click: false });
});

test('captureMoment allows a click on the site\'s own example button', async () => {
  const outPath = join(dir, 'clips', 'example.mp4');
  const ex = centre(box('example-button'));
  const r = await captureMoment({
    url: `${srv.base}/landing.html`, format: 'wide', durationSec: 1, outPath, elements, allowHosts,
    actions: [{ atSec: 0.3, type: 'click', ...ex }],
  });
  assert.equal(r.frames, 30);
  assert.equal(r.cursor[0].click, true);
});

test('captureMoment refuses a click on a non-allowed element and any typing', async () => {
  const url = `${srv.base}/landing.html`;
  const outPath = join(dir, 'clips', 'refused.mp4');
  await assert.rejects(
    captureMoment({ url, format: 'wide', durationSec: 1, outPath, elements, allowHosts,
      actions: [{ atSec: 0.2, type: 'click', ...centre(box('cta', 'Get started')) }] }),
    /not allowed to click/);
  assert.equal(existsSync(outPath), false);
  for (const type of ['type', 'fill', 'press', 'submit']) {
    await assert.rejects(
      captureMoment({ url, format: 'wide', durationSec: 1, outPath, elements, allowHosts,
        actions: [{ atSec: 0.2, type, selector: 'input', text: 'hello' }] }),
      /typing|not an allowed action/);
  }
  // a click on a CSS selector that is not tab, menu, demo link or example button
  await assert.rejects(
    captureMoment({ url, format: 'wide', durationSec: 1, outPath, elements, allowHosts,
      actions: [{ atSec: 0.2, type: 'click', selector: 'a[href="/pricing"]' }] }),
    /not allowed to click/);
  assert.equal(existsSync(outPath), false);
});

test('captureMoment refuses a redirect to a private address', async () => {
  await assert.rejects(
    captureMoment({ url: `${srv.base}/redirect302`, format: 'wide', durationSec: 1, outPath: join(dir, 'x.mp4'), elements: [], allowHosts,
      actions: [] }),
    /private or local network/);
});

test('captureMoment refuses a private link outright', async () => {
  await assert.rejects(
    captureMoment({ url: 'http://10.0.0.1/', format: 'wide', durationSec: 1, outPath: join(dir, 'y.mp4'), actions: [] }),
    /private or local network/);
});

test('allowedClick: tabs, menus, summary and details are allowed; only listed demo links and example buttons otherwise', () => {
  const b = { x: 5, y: 5, w: 20, h: 20 };
  assert.equal(allowedClick({ matchesTabOrMenu: true, box: b }, []), true);
  assert.equal(allowedClick({ matchesTabOrMenu: false, box: b }, [{ role: 'example-button', box: { x: 7, y: 4, w: 19, h: 22 } }]), true);
  assert.equal(allowedClick({ matchesTabOrMenu: false, box: b }, [{ role: 'demo-link', box: b }]), true);
  assert.equal(allowedClick({ matchesTabOrMenu: false, box: b }, [{ role: 'cta', box: b }]), false);
  assert.equal(allowedClick({ matchesTabOrMenu: false, box: b }, [{ role: 'example-button', box: { x: 50, y: 5, w: 20, h: 20 } }]), false);
});

test('a hover after a scroll shows the page\'s own hover effect', async () => {
  // Headless Chrome drops :hover on the frame after a script scroll unless the pointer is moved twice.
  const page = readFileSync(new URL('./fixtures/job-good/site/index.html', import.meta.url));
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const outPath = join(dir, 'clips', 'hover-after-scroll.mp4');
    // the job-good page at 1440x810 scrolls at most 644 px; its middle card's centre is at (720, 1188)
    await captureMoment({
      url: `http://127.0.0.1:${server.address().port}/`, format: 'wide', durationSec: 2, outPath, allowHosts,
      actions: [{ atSec: 0, type: 'scroll', dy: 644 }, { atSec: 1.0, type: 'hover', x: 720, y: 1188 }],
    });
    assert.ok(frameDiff(outPath, 1.8, 0.9) > 0.3, 'the hovered card should lift');
  } finally { server.close(); }
});

// R12 page: an open details body with a clickable div, and a tab whose hover opens an overlay with
// a "Buy" button over the very point the cursor is on.
const R12_PAGE = `<!doctype html><body style="margin:8px;font:20px sans-serif">
<details open><summary id="sum">More</summary><div id="buy" onclick="fetch('/bought')" style="padding:20px;background:#fdd">Buy now</div></details>
<div role="tab" id="tab" style="position:absolute;left:400px;top:300px;width:200px;height:60px;background:#eef">Tab</div>
<div id="ov" style="display:none;position:absolute;left:380px;top:280px;width:260px;height:120px"><button style="width:100%;height:100%">Buy</button></div>
<script>document.getElementById('tab').addEventListener('mouseenter', () => { document.getElementById('ov').style.display = 'block'; });</script>
</body>`;

async function withR12Page(fn) {
  const hits = [];
  const server = http.createServer((req, res) => { hits.push(req.url); res.writeHead(200, { 'content-type': 'text/html' }); res.end(R12_PAGE); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try { await fn(`http://127.0.0.1:${server.address().port}/`, hits); } finally { server.close(); }
}

test('a click inside an open details body is refused; its summary is allowed', async () => {
  await withR12Page(async (url, hits) => {
    const outPath = join(dir, 'clips', 'details.mp4');
    await assert.rejects(
      captureMoment({ url, format: 'wide', durationSec: 1, outPath, allowHosts, actions: [{ atSec: 0.2, type: 'click', selector: '#buy' }] }),
      /not allowed to click <div> "Buy now"/);
    assert.equal(existsSync(outPath), false);
    assert.ok(!hits.includes('/bought'));
    const r = await captureMoment({ url, format: 'wide', durationSec: 1, outPath, allowHosts, actions: [{ atSec: 0.2, type: 'click', selector: '#sum' }] });
    assert.equal(r.frames, 30);
  });
});

test('a click is refused when hovering opens something else under the pointer', async () => {
  await withR12Page(async (url) => {
    const outPath = join(dir, 'clips', 'overlay.mp4');
    await assert.rejects(
      captureMoment({ url, format: 'wide', durationSec: 1, outPath, allowHosts, actions: [{ atSec: 0.2, type: 'click', selector: '#tab' }] }),
      /not allowed to click <button> "Buy"|target changed under the pointer/);
    assert.equal(existsSync(outPath), false);
  });
});

// spec 16: a clip is recorded for its moment's plan-seconds, and a moment may now run past 20 of them.
test('a clip may be as long as a whole video in plan-seconds (20 x pace), no longer', async () => {
  const max = Math.round(20 * paceLib.pace() * 100) / 100; // 26 at 1.3
  await assert.rejects(captureMoment({ url: 'http://127.0.0.1:9/', format: 'wide', durationSec: max + 0.5, outPath: '/nonexistent/x.mp4' }), new RegExp(`durationSec must be 0\\.5 to ${max}`));
  await assert.rejects(captureMoment({ url: 'http://127.0.0.1:9/', format: 'wide', durationSec: 21, outPath: '/nonexistent/x.mp4' }), (e) => !/durationSec/.test(e.message));
});
