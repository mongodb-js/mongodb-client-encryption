# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [6.1.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v6.1.0-alpha...v6.1.0) (2024-08-13)


### Features

* **NODE-5875:** provide native crypto hooks for OpenSSL 3 ([#25](https://github.com/mongodb-js/mongodb-client-encryption/issues/25)) ([38f1be6](https://github.com/mongodb-js/mongodb-client-encryption/commit/38f1be60e3f8d24b066642f742c90d0ffdd0cdc0))
* **NODE-6307:** use libmongocrypt 1.11.0 ([#38](https://github.com/mongodb-js/mongodb-client-encryption/issues/38)) ([bc85202](https://github.com/mongodb-js/mongodb-client-encryption/commit/bc852020441dbc8ec2d02dd9eb7c9711a598eec4))


### Bug Fixes

* **MONGOSH-1808:** static building on intel macs and windows ([#24](https://github.com/mongodb-js/mongodb-client-encryption/issues/24)) ([f27e8e1](https://github.com/mongodb-js/mongodb-client-encryption/commit/f27e8e1d658dfa269d684d632727b5abf89ecae5))
* **NODE-6237:** build against glibc 2.27 ([#28](https://github.com/mongodb-js/mongodb-client-encryption/issues/28)) ([1c9b74a](https://github.com/mongodb-js/mongodb-client-encryption/commit/1c9b74a2fe2d4974e0d09ab25f2e5740111bbe07))
* **NODE-6300:** make expressionMode required in C++ in makeExplicitEncryptionContext ([#37](https://github.com/mongodb-js/mongodb-client-encryption/issues/37)) ([5552f9f](https://github.com/mongodb-js/mongodb-client-encryption/commit/5552f9f1a59caa3da11dd71dbc7b093451d99266))

## [6.1.0-alpha](https://github.com/mongodb-js/mongodb-client-encryption/compare/v6.0.1...v6.1.0-alpha) (2024-06-17)


### Features

* **NODE-5908:** support range v2 protocol ([#13](https://github.com/mongodb-js/mongodb-client-encryption/issues/13)) ([4650f7c](https://github.com/mongodb-js/mongodb-client-encryption/commit/4650f7c29caed7e8889d0fe9e05c169484b819a2))
* **NODE-6226:** build macos universal binary ([#21](https://github.com/mongodb-js/mongodb-client-encryption/issues/21)) ([a044ccd](https://github.com/mongodb-js/mongodb-client-encryption/commit/a044ccd956b2e666d4ddeadc6b98d9b5291d32eb))

## [6.0.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v6.0.0-alpha.3...v6.0.0) (2023-08-28)

* 86bd61e docs: Update Node bindings README.md
* c91c8c6 docs(NODE-5527): add nodejs driver compat table (#687)
* 1edf123 docs(NODE-5425): update Node bindings docs (#685)
* c7dd6a5 chore(NODE-5448): update mongodb-client-encryption dependencies (#684)

## [6.0.0-alpha.3](https://github.com/mongodb-js/mongodb-client-encryption/compare/v6.0.0-alpha.2...v6.0.0-alpha.3) (2023-08-09)

* f058acd fix(NODE-5516): allow `undefined` values for optional Uint8Arrays arguments (#683)

## [6.0.0-alpha.2](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.9.0...v6.0.0-alpha.2) (2023-08-07)

* 9f19923 refactor(NODE-5432): Remove usages of Buffer from Node C++ bindings (#682)
* 6b95301 chore: type definition improvements for driver internal usage (#675)
* 593ff24 feat(NODE-5420)!: remove JS bindings from libmongocrypt (#667)
* 57531ba feat(NODE-5417)!: bump minimum Node.js version to v16.20.1 (#670)

## [2.9.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.8.0...v2.9.0) (2023-07-12)

* 342e908 feat(NODE-5431): add node bindings v6 deprecations (#666)
* 34f0ed4 ci(NODE-5331): install npm to node_artifacts directory (#656)
* 5811eba test(NODE-5268): use node 20 in ci (#650)

## [2.8.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.8.0-alpha.0...v2.8.0) (2023-05-11)

* 51c300f docs(NODE-5264): mark QE equality stable (#647)
* bc4b7bc docs(NODE-5261): update readme to mention cryptSharedLibPath and cryptSharedLibRequired (#643)
* e6b5be5 chore(NODE-5257): update dependencies (#639)
* 5a5ee03 test(NODE-5238): set min/max range options when required. (#636)
* afb6dc7 fix(NODE-4896): do not pass explicit session into state machine helpers (#632)
* cacbf64 MONGOCRYPT-561 enable QEv2 protocol by default (#621)
* bad374f chore(NODE-5123): fix node docs generation (#620)
* 5f8265d test(NODE-5179): remove ctr cipher tests (#611)
* 84f252e fix(NODE-5172): direct link to python 3.9 for prebuild (#609)
* c90645a fix(NODE-5172): update node-gyp (#608)
* 80ba303 test(NODE-5168): fix flaky stubbed key material test (#607)

## [2.8.0-alpha.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.7.1...v2.8.0-alpha.0) (2023-04-04)

* 20b4117 feat(NODE-5074): enable queryable encryption v2 (#606)
* 0efe671 ci(NODE-5131): remove npm install in node download script (#602)

### [2.7.1](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.7.0...v2.7.1) (2023-03-20)

* Same as `2.7.0`

## [2.7.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.7.0-alpha.0...v2.7.0) (2023-03-20)

* 16a52e7 docs(NODE-5094): fix docs for azure kms credential refresh (#596)
* edc8bf8 ci(NODE-5088): download node to local directory (#585)

## [2.7.0-alpha.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.6.0...v2.7.0-alpha.0) (2023-03-14)

* 91bb63b feat(NODE-5076): add support for Azure KMS credential auto refresh (#583)

## [2.6.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.6.0-alpha.0...v2.6.0) (2023-02-23)

* Same as `2.6.0-alpha.0`

## [2.6.0-alpha.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.5.0...v2.6.0-alpha.0) (2023-02-16)

* 860f6a3 feat(NODE-5066): add automatic credential usage to TS definitions (#576)
* a90a524 feat(NODE-5049): add support for kms gcp service accounts (#574)
* 15bd8d5 feat(NODE-4619): add KMS `accessToken` to TS definitions (#459)
* 43e98b7 fix(NODE-5053): enforce empty map for kmsProvider auto credentials (#565)

## [2.5.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.4.0...v2.5.0) (2023-02-06)

* 7f472ea chore: Bump http-cache-semantics from 4.1.0 to 4.1.1 in /bindings/node (#559)
* e748da9 fix(NODE-5041): replace `rangeOpts` with `rangeOptions` in Typescript definitions (#557)
* 72ae47d feat(NODE-5013): automatically create Queryable Encryption keys (#552)
* 9a2ad11 fix(NODE-5023): use correct options type for encryptExpression (#555)
* 6282a15 [MONGOCRYPT-521] LTO Build Fixes (#551)

## [2.4.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.4.0-alpha.2...v2.4.0) (2023-01-26)

* c5516c4 test(NODE-4897): bump release test timeout (#540)
* 04e06f3 fix(NODE-5000): make aws credential providers peer optional (#546)

## [2.4.0-alpha.2](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.4.0-alpha.0...v2.4.0-alpha.2) (2023-01-24)

* c117879 fix(NODE-4997): no strncasecmp on windows (#545)
* 764b899 chore(release): 2.4.0-alpha.1
* 3014b1c feat(NODE-4694): support range indexes (#533)
* 11ed3c9 test(NODE-4993): migrate create a data key test to promise usage (#539)

## [2.4.0-alpha.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.3.0...v2.4.0-alpha.0) (2023-01-20)

* 031bbfa fix(NODE-4987): node csfle uses promises instead of callbacks (#537)
* ebcb768 [MONGOCRYPT-483]: Support Decimal128 in range-based Queryable Encryption (#522)
* 3c4aa8b fix(NODE-4880): specify family of ipv4 when connecting to default mongocryptd uri (#516)
* 37e1d12 ci(NODE-4666): pin to node18 instead of latest (#513)
* a154554 chore: Bump minimatch from 3.0.4 to 3.1.2 in /bindings/node (#491)
* d177281 (NODE-4779): Pin to an earlier Node LTS release on platforms that are not supported by prebuilt Node 18+ (#488)
* f70a0cf feat(NODE-4234): add aws credentials provider (#479)
* ba258a0 docs(NODE-4725): Change docs to use "in use encryption" terminology (#476)

## [2.3.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.2.1...v2.3.0) (2022-10-05)

* 7dc561c feat(NODE-4328): expose libmongocrypt version in bindings (#464)

### [2.2.1](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.2.0...v2.2.1) (2022-09-12)

* 91b2bc4 fix(NODE-4556): attempt to use exported BSON (#443)

## [2.2.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.2.0-alpha.6...v2.2.0) (2022-08-10)

* 6533b82 feat(NODE-4517): add official support for the key management API (#439)

## [2.2.0-alpha.6](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.2.0-alpha.5...v2.2.0-alpha.6) (2022-07-29)

* d574606 chore: revert change to uri in node binding tests (#424)

## [2.2.0-alpha.5](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.2.0-alpha.4...v2.2.0-alpha.5) (2022-07-20)

* d574606 chore: revert change to uri in node binding tests (#424)
* aabd8eb feat(NODE-4394): add key management API to node bindings (#414)
* ce5b1af test(NODE-4389): fix rewrap many data key test hang (#403)
* 85f64cd Revert "Node bindings should re-use top-level find-cmake.sh (#395)" (#401)
* decc2fb Node bindings should re-use top-level find-cmake.sh (#395)

## [2.2.0-alpha.4](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.2.0-alpha.3...v2.2.0-alpha.4) (2022-07-06)

* adbbd6b test(NODE-4343): fix remaining spec tests (#399)
* ace6da6 test(NODE-4343): contention factor required with indexed (#397)
* 40ee992 chore(NODE-4372): bump prebuild install to 7.1.1 (#394)
* a56a784 fix(NODE-4339): remove indexKeyId (#387)
* 1b1b699 fix(NODE-4260): mongocrypterror has name getter (#383)
* 21ef15d fix(NODE-4342): remove createKey() in favor of createDataKey() (#390)
* 7d13004 fix(NODE-4356): update rewrapManyDataKey to use UpdateOne bulk ops (#389)
* 006be71 feat(NODE-4294): mark queryable encryption options beta (#380)

## [2.2.0-alpha.3](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.2.0-alpha.2...v2.2.0-alpha.3) (2022-06-23)

* 3b9bbbf Use mongo-c-driver as a subdirectory for obtaining libbson (#365)
* 4c43c23 chore(NODE-4304): accept string value for queryType (#373)
* b0f94db [MONGOCRYPT-441] Accept string arguments for queryType and "index_type" (#368)

## [2.2.0-alpha.2](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.2.0-alpha.1...v2.2.0-alpha.2) (2022-06-10)

* 30de861 fix(NODE-4251): fix markCommand deserialization (#364)

## [2.2.0-alpha.1](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.2.0-alpha.0...v2.2.0-alpha.1) (2022-06-01)

* 50fba9e fix: add missing import in Node.js bindings TS definitions (#353)
* f2c401b fix(NODE-4279): handle decrypted nested documents well with devtools decoration (#350)
* 3fbd57d [MONGOCRYPT-434] Rename "csfle" to "crypt_shared" (#352)
* 8a07c72 test(NODE-4254): use majority write concern (#348)
* 5b13ce2 test(NODE-4254): use majority write concern (#347)
* d1c222f chore(NODE-4236): use latest node driver (#345)
* 8105956 fix(NODE-4254): allow csfle to be dynamically required (#342)
* 0e8749a feat(NODE-4241): add support for rewrapManyDataKey and keyMaterial (#334)
* 2e8903f fix(NODE-4242): do not run mongocryptd if bypassQueryAnalysis (#335)
* 006f326 feat(NODE-4220): add FLE2 explicit encryption API (#327)

## [2.2.0-alpha.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.1.0...v2.2.0-alpha.0) (2022-05-04)

* 26471cc feat(NODE-4218): add aes256-ctr support (#324)
* bae60ca test: loosen test error assertion for fails to autospawn (#310)

## [2.1.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.0.0...v2.1.0) (2022-04-21)

* 7c1ce27 feat(NODE-4136): adjust Node.js bindings for shared library spec (#306)
* 4da6a64 chore: Bump minimist from 1.2.5 to 1.2.6 in /bindings/node (#278)
* 08d7f73 feat(NODE-4085): add Node.js csfle shared library option support (#265)
* 6e6c6f5 feat(NODE-3978): allow identifying decrypted fields for internal usage/testing (#266)
* 2bb42fd MONGOCRYPT-391 add 32 bit Windows build variant (#262)
* 4d707f0 Compile Warnings-as-errors Cleanup (#256)
* 171cf2e MONGOCRYPT-382 require `aws: {}` to enter NEED_KMS_CREDENTIALS (#257)
* ad2af98 MONGOCRYPT-382 Add support for providing per-KMS-request credentials (#252)

## [2.0.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.0.0-beta.4...v2.0.0) (2022-02-17)

* e2d09dd Fix Capitalize for ClientEncryptionTlsOptions (#244)

## [2.0.0-beta.4](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.0.0-beta.3...v2.0.0-beta.4) (2022-02-09)

* fd5331d feat: build and test node on m1 NODE-3631 (#245)
* d4fb3a1 test: fix incorrect done usage in beforeEach hook (#242)
* 08b5adf chore(NODE-3849)!: update dependencies and sync tooling (#241)
* b6c651e docs(NODE-3926): allow either Buffer or Binary in decrypt (#239)

## [2.0.0-beta.3](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.0.0-beta.0...v2.0.0-beta.3) (2022-01-31)

* 3b2d83d Revert and move only warnings-as-error flags into scripts (#237)
* 99b8461 Move CMAKE_C_FLAGS from CMakeLists.txt into Evergreen build scripts (#224)
* b886970 fix(NODE-3777): destroy socket on end (#236)
* bca4a84 feat(NODE-3777): set tls options per kms provider (#235)
* 8a173b2 MONGOCRYPT-340 add macOS m1 variant (#234)

## [2.0.0-beta.2](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.0.0-beta.0...v2.0.0-beta.2) (2021-12-22)

* 4e2c818 MONGOCRYPT-362 build and publish packages on Amazon Linux 2 arm64 (#233)

## [2.0.0-beta.1](https://github.com/mongodb-js/mongodb-client-encryption/compare/v2.0.0-beta.0...v2.0.0-beta.1) (2021-12-21)

* afa1838 fix(NODE-3633): properly forward proxyOptions to StateMachine (#230)
* d922e23 chore(NODE-3633): update Socks5 support for driver PR feedback (#227)
* 7e4280b test: increase encrypter test timeout (#226)
* 5816a19 feat(NODE-3633): add Socks5 support (#220)
* e049059 feat(NODE-3177): allow serverSelectionTimeoutMS to client (#225)
* 68adc88 feat(NODE-3781): add tls options for kms providers (#222)
* 0e3571f feat(NODE-3777): add node bindings for kms provider (#221)

## [2.0.0-beta.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.2.7...v2.0.0-beta.0) (2021-10-07)

* 17ed59b chore(NODE-3632): limit CI publishing to one version of x64 linux (#201)
* 3886dca fix(NODE-3605): bypassAutoEncryption should not spawn mongocryptd (#204)
* e89da23 feat!(NODE-3474): convert to Node-API (#193)

### [1.2.7](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.2.6...v1.2.7) (2021-09-14)

* fc67ea2 chore(NODE-3316): update author info and add bug url in package.json (#180)

### [1.2.6](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.2.5...v1.2.6) (2021-07-01)

* c3aa733 fix(NODE-3118): keyAltNames option not serialized (#176)

### [1.2.5](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.2.4...v1.2.5) (2021-06-10)

* e75d2ed fix(NODE-3350): do not export Init and helper function symbols (#177)
* ba102c0 fix(NODE-3326): binding.gyp missing from files list in package.json (#175)

### [1.2.4](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.2.3...v1.2.4) (2021-06-01)

* 7ad0c9a fix(NODE-3320): Explicitly provide list of artifacts to be published with package.files (#174)
* 05905d4 chore: update prebuild-install to latest (#171)

### [1.2.3](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.2.2...v1.2.3) (2021-04-06)

* 8e6092b fix(NODE-2995): add metadata client usage (#168)

### [1.2.2](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.2.1...v1.2.2) (2021-03-16)

* e923c17 fix: clean up memory leaks related to mongocrypt_binary_t (#166)
* 7454f03 fix: loosen peerDependencies requirement on mongodb (#161)
* 0b4bf75 chore: add AWS sessionToken TypeScript definitions (#160)

### [1.2.1](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.2.0...v1.2.1) (2021-02-05)

* c571e46 fix: always authorize TLS endpoints, use servername for SNI (#159)

## [1.2.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.1.0...v1.2.0) (2021-02-02)

* 058bdcc chore: bump ini from 1.3.5 to 1.3.8 in /bindings/node (#148)
* 788056f chore(node-binding): Add TypeScript definitions (#154)
* 6949cdd fix: copy output buffers to libmongocrypt in Node.js bindings (#149)

### [1.1.1-beta.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.1.0...v1.1.1-beta.0) (2020-12-04)

* 826a3d9 feat: support Azure and GCP KMS providers (#139)
* c5c7e60 chore: bump bl from 1.2.2 to 1.2.3 in /bindings/node (#128)
* 2f92ce7 chore: bump standard-version from 5.0.2 to 8.0.1
* 08c014c chore: bump lodash from 4.17.15 to 4.17.19
* bfeb0d5 chore: add script for prebuilding for legacy versions of node

# [1.1.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.0.1...v1.1.0) (2020-06-23)

* 7c07e2f fix: correct typo preventing passing a custom mongocrypt spawn path
* 5677758 chore: use node 14 to build prebuild images
* a6ecfa4 chore: update bson dev dependency to 4.x
* a65d23d chore: update version of node used to build binding to erbium
* cdde669 chore: pin prebuild-install to 5.3.0
* 86d687f chore: don't install mongocryptd for CI test runs

## [1.0.1](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.0.0...v1.0.1) (2019-12-31)

* c1f1aa3 chore: update peer dependency & repository location in package.json
* fa5c6e7 feat: support `bypassAutoEncryption` directly in AutoEncrypter
* e044dc7 refactor: support explicitly set BSON module
* f974c2b fix typo in node bindings (#85)

# [1.0.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.0.0-rc3.0...v1.0.0) (2019-12-10)

* Same as `1.0.0-rc3.0`

# [1.0.0-rc3.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.0.0-rc2.0...v1.0.0-rc3.0) (2019-12-04)

* efda0f2 chore: ensure prebuild revision check works on windows as well

# [1.0.0-rc2.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v1.0.0-rc1.0...v1.0.0-rc2.0) (2019-12-04)

* 604147d test: fix typo in client encryption tests

# [1.0.0-rc1.0](https://github.com/mongodb-js/mongodb-client-encryption/compare/v0.3.1...v1.0.0-rc1.0) (2019-12-04)

* 09465d0 chore: add `standard-version` for release management
* cf43523 test: ensure no clients are left open after test runs
* b8d5307 feat: add a useful error message if we can't connect to mongocryptd
* 3e4f575 fix: support two ways of specifying `--idleShutdownTimeoutSecs`

# v1.0.0-rc0

* 1aea82b fix: ensure cflags are not mixed between windows and linux
* bbdc965 test: fix `find_cmake.sh` path in node's environment setup
* ca82e87 NODE-2338 support building addon for windows
* 3eafaa4 NODE-2339: change API to remove mandatory injection
* 863d4ee NODE-2315: make --idleShutdownTimeoutSecs work
* 3e48e40 NODE-2109: Follow spec for auto-spawning mongocryptd
* 5b9f6cd NODE: minor documentation fix
* 59d4665 NODE-2298: update documentation to synergize with driver docs (#71)
* 7a145d6 NODE-2255: add support for keyVaultClient
* e310e75 NODE: fix typo in mock endpoint
* 114b35c NODE-2255: Add API for specifying a custom endpoint with AWS masterkey provider
* 65ca4c0 NODE-2255: test that fetching keys uses readConcern=majority
* 13d8b11 NODE-2255: test that created data keys insert with majority writeConcern
* a58a0f1 NODE-2278: respect user bson options when using autoEncryption
* 5eedcc7 MONGOCRYPT-178 NODE-2159 refactor libbson build for better commonality
* a8cb8e3 MONGOCRYPT-87 consume new CMake targets exported by C driver

# v0.3.1

* e60f3ef NODE: incorporate documentation feedback
* d07b509 NODE: docs: document the public API of the node bindings
* 3f00866 NODE: test(cryptoHooks): test error handling of random hooks
* b0b3255 NODE: fix(cryptoHooks): propagate random hook error
* 2ea51d8 NODE: fix(crypyoHooks): make crypto hooks work in Node 4
* 3f962b7 NODE: feat(node12): add node 12 and election support
* 5cc47c1 NODE: chore(osx): target node 10.12
* 0e63dfa NODE: chore(osx): fix build on osx in evergreen
* d00d757 NODE: fix typo
* 1c2b5d6 NODE: format: minor formatting changes
* d8932a2 NODE: real v0.3.0 with proper prebuild-install command

# v0.3.0

* e667e28 NODE: remove connecting on linux socket
* 7fbe80f NODE: fix node evergreen config
* a462f6f NODE: adds keyAltNames support
* 2ac2573 NODE: Adding prebuild support to evergreen
* ff57896 NODE: Adding node tests to evergreen
* 1bf8568 NODE: feat(cryptoCallbacks): pass crypto errors to libmongocrypt
* 55ae2a2 NODE: fix node build on osx for node 4 & 6
* ba25da4 NODE-2072: provide infrastructure for statically linking the addon

# v0.2.0

* 976116b feat: implement crypto hooks, pass them into `MongoCrypt` instances
* cf5ccf6 feat: support passing crypto callbacks to `MongoCrypt` constructor
* ef38445 test(client-encryption): drop collection before each test run
* 77ca484 NODE: handle auto-spawning mongocryptd in node bindings

# v0.1.3

* 943cad3 NODE: Add tools to generate documentation in README
* 0b6be62 NODE: rely on request.bytesNeeded for ending kms requests
* 4fd9e78 test(autoEncrypter): fix incorrect cyphertext
* a67fddd refactor(encryption-options): remove initialization vector
* 98da3ae CDRIVER-3199 fix key offset
* b112463 chore: update npmignore to not publish build artifacts
* aa0b189 chore: include missing header in binding header
* 4e9924c chore: add npm ignore for publishing
* 595d995 refactor: support returning promises in `ClientEncryption`
* 72d2ba8 NODE-1854: add node bindings for client side encryption (#19)
