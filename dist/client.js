'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _pify2 = require('pify');

var _pify3 = _interopRequireDefault(_pify2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var ZookeeperClientAsync = function () {
  function ZookeeperClientAsync(client) {
    _classCallCheck(this, ZookeeperClientAsync);

    this.client = client;
  }

  _createClass(ZookeeperClientAsync, [{
    key: 'createAsync',
    value: function createAsync() {
      var _pify;

      for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      return (_pify = (0, _pify3.default)(this.client.create)).call.apply(_pify, [this.client].concat(args));
    }
  }]);

  return ZookeeperClientAsync;
}();

exports.default = ZookeeperClientAsync;