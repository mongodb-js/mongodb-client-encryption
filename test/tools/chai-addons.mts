import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import * as chaiSubset from 'chai-subset';

chai.use(sinonChai);
// @ts-expect-error
chai.use(chaiSubset.default);

chai.config.truncateThreshold = 0;
