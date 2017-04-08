import { Observable } from 'rxjs';
import { State } from 'node-zookeeper-client';
import { AuthenticationFailedError, ExpiredError } from './errors';

import {
  generateClientId,
  getClientNodePrefix,
  observeDelay,
  makeRetryable,
} from './util';

import { observeExclusiveLock } from './recipes/lock';
// import { observeOneForAllAction } from './recipes/oneForAll';

/**
* Creates an observable of client state using the given client factory. when
* subscribed to, this creates a new client and connects to it. The observable
* elements are { client, connected, readonly } and reflect the current state
* of the client. Throws an error in the event of a nonrecoverable state.
* @param {function} clientFactory - Function that returns a node-zookeeper-client instance
* @returns {Observable}
*/
export function observeClientState(clientFactory) {
  return Observable.create((observer) => {
    // create a new client
    const client = clientFactory();

    // subscribe to the state events and connect
    client.on('state', (state) => {
      switch (state.code) {
        case State.SYNC_CONNECTED.code:
          observer.next({ client, connected: true, readonly: false });
          break;
        case State.CONNECTED_READ_ONLY.code:
          observer.next({ client, connected: true, readonly: true });
          break;
        case State.DISCONNECTED.code:
          observer.next({ client, connected: false });
          break;
        case State.AUTH_FAILED.code:
          observer.error(new AuthenticationFailedError());
          break;
        case State.EXPIRED.code:
          observer.error(new ExpiredError());
          break;
        default:
          // do nothing on other cases: SASL_AUTHENTICATED
          break;
      }
    });

    // connect to the client
    client.connect();

    // return a teardown function`
    return () => {
      client.removeAllListeners();
      client.close();
    };
  });
}

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
