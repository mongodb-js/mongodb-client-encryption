import util from 'node:util';
import process from 'node:process';
import fs from 'node:fs/promises';
import child_process from 'node:child_process';
import events from 'node:events';
import path from 'node:path';
import https from 'node:https';
import stream from 'node:stream/promises';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/** Resolves to the root of this repository */
function resolveRoot(...paths) {
  return path.resolve(__dirname, '..', '..', ...paths);
}

async function exists(fsPath) {
  try {
    await fs.access(fsPath);
    return true;
  } catch {
    return false;
  }
}

async function parseArguments() {
  const pkg = JSON.parse(await fs.readFile(resolveRoot('package.json'), 'utf8'));

  const options = {
    gitURL: { short: 'u', type: 'string', default: 'https://github.com/mongodb/libmongocrypt.git' },
    libVersion: { short: 'l', type: 'string', default: pkg['mongodb:libmongocrypt'] },
    clean: { short: 'c', type: 'boolean', default: false },
    build: { short: 'b', type: 'boolean', default: false },
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
    libmongocrypt: { url: args.values.gitURL, ref: args.values.libVersion },
    clean: args.values.clean,
    build: args.values.build
  };
}

/** `xtrace` style command runner, uses spawn so that stdio is inherited */
async function run(command, args = [], options = {}) {
  console.error(`+ ${command} ${args.join(' ')}`, options.cwd ? `(in: ${options.cwd})` : '');
  await events.once(
    child_process.spawn(command, args, { stdio: 'inherit', cwd: resolveRoot('.'), ...options }),
    'exit'
  );
}

/** CLI flag maker: `toFlags({a: 1, b: 2})` yields `['-a=1', '-b=2']` */
function toFlags(object) {
  return Array.from(Object.entries(object)).map(([k, v]) => `-${k}=${v}`);
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

export async function buildLibMongoCrypt(libmongocryptRoot, nodeDepsRoot) {
  console.error('building libmongocrypt...');

  const nodeBuildRoot = resolveRoot(nodeDepsRoot, 'tmp', 'libmongocrypt-build');

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

  await run(
    'cmake',
    [...CMAKE_FLAGS, ...WINDOWS_CMAKE_FLAGS, ...MACOS_CMAKE_FLAGS, libmongocryptRoot],
    { cwd: nodeBuildRoot }
  );
  await run('cmake', ['--build', '.', '--target', 'install', '--config', 'RelWithDebInfo'], {
    cwd: nodeBuildRoot
  });
}

export async function downloadLibMongoCrypt(nodeDepsRoot, { ref }) {
  const downloadURL =
    ref === 'latest'
      ? 'https://mciuploads.s3.amazonaws.com/libmongocrypt/all/master/latest/libmongocrypt-all.tar.gz'
      : `https://mciuploads.s3.amazonaws.com/libmongocrypt/all/${ref}/libmongocrypt-all.tar.gz`;

  console.error('downloading libmongocrypt...', downloadURL);
  const destination = resolveRoot(`_libmongocrypt-${ref}`);

  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination);

  const platformMatrix = {
    ['darwin-arm64']: 'macos',
    ['darwin-x64']: 'macos',
    ['linux-ppc64']: 'rhel-71-ppc64el',
    ['linux-s390x']: 'rhel72-zseries-test',
    ['linux-arm64']: 'ubuntu1804-arm64',
    ['linux-x64']: 'rhel-70-64-bit',
    ['win32-x64']: 'windows-test'
  };

  const detectedPlatform = `${process.platform}-${process.arch}`;
  const prebuild = platformMatrix[detectedPlatform];
  if (prebuild == null) throw new Error(`Unsupported: ${detectedPlatform}`);

  console.error(`Platform: ${detectedPlatform} Prebuild: ${prebuild}`);

  const unzipArgs = ['-xzv', '-C', destination, `${prebuild}/nocrypto`];
  console.error(`+ tar ${unzipArgs.join(' ')}`);
  const unzip = child_process.spawn('tar', unzipArgs, { stdio: ['pipe', 'inherit'] });

  const [response] = await events.once(https.get(downloadURL), 'response');

  const start = performance.now();
  await stream.pipeline(response, unzip.stdin);
  const end = performance.now();

  console.error(`downloaded libmongocrypt in ${(end - start) / 1000} secs...`);

  await fs.rm(nodeDepsRoot, { recursive: true, force: true });
  await fs.cp(resolveRoot(destination, prebuild, 'nocrypto'), nodeDepsRoot, { recursive: true });
  if (await exists(path.join(nodeDepsRoot, 'lib64'))) {
    await fs.rename(path.join(nodeDepsRoot, 'lib64'), path.join(nodeDepsRoot, 'lib'));
  }
}

async function main() {
  const { libmongocrypt, build, clean } = await parseArguments();

  const nodeDepsDir = resolveRoot('deps');

  if (build) {
    const libmongocryptCloneDir = resolveRoot('_libmongocrypt');

    const currentLibMongoCryptBranch = await fs
      .readFile(path.join(libmongocryptCloneDir, '.git', 'HEAD'), 'utf8')
      .catch(() => '');
    const isClonedAndCheckedOut = currentLibMongoCryptBranch
      .trim()
      .endsWith(`r-${libmongocrypt.ref}`);

    if (clean || !isClonedAndCheckedOut) {
      await cloneLibMongoCrypt(libmongocryptCloneDir, libmongocrypt);
    }

    const libmongocryptBuiltVersion = await fs
      .readFile(path.join(libmongocryptCloneDir, 'VERSION_CURRENT'), 'utf8')
      .catch(() => '');
    const isBuilt = libmongocryptBuiltVersion.trim() === libmongocrypt.ref;

    if (clean || !isBuilt) {
      await buildLibMongoCrypt(libmongocryptCloneDir, nodeDepsDir);
    }
  } else {
    // Download
    await downloadLibMongoCrypt(nodeDepsDir, libmongocrypt);
  }

  await fs.rm(resolveRoot('build'), { force: true, recursive: true });
  await fs.rm(resolveRoot('prebuilds'), { force: true, recursive: true });

  // install with "ignore-scripts" so that we don't attempt to download a prebuild
  await run('npm', ['install', '--ignore-scripts']);
  // The prebuild command will make both a .node file in `./build` (local and CI testing will run on current code)
  // it will also produce `./prebuild/xx.tgz`. prebuild has GH upload functionality.
  await run('npm', ['run', 'prebuild']);
}

await main();
