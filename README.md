**Under construction, please come back later...**

## Overview ##

This module provides implementations of some Zookeeper algorithms, including some standard recipes as described [here](https://zookeeper.apache.org/doc/trunk/recipes.html).

API [documentation](https://galenwarren.github.io/node-zookeeper-algorithms/)

## Installation

Install the module using npm:

```bash
$ npm install --save node-zookeeper-algorithms
```

## Usage

All examples use ES6 syntax.

To use this module, import and create an instance of the ZookeeperAlgorithms class.

```javascript
import ZookeeperAlgorithms from 'node-zookeeper-algorithms';

const algorithms = new ZookeeperAlgorithms('localhost:2181');
```

If a string is supplied to the ZookeeperAlgorithms constructor, that string will be used to construct a node-zookeeper-client instance. Alternatively, a factory function may be supplied to the constructor, which must return a node-zookeeper-client instance when called, i.e.:

```javascript
import ZookeeperClient from 'node-zookeeper-client';
import ZookeeperAlgorithms from 'node-zookeeper-algorithms';

const algorithms = new ZookeeperAlgorithms(() => new ZookeeperClient('localhost:2181'));
```

The ZookeeperAlgorithms instance handles errors on the underlying client instance and automatically reconnects in the event of unrecoverable errors.

KGW -- add max disconnected interval and event that fires if this occurs?

### Algorithms

Various algorithms are implemented by this module, all of which are implemented via rxjs Observables that emit values and/or complete at appropriate times. The default error handling behavior is to indefinitely retry on recoverable errors and reconnect/retry on nonrecoverable errors -- both with exponential backoff -- so observables should never terminate in an error state.

The following chart summarizes the algorithms, and more detailed examples of each follow.

| Algorithm  | Method  | Emits | Completes |
| ---     | ---     | ---   | ---       |
| [Leader election](leader-election) | observeLeaderElection | *{ isLeader: true, leaderId }* when caller is the leader, *{ isLeader: false, leaderId }* otherwise | Never
| [Exclusive lock](exclusive-lock) | observeExclusiveLock | *true* when lock is held, *false* when lock is not held | Never
| [One-for-all state update](one-for-all-state-update) | observeOneForAllStateUpdate | *null* when caller should update the state | When the state has been updated by some participant (not necessarily by caller)

#### Leader election

A leader election is modeled by an Observable returned from the observeLeaderElection method, which emits a value whenever the leader changes. This value indicates the uuid of the leader and also whether the caller is the leader or not:

```javascript
// join the election
const election = algorithms.observeLeaderElection('/path/to/leader/node').subscribe(
  ({ isLeader, leaderId }) => {
    if (isLeader) {
      // the caller is the leader
    } else {
      // the caller is not the leader
    }
  },
);

// leave the election
election.unsubscribe();
```

#### Exclusive lock

An exclusive lock is modeled by an Observable returned from the observeExclusiveLock method, which emits *true* or *false* when the caller does and does not have the lock, respectively. Note that even once a lock is acquired, it may be lost if the connection to the Zookeeper server is lost. Example:

```javascript
const lock = algorithms.observeExclusiveLock('/path/to/lock').subscribe(
  (hasLock) => {
    // if hasLock is true, the caller has the lock; otherwise, the caller does not have the lock
    if (hasLock) {
      // caller has lock, unsubscribing releases the lock
      lock.unsubscribe();
    } else {
      // caller does not have lock ...
    }
  },
)
```

The exclusiveLock helper method makes this a bit simpler:

```javascript
// acquires lock
const unlock = await algorithms.exclusiveLock('/path/to/lock');

// releases lock
unlock();
```

A lock can be optionally be acquired on a particular key to allow multiple locks at the same path (if no key is supplied, the key 'default' is used):

```javascript
// acquires lock
const unlock = await algorithms.exclusiveLock({ path: '/path/to/lock', key: '123');

// releases lock
unlock();
```

A lock acquired is this way can also supply a callback to be invoked if the lock is lost due to disconnection:

```javascript
// acquires lock
const unlock = await algorithms.exclusiveLock({
  path: '/path/to/lock',
  key: '123',
  lost: () => {
    // called if lock is lost ...
  },
);

// releases lock
unlock();
```


#### One-for-all state update

The all-for-one state update algorithm is intended to be used when multiple callers all want a state update to occur but it is desired that only one of them perform the update, for the benefit of all. This might be used, for example, to lazily populate a cache. This process is modeled by an observable that:
* Emits a value (null) if/when the caller should perform the state update and
* Completes when the state update has been performed (not necessarily by the caller)

```javascript
await algorithms.observeOneForAllStateUpdate({
  path: '/path/to/state/node',

}).flatMap(
  () => {

  },
).toPromise();
```

## Polyfills

This module requires async/await support, so if that is not available natively it must be polyfilled, i.e. via babel-polyfill.

Promises?
