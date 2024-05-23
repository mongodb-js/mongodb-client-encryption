import child_process from 'node:child_process';
import events from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/** Resolves to the root of this repository */
function resolveRoot(...paths) {
  return path.resolve(__dirname, '..', '..', ...paths);
}

/** `xtrace` style command runner, uses spawn so that stdio is inherited */
async function run(command, args = [], options = {}) {
    const commandDetails = `+ ${command} ${args.join(' ')}${options.cwd ? ` (in: ${options.cwd})` : ''}`
  console.error(commandDetails);
  const proc = child_process.spawn(command, args, {
    stdio: 'inherit',
    cwd: resolveRoot('.'),
    ...options
  });
  await events.once(proc, 'exit');

  if (proc.exitCode != 0) throw new Error(`CRASH(${proc.exitCode}): ${commandDetails}`);
}

async function main() {
  await fs.rm(resolveRoot('build'), { recursive: true, force: true });
  await fs.rm(resolveRoot('prebuilds'), { recursive: true, force: true });

  try {
    // Locally you probably already have this
    await run('docker', ['buildx', 'use', 'builder']);
  } catch {
    // But if not, create one
    await run('docker', ['buildx', 'create', '--name', 'builder', '--bootstrap', '--use']);
  }

  await run('docker', [
    'buildx',
    'build',
    // '--progress=plain', // By default buildx detects tty and does some fancy collapsing, set progress=plain for debugging
    '--platform',
    'linux/s390x,linux/arm64,linux/amd64',
    '--output',
    'type=local,dest=./prebuilds,platform-split=false',
    '-f',
    resolveRoot('./.github/docker/Dockerfile.glibc'),
    resolveRoot('.')
  ]);

  /**
   * Running locally and want a fresh start?
   *
   * docker buildx prune --force
   * docker buildx rm builder
   */
}

await main();
