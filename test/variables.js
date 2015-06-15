/**
 * Ask Sebastian if you have any questions. Last Edit: 14/06/2015
 */

'use strict';

// Requires and node configuration
var _ = require('lodash'),
	config = require('./config.json'),
    expect = require('chai').expect,
    supertest = require('supertest'),
    api = supertest('http://' + config.address + ':' + config.port + '/api'),
	peer = supertest('http://' + config.address + ':' + config.port + '/peer'),
	async = require('async'); // DEFINES THE NODE WE USE FOR THE TEST

var normalizer = 100000000; // Use this to convert XCR amount to normal value
var blockTime = 10000; // Block time in miliseconds
var blockTimePlus = 12000; // Block time + 2 seconds in miliseconds

// Holds Fee amounts for different transaction types.
var Fees = {
    voteFee : 100000000,
    usernameFee : 100000000,
    followFee : 100000000,
    transactionFee : 0.001,
    secondPasswordFee : 500000000,
    delegateRegistrationFee : 10000000000
};

// Account info for delegate to register manually
var Daccount = {
    'address': '9946841100442405851C',
    'publicKey': 'caf0f4c00cf9240771975e42b6672c88a832f98f01825dda6e001e2aab0bc0cc',
    'password': "1234",
    'secondPassword' : "12345",
    'balance': 0,
    'delegateName':'sebastian',
    'username':'bdevelle'
};

// Existing delegate account in blockchain
var Eaccount = {
    'address': '17604940945017291637C',
    'publicKey': 'f143730cbb5c42a9a02f183f8ee7b4b2ade158cb179b12777714edf27b4fcf3e',
    'password': "GwRr0RlSi",
    'balance': 0,
    'delegateName': 'genesisDelegate100'
};

// List of all transaction types codes
var TxTypes = {
    SEND : 0,
    SIGNATURE : 1,
    DELEGATE : 2,
    VOTE : 3,
    USERNAME : 4,
    FOLLOW : 5,
    MESSAGE : 6,
    AVATAR : 7,
    MULTI: 8
}

// Account info for foundation account - XCR > 1,000,000 | Needed for voting, registrations and Tx
var Faccount = {
    'address': '2334212999465599568C',
    'publicKey': '631b91fa537f74e23addccd30555fbc7729ea267c7e0517cbf1bfcc46354abc3',
    'password': "F3DP835EBuZMAhiuYn2AzhJh1lz8glLolghCMD4X8lRh5v2GlcBWws7plIDUuPjf3GUTOnyYEfXQx7cH",
    'balance': 0
};

// Random XCR Amount
var XCR = Math.floor(Math.random() * (100000 * 100000000)) + 1; // remove 1 x 0 for reduced fees (delegate + Tx)

// Used to create random delegates names
function randomDelegateName()
{
    var size = randomNumber(1,20); // Min. delegate name size is 1, Max. delegate name is 20
    var delegateName = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@$&_.";

    for( var i=0; i < size; i++ )
        delegateName += possible.charAt(Math.floor(Math.random() * possible.length));

    return delegateName;
}

// Randomizes XCR amount
function randomizeXCR(){
    return Math.floor(Math.random() * (10000 * 100000000)) + 1;
}
// Returns current block height
function getHeight(cb) {
	api.get('/blocks/getHeight')
		.set('Accept', 'application/json')
		.expect('Content-Type', /json/)
		.expect(200)
		.end(function (err, res) {
			if (err) {
				return cb(err);
			} else {
				return cb(null, res.body.height);
			}
		});
}

// Function used to wait until a new block has been created
function waitForNewBlock(height, cb) {
	var actualHeight = height;
	async.doWhilst(
		function (cb) {
			api.get('/blocks/getHeight')
				.set('Accept', 'application/json')
				.expect('Content-Type', /json/)
				.expect(200)
				.end(function (err, res) {
					if (err) {
						return cb(err);
					}

					if (height < res.body.height) {
						height = res.body.height;
					}

					setTimeout(cb, 1000);
				});
		},
		function () {
			return actualHeight < height;
		},
		function (err) {
			if (err) {
				return setImmediate(cb, err);
			} else {
				return setImmediate(cb, null, height);
			}
		}
	)
}


// Returns a random number between min (inclusive) and max (exclusive)
function randomNumber(min, max) {
    return Math.random() * (max - min) + min;
}

// Calculates the expected fee from a transaction
function expectedFee(amount){
    return parseInt(amount * Fees.transactionFee);
}

// Used to create random usernames
function randomUsername(){
    var size = randomNumber(1,16); // Min. username size is 1, Max. username size is 16
    var username = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@$&_.";

    for( var i=0; i < size; i++ )
        username += possible.charAt(Math.floor(Math.random() * possible.length));

    return username;
}

// Used to create random basic accounts
function randomAccount(){
    var account = {
        'address' : '',
        'publicKey' : '',
        'password' : "",
        'secondPassword': "",
        'delegateName' : "",
        'username':"",
        'balance': 0
    };

    account.password = randomPassword();
    account.secondPassword = randomPassword();
    account.delegateName = randomDelegateName();
    account.username =  randomUsername();

    return account;
}

// Used to create random transaction accounts (holds additional info to regular account)
function randomTxAccount(){
    return _.defaults(randomAccount(), {
        sentAmount:'',
        paidFee: '',
        totalPaidFee: '',
        transactions: []
    })
}

// Used to create random passwords
function randomPassword(){
    return Math.random().toString(36).substring(7);
}

// Exports variables and functions for access from other files
module.exports = {
    api: api,
	peer : peer,
	crypti : require('./cryptijs'),
    supertest: supertest,
    expect: expect,
    XCR: XCR,
    Faccount: Faccount,
    Daccount: Daccount,
    Eaccount: Eaccount,
    TxTypes: TxTypes,
    Fees: Fees,
    normalizer: normalizer,
    blockTime: blockTime,
    blockTimePlus: blockTimePlus,
    randomDelegateName: randomDelegateName,
    randomizeXCR: randomizeXCR,
    randomPassword: randomPassword,
    randomAccount: randomAccount,
    randomTxAccount: randomTxAccount,
    randomUsername: randomUsername,
    expectedFee:expectedFee,
	peers_config: config.mocha.peers,
	config: config,
	waitForNewBlock: waitForNewBlock,
	getHeight: getHeight
};