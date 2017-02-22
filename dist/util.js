'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

exports.createClientId = createClientId;
exports.validateNodeComponent = validateNodeComponent;
exports.getClientNodePrefix = getClientNodePrefix;
exports.handleNotifications = handleNotifications;
exports.createClientNode = createClientNode;

var _v = require('uuid/v4');

var _v2 = _interopRequireDefault(_v);

var _nodeZookeeperClient = require('node-zookeeper-client');

var _rxjs = require('rxjs');

var _pify = require('pify');

var _pify2 = _interopRequireDefault(_pify);

var _errors = require('./errors');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

/**
* The default id used when one is not specified ('none')
* @constant {string}
*/
var defaultId = 'none';

/**
* Creates a client id
* @returns {string} - A unique id (uuid v4 with no dashes)
*/
function createClientId() {
  return (0, _v2.default)().replace(/-/g, '');
}

/**
* Validates that a node component is legitimate, i.e. doesn't contain
* any dashes.
* @param {string} component - The component to test
* @throws {InvalidNodeComponentError} if the component is invalid
*/
function validateNodeComponent(component) {
  if (component.indexOf('-') >= 0) {
    throw new _errors.InvalidNodeComponentError(component);
  }
  return component;
}

/**
* Creates a prefix for a client node, combining client id,
* group id, type id.
* @param {Object} options - Options
* @param {string} options.clientId - Client id
* @param {string} [options.groupId='none'] - Group id
* @param {string} [options.typeId='none'] - Type id
* @returns {string}
*/
function getClientNodePrefix() {
  var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var clientId = options.clientId,
      _options$typeId = options.typeId,
      typeId = _options$typeId === undefined ? defaultId : _options$typeId,
      _options$groupId = options.groupId,
      groupId = _options$groupId === undefined ? defaultId : _options$groupId;

  return [clientId, typeId, groupId, ''].map(validateNodeComponent).map(encodeURIComponent).join('-');
}

/**
* A notification handler to be used by rxjs's retryUntil, implements the
* rules for recoverable errors for zookeeper. Specifically, this causes
* zookeeper actions to be retried (with exponential backoff) if
* CONNECTION_LOSS is returned but treats everything else as fatal.
* See https://cwiki.apache.org/confluence/display/ZOOKEEPER/FAQ
* @param {Observable} error$ - The observable of error notifications
* @param {Object} [options] - The options for the handler
* @param {number} [options.initialDelay=1000] - The initial retry delays
* @param {number} [options.maxDelay=8000] - The max delay
* @param {number} [options.maxRetries=6] - The max number of retries before we give up
*/
function handleNotifications(error$) {
  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var _options$initialDelay = options.initialDelay,
      initialDelay = _options$initialDelay === undefined ? 1000 : _options$initialDelay,
      _options$maxDelay = options.maxDelay,
      maxDelay = _options$maxDelay === undefined ? 8000 : _options$maxDelay,
      _options$maxRetries = options.maxRetries,
      maxRetries = _options$maxRetries === undefined ? 6 : _options$maxRetries;

  // this observable will return the sequence of retry delays

  var delay$ = _rxjs.Observable.generate(0, function (index) {
    return index < maxRetries;
  }, function (index) {
    return index + 1;
  }, function (index) {
    return Math.min(Math.pow(2, index) * initialDelay, maxDelay);
  });

  // retry on connection until we run out of retries
  return _rxjs.Observable.zip(error$, delay$).flatMap(function (_ref) {
    var _ref2 = _slicedToArray(_ref, 2),
        err = _ref2[0],
        delay = _ref2[1];

    switch (err.code) {
      case _nodeZookeeperClient.Exception.CONNECTION_LOSS:
        return _rxjs.Observable.of(null).delay(delay);
      default:
        return _rxjs.Observable.of();
    }
  });
}

/**
* Creates a client node, returns a promise that resolves to the path of the
* newly created node. This wil handle recoverable errors and retry and will
* properly handle the ambiguous node-creation state that occurs if the
* connection is lost.
* @param {Object} options - Options
* @param {ZookeeperClientAsync} options.client - The zookeeper client
* @param {string} options.basePath - The path under which to create the node
* @param {string} [options.groupId='none'] - Group id
* @param {string} [options.typeId='none'] - Type id
* @param {Object} [options.retryOptions] - Custom retry options
* @param {Object} [logger] - An optional Winston-style logger object
* @returns {string}
*/
function createClientNode() {
  var _this = this;

  var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var client = options.client,
      basePath = options.basePath,
      logger = options.logger,
      retryOptions = options.retryOptions;

  var clientId = createClientId();
  var prefix = getClientNodePrefix(options);
  var path = basePath + '/' + prefix;

  if (logger) {
    logger.log('verbose', 'creating client node', {
      options: options,
      clientId: clientId,
      prefix: prefix,
      path: path
    });
  }

  // async function to find or create the node. kgw add find!
  // const firstAttempt = true;
  var findOrCreateNode = function () {
    var _ref3 = _asyncToGenerator(regeneratorRuntime.mark(function _callee() {
      var node;
      return regeneratorRuntime.wrap(function _callee$(_context) {
        while (1) {
          switch (_context.prev = _context.next) {
            case 0:
              // if not first attempt, look for an existing node based
              // on the client id allocate above
              node = null;

              // didn't find it, so try to create it

              _context.next = 3;
              return (0, _pify2.default)(client.create).call(client, path, null, _nodeZookeeperClient.CreateMode.EPHEMERAL_SEQUENTIAL);

            case 3:
              node = _context.sent;


              if (logger) {
                logger.log('verbose', 'created client node', {
                  node: node
                });
              }

            case 5:
            case 'end':
              return _context.stop();
          }
        }
      }, _callee, _this);
    }));

    return function findOrCreateNode() {
      return _ref3.apply(this, arguments);
    };
  }();

  // find/create the node with retry behavior
  return _rxjs.Observable.fromPromise(findOrCreateNode).retryWhen(function (error$) {
    return handleNotifications(error$, retryOptions);
  }).toPromise();
}