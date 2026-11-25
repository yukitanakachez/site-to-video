// Slow: bundles and renders real videos with Remotion. Run with `npm run test:render`.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderDemo, captionPages, duckWindows, collectAudio, musicGain, backgroundColour, renderBundleDir, musicTooShort, paceVoice, demoProps, remotionBrowser } from '../../kit/render.mjs';
import { validateShotlist } from '../../lib/shotlist.mjs';
import { loadFacts } from '../../lib/facts.mjs';
import { pngSize, FIXTURE_PACE } from '../helpers.mjs';
import paceLib from '../../lib/pace.cjs';

const FIX = fileURLToPath(new URL('../fixtures/job-good/', import.meta.url));
const voices = JSON.parse(readFileSync(new URL('../../config/voices.json', import.meta.url), 'utf8'));

// A job folder in tmp: work/ holds the fixture's captures and clips, tool-output/ its audio calls.
// voice: 'speed-1.2' puts the fixture voice spoken at ElevenLabs speed 1.2 in c1 (production's path).
function makeJob({ withCaptures = true, voice } = {}) {
  const job = mkdtempSync(join(tmpdir(), 'render-'));
  const work = join(job, 'work');
  mkdirSync(work);
  if (withCaptures) {
    cpSync(join(FIX, 'captures'), join(work, 'captures'), { recursive: true });
    cpSync(join(FIX, 'clips'), join(work, 'clips'), { recursive: true });
  }
  cpSync(join(FIX, 'tool-output'), join(job, 'tool-output'), { recursive: true });
  if (voice) cpSync(join(FIX, `voice-${voice}`), join(job, 'tool-output', 'c1'), { recursive: true });
  return { job, work, toolOutputDir: join(job, 'tool-output'), out: join(job, 'output') };
}

function ffprobe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  const [n, d] = v.r_frame_rate.split('/').map(Number);
  return { video: { width: v.width, height: v.height, codec: v.codec_name }, audio: a && { codec: a.codec_name }, fps: n / d, durationSec: Number(j.format.duration) };
}

function rmsDb(file, startSec, durSec) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(startSec), '-t', String(durSec), '-i', file, '-vn', '-af', 'astats=measure_perchannel=none', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = r.stderr.match(/RMS level dB:\s*(-?[\d.]+|-inf)/);
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

// Average colour of a small box of one frame, as [r, g, b].
function pixel(file, tSec, x, y, size = 8) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(tSec), '-i', file, '-frames:v', '1',
    '-vf', `crop=${size}:${size}:${x}:${y},scale=1:1:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 });
  return [...r.stdout.subarray(0, 3)];
}

test('the fixture shot lists are valid', () => {
  const facts = loadFacts(join(FIX, 'facts.json'));
  for (const name of ['shotlist-wide.json', 'shotlist-tall.json', 'shotlist-terminal.json']) {
    const s = JSON.parse(readFileSync(join(FIX, name), 'utf8'));
    const captureSizes = {};
    for (const m of s.moments) if (m.source.file) captureSizes[m.source.file] = m.source.file.endsWith('.png') ? pngSize(join(FIX, m.source.file)) : probeSize(join(FIX, m.source.file));
    const r = validateShotlist(s, { facts, voices, captureSizes, pace: FIXTURE_PACE });
    assert.deepEqual(r.errors, [], name);
  }
});

function probeSize(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], { encoding: 'utf8' });
  return JSON.parse(r.stdout).streams[0];
}

test('captionPages matches narration words to the alignment in order and pages long lines', () => {
  const narration = [{ id: 'n1', text: 'Meet Fixture.' }, { id: 'n2', text: 'It ships, fast!' }];
  const words = [['Meet', 0, 0.3], ['Fixture.', 0.35, 0.8], ['It', 1.2, 1.3], ['ships,', 1.35, 1.7], ['fast!', 1.75, 2.1]]
    .map(([word, startSec, endSec]) => ({ word, startSec, endSec }));
  const pages = captionPages(narration, words, { voiceStartSec: 0.5, maxChars: 40 });
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0], { startSec: 0.5, endSec: 1.3, lines: [[{ text: 'Meet', startSec: 0.5, endSec: 0.8 }, { text: 'Fixture.', startSec: 0.85, endSec: 1.3 }]] });
  assert.equal(pages[1].startSec, 1.7);
  assert.equal(pages[1].endSec, 2.6);

  // a long line is wrapped at maxChars and paged two lines at a time
  const long = [{ id: 'n1', text: 'one two three four five six seven eight nine ten' }];
  const lw = long[0].text.split(' ').map((w, i) => ({ word: w, startSec: i, endSec: i + 0.5 }));
  const lp = captionPages(long, lw, { voiceStartSec: 0, maxChars: 10 });
  assert.ok(lp.length >= 2);
  assert.ok(lp.every((p) => p.lines.length <= 2 && p.lines.every((l) => l.map((w) => w.text).join(' ').length <= 10)));
  assert.deepEqual(lp.flatMap((p) => p.lines.flat().map((w) => w.text)), long[0].text.split(' '));

  // a word the voice skipped or spelled differently takes its neighbours' timing instead of shifting the rest
  const odd = [{ id: 'n1', text: 'Costs $5 a month now' }];
  const ow = [['Costs', 0, 0.3], ['five', 0.4, 0.7], ['dollars', 0.7, 1.0], ['a', 1.1, 1.2], ['month', 1.3, 1.6], ['now', 1.7, 2.0]]
    .map(([word, startSec, endSec]) => ({ word, startSec, endSec }));
  const op = captionPages(odd, ow, { voiceStartSec: 0, maxChars: 40 }).flatMap((p) => p.lines.flat());
  assert.deepEqual(op.map((w) => w.text), ['Costs', '$5', 'a', 'month', 'now']);
  assert.equal(op[2].startSec, 1.1);
  assert.equal(op[4].endSec, 2.0);
  assert.ok(op[1].startSec >= 0.3 && op[1].endSec <= 1.1);
});

test('duckWindows merges words closer than half a second', () => {
  const words = [[0, 0.3], [0.35, 0.6], [1.5, 1.8]].map(([startSec, endSec]) => ({ startSec, endSec }));
  assert.deepEqual(duckWindows(words, 1), [[1, 1.6], [2.5, 2.8]]);
  // −10 dB outside, −20 dB inside, 150 ms ramps either side
  const g = (t) => 20 * Math.log10(musicGain(t, [[1, 1.6]], 10));
  assert.ok(Math.abs(g(0.5) - -10) < 0.01);
  assert.ok(Math.abs(g(1.3) - -20) < 0.01);
  assert.ok(g(0.925) < -10 && g(0.925) > -20);
  assert.ok(Math.abs(g(1.8) - -10) < 0.01);
});

test('collectAudio copies the newest of each audio file from the tool output', () => {
  const { job, work, toolOutputDir } = makeJob({ withCaptures: false });
  // a later retry of the voice in its own call folder wins
  mkdirSync(join(toolOutputDir, 'c9'));
  writeFileSync(join(toolOutputDir, 'c9', 'voice.mp3'), 'newer');
  writeFileSync(join(toolOutputDir, 'c9', 'voice-alignment.json'), '{"words":[]}');
  const future = new Date(Date.now() + 60_000);
  for (const f of ['voice.mp3', 'voice-alignment.json', '']) utimesSync(join(toolOutputDir, 'c9', f), future, future);
  // a newer call holding only a voice, without its alignment, is not used: the two must match
  mkdirSync(join(toolOutputDir, 'c10'));
  writeFileSync(join(toolOutputDir, 'c10', 'voice.mp3'), 'orphan');
  // a sound file from an old call is not copied: there are no sound effects (spec 16.2)
  mkdirSync(join(toolOutputDir, 'c3'));
  writeFileSync(join(toolOutputDir, 'c3', 'sound-s1.mp3'), 'old');
  const got = collectAudio({ toolOutputDir, workDir: work });
  assert.equal(readFileSync(join(work, 'audio', 'voice.mp3'), 'utf8'), 'newer');
  assert.equal(readFileSync(join(work, 'audio', 'voice-alignment.json'), 'utf8'), '{"words":[]}');
  assert.ok(existsSync(join(work, 'audio', 'music.mp3')));
  assert.deepEqual(got, { voice: 'audio/voice.mp3', alignment: 'audio/voice-alignment.json', music: 'audio/music.mp3' });
  assert.equal(existsSync(join(work, 'audio', 'sound-s1.mp3')), false);
  rmSync(join(toolOutputDir, 'c2', 'music.mp3'));
  rmSync(join(work, 'audio'), { recursive: true });
  assert.throws(() => collectAudio({ toolOutputDir, workDir: work }), /music\.mp3/);
  rmSync(job, { recursive: true, force: true });
});

// Run 1 of Task 12: the music was made for 18 s, the video was then lengthened to 19.9 s, and
// the end card played in silence. A bed shorter than the video is refused before rendering.
test('musicTooShort refuses a music bed that ends before the video does', () => {
  const dir = mkdtempSync(join(tmpdir(), 'music-len-'));
  const mp3 = join(dir, 'music.mp3');
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=18', '-c:a', 'libmp3lame', mp3]);
  assert.equal(r.status, 0);
  assert.match(musicTooShort(mp3, 19.9), /18\.0 s.*19\.9 s.*music.*19\.9/);
  assert.equal(musicTooShort(mp3, 18), null);
  rmSync(dir, { recursive: true, force: true });
});

// Seconds of an audio file, and its frequency from zero crossings (mono, 44.1 kHz).
function audioLength(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(r.stdout.trim());
}
function toneHz(file, startSec, durSec) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(startSec), '-t', String(durSec), '-i', file, '-ac', '1', '-ar', '44100', '-f', 's16le', '-'], { maxBuffer: 1 << 24 });
  const n = r.stdout.length / 2;
  let crossings = 0;
  for (let i = 1; i < n; i++) if ((r.stdout.readInt16LE((i - 1) * 2) < 0) !== (r.stdout.readInt16LE(i * 2) < 0)) crossings++;
  return crossings / 2 / (n / 44100);
}

// spec 16 and ruling R19: the narration is heard at the voice's normal rate x pace, however fast
// ElevenLabs happened to speak this take, and must still sound natural: the tempo change keeps the pitch.
test('paceVoice: heard rate = the voice\'s normal rate x pace within 3%, fast takes slowed, slow ones sped up, pitch kept', () => {
  const work = mkdtempSync(join(tmpdir(), 'pace-voice-'));
  mkdirSync(join(work, 'audio'));
  const audio = { voice: 'audio/voice.mp3', alignment: 'audio/voice-alignment.json' };
  const RATE = 2.3; // the voice's normal words a second
  const target = RATE * FIXTURE_PACE;
  const nominal = paceLib.voiceTempo(1.2, FIXTURE_PACE);
  const N = 10;
  // ElevenLabs' speed-1.2 take came out at its average 1.245x, faster (1.41x) or slower (1.15x)
  for (const [name, up, cmp] of [['average', 1.245, 0], ['fast', 1.41, -1], ['slow', 1.15, 1]]) {
    const span = N / (RATE * up);
    assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=220:duration=${span}:sample_rate=44100`, '-c:a', 'libmp3lame', join(work, audio.voice)]).status, 0);
    const step = span / (N - 0.2);
    const words = Array.from({ length: N }, (_, k) => ({ word: `w${k}`, startSec: k * step, endSec: (k + 0.8) * step }));
    writeFileSync(join(work, audio.alignment), JSON.stringify({ speed: 1.2, words }));
    const v = paceVoice({ workDir: work, audio, pace: FIXTURE_PACE, rate: RATE });
    if (cmp === 0) assert.ok(Math.abs(v.tempo - nominal) < 1e-6, `${name}: tempo ${v.tempo}`);
    else assert.ok(cmp < 0 ? v.tempo < nominal : v.tempo > nominal, `${name}: tempo ${v.tempo} vs nominal ${nominal}`);
    const heard = N / (v.words.at(-1).endSec - v.words[0].startSec);
    assert.ok(Math.abs(heard - target) / target < 0.03, `${name}: heard ${heard} words a second, want ${target}`);
    // the file itself is that long: the tempo change really happened
    const len = audioLength(join(work, v.file));
    assert.ok(Math.abs(len - span / v.tempo) / (span / v.tempo) < 0.03, `${name}: paced file ${len} s, want ${span / v.tempo}`);
    assert.ok(Math.abs(toneHz(join(work, v.file), 0.3, 1.0) - 220) < 4, `${name}: the pitch is kept`);
  }
  rmSync(work, { recursive: true, force: true });
});

test('demoProps turns plan-seconds into seconds of the video', () => {
  const j = makeJob();
  const shot = JSON.parse(readFileSync(join(FIX, 'shotlist-wide.json'), 'utf8'));
  const audio = collectAudio({ toolOutputDir: j.toolOutputDir, workDir: j.work });
  const p = demoProps({ shot, workDir: j.work, audio, pace: FIXTURE_PACE });
  assert.equal(shot.durationSec, 20.8);
  assert.equal(p.durationSec, 16);
  assert.equal(p.pace, 1.3);
  assert.deepEqual(p.moments.map((m) => [m.startSec, m.endSec]), [[0, 4.5], [4.5, 8.5], [8.5, 13.5], [13.5, 16]]);
  assert.equal(p.voice.startSec, 0);
  assert.equal(p.voice.file, 'audio/voice-paced.wav');
  assert.equal(p.music.volume.length, 480);
  // the captions follow the voice as heard: 46 words at Jade's 2.3 x 1.3 a second, ending at 15.435 s
  assert.ok(Math.abs(p.captions.at(-1).endSec - 15.435) < 0.01, `${p.captions.at(-1).endSec}`);
  assert.equal('sounds' in p, false);
  rmSync(j.job, { recursive: true, force: true });
});

const renders = {};
async function render(name, opts) {
  const j = makeJob(opts);
  const outPath = join(j.out, 'demo.mp4');
  const posterPath = join(j.out, 'poster.png');
  const r = await renderDemo({ shotlistPath: join(FIX, name), workDir: j.work, outPath, posterPath, toolOutputDir: j.toolOutputDir, pace: FIXTURE_PACE });
  return { ...j, outPath, posterPath, r };
}

const tmpBundles = () => new Set(readdirSync(tmpdir()).filter((n) => n.startsWith('remotion-webpack-bundle-')));
let bundlesBefore, bundlesAfter;
before(async () => {
  bundlesBefore = tmpBundles();
  renders.wide = await render('shotlist-wide.json');
  bundlesAfter = tmpBundles();
});

test('the Remotion bundle (a copy of work/, voice included) is built in the job tree and deleted', () => {
  assert.equal(renderBundleDir(renders.wide.work), join(renders.wide.job, 'render-bundle'));
  assert.equal(existsSync(join(renders.wide.job, 'render-bundle')), false);
  assert.deepEqual([...bundlesAfter].filter((n) => !bundlesBefore.has(n)), [], 'no new remotion-webpack-bundle-* in the system temp folder');
});

test('renders the good fixture at 1920x1080, 30 fps, h264+aac, its plan duration divided by the pace', () => {
  const { outPath, posterPath, r } = renders.wide;
  const p = ffprobe(outPath);
  assert.equal(p.video.width, 1920); assert.equal(p.video.height, 1080);
  assert.equal(p.video.codec, 'h264'); assert.equal(p.audio.codec, 'aac'); assert.equal(p.fps, 30);
  // 20.8 plan-seconds at pace 1.3: 16 s, 480 frames
  assert.ok(Math.abs(p.durationSec - 20.8 / 1.3) < 0.1, `duration ${p.durationSec}`);
  assert.deepEqual(pngSize(posterPath), { width: 1920, height: 1080 });
  assert.deepEqual([r.width, r.height, r.durationSec], [1920, 1080, 16]);
  assert.ok(r.renderMs > 0);
});

test('backgroundColour picks the page colour, not the logo in the corner', () => {
  assert.equal(backgroundColour(join(FIX, 'captures', 'page.png')), '#f6f5ff');
  assert.equal(backgroundColour(join(FIX, 'no-such.png')), '#111318');
});

test('the end card sits on the page\'s own background colour', () => {
  const { outPath } = renders.wide;
  const [r, g, b] = pixel(outPath, 15.5, 20, 20);
  // the fixture page's background is #f6f5ff
  assert.ok(Math.abs(r - 0xf6) < 8 && Math.abs(g - 0xf5) < 8 && Math.abs(b - 0xff) < 8, `got ${r},${g},${b}`);
});

test('renders tall at 1080x1920', async () => {
  const { outPath, posterPath } = await render('shotlist-tall.json');
  const p = ffprobe(outPath);
  assert.deepEqual([p.video.width, p.video.height], [1080, 1920]);
  assert.ok(Math.abs(p.durationSec - 16) < 0.1);
  assert.deepEqual(pngSize(posterPath), { width: 1080, height: 1920 });
});

test('renders a terminal moment and an endcard without a screenshot source', async () => {
  const { outPath, posterPath } = await render('shotlist-terminal.json', { withCaptures: false });
  const p = ffprobe(outPath);
  assert.deepEqual([p.video.width, p.video.height], [1920, 1080]);
  assert.ok(Math.abs(p.durationSec - 16) < 0.1);
  assert.ok(existsSync(posterPath));
  // with no page.png the end card falls back to a dark background
  const [r, g, b] = pixel(outPath, 15.5, 20, 20);
  assert.ok(r < 40 && g < 40 && b < 50, `got ${r},${g},${b}`);
});

// The fixture voice is a 220 Hz tone while each word is spoken: 46 words at Jade's normal rate (2.3 a
// second). Heard at 2.3 x 1.3 = 2.99 a second, they run 0.05-15.435 s of the video. The speed-1.2
// variant (the path production takes) must end there too: the heard rate does not depend on the take.
async function voiceEnd(voice) {
  const j = makeJob({ voice });
  const music = join(j.toolOutputDir, 'c2', 'music.mp3');
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '18', '-c:a', 'libmp3lame', music]);
  const outPath = join(j.out, 'demo.mp4');
  await renderDemo({ shotlistPath: join(FIX, 'shotlist-wide.json'), workDir: j.work, outPath, posterPath: join(j.out, 'poster.png'), toolOutputDir: j.toolOutputDir, pace: FIXTURE_PACE });
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', outPath, '-vn', '-af', 'silencedetect=n=-45dB:d=0.4', '-f', 'null', '-'], { encoding: 'utf8' });
  rmSync(j.job, { recursive: true, force: true });
  return Math.max(...[...r.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1])));
}

test('the voice is heard pace times faster in the video', async () => {
  const end = await voiceEnd();
  assert.ok(Math.abs(end - 15.435) < 0.15, `the voice ends at ${end} s of the video, want 15.435`);
});

test('a voice spoken at ElevenLabs speed 1.2 is heard at the same rate (within 3%)', async () => {
  const al = JSON.parse(readFileSync(join(FIX, 'voice-speed-1.2', 'voice-alignment.json'), 'utf8'));
  assert.equal(al.speed, 1.2);
  const end = await voiceEnd('speed-1.2');
  assert.ok(Math.abs(end - 15.435) / 15.435 < 0.03, `the voice ends at ${end} s of the video, want 15.435 within 3%`);
});

test('music is quieter while narration plays', async () => {
  // Variant: the voice is silent, so the mix holds only the music bed.
  const j = makeJob();
  const voice = join(j.toolOutputDir, 'c1', 'voice.mp3');
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '14', '-c:a', 'libmp3lame', voice]);
  const outPath = join(j.out, 'demo.mp4');
  await renderDemo({ shotlistPath: join(FIX, 'shotlist-wide.json'), workDir: j.work, outPath, posterPath: join(j.out, 'poster.png'), toolOutputDir: j.toolOutputDir, pace: FIXTURE_PACE });
  // From the fixture alignment: narration n2 is spoken over 1.5-4.4 s, and a 1.5 s pause sits at 8.85-10.35 s.
  const narrated = rmsDb(outPath, 2.0, 2.0);
  const gap = rmsDb(outPath, 9.2, 0.8);
  assert.ok(Number.isFinite(gap) && gap > -40, `gap RMS ${gap}`);
  assert.ok(narrated < gap - 8 && narrated > gap - 12, `narrated ${narrated} dB vs gap ${gap} dB; want about 10 dB lower`);
});

test('remotionBrowser finds the agent folder’s Chrome Headless Shell from any working directory (Task 13: a job runs in /job)', async () => {
  const away = realpathSync(mkdtempSync(join(tmpdir(), 'no-package-')));
  const before = process.cwd();
  process.chdir(away);
  try {
    const path = await remotionBrowser();
    const agentDir = fileURLToPath(new URL('../..', import.meta.url));
    assert.ok(path.startsWith(join(agentDir, 'node_modules', '.remotion')), path);
    assert.ok(existsSync(path));
    assert.equal(process.cwd(), away, 'the working directory is put back');
    assert.equal(existsSync(join(away, '.remotion')), false, 'nothing was downloaded into the working directory');
    assert.equal(existsSync(join(away, 'node_modules')), false, 'nor under its node_modules');
  } finally {
    process.chdir(before);
    rmSync(away, { recursive: true, force: true });
  }
});

// R13 minor 3: on Starwish /agent is read-only. If the shell is missing or the wrong version,
// ensureBrowser would try to download into it and fail (EACCES); Remotion then finds its own.
test('remotionBrowser falls back to null when the agent folder’s browser cannot be ensured', async () => {
  const before = process.cwd();
  const denied = async () => { throw Object.assign(new Error("EACCES: permission denied, mkdir '/agent/node_modules/.remotion'"), { code: 'EACCES' }); };
  const warnings = [];
  assert.equal(await remotionBrowser({ ensure: denied, warn: (m) => warnings.push(m) }), null);
  assert.equal(process.cwd(), before, 'the working directory is put back');
  assert.match(warnings.join('\n'), /EACCES/);
});
