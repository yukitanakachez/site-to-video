import { readFileSync } from 'node:fs';

// facts.json = { source, facts: [{ id, text, where }] }
export function loadFacts(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!raw || typeof raw.source !== 'string' || !Array.isArray(raw.facts)) {
    throw new Error('facts.json must be { source: string, facts: [...] }');
  }
  const byId = new Map();
  for (const f of raw.facts) {
    if (!f || typeof f.id !== 'string' || !f.id) throw new Error('every fact needs an id');
    if (typeof f.text !== 'string' || !f.text.trim()) throw new Error(`fact ${f.id} has empty text`);
    if (byId.has(f.id)) throw new Error(`duplicate fact id ${f.id}`);
    byId.set(f.id, f);
  }
  return { source: raw.source, facts: raw.facts, byId };
}
