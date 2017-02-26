import bottle from 'bottlejs';
import Util from './util';
import Lock from './lock';

bottle.service('Util', Util);
bottle.service('Lock', Lock, 'Util');

export const lock = bottle.container.Lock;
