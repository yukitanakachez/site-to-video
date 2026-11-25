// Where a job's files live. On Starwish the job folder is /job and the agent's
// own folder is /agent; local runs move both with DEMO_JOB_ROOT and DEMO_AGENT_ROOT.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export function jobPaths(env = process.env) {
  const job = env.DEMO_JOB_ROOT || '/job';
  const agent = env.DEMO_AGENT_ROOT || '/agent';
  return {
    job,
    input: join(job, 'input'),
    work: join(job, 'work'),
    output: join(job, 'output'),
    toolOutput: join(job, 'tool-output'),
    agent,
    kit: join(agent, 'kit'),
  };
}

export function chromePath(env = process.env, platform = process.platform) {
  if (env.CHROME_PATH) return env.CHROME_PATH;
  if (platform === 'darwin') return MAC_CHROME;
  const config = JSON.parse(readFileSync(new URL('../config/config.json', import.meta.url), 'utf8'));
  return config.chromePath;
}

// The browser Remotion downloads for rendering (`npm run setup` fetches it): chrome-headless-shell, under
// node_modules/.remotion/chrome-headless-shell/<version>/<platform>/<folder>/. Null when it is not there.
export function remotionShell(root = fileURLToPath(new URL('..', import.meta.url))) {
  const exe = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
  const base = join(root, 'node_modules', '.remotion', 'chrome-headless-shell');
  const dirs = (d) => { try { return readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse(); } catch { return []; } };
  for (const version of dirs(base)) {
    for (const platform of dirs(join(base, version))) {
      for (const folder of dirs(join(base, version, platform))) {
        const file = join(base, version, platform, folder, exe);
        if (existsSync(file)) return file;
      }
    }
  }
  return null;
}

// The browser the agent's capture and scout use: CHROME_PATH, else this system's Chrome if it is there,
// else Remotion's own browser, so a machine without Chrome still works.
export function browserPath(env = process.env, platform = process.platform) {
  const wanted = chromePath(env, platform);
  if (env.CHROME_PATH || existsSync(wanted)) return wanted;
  return remotionShell() ?? wanted;
}
