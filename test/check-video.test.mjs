import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkVideo, reviewFrames } from '../kit/check-video.mjs';
import { STAGES } from '../lib/process.mjs';
import { FIXTURE_PACE } from './helpers.mjs';

const KIT = new URL('../kit/check-video.mjs', import.meta.url).pathname;
const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const VOICES = JSON.parse(readFileSync(new URL('../config/voices.json', import.meta.url), 'utf8'));
const VOICE = (Array.isArray(VOICES) ? VOICES : VOICES.voices)[0].id;

let root;
const v = {};
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};
// A video: picture filter chain over testsrc2, audio source spec, size, seconds.
function make(name, { sec = 18, size = '1920x1080', vf = '', audio = 'sine=frequency=440,volume=4', outSec = sec } = {}) {
  const file = join(root, name);
  ff(['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30:duration=${sec}`,
    '-f', 'lavfi', '-t', String(outSec), '-i', audio,
    ...(vf ? ['-vf', vf] : []), '-t', String(outSec),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-shortest', file]);
  return file;
}

const writeShot = (dir, edit = (s) => s) => {
  const s = JSON.parse(readFileSync(fx('shotlist-good.json'), 'utf8'));
  s.voice = VOICE;
  const p = join(dir, 'shotlist.json');
  writeFileSync(p, JSON.stringify(edit(s)));
  return p;
};
// The alignment as make-audio writes it: seconds of voice.mp3, spoken at `speed` (none: 1). `words`
// words evenly from 0 to `lastEnd`.
const writeAlign = (dir, lastEnd = 10, speed, words = 2) => {
  mkdirSync(join(dir, 'audio'), { recursive: true });
  const p = join(dir, 'audio', 'voice-alignment.json');
  const step = lastEnd / (words - 0.2);
  const ws = Array.from({ length: words }, (_, i) => ({ word: `w${i}`, startSec: +(i * step).toFixed(4), endSec: +((i + 0.8) * step).toFixed(4) }));
  writeFileSync(p, JSON.stringify({ ...(speed ? { speed } : {}), words: ws }));
  return p;
};
const ids = (r) => r.findings.map((f) => f.id);

before(() => {
  root = mkdtempSync(join(tmpdir(), 'check-video-'));
  v.good = make('good.mp4');
  v.short = make('short.mp4', { sec: 12 });
  v.small = make('small.mp4', { size: '1280x720' });
  v.silent = make('silent.mp4', { audio: 'anullsrc=r=44100:cl=stereo' });
  v.black = make('black.mp4', { vf: "drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(t,8,10.5)'" });
  v.frozen = make('frozen.mp4', { sec: 15, outSec: 18, vf: 'tpad=stop_mode=clone:stop_duration=3' });
  v.clip = make('clip.mp4', { audio: 'sine=frequency=440,volume=8' });
});
after(() => rmSync(root, { recursive: true, force: true }));

function run(video, { align = 10, speed, words = 30, shot } = {}) {
  const dir = mkdtempSync(join(root, 'w-'));
  return checkVideo({ videoPath: video, shotlistPath: shot ?? writeShot(dir), alignmentPath: writeAlign(dir, align, speed, words), format: 'wide', pace: FIXTURE_PACE });
}

test('an 18 s 1920x1080 30fps h264/aac video with tone and moving picture passes', async () => {
  const r = await run(v.good);
  assert.deepEqual(r.findings.filter((f) => f.level === 'hard'), []);
  assert.equal(r.pass, true);
});

// Run 1 of Task 12: a 600-frame (20.0 s) render probed at 20.01 s, the AAC track's padding.
test('a 20.0 s picture whose audio runs a few ms over passes duration', async () => {
  const file = join(root, 'twenty.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=20', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=20.04,volume=4',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', file]);
  const r = await run(file);
  assert.ok(!ids(r).includes('duration'), JSON.stringify(r.findings));
});

test('12 s fails duration', async () => {
  const r = await run(v.short);
  assert.ok(ids(r).includes('duration'));
  assert.equal(r.pass, false);
});

test('1280x720 fails size for wide', async () => {
  const r = await run(v.small);
  assert.ok(ids(r).includes('size'));
});

test('silent audio fails', async () => {
  assert.ok(ids(await run(v.silent)).includes('silent'));
});

test('clipping audio fails clipping', async () => {
  assert.ok(ids(await run(v.clip)).includes('clipping'));
});

test('2 s of black fails black', async () => {
  assert.ok(ids(await run(v.black)).includes('black'));
});

test('3 s frozen picture fails frozen', async () => {
  assert.ok(ids(await run(v.frozen)).includes('frozen'));
});

// spec 16 and ruling R19: the voice is heard at the voice's normal rate x pace, whatever rate the
// clip came out at, and the overrun is judged on that, in seconds of the 18 s video. The shot list's
// voice is Jade (2.3 words a second): heard at 2.99 words a second at pace 1.3, from 0.52 / 1.3 = 0.4 s.
test('narration ending after duration - 0.5s of output is a hard finding, judged on the voice as heard', async () => {
  const overrun = (r) => r.findings.find((x) => x.id === 'narration-overrun');
  // 52 words heard at 2.99 a second end at 0.4 + 52 / 2.99 = 17.79 > 17.5
  let r = await run(v.good, { words: 52, align: 22 });
  assert.equal(overrun(r)?.level, 'hard');
  assert.match(overrun(r).message, /17\.79 s/);
  assert.equal(r.pass, false);
  // however fast ElevenLabs spoke them: the same 52 words in 17 s of clip (speed 1.2) are heard just as long
  assert.match(overrun(await run(v.good, { words: 52, align: 17, speed: 1.2 }))?.message ?? '', /17\.79 s/);
  // 50 words end at 0.4 + 50 / 2.99 = 17.12: in time
  assert.equal(overrun(await run(v.good, { words: 50, align: 22 })), undefined);
  assert.equal(overrun(await run(v.good, { words: 50, align: 17, speed: 1.2 })), undefined);
});

test('reviewFrames writes one frame per moment plus the first', async () => {
  const dir = mkdtempSync(join(root, 'f-'));
  const files = await reviewFrames({ videoPath: v.good, shotlistPath: writeShot(dir), outDir: dir, pace: FIXTURE_PACE });
  assert.equal(files.length, 5); // first + 4 moments
  for (const f of files) assert.ok(existsSync(f) && f.startsWith(join(dir, 'frames')) && f.endsWith('.png'), f);
});

// The end card (plan 20.15-23.4) plays at 15.5-18 s of the 18 s video; its middle is 16.75 s.
// testsrc2 draws a running clock, so each frame differs by its time.
test('review frames are taken at the middle of each moment as it plays in the video', async () => {
  const dir = mkdtempSync(join(root, 'f-'));
  await reviewFrames({ videoPath: v.good, shotlistPath: writeShot(dir), outDir: dir, pace: FIXTURE_PACE });
  const at = join(dir, 'at-16.75.png');
  ff(['-ss', '16.75', '-i', v.good, '-frames:v', '1', at]);
  assert.deepEqual(readFileSync(join(dir, 'frames', 'moment-m4.png')), readFileSync(at));
});

// ---- --package ----
function job({ calls = { voice: 1, music: 1 }, video = v.good, shotEdit } = {}) {
  const j = mkdtempSync(join(root, 'job-'));
  const work = join(j, 'work');
  mkdirSync(join(work, 'captures'), { recursive: true });
  mkdirSync(join(work, 'clips'), { recursive: true });
  mkdirSync(join(j, 'output'), { recursive: true });
  // capture stand-ins with the sizes the shot list expects
  ff(['-f', 'lavfi', '-i', 'color=c=white:s=1920x1080', '-frames:v', '1', join(work, 'captures', 'page.png')]);
  copyFileSync(v.good, join(work, 'clips', 'm2.mp4'));
  copyFileSync(fx('facts-good.json'), join(work, 'facts.json'));
  writeAlign(work);
  const shot = writeShot(work, shotEdit);
  copyFileSync(video, join(work, 'demo.mp4'));
  ff(['-f', 'lavfi', '-i', 'color=c=gray:s=1920x1080', '-frames:v', '1', join(work, 'poster.png')]);
  let n = 0;
  for (const [action, count] of Object.entries(calls)) {
    for (let i = 0; i < count; i++) {
      const d = join(j, 'tool-output', `c${++n}`);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, `make-audio-${action}.json`), '{}');
      if (action === 'voice') { writeFileSync(join(d, 'voice.mp3'), 'mp3'); writeFileSync(join(d, 'voice-alignment.json'), '{}'); }
      if (action === 'music') writeFileSync(join(d, 'music.mp3'), 'mp3');
    }
  }
  // A finished run's stage record and the files its stages need (lib/process.mjs).
  writeFileSync(join(work, 'visit.md'), '# Visit\n');
  writeFileSync(join(work, 'captures', 'elements.json'), '[]');
  const at = new Date().toISOString();
  writeFileSync(join(work, 'process.json'), JSON.stringify({ opened: STAGES.map((name) => ({ name, at })) }));
  return { j, work, out: join(j, 'output'), shot };
}
const pkg = ({ j, work, out, shot }) => spawnSync('node', [KIT, '--video', join(work, 'demo.mp4'), '--shotlist', shot,
  '--work', work, '--format', 'wide', '--package', out, '--pace', String(FIXTURE_PACE)], { encoding: 'utf8', env: { ...process.env, DEMO_JOB_ROOT: j } });

test('--package copies only on pass and removes stale outputs on fail', async () => {
  const ok = job();
  const r = pkg(ok);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(readdirSync(ok.out).sort(), ['demo.mp4', 'poster.png']);
  assert.ok(existsSync(join(ok.work, 'check.json')));
  // a failing video leaves nothing behind, including files from an earlier pass
  const bad = job({ video: v.short });
  writeFileSync(join(bad.out, 'demo.mp4'), 'stale');
  writeFileSync(join(bad.out, 'poster.png'), 'stale');
  const r2 = pkg(bad);
  assert.equal(r2.status, 1);
  assert.match(r2.stdout, /HARD duration/);
  assert.deepEqual(readdirSync(bad.out), []);
});

test('--package refuses when make-audio voice was never called', async () => {
  const j = job({ calls: { voice: 0, music: 1 } });
  const r = pkg(j);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /voice/);
  assert.deepEqual(readdirSync(j.out), []);
});

test('--package refuses 3 music calls', async () => {
  const j = job({ calls: { voice: 1, music: 3 } });
  const r = pkg(j);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /music/);
  assert.deepEqual(readdirSync(j.out), []);
});

// spec 16.2: a sound record (from before the sound action was removed) neither counts nor blocks.
test('--package is not blocked by make-audio sound records', async () => {
  const j = job({ calls: { voice: 1, music: 1, sound: 3 } });
  const r = pkg(j);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(readdirSync(j.out).sort(), ['demo.mp4', 'poster.png']);
});

test('--package refuses a shot list that does not validate', async () => {
  const j = job({ shotEdit: (s) => { s.fps = 24; return s; } });
  const r = pkg(j);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /shot list/i);
  assert.deepEqual(readdirSync(j.out), []);
});

test('--package sweeps the output folder to an allow-list (result.md, demo.mp4, poster.png)', async () => {
  const j = job();
  mkdirSync(join(j.out, 'audio', 'deep'), { recursive: true });
  writeFileSync(join(j.out, 'audio', 'voice.mp3'), 'audio');
  writeFileSync(join(j.out, 'audio', 'deep', 'x.wav'), 'audio');
  writeFileSync(join(j.out, 'clip.webm'), 'audio');
  writeFileSync(join(j.out, 'narration'), 'audio');
  writeFileSync(join(j.out, 'voice.mp3'), 'audio');
  writeFileSync(join(j.out, 'result.md'), '# done');
  const r = pkg(j);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(readdirSync(j.out).sort(), ['demo.mp4', 'poster.png', 'result.md']);
  assert.equal(readFileSync(join(j.out, 'result.md'), 'utf8'), '# done');
  // and on a refusal: only result.md survives
  const k = job({ calls: { voice: 0, music: 1 } });
  mkdirSync(join(k.out, 'audio'));
  writeFileSync(join(k.out, 'audio', 'voice.mp3'), 'audio');
  writeFileSync(join(k.out, 'result.md'), '# why');
  pkg(k);
  assert.deepEqual(readdirSync(k.out), ['result.md']);
});

test('--package exits 2 and leaves the output folder clean when something throws after the check', async () => {
  const j = job();
  rmSync(join(j.j, 'tool-output'), { recursive: true });
  writeFileSync(join(j.j, 'tool-output'), 'not a folder'); // audioCallsMade throws ENOTDIR
  writeFileSync(join(j.out, 'demo.mp4'), 'stale');
  writeFileSync(join(j.out, 'poster.png'), 'stale');
  mkdirSync(join(j.out, 'audio'));
  writeFileSync(join(j.out, 'audio', 'voice.mp3'), 'audio');
  const r = pkg(j);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.deepEqual(readdirSync(j.out), []);
});

test('the CLI exits 2 when the video cannot be read', async () => {
  const j = job();
  const r = spawnSync('node', [KIT, '--video', join(j.j, 'nope.mp4'), '--shotlist', j.shot, '--work', j.work, '--format', 'wide'],
    { encoding: 'utf8', env: { ...process.env, DEMO_JOB_ROOT: j.j } });
  assert.equal(r.status, 2);
});
