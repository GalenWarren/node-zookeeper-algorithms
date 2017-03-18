import EventEmitter from 'events';
import { State } from 'node-zookeeper-client';

import { AuthenticationFailedError, ExpiredError } from '../src/errors';

import RecipesClient, {
  generateClientId,
  getClientNodePrefix,
  parseClientNode,
  sortBySequence,
  observeClientState,
} from '../src/client';

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

describe('sortBySequence', () => {
  it('should sort nodes properly by sequence', () => {
    [
      'type-client-003',
      'type-client-001',
      'type-client-002',
    ].sort(sortBySequence).should.deep.equal([
      'type-client-001',
      'type-client-002',
      'type-client-003',
    ]);
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

describe('RecipesClient', () => {

  it('should create configured retry observable on construction', async () => {
    const recipes = new RecipesClient({
      retryOptions: {
        initialDelay: 500,
        maxDelay: 2000,
        maxRetries: 5
      }
    });

    await recipes.retryDelay$.toArray().toPromise()
      .should.become([500, 1000, 2000, 2000, 2000]);

    recipes.unsubscribe();
  });

  it('should create default retry observable on construction', async () => {
    const recipes = new RecipesClient();
    await recipes.retryDelay$.toArray().toPromise()
      .should.eventually.be.an.instanceOf(Array);
    recipes.unsubscribe();
  });

  it('should create client state observable', async () => {
    const client = Object.assign(new EventEmitter(), {
      connect: sandbox.stub(),
      close: sandbox.stub()
    });

    const recipes = new RecipesClient({
      clientFactory: () => client
    });
    recipes.connect();

    client.emit('state', { code: State.SYNC_CONNECTED.code });

    await recipes.clientState$.first().toPromise()
      .should.become({ client, connected: true, readonly: false });

    recipes.unsubscribe();
  });

});
