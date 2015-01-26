var Router = require('../helpers/router.js'),
	async = require('async'),
	request = require('request'),
	ip = require('ip'),
	util = require('util'),
	params = require('../helpers/params.js'),
	normalize = require('../helpers/normalize.js');

//private fields
var modules, library, self;

var headers = {};
var loaded = false;

//constructor
function Transport(cb, scope) {
	library = scope;
	self = this;

	attachApi();

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules && loaded) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.use(function (req, res, next) {
		var peerIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

		if (peerIp == "127.0.0.1") {
			return next();
		}

		var peer = {
			ip: ip.toLong(peerIp),
			port: params.int(req.headers['port']),
			state: 2,
			os: params.string(req.headers['os'], true),
			sharePort: Number(!!params.int(req.headers['share-port'])),
			version: params.string(req.headers['version'], true)
		};

		if (peer.port != 8040) return;

		if (peer.port > 0 && peer.port <= 65535) {
			modules.peer.update(peer);
		}

		next();
	});

	router.get('/list', function (req, res) {
		res.set(headers);
		modules.peer.list(100, function (err, peers) {
			console.log("send");
			return res.status(200).json({peers: !err ? peers : []});
		})
	});

	router.get("/blocks/ids", function (req, res) {
		res.set(headers);
		var id = params.string(req.query.id);
		if (!id) {
			return res.json({success: false, error: "Provide id in url"});
		}

		library.dbLite.query("SELECT id FROM blocks WHERE height > (SELECT height FROM blocks where id=$id) ORDER BY height LIMIT 1440", {id: id}, ['id'], function (err, rows) {
			if (err) {
				return res.status(200).json({success: false, error: "Internal sql error"});
			}

			var ids = [];
			for (var i = 0; i < rows.length; i++) {
				ids.push(rows[i].id);
			}
			res.status(200).json({ids: ids});
		});
	});

	router.get("/blocks/milestone", function (req, res) {
		res.set(headers);

		var lastBlockId = params.string(req.query.lastBlockId, true);
		var lastMilestoneBlockId = params.string(req.query.lastMilestoneBlockId, true);
		if (!lastBlockId && !lastMilestoneBlockId) {
			return res.json({success: false, error: "Error, provide lastBlockId or lastMilestoneBlockId"});
		}

		var lastBlock = modules.blocks.getLastBlock();

		if (lastBlockId == lastBlock.id) {
			return res.status(200).json({last: true, milestoneBlockIds: [lastBlockId]});
		}

		var blockId, height, jump, limit;
		var milestoneBlockIds = [];
		async.series([
			function (cb) {
				if (lastMilestoneBlockId) {
					library.dbLite.query("SELECT height FROM blocks WHERE id=$id", {id: lastMilestoneBlockId}, {"height": Number}, function (err, rows) {
						if (err) {
							return cb("Internal sql error");
						}

						var block = rows.length && rows[0];

						if (!block) {
							cb("Can't find block: " + lastMilestoneBlockId);
						} else {
							height = block.height;
							jump = Math.min(1440, lastBlock.height - height);
							height = Math.max(height - jump, 0);
							limit = 10;
							cb();
						}
					});
				} else if (lastBlockId) {
					height = lastBlock.height;
					jump = 10;
					limit = 10;
					cb();
				}
			}
		], function (error) {
			if (error) {
				return res.status(200).json({success: false, error: error});
			} else {
				library.dbLite.query("SELECT id FROM blocks WHERE height = $height", {height: height}, ['id'], function (err, rows) {
					if (err) {
						return res.status(200).json({success: false, error: "Internal sql error"});
					}

					var block = rows.length && rows[0];

					if (!block) {
						res.status(200).json({milestoneBlockIds: milestoneBlockIds});
					} else {
						blockId = block.id;

						async.whilst(
							function () {
								return (height > 0 && limit-- > 0);
							},
							function (next) {
								milestoneBlockIds.push(blockId);
								library.dbLite.query("SELECT id FROM blocks WHERE height = $height", {height: height}, ['id'], function (err, rows) {
									if (err) {
										return next(err);
									}

									var block = rows.length && rows[0];

									if (!block) {
										next("Internal error");
									} else {
										blockId = block.id;
										height = height - jump;
										next();
									}
								});
							},
							function (err) {
								if (err) {
									return res.status(200).json({success: false, error: err});
								}

								res.status(200).json({milestoneBlockIds: milestoneBlockIds});
							}
						)
					}
				});
			}
		});
	});

	router.get("/blocks", function (req, res) {
		res.set(headers);

		var lastBlockId = params.string(req.query.lastBlockId);

		// get 1400+ blocks with all data (joins) from provided block id
		modules.blocks.loadBlocksPart({limit: 1440, lastId: lastBlockId}, function (err, blocks) {
			return res.status(200).json({blocks: !err ? blocks : []});
		});
	});

	router.post("/blocks", function (req, res) {
		res.set(headers);

		var block = normalize.block(req.body.block)

		library.bus.message('receiveBlock', block);

		res.sendStatus(200);
	});

	router.get("/transactions", function (req, res) {
		res.set(headers);
		// need to process headers from peer
		res.status(200).json({transactions: modules.transactions.getUnconfirmedTransactions()});
	});

	router.post("/transactions", function (req, res) {
		res.set(headers);

		var transaction = normalize.transaction(req.body.transaction);

		library.bus.message('receiveTransaction', transaction);

		res.sendStatus(200);
	});

	router.get('/height', function (req, res) {
		res.set(headers);
		res.status(200).json({
			height: modules.blocks.getLastBlock().height
		});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/peer', router);

	library.app.use(function (err, req, res, next) {
		library.logger.error('/peer', err)
		if (!err) return next();
		res.status(500).send({success: false, error: err});
	});
}

function _request(peer, api, method, data, cb) {
	var req = {
		url: 'http://' + ip.fromLong(peer.ip) + ':' + peer.port + '/peer' + api,
		method: method,
		json: true,
		headers: headers,
		timeout: 5000
	};


	library.logger.trace('request', req.url)

	if (Object.prototype.toString.call(data) == "[object Object]" || util.isArray(data)) {
		req.json = data;
	} else {
		req.body = data;
	}

	request(req, function (err, response, body) {
		if (err || response.statusCode != 200) {
			library.logger.debug('request', {
				url: req.url,
				statusCode: response ? response.statusCode : 'unknown',
				err: err
			});

			modules.peer.state(peer.ip, peer.port, 0, 60);
			library.logger.debug('ban 60 sec ' + req.method + ' ' + req.url)
			cb && cb(err || ('request status code' + response.statusCode));
			return;
		}

		var port = params.int(response.headers['port']);
		if (port > 0 && port <= 65535) {
			modules.peer.update({
				ip: peer.ip,
				port: port,
				state: 2,
				os: params.string(response.headers['os'], true),
				sharePort: Number(!!params.int(response.headers['share-port'])),
				version: params.string(response.headers['version'], true)
			});
		}


		cb && cb(null, body);
	});
}

//public methods
Transport.prototype.broadcast = function (peersCount, method, data, cb) {
	peersCount = peersCount || 1;
	if (!cb && (typeof(data) == 'function')) {
		cb = data;
		data = undefined;
	}
	modules.peer.list(peersCount, function (err, peers) {
		if (!err) {
			async.eachLimit(peers, 3, function (peer, cb) {
				_request(peer, method, "POST", data);
				setImmediate(cb);
			}, function () {
				cb && cb(null, {body: null, peer: peers});
			})
		} else {
			cb && setImmediate(cb, err);
		}
	});
}

Transport.prototype.getFromRandomPeer = function (method, cb) {
	modules.peer.list(1, function (err, peers) {
		if (!err && peers.length) {
			var peer = peers[0];
			_request(peer, method, "GET", undefined, function (err, body) {
				cb(err, {body: body, peer: peer});
			});
		} else {
			return cb(err || "Nothing peers in db");
		}
	});
}

Transport.prototype.getFromPeer = function (peer, method, cb) {
	_request(peer, method, "GET", undefined, function (err, body) {
		cb(err, {body: body, peer: peer});
	});
}

//events
Transport.prototype.onBind = function (scope) {
	modules = scope;

	headers = {
		os: modules.system.getOS(),
		version: modules.system.getVersion(),
		port: modules.system.getPort(),
		'share-port': modules.system.getSharePort()
	}
}

Transport.prototype.onBlockchainReady = function () {
	loaded = true;
}

Transport.prototype.onUnconfirmedTransaction = function (transaction, broadcast) {
	broadcast && self.broadcast(100, '/transactions', {transaction: transaction});
}

Transport.prototype.onNewBlock = function (block, broadcast) {
	broadcast && self.broadcast(100, '/blocks', {block: block})
}

//export
module.exports = Transport;