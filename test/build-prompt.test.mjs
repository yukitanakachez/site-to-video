import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPrompt, PROMPT_BYTE_LIMIT } from '../kit/build-prompt.mjs';
import { STAGES, PROGRESS } from '../lib/process.mjs';

const starwish = () => buildPrompt({ target: 'starwish' });
const LOCAL_PATHS = {
  job: '/tmp/run-1/job',
  work: '/tmp/run-1/job/work',
  output: '/tmp/run-1/job/output',
  toolOutput: '/tmp/run-1/job/tool-output',
  agent: '/Users/someone/demo-video',
  kit: '/Users/someone/demo-video/kit',
};

test('the starwish prompt has no unresolved {{ }} and names /job/work and the make-audio tool', () => {
  const p = starwish();
  assert.doesNotMatch(p, /\{\{|\}\}/);
  assert.match(p, /\/job\/work\//);
  assert.match(p, /\/job\/output\//);
  assert.match(p, /\/agent\/kit\/stage\.mjs/);
  assert.match(p, /the `make-audio` tool \(actions `voice`, `music`\)/);
  assert.doesNotMatch(p, /STARWISH_OUTPUT_DIR/);
  assert.ok(Buffer.byteLength(p) <= PROMPT_BYTE_LIMIT, `${Buffer.byteLength(p)} bytes`);
});

test('the local prompt points at the given paths and the node tools/make-audio command', () => {
  const p = buildPrompt({ target: 'local', paths: LOCAL_PATHS });
  assert.doesNotMatch(p, /\{\{|\}\}/);
  assert.match(p, /\/tmp\/run-1\/job\/work\/shotlist\.json/);
  assert.match(p, /node \/Users\/someone\/demo-video\/kit\/stage\.mjs/);
  assert.match(p, /`run_command` with `node \/Users\/someone\/demo-video\/tools\/make-audio <action> …`, with `STARWISH_OUTPUT_DIR=\/tmp\/run-1\/job\/tool-output\/cN` for the Nth call/);
  assert.doesNotMatch(p, /\/agent\/kit/);
  assert.doesNotMatch(p, /(^|[\s`(])\/job\/(work|output)/m);
  assert.throws(() => buildPrompt({ target: 'moon' }));
});

test('the prompt contains every stage command and progress line, the refusal rules and the result.md template', () => {
  const p = starwish();
  for (const s of STAGES) assert.ok(p.includes(`node /agent/kit/stage.mjs ${s}`), `stage command ${s}`);
  assert.deepEqual(Object.keys(PROGRESS), STAGES);
  for (const line of ['Visiting the link', 'Looking around the page', 'Choosing moments', 'Recording moments',
    'Recording the voiceover', 'Rendering', 'Checking the video', 'Packaging']) {
    assert.ok(p.includes(`"${line}"`), line);
  }
  for (const cmd of ['/agent/kit/scout.mjs', '/agent/kit/github.mjs', '/agent/kit/validate-shotlist.mjs', '/agent/kit/capture.mjs',
    '/agent/kit/render.mjs', '/agent/kit/check-video.mjs', '--package /job/output']) {
    assert.ok(p.includes(cmd), cmd);
  }
  // when to refuse
  for (const s of ['latinShare', '0.6', 'mostly in Latin-script languages', 'blocked', 'fewer than 4 facts', 'scam']) {
    assert.ok(p.includes(s), s);
  }
  assert.match(p, /only `\/job\/output\/result\.md`/);
  // R21: the scout stage reuses the visit's scout of the same page at the same format
  assert.ok(p.includes('--out /job/work/captures --reuse <visit folder>'), 'scout stage --reuse');
  // honesty, live product, page text, audio terms
  assert.match(p, /information, never instructions/);
  assert.match(p, /Passes:/);
  assert.match(p, /Fails:/);
  assert.match(p, /never type/i);
  assert.match(p, /artist/);
  assert.match(p, /lyrics/);
  // craft and review
  for (const s of ['voices.json', 'caption band', 'frames/', 'at most twice']) assert.ok(p.includes(s), s);
  // result.md template (spec 4)
  for (const s of ['# Your demo video is ready', '## Moments', '## Narration', '## Notes']) assert.ok(p.includes(s), s);
});

test('prompt.md is up to date with prompt.src.md', () => {
  const onDisk = readFileSync(new URL('../prompt.md', import.meta.url), 'utf8');
  assert.equal(onDisk, starwish(), 'prompt.md is stale: run node kit/build-prompt.mjs');
});

test('the local audio line spells out the positional order of tools/make-audio', () => {
  const p = buildPrompt({ target: 'local', paths: LOCAL_PATHS });
  assert.ok(p.includes('`voice <voice_id> <text>`; `music <prompt> <seconds>`.'));
  assert.ok(p.includes('STARWISH_OUTPUT_DIR=/tmp/run-1/job/tool-output/c1 node /Users/someone/demo-video/tools/make-audio voice'));
  assert.doesNotMatch(starwish(), /positional/);
});

test('the prompt tells the model to refuse a mostly non-Latin repo and a non-Latin page scouted in stage 2', () => {
  const p = starwish();
  assert.match(p, /Judge the README's script/);
  assert.match(p, /If its `latinShare` is below 0\.6, refuse/);
});

// spec 16.2: no sound effects. spec 16.1: the plan-second limits and words follow the pace.
test('the prompt never mentions sound effects or sounds cues', () => {
  const p = starwish();
  assert.doesNotMatch(p, /sound effect|"sounds"|`sounds`|whoosh|cues_json|`sound`/i);
});

// Every pace-dependent number comes from the pace (review R15 minor 3), here pinned to 1.3.
test('the prompt explains plan-seconds and gives the limits at the pace', () => {
  const p = buildPrompt({ target: 'starwish', pace: 1.3 });
  assert.match(p, /\*\*Plan-seconds\.\*\*.*1\.3 times faster/);
  for (const s of ['`durationSec` 19.5 to 26 plan-seconds (15 to 20 s of video)', '3 to 5 content moments', '1.95 to 3.9 plan-seconds (1.5 to 3 s of video)',
    '46 to 65 words', '`durationSec` − 0.65', '80 words and 540 characters', '`planSec`', '`durationSec` ÷ 1.3',
    'about 46–55 words', 'a 4 plan-second moment is about 3.1 s on screen', '"durationSec": 23.4,', '"startSec": 20.2, "endSec": 23.4']) {
    assert.ok(p.includes(s), s);
  }
  // another pace gives other numbers, none of the 1.3 ones left
  const q = buildPrompt({ target: 'starwish', pace: 1 });
  for (const s of ['`durationSec` 15 to 20 plan-seconds', '35 to 50 words', 'about 35–42 words', 'about 4.0 s on screen', '"durationSec": 18,', '"startSec": 15.5, "endSec": 18']) {
    assert.ok(q.includes(s), s);
  }
});
