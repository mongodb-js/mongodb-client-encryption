#ifndef NODE_MONGOCRYPT_H
#define NODE_MONGOCRYPT_H

#define NAPI_VERSION 9

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

    struct State {
        std::unique_ptr<CryptoHooks> crypto_hooks;
        std::unique_ptr<mongocrypt_t, MongoCryptDeleter> mongo_crypt;
        MongoCrypt* js_wrapper;
    };

   private:
    ~MongoCrypt();

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

    mongocrypt_t* mongo_crypt();  // shorthand for _state->mongo_crypt.get()

    std::shared_ptr<State> _state = std::make_shared<State>();
};

class MongoCryptContext : public Napi::ObjectWrap<MongoCryptContext> {
   public:
    static Napi::Function Init(Napi::Env env);
    static Napi::Object NewInstance(
        Napi::Env env,
        std::shared_ptr<MongoCrypt::State> mongo_crypt,
        std::unique_ptr<mongocrypt_ctx_t, MongoCryptContextDeleter> context);

    struct ContextState {
        // Keep reference to the MongoCrypt instance alive while this instance is alive
        std::shared_ptr<MongoCrypt::State> mongo_crypt;
        std::unique_ptr<mongocrypt_ctx_t, MongoCryptContextDeleter> context;
    };

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

    mongocrypt_ctx_t* context();  // shorthand for _state->context.get()
    std::shared_ptr<ContextState> _state = std::make_shared<ContextState>();
};

class MongoCryptKMSRequest : public Napi::ObjectWrap<MongoCryptKMSRequest> {
   public:
    static Napi::Function Init(Napi::Env env);
    static Napi::Object NewInstance(Napi::Env env,
                                    std::shared_ptr<MongoCryptContext::ContextState> context_state,
                                    mongocrypt_kms_ctx_t* kms_context);

   private:
    void AddResponse(const Napi::CallbackInfo& info);

    Napi::Value Status(const Napi::CallbackInfo& info);
    Napi::Value Message(const Napi::CallbackInfo& info);
    Napi::Value BytesNeeded(const Napi::CallbackInfo& info);
    Napi::Value Fail(const Napi::CallbackInfo& info);
    Napi::Value USleep(const Napi::CallbackInfo& info);
    Napi::Value KMSProvider(const Napi::CallbackInfo& info);
    Napi::Value Endpoint(const Napi::CallbackInfo& info);

   private:
    friend class Napi::ObjectWrap<MongoCryptKMSRequest>;
    explicit MongoCryptKMSRequest(const Napi::CallbackInfo& info);

    // Keep reference to the MongoCryptContext instance alive while this instance is alive
    std::shared_ptr<MongoCryptContext::ContextState> _context_state;
    mongocrypt_kms_ctx_t* _kms_context;
};

}  // namespace node_mongocrypt

#endif  // NODE_MONGOCRYPT_H
