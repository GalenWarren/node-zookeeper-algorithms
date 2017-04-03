import EventEmitter from 'events';
import { Observable } from 'rxjs';
import { State } from 'node-zookeeper-client';

import { AuthenticationFailedError, ExpiredError } from '../src/errors';

import {
  observeDelay,
  makeRetryable,
  observeNodeChildren,
  generateClientId,
  getClientNodePrefix,
  parseClientNode,
  observeClientState,
  sortClientNodesBySequence
} from '../src/util';

describe('observeDelay', () => {

  it('should properly emit a configured sequence', async () => {
    (await observeDelay({
      initialDelay: 500,
      maxDelay: 2000,
      maxRetries: 4
    }).toArray().toPromise()).should.deep.equal([500, 1000, 2000, 2000])
  });

  it('should properly emit a zero element sequence', async () => {
    (await observeDelay({
      initialDelay: 500,
      maxDelay: 2000,
      maxRetries: 0
    }).toArray().toPromise()).should.deep.equal([])
  });

  it('should properly emit a configured sequence', async () => {
    (await observeDelay().toArray().toPromise()).should.be.an.array;
  });

});

describe('makeRetryable', function() {

  const result = "result";

  const retryOptions = {
    initialDelay: 1,
    maxDelay: 1,
    maxRetries: 3
  };

  const delay$ = observeDelay(retryOptions);

  function failingObservable(failCount, value = null) {
    let index = 0;
    return Observable.defer(() => {
      if (index++ < failCount) {
        return Observable.throw(new Error('failingObservable'));
      } else {
        return Observable.of(value);
      }
    });
  }

  it('should get value from observable that does not fail', async () => {
    const value$ = makeRetryable(failingObservable(0, result), delay$);
    await value$.last().toPromise().should.become(result);
  });

  it('should get value from observable that fails fewer than maxRetries times', async () => {
    const value$ = makeRetryable(failingObservable(retryOptions.maxRetries - 1, result), delay$);
    await value$.last().toPromise().should.become(result);
  });

  it('should get value from observable that fails exactly maxRetries times', async () => {
    const value$ = makeRetryable(failingObservable(retryOptions.maxRetries, result), delay$);
    await value$.last().toPromise().should.become(result);
  });

  it('should fail to get value from observable that fails > maxRetries times', async () => {
    const value$ = makeRetryable(failingObservable(retryOptions.maxRetries + 1, result), delay$);
    await value$.toPromise().should.be.rejectedWith('failingObservable');
  });

  it('should get value from observable that fails in a way that matches predicate', async () => {
    const value$ = makeRetryable(
      failingObservable(retryOptions.maxRetries - 1, result),
      delay$,
      error => true
    );
    await value$.last().toPromise().should.become(result);
  });

  it('should not get value from observable that fails in a way that does not match predicate', async () => {
    const value$ = makeRetryable(
      failingObservable(retryOptions.maxRetries - 1, result),
      delay$,
      error => false
    );
    await value$.toPromise().should.be.rejectedWith('failingObservable');
  });

});

describe('observeNodeChildren', () => {

  const children = [
    'type-client-003',
    'type-client-001',
    'type-client-002'
  ];

  const client = {
    mkdirp: sandbox.stub().yields(null),
    getChildren: sandbox.stub().yields(null, [children])
  };

  it('should properly observe children', async () => {
    const children$ = observeNodeChildren({
      client,
      path: '/test'
    });
    await children$.toArray().toPromise().should.become([children]);
  });

  it('should properly observe children with filter and sort', async () => {
    const children$ = observeNodeChildren({
      client,
      path: '/test',
      filter: children => children.filter(child => !/2/.test(child)),
      sort: children => children.sort(sortClientNodesBySequence)
    });
    await children$.toArray().toPromise().should.become([[
      'type-client-001',
      'type-client-003'
    ]]);
  });

});

describe('generateClientId', () => {

  it('should return nonempty id without dashes', () => {
    const id = generateClientId();
    id.should.not.be.empty;
    id.should.not.contain('-');
  });

  it('should return unique ids', () => {
    const id1 = generateClientId();
    const id2 = generateClientId();
    id1.should.not.equal(id2);
  });

});

describe('getClientNodePrefix', () => {

  it('should return expected values', () => {
    getClientNodePrefix(123).should.equal('123-');
    getClientNodePrefix('123', 'abc').should.equal('abc-123-');
  });

});

describe('parseClientNode', () => {

  it('should properly parse nodes with sequence numbers', () => {
    parseClientNode('type-client-001', true).should.deep.equal({ type: 'type', client: 'client', sequence: 1 });
  });

  it('should properly parse nodes without sequence numbers', () => {
    parseClientNode('type-client', false).should.deep.equal({ type: 'type', client: 'client' });
  });

  it('should throw exception on invalid input', () => {
    expect(() => parseClientNode('type-client-001', false)).to.throw('Invalid node type-client-001 with sequential=false in parseClientNode');
    expect(() => parseClientNode('type-client', true)).to.throw('Invalid node type-client with sequential=true in parseClientNode');
    expect(() => parseClientNode('type-client-other-001', true)).to.throw('Invalid node type-client-other-001 with sequential=true in parseClientNode');
  });

});

describe('observeClientState', () => {

  function createFakes() {
    const client = Object.assign(new EventEmitter(), {
      connect: sandbox.stub(),
      close: sandbox.stub()
    });

    client.removeAllListeners = sandbox.spy(client.removeAllListeners);

    const clientState$ = observeClientState(() => client);

    const handlers = {
      next: sandbox.stub(),
      error: sandbox.stub(),
      complete: sandbox.stub()
    }

    // subscribe, this should cause the client to be connected
    clientState$.subscribe(handlers.next, handlers.error, handlers.complete);
    client.connect.should.have.been.calledOnce;

    // done
    return { client, clientState$, handlers };
  }

  it('should properly transition to connected state', () => {
    const { client, clientState$, handlers } = createFakes();

    client.emit('state', { code: State.SYNC_CONNECTED.code });
    handlers.next.should.have.been.calledOnce
      .calledWith({ client, connected: true, readonly: false });
    handlers.error.should.not.have.been.called;
    handlers.complete.should.not.have.been.called;
    client.removeAllListeners.should.not.have.been.called;
    client.close.should.not.have.been.called;
  });

  it('should properly transition to read-only connected state', () => {
    const { client, clientState$, handlers } = createFakes();

    client.emit('state', { code: State.CONNECTED_READ_ONLY.code });
    handlers.next.should.have.been.calledOnce
      .calledWith({ client, connected: true, readonly: true });
    handlers.error.should.not.have.been.called;
    handlers.complete.should.not.have.been.called;
    client.removeAllListeners.should.not.have.been.called;
    client.close.should.not.have.been.called;
  });

  it('should properly transition to auth failed state', () => {
    const { client, clientState$, handlers } = createFakes();

    client.emit('state', { code: State.AUTH_FAILED.code });
    handlers.next.should.not.have.been.called;
    handlers.error.should.have.been.calledOnce
      .calledWith(sinon.match.instanceOf(AuthenticationFailedError));
    handlers.complete.should.not.have.been.called;
    client.removeAllListeners.should.have.been.called;
    client.close.should.have.been.called;
  });

  it('should properly transition to expired state', () => {
    const { client, clientState$, handlers } = createFakes();

    client.emit('state', { code: State.EXPIRED.code });
    handlers.next.should.not.have.been.called;
    handlers.error.should.have.been.calledOnce
      .calledWith(sinon.match.instanceOf(ExpiredError));
    handlers.complete.should.not.have.been.called;
    client.removeAllListeners.should.have.been.called;
    client.close.should.have.been.called;
  });

  it('should properly transition to disconnected state', () => {
    const { client, clientState$, handlers } = createFakes();

    client.emit('state', { code: State.DISCONNECTED.code });
    handlers.next.should.have.been.calledOnce
      .calledWith({ client, connected: false });
    handlers.error.should.not.have.been.called;
    handlers.complete.should.not.have.been.called;
    client.removeAllListeners.should.not.have.been.called;
    client.close.should.not.have.been.called;
  });

  it('should do nothing on SASL_AUTHENTICATED', () => {
    const { client, clientState$, handlers } = createFakes();

    client.emit('state', { code: State.SASL_AUTHENTICATED.code });
    handlers.next.should.not.have.been.called;
    handlers.error.should.not.have.been.called;
    handlers.complete.should.not.have.been.called;
    client.removeAllListeners.should.not.have.been.called;
    client.close.should.not.have.been.called;
  });

});


describe('sortClientNodesBySequence', () => {

  it('should sort nodes properly by sequence', () => {
    [
      'type-client-003',
      'type-client-001',
      'type-client-002',
    ].sort(sortClientNodesBySequence).should.deep.equal([
      'type-client-001',
      'type-client-002',
      'type-client-003',
    ]);
  });

});
