import {
  IMongoCrypt,
  IMongoCryptContext,
  mc,
  MongoCryptErrorWrapper,
  MongoCryptKMSRequest,
  MongoCryptOptions,
  MongoCryptStatus
} from './bindings';
import { cryptoCallbacks } from './crypto_callbacks';
export { cryptoCallbacks };

export class MongoCryptContext implements IMongoCryptContext {
  private context: IMongoCryptContext;
  private errorWrapper: MongoCryptOptions['errorWrapper'];

  constructor(context: IMongoCryptContext, errorWrapper: MongoCryptOptions['errorWrapper']) {
    this.context = context;
    this.errorWrapper = errorWrapper;
  }

  nextMongoOperation(): Buffer {
    try {
      return this.context.nextMongoOperation();
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }

  addMongoOperationResponse(response: Uint8Array): void {
    try {
      return this.context.addMongoOperationResponse(response);
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }
  finishMongoOperation(): void {
    try {
      return this.context.finishMongoOperation();
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }
  nextKMSRequest(): MongoCryptKMSRequest | null {
    try {
      return this.context.nextKMSRequest();
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }
  provideKMSProviders(providers: Uint8Array): void {
    try {
      return this.context.provideKMSProviders(providers);
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }
  finishKMSRequests(): void {
    try {
      return this.context.finishKMSRequests();
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }
  finalize(): Buffer {
    try {
      return this.context.finalize();
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }
  get status(): MongoCryptStatus {
    try {
      return this.context.status;
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }
  get state(): number {
    try {
      return this.context.state;
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }
}

export class MongoCrypt implements IMongoCrypt {
  private errorWrapper: MongoCryptErrorWrapper;
  private mc: IMongoCrypt;
  readonly cryptSharedLibVersionInfo: { version: bigint; versionStr: string } | null;
  readonly cryptoHooksProvider: 'js' | 'native_openssl' | null;

  static readonly libmongocryptVersion: string = mc.MongoCrypt.libmongocryptVersion;

  constructor(options: MongoCryptOptions) {
    // Pass in JS cryptoCallbacks implementation by default.
    // If the Node.js openssl version is supported this will be ignored.
    this.mc = new mc.MongoCrypt({ cryptoCallbacks, ...options });

    this.errorWrapper = options.errorWrapper;

    this.cryptSharedLibVersionInfo = this.mc.cryptSharedLibVersionInfo;
    this.cryptoHooksProvider = this.mc.cryptoHooksProvider;
  }

  makeEncryptionContext(ns: string, command: Uint8Array): MongoCryptContext {
    try {
      return new MongoCryptContext(this.mc.makeEncryptionContext(ns, command), this.errorWrapper);
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }

  makeExplicitEncryptionContext(
    value: Uint8Array,
    options?: {
      keyId?: Uint8Array;
      keyAltName?: Uint8Array;
      algorithm?: string;
      rangeOptions?: Uint8Array;
      textOptions?: Uint8Array;
      contentionFactor?: bigint | number;
      queryType?: string;

      /**
       * node-binding specific option
       *
       * When true, creates a `mongocrypt_ctx_explicit_encrypt_expression` context.
       * When false, creates a `mongocrypt_ctx_explicit_encrypt`
       */
      expressionMode: boolean;
    }
  ): MongoCryptContext {
    try {
      return new MongoCryptContext(
        this.mc.makeExplicitEncryptionContext(value, options),
        this.errorWrapper
      );
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }
  makeDecryptionContext(buffer: Uint8Array): MongoCryptContext {
    try {
      return new MongoCryptContext(this.mc.makeDecryptionContext(buffer), this.errorWrapper);
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }
  makeExplicitDecryptionContext(buffer: Uint8Array): MongoCryptContext {
    try {
      return new MongoCryptContext(
        this.mc.makeExplicitDecryptionContext(buffer),
        this.errorWrapper
      );
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }
  makeDataKeyContext(
    optionsBuffer: Uint8Array,
    options: {
      keyAltNames?: Uint8Array[];
      keyMaterial?: Uint8Array;
    }
  ): MongoCryptContext {
    try {
      return new MongoCryptContext(
        this.mc.makeDataKeyContext(optionsBuffer, options),
        this.errorWrapper
      );
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }
  makeRewrapManyDataKeyContext(filter: Uint8Array, encryptionKey?: Uint8Array): MongoCryptContext {
    try {
      return new MongoCryptContext(
        this.mc.makeRewrapManyDataKeyContext(filter, encryptionKey),
        this.errorWrapper
      );
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }
  get status(): MongoCryptStatus {
    try {
      return this.mc.status;
    } catch (error) {
      throw this.errorWrapper(error);
    }
  }
}

export type {
  MongoCryptOptions,
  ExplicitEncryptionContextOptions,
  MongoCryptKMSRequest
} from './bindings';
