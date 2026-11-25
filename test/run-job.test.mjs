import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('../local/run-job.mjs', import.meta.url).pathname;
const AGENT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function run(args, env = {}) {
  const runs = mkdtempSync(join(tmpdir(), 'runjob-'));
  const clean = { ...process.env, ...env };
  delete clean.ELEVENLABS_API_KEY;
  const r = spawnSync('node', [SCRIPT, ...args, '--runs-dir', runs], { encoding: 'utf8', env: { ...clean, ...env } });
  return { ...r, runs };
}

test('run-job --dry-run creates the job folders and request.json and prints the claude command without running it', () => {
  const r = run(['--url', 'https://github.com/sharkdp/hyperfine', '--format', 'wide', '--request', 'Make it punchy', '--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  const [dir] = readdirSync(r.runs);
  assert.match(dir, /^\d{8}-\d{6}-[a-z0-9-]+$/);
  const job = join(r.runs, dir, 'job');
  for (const d of ['input', 'work', 'output', 'tool-output']) assert.ok(statSync(join(job, d)).isDirectory(), d);
  assert.deepEqual(JSON.parse(readFileSync(join(job, 'request.json'), 'utf8')), {
    request: 'Make it punchy', params: { url: 'https://github.com/sharkdp/hyperfine', format: 'wide' },
  });
  assert.ok(!existsSync(join(r.runs, dir, 'run.jsonl')), 'claude must not run in a dry run');
  for (const s of ['claude -p', '--model claude-opus-5-5', '--output-format stream-json', '--allowedTools "Bash Read Write Edit"', `--add-dir ${join(r.runs, dir)}`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, `DEMO_JOB_ROOT=${job}`, `DEMO_AGENT_ROOT=${AGENT}`]) {
    assert.ok(r.stdout.includes(s), `stdout lacks: ${s}\n${r.stdout}`);
  }
  assert.ok(r.stdout.includes(join(r.runs, dir)));
});

test('--dry-run needs no key and never prints one', () => {
  const r = run(['--url', 'https://example.com', '--format', 'tall', '--dry-run'], { ELEVENLABS_API_KEY: '' });
  assert.equal(r.status, 0, r.stderr);
  const withKey = run(['--url', 'https://example.com', '--format', 'tall', '--dry-run'], { ELEVENLABS_API_KEY: 'sk_secret_value_123' });
  assert.equal(withKey.status, 0);
  assert.ok(!withKey.stdout.includes('sk_secret_value_123') && !withKey.stderr.includes('sk_secret_value_123'));
});

test('run-job refuses a bad format or a link that is not http(s), before creating anything', () => {
  for (const args of [['--url', 'https://example.com', '--format', 'square'], ['--url', 'ftp://example.com', '--format', 'wide'], ['--format', 'wide']]) {
    const r = run([...args, '--dry-run']);
    assert.notEqual(r.status, 0);
    assert.equal(readdirSync(r.runs).length, 0);
  }
});
