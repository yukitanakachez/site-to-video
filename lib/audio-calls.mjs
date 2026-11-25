// Counts make-audio call records (make-audio-<action>.json) across the tool's
// call folders, e.g. /job/tool-output/<call>/make-audio-voice.json.
// The package gate uses it to enforce the per-job limits (at most 2 per action). There are no sound
// effects (spec 16.2), so a make-audio-sound.json, if one is ever present, is not counted.
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function audioCallsMade(toolOutputDir) {
  const counts = { voice: 0, music: 0 };
  if (!existsSync(toolOutputDir)) return counts;
  for (const entry of readdirSync(toolOutputDir)) {
    const dir = join(toolOutputDir, entry);
    if (!statSync(dir).isDirectory()) continue;
    for (const action of Object.keys(counts)) {
      if (existsSync(join(dir, `make-audio-${action}.json`))) counts[action] += 1;
    }
  }
  return counts;
}
