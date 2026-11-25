// Link safety and link kind: only public http(s) links, classified as a GitHub repo or a web page.
import dns from 'node:dns/promises';
import net from 'node:net';

export const URL_PATTERN = '^https?://\\S+$';

const RESERVED_GITHUB = new Set(['features', 'about', 'pricing', 'topics', 'orgs', 'marketplace', 'sponsors', 'settings', 'login', 'explore', 'collections', 'trending', 'enterprise', 'site']);

const defaultResolve = (host) => dns.lookup(host, { all: true });

function isPrivateV4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224; // multicast, reserved, broadcast
}

export function isPrivateAddress(ip) {
  const addr = String(ip).replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  const family = net.isIP(addr);
  if (family === 4) return isPrivateV4(addr);
  if (family !== 6) return true; // not an address we can vouch for
  // IPv4-mapped (::ffff:a.b.c.d or ::ffff:7f00:1)
  const dotted = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateV4(dotted[1]);
  const hex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
    return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (addr === '::' || addr === '::1') return true;
  const first = parseInt(addr.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00; // multicast
}

function githubRepo(u) {
  if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
  const [owner, rawRepo] = u.pathname.split('/').filter(Boolean);
  if (!owner || !rawRepo || RESERVED_GITHUB.has(owner.toLowerCase())) return null;
  const repo = rawRepo.replace(/\.git$/, '');
  return repo ? { owner, repo } : null;
}

export async function checkLink(url, { resolve = defaultResolve } = {}) {
  let u;
  try { u = new URL(String(url).trim()); } catch { return { ok: false, reason: 'That is not a valid link.' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'Only http and https links can be filmed.' };
  if (u.username || u.password) return { ok: false, reason: 'Links with a username or password in them are not accepted.' };
  if (u.port && u.port !== '80' && u.port !== '443') return { ok: false, reason: 'Only the standard web ports (80 and 443) are accepted.' };

  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try { addresses = await resolve(host); } catch {
    return { ok: false, reason: `The host ${host} could not be found.` };
  }
  if (!Array.isArray(addresses) || addresses.length === 0) return { ok: false, reason: `The host ${host} could not be found.` };
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    return { ok: false, reason: 'That link points to a private or local network address, which is not allowed.' };
  }

  const gh = githubRepo(u);
  if (gh) return { ok: true, url: `https://github.com/${gh.owner}/${gh.repo}`, kind: 'github-repo', owner: gh.owner, repo: gh.repo };
  return { ok: true, url: u.href, kind: 'web' };
}
