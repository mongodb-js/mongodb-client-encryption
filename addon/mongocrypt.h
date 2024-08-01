#ifndef NODE_MONGOCRYPT_H
#define NODE_MONGOCRYPT_H

// We generally only target N-API version 4, but the instance data
// feature is only available in N-API version 6. However, it is
// available in all Node.js versions that have N-API version 4
// as an experimental feature (that has not been changed since then).
#define NAPI_VERSION 6
#define NAPI_EXPERIMENTAL
#define NODE_API_EXPERIMENTAL_NOGC_ENV_OPT_OUT

#include <napi.h>

#include <memory>

extern "C" {
#include <mongocrypt/mongocrypt.h>
}

namespace node_mongocrypt {

struct CryptoHooks {
    const char* id;
    mongocrypt_crypto_fn aes_256_cbc_encrypt;
    mongocrypt_crypto_fn aes_256_cbc_decrypt;
    mongocrypt_random_fn random;
    mongocrypt_hmac_fn hmac_sha_512;
    mongocrypt_hmac_fn hmac_sha_256;
    mongocrypt_hash_fn sha_256;
    mongocrypt_crypto_fn aes_256_ctr_encrypt;
    mongocrypt_crypto_fn aes_256_ctr_decrypt;
    mongocrypt_crypto_fn aes_256_ecb_encrypt;
    mongocrypt_hmac_fn sign_rsa_sha256;
    void* ctx;
};

struct MongoCryptBinaryDeleter {
    void operator()(mongocrypt_binary_t* binary) {
        mongocrypt_binary_destroy(binary);
    }
};

struct MongoCryptDeleter {
    void operator()(mongocrypt_t* mongo_crypt) {
        mongocrypt_destroy(mongo_crypt);
    }
};

struct MongoCryptContextDeleter {
    void operator()(mongocrypt_ctx_t* context) {
        mongocrypt_ctx_destroy(context);
    }
};

namespace opensslcrypto {
std::unique_ptr<CryptoHooks> createOpenSSLCryptoHooks();
}

typedef bool (*ExplicitEncryptionContextInitFunction)(mongocrypt_ctx_t*, mongocrypt_binary_t*);

class MongoCrypt : public Napi::ObjectWrap<MongoCrypt> {
   public:
    static Napi::Function Init(Napi::Env env);

   private:
    Napi::Value MakeEncryptionContext(const Napi::CallbackInfo& info);
    Napi::Value MakeExplicitEncryptionContext(const Napi::CallbackInfo& info);
    Napi::Value MakeDecryptionContext(const Napi::CallbackInfo& info);
    Napi::Value MakeExplicitDecryptionContext(const Napi::CallbackInfo& info);
    Napi::Value MakeDataKeyContext(const Napi::CallbackInfo& info);
    Napi::Value MakeRewrapManyDataKeyContext(const Napi::CallbackInfo& info);
    Napi::Value MakeExplicitEncryptionContextInternal(ExplicitEncryptionContextInitFunction init_fn,
                                                      const Napi::Uint8Array& value,
                                                      const Napi::Object& options);

    Napi::Value Status(const Napi::CallbackInfo& info);
    Napi::Value CryptSharedLibVersionInfo(const Napi::CallbackInfo& info);
    Napi::Value CryptoHooksProvider(const Napi::CallbackInfo& info);

   private:
    friend class Napi::ObjectWrap<MongoCrypt>;
    Napi::Function GetCallback(const char* name);
    void SetCallback(const char* name, Napi::Value fn);

    explicit MongoCrypt(const Napi::CallbackInfo& info);
    std::unique_ptr<CryptoHooks> createJSCryptoHooks();
    bool installCryptoHooks();

    static void logHandler(mongocrypt_log_level_t level,
                           const char* message,
                           uint32_t message_len,
                           void* ctx);

    std::unique_ptr<CryptoHooks> _crypto_hooks;
    std::unique_ptr<mongocrypt_t, MongoCryptDeleter> _mongo_crypt;
};

class MongoCryptContext : public Napi::ObjectWrap<MongoCryptContext> {
   public:
    static Napi::Function Init(Napi::Env env);
    static Napi::Object NewInstance(
        Napi::Env env, std::unique_ptr<mongocrypt_ctx_t, MongoCryptContextDeleter> context);

   private:
    Napi::Value NextMongoOperation(const Napi::CallbackInfo& info);
    void AddMongoOperationResponse(const Napi::CallbackInfo& info);
    void FinishMongoOperation(const Napi::CallbackInfo& info);
    Napi::Value NextKMSRequest(const Napi::CallbackInfo& info);
    void ProvideKMSProviders(const Napi::CallbackInfo& info);
    void FinishKMSRequests(const Napi::CallbackInfo& info);
    Napi::Value FinalizeContext(const Napi::CallbackInfo& info);

    Napi::Value Status(const Napi::CallbackInfo& info);
    Napi::Value State(const Napi::CallbackInfo& info);

   private:
    friend class Napi::ObjectWrap<MongoCryptContext>;
    explicit MongoCryptContext(const Napi::CallbackInfo& info);
    std::unique_ptr<mongocrypt_ctx_t, MongoCryptContextDeleter> _context;
};

class MongoCryptKMSRequest : public Napi::ObjectWrap<MongoCryptKMSRequest> {
   public:
    static Napi::Function Init(Napi::Env env);
    static Napi::Object NewInstance(Napi::Env env, mongocrypt_kms_ctx_t* kms_context);

   private:
    void AddResponse(const Napi::CallbackInfo& info);

    Napi::Value Status(const Napi::CallbackInfo& info);
    Napi::Value Message(const Napi::CallbackInfo& info);
    Napi::Value BytesNeeded(const Napi::CallbackInfo& info);
    Napi::Value KMSProvider(const Napi::CallbackInfo& info);
    Napi::Value Endpoint(const Napi::CallbackInfo& info);

   private:
    friend class Napi::ObjectWrap<MongoCryptKMSRequest>;
    explicit MongoCryptKMSRequest(const Napi::CallbackInfo& info);
    mongocrypt_kms_ctx_t* _kms_context;
};

}  // namespace node_mongocrypt

#endif  // NODE_MONGOCRYPT_H
