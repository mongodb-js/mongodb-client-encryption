import { execSync } from 'node:child_process';

execSync('tsc', { stdio: 'inherit' });

try {
  execSync('git config core.hooksPath .githooks', { stdio: 'inherit' });
} catch {
  // best-effort: no .git dir (installed as a dependency) or no git
}
