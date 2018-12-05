var async = require('async'),
	util = require('util'),
	slots = require('../helpers/slots.js'),
	sandboxHelper = require('../helpers/sandbox.js'),
	constants = require('../helpers/constants.js');

//private fields
var modules, library, self, __private = {}, shared = {};
__private.tasks = [];
__private.feesByRound = {};
__private.delegatesByRound = {};
__private.unFeesByRound = {};
__private.unDelegatesByRound = {};
__private.forgedBlocks = {};
__private.missedBlocks = {};

//constructor
function Round(scope, cb) {
	library = scope;
	self = this;
	self.__private = __private;
	setImmediate(cb, null, self);
}

//public methods
Round.prototype.calc = function (height) {
	return Math.floor(height / slots.delegates) + (height % slots.delegates > 0 ? 1 : 0);
}

Round.prototype.directionSwap = function (direction) {
	switch (direction) {
		case 'backward':
			__private.feesByRound = {};
			__private.delegatesByRound = {};
			__private.tasks = [];
			break;
		case 'forward':
			__private.unFeesByRound = {};
			__private.unDelegatesByRound = {};
			__private.tasks = [];
			break;
	}
}

Round.prototype.backwardTick = function (block, previousBlock, cb) {
	function done(err) {
		cb && cb(err);
	}

	__private.forgedBlocks[block.generatorPublicKey] = (__private.forgedBlocks[block.generatorPublicKey] || 0) - 1;

	var round = self.calc(block.height);

	var prevRound = self.calc(previousBlock.height);

	__private.unFeesByRound[round] = (__private.unFeesByRound[round] || 0);
	__private.unFeesByRound[round] += block.totalFee;

	__private.unDelegatesByRound[round] = __private.unDelegatesByRound[round] || [];
	__private.unDelegatesByRound[round].push(block.generatorPublicKey);

	if (prevRound !== round || previousBlock.height == 1) {
		if (__private.unDelegatesByRound[round].length == slots.delegates || previousBlock.height == 1) {
			var roundDelegates = modules.delegates.generateDelegateList(block.height);
			roundDelegates.forEach(function (delegate) {
				if (__private.unDelegatesByRound[round].indexOf(delegate) == -1) {
					__private.missedBlocks[delegate] = (__private.missedBlocks[delegate] || 0) - 1;
				}
			});

			async.series([
				function (cb) {
					var task;
					async.whilst(function () {
						task = __private.tasks.shift();
						return !!task;
					}, function (cb) {
						task(function () {
							setImmediate(cb);
						});
					}, cb);
				},
				function (cb) {
					var foundationFee = Math.floor(__private.unFeesByRound[round] / 10);
					var diffFee = __private.unFeesByRound[round] - foundationFee;

					if (foundationFee || diffFee) {
						modules.accounts.mergeAccountAndGet({
							address: constants.foundation,
							balance: -foundationFee,
							u_balance: -foundationFee
						}, function (err, recipient) {
							if (err) {
								return cb(err);
							}
							var delegatesFee = Math.floor(diffFee / slots.delegates);
							var leftover = diffFee - (delegatesFee * slots.delegates);

							async.forEachOfSeries(__private.unDelegatesByRound[round], function (delegate, index, cb) {
								modules.accounts.mergeAccountAndGet({
									publicKey: delegate,
									balance: -delegatesFee,
									u_balance: -delegatesFee
								}, function (err, recipient) {
									if (err) {
										return cb(err);
									}
									modules.delegates.addFee(delegate, -delegatesFee);
									if (index === 0) {
										modules.accounts.mergeAccountAndGet({
											publicKey: delegate,
											balance: -leftover,
											u_balance: -leftover
										}, function (err) {
											if (err) {
												return cb(err);
											}
											modules.delegates.addFee(delegate, -leftover);
											cb();
										});
									} else {
										cb();
									}
								});
							}, cb);
						});
					} else {
						cb();
					}
				},
				function (cb) {
					var task;
					async.whilst(function () {
						task = __private.tasks.shift();
						return !!task;
					}, function (cb) {
						task(function () {
							setImmediate(cb);
						});
					}, cb);
				}
			], function (err) {
				delete __private.unFeesByRound[round];
				delete __private.unDelegatesByRound[round];
				done(err)
			});
		} else {
			done();
		}
	} else {
		done();
	}
}

Round.prototype.blocksStat = function (publicKey) {
	return {
		forged: __private.forgedBlocks[publicKey] || null,
		missed: __private.missedBlocks[publicKey] || null
	}
}

Round.prototype.tick = function (block, cb) {
	function done(err) {
		cb && setImmediate(cb, err);
	}

	__private.forgedBlocks[block.generatorPublicKey] = (__private.forgedBlocks[block.generatorPublicKey] || 0) + 1;
	var round = self.calc(block.height);

	__private.feesByRound[round] = (__private.feesByRound[round] || 0);
	__private.feesByRound[round] += block.totalFee;

	__private.delegatesByRound[round] = __private.delegatesByRound[round] || [];
	__private.delegatesByRound[round].push(block.generatorPublicKey);

	var nextRound = self.calc(block.height + 1);

	//console.log(block.height, round, nextRound);
	if (round !== nextRound || block.height == 1) {
		if (__private.delegatesByRound[round].length == slots.delegates || block.height == 1 || block.height == 101) {
			if (block.height != 1) {
				var roundDelegates = modules.delegates.generateDelegateList(block.height);
				roundDelegates.forEach(function (delegate) {
					if (__private.delegatesByRound[round].indexOf(delegate) == -1) {
						__private.missedBlocks[delegate] = (__private.missedBlocks[delegate] || 0) + 1;
					}
				});
			}

			async.series([
				function (cb) {
					var task;
					async.whilst(function () {
						task = __private.tasks.shift();
						return !!task;
					}, function (cb) {
						task(function () {
							setImmediate(cb);
						});
					}, cb);
				},
				function (cb) {
					var foundationFee = Math.floor(__private.feesByRound[round] / 10);
					var diffFee = __private.feesByRound[round] - foundationFee;

					if (foundationFee || diffFee) {
						modules.accounts.mergeAccountAndGet({
							address: constants.foundation,
							balance: foundationFee,
							u_balance: foundationFee
						}, function (err, recipient) {
							if (err) {
								return cb(err);
							}
							var delegatesFee = Math.floor(diffFee / slots.delegates);
							var leftover = diffFee - (delegatesFee * slots.delegates);

							async.forEachOfSeries(__private.delegatesByRound[round], function (delegate, index, cb) {
								modules.accounts.mergeAccountAndGet({
									publicKey: delegate,
									balance: delegatesFee,
									u_balance: delegatesFee
								}, function (err, recipient) {
									if (err) {
										return cb(err);
									}
									modules.delegates.addFee(delegate, delegatesFee);

									if (index === __private.delegatesByRound[round].length - 1) {
										modules.accounts.mergeAccountAndGet({
											publicKey: delegate,
											balance: leftover,
											u_balance: leftover
										}, function (err, recipient) {
											if (err) {
												return cb(err);
											}
											modules.delegates.addFee(delegate, leftover);
											cb();
										});
									} else {
										cb();
									}
								});
							}, cb);
						});
					} else {
						cb();
					}
				},
				function (cb) {
					var task;
					async.whilst(function () {
						task = __private.tasks.shift();
						return !!task;
					}, function (cb) {
						task(function () {
							setImmediate(cb);
						});
					}, function () {
						library.bus.message('finishRound', round);
						cb();
					});
				}
			], function (err) {
				delete __private.feesByRound[round];
				delete __private.delegatesByRound[round];

				done(err);
			});
		} else {
			done();
		}
	} else {
		done();
	}
}

Round.prototype.onFinishRound = function (round) {
	library.network.io.sockets.emit('rounds/change', {number: round});
}

Round.prototype.runOnFinish = function (task) {
	__private.tasks.push(task);
}

Round.prototype.sandboxApi = function (call, args, cb) {
	sandboxHelper.callMethod(shared, call, args, cb);
}

//events
Round.prototype.onBind = function (scope) {
	modules = scope;
}

//shared

//export
module.exports = Round;
