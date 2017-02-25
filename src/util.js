import uuid from 'uuid/v4';
import { CreateMode, Exception } from 'node-zookeeper-client';
import { Observable } from 'rxjs';
import pify from 'pify';
import { InvalidNodeComponentError } from './errors';

/**
* The default id used when one is not specified ('none')
* @constant {string}
*/
const defaultId = 'none';

/**
* Creates a client id
* @returns {string} - A unique id (uuid v4 with no dashes)
*/
export function createClientId() {
  return uuid().replace(/-/g, '');
}

/**
* Validates that a node component is legitimate, i.e. doesn't contain
* any dashes.
* @param {string} component - The component to test
* @throws {InvalidNodeComponentError} if the component is invalid
*/
export function validateNodeComponent(component) {
  if (component.indexOf('-') >= 0) {
    throw new InvalidNodeComponentError(component);
  }
  return component;
}

/**
* Creates a prefix for a client node, combining client id,
* group id, type id.
* @param {Object} options - Options
* @param {string} options.clientId - Client id
* @param {string} [options.groupId='none'] - Group id
* @param {string} [options.typeId='none'] - Type id
* @returns {string}
*/
export function getClientNodePrefix(options) {
  const { clientId, typeId = defaultId, groupId = defaultId } = options;
  return [typeId, groupId, clientId, '']
    .map(validateNodeComponent)
    .map(encodeURIComponent)
    .join('-');
}

/**
* A notification handler to be used by rxjs's retryUntil, implements the
* rules for recoverable errors for zookeeper. Specifically, this causes
* zookeeper actions to be retried (with exponential backoff) if
* CONNECTION_LOSS is returned but treats everything else as fatal.
* See https://cwiki.apache.org/confluence/display/ZOOKEEPER/FAQ
* @param {Observable} error$ - The observable of error notifications
* @param {Object} [options] - The options for the handler
* @param {number} [options.initialDelay=1000] - The initial retry delays
* @param {number} [options.maxDelay=8000] - The max delay
* @param {number} [options.maxRetries=6] - The max number of retries before we give up
*/
export function handleRecoverableExceptions(error$, options = {}) {
  const { initialDelay = 1000, maxDelay = 8000, maxRetries = 6 } = options;

  // this observable will return the sequence of retry delays
  const delay$ = Observable.generate(
    0,
    index => index < maxRetries,
    index => index + 1,
    index => Math.min((2 ** index) * initialDelay, maxDelay)
  );

  // retry on connection until we run out of retries
  return Observable.zip(error$, delay$)
    .flatMap(([err, delay]) => {
      switch (err.code) {
        case Exception.CONNECTION_LOSS:
          return Observable.of(null).delay(delay);
        default:
          return Observable.of();
      }
    });
}

/**
* Finds a client node by id client node, returns a promise that resolves to
* the client node
* @param {Object} options - Options
* @param {ZookeeperClientAsync} options.client - The zookeeper client
* @param {string} options.basePath - The base path at which to look
* @param {string} options.clientNodePrefix - The prefix of the client node
* @returns {string}
*/
export async function findClientNode(options) {
  const { client, basePath, clientNodePrefix } = options;

  // load all the current children and return the one that matches,
  // or undefined if none match
  const children = await pify(client.getChildren).call(client, basePath);
  return children.find(child => child.startsWith(clientNodePrefix));
}

/**
* Creates a client node, returns promise that is resolved with the node name
* @param {Object} options - Options
* @param {ZookeeperClientAsync} options.client - The zookeeper client
* @param {string} options.basePath - The base path at which to look
* @param {string} options.clientNodePrefix - The prefix of the client node
* @returns {string}
*/
export function createClientNode(options) {
  const { client, basePath, clientNodePrefix } = options;

  // create the node
  const path = [basePath, clientNodePrefix].join('/');
  return pify(client.create).call(client, path, null, CreateMode.EPHEMERAL_SEQUENTIAL);
}

/**
* Creates a client node, returns an observable that will produce the newly created
* node and then complete (or it will fail if there is an error creating the node)
* @param {Object} options - Options
* @param {ZookeeperClientAsync} options.client - The zookeeper client
* @param {string} options.basePath - The path under which to create the node
* @param {string} [options.groupId='none'] - Group id
* @param {string} [options.typeId='none'] - Type id
* @param {Object} [options.retryOptions] - The custom retry options
* @returns {string}
*/
/*
export function observeNewClientNode(options = {}) {
  const { client, basePath, groupId, typeId, retryOptions } = options;
  const clientId = createClientId();
  const clientNodePrefix = getClientNodePrefix({ clientId, groupId, typeId });

  // helper to try to find the node. on second and subsequent attempt,
  // tries to find the node, then on all attempts creates it. this implements
  // the suggested retry handling for zookeeper recipes, to handle the case
  // where the node was created on the server but there was some other error
  // in responding to the client
  let firstAttempt = true;
  const getClientNode = async () => {
    let node = null;
    if (firstAttempt) {
      firstAttempt = false;
    } else {
      node = await findClientNode({ client, basePath, clientNodePrefix });
    }
    if (!node) {
      node = await createClientNode({ client, basePath, clientNodePrefix });
    }
    return node;
  };

  // create the node with retry of recoverable errors
  return Observable.fromPromise(getClientNode)
    .retryWhen(error$ => handleRecoverableExceptions(error$, retryOptions));
}
*/
