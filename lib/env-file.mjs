// The keys live in one file, .env.local, next to package.json. It is git-ignored and kept private (mode 600).
// The CLI (local/run-job.mjs), the UI server and the setup script all read and write it through here.
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
export const ENV_FILE = process.env.SITE_TO_VIDEO_ENV_FILE || join(ROOT, '.env.local'); // the override is for tests
export const KEY_NAMES = ['ELEVENLABS_API_KEY', 'ANTHROPIC_API_KEY'];

export function parseEnv(text) {
  const out = {};
  for (const raw of text.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(raw);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

export function readEnvFile(file = ENV_FILE) {
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
}

// Set (a string) or remove (null) some of the known keys, keeping every other line as it was.
export function writeEnvKeys(changes, file = ENV_FILE) {
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
  const kept = lines.filter((l) => {
    const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(l);
    return !(m && m[1] in changes);
  });
  while (kept.length && kept.at(-1) === '') kept.pop();
  for (const [k, v] of Object.entries(changes)) {
    if (!KEY_NAMES.includes(k)) throw new Error(`unknown key ${k}`);
    if (v === null) continue;
    if (/[\s"'\\$`]/.test(v)) throw new Error(`${k} has characters a key never has`);
    kept.push(`${k}=${v}`);
  }
  writeFileSync(file, kept.join('\n') + '\n', { mode: 0o600 });
  chmodSync(file, 0o600);
}

// The environment a job runs with: the shell's, with .env.local filling in what the shell lacks.
export function jobEnv(base = process.env, file = ENV_FILE) {
  const fromFile = readEnvFile(file);
  const env = { ...base };
  for (const k of KEY_NAMES) if (!env[k] && fromFile[k]) env[k] = fromFile[k];
  return env;
}

export const lastFour = (v) => (v ? `…${v.slice(-4)}` : null);
