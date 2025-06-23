import { expect } from 'chai';
import * as bindings from '../../src/index.mjs';

describe('index.ts', () => {
  it('only has three exports', () => {
    expect(Object.keys(bindings).length).to.equal(3);
  });

  it('exports a class MongoCrypt', () => {
    expect(bindings).to.have.property('MongoCrypt').that.is.a('function');
  });

  it('exposes MongoCryptContextCtor', () => {
    expect(bindings).to.have.property('MongoCryptContextCtor').that.is.a('function');
  });

  it('exposes MongoCryptKMSRequestCtor', () => {
    expect(bindings).not.to.have.property('MongoCryptKMSRequestCtor').that.is.a('function');
  });

  it('exports a cryptoCallbacks object', () => {
    expect(bindings).to.have.property('cryptoCallbacks').that.is.an('object');
  });
});
