import { cryptoCallbacks } from './crypto_callbacks';
export { cryptoCallbacks };

function load() {
  try {
    return require('../build/Release/mongocrypt.node');
  } catch {
    // Webpack will fail when just returning the require, so we need to wrap
    // in a try/catch and rethrow.
    /* eslint no-useless-catch: 0 */
    try {
      return require('../build/Debug/mongocrypt.node');
    } catch (error) {
      throw error;
    }
  }
}

const mc: MongoCryptBindings = load();

/**
 * The value returned by the native bindings
 * reference the `Init(Env env, Object exports)` function in the c++
 */
type MongoCryptBindings = {
  MongoCrypt: MongoCryptConstructor;
  MongoCryptContextCtor: MongoCryptContextCtor;
  MongoCryptKMSRequestCtor: MongoCryptKMSRequest;
};

export interface MongoCryptKMSRequest {
  addResponse(response: Uint8Array): void;
  fail(): boolean;
  readonly status: MongoCryptStatus;
  readonly bytesNeeded: number;
  readonly uSleep: number;
  readonly kmsProvider: string;
  readonly endpoint: string;
  readonly message: Buffer;
}

export interface MongoCryptStatus {
  type: number;
  code: number;
  message?: string;
}

export interface MongoCryptContext {
  nextMongoOperation(): Buffer;
  addMongoOperationResponse(response: Uint8Array): void;
  finishMongoOperation(): void;
  nextKMSRequest(): MongoCryptKMSRequest | null;
  provideKMSProviders(providers: Uint8Array): void;
  finishKMSRequests(): void;
  finalize(): Buffer;

  get status(): MongoCryptStatus;
  get state(): number;
}

type MongoCryptConstructorOptions = {
  kmsProviders?: Uint8Array;
  schemaMap?: Uint8Array;
  encryptedFieldsMap?: Uint8Array;
  logger?: unknown;
  cryptoCallbacks?: Record<string, unknown>;
  cryptSharedLibSearchPaths?: string[];
  cryptSharedLibPath?: string;
  bypassQueryAnalysis?: boolean;
  /** Configure the time to expire the DEK from the cache. */
  keyExpirationMS?: number;
  /** TODO(NODE-6793): remove this option and have it always set in the next major */
  enableMultipleCollinfo?: boolean;
};

export interface MongoCryptConstructor {
  new (options: MongoCryptConstructorOptions): MongoCrypt;
  libmongocryptVersion: string;
}

export interface MongoCrypt {
  makeEncryptionContext(ns: string, command: Uint8Array): MongoCryptContext;
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
  ): MongoCryptContext;
  makeDecryptionContext(buffer: Uint8Array): MongoCryptContext;
  makeExplicitDecryptionContext(buffer: Uint8Array): MongoCryptContext;
  makeDataKeyContext(
    optionsBuffer: Uint8Array,
    options: {
      keyAltNames?: Uint8Array[];
      keyMaterial?: Uint8Array;
    }
  ): MongoCryptContext;
  makeRewrapManyDataKeyContext(filter: Uint8Array, encryptionKey?: Uint8Array): MongoCryptContext;
  readonly status: MongoCryptStatus;
  readonly cryptSharedLibVersionInfo: {
    version: bigint;
    versionStr: string;
  } | null;
  readonly cryptoHooksProvider: 'js' | 'native_openssl' | null;
}

export type ExplicitEncryptionContextOptions = NonNullable<
  Parameters<MongoCrypt['makeExplicitEncryptionContext']>[1]
>;
export type DataKeyContextOptions = NonNullable<Parameters<MongoCrypt['makeDataKeyContext']>[1]>;
export type MongoCryptOptions = NonNullable<ConstructorParameters<MongoCryptConstructor>[0]>;

export const MongoCrypt: MongoCryptConstructor = class MongoCrypt extends mc.MongoCrypt {
  constructor(options: MongoCryptConstructorOptions) {
    // Pass in JS cryptoCallbacks implementation by default.
    // If the Node.js openssl version is supported this will be ignored.
    super(
      // @ts-expect-error: intentionally passing in an argument that will throw to preserve existing behavior
      options == null || typeof options !== 'object' ? undefined : { cryptoCallbacks, ...options }
    );
  }
};

/** exported for testing only. */
interface MongoCryptContextCtor {
  new (): MongoCryptContext;
}
export const MongoCryptContextCtor: MongoCryptContextCtor = mc.MongoCryptContextCtor;
