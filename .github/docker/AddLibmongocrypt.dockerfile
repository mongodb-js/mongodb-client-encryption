ARG ARCH
ARG NODE_VERSION
FROM ${ARCH}-alpine-base-node-${NODE_VERSION}:latest

WORKDIR /mongodb-client-encryption
COPY . .

RUN npm install --ignore-scripts
RUN npm run install:libmongocrypt -- --skip-bindings
