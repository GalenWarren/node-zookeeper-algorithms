import EventEmitter from 'events';
import pify from 'pify';
import uuid from 'uuid';
import { Observable } from 'rxjs';
import { CreateMode } from 'node-zookeeper-client';
import { InvalidStateError } from './errors';

/**
* Constant for event name to avoid strings everywhere
*/
const changeEventName = 'change';

/**
* Creates an observable of delay values for retries given the provided retry options
* @param {Object} options
* @param {number} [options.initialDelay=500] - The initial retry delay
* @param {number} [options.delayFactor=2] - The factor by which to increase each delay
* @param {number} [options.maxDelay=8000] - The max delay value
* @param {number} [options.maxRetries=7] - The max number of retries
* @returns {Observable}
*/
export function observeDelay(options = {}) {
  const { initialDelay = 500, delayFactor = 2, maxDelay = 8000, maxRetries = 7 } = options;
  return Observable.generate(
    [0, initialDelay],
    ([index]) => index < maxRetries,
    ([index, delay]) => [index + 1, Math.min(delay * delayFactor, maxDelay)],
    ([, delay]) => delay,
  );
}

/**
* Makes an observable retryable with the provided delays.
* @param {Observable} obs$ - The input observable
* @param {Observable} delay$ - The delays to use
* @param {function} [retryPredicate] - Determines if the retry should occur
* based on the supplied error object. If not supplied, all errors are retried.
* @returns {Observable}
*/
export function makeRetryable(obs$, delay$, retryPredicate = null) {
  // retry on error as long as retryPredicate returns true and we have retries left.
  // tack one extra null onto the delay observable; when we encounter that, we know
  // we're out of retries and so should throw the error
  return obs$.retryWhen(error$ =>
    Observable.zip(error$, delay$.concat(Observable.of(null)))
      .flatMap(([error, delay]) => {
        if ((delay !== null) && (!retryPredicate || retryPredicate(error))) {
          return Observable.of(null).delay(delay);
        }
        return Observable.throw(error);
      }),
    );
}

/**
* Creates an observable of a node value.
* @param {function} accessor - The function that accepts the callback handler
* and returns a promise/observable for the value we care about.
* @param {boolean} [watch=false] - Whether to watch the node. If true, then the
* observable doesn't complete and emits new values whenever the observed value
* changes. If false, then the observable completes after emitting a single value.
* @returns {Observable}
*/
export function observeNodeValue(accessor, watch = false) {
  return Observable.defer(() => {
    let observation$ = Observable.of(null);
    let watcher = null;
    if (watch) {
      const emitter = new EventEmitter();
      observation$ = observation$.concat(Observable.fromEvent(emitter, changeEventName));
      watcher = () => emitter.emit(changeEventName);
    }
    return observation$.flatMap(() => accessor(watcher));
  });
}

/**
* Creates an observable of the children of a node.
* @param {ZookeeperClient} client - The node-zookeeper-client instance
* @param {string} path - The path of the parent node
* @param {function} [watch] - Whether to watch for changes.
* @returns {Observable}
*/
export function observeNodeChildren(client, path, watch = false) {
  return observeNodeValue(
    watcher => pify(client.getChildren).call(client, path, watcher),
    watch,
  );
}

/**
* Creates an observable that emits a null and then completes when the
* node vanishes.
* @param {ZookeeperClient} client - The node-zookeeper-client instance
* @param {string} path - The path of the node to remove
* @returns {Observable}
*/
export function observeNodeVanish(client, path) {
  return observeNodeValue(
    watcher => pify(client.exists).call(client, path, watcher),
    true,
  ).filter(stat => !stat).first();
}

/**
* Creates an observable that emits the node name and completes when a node
* is created.
* @param {ZookeeperClient} client - The node-zookeeper-client instance
* @param {string} path - The path of the node to create
* @param {CreateMode} mode - The create mode
* @returns {Observable}
*/
export function observeCreateNode(client, path, mode) {
  return Observable.defer(() => pify(client.create).call(client, path, null, mode));
}

/**
* Creates an observable that emits null and completes when a nod is removed.
* @param {ZookeeperClient} client - The node-zookeeper-client instance
* @param {string} path - The path of the node to create
* @returns {Observable}
*/
export function observeRemoveNode(client, path) {
  return Observable.defer(() => pify(client.remove).call(client, path));
}

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
export function sortClientNodesBySequence(node1, node2) {
  return parseClientNode(node1, true).sequence - parseClientNode(node2, true).sequence;
}

/**
* Returns a function that returns true iff the first of the supplied nodes
* matches the prefix, i.e. if the client with that prefix is in the "leader"
* position.
* @param {string} clientNodePrefix - The client node prefix
* @returns {function}
*/
export function isLeaderNode(clientNodePrefix) {
  return nodes => nodes.length && nodes[0].startsWith(clientNodePrefix);
}

/**
* A generic state seeking algorithm that subscribes to the provided observable and returns
* its values as the output, modifying some aspect of global state on each iteration.
* @param {Observable} state$ - The state observable that is subscribed to on each iteration
* @param {function} seek - Function that accepts the last state value and returns a promise
* or observable that modifies the system state. If this result is truthy, the state observable
* is resubscribed to and the process repeats. Otherwise, the observable completes.
* @returns {Observable}
*/
export function observeSeekState(state$, seek) {
  // track the last state to use when repeating. ideally we'd avoid this sort
  // of side-effecting behavior but there doesn't seem to be any other way
  // to capture this information to use in the repeatWhen call below. at
  // least all side effects are scoped to this function ...
  let lastState = null;

  // updates the state
  const updateState = (state) => { lastState = state; };

  // the predicate the controls the repeat behavior
  const repeatPredicate = completion$ => completion$
    .flatMap(() => seek(lastState))
    .takeWhile(value => !!value);

  // capture the state on each iteration and repeat if appropriate to seek
  // the desired state
  return state$.do(updateState).repeatWhen(repeatPredicate);
}

/**
* Generates an observable that seeks a particular state with respect to the
* client nodes at a particular path.
* @param {Object} options
* @param {string} options.client - The node-zookeeper-client instance
* @param {string} options.path - The path on which to observe the clients
* @param {function} [options.filter] - The filter to apply to the nodes at the path
* @param {string} options.clientNodePrefix - The client node prefix for this action
* @param {function} options.seek - Function to seek the desired state
* @returns {Observable}
*/
export function observeSeekClientNodeState(options) {
  const { client, path, filter, clientNodePrefix, seek } = options;

  // build up the state observable. observe the node children, sorted by sequence
  // number, and including filter if supplied
  let state$ = observeNodeChildren(client, path, false);
  if (filter) {
    state$ = state$.filter(nodes => nodes.filter(filter));
  }
  state$ = state$.map(nodes => nodes.sort(sortClientNodesBySequence));

  // the seek function, which creates the node if it doesn't exist and otherwise
  // delegates to the supplied seek function
  // KGW - 1) bypass children on first time, 2) retry?
  const createNodeAndseek = ([nodes]) => {
    const clientIndex = nodes.findIndex(node => node.startsWith(clientNodePrefix));
    console.log('abc', clientIndex);
    if (clientIndex < 0) {
      const nodePath = [path, clientNodePrefix].join('/');
      return observeCreateNode(client, nodePath, CreateMode.EPHEMERAL_SEQUENTIAL);
    }
    return seek(nodes, clientIndex);
  };

  // seek the state
  return observeSeekState(state$, createNodeAndseek);
}
