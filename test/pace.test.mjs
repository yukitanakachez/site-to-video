import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import paceLib from '../lib/pace.cjs';

const { pace, voiceSpeed, voiceTempo, speedUp, heardWords, voicePlayback, clipRate, normalRate, MAX_VOICE_SPEED, DEFAULT_PACE, MEASURED_SPEED_UP, TEMPO_BOUNDS } = paceLib;

test('pace() reads config/config.json, which holds the default 1.3 (spec 16.3)', () => {
  const config = JSON.parse(readFileSync(new URL('../config/config.json', import.meta.url), 'utf8'));
  assert.equal(config.pace, 1.3);
  assert.equal(pace(), 1.3);
  assert.equal(DEFAULT_PACE, 1.3);
});

test('pace() takes the value from the config it is given, and 1.3 when the config has none', () => {
  assert.equal(pace({ pace: 1.5 }), 1.5);
  assert.equal(pace({ pace: 1 }), 1);
  assert.equal(pace({}), 1.3);
});

test('pace() refuses a value the renderer cannot play', () => {
  for (const bad of [0, -1, 0.4, 2.5, '1.35', null, Number.NaN]) assert.throws(() => pace({ pace: bad }), /pace/, String(bad));
});

// DECISIONS.md, "What ElevenLabs' speed 1.2 really does": the same text at 1.0 and 1.2 took 1.24x
// (Darian) and 1.25x (Elara) less time.
test('the speed setting\'s effect is the measured one: 1.2 speeds speech up 1.245x, none at 1.0', () => {
  assert.equal(MAX_VOICE_SPEED, 1.2);
  assert.deepEqual(MEASURED_SPEED_UP, { setting: 1.2, speedUp: 1.245 });
  assert.equal(speedUp(1.2), 1.245);
  assert.equal(speedUp(1), 1);
  assert.equal(speedUp(undefined), 1); // a voice with no speed recorded
  assert.ok(Math.abs(speedUp(1.1) - 1.1225) < 1e-9); // between the two measured points
});

test('the voice: ElevenLabs as fast as it allows, the tempo step makes up the rest from the measured speed-up', () => {
  assert.equal(voiceSpeed(1.3), 1.2);
  assert.ok(Math.abs(voiceTempo(1.2, 1.3) - 1.3 / 1.245) < 1e-12);
  assert.equal(voiceTempo(undefined, 1.3), 1.3);
  // a pace below the setting's measured speed-up lowers the setting, so the tempo step stays >= 1
  for (const p of [1.2, 1.1, 1.05]) {
    const s = voiceSpeed(p);
    assert.ok(s < 1.2 && s >= 1, `pace ${p}: setting ${s}`);
    const t = voiceTempo(s, p);
    assert.ok(t >= 1 && t < 1.01, `pace ${p}: tempo ${t}`);
  }
  assert.equal(voiceSpeed(1), 1);
});

// Ruling R19: ElevenLabs' speed effect varies from take to take (1.21-1.41x measured), so the tempo
// is computed from this clip's own speaking rate: heard rate = the voice's normal rate x pace.
// n evenly spoken words whose first starts at `start` and last ends at start + span
const even = (n, span, start = 0.1) => {
  const step = span / (n - 0.2);
  return Array.from({ length: n }, (_, i) => ({ word: `w${i}`, startSec: start + i * step, endSec: start + (i + 0.8) * step }));
};
const heardRate = (words) => words.length / (words.at(-1).endSec - words[0].startSec);

test('clipRate is words a second from the first word\'s start to the last word\'s end', () => {
  assert.ok(Math.abs(clipRate(even(50, 20, 1.5)) - 50 / 20) < 1e-9); // the 1.5 s before the first word is left out
  assert.equal(clipRate([]), null);
  assert.equal(clipRate([{ word: 'a', startSec: 0, endSec: 0.3 }]), null);
});

test('voicePlayback: a fast clip gets less than the nominal tempo, a slow one more; heard rate = normal rate x pace within 3%', () => {
  const rate = 2.1; // the voice's normal words a second (voices.json, measured at speed 1.0)
  const target = rate * 1.3;
  const nominal = voiceTempo(1.2, 1.3); // what the measured-constant path would apply
  // as expected: the clip at speed 1.2 reads exactly 1.245x the normal rate
  const exact = { speed: 1.2, words: even(50, 50 / (rate * 1.245)) };
  // ElevenLabs took it faster (1.41x) or slower (1.15x) this time
  const fast = { speed: 1.2, words: even(50, 50 / (rate * 1.41)) };
  const slow = { speed: 1.2, words: even(50, 50 / (rate * 1.15)) };
  const e = voicePlayback(exact, rate, 1.3), f = voicePlayback(fast, rate, 1.3), sl = voicePlayback(slow, rate, 1.3);
  assert.ok(Math.abs(e.tempo - nominal) < 1e-6);
  assert.ok(f.tempo < nominal, `fast ${f.tempo}`);
  assert.ok(sl.tempo > nominal, `slow ${sl.tempo}`);
  for (const [al, pb] of [[exact, e], [fast, f], [slow, sl]]) {
    const heard = heardRate(heardWords(al, pb.tempo));
    assert.ok(Math.abs(heard - target) / target < 0.03, `heard ${heard} words a second, want ${target}`);
    assert.equal(pb.clamped, false);
  }
});

test('voicePlayback clamps the tempo to 0.8-1.6 and says so', () => {
  assert.deepEqual(TEMPO_BOUNDS, [0.8, 1.6]);
  const tooFast = voicePlayback({ speed: 1.2, words: even(50, 50 / 6) }, 2.1, 1.3); // 6 words a second
  assert.deepEqual([tooFast.tempo, tooFast.clamped], [0.8, true]);
  const tooSlow = voicePlayback({ speed: 1.2, words: even(50, 50 / 1.2) }, 2.1, 1.3); // 1.2 words a second
  assert.deepEqual([tooSlow.tempo, tooSlow.clamped], [1.6, true]);
});

test('voicePlayback without a normal rate or with too few words falls back to the measured-constant tempo', () => {
  assert.equal(voicePlayback({ speed: 1.2, words: even(50, 20) }, undefined, 1.3).tempo, voiceTempo(1.2, 1.3));
  assert.equal(voicePlayback({ words: even(1, 1) }, 2.1, 1.3).tempo, 1.3);
});

test('normalRate reads the voice\'s wordsPerSec from voices.json', () => {
  const voices = JSON.parse(readFileSync(new URL('../config/voices.json', import.meta.url), 'utf8'));
  for (const v of voices) assert.equal(normalRate(v.id), v.wordsPerSec);
  assert.equal(normalRate('nobody'), undefined);
});

// Review R15 minor 2: ElevenLabs takes speed 0.7 to 1.2 only; pace() allows 0.5 to 2.
test('voiceSpeed() never asks ElevenLabs for a speed outside 0.7 to 1.2', () => {
  assert.deepEqual([paceLib.MIN_VOICE_SPEED, MAX_VOICE_SPEED], [0.7, 1.2]);
  for (const p of [0.5, 0.6, 0.7, 0.9, 1, 1.05, 1.2, 1.3, 1.5, 2]) {
    const s = voiceSpeed(p);
    assert.ok(s >= 0.7 && s <= 1.2, `pace ${p}: speed ${s}`);
  }
});
