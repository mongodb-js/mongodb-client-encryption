'use strict';

const { execSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const xtrace = (...args) => {
  console.log(`running: ${args[0]}`);
  return execSync(...args);
};

const ceRoot = resolve(__dirname, '../../..');
console.log(`mongodb-client-encryption package root: ${ceRoot}`);

const ceVersion = JSON.parse(
  readFileSync(resolve(ceRoot, 'package.json'), { encoding: 'utf8' })
).version;
console.log(`mongodb-client-encryption Version: ${ceVersion}`);

xtrace('npm pack --pack-destination test/bundling/webpack', { cwd: ceRoot });

xtrace(`npm install --no-save mongodb-client-encryption-${ceVersion}.tgz`);

console.log('mongodb-client-encryption installed!');
