/* eslint-disable */
import RecipesClient, { getSequenceNumber, crackClientNodePath } from './client';
import zookeeper from 'node-zookeeper-client';
import { State } from 'node-zookeeper-client';

const clientFactory = () => zookeeper.createClient('localhost:2181');

const client = new RecipesClient({
  clientFactory
});

// client.on('state', state => console.log('state', state));
// client.on('error', error => console.error(error));
// client.on('complete', () => console.log('complete'));

client.connect();

client.observeLockState('/locks/1').subscribe(
  value => console.log('1', value),
  err => console.error('2', err),
  () => console.log("complete")
);
