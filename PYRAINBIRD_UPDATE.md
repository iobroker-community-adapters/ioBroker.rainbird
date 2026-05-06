# PyRainbird Integration Update

## Summary

The ioBroker.rainbird adapter has been updated to use the official `pyrainbird` Python library (version 6.0.x) instead of the previous JavaScript port. This provides better maintainability, automatic updates, and improved compatibility with Rain Bird devices.

## Changes Made

### 1. New Files

- **`lib/pyrainbird_bridge.py`**: Python bridge script that wraps the pyrainbird library and provides a CLI interface
- **`lib/rainbird-pyrainbird.js`**: Node.js wrapper that calls the Python bridge via child_process
- **`requirements.txt`**: Python dependencies (pyrainbird, aiohttp)
- **`PYRAINBIRD_UPDATE.md`**: This documentation file

### 2. Modified Files

- **`package.json`**: 
  - Added `install` script to automatically install Python dependencies
  - Added `requirements.txt` to the files array for npm packaging
  
- **`main.js`**:
  - Added import for `rainbird-pyrainbird` module
  - Added configuration option to choose between implementations
  - Defaults to using pyrainbird (recommended)
  
- **`admin/jsonConfig.json`**:
  - Added `usePyrainbird` checkbox option
  
- **`admin/i18n/en/translations.json`** and **`admin/i18n/de/translations.json`**:
  - Added translations for the new configuration option
  
- **`README.md`**:
  - Added installation requirements section
  - Documented the migration to pyrainbird

### 3. Backward Compatibility

The original JavaScript implementation (`lib/rainbird.js`) is **still included** and can be used by:
- Unchecking "Use pyrainbird library" in the adapter configuration
- OR setting `usePyrainbird: false` in the adapter config

This ensures existing installations continue to work while new installations benefit from the pyrainbird library.

## Installation Requirements

### Python Dependencies

The adapter now requires:
- Python 3.8 or higher (tested with 3.12)
- pyrainbird library (6.0.x - 6.2.x)
- aiohttp library

These will be automatically installed during `npm install` via the install script.

### Manual Installation

If automatic installation fails, manually install with:

```bash
pip3 install --user pyrainbird>=6.0.0,<6.3 aiohttp>=3.9.0
```

Or if you encounter PEP 668 errors:

```bash
pip3 install --user --break-system-packages pyrainbird>=6.0.0,<6.3 aiohttp>=3.9.0
```

## Architecture

```
┌──────────────┐
│   main.js    │
└──────┬───────┘
       │
       ├─────────────────┐
       │                 │
┌──────▼───────────┐   ┌─▼────────────────┐
│  rainbird.js     │   │ rainbird-        │
│  (legacy)        │   │ pyrainbird.js    │
│                  │   │                  │
│  Pure JavaScript │   │  Calls Python    │
│  implementation  │   │  bridge          │
└──────────────────┘   └──────┬───────────┘
                              │
                        ┌─────▼──────────┐
                        │ pyrainbird_    │
                        │ bridge.py      │
                        │                │
                        │ Python CLI     │
                        └────────┬───────┘
                                 │
                          ┌──────▼──────┐
                          │  pyrainbird │
                          │  library    │
                          └─────────────┘
```

## API Mapping

The bridge maps the adapter's command interface to pyrainbird methods:

| Adapter Command           | PyRainbird Method           |
|--------------------------|------------------------------|
| ModelAndVersion          | get_model_and_version()     |
| AvailableStations        | get_available_stations()    |
| SerialNumber             | get_serial_number()         |
| CurrentTime              | get_current_time()          |
| CurrentDate              | get_current_date()          |
| CurrentRainSensorState   | get_rain_sensor_state()     |
| CurrentStationsActive    | get_zone_states()           |
| CurrentIrrigationState   | get_current_irrigation()    |
| RainDelayGet             | get_rain_delay()            |
| RainDelaySet             | set_rain_delay()            |
| ManuallyRunStation       | irrigate_zone()             |
| StopIrrigation           | stop_irrigation()           |
| TestStations             | test_zone()                 |
| AdvanceStation           | advance_zone()              |
| WaterBudget              | get_water_budget()          |
| ManuallyRunProgram       | run_program()               |

## Testing

### Test the Python Bridge

```bash
cd ~/.openclaw/workspace/ioBroker.rainbird
python3 test_bridge.py
```

This will verify that the bridge can be executed and communicates properly (will fail on actual commands without a device, which is expected).

### Test the Adapter

1. Install the adapter in ioBroker
2. Configure with your Rain Bird device IP and password
3. Ensure "Use pyrainbird library" is checked (default)
4. Start the adapter
5. Verify that device states are populated

## Troubleshooting

### Python Not Found

If you get "python3: command not found":
- Install Python 3: `sudo apt install python3 python3-pip`

### Module Not Found

If you get "ModuleNotFoundError: No module named 'pyrainbird'":
- Manually install: `pip3 install --user pyrainbird aiohttp`
- Check installation: `python3 -c "import pyrainbird; print(pyrainbird.__version__)"`

### Legacy Mode

If the Python bridge doesn't work:
1. Open adapter configuration
2. Uncheck "Use pyrainbird library"
3. Save and restart the adapter
4. The adapter will fall back to the original JavaScript implementation

## Future Improvements

- [ ] Add support for newer pyrainbird versions (6.3+) when Python 3.13 becomes standard
- [ ] Consider creating a proper Python service instead of CLI calls for better performance
- [ ] Add more comprehensive tests for the bridge
- [ ] Consider contributing back to pyrainbird project for any device-specific improvements

## Credits

- Original adapter: Marius Burkard <m.burkard@pixcept.de>
- PyRainbird library: https://github.com/allenporter/pyrainbird
- Integration update: 2026

## License

MIT License (same as the original adapter)
