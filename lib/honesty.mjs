// The honesty rule (spec 5.6): rewording is allowed, inventing is not.
export const CONNECTIVES = ['Meet', 'Introducing', 'Say hello to', "Here's how", 'Try it at', 'Get started at',
  'Check out', "It's", "That's", 'And', 'With', 'Now'];

export const norm = (s) => String(s).normalize('NFKC').replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s+/g, ' ').trim().toLowerCase();

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const boundary = (s) => new RegExp(`(?<![\\p{L}\\p{N}'])${esc(s)}(?![\\p{L}\\p{N}'])`, 'gu');
const CONNECTIVE_WORDS = new Set(CONNECTIVES.flatMap((c) => norm(c).split(' ')));

export function riskyTokens(text) {
  const out = [];
  const add = (t) => { if (t && !out.includes(t)) out.push(t); };
  const unquoted = String(text).replace(/"([^"]+)"|“([^”]+)”/g, (_, a, b) => {
    add((a ?? b).trim());
    return ' ';
  });
  let sentenceStart = true;
  for (const raw of unquoted.split(/\s+/).filter(Boolean)) {
    const core = raw.replace(/^[^\p{L}\p{N}$€£]+/u, '').replace(/[^\p{L}\p{N}%™]+$/u, '').replace(/['’]s$/, '');
    if (core) {
      if (/[\p{N}$€£%™]/u.test(core)) add(core);
      else if (/^\p{Lu}/u.test(core) && !sentenceStart && !CONNECTIVE_WORDS.has(norm(core))) add(core);
    }
    sentenceStart = /[.!?]["')\]]*$/.test(raw);
  }
  return out;
}

const hasToken = (hay, tok) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(tok)}(?![\\p{L}\\p{N}])`, 'u').test(hay);

function onlyConnectivesAndProduct(text, byId) {
  let rest = ` ${norm(text)} `;
  const product = byId.size ? norm(byId.values().next().value.text) : '';
  const phrases = [...CONNECTIVES.map(norm), product].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const p of phrases) rest = rest.replace(boundary(p), ' ');
  return rest.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function checkLine(line, byId) {
  const problems = [];
  const ids = line.facts ?? [];
  if (!String(line.text ?? '').trim()) return ['line is empty'];
  for (const id of ids) if (!byId.has(id)) problems.push(`fact ${id} does not exist`);
  if (problems.length) return problems;
  if (ids.length === 0) {
    const rest = onlyConnectivesAndProduct(line.text, byId);
    if (rest) problems.push(`"${line.text}" cites no fact but contains "${rest}" beyond connectives and the product name; cite fact ids or remove it`);
    return problems;
  }
  const haystack = norm(ids.map((id) => byId.get(id).text).join(' '));
  for (const t of riskyTokens(line.text)) {
    if (!hasToken(haystack, norm(t))) problems.push(`"${t}" in "${line.text}" does not appear in the cited facts (${ids.join(', ')})`);
  }
  return problems;
}
