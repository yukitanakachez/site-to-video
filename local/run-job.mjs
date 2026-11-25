#!/usr/bin/env node
// Runs one whole job on this machine, the way Starwish would, so the agent can be tested before it is uploaded.
//   node local/run-job.mjs --url <link> --format <wide|tall> [--request "<text>"] [--model claude-opus-5-5] [--dry-run]
// Needs ELEVENLABS_API_KEY in your shell (passed through, never printed). --dry-run needs no key and runs nothing.
// --runs-dir <dir> moves local-runs/ (the tests use it).
import { mkdirSync, writeFileSync, readdirSync, statSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { buildPrompt } from '../kit/build-prompt.mjs';
import { jobPaths } from '../lib/paths.mjs';

const AGENT_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

function die(msg) { console.error(`run-job: ${msg}`); process.exit(2); }

const { values: a } = parseArgs({
  options: {
    url: { type: 'string' }, format: { type: 'string' }, request: { type: 'string', default: '' },
    model: { type: 'string', default: 'claude-opus-5-5' }, 'dry-run': { type: 'boolean', default: false },
    'runs-dir': { type: 'string', default: join(AGENT_ROOT, 'local-runs') },
  },
});
if (!a.url || !/^https?:\/\/\S+$/.test(a.url)) die('--url <an http or https link> is required');
if (!['wide', 'tall'].includes(a.format)) die('--format must be wide or tall');

const pad = (n) => String(n).padStart(2, '0');
const d = new Date();
const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const u = new URL(a.url);
const slug = `${u.hostname}${u.pathname}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'link';
const runDir = resolve(a['runs-dir'], `${stamp}-${slug}`);
const jobRoot = join(runDir, 'job');
for (const sub of ['input', 'work', 'output', 'tool-output']) mkdirSync(join(jobRoot, sub), { recursive: true });
const params = { url: a.url, format: a.format };
writeFileSync(join(jobRoot, 'request.json'), JSON.stringify({ request: a.request, params }, null, 2));

const paths = jobPaths({ DEMO_JOB_ROOT: jobRoot, DEMO_AGENT_ROOT: AGENT_ROOT });
const prompt = `${buildPrompt({ target: 'local', paths })}\n\n# This job\n\nRequest: ${a.request || '(none)'}\nParams: ${JSON.stringify(params)}\n`;
const claudeArgs = ['-p', '--model', a.model, '--output-format', 'stream-json', '--verbose', '--allowedTools', 'Bash Read Write Edit', '--add-dir', runDir];
// CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 turns off auto memory, so a job (which reads untrusted page text)
// cannot write notes into the user's Claude memory.
const env = { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', DEMO_JOB_ROOT: jobRoot, DEMO_AGENT_ROOT: AGENT_ROOT };

console.log(`Run folder: ${runDir}`);
if (a['dry-run']) {
  console.log(`Dry run: not running claude. It would run, in ${runDir}, with the prompt (${Buffer.byteLength(prompt)} bytes) on stdin:`);
  console.log(`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 DEMO_JOB_ROOT=${jobRoot} DEMO_AGENT_ROOT=${AGENT_ROOT} ELEVENLABS_API_KEY=<from your shell> claude -p --model ${a.model} --output-format stream-json --verbose --allowedTools "Bash Read Write Edit" --add-dir ${runDir}`);
  process.exit(0);
}
if (!process.env.ELEVENLABS_API_KEY) die('ELEVENLABS_API_KEY is not set in your shell');

const started = Date.now();
const log = createWriteStream(join(runDir, 'run.jsonl'));
let result = null;
let buf = '';
function handle(line) {
  let ev; try { ev = JSON.parse(line); } catch { return; }
  if (ev.type === 'result') result = ev;
  // Progress lines are echoed by the model (there is no progress tool locally).
  if (ev.type === 'assistant') {
    for (const c of ev.message?.content ?? []) {
      const m = c.type === 'tool_use' && typeof c.input?.command === 'string' && c.input.command.match(/^\s*echo\s+(["']?)(.*?)\1\s*$/s);
      if (m) console.log(`[progress] ${m[2]}`);
    }
  }
}
const child = spawn('claude', claudeArgs, { cwd: runDir, env, stdio: ['pipe', 'pipe', 'inherit'] });
child.on('error', (e) => die(`could not start claude: ${e.message}`));
child.stdin.end(prompt);
child.stdout.on('data', (chunk) => {
  log.write(chunk);
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
});
child.on('close', (code) => {
  if (buf.trim()) handle(buf);
  log.end();
  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`\nRun folder: ${runDir}\nElapsed: ${Math.floor(secs / 60)}m ${secs % 60}s (claude exit ${code})`);
  const out = join(jobRoot, 'output');
  const files = readdirSync(out);
  console.log(files.length ? `Output files:\n${files.map((f) => `  ${join(out, f)} (${statSync(join(out, f)).size} bytes)`).join('\n')}` : 'Output files: none');
  if (result?.usage) console.log(`Tokens: ${JSON.stringify(result.usage)}${result.total_cost_usd != null ? `, cost $${result.total_cost_usd}` : ''}`);
  else console.log('Tokens: no final result event in run.jsonl');
  process.exit(code === 0 ? 0 : 1);
});
