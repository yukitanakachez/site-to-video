import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audioCallsMade } from '../lib/audio-calls.mjs';
import paceLib from '../lib/pace.cjs';

const TOOL = new URL('../tools/make-audio', import.meta.url).pathname;
const VOICES = JSON.parse(readFileSync(new URL('../config/voices.json', import.meta.url), 'utf8'));
const KEY = 'test-key-123';
let server, port, outDir;
const fake = { calls: 0, lastBody: null, lastHeaders: null, lastUrl: null, status: 200 };

before(async () => {
  server = createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      fake.calls++; fake.lastHeaders = req.headers; fake.lastUrl = req.url;
      fake.lastBody = data ? JSON.parse(data) : null;
      if (fake.status !== 200) { res.statusCode = fake.status; return res.end('{"detail":"quota"}'); }
      if (req.url.includes('/with-timestamps')) {
        const text = fake.lastBody.text;
        const chars = [...text];
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({
          audio_base64: Buffer.from('mp3').toString('base64'),
          alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.1), character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.1) },
        }));
      }
      res.end(Buffer.from('audio-bytes'));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => server.close());
beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'mk-audio-'));
  Object.assign(fake, { calls: 0, lastBody: null, lastHeaders: null, lastUrl: null, status: 200 });
});

function runTool(args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [TOOL, ...args], {
      env: { ...process.env, STARWISH_OUTPUT_DIR: outDir, ELEVENLABS_API_KEY: KEY, ELEVENLABS_BASE_URL: `http://127.0.0.1:${port}` },
    });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

test('voice writes voice.mp3 and word timings, and records the call first', async () => {
  const { code, out } = await runTool(['voice', VOICES[0].id, 'Meet Fixture.']);
  assert.equal(code, 0);
  const rec = JSON.parse(readFileSync(join(outDir, 'make-audio-voice.json')));
  assert.equal(rec.action, 'voice'); assert.equal(rec.words, 2);
  assert.ok(existsSync(join(outDir, 'voice.mp3')));
  const al = JSON.parse(readFileSync(join(outDir, 'voice-alignment.json')));
  assert.deepEqual(al.words.map((w) => w.word), ['Meet', 'Fixture.']);
  assert.ok(al.words[1].startSec > al.words[0].startSec);
  assert.ok(al.words[0].endSec > al.words[0].startSec);
  const printed = JSON.parse(out);
  assert.equal(printed.file, 'voice.mp3'); assert.ok(printed.planSec > 0);
});

// spec 16: the narration is heard at the pace (1.3). ElevenLabs speaks at its maximum speed, 1.2,
// which measured 1.245x faster than normal (lib/pace.cjs); the renderer makes up the rest. The tool
// records the speed and answers in plan-seconds: the normal-speed length.
test('voice asks ElevenLabs for speed 1.2, records it with the timings, and answers in plan-seconds', async () => {
  const { code, out } = await runTool(['voice', VOICES[0].id, 'Meet Fixture.']);
  assert.equal(code, 0);
  assert.equal(fake.lastBody.voice_settings.speed, 1.2);
  const al = JSON.parse(readFileSync(join(outDir, 'voice-alignment.json')));
  assert.equal(al.speed, 1.2);
  // planSec is the narration's end as heard (the renderer's tempo for this clip, ruling R19) x the pace
  const { tempo } = paceLib.voicePlayback(al, VOICES[0].wordsPerSec, paceLib.pace());
  const printed = JSON.parse(out);
  assert.ok(Math.abs(printed.planSec - Math.round((al.words.at(-1).endSec / tempo) * paceLib.pace() * 1000) / 1000) < 1e-9, out);
});

test('voice refuses a voice id not on the list, without calling ElevenLabs', async () => {
  const { code } = await runTool(['voice', 'nope', 'Hi there']);
  assert.equal(code, 2); assert.equal(fake.calls, 0);
});

test('voice refuses 81 words and 541 characters, and takes 80 words', async () => {
  const w81 = Array(81).fill('a').join(' ');
  assert.equal((await runTool(['voice', VOICES[0].id, w81])).code, 2);
  assert.equal((await runTool(['voice', VOICES[0].id, 'a'.repeat(541)])).code, 2);
  assert.equal(fake.calls, 0);
  assert.equal((await runTool(['voice', VOICES[0].id, Array(80).fill('word').join(' ')])).code, 0);
});

// spec 16.2: no sound effects. The action is gone; asking for it is refused with no call made.
test('sound is refused: the agent makes no sound effects', async () => {
  const { code, err } = await runTool(['sound', JSON.stringify([{ id: 'click', prompt: 'soft click', durationSec: 0.8 }])]);
  assert.equal(code, 2);
  assert.match(err, /sound effects are not used/);
  assert.equal(fake.calls, 0);
  assert.equal(existsSync(join(outDir, 'make-audio-sound.json')), false);
});

// Task 12: ElevenLabs winds a bed down over its last 2-5 s, which left the end cards nearly silent.
// The tool asks for 8 s more than the video (5 s was measured not to be enough); the renderer fades the bed out at the video's end.
test('music clamps 40 s to 22 s, asks for 8 s more than that, and forces instrumental', async () => {
  const { code } = await runTool(['music', 'bright upbeat synth pop, light percussion', '40']);
  assert.equal(code, 0);
  assert.equal(fake.lastBody.music_length_ms, 30000);
  assert.equal(fake.lastBody.force_instrumental, true);
  assert.ok(existsSync(join(outDir, 'music.mp3')));
  assert.equal(JSON.parse(readFileSync(join(outDir, 'make-audio-music.json'))).seconds, 22);
  assert.equal((await runTool(['music', 'calm piano', '3'])).code, 0);
  assert.equal(fake.lastBody.music_length_ms, 23000);
});

test('music prompts that name artists, songs or lyrics are refused', async () => {
  for (const p of ['upbeat, "Happy" vibe', 'a song for dancing', 'music by someone', 'in the style of the 80s', 'like Daft Punk', 'lyrics about love', 'x'.repeat(201)]) {
    assert.equal((await runTool(['music', p, '18'])).code, 2, p);
  }
  assert.equal(fake.calls, 0);
  assert.equal((await runTool(['music', 'warm and like a sunrise, soft pads', '18'])).code, 0);
});

test('an ElevenLabs error exits 1 with the status, and the record is still written', async () => {
  fake.status = 401;
  const { code, err } = await runTool(['voice', VOICES[0].id, 'Hello there']);
  assert.equal(code, 1); assert.match(err, /401/);
  assert.ok(existsSync(join(outDir, 'make-audio-voice.json')));
});

test('the key is sent only in the documented auth header', async () => {
  await runTool(['music', 'calm piano', '18']);
  assert.equal(fake.lastHeaders['xi-api-key'], KEY);
  assert.ok(!fake.lastUrl.includes(KEY));
  assert.ok(!JSON.stringify(fake.lastBody).includes(KEY));
  assert.ok(fake.lastUrl.includes('output_format=mp3_44100_128'));
});

test('audioCallsMade counts voice and music records across call folders; a sound record is not counted', () => {
  const root = mkdtempSync(join(tmpdir(), 'mk-calls-'));
  for (const [d, f] of [['c1', 'voice'], ['c2', 'voice'], ['c3', 'sound'], ['c4', 'music']]) {
    mkdirSync(join(root, d)); writeFileSync(join(root, d, `make-audio-${f}.json`), '{}');
  }
  assert.deepEqual(audioCallsMade(root), { voice: 2, music: 1 });
  assert.deepEqual(audioCallsMade(join(root, 'missing')), { voice: 0, music: 0 });
});
