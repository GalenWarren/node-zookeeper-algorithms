import uuid from 'uuid';
import { Observable } from 'rxjs';
import { State } from 'node-zookeeper-client';

import {
  observeDelay,
  makeRetryable
} from './util';

import { ExpiredError, AuthenticationFailedError, InvalidStateError } from './errors';

import { observeLockState } from './lock';

/**
* Generates a unique client id;
* @returns {string} - The unique client id
*/
export function generateClientId() {
  return uuid().replace(/-/g, '');
}

/**
* Generates the client node prefix for the given client id and (optional) prefix
* @param {string} clientId - The client id
* @param {string} [prefix] - The optional prefix
* @returns {string}
*/
export function getClientNodePrefix(clientId, prefix = null) {
  const components = [clientId, ''];
  if (prefix) {
    components.unshift(prefix);
  }
  return components.join('-');
}

/**
* Parses a client node name, i.e. the node name without the full path. Returns an
* object with a client property and, if appropriate, type and sequence properties.
* @param {string} node - The node name to parseClientNode
* @param {boolean} sequential - Whether this node has a sequence number appended
* @returns {Object}
*/
export function parseClientNode(node, sequential) {
  const parts = node.split('-');
  const preSequentialCount = sequential ? parts.length - 1 : parts.length;
  const result = {};
  switch (preSequentialCount) {
    case 1:
      result.client = parts[0];
      break;
    case 2:
      result.type = parts[0];
      result.client = parts[1];
      break;
    default:
      throw new InvalidStateError(`Invalid node ${node} with sequential=${sequential} in parseClientNode`);
  }
  if (sequential) {
    result.sequence = Number(parts[preSequentialCount]);
    if (isNaN(result.sequence)) {
      throw new InvalidStateError(`Invalid node ${node} with sequential=${sequential} in parseClientNode`);
    }
  }
  return result;
}

/**
* Sorting function for nodes, sorts in ascending order of sequence number. Only
* applicable to sequential nodes.
* @returns {number}
*/
export function sortBySequence(node1, node2) {
  return parseClientNode(node1, true).sequence - parseClientNode(node2, true).sequence;
}

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
  * constructor
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
  * Attempts to acquire a lock and the given path and observes the lock state
  * @param {string} path - The path at which to observe
  * @param {string} [clientId] - The client id to use, one is allocated if not supplied
  */
  observeLockState({ path, clientId = null }) {
    return observeLockState(this.clientState$, path, clientId);
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
