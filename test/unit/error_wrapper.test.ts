import { expect } from 'chai';
import { MongoCrypt, MongoCryptContext } from '../../src';
import {
  IMongoCrypt,
  IMongoCryptContext,
  MongoCryptKMSRequest,
  MongoCryptStatus
} from '../../src/bindings';
import { serialize } from 'bson';

class CustomError extends Error {}

describe('custom error wrapper functionality', function () {
  describe('class MongoCryptContext', function () {
    let context: MongoCryptContext;

    beforeEach(function () {
      class MockBindingsContext implements IMongoCryptContext {
        nextMongoOperation(): Buffer {
          throw new Error('ahh');
        }
        addMongoOperationResponse(_response: Uint8Array): void {
          throw new Error('ahh');
        }
        finishMongoOperation(): void {
          throw new Error('ahh');
        }
        nextKMSRequest(): MongoCryptKMSRequest | null {
          throw new Error('ahh');
        }
        provideKMSProviders(_providers: Uint8Array): void {
          throw new Error('ahh');
        }
        finishKMSRequests(): void {
          throw new Error('ahh');
        }
        finalize(): Buffer {
          throw new Error('ahh');
        }
        get status(): MongoCryptStatus {
          throw new Error('ahh');
        }
        get state(): number {
          throw new Error('ahh');
        }
      }

      context = new MongoCryptContext(
        new MockBindingsContext(),
        error => new CustomError('custom error', { cause: error })
      );
    });

    it('#nextMongoOperation() wraps errors from the bindings', function () {
      expect(() => context.nextMongoOperation()).to.throw(CustomError);
    });

    it('#addMongoOperationResponse() wraps errors from the bindings', function () {
      expect(() => context.addMongoOperationResponse(Buffer.from([1, 2, 3]))).to.throw(CustomError);
    });

    it('#finishMongoOperation() wraps errors from the bindings', function () {
      expect(() => context.finishMongoOperation()).to.throw(CustomError);
    });

    it('#nextKMSRequest() wraps errors from the bindings', function () {
      expect(() => context.nextKMSRequest()).to.throw(CustomError);
    });

    it('#provideKMSProviders() wraps errors from the bindings', function () {
      expect(() => context.provideKMSProviders(Buffer.from([1, 2, 3]))).to.throw(CustomError);
    });

    it('#finishKMSRequests() wraps errors from the bindings', function () {
      expect(() => context.finishKMSRequests()).to.throw(CustomError);
    });

    it('#finalize() wraps errors from the bindings', function () {
      expect(() => context.finalize()).to.throw(CustomError);
    });

    it('.status wraps errors from the bindings', function () {
      expect(() => context.status).to.throw(CustomError);
    });

    it('.state wraps errors from the bindings', function () {
      expect(() => context.state).to.throw(CustomError);
    });
  });

  describe('class MongoCrypt', function () {
    let context: IMongoCrypt;

    beforeEach(function () {
      class MockMongoCrypt implements IMongoCrypt {
        makeEncryptionContext(_ns: string, _command: Uint8Array): IMongoCryptContext {
          throw new Error('Method not implemented.');
        }
        makeExplicitEncryptionContext(
          _value: Uint8Array,
          _options?: {
            keyId?: Uint8Array;
            keyAltName?: Uint8Array;
            algorithm?: string;
            rangeOptions?: Uint8Array;
            textOptions?: Uint8Array;
            contentionFactor?: bigint | number;
            queryType?: string;
            expressionMode: boolean;
          }
        ): IMongoCryptContext {
          throw new Error('Method not implemented.');
        }
        makeDecryptionContext(_buffer: Uint8Array): IMongoCryptContext {
          throw new Error('Method not implemented.');
        }
        makeExplicitDecryptionContext(_buffer: Uint8Array): IMongoCryptContext {
          throw new Error('Method not implemented.');
        }
        makeDataKeyContext(
          _optionsBuffer: Uint8Array,
          _options: { keyAltNames?: Uint8Array[]; keyMaterial?: Uint8Array }
        ): IMongoCryptContext {
          throw new Error('Method not implemented.');
        }
        makeRewrapManyDataKeyContext(
          _filter: Uint8Array,
          _encryptionKey?: Uint8Array
        ): IMongoCryptContext {
          throw new Error('Method not implemented.');
        }
        get status(): MongoCryptStatus {
          throw new Error('Method not implemented.');
        }
        cryptSharedLibVersionInfo: { version: bigint; versionStr: string };
        cryptoHooksProvider: 'js' | 'native_openssl';
      }

      context = new MongoCrypt({
        errorWrapper: error => new CustomError('custom error', { cause: error }),
        kmsProviders: serialize({ aws: {} })
      });

      // @ts-expect-error accessing private property
      context.mc = new MockMongoCrypt();
    });

    it('#makeEncryptionContext() wraps errors from the bindings', function () {
      expect(() => context.makeEncryptionContext('db.collection', Buffer.from([1, 2, 3]))).to.throw(
        CustomError
      );
    });

    it('#makeExplicitEncryptionContext() wraps errors from the bindings', function () {
      expect(() => context.makeExplicitEncryptionContext(Buffer.from([1, 2, 3]))).to.throw(
        CustomError
      );
    });

    it('#makeDecryptionContext() wraps errors from the bindings', function () {
      expect(() => context.makeDecryptionContext(Buffer.from([1, 2, 3]))).to.throw(CustomError);
    });

    it('#makeExplicitDecryptionContext() wraps errors from the bindings', function () {
      expect(() => context.makeExplicitDecryptionContext(Buffer.from([1, 2, 3]))).to.throw(
        CustomError
      );
    });

    it('#makeRewrapManyDataKeyContext() wraps errors from the bindings', function () {
      expect(() => context.makeRewrapManyDataKeyContext(Buffer.from([1, 2, 3]))).to.throw(
        CustomError
      );
    });

    it('.status wraps errors from the bindings', function () {
      expect(() => context.status).to.throw(CustomError);
    });
  });
});
