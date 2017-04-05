import { Observable } from 'rxjs';
import EventEmitter from 'events';

import {
  observeExclusiveLock
} from '../../src/recipes/lock';

describe('observeExclusiveLock', () => {

  const client = {
    mkdirp: sandbox.stub().yields(null),
    getChildren: sandbox.stub(),
    exists: sandbox.stub(),
    create: sandbox.stub(),
  };

  const path = '/lock';

  const clientNodePrefix = 'abc';

  it('should properly obtain lock when client node already exists', async () => {

    client.getChildren.onCall(0).yields(null, [['abc-0001']]);

    const lockState$ = observeExclusiveLock({
      client,
      path,
      clientNodePrefix,
    });

    const lockState = await lockState$.first().toPromise();
    lockState.should.equal(true);

    client.mkdirp.should.have.been.calledOnce.calledWith(path);
    client.getChildren.should.have.been.calledOnce.calledWith(path);
  });

  it('should properly obtain lock when client node is first to be created', async () => {

    client.getChildren.onCall(0).yields(null, [[]]);
    client.getChildren.onCall(1).yields(null, [['abc-0001']]);

    const lockState$ = observeExclusiveLock({
      client,
      path,
      clientNodePrefix,
    });

    const lockState = await lockState$.first().toPromise();
    lockState.should.equal(true);

    client.mkdirp.should.have.been.calledTwice.calledWith(path);
    client.getChildren.should.have.been.calledTwice.calledWith(path);
    // client.create.should.have.been.calledOnce.calledWith('abc');
  });

});
