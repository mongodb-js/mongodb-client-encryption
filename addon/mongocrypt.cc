#include "mongocrypt.h"

#include <cassert>

#ifdef _MSC_VER
#define strncasecmp _strnicmp
#define strcasecmp _stricmp
#endif

namespace node_mongocrypt {

using namespace Napi;

// anonymous namespace for helpers
namespace {
struct InstanceData {
    Reference<Function> MongoCryptContextCtor;
    Reference<Function> MongoCryptKMSRequestCtor;
};

struct MongoCryptStatusDeleter {
    void operator()(mongocrypt_status_t* status) {
        mongocrypt_status_destroy(status);
    }
};

Object ExtractStatus(Env env, mongocrypt_status_t* status) {
    Object result = Object::New(env);
    result["type"] = Number::New(env, mongocrypt_status_type(status));
    result["code"] = Number::New(env, mongocrypt_status_code(status));
    const char* message = mongocrypt_status_message(status, nullptr);
    if (message != nullptr) {
        result["message"] = String::New(env, message);
    }

    return result;
}

std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> Uint8ArrayToBinary(
    Uint8Array node_buffer) {
    uint8_t* buffer = node_buffer.Data();
    size_t buffer_len = node_buffer.ByteLength();
    return std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter>(
        mongocrypt_binary_new_from_data(buffer, buffer_len));
}

Uint8Array BufferFromBinary(Env env, mongocrypt_binary_t* binary) {
    return Buffer<uint8_t>::Copy(env, (uint8_t*)binary->data, binary->len);
}

Uint8Array BufferWithLengthOf(Env env, mongocrypt_binary_t* binary) {
    return Buffer<uint8_t>::New(env, binary->len);
}

Uint8Array Uint8ArrayFromValue(Napi::Value v, std::string argument_name) {
    if (!v.IsTypedArray() || v.As<TypedArray>().TypedArrayType() != napi_uint8_array) {
        std::string error_message = "Parameter `" + argument_name + "` must be a Uint8Array.";
        throw TypeError::New(v.Env(), error_message);
    }
    return v.As<Uint8Array>();
}

void CopyBufferData(mongocrypt_binary_t* out, Uint8Array buffer, size_t count) {
    assert(count <= out->len);
    assert(count <= buffer.ByteLength());
    memcpy(out->data, buffer.Data(), count);
}

void CopyBufferData(mongocrypt_binary_t* out, Uint8Array buffer) {
    CopyBufferData(out, buffer, out->len);
}

std::string errorStringFromStatus(mongocrypt_t* crypt) {
    std::unique_ptr<mongocrypt_status_t, MongoCryptStatusDeleter> status(mongocrypt_status_new());
    mongocrypt_status(crypt, status.get());
    const char* errorMessage = mongocrypt_status_message(status.get(), nullptr);
    if (!errorMessage) {
        return "Operation failed";
    }

    return errorMessage;
}

std::string errorStringFromStatus(mongocrypt_ctx_t* context) {
    std::unique_ptr<mongocrypt_status_t, MongoCryptStatusDeleter> status(mongocrypt_status_new());
    mongocrypt_ctx_status(context, status.get());
    const char* errorMessage = mongocrypt_status_message(status.get(), nullptr);
    if (!errorMessage) {
        return "Operation failed";
    }

    return errorMessage;
}

template <typename E>
E strToEnumValue(Env env,
                 const std::string& str,
                 const char* option_name,
                 const std::initializer_list<std::pair<const char*, E>>& values) {
    for (const auto& candidate : values) {
        if (candidate.first == str) {
            return candidate.second;
        }
    }
    throw Error::New(env, std::string("invalid enum value: '") + str + "' for " + option_name);
}

}  // anonymous namespace

Function MongoCrypt::Init(Napi::Env env) {
    return DefineClass(
        env,
        "MongoCrypt",
        {InstanceMethod("makeEncryptionContext", &MongoCrypt::MakeEncryptionContext),
         InstanceMethod("makeExplicitEncryptionContext",
                        &MongoCrypt::MakeExplicitEncryptionContext),
         InstanceMethod("makeDecryptionContext", &MongoCrypt::MakeDecryptionContext),
         InstanceMethod("makeExplicitDecryptionContext",
                        &MongoCrypt::MakeExplicitDecryptionContext),
         InstanceMethod("makeDataKeyContext", &MongoCrypt::MakeDataKeyContext),
         InstanceMethod("makeRewrapManyDataKeyContext", &MongoCrypt::MakeRewrapManyDataKeyContext),
         InstanceAccessor("status", &MongoCrypt::Status, nullptr),
         InstanceAccessor("cryptoHooksProvider", &MongoCrypt::CryptoHooksProvider, nullptr),
         InstanceAccessor(
             "cryptSharedLibVersionInfo", &MongoCrypt::CryptSharedLibVersionInfo, nullptr),
         StaticValue("libmongocryptVersion", String::New(env, mongocrypt_version(nullptr)))});
}

mongocrypt_t* MongoCrypt::mongo_crypt() {
    return _state->mongo_crypt.get();
}

void MongoCrypt::logHandler(mongocrypt_log_level_t level,
                            const char* message,
                            uint32_t message_len,
                            void* ctx) {
    MongoCrypt* mongoCrypt = static_cast<State*>(ctx)->js_wrapper;
    if (!mongoCrypt) {
        fprintf(stderr, "Log handler called without `MongoCrypt` instance\n");
        return;
    }

    Napi::Env env = mongoCrypt->Env();
    HandleScope scope(env);
    Function logger = mongoCrypt->GetCallback("logger");

    if (logger.IsEmpty()) {
        fprintf(stderr, "No logger set, but log handler registered\n");
        return;
    }

    try {
        logger.Call(std::initializer_list<napi_value>{Number::New(env, level),
                                                      String::New(env, message, message_len)});
    } catch (const std::exception& ex) {
        fprintf(stderr, "Uncaught exception in logger callback: %s\n", ex.what());
    } catch (...) {
        fprintf(stderr, "Uncaught exception in logger callback\n");
    }
}

static void MaybeSetCryptoHookErrorStatus(Value result, mongocrypt_status_t* status) {
    if (!result.IsObject()) {
        return;
    }
    Object hookError = result.As<Object>();
    if (!hookError.Has("message")) {
        return;
    }
    std::string errorMessage = hookError.Get("message").ToString();
    mongocrypt_status_set(
        status, MONGOCRYPT_STATUS_ERROR_CLIENT, 1, errorMessage.c_str(), errorMessage.length() + 1);
}

static bool aes_256_generic_hook(MongoCrypt* mongoCrypt,
                                 mongocrypt_binary_t* key,
                                 mongocrypt_binary_t* iv,
                                 mongocrypt_binary_t* in,
                                 mongocrypt_binary_t* out,
                                 uint32_t* bytes_written,
                                 mongocrypt_status_t* status,
                                 Function hook) {
    Env env = mongoCrypt->Env();
    HandleScope scope(env);

    Uint8Array keyBuffer = BufferFromBinary(env, key);
    Uint8Array ivBuffer = BufferFromBinary(env, iv);
    Uint8Array inBuffer = BufferFromBinary(env, in);
    Uint8Array outputBuffer = BufferWithLengthOf(env, out);

    Value result;
    try {
        result = hook.Call(
            std::initializer_list<napi_value>{keyBuffer, ivBuffer, inBuffer, outputBuffer});
    } catch (...) {
        return false;
    }

    if (!result.IsNumber()) {
        MaybeSetCryptoHookErrorStatus(result, status);
        return false;
    }

    *bytes_written = result.ToNumber().Uint32Value();
    CopyBufferData(out, outputBuffer, *bytes_written);
    return true;
}

std::unique_ptr<CryptoHooks> MongoCrypt::createJSCryptoHooks() {
    static auto get_js_wrapper_for_ctx = [](void* ctx, mongocrypt_status_t* status) -> MongoCrypt* {
        MongoCrypt* wrapper = static_cast<State*>(ctx)->js_wrapper;
        if (!wrapper) {
            mongocrypt_status_set(status,
                                  MONGOCRYPT_STATUS_ERROR_CLIENT,
                                  1,
                                  "MongoCrypt instance has been destroyed",
                                  -1);
        }
        return wrapper;
    };

    auto aes_256_cbc_encrypt = [](void* ctx,
                                  mongocrypt_binary_t* key,
                                  mongocrypt_binary_t* iv,
                                  mongocrypt_binary_t* in,
                                  mongocrypt_binary_t* out,
                                  uint32_t* bytes_written,
                                  mongocrypt_status_t* status) -> bool {
        MongoCrypt* mc = get_js_wrapper_for_ctx(ctx, status);
        if (!mc)
            return false;
        return aes_256_generic_hook(
            mc, key, iv, in, out, bytes_written, status, mc->GetCallback("aes256CbcEncryptHook"));
    };

    auto aes_256_cbc_decrypt = [](void* ctx,
                                  mongocrypt_binary_t* key,
                                  mongocrypt_binary_t* iv,
                                  mongocrypt_binary_t* in,
                                  mongocrypt_binary_t* out,
                                  uint32_t* bytes_written,
                                  mongocrypt_status_t* status) -> bool {
        MongoCrypt* mc = get_js_wrapper_for_ctx(ctx, status);
        if (!mc)
            return false;
        return aes_256_generic_hook(
            mc, key, iv, in, out, bytes_written, status, mc->GetCallback("aes256CbcDecryptHook"));
    };

    auto aes_256_ctr_encrypt = [](void* ctx,
                                  mongocrypt_binary_t* key,
                                  mongocrypt_binary_t* iv,
                                  mongocrypt_binary_t* in,
                                  mongocrypt_binary_t* out,
                                  uint32_t* bytes_written,
                                  mongocrypt_status_t* status) -> bool {
        MongoCrypt* mc = get_js_wrapper_for_ctx(ctx, status);
        if (!mc)
            return false;
        return aes_256_generic_hook(
            mc, key, iv, in, out, bytes_written, status, mc->GetCallback("aes256CtrEncryptHook"));
    };

    auto aes_256_ctr_decrypt = [](void* ctx,
                                  mongocrypt_binary_t* key,
                                  mongocrypt_binary_t* iv,
                                  mongocrypt_binary_t* in,
                                  mongocrypt_binary_t* out,
                                  uint32_t* bytes_written,
                                  mongocrypt_status_t* status) -> bool {
        MongoCrypt* mc = get_js_wrapper_for_ctx(ctx, status);
        if (!mc)
            return false;
        return aes_256_generic_hook(
            mc, key, iv, in, out, bytes_written, status, mc->GetCallback("aes256CtrDecryptHook"));
    };

    auto random = [](void* ctx,
                     mongocrypt_binary_t* out,
                     uint32_t count,
                     mongocrypt_status_t* status) -> bool {
        MongoCrypt* mongoCrypt = get_js_wrapper_for_ctx(ctx, status);
        if (!mongoCrypt)
            return false;
        Napi::Env env = mongoCrypt->Env();
        HandleScope scope(env);
        Function hook = mongoCrypt->GetCallback("randomHook");

        Uint8Array outputBuffer = BufferWithLengthOf(env, out);
        Napi::Value result;
        try {
            result =
                hook.Call(std::initializer_list<napi_value>{outputBuffer, Number::New(env, count)});
        } catch (...) {
            return false;
        }

        if (!result.IsNumber()) {
            MaybeSetCryptoHookErrorStatus(result, status);
            return false;
        }

        CopyBufferData(out, outputBuffer);
        return true;
    };

    auto hmac_sha_512 = [](void* ctx,
                           mongocrypt_binary_t* key,
                           mongocrypt_binary_t* in,
                           mongocrypt_binary_t* out,
                           mongocrypt_status_t* status) -> bool {
        MongoCrypt* mongoCrypt = get_js_wrapper_for_ctx(ctx, status);
        if (!mongoCrypt)
            return false;
        Napi::Env env = mongoCrypt->Env();
        HandleScope scope(env);
        Function hook = mongoCrypt->GetCallback("hmacSha512Hook");

        Uint8Array keyBuffer = BufferFromBinary(env, key);
        Uint8Array inputBuffer = BufferFromBinary(env, in);
        Uint8Array outputBuffer = BufferWithLengthOf(env, out);

        Napi::Value result;
        try {
            result =
                hook.Call(std::initializer_list<napi_value>{keyBuffer, inputBuffer, outputBuffer});
        } catch (...) {
            return false;
        }

        if (!result.IsNumber()) {
            MaybeSetCryptoHookErrorStatus(result, status);
            return false;
        }

        CopyBufferData(out, outputBuffer);
        return true;
    };

    auto hmac_sha_256 = [](void* ctx,
                           mongocrypt_binary_t* key,
                           mongocrypt_binary_t* in,
                           mongocrypt_binary_t* out,
                           mongocrypt_status_t* status) -> bool {
        MongoCrypt* mongoCrypt = get_js_wrapper_for_ctx(ctx, status);
        if (!mongoCrypt)
            return false;
        Napi::Env env = mongoCrypt->Env();
        HandleScope scope(env);
        Function hook = mongoCrypt->GetCallback("hmacSha256Hook");

        Uint8Array keyBuffer = BufferFromBinary(env, key);
        Uint8Array inputBuffer = BufferFromBinary(env, in);
        Uint8Array outputBuffer = BufferWithLengthOf(env, out);

        Napi::Value result;
        try {
            result =
                hook.Call(std::initializer_list<napi_value>{keyBuffer, inputBuffer, outputBuffer});
        } catch (...) {
            return false;
        }

        if (!result.IsNumber()) {
            MaybeSetCryptoHookErrorStatus(result, status);
            return false;
        }

        CopyBufferData(out, outputBuffer);
        return true;
    };

    auto sha_256 = [](void* ctx,
                      mongocrypt_binary_t* in,
                      mongocrypt_binary_t* out,
                      mongocrypt_status_t* status) -> bool {
        MongoCrypt* mongoCrypt = get_js_wrapper_for_ctx(ctx, status);
        if (!mongoCrypt)
            return false;
        Napi::Env env = mongoCrypt->Env();
        HandleScope scope(env);
        Function hook = mongoCrypt->GetCallback("sha256Hook");

        Uint8Array inputBuffer = BufferFromBinary(env, in);
        Uint8Array outputBuffer = BufferWithLengthOf(env, out);

        Napi::Value result;
        try {
            result = hook.Call(std::initializer_list<napi_value>{inputBuffer, outputBuffer});
        } catch (...) {
            return false;
        }

        if (!result.IsNumber()) {
            MaybeSetCryptoHookErrorStatus(result, status);
            return false;
        }

        CopyBufferData(out, outputBuffer);
        return true;
    };

    auto sign_rsa_sha256 = [](void* ctx,
                              mongocrypt_binary_t* key,
                              mongocrypt_binary_t* in,
                              mongocrypt_binary_t* out,
                              mongocrypt_status_t* status) -> bool {
        MongoCrypt* mongoCrypt = get_js_wrapper_for_ctx(ctx, status);
        if (!mongoCrypt)
            return false;
        Napi::Env env = mongoCrypt->Env();
        HandleScope scope(env);
        Function hook = mongoCrypt->GetCallback("signRsaSha256Hook");

        Uint8Array keyBuffer = BufferFromBinary(env, key);
        Uint8Array inputBuffer = BufferFromBinary(env, in);
        Uint8Array outputBuffer = BufferWithLengthOf(env, out);

        Napi::Value result;
        try {
            result =
                hook.Call(std::initializer_list<napi_value>{keyBuffer, inputBuffer, outputBuffer});
        } catch (...) {
            return false;
        }

        if (!result.IsNumber()) {
            MaybeSetCryptoHookErrorStatus(result, status);
            return false;
        }

        CopyBufferData(out, outputBuffer);
        return true;
    };

    return std::make_unique<CryptoHooks>(CryptoHooks{"js",
                                                     aes_256_cbc_encrypt,
                                                     aes_256_cbc_decrypt,
                                                     random,
                                                     hmac_sha_512,
                                                     hmac_sha_256,
                                                     sha_256,
                                                     aes_256_ctr_encrypt,
                                                     aes_256_ctr_decrypt,
                                                     nullptr,
                                                     sign_rsa_sha256,
                                                     _state.get()});
}

bool MongoCrypt::installCryptoHooks() {
    const auto& hooks = *_state->crypto_hooks;
    if (!mongocrypt_setopt_crypto_hooks(mongo_crypt(),
                                        hooks.aes_256_cbc_encrypt,
                                        hooks.aes_256_cbc_decrypt,
                                        hooks.random,
                                        hooks.hmac_sha_512,
                                        hooks.hmac_sha_256,
                                        hooks.sha_256,
                                        hooks.ctx)) {
        return false;
    }

    // Added after `mongocrypt_setopt_crypto_hooks`, they should be treated as the same during
    // configuration
    if (!mongocrypt_setopt_crypto_hook_sign_rsaes_pkcs1_v1_5(
            mongo_crypt(), hooks.sign_rsa_sha256, hooks.ctx)) {
        return false;
    }

    if (!mongocrypt_setopt_aes_256_ctr(
            mongo_crypt(), hooks.aes_256_ctr_encrypt, hooks.aes_256_ctr_decrypt, hooks.ctx)) {
        return false;
    }

    if (hooks.aes_256_ecb_encrypt &&
        !mongocrypt_setopt_aes_256_ecb(mongo_crypt(), hooks.aes_256_ecb_encrypt, hooks.ctx)) {
        return false;
    }

    return true;
}

MongoCrypt::MongoCrypt(const CallbackInfo& info) : ObjectWrap(info) {
    _state->mongo_crypt.reset(mongocrypt_new());
    _state->js_wrapper = this;
    if (info.Length() < 1 || !info[0].IsObject()) {
        throw TypeError::New(Env(), "First parameter must be an object");
    }

    Object options = info[0].ToObject();

    if (!options.Get("kmsProviders").IsUndefined()) {
        Uint8Array kmsProvidersOptions =
            Uint8ArrayFromValue(options["kmsProviders"], "options.kmsProviders");

        std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> kmsProvidersBinary(
            Uint8ArrayToBinary(kmsProvidersOptions));
        if (!mongocrypt_setopt_kms_providers(mongo_crypt(), kmsProvidersBinary.get())) {
            throw TypeError::New(Env(), errorStringFromStatus(mongo_crypt()));
        }
    }

    if (!options.Get("schemaMap").IsUndefined()) {
        Uint8Array schemaMapBuffer = Uint8ArrayFromValue(options["schemaMap"], "options.schemaMap");

        std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> schemaMapBinary(
            Uint8ArrayToBinary(schemaMapBuffer));
        if (!mongocrypt_setopt_schema_map(mongo_crypt(), schemaMapBinary.get())) {
            throw TypeError::New(Env(), errorStringFromStatus(mongo_crypt()));
        }
    }

    if (!options.Get("encryptedFieldsMap").IsUndefined()) {
        Uint8Array encryptedFieldsMapBuffer =
            Uint8ArrayFromValue(options["encryptedFieldsMap"], "options.encryptedFieldsMap");

        std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> encryptedFieldsMapBinary(
            Uint8ArrayToBinary(encryptedFieldsMapBuffer));
        if (!mongocrypt_setopt_encrypted_field_config_map(mongo_crypt(),
                                                          encryptedFieldsMapBinary.get())) {
            throw TypeError::New(Env(), errorStringFromStatus(mongo_crypt()));
        }
    }

    if (options.Has("logger")) {
        SetCallback("logger", options["logger"]);
        if (!mongocrypt_setopt_log_handler(mongo_crypt(), MongoCrypt::logHandler, _state.get())) {
            throw TypeError::New(Env(), errorStringFromStatus(mongo_crypt()));
        }
    }

    if (!_state->crypto_hooks) {
        _state->crypto_hooks = opensslcrypto::createOpenSSLCryptoHooks();
    }
    if (!_state->crypto_hooks && options.Has("cryptoCallbacks")) {
        Object cryptoCallbacks = options.Get("cryptoCallbacks").ToObject();

        SetCallback("aes256CbcEncryptHook", cryptoCallbacks["aes256CbcEncryptHook"]);
        SetCallback("aes256CbcDecryptHook", cryptoCallbacks["aes256CbcDecryptHook"]);
        SetCallback("aes256CtrEncryptHook", cryptoCallbacks["aes256CtrEncryptHook"]);
        SetCallback("aes256CtrDecryptHook", cryptoCallbacks["aes256CtrDecryptHook"]);
        SetCallback("randomHook", cryptoCallbacks["randomHook"]);
        SetCallback("hmacSha512Hook", cryptoCallbacks["hmacSha512Hook"]);
        SetCallback("hmacSha256Hook", cryptoCallbacks["hmacSha256Hook"]);
        SetCallback("sha256Hook", cryptoCallbacks["sha256Hook"]);
        SetCallback("signRsaSha256Hook", cryptoCallbacks["signRsaSha256Hook"]);
        _state->crypto_hooks = createJSCryptoHooks();
    }
    if (_state->crypto_hooks && !installCryptoHooks()) {
        throw Error::New(Env(), "unable to configure crypto hooks");
    }

    if (options.Has("cryptSharedLibSearchPaths")) {
        Napi::Value search_paths_v = options["cryptSharedLibSearchPaths"];
        if (!search_paths_v.IsArray()) {
            throw TypeError::New(Env(), "Option `cryptSharedLibSearchPaths` must be an array");
        }
        Array search_paths = search_paths_v.As<Array>();
        for (uint32_t i = 0; i < search_paths.Length(); i++) {
            mongocrypt_setopt_append_crypt_shared_lib_search_path(
                mongo_crypt(), search_paths.Get(i).ToString().Utf8Value().c_str());
        }
    }

    if (options.Has("cryptSharedLibPath")) {
        mongocrypt_setopt_set_crypt_shared_lib_path_override(
            mongo_crypt(), options.Get("cryptSharedLibPath").ToString().Utf8Value().c_str());
    }

    if (options.Get("bypassQueryAnalysis").ToBoolean()) {
        mongocrypt_setopt_bypass_query_analysis(mongo_crypt());
    }

    if (options.Has("keyExpirationMS")) {
        int64_t keyExpirationMS = options.Get("keyExpirationMS").ToNumber().Int64Value();
        if (keyExpirationMS < 0) {
            throw TypeError::New(Env(), "Option `keyExpirationMS` must be a non-negative number");
        }
        mongocrypt_setopt_key_expiration(mongo_crypt(), keyExpirationMS);
    }

    mongocrypt_setopt_use_range_v2(mongo_crypt());

    mongocrypt_setopt_use_need_kms_credentials_state(mongo_crypt());

    mongocrypt_setopt_retry_kms(mongo_crypt(), true);

    mongocrypt_setopt_enable_multiple_collinfo(mongo_crypt());

    // Initialize after all options are set.
    if (!mongocrypt_init(mongo_crypt())) {
        throw TypeError::New(Env(), errorStringFromStatus(mongo_crypt()));
    }
}

MongoCrypt::~MongoCrypt() {
    _state->js_wrapper = nullptr;
}

Value MongoCrypt::CryptSharedLibVersionInfo(const CallbackInfo& info) {
    uint64_t version_numeric = mongocrypt_crypt_shared_lib_version(mongo_crypt());
    const char* version_string = mongocrypt_crypt_shared_lib_version_string(mongo_crypt(), nullptr);
    if (version_string == nullptr) {
        return Env().Null();
    }

    Object ret = Object::New(Env());
    ret["version"] = BigInt::New(Env(), version_numeric);
    ret["versionStr"] = String::New(Env(), version_string);
    return ret;
}

Value MongoCrypt::CryptoHooksProvider(const CallbackInfo& info) {
    if (!_state->crypto_hooks)
        return Env().Null();
    return String::New(Env(), _state->crypto_hooks->id);
}

Value MongoCrypt::Status(const CallbackInfo& info) {
    std::unique_ptr<mongocrypt_status_t, MongoCryptStatusDeleter> status(mongocrypt_status_new());
    mongocrypt_status(mongo_crypt(), status.get());
    return ExtractStatus(Env(), status.get());
}

Value MongoCrypt::MakeEncryptionContext(const CallbackInfo& info) {
    std::string ns = info[0].ToString();
    std::unique_ptr<mongocrypt_ctx_t, MongoCryptContextDeleter> context(
        mongocrypt_ctx_new(mongo_crypt()));

    Uint8Array commandBuffer = Uint8ArrayFromValue(info[1], "command");

    std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> binaryCommand(
        Uint8ArrayToBinary(commandBuffer));
    if (!mongocrypt_ctx_encrypt_init(context.get(), ns.c_str(), ns.size(), binaryCommand.get())) {
        throw TypeError::New(Env(), errorStringFromStatus(context.get()));
    }

    return MongoCryptContext::NewInstance(Env(), _state, std::move(context));
}

Value MongoCrypt::MakeExplicitEncryptionContext(const CallbackInfo& info) {
    Uint8Array valueBuffer = Uint8ArrayFromValue(info[0], "value");

    Object options = info.Length() > 1 ? info[1].ToObject() : Object::New(info.Env());

    if (!options.Get("expressionMode").IsBoolean()) {
        throw TypeError::New(Env(), "option `expressionMode` is required.");
    }

    bool expression_mode = options.Get("expressionMode").ToBoolean();
    ExplicitEncryptionContextInitFunction context_init_function =
        expression_mode ? mongocrypt_ctx_explicit_encrypt_expression_init
                        : mongocrypt_ctx_explicit_encrypt_init;

    return MakeExplicitEncryptionContextInternal(context_init_function, valueBuffer, options);
}

Value MongoCrypt::MakeExplicitEncryptionContextInternal(
    ExplicitEncryptionContextInitFunction context_init_function,
    const Uint8Array& valueBuffer,
    const Object& options) {
    std::unique_ptr<mongocrypt_ctx_t, MongoCryptContextDeleter> context(
        mongocrypt_ctx_new(mongo_crypt()));

    if (!options.Get("keyId").IsUndefined()) {
        Uint8Array keyId = Uint8ArrayFromValue(options["keyId"], "keyId");

        std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> binary(
            Uint8ArrayToBinary(keyId));
        if (!mongocrypt_ctx_setopt_key_id(context.get(), binary.get())) {
            throw TypeError::New(Env(), errorStringFromStatus(context.get()));
        }
    }

    if (!options.Get("keyAltName").IsUndefined()) {
        Uint8Array keyAltName = Uint8ArrayFromValue(options["keyAltName"], "keyAltName");

        std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> binary(
            Uint8ArrayToBinary(keyAltName));
        if (!mongocrypt_ctx_setopt_key_alt_name(context.get(), binary.get())) {
            throw TypeError::New(Env(), errorStringFromStatus(context.get()));
        }
    }

    if (options.Has("algorithm")) {
        std::string algorithm = options.Get("algorithm").ToString();
        if (!mongocrypt_ctx_setopt_algorithm(context.get(), algorithm.c_str(), algorithm.size())) {
            throw TypeError::New(Env(), errorStringFromStatus(context.get()));
        }

        if (strcasecmp(algorithm.c_str(), "range") == 0) {
            if (!options.Has("rangeOptions")) {
                throw TypeError::New(
                    Env(), "`rangeOptions` must be provided if `algorithm` is set to Range");
            }

            Uint8Array rangeOptions = Uint8ArrayFromValue(options["rangeOptions"], "rangeOptions");

            std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> binary(
                Uint8ArrayToBinary(rangeOptions));
            if (!mongocrypt_ctx_setopt_algorithm_range(context.get(), binary.get())) {
                throw TypeError::New(Env(), errorStringFromStatus(context.get()));
            }
        }
    }

    if (options.Has("contentionFactor")) {
        Napi::Value contention_factor_value = options["contentionFactor"];
        int64_t contention_factor = contention_factor_value.IsBigInt()
                                        ? contention_factor_value.As<BigInt>().Int64Value(nullptr)
                                        : contention_factor_value.ToNumber().Int64Value();
        if (!mongocrypt_ctx_setopt_contention_factor(context.get(), contention_factor)) {
            throw TypeError::New(Env(), errorStringFromStatus(context.get()));
        }
    }

    if (options.Has("queryType")) {
        std::string query_type_str = options.Get("queryType").ToString();
        if (!mongocrypt_ctx_setopt_query_type(context.get(), query_type_str.data(), -1)) {
            throw TypeError::New(Env(), errorStringFromStatus(context.get()));
        }
    }

    if (options.Has("textOptions")) {
        Uint8Array textOptionsArray = Uint8ArrayFromValue(options["textOptions"], "textOptions");

        std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> binary(
            Uint8ArrayToBinary(textOptionsArray));
        if (!mongocrypt_ctx_setopt_algorithm_text(context.get(), binary.get())) {
            throw TypeError::New(Env(), errorStringFromStatus(context.get()));
        }
    }

    std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> binaryValue(
        Uint8ArrayToBinary(valueBuffer));

    const bool status = context_init_function(context.get(), binaryValue.get());

    if (!status) {
        throw TypeError::New(Env(), errorStringFromStatus(context.get()));
    }

    return MongoCryptContext::NewInstance(Env(), _state, std::move(context));
}

Value MongoCrypt::MakeDecryptionContext(const CallbackInfo& info) {
    Uint8Array value = Uint8ArrayFromValue(info[0], "value");

    std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> binary(Uint8ArrayToBinary(value));
    std::unique_ptr<mongocrypt_ctx_t, MongoCryptContextDeleter> context(
        mongocrypt_ctx_new(mongo_crypt()));

    if (!mongocrypt_ctx_decrypt_init(context.get(), binary.get())) {
        throw TypeError::New(Env(), errorStringFromStatus(context.get()));
    }

    return MongoCryptContext::NewInstance(Env(), _state, std::move(context));
}

Value MongoCrypt::MakeExplicitDecryptionContext(const CallbackInfo& info) {
    Uint8Array value = Uint8ArrayFromValue(info[0], "value");

    std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> binary(Uint8ArrayToBinary(value));
    std::unique_ptr<mongocrypt_ctx_t, MongoCryptContextDeleter> context(
        mongocrypt_ctx_new(mongo_crypt()));

    if (!mongocrypt_ctx_explicit_decrypt_init(context.get(), binary.get())) {
        throw TypeError::New(Env(), errorStringFromStatus(context.get()));
    }

    return MongoCryptContext::NewInstance(Env(), _state, std::move(context));
}

Value MongoCrypt::MakeDataKeyContext(const CallbackInfo& info) {
    Uint8Array optionsBuffer = Uint8ArrayFromValue(info[0], "options");

    std::unique_ptr<mongocrypt_ctx_t, MongoCryptContextDeleter> context(
        mongocrypt_ctx_new(mongo_crypt()));
    std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> binary(
        Uint8ArrayToBinary(optionsBuffer));

    if (!mongocrypt_ctx_setopt_key_encryption_key(context.get(), binary.get())) {
        throw TypeError::New(Env(), errorStringFromStatus(context.get()));
    }

    Object options = info[1].ToObject();
    if (options.Has("keyAltNames")) {
        Napi::Value keyAltNames = options["keyAltNames"];

        if (keyAltNames.IsArray()) {
            Array keyAltNamesArray = keyAltNames.As<Array>();
            uint32_t keyAltNamesLength = keyAltNamesArray.Length();
            for (uint32_t i = 0; i < keyAltNamesLength; i += 1) {
                if (keyAltNamesArray.Has(i)) {
                    Uint8Array keyAltName =
                        Uint8ArrayFromValue(keyAltNamesArray[i], "options.keyAltName[]");

                    std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> binary(
                        Uint8ArrayToBinary(keyAltName));
                    if (!mongocrypt_ctx_setopt_key_alt_name(context.get(), binary.get())) {
                        throw TypeError::New(Env(), errorStringFromStatus(context.get()));
                    }
                }
            }
        }
    }

    if (!options.Get("keyMaterial").IsUndefined()) {
        Uint8Array keyMaterial = Uint8ArrayFromValue(options["keyMaterial"], "options.keyMaterial");

        std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> binary(
            Uint8ArrayToBinary(keyMaterial));
        if (!mongocrypt_ctx_setopt_key_material(context.get(), binary.get())) {
            throw TypeError::New(Env(), errorStringFromStatus(context.get()));
        }
    }

    if (!mongocrypt_ctx_datakey_init(context.get())) {
        throw TypeError::New(Env(), errorStringFromStatus(context.get()));
    }

    return MongoCryptContext::NewInstance(Env(), _state, std::move(context));
}

Value MongoCrypt::MakeRewrapManyDataKeyContext(const CallbackInfo& info) {
    Uint8Array filter_buffer = Uint8ArrayFromValue(info[0], "filter");

    std::unique_ptr<mongocrypt_ctx_t, MongoCryptContextDeleter> context(
        mongocrypt_ctx_new(mongo_crypt()));

    Napi::Value key_encryption_key = info[1];
    if (key_encryption_key.IsTypedArray()) {
        std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> key_binary(
            Uint8ArrayToBinary(key_encryption_key.As<Uint8Array>()));
        if (!mongocrypt_ctx_setopt_key_encryption_key(context.get(), key_binary.get())) {
            throw TypeError::New(Env(), errorStringFromStatus(context.get()));
        }
    }

    std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> filter_binary(
        Uint8ArrayToBinary(filter_buffer));
    if (!mongocrypt_ctx_rewrap_many_datakey_init(context.get(), filter_binary.get())) {
        throw TypeError::New(Env(), errorStringFromStatus(context.get()));
    }

    return MongoCryptContext::NewInstance(Env(), _state, std::move(context));
}

// Store callbacks as nested properties on the MongoCrypt binding object
// itself, and use these helpers to do so. Storing them as JS engine
// References is a big memory leak footgun.
Function MongoCrypt::GetCallback(const char* name) {
    Napi::Value storage = Value().Get("__callbackStorage");
    if (!storage.IsObject()) {
        throw Error::New(Env(), "Cannot get callbacks because none were registered");
    }
    Napi::Value entry = storage.As<Object>().Get(name);
    if (!entry.IsFunction()) {
        throw Error::New(Env(), std::string("Trying to look up unknown callback ") + name);
    }
    return entry.As<Function>();
}

void MongoCrypt::SetCallback(const char* name, Napi::Value fn) {
    if (!fn.IsFunction()) {
        throw Error::New(Env(), std::string("Storing non-function as callback ") + name);
    }

    Napi::Value storage = Value().Get("__callbackStorage");
    if (!storage.IsObject()) {
        storage = Object::New(Env());
        Value().Set("__callbackStorage", storage);
    }
    storage.As<Object>().Set(name, fn);
}

Function MongoCryptContext::Init(Napi::Env env) {
    return DefineClass(
        env,
        "MongoCryptContext",
        {InstanceMethod("nextMongoOperation", &MongoCryptContext::NextMongoOperation),
         InstanceMethod("addMongoOperationResponse", &MongoCryptContext::AddMongoOperationResponse),
         InstanceMethod("finishMongoOperation", &MongoCryptContext::FinishMongoOperation),
         InstanceMethod("nextKMSRequest", &MongoCryptContext::NextKMSRequest),
         InstanceMethod("provideKMSProviders", &MongoCryptContext::ProvideKMSProviders),
         InstanceMethod("finishKMSRequests", &MongoCryptContext::FinishKMSRequests),
         InstanceMethod("finalize", &MongoCryptContext::FinalizeContext),
         InstanceAccessor("status", &MongoCryptContext::Status, nullptr),
         InstanceAccessor("state", &MongoCryptContext::State, nullptr)});
}

mongocrypt_ctx_t* MongoCryptContext::context() {
    return _state->context.get();
}

Object MongoCryptContext::NewInstance(
    Napi::Env env,
    std::shared_ptr<MongoCrypt::State> mongo_crypt,
    std::unique_ptr<mongocrypt_ctx_t, MongoCryptContextDeleter> context) {
    InstanceData* instance_data = env.GetInstanceData<InstanceData>();
    Object obj = instance_data->MongoCryptContextCtor.Value().New({});
    MongoCryptContext* instance = MongoCryptContext::Unwrap(obj);
    *instance->_state = ContextState{mongo_crypt, std::move(context)};
    return obj;
}

MongoCryptContext::MongoCryptContext(const CallbackInfo& info) : ObjectWrap(info) {}

Value MongoCryptContext::Status(const CallbackInfo& info) {
    std::unique_ptr<mongocrypt_status_t, MongoCryptStatusDeleter> status(mongocrypt_status_new());
    mongocrypt_ctx_status(context(), status.get());
    return ExtractStatus(Env(), status.get());
}

Value MongoCryptContext::State(const CallbackInfo& info) {
    return Number::New(Env(), mongocrypt_ctx_state(context()));
}

Value MongoCryptContext::NextMongoOperation(const CallbackInfo& info) {
    std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> op_bson(mongocrypt_binary_new());
    mongocrypt_ctx_mongo_op(context(), op_bson.get());
    return BufferFromBinary(Env(), op_bson.get());
}

void MongoCryptContext::AddMongoOperationResponse(const CallbackInfo& info) {
    Uint8Array buffer = Uint8ArrayFromValue(info[0], "buffer");

    std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> reply_bson(
        Uint8ArrayToBinary(buffer));
    mongocrypt_ctx_mongo_feed(context(), reply_bson.get());
    // return value
}

void MongoCryptContext::FinishMongoOperation(const CallbackInfo& info) {
    mongocrypt_ctx_mongo_done(context());
}

void MongoCryptContext::ProvideKMSProviders(const CallbackInfo& info) {
    Uint8Array buffer = Uint8ArrayFromValue(info[0], "buffer");

    std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> kms_bson(
        Uint8ArrayToBinary(buffer));
    mongocrypt_ctx_provide_kms_providers(context(), kms_bson.get());
}

Value MongoCryptContext::NextKMSRequest(const CallbackInfo& info) {
    mongocrypt_kms_ctx_t* kms_context = mongocrypt_ctx_next_kms_ctx(context());
    if (kms_context == nullptr) {
        return Env().Null();
    } else {
        return MongoCryptKMSRequest::NewInstance(Env(), _state, kms_context);
    }
}

void MongoCryptContext::FinishKMSRequests(const CallbackInfo& info) {
    mongocrypt_ctx_kms_done(context());
}

Value MongoCryptContext::FinalizeContext(const CallbackInfo& info) {
    std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> output(mongocrypt_binary_new());
    mongocrypt_ctx_finalize(context(), output.get());
    return BufferFromBinary(Env(), output.get());
}

Function MongoCryptKMSRequest::Init(Napi::Env env) {
    return DefineClass(
        env,
        "MongoCryptKMSRequest",
        {InstanceMethod("addResponse", &MongoCryptKMSRequest::AddResponse),
         InstanceMethod("fail", &MongoCryptKMSRequest::Fail),
         InstanceAccessor("status", &MongoCryptKMSRequest::Status, nullptr),
         InstanceAccessor("bytesNeeded", &MongoCryptKMSRequest::BytesNeeded, nullptr),
         InstanceAccessor("uSleep", &MongoCryptKMSRequest::USleep, nullptr),
         InstanceAccessor("kmsProvider", &MongoCryptKMSRequest::KMSProvider, nullptr),
         InstanceAccessor("endpoint", &MongoCryptKMSRequest::Endpoint, nullptr),
         InstanceAccessor("message", &MongoCryptKMSRequest::Message, nullptr)});
}

Object MongoCryptKMSRequest::NewInstance(
    Napi::Env env,
    std::shared_ptr<MongoCryptContext::ContextState> context_state,
    mongocrypt_kms_ctx_t* kms_context) {
    InstanceData* instance_data = env.GetInstanceData<InstanceData>();
    Object obj = instance_data->MongoCryptKMSRequestCtor.Value().New({});
    MongoCryptKMSRequest* instance = MongoCryptKMSRequest::Unwrap(obj);
    instance->_context_state = context_state;
    instance->_kms_context = kms_context;
    return obj;
}

MongoCryptKMSRequest::MongoCryptKMSRequest(const CallbackInfo& info)
    : ObjectWrap(info), _kms_context(nullptr) {}

Value MongoCryptKMSRequest::Status(const CallbackInfo& info) {
    std::unique_ptr<mongocrypt_status_t, MongoCryptStatusDeleter> status(mongocrypt_status_new());
    mongocrypt_kms_ctx_status(_kms_context, status.get());
    return ExtractStatus(Env(), status.get());
}

Value MongoCryptKMSRequest::BytesNeeded(const CallbackInfo& info) {
    return Number::New(Env(), mongocrypt_kms_ctx_bytes_needed(_kms_context));
}

Value MongoCryptKMSRequest::USleep(const CallbackInfo& info) {
    return Number::New(Env(), mongocrypt_kms_ctx_usleep(_kms_context));
}

Value MongoCryptKMSRequest::Fail(const CallbackInfo& info) {
    return Boolean::New(Env(), mongocrypt_kms_ctx_fail(_kms_context));
}

Value MongoCryptKMSRequest::KMSProvider(const CallbackInfo& info) {
    return String::New(Env(), mongocrypt_kms_ctx_get_kms_provider(_kms_context, nullptr));
}

Value MongoCryptKMSRequest::Message(const CallbackInfo& info) {
    std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> message(mongocrypt_binary_new());
    mongocrypt_kms_ctx_message(_kms_context, message.get());
    return BufferFromBinary(Env(), message.get());
}

Value MongoCryptKMSRequest::Endpoint(const CallbackInfo& info) {
    std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> message(mongocrypt_binary_new());

    const char* endpoint;
    mongocrypt_kms_ctx_endpoint(_kms_context, &endpoint);
    return String::New(Env(), endpoint);
}

void MongoCryptKMSRequest::AddResponse(const CallbackInfo& info) {
    Uint8Array buffer = Uint8ArrayFromValue(info[0], "value");
    std::unique_ptr<mongocrypt_binary_t, MongoCryptBinaryDeleter> reply_bytes(
        Uint8ArrayToBinary(buffer));
    mongocrypt_kms_ctx_feed(_kms_context, reply_bytes.get());
}

static Object Init(Env env, Object exports) {
    Function MongoCryptCtor = MongoCrypt::Init(env);
    Function MongoCryptContextCtor = MongoCryptContext::Init(env);
    Function MongoCryptKMSRequestCtor = MongoCryptKMSRequest::Init(env);
    exports["MongoCrypt"] = MongoCryptCtor;
    exports["MongoCryptContextCtor"] = MongoCryptContextCtor;
    exports["MongoCryptKMSRequestCtor"] = MongoCryptKMSRequestCtor;
    env.SetInstanceData(new InstanceData{Reference<Function>::New(MongoCryptContextCtor, 1),
                                         Reference<Function>::New(MongoCryptKMSRequestCtor, 1)});
    return exports;
}

NODE_API_MODULE(mongocrypt, Init)

}  // namespace node_mongocrypt
