import pify from 'pify';

export default class ZookeeperClientAsync {

  constructor(client) {
    this.client = client;
  }

  createAsync(...args) {
    return pify(this.client.create).call(this.client, ...args);
  }
}
