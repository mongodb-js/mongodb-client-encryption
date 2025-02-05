#! /usr/bin/env bash

git clone https://github.com/mongodb/libmongocrypt.git _libmongocrypt
cd _libmongocrypt

git checkout --detach $REF

COMMIT_HASH=$(git rev-parse HEAD)

echo "COMMIT_HASH=$COMMIT_HASH"

cd -
rm -rf _libmongocrypt
