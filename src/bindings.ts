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

export const mc: MongoCryptBindings = load();

export interface MongoCryptConstructor {
  new (options: MongoCryptConstructorOptions): IMongoCrypt;
  libmongocryptVersion: string;
}

interface MongoCryptContextCtor {
  new (): IMongoCryptContext;
}

/**
 * The value returned by the native bindings
 * reference the `Init(Env env, Object exports)` function in the c++
 */
type MongoCryptBindings = {
  MongoCrypt: MongoCryptConstructor;
  MongoCryptContextCtor: MongoCryptContextCtor;
  MongoCryptKMSRequestCtor: MongoCryptKMSRequest;
};

export interface MongoCryptStatus {
  type: number;
  code: number;
  message?: string;
}

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

export interface IMongoCryptContext {
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

/**
 * All options that can be provided to a C++ MongoCrypt constructor.
 */
export type MongoCryptConstructorOptions = {
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

  /**
   * A function that wraps any errors that are thrown by the bindings in this package
   * into a new error type.
   *
   * Example wrapper function, using the MongoDB driver:
   * ```typescript
   * (error: Error) => new MongoClientEncryptionError(error.message, { cause: error });
   * ```
   */
  errorWrapper: (error: Error) => Error;
};

export interface IMongoCrypt {
  makeEncryptionContext(ns: string, command: Uint8Array): IMongoCryptContext;
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
  ): IMongoCryptContext;
  makeDecryptionContext(buffer: Uint8Array): IMongoCryptContext;
  makeExplicitDecryptionContext(buffer: Uint8Array): IMongoCryptContext;
  makeDataKeyContext(
    optionsBuffer: Uint8Array,
    options: {
      keyAltNames?: Uint8Array[];
      keyMaterial?: Uint8Array;
    }
  ): IMongoCryptContext;
  makeRewrapManyDataKeyContext(filter: Uint8Array, encryptionKey?: Uint8Array): IMongoCryptContext;
  readonly status: MongoCryptStatus;
  readonly cryptSharedLibVersionInfo: {
    version: bigint;
    versionStr: string;
  } | null;
  readonly cryptoHooksProvider: 'js' | 'native_openssl' | null;
}

export type ExplicitEncryptionContextOptions = NonNullable<
  Parameters<IMongoCrypt['makeExplicitEncryptionContext']>[1]
>;
export type DataKeyContextOptions = NonNullable<Parameters<IMongoCrypt['makeDataKeyContext']>[1]>;
export type MongoCryptOptions = Omit<MongoCryptConstructorOptions, 'cryptoCallbacks'>;
export type MongoCryptErrorWrapper = MongoCryptOptions['errorWrapper'];

// export const
