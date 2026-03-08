// tests/sse-notification-integration.test.js — Integration tests for SSE → notification pipeline
// Tests the full chain: vehicle update event → shouldNotify → fireNotification → notification output
import assert from 'assert';

// Mock localStorage
globalThis.localStorage = {
    _store: {},
    getItem(key) { return this._store[key] ?? null; },
    setItem(key, value) { this._store[key] = String(value); },
    removeItem(key) { delete this._store[key]; },
    clear() { this._store = {}; },
};

// Track notifications fired via both pathways
let firedNotifications = [];

// Mock Notification constructor (fallback pathway)
globalThis.Notification = function(title, options) {
    firedNotifications.push({ pathway: 'constructor', title, options });
};
globalThis.Notification.permission = 'granted';
globalThis.Notification.requestPermission = async () => 'granted';

// Mock navigator with SW controller (SW pathway)
function setupSWPathway() {
    const mockReg = {
        showNotification(title, options) {
            firedNotifications.push({ pathway: 'sw', title, options });
            return Promise.resolve();
        },
    };
    Object.defineProperty(globalThis, 'navigator', {
        value: {
            serviceWorker: {
                controller: { state: 'activated' },
                ready: Promise.resolve(mockReg),
            },
        },
        writable: true,
        configurable: true,
    });
}

function setupFallbackPathway() {
    Object.defineProperty(globalThis, 'navigator', {
        value: { serviceWorker: null },
        writable: true,
        configurable: true,
    });
}

import {
    initNotifications,
    addNotificationPair,
    getNotificationPairs,
    shouldNotify,
} from '../src/notifications.js';

const stopsData = new Map([
    ['place-davis', { id: 'place-davis', name: 'Davis', parentStopId: null }],
    ['70064', { id: '70064', name: 'Davis - Inbound', parentStopId: 'place-davis' }],
]);

function makeVehicle(overrides = {}) {
    return {
        id: 'v-1234',
        label: '1234',
        stopId: 'place-davis',
        routeId: 'Red',
        directionId: 0,
        currentStatus: 'STOPPED_AT',
        currentStopSequence: 5,
        latitude: 42.3967,
        longitude: -71.1228,
        bearing: 180,
        speed: 0,
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

/**
 * Test: Vehicle at checkpoint fires notification via SW pathway
 */
async function testSWPathwayFires() {
    localStorage.clear();
    firedNotifications = [];
    setupSWPathway();

    const events = new EventTarget();
    initNotifications(events, stopsData);
    await addNotificationPair('place-davis', 'Red', 0);

    events.dispatchEvent(new CustomEvent('vehicles:update', { detail: makeVehicle() }));

    // SW path is async — wait for promise chain
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(firedNotifications.length, 1, 'Should fire exactly one notification');
    assert.strictEqual(firedNotifications[0].pathway, 'sw', 'Should use SW pathway');
    assert.ok(firedNotifications[0].title.includes('Davis'), 'Title should include stop name');
    assert.strictEqual(firedNotifications[0].options.icon, '/icons/icon-192.png', 'Should include icon');
    console.log('  ok — SW pathway fires notification for vehicle at checkpoint');
}

/**
 * Test: Vehicle at checkpoint fires notification via fallback pathway
 */
async function testFallbackPathwayFires() {
    localStorage.clear();
    firedNotifications = [];
    setupFallbackPathway();

    const events = new EventTarget();
    initNotifications(events, stopsData);
    await addNotificationPair('place-davis', 'Red', 0);

    events.dispatchEvent(new CustomEvent('vehicles:update', { detail: makeVehicle() }));

    assert.strictEqual(firedNotifications.length, 1, 'Should fire exactly one notification');
    assert.strictEqual(firedNotifications[0].pathway, 'constructor', 'Should use constructor pathway');
    console.log('  ok — fallback pathway fires notification when no SW controller');
}

/**
 * Test: Wrong route does NOT fire notification
 */
async function testWrongRouteNoFire() {
    localStorage.clear();
    firedNotifications = [];
    setupFallbackPathway();

    const events = new EventTarget();
    initNotifications(events, stopsData);
    await addNotificationPair('place-davis', 'Red', 0);

    events.dispatchEvent(new CustomEvent('vehicles:update', {
        detail: makeVehicle({ routeId: 'Orange' }),
    }));

    assert.strictEqual(firedNotifications.length, 0, 'Wrong route should not fire');
    console.log('  ok — wrong route does not fire notification');
}

/**
 * Test: Vehicle IN_TRANSIT_TO does NOT fire (only STOPPED_AT and INCOMING_AT)
 */
async function testInTransitNoFire() {
    localStorage.clear();
    firedNotifications = [];
    setupFallbackPathway();

    const events = new EventTarget();
    initNotifications(events, stopsData);
    await addNotificationPair('place-davis', 'Red', 0);

    events.dispatchEvent(new CustomEvent('vehicles:update', {
        detail: makeVehicle({ currentStatus: 'IN_TRANSIT_TO' }),
    }));

    assert.strictEqual(firedNotifications.length, 0, 'IN_TRANSIT_TO should not fire');
    console.log('  ok — IN_TRANSIT_TO status does not fire notification');
}

/**
 * Test: Denied permission prevents notification
 */
async function testDeniedPermissionNoFire() {
    localStorage.clear();
    firedNotifications = [];
    setupFallbackPathway();

    const events = new EventTarget();
    initNotifications(events, stopsData);
    await addNotificationPair('place-davis', 'Red', 0);

    // Revoke permission after pair was added
    globalThis.Notification.permission = 'denied';

    events.dispatchEvent(new CustomEvent('vehicles:update', { detail: makeVehicle() }));

    assert.strictEqual(firedNotifications.length, 0, 'Denied permission should block notification');

    // Restore for other tests
    globalThis.Notification.permission = 'granted';
    console.log('  ok — denied permission prevents notification fire');
}

/**
 * Test: Duplicate vehicle does not fire twice (notifiedVehicles set)
 */
async function testNoDuplicateFire() {
    localStorage.clear();
    firedNotifications = [];
    setupFallbackPathway();

    const events = new EventTarget();
    initNotifications(events, stopsData);
    await addNotificationPair('place-davis', 'Red', 0);

    const vehicle = makeVehicle();
    events.dispatchEvent(new CustomEvent('vehicles:update', { detail: vehicle }));
    events.dispatchEvent(new CustomEvent('vehicles:update', { detail: vehicle }));

    assert.strictEqual(firedNotifications.length, 1, 'Same vehicle should not fire twice');
    console.log('  ok — duplicate vehicle update does not fire second notification');
}

/**
 * Test: Counted pair decrements and auto-deletes at zero
 */
async function testCountdownExpiry() {
    localStorage.clear();
    firedNotifications = [];
    setupFallbackPathway();

    const events = new EventTarget();
    initNotifications(events, stopsData);
    await addNotificationPair('place-davis', 'Red', 0, 1); // count=1

    assert.strictEqual(getNotificationPairs().length, 1, 'Should have 1 pair before fire');

    events.dispatchEvent(new CustomEvent('vehicles:update', { detail: makeVehicle() }));

    assert.strictEqual(firedNotifications.length, 1, 'Should fire notification');
    assert.strictEqual(getNotificationPairs().length, 0, 'Pair should be auto-deleted after count reaches 0');
    console.log('  ok — counted pair auto-deletes after reaching zero');
}

/**
 * Test: Child stop resolves to parent station for notification matching
 */
async function testChildStopResolvesToParent() {
    localStorage.clear();
    firedNotifications = [];
    setupFallbackPathway();

    const events = new EventTarget();
    initNotifications(events, stopsData);
    await addNotificationPair('place-davis', 'Red', 0);

    // Vehicle reports child stop ID, pair has parent station ID
    events.dispatchEvent(new CustomEvent('vehicles:update', {
        detail: makeVehicle({ stopId: '70064' }),
    }));

    assert.strictEqual(firedNotifications.length, 1, 'Child stop should match parent station');
    console.log('  ok — child stop ID resolves to parent station for matching');
}

async function runTests() {
    try {
        console.log('SSE → notification integration tests:\n');
        await testSWPathwayFires();
        await testFallbackPathwayFires();
        await testWrongRouteNoFire();
        await testInTransitNoFire();
        await testDeniedPermissionNoFire();
        await testNoDuplicateFire();
        await testCountdownExpiry();
        await testChildStopResolvesToParent();
        console.log('\n  All SSE-notification integration tests passed\n');
    } catch (err) {
        console.error('FAIL:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

runTests();
