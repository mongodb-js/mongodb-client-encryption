import { expect } from 'chai';
import * as tar from 'tar';
import * as cp from 'child_process';
import * as fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
const packFile = `mongodb-client-encryption-${pkg.version}.tgz`;

const REQUIRED_FILES = [
  'package/LICENSE',
  'package/addon/openssl-crypto.cc',
  'package/addon/mongocrypt.cc',
  'package/binding.gyp',
  'package/addon/mongocrypt.h',
  'package/lib/index.js',
  'package/package.json',
  'package/lib/index.d.ts.map',
  'package/lib/index.js.map',
  'package/HISTORY.md',
  'package/README.md',
  'package/lib/index.d.ts',
  'package/src/index.ts',

  'package/src/crypto_callbacks.ts',
  'package/lib/crypto_callbacks.d.ts',
  'package/lib/crypto_callbacks.d.ts.map',
  'package/lib/crypto_callbacks.js',
  'package/lib/crypto_callbacks.js.map'
];

describe(`Release ${packFile}`, function () {
  this.timeout(60000);

  beforeEach(function () {
    if (process.arch !== 'x64') {
      this.skip();
    }
  });

  const tarFileSet: Set<string> = new Set();
  before(() => {
    expect(fs.existsSync(packFile)).to.equal(false);
    cp.execSync('npm pack', { stdio: 'ignore' });
    tar.list({
      file: packFile,
      sync: true,
      onentry(entry) {
        tarFileSet.add(entry.path);
      }
    });
  });

  after(() => {
    if (process.arch === 'x64') {
      fs.unlinkSync(packFile);
    }
  });

  for (const requiredFile of REQUIRED_FILES) {
    it(`should contain ${requiredFile}`, () => {
      expect(tarFileSet).to.include(requiredFile);
    });
  }

  it('should not have extraneous files', () => {
    const unexpectedFileList = Array.from(tarFileSet).filter(f => !REQUIRED_FILES.some(r => r === f));
    expect(unexpectedFileList).to.have.lengthOf(0, `Extra files: ${unexpectedFileList.join(', ')}`);
  });
});
