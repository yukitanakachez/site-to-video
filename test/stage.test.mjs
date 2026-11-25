import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STAGES, openStage, stageProblems } from '../lib/process.mjs';
import { FIXTURE_PACE } from './helpers.mjs';

const FIX = new URL('./fixtures/job-good/', import.meta.url).pathname;
const STAGE_CLI = new URL('../kit/stage.mjs', import.meta.url).pathname;
const CHECK_CLI = new URL('../kit/check-video.mjs', import.meta.url).pathname;
const VALIDATE_CLI = new URL('../kit/validate-shotlist.mjs', import.meta.url).pathname;

const roots = [];
after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

// A job folder holding everything a finished run leaves behind, except the stage record.
function fakeJob() {
  const job = mkdtempSync(join(tmpdir(), 'stage-'));
  roots.push(job);
  const work = join(job, 'work');
  const toolOutput = join(job, 'tool-output');
  mkdirSync(join(job, 'output'), { recursive: true });
  mkdirSync(work, { recursive: true });
  cpSync(join(FIX, 'captures'), join(work, 'captures'), { recursive: true });
  cpSync(join(FIX, 'clips'), join(work, 'clips'), { recursive: true });
  copyFileSync(join(FIX, 'facts.json'), join(work, 'facts.json'));
  copyFileSync(join(FIX, 'shotlist-wide.json'), join(work, 'shotlist.json'));
  writeFileSync(join(work, 'visit.md'), '# Visit\n\nFixture builds sites.\n');
  cpSync(join(FIX, 'tool-output'), toolOutput, { recursive: true });
  writeFileSync(join(toolOutput, 'c1', 'make-audio-voice.json'), '{}');
  writeFileSync(join(toolOutput, 'c2', 'make-audio-music.json'), '{}');
  return { job, work, toolOutput, output: join(job, 'output') };
}

// Opens every stage in order, making each stage's file just before the stage that needs it.
function openAll(j, { skip = [], beforeCheck = () => writeFileSync(join(j.work, 'demo.mp4'), 'video') } = {}) {
  for (const name of STAGES) {
    if (name === 'check') beforeCheck();
    if (name === 'deliver') writeFileSync(join(j.work, 'check.json'), JSON.stringify({ pass: true, findings: [] }));
    if (skip.includes(name)) continue;
    const r = openStage(name, { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
    assert.equal(r.ok, true, `${name}: ${r.message}`);
  }
}

test('stages open only in order', () => {
  const j = fakeJob();
  assert.equal(openStage('visit', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE }).ok, true);
  const r = openStage('direct', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
  assert.equal(r.ok, false);
  assert.match(r.message, /scout/);
  const record = JSON.parse(readFileSync(join(j.work, 'process.json'), 'utf8'));
  assert.deepEqual(record.opened.map((s) => s.name), ['visit']);
  assert.ok(!Number.isNaN(Date.parse(record.opened[0].at)));
  assert.equal(openStage('scout', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE }).ok, true);
  assert.equal(openStage('direct', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE }).ok, true);
});

test('scout refuses without a valid facts.json', () => {
  const j = fakeJob();
  openStage('visit', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
  writeFileSync(join(j.work, 'facts.json'), '{"facts": "none"}');
  let r = openStage('scout', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
  assert.equal(r.ok, false);
  assert.match(r.message, /facts\.json/);
  // Fewer than 4 facts is a refusal, not a video.
  const three = JSON.parse(readFileSync(join(FIX, 'facts.json'), 'utf8'));
  three.facts = three.facts.slice(0, 3);
  writeFileSync(join(j.work, 'facts.json'), JSON.stringify(three));
  r = openStage('scout', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
  assert.equal(r.ok, false);
  assert.match(r.message, /3 facts/);
  assert.match(r.message, /refuse/i);
  rmSync(join(j.work, 'visit.md'));
  copyFileSync(join(FIX, 'facts.json'), join(j.work, 'facts.json'));
  r = openStage('scout', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
  assert.equal(r.ok, false);
  assert.match(r.message, /visit\.md/);
});

test('capture refuses a shot list that does not validate', () => {
  const j = fakeJob();
  for (const s of ['visit', 'scout', 'direct']) openStage(s, { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
  rmSync(join(j.work, 'clips'), { recursive: true }); // clips are recorded later; that alone is fine
  assert.equal(openStage('capture', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE }).ok, true);
  const shot = JSON.parse(readFileSync(join(FIX, 'shotlist-wide.json'), 'utf8'));
  shot.durationSec = 30;
  writeFileSync(join(j.work, 'shotlist.json'), JSON.stringify(shot));
  const r = openStage('capture', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
  assert.equal(r.ok, false);
  assert.match(r.message, /durationSec/);
});

test('sound needs the clips recorded and the shot list fully valid', () => {
  const j = fakeJob();
  rmSync(join(j.work, 'clips'), { recursive: true });
  for (const s of ['visit', 'scout', 'direct', 'capture']) assert.equal(openStage(s, { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE }).ok, true, s);
  let r = openStage('sound', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
  assert.equal(r.ok, false);
  assert.match(r.message, /no size known for clips\/m2\.mp4/);
  cpSync(join(FIX, 'clips'), join(j.work, 'clips'), { recursive: true });
  r = openStage('sound', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
  assert.equal(r.ok, true, r.message);
});

test('validate-shotlist --pre-capture passes a shot list whose clips are not recorded yet', () => {
  const j = fakeJob();
  rmSync(join(j.work, 'clips'), { recursive: true });
  const args = [join(j.work, 'shotlist.json'), '--facts', join(j.work, 'facts.json'), '--work', j.work, '--pace', String(FIXTURE_PACE)];
  let r = spawnSync('node', [VALIDATE_CLI, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no size known for clips\/m2\.mp4/);
  r = spawnSync('node', [VALIDATE_CLI, ...args, '--pre-capture'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /^OK\n/);
});

// spec 16.1: the shot list is in plan-seconds; the model needs the finished video's times for the
// music call and for result.md, so a passing validation prints them.
test('validate-shotlist prints the video as it will play: its length and each moment in seconds of the video', () => {
  const j = fakeJob();
  const r = spawnSync('node', [VALIDATE_CLI, join(j.work, 'shotlist.json'), '--facts', join(j.work, 'facts.json'), '--work', j.work, '--pace', String(FIXTURE_PACE)], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout, 'OK\nAt pace 1.3 the video plays for 16.0 s (make-audio music seconds: 16). Moments in the video: m1 0–4.5 s, m2 4.5–8.5 s, m3 8.5–13.5 s, m4 13.5–16 s.\n');
});

test('render refuses without voice and music in tool-output', () => {
  const j = fakeJob();
  for (const s of ['visit', 'scout', 'direct', 'capture', 'sound']) {
    assert.equal(openStage(s, { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE }).ok, true, s);
  }
  rmSync(join(j.toolOutput, 'c2', 'music.mp3'));
  let r = openStage('render', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
  assert.equal(r.ok, false);
  assert.match(r.message, /music\.mp3/);
  copyFileSync(join(FIX, 'tool-output', 'c2', 'music.mp3'), join(j.toolOutput, 'c2', 'music.mp3'));
  rmSync(join(j.toolOutput, 'c1', 'voice-alignment.json'));
  r = openStage('render', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
  assert.equal(r.ok, false);
  assert.match(r.message, /voice/);
});

test('check and deliver need the video and a passing check.json', () => {
  const j = fakeJob();
  for (const s of ['visit', 'scout', 'direct', 'capture', 'sound', 'render']) openStage(s, { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
  let r = openStage('check', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
  assert.equal(r.ok, false);
  assert.match(r.message, /demo\.mp4/);
  writeFileSync(join(j.work, 'demo.mp4'), 'video');
  assert.equal(openStage('check', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE }).ok, true);
  writeFileSync(join(j.work, 'check.json'), JSON.stringify({ pass: false, findings: [] }));
  r = openStage('deliver', { work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE });
  assert.equal(r.ok, false);
  assert.match(r.message, /check\.json/);
});

test('stageProblems is empty after a complete fake run', () => {
  const j = fakeJob();
  openAll(j);
  assert.deepEqual(stageProblems({ work: j.work, toolOutput: j.toolOutput, pace: FIXTURE_PACE }), []);
  const k = fakeJob();
  openAll(k, { skip: ['direct', 'capture', 'sound', 'render', 'check', 'deliver'] });
  const problems = stageProblems({ work: k.work, toolOutput: k.toolOutput, pace: FIXTURE_PACE });
  assert.ok(problems.some((p) => /direct stage was never opened/.test(p)), problems.join('\n'));
});

test('the stage command prints one line', () => {
  const j = fakeJob();
  let r = spawnSync('node', [STAGE_CLI, 'visit', '--work', j.work], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^\[The visit stage is open\. Next: .+\]\n$/);
  r = spawnSync('node', [STAGE_CLI, 'direct', '--work', j.work], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.equal(r.stdout.trim().split('\n').length, 1);
  assert.match(r.stdout, /scout/);
  r = spawnSync('node', [STAGE_CLI, 'dance', '--work', j.work], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('check-video --package refuses when a stage was skipped', () => {
  const ff = (args) => assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', ...args]).status, 0);
  const makeVideo = (j) => () => {
    ff(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=16', '-f', 'lavfi', '-t', '16', '-i', 'sine=frequency=440,volume=4',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-shortest', join(j.work, 'demo.mp4')]);
    ff(['-f', 'lavfi', '-i', 'color=c=gray:s=1920x1080', '-frames:v', '1', join(j.work, 'poster.png')]);
    mkdirSync(join(j.work, 'audio'), { recursive: true });
    copyFileSync(join(j.toolOutput, 'c1', 'voice-alignment.json'), join(j.work, 'audio', 'voice-alignment.json'));
  };
  const pkg = (j) => spawnSync('node', [CHECK_CLI, '--video', join(j.work, 'demo.mp4'), '--shotlist', join(j.work, 'shotlist.json'),
    '--work', j.work, '--format', 'wide', '--package', j.output, '--pace', String(FIXTURE_PACE)], { encoding: 'utf8', env: { ...process.env, DEMO_JOB_ROOT: j.job } });

  const good = fakeJob();
  openAll(good, { beforeCheck: makeVideo(good) });
  let r = pkg(good);
  assert.equal(r.status, 0, r.stdout + r.stderr);

  const skipped = fakeJob();
  openAll(skipped, { beforeCheck: makeVideo(skipped) });
  const record = JSON.parse(readFileSync(join(skipped.work, 'process.json'), 'utf8'));
  record.opened = record.opened.filter((s) => s.name !== 'sound');
  writeFileSync(join(skipped.work, 'process.json'), JSON.stringify(record));
  r = pkg(skipped);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /REFUSED package: .*sound stage was never opened/);
});
