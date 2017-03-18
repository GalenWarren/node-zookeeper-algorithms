import EventEmitter from 'events';
import { Observable } from 'rxjs';

import { sortBySequence } from '../src/client';

import {
  observeDelay,
  makeRetryable,
  observeNodeChildren
} from '../src/util';

describe('observeDelay', () => {

  it('should properly emit a configured sequence', async () => {
    (await observeDelay({
      initialDelay: 500,
      maxDelay: 2000,
      maxRetries: 4
    }).toArray().toPromise()).should.deep.equal([500, 1000, 2000, 2000])
  });

  it('should properly emit a zero element sequence', async () => {
    (await observeDelay({
      initialDelay: 500,
      maxDelay: 2000,
      maxRetries: 0
    }).toArray().toPromise()).should.deep.equal([])
  });

  it('should properly emit a configured sequence', async () => {
    (await observeDelay().toArray().toPromise()).should.be.an.array;
  });

});

describe('makeRetryable', function() {

  const result = "result";

  const retryOptions = {
    initialDelay: 1,
    maxDelay: 1,
    maxRetries: 3
  };

  const delay$ = observeDelay(retryOptions);

  function failingObservable(failCount, value = null) {
    let index = 0;
    return Observable.defer(() => {
      if (index++ < failCount) {
        return Observable.throw(new Error('failingObservable'));
      } else {
        return Observable.of(value);
      }
    });
  }

  it('should get value from observable that does not fail', async () => {
    const value$ = makeRetryable(failingObservable(0, result), delay$);
    await value$.last().toPromise().should.become(result);
  });

  it('should get value from observable that fails fewer than maxRetries times', async () => {
    const value$ = makeRetryable(failingObservable(retryOptions.maxRetries - 1, result), delay$);
    await value$.last().toPromise().should.become(result);
  });

  it('should get value from observable that fails exactly maxRetries times', async () => {
    const value$ = makeRetryable(failingObservable(retryOptions.maxRetries, result), delay$);
    await value$.last().toPromise().should.become(result);
  });

  it('should fail to get value from observable that fails > maxRetries times', async () => {
    const value$ = makeRetryable(failingObservable(retryOptions.maxRetries + 1, result), delay$);
    await value$.toPromise().should.be.rejectedWith('failingObservable');
  });

  it('should get value from observable that fails in a way that matches predicate', async () => {
    const value$ = makeRetryable(
      failingObservable(retryOptions.maxRetries - 1, result),
      delay$,
      error => true
    );
    await value$.last().toPromise().should.become(result);
  });

  it('should not get value from observable that fails in a way that does not match predicate', async () => {
    const value$ = makeRetryable(
      failingObservable(retryOptions.maxRetries - 1, result),
      delay$,
      error => false
    );
    await value$.toPromise().should.be.rejectedWith('failingObservable');
  });

});

describe('observeNodeChildren', () => {

  const children = [
    'type-client-003',
    'type-client-001',
    'type-client-002'
  ];

  const client = {
    mkdirp: sandbox.stub().yields(null),
    getChildren: sandbox.stub().yields(null, [children])
  };

  it('should properly observe children', async () => {
    const children$ = observeNodeChildren({
      client,
      path: '/test'
    });
    await children$.toArray().toPromise().should.become([children]);
  });

  it('should properly observe children with filter and sort', async () => {
    const children$ = observeNodeChildren({
      client,
      path: '/test',
      filter: children => children.filter(child => !/2/.test(child)),
      sort: children => children.sort(sortBySequence)
    });
    await children$.toArray().toPromise().should.become([[
      'type-client-001',
      'type-client-003'
    ]]);
  });

});
