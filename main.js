'use strict';

const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const ioBLib = require('@strathcole/iob-lib').ioBLib;

const rainbird = require('./lib/rainbird');

const packageJson = require('./package.json');
const adapterName = packageJson.name.split('.').pop();
const adapterVersion = packageJson.version;

const patchVersion = 'r44';

let adapter;
var deviceIpAdress;
var devicePassword;

let deviceModelId;

let polling;
let pollingTime;
let lastFullPolling;
let remainingTimer;
let remainingRuntime;
let controller;

let availableStations = [];

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
		if(remainingTimer) {
			clearInterval(remainingTimer);
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
			adapter.log.info('[START] Starting Rain Bird adapter V' + adapterVersion + '' + patchVersion);
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
	if(polling) {
		clearTimeout(polling);
		polling = null;
	}

	let all = false;
	let now = (new Date()).getTime();
	if(!lastFullPolling || lastFullPolling < now - (10 * 60 * 1000)) {
		all = true;
	}
	lastFullPolling = now;
	adapter.log.debug('Starting state polling with full=' + all);

	if(all) {
		controller.getModelAndVersion(function(result) {
			if(result) {
				ioBLib.setOrUpdateState('device.model', 'Model', result['model'].toString(), '', 'string', 'text');
				deviceModelId = result['model'];
				controller.setDeviceModelId(deviceModelId);

				ioBLib.setOrUpdateState('device.minor', 'Minor version', result['minor'].toString(), '', 'string', 'text');
				ioBLib.setOrUpdateState('device.major', 'Major version', result['major'].toString(), '', 'string', 'text');
			}
		});

		controller.getSerialNumber(function(result) {
			if(result) {
				ioBLib.setOrUpdateState('device.serial', 'Serial number', result, '', 'string', 'text');
			}
		});

		controller.getCurrentDate(function(result) {
			if(result) {
				let dt = result['year'] + '-' + result['month'] + '-' + result['day'];
				controller.getCurrentTime(function(result) {
					if(result) {
						dt += ' ' + result['hour'] + ':' + result['minute'] + ':' + result['second'];
						ioBLib.setOrUpdateState('device.datetime', 'Current date/time', (new Date(dt)).getTime(), '', 'number', 'date');
					}
				});
			}
		});

		controller.getAvailableStations(0, function(result) {
			if(result) {
				availableStations = [];
				let s;
				for(let i = 0; i < result.states.length; i++) {
					s = i + 1;
					let avail = (result.states[i] ? true : false);
					let idx = 'device.stations.' + s + '.available';
					if(avail) {
						availableStations.push(s);
						ioBLib.setOrUpdateState(idx, 'Station ' + s + ' available', avail, '', 'boolean', 'indicator.available');
						ioBLib.setOrUpdateState('device.stations.' + s + '.testZone', 'Test single zone', false, '', 'boolean', 'button.start');
						ioBLib.setOrUpdateState('device.stations.' + s + '.runZone', 'Run zone for X minutes', null, '', 'number', 'level');
					} else {
						ioBLib.delObjectIfExists('device.stations.' + s);
					}
				}
			}
		});
	}

	controller.getCurrentIrrigation(function(result) {
		ioBLib.setOrUpdateState('device.irrigation.active', 'Irrigation active', result, '', 'boolean', 'indicator.active');
	});

	controller.getRainDelay(function(result) {
		if(result !== false) {
			ioBLib.setOrUpdateState('device.settings.rainDelay', 'Irrigation delay', result, 'days', 'number', 'level.delay');
		}
	});

	controller.cmdWaterBudget(0, function(result) {
		if(result && 'adjust' in result) {
			ioBLib.setOrUpdateState('device.settings.seasonalAdjust', 'Irrigation seasonal adjustment', result['adjust'], '%', 'number', 'value');
		}
	});

	controller.getZoneState(null, 0, function(result, runtime) {
		if(!result) {
			return;
		}

		let s;
		let irriStation = false;
		if(remainingTimer) {
			clearInterval(remainingTimer);
		}

		for(let i = 0; i < result.length; i++) {
			s = i + 1;
			let active = (result[i] ? true : false);
			if(active) {
				irriStation = s;
			} else {
				if(availableStations.indexOf(s) > -1) {
					ioBLib.setOrUpdateState('device.stations.' + s + '.remaining', 'Remaining run time for station ' + s, 0, 's', 'number', 'value');
				}
			}
			let idx = 'device.stations.' + s + '.irrigation';
			if(availableStations.indexOf(s) > -1) {
				ioBLib.setOrUpdateState(idx, 'Station ' + s + ' irrigation', active, '', 'boolean', 'indicator.active');
			}
		}
		ioBLib.setOrUpdateState('device.irrigation.station', 'Irrigation on station', irriStation ? irriStation : 0, '', 'number', 'value.station');
		if(runtime) {
			if(availableStations.indexOf(runtime['zone']) > -1) {
				ioBLib.setOrUpdateState('device.stations.' + runtime['zone'] + '.remaining', 'Remaining run time for station ' + runtime['zone'], runtime['seconds'], 's', 'number', 'value');
				remainingRuntime = runtime['seconds'];
				remainingTimer = setInterval(function() {
					remainingRuntime--;
					if(remainingRuntime < 0) {
						clearInterval(remainingTimer);
						return;
					}
					ioBLib.setOrUpdateState('device.stations.' + runtime['zone'] + '.remaining', 'Remaining run time for station ' + runtime['zone'], remainingRuntime, 's', 'number', 'value');
				}, 1000);
			}
		}
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
			if(found && value > 0) {
				if(value > 120) {
					value = 120;
				}
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
