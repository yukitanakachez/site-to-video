// Render the demo video from the shot list, captures and audio (spec 7.1 stage 6) with Remotion
// (Task 2, DECISIONS.md: Remotion 4.0.547, its own Chrome Headless Shell, found from the agent folder: Task 13).
//   node kit/render.mjs --shotlist <f> --work <dir> --out <dir>/demo.mp4 --poster <dir>/poster.png
//
// Before rendering it copies the newest voice.mp3 + voice-alignment.json (from the same call) and
// music.mp3 out of the make-audio call folders under tool-output/ into work/audio/. Those files are
// intermediates: they are never delivered (ElevenLabs terms). There are no sound effects (spec 16.2).
//
// Shot-list units: times are plan-seconds, and the video plays the whole timeline `pace` times
// faster (lib/pace.cjs, spec 16): at pace 1.3 a moment from 6.5 to 13 plays from 5 s to 10 s, its camera
// move, cursor, terminal typing and clip all pace times faster. The voice's tempo is set per take
// from its own speaking rate, without changing its pitch (paceVoice), so every voice is heard at the
// same pace; the music is made for the finished length and never sped up. Camera rects and cursor x, y are source pixels of the moment's file; cursor atSec is
// plan-seconds from the moment's start.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { jobPaths } from '../lib/paths.mjs';
import { memorySampler } from '../lib/machine.mjs';
import paceLib from '../lib/pace.cjs';

export const FPS = 30;
const ENTRY = fileURLToPath(new URL('../render/src/index.ts', import.meta.url));
const SIZES = { wide: { width: 1920, height: 1080 }, tall: { width: 1080, height: 1920 } };
const FALLBACK_BACKGROUND = '#111318';

// --- audio -------------------------------------------------------------------------------------

const db = (x) => 10 ** (x / 20);
const MUSIC_DB = -10;
const DUCKED_DB = -20;
const RAMP_SEC = 0.15;
const MERGE_GAP_SEC = 0.5; // pauses shorter than this stay ducked, so the bed does not pump between words
const FADE_IN_SEC = 0.3;
const FADE_OUT_SEC = 1.2;

// The narration's spans (absolute seconds) during which the music is ducked.
export function duckWindows(words, voiceStartSec) {
  const spans = words.map((w) => [voiceStartSec + w.startSec, voiceStartSec + w.endSec]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of spans) {
    const last = out.at(-1);
    if (last && a - last[1] < MERGE_GAP_SEC) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out.map(([a, b]) => [round3(a), round3(b)]);
}

// Linear gain of the music bed at time t: −10 dB, ramping (150 ms, linear in dB) down to −20 dB
// while narration is active, faded in at the start and out over the last 1.2 s.
export function musicGain(t, windows, durationSec) {
  let duck = 0;
  for (const [a, b] of windows) {
    if (t >= a && t <= b) duck = 1;
    else if (t > a - RAMP_SEC && t < a) duck = Math.max(duck, (t - (a - RAMP_SEC)) / RAMP_SEC);
    else if (t > b && t < b + RAMP_SEC) duck = Math.max(duck, 1 - (t - b) / RAMP_SEC);
  }
  const fade = Math.min(1, t / FADE_IN_SEC, Math.max(0, (durationSec - t) / FADE_OUT_SEC));
  return db(MUSIC_DB + (DUCKED_DB - MUSIC_DB) * duck) * fade;
}

// Copies the newest of each audio file from the make-audio call folders into work/audio/.
// Voice and alignment always come from the same call. If tool-output holds no voice, files already
// placed in work/audio/ are used. Returns paths relative to workDir.
export function collectAudio({ toolOutputDir, workDir }) {
  const audioDir = join(workDir, 'audio');
  const calls = existsSync(toolOutputDir)
    ? readdirSync(toolOutputDir).map((name) => join(toolOutputDir, name)).filter((d) => statSync(d).isDirectory())
    : [];
  const newest = (name) => calls
    .filter((d) => existsSync(join(d, name)))
    .map((d) => ({ d, key: [statSync(d).mtimeMs, statSync(join(d, name)).mtimeMs] }))
    .sort((a, b) => b.key[0] - a.key[0] || b.key[1] - a.key[1])[0]?.d;

  mkdirSync(audioDir, { recursive: true });
  const take = (dir, name) => { if (dir) copyFileSync(join(dir, name), join(audioDir, name)); };
  const voiceDir = calls.filter((d) => existsSync(join(d, 'voice.mp3')) && existsSync(join(d, 'voice-alignment.json')))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs || statSync(join(b, 'voice.mp3')).mtimeMs - statSync(join(a, 'voice.mp3')).mtimeMs)[0];
  take(voiceDir, 'voice.mp3');
  take(voiceDir, 'voice-alignment.json');
  take(newest('music.mp3'), 'music.mp3');

  for (const name of ['voice.mp3', 'voice-alignment.json', 'music.mp3']) {
    if (!existsSync(join(audioDir, name))) throw new Error(`no ${name} found under ${toolOutputDir} or in ${audioDir}; run make-audio first`);
  }
  return { voice: 'audio/voice.mp3', alignment: 'audio/voice-alignment.json', music: 'audio/music.mp3' };
}

// The voice as heard in the video. ElevenLabs spoke it at the alignment's `speed` (make-audio asks
// for up to 1.2), but how much faster that came out varies by take, so the tempo is worked out from
// this clip (ruling R19): it is heard at `rate` (the voice's normal words a second, voices.json) x
// pace. ffmpeg's atempo changes the tempo and keeps the pitch. Writes work/audio/voice-paced.wav and
// returns it with the word timings scaled to match.
export function paceVoice({ workDir, audio, pace, rate }) {
  const alignment = JSON.parse(readFileSync(join(workDir, audio.alignment), 'utf8'));
  const pb = paceLib.voicePlayback(alignment, rate, pace);
  if (pb.clamped) {
    console.error(`warning: the voice clip runs at ${pb.clipRate.toFixed(2)} words a second; reaching ${pb.target.toFixed(2)} needs a tempo outside ${paceLib.TEMPO_BOUNDS.join('-')}, so it plays at ${pb.tempo}`);
  }
  const file = 'audio/voice-paced.wav';
  ffmpeg(['-i', join(workDir, audio.voice), '-af', `atempo=${pb.tempo}`, '-ar', '44100', join(workDir, file)]);
  return { file, words: paceLib.heardWords(alignment, pb.tempo), tempo: pb.tempo };
}

// The music is made for the finished video's length; if the video was lengthened after it, the bed
// would stop early and leave the end card silent. Returns why, or null when it is long enough.
// durationSec: seconds of the video (the shot list's durationSec / pace).
const MUSIC_SLACK_SEC = 0.3;
export function musicTooShort(musicPath, durationSec) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', musicPath], { encoding: 'utf8' });
  const len = Number(r.stdout.trim());
  if (!Number.isFinite(len) || len + MUSIC_SLACK_SEC >= durationSec) return null;
  const sec = Math.round(durationSec * 10) / 10;
  return `music.mp3 is ${len.toFixed(1)} s but the video is ${sec} s: ask make-audio for the music again with seconds ${sec} (the second and last music call), then render`;
}

// --- captions ----------------------------------------------------------------------------------

const round3 = (x) => Math.round(x * 1000) / 1000;
const normWord = (w) => w.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const LOOKAHEAD = 4;

// Narration words, in order, with the alignment's timing. A word that is not found within a few
// alignment words (spoken differently, e.g. "$5" as "five dollars") shares the time between its
// matched neighbours, so one mismatch does not shift the rest.
function timeWords(narration, words) {
  const tokens = narration.flatMap((line, li) => String(line.text).trim().split(/\s+/).filter(Boolean).map((text) => ({ text, li })));
  let j = 0;
  for (const tok of tokens) {
    const n = normWord(tok.text);
    for (let k = 0; k < LOOKAHEAD && j + k < words.length; k++) {
      if (n && normWord(words[j + k].word) === n) {
        tok.startSec = words[j + k].startSec;
        tok.endSec = words[j + k].endSec;
        j += k + 1;
        break;
      }
    }
  }
  const total = words.length ? [words[0].startSec, words.at(-1).endSec] : [0, 0];
  for (let i = 0; i < tokens.length;) {
    if (tokens[i].startSec !== undefined) { i++; continue; }
    let e = i;
    while (e < tokens.length && tokens[e].startSec === undefined) e++;
    const from = i > 0 ? tokens[i - 1].endSec : total[0];
    const to = e < tokens.length ? tokens[e].startSec : Math.max(total[1], from);
    const step = (to - from) / (e - i);
    for (let k = i; k < e; k++) { tokens[k].startSec = from + step * (k - i); tokens[k].endSec = from + step * (k - i + 1); }
    i = e;
  }
  return tokens;
}

// One caption page per narration line; a line longer than two rows of maxChars is split into pages
// of two rows. Each page shows from its first word's start to its last word's end.
export function captionPages(narration, words, { voiceStartSec, maxChars }) {
  const tokens = timeWords(narration, words);
  const pages = [];
  for (let li = 0; li < narration.length; li++) {
    const lineWords = tokens.filter((t) => t.li === li).map((t) => ({ text: t.text, startSec: round3(voiceStartSec + t.startSec), endSec: round3(voiceStartSec + t.endSec) }));
    const rows = [];
    for (const w of lineWords) {
      const row = rows.at(-1);
      const len = row ? row.reduce((n, x) => n + x.text.length + 1, -1) : 0;
      if (row && len + 1 + w.text.length <= maxChars) row.push(w);
      else rows.push([w]);
    }
    for (let r = 0; r < rows.length; r += 2) {
      const lines = rows.slice(r, r + 2);
      pages.push({ startSec: lines[0][0].startSec, endSec: lines.at(-1).at(-1).endSec, lines });
    }
  }
  return pages;
}
const CAPTION_CHARS = { wide: 42, tall: 28 }; // per row at 64 px (wide) / 60 px (tall) Inter Bold (about 0.48 em a character, with room for wide letters)

// --- pictures ----------------------------------------------------------------------------------

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'buffer', maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr?.toString().trim() || r.error?.message}`);
  return r.stdout;
}

function mediaSize(file) {
  const b = readFileSync(file);
  if (b.length > 24 && b.toString('latin1', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], { encoding: 'utf8' });
  const s = JSON.parse(r.stdout || '{}').streams?.[0];
  if (!s) throw new Error(`cannot read the size of ${file}`);
  return { width: s.width, height: s.height };
}

// The page's background colour, as #rrggbb: the most common colour in page.png's top-left
// 200x200 (quantised to 4 bits a channel, then averaged within that bin). A plain average is
// pulled off by a logo sitting in the corner.
export function backgroundColour(pngPath) {
  if (!existsSync(pngPath)) return FALLBACK_BACKGROUND;
  const { width, height } = mediaSize(pngPath);
  const w = Math.min(200, width), h = Math.min(200, height);
  const px = ffmpeg(['-i', pngPath, '-vf', `crop=${w}:${h}:0:0`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const bins = new Map();
  for (let i = 0; i + 2 < px.length; i += 3) {
    const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    const b = bins.get(key) ?? [0, 0, 0, 0];
    b[0] += px[i]; b[1] += px[i + 1]; b[2] += px[i + 2]; b[3] += 1;
    bins.set(key, b);
  }
  const [r, g, b, n] = [...bins.values()].sort((x, y) => y[3] - x[3])[0];
  return `#${[r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('')}`;
}

// A full-page screenshot can be 2880 x 24000 px; each render tab would decode all of it. Crop it to
// the area the camera covers and shift the rects to match.
function cropForCamera(workDir, m, size) {
  const { from, to } = m.camera;
  const x0 = Math.max(0, Math.floor(Math.min(from.x, to.x)));
  const y0 = Math.max(0, Math.floor(Math.min(from.y, to.y)));
  const x1 = Math.min(size.width, Math.ceil(Math.max(from.x + from.w, to.x + to.w)));
  const y1 = Math.min(size.height, Math.ceil(Math.max(from.y + from.h, to.y + to.h)));
  const file = `render-cache/${m.id}.png`;
  mkdirSync(join(workDir, 'render-cache'), { recursive: true });
  ffmpeg(['-i', join(workDir, m.source.file), '-vf', `crop=${x1 - x0}:${y1 - y0}:${x0}:${y0}`, join(workDir, file)]);
  const shift = (r) => ({ ...r, x: r.x - x0, y: r.y - y0 });
  return {
    source: { type: 'screenshot', file, width: x1 - x0, height: y1 - y0 },
    camera: { ...m.camera, from: shift(from), to: shift(to) },
    cursor: (m.cursor ?? []).map((c) => ({ ...c, x: c.x - x0, y: c.y - y0 })),
  };
}

// A moment's start and end in seconds of the video; its cursor keeps plan-seconds (Cursor plays them at pace).
function prepareMoment(workDir, m, pace) {
  const base = { id: m.id, startSec: m.startSec / pace, endSec: m.endSec / pace, caption: m.caption ?? null, cursor: m.cursor ?? [] };
  const src = m.source;
  if (src.type === 'screenshot') {
    const size = mediaSize(join(workDir, src.file));
    return { ...base, ...cropForCamera(workDir, m, size) };
  }
  if (src.type === 'clip') {
    return { ...base, camera: m.camera, source: { type: 'clip', file: src.file, ...mediaSize(join(workDir, src.file)) } };
  }
  if (src.type === 'terminal') return { ...base, cursor: [], source: { type: 'terminal', lines: src.lines.map(({ kind, text }) => ({ kind, text })) } };
  if (src.type === 'endcard') {
    const logo = src.logo && existsSync(join(workDir, src.logo)) ? src.logo : null;
    return { ...base, cursor: [], source: { type: 'endcard', title: src.title, url: src.url, logo } };
  }
  throw new Error(`moment ${m.id}: unknown source type ${src.type}`);
}

// The composition's props, every time in seconds of the video (the shot list's plan-seconds / pace),
// except cursor atSec, which the components play at pace.
export function demoProps({ shot, workDir, audio, pace = paceLib.pace() }) {
  const voice = paceVoice({ workDir, audio, pace, rate: paceLib.normalRate(shot.voice) });
  const durationSec = shot.durationSec / pace;
  const voiceStartSec = shot.voiceStartSec / pace;
  const total = Math.round(durationSec * FPS);
  const windows = duckWindows(voice.words, voiceStartSec);
  const endcard = shot.moments.find((m) => m.source?.type === 'endcard');
  return {
    format: shot.format,
    durationSec,
    pace,
    moments: shot.moments.map((m) => prepareMoment(workDir, m, pace)),
    captions: captionPages(shot.narration, voice.words, { voiceStartSec, maxChars: CAPTION_CHARS[shot.format] }),
    voice: { file: voice.file, startSec: voiceStartSec },
    music: { file: audio.music, volume: Array.from({ length: total }, (_, f) => Math.round(musicGain(f / FPS, windows, durationSec) * 1e4) / 1e4) },
    background: backgroundColour(join(workDir, 'captures', 'page.png')),
    terminalTitle: endcard?.source.title ?? 'Terminal',
  };
}

// --- render ------------------------------------------------------------------------------------

// Remotion looks for its Chrome Headless Shell under the nearest package.json above the working
// directory. workspace.install put it in the agent folder (node_modules/.remotion), but a job's
// commands run in /job, where Remotion would download it again on every render (Task 13). So ask
// from the agent folder, once, and pass the path to every call.
// Remotion has no option for that folder, so this changes the process's working directory while it
// asks. Nothing else may resolve a relative path meanwhile: renderDemo awaits it with no other work
// in flight and resolves its own paths outside that window. If the shell is missing or the wrong
// version, ensureBrowser would download into the agent folder, which is read-only on Starwish
// (EACCES); then this returns null and Remotion finds (or downloads) its own browser from the job's
// folder, slower but working.
const AGENT_DIR = fileURLToPath(new URL('..', import.meta.url));
export async function remotionBrowser({ ensure, warn = (m) => console.error(m) } = {}) {
  ensure ??= (await import('@remotion/renderer')).ensureBrowser;
  const cwd = process.cwd();
  process.chdir(AGENT_DIR);
  try {
    return (await ensure()).path ?? null;
  } catch (e) {
    warn(`render: the agent folder's browser could not be used (${e.message}); Remotion will find its own.`);
    return null;
  } finally {
    process.chdir(cwd);
  }
}

// Where the Remotion bundle is built: beside the work folder, in the job tree.
export const renderBundleDir = (workDir) => join(dirname(resolve(workDir)), 'render-bundle');

export async function renderDemo({ shotlistPath, workDir, outPath, posterPath, toolOutputDir = jobPaths().toolOutput, pace = paceLib.pace() }) {
  const started = Date.now();
  const mem = memorySampler(); // machine-wide memory in use, Chrome included (Task 13)
  const shot = JSON.parse(readFileSync(shotlistPath, 'utf8'));
  const size = SIZES[shot.format];
  if (!size) throw new Error(`format must be wide or tall, got ${shot.format}`);
  workDir = resolve(workDir);
  const audio = collectAudio({ toolOutputDir, workDir });
  const short = musicTooShort(join(workDir, audio.music), shot.durationSec / pace);
  if (short) throw new Error(short);
  const inputProps = demoProps({ shot, workDir, audio, pace });

  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, renderStill, selectComposition } = await import('@remotion/renderer');
  const browserExecutable = await remotionBrowser();
  // The bundle holds a copy of the whole work folder (voice.mp3 included), so it lives in the job
  // tree beside work/, never in the system temp folder, and is deleted when the render ends.
  const bundleDir = renderBundleDir(workDir);
  rmSync(bundleDir, { recursive: true, force: true });
  let composition;
  try {
    const serveUrl = await bundle({ entryPoint: ENTRY, publicDir: workDir, outDir: bundleDir, enableCaching: false });
    composition = await selectComposition({ serveUrl, id: 'Demo', inputProps, browserExecutable });
    mkdirSync(dirname(resolve(outPath)), { recursive: true });
    await renderMedia({
      serveUrl, composition, inputProps, browserExecutable,
      codec: 'h264', audioCodec: 'aac', crf: 20,
      imageFormat: 'jpeg', jpegQuality: 92,
      outputLocation: resolve(outPath),
    });
    const first = inputProps.moments[0];
    mkdirSync(dirname(resolve(posterPath)), { recursive: true });
    await renderStill({
      serveUrl, composition, inputProps, browserExecutable,
      frame: Math.min(composition.durationInFrames - 1, Math.round(((first.startSec + first.endSec) / 2) * FPS)),
      imageFormat: 'png',
      output: resolve(posterPath),
    });
  } finally {
    rmSync(bundleDir, { recursive: true, force: true });
  }
  return { durationSec: composition.durationInFrames / FPS, width: composition.width, height: composition.height, renderMs: Date.now() - started, machine: mem.stop() };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const [shotlistPath, workDir, outPath, posterPath] = [flag('shotlist'), flag('work'), flag('out'), flag('poster')];
  if (!shotlistPath || !workDir || !outPath || !posterPath) {
    console.error('usage: node kit/render.mjs --shotlist <f> --work <dir> --out <dir>/demo.mp4 --poster <dir>/poster.png');
    process.exit(2);
  }
  renderDemo({ shotlistPath, workDir, outPath, posterPath }).then((r) => {
    console.log(JSON.stringify(r));
    process.exit(0);
  }, (e) => {
    console.error(`render failed: ${e.message}`);
    process.exit(1);
  });
}
