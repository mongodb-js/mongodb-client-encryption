import * as crypto from 'crypto';

type AES256Callback = (key: Buffer, iv: Buffer, input: Buffer, output: Buffer) => number | Error;

function makeAES256Hook(
  method: 'createCipheriv' | 'createDecipheriv',
  mode: 'aes-256-cbc' | 'aes-256-ctr'
): AES256Callback {
  return function (key: Buffer, iv: Buffer, input: Buffer, output: Buffer): number | Error {
    let result;

    try {
      const cipher = crypto[method](mode, key, iv);
      cipher.setAutoPadding(false);
      result = cipher.update(input);
      const final = cipher.final();
      if (final.length > 0) {
        result = Buffer.concat([result, final]);
      }
    } catch (e) {
      return e;
    }

    result.copy(output);
    return result.length;
  };
}

function randomHook(buffer: Buffer, count: number): number | Error {
  try {
    crypto.randomFillSync(buffer, 0, count);
  } catch (e) {
    return e;
  }
  return count;
}

function sha256Hook(input: Buffer, output: Buffer): number | Error {
  let result;
  try {
    result = crypto.createHash('sha256').update(input).digest();
  } catch (e) {
    return e;
  }

  result.copy(output);
  return result.length;
}

type HMACHook = (key: Buffer, input: Buffer, output: Buffer) => number | Error;

export function makeHmacHook(algorithm: 'sha512' | 'sha256'): HMACHook {
  return (key: Buffer, input: Buffer, output: Buffer): number | Error => {
    let result;
    try {
      result = crypto.createHmac(algorithm, key).update(input).digest();
    } catch (e) {
      return e;
    }

    result.copy(output);
    return result.length;
  };
}

function signRsaSha256Hook(key: Buffer, input: Buffer, output: Buffer): number | Error {
  let result;
  try {
    const signer = crypto.createSign('sha256WithRSAEncryption');
    const privateKey = Buffer.from(
      `-----BEGIN PRIVATE KEY-----\n${key.toString('base64')}\n-----END PRIVATE KEY-----\n`
    );

    result = signer.update(input).end().sign(privateKey);
  } catch (e) {
    return e;
  }

  result.copy(output);
  return result.length;
}

const aes256CbcEncryptHook = makeAES256Hook('createCipheriv', 'aes-256-cbc');
const aes256CbcDecryptHook = makeAES256Hook('createDecipheriv', 'aes-256-cbc');
const aes256CtrEncryptHook = makeAES256Hook('createCipheriv', 'aes-256-ctr');
const aes256CtrDecryptHook = makeAES256Hook('createDecipheriv', 'aes-256-ctr');
const hmacSha512Hook = makeHmacHook('sha512');
const hmacSha256Hook = makeHmacHook('sha256');

/**
 * @public
 *
 * A JS implementation of crypto callbacks used for encryption.
 * These are only necessary on versions of Node.js that do not bundle OpenSSL 3.x
 */
export const cryptoCallbacks = {
  randomHook,
  sha256Hook,
  signRsaSha256Hook,
  aes256CbcEncryptHook,
  aes256CbcDecryptHook,
  aes256CtrEncryptHook,
  aes256CtrDecryptHook,
  hmacSha512Hook,
  hmacSha256Hook
};
