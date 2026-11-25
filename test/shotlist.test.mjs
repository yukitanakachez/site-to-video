import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateShotlist } from '../lib/shotlist.mjs';
import { loadFacts } from '../lib/facts.mjs';
import { FIXTURE_PACE } from './helpers.mjs';

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url);
const good = () => JSON.parse(readFileSync(fx('shotlist-good.json'), 'utf8'));
const facts = loadFacts(fx('facts-good.json').pathname);
const opts = {
  pace: FIXTURE_PACE,
  facts,
  voices: ['voice-a', 'voice-b'],
  captureSizes: {
    'captures/page.png': { width: 1920, height: 1080 },
    'clips/m2.mp4': { width: 1920, height: 1080 },
  },
};
const run = (s, o = opts) => validateShotlist(s, o);

test('the good fixture shot list validates', () => {
  const r = run(good());
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

const extraMoment = (s, id, start, end) => ({ ...structuredClone(s.moments[1]), id, startSec: start, endSec: end });
// n content moments of equal length before the fixture's end card (20.15 to 23.4)
const contentMoments = (s, n) => [
  ...Array.from({ length: n }, (_, i) => (i === 0
    ? { ...structuredClone(s.moments[0]), startSec: 0, endSec: +(20.15 / n).toFixed(4) }
    : extraMoment(s, `m${i + 1}`, +((20.15 * i) / n).toFixed(4), +((20.15 * (i + 1)) / n).toFixed(4)))),
  { ...s.moments[3], id: `m${n + 1}` },
];
const sixContent = (s) => contentMoments(s, 6);

for (const [name, edit, msg] of [
  ['gap between moments', (s) => { s.moments[1].startSec += 0.5; }, /contiguous/],
  ['too long', (s) => { s.durationSec = 28; }, /15/],
  ['too short', (s) => { s.durationSec = 19; }, /19\.5 and 26/],
  ['six content moments', (s) => { s.moments = sixContent(s); }, /content moments/],
  ['endcard not last', (s) => { const [a, b, c, d] = s.moments; s.moments = [a, b, d, c]; }, /endcard/],
  ['zoom beyond 1.5x', (s) => { s.moments[0].camera.to.w = 1000; s.moments[0].camera.to.h = 562.5; }, /zoom/],
  ['wrong aspect', (s) => { s.moments[0].camera.to.h = 900; }, /aspect/],
  ['rect outside source', (s) => { s.moments[0].camera.to.x = 900; }, /inside/],
  ['unknown voice', (s) => { s.voice = 'nobody'; }, /voice/],
  ['too many words', (s) => { s.narration[1].text += ' ' + 'and 10x faster '.repeat(7); }, /68 words; it needs 46 to 65/],
  ['too few words', (s) => { s.narration = [s.narration[0]]; }, /words/],
  ['narration too long for the duration', (s) => { s.voiceStartSec = 6; }, /duration/],
  // spec 16.2: no sound effects
  ['a sounds list', (s) => { s.sounds = [{ id: 's1', prompt: 'Soft click', durationSec: 0.5 }]; }, /sound effects are not used.*"sounds"/],
  ['an empty sounds list', (s) => { s.sounds = []; }, /sound effects are not used/],
  ['a moment with sound cues', (s) => { s.moments[0].sounds = [{ atSec: 0, cue: 's1' }]; }, /moment m1:.*sound effects are not used/],
  ['terminal line not in its fact', (s) => { s.moments[2].source.lines[0].text = 'npx fixture destroy'; }, /terminal/],
  ['caption three lines', (s) => { s.moments[0].caption.text = 'Build your site 10x faster ' + 'faster '.repeat(15); }, /caption/],
  ['caption invented number', (s) => { s.moments[0].caption.text = 'Build your site 20x faster'; }, /20x/],
  ['narration without facts', (s) => { s.narration[1].facts = []; }, /no fact/i],
  ['endcard url invented', (s) => { s.moments[3].source.url = 'https://other.example'; }, /url/],
  // the end card is 1.5 to 3 s of the finished video: 1 s of output is 1.3 plan-seconds
  ['endcard too short', (s) => { s.moments[2].endSec = 22.1; s.moments[3].startSec = 22.1; }, /endcard m4 is 1\.00 s of output; .*1\.5 to 3 s/],
  ['endcard too long', (s) => { s.moments[2].endSec = 19.25; s.moments[3].startSec = 19.25; }, /endcard m4 is 3\.19 s of output/],
  ['moment under 2 s', (s) => { s.moments[0].endSec = 1.5; s.moments[1].startSec = 1.5; }, /2 s/],
  // make-audio's own prompt check, run here so a refused prompt is caught before the paid stage.
  ['music brief with an apostrophe', (s) => { s.musicBrief = "Bright synths, today's pop energy"; }, /musicBrief.*quotes/],
  ['music brief naming by', (s) => { s.musicBrief = 'Soft piano led by strings'; }, /musicBrief.*"by"/],
  ['narration over 540 characters', (s) => {
    s.durationSec = 26; s.voiceStartSec = 0;
    s.narration = [{ id: 'n1', text: `${'Fixture builds sites extraordinarily '.repeat(15)}fast.`, facts: ['f1'] }];
  }, /540 characters/],
]) {
  test(`rejects: ${name}`, () => {
    const s = good();
    edit(s);
    const r = run(s);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => msg.test(e)), `expected ${msg} in:\n${r.errors.join('\n')}`);
  });
}

test('tall format needs 9:16 rects and a 720 px minimum width', () => {
  const s = good();
  s.format = 'tall';
  const o = { ...opts, captureSizes: { 'captures/page.png': { width: 1080, height: 1920 }, 'clips/m2.mp4': { width: 1080, height: 1920 } } };
  for (const m of s.moments.slice(0, 2)) {
    m.camera.from = { x: 0, y: 0, w: 1080, h: 1920 };
    m.camera.to = { x: 180, y: 320, w: 720, h: 1280 };
  }
  assert.deepEqual(run(s, o).errors, []);
  s.moments[0].camera.to = { x: 0, y: 0, w: 700, h: 1244.4 };
  assert.match(run(s, o).errors.join('\n'), /zoom/);
});

test('a malformed shot list reports errors instead of throwing', () => {
  const r = run({ version: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
});

test('a 1.5 s endcard (of output) is valid (the 2 s minimum is for content moments)', () => {
  const s = good();
  s.moments[2].endSec = 21.45; s.moments[3].startSec = 21.45; // 1.95 plan-seconds = 1.5 s of output
  assert.deepEqual(run(s).errors, []);
});

test('five content moments are allowed (spec 16.1: 3 to 5)', () => {
  const s = good();
  s.moments = contentMoments(s, 5);
  assert.deepEqual(run(s).errors, []);
});

// spec 16.1: the model plans in plan-seconds; the video plays pace times faster.
test('the limits follow the pace: 19.5 to 26 plan-seconds at 1.3, 15 to 20 at pace 1', () => {
  const s = good(); // 23.4 plan-seconds
  assert.deepEqual(run(s, { ...opts, pace: 1.3 }).errors, []);
  assert.match(run(s, { ...opts, pace: 1 }).errors.join('\n'), /durationSec must be between 15 and 20/);
  const t = good();
  t.durationSec = 26; t.moments[3].endSec = 26; t.moments[3].startSec = 23; // a 3 plan-second (2.3 s of output) end card
  t.moments[2].endSec = 23;
  assert.deepEqual(run(t).errors, []);
  t.durationSec = 26.1; t.moments[3].endSec = 26.1;
  assert.match(run(t).errors.join('\n'), /durationSec must be between 19.5 and 26 \(15 to 20 s of output at pace 1.3\)/);
});

test('narration needs 46 to 65 words at pace 1.3', () => {
  const s = good(); // 47 words
  s.narration[1].text = 'Build your site 10x faster, from a description of what you want.'; // 46 words
  assert.deepEqual(run(s).errors, []);
  s.narration[1].text = 'Build your site 10x faster from a short description you write.'; // 45 words
  assert.match(run(s).errors.join('\n'), /45 words; it needs 46 to 65/);
});

test('allowMissingClips lets an unrecorded clip through, and nothing else', () => {
  const noClip = { ...opts, captureSizes: { 'captures/page.png': opts.captureSizes['captures/page.png'] } };
  assert.match(run(good(), noClip).errors.join('\n'), /no size known for clips\/m2\.mp4/);
  assert.deepEqual(run(good(), { ...noClip, allowMissingClips: true }).errors, []);
  // a missing screenshot is still an error, and so is anything else wrong
  assert.match(run(good(), { ...opts, captureSizes: {}, allowMissingClips: true }).errors.join('\n'), /captures\/page\.png/);
  const s = good(); s.durationSec = 30;
  assert.equal(run(s, { ...noClip, allowMissingClips: true }).ok, false);
});

test('mostly non-Latin text is refused with the refusal sentence', () => {
  const jp = good();
  const term = jp.moments.find((m) => m.source.type === 'terminal');
  term.source.lines[1].text = 'サイトの準備ができました';
  let errs = run(jp).errors.join('\n');
  assert.match(errs, /terminal moment m3 line 2: .*Latin script/);
  assert.match(errs, /mostly in Latin-script languages/);

  const cap = good();
  cap.moments[0].caption.text = 'サイトを10倍速く構築';
  errs = run(cap).errors.join('\n');
  assert.match(errs, /caption of moment m1: .*Latin script/);

  const accent = good();
  accent.narration[1].text = 'Fixture builds your site 10x faster from a plain description, déjà vu.';
  assert.doesNotMatch(run(accent).errors.join('\n'), /Latin script/);
});

// Task 12: the voices read at 2.0 to 2.3 words a second, not the 2.6 first assumed, so a narration
// that passed ran past the video and needed a second paid voice call.
test('the narration length is judged at the chosen voice\'s own pace, in plan-seconds', () => {
  const s = good(); // 47 words from 0.52 s in a 23.4 plan-second video; must end 0.5 s of output (0.65 plan) before the end
  const at = (wordsPerSec) => run(s, { ...opts, voices: [{ id: 'voice-a', wordsPerSec }] });
  assert.equal(at(2.6).ok, true);
  const slow = at(2.0);
  assert.equal(slow.ok, false);
  assert.ok(slow.errors.some((e) => /too long for the duration.*2 words a second/.test(e)), slow.errors.join('\n'));
});

test('every voice in voices.json has a measured pace', () => {
  const voices = JSON.parse(readFileSync(new URL('../config/voices.json', import.meta.url), 'utf8'));
  for (const v of voices) assert.ok(v.wordsPerSec >= 1.5 && v.wordsPerSec <= 3.5, `${v.name}: wordsPerSec ${v.wordsPerSec}`);
});
