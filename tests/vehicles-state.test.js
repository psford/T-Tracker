// tests/vehicles-state.test.js — Unit tests for vehicle state management (vehicles.js)
// Tests event-driven state transitions: reset, add, update (snap vs interpolate), remove
import assert from 'assert';

// Stubs required before importing vehicles.js (it reads these at module level)
globalThis.document = {
    hidden: false,
    addEventListener: () => {},
};

let _now = 1000;
globalThis.performance = { now: () => _now };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

function makeVehicle(overrides = {}) {
    return {
        id: 'v1',
        latitude: 42.3601,
        longitude: -71.0589,
        bearing: 90,
        routeId: 'Red',
        currentStatus: 'IN_TRANSIT_TO',
        stopId: 'stop1',
        currentStopSequence: 5,
        directionId: 0,
        label: '1234',
        speed: 15,
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

// vehicles.js imports config.js — need to provide it
// Create a minimal config module that vehicles.js can import
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'config.js');

// Check if config.js exists (it's gitignored)
let configExisted = existsSync(configPath);

// If no config.js exists, create a temporary one for the test
if (!configExisted) {
    const configContent = `export const config = {
    animation: {
        snapThreshold: 100,
        interpolationDuration: 800,
        fadeInDuration: 200,
        fadeOutDuration: 200,
    },
};`;
    writeFileSync(configPath, configContent, 'utf-8');
}

const { initVehicles, getVehicles } = await import('../src/vehicles.js');

/**
 * Test: vehicles:reset populates vehicle map
 */
function testResetPopulatesVehicles() {
    const events = new EventTarget();
    initVehicles(events, () => null);

    events.dispatchEvent(new CustomEvent('vehicles:reset', { detail: [makeVehicle()] }));

    const map = getVehicles();
    assert.ok(map.has('v1'), 'Vehicle v1 should be in the map after reset');
    const state = map.get('v1');
    assert.strictEqual(state.routeId, 'Red', 'routeId should be Red');
    assert.strictEqual(state.state, 'entering', 'initial state should be entering (fade-in)');
    assert.strictEqual(state.opacity, 0, 'initial opacity should be 0 (fade-in start)');
    console.log('  ok — vehicles:reset populates vehicle map with entering state');
}

/**
 * Test: vehicles:reset clears previous vehicles
 */
function testResetClearsPreviousVehicles() {
    const events = new EventTarget();
    initVehicles(events, () => null);

    events.dispatchEvent(new CustomEvent('vehicles:reset', { detail: [makeVehicle({ id: 'old' })] }));
    assert.ok(getVehicles().has('old'), 'old vehicle should exist before second reset');

    events.dispatchEvent(new CustomEvent('vehicles:reset', { detail: [makeVehicle({ id: 'new' })] }));
    assert.ok(!getVehicles().has('old'), 'old vehicle should be gone after second reset');
    assert.ok(getVehicles().has('new'), 'new vehicle should exist after second reset');
    console.log('  ok — vehicles:reset clears stale vehicles');
}

/**
 * Test: vehicles:add adds without clearing existing
 */
function testAddDoesNotClearExisting() {
    const events = new EventTarget();
    initVehicles(events, () => null);

    events.dispatchEvent(new CustomEvent('vehicles:reset', { detail: [makeVehicle({ id: 'existing' })] }));
    events.dispatchEvent(new CustomEvent('vehicles:add', { detail: makeVehicle({ id: 'added' }) }));

    assert.ok(getVehicles().has('existing'), 'Existing vehicle should survive vehicles:add');
    assert.ok(getVehicles().has('added'), 'New vehicle should be added');
    console.log('  ok — vehicles:add does not clear existing vehicles');
}

/**
 * Test: vehicles:remove sets state to exiting
 */
function testRemoveSetsExiting() {
    const events = new EventTarget();
    initVehicles(events, () => null);

    events.dispatchEvent(new CustomEvent('vehicles:reset', { detail: [makeVehicle({ id: 'r1' })] }));
    events.dispatchEvent(new CustomEvent('vehicles:remove', { detail: { id: 'r1' } }));

    const state = getVehicles().get('r1');
    assert.strictEqual(state.state, 'exiting', 'Removed vehicle state should be exiting');
    console.log('  ok — vehicles:remove sets state to exiting');
}

/**
 * Test: vehicles:update on unknown ID is a no-op
 */
function testUpdateUnknownVehicleIsNoop() {
    const events = new EventTarget();
    initVehicles(events, () => null);

    events.dispatchEvent(new CustomEvent('vehicles:reset', { detail: [] }));
    events.dispatchEvent(new CustomEvent('vehicles:update', { detail: makeVehicle({ id: 'ghost' }) }));

    assert.ok(!getVehicles().has('ghost'), 'Update of unknown vehicle must not create entry');
    console.log('  ok — vehicles:update ignores unknown vehicle IDs');
}

/**
 * Test: Small position change uses interpolation (animationDuration > 0)
 */
function testNearbyUpdateInterpolates() {
    const events = new EventTarget();
    initVehicles(events, () => null);

    const vehicle = makeVehicle({ latitude: 42.3601, longitude: -71.0589 });
    events.dispatchEvent(new CustomEvent('vehicles:reset', { detail: [vehicle] }));

    // Move ~11 meters (0.0001 degrees latitude), well under 100m snap threshold
    events.dispatchEvent(new CustomEvent('vehicles:update', {
        detail: makeVehicle({ latitude: 42.3602, longitude: -71.0589 }),
    }));

    const state = getVehicles().get('v1');
    assert.ok(state.animationDuration > 0, 'Small move should use interpolation (animationDuration > 0)');
    console.log('  ok — nearby update uses interpolation');
}

/**
 * Test: Large position jump snaps instantly (animationDuration === 0)
 */
function testFarUpdateSnaps() {
    const events = new EventTarget();
    initVehicles(events, () => null);

    const vehicle = makeVehicle({ latitude: 42.3601, longitude: -71.0589 });
    events.dispatchEvent(new CustomEvent('vehicles:reset', { detail: [vehicle] }));

    // Move ~556 meters (0.005 degrees latitude), exceeds 100m snap threshold
    events.dispatchEvent(new CustomEvent('vehicles:update', {
        detail: makeVehicle({ latitude: 42.3651, longitude: -71.0589 }),
    }));

    const state = getVehicles().get('v1');
    assert.strictEqual(state.animationDuration, 0, 'Large move should snap (animationDuration === 0)');
    assert.strictEqual(state.latitude, 42.3651, 'Latitude should snap to target');
    console.log('  ok — far update snaps instantly');
}

/**
 * Test: Metadata is updated on vehicles:update
 */
function testMetadataUpdated() {
    const events = new EventTarget();
    initVehicles(events, () => null);

    events.dispatchEvent(new CustomEvent('vehicles:reset', {
        detail: [makeVehicle({ currentStatus: 'IN_TRANSIT_TO', stopId: 'stop1' })],
    }));

    events.dispatchEvent(new CustomEvent('vehicles:update', {
        detail: makeVehicle({ currentStatus: 'STOPPED_AT', stopId: 'stop2' }),
    }));

    const state = getVehicles().get('v1');
    assert.strictEqual(state.currentStatus, 'STOPPED_AT', 'currentStatus should update');
    assert.strictEqual(state.stopId, 'stop2', 'stopId should update');
    console.log('  ok — metadata updated on vehicles:update');
}

function runTests() {
    try {
        console.log('vehicles.js state management tests:\n');
        testResetPopulatesVehicles();
        testResetClearsPreviousVehicles();
        testAddDoesNotClearExisting();
        testRemoveSetsExiting();
        testUpdateUnknownVehicleIsNoop();
        testNearbyUpdateInterpolates();
        testFarUpdateSnaps();
        testMetadataUpdated();
        console.log('\n  All vehicles state management tests passed\n');
    } catch (err) {
        console.error('FAIL:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

runTests();
