const { execFile } = require('child_process');
const path = require('path');

/**
 * RainbirdController using pyrainbird Python library
 */
function RainbirdController(server, password, context, sensorDelay, retry, retryDelay) {
    if (!sensorDelay) {
        sensorDelay = 10;
    }
    if (!retry) {
        retry = 3;
    }
    if (!retryDelay) {
        retryDelay = 10;
    }

    this.server = server;
    this.password = password;
    this.sensorDelay = sensorDelay;
    this.retry = retry;
    this.retryDelay = retryDelay;
    this.context = context;
    
    this.pythonBridge = path.join(__dirname, 'pyrainbird_bridge.py');
    
    this.rainSensor = null;
    this.sensorUpdateTime = null;
    this.zones = [];
    this.zonesUpdateTime = null;
    this.deviceModelId = null;
    
    this.requestQueue = [];
    this.processing = false;
}

/**
 * Execute a command via the Python bridge
 */
RainbirdController.prototype.executePythonCommand = function(command, args, callback) {
    const controller = this;
    const cmdArgs = [
        this.pythonBridge,
        '--host', this.server,
        '--password', this.password,
        '--command', command
    ];
    
    if (args && args.length > 0) {
        cmdArgs.push('--args', ...args.map(String));
    }
    
    execFile('python3', cmdArgs, { timeout: 20000 }, (error, stdout, stderr) => {
        if (error) {
            controller.context.log.warn(`Python bridge error for ${command}: ${error.message}`);
            if (stderr) {
                controller.context.log.debug(`Python stderr: ${stderr}`);
            }
            callback && callback(true, error);
            return;
        }
        
        try {
            const result = JSON.parse(stdout);
            if (!result.success) {
                controller.context.log.warn(`Command ${command} failed: ${result.error}`);
                callback && callback(true, result.error);
            } else {
                callback && callback(false, result.data);
            }
        } catch (e) {
            controller.context.log.warn(`Failed to parse Python output for ${command}: ${e.message}`);
            controller.context.log.debug(`Python stdout: ${stdout}`);
            callback && callback(true, e);
        }
    });
};

RainbirdController.prototype.setDeviceModelId = function(deviceModelId) {
    this.deviceModelId = `${deviceModelId}`;
};

RainbirdController.prototype.processCommand = function(cmd, args, callback) {
    let found = false;
    for (let i = 0; i < this.requestQueue.length; i++) {
        if (this.requestQueue[i]['cmd'] === cmd) {
            found = i;
            break;
        }
    }

    if (found !== false) {
        if (cmd.substr(0, 3) === 'cmd' || cmd.substr(0, 3) === 'set') {
            this.requestQueue.splice(found, 1);
            this.context.log.info(`Removing previous command from queue: ${cmd}`);
        } else {
            this.context.log.info(`Command already in queue: ${cmd}`);
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
    this.context.log.debug(`Queue len: ${this.requestQueue.length}`);
    if (this.requestQueue.length < 1) {
        this.processing = false;
        this.context.log.debug('Queue processing completed.');
        return;
    } else if (this.processing) {
        this.context.log.debug('Skipping, queue already processing.');
        return;
    }

    const controller = this;
    this.processing = true;
    const el = this.requestQueue.shift();
    
    this.context.log.debug(`Executing command: ${el.cmd}`);
    
    // Map old command names to new Python bridge commands
    const commandMap = {
        'ModelAndVersion': 'get_model_and_version',
        'AvailableStations': 'get_available_stations',
        'SerialNumber': 'get_serial_number',
        'CurrentTime': 'get_current_time',
        'CurrentDate': 'get_current_date',
        'CurrentRainSensorState': 'get_rain_sensor_state',
        'CurrentStationsActive': 'get_zone_states',
        'CurrentIrrigationState': 'get_current_irrigation',
        'RainDelayGet': 'get_rain_delay',
        'RainDelaySet': 'set_rain_delay',
        'ManuallyRunStation': 'irrigate_zone',
        'StopIrrigation': 'stop_irrigation',
        'TestStations': 'test_zone',
        'AdvanceStation': 'advance_zone',
        'WaterBudget': 'get_water_budget',
        'ManuallyRunProgram': 'run_program',
        'CurrentRunTime': 'get_zone_states'  // Approximate mapping
    };
    
    const pythonCommand = commandMap[el.cmd] || el.cmd.toLowerCase();
    
    this.executePythonCommand(pythonCommand, el.args, function(error, response) {
        controller.context.log.debug(`Command ${el.cmd} completed.`);
        if (error) {
            el['callback'] && el['callback'](false);
        } else {
            el['callback'] && el['callback'](response);
        }
        controller.processing = false;
        controller.processQueue();
    });
};

// Helper function to convert station list to states array
RainbirdController.prototype.getStatesArray = function(activeStations, totalStations) {
    const states = [];
    if (!totalStations) totalStations = 8;
    
    for (let i = 1; i <= totalStations; i++) {
        states.push(activeStations && activeStations.includes(i));
    }
    
    return {
        count: totalStations,
        states: states
    };
};

//* Public functions
RainbirdController.prototype.getModelAndVersion = function(callback) {
    this.processCommand('ModelAndVersion', [], function(response) {
        if (response) {
            callback && callback({
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
    if (!page) page = 0;
    const controller = this;
    
    this.processCommand('AvailableStations', [page], function(response) {
        if (response && response['stations']) {
            const states = controller.getStatesArray(response['stations'], response['count'] || 8);
            callback && callback(states);
        } else {
            callback && callback(false);
        }
    });
};

RainbirdController.prototype.getSerialNumber = function(callback) {
    this.processCommand('SerialNumber', null, function(response) {
        callback && callback(response ? response['serialNumber'] : false);
    });
};

RainbirdController.prototype.getCurrentTime = function(callback) {
    this.processCommand('CurrentTime', null, function(response) {
        if (response) {
            callback && callback({
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
        if (response) {
            callback && callback({
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
        if (response) {
            callback && callback({
                program: response['programCode'],
                adjust: response['seasonalAdjust']
            });
        } else {
            callback && callback(false);
        }
    });
};

RainbirdController.prototype.getRainSensorState = function(callback, no_recheck) {
    const controller = this;
    if (!no_recheck && (!this.sensorUpdateTime || 
        this.sensorUpdateTime <= new Date().getTime() - this.sensorDelay * 1000)) {
        this.processCommand('CurrentRainSensorState', null, function(response) {
            controller.rainSensor = response && response['sensorState'] ? true : false;
            controller.sensorUpdateTime = new Date().getTime();
            controller.getRainSensorState(callback, true);
        });
        return;
    }
    
    callback && callback(controller.rainSensor);
};

RainbirdController.prototype.getZoneState = function(zone, page, callback, no_recheck) {
    if (!page) page = 0;
    if (!zone && null !== zone) {
        callback(null);
        return;
    }

    const controller = this;
    if (!no_recheck && (!this.zonesUpdateTime || 
        this.zonesUpdateTime <= new Date().getTime() - this.sensorDelay * 1000)) {
        this.processCommand('CurrentStationsActive', [page], function(response) {
            if (response && response['activeStations']) {
                controller.zones = controller.getStatesArray(
                    response['activeStations'], 
                    response['activeStations'].length || 8
                ).states;
                controller.zonesUpdateTime = new Date().getTime();
                controller.getZoneState(zone, page, callback, true);
            } else {
                callback && callback(false);
            }
        });
        return;
    }

    controller.getRunTime(function(response) {
        if (null === zone) {
            callback(controller.zones, response);
        } else {
            callback(controller.zones[zone - 1], response);
        }
    });
};

RainbirdController.prototype.getRunTime = function(callback) {
    this.processCommand('CurrentStationsActive', [0], function(response) {
        // pyrainbird doesn't have exact runtime info, return basic info
        if (response) {
            callback && callback({ 
                zone: response['activeStations'] && response['activeStations'][0] || 0, 
                seconds: 0 
            });
        } else {
            callback && callback(false);
        }
    });
};

RainbirdController.prototype.cmdRunProgram = function(program, callback) {
    const controller = this;
    this.processCommand('ManuallyRunProgram', [program], function(response) {
        if (response && response['acknowledged']) {
            controller.zonesUpdateTime = null;
            callback(true);
        } else {
            callback(false);
        }
    });
};

RainbirdController.prototype.cmdTestZone = function(zone, callback) {
    this.processCommand('TestStations', [zone], function(response) {
        if (response && response['acknowledged']) {
            callback(true);
        } else {
            callback(false);
        }
    });
};

RainbirdController.prototype.cmdRunZone = function(zone, duration, callback) {
    const controller = this;
    this.processCommand('ManuallyRunStation', [zone, duration], function(response) {
        if (response && response['acknowledged']) {
            controller.zonesUpdateTime = null;
            controller.getZoneState(zone, 0, callback);
        } else {
            callback(false);
        }
    });
};

RainbirdController.prototype.cmdStopIrrigation = function(callback) {
    const controller = this;
    this.processCommand('StopIrrigation', null, function(response) {
        if (response && response['acknowledged']) {
            controller.zonesUpdateTime = null;
            controller.getZoneState(null, 0, function(states) {
                let run = false;
                for (let i = 0; i < states.length; i++) {
                    if (states[i]) {
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

RainbirdController.prototype.getRainDelay = function(callback) {
    this.processCommand('RainDelayGet', null, function(response) {
        callback(response ? response['delaySetting'] : false);
    });
};

RainbirdController.prototype.setRainDelay = function(duration, callback) {
    this.processCommand('RainDelaySet', [duration], function(response) {
        if (response && response['acknowledged']) {
            callback(true);
        } else {
            callback(false);
        }
    });
};

RainbirdController.prototype.cmdAdvanceZone = function(callback) {
    this.processCommand('AdvanceStation', [0], function(response) {
        if (response && response['acknowledged']) {
            callback(true);
        } else {
            callback(false);
        }
    });
};

RainbirdController.prototype.getCurrentIrrigation = function(callback) {
    this.processCommand('CurrentIrrigationState', null, function(response) {
        callback(response && response['irrigationState'] ? true : false);
    });
};

module.exports = {
    RainbirdController: RainbirdController
};
