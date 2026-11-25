import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL_PATTERN } from '../lib/link.mjs';

const yaml = readFileSync(new URL('../agent.yaml', import.meta.url), 'utf8');
const live = yaml.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
const tools = live.split(/^tools:\s*$/m)[1] ?? '';

test('package.json and package-lock.json carry the same name', () => {
  for (const f of ['../package.json', '../package-lock.json']) {
    const j = JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
    assert.equal(j.name, 'site-to-video', f);
  }
  assert.equal(JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')).packages[''].name, 'site-to-video');
});
test('agent.yaml runs claude-code on claude-opus-5-5', () => {
  assert.match(live, /^harness:\s*\{\s*preset:\s*claude-code,\s*model:\s*claude-opus-5-5\s*\}/m);
});
test('agent.yaml has Yuki\'s permanent name and display name', () => {
  assert.match(live, /^name:\s*site-to-video\s*$/m);
  assert.match(live, /^display_name:\s*Site to Video\s*$/m);
  assert.doesNotMatch(yaml, /PROVISIONAL/);
  assert.match(live, /^version:\s*0\.1\.1(\s+#.*)?$/m);
});
test('agent.yaml requires url (shared URL_PATTERN) and format wide|tall', () => {
  assert.ok(yaml.includes(`pattern: '${URL_PATTERN}'`));
  assert.match(live, /required:\s*\[url,\s*format\]/);
  assert.match(live, /enum:\s*\[wide,\s*tall\]/);
  assert.match(live, /additionalProperties:\s*false/);
  assert.match(live, /examples:\s*\[\{\s*url:\s*"https:\/\/github\.com\/sharkdp\/hyperfine",\s*format:\s*"wide"\s*\}\]/);
});
test('agent.yaml installs ffmpeg, the packages and the Remotion browser in the workspace', () => {
  assert.match(live, /^workspace:\s*\{\s*install:\s*"apt-get install -y ffmpeg && npm ci --omit=dev && npx remotion browser ensure"\s*\}/m);
});
test('agent.yaml declares only make-audio, with ELEVENLABS_API_KEY bound to the documented host and header, and actions only', () => {
  assert.equal((tools.match(/^ {2}- name:/gm) ?? []).length, 1);
  assert.match(tools, /^ {2}- name:\s*make-audio\s*$/m);
  assert.match(tools, /run:\s*\.\/tools\/make-audio/);
  assert.match(tools, /ELEVENLABS_API_KEY:\s*\{\s*hosts:\s*\[api\.elevenlabs\.io\],\s*header:\s*"xi-api-key: \{value\}"\s*\}/);
  assert.match(tools, /^\s+actions:/m);
  assert.doesNotMatch(tools, /args:\s*any/);
  assert.equal((live.match(/credentials:/g) ?? []).length, 1);
  assert.match(tools, /args:\s*\["voice", "\{voice_id\}", "\{text\}"\]/);
  assert.match(tools, /args:\s*\["music", "\{prompt\}", "\{seconds\}"\]/);
});
// spec 16.2: no sound effects anywhere in the agent.
test('agent.yaml has no sound action and promises no sound effects', () => {
  assert.equal((tools.match(/^ {6}- name:/gm) ?? []).length, 2);
  assert.doesNotMatch(tools, /- name:\s*sound/);
  assert.doesNotMatch(tools, /"sound"/);
  assert.doesNotMatch(live, /sound effect/i);
});
test('make-audio actions state their limits and the prompt refusal rule', () => {
  for (const s of ['80 words', '540 characters', '15', '22', '200 characters', 'artist, song, album, label, publisher', 'lyrics']) {
    assert.ok(tools.includes(s), `missing: ${s}`);
  }
});
test('action parameters match what prompt.src.md tells the model to pass', () => {
  const prompt = readFileSync(new URL('../prompt.src.md', import.meta.url), 'utf8');
  for (const p of ['voice_id', 'text', 'prompt', 'seconds']) {
    assert.ok(prompt.includes(`\`${p}\``), `prompt.src.md does not name ${p}`);
    assert.ok(tools.includes(`{${p}}`), `agent.yaml does not use {${p}}`);
  }
});
test('agent.yaml names the three outputs', () => {
  for (const f of ['result.md', 'demo.mp4', 'poster.png']) assert.ok(live.includes(f), f);
  assert.match(live, /name:\s*demo\.mp4\s*\n\s+type:\s*video\/mp4\s*\n\s+required:\s*true/);
  assert.match(live, /name:\s*poster\.png\s*\n\s+type:\s*image\/png\s*\n\s+required:\s*true/);
  const outputs = live.split(/^outputs:\s*$/m)[1].split(/^\S/m)[0];
  assert.doesNotMatch(outputs, /\.mp3/, 'audio intermediates are never customer outputs');
});
test('price and max_response_time are Yuki\'s choices (Task 14)', () => {
  assert.match(live, /^price:\s*3200(\s+#.*)?$/m);
  assert.match(live, /^max_response_time:\s*18m(\s+#.*)?$/m);
});
test('description is the agreed one, on one line', () => {
  const line = live.split('\n').find((l) => l.startsWith('description:'));
  assert.match(line, /^description: "Send one public link \(a website, a GitHub repo, or another public page\) and choose wide or tall\. Get back a 15–20 second narrated demo video with music, a thumbnail, and notes\. One request makes one video\."$/);
});

// Task 14: one test each for a landing page (wide), the CLI repo (tall) and the web app with a demo (wide).
const MUST = 'returns demo.mp4 (15 to 20 seconds, with narration) of the given link, poster.png, and result.md listing the moments and the narration script';
test('agent.yaml has the three agent tests, each with the agreed must line', () => {
  const suite = live.split(/^tests:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';
  const tests = suite.split(/^ {2}- name:/m).slice(1).map((t) => `name:${t}`);
  assert.equal(tests.length, 3);
  const want = [
    ['landing-page-wide', 'https://www.raycast.com', 'wide'],
    ['cli-repo-tall', 'https://github.com/sharkdp/hyperfine', 'tall'],
    ['demo-app-wide', 'https://svelte.dev', 'wide'],
  ];
  want.forEach(([name, url, format], i) => {
    const t = tests[i];
    assert.match(t, new RegExp(`^name:\\s*${name}\\s*$`, 'm'), name);
    assert.match(t, /^\s+request:\s*"Make a demo video\."\s*$/m, name);
    assert.ok(t.includes(`params: { url: "${url}", format: "${format}" }`), `${name} params`);
    assert.ok(t.includes(`must: "${MUST}"`), `${name} must`);
    assert.ok(new RegExp(URL_PATTERN).test(url), url);
  });
});
