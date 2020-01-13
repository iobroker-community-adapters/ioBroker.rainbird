'use strict';

const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const schedule = require('node-schedule');
const rainbird = require('./lib/rainbird');

const adapterName = require('./package.json').name.split('.').pop();

function createOrSetState(id, setobj, setval) {
	adapter.getObject(id, function(err, obj) {
		if(err || !obj) {
			adapter.setObject(id, setobj, function() {
				adapter.setState(id, setval, true);
			});
		} else {
			adapter.setState(id, setval, true);
		}
	});
}

function setOrUpdateState(id, name, setval, setunit, settype, setrole) {
        if(!setunit) {
                setunit = '';
        }
        if(!settype) {
                settype = 'number';
        }
        if(!setrole) {
                setrole = 'value';
        }
        
		let read = true;
		let write = false;
		if(setrole.substr(0, 6) === 'button') {
			read = false;
			write = true;
		} else if(setrole.substr(0, 5) === 'level' || setrole.substr(0, 6) === 'switch') {
			read = true;
			write = true;
		}
		
        let obj = {
                type: 'state',
                common: {
                        name: name,
                        type: settype,
                        role: setrole,
                        read: read,
                        write: write,
                        unit: setunit
                },
                native: {}
        };
        createOrSetState(id, obj, setval);
}

function getStateIfExists(id, callback) {
	adapter.getObject(id, function(err, obj) {
		if(!err && obj) {
			adapter.getState(id, function(err, state) {
				callback(err, state);
			});
		} else {
			callback(true, null);
		}
	});
}



let adapter;
var deviceIpAdress;
var devicePassword;

let polling;
let pollingTime;
let controller;

function startAdapter(options) {
	options = options || {};
	Object.assign(options, {
		name: 'rainbird'
	});

	adapter = new utils.Adapter(options);

	adapter.on('unload', function(callback) {
		if(polling) {
			clearTimeout(polling);
		}
		
		adapter.setState('info.connection', false, true);
		callback();
	});

	adapter.on('stateChange', function(id, state) {
		// Warning, state can be null if it was deleted
		try {
			adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));

			if(!id) {
				return;
			}
			
			if(state && id.substr(0, adapter.namespace.length + 1) !== adapter.namespace + '.') {
				processStateChangeForeign(id, state);
				return;
			}
			id = id.substring(adapter.namespace.length + 1); // remove instance name and id
			
			if(state && state.ack) {
				processStateChangeAck(id, state);
				return;
			}
			
			state = state.val;
			adapter.log.debug("id=" + id);
			
			if('undefined' !== typeof state && null !== state) {
				processStateChange(id, state);
			}
		} catch(e) {
			adapter.log.info("Error processing stateChange: " + e);
		}
	});

	adapter.on('message', function(obj) {
		if(typeof obj === 'object' && obj.message) {
			if(obj.command === 'send') {
				adapter.log.debug('send command');

				if(obj.callback) {
					adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
				}
			}
		}
	});

	adapter.on('ready', function() {
		if(!adapter.config.ipaddress) {
			adapter.log.warn('[START] IP address not set');
		} else if(!adapter.config.password) {
			adapter.log.warn('[START] Password not set');
		} else {
			adapter.log.info('[START] Starting Rain Bird adapter');
			adapter.setState('info.connection', true, true);
			adapter.getForeignObject('system.config', (err, obj) => {
				if (obj && obj.native && obj.native.secret) {
					//noinspection JSUnresolvedVariable
					adapter.config.password = decrypt(obj.native.secret, adapter.config.password);
				} else {
					//noinspection JSUnresolvedVariable
					adapter.config.password = decrypt('Zgfr56gFe87jJOM', adapter.config.password);
				}
				
				main();
			});
		}
	});

	return adapter;
}


function main() {
	deviceIpAdress = adapter.config.ipaddress;
	devicePassword = adapter.config.password;

	pollingTime = adapter.config.pollinterval || 300000;
	if(pollingTime < 5000) {
		pollingTime = 5000;
	}
	
	adapter.log.info('[INFO] Configured polling interval: ' + pollingTime);
	adapter.log.debug('[START] Started Adapter with: ' + adapter.config.ipaddress);

	adapter.subscribeStates('*');
	
	controller = new rainbird.RainbirdController(deviceIpAdress, devicePassword);
	
	pollStates();
}

function pollStates() {
	if(polling) {
		clearTimeout(polling);
		polling = null;
	}
	
	controller.getModelAndVersion(function(result) {
		setOrUpdateState('device.model', 'Model', result['model'], '', 'string', 'text');
		setOrUpdateState('device.minor', 'Minor version', result['minor'], '', 'string', 'text');
		setOrUpdateState('device.major', 'Major version', result['major'], '', 'string', 'text');
	});
	
	
	polling = setTimeout(function() {
		pollStates();
	}, pollingTime);
}

function processStateChangeAck(id, state) {
	// not yet
}

function processStateChangeForeign(id, state) {
	// not yet
}

function processStateChange(id, value) {

	
	adapter.log.info('StateChange: ' + JSON.stringify([id, value]));
	
	return;
}
