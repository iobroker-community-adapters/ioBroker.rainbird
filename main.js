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
	
	setOrUpdateState('device.commands.advanceZone', 'Advance irrigation zone', false, '', 'boolean', 'button.next');
	setOrUpdateState('device.commands.runProgram', 'Run program manually', null, '', 'number', 'level');
	setOrUpdateState('device.commands.stopIrrigation', 'Stop irrigation', false, '', 'boolean', 'button.stop');
	
	controller = new rainbird.RainbirdController(deviceIpAdress, devicePassword, adapter);
	
	pollStates();
}

function pollStates() {
	adapter.log.debug('Starting state polling');
	if(polling) {
		clearTimeout(polling);
		polling = null;
	}
	
	controller.getModelAndVersion(function(result) {
		setOrUpdateState('device.model', 'Model', result['model'], '', 'string', 'text');
		setOrUpdateState('device.minor', 'Minor version', result['minor'], '', 'string', 'text');
		setOrUpdateState('device.major', 'Major version', result['major'], '', 'string', 'text');
	});

	controller.getSerialNumber(function(result) {
		setOrUpdateState('device.serial', 'Serial number', result, '', 'string', 'text');
	});
	
	controller.getCurrentDate(function(result) {
		let dt = result['year'] + '-' + result['month'] + '-' + result['day'];
		controller.getCurrentTime(function(result) {
			dt += ' ' + result['hour'] + ':' + result['minute'] + ':' + result['second'];
			setOrUpdateState('device.datetime', 'Current date/time', (new Date(dt)).getTime(), '', 'number', 'date');
		});
	});
	
	controller.getCurrentIrrigation(function(result) {
		setOrUpdateState('device.irrigation.active', 'Irrigation active', result, '', 'boolean', 'indicator.active');
	});
	
	controller.getRainDelay(function(result) {
		setOrUpdateState('device.settings.rainDelay', 'Irrigation delay', result, 'days', 'number', 'level.delay');
	});
	
	controller.getAvailableStations(0, function(result) {
		let s;
		for(let i = 0; i < result.states.length; i++) {
			s = i + 1;
			let avail = (result.states[i] ? true : false);
			let idx = 'device.stations.' + s + '.available';
			setOrUpdateState(idx, 'Station ' + s + ' available', avail, '', 'boolean', 'indicator.available');
			if(avail) {
				setOrUpdateState('device.stations.' + s + '.testZone', 'Test single zone', false, '', 'boolean', 'button.start');
				setOrUpdateState('device.stations.' + s + '.runZone', 'Run zone for X minutes', null, '', 'number', 'level');
			}
		}
	});
	
	controller.getZoneState(null, 0, function(result) {
		let s;
		let irriStation = false;
		for(let i = 0; i < result.length; i++) {
			s = i + 1;
			let active = (result[i] ? true : false);
			if(active) {
				irriStation = s;
			}
			let idx = 'device.stations.' + s + '.irrigation';
			setOrUpdateState(idx, 'Station ' + s + ' irrigation', active, '', 'boolean', 'indicator.active');
		}
		setOrUpdateState('device.irrigation.station', 'Irrigation on station', irriStation ? irriStation : null, '', 'number', 'value.station');
	});
	
	controller.getRainSensorState(function(result) {
		setOrUpdateState('device.sensors.rain', 'Rain detected', result, '', 'boolean', 'indicator.rain');
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
	adapter.log.debug('StateChange: ' + JSON.stringify([id, value]));
	
	if(id === 'device.commands.advanceZone') {
		controller.cmdAdvanceZone(function(result) {
			if(result) {
				adapter.setState(id, value, true);
				pollStates();
			}
		});
	} else if(id === 'device.commands.runProgram') {
		controller.cmdRunProgram(value, function(result) {
			if(result) {
				adapter.setState(id, value, true);
				pollStates();
			}
		});
	} else if(id === 'device.commands.stopIrrigation') {
		controller.cmdStopIrrigation(function(result) {
			if(result) {
				adapter.setState(id, value, true);
				pollStates();
			}
		});
	} else if(id === 'device.settings.rainDelay') {
		controller.setRainDelay(value, function(result) {
			if(result) {
				adapter.setState(id, value, true);
			}
		});
	} else {
		let found = id.match(/^device\.stations\.(\d+)\.testZone$/);
		if(found) {
			controller.cmdTestZone(found[1], function(result) {
				if(result) {
					adapter.setState(id, value, true);
					pollStates();
				}
			});
		} else {
			found = id.match(/^device\.stations\.(\d+)\.runZone$/);
			if(found) {
				controller.cmdRunZone(found[1], value, function(result) {
					adapter.setState(id, null, true);
					pollStates();
				});
			}
		}
	}
	
	return;
}

function decrypt(key, value) {
	var result = '';
	for(var i = 0; i < value.length; ++i) {
			result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
	}
	return result;
}


// If started as allInOne/compact mode => return function to create instance
if(module && module.parent) {
        module.exports = startAdapter;
} else {
        // or start the instance directly
        startAdapter();
} // endElse
