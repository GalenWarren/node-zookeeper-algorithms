import sinon from 'sinon';
import { CreateMode, Exception } from 'node-zookeeper-client';
import { Observable } from 'rxjs';
import Util from '../src/util';

describe('Util', () => {

  const util = new Util();

  describe('createClientId', () => {
    it('should return nonempty id without dashes', () => {
      const id = util.createClientId();
      id.should.not.be.empty;
      id.should.not.contain('-');
    });

    it('should return unique ids', () => {
      const id1 = util.createClientId();
      const id2 = util.createClientId();
      id1.should.not.equal(id2);
    });
  });

  describe('getClientNodePrefix', () => {

    it('should return expected values', () => {
      util.getClientNodePrefix({
        clientId: '123',
      }).should.equal('123-');

      util.getClientNodePrefix({
        clientId: '123',
        prefix: 'abc',
      }).should.equal('abc-123-');
    });

  });

  describe('handleRecoverableExceptions', () => {

    it('should yield no retries if no retries', async () => {
      const retryCount = await util.handleRecoverableExceptions(
        Observable.of(),
      ).count().toPromise();

      retryCount.should.equal(0);
    });

    it('should yield no retries if the error is SESSION_EXPIRED', async () => {
      return expect(util.handleRecoverableExceptions(
        Observable.of(Object.assign(new Error(), {
          code: Exception.SESSION_EXPIRED,
        })),
      )).to.throw;
    });

    it('should yield one retry if the error is CONNECTION_LOSS', async () => {
      const retryCount = await util.handleRecoverableExceptions(
        Observable.of(Object.assign(new Error(), {
          code: Exception.CONNECTION_LOSS,
        })),
      ).count().toPromise();

      retryCount.should.equal(1);
    });

  });

  describe('findClientNode', () => {

    it('should return a matching node when it is present', async () => {
      const client = {
        getChildren: sinon.stub().yields(null, [
          "test-abc-001",
          "test-def-002",
          "test-ghi-003",
        ]),
      };
      const found = await util.findClientNode({
        client,
        path: '/base',
        clientNodePrefix: 'test-def-',
      });

      found.should.equal("/base/test-def-002");
      client.getChildren.should.have.been.calledOnce.calledWith('/base');
    });

    it('should return undefined when no matching node is present', async () => {
      const client = {
        getChildren: sinon.stub().yields(null, [
          "test-abc-001",
          "test-dee-002",
          "test-ghi-003",
        ]),
      };
      const found = await util.findClientNode({
        client,
        path: '/base',
        clientNodePrefix: 'test-def-',
      });

      expect(found).to.be.undefined;
      client.getChildren.should.have.been.calledOnce.calledWith('/base');
    });

    it('should return undefined when no nodes are present', async () => {
      const client = {
        getChildren: sinon.stub().yields(null, []),
      };
      const found = await util.findClientNode({
        client,
        path: '/base',
        clientNodePrefix: 'test-def-',
      });

      expect(found).to.be.undefined;
      client.getChildren.should.have.been.calledOnce.calledWith('/base');
    });

  });

  describe('createClientNode', () => {

    it('should make the proper call to create the zookeeper node', async () => {
      const client = {
        create: sinon.stub().yields(null, 'test-def-001'),
      };
      const node = await util.createClientNode({
        client,
        path: '/base',
        clientNodePrefix: 'test-def-',
      });

      expect(node).to.equal('test-def-001');
      client.create.should.have.been.calledOnce.calledWith(
        '/base/test-def-',
        null,
        CreateMode.EPHEMERAL_SEQUENTIAL
      );
    });

  });

  describe('observeClientNode', () => {

    it('should create the node properly when it does not already exist', async () => {

      const clientId = util.createClientId();

      const client = {
        getChildren: sinon.stub().yields(null, []),
        create: sinon.spy((path, data, mode, callback) => {
          callback(null, `${path}001`);
        }),
      };

      const node = await util.observeClientNode({
        client,
        path: '/base',
        prefix: 'lock',
        clientId,
      }).toPromise();

      node.should.equal(`/base/lock-${clientId}-001`);
      client.getChildren.should.have.callCount(0);
      client.create.should.have.been.calledOnce.calledWith(
        `/base/lock-${clientId}-`,
        null,
        CreateMode.EPHEMERAL_SEQUENTIAL
      );

    });

    it('should find the node properly when it does already exists', async () => {

      const clientId = util.createClientId();

      const client = {
        getChildren: sinon.stub().yields(null, [
          'lock-abc-001',
          `lock-${clientId}-001`,
          'lock-def-001',
        ]),
        create: sinon.stub(),
      };

      const node = await util.observeClientNode({
        client,
        path: '/base',
        prefix: 'lock',
        clientId,
        skipInitialFind: false,
      }).toPromise();

      node.should.equal(`/base/lock-${clientId}-001`);
      client.getChildren.should.have.been.calledOnce.calledWith('/base');
      client.create.should.have.callCount(0);

    });

  });

});
