// @ts-check

import util from 'node:util';
import process from 'node:process';
import fs from 'node:fs/promises';
import child_process from 'node:child_process';
import events from 'node:events';
import path from 'node:path';
import https from 'node:https';
import stream from 'node:stream/promises';
import { buildLibmongocryptDownloadUrl, getLibmongocryptPrebuildName, resolveRoot, run } from './utils.mjs';

async function parseArguments() {
  const pkg = JSON.parse(await fs.readFile(resolveRoot('package.json'), 'utf8'));

  const options = {
    gitURL: { short: 'u', type: 'string', default: 'https://github.com/mongodb/libmongocrypt.git' },
    libVersion: { short: 'l', type: 'string', default: pkg['mongodb:libmongocrypt'] },
    clean: { short: 'c', type: 'boolean', default: false },
    build: { short: 'b', type: 'boolean', default: false },
    dynamic: { type: 'boolean', default: false },
    'skip-bindings': { type: 'boolean', default: false },
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

  return {
    url: args.values.gitURL,
    ref: args.values.libVersion,
    clean: args.values.clean,
    build: args.values.build,
    dynamic: args.values.dynamic,
    skipBindings: args.values['skip-bindings'],
    pkg
  };
}

export async function cloneLibMongoCrypt(libmongocryptRoot, { url, ref }) {
  console.error('fetching libmongocrypt...', { url, ref });
  await fs.rm(libmongocryptRoot, { recursive: true, force: true });
  await run('git', ['clone', url, libmongocryptRoot]);
  if (ref !== 'latest') {
    // Support "latest" as leaving the clone as-is so whatever the default branch name is works
    await run('git', ['fetch', '--tags'], { cwd: libmongocryptRoot });
    await run('git', ['checkout', ref, '-b', `r-${ref}`], { cwd: libmongocryptRoot });
  }
}

export async function buildLibMongoCrypt(libmongocryptRoot, nodeDepsRoot, options) {
  /** CLI flag maker: `toFlags({a: 1, b: 2})` yields `['-a=1', '-b=2']` */
  function toCLIFlags(object) {
    return Array.from(Object.entries(object)).map(([k, v]) => `-${k}=${v}`);
  }

  console.error('building libmongocrypt...');

  const nodeBuildRoot = resolveRoot(nodeDepsRoot, 'tmp', 'libmongocrypt-build');

  await fs.rm(nodeBuildRoot, { recursive: true, force: true });
  await fs.mkdir(nodeBuildRoot, { recursive: true });

  const CMAKE_FLAGS = toCLIFlags({
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
     * as an include path if libmongocrypt_link_type=static
     */
    DCMAKE_INSTALL_PREFIX: nodeDepsRoot
  });

  const WINDOWS_CMAKE_FLAGS =
    process.platform === 'win32' // Windows is still called "win32" when it is 64-bit
      ? toCLIFlags({ Thost: 'x64', A: 'x64', DENABLE_WINDOWS_STATIC_RUNTIME: 'ON' })
      : [];

  const DARWIN_CMAKE_FLAGS =
    process.platform === 'darwin' // The minimum darwin target version we want for
      ? toCLIFlags({ DCMAKE_OSX_DEPLOYMENT_TARGET: '10.12' })
      : [];

  const cmakeProgram = process.platform === 'win32' ? 'cmake.exe' : 'cmake';

  await run(
    cmakeProgram,
    [...CMAKE_FLAGS, ...WINDOWS_CMAKE_FLAGS, ...DARWIN_CMAKE_FLAGS, libmongocryptRoot],
    { cwd: nodeBuildRoot, shell: process.platform === 'win32' }
  );

  await run(cmakeProgram, ['--build', '.', '--target', 'install', '--config', 'RelWithDebInfo'], {
    cwd: nodeBuildRoot,
    shell: process.platform === 'win32'
  });
}

export async function downloadLibMongoCrypt(nodeDepsRoot, { ref }) {
  const prebuild = getLibmongocryptPrebuildName();

  const downloadURL = buildLibmongocryptDownloadUrl(ref, prebuild);

  console.error('downloading libmongocrypt...', downloadURL);
  const destination = resolveRoot(`_libmongocrypt-${ref}`);

  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination);

  const downloadDestination = `nocrypto`;
  const unzipArgs = ['-xzv', '-C', `_libmongocrypt-${ref}`, downloadDestination];
  console.error(`+ tar ${unzipArgs.join(' ')}`);
  const unzip = child_process.spawn('tar', unzipArgs, {
    stdio: ['pipe', 'inherit', 'pipe'],
    cwd: resolveRoot('.')
  });
  if (unzip.stdin == null) throw new Error('Tar process must have piped stdin');

  const [response] = await events.once(https.get(downloadURL), 'response');

  const start = performance.now();

  try {
    await stream.pipeline(response, unzip.stdin);
  } catch {
    await fs.access(path.join(`_libmongocrypt-${ref}`, downloadDestination));
  }

  const end = performance.now();

  console.error(`downloaded libmongocrypt in ${(end - start) / 1000} secs...`);

  await fs.rm(nodeDepsRoot, { recursive: true, force: true });
  await fs.cp(resolveRoot(destination, 'nocrypto'), nodeDepsRoot, { recursive: true });
  const potentialLib64Path = path.join(nodeDepsRoot, 'lib64');
  try {
    await fs.rename(potentialLib64Path, path.join(nodeDepsRoot, 'lib'));
  } catch (error) {
    await fs.access(path.join(nodeDepsRoot, 'lib')); // Ensure there is a "lib" directory
  }
}

async function buildBindings(args, pkg) {
  await fs.rm(resolveRoot('build'), { force: true, recursive: true });
  await fs.rm(resolveRoot('prebuilds'), { force: true, recursive: true });

  // install with "ignore-scripts" so that we don't attempt to download a prebuild
  await run('npm', ['install', '--ignore-scripts']);
  // The prebuild command will make both a .node file in `./build` (local and CI testing will run on current code)
  // it will also produce `./prebuilds/mongodb-client-encryption-vVERSION-napi-vNAPI_VERSION-OS-ARCH.tar.gz`.

  let gypDefines = process.env.GYP_DEFINES ?? '';
  if (args.dynamic) {
    gypDefines += ' libmongocrypt_link_type=dynamic';
  }

  gypDefines = gypDefines.trim();
  const prebuildOptions =
    gypDefines.length > 0
      ? { env: { ...process.env, GYP_DEFINES: gypDefines } }
      : undefined;

  await run('npm', ['run', 'prebuild'], prebuildOptions);
  // Compile Typescript
  await run('npm', ['run', 'prepare']);

  if (process.platform === 'darwin' && process.arch === 'arm64') {
    // The "arm64" build is actually a universal binary
    const armTar = `mongodb-client-encryption-v${pkg.version}-napi-v4-darwin-arm64.tar.gz`;
    const x64Tar = `mongodb-client-encryption-v${pkg.version}-napi-v4-darwin-x64.tar.gz`;
    await fs.copyFile(resolveRoot('prebuilds', armTar), resolveRoot('prebuilds', x64Tar));
  }
}

async function main() {
  const { pkg, ...args } = await parseArguments();
  console.log(args);

  const nodeDepsDir = resolveRoot('deps');

  if (args.build && !args.dynamic) {
    const libmongocryptCloneDir = resolveRoot('_libmongocrypt');

    const currentLibMongoCryptBranch = await fs
      .readFile(path.join(libmongocryptCloneDir, '.git', 'HEAD'), 'utf8')
      .catch(() => '');
    const isClonedAndCheckedOut = currentLibMongoCryptBranch.trim().endsWith(`r-${args.ref}`);

    if (args.clean || !isClonedAndCheckedOut) {
      await cloneLibMongoCrypt(libmongocryptCloneDir, args);
    }

    const libmongocryptBuiltVersion = await fs
      .readFile(path.join(libmongocryptCloneDir, 'VERSION_CURRENT'), 'utf8')
      .catch(() => '');
    const isBuilt = libmongocryptBuiltVersion.trim() === args.ref;

    if (args.clean || !isBuilt) {
      await buildLibMongoCrypt(libmongocryptCloneDir, nodeDepsDir, args);
    }
  } else if (!args.dynamic) {
    // Download
    await downloadLibMongoCrypt(nodeDepsDir, args);
  }

  if (!args.skipBindings) {
    await buildBindings(args, pkg);
  }
}

await main();
