// @ts-check

import util from 'node:util';
import process from 'node:process';
import fs, { readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  buildLibmongocryptDownloadUrl,
  getLibmongocryptPrebuildName,
  resolveRoot,
  run
} from './utils.mjs';

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
     * We provide crypto hooks from Node.js binding to openssl (so disable **system** crypto)
     *
     * Node.js ships with openssl statically compiled into the runtime.
     * We provide hooks to libmongocrypt that uses Node.js copy of openssl
     * instead of the operating system's copy so we build without linking to the system crypto.
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
    process.platform === 'win32'
      ? toCLIFlags({
        // Tell CMake that binaries should link with the static MSVC runtime instead of
        // the default dynamic one.
        DCMAKE_MSVC_RUNTIME_LIBRARY: 'MultiThreaded',
        // Tell CMake to use the MSVC 64-bit compiler toolchain
        T: 'host=x64',
        // Tell CMake to generate a 64-bit binaries
        A: 'x64',
      })
      : [];

  // macOS builds libmongocrypt from source so that it uses the crypto hooks we provide from
  // Node.js' copy of OpenSSL. The published libmongocrypt artifacts are built against native
  // crypto, which is why we compile our own here.
  //
  // The addon itself is a universal binary (see the OTHER_CFLAGS/OTHER_LDFLAGS in binding.gyp),
  // so libmongocrypt has to cover both architectures too. cmake targets only the host
  // architecture unless CMAKE_OSX_ARCHITECTURES says otherwise.
  const DARWIN_CMAKE_FLAGS =
    process.platform === 'darwin' // The minimum darwin target version we want for
      ? toCLIFlags({
        DCMAKE_OSX_DEPLOYMENT_TARGET: '10.12',
        DCMAKE_OSX_ARCHITECTURES: 'x86_64;arm64'
      })
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

  if (process.platform === 'darwin') {
    await checkUniversalArchives(nodeDepsRoot);
  }
}

const DARWIN_ARCHITECTURES = ['x86_64', 'arm64'];

/**
 * Linking the addon against an archive that lacks one of the architectures is not an error: ld
 * skips the archive with a warning, and the symbols it should have provided go missing from that
 * slice of the addon. Check here so the problem is reported where it starts.
 */
async function checkUniversalArchives(nodeDepsRoot) {
  const libDir = resolveRoot(nodeDepsRoot, 'lib');
  const archives = (await fs.readdir(libDir)).filter(name => name.endsWith('.a'));

  if (archives.length === 0) {
    throw new Error(`no static archives found in ${libDir}`);
  }

  for (const archive of archives) {
    const archivePath = path.join(libDir, archive);
    const archs = execSync(`lipo -archs "${archivePath}"`, { encoding: 'utf8' }).trim().split(/\s+/);
    const missing = DARWIN_ARCHITECTURES.filter(arch => !archs.includes(arch));

    if (missing.length > 0) {
      throw new Error(
        `${archive} is missing ${missing.join(', ')}. libmongocrypt must cover ${DARWIN_ARCHITECTURES.join(' and ')}, got: ${archs.join(' ')}`
      );
    }
  }

  console.error(`libmongocrypt archives cover ${DARWIN_ARCHITECTURES.join(' and ')}`);
}

/**
 * A bundle is allowed to have undefined symbols, which are looked up in the flat namespace when
 * the addon is loaded. libmongocrypt is linked statically, so anything left undefined here means
 * the link silently dropped it and loading the addon will fail with ERR_DLOPEN_FAILED.
 */
function checkAddonSymbols(addonPath) {
  for (const arch of DARWIN_ARCHITECTURES) {
    const output = execSync(`nm -arch ${arch} -u "${addonPath}"`, { encoding: 'utf8' });
    const undefinedSymbols = output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.includes('mongocrypt'));

    if (undefinedSymbols.length > 0) {
      throw new Error(
        `${undefinedSymbols.length} undefined libmongocrypt symbols in the ${arch} slice of ${addonPath}, starting with ${undefinedSymbols[0]}`
      );
    }
  }

  console.error(`addon has no undefined libmongocrypt symbols in either architecture`);
}

async function verifySignature(tarballPath, ref, prebuild) {
  const ascURL = `https://github.com/mongodb/libmongocrypt/releases/download/${ref}/libmongocrypt-${prebuild}-${ref}.asc`;
  const pubKeyURL = 'https://pgp.mongodb.com/libmongocrypt.pub';
  const ascPath = `${tarballPath}.asc`;
  const pubKeyPath = path.join(path.dirname(tarballPath), 'libmongocrypt.pub');

  console.error('verifying libmongocrypt signature...');

  try {
    const [ascResponse, pubKeyResponse] = await Promise.all([fetch(ascURL), fetch(pubKeyURL)]);
    if (!ascResponse.ok) throw new Error(`HTTP ${ascResponse.status} downloading ${ascURL}`);
    if (!pubKeyResponse.ok) throw new Error(`HTTP ${pubKeyResponse.status} downloading ${pubKeyURL}`);

    await Promise.all([
      fs.writeFile(ascPath, Buffer.from(await ascResponse.arrayBuffer())),
      fs.writeFile(pubKeyPath, Buffer.from(await pubKeyResponse.arrayBuffer()))
    ]);

    await run('gpg', ['--import', pubKeyPath]);
    await run('gpg', ['--verify', ascPath, tarballPath]);
  } finally {
    await Promise.all([fs.rm(ascPath, { force: true }), fs.rm(pubKeyPath, { force: true })]);
  }

  console.error('libmongocrypt signature verified');
}

export async function downloadLibMongoCrypt(nodeDepsRoot, { ref }) {
  const prebuild = getLibmongocryptPrebuildName();
  const downloadURL = buildLibmongocryptDownloadUrl(ref, prebuild);

  console.error('downloading libmongocrypt...', downloadURL);

  const destination = resolveRoot(`_libmongocrypt-${ref}`);
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination);

  const tarballPath = resolveRoot(`_libmongocrypt-${ref}.tar.gz`);

  const response = await fetch(downloadURL);
  if (!response.ok) throw new Error(`HTTP ${response.status} downloading ${downloadURL}`);

  const start = performance.now();

  await pipeline(Readable.fromWeb(response.body), createWriteStream(tarballPath));

  // Verify GPG signature for GitHub releases (release refs contain '.')
  if (ref.includes('.')) {
    await verifySignature(tarballPath, ref, prebuild);
  }

  const unzip = spawn('tar', ['-xzv', '-C', destination, '-f', tarballPath], { stdio: ['ignore', 'inherit', 'inherit'] });
  await once(unzip, 'exit');

  if (unzip.exitCode !== 0) throw new Error(`tar exited with code ${unzip.exitCode}`);

  await fs.rm(tarballPath, { force: true });

  const end = performance.now();
  console.error(`downloaded libmongocrypt in ${(end - start) / 1000} secs...`);

  await fs.rm(nodeDepsRoot, { recursive: true, force: true });
  await fs.cp(destination, nodeDepsRoot, { recursive: true });

  const potentialLib64Path = path.join(nodeDepsRoot, 'lib64');
  try {
    await fs.rename(potentialLib64Path, path.join(nodeDepsRoot, 'lib'));
  } catch {
    await fs.access(path.join(nodeDepsRoot, 'lib'));
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
    gypDefines.length > 0 ? { env: { ...process.env, GYP_DEFINES: gypDefines } } : undefined;

  await run('npm', ['run', 'prebuild'], prebuildOptions);
  // Compile Typescript
  await run('npm', ['run', 'prepare']);

  if (process.platform === 'darwin' && process.arch === 'arm64' && !args.dynamic) {
    const addonPath = resolveRoot('build', 'Release', 'mongocrypt.node');

    const archs = execSync(`lipo -archs "${addonPath}"`, { encoding: 'utf8' }).trim().split(/\s+/);
    const missing = DARWIN_ARCHITECTURES.filter(arch => !archs.includes(arch));
    if (missing.length > 0) {
      throw new Error(
        `the addon is missing ${missing.join(', ')}, so it cannot be published as darwin-x64. Got: ${archs.join(' ')}`
      );
    }

    checkAddonSymbols(addonPath);

    // @ts-ignore
    const {
      binary: {
        napi_versions: [
          napiVersion
        ]
      }
    } = JSON.parse(await readFile(resolveRoot('package.json'), 'utf-8'));
    // The "arm64" build is a universal binary, so it serves as the x64 prebuild as well
    const armTar = `mongodb-client-encryption-v${pkg.version}-napi-v${napiVersion}-darwin-arm64.tar.gz`;
    const x64Tar = `mongodb-client-encryption-v${pkg.version}-napi-v${napiVersion}-darwin-x64.tar.gz`;
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
