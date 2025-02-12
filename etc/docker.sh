#! /bin/bash

# script to aid in local testing of linux platforms
# requires a running docker instance

# s390x, arm64, amd64 for ubuntu
# amd64 or arm64v8 for alpine
LINUX_ARCH=amd64

# 16.20.1+, default 16.20.1
NODE_VERSION=20.0.0

SCRIPT_DIR=$(dirname ${BASH_SOURCE:-$0})
PROJECT_DIR=$SCRIPT_DIR/..

build_and_test_musl() {
    docker buildx create --name builder --bootstrap --use

    docker --debug buildx build --load --progress=plain --no-cache \
        --platform linux/$LINUX_ARCH --output=type=docker \
        --build-arg="PLATFORM=$LINUX_ARCH" \
        --build-arg="NODE_VERSION=$NODE_VERSION" \
        --build-arg="RUN_TEST=true" \
        -f ./.github/docker/Dockerfile.musl -t musl-zstd-base \
        .
}

build_and_test_glibc() {
    docker buildx create --name builder --bootstrap --use

    UBUNTU_VERSION=$(node --print 'Number(process.argv[1].split(`.`).at(0)) > 16 ? `noble` : `bionic`' $NODE_VERSION)
    NODE_ARCH=$(node -p 'process.argv[1] === `amd64` && `x64` || process.argv[1]' $LINUX_ARCH)
    echo $UBUNTU_VERSION
    docker buildx build --progress=plain --no-cache \
        --platform linux/$LINUX_ARCH \
        --build-arg="NODE_ARCH=$NODE_ARCH" \
        --build-arg="NODE_VERSION=$NODE_VERSION" \
        --build-arg="UBUNTU_VERSION=$UBUNTU_VERSION" \
        --build-arg="RUN_TEST=true" \
        --output type=local,dest=./prebuilds,platform-split=false \
        -f ./.github/docker/Dockerfile.glibc \
        $PROJECT_DIR
}

build_and_test_musl
# build_and_test_glibc
