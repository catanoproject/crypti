var util = require('util'),
	async = require('async'),
	path = require('path'),
	Router = require('../helpers/router.js'),
	errorCode = require('../helpers/errorCodes.js').error,
	sandboxHelper = require('../helpers/sandbox.js');

//private fields
var modules, library, self, __private = {}, shared = {};

__private.loaded = false

//constructor
function Server(scope, cb) {
	library = scope;
	self = this;
	self.__private = __private;
	__private.attachApi();

	setImmediate(cb, null, self);
}

//private methods
__private.attachApi = function() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.get('/', function (req, res) {
		if (__private.loaded) {
			res.render('wallet.html', {layout: false});
		} else {
			res.render('loading.html');
		}
	});

	router.use(function (req, res, next) {
		if (req.url.indexOf('/api/') == -1 && req.url.indexOf('/peer/') == -1) {
			return res.redirect('/');
		}
		next();
		//res.status(500).send({success: false, error: 'api not found'});
	});

	library.network.app.use('/', router);
}

//public methods

Server.prototype.sandboxApi = function (call, args, cb) {
	sandboxHelper.callMethod(shared, call, args, cb);
}

//events
Server.prototype.onBind = function (scope) {
	modules = scope;
}

Server.prototype.onBlockchainReady = function () {
	__private.loaded = true;
}

//shared

//export
module.exports = Server;
