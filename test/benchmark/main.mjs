/* eslint-disable no-console */
import util from 'node:util';
import process from 'node:process';
import path from 'node:path';
import child_process, { spawn } from 'node:child_process';
import events from 'node:events';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/** Resolves to the root of this repository */
function resolveRoot(...paths) {
  return path.resolve(__dirname, '..', '..', ...paths);
}

/** `xtrace` style command runner, uses spawn so that stdio is inherited */
async function run(command, args = [], options = {}) {
  const commandDetails = `+ ${command} ${args.join(' ')}${options.cwd ? ` (in: ${options.cwd})` : ''}`;
  console.error(commandDetails);
  const proc = child_process.spawn(command, args, {
    shell: process.platform === 'win32',
    stdio: 'inherit',
    cwd: resolveRoot('.'),
    ...options
  });
  await events.once(proc, 'exit');

  if (proc.exitCode !== 0) throw new Error(`CRASH(${proc.exitCode}): ${commandDetails}`);
}

function parseArguments() {
  const options = {
    help: { short: 'h', type: 'boolean', default: false }
  };

  const args = util.parseArgs({ args: process.argv.slice(2), options, allowPositionals: false });

  if (args.values.help) {
    console.log(
      `${path.basename(process.argv[1])} ${[...Object.keys(options)]
        .filter(k => k !== 'help')
        .map(k => `[--${k}=${options[k].type}]`)
        .join(' ')}`
    );
    process.exit(0);
  }

  return {};
}

async function main() {
  parseArguments();
  bench({ spawn: true });
}

await main();
