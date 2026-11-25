import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 's2v-ui-'));
process.env.SITE_TO_VIDEO_ENV_FILE = join(tmp, '.env.local');
process.env.SITE_TO_VIDEO_RUNS_DIR = join(tmp, 'runs');
process.env.SITE_TO_VIDEO_DRY_RUN = '1';
delete process.env.ELEVENLABS_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

const free = () => new Promise((res) => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

let stub, stubPort, mode = 'ok', app, port;

// A stand-in for ElevenLabs' /v1/user.
before(async () => {
  stub = createServer((req, res) => {
    if (mode === 'ok') { res.writeHead(200); return res.end('{}'); }
    if (mode === 'invalid') { res.writeHead(401); return res.end('{"detail":{"status":"invalid_api_key"}}'); }
    res.writeHead(401); res.end('{"detail":{"status":"missing_permissions"}}');
  });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  stubPort = stub.address().port;
  process.env.ELEVENLABS_BASE_URL = `http://127.0.0.1:${stubPort}`;
  const { createApp } = await import('../ui/server.mjs');
  port = await free();
  app = createApp({ port });
  await new Promise((r) => app.listen(port, '127.0.0.1', r));
});
after(() => { app.close(); stub.close(); });

function call(method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ } resolve({ status: res.statusCode, headers: res.headers, text, json }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const post = (path, body, headers) => call('POST', path, { body, headers: { origin: `http://127.0.0.1:${port}`, ...headers } });

test('the page and its files are served', async () => {
  const r = await call('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.text, /Site to Video/);
  assert.equal((await call('GET', '/app.js')).status, 200);
  assert.equal((await call('GET', '/style.css')).status, 200);
});

test('static paths cannot leave the public folder', async () => {
  for (const p of ['/../server.mjs', '/%2e%2e/server.mjs', '/..%2f..%2fpackage.json', '/app.js/../../package.json']) {
    const r = await call('GET', p);
    assert.notEqual(r.status, 200, p);
  }
});

test('a request with another Host header is refused', async () => {
  assert.equal((await call('GET', '/api/status', { headers: { host: 'evil.example' } })).status, 403);
});

test('a post from another site is refused, and a post with no origin too', async () => {
  assert.equal((await post('/api/keys', { elevenlabs: 'abcdefghijkl' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('POST', '/api/keys', { body: { elevenlabs: 'abcdefghijkl' } })).status, 403);
});

test('status starts with no keys', async () => {
  const r = await call('GET', '/api/status');
  assert.equal(r.status, 200);
  assert.equal(r.json.keys.elevenlabs.set, false);
  assert.equal(r.json.node.ok, true);
  assert.deepEqual(r.json.models, ['claude-opus-5-5', 'claude-sonnet-5-5']);
});

test('a video cannot start without an ElevenLabs key', async () => {
  const r = await post('/api/runs', { url: 'https://example.com', format: 'wide' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /ElevenLabs key/);
});

test('a key ElevenLabs does not recognise is refused and not saved', async () => {
  mode = 'invalid';
  const r = await post('/api/keys', { elevenlabs: 'sk_not_a_real_key_1234' });
  assert.equal(r.status, 400);
  assert.equal(existsSync(process.env.SITE_TO_VIDEO_ENV_FILE), false);
});

test('a bad-looking key is refused', async () => {
  for (const bad of ['short', 'has space inside key', 'quote"d_key_value']) {
    assert.equal((await post('/api/keys', { elevenlabs: bad })).status, 400, bad);
  }
});

test('a good key is saved privately, and never sent back', async () => {
  mode = 'ok';
  const key = 'sk_test_0123456789abcdef';
  const r = await post('/api/keys', { elevenlabs: key });
  assert.equal(r.status, 200);
  assert.equal(r.json.keys.elevenlabs.set, true);
  assert.equal(r.json.keys.elevenlabs.last4, '…cdef');
  assert.ok(!r.text.includes(key));
  assert.match(readFileSync(process.env.SITE_TO_VIDEO_ENV_FILE, 'utf8'), /ELEVENLABS_API_KEY=sk_test_0123456789abcdef/);
  assert.equal(statSync(process.env.SITE_TO_VIDEO_ENV_FILE).mode & 0o777, 0o600);
  const s = await call('GET', '/api/status');
  assert.ok(!s.text.includes(key));
});

test('a key with limited permissions is saved with a warning', async () => {
  mode = 'limited';
  const r = await post('/api/keys', { elevenlabs: 'sk_limited_0123456789ab' });
  assert.equal(r.status, 200);
  assert.match(r.json.warning, /permissions/);
  mode = 'ok';
});

test('an Anthropic key is saved beside it, and empty removes a key', async () => {
  const r = await post('/api/keys', { anthropic: 'sk-ant-api03-abcdefghijkl' });
  assert.equal(r.json.keys.anthropic.set, true);
  assert.match(readFileSync(process.env.SITE_TO_VIDEO_ENV_FILE, 'utf8'), /ELEVENLABS_API_KEY=/);
  const gone = await post('/api/keys', { anthropic: '' });
  assert.equal(gone.json.keys.anthropic.set, false);
  assert.doesNotMatch(readFileSync(process.env.SITE_TO_VIDEO_ENV_FILE, 'utf8'), /ANTHROPIC/);
});

test('a bad link, shape or model is refused', async () => {
  assert.equal((await post('/api/runs', { url: 'javascript:alert(1)', format: 'wide' })).status, 400);
  assert.equal((await post('/api/runs', { url: 'https://example.com', format: 'square' })).status, 400);
  assert.equal((await post('/api/runs', { url: 'https://example.com', format: 'wide', model: 'gpt-x' })).status, 400);
});

test('a run makes its folder and a record', async () => {
  const first = await post('/api/runs', { url: 'https://example.com/page', format: 'tall', request: 'calm' });
  assert.equal(first.status, 202);
  for (let i = 0; i < 50; i++) {
    const { json } = await call('GET', '/api/runs');
    if (json.runs.length && json.runs[0].status !== 'running') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const { json } = await call('GET', '/api/runs');
  assert.equal(json.runs.length, 1);
  assert.equal(json.runs[0].url, 'https://example.com/page');
  assert.equal(json.runs[0].format, 'tall');
  assert.equal(json.runs[0].status, 'failed'); // a dry run makes no video
  assert.deepEqual(json.runs[0].files, []);
});

test('output files are served with ranges, and nothing else in the run folder is', async () => {
  const { json } = await call('GET', '/api/runs');
  const id = json.runs[0].id;
  const out = join(process.env.SITE_TO_VIDEO_RUNS_DIR, id, 'job', 'output');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'demo.mp4'), Buffer.from('0123456789'));
  const whole = await call('GET', `/runs/${id}/demo.mp4`);
  assert.equal(whole.status, 200);
  assert.equal(whole.headers['content-type'], 'video/mp4');
  const part = await call('GET', `/runs/${id}/demo.mp4`, { headers: { range: 'bytes=2-5' } });
  assert.equal(part.status, 206);
  assert.equal(part.text, '2345');
  assert.equal(part.headers['content-range'], 'bytes 2-5/10');
  assert.equal((await call('GET', `/runs/${id}/meta.json`)).status, 404);
  assert.equal((await call('GET', `/runs/${id}/run.jsonl`)).status, 404);
  assert.equal((await call('GET', `/runs/..%2F..%2Fpackage.json/demo.mp4`)).status, 404);
  assert.equal((await call('GET', `/runs/${id}/..%2Fmeta.json`)).status, 404);
});
