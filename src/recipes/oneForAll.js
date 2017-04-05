import { Observable } from 'rxjs';
import { observeRemoveNode } from '../util';

/**
* Generates an observable for an all for one action
* @param {Object} options
* @param {Object} options.client - The node-zookeeper-client instance
* @param {Object} options.path - The path on which to get the lock
* @param {string} options.clientNodePrefix - The client node prefix for this action
* @param {function} options.action
* @param {function} options.testActionDone
*/
export function observeOneForAllAction(options) {
  const { client, path, clientNodePrefix, action, testActionDone } = options;
  return this.observeSeekClientNodeState({
    client,
    path,
    clientNodePrefix,
    repeat: async (nodes) => {
      const done = await Promise.resolve(testActionDone());
      if (done) {
        return Observable.of(false);
      }
      return observeRemoveNode(client, nodes[0]).map(() => true);
    },
  }).distinctUntilChanged()
    .flatMap((isLeader) => {
      if (isLeader) {
        action();
      }
    });
}
