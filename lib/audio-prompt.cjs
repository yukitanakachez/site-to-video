// The prompt rules for ElevenLabs music (Music Terms 2.1), shared by tools/make-audio (which refuses
// before any paid call) and lib/shotlist.mjs (which catches them in stage 3).
// Prompts must not name an artist, song, album, label or publisher, or contain lyrics. Names cannot
// be detected in general, so any quote mark or apostrophe, and these cue words, are refused.
'use strict';

function promptProblem(p) {
  if (/["'“”‘’`]/.test(p)) return 'quotes (possible lyrics or a title)';
  const m = p.match(/\b(by|songs?|albums?|artists?|lyrics|in the style of)\b/i);
  if (m) return `the word "${m[1]}"`;
  if (/\blike\s+[A-Z][A-Za-z]/.test(p.replace(/\b(LIKE|Like)\b/g, 'like'))) return '"like <Name>"';
  return null;
}

// The narration's per-call limits in make-audio's voice action: room for the shot list's most words
// (round(50 x pace): 65 at 1.3, 68 at 1.35; spec 16), with some slack.
const VOICE_MAX_WORDS = 80;
const VOICE_MAX_CHARS = 540;

module.exports = { promptProblem, VOICE_MAX_WORDS, VOICE_MAX_CHARS };
