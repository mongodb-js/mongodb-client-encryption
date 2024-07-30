import * as semver from 'semver';
import * as process from 'node:process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as sinon from 'sinon';
import { EJSON, BSON, Binary } from 'bson';
import { MongoCrypt, MongoCryptConstructor, cryptoCallbacks } from '../src';
import { expect } from 'chai';

const NEED_MONGO_KEYS = 3;
const READY = 5;
const ERROR = 0;

const LOCAL_KEY = new Uint8Array([
  0x9d, 0x94, 0x4b, 0x0d, 0x93, 0xd0, 0xc5, 0x44, 0xa5, 0x72, 0xfd, 0x32, 0x1b, 0x94, 0x30, 0x90,
  0x23, 0x35, 0x73, 0x7c, 0xf0, 0xf6, 0xc2, 0xf4, 0xda, 0x23, 0x56, 0xe7, 0x8f, 0x04, 0xcc, 0xfa,
  0xde, 0x75, 0xb4, 0x51, 0x87, 0xf3, 0x8b, 0x97, 0xd7, 0x4b, 0x44, 0x3b, 0xac, 0x39, 0xa2, 0xc6,
  0x4d, 0x91, 0x00, 0x3e, 0xd1, 0xfa, 0x4a, 0x30, 0xc1, 0xd2, 0xc6, 0x5e, 0xfb, 0xac, 0x41, 0xf2,
  0x48, 0x13, 0x3c, 0x9b, 0x50, 0xfc, 0xa7, 0x24, 0x7a, 0x2e, 0x02, 0x63, 0xa3, 0xc6, 0x16, 0x25,
  0x51, 0x50, 0x78, 0x3e, 0x0f, 0xd8, 0x6e, 0x84, 0xa6, 0xec, 0x8d, 0x2d, 0x24, 0x47, 0xe5, 0xaf
]);

const kmsProviders = { local: { key: LOCAL_KEY } };
const algorithm = 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic';
const keyDocument = EJSON.parse(
  fs.readFileSync(path.join(__dirname, 'benchmarks', 'keyDocument.json'), 'utf8'),
  {
    relaxed: false
  }
);

function createEncryptedDocument(mongoCrypt: MongoCrypt) {
  const { _id: keyId } = keyDocument;

  const encrypted = { myEncryptedKey: undefined };

  const v = 'mySecretValue';

  const ctx = mongoCrypt.makeExplicitEncryptionContext(BSON.serialize({ v }), {
    keyId: keyId.buffer,
    algorithm
  });

  const getState = () => ctx.state;

  if (getState() === NEED_MONGO_KEYS) {
    ctx.addMongoOperationResponse(BSON.serialize(keyDocument));
    ctx.finishMongoOperation();
  }

  if (getState() !== READY) throw new Error(`not ready: [${ctx.state}] ${ctx.status.message}`);
  const result = ctx.finalize();
  if (getState() === ERROR) throw new Error(`error: [${ctx.state}] ${ctx.status.message}`);
  const { v: encryptedValue } = BSON.deserialize(result);
  encrypted.myEncryptedKey = encryptedValue;

  return encrypted;
}

describe('Crypto hooks', () => {
  describe('when openssl 3 available', () => {
    beforeEach('check ssl version', function () {
      const openssl = semver.coerce(process.versions.openssl);

      if (!(semver.gte(openssl, '3.0.0') && semver.lt(openssl, '4.0.0'))) {
        this.skip();
      }
    });

    it('reports crypto hook provider as `native_openssl`', () => {
      const mongoCryptOptions: ConstructorParameters<MongoCryptConstructor>[0] = {
        kmsProviders: BSON.serialize(kmsProviders),
        cryptoCallbacks
      };

      const mongoCrypt = new MongoCrypt(mongoCryptOptions);

      expect(mongoCrypt).to.have.property('cryptoHooksProvider', 'native_openssl');
    });

    it('should use native crypto hooks', async () => {
      const spiedCallbacks = Object.fromEntries(
        Object.entries(cryptoCallbacks).map(([name, hook]) => [name, sinon.spy(hook)])
      );

      const mongoCryptOptions: ConstructorParameters<MongoCryptConstructor>[0] = {
        kmsProviders: BSON.serialize(kmsProviders),
        cryptoCallbacks: spiedCallbacks
      };

      const mongoCrypt = new MongoCrypt(mongoCryptOptions);

      const encryptedDoc = createEncryptedDocument(mongoCrypt);

      expect(encryptedDoc).to.have.property('myEncryptedKey').that.is.instanceOf(Binary);

      for (const [name, hook] of Object.entries(spiedCallbacks))
        expect(hook, name).to.not.have.been.called;
    });
  });

  describe('when openssl 3 is unavailable', () => {
    beforeEach('check ssl version', function () {
      const openssl = semver.coerce(process.versions.openssl);

      if (semver.gte(openssl, '3.0.0') && semver.lt(openssl, '4.0.0')) {
        this.skip();
      }
    });

    it('reports crypto hook provider as `js`', () => {
      const mongoCryptOptions: ConstructorParameters<MongoCryptConstructor>[0] = {
        kmsProviders: BSON.serialize(kmsProviders),
        cryptoCallbacks
      };

      const mongoCrypt = new MongoCrypt(mongoCryptOptions);

      expect(mongoCrypt).to.have.property('cryptoHooksProvider', 'js');
    });

    it('should use js crypto hooks', async () => {
      const spiedCallbacks = Object.fromEntries(
        Object.entries(cryptoCallbacks).map(([name, hook]) => [name, sinon.spy(hook)])
      );

      const mongoCryptOptions: ConstructorParameters<MongoCryptConstructor>[0] = {
        kmsProviders: BSON.serialize(kmsProviders),
        cryptoCallbacks: spiedCallbacks
      };

      const mongoCrypt = new MongoCrypt(mongoCryptOptions);

      const encryptedDoc = createEncryptedDocument(mongoCrypt);

      expect(encryptedDoc).to.have.property('myEncryptedKey').that.is.instanceOf(Binary);

      expect(spiedCallbacks).to.have.property('aes256CbcEncryptHook').to.have.callCount(1);
      expect(spiedCallbacks).to.have.property('aes256CbcDecryptHook').to.have.callCount(1);
      expect(spiedCallbacks).to.have.property('hmacSha512Hook').to.have.callCount(3);

      expect(spiedCallbacks).to.have.property('randomHook').to.not.have.been.called;
      expect(spiedCallbacks).to.have.property('sha256Hook').to.not.have.been.called;
      expect(spiedCallbacks).to.have.property('signRsaSha256Hook').to.not.have.been.called;
      expect(spiedCallbacks).to.have.property('aes256CtrEncryptHook').to.not.have.been.called;
      expect(spiedCallbacks).to.have.property('aes256CtrDecryptHook').to.not.have.been.called;
      expect(spiedCallbacks).to.have.property('hmacSha256Hook').to.not.have.been.called;
    });
  });
});
