import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import chaiSubset from 'chai-subset';

chai.use(sinonChai);

chai.use(chaiSubset);

chai.config.truncateThreshold = 0;
