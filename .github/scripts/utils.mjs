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
        const [major, minor, _patch] = ref.split('.');

        // Just a note: it may appear that this logic _doesn't_ support patch releases but it actually does.
        // libmongocrypt's creates release branches for minor releases in the form `r<major>.<minor>`.  
        // Any patches made to this branch are committed as tags in the form <major>.<minor>.<patch>.
        // So, the branch that is used for the AWS s3 upload is `r<major>.<minor>` and the commit hash
        // is the commit hash we parse from the `getCommitFromRef()` (which handles switching to git tags and
        // getting the commit hash at that tag just fine).
        const branch = `r${major}.${minor}`

        return `https://mciuploads.s3.amazonaws.com/libmongocrypt-release/${platform}/${branch}/${hash}/libmongocrypt.tar.gz`;
    }

    // just a note here - `master` refers to the branch, the hash is the commit on that branch.
    // if we ever need to download binaries from a non-master branch (or non-release branch), 
    // this will need to be modified somehow.
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