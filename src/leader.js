/* eslint-disable */

import { Observable } from 'rxjs';
import { CreateMode } from 'node-zookeeper-client';
import uuid from 'uuid/v4';
import pify from 'pify';

import { observeNodeChildren } from './util';
import { getClientNodePrefix, sortBySequence } from './client';

/**
* Attempts to acquire a lock and the given path and observes the lock state
* @param {Object} options - The options
* @param {Observable} options.clientState$ - The client state observable
* @param {string} options.path - The path at which to observe
* @param {function} options.watchSelector - Function that is called back with
* @param {string} [options.clientId] - The client id to use, one is allocated if not supplied
*/
export function observeLeaderState(options) {
  const { clientState$, path, watchSelector, clientId = null } = options;

  // construct the client node prefix that will represent this client in
  // this leader process ...
  const clientNodePrefix = getClientNodePrefix(clientId || uuid());

  /*
  // when the client is in the connected state, the leader state is
  // determined by doing the following in a loop against a node designated
  // for this leader election:
  // 1) read the children
  // 2) see where the node for this participant is, in the list.
  // 3) based on ABC
  // kgw -- first time optimization?
  const observeConnectedLeaderState = client => null;
    observeNodeChildren({ client, path, sort: sortBySequence }).flatMap((clientNodes) => {
      const clientIndex = clientNodes.findIndex(node => node.startsWith(clientNodePrefix));
      if (clientIndex >= 0) {
        // we found our node here ...
        const isLeader = clientIndex === 0;
        const clientNode = clientNodes[clientIndex];
        const clientPath = [path, clientNode].join('/');

        // determine the path to watc
        const watchPath = isLeader ?
          clientPath :
          [path, clientNodes[watchSelector(clientNodes, clientIndex)]].join('/');



      }

      // this means that our node isn't even present, so create the node
      // so that, next time around, we'll expect to see our node
      // in the list and can proceed with the protocol.
      return pify(client.create).call(
        client,
        [path, clientNodePrefix].join('/'),
        null,
        CreateMode.EPHEMERAL_SEQUENTIAL
      );

    })); //s.retryWhen(completion$ => completion$.map(() => true));

  // map from the client states to the leader states. if disconnected,
  // the the leader state is always false and that's all we know
  return clientState$.flatMap(({ client, connected }) => connected ?
    observeConnectedLeaderState(client) :
    Observable.of({ isLeader: false });
  );
  */

}
