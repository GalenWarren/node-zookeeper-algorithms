import EventEmitter from 'events';
import { State } from 'node-zookeeper-client';

import RecipesClient from '../src/client';

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
