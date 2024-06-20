# MongoDB Client Encryption

The Node.js wrapper for [`libmongocrypt`](../../README.md)

**Note** This library provides encryption functionality for the MongoDB Node.js driver but is **not intended** to be consumed in isolation. The public API that uses the functionality in this library is available in the `mongodb` package.

### MongoDB Node.js Driver Version Compatibility

Only the following version combinations with the [MongoDB Node.js Driver](https://github.com/mongodb/node-mongodb-native) are considered stable.

|               | `mongodb-client-encryption@1.x` | `mongodb-client-encryption@2.x` | `mongodb-client-encryption@6.x` |
| ------------- | ------------------------------- | ------------------------------- | ------------------------------- |
| `mongodb@6.x` | N/A                             | N/A                             | ✓                               |
| `mongodb@5.x` | N/A                             | ✓                               | N/A                             |
| `mongodb@4.x` | ✓                               | ✓                               | N/A                             |
| `mongodb@3.x` | ✓                               | N/A                             | N/A                             |

### Installation

You can install `mongodb-client-encryption` with the following:

```bash
npm install mongodb-client-encryption
```

### Development

#### Setup


Run the following command to build libmongocrypt and you are setup to develop the node bindings:

```shell
npm run install:libmongocrypt
```

#### `libmongocrypt.mjs`

```
node libmongocrypt.mjs [optional flags]

By default attempts to download and compile the bindings with the crypto prebuilds of libmongocrypt.
Can be configured to clone and build without crypto.

--gitURL=string         A custom remote git repository to clone libmongocrypt from. You must also set --build to use this.
--libVersion=string     A custom version reference to either download or checkout after cloning.
                        You may use "latest" to get current libmongocrypt `HEAD`.
--clean                 Combined with --build, the script will not skip cloning and rebuilding libmongocrypt.
--build                 Instead of downloading, clone and build libmongocrypt along with the bindings.
--no-macos-universal    Disable creating a universal binary for MacOS builds.
--dynamic               Skips cloning or downloading libmongocrypt, runs prebuild with build_type set to "dynamic" to compile
                        a prebuild that links to a system copy of libmongocrypt.

Only suitable for local development:

--fastDownload          If you are improving this script or otherwise repeatedly downloading libmongocrypt,
                        this flag will interrupt the un-tar operation as early as possible. It should work, most of the time.
```

#### Prebuild Platforms

Below are the platforms that are available as prebuilds on each github release.
`prebuild-install` downloads these automatically depending on the platform you are running npm install on.

- Linux GLIBC 2.23 or later
    - s390x
    - arm64
    - x64
- MacOS universal binary
    - x64
    - arm64
- Windows
    - x64

#### Linting

We lint both the c++ bindings and the Typescript.

To lint the Typescript, you can run `npm run check:eslint -- --fix`. To lint the c++, run `npm run clang-format`.

#### Testing

The unit tests require the binding to be built. Run `npm run rebuild` to build the addon from the c++ source. Then the tests can be run with `npm test`.

Note: changes to c++ source are not automatically re-compiled. One needs to rebuild the bindings after each change.
