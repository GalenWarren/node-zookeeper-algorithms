# node-zookeeper-recipes #

## Overview ##

This library provides implementations of some Zookeeper recipes, including some standard ones as described [here](https://zookeeper.apache.org/doc/trunk/recipes.html).

API [documentation](https://galenwarren.github.io/node-zookeeper-recipes/)

*Under construction, please come back later...*

## Installation

Install the module using npm:

```bash
$ npm install --save node-zookeeper-recipes
```

## Examples

All examples are given using ES6 syntax.

1\. Create a node using given path:

```javascript
import Recipes from 'node-zookeeper-recipes';

const recipes = new Recipes('server');
```

## Recipes

| Recipe  | Method  | Emits | Completes |
| ---     | ---     | ---   | ---       |
| [Leader election](leader-election) | observeLeaderElection | *true* when caller is the leader, *false* otherwise | Never
| [Exclusive lock](exclusive-lock) | observeExclusiveLock | *true* when lock is held, *false* when lock is not held | Never
| [One-for-all state update](one-for-all-state-update) | observeOneForAllStateUpdate | *null* when caller should update the state | When the state has been updated by some participant (not necessarily by caller)

#### Exclusive lock

#### One-for-all state update
