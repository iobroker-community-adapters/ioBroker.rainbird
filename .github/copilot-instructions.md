# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

### Adapter-Specific Context

**Adapter Name:** rainbird  
**Primary Function:** Interface with Rain Bird LNK WiFi-enabled irrigation controllers  
**Target Device:** Rain Bird irrigation systems with LNK WiFi adapter  
**Key Dependencies:** @iobroker/adapter-core, request library for HTTP communication  
**Configuration:** Uses encrypted password storage (breaking change in v2.0.0), jsonConfig for admin interface  
**Unique Requirements:**
- Direct WiFi connection to Rain Bird controllers (no cloud service)
- Encrypted password handling for security
- Zone-based irrigation control and monitoring
- Seasonal water budget adjustments
- Rain sensor integration
- Real-time irrigation status monitoring

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Get all states created by adapter
                        const stateIds = await harness.dbConnection.getStateIDs('your-adapter.0.*');
                        
                        console.log(`📊 Found ${stateIds.length} states`);

                        if (stateIds.length > 0) {
                            console.log('✅ Adapter successfully created states');
                            
                            // Show sample of created states
                            const allStates = await new Promise((res, rej) => {
                                harness.states.getStates(stateIds, (err, states) => {
                                    if (err) return rej(err);
                                    res(states || []);
                                });
                            });
                            
                            console.log('📋 Sample states created:');
                            stateIds.slice(0, 5).forEach((stateId, index) => {
                                const state = allStates[index];
                                console.log(`   ${stateId}: ${state && state.val !== undefined ? state.val : 'undefined'}`);
                            });
                            
                            await harness.stopAdapter();
                            resolve(true);
                        } else {
                            console.log('❌ No states were created by the adapter');
                            reject(new Error('Adapter did not create any states'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }).timeout(40000);
        });
    }
});
```

#### Testing Both Success AND Failure Scenarios

**IMPORTANT**: For every "it works" test, implement corresponding "it doesn't work and fails" tests. This ensures proper error handling and validates that your adapter fails gracefully when expected.

```javascript
// Example: Testing successful configuration
it('should configure and start adapter with valid configuration', function () {
    return new Promise(async (resolve, reject) => {
        // ... successful configuration test as shown above
    });
}).timeout(40000);

// Example: Testing failure scenarios
it('should NOT create daily states when daily is disabled', function () {
    return new Promise(async (resolve, reject) => {
        try {
            harness = getHarness();
            
            console.log('🔍 Step 1: Fetching adapter object...');
            const obj = await new Promise((res, rej) => {
                harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                    if (err) return rej(err);
                    res(o);
                });
            });
            
            if (!obj) {
                return reject(new Error('Adapter object not found'));
            }

            console.log('⚙️ Step 2: Configuring to NOT create daily states...');
            Object.assign(obj.native, {
                position: TEST_COORDINATES,
                createCurrently: false,
                createHourly: false,
                createDaily: false  // Explicitly disable daily
            });

            harness.objects.setObject(obj._id, obj);
            
            await harness.startAdapterAndWait();
            await wait(15000);

            console.log('🔍 Step 3: Verifying NO daily states were created...');
            const stateIds = await harness.dbConnection.getStateIDs('your-adapter.0.*');
            const dailyStates = stateIds.filter(id => id.includes('daily'));
            
            if (dailyStates.length === 0) {
                console.log('✅ SUCCESS: No daily states created as expected');
                await harness.stopAdapter();
                resolve(true);
            } else {
                console.log(`❌ FAILURE: Found ${dailyStates.length} daily states when none expected:`, dailyStates);
                await harness.stopAdapter();
                reject(new Error(`Expected no daily states, but found ${dailyStates.length}: ${dailyStates.join(', ')}`));
            }
        } catch (error) {
            console.error('Test failed with error:', error);
            reject(error);
        }
    });
}).timeout(40000);
```

#### Invalid Data Testing

Add tests for invalid or malformed data to ensure proper error handling:

```javascript
it('should handle invalid API responses gracefully', function () {
    // Mock invalid response and verify error handling
    return new Promise(async (resolve, reject) => {
        // Test implementation here
    });
}).timeout(30000);
```

#### Demo Credentials Pattern

For adapters requiring authentication, provide demo/test credentials that work with live services when possible:

```javascript
// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

### Rain Bird Specific Testing Patterns

For Rain Bird adapter testing, consider these specific scenarios:

```javascript
// Test encrypted password handling
it('should properly encrypt and decrypt passwords', async function () {
    // Test password encryption/decryption logic
});

// Test zone control functionality
it('should properly control irrigation zones', async function () {
    // Test zone start/stop operations
});

// Test rain sensor integration
it('should properly detect rain sensor status', async function () {
    // Test rain sensor state handling
});
```

## Architecture Patterns

### ioBroker Adapter Structure
- **main.js**: Entry point with main adapter class extending `utils.Adapter`
- **lib/**: Helper libraries and modules
- **admin/**: Admin interface files (HTML, CSS, JS)
- **io-package.json**: Adapter configuration and metadata

### State Management
- Use proper state naming conventions (e.g., `device.commands.runProgram`)  
- Set appropriate state roles and types in io-package.json
- Use `setState()` for updating values
- Use `getState()` for reading current values
- Handle `stateChange` events appropriately

### Error Handling
- Always use try-catch blocks for async operations
- Log errors with appropriate level (error, warn, info, debug)
- Provide meaningful error messages to users
- Implement proper cleanup in `unload()` method

### Configuration Management
- Use jsonConfig for modern admin interface
- Validate configuration parameters
- Handle password encryption properly (v2.0.0+ requirement)
- Provide sensible default values

### Communication Patterns
- Use proper HTTP request handling with error recovery
- Implement timeout mechanisms for network operations
- Handle connection failures gracefully
- Use appropriate polling intervals to avoid overwhelming devices

## Coding Standards

### General Guidelines
- Use ESLint configuration from `@iobroker/eslint-config`
- Follow JavaScript/Node.js best practices
- Use meaningful variable and function names
- Add JSDoc comments for public methods
- Use semantic versioning for releases

### ioBroker Specific Patterns
- Extend `utils.Adapter` class properly
- Implement all required adapter lifecycle methods
- Use adapter logging methods (`this.log.info`, `this.log.error`, etc.)
- Handle adapter state changes correctly
- Clean up resources in `unload()` method

### Rain Bird Adapter Specifics
- Handle WiFi connection states properly
- Implement zone-based control logic
- Manage irrigation timers and schedules
- Process rain sensor data correctly
- Handle seasonal adjustments appropriately

## Development Workflow

### Initial Development
1. Set up basic adapter structure
2. Implement configuration interface
3. Add communication layer with Rain Bird controller
4. Implement state management
5. Add error handling and logging
6. Create admin interface
7. Write tests
8. Document functionality

### Testing Strategy
1. Unit tests for individual functions
2. Integration tests with @iobroker/testing framework
3. Manual testing with actual Rain Bird hardware
4. Error scenario testing
5. Password encryption/decryption testing

### Release Process
1. Update version in package.json and io-package.json
2. Update changelog in README.md
3. Run tests and lint
4. Use release-script for automated releases
5. Verify npm package publication

## Common Patterns for Rain Bird Integration

### Connection Management
```javascript
// Establish connection to Rain Bird controller
async connectToController() {
    try {
        // Implementation specific to Rain Bird protocol
        this.log.info('Connecting to Rain Bird controller...');
        // Connection logic here
    } catch (error) {
        this.log.error(`Failed to connect: ${error.message}`);
    }
}
```

### Zone Control
```javascript
// Control irrigation zones
async controlZone(zoneNumber, action, duration = 0) {
    try {
        // Zone control implementation
        this.log.info(`${action} zone ${zoneNumber}`);
        // Control logic here
    } catch (error) {
        this.log.error(`Zone control failed: ${error.message}`);
    }
}
```

### Status Monitoring
```javascript
// Monitor irrigation status
async updateIrrigationStatus() {
    try {
        // Status monitoring implementation
        const status = await this.getControllerStatus();
        await this.setStateAsync('device.irrigation.active', status.active, true);
        // Additional status updates
    } catch (error) {
        this.log.error(`Status update failed: ${error.message}`);
    }
}
```

This adapter provides direct WiFi communication with Rain Bird LNK adapters for comprehensive irrigation system control and monitoring without requiring cloud services.