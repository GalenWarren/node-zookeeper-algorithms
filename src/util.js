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
export function getClientNodePrefix(options = {}) {
  const { clientId, typeId = defaultId, groupId = defaultId } = options;
  return [clientId, typeId, groupId, '']
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
export function handleNotifications(error$, options = {}) {
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
* Creates a client node, returns a promise that resolves to the path of the
* newly created node. This wil handle recoverable errors and retry and will
* properly handle the ambiguous node-creation state that occurs if the
* connection is lost.
* @param {Object} options - Options
* @param {ZookeeperClientAsync} options.client - The zookeeper client
* @param {string} options.basePath - The path under which to create the node
* @param {string} [options.groupId='none'] - Group id
* @param {string} [options.typeId='none'] - Type id
* @param {Object} [options.retryOptions] - Custom retry options
* @param {Object} [logger] - An optional Winston-style logger object
* @returns {string}
*/
export function createClientNode(options = {}) {
  const { client, basePath, logger, retryOptions } = options;
  const clientId = createClientId();
  const prefix = getClientNodePrefix(options);
  const path = `${basePath}/${prefix}`;

  if (logger) {
    logger.log('verbose', 'creating client node', {
      options,
      clientId,
      prefix,
      path
    });
  }

  // async function to find or create the node. kgw add find!
  // const firstAttempt = true;
  const findOrCreateNode = async () => {
    // if not first attempt, look for an existing node based
    // on the client id allocate above
    let node = null;

    // didn't find it, so try to create it
    node = await pify(client.create).call(
      client,
      path,
      null,
      CreateMode.EPHEMERAL_SEQUENTIAL
    );

    if (logger) {
      logger.log('verbose', 'created client node', {
        node
      });
    }
  };

  // find/create the node with retry behavior
  return Observable.fromPromise(findOrCreateNode)
    .retryWhen(error$ => handleNotifications(error$, retryOptions))
    .toPromise();
}
