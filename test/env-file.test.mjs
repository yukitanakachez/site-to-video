import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jobEnv, lastFour, parseEnv, readEnvFile, writeEnvKeys } from '../lib/env-file.mjs';

const file = () => join(mkdtempSync(join(tmpdir(), 's2v-env-')), '.env.local');

test('parseEnv reads plain, exported and quoted lines and skips comments', () => {
  assert.deepEqual(parseEnv('# c\nA_B=1\nexport C=two\nD="three"\nE=\'four\'\nnot a line\n'), { A_B: '1', C: 'two', D: 'three', E: 'four' });
});

test('writeEnvKeys creates a private file, replaces a key and keeps other lines', () => {
  const f = file();
  writeFileSync(f, 'CHROME_PATH=/x/chrome\nELEVENLABS_API_KEY=old\n');
  writeEnvKeys({ ELEVENLABS_API_KEY: 'newkey123', ANTHROPIC_API_KEY: 'sk-ant-abc12345' }, f);
  assert.deepEqual(readEnvFile(f), { CHROME_PATH: '/x/chrome', ELEVENLABS_API_KEY: 'newkey123', ANTHROPIC_API_KEY: 'sk-ant-abc12345' });
  assert.equal(statSync(f).mode & 0o777, 0o600);
  writeEnvKeys({ ANTHROPIC_API_KEY: null }, f);
  assert.equal(readFileSync(f, 'utf8'), 'CHROME_PATH=/x/chrome\nELEVENLABS_API_KEY=newkey123\n');
});

test('writeEnvKeys refuses an unknown name and a value with shell characters', () => {
  const f = file();
  assert.throws(() => writeEnvKeys({ PATH: 'x' }, f), /unknown key/);
  assert.throws(() => writeEnvKeys({ ELEVENLABS_API_KEY: 'a b' }, f), /characters/);
  assert.throws(() => writeEnvKeys({ ELEVENLABS_API_KEY: '$(x)' }, f), /characters/);
});

test('jobEnv lets the shell win and the file fill the gaps', () => {
  const f = file();
  writeFileSync(f, 'ELEVENLABS_API_KEY=fromfile\nANTHROPIC_API_KEY=fileanthropic\n');
  const env = jobEnv({ ELEVENLABS_API_KEY: 'fromshell', OTHER: '1' }, f);
  assert.equal(env.ELEVENLABS_API_KEY, 'fromshell');
  assert.equal(env.ANTHROPIC_API_KEY, 'fileanthropic');
  assert.equal(env.OTHER, '1');
});

test('lastFour shows only the end of a key', () => {
  assert.equal(lastFour('abcdefgh1234'), '…1234');
  assert.equal(lastFour(undefined), null);
});
