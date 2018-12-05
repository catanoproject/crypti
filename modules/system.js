var os = require("os"),
	sandboxHelper = require('../helpers/sandbox.js');

//private fields
var modules, library, self, __private = {}, shared = {};

__private.version, __private.osName, __private.port, __private.sharePort;

//constructor
function System(scope, cb) {
	library = scope;
	self = this;
	self.__private = __private;

	__private.version = library.config.version;
	__private.port = library.config.port;
	__private.sharePort = Number(!!library.config.sharePort);
	__private.osName = os.platform() + os.release();

	setImmediate(cb, null, self);
}

//private methods

//public methods
System.prototype.getOS = function () {
	return __private.osName;
}

System.prototype.getVersion = function () {
	return __private.version;
}

System.prototype.getPort = function () {
	return __private.port;
}

System.prototype.getSharePort = function () {
	return __private.sharePort;
}

System.prototype.sandboxApi = function (call, args, cb) {
	sandboxHelper.callMethod(shared, call, args, cb);
}

//events
System.prototype.onBind = function (scope) {
	modules = scope;
}

//shared

//export
module.exports = System;
