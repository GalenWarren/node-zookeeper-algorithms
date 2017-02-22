'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _lock = require('./lock');

Object.keys(_lock).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _lock[key];
    }
  });
});