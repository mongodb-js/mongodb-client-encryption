// @ts-check

import { execSync } from "child_process";
import path from "path";
import url from 'node:url';
import { spawn } from "node:child_process";
import { once } from "node:events";

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
    const hash = getCommitFromRef(ref);

    // sort of a hack - if we have an official release version, it'll be in the form `major.minor`.  otherwise,
    // we'd expect a commit hash or `master`.
    if (ref.includes('.')) {
        const [major, minor, patch] = ref.split('.');
        if (patch !== '0') {
            throw new Error('cannot release from non-zero patch.');
        }

        const branch = `r${major}.${minor}`
        return `https://mciuploads.s3.amazonaws.com/libmongocrypt-release/${platform}/${branch}/${hash}/libmongocrypt.tar.gz`;
    }

    return `https://mciuploads.s3.amazonaws.com/libmongocrypt/${platform}/master/${hash}/libmongocrypt.tar.gz`;
}

export function getLibmongocryptPrebuildName() {
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

    return prebuild;
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