import chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';

before( () => {
  // global setup, see https://github.com/domenic/sinon-chai
  global.assert = chai.assert;
  global.expect = chai.expect;
  chai.should();
  chai.use(sinonChai);
  sinon.assert.expose(chai.assert, { prefix: "" });
});
