#!/usr/bin/env node
// Opens a stage: checks that every earlier stage was opened and that the earlier stage's file is
// there, then records { name, at } in <work>/process.json. Prints one line either way.
// Usage: node kit/stage.mjs <visit|scout|direct|capture|sound|render|check|deliver> [--work <dir>] [--tool-output <dir>]
// Exit 0 open, 1 refused, 2 usage.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGES, openStage } from '../lib/process.mjs';

function main(args) {
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const stage = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  if (!stage || !STAGES.includes(stage)) {
    console.log(`usage: node kit/stage.mjs <${STAGES.join('|')}> [--work <dir>]`);
    return 2;
  }
  const r = openStage(stage, { work: opt('--work'), toolOutput: opt('--tool-output') });
  console.log(r.message);
  return r.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
