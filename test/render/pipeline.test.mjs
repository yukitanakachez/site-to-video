// Slow: the programs chained on a fixed job, no model. Run with `npm run test:render`.
// scout -> (hand-written facts + shot list) -> capture -> audio stand-ins -> validate -> render -> check --package,
// each stage opened in order through the stage gate (lib/process.mjs), as the instructions say.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scout } from '../../kit/scout.mjs';
import { captureMoment } from '../../kit/capture.mjs';
import { renderDemo } from '../../kit/render.mjs';
import { startServer, FIXTURE_PACE } from '../helpers.mjs';
import { openStage } from '../../lib/process.mjs';

const KIT = fileURLToPath(new URL('../../kit/', import.meta.url));
const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
const AUDIO = join(FIXTURES, 'job-good', 'tool-output');
const HOSTS = ['127.0.0.1'];

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
// The fixture shot lists are written for FIXTURE_PACE; the CLIs that read a shot list are pinned to it.
const PACED = new Set(['validate-shotlist.mjs', 'check-video.mjs']);
const run = (script, args, env = {}) => spawnSync('node', [join(KIT, script), ...args, ...(PACED.has(script) ? ['--pace', String(FIXTURE_PACE)] : [])], { encoding: 'utf8', env: { ...process.env, ...env } });

// The narration is spoken at an even pace; the real alignment comes from ElevenLabs.
function evenAlignment(narration, endBySec) {
  const words = narration.flatMap((l) => l.text.split(/\s+/)).filter(Boolean);
  const step = endBySec / words.length;
  return { words: words.map((word, i) => ({ word, startSec: +(i * step).toFixed(3), endSec: +(i * step + step * 0.8).toFixed(3) })) };
}

// Audio as make-audio leaves it: one folder per call, each with its call record.
function placeAudio(toolOutput, narration) {
  cpSync(AUDIO, toolOutput, { recursive: true });
  writeFileSync(join(toolOutput, 'c1', 'voice-alignment.json'), JSON.stringify(evenAlignment(narration, 15)));
  for (const [dir, action] of [['c1', 'voice'], ['c2', 'music']]) {
    writeFileSync(join(toolOutput, dir, `make-audio-${action}.json`), JSON.stringify({ action }));
  }
}

async function pipeline(format) {
  const job = mkdtempSync(join(tmpdir(), `pipeline-${format}-`));
  const work = join(job, 'work');
  const toolOutput = join(job, 'tool-output');
  const output = join(job, 'output');
  mkdirSync(work, { recursive: true });
  mkdirSync(output);
  const url = `${srv.base}/landing.html`;
  const fill = (text) => text.replaceAll('{{BASE}}', srv.base);
  const open = (stage) => {
    const r = openStage(stage, { work, toolOutput, pace: FIXTURE_PACE });
    assert.equal(r.ok, true, `${stage}: ${r.message}`);
  };

  // visit: the facts (hand-written from the scouted text.json) and visit.md
  open('visit');
  writeFileSync(join(work, 'facts.json'), fill(readFileSync(join(FIXTURES, 'facts-landing.json'), 'utf8')));
  writeFileSync(join(work, 'visit.md'), '# Visit\n\nA landing page; a highlight reel.\n');

  // 1. scout
  open('scout');
  const s = await scout({ url, format, outDir: join(work, 'captures'), allowHosts: HOSTS });
  assert.equal(s.ok, true, s.reason);
  assert.equal(s.blocked, false);
  const elements = readJson(join(work, 'captures', 'elements.json'));

  // 2. direct: the hand-written shot list, the base URL filled in; it validates before capture
  open('direct');
  const shotPath = join(work, 'shotlist.json');
  const listName = format === 'wide' ? 'shotlist-landing.json' : 'shotlist-landing-tall.json';
  const shot = JSON.parse(fill(readFileSync(join(FIXTURES, listName), 'utf8')));
  assert.equal(shot.format, format);
  writeFileSync(shotPath, JSON.stringify(shot, null, 2));
  const pre = run('validate-shotlist.mjs', [shotPath, '--facts', join(work, 'facts.json'), '--work', work, '--pre-capture']);
  assert.equal(pre.status, 0, pre.stdout + pre.stderr);
  open('capture');

  // 3. capture one hover moment: scroll to a feature card, then hover it (document CSS px, via its elements.json id)
  const card = elements.find((e) => e.role === 'feature');
  assert.ok(card, 'scout found a feature card');
  const clipMoment = shot.moments.find((m) => m.source.type === 'clip');
  const captured = await captureMoment({
    url,
    format,
    durationSec: clipMoment.endSec - clipMoment.startSec,
    outPath: join(work, clipMoment.source.file),
    elements,
    allowHosts: HOSTS,
    actions: [
      { type: 'scroll', atSec: 0, dy: Math.max(0, card.box.y - 150) },
      { type: 'hover', atSec: 1, selector: card.id },
    ],
  });
  assert.ok(existsSync(captured.file));
  assert.ok(captured.cursor.length >= 1, 'capture returned the cursor path');
  clipMoment.cursor = captured.cursor; // pasted into the shot list, as the stage instructions say
  writeFileSync(shotPath, JSON.stringify(shot, null, 2));

  // 4. validate. The clip's size is only known once it is captured, so this runs after capture.
  const v = run('validate-shotlist.mjs', [shotPath, '--facts', join(work, 'facts.json'), '--work', work]);
  assert.equal(v.status, 0, v.stdout + v.stderr);

  // 5. sound (the voice and music): audio stand-ins in fake make-audio call folders
  open('sound');
  placeAudio(toolOutput, shot.narration);

  // 6. render
  open('render');
  const videoPath = join(work, 'demo.mp4');
  const posterPath = join(work, 'poster.png');
  await renderDemo({ shotlistPath: shotPath, workDir: work, outPath: videoPath, posterPath, toolOutputDir: toolOutput, pace: FIXTURE_PACE });
  assert.ok(existsSync(videoPath) && existsSync(posterPath));

  // 7. check (writes check.json and the review frames), then deliver: package.
  // DEMO_JOB_ROOT points the package gate at this job's tool-output.
  open('check');
  const checked = run('check-video.mjs', ['--video', videoPath, '--shotlist', shotPath, '--work', work, '--format', format]);
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  assert.ok(existsSync(join(work, 'frames', 'first.png')), 'review frames');
  open('deliver');
  const c = run('check-video.mjs', ['--video', videoPath, '--shotlist', shotPath, '--work', work, '--format', format, '--package', output], { DEMO_JOB_ROOT: job });
  assert.equal(c.status, 0, c.stdout + c.stderr);
  assert.match(c.stdout, /PASS/);
  assert.equal(readJson(join(work, 'check.json')).pass, true);

  assert.ok(existsSync(join(output, 'demo.mp4')), 'output/demo.mp4');
  assert.ok(existsSync(join(output, 'poster.png')), 'output/poster.png');
  assert.deepEqual(readdirSync(output).sort(), ['demo.mp4', 'poster.png'], 'only the finished video and poster are delivered');
  rmSync(job, { recursive: true, force: true });
}

test('pipeline: wide, scout to packaged demo', { timeout: 300_000 }, () => pipeline('wide'));
test('pipeline: tall, scout to packaged demo', { timeout: 300_000 }, () => pipeline('tall'));
