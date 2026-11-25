#!/usr/bin/env node
// The local app: a small web server (Node built-ins only) with a page to paste a link, add your keys,
// watch a run and play the video. It listens on 127.0.0.1 only and never sends a key back to the page.
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserPath } from '../lib/paths.mjs';
import { ENV_FILE, ROOT, jobEnv, lastFour, readEnvFile, writeEnvKeys } from '../lib/env-file.mjs';

const PUBLIC = fileURLToPath(new URL('./public', import.meta.url));
export const RUNS_DIR = process.env.SITE_TO_VIDEO_RUNS_DIR || join(ROOT, 'runs'); // the override is for tests
const OUTPUT_FILES = { 'demo.mp4': 'video/mp4', 'poster.png': 'image/png', 'result.md': 'text/markdown; charset=utf-8' };
const STATIC_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];
const STAGES = ['Visit', 'Scout', 'Direct', 'Capture', 'Sound', 'Render', 'Check', 'Package'];

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

function readBody(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > limit) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('body is not JSON')); } });
    req.on('error', reject);
  });
}

function tryRun(cmd, args) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 8000 });
    return r.status === 0 ? (r.stdout || '').trim() : null;
  } catch { return null; }
}

export function systemStatus() {
  const claudeVersion = tryRun('claude', ['--version']);
  let loggedIn = null;
  if (claudeVersion) {
    const out = tryRun('claude', ['auth', 'status']);
    try { loggedIn = JSON.parse(out).loggedIn === true; } catch { loggedIn = null; }
  }
  let chrome = null;
  try { const p = browserPath(); if (existsSync(p)) chrome = p; } catch { /* none */ }
  const env = jobEnv();
  const file = readEnvFile();
  const key = (name) => ({ set: Boolean(env[name]), last4: lastFour(env[name]), source: file[name] ? 'app' : env[name] ? 'shell' : null });
  return {
    node: { version: process.version, ok: Number(process.versions.node.split('.')[0]) >= 22 },
    ffmpeg: { ok: Boolean(tryRun('ffmpeg', ['-version'])) },
    claude: { ok: Boolean(claudeVersion), version: claudeVersion, loggedIn },
    chrome: { ok: Boolean(chrome) },
    keys: { elevenlabs: key('ELEVENLABS_API_KEY'), anthropic: key('ANTHROPIC_API_KEY') },
    models: MODELS,
    stages: STAGES,
  };
}

// Ask ElevenLabs whether it knows the key. A key limited to some permissions is still a real key.
export async function checkElevenLabsKey(key, base = process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io') {
  try {
    const res = await fetch(`${base}/v1/user`, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(10000) });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => '');
    if (res.status === 401 && /invalid_api_key/.test(text)) return { ok: false, message: 'ElevenLabs does not recognise this key.' };
    if (res.status === 401 || res.status === 403) return { ok: true, warning: 'The key works, but it is limited to some permissions. It needs text to speech and music generation.' };
    return { ok: true, warning: `ElevenLabs answered ${res.status}, so the key could not be tested. It was saved.` };
  } catch {
    return { ok: true, warning: 'Could not reach ElevenLabs to test the key. It was saved.' };
  }
}

// ---- runs ----
let current = null; // { id, child, lines, listeners, status, ... }

const metaPath = (id) => join(RUNS_DIR, id, 'meta.json');
const outputDir = (id) => join(RUNS_DIR, id, 'job', 'output');
const validId = (id) => /^[A-Za-z0-9._-]{1,80}$/.test(id) && !id.includes('..');

function readMeta(id) { try { return JSON.parse(readFileSync(metaPath(id), 'utf8')); } catch { return null; } }
function writeMeta(id, meta) { try { writeFileSync(metaPath(id), JSON.stringify(meta, null, 2)); } catch { /* the folder is gone */ } }

export function listRuns() {
  if (!existsSync(RUNS_DIR)) return [];
  return readdirSync(RUNS_DIR).filter(validId).map((id) => {
    const meta = readMeta(id);
    if (!meta) return null;
    const files = Object.keys(OUTPUT_FILES).filter((f) => existsSync(join(outputDir(id), f)));
    const live = current?.id === id;
    return { id, ...meta, status: live ? current.status : meta.status === 'running' ? 'stopped' : meta.status, files };
  }).filter(Boolean).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function emit(run, event) {
  for (const send of run.listeners) send(event);
}

function startRun({ url, format, request, model }) {
  if (current && current.status === 'running') throw Object.assign(new Error('A video is already being made. Wait for it, or stop it.'), { code: 409 });
  mkdirSync(RUNS_DIR, { recursive: true });
  const args = [join(ROOT, 'local', 'run-job.mjs'), '--url', url, '--format', format, '--model', model, '--runs-dir', RUNS_DIR];
  if (request) args.push('--request', request);
  if (process.env.SITE_TO_VIDEO_DRY_RUN) args.push('--dry-run'); // tests: make the folder, call nothing
  const child = spawn(process.execPath, args, { cwd: ROOT, env: jobEnv(), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const run = { id: null, child, lines: [], listeners: new Set(), status: 'running', stage: null, startedAt: new Date().toISOString(), url, format, request, model };
  current = run;
  const onLine = (line) => {
    if (!line.trim()) return;
    const m = /^Run folder: (.+)$/.exec(line);
    if (m && !run.id) {
      run.id = m[1].split(sep).pop();
      writeMeta(run.id, { url, format, request, model, startedAt: run.startedAt, status: 'running' });
      emit(run, { type: 'id', id: run.id });
    }
    const p = /^\[progress\]\s*(.*)$/.exec(line);
    if (p) { run.stage = p[1]; emit(run, { type: 'stage', stage: p[1] }); }
    run.lines.push(line);
    if (run.lines.length > 400) run.lines.shift();
    emit(run, { type: 'line', line });
  };
  let buf = '';
  const feed = (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
  };
  child.stdout.on('data', (d) => feed(String(d)));
  child.stderr.on('data', (d) => feed(String(d)));
  child.on('error', (e) => onLine(`Could not start the run: ${e.message}`));
  child.on('close', (code) => {
    if (buf.trim()) onLine(buf);
    const made = run.id && existsSync(join(outputDir(run.id), 'demo.mp4'));
    run.status = run.stopped ? 'stopped' : made ? 'done' : 'failed';
    run.endedAt = new Date().toISOString();
    if (run.id) writeMeta(run.id, { url, format, request, model, startedAt: run.startedAt, endedAt: run.endedAt, status: run.status, exitCode: code });
    emit(run, { type: 'end', status: run.status, id: run.id });
  });
  return run;
}

function stopRun() {
  if (!current || current.status !== 'running') return false;
  current.stopped = true;
  try { process.kill(-current.child.pid, 'SIGTERM'); } catch { try { current.child.kill('SIGTERM'); } catch { /* gone */ } }
  return true;
}

// ---- http ----
function serveFile(req, res, file, type) {
  let st;
  try { st = statSync(file); } catch { res.writeHead(404); return res.end('not found'); }
  if (!st.isFile()) { res.writeHead(404); return res.end('not found'); }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
    end = Math.min(end, st.size - 1);
    if (start > end) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
  createReadStream(file).pipe(res);
}

export function createApp({ port }) {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  return createServer(async (req, res) => {
    try {
      // A page on another site must not be able to talk to this server (DNS rebinding, cross-site posts).
      if (!allowedHosts.has(req.headers.host || '')) { res.writeHead(403); return res.end('forbidden host'); }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const origin = req.headers.origin;
        if (!origin || !allowedHosts.has(new URL(origin).host)) { res.writeHead(403); return res.end('forbidden origin'); }
      }
      const url = new URL(req.url, `http://${req.headers.host}`);
      const path = url.pathname;

      if (path === '/api/status' && req.method === 'GET') return json(res, 200, { ...systemStatus(), running: current?.status === 'running' ? { id: current.id, url: current.url, stage: current.stage, startedAt: current.startedAt } : null });

      if (path === '/api/keys' && req.method === 'POST') {
        const body = await readBody(req);
        const changes = {};
        const result = {};
        for (const [field, name] of [['elevenlabs', 'ELEVENLABS_API_KEY'], ['anthropic', 'ANTHROPIC_API_KEY']]) {
          if (!(field in body)) continue;
          const v = body[field];
          if (v === null || v === '') { changes[name] = null; continue; }
          if (typeof v !== 'string' || v.trim().length < 8 || /[\s"'\\$`]/.test(v.trim())) return json(res, 400, { error: `That does not look like a ${field} key. Paste only the key itself.` });
          const key = v.trim();
          if (field === 'elevenlabs') {
            const check = await checkElevenLabsKey(key);
            if (!check.ok) return json(res, 400, { error: check.message });
            if (check.warning) result.warning = check.warning;
          }
          changes[name] = key;
        }
        writeEnvKeys(changes);
        return json(res, 200, { ...result, keys: systemStatus().keys });
      }

      if (path === '/api/runs' && req.method === 'GET') return json(res, 200, { runs: listRuns() });

      if (path === '/api/runs' && req.method === 'POST') {
        const b = await readBody(req);
        if (typeof b.url !== 'string' || !/^https?:\/\/[^\s]+$/.test(b.url.trim()) || b.url.length > 500) return json(res, 400, { error: 'Enter a public link that starts with http:// or https://' });
        if (!['wide', 'tall'].includes(b.format)) return json(res, 400, { error: 'Choose wide or tall.' });
        const model = b.model ?? MODELS[0];
        if (!MODELS.includes(model)) return json(res, 400, { error: 'Unknown model.' });
        const request = typeof b.request === 'string' ? b.request.trim().slice(0, 1000) : '';
        const env = jobEnv();
        if (!env.ELEVENLABS_API_KEY) return json(res, 400, { error: 'Add your ElevenLabs key first (Setup, top right).' });
        const run = startRun({ url: b.url.trim(), format: b.format, request, model });
        return json(res, 202, { started: true, startedAt: run.startedAt });
      }

      if (path === '/api/runs/current/stream' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        const run = current;
        const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
        if (!run) { send({ type: 'none' }); return res.end(); }
        send({ type: 'hello', id: run.id, status: run.status, stage: run.stage, startedAt: run.startedAt, url: run.url, lines: run.lines.slice(-60) });
        if (run.status !== 'running') return res.end();
        run.listeners.add(send);
        const ping = setInterval(() => res.write(': ping\n\n'), 15000);
        req.on('close', () => { clearInterval(ping); run.listeners.delete(send); });
        return;
      }

      if (path === '/api/runs/current/stop' && req.method === 'POST') return json(res, 200, { stopped: stopRun() });

      const file = /^\/runs\/([^/]+)\/([^/]+)$/.exec(path);
      if (file && req.method === 'GET') {
        const [, id, name] = file;
        if (!validId(id) || !(name in OUTPUT_FILES)) { res.writeHead(404); return res.end('not found'); }
        return serveFile(req, res, join(outputDir(id), name), OUTPUT_FILES[name]);
      }

      if (req.method === 'GET') {
        const rel = path === '/' ? 'index.html' : normalize(path).replace(/^[/\\]+/, '');
        const full = join(PUBLIC, rel);
        if (!full.startsWith(PUBLIC + sep) || !(extname(full) in STATIC_TYPES)) { res.writeHead(404); return res.end('not found'); }
        return serveFile(req, res, full, STATIC_TYPES[extname(full)]);
      }
      res.writeHead(405); res.end('method not allowed');
    } catch (e) {
      if (!res.headersSent) json(res, e.code === 409 ? 409 : 500, { error: e.message });
      else res.end();
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = Number(process.env.PORT) || 4173;
  const server = createApp({ port });
  server.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' ? `Port ${port} is busy. Run again with PORT=<another number> npm start.` : e.message);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    const address = `http://localhost:${port}`;
    console.log(`\n  Site to Video is running at ${address}\n  Keys are kept in ${ENV_FILE} (private to you).\n  Press Ctrl+C to stop.\n`);
    if (!process.env.NO_OPEN) {
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      try { spawn(opener, [address], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref(); } catch { /* print only */ }
    }
  });
}
