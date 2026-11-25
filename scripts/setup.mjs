#!/usr/bin/env node
// One command to get ready: npm run setup
// Installs the packages and Remotion's own browser, then checks the tools the app needs and says how to fix any that are missing.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const checkOnly = process.argv.includes('--check');
const say = (mark, text) => console.log(`  ${mark} ${text}`);
let problems = 0;
const problem = (text, fix) => { problems++; say('✗', text); if (fix) console.log(`      ${fix}`); };

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
}
function out(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

console.log('\nSite to Video setup\n');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 22 || (major === 22 && minor >= 12)) say('✓', `Node ${process.version}`);
else { problem(`Node ${process.version} is too old`, 'Install Node 22.12 or newer: https://nodejs.org'); process.exit(1); }

if (!checkOnly) {
  console.log('\n  Installing packages (about a minute)…');
  if (run('npm', ['ci', '--no-audit', '--no-fund']).status !== 0) { problem('npm ci failed', 'Fix the error above and run npm run setup again.'); process.exit(1); }
  console.log('\n  Getting the browser Remotion renders with (about 100 MB, once)…');
  if (run('npx', ['remotion', 'browser', 'ensure']).status !== 0) problem('Remotion could not download its browser', 'Check your internet connection and run npm run setup again.');
  console.log('');
} else if (!existsSync(join(ROOT, 'node_modules'))) problem('Packages are not installed', 'Run npm run setup.');

const ffmpeg = out('ffmpeg', ['-version']);
if (ffmpeg) say('✓', ffmpeg.split('\n')[0].split(' ').slice(0, 3).join(' '));
else problem('ffmpeg is not installed', process.platform === 'darwin' ? 'Install it: brew install ffmpeg' : 'Install it: sudo apt install ffmpeg');

const claude = out('claude', ['--version']);
if (!claude) problem('Claude Code is not installed', 'Install it from https://claude.com/claude-code, then run `claude` once to sign in.');
else {
  say('✓', `Claude Code ${claude}`);
  let loggedIn = null;
  try { loggedIn = JSON.parse(out('claude', ['auth', 'status']) ?? '').loggedIn; } catch { /* unknown */ }
  if (loggedIn === false) say('!', 'Claude Code is not signed in. Run `claude` once and sign in, or add an Anthropic API key in the app.');
}

const { browserPath, chromePath } = await import('../lib/paths.mjs');
let chrome = null;
try { const p = browserPath(); if (existsSync(p)) chrome = p; } catch { /* none */ }
if (chrome) say('✓', chrome === chromePath() || process.env.CHROME_PATH ? 'Google Chrome' : 'Browser (the one Remotion downloaded; Chrome is not needed)');
else problem('No browser was found', 'Run npm run setup (it downloads one), or install Chrome, or set CHROME_PATH to its location.');

const { readEnvFile } = await import('../lib/env-file.mjs');
if (process.env.ELEVENLABS_API_KEY || readEnvFile().ELEVENLABS_API_KEY) say('✓', 'ElevenLabs key found');
else say('•', 'No ElevenLabs key yet. You add it in the app, in one box.');

console.log(problems ? `\n  Fix the ${problems === 1 ? 'item' : 'items'} marked ✗, then run npm run setup again.\n` : '\n  All set. Start the app with:  npm start\n');
process.exit(problems ? 1 : 0);
