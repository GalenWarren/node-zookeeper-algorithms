import { Observable } from 'rxjs';
import { CreateMode } from 'node-zookeeper-client';
import uuid from 'uuid/v4';

import { observeNodeChildren } from './util';
import { getClientNodePrefix, sortBySequence } from './client';

/**
* Attempts to acquire a lock and the given path and observes the lock state
* @param {Observable} clientState$ - The client state observable
* @param {string} path - The path at which to observe
* @param {string} [clientId] - The client id to use, one is allocated if not supplied
*/
export function observeLockState(clientState$, path, clientId = null) {
  const clientNodePrefix = getClientNodePrefix(clientId || uuid());
  const clientPath = [path, clientNodePrefix].join('/');
  console.log(clientNodePrefix, clientPath);

  return clientState$
    .flatMap(({ client, connected }) => {
      // are we connected?
      if (connected) {
        // yes, so observe the children to determine our state
        return observeNodeChildren({
          client,
          path,
          sort: sortBySequence
        }).flatMap((children) => {
          const index = children.findIndex(child => child.endsWith(clientNodePrefix));
          console.log('index', index);
          if (index < 0) {
            return Observable.bindNodeCallback(client.create).call(
              client,
              clientPath,
              null,
              CreateMode.EPHEMERAL_SEQUENTIAL
            );
          }
          return Observable.of(true);
        }).retryWhen(completion$ => completion$.map(() => true));
      }
      return Observable.of(false);
    });
}
