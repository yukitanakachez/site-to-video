import test from 'node:test';
import assert from 'node:assert/strict';
import { riskyTokens, checkLine, CONNECTIVES } from '../lib/honesty.mjs';
import { loadFacts } from '../lib/facts.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const facts = new Map([
  ['f1', { text: 'Fixture' }],
  ['f2', { text: 'Fixture builds your site 10x faster' }],
]);

test('riskyTokens finds numbers, prices, names and quotes', () => {
  assert.deepEqual(
    riskyTokens('Meet Fixture. It is 10x faster for $5/mo, trusted by Stripe and "the best tool".').sort(),
    ['$5/mo', '10x', 'Fixture', 'Stripe', 'the best tool'].sort());
});
test('riskyTokens handles curly quotes, percent and trademark', () => {
  assert.deepEqual(riskyTokens('Save 50% with Acme™ and “Best of Show”.').sort(),
    ['50%', 'Acme™', 'Best of Show'].sort());
});
test('sentence starts and connectives are not risky', () => {
  assert.deepEqual(riskyTokens('Build fast. And it works. Try it at fixture.dev.'), []);
  assert.ok(CONNECTIVES.includes('Say hello to'));
});
test('a reworded line that keeps facts verbatim passes', () => {
  assert.deepEqual(checkLine({ text: 'Build sites 10x faster.', facts: ['f2'] }, facts), []);
});
test('an invented number fails', () => {
  const p = checkLine({ text: 'Build sites 20x faster.', facts: ['f2'] }, facts);
  assert.equal(p.length, 1);
  assert.match(p[0], /20x/);
});
test('an invented customer name fails', () => {
  const p = checkLine({ text: 'Loved by Stripe.', facts: ['f2'] }, facts);
  assert.equal(p.length, 1);
  assert.match(p[0], /Stripe/);
});
test('matching ignores case, NFKC and whitespace', () => {
  const f = new Map([['f1', { text: 'Fixture' }], ['f9', { text: 'Trusted  by   ＡＣＭＥ teams' }]]);
  assert.deepEqual(checkLine({ text: 'Trusted by ACME teams.', facts: ['f9'] }, f), []);
});
test('a line with no facts that is only connectives and the product name passes', () => {
  assert.deepEqual(checkLine({ text: 'Meet Fixture.', facts: [] }, facts), []);
  assert.deepEqual(checkLine({ text: "Here's how. Now", facts: [] }, facts), []);
});
test('a line with no facts and other words fails', () => {
  const p = checkLine({ text: 'Meet Fixture, the best way to build.', facts: [] }, facts);
  assert.equal(p.length, 1);
  assert.match(p[0], /no fact/i);
});
test('an unknown fact id fails', () => {
  const p = checkLine({ text: 'Build sites.', facts: ['f99'] }, facts);
  assert.match(p.join('\n'), /f99/);
});

test('loadFacts reads facts and builds byId', () => {
  const dir = mkdtempSync(join(tmpdir(), 'facts-'));
  const p = join(dir, 'facts.json');
  writeFileSync(p, JSON.stringify({ source: 'https://x.dev', facts: [{ id: 'f1', text: 'X', where: 'u#t1' }] }));
  const r = loadFacts(p);
  assert.equal(r.source, 'https://x.dev');
  assert.equal(r.byId.get('f1').text, 'X');
});
test('loadFacts throws on duplicate ids and empty text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'facts-'));
  const p = join(dir, 'facts.json');
  writeFileSync(p, JSON.stringify({ source: 's', facts: [{ id: 'f1', text: 'a', where: 'w' }, { id: 'f1', text: 'b', where: 'w' }] }));
  assert.throws(() => loadFacts(p), /duplicate/i);
  writeFileSync(p, JSON.stringify({ source: 's', facts: [{ id: 'f1', text: '  ', where: 'w' }] }));
  assert.throws(() => loadFacts(p), /empty/i);
});

test('risky tokens match whole tokens only, not substrings', () => {
  const f = (text) => new Map([['f1', { text: 'Fixture' }], ['f2', { text }]]);
  const fails = (line, text) => checkLine({ text: line, facts: ['f2'] }, f(text)).length === 1;
  assert.ok(fails('Only 1 step.', 'Builds sites 10x faster'));
  assert.ok(fails('Since 20 years.', 'Founded in 2024'));
  assert.ok(fails('Loved by Stripe.', 'Works with Stripes'));
  assert.deepEqual(checkLine({ text: 'Build sites 10x.', facts: ['f2'] }, f('Builds sites 10x faster')), []);
});
