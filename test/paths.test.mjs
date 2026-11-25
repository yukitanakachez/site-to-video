import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jobPaths, chromePath } from '../lib/paths.mjs';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('defaults are the Starwish job paths', () => {
  assert.deepEqual(jobPaths({}), { job: '/job', input: '/job/input', work: '/job/work', output: '/job/output', toolOutput: '/job/tool-output', agent: '/agent', kit: '/agent/kit' });
});

test('DEMO_JOB_ROOT and DEMO_AGENT_ROOT move every path', () => {
  const p = jobPaths({ DEMO_JOB_ROOT: '/tmp/r/job', DEMO_AGENT_ROOT: '/src/demo-video' });
  assert.deepEqual(p, { job: '/tmp/r/job', input: '/tmp/r/job/input', work: '/tmp/r/job/work', output: '/tmp/r/job/output', toolOutput: '/tmp/r/job/tool-output', agent: '/src/demo-video', kit: '/src/demo-video/kit' });
});

test('CHROME_PATH wins', () => assert.equal(chromePath({ CHROME_PATH: '/x/chrome' }), '/x/chrome'));

test('without CHROME_PATH: config.json chromePath on Linux, the app bundle on macOS', () => {
  assert.equal(chromePath({}, 'linux'), '/usr/bin/google-chrome');
  assert.equal(chromePath({}, 'darwin'), MAC_CHROME);
});

test('voices.json has 3 to 4 voices with id, name, tone', () => {
  const voices = JSON.parse(readFileSync(new URL('../config/voices.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(voices));
  assert.ok(voices.length >= 3 && voices.length <= 4, `got ${voices.length} voices`);
  for (const v of voices) {
    for (const field of ['id', 'name', 'tone']) {
      assert.equal(typeof v[field], 'string', `${field} must be a string`);
      assert.ok(v[field].trim().length > 0, `${field} must not be empty`);
    }
  }
  assert.equal(new Set(voices.map((v) => v.id)).size, voices.length, 'voice ids must be unique');
});

test('browserPath: CHROME_PATH wins; a missing system Chrome falls back to Remotion\'s browser', async () => {
  const { browserPath, remotionShell } = await import('../lib/paths.mjs');
  assert.equal(browserPath({ CHROME_PATH: '/x/chrome' }), '/x/chrome');
  const shell = remotionShell();
  // Remotion's browser is downloaded by `npm run setup`; when it is there, a machine without Chrome gets it.
  if (shell) assert.equal(browserPath({}, 'linux'), existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : shell);
});

test('remotionShell finds the downloaded browser under a folder, and null when there is none', async () => {
  const { remotionShell } = await import('../lib/paths.mjs');
  const root = mkdtempSync(join(tmpdir(), 's2v-shell-'));
  assert.equal(remotionShell(root), null);
  const dir = join(root, 'node_modules', '.remotion', 'chrome-headless-shell', '1.0-v1', 'linux64', 'chrome-headless-shell-linux64');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'chrome-headless-shell'), '');
  writeFileSync(join(root, 'node_modules', '.remotion', 'chrome-headless-shell', '1.0-v1', 'VERSION'), '1.0'); // a file beside the platform folder
  assert.equal(remotionShell(root), join(dir, 'chrome-headless-shell'));
});
