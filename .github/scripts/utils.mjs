// @ts-check

import path from "path";
import url from 'node:url';
import { spawn } from "node:child_process";
import { once } from "node:events";
import { execSync } from "child_process";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/** Resolves to the root of this repository */
export function resolveRoot(...paths) {
    return path.resolve(__dirname, '..', '..', ...paths);
}

export function getCommitFromRef(ref) {
    console.error(`resolving ref: ${ref}`);
    const script = resolveRoot('.github', 'scripts', 'get-commit-from-ref.sh');
    const output = execSync(`bash ${script}`, { env: { REF: ref }, encoding: 'utf-8' })

    const regex = /COMMIT_HASH=(?<hash>[a-zA-Z0-9]+)/
    const result = regex.exec(output);

    if (!result?.groups) throw new Error('unable to parse ref.')

    const { hash } = result.groups;

    console.error(`resolved to: ${hash}`);
    return hash;
}

export function buildLibmongocryptDownloadUrl(ref, platform) {
    // libmongocrypt 1.18.0+ is distributed via GitHub Releases (S3 release bucket restricted per MONGOCRYPT-841)
    if (ref.includes('.')) {
        return `https://github.com/mongodb/libmongocrypt/releases/download/${ref}/libmongocrypt-${platform}-${ref}.tar.gz`;
    }

    // For development refs (master, branches), fall back to S3
    const hash = getCommitFromRef(ref);
    return `https://mciuploads.s3.amazonaws.com/libmongocrypt/${platform}/master/${hash}/libmongocrypt.tar.gz`;
}

export function getLibmongocryptPrebuildName() {
    const prebuildIdentifierFactory = {
        'darwin': () => 'macos-universal',
        'win32': () => 'windows-x86_64',
        'linux': () => {
            const key = `${getLibc()}-${process.arch}`;
            return {
                ['musl-x64']: 'linux-x86_64-musl_1_2-nocrypto',
                ['musl-arm64']: 'linux-arm64-musl_1_2-nocrypto',
                ['glibc-ppc64']: 'linux-ppc64le-glibc_2_17-nocrypto',
                ['glibc-s390x']: 'linux-s390x-glibc_2_7-nocrypto',
                ['glibc-arm64']: 'linux-arm64-glibc_2_17-nocrypto',
                ['glibc-x64']: 'linux-x86_64-glibc_2_7-nocrypto',
            }[key]
        }
    }[process.platform] ?? (() => {
        throw new Error(`Unsupported platform`);
    });

    return prebuildIdentifierFactory();
}

/** `xtrace` style command runner, uses spawn so that stdio is inherited */
export async function run(command, args = [], options = {}) {
    const commandDetails = `+ ${command} ${args.join(' ')}${options.cwd ? ` (in: ${options.cwd})` : ''}`;
    console.error(commandDetails);
    const proc = spawn(command, args, {
        shell: process.platform === 'win32',
        stdio: 'inherit',
        cwd: resolveRoot('.'),
        ...options
    });
    await once(proc, 'exit');

    if (proc.exitCode != 0) throw new Error(`CRASH(${proc.exitCode}): ${commandDetails}`);
}

/**
 * @returns the libc (`musl` or `glibc`), if the platform is linux, otherwise null.
 */
function getLibc() {
    if (process.platform !== 'linux') return null;

    /**
     * Executes `ldd --version`.  on Alpine linux, `ldd` and `ldd --version` return exit code 1 and print the version
     * info to stderr, but on other platforms, `ldd --version` prints to stdout and returns exit code 0.
     *
     * So, this script works on both by return stderr if the command returns a non-zero exit code, otherwise stdout.
     */
    function lddVersion() {
        try {
            return execSync('ldd --version', { encoding: 'utf-8' });
        } catch (error) {
            return error.stderr;
        }
    }

    console.error({ ldd: lddVersion() });
    return lddVersion().includes('musl') ? 'musl' : 'glibc';
}
