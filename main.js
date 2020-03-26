'use strict';

const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const ioBLib = require('@strathcole/iob-lib').ioBLib;

const rainbird = require('./lib/rainbird');

const adapterName = require('./package.json').name.split('.').pop();

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
	ioBLib.init(adapter);

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
				return;
			}
			id = id.substring(adapter.namespace.length + 1); // remove instance name and id

			if(state && state.ack) {
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
					adapter.config.password = ioBLib.decrypt(obj.native.secret, adapter.config.password);
				} else {
					//noinspection JSUnresolvedVariable
					adapter.config.password = ioBLib.decrypt('Zgfr56gFe87jJOM', adapter.config.password);
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

	pollingTime = adapter.config.pollinterval || 30000;
	if(pollingTime < 5000) {
		pollingTime = 5000;
	}

	adapter.log.info('[INFO] Configured polling interval: ' + pollingTime);
	adapter.log.debug('[START] Started Adapter with: ' + adapter.config.ipaddress);

	adapter.subscribeStates('*');

	ioBLib.setOrUpdateState('device.commands.advanceZone', 'Advance irrigation zone', false, '', 'boolean', 'button.next');
	ioBLib.setOrUpdateState('device.commands.runProgram', 'Run program manually', null, '', 'number', 'level');
	ioBLib.setOrUpdateState('device.commands.stopIrrigation', 'Stop irrigation', false, '', 'boolean', 'button.stop');

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
		ioBLib.setOrUpdateState('device.model', 'Model', result['model'], '', 'string', 'text');
		ioBLib.setOrUpdateState('device.minor', 'Minor version', result['minor'], '', 'string', 'text');
		ioBLib.setOrUpdateState('device.major', 'Major version', result['major'], '', 'string', 'text');
	});

	controller.getSerialNumber(function(result) {
		ioBLib.setOrUpdateState('device.serial', 'Serial number', result, '', 'string', 'text');
	});

	controller.getCurrentDate(function(result) {
		let dt = result['year'] + '-' + result['month'] + '-' + result['day'];
		controller.getCurrentTime(function(result) {
			dt += ' ' + result['hour'] + ':' + result['minute'] + ':' + result['second'];
			ioBLib.setOrUpdateState('device.datetime', 'Current date/time', (new Date(dt)).getTime(), '', 'number', 'date');
		});
	});

	controller.getCurrentIrrigation(function(result) {
		ioBLib.setOrUpdateState('device.irrigation.active', 'Irrigation active', result, '', 'boolean', 'indicator.active');
	});

	controller.getRainDelay(function(result) {
		ioBLib.setOrUpdateState('device.settings.rainDelay', 'Irrigation delay', result, 'days', 'number', 'level.delay');
	});

	controller.getAvailableStations(0, function(result) {
		let s;
		for(let i = 0; i < result.states.length; i++) {
			s = i + 1;
			let avail = (result.states[i] ? true : false);
			let idx = 'device.stations.' + s + '.available';
			ioBLib.setOrUpdateState(idx, 'Station ' + s + ' available', avail, '', 'boolean', 'indicator.available');
			if(avail) {
				ioBLib.setOrUpdateState('device.stations.' + s + '.testZone', 'Test single zone', false, '', 'boolean', 'button.start');
				ioBLib.setOrUpdateState('device.stations.' + s + '.runZone', 'Run zone for X minutes', null, '', 'number', 'level');
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
			ioBLib.setOrUpdateState(idx, 'Station ' + s + ' irrigation', active, '', 'boolean', 'indicator.active');
		}
		ioBLib.setOrUpdateState('device.irrigation.station', 'Irrigation on station', irriStation ? irriStation : null, '', 'number', 'value.station');
	});

	controller.getRainSensorState(function(result) {
		ioBLib.setOrUpdateState('device.sensors.rain', 'Rain detected', result, '', 'boolean', 'indicator.rain');
	});




	polling = setTimeout(function() {
		pollStates();
	}, pollingTime);
}

function processStateChange(id, value) {
	adapter.log.debug('StateChange: ' + JSON.stringify([id, value]));

	if(id === 'device.commands.advanceZone') {
		controller.cmdAdvanceZone(function(result) {
			if(result) {
				adapter.setState(id, false, true);
				pollStates();
			}
		});
	} else if(id === 'device.commands.runProgram') {
		controller.cmdRunProgram(value, function(result) {
			if(result) {
				adapter.setState(id, null, true);
				pollStates();
			}
		});
	} else if(id === 'device.commands.stopIrrigation') {
		controller.cmdStopIrrigation(function(result) {
			if(result) {
				adapter.setState(id, false, true);
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
					adapter.setState(id, false, true);
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

// If started as allInOne/compact mode => return function to create instance
if(module && module.parent) {
	module.exports = startAdapter;
} else {
	// or start the instance directly
	startAdapter();
} // endElse
