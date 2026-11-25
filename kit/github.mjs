// Visit a GitHub repo without running it: shallow clone, read the README, find the repo's own website.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const run = promisify(execFile);
const CLONE_TIMEOUT_MS = 180_000;
const FETCH_TIMEOUT_MS = 15_000;

// Fenced code blocks (``` or ~~~). A fence that never closes is dropped.
export function parseCodeBlocks(markdown) {
  const blocks = [];
  let open = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (!open) {
      const m = line.match(/^ {0,3}(`{3,}|~{3,})\s*([^\s`{]*)/);
      if (m) open = { char: m[1][0], len: m[1].length, lang: m[2], lines: [] };
      continue;
    }
    const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
    if (close && close[1][0] === open.char && close[1].length >= open.len) {
      blocks.push({ lang: open.lang, text: open.lines.join('\n').replace(/\n+$/, '') });
      open = null;
    } else open.lines.push(line);
  }
  return blocks;
}

function imagesFrom(markdown) {
  const found = [];
  const re = /!\[[^\]]*\]\(\s*<?([^)\s>]+)[^)]*\)|<img\b[^>]*?\bsrc=["']([^"']+)["']/gi;
  for (const m of markdown.matchAll(re)) {
    const src = (m[1] || m[2]).replace(/^\.\//, '');
    if (!found.includes(src)) found.push(src);
  }
  return found;
}

// The website in the repo page's About box (used only when the API is rate limited).
export function homepageFromHtml(html) {
  const about = html.match(/<h2[^>]*>\s*(?:<span>)?\s*About\s*(?:<\/span>)?\s*<\/h2>/i);
  if (!about) return null;
  const slice = html.slice(about.index, about.index + 6000);
  const titled = slice.match(/websiteLink[^>]*\btitle="(https?:\/\/[^"]+)"/i);
  if (titled) return titled[1];
  for (const m of slice.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
    let host;
    try { host = new URL(m[1]).hostname; } catch { continue; }
    if (!/(^|\.)github(usercontent)?\.com$/.test(host)) return m[1];
  }
  return null;
}

async function defaultFetch(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'demo-video-agent', accept: 'application/vnd.github+json, text/html' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text };
}

function cleanHomepage(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

async function lookupMeta(owner, repo, fetchImpl) {
  let api;
  try { api = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}`); } catch { return { homepage: null, description: null }; }
  if (api.status === 200 && api.json) {
    return { homepage: cleanHomepage(api.json.homepage), description: api.json.description || null };
  }
  if (api.status === 403 || api.status === 429) {
    try {
      const page = await fetchImpl(`https://github.com/${owner}/${repo}`);
      if (page.status === 200 && page.text) return { homepage: homepageFromHtml(page.text), description: null };
    } catch { /* fall through */ }
  }
  return { homepage: null, description: null };
}

// cloneUrl is only for tests (a local repo).
export async function visitGithub({ owner, repo, outDir, cloneUrl, fetchImpl = defaultFetch }) {
  const dest = join(outDir, 'repo');
  mkdirSync(outDir, { recursive: true });
  rmSync(dest, { recursive: true, force: true });
  const meta = lookupMeta(owner, repo, fetchImpl);
  await run('git', ['clone', '--depth', '1', '--single-branch', cloneUrl || `https://github.com/${owner}/${repo}.git`, dest], {
    env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', GIT_TERMINAL_PROMPT: '0' },
    timeout: CLONE_TIMEOUT_MS,
  });
  const names = readdirSync(dest).filter((n) => /^readme(\.(md|markdown|rst|txt))?$/i.test(n));
  names.sort((a, b) => Number(!/\.md$/i.test(a)) - Number(!/\.md$/i.test(b)));
  const readme = names[0] ? join(dest, names[0]) : null;
  const markdown = readme ? readFileSync(readme, 'utf8') : '';
  return { ...(await meta), readme, codeBlocks: parseCodeBlocks(markdown), images: imagesFrom(markdown) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const link = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
  const m = link && link.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  if (!m || outAt < 0 || !args[outAt + 1]) {
    console.error('usage: node kit/github.mjs https://github.com/<owner>/<repo> --out <dir>');
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(await visitGithub({ owner: m[1], repo: m[2], outDir: args[outAt + 1] })));
  } catch (e) {
    console.error(`could not visit the repo: ${e.message}`);
    process.exit(2);
  }
}
