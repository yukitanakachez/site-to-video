// The process the programs require (spec 7.1): eight stages, each opened by kit/stage.mjs in order,
// and each refused until the earlier stage's file is there. kit/stage.mjs opens them; the package
// gate in kit/check-video.mjs asks stageProblems() before anything reaches the customer.
// The sibling agent's model skipped its written decisions until a program forced them (sibling
// DECISIONS.md, "The model and the enforced process"); this is that program.
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFacts } from './facts.mjs';
import { jobPaths } from './paths.mjs';
import { validateShotlist } from './shotlist.mjs';

export const STAGES = ['visit', 'scout', 'direct', 'capture', 'sound', 'render', 'check', 'deliver'];

// The line the model sends with the progress tool as each stage starts.
export const PROGRESS = {
  visit: 'Visiting the link',
  scout: 'Looking around the page',
  direct: 'Choosing moments',
  capture: 'Recording moments',
  sound: 'Recording the voiceover',
  render: 'Rendering',
  check: 'Checking the video',
  deliver: 'Packaging',
};

export const MIN_FACTS = 4;
export const STAGE_SCRIPT = fileURLToPath(new URL('../kit/stage.mjs', import.meta.url));

// What to do once a stage is open; the instructions hold the detail.
const NEXT = {
  visit: (w) => `visit the link, then write ${join(w, 'visit.md')} and ${join(w, 'facts.json')}.`,
  scout: (w) => `scout the page you will film into ${join(w, 'captures')}, then look at page.png and elements.json.`,
  direct: (w) => `write ${join(w, 'shotlist.json')} and validate it.`,
  capture: () => 'record each clip moment with capture.mjs (none if the shot list has no clips).',
  sound: () => 'ask make-audio for the voice, then the music.',
  render: (w) => `render ${join(w, 'demo.mp4')} and ${join(w, 'poster.png')}.`,
  check: () => 'run the check, then review the frames.',
  deliver: () => 'package the video, then write result.md.',
};

export const defaultToolOutput = (work) => join(work, '..', 'tool-output');
export const processPath = (work) => join(work, 'process.json');

export function stageCommand(stage, { work } = {}) {
  let cmd = `node ${STAGE_SCRIPT} ${stage}`;
  if (work && resolve(work) !== resolve(jobPaths().work)) cmd += ` --work ${work}`;
  return cmd;
}

// { opened: [{ name, at }] }, in the order the stages were opened.
export function readProcess(work) {
  try {
    const r = JSON.parse(readFileSync(processPath(work), 'utf8'));
    if (r && Array.isArray(r.opened)) return { opened: r.opened.filter((s) => s && STAGES.includes(s.name)) };
  } catch { /* none yet, or unreadable: nothing was opened */ }
  return { opened: [] };
}

function writeProcess(work, record) {
  mkdirSync(work, { recursive: true });
  const tmp = `${processPath(work)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(tmp, processPath(work));
}

const firstOpened = (record, name) => {
  const s = record.opened.find((x) => x.name === name);
  const t = Date.parse(s?.at ?? '');
  return Number.isFinite(t) ? t : null;
};

function readVoices() {
  const v = JSON.parse(readFileSync(new URL('../config/voices.json', import.meta.url), 'utf8'));
  return Array.isArray(v) ? v : v?.voices ?? [];
}

function mediaSize(path) {
  const b = readFileSync(path);
  if (b.length > 24 && b.toString('latin1', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path], { encoding: 'utf8' });
  try {
    const st = JSON.parse(r.stdout).streams?.[0];
    return st ? { width: st.width, height: st.height } : null;
  } catch { return null; }
}

// Source sizes for the validator, for the capture and clip files that exist.
function captureSizes(shot, work) {
  const sizes = {};
  for (const m of shot?.moments ?? []) {
    const file = m?.source?.file;
    if (typeof file !== 'string') continue;
    const path = resolve(work, file);
    if (!existsSync(path)) continue;
    const s = mediaSize(path);
    if (s) sizes[file] = s;
  }
  return sizes;
}

function factsProblem(work) {
  const file = join(work, 'facts.json');
  if (!existsSync(file)) return `${file} does not exist. Write it in the visit stage: { "source": "<link>", "facts": [{ "id", "text", "where" }] }.`;
  let facts;
  try { facts = loadFacts(file); } catch (e) { return `${file} is not valid: ${e.message}.`; }
  if (facts.facts.length < MIN_FACTS) {
    return `${file} holds ${facts.facts.length} facts; a video needs at least ${MIN_FACTS}. If the link holds no more, refuse: write only result.md saying why.`;
  }
  return null;
}

// preCapture: clip files not recorded yet are not an error (ruling R13). pace: config.json's unless given.
function shotlistProblem(work, { preCapture = false, pace } = {}) {
  const file = join(work, 'shotlist.json');
  if (!existsSync(file)) return `${file} does not exist. Write it in the direct stage.`;
  try {
    const shot = JSON.parse(readFileSync(file, 'utf8'));
    const facts = loadFacts(join(work, 'facts.json'));
    const { ok, errors } = validateShotlist(shot, { facts, voices: readVoices(), captureSizes: captureSizes(shot, work), allowMissingClips: preCapture, pace });
    return ok ? null : `${file} does not validate: ${errors.join('; ')}.`;
  } catch (e) {
    return `${file} could not be validated: ${e.message}.`;
  }
}

// The call folders under tool-output that hold each audio file make-audio writes.
function audioProblem(toolOutput) {
  const dirs = existsSync(toolOutput)
    ? readdirSync(toolOutput).map((n) => join(toolOutput, n)).filter((d) => { try { return statSync(d).isDirectory(); } catch { return false; } })
    : [];
  const has = (d, f) => existsSync(join(d, f));
  const missing = [];
  if (!dirs.some((d) => has(d, 'voice.mp3') && has(d, 'voice-alignment.json'))) missing.push('voice.mp3 with its voice-alignment.json (make-audio voice)');
  if (!dirs.some((d) => has(d, 'music.mp3'))) missing.push('music.mp3 (make-audio music)');
  return missing.length ? `${toolOutput}/*/ holds no ${missing.join(' and no ')}.` : null;
}

function checkProblem(work) {
  const file = join(work, 'check.json');
  try {
    if (JSON.parse(readFileSync(file, 'utf8')).pass === true) return null;
  } catch { return `${file} does not exist. Run the check first.`; }
  return `${file} does not say pass: true. Fix the hard findings, render and check again.`;
}

// Why a stage's own files are not ready, or null. Earlier stages being opened is checked apart.
function filesProblem(stage, { work, toolOutput, pace }) {
  switch (stage) {
    case 'scout':
      if (!existsSync(join(work, 'visit.md'))) return `${join(work, 'visit.md')} does not exist. Write it in the visit stage.`;
      return factsProblem(work);
    case 'direct': {
      const missing = ['page.png', 'elements.json'].map((f) => join(work, 'captures', f)).filter((f) => !existsSync(f));
      return missing.length ? `${missing.join(' and ')} ${missing.length > 1 ? 'do' : 'does'} not exist. Run the scout into ${join(work, 'captures')}.` : null;
    }
    case 'capture': return shotlistProblem(work, { preCapture: true, pace });
    case 'sound': return shotlistProblem(work, { pace });
    case 'render': return audioProblem(toolOutput);
    case 'check': return existsSync(join(work, 'demo.mp4')) ? null : `${join(work, 'demo.mp4')} does not exist. Render it first.`;
    case 'deliver': return checkProblem(work);
    default: return null; // visit needs nothing
  }
}

function entryProblem(stage, opts, record) {
  const i = STAGES.indexOf(stage);
  const unopened = STAGES.slice(0, i).find((s) => firstOpened(record, s) === null);
  if (unopened) return `The ${unopened} stage was never opened. Run ${stageCommand(unopened, opts)} first.`;
  return filesProblem(stage, opts);
}

const withDefaults = ({ work = jobPaths().work, toolOutput, pace } = {}) => ({ work, toolOutput: toolOutput ?? defaultToolOutput(work), pace });

export function openStage(name, options) {
  if (!STAGES.includes(name)) return { ok: false, message: `[Unknown stage "${name}". The stages are: ${STAGES.join(', ')}.]` };
  const opts = withDefaults(options);
  const record = readProcess(opts.work);
  const problem = entryProblem(name, opts, record);
  if (problem) return { ok: false, message: `[The ${name} stage cannot open yet. ${problem}]` };
  record.opened.push({ name, at: new Date().toISOString() });
  writeProcess(opts.work, record);
  return { ok: true, message: `[The ${name} stage is open. Next: ${NEXT[name](opts.work)}]` };
}

// The package gate's reasons not to deliver: a stage never opened, opened out of order, or whose
// files no longer hold. Empty means fine.
export function stageProblems(options) {
  const opts = withDefaults(options);
  const record = readProcess(opts.work);
  const problems = [];
  let last = -Infinity;
  for (const stage of STAGES) {
    const at = firstOpened(record, stage);
    if (at === null) { problems.push(`the ${stage} stage was never opened (${stageCommand(stage, opts)})`); continue; }
    if (at < last) problems.push(`the ${stage} stage was opened before an earlier stage`);
    last = Math.max(last, at);
    const p = filesProblem(stage, opts);
    if (p) problems.push(`${stage} stage: ${p}`);
  }
  return problems;
}
