#!/usr/bin/env node
// Usage: node kit/validate-shotlist.mjs <shotlist.json> --facts <facts.json> --work <dir> [--pre-capture] [--pace <n>]
// --pace: instead of config.json's (the tests pin their fixtures' pace with it).
// --pre-capture: clip files not recorded yet are not an error (before stage 4, Capture).
// Prints OK and the video as it will play (its length and each moment in seconds of the video: the
// shot list is in plan-seconds, played `pace` times faster), or one error per line. Exit 0 or 1.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFacts } from '../lib/facts.mjs';
import { validateShotlist } from '../lib/shotlist.mjs';
import paceLib from '../lib/pace.cjs';

function sizeOf(path) {
  if (!existsSync(path)) return null;
  const b = readFileSync(path);
  if (b.length > 24 && b.toString('latin1', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path], { encoding: 'utf8' });
  try {
    const st = JSON.parse(r.stdout).streams?.[0];
    return st ? { width: st.width, height: st.height } : null;
  } catch { return null; }
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const flags = new Set(['--pre-capture']);
  const shotPath = args.find((a, i) => !a.startsWith('--') && !(args[i - 1]?.startsWith('--') && !flags.has(args[i - 1])));
  const factsPath = opt('--facts');
  const work = opt('--work');
  if (!shotPath || !factsPath || !work) {
    console.error('usage: node kit/validate-shotlist.mjs <shotlist.json> --facts <facts.json> --work <dir> [--pre-capture]');
    return 1;
  }
  let shot, facts, voices;
  try {
    shot = JSON.parse(readFileSync(shotPath, 'utf8'));
    facts = loadFacts(factsPath);
    voices = JSON.parse(readFileSync(fileURLToPath(new URL('../config/voices.json', import.meta.url)), 'utf8'));
    if (!Array.isArray(voices) && Array.isArray(voices?.voices)) voices = voices.voices;
  } catch (e) {
    console.log(`cannot read inputs: ${e.message}`);
    return 1;
  }
  const captureSizes = {};
  const files = (shot.moments ?? []).map((m) => m?.source?.file).filter(Boolean);
  for (const f of files) { const s = sizeOf(resolve(join(work, f))); if (s) captureSizes[f] = s; }
  const pace = opt('--pace') ? paceLib.pace({ pace: Number(opt('--pace')) }) : paceLib.pace();
  const { ok, errors } = validateShotlist(shot, { facts, voices, captureSizes, allowMissingClips: args.includes('--pre-capture'), pace });
  console.log(ok ? `OK\n${asPlayed(shot, pace)}` : errors.join('\n'));
  return ok ? 0 : 1;
}

// The finished video's times, for the music call and result.md. Music seconds round up, so the bed is never short.
function asPlayed(shot, pace) {
  const sec = (x) => +(x / pace).toFixed(1);
  const out = shot.durationSec / pace;
  const moments = shot.moments.map((m) => `${m.id} ${sec(m.startSec)}–${sec(m.endSec)} s`).join(', ');
  return `At pace ${pace} the video plays for ${out.toFixed(1)} s (make-audio music seconds: ${Math.ceil(out * 10 - 1e-9) / 10}). Moments in the video: ${moments}.`;
}
process.exitCode = main();
