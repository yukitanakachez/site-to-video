import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryUsedMB, memorySampler } from '../lib/machine.mjs';

const meminfo = (totalKB, availKB) => `MemTotal:       ${totalKB} kB\nMemFree:         1000 kB\nMemAvailable:   ${availKB} kB\n`;

test('memoryUsedMB reads MemTotal minus MemAvailable from /proc/meminfo text', () => {
  assert.deepEqual(memoryUsedMB(meminfo(8192000, 6144000)), { totalMB: 8000, usedMB: 2000 });
});

test('memoryUsedMB is null when the text has no MemAvailable (not Linux)', () => {
  assert.equal(memoryUsedMB(''), null);
  assert.equal(memoryUsedMB(null), null);
});

test('memorySampler keeps the peak of the machine-wide memory in use', () => {
  const readings = [meminfo(8192000, 6144000), meminfo(8192000, 3072000), meminfo(8192000, 5120000)];
  let i = 0;
  const s = memorySampler({ read: () => readings[Math.min(i++, readings.length - 1)], everyMs: 0 });
  s.sample();
  s.sample();
  const { cpus, ...mem } = s.stop();
  assert.equal(typeof cpus, 'number');
  assert.deepEqual(mem, { memTotalMB: 8000, memStartMB: 2000, memPeakMB: 5000 });
});

test('memorySampler reports only the CPU count where there is no /proc/meminfo', () => {
  const s = memorySampler({ read: () => null, everyMs: 0 });
  const r = s.stop();
  assert.equal(typeof r.cpus, 'number');
  assert.equal(r.memPeakMB, undefined);
});
