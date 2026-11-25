import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { visitGithub, parseCodeBlocks, homepageFromHtml } from '../kit/github.mjs';

const fixture = new URL('./fixtures/readme-cli.md', import.meta.url).pathname;

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'gh-'));
  const src = join(root, 'src');
  mkdirSync(join(src, 'docs'), { recursive: true });
  copyFileSync(fixture, join(src, 'README.md'));
  writeFileSync(join(src, 'docs', 'demo.gif'), 'GIF89a');
  const git = (...a) => execFileSync('git', ['-C', src, ...a], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
  return { root, src };
}

test('parseCodeBlocks scans backtick and tilde fences and drops unterminated ones', () => {
  const blocks = parseCodeBlocks(readFileSync(fixture, 'utf8'));
  assert.deepEqual(blocks, [
    { lang: 'bash', text: 'npm install -g fixture-cli\nfixture count notes.txt' },
    { lang: '', text: 'notes.txt: 128 words' },
    { lang: 'sh', text: 'fixture --help' },
  ]);
});

test('homepageFromHtml finds the About website link', () => {
  const html = '<div class="BorderGrid-cell"><h2>About</h2><a role="link" href="https://fixture.example/" class="Link">fixture.example</a></div>';
  assert.equal(homepageFromHtml(html), 'https://fixture.example/');
  assert.equal(homepageFromHtml('<p>nothing</p>'), null);
});

test('visitGithub extracts homepage, README code blocks and images from a local repo', async () => {
  const { root, src } = makeRepo();
  const outDir = join(root, 'out');
  const fetchJson = async (url) => {
    assert.equal(url, 'https://api.github.com/repos/o/r');
    return { status: 200, json: { homepage: '', description: 'Counts words' } };
  };
  const r = await visitGithub({ owner: 'o', repo: 'r', outDir, cloneUrl: src, fetchImpl: fetchJson });
  assert.equal(r.homepage, null);
  assert.equal(r.description, 'Counts words');
  assert.equal(r.readme, join(outDir, 'repo', 'README.md'));
  assert.ok(existsSync(r.readme));
  assert.equal(r.codeBlocks.length, 3);
  assert.deepEqual(r.images, ['docs/demo.gif', 'https://img.shields.io/badge/ok-yes-green.svg']);
});

test('visitGithub uses the repo page About link when the API is rate limited', async () => {
  const { root, src } = makeRepo();
  const fetchImpl = async (url) => url.startsWith('https://api.github.com/')
    ? { status: 403, json: null }
    : { status: 200, text: '<h2>About</h2><a href="https://site.example/">site.example</a>' };
  const r = await visitGithub({ owner: 'o', repo: 'r', outDir: join(root, 'out'), cloneUrl: src, fetchImpl });
  assert.equal(r.homepage, 'https://site.example/');
  assert.equal(r.description, null);
});

test('visitGithub returns the API homepage when there is one', async () => {
  const { root, src } = makeRepo();
  const fetchImpl = async () => ({ status: 200, json: { homepage: 'https://fixture.example', description: null } });
  const r = await visitGithub({ owner: 'o', repo: 'r', outDir: join(root, 'out'), cloneUrl: src, fetchImpl });
  assert.equal(r.homepage, 'https://fixture.example');
});

test('homepageFromHtml reads the current GitHub website row', () => {
  const html = '<h2 class="x"><span>About</span></h2><p>d</p><div class="websiteRow__c"><span class="websiteLink__z" title="https://nextjs.org">nextjs.org</span><a href="https://nextjs.org">x</a></div>';
  assert.equal(homepageFromHtml(html), 'https://nextjs.org');
});
