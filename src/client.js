import { Observable } from 'rxjs';

import {
  generateClientId,
  getClientNodePrefix,
  observeDelay,
  makeRetryable,
  observeClientState,
} from './util';

import { observeExclusiveLock } from './recipes/lock';
// import { observeOneForAllAction } from './recipes/oneForAll';

/**
* The client object for recipes
*/
export default class RecipesClient {

  /**
  * @param {Object} options
  * @param {function} options.clientFactory - Creates a node-zookeeper-client
  * @param {Object} [options.retryOptions={}] - The retry options
  */
  constructor(options = {}) {
    const { retryOptions = {}, clientFactory } = options;

    // this observable produces retry delays per the passed-in retry options
    this.retryDelay$ = observeDelay(retryOptions);

    // this observable emits clients and connected/readonly status. nonrecoverable
    // states are handled by creating new clients that are then emitted into
    // the stream. this is a hot observable that will replay the last value to
    // new subscribers. this stream only terminates when the retries are exhausted.
    this.clientState$ = makeRetryable(observeClientState(clientFactory), this.retryDelay$)
      .publishReplay(1);
  }

  /**
  * Connects the observable
  */
  connect() {
    this.clientStateSubscription = this.clientState$.connect();
  }

  /**
  * A helper function that observes a client-based state that is only valid
  * when the client is connected.
  * @param {function} connectedSelector - called to flat map clients to states
  * @param {function} disconnectedValue - the value to be returned when the client
  * is disconnected
  */
  observeConnectedState(connectedSelector, disconnectedValue = false) {
    return this.clientState$.flatMap(({ client, connected }) => {
      if (connected) {
        return connectedSelector(client);
      }
      return Observable.of(disconnectedValue);
    });
  }

  /**
  * Attempts to acquire a lock and the given path and observes the lock state
  * @param {string} path - The path at which to observe
  * @param {string} [clientId] - The client id to use, one is allocated if not supplied
  */
  observeExclusiveLock(path, clientId = null) {
    const clientNodePrefix = getClientNodePrefix(clientId || generateClientId());
    return this.observeConnectedState(
      client => observeExclusiveLock({ client, path, clientNodePrefix }),
    );
  }

  /**
  * Returns promise that resolves when exclusive lock is acquired
  * @param {string} path - The path at which to observe
  * @param {string} [clientId] - The client id to use, one is allocated if not supplied
  */
  getExclusiveLock(path, clientId = null) {
    return this.observeExclusiveLock({ path, clientId })
      .first(hasLock => hasLock)
      .toPromise();
  }

  /**
  * Unsubscribes
  */
  unsubscribe() {
    if (this.clientStateSubscription) {
      this.clientStateSubscription.unsubscribe();
      this.clientStateSubscription = null;
    }
  }

}
