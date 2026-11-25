// The video's pace (spec 16): the model writes the shot list in plan-seconds, at normal speed, and
// the finished video plays it `pace` times faster (a 26 plan-second shot list is a 20 s video at
// 1.3). The one setting is config/config.json "pace"; everything that converts plan time reads it here.
// CommonJS so tools/make-audio (a plain script) can require it too.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PACE = 1.3;
// ElevenLabs' voice_settings.speed goes from 0.7 to 1.2 (docs, Text to Speech > Speed: "to a minimum
// of 0.7 … to a maximum of 1.2").
const MIN_VOICE_SPEED = 0.7;
const MAX_VOICE_SPEED = 1.2;
// What that setting really does (spec 16.3): the same narration at speed 1.0 and 1.2 took 1.24x
// (Darian, 21.2 s vs 17.1 s) and 1.25x (Elara, 22.4 s vs 17.9 s) less time; DECISIONS.md, "What
// ElevenLabs' speed 1.2 really does", 2026-11-24. Between 1.0 and 1.2 the effect is taken as linear.
const MEASURED_SPEED_UP = { setting: 1.2, speedUp: 1.245 };

function readConfig() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'config.json'), 'utf8'));
}

// 0.5 to 2: what the renderer's tempo change and clip playback handle cleanly.
function pace(config = readConfig()) {
  const p = config?.pace;
  if (p === undefined) return DEFAULT_PACE;
  if (typeof p !== 'number' || !Number.isFinite(p) || p < 0.5 || p > 2) {
    throw new Error(`config.json pace must be a number from 0.5 to 2 (got ${JSON.stringify(p)})`);
  }
  return p;
}

// How much faster than normal ElevenLabs speaks at a speed setting (none recorded: 1).
const SLOPE = (MEASURED_SPEED_UP.speedUp - 1) / (MEASURED_SPEED_UP.setting - 1);
function speedUp(setting) {
  const s = setting || 1;
  return s === MEASURED_SPEED_UP.setting ? MEASURED_SPEED_UP.speedUp : 1 + (s - 1) * SLOPE;
}

// The speed setting asked of ElevenLabs: as fast as it allows, unless that alone would already be
// faster than the pace; then the setting whose measured effect is just under the pace (rounded down
// to 0.01), so the renderer's tempo step is never a slow-down.
// A pace of 1 or less is left to the tempo step entirely. Always within ElevenLabs' 0.7 to 1.2.
function voiceSpeed(p = pace()) {
  let s;
  if (p <= 1) s = 1;
  else if (speedUp(MAX_VOICE_SPEED) <= p) s = MAX_VOICE_SPEED;
  else s = Math.floor((1 + (p - 1) / SLOPE) * 100 + 1e-9) / 100;
  return Math.min(MAX_VOICE_SPEED, Math.max(MIN_VOICE_SPEED, s));
}

// The pitch-preserving tempo change the renderer applies to a voice that ElevenLabs spoke at
// `speed`, so that it is heard exactly `p` times faster than normal.
const voiceTempo = (speed, p = pace()) => p / speedUp(speed);

// Ruling R19: the measured speed-up is only an average. The same text at speed 1.2 came out 1.21x to
// 1.41x faster than at 1.0 over four takes, so the tempo is worked out from each clip instead: its own
// words a second (first word's start to last word's end) against the voice's normal rate
// (voices.json wordsPerSec, measured at speed 1.0) times the pace. 0.8-1.6 is a sanity bound, well
// inside ffmpeg atempo's 0.5-100.
const TEMPO_BOUNDS = [0.8, 1.6];

function readVoices() {
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'voices.json'), 'utf8'));
  return Array.isArray(v) ? v : v?.voices ?? [];
}

// The voice's normal words a second, from voices.json (undefined for a voice not listed there).
const normalRate = (voiceId, voices = readVoices()) => voices.find((v) => (v?.id ?? v?.voice_id) === voiceId)?.wordsPerSec;

// Words a second in a clip's alignment, silence before the first word and after the last left out.
function clipRate(words) {
  if (!Array.isArray(words) || words.length < 2) return null;
  const span = words.at(-1).endSec - words[0].startSec;
  return span > 0 ? words.length / span : null;
}

// The tempo change for this clip, so it is heard at rate x pace words a second. Without a rate or a
// measurable clip, the measured-constant tempo (voiceTempo). { tempo, clamped, target, clipRate, nominal }
function voicePlayback(alignment, rate, p = pace()) {
  const nominal = voiceTempo(alignment?.speed, p);
  const r = clipRate(alignment?.words);
  if (!(rate > 0) || !r) return { tempo: nominal, clamped: false, target: null, clipRate: r, nominal };
  const target = rate * p;
  const raw = target / r;
  const tempo = Math.min(TEMPO_BOUNDS[1], Math.max(TEMPO_BOUNDS[0], raw));
  return { tempo, clamped: tempo !== raw, target, clipRate: r, nominal };
}

// The narration's words as heard in the video: make-audio's alignment (seconds of voice.mp3) after
// the renderer's tempo change.
function heardWords(alignment, tempo) {
  return (alignment?.words ?? []).map((w) => ({ ...w, startSec: w.startSec / tempo, endSec: w.endSec / tempo }));
}

module.exports = {
  pace, speedUp, voiceSpeed, voiceTempo, normalRate, clipRate, voicePlayback, heardWords,
  DEFAULT_PACE, MIN_VOICE_SPEED, MAX_VOICE_SPEED, MEASURED_SPEED_UP, TEMPO_BOUNDS,
};
