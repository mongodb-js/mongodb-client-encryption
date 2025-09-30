import { MongoCrypt } from 'mongodb-client-encryption';

// eslint-disable-next-line no-console
console.log(
  new MongoCrypt({
    errorWrapper: (e: Error) => e
  })
);
