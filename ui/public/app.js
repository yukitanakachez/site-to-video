// The page. Everything shown from a run (links, notes, the log) goes in as text, never as HTML.
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k in n) n[k] = v; else n.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null) n.append(kid);
  return n;
};
const api = async (path, opts = {}) => {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status})`);
  return data;
};

let status = null;
let source = null;
let timer = null;

// ---------- setup ----------
function check(ok, text, fix, warn) {
  const li = el('li');
  li.append(el('span', { class: `mark${ok ? '' : warn ? ' warn' : ' bad'}`, text: ok ? '✓' : '!' }));
  const body = el('div', { text });
  if (!ok && fix) { body.append(el('br'), el('span', { class: 'muted', text: fix })); }
  li.append(body);
  return li;
}

function renderStatus() {
  const s = status;
  const items = [
    check(s.node.ok, `Node ${s.node.version}`, 'Node 22.12 or newer is needed: https://nodejs.org'),
    check(s.ffmpeg.ok, 'ffmpeg', 'Install it: brew install ffmpeg (Mac), sudo apt install ffmpeg (Linux)'),
    check(s.claude.ok, s.claude.ok ? `Claude Code ${s.claude.version}` : 'Claude Code', 'Install it from https://claude.com/claude-code, then run claude once to sign in'),
  ];
  if (s.claude.ok) items.push(check(s.claude.loggedIn !== false || s.keys.anthropic.set, s.keys.anthropic.set ? 'Claude: using your Anthropic API key' : 'Claude Code is signed in', 'Run claude in a terminal and sign in, or add an Anthropic API key below'));
  items.push(check(s.chrome.ok, 'A browser to film pages', 'Run npm run setup in a terminal (it downloads one), or install Chrome', true));
  items.push(check(s.keys.elevenlabs.set, s.keys.elevenlabs.set ? 'ElevenLabs key saved' : 'ElevenLabs key', 'Paste it below'));
  $('checks').replaceChildren(...items);

  const e = s.keys.elevenlabs;
  $('eleven-state').textContent = e.set ? `Saved ${e.last4}${e.source === 'shell' ? ' (from your shell)' : ''}` : '';
  $('key-eleven').placeholder = e.set ? 'Paste a new key to replace it' : 'Paste your ElevenLabs key';
  const a = s.keys.anthropic;
  $('claude-state').textContent = a.set ? `API key ${a.last4}` : s.claude.loggedIn ? 'Signed in' : '';
  $('key-anthropic').placeholder = a.set ? 'Paste a new key to replace it' : 'sk-ant-…';

  const missing = [];
  if (!s.keys.elevenlabs.set) missing.push('Add your ElevenLabs key.');
  if (!s.ffmpeg.ok) missing.push('Install ffmpeg.');
  if (!s.claude.ok) missing.push('Install Claude Code.');
  if (s.claude.ok && s.claude.loggedIn === false && !s.keys.anthropic.set) missing.push('Sign in to Claude Code.');
  if (!s.chrome.ok) missing.push('Run npm run setup to download a browser.');
  const ready = missing.length === 0;
  $('setup-banner').hidden = ready;
  $('setup-banner-text').textContent = missing.join(' ');
  $('setup-dot').className = `dot${ready ? ' ok' : ''}`;

  const sel = $('model');
  if (!sel.options.length) {
    for (const m of s.models) sel.append(el('option', { value: m, text: m.includes('opus') ? 'Claude Opus 5.5 (best, tested)' : 'Claude Sonnet 5.5 (cheaper, less tested)' }));
  }
}

async function refresh() {
  status = await api('/api/status');
  renderStatus();
  return status;
}

async function saveKey(field, inputId, msgId, btnId) {
  const input = $(inputId), msg = $(msgId), btn = $(btnId);
  const value = input.value.trim();
  msg.className = 'small'; msg.textContent = '';
  if (!value) { msg.textContent = 'Paste a key first.'; msg.className = 'small error'; return; }
  btn.disabled = true; btn.textContent = 'Checking…';
  try {
    const r = await api('/api/keys', { method: 'POST', body: { [field]: value } });
    input.value = '';
    msg.textContent = r.warning || 'Saved.';
    msg.className = `small ${r.warning ? '' : 'ok'}`;
    await refresh();
  } catch (e) { msg.textContent = e.message; msg.className = 'small error'; }
  btn.disabled = false; btn.textContent = 'Save';
}

$('open-setup').onclick = () => $('setup').showModal();
$('banner-setup').onclick = () => $('setup').showModal();
$('save-eleven').onclick = () => saveKey('elevenlabs', 'key-eleven', 'msg-eleven', 'save-eleven');
$('save-anthropic').onclick = () => saveKey('anthropic', 'key-anthropic', 'msg-anthropic', 'save-anthropic');
$('key-eleven').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('save-eleven').click(); } };
$('key-anthropic').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('save-anthropic').click(); } };

// ---------- a run ----------
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function showProgress(info) {
  $('progress').hidden = false;
  $('result').hidden = true;
  $('progress-url').textContent = info.url || '';
  $('log').textContent = '';
  $('now').textContent = 'Starting…';
  state.stageIndex = -1;
  drawSteps();
  clearInterval(timer);
  const started = new Date(info.startedAt).getTime();
  const tick = () => { $('elapsed').textContent = mmss(Date.now() - started); };
  tick(); timer = setInterval(tick, 1000);
  $('go').disabled = true;
}
const state = { stageIndex: -1 };
function drawSteps() {
  const labels = status?.stages ?? [];
  $('steps').replaceChildren(...labels.map((l, i) => el('li', { class: i < state.stageIndex ? 'done' : i === state.stageIndex ? 'active' : '', text: l })));
}
function onStage(text) {
  state.stageIndex = Math.min(state.stageIndex + 1, (status?.stages.length ?? 8) - 1);
  $('now').textContent = text;
  drawSteps();
}
function onLine(line) {
  const log = $('log');
  log.textContent += `${line}\n`;
  log.scrollTop = log.scrollHeight;
}

function attach() {
  if (source) source.close();
  source = new EventSource('/api/runs/current/stream');
  source.onmessage = async (m) => {
    const e = JSON.parse(m.data);
    if (e.type === 'none') { source.close(); return; }
    if (e.type === 'hello') {
      if (e.status !== 'running') { source.close(); return; }
      showProgress(e);
      for (const l of e.lines) { onLine(l); const p = /^\[progress\]\s*(.*)$/.exec(l); if (p) onStage(p[1]); }
    } else if (e.type === 'stage') onStage(e.stage);
    else if (e.type === 'line') onLine(e.line);
    else if (e.type === 'end') {
      source.close(); clearInterval(timer);
      $('go').disabled = false;
      $('progress').hidden = true;
      await loadHistory();
      const run = (await api('/api/runs')).runs.find((r) => r.id === e.id);
      if (run) showResult(run); else showFailure('The run ended before it made a folder. Open the log in the terminal for details.');
      if (e.status === 'failed') $('result-body').prepend(el('p', { class: 'failed', text: 'No video this time. The agent may have refused the link; the notes below say why.' }));
    }
  };
  source.onerror = () => { /* the browser retries; nothing to do */ };
}

$('form').onsubmit = async (ev) => {
  ev.preventDefault();
  $('form-error').textContent = '';
  const fd = new FormData($('form'));
  try {
    await api('/api/runs', { method: 'POST', body: { url: fd.get('url'), format: fd.get('format'), request: fd.get('request'), model: fd.get('model') } });
    attach();
  } catch (e) {
    $('form-error').textContent = e.message;
    if (/ElevenLabs key/.test(e.message)) $('setup').showModal();
  }
};
$('stop').onclick = async () => { await api('/api/runs/current/stop', { method: 'POST' }); };

// ---------- results ----------
function showFailure(text) {
  $('result').hidden = false;
  $('result-body').replaceChildren(el('p', { class: 'failed', text }));
}

async function showResult(run) {
  $('result').hidden = false;
  const base = `/runs/${encodeURIComponent(run.id)}`;
  const has = (f) => run.files.includes(f);
  const body = $('result-body');
  const parts = [];
  const side = el('div');
  side.append(el('div', { class: 'label', text: run.url }));
  side.append(el('div', { class: 'small muted', text: `${run.format === 'tall' ? 'Tall 1080×1920' : 'Wide 1920×1080'} · ${new Date(run.startedAt).toLocaleString()}` }));
  if (has('demo.mp4')) {
    const actions = el('div', { class: 'result-actions' },
      el('a', { class: 'btn primary', href: `${base}/demo.mp4`, download: `${run.id}.mp4`, text: 'Download video' }),
      has('poster.png') ? el('a', { class: 'btn', href: `${base}/poster.png`, download: `${run.id}-poster.png`, text: 'Download thumbnail' }) : null);
    side.append(actions);
  }
  const notes = el('div', { class: 'notes', text: 'Loading the notes…' });
  side.append(notes);
  if (has('demo.mp4')) {
    const v = el('video', { controls: true, preload: 'metadata', poster: has('poster.png') ? `${base}/poster.png` : '' });
    v.src = `${base}/demo.mp4`;
    parts.push(v);
  }
  parts.push(side);
  body.replaceChildren(el('div', { class: `result-grid ${run.format}` }, ...parts));
  if (has('result.md')) {
    try { notes.textContent = await (await fetch(`${base}/result.md`)).text(); } catch { notes.textContent = ''; }
  } else notes.textContent = '';
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadHistory() {
  const { runs } = await api('/api/runs');
  const done = runs.filter((r) => r.files.length);
  $('history-section').hidden = done.length === 0;
  $('history').replaceChildren(...done.map((r) => {
    const t = el('button', { class: 'tile', type: 'button' });
    t.append(r.files.includes('poster.png') ? el('img', { src: `/runs/${encodeURIComponent(r.id)}/poster.png`, alt: '', loading: 'lazy' }) : el('div', { class: 'noimg', text: 'No thumbnail' }));
    t.append(el('div', { class: 'meta' }, el('b', { text: r.url.replace(/^https?:\/\//, '') }), el('span', { class: 'muted', text: new Date(r.startedAt).toLocaleString() })));
    t.onclick = () => showResult(r);
    return t;
  }));
}

// ---------- start ----------
(async () => {
  try {
    const s = await refresh();
    if (!s.keys.elevenlabs.set) $('setup').showModal();
    await loadHistory();
    if (s.running) attach();
  } catch (e) {
    $('form-error').textContent = `Could not reach the app: ${e.message}`;
  }
})();
