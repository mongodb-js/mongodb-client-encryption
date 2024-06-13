// @ts-check
/* eslint-disable no-console */
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import process from 'node:process';
import fs from 'node:fs';
import { EJSON, BSON } from 'bson';
import { cryptoCallbacks } from './crypto_callbacks.mjs';
import { MongoCrypt } from '../../lib/index.js';

const NEED_MONGO_KEYS = 3;
const READY = 5;
const ERROR = 0;

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const { CRYPT_SHARED_LIB_PATH: cryptSharedLibPath = '' } = process.env;

const warmupSecs = 2;
const testInSecs = 57;
const fieldCount = 1500;

const LOCAL_KEY = new Uint8Array([
  0x9d, 0x94, 0x4b, 0x0d, 0x93, 0xd0, 0xc5, 0x44, 0xa5, 0x72, 0xfd, 0x32, 0x1b, 0x94, 0x30, 0x90,
  0x23, 0x35, 0x73, 0x7c, 0xf0, 0xf6, 0xc2, 0xf4, 0xda, 0x23, 0x56, 0xe7, 0x8f, 0x04, 0xcc, 0xfa,
  0xde, 0x75, 0xb4, 0x51, 0x87, 0xf3, 0x8b, 0x97, 0xd7, 0x4b, 0x44, 0x3b, 0xac, 0x39, 0xa2, 0xc6,
  0x4d, 0x91, 0x00, 0x3e, 0xd1, 0xfa, 0x4a, 0x30, 0xc1, 0xd2, 0xc6, 0x5e, 0xfb, 0xac, 0x41, 0xf2,
  0x48, 0x13, 0x3c, 0x9b, 0x50, 0xfc, 0xa7, 0x24, 0x7a, 0x2e, 0x02, 0x63, 0xa3, 0xc6, 0x16, 0x25,
  0x51, 0x50, 0x78, 0x3e, 0x0f, 0xd8, 0x6e, 0x84, 0xa6, 0xec, 0x8d, 0x2d, 0x24, 0x47, 0xe5, 0xaf
]);

const padNum = i => i.toString().padStart(4, '0');
const kmsProviders = { local: { key: LOCAL_KEY } };
const algorithm = 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic';
const keyDocument = EJSON.parse(
  await fs.promises.readFile(path.join(__dirname, 'keyDocument.json'), 'utf8'),
  { relaxed: false }
);

function createEncryptedDocument(mongoCrypt) {
  const { _id: keyId } = keyDocument;

  const encrypted = {};

  for (let i = 0; i < fieldCount; i++) {
    const key = `key${padNum(i + 1)}`;
    const v = `value ${padNum(i + 1)}`;

    const ctx = mongoCrypt.makeExplicitEncryptionContext(BSON.serialize({ v }), {
      keyId: keyId.buffer,
      algorithm
    });

    if (ctx.state === NEED_MONGO_KEYS) {
      ctx.addMongoOperationResponse(BSON.serialize(keyDocument));
      ctx.finishMongoOperation();
    }

    console.assert(ctx.state === READY);
    const result = ctx.finalize();
    console.assert(ctx.state !== ERROR);
    const { v: encryptedValue } = BSON.deserialize(result);
    encrypted[key] = encryptedValue;
  }

  return encrypted;
}

function measureMedianOpsPerSecOfDecrypt(mongoCrypt, toDecrypt, seconds) {
  let operationsPerSecond = [];

  for (let second = 0; second < seconds; second++) {
    const startTime = performance.now();
    /** @type {number | null} */
    let operations = 0;

    while (performance.now() - startTime < 1000) {
      const ctx = mongoCrypt.makeDecryptionContext(toDecrypt);
      if (ctx.state === NEED_MONGO_KEYS) {
        // We ran over a minute
        operations = null;
        break;
      }

      if (ctx.state !== READY) throw new Error(`NOT READY: ${ctx.state}`);

      ctx.finalize();
      operations += 1;
    }

    if (operations != null) operationsPerSecond.push(operations);
  }

  console.log('samples taken: ', operationsPerSecond.length);
  operationsPerSecond.sort((a, b) => a - b);
  return operationsPerSecond[Math.floor(operationsPerSecond.length / 2)];
}

function main() {
  const hw = os.cpus();
  const ram = os.totalmem() / 1024 ** 3;
  const platform = { name: hw[0].model, cores: hw.length, ram: `${ram}GB` };

  const systemInfo = () =>
    [
      `\n- cpu: ${platform.name}`,
      `- node: ${process.version}`,
      `- cores: ${platform.cores}`,
      `- arch: ${os.arch()}`,
      `- os: ${process.platform} (${os.release()})`,
      `- ram: ${platform.ram}\n`
    ].join('\n');
  console.log(systemInfo());

  console.log(
    `BenchmarkRunner is using ` +
      `libmongocryptVersion=${MongoCrypt.libmongocryptVersion}, ` +
      `warmupSecs=${warmupSecs}, ` +
      `testInSecs=${testInSecs}`
  );

  const mongoCryptOptions = { kmsProviders: BSON.serialize(kmsProviders), cryptoCallbacks };
  if (cryptSharedLibPath) mongoCryptOptions.cryptSharedLibPath = cryptSharedLibPath;

  const mongoCrypt = new MongoCrypt(mongoCryptOptions);

  const encrypted = createEncryptedDocument(mongoCrypt);
  const toDecrypt = BSON.serialize(encrypted);

  const created_at = new Date();

  // warmup
  measureMedianOpsPerSecOfDecrypt(mongoCrypt, toDecrypt, warmupSecs);
  // bench
  const medianOpsPerSec = measureMedianOpsPerSecOfDecrypt(mongoCrypt, toDecrypt, testInSecs);

  const completed_at = new Date();

  console.log(`Decrypting 1500 fields median ops/sec : ${medianOpsPerSec}`);

  const perfSend = {
    info: { test_name: 'javascript_decrypt_1500' },
    created_at,
    completed_at,
    artifacts: [],
    metrics: [{ name: 'medianOpsPerSec', type: 'THROUGHPUT', value: medianOpsPerSec }],
    sub_tests: []
  };
  console.log(perfSend);
}

main();
