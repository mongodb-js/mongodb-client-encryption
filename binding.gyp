{
  'targets': [{
    'target_name': 'mongocrypt',
    'type': 'loadable_module',
    'include_dirs': [
        "<!(node -p \"require('node-addon-api').include_dir\")",
    ],
    'variables': {
      'ARCH': '<(host_arch)',
      'libmongocrypt_link_type%': 'static',
      'mongocrypt_avoid_openssl_crypto%': 'false',
      'built_with_electron%': 0
    },
    'sources': [
      'addon/mongocrypt.cc',
      'addon/openssl-crypto.cc'
    ],
    'xcode_settings': {
      'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
      'CLANG_CXX_LIBRARY': 'libc++',
      'MACOSX_DEPLOYMENT_TARGET': '10.12',
      'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES', # -fvisibility=hidden
    },
    'cflags!': [ '-fno-exceptions' ],
    'cflags_cc!': [ '-fno-exceptions' ],
    'msvs_settings': {
      'VCCLCompilerTool': { 'ExceptionHandling': 1 },
    },
    'conditions': [
      ['mongocrypt_avoid_openssl_crypto=="true" or built_with_electron==1', { 'defines': ['MONGOCRYPT_AVOID_OPENSSL_CRYPTO'] }],
      ['OS=="mac"', { 'cflags+': ['-fvisibility=hidden'] }],
      ['_type!="static_library" and ARCH=="arm64"', {
          'xcode_settings': {
            "OTHER_CFLAGS": [
              "-arch x86_64",
              "-arch arm64"
            ],
            "OTHER_LDFLAGS": [
              "-arch x86_64",
              "-arch arm64"
            ]
          }
      }],
      ['libmongocrypt_link_type=="dynamic"', {
        'link_settings': { 'libraries': ['-lmongocrypt'] }
      }],
      ['libmongocrypt_link_type=="static"', {
        'conditions': [
          ['OS!="win"', {
            'include_dirs': [
              '<(module_root_dir)/deps/include'
            ],
            'link_settings': {
              'libraries': [
                '<(module_root_dir)/deps/lib/libmongocrypt-static.a',
                '<(module_root_dir)/deps/lib/libkms_message-static.a',
                '<(module_root_dir)/deps/lib/libbson-static-for-libmongocrypt.a'
              ]
            }
          }],
          ['OS=="win"', {
            'defines': [ 'MONGOCRYPT_STATIC_DEFINE' ],
            'include_dirs': [
              '<(module_root_dir)/deps/include'
            ],
            'link_settings': {
              'libraries': [
                '<(module_root_dir)/deps/lib/mongocrypt-static.lib',
                '<(module_root_dir)/deps/lib/kms_message-static.lib',
                '<(module_root_dir)/deps/lib/bson-static-for-libmongocrypt.lib',
                '-lws2_32'
              ]
            }
          }]
        ]
      }]
    ]
  }]
}
