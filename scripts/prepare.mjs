import { spawnSync } from 'node:child_process';

spawnSync('tsc', { stdio: 'inherit' });

try {
  spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
} catch (err) {
  // best-effort: no .git dir (installed as a dependency) or no git
  console.warn(err)
}
