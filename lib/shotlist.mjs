import { checkLine, norm } from './honesty.mjs';
import audioPrompt from './audio-prompt.cjs';
import paceLib from './pace.cjs';

const { promptProblem, VOICE_MAX_CHARS } = audioPrompt;

const OUT = { wide: { w: 1920, h: 1080 }, tall: { w: 1080, h: 1920 } };
const EPS = 0.05;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const words = (t) => String(t).trim().split(/\s+/).filter(Boolean);

export function wrapCaption(text) {
  const lines = [];
  let cur = '';
  for (const w of words(text)) {
    if (cur && cur.length + 1 + w.length > 42) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

// The caption fonts cover Latin script only (Task 7), so on-screen and spoken text must be mostly
// Latin: the share of letters in Latin script, the scout's latinShare measure. No letters passes.
export const MIN_LATIN_SHARE = 0.6;
const NON_LATIN = `has under ${MIN_LATIN_SHARE * 100}% Latin script; refuse: write only result.md saying this version makes videos for pages mostly in Latin-script languages`;
export function latinShare(text) {
  let letters = 0, latin = 0;
  for (const ch of String(text ?? '')) if (/\p{L}/u.test(ch)) { letters++; if (/\p{Script=Latin}/u.test(ch)) latin++; }
  return letters ? latin / letters : 1;
}
const nonLatin = (text) => latinShare(text) < MIN_LATIN_SHARE;

// Words a second the voice reads at normal speed (voices.json wordsPerSec, measured on a real call),
// which is its rate in plan-seconds; 2.6 only for a voice with no measured rate (the tests' plain ids).
const wordRate = (voices, id) => (Array.isArray(voices) ? voices : []).find((v) => (v?.id ?? v?.voice_id) === id)?.wordsPerSec ?? 2.6;
const voiceIds = (voices) => (Array.isArray(voices) ? voices : Object.keys(voices ?? {}))
  .map((v) => (typeof v === 'string' ? v : v?.id ?? v?.voice_id));

function checkRect(errs, label, rect, out, size, format) {
  if (![rect?.x, rect?.y, rect?.w, rect?.h].every(isNum) || rect.w <= 0 || rect.h <= 0) {
    errs.push(`${label} must be { x, y, w, h } in source pixels`); return;
  }
  const target = out.w / out.h;
  if (Math.abs(rect.w / rect.h - target) / target > 0.01) {
    errs.push(`${label} has the wrong aspect ratio (${(rect.w / rect.h).toFixed(3)}); ${format} needs ${format === 'wide' ? '16:9' : '9:16'}`);
  }
  if (rect.w < out.w / 1.5 - 0.5) {
    errs.push(`${label} zooms in more than 1.5x (rect.w ${rect.w} < ${Math.round(out.w / 1.5)})`);
  }
  if (size && (rect.x < 0 || rect.y < 0 || rect.x + rect.w > size.width + 0.5 || rect.y + rect.h > size.height + 0.5)) {
    errs.push(`${label} must lie inside the source (${size.width}x${size.height}); got x ${rect.x}, y ${rect.y}, w ${rect.w}, h ${rect.h}`);
  }
}

// The shot list's limits at a pace (spec 16.1). Its times are plan-seconds: the video plays them
// `pace` times faster, so the finished video's 15-20 s and its 1.5-3 s end card and 0.5 s narration
// margin are those output seconds times pace; the narration words scale with it (35-50 at pace 1).
const r2 = (x) => Math.round(x * 100) / 100;
export function shotlistLimits(pace) {
  return {
    minDuration: r2(15 * pace), maxDuration: r2(20 * pace),
    minEndcard: 1.5 * pace, maxEndcard: 3 * pace,
    endMargin: 0.5 * pace,
    minWords: Math.round(35 * pace), maxWords: Math.round(50 * pace),
    minContent: 3, maxContent: 5, minMoment: 2,
  };
}

const NO_SOUNDS = 'sound effects are not used (the audio is narration and music only): remove "sounds"';

// allowMissingClips: before capture, a clip moment whose file has no size yet is not an error
// (the capture stage's gate; the full check runs once the clips are recorded).
// pace: config/config.json's, unless given.
export function validateShotlist(s, { facts, voices, captureSizes = {}, allowMissingClips = false, pace = paceLib.pace() } = {}) {
  const errs = [];
  if (!s || typeof s !== 'object') return { ok: false, errors: ['shot list must be a JSON object'] };
  const byId = facts?.byId ?? new Map();
  const L = shotlistLimits(pace);

  if (s.version !== 1) errs.push('version must be 1');
  const out = OUT[s.format];
  if (!out) errs.push('format must be "wide" or "tall"');
  if (s.fps !== 30) errs.push('fps must be 30');
  const dur = s.durationSec;
  // 0.01 of slack at most: the renderer rounds durationSec / pace to whole frames, and the video check allows 15.0 to 20.0 s.
  if (!isNum(dur) || dur < L.minDuration - 0.01 || dur > L.maxDuration + 0.01) {
    errs.push(`durationSec must be between ${L.minDuration} and ${L.maxDuration} (15 to 20 s of output at pace ${pace}); got ${dur}`);
  }
  if (typeof s.musicBrief !== 'string' || !s.musicBrief || s.musicBrief.length > 200) errs.push('musicBrief must be 1-200 characters');
  else if (promptProblem(s.musicBrief)) errs.push(`musicBrief would be refused by make-audio: it contains ${promptProblem(s.musicBrief)}; describe mood, tempo and instruments only`);
  if (!isNum(s.voiceStartSec) || s.voiceStartSec < 0) errs.push('voiceStartSec must be a number of seconds >= 0');
  if (!voiceIds(voices).includes(s.voice)) errs.push(`voice "${s.voice}" is not in voices.json`);

  // narration
  if (!Array.isArray(s.narration) || !s.narration.length) errs.push('narration must be a non-empty list of lines');
  else {
    const total = s.narration.reduce((n, l) => n + words(l?.text ?? '').length, 0);
    if (total < L.minWords || total > L.maxWords) errs.push(`narration has ${total} words; it needs ${L.minWords} to ${L.maxWords}`);
    const chars = s.narration.map((l) => String(l?.text ?? '').trim()).join(' ').length;
    const wps = wordRate(voices, s.voice);
    if (chars > VOICE_MAX_CHARS) errs.push(`narration has ${chars} characters joined with spaces; make-audio takes ${VOICE_MAX_CHARS} characters at most`);
    else if (isNum(s.voiceStartSec) && isNum(dur) && s.voiceStartSec + total / wps > dur - L.endMargin + 1e-9) {
      errs.push(`narration is too long for the duration: ${total} words from ${s.voiceStartSec}s at this voice's ${wps} words a second needs about ${(s.voiceStartSec + total / wps).toFixed(1)} plan-seconds, but it must end by ${r2(dur - L.endMargin)} (durationSec - ${r2(L.endMargin)}, 0.5 s of output)`);
    }
    for (const l of s.narration) {
      if (nonLatin(l?.text)) errs.push(`narration ${l?.id}: ${NON_LATIN}`);
      for (const p of checkLine(l ?? {}, byId)) errs.push(`narration ${l?.id}: ${p}`);
    }
  }

  if ('sounds' in s) errs.push(`${NO_SOUNDS} from the shot list`);

  // moments
  const moments = Array.isArray(s.moments) ? s.moments : [];
  if (!moments.length) { errs.push('moments must be a non-empty list'); return { ok: false, errors: errs }; }
  const endcards = moments.filter((m) => m?.source?.type === 'endcard');
  const content = moments.length - endcards.length;
  if (content < L.minContent || content > L.maxContent) errs.push(`there are ${content} content moments (non-endcard); it needs ${L.minContent} to ${L.maxContent}`);
  if (endcards.length !== 1 || moments.at(-1)?.source?.type !== 'endcard') errs.push('there must be exactly one endcard moment, and it must be last');

  let t = 0;
  for (const m of moments) {
    const id = m?.id;
    if (!isNum(m?.startSec) || !isNum(m?.endSec)) { errs.push(`moment ${id}: startSec and endSec must be numbers`); continue; }
    if (Math.abs(m.startSec - t) > EPS) errs.push(`moments must be contiguous from 0 to durationSec: moment ${id} starts at ${m.startSec}, expected ${t}`);
    t = m.endSec;
    const len = m.endSec - m.startSec;
    if (m?.source?.type !== 'endcard' && len < L.minMoment - EPS) errs.push(`moment ${id} is ${len.toFixed(2)} s; each moment must be at least ${L.minMoment} s (plan-seconds)`);
    const src = m.source ?? {};
    if (src.type === 'endcard') {
      if (nonLatin(src.title)) errs.push(`endcard ${id} title ${NON_LATIN}`);
      if (len < L.minEndcard - EPS || len > L.maxEndcard + EPS) {
        errs.push(`endcard ${id} is ${(len / pace).toFixed(2)} s of output; the endcard must be 1.5 to 3 s of output, ${r2(L.minEndcard)} to ${r2(L.maxEndcard)} plan-seconds (got ${r2(len)})`);
      }
      const known = src.url === facts?.source || (facts?.facts ?? []).some((f) => f.text.includes(src.url));
      if (!src.url || !known) errs.push(`endcard ${id} url "${src.url}" is neither the filmed link nor a link found in the facts`);
    } else if (src.type === 'screenshot' || src.type === 'clip') {
      const size = captureSizes[src.file];
      if (!size && !(allowMissingClips && src.type === 'clip')) errs.push(`moment ${id}: no size known for ${src.file}`);
      if (!['inOut', 'out', 'linear'].includes(m.camera?.easing)) errs.push(`moment ${id}: camera.easing must be inOut, out or linear`);
      if (out) for (const k of ['from', 'to']) checkRect(errs, `moment ${id} camera.${k}`, m.camera?.[k], out, size, s.format);
    } else if (src.type === 'terminal') {
      if (!Array.isArray(src.lines) || !src.lines.length) errs.push(`terminal moment ${id} needs lines`);
      for (const [i, ln] of (src.lines ?? []).entries()) {
        if (nonLatin(ln?.text)) errs.push(`terminal moment ${id} line ${i + 1}: ${NON_LATIN}`);
        const f = byId.get(ln?.fact);
        if (!f) errs.push(`terminal moment ${id} line ${i + 1}: fact ${ln?.fact} does not exist`);
        else if (!norm(f.text).includes(norm(ln.text ?? ''))) errs.push(`terminal moment ${id} line ${i + 1}: "${ln.text}" is not in fact ${ln.fact}`);
      }
    } else errs.push(`moment ${id}: source.type must be screenshot, clip, terminal or endcard`);

    if (m.caption) {
      const lines = wrapCaption(m.caption.text ?? '');
      if (lines.length > 2 || lines.some((l) => l.length > 42)) errs.push(`caption of moment ${id} must fit 2 lines of 42 characters (wrapped on spaces)`);
      if (nonLatin(m.caption.text)) errs.push(`caption of moment ${id}: ${NON_LATIN}`);
      for (const p of checkLine(m.caption, byId)) errs.push(`caption of moment ${id}: ${p}`);
    }
    if (m && typeof m === 'object' && 'sounds' in m) errs.push(`moment ${id}: ${NO_SOUNDS} from the moment`);
  }
  if (isNum(dur) && Math.abs(t - dur) > EPS) errs.push(`moments must be contiguous from 0 to durationSec: they end at ${t}, durationSec is ${dur}`);

  return { ok: errs.length === 0, errors: errs };
}
