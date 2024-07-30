// Adapted from
// https://github.com/mongodb/libmongocrypt/blob/18cb9e4e900c45c0b9b71fd34e159f8cb29fe1de/src/crypto/libcrypto.c
// and
// https://github.com/mongodb/libmongocrypt/blob/18cb9e4e900c45c0b9b71fd34e159f8cb29fe1de/kms-message/src/kms_crypto_libcrypto.c
// This file provides native crypto hooks for OpenSSL 3 (the default since Node.js 18),
// allowing us to skip expensive round-trips between JS and C++.

#include "mongocrypt.h"

// Electron does not expose OpenSSL, so we cannot use OpenSSL
// functions directly if we're building against Electron:
// https://github.com/electron/electron/issues/13176
#ifndef MONGOCRYPT_AVOID_OPENSSL_CRYPTO
#include <openssl/crypto.h>
#include <openssl/err.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <openssl/rand.h>

#include <stdexcept>

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

#undef ASSERT
#undef STRINGIFY
#define STRINGIFY(x) #x
#define ASSERT(x)                                                             \
    do {                                                                      \
        if (!(x)) {                                                           \
            throw std::runtime_error("Assertion failed: " #x " (at " __FILE__ \
                                     ":" STRINGIFY(__LINE__) ")");            \
        }                                                                     \
    } while (0)

// Helpers to easily access OpenSSL symbols in a type-safe way.
#ifdef MONGO_CLIENT_ENCRYPTION_STATIC_OPENSSL
#define S_Unchecked(x) (x)
#define S(x) S_Unchecked(x)
#else
#define S_Unchecked(x)                                                           \
    ([&]() {                                                                     \
        static void* const sym = node_mongocrypt::opensslcrypto::opensslsym(#x); \
        return reinterpret_cast<decltype(x)*>(sym);                              \
    })()
#define S(x)                                                                       \
    ([&]() {                                                                       \
        static auto* sym = S_Unchecked(x);                                         \
        if (!sym)                                                                  \
            throw new std::runtime_error("Unable to look up OpenSSL symbol: " #x); \
        return sym;                                                                \
    })()
#endif

// While we target OpenSSL 3 here, we still need to support building on
// Node.js versions that support OpenSSL 1.1. These three functions
// changed in definition between these versions, so we explicitly spell out
// their OpenSSL 3 prototypes.
extern "C" {
#undef EVP_CIPHER_get_iv_length
int EVP_CIPHER_get_iv_length(const EVP_CIPHER* cipher);
#undef EVP_CIPHER_get_key_length
int EVP_CIPHER_get_key_length(const EVP_CIPHER* cipher);
#undef EVP_DigestSignUpdate
int EVP_DigestSignUpdate(EVP_MD_CTX* ctx, const void* data, size_t dsize);
}

namespace node_mongocrypt {
namespace opensslcrypto {

void* opensslsym(const char* symname);

// Helper to use RAII together with C cleanup functions.
template <typename T>
struct CleanupImpl {
    T fn;
    bool active;

    CleanupImpl(T&& fn) : fn(std::move(fn)), active(true) {}
    ~CleanupImpl() {
        if (active)
            fn();
    }

    CleanupImpl(const CleanupImpl&) = delete;
    CleanupImpl& operator=(const CleanupImpl&) = delete;
    CleanupImpl(CleanupImpl&& other) : fn(std::move(other.fn)), active(true) {
        other.active = false;
    }
};
template <typename T>
CleanupImpl<T> Cleanup(T&& fn) {
    return CleanupImpl<T>{std::move(fn)};
}

static bool set_status_from_openssl(mongocrypt_status_t* status, const char* base_error) {
    std::string error_message = base_error;
    error_message += ": ";
    error_message += S(ERR_error_string)(S(ERR_get_error)(), nullptr);
    mongocrypt_status_set(status,
                          MONGOCRYPT_STATUS_ERROR_CLIENT,
                          1,
                          error_message.c_str(),
                          error_message.length() + 1);
    return false;
}

/* encrypt_with_cipher encrypts @in with the OpenSSL cipher specified by
 * @Cipher.
 * @key is the input key. @iv is the input IV.
 * @out is the output ciphertext. @out must be allocated by the caller with
 * enough room for the ciphertext.
 * @bytes_written is the number of bytes that were written to @out.
 * Returns false and sets @status on error. @status is required. */
template <typename Cipher>
bool encrypt_with_cipher(void* unused_ctx,
                         mongocrypt_binary_t* key,
                         mongocrypt_binary_t* iv,
                         mongocrypt_binary_t* in,
                         mongocrypt_binary_t* out,
                         uint32_t* bytes_written,
                         mongocrypt_status_t* status) {
    int intermediate_bytes_written = 0;

    const EVP_CIPHER* cipher = Cipher::Get();
    EVP_CIPHER_CTX* ctx = S(EVP_CIPHER_CTX_new)();
    auto cleanup_ctx = Cleanup([&]() { S(EVP_CIPHER_CTX_free)(ctx); });

    ASSERT(key);
    ASSERT(in);
    ASSERT(out);
    ASSERT(ctx);
    ASSERT(cipher);
    ASSERT(nullptr == iv || static_cast<uint32_t>(S(EVP_CIPHER_get_iv_length)(cipher)) == iv->len);
    ASSERT(static_cast<uint32_t>(S(EVP_CIPHER_get_key_length)(cipher)) == key->len);
    ASSERT(in->len <= INT_MAX);

    if (!S(EVP_EncryptInit_ex)(ctx,
                               cipher,
                               nullptr /* engine */,
                               static_cast<unsigned char*>(key->data),
                               nullptr == iv ? nullptr : static_cast<unsigned char*>(iv->data))) {
        return set_status_from_openssl(status, "error in EVP_EncryptInit_ex");
    }

    /* Disable the default OpenSSL padding. */
    S(EVP_CIPHER_CTX_set_padding)(ctx, 0);

    *bytes_written = 0;
    if (!S(EVP_EncryptUpdate)(ctx,
                              static_cast<unsigned char*>(out->data),
                              &intermediate_bytes_written,
                              static_cast<unsigned char*>(in->data),
                              static_cast<int>(in->len))) {
        return set_status_from_openssl(status, "error in EVP_EncryptUpdate");
    }

    ASSERT(intermediate_bytes_written >= 0 &&
           static_cast<uint64_t>(intermediate_bytes_written) <= UINT32_MAX);
    /* intermediate_bytes_written cannot be negative, so int -> uint32_t is OK */
    *bytes_written = static_cast<uint32_t>(intermediate_bytes_written);

    if (!S(EVP_EncryptFinal_ex)(
            ctx, static_cast<unsigned char*>(out->data), &intermediate_bytes_written)) {
        return set_status_from_openssl(status, "error in EVP_EncryptFinal_ex");
    }

    ASSERT(UINT32_MAX - *bytes_written >= static_cast<uint32_t>(intermediate_bytes_written));
    *bytes_written += static_cast<uint32_t>(intermediate_bytes_written);

    return true;
}

/* decrypt_with_cipher decrypts @in with the OpenSSL cipher specified by
 * @Cipher.
 * @key is the input key. @iv is the input IV.
 * @out is the output plaintext. @out must be allocated by the caller with
 * enough room for the plaintext.
 * @bytes_written is the number of bytes that were written to @out.
 * Returns false and sets @status on error. @status is required. */
template <typename Cipher>
bool decrypt_with_cipher(void* unused_ctx,
                         mongocrypt_binary_t* key,
                         mongocrypt_binary_t* iv,
                         mongocrypt_binary_t* in,
                         mongocrypt_binary_t* out,
                         uint32_t* bytes_written,
                         mongocrypt_status_t* status) {
    int intermediate_bytes_written = 0;

    const EVP_CIPHER* cipher = Cipher::Get();
    EVP_CIPHER_CTX* ctx = S(EVP_CIPHER_CTX_new)();
    auto cleanup_ctx = Cleanup([&]() { S(EVP_CIPHER_CTX_free)(ctx); });
    ASSERT(ctx);

    ASSERT(cipher);
    ASSERT(iv);
    ASSERT(key);
    ASSERT(in);
    ASSERT(out);
    ASSERT(static_cast<uint32_t>(S(EVP_CIPHER_get_iv_length)(cipher)) == iv->len);
    ASSERT(static_cast<uint32_t>(S(EVP_CIPHER_get_key_length)(cipher)) == key->len);
    ASSERT(in->len <= INT_MAX);

    if (!S(EVP_DecryptInit_ex)(ctx,
                               cipher,
                               nullptr /* engine */,
                               static_cast<unsigned char*>(key->data),
                               static_cast<unsigned char*>(iv->data))) {
        return set_status_from_openssl(status, "error in EVP_DecryptInit_ex");
    }

    /* Disable padding. */
    S(EVP_CIPHER_CTX_set_padding)(ctx, 0);

    *bytes_written = 0;

    if (!S(EVP_DecryptUpdate)(ctx,
                              static_cast<unsigned char*>(out->data),
                              &intermediate_bytes_written,
                              static_cast<unsigned char*>(in->data),
                              static_cast<int>(in->len))) {
        return set_status_from_openssl(status, "error in EVP_DecryptUpdate");
    }

    ASSERT(intermediate_bytes_written >= 0 &&
           static_cast<uint64_t>(intermediate_bytes_written) <= UINT32_MAX);
    /* intermediate_bytes_written cannot be negative, so int -> uint32_t is OK */
    *bytes_written = static_cast<uint32_t>(intermediate_bytes_written);

    if (!S(EVP_DecryptFinal_ex)(
            ctx, static_cast<unsigned char*>(out->data), &intermediate_bytes_written)) {
        return set_status_from_openssl(status, "error in EVP_DecryptFinal_ex");
    }

    ASSERT(UINT32_MAX - *bytes_written >= static_cast<uint32_t>(intermediate_bytes_written));
    *bytes_written += static_cast<uint32_t>(intermediate_bytes_written);
    return true;
}

/* hmac_with_hash computes an HMAC of @in with the OpenSSL hash specified by
 * @Hash.
 * @key is the input key.
 * @out is the output. @out must be allocated by the caller with
 * the exact length for the output. E.g. for HMAC 256, @out->len must be 32.
 * Returns false and sets @status on error. @status is required. */
template <typename Hash>
bool hmac_with_hash(void* unused_ctx,
                    mongocrypt_binary_t* key,
                    mongocrypt_binary_t* in,
                    mongocrypt_binary_t* out,
                    mongocrypt_status_t* status) {
    const EVP_MD* hash = Hash::Get();
    ASSERT(hash);
    ASSERT(key);
    ASSERT(in);
    ASSERT(out);

    if (!S(HMAC)(hash,
                 key->data,
                 static_cast<int>(key->len),
                 static_cast<unsigned char*>(in->data),
                 in->len,
                 static_cast<unsigned char*>(out->data),
                 nullptr /* unused out len */)) {
        return set_status_from_openssl(status, "error initializing HMAC");
    }
    return true;
}

bool random_fn(void* unused_ctx,
               mongocrypt_binary_t* out,
               uint32_t count,
               mongocrypt_status_t* status) {
    ASSERT(out);
    ASSERT(count <= INT_MAX);

    int ret = S(RAND_bytes)(static_cast<unsigned char*>(out->data), static_cast<int>(count));
    /* From man page: "RAND_bytes() and RAND_priv_bytes() return 1 on success, -1
     * if not supported by the current RAND method, or 0 on other failure. The
     * error code can be obtained by ERR_get_error(3)" */
    if (ret == -1) {
        return set_status_from_openssl(status, "secure random IV not supported");
    } else if (ret == 0) {
        return set_status_from_openssl(status, "failed to generate random");
    }
    return true;
}

template <typename Hash>
bool compute_hash(void* unused_ctx,
                  mongocrypt_binary_t* in,
                  mongocrypt_binary_t* out,
                  mongocrypt_status_t* status) {
    const EVP_MD* hash = Hash::Get();
    ASSERT(hash);

    EVP_MD_CTX* digest_ctxp = S(EVP_MD_CTX_new)();
    auto cleanup_ctx = Cleanup([&]() { S(EVP_MD_CTX_free)(digest_ctxp); });

    if (!S(EVP_DigestInit_ex)(digest_ctxp, hash, nullptr)) {
        return set_status_from_openssl(status, "error in EVP_DigestInit_ex");
    }

    if (!S(EVP_DigestUpdate)(digest_ctxp, static_cast<unsigned char*>(in->data), in->len)) {
        return set_status_from_openssl(status, "error in EVP_DigestUpdate");
    }

    if (!S(EVP_DigestFinal_ex)(digest_ctxp, static_cast<unsigned char*>(out->data), nullptr)) {
        return set_status_from_openssl(status, "error in EVP_DigestFinal_ex");
    }

    return true;
}

template <typename Hash>
bool sign_rsa(void* unused_ctx,
              mongocrypt_binary_t* key,
              mongocrypt_binary_t* in,
              mongocrypt_binary_t* out,
              mongocrypt_status_t* status) {
    const EVP_MD* hash = Hash::Get();

    ASSERT(hash);
    ASSERT(key);
    ASSERT(in);
    ASSERT(out);
    ASSERT(status);

    EVP_PKEY* pkey = nullptr;
    size_t signature_out_len = 256;

    EVP_MD_CTX* ctx = S(EVP_MD_CTX_new)();
    auto cleanup_ctx = Cleanup([&]() { S(EVP_MD_CTX_free)(ctx); });
    ASSERT(key->len <= LONG_MAX);
    const unsigned char* key_data = static_cast<unsigned char*>(key->data);
    pkey = S(d2i_PrivateKey)(EVP_PKEY_RSA, nullptr, &key_data, static_cast<long>(key->len));
    auto cleanup_pkey = Cleanup([&]() { S(EVP_PKEY_free)(pkey); });
    if (!pkey) {
        return set_status_from_openssl(status, "error in d2i_PrivateKey");
    }

    if (!S(EVP_DigestSignInit)(ctx, nullptr, hash, nullptr /* engine */, pkey)) {
        return set_status_from_openssl(status, "error in EVP_DigestSignInit");
    }

    if (!S(EVP_DigestSignUpdate)(ctx, static_cast<unsigned char*>(in->data), in->len)) {
        return set_status_from_openssl(status, "error in EVP_DigestSignUpdate");
    }

    if (!S(EVP_DigestSignFinal)(ctx, static_cast<unsigned char*>(out->data), &signature_out_len)) {
        return set_status_from_openssl(status, "error in EVP_DigestSignFinal");
    }

    return true;
}

void* opensslsym(const char* name) {
    struct OwnProcessDylib {
        bool initialized = false;
#ifdef _WIN32
        HMODULE lib;

        OwnProcessDylib() {
            lib = GetModuleHandle(nullptr);
        }

        void* sym(const char* name) {
            return reinterpret_cast<void*>(reinterpret_cast<uintptr_t>(GetProcAddress(lib, name)));
        }
#else
        void* lib = nullptr;

        OwnProcessDylib() {
            lib = dlopen(nullptr, RTLD_NOW);
        }

        ~OwnProcessDylib() {
            dlclose(lib);
        }

        void* sym(const char* name) {
            return reinterpret_cast<void*>(dlsym(lib, name));
        }
#endif
    };
    static OwnProcessDylib dl;
    if (!dl.lib) {
        throw new std::runtime_error("Could not open process handle");
    }

    return dl.sym(name);
}

std::unique_ptr<CryptoHooks> createOpenSSLCryptoHooks() {
    auto version_num_fn = S_Unchecked(OpenSSL_version_num);
    if (!version_num_fn)
        return {};
    unsigned long openssl_version = version_num_fn();  // 0xMNN00PP0L
    // Check that OpenSSL version is in [3.0.0, 4.0.0)
    if (openssl_version < 0x30000000L || openssl_version >= 0x40000000L)
        return {};

    struct AES256CBC {
        static const EVP_CIPHER* Get() {
            return S(EVP_aes_256_cbc)();
        }
    };
    struct AES256ECB {
        static const EVP_CIPHER* Get() {
            return S(EVP_aes_256_ecb)();
        }
    };
    struct AES256CTR {
        static const EVP_CIPHER* Get() {
            return S(EVP_aes_256_ctr)();
        }
    };
    struct SHA512 {
        static const EVP_MD* Get() {
            return S(EVP_sha512)();
        }
    };
    struct SHA256 {
        static const EVP_MD* Get() {
            return S(EVP_sha256)();
        }
    };

    return std::make_unique<CryptoHooks>(CryptoHooks{"native_openssl",
                                                     encrypt_with_cipher<AES256CBC>,
                                                     decrypt_with_cipher<AES256CBC>,
                                                     random_fn,
                                                     hmac_with_hash<SHA512>,
                                                     hmac_with_hash<SHA256>,
                                                     compute_hash<SHA256>,
                                                     encrypt_with_cipher<AES256CTR>,
                                                     decrypt_with_cipher<AES256CTR>,
                                                     encrypt_with_cipher<AES256ECB>,
                                                     sign_rsa<SHA256>,
                                                     nullptr});
}

}  // namespace opensslcrypto
}  // namespace node_mongocrypt

#else   // MONGOCRYPT_AVOID_OPENSSL_CRYPTO
namespace node_mongocrypt {
namespace opensslcrypto {
std::unique_ptr<CryptoHooks> createOpenSSLCryptoHooks() {
    return {};
}
}  // namespace opensslcrypto
}  // namespace node_mongocrypt
#endif  // MONGOCRYPT_AVOID_OPENSSL_CRYPTO
