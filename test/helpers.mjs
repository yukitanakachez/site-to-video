// A static server on 127.0.0.1 for the scout tests, plus a PNG width reader.
// FIXTURE_PACE: the pace the fixture shot lists are written for (their plan-seconds are output x 1.3).
// Tests pass it explicitly, so a different pace in config/config.json does not break them.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

export const FIXTURE_PACE = 1.3;

const PAGES = new URL('./fixtures/pages/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8' };

export async function startServer() {
  const clicked = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__clicked') { clicked.push(u.searchParams.get('b')); res.end('ok'); return; }
    if (u.pathname === '/redirect302') { res.writeHead(302, { location: 'http://10.255.255.1/' }); res.end(); return; }
    if (u.pathname === '/r302') { res.writeHead(302, { location: '/status404' }); res.end(); return; }
    // A fine page that reloads itself into an error after a moment.
    if (u.pathname === '/selfbreak') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><title>ok</title><p>${'Plenty of readable words on this page before it breaks. '.repeat(6)}</p><script>setTimeout(() => location.href = '/status404', 700)</script>`);
      return;
    }
    // An error page with plenty of readable text, like Cloudflare's 522 page (Task 13 run r1).
    const status = u.pathname.match(/^\/status(\d{3})$/);
    if (status) {
      res.writeHead(Number(status[1]), { 'content-type': 'text/html' });
      res.end(`<!doctype html><title>Connection timed out</title><h1>Error ${status[1]}</h1>`
        + `<p>${'The web server is not returning a connection, so this page cannot be displayed right now. '.repeat(4)}</p>`);
      return;
    }
    const name = u.pathname === '/' ? 'landing.html' : u.pathname.slice(1);
    const file = join(PAGES, name);
    if (!name.includes('/') && existsSync(file)) {
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'text/plain' });
      res.end(readFileSync(file));
      return;
    }
    // Same-site links such as /playground and /pricing just need to exist.
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>stub</title>stub');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    clicked,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  };
}

export function pngSize(file) {
  const b = readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}
export const pngWidth = (file) => pngSize(file).width;
