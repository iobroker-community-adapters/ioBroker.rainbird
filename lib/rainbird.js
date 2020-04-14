const request = require('request');
const Agent = require('http').Agent;

let crypto;
try {
  crypto = require('crypto');
} catch (err) {
  throw {msg: 'crypto support is disabled!'};
}
const BLOCK_SIZE = 16;
const INTERRUPT = "\x00";
const PAD = "\x10";
const ALGORITHM = 'aes-256-cbc';

let deviceModelId;

Array.prototype.equals = function(array) {
	if(!array) {
		return false;
	}

    if(this.length !== array.length) {
		return false;
	}

    for(var i = 0, l = this.length; i < l; i++) {
        if(this[i] instanceof Array && array[i] instanceof Array) {
            if(!this[i].equals(array[i])) {
                return false;
			}
        } else if(this[i] !== array[i]) {
            return false;
        }
    }
    return true;
};

Object.defineProperty(Array.prototype, "equals", {enumerable: false});

const RAINBIRD_COMMANDS = {
	"ControllerCommands": {
		"ModelAndVersionRequest": {"command": "02", "response": "82", "length": 1},
		"AvailableStationsRequest": {"command": "03", "parameter": 0, "response": "83", "length": 2},
		"CommandSupportRequest": {"command": "04", "commandToTest": "02", "response": "84", "length": 2},
		"SerialNumberRequest": {"command": "05", "response": "85", "length": 1},
		"CurrentTimeRequest": {"command": "10", "response": "90", "length": 1},
		"CurrentDateRequest": {"command": "12", "response": "92", "length": 1},
		"WaterBudgetRequest": {"command": "30", "parameter": 0, "response": "B0", "length": 2},
		"ZonesSeasonalAdjustFactorRequest": {"command": "32", "parameter": 0, "response": "B2", "length": 2},
		"CurrentRunTimeRequest": {"command": "3B", "parameter": 0, "response": "BB", "length": 2},
		"CurrentRainSensorStateRequest": {"command": "3E", "response": "BE", "length": 1},
		"CurrentStationsActiveRequest": {"command": "3F", "parameter": 0, "response": "BF", "length": 2},
		"ManuallyRunProgramRequest": {"command": "38", "parameter": 0, "response": "01", "length": 2},
		"ManuallyRunStationRequest": {"command": "39", "parameterOne": 0, "parameterTwo": 0, "response": "01", "length": 4},
		"TestStationsRequest": {"command": "3A", "parameter": 0, "response": "01", "length": 2},
		"StopIrrigationRequest": {"command": "40", "response": "01", "length": 1},
		"RainDelayGetRequest": {"command": "36", "response": "B6", "length": 1},
		"RainDelaySetRequest": {"command": "37", "parameter": 0, "response": "01", "length": 3},
		"AdvanceStationRequest": {"command": "42", "parameter": 0, "response": "01", "length": 2},
		"CurrentIrrigationStateRequest": {"command": "48", "response": "C8", "length": 1},
		"CurrentControllerStateSet": {"command": "49", "parameter": 0, "response": "01", "length": 2},
		"ControllerEventTimestampRequest": {"command": "4A","parameter": 0, "response": "CA", "length": 2},
		"StackManuallyRunStationRequest": {"command": "4B","parameter": 0, "parameterTwo": 0,"parameterThree": 0,"response": "01", "length": 4},
		"CombinedControllerStateRequest": {"command": "4C", "response": "CC","length": 1 }
	},
	"ControllerResponses": {
		"00": {"length": 3, "type": "NotAcknowledgeResponse", "commandEcho": {"position": 2, "length": 2}, "NAKCode": {"position": 4, "length": 2}},
		"01": {"length": 2, "type": "AcknowledgeResponse", "commandEcho": {"position": 2, "length": 2}},
		"82": {"length": 5, "type": "ModelAndVersionResponse", "modelID": {"position": 2, "length": 4},"protocolRevisionMajor": {"position": 6, "length": 2},"protocolRevisionMinor": {"position": 8, "length": 2}},
		"83": {"length": 6, "type": "AvailableStationsResponse", "pageNumber": {"position": 2, "length": 2}, "setStations": {"position": 4, "length": 8}},
		"84": {"length": 3,"type": "CommandSupportResponse", "commandEcho": {"position": 2, "length": 2}, "support": {"position": 4, "length": 2}},
		"85": {"length": 9, "type": "SerialNumberResponse", "serialNumber": {"position": 2, "length": 16}},
		"90": {"length": 4, "type": "CurrentTimeResponse", "hour": {"position": 2, "length": 2}, "minute": {"position": 4, "length": 2}, "second": {"position": 6, "length": 2}},
		"92": {"length": 4, "type": "CurrentDateResponse", "day": {"position": 2, "length": 2}, "month": {"position": 4, "length": 1}, "year": {"position": 5, "length": 3}},
		"B0": {"length": 4, "type": "WaterBudgetResponse", "programCode": {"position": 2, "length": 2}, "seasonalAdjust": {"position": 4, "length": 4}},
		"B2": {"length": 18, "type": "ZonesSeasonalAdjustFactorResponse", "programCode": {"position": 2, "length": 2},"stationsSA": {"position": 4, "length": 32}},
		"BB": {"length": 12, "type": "CurrentRunTimeResponse", "secondsRemaining": {"position": 8, "length": 4}, "activeStation": {"position": 16, "length": 2}, "running": {"position": 22, "length": 2}},
		"BE": {"length": 2, "type": "CurrentRainSensorStateResponse", "sensorState": {"position": 2, "length": 2}},
		"BF": {"length": 6, "type": "CurrentStationsActiveResponse", "pageNumber": {"position": 2, "length": 2}, "activeStations": {"position": 4, "length": 8}},
		"B6": {"length": 3, "type": "RainDelaySettingResponse", "delaySetting": {"position": 2, "length": 4}},
		"C8": {"length": 2, "type": "CurrentIrrigationStateResponse", "irrigationState": {"position": 2, "length": 2}},
		"CA": {"length": 6, "type": "ControllerEventTimestampResponse", "eventId": {"position": 2, "length": 2},"timestamp": {"position": 4, "length": 8}},
		"CC": {"length": 16, "type": "CombinedControllerStateResponse", "hour": {"position": 2, "length": 2},"minute": {"position": 4, "length": 2},
			"second": {"position": 6, "length": 2}, "day": {"position": 8, "length": 2},"month": {"position": 10, "length": 1},"year": {"position": 11, "length": 3},
			"delaySetting": {"position": 14, "length": 4}, "sensorState": {"position": 18, "length": 2},"irrigationState": {"position": 20, "length": 2},
			"seasonalAdjust": {"position": 22, "length": 4},"remainingRuntime": {"position": 26, "length": 4}, "activeStation": {"position": 30, "length": 2}}
	},
	"ControllerSpecialResponses": {
		"3": {
			"BB": {"length": 10, "type": "CurrentRunTimeResponse", "secondsRemaining": {"position": 16, "length": 4}, "activeStation": {"position": 12, "length": 2}, "running": {"position": 6, "length": 2}}
		}
	}
/*
	2020-04-12 17:20:10.591 - debug: rainbird.0 (27109) Pos 2 to 5 from 8200030209 is 3 (modelID)
2020-04-12 17:20:10.592 - debug: rainbird.0 (27109) Pos 6 to 7 from 8200030209 is 2 (protocolRevisionMajor)
2020-04-12 17:20:10.592 - debug: rainbird.0 (27109) Pos 8 to 9 from 8200030209 is 9 (protocolRevisionMinor)

	BB000000000000020000
	BB00000100000102003C Stat 1 / 1min
	BB000001000001020036 Stat 1 / 1min - 8s
	BB000001000001020024 Stat 1 / 1min - 33s

	BB000001010002020078 Stat 2 / 2min
	BB000001000002020075 Stat 2 / 2min - 4s

	BB0000010000030200B3 Stat 3 / 3min

	BB0000010100040200F0 Stat 4 / 4min

	BB00000100000502012C Stat 5 / 5min

	BB000001000006020168 Stat 6 / 6min


{u'modelID': 7, u'protocolRevisionMinor': 9, 'type': u'ModelAndVersionResponse', u'protocolRevisionMajor': 2}

	BB0000000000000000FF0000
	BB0001000255000004FF0001 2/10
	BB0001000246000004FF0001 2/10 - running*/

	/*"TestState06Request": {"command": "06", "response": "00", "length": 1}, //reboot?
		"TestState07Request": {"command": "07", "response": "00", "length": 1}, //reboot?
		"TestState08Request": {"command": "08", "response": "00", "length": 1},// reboot?
		"TestState0BRequest": {"command": "0B", "response": "00", "length": 1},

		"TestState11Request": {"command": "11", "response": "00", "length": 1}, //param?
		"TestState13Request": {"command": "13", "response": "00", "length": 1}, //param?

		"TestState20Request": {"command": "20", "response": "00", "length": 1}, //param?
		"TestState21Request": {"command": "21", "response": "00", "length": 1}, //param?

		"TestState31Request": {"command": "31", "response": "00", "length": 1}, //param?
		"TestState3DRequest": {"command": "3D", "response": "00", "length": 1}, //ok ergebnis? bei param 0 => 0, 1 => 1 sonst 255

		"TestState41Request": {"command": "41", "response": "00", "length": 1}, //ok param? ergebnis?
		"TestState44Request": {"command": "44", "response": "00", "length": 1}, //ok ergebnis? param: 0 -> C40001000000, wenn laufend: C40001000101,

		"TestState50Request": {"command": "50", "response": "00", "length": 1}, //ok
		"TestState51Request": {"command": "51", "response": "00", "length": 1}, //ok
		"TestState52Request": {"command": "52", "response": "00", "length": 1}, //ok
		"TestState55Request": {"command": "55", "response": "00", "length": 1},// param 0 ok
		"TestState56Request": {"command": "56", "response": "00", "length": 1}, //param 0 ok*/
};

function RainbirdController(server, password, context, sensorDelay, retry, retryDelay) {
    if(!sensorDelay) {
        sensorDelay = 10;
    }
    if(!retry) {
        retry = 3;
    }
    if(!retryDelay) {
        retryDelay = 10;
    }

    this.server = server;
    this.password = password;
    this.sensorDelay = sensorDelay;
    this.retry = 1;//retry;
    this.retryDelay = retryDelay;
    this.iv = null;
    this.rainSensor = null;
    this.sensorUpdateTime = null;
    this.zones = [];
    this.zonesUpdateTime = null;
	this.context = context;

	this.requestQueue = [];
	this.processing = false;
}

RainbirdController.prototype.setDeviceModelId = function(deviceModelId) {
	this.deviceModelId = deviceModelId + ''; // ensure string
};

RainbirdController.prototype.request = function(data, length, callback) {
    let controller = this;
    let request_id = Math.floor((new Date()).getTime() / 1000);
    let send_data = {
        id: request_id,
        jsonrpc: "2.0",
        method: "tunnelSip",
        params: {
            data: data,
            length: length
        }
    };

	let keepAliveAgent = new Agent({
		keepAlive: true,
		keepAliveMsecs: 1000,
		maxSockets: 50,
		timeout: 20000
	});

    let reqopts = {
        url: 'http://' + this.server + '/stick',
        method: 'POST',
		agent: keepAliveAgent,
        headers: {
            "Accept-Language": "en",
            "Accept-Encoding": "gzip, deflate",
            "User-Agent": "RainBird/2.0 CFNetwork/811.5.4 Darwin/16.7.0",
            "Accept": "*/*",
            "Connection": "keep-alive",
            "Content-Type": "application/octet-stream"
        },
        body: this.encrypt(JSON.stringify(send_data), this.password),
        encoding: null,
        timeout: 20000
    };

	try {
		request(reqopts, function(error, response, body) {
			if(error || !response.statusCode || response.statusCode != 200) {
				controller.context.log.warn('Request reply error: ' + JSON.stringify([error, response, body]));
				if(error && error.code && error.code === 'ETIMEDOUT') {
					controller.context.log.info('Timeout connecting to controller.');
				}

				if(response && response.statusCode && response.statusCode == 503) {
					controller.context.log.info('Re-trying request (was error 503).');
					return controller.request(data, length, callback);
				}

				callback && callback(true, error);
			} else {
				let decrypted = controller.decrypt(body, controller.password);
				let json = JSON.parse(decrypted);
				if(!json['result'] || !json['result']['data']) {
					controller.context.log.warn('Request returned unreadable data: ' + JSON.stringify(json));
					callback && callback(true, json);
				} else {
					callback && callback(false, json['result']['data']);
				}
			}
		});
	} catch(e) {
		controller.context.log.info('Exception on request: ' + JSON.stringify([e,reqopts]));
		callback && callback(true, {});
	}
};

RainbirdController.prototype.addPadding = function(data) {
    let result = data;
    let len = result.length;
    let remain = BLOCK_SIZE - len;
    let padding = Math.abs(remain % BLOCK_SIZE);
    let str = PAD.repeat(padding);
    return result + str;
};

RainbirdController.prototype.pack = function(bytes) {
    var chars = [];
    for(var i = 0, n = bytes.length; i < n;) {
        chars.push(((bytes[i++] & 0xff) << 8) | (bytes[i++] & 0xff));
    }
    return String.fromCharCode.apply(null, chars);
};

RainbirdController.prototype.unpack = function(str) {
    var bytes = [];
    for(var i = 0, n = str.length; i < n; i++) {
        var char = str.charCodeAt(i);
        bytes.push(char >>> 8, char & 0xFF);
    }
    return bytes;
};

RainbirdController.prototype.genIV = function() {
    this.iv = crypto.randomBytes(16);
};

RainbirdController.prototype.encrypt = function(data, key) {
    if(!this.iv) {
        this.genIV();
    }
    let tocode_data = data + "\x00\x10";
    let m = crypto.createHash('sha256');
    m.update(key);
    let b = m.digest();


    let c = this.addPadding(tocode_data);

    m = crypto.createHash('sha256');
    m.update(data);
    let b2 = m.digest();

    let aes = crypto.createCipheriv(ALGORITHM, b, this.iv);
    aes.setAutoPadding(true);
    let encrypted = aes.update(c, 'binary', 'binary');
    encrypted += aes.final('binary');

    return Buffer.concat([b2, this.iv, Buffer.from(encrypted, 'binary')]);
};

RainbirdController.prototype.decrypt = function(data, key) {
    data = Buffer.from(data, 'binary');
    let deciv = data.slice(32, 48);
    data = data.slice(48);

    let m = crypto.createHash('sha256');
    m.update(key);

    let sym_key = m.digest();

    let aes = crypto.createDecipheriv(ALGORITHM, sym_key, deciv);
    aes.setAutoPadding(false);
    let chunks = [];
    let decrypted = aes.update(data, 'binary', 'binary');
    decrypted += aes.final('binary');
    decrypted = decrypted.replace(/\x10+$/, '');
    decrypted = decrypted.replace(/\x0A+$/, '');
    decrypted = decrypted.replace(/\x00+$/, '');
    decrypted = decrypted.replace(/\s+$/, '');
    return decrypted;
};

RainbirdController.prototype.encode = function(cmd, args) {
    let request_cmd = cmd + 'Request';
    let cmd_set = RAINBIRD_COMMANDS['ControllerCommands'][request_cmd];
    if(!args) {
        args = [];
    }

    if(cmd_set) {
        let cmd_code = cmd_set['command'];

        if(args.length > cmd_set['length'] - 1) {
            this.context.log.info('Too many parameters for ' + request_cmd + ': ' + args.length + ', expected ' + cmd_set['length']);
            return '';
        }

        args = args.map(x => parseInt(x));

        let enc_args = cmd_code;
        let numlen;
        for(let i = 0; i < args.length; i++) {
            let hexval = (args[i]).toString(16);
            if(i === 0) {
                numlen = (cmd_set['length'] - args.length) * 2;
            } else {
                numlen = 2;
            }
            let repeat = numlen - hexval.length;
            if(repeat > 0) {
                hexval = '0'.repeat(repeat) + hexval;
            }
            enc_args += hexval;
        }

        return enc_args;
    } else {
        this.context.log.info('Command ' + request_cmd + ' is not available.');
        return '';
    }
};

RainbirdController.prototype.decode = function(data) {
	let controller = this;
	let devModelId = controller.deviceModelId;

    let cmd_code = data.substr(0, 2);
    if(RAINBIRD_COMMANDS['ControllerResponses'][cmd_code]) {
		let cmd_tpl;
		if(devModelId && RAINBIRD_COMMANDS['ControllerSpecialResponses'][devModelId] && RAINBIRD_COMMANDS['ControllerSpecialResponses'][devModelId][cmd_code]) {
			cmd_tpl = RAINBIRD_COMMANDS['ControllerSpecialResponses'][devModelId][cmd_code];
		} else {
			cmd_tpl = RAINBIRD_COMMANDS['ControllerResponses'][cmd_code];
		}

		let result = {
            type: cmd_tpl['type']
        };

        for(let key in cmd_tpl) {
            if(cmd_tpl.hasOwnProperty(key)) {
                if(undefined !== cmd_tpl[key]['position'] && cmd_tpl[key]['length']) {
                    let _pos = cmd_tpl[key]['position'];
                    let _len = cmd_tpl[key]['length'];
                    result[key] = parseInt(data.substr(_pos, _len), 16);
					controller.context.log.debug('Pos ' + _pos + ' to ' + (_pos + _len - 1) + ' from ' + data + ' is ' + result[key] + ' (' + key + ')');
                }
            }
        }

        return result;
    } else {
        return {
            data: data
        };
    }
};

RainbirdController.prototype.command = function(cmd, args, callback) {
    let controller = this;
    let data = this.encode(cmd, args);
    this.context.log.debug('Requesting ' + cmd);
    this.request(data, RAINBIRD_COMMANDS['ControllerCommands'][cmd+'Request']['length'], function(error, response) {
        if(error) {
			controller.context.log.warn('Error in request from client for ' + cmd + ': ' + JSON.stringify(response));
            callback && callback();
			return;
		} else if(!response) {
            controller.context.log.warn('Empty response from client for ' + cmd);
            callback && callback();
			return;
        }
		let decoded_response = controller.decode(response);
        if(response.substr(0, 2) !== RAINBIRD_COMMANDS['ControllerCommands'][cmd+'Request']['response']) {
            controller.context.log.warn('Status request failed. Requested ' + RAINBIRD_COMMANDS['ControllerCommands'][cmd+'Request']['response'] + ' but got ' + response.substr(0, 2) + ': ' + JSON.stringify(decoded_response));
        }
        callback && callback(decoded_response);
    });
};

RainbirdController.prototype.processCommand = function(cmd, args, callback) {

	let found = false;
	for(let i = 0; i < this.requestQueue.length; i++) {
		if(this.requestQueue[i]['cmd'] === cmd) {
			found = i;
			break;
		}
	}

	if(found !== false) {
		if(cmd.substr(0, 3) === 'cmd' || cmd.substr(0, 3) === 'set') {
			this.requestQueue.splice(i, 1);
			this.context.log.info('Removing previous command from queue, it existed on earlier position: ' + JSON.stringify([cmd, args]));
		} else {
			this.context.log.info('Not inserting command into queue, it already exists on earlier position: ' + JSON.stringify([cmd, args]));
			return;
		}
	}

	this.requestQueue.push({
		cmd: cmd,
		args: args,
		callback: callback
	});

	this.processQueue();
};

RainbirdController.prototype.processQueue = function() {
	this.context.log.debug('Queue len: ' + this.requestQueue.length);
	 if(this.requestQueue.length < 1) {
		this.processing = false;
		this.context.log.debug('Queue processing completed.');
		return;
	} else if(this.processing) {
		this.context.log.debug('Skipping, queue already processing.');
		return;
	}

	let controller = this;

	this.processing = true;
	let el = this.requestQueue.shift();
	this.command(el.cmd, el.args, function(response) {
		controller.context.log.debug('Cmd ' + el.cmd + ' completed.');
		if(response && response['type'] === RAINBIRD_COMMANDS['ControllerCommands'][el.cmd+'Request']['response']['type']) {
            el['callback'](response);
        } else {
            el['callback'](response);
        }
		controller.processing = false;
		controller.processQueue();
    });
};

RainbirdController.prototype.getStatesArray = function(mask, len) {
    let repeat = len - mask.length;
    if(repeat > 0) {
        mask = '0'.repeat(repeat) + mask;
    }
    let cnt = mask.length * 4;
    let states = [];
    let rest = mask;
    while(rest) {
        let cur = parseInt(rest.substr(0, 2), 16);
        rest = rest.substr(2);
        for(let i = 0; i < 8; i++) {
            states.push(((1 << i) & cur) ? true : false);
        }
    }

    return {
        count: cnt,
        mask: mask,
        states: states
    };
};

//* public functions
RainbirdController.prototype.getModelAndVersion = function(callback) {
    this.processCommand('ModelAndVersion', [], function(response) {
		if(response) {
			callback &&  callback({
				model: response['modelID'],
				major: response['protocolRevisionMajor'],
				minor: response['protocolRevisionMinor']
			});
		} else {
			callback && callback(false);
		}
    });
};

RainbirdController.prototype.getAvailableStations = function(page, callback) {
    if(!page) {
        page = 0;
    }
    let controller = this;

    let numlen = RAINBIRD_COMMANDS["ControllerResponses"]["83"]["setStations"]["length"];

    this.processCommand('AvailableStations', [page], function(response) {
        let hexval = parseInt(response["setStations"]).toString(16).toUpperCase();
        let states = controller.getStatesArray(hexval, numlen);

        callback(states);
    });
};

RainbirdController.prototype.getCommandSupport = function(command, callback) {
    if(command.length !== 2) {
        let idx = command + 'Request';
        if(RAINBIRD_COMMANDS["ControllerCommands"][idx]) {
            command = RAINBIRD_COMMANDS["ControllerCommands"][idx]['command'];
        }
    }

    this.processCommand('CommandSupport', [command], function(response) {
		if(response) {
			callback &&  callback({
				support: response['support'],
				echo: response['commandEcho']
			});
		} else {
			callback && callback(false);
		}
    });
};

RainbirdController.prototype.getSerialNumber = function(callback) {
    this.processCommand('SerialNumber', null, function(response) {
        callback((response ? response['SerialNumber'] : false));
    });
};

RainbirdController.prototype.getCurrentTime = function(callback) {
    this.processCommand('CurrentTime', null, function(response) {
		if(response) {
			callback &&  callback({
				hour: response['hour'],
				minute: response['minute'],
				second: response['second']
			});
		} else {
			callback && callback(false);
		}
	});
};

RainbirdController.prototype.getCurrentDate = function(callback) {
    this.processCommand('CurrentDate', null, function(response) {
		if(response) {
			callback &&  callback({
				year: response['year'],
				month: response['month'],
				day: response['day']
			});
		} else {
			callback && callback(false);
		}
    });
};

RainbirdController.prototype.cmdWaterBudget = function(budget, callback) {
    this.processCommand('WaterBudget', [budget], function(response) {
		if(response) {
			callback &&  callback({
				program: response['programCode'],
				adjust: response['seasonalAdjust']
			});
		} else {
			callback && callback(false);
		}
    });
};

RainbirdController.prototype.getRainSensorState = function(callback, no_recheck) {
    let controller = this;
    if(!no_recheck && (!this.sensorUpdateTime || this.sensorUpdateTime <= (new Date()).getTime() - (this.sensorDelay * 1000))) {
        this.processCommand('CurrentRainSensorState', null, function(response) {
            controller.rainSensor = (response['sensorState'] ? true : false);
            controller.getRainSensorState(callback, true);
        });
        return;
    }

    callback(this.rainSensor);
};

RainbirdController.prototype.getZoneState = function(zone, page, callback, no_recheck) {
    if(!page) {
        page = 0;
    }
    if(!zone && null !== zone) {
        callback(null);
        return;
    }

    let numlen = RAINBIRD_COMMANDS["ControllerResponses"]["BF"]["activeStations"]["length"];

    let controller = this;
    if(!no_recheck && (!this.zonesUpdateTime || this.zonesUpdateTime <= (new Date()).getTime() - (this.sensorDelay * 1000))) {
        this.processCommand('CurrentStationsActive', [page], function(response) {
            let hexval = parseInt(response["activeStations"]).toString(16).toUpperCase();
            let states = controller.getStatesArray(hexval, numlen);
            controller.zones = states.states;
            controller.getZoneState(zone, page, callback, true);
        });
        return;
    }

	controller.getRunTime(function(response) {
		if(null === zone) {
			callback(controller.zones, response);
		} else {
			callback(controller.zones[zone - 1], response);
		}
	});
};

RainbirdController.prototype.getRunTime = function(callback) {
	let controller = this;

	this.processCommand('CurrentRunTime', [0], function(response) {
		if(response && response['type'] === 'CurrentRunTimeResponse') {
			let zone = response['activeStation'];
			let runtime = response['secondsRemaining'];

			callback && callback({"zone": zone, "seconds": runtime});
		} else {
			callback && callback(false);
		}
	});
};

RainbirdController.prototype.cmdRunProgram = function(program, callback) {
    let controller = this;
    this.processCommand('ManuallyRunProgram', [program], function(response) {
        if(response && response['type'] === 'AcknowledgeResponse') {
            controller.zonesUpdateTime = null;
            callback(true);
        } else {
            callback(false);
        }
    });
};

RainbirdController.prototype.cmdTestZone = function(zone, callback) {
    let controller = this;
    this.processCommand('TestStations', [zone], function(response) {
        if(response && response['type'] === 'AcknowledgeResponse') {
            callback(true);
        } else {
            callback(false);
        }
    });
};

RainbirdController.prototype.cmdRunZone = function(zone, duration, callback) {
    let controller = this;
    this.processCommand('ManuallyRunStation', [zone, duration], function(response) {
        if(response && response['type'] === 'AcknowledgeResponse') {
            controller.zonesUpdateTime = null;
            controller.getZoneState(zone, 0, callback);
        } else {
            callback(false);
        }
    });
};

RainbirdController.prototype.cmdStopIrrigation = function(callback) {
    let controller = this;
    this.processCommand('StopIrrigation', null, function(response) {
        if(response && response['type'] === 'AcknowledgeResponse') {
            controller.zonesUpdateTime = null;
            controller.getZoneState(null, 0, function(states) {
                let run = false;
                for(let i = 0; i < states.length; i++) {
                    if(states[i]) {
                        run = true;
                        break;
                    }
                }
                callback(run ? false : true);
            });
        } else {
            callback(false);
        }
    });
};

RainbirdController.prototype.getRainDelay = function(callback)  {
    this.processCommand('RainDelayGet', null, function(response) {
        callback((response ? response['delaySetting'] : false));
    });
};

RainbirdController.prototype.setRainDelay = function(duration, callback)  {
    this.processCommand('RainDelaySet', [duration], function(response) {
        if(response && response['type'] === 'AcknowledgeResponse') {
            callback(true);
        } else {
            callback(false);
        }
    });
};

RainbirdController.prototype.cmdAdvanceZone = function(callback)  {
    this.processCommand('AdvanceStation', [0], function(response) {
        if(response && response['type'] === 'AcknowledgeResponse') {
            callback(true);
        } else {
            callback(false);
        }
    });
};

RainbirdController.prototype.getCurrentIrrigation = function(callback)  {
    this.processCommand('CurrentIrrigationState', null, function(response) {
        callback((response && response['irrigationState'] ? true : false));
    });
};


module.exports = {
	RainbirdController: RainbirdController
};
