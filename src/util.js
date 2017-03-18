import pify from 'pify';
import { Observable } from 'rxjs';

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
    ([, delay]) => delay
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
      })
    );
}

/**
* Creates an observable of the children of a node. The filter and sort functions
* are passed the node names of the children, without the parent path.
* @param {ZookeeperClient} client - The node-zookeeper-client instance
* @param {Object} options
* @param {string} options.path - The path of the parent node
* @param {function} [options.filter] - The filter function
* @param {function} [options.sort] - The sort function
* @param {function} [options.watcher] - The watcher function
*/
export function observeNodeChildren(options) {
  const { client, path, filter = null, sort = null, watcher = null } = options;

  // construct the observable children
  let children$ = Observable.defer(async () => {
    await pify(client.mkdirp).call(client, path);
    const [children] = await pify(client.getChildren).call(client, path, watcher);
    return children;
  });

  // filter and sort if supplied
  if (filter) {
    children$ = children$.map(filter);
  }
  if (sort) {
    children$ = children$.map(sort);
  }

  // return node names (not full paths!)
  return children$;
}
