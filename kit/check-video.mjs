#!/usr/bin/env node
// The gate. A video reaches the customer only if this passes.
//   node kit/check-video.mjs --video <f> --shotlist <f> --work <dir> --format <wide|tall> [--package <outDir>] [--pace <n>]
// --pace: instead of config.json's (the tests pin their fixtures' pace with it).
// Prints "HARD <id>: ..." / "warn <id>: ..." lines and writes <work>/check.json. Without --package
// it also writes the review frames (one per moment, plus the first) to <work>/frames/.
// Exit 0 pass, 1 hard findings (or package refused), 2 the check could not run.
// Reads <work>/audio/voice-alignment.json, and with --package also <work>/facts.json and
// poster.png beside the video. --package copies ONLY demo.mp4 and poster.png (ElevenLabs
// terms: the customer gets the finished mix, never the raw audio) and deletes any audio
// file found in outDir.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobPaths } from '../lib/paths.mjs';
import { audioCallsMade } from '../lib/audio-calls.mjs';
import { loadFacts } from '../lib/facts.mjs';
import { validateShotlist } from '../lib/shotlist.mjs';
import { stageProblems } from '../lib/process.mjs';
import paceLib from '../lib/pace.cjs';

const SIZES = { wide: [1920, 1080], tall: [1080, 1920] };
const TIMEOUT_MS = 120_000;

// Total time budget for one check, shared by every ffmpeg/ffprobe call.
function makeRunner() {
  const deadline = Date.now() + TIMEOUT_MS;
  return (cmd, args) => new Promise((resolveRun, reject) => {
    const left = deadline - Date.now();
    if (left <= 0) return reject(new Error('the video check took longer than 120 s'));
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('the video check took longer than 120 s')); }, left);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(timer); reject(new Error(`cannot run ${cmd}: ${e.message}`)); });
    p.on('close', (code) => { clearTimeout(timer); resolveRun({ code, out, err }); });
  });
}

const num = (s) => (s == null ? null : Number(s));
const rate = (r) => { const [a, b] = String(r ?? '').split('/').map(Number); return b ? a / b : a; };

// Shot-list times are plan-seconds; the video plays them `pace` times faster (lib/pace.cjs).
export async function checkVideo({ videoPath, shotlistPath, alignmentPath, format, pace = paceLib.pace() }) {
  const run = makeRunner();
  const findings = [];
  const add = (id, level, message) => findings.push({ id, level, message });
  const size = SIZES[format];
  if (!size) throw new Error(`format must be wide or tall, got ${format}`);
  if (!existsSync(videoPath)) throw new Error(`video not found: ${videoPath}`);
  const shot = JSON.parse(readFileSync(shotlistPath, 'utf8'));
  const alignment = JSON.parse(readFileSync(alignmentPath, 'utf8'));

  const probe = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', videoPath]);
  if (probe.code !== 0) throw new Error(`ffprobe cannot read the video: ${probe.err.trim()}`);
  const info = JSON.parse(probe.out);
  const vs = info.streams?.find((s) => s.codec_type === 'video');
  const as = info.streams?.find((s) => s.codec_type === 'audio');
  if (!vs) throw new Error('the file has no video stream');

  // The picture's length: the container's can run a few ms longer from the AAC track's padding.
  const duration = num(vs.duration) ?? num(info.format?.duration);
  if (!(duration >= 15 && duration <= 20)) add('duration', 'hard', `duration is ${duration?.toFixed(2)} s; it must be 15.0 to 20.0 s`);
  if (vs.width !== size[0] || vs.height !== size[1]) add('size', 'hard', `size is ${vs.width}x${vs.height}; ${format} needs ${size[0]}x${size[1]}`);
  const fps = rate(vs.avg_frame_rate !== '0/0' ? vs.avg_frame_rate : vs.r_frame_rate);
  if (Math.abs(fps - 30) > 0.01) add('fps', 'hard', `frame rate is ${fps.toFixed(2)}; it must be 30`);
  if (vs.codec_name !== 'h264' || as?.codec_name !== 'aac') add('codec', 'hard', `codecs are ${vs.codec_name}/${as?.codec_name ?? 'no audio'}; it must be h264 video with aac audio`);

  if (!as) {
    add('silent', 'hard', 'there is no audio track');
  } else {
    const r = await run('ffmpeg', ['-v', 'info', '-nostats', '-i', videoPath, '-vn', '-af', 'volumedetect', '-f', 'null', '-']);
    const mean = num(/mean_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(r.err)?.[1]);
    const max = num(/max_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(r.err)?.[1]);
    if (mean == null || max == null) throw new Error('ffmpeg volumedetect gave no result');
    if (mean < -40) add('silent', 'hard', `the audio is silent or nearly so (mean volume ${mean} dB; it must be above -40 dB)`);
    if (max > -0.3) add('clipping', 'hard', `the audio clips (peak ${max} dB; it must be at or below -0.3 dB)`);
  }

  // In seconds of the video: the voice as heard, after the renderer's tempo change for this clip
  // (lib/pace.cjs voicePlayback, the same one the renderer applies).
  const { tempo } = paceLib.voicePlayback(alignment, paceLib.normalRate(shot.voice), pace);
  const lastEnd = paceLib.heardWords(alignment, tempo).reduce((m, w) => Math.max(m, w.endSec || 0), 0);
  const narrationEnd = (shot.voiceStartSec ?? 0) / pace + lastEnd;
  if (duration != null && narrationEnd > duration - 0.5) {
    add('narration-overrun', 'hard', `the narration ends at ${narrationEnd.toFixed(2)} s; it must end by ${(duration - 0.5).toFixed(2)} s (0.5 s before the end)`);
  }

  const vr = await run('ffmpeg', ['-v', 'info', '-nostats', '-i', videoPath, '-an',
    '-vf', 'blackdetect=d=1.0:pix_th=0.10,freezedetect=n=0.001:d=2.5', '-f', 'null', '-']);
  const black = [...vr.err.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)];
  if (black.length) add('black', 'hard', `black picture for ${black.map((m) => `${(+m[3]).toFixed(1)} s from ${(+m[1]).toFixed(1)} s`).join(', ')}`);
  const frozen = [...vr.err.matchAll(/freeze_start:\s*([\d.]+)/g)].map((m) => +m[1]);
  // A freeze that runs to the end of the file reports only its start.
  const frozenLen = [...vr.err.matchAll(/freeze_duration:\s*([\d.]+)/g)].map((m) => +m[1]);
  if (frozen.length) add('frozen', 'hard', `frozen picture for ${frozen.map((s, i) => `${(frozenLen[i] ?? duration - s).toFixed(1)} s from ${s.toFixed(1)} s`).join(', ')}`);

  const mb = statSync(videoPath).size / 1e6;
  if (mb > 20) add('size-mb', 'warn', `the file is ${mb.toFixed(1)} MB; over 20 MB is large for posting`);

  return { pass: !findings.some((f) => f.level === 'hard'), findings };
}

// One PNG at the middle of each moment as it plays in the video, plus the first frame, in outDir/frames/.
export async function reviewFrames({ videoPath, shotlistPath, outDir, pace = paceLib.pace() }) {
  const run = makeRunner();
  const shot = JSON.parse(readFileSync(shotlistPath, 'utf8'));
  const dir = join(outDir, 'frames');
  mkdirSync(dir, { recursive: true });
  const jobs = [{ name: 'first.png', t: 0 }, ...(shot.moments ?? []).map((m) => ({ name: `moment-${m.id}.png`, t: (m.startSec + m.endSec) / 2 / pace }))];
  const files = [];
  for (const { name, t } of jobs) {
    const file = join(dir, name);
    const r = await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', videoPath, '-frames:v', '1', file]);
    if (r.code !== 0 || !existsSync(file)) throw new Error(`could not extract the frame at ${t} s: ${r.err.trim()}`);
    files.push(file);
  }
  return files;
}

async function imageSize(run, path) {
  if (!existsSync(path)) return null;
  const r = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path]);
  const st = JSON.parse(r.out || '{}').streams?.[0];
  return st ? { width: st.width, height: st.height } : null;
}

// Reasons the job may not be delivered even though the video itself passed.
async function packageProblems({ shotlistPath, work, toolOutput, pace }) {
  const problems = [];
  const calls = audioCallsMade(toolOutput);
  if (calls.voice < 1 || calls.voice > 2) problems.push(`make-audio voice was called ${calls.voice} times; it must be 1 or 2`);
  if (calls.music < 1 || calls.music > 2) problems.push(`make-audio music was called ${calls.music} times; it must be 1 or 2`);
  try {
    const shot = JSON.parse(readFileSync(shotlistPath, 'utf8'));
    const facts = loadFacts(join(work, 'facts.json'));
    let voices = JSON.parse(readFileSync(fileURLToPath(new URL('../config/voices.json', import.meta.url)), 'utf8'));
    if (!Array.isArray(voices) && Array.isArray(voices?.voices)) voices = voices.voices;
    const run = makeRunner();
    const captureSizes = {};
    for (const f of (shot.moments ?? []).map((m) => m?.source?.file).filter(Boolean)) {
      const s = await imageSize(run, resolve(work, f));
      if (s) captureSizes[f] = s;
    }
    const { ok, errors } = validateShotlist(shot, { facts, voices, captureSizes, pace });
    if (!ok) problems.push(`the shot list does not validate: ${errors.join('; ')}`);
  } catch (e) {
    problems.push(`the shot list could not be validated: ${e.message}`);
  }
  // Every stage opened in order, each with its files (lib/process.mjs).
  problems.push(...stageProblems({ work, toolOutput, pace }));
  return problems;
}

// Allow-list sweep: the customer gets result.md, and demo.mp4 / poster.png only when the
// package passed. Everything else in outDir, at any depth, any name, is deleted.
function sweepOutput(outDir, keepVideo) {
  if (!existsSync(outDir)) return;
  const keep = new Set(['result.md', ...(keepVideo ? ['demo.mp4', 'poster.png'] : [])]);
  for (const f of readdirSync(outDir)) if (!keep.has(f)) rmSync(join(outDir, f), { recursive: true, force: true });
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const [videoPath, shotlistPath, work, format, outDir, paceArg] = ['--video', '--shotlist', '--work', '--format', '--package', '--pace'].map(opt);
  if (!videoPath || !shotlistPath || !work || !format) {
    console.error('usage: node kit/check-video.mjs --video <f> --shotlist <f> --work <dir> --format <wide|tall> [--package <outDir>]');
    return 2;
  }
  try {
    const pace = paceArg ? paceLib.pace({ pace: Number(paceArg) }) : paceLib.pace();
    const result = await checkVideo({ videoPath, shotlistPath, alignmentPath: join(work, 'audio', 'voice-alignment.json'), format, pace });
    for (const f of result.findings) console.log(`${f.level === 'hard' ? 'HARD' : 'warn'} ${f.id}: ${f.message}`);
    mkdirSync(work, { recursive: true });
    writeFileSync(join(work, 'check.json'), JSON.stringify(result, null, 2));
    if (!outDir) {
      const frames = await reviewFrames({ videoPath, shotlistPath, outDir: work, pace });
      console.log(`${result.pass ? 'PASS; ' : ''}${frames.length} review frames in ${join(work, 'frames')}`);
      return result.pass ? 0 : 1;
    }

    mkdirSync(outDir, { recursive: true });
    sweepOutput(outDir, false);
    const poster = join(dirname(resolve(videoPath)), 'poster.png');
    const problems = result.pass ? await packageProblems({ shotlistPath, work, toolOutput: jobPaths().toolOutput, pace }) : [];
    if (result.pass && !existsSync(poster)) problems.push(`poster.png not found beside the video (${poster})`);
    if (!result.pass || problems.length) {
      for (const p of problems) console.log(`REFUSED package: ${p}`);
      if (!result.pass) console.log('REFUSED package: the video did not pass the check');
      return 1;
    }
    copyFileSync(videoPath, join(outDir, 'demo.mp4'));
    copyFileSync(poster, join(outDir, 'poster.png'));
    sweepOutput(outDir, true);
    console.log(`PASS; packaged demo.mp4 and poster.png to ${outDir}`);
    return 0;
  } catch (e) {
    // Any failure on the way leaves nothing deliverable behind.
    console.log(`check could not run: ${e.message}`);
    if (outDir) { try { sweepOutput(outDir, false); } catch {} }
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => { process.exitCode = c; }, (e) => { console.log(`check could not run: ${e.message}`); process.exitCode = 2; });
}
