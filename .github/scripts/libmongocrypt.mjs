import util from 'node:util';
import process from 'node:process';
import fs from 'node:fs/promises';
import child_process from 'node:child_process';
import events from 'node:events';
import path from 'node:path';

async function parseArguments() {
  const jsonImport = { [process.version.split('.').at(0) === 'v16' ? 'assert' : 'with']: { type: 'json' } };
  const pkg = (await import('../../package.json', jsonImport)).default;
  const libmongocryptVersion = pkg['mongodb:libmongocrypt'];

  const options = {
    url: { short: 'u', type: 'string', default: 'https://github.com/mongodb/libmongocrypt.git' },
    libversion: { short: 'l', type: 'string', default: libmongocryptVersion },
    clean: { short: 'c', type: 'boolean' },
    help: { short: 'h', type: 'boolean' }
  };

  const args = util.parseArgs({ args: process.argv.slice(2), options, allowPositionals: false });

  if (args.values.help) {
    console.log(
      `${process.argv[1]} ${[...Object.keys(options)]
        .filter(k => k !== 'help')
        .map(k => `[--${k}=${options[k].type}]`)
        .join(' ')}`
    );
    process.exit(0);
  }

  return {
    libmongocrypt: { url: args.values.url, ref: args.values.libversion },
    clean: args.values.clean
  };
}

/** `xtrace` style command runner, uses spawn so that stdio is inherited */
async function run(command, args = [], options = {}) {
  console.error(`+ ${command} ${args.join(' ')}`, options.cwd ? `(in: ${options.cwd})` : '');
  await events.once(child_process.spawn(command, args, { stdio: 'inherit', ...options }), 'exit');
}

/** CLI flag maker: `toFlags({a: 1, b: 2})` yields `['-a=1', '-b=2']` */
function toFlags(object) {
  return Array.from(Object.entries(object)).map(([k, v]) => `-${k}=${v}`);
}

const args = await parseArguments();
const libmongocryptRoot = path.resolve('_libmongocrypt');

const currentLibMongoCryptBranch = await fs.readFile(path.join(libmongocryptRoot, '.git', 'HEAD'), 'utf8').catch(() => '')
const libmongocryptAlreadyClonedAndCheckedOut = currentLibMongoCryptBranch.trim().endsWith(`r-${args.libmongocrypt.ref}`);

if (args.clean || !libmongocryptAlreadyClonedAndCheckedOut) {
  console.error('fetching libmongocrypt...', args.libmongocrypt);
  await fs.rm(libmongocryptRoot, { recursive: true, force: true });
  await run('git', ['clone', args.libmongocrypt.url, libmongocryptRoot]);
  await run('git', ['fetch', '--tags'], { cwd: libmongocryptRoot });
  await run('git', ['checkout', args.libmongocrypt.ref, '-b', `r-${args.libmongocrypt.ref}`], { cwd: libmongocryptRoot });
} else {
  console.error('libmongocrypt already up to date...', args.libmongocrypt);
}

const libmongocryptBuiltVersion = await fs.readFile(path.join(libmongocryptRoot, 'VERSION_CURRENT'), 'utf8').catch(() => '');
const libmongocryptAlreadyBuilt = libmongocryptBuiltVersion.trim() === args.libmongocrypt.ref;

if (args.clean || !libmongocryptAlreadyBuilt) {
  console.error('building libmongocrypt...\n', args);

  const nodeDepsRoot = path.resolve('deps');
  const nodeBuildRoot = path.resolve(nodeDepsRoot, 'tmp', 'libmongocrypt-build');

  await fs.rm(nodeBuildRoot, { recursive: true, force: true });
  await fs.mkdir(nodeBuildRoot, { recursive: true });

  const CMAKE_FLAGS = toFlags({
    /**
     * We provide crypto hooks from Node.js binding to openssl (so disable system crypto)
     * TODO: NODE-5455
     *
     * One thing that is not obvious from the build instructions for libmongocrypt
     * and the Node.js bindings is that the Node.js driver uses libmongocrypt in
     * DISABLE_NATIVE_CRYPTO aka nocrypto mode, that is, instead of using native
     * system libraries for crypto operations, it provides callbacks to libmongocrypt
     * which, in the Node.js addon case, call JS functions that in turn call built-in
     * Node.js crypto methods.
     *
     * That’s way more convoluted than it needs to be, considering that we always
     * have a copy of OpenSSL available directly, but for now it seems to make sense
     * to stick with what the Node.js addon does here.
     */
    DDISABLE_NATIVE_CRYPTO: '1',
    /** A consistent name for the output "library" directory */
    DCMAKE_INSTALL_LIBDIR: 'lib',
    /** No warnings allowed */
    DENABLE_MORE_WARNINGS_AS_ERRORS: 'ON',
    /** Where to build libmongocrypt */
    DCMAKE_PREFIX_PATH: nodeDepsRoot,
    /**
     * Where to install libmongocrypt
     * Note that `binding.gyp` will set `./deps/include`
     * as an include path if BUILD_TYPE=static
     */
    DCMAKE_INSTALL_PREFIX: nodeDepsRoot
  });

  const WINDOWS_CMAKE_FLAGS =
    process.platform === 'win32' // Windows is still called "win32" when it is 64-bit
      ? toFlags({ Thost: 'x64', A: 'x64', DENABLE_WINDOWS_STATIC_RUNTIME: 'ON' })
      : [];

  const MACOS_CMAKE_FLAGS =
    process.platform === 'darwin' // The minimum macos target version we want for
      ? toFlags({ DCMAKE_OSX_DEPLOYMENT_TARGET: '10.12' })
      : [];

  await run('cmake', [...CMAKE_FLAGS, ...WINDOWS_CMAKE_FLAGS, ...MACOS_CMAKE_FLAGS, libmongocryptRoot], { cwd: nodeBuildRoot });
  await run('cmake', ['--build', '.', '--target', 'install', '--config', 'RelWithDebInfo'], { cwd: nodeBuildRoot });
} else {
  console.error('libmongocrypt already built...');
}

await run('npm', ['install', '--ignore-scripts']);
await run('npm', ['run', 'rebuild'], { env: { ...process.env, BUILD_TYPE: 'static' } });
