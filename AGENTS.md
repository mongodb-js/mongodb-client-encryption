# AGENTS.md

Instructions for AI coding agents working in this repository. This file is the source of truth; tool-specific files (e.g. CLAUDE.md) should only import it.

## Project Overview

`mongodb-client-encryption` is a Node.js native addon binding [libmongocrypt](https://github.com/mongodb/libmongocrypt) to JavaScript via N-API (node-addon-api). It powers In-Use Encryption (CSFLE and Queryable Encryption) in the MongoDB Node.js driver. The addon is built with node-gyp against a static libmongocrypt (version pinned by `mongodb:libmongocrypt` in package.json). On install, `prebuild-install` looks for a prebuilt addon binary, falling back to a source build.

## Commands

- `npm run install:libmongocrypt` — download a libmongocrypt prebuilt into `deps/` and compile the addon (required before testing after a fresh clone).
- `npm run rebuild` — recompile the addon only (`node-gyp rebuild`).
- `npm test` — run mocha unit tests (`test/unit/*.test.ts`); requires a compiled addon.
- `npm run prepare` — compile TypeScript (`src/` → `lib/`).
- `npm run check:eslint` — lint `src` and `test`.
- `npm run check:clang-format` — check C++ formatting; `npm run clang-format` to fix.

## Structure

- `addon/` — C++ addon files. `mongocrypt.cc`/`mongocrypt.h` implement the N-API bindings for libmongocrypt.
- `src/` — TypeScript source. `index.ts` is the entrypoint (wraps the native classes, adds error wrapping); `bindings.ts` loads the compiled `.node` binary and types its interface; `crypto_callbacks.ts` implements the JS crypto hooks via Node's `crypto` module.
- `lib/` — compiled JS/type output of `src/` (via `tsc`), the published entrypoint, untracked.
- `deps/` — libmongocrypt headers and static library. Populated by `.github/scripts/libmongocrypt.mjs`, untracked.
- `build/` — node-gyp output, holds the `.node` file loaded by `src/bindings.ts`, untracked.
- `test/unit/` — mocha tests (TypeScript, via ts-node). `test/bundling/` checks bundler compatibility; `test/benchmarks/` holds benchmarks.
- `etc/docker.sh` — runs tests in glibc and musl Docker containers.
- `binding.gyp` — node-gyp build config linking the addon against `deps/`.
- `.github/scripts/libmongocrypt.mjs` — builds libmongocrypt.

## Code Conventions

- **Null checks** — loose equality (`== null`), not `=== null`/`=== undefined`.
- **Type imports** — inline: `import { type Foo }`.
- **Formatting** — Prettier: single quotes, 2-space indent, 100-char width, no trailing commas.

## Commit Messages

- [Conventional Commits](https://www.conventionalcommits.org/), optionally with a Jira ticket: `<type>(NODE-XXXX): <subject>` — types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`; breaking changes use `!` (e.g. `feat(NODE-XXXX)!: …`). Though this is an optional rule, it is encouraged.

## Related Repositories

- [mongodb/libmongocrypt](https://github.com/mongodb/libmongocrypt) — the C library this package binds.
- [mongodb/node-mongodb-native](https://github.com/mongodb/node-mongodb-native) — the MongoDB Node.js driver, the primary consumer of this package.
