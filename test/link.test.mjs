import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLink, isPrivateAddress, URL_PATTERN } from '../lib/link.mjs';

const pub = async () => [{ address: '93.184.216.34', family: 4 }];

test('URL_PATTERN accepts web links only', () => {
  const re = new RegExp(URL_PATTERN);
  assert.equal(re.test('https://example.com/a?b=1'), true);
  assert.equal(re.test('ftp://example.com'), false);
  assert.equal(re.test('https://exa mple.com'), false);
});
test('github repo links are classified', async () => {
  for (const u of ['https://github.com/sharkdp/hyperfine', 'https://github.com/sharkdp/hyperfine/', 'https://github.com/sharkdp/hyperfine/tree/master/doc', 'https://github.com/sharkdp/hyperfine.git'])
    assert.deepEqual(await checkLink(u, { resolve: pub }), { ok: true, url: 'https://github.com/sharkdp/hyperfine', kind: 'github-repo', owner: 'sharkdp', repo: 'hyperfine' });
});
test('other github pages and ordinary sites are web', async () => {
  assert.equal((await checkLink('https://github.com/features', { resolve: pub })).kind, 'web');
  assert.equal((await checkLink('https://github.com/sharkdp', { resolve: pub })).kind, 'web');
  assert.equal((await checkLink('https://example.com/pricing', { resolve: pub })).kind, 'web');
});
test('only http and https', async () => {
  for (const u of ['file:///etc/passwd', 'javascript:alert(1)', 'ftp://x.com', 'data:text/html,hi', 'not a url'])
    assert.equal((await checkLink(u, { resolve: pub })).ok, false);
});
test('credentials in the link and non-web ports are refused', async () => {
  assert.equal((await checkLink('https://user:pw@example.com', { resolve: pub })).ok, false);
  assert.equal((await checkLink('https://example.com:8443/', { resolve: pub })).ok, false);
  assert.equal((await checkLink('https://example.com:443/', { resolve: pub })).ok, true);
});
test('private, loopback and link-local addresses are refused', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1'])
    assert.equal(isPrivateAddress(ip), true, ip);
  assert.equal((await checkLink('http://localhost/', { resolve: async () => [{ address: '127.0.0.1', family: 4 }] })).ok, false);
  assert.equal((await checkLink('http://a.example/', { resolve: async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }] })).ok, false);
});
test('172.32.0.1 and 8.8.8.8 are public', () => { assert.equal(isPrivateAddress('172.32.0.1'), false); assert.equal(isPrivateAddress('8.8.8.8'), false); });
test('an unresolvable host is refused with a reason', async () => {
  const r = await checkLink('https://nope.invalid/', { resolve: async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); } });
  assert.equal(r.ok, false); assert.match(r.reason, /could not be found/);
});
