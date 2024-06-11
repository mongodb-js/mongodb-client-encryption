import process from 'node:process';
import { MongoClient, ClientEncryption } from 'mongodb';

let { MONGODB_URI = '', CRYPT_SHARED_LIB_PATH = '' } = process.env;
MONGODB_URI.length === 0 ? 'mongodb://127.0.0.1:27017' : MONGODB_URI;
const extraOptions =
  CRYPT_SHARED_LIB_PATH.length !== 0 ? { cryptSharedLibPath: CRYPT_SHARED_LIB_PATH } : undefined;

const LOCAL_KEY = Buffer.from(
  'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk',
  'base64'
);

const $jsonSchema = {
  properties: {
    encrypted: {
      encrypt: {
        keyId: [{ $binary: { base64: 'LOCALAAAAAAAAAAAAAAAAA==', subType: '04' } }],
        bsonType: 'string',
        algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
      }
    }
  },
  bsonType: 'object'
};

let client;

let ae = {
  autoEncryption: {
    keyVaultNamespace: 'keyvault.datakeys',
    kmsProviders: { local: { key: LOCAL_KEY } },
    bypassAutoEncryption: false,
    keyVaultClient: undefined,
    extraOptions
  }
};

async function setupCollection() {
  const client = new MongoClient(MONGODB_URI);
  const collectionName = 'test_fle_bench';
  const db = client.db('test_fle_bench');
  await db.dropCollection(collectionName).catch(() => {});

  const clientEncryption = new ClientEncryption(client, {
    keyVaultNamespace: 'keyvault.datakeys',
    kmsProviders: { local: { key: LOCAL_KEY } }
  });

  const encryptedFields = {
    escCollection: 'esc',
    eccCollection: 'ecc',
    ecocCollection: 'ecoc',
    fields: Array.from({ length: 5000 }, (_, i) => ({
      path: `key${i.toString().padStart(4, '0')}`,
      bsonType: 'string'
    }))
  };

  const { collection } = await clientEncryption.createEncryptedCollection(db, collectionName, {
    provider: 'local',
    createCollectionOptions: { encryptedFields }
  });

  return collection;
}

async function main() {
  const collection = await setupCollection();

  await client
    .db('test_fle_bench')
    .createCollection('test_fle_bench', { validator: { $jsonSchema } });
}

export async function bench(options) {}
