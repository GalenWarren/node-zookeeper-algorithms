import sinon from 'sinon';
import { Exception } from 'node-zookeeper-client';
import { Observable } from 'rxjs';

import {
  createClientId,
  getClientNodePrefix,
  validateNodeComponent,
  createClientNode,
  handleNotifications,
} from '../src/util';

import { InvalidNodeComponentError } from '../src/errors';

describe('util', () => {

  describe('createClientId', () => {
    it('should return nonempty id without dashes', () => {
      const id = createClientId();
      id.should.not.be.empty;
      id.should.not.contain('-');
    });

    it('should return unique ids', () => {
      const id1 = createClientId();
      const id2 = createClientId();
      id1.should.not.equal(id2);
    });
  });

  describe('validateNodeComponent', () => {
    it('should succeed and return component if component does not include dashes', () => {
      validateNodeComponent('ab').should.equal('ab');
    });

    it('should fail if component includes dashes', () => {
      expect(() => validateNodeComponent('a-b')).to.throw('Invalid node component: a-b');
    });
  });

  describe('getClientNodePrefix', () => {
    it('should return expected values, including applying defaults', () => {
      getClientNodePrefix({
        clientId: '123',
      }).should.equal('123-none-none-');

      getClientNodePrefix({
        clientId: '123',
        typeId: 'abc',
      }).should.equal('123-abc-none-');

      getClientNodePrefix({
        clientId: '123',
        groupId: 'abc',
      }).should.equal('123-none-abc-');

      getClientNodePrefix({
        clientId: '123',
        typeId: 'ABC',
        groupId: 'abc',
      }).should.equal('123-ABC-abc-');
    });

    it('should fail if an invalid component is supplied', () => {
      expect(() => getClientNodePrefix({
        clientId: 'a-b',
      })).to.throw('Invalid node component: a-b');
    });

  });

  describe('handleNotifications', () => {

    it('should yield no retries if no retries', async () => {
      const retryCount = await handleNotifications(
        Observable.of(),
      ).count().toPromise();
      retryCount.should.equal(0);
    });

    it('should yield no retries if the error is SESSION_EXPIRED', async () => {
      const retryCount = await handleNotifications(
        Observable.of(Object.assign(new Error(), {
          code: Exception.SESSION_EXPIRED,
        })),
      ).count().toPromise();
      retryCount.should.equal(0);
    });

    it('should yield one retry if the error is CONNECTION_LOSS', async () => {
      const retryCount = await handleNotifications(
        Observable.of(Object.assign(new Error(), {
          code: Exception.CONNECTION_LOSS,
        })),
      ).count().toPromise();
      retryCount.should.equal(1);
    });

  });

});
