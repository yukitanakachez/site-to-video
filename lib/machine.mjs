// What a render or capture costs the machine it runs on (Task 13: measured on the Linux work
// machine). Machine-wide memory in use (MemTotal - MemAvailable from /proc/meminfo) is sampled,
// so Chrome's child processes count too; elsewhere only the CPU count is reported.
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';

const readMeminfo = () => { try { return readFileSync('/proc/meminfo', 'utf8'); } catch { return null; } };

export function memoryUsedMB(text) {
  const kb = (key) => Number(new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(text || '')?.[1]);
  const total = kb('MemTotal');
  const avail = kb('MemAvailable');
  if (!Number.isFinite(total) || !Number.isFinite(avail)) return null;
  return { totalMB: Math.round(total / 1024), usedMB: Math.round((total - avail) / 1024) };
}

export function memorySampler({ read = readMeminfo, everyMs = 250 } = {}) {
  const first = memoryUsedMB(read());
  let peak = first?.usedMB;
  const sample = () => { const m = memoryUsedMB(read()); if (m && !(m.usedMB <= peak)) peak = m.usedMB; };
  const timer = first && everyMs > 0 ? setInterval(sample, everyMs) : null;
  timer?.unref();
  return {
    sample,
    stop() {
      if (timer) clearInterval(timer);
      const out = { cpus: cpus().length };
      if (first) Object.assign(out, { memTotalMB: first.totalMB, memStartMB: first.usedMB, memPeakMB: peak });
      return out;
    },
  };
}
