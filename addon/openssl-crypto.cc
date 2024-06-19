#include "mongocrypt.h"

// Adapted from https://github.com/mongodb/libmongocrypt/blob/18cb9e4e900c45c0b9b71fd34e159f8cb29fe1de/src/crypto/libcrypto.c
// and https://github.com/mongodb/libmongocrypt/blob/18cb9e4e900c45c0b9b71fd34e159f8cb29fe1de/kms-message/src/kms_crypto_libcrypto.c

#include <openssl/crypto.h>
#include <openssl/err.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <openssl/rand.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

#undef ASSERT
#undef STRINGIFY
#define STRINGIFY(x) #x
#define ASSERT(x) do { \
    if (!(x)) { \
        throw std::runtime_error("Assertion failed: " #x " (at " __FILE__ ":" STRINGIFY(__LINE__) ")"); \
    } \
  } while(0)

#ifdef MONGO_CLIENT_ENCRYPTION_STATIC_OPENSSL
#define S_Unchecked(x) (x)
#define S(x) S_Unchecked(x)
#else
#define S_Unchecked(x) \
    ([&]() { \
        static void* const sym = node_mongocrypt::opensslcrypto::opensslsym(#x); \
        return reinterpret_cast<decltype(x)*>(sym); \
    })()
#define S(x) ([&]() { \
        static auto* sym = S_Unchecked(x); \
        if (!sym) throw new std::runtime_error("Unable to look up OpenSSL symbol: " #x ); \
        return sym; \
    })()
#endif

extern "C" {
#undef EVP_CIPHER_get_iv_length
int EVP_CIPHER_get_iv_length(const EVP_CIPHER *cipher);
#undef EVP_CIPHER_get_key_length
int EVP_CIPHER_get_key_length(const EVP_CIPHER *cipher);
#undef EVP_DigestSignUpdate
int EVP_DigestSignUpdate(EVP_MD_CTX *ctx, const void *data, size_t dsize);
}

namespace node_mongocrypt {
namespace opensslcrypto {

void* opensslsym(const char* symname);

template<typename T>
struct CleanupImpl {
    T fn;
    bool active;

    CleanupImpl(T&& fn): fn(std::move(fn)), active(true) {}
    ~CleanupImpl() { if (active) fn(); }

    CleanupImpl(const CleanupImpl&) = delete;
    CleanupImpl& operator=(const CleanupImpl&) = delete;
    CleanupImpl(CleanupImpl&& other): fn(std::move(other.fn)), active(true) {
        other.active = false;
    }
};

template<typename T>
CleanupImpl<T> Cleanup(T&& fn) {
  return CleanupImpl<T>{ std::move(fn) };
}

/* _encrypt_with_cipher encrypts @in with the OpenSSL cipher specified by
 * @cipher.
 * @key is the input key. @iv is the input IV.
 * @out is the output ciphertext. @out must be allocated by the caller with
 * enough room for the ciphertext.
 * @bytes_written is the number of bytes that were written to @out.
 * Returns false and sets @status on error. @status is required. */
static bool _encrypt_with_cipher(const EVP_CIPHER *cipher, mongocrypt_binary_t* key,
                                        mongocrypt_binary_t* iv,
                                        mongocrypt_binary_t* in,
                                        mongocrypt_binary_t* out,
                                        uint32_t* bytes_written,
                                        mongocrypt_status_t* status) {
    EVP_CIPHER_CTX *ctx;
    int intermediate_bytes_written = 0;

    ctx = S(EVP_CIPHER_CTX_new)();
    auto cleanup_ctx = Cleanup([&]() { S(EVP_CIPHER_CTX_free)(ctx); });

    ASSERT(key);
    ASSERT(in);
    ASSERT(out);
    ASSERT(ctx);
    ASSERT(cipher);
    ASSERT(nullptr == iv || (uint32_t)S(EVP_CIPHER_get_iv_length)(cipher) == iv->len);
    ASSERT((uint32_t)S(EVP_CIPHER_get_key_length)(cipher) == key->len);
    ASSERT(in->len <= INT_MAX);

    if (!S(EVP_EncryptInit_ex)(ctx, cipher, nullptr /* engine */, (unsigned char*)key->data, nullptr == iv ? nullptr : (unsigned char*)iv->data)) {
        std::string errorMessage = "error in EVP_EncryptInit_ex: ";
        errorMessage += S(ERR_error_string)(S(ERR_get_error)(), nullptr);
        mongocrypt_status_set(
            status, MONGOCRYPT_STATUS_ERROR_CLIENT, 1, errorMessage.c_str(), errorMessage.length() + 1);
        return false;
    }

    /* Disable the default OpenSSL padding. */
    S(EVP_CIPHER_CTX_set_padding)(ctx, 0);

    *bytes_written = 0;
    if (!S(EVP_EncryptUpdate)(ctx, (unsigned char*)out->data, &intermediate_bytes_written, (unsigned char*)in->data, (int)in->len)) {
        std::string errorMessage = "error in EVP_EncryptUpdate: ";
        errorMessage += S(ERR_error_string)(S(ERR_get_error)(), nullptr);
        mongocrypt_status_set(
            status, MONGOCRYPT_STATUS_ERROR_CLIENT, 1, errorMessage.c_str(), errorMessage.length() + 1);
        return false;
    }

    ASSERT(intermediate_bytes_written >= 0 && (uint64_t)intermediate_bytes_written <= UINT32_MAX);
    /* intermediate_bytes_written cannot be negative, so int -> uint32_t is OK */
    *bytes_written = (uint32_t)intermediate_bytes_written;

    if (!S(EVP_EncryptFinal_ex)(ctx, (unsigned char*)out->data, &intermediate_bytes_written)) {
        std::string errorMessage = "error in EVP_EncryptFinal_ex: ";
        errorMessage += S(ERR_error_string)(S(ERR_get_error)(), nullptr);
        mongocrypt_status_set(
            status, MONGOCRYPT_STATUS_ERROR_CLIENT, 1, errorMessage.c_str(), errorMessage.length() + 1);
        return false;
    }

    ASSERT(UINT32_MAX - *bytes_written >= (uint32_t)intermediate_bytes_written);
    *bytes_written += (uint32_t)intermediate_bytes_written;

    return true;
}

/* _decrypt_with_cipher decrypts @in with the OpenSSL cipher specified by
 * @cipher.
 * @key is the input key. @iv is the input IV.
 * @out is the output plaintext. @out must be allocated by the caller with
 * enough room for the plaintext.
 * @bytes_written is the number of bytes that were written to @out.
 * Returns false and sets @status on error. @status is required. */
static bool _decrypt_with_cipher(const EVP_CIPHER *cipher, mongocrypt_binary_t* key,
                                        mongocrypt_binary_t* iv,
                                        mongocrypt_binary_t* in,
                                        mongocrypt_binary_t* out,
                                        uint32_t* bytes_written,
                                        mongocrypt_status_t* status) {
    EVP_CIPHER_CTX *ctx;
    int intermediate_bytes_written = 0;

    ctx = S(EVP_CIPHER_CTX_new)();
    auto cleanup_ctx = Cleanup([&]() { S(EVP_CIPHER_CTX_free)(ctx); });
    ASSERT(ctx);

    ASSERT(cipher);
    ASSERT(iv);
    ASSERT(key);
    ASSERT(in);
    ASSERT(out);
    ASSERT((uint32_t)S(EVP_CIPHER_get_iv_length)(cipher) == iv->len);
    ASSERT((uint32_t)S(EVP_CIPHER_get_key_length)(cipher) == key->len);
    ASSERT(in->len <= INT_MAX);

    if (!S(EVP_DecryptInit_ex)(ctx, cipher, nullptr /* engine */, (unsigned char*)key->data, (unsigned char*)iv->data)) {
        std::string errorMessage = "error in EVP_DecryptInit_ex: ";
        errorMessage += S(ERR_error_string)(S(ERR_get_error)(), nullptr);
        mongocrypt_status_set(
            status, MONGOCRYPT_STATUS_ERROR_CLIENT, 1, errorMessage.c_str(), errorMessage.length() + 1);
        return false;
    }

    /* Disable padding. */
    S(EVP_CIPHER_CTX_set_padding)(ctx, 0);

    *bytes_written = 0;

    if (!S(EVP_DecryptUpdate)(ctx, (unsigned char*)out->data, &intermediate_bytes_written, (unsigned char*)in->data, (int)in->len)) {
        std::string errorMessage = "error in EVP_DecryptUpdate: ";
        errorMessage += S(ERR_error_string)(S(ERR_get_error)(), nullptr);
        mongocrypt_status_set(
            status, MONGOCRYPT_STATUS_ERROR_CLIENT, 1, errorMessage.c_str(), errorMessage.length() + 1);
        return false;
    }

    ASSERT(intermediate_bytes_written >= 0 && (uint64_t)intermediate_bytes_written <= UINT32_MAX);
    /* intermediate_bytes_written cannot be negative, so int -> uint32_t is OK */
    *bytes_written = (uint32_t)intermediate_bytes_written;

    if (!S(EVP_DecryptFinal_ex)(ctx, (unsigned char*)out->data, &intermediate_bytes_written)) {
        std::string errorMessage = "error in EVP_DecryptFinal_ex: ";
        errorMessage += S(ERR_error_string)(S(ERR_get_error)(), nullptr);
        mongocrypt_status_set(
            status, MONGOCRYPT_STATUS_ERROR_CLIENT, 1, errorMessage.c_str(), errorMessage.length() + 1);
        return false;
    }

    ASSERT(UINT32_MAX - *bytes_written >= (uint32_t)intermediate_bytes_written);
    *bytes_written += (uint32_t)intermediate_bytes_written;
    return true;
}

bool aes_256_cbc_encrypt(void* ctx,
                                  mongocrypt_binary_t* key,
                                  mongocrypt_binary_t* iv,
                                  mongocrypt_binary_t* in,
                                  mongocrypt_binary_t* out,
                                  uint32_t* bytes_written,
                                  mongocrypt_status_t* status) {
    return _encrypt_with_cipher(S(EVP_aes_256_cbc)(), key, iv, in, out, bytes_written, status);
}

bool aes_256_cbc_decrypt(void* ctx,
                                  mongocrypt_binary_t* key,
                                  mongocrypt_binary_t* iv,
                                  mongocrypt_binary_t* in,
                                  mongocrypt_binary_t* out,
                                  uint32_t* bytes_written,
                                  mongocrypt_status_t* status) {
    return _decrypt_with_cipher(S(EVP_aes_256_cbc)(), key, iv, in, out, bytes_written, status);
}

bool aes_256_ecb_encrypt(void* ctx,
                                  mongocrypt_binary_t* key,
                                  mongocrypt_binary_t* iv,
                                  mongocrypt_binary_t* in,
                                  mongocrypt_binary_t* out,
                                  uint32_t* bytes_written,
                                  mongocrypt_status_t* status) {
    return _encrypt_with_cipher(S(EVP_aes_256_ecb)(), key, iv, in, out, bytes_written, status);
}

/* _hmac_with_hash computes an HMAC of @in with the OpenSSL hash specified by
 * @hash.
 * @key is the input key.
 * @out is the output. @out must be allocated by the caller with
 * the exact length for the output. E.g. for HMAC 256, @out->len must be 32.
 * Returns false and sets @status on error. @status is required. */
static bool _hmac_with_hash(const EVP_MD *hash,
                            mongocrypt_binary_t *key,
                            mongocrypt_binary_t *in,
                            mongocrypt_binary_t *out,
                            mongocrypt_status_t *status) {
    ASSERT(hash);
    ASSERT(key);
    ASSERT(in);
    ASSERT(out);
    ASSERT(key->len <= INT_MAX);

    if (!S(HMAC)(hash, key->data, (int)key->len, (unsigned char*)in->data, in->len, (unsigned char*)out->data, nullptr /* unused out len */)) {
        std::string errorMessage = "error initializing HMAC: ";
        errorMessage += S(ERR_error_string)(S(ERR_get_error)(), nullptr);
        mongocrypt_status_set(
            status, MONGOCRYPT_STATUS_ERROR_CLIENT, 1, errorMessage.c_str(), errorMessage.length() + 1);
        return false;
    }
    return true;
}

bool hmac_sha_512(void* ctx,
                mongocrypt_binary_t *key,
                mongocrypt_binary_t *in,
                mongocrypt_binary_t *out,
                mongocrypt_status_t *status) {
    return _hmac_with_hash(S(EVP_sha512)(), key, in, out, status);
}

bool hmac_sha_256(void* ctx,
                mongocrypt_binary_t *key,
                mongocrypt_binary_t *in,
                mongocrypt_binary_t *out,
                mongocrypt_status_t *status) {
    return _hmac_with_hash(S(EVP_sha256)(), key, in, out, status);
}

bool random_fn(void* ctx,
                           mongocrypt_binary_t* out,
                           uint32_t count,
                           mongocrypt_status_t* status) {
    ASSERT(out);
    ASSERT(count <= INT_MAX);

    int ret = S(RAND_bytes)((unsigned char*)out->data, (int)count);
    /* From man page: "RAND_bytes() and RAND_priv_bytes() return 1 on success, -1
     * if not supported by the current RAND method, or 0 on other failure. The
     * error code can be obtained by ERR_get_error(3)" */
    if (ret == -1) {
        std::string errorMessage = "secure random IV not supported: ";
        errorMessage += S(ERR_error_string)(S(ERR_get_error)(), nullptr);
        mongocrypt_status_set(
            status, MONGOCRYPT_STATUS_ERROR_CLIENT, 1, errorMessage.c_str(), errorMessage.length() + 1);
        return false;
    } else if (ret == 0) {
        std::string errorMessage = "failed to generate random: ";
        errorMessage += S(ERR_error_string)(S(ERR_get_error)(), nullptr);
        mongocrypt_status_set(
            status, MONGOCRYPT_STATUS_ERROR_CLIENT, 1, errorMessage.c_str(), errorMessage.length() + 1);
        return false;
    }
    return true;
}

bool aes_256_ctr_encrypt(void* ctx,
                                        mongocrypt_binary_t* key,
                                        mongocrypt_binary_t* iv,
                                        mongocrypt_binary_t* in,
                                        mongocrypt_binary_t* out,
                                        uint32_t* bytes_written,
                                        mongocrypt_status_t* status) {
    return _encrypt_with_cipher(S(EVP_aes_256_ctr)(), key, iv, in, out, bytes_written, status);
}

bool aes_256_ctr_decrypt(void* ctx,
                                        mongocrypt_binary_t* key,
                                        mongocrypt_binary_t* iv,
                                        mongocrypt_binary_t* in,
                                        mongocrypt_binary_t* out,
                                        uint32_t* bytes_written,
                                        mongocrypt_status_t* status) {
    return _decrypt_with_cipher(S(EVP_aes_256_ctr)(), key, iv, in, out, bytes_written, status);
}

bool _native_crypto_hmac_sha_256(void* ctx,
                                 mongocrypt_binary_t *key,
                                 mongocrypt_binary_t *in,
                                 mongocrypt_binary_t *out,
                                 mongocrypt_status_t *status) {
    return _hmac_with_hash(S(EVP_sha256)(), key, in, out, status);
}

bool
sha_256 (void* ctx,
         mongocrypt_binary_t* in,
         mongocrypt_binary_t* out,
         mongocrypt_status_t* status)
{

    EVP_MD_CTX *digest_ctxp = S(EVP_MD_CTX_new) ();
    auto cleanup_ctx = Cleanup([&]() { S(EVP_MD_CTX_free)(digest_ctxp); });

    if (1 != S(EVP_DigestInit_ex) (digest_ctxp, S(EVP_sha256) (), nullptr)) {
       return false;
    }

    if (1 != S(EVP_DigestUpdate) (digest_ctxp, (unsigned char*)in->data, in->len)) {
       return false;
    }

    return (1 == S(EVP_DigestFinal_ex) (digest_ctxp, (unsigned char*)out->data, nullptr));
}

bool
sign_rsa_sha256 (void *unused_ctx,
                 mongocrypt_binary_t *key,
                 mongocrypt_binary_t *in,
                 mongocrypt_binary_t *out,
                 mongocrypt_status_t *status)
{
    ASSERT(key);
    ASSERT(in);
    ASSERT(out);
    ASSERT(status);

    EVP_MD_CTX *ctx;
    EVP_PKEY *pkey = nullptr;
    bool ret = false;
    size_t signature_out_len = 256;

    ctx = S(EVP_MD_CTX_new) ();
    auto cleanup_ctx = Cleanup([&]() { S(EVP_MD_CTX_free) (ctx); });
    ASSERT (key->len <= LONG_MAX);
    pkey = S(d2i_PrivateKey) (EVP_PKEY_RSA,
                           nullptr,
                           (const unsigned char **) key->data,
                           (long) key->len);
    auto cleanup_pkey = Cleanup([&]() { S(EVP_PKEY_free) (pkey); });
    if (!pkey) return false;

    ret = S(EVP_DigestSignInit) (ctx, nullptr, S(EVP_sha256) (), nullptr /* engine */, pkey);
    if (ret != 1) {
        return false;
    }

    ret = S(EVP_DigestSignUpdate) (ctx, (unsigned char*)in->data, in->len);
    if (ret != 1) {
        return false;
    }

    ret = S(EVP_DigestSignFinal) (ctx, (unsigned char*)out->data, &signature_out_len);
    if (ret != 1) {
        return false;
    }

    return true;
}


void* opensslsym(const char* name) {
    static struct OwnProcessDylib {
        bool initialized = false;
#ifdef _WIN32
        HMODULE lib;

        OwnProcessDylib() {
            lib = GetModuleHandle(nullptr);
            if (!lib) {
                throw new std::runtime_error("Could not open process handle");
            }
        }

        void* sym(const char* name) {
            return (void*)(uintptr_t) GetProcAddress(lib, name);
        }
#else
        void* lib = nullptr;

        OwnProcessDylib() {
            lib = dlopen(nullptr, RTLD_NOW);
            if (!lib) {
                throw new std::runtime_error("Could not open process handle");
            }
        }

        ~OwnProcessDylib() {
            dlclose(lib);
        }

        void* sym(const char* name) {
            return (void*)dlsym(lib, name);
        }
#endif
    } dl;

    return dl.sym(name);
}

std::unique_ptr<CryptoHooks> createOpenSSLCryptoHooks() {
    auto version_num_fn = S_Unchecked(OpenSSL_version_num);
    if (!version_num_fn) return {};
    unsigned long openssl_version = version_num_fn(); // 0xMNN00PP0L
    // [3.0.0, 4.0.0)
    if (openssl_version < 0x30000000L || openssl_version >= 0x40000000L) return {};

    return std::make_unique<CryptoHooks>(CryptoHooks {
        "native_openssl",
        aes_256_cbc_encrypt,
        aes_256_cbc_decrypt,
        random_fn,
        hmac_sha_512,
        hmac_sha_256,
        sha_256,
        aes_256_ctr_encrypt,
        aes_256_ctr_decrypt,
        nullptr,
        sign_rsa_sha256,
        nullptr
    });
}

}
}
