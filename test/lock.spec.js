import { Observable } from 'rxjs';
import EventEmitter from 'events';

import {
  observeLockState
} from '../src/lock';

describe('observeLockState', () => {

  const clientStateEmitter = new EventEmitter();
  const clientState$ = Observable.fromEvent(clientStateEmitter, 'state');

  const handlers = {
    next: sandbox.stub(),
    error: sandbox.stub(),
    complete: sandbox.stub()
  };

  const client = {
  };

  it('should', async () => {

    const lockState$ = observeLockState(clientState$, '/test', 'client1');
    lockState$.subscribe(handlers.next, handlers.error, handlers.complete);

    clientStateEmitter.emit('state', { client, connected: true, readonly: false });

  });

});
