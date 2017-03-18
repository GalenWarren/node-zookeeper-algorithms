import 'babel-polyfill';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';

// expose various testing modules
global.assert = chai.assert;
global.expect = chai.expect;
global.sinon = sinon;

// ... and wire them all together
chai.should();
chai.use(sinonChai);
chai.use(chaiAsPromised);
sinon.assert.expose(chai.assert, { prefix: "" });

// create the sandbox for fakes
global.sandbox = sinon.sandbox.create();

// before each test, restore the sandbox
beforeEach(() => {
  // reset before each test
  global.sandbox.restore();
});
