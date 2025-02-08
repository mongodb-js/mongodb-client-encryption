ARG ARCH
ARG NODE_VERSION
FROM ${ARCH}-alpine-libmongocrypt-node-${NODE_VERSION}:latest

RUN npm run prebuild
