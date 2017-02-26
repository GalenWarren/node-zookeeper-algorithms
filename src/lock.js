/* eslint-disable class-methods-use-this */

export default class Lock {

  /**
  * Lock class constructor, inject dependencies
  */
  constructor(util) {
    this.util = util;
  }

  /**
  * Attempts to acquire an exclusive lock at the provided node and
  * returns an observable of lock states
  * @param {Object} options - Options
  * @param {ZookeeperClient} options.client - The zookeeper client
  * @param {string} options.path - The path under which to create the node
  * @param {string} [options.key] - The key to lock (optional)
  */
  observeExclusiveLock(options) {
    const { client, path, key } = options;

    // get a client id to use for this lock operation
    const clientId = this.util.createClientId();

    // create a client node and generate an observable of lock states
    return this.util.observeClientNode({ client, path, type: key, clientId })
      .flatMap(() => this.util.observeNodeValue({ client, path, method: 'getChildren' }));
  }

  /**
  * Performs the provided action once a lock is obtained. No handling is
  * in place for the case where a connection is lost when a lock is held; this
  * will perform the action anyway, so it's assumed the action is idempotent.
  * For more advanced handling, use the underlying lock observable directly.
  * @param {Observable} lockState$ - The observable of lock states, true or false
  * @param {function} action - The action to be performed when the lock is acquired
  */
  async withLock(lockState$, action) {
    await lockState$.filter(state => state).first().toPromise();
    action();
  }

}
