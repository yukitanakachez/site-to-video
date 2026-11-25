// Regenerates the job-good fixture: captures and clips of site/index.html (with the real scout and
// captureMoment), and sine-wave stand-ins for the ElevenLabs audio with a matching word alignment.
// Run from demo-video/: node test/fixtures/job-good/make-fixtures.mjs
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scout } from '../../../kit/scout.mjs';
import { captureMoment } from '../../../kit/capture.mjs';
import paceLib from '../../../lib/pace.cjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const allowHosts = ['127.0.0.1'];

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}

// The video's pace (config/config.json): the shot lists are in plan-seconds, played 1.3x faster.
const PACE = 1.3;

// Narration timing as heard, in seconds of the finished video (the voice starts at 0: at pace 1.3 a
// 16 s video fits the 46-word minimum at Jade's 2.3 words a second only from 0). The 46 words span
// exactly 46 / (2.3 x 1.3) = 15.385 s, Jade's normal rate x the pace, so the renderer's tempo for this
// clip (lib/pace.cjs voicePlayback) is exactly the pace. n4 follows a 1.5 s pause so the ducking test
// has a music-only window at 8.85-10.35 s.
const VOICE_START = 0;
const LINES = [
  ['Meet Fixture.', 0.05, 1.3],
  ['Fixture builds your site 10x faster from a plain description.', 1.5, 4.4],
  ['It connects to GitHub and Vercel, so your work ships where you keep it.', 4.8, 8.85],
  ['Start a project with one command, and deploy it with another.', 10.35, 13.2],
  ['Open source, free to start.', 13.35, 14.3],
  ['Try it at fixture.dev.', 14.45, 15.435],
];

// The alignment as make-audio writes it: seconds of voice.mp3. No speed is recorded, so the
// renderer speeds the whole voice up by the pace, which puts each word back at its time above.
function alignment() {
  const words = [];
  for (const [text, start, end] of LINES) {
    const ws = text.split(' ');
    const gap = 0.06;
    const chars = ws.reduce((n, w) => n + w.length + 2, 0);
    let t = start - VOICE_START;
    const span = end - start - gap * (ws.length - 1);
    for (const w of ws) {
      const d = (span * (w.length + 2)) / chars;
      words.push({ word: w, startSec: +(t * PACE).toFixed(3), endSec: +((t + d) * PACE).toFixed(3) });
      t += d + gap;
    }
  }
  return { words };
}

// A voice: a 220 Hz tone with a soft edge, sounding only while a word is spoken.
function voice(dir, alignmentJson) {
  const { words } = alignmentJson;
  mkdirSync(dir, { recursive: true });
  const on = words.map((w) => `between(t,${w.startSec},${w.endSec})`).join('+');
  const end = words.at(-1).endSec + 0.4;
  ffmpeg(['-f', 'lavfi', '-i', `aevalsrc='0.5*sin(2*PI*220*t)*gt(${on},0)':s=44100:d=${end}`,
    '-af', 'lowpass=f=1500', '-c:a', 'libmp3lame', '-b:a', '128k', join(dir, 'voice.mp3')]);
  writeFileSync(join(dir, 'voice-alignment.json'), JSON.stringify(alignmentJson));
}

function audio(toolOut) {
  const { words } = alignment();
  for (const c of ['c1', 'c2']) mkdirSync(join(toolOut, c), { recursive: true });
  // c1: the voice at normal speed, no speed recorded (the renderer applies the whole pace).
  voice(join(toolOut, 'c1'), { words });
  // voice-speed-1.2/: the same voice as make-audio gets it in production, spoken at speed 1.2, which
  // is 1.245x faster than normal (lib/pace.cjs); the renderer applies the rest of the pace.
  const up = paceLib.speedUp(1.2);
  voice(join(HERE, 'voice-speed-1.2'), { speed: 1.2, words: words.map((w) => ({ ...w, startSec: +(w.startSec / up).toFixed(3), endSec: +(w.endSec / up).toFixed(3) })) });
  // c2: music, made for the finished video's length (16 s) and more. A steady two-note chord, so its loudness only changes with the mix.
  ffmpeg(['-f', 'lavfi', '-i', `aevalsrc='0.25*sin(2*PI*330*t)+0.2*sin(2*PI*495*t)':s=44100:d=18`,
    '-c:a', 'libmp3lame', '-b:a', '128k', join(toolOut, 'c2', 'music.mp3')]);
}

async function captures() {
  const page = readFileSync(join(HERE, 'site', 'index.html'));
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    const caps = join(HERE, 'captures');
    rmSync(caps, { recursive: true, force: true });
    const tmp = join(HERE, '.scout-tmp');
    for (const format of ['wide', 'tall']) {
      const r = await scout({ url, format, outDir: tmp, allowHosts });
      if (!r.ok || r.blocked) throw new Error(`scout ${format}: ${JSON.stringify(r)}`);
      const dest = format === 'wide' ? caps : join(caps, 'tall');
      mkdirSync(dest, { recursive: true });
      renameSync(join(tmp, 'page.png'), join(dest, 'page.png'));
      renameSync(join(tmp, 'elements.json'), join(dest, 'elements.json'));
      rmSync(tmp, { recursive: true, force: true });
    }
    // the logo, cut from the wide page at 2x
    const els = JSON.parse(readFileSync(join(caps, 'elements.json'), 'utf8'));
    const logo = els.find((e) => e.role === 'logo').box;
    ffmpeg(['-i', join(caps, 'page.png'), '-vf', `crop=${logo.w * 2}:${logo.h * 2}:${logo.x * 2}:${logo.y * 2}`, join(caps, 'logo.png')]);

    // m2: glide from the product shot down to the feature cards, hovering two of them. Recorded for
    // the moment's 5.2 plan-seconds; the video plays it 1.3x faster, in 4 s. (The checked-in clips
    // are the earlier 4 s recordings slowed to 5.2 s with setpts=1.3*PTS, which plays back the same.)
    const cards = (dir) => JSON.parse(readFileSync(join(dir, 'elements.json'), 'utf8')).filter((e) => e.role === 'feature');
    const centre = (b) => ({ x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) });
    const wide = cards(caps);
    const shotY = wide[0].box.y - 520;
    const r1 = await captureMoment({
      url, format: 'wide', durationSec: 4 * PACE, outPath: join(HERE, 'clips', 'm2.mp4'), elements: els, allowHosts,
      actions: [
        { atSec: 0, type: 'scroll', dy: shotY },
        { atSec: 0.52, type: 'scroll', dy: 420 },
        { atSec: 2.08, type: 'hover', ...centre(wide[1].box) },
        { atSec: 3.64, type: 'hover', ...centre(wide[2].box) },
      ],
    });
    const tall = cards(join(caps, 'tall'));
    const tallEls = JSON.parse(readFileSync(join(caps, 'tall', 'elements.json'), 'utf8'));
    const r2 = await captureMoment({
      url, format: 'tall', durationSec: 4 * PACE, outPath: join(HERE, 'clips', 'm2-tall.mp4'), elements: tallEls, allowHosts,
      actions: [
        { atSec: 0, type: 'scroll', dy: tall[0].box.y - 520 },
        { atSec: 0.52, type: 'scroll', dy: 300 },
        { atSec: 2.08, type: 'hover', ...centre(tall[0].box) },
        { atSec: 3.64, type: 'hover', ...centre(tall[1].box) },
      ],
    });
    console.log(JSON.stringify({ wideCursor: r1.cursor, tallCursor: r2.cursor }));
  } finally { server.close(); }
}

const what = process.argv[2] ?? 'all';
if (what === 'all' || what === 'audio') audio(join(HERE, 'tool-output'));
if (what === 'all' || what === 'captures') await captures();
