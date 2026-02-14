// tests/notifications.test.js — Unit tests for notification config management and direction detection

import assert from 'assert';

// Mock localStorage before importing notifications.js
globalThis.localStorage = {
    _store: {},
    getItem(key) {
        return this._store[key] ?? null;
    },
    setItem(key, value) {
        this._store[key] = String(value);
    },
    removeItem(key) {
        delete this._store[key];
    },
    clear() {
        this._store = {};
    },
};

import {
    validatePair,
    addNotificationPair,
    removeNotificationPair,
    getNotificationPairs,
    shouldNotify,
    initNotifications,
    requestPermission,
    getPermissionState,
    pauseNotifications,
    resumeNotifications,
    togglePause,
    isPaused,
} from '../src/notifications.js';

/**
 * Test validatePair pure validation function
 */
function testValidatePair() {
    // Reset for clean state
    localStorage.clear();
    initNotifications(new EventTarget(), new Map());
    // AC3.1: Valid pair returns no error
    const result = validatePair('stop1', 'stop2', []);
    assert.strictEqual(result.error, undefined, 'Valid pair should have no error');

    // AC3.3: Cross-route pairs — can configure different routes simultaneously
    const existingRedPair = [{ id: 'p1', checkpointStopId: 'red-stop-1', myStopId: 'red-stop-2', routeId: 'Red' }];
    const crossRoute = validatePair('green-stop-1', 'green-stop-2', existingRedPair);
    assert.strictEqual(crossRoute.error, undefined, 'Cross-route pairs should be allowed');

    // AC3.4: 6th pair rejected
    const fivePairs = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
    const full = validatePair('stop1', 'stop2', fivePairs);
    assert.strictEqual(full.error, 'Maximum 5 notification pairs configured', '6th pair should be rejected');

    // AC3.5: Same stop for both rejected
    const same = validatePair('stop1', 'stop1', []);
    assert.strictEqual(same.error, 'Checkpoint and destination must be different stops', 'Same stops should be rejected');

    console.log('✓ validatePair tests passed');
}

/**
 * Test addNotificationPair function
 */
async function testAddNotificationPair() {
    localStorage.clear();

    // Mock Notification API to avoid actual permission prompts
    globalThis.Notification = {
        permission: 'granted',
        requestPermission: async function() {
            return 'granted';
        },
    };

    initNotifications(new EventTarget(), new Map());

    // AC3.1: Adding first pair succeeds
    const result1 = await addNotificationPair('stop1', 'stop2', 'Red');
    assert(result1.pair, 'Should return a pair object');
    assert.strictEqual(result1.pair.checkpointStopId, 'stop1', 'Checkpoint should match');
    assert.strictEqual(result1.pair.myStopId, 'stop2', 'Destination should match');
    assert.strictEqual(result1.pair.routeId, 'Red', 'Route should match');
    assert.strictEqual(result1.pair.learnedDirectionId, null, 'learnedDirectionId should start as null');
    assert(result1.pair.id, 'Should generate an ID');

    // Add 4 more pairs to reach limit
    for (let i = 0; i < 4; i++) {
        const res = await addNotificationPair(`stop${i}`, `stop${i + 100}`, 'Green-D');
        assert(res.pair, `Pair ${i + 2} should be added`);
    }

    // AC3.4: 6th pair rejected
    const result6 = await addNotificationPair('stop99', 'stop199', 'Blue');
    assert.strictEqual(result6.error, 'Maximum 5 notification pairs configured', 'Should reject 6th pair');
    assert(!result6.pair, 'Should not return a pair on rejection');

    // AC3.5: Same stop rejected (test with fresh empty array)
    localStorage.clear();
    initNotifications(new EventTarget(), new Map());
    const resultSame = await addNotificationPair('stop1', 'stop1', 'Red');
    assert.strictEqual(resultSame.error, 'Checkpoint and destination must be different stops', 'Should reject same stops');
    assert(!resultSame.pair, 'Should not return a pair when same stops');

    console.log('✓ addNotificationPair tests passed');
}

/**
 * Test removeNotificationPair function
 */
async function testRemoveNotificationPair() {
    localStorage.clear();

    // Mock Notification API
    globalThis.Notification = {
        permission: 'granted',
        requestPermission: async function() {
            return 'granted';
        },
    };

    initNotifications(new EventTarget(), new Map());

    // Add a pair
    const result1 = await addNotificationPair('stop1', 'stop2', 'Red');
    const pairId = result1.pair.id;
    let pairs = getNotificationPairs();
    assert.strictEqual(pairs.length, 1, 'Should have 1 pair after adding');

    // Add 4 more pairs to reach max of 5
    for (let i = 1; i < 5; i++) {
        await addNotificationPair(`stop${i}`, `stop${i + 100}`, 'Red');
    }
    pairs = getNotificationPairs();
    assert.strictEqual(pairs.length, 5, 'Should have 5 pairs (at max)');

    // AC3.6: Remove pair frees slot for new configuration
    const removed = removeNotificationPair(pairId);
    assert.strictEqual(removed, true, 'Should return true on successful removal');
    pairs = getNotificationPairs();
    assert.strictEqual(pairs.length, 4, 'Should have 4 pairs after removal');

    // Can now add a new pair (slot freed)
    const newPair = await addNotificationPair('newCheckpoint', 'newDest', 'Green-D');
    assert(newPair.pair, 'Should be able to add new pair after deletion');

    // Removing non-existent pair returns false
    const removed2 = removeNotificationPair('non-existent-id');
    assert.strictEqual(removed2, false, 'Should return false when removing non-existent pair');

    console.log('✓ removeNotificationPair tests passed');
}

/**
 * Test localStorage persistence
 */
async function testLocalStoragePersistence() {
    localStorage.clear();

    // Mock Notification API
    globalThis.Notification = {
        permission: 'granted',
        requestPermission: async function() {
            return 'granted';
        },
    };

    initNotifications(new EventTarget(), new Map());

    // Add a pair
    const result1 = await addNotificationPair('stop1', 'stop2', 'Red');
    const pairId = result1.pair.id;

    // Verify it's in localStorage
    const stored = localStorage.getItem('ttracker-notifications-config');
    assert(stored, 'Should store config in localStorage');
    const parsed = JSON.parse(stored);
    assert(Array.isArray(parsed), 'Stored data should be an array');
    assert.strictEqual(parsed.length, 1, 'Should have 1 pair in storage');
    assert.strictEqual(parsed[0].checkpointStopId, 'stop1', 'Stored pair should have correct checkpoint');

    // AC8.1: Simulate page reload by clearing in-memory state and reloading from storage
    // We can't truly reload the module, but we can verify the storage format is correct
    // by verifying that reading back produces valid data

    console.log('✓ localStorage persistence tests passed');
}

/**
 * Test corrupted localStorage handling
 */
async function testCorruptedLocalStorage() {
    // Mock Notification API
    globalThis.Notification = {
        permission: 'granted',
        requestPermission: async function() {
            return 'granted';
        },
    };

    // AC8.3: Corrupted localStorage data discarded, starts fresh
    localStorage._store['ttracker-notifications-config'] = 'invalid json {[ garbage';

    // Call initNotifications to trigger readConfig() which encounters the corrupted JSON
    initNotifications(new EventTarget(), new Map());
    // Verify pairs array is now empty (readConfig returned [])
    let pairs = getNotificationPairs();
    assert.strictEqual(pairs.length, 0, 'Should have 0 pairs after reading corrupted storage');

    // Adding a pair should now work
    const result = await addNotificationPair('stop1', 'stop2', 'Red');
    assert(result.pair, 'Should successfully add pair after corrupted storage recovery');

    // Test 2: AC8.3 Parse error with non-array JSON
    localStorage.clear();
    localStorage._store['ttracker-notifications-config'] = 'not an array';

    // Call initNotifications to trigger the non-array validation path
    initNotifications(new EventTarget(), new Map());
    pairs = getNotificationPairs();
    assert.strictEqual(pairs.length, 0, 'Should have 0 pairs after reading non-array storage');

    // Adding should work
    const result2 = await addNotificationPair('stop1', 'stop2', 'Red');
    assert(result2.pair, 'Should successfully add pair when stored data is not array');

    console.log('✓ corrupted localStorage handling tests passed');
}

/**
 * Test shouldNotify pure logic function
 */
function testShouldNotify() {
    localStorage.clear();
    initNotifications(new EventTarget(), new Map());

    // AC4.1: Vehicle at checkpoint on correct route → notify (direction learning)
    const pair1 = {
        id: 'p1',
        checkpointStopId: 'stop-A',
        myStopId: 'stop-B',
        routeId: 'Red',
        learnedDirectionId: null,
    };
    const vehicle = { id: 'v1', stopId: 'stop-A', routeId: 'Red', directionId: 0 };
    assert.strictEqual(shouldNotify(vehicle, pair1, new Set()), true, 'Should notify at checkpoint');
    // Direction should be learned
    assert.strictEqual(pair1.learnedDirectionId, 0, 'Direction should be learned');

    // AC4.4: Vehicle heading opposite direction → don't notify
    const pair2 = {
        id: 'p2',
        checkpointStopId: 'stop-A',
        myStopId: 'stop-B',
        routeId: 'Red',
        learnedDirectionId: 0,
    };
    const wrongDir = { id: 'v2', stopId: 'stop-A', routeId: 'Red', directionId: 1 };
    assert.strictEqual(shouldNotify(wrongDir, pair2, new Set()), false, 'Should not notify wrong direction');

    // AC4.1: Vehicle in correct learned direction → notify
    const correctDir = { id: 'v3', stopId: 'stop-A', routeId: 'Red', directionId: 0 };
    assert.strictEqual(shouldNotify(correctDir, pair2, new Set()), true, 'Should notify correct direction');

    // AC4.3: Same vehicle+pair already notified → don't notify
    const notified = new Set(['v1:p1']);
    assert.strictEqual(shouldNotify(vehicle, pair1, notified), false, 'Should not notify same vehicle+pair');

    // AC4.5: Vehicle at wrong stop → don't notify
    const wrongStop = { id: 'v4', stopId: 'stop-C', routeId: 'Red', directionId: 0 };
    const pair3 = { id: 'p3', checkpointStopId: 'stop-A', myStopId: 'stop-B', routeId: 'Red', learnedDirectionId: 0 };
    assert.strictEqual(shouldNotify(wrongStop, pair3, new Set()), false, 'Should not notify at wrong stop');

    // AC4.5: Vehicle on different route → don't notify
    const wrongRoute = { id: 'v5', stopId: 'stop-A', routeId: 'Green-B', directionId: 0 };
    assert.strictEqual(shouldNotify(wrongRoute, pair3, new Set()), false, 'Should not notify different route');

    // AC4.6: Different vehicle at same checkpoint, same direction → notify
    const vehicle2 = { id: 'v6', stopId: 'stop-A', routeId: 'Red', directionId: 0 };
    assert.strictEqual(shouldNotify(vehicle2, pair2, new Set()), true, 'Should notify different vehicle same checkpoint');

    // AC7.3: Vehicle with no directionId → fallback to checkpoint-only (notify with warning)
    const pair4 = {
        id: 'p4',
        checkpointStopId: 'stop-A',
        myStopId: 'stop-B',
        routeId: 'Red',
        learnedDirectionId: null,
    };
    const noDir = { id: 'v7', stopId: 'stop-A', routeId: 'Red', directionId: null };
    assert.strictEqual(shouldNotify(noDir, pair4, new Set()), true, 'Should notify when directionId missing');

    // AC7.4: Same logic works for all transit types (subway, bus, commuter rail)
    // Bus
    const busPair = {
        id: 'p5',
        checkpointStopId: 'bus-stop-1',
        myStopId: 'bus-stop-2',
        routeId: '39',
        learnedDirectionId: 1,
    };
    const busVehicle = { id: 'bus1', stopId: 'bus-stop-1', routeId: '39', directionId: 1 };
    assert.strictEqual(shouldNotify(busVehicle, busPair, new Set()), true, 'Should notify for bus');
    // Bus wrong direction
    const busWrong = { id: 'bus2', stopId: 'bus-stop-1', routeId: '39', directionId: 0 };
    assert.strictEqual(shouldNotify(busWrong, busPair, new Set()), false, 'Should not notify bus wrong direction');

    // Commuter Rail
    const crPair = {
        id: 'p6',
        checkpointStopId: 'cr-stop-1',
        myStopId: 'cr-stop-2',
        routeId: 'CR-Providence',
        learnedDirectionId: 0,
    };
    const crVehicle = { id: 'cr1', stopId: 'cr-stop-1', routeId: 'CR-Providence', directionId: 0 };
    assert.strictEqual(shouldNotify(crVehicle, crPair, new Set()), true, 'Should notify for commuter rail');
    // Commuter Rail wrong direction
    const crWrong = { id: 'cr2', stopId: 'cr-stop-1', routeId: 'CR-Providence', directionId: 1 };
    assert.strictEqual(shouldNotify(crWrong, crPair, new Set()), false, 'Should not notify CR wrong direction');

    console.log('✓ shouldNotify tests passed');
}

/**
 * Test shouldNotify parent stop resolution (child→parent stop ID matching)
 * MBTA SSE reports child/platform stop IDs (e.g., "70064") but notification pairs
 * may store parent station IDs (e.g., "place-davis"). shouldNotify resolves through
 * the stopsData parentStopId field.
 */
function testShouldNotifyParentResolution() {
    localStorage.clear();
    initNotifications(new EventTarget(), new Map());

    // Build mock stopsData with parent-child relationships
    const stopsData = new Map([
        ['place-davis', { id: 'place-davis', name: 'Davis', parentStopId: null }],
        ['70063', { id: '70063', name: 'Davis Northbound', parentStopId: 'place-davis' }],
        ['70064', { id: '70064', name: 'Davis Southbound', parentStopId: 'place-davis' }],
        ['place-portr', { id: 'place-portr', name: 'Porter', parentStopId: null }],
        ['70065', { id: '70065', name: 'Porter Northbound', parentStopId: 'place-portr' }],
    ]);

    // Pair configured with parent station ID (as shown in stop markers)
    const pair = {
        id: 'p-parent',
        checkpointStopId: 'place-davis',
        myStopId: 'place-portr',
        routeId: 'Red',
        learnedDirectionId: null,
    };

    // Vehicle reports child stop ID (as received from MBTA SSE)
    const vehicleAtChild = { id: 'v-child', stopId: '70064', routeId: 'Red', directionId: 0 };
    assert.strictEqual(
        shouldNotify(vehicleAtChild, pair, new Set(), stopsData),
        true,
        'Should notify when vehicle child stop resolves to pair parent station'
    );

    // Vehicle at a different child stop of same parent should also match
    const vehicleAtOtherChild = { id: 'v-child2', stopId: '70063', routeId: 'Red', directionId: 0 };
    const pair2 = { ...pair, id: 'p-parent2', learnedDirectionId: 0 };
    assert.strictEqual(
        shouldNotify(vehicleAtOtherChild, pair2, new Set(), stopsData),
        true,
        'Should notify for other child stop of same parent station'
    );

    // Vehicle at unrelated child stop should NOT match
    const vehicleAtPorter = { id: 'v-porter', stopId: '70065', routeId: 'Red', directionId: 0 };
    assert.strictEqual(
        shouldNotify(vehicleAtPorter, pair2, new Set(), stopsData),
        false,
        'Should not notify when child stop parent is different station'
    );

    // Without stopsData (backward compat), only exact match works
    const vehicleExactMatch = { id: 'v-exact', stopId: 'place-davis', routeId: 'Red', directionId: 0 };
    const pair3 = { ...pair, id: 'p-exact', learnedDirectionId: null };
    assert.strictEqual(
        shouldNotify(vehicleExactMatch, pair3, new Set()),
        true,
        'Should still match exact stop IDs without stopsData'
    );
    assert.strictEqual(
        shouldNotify(vehicleAtChild, { ...pair, id: 'p-nodata', learnedDirectionId: null }, new Set()),
        false,
        'Should not resolve parent without stopsData'
    );

    console.log('✓ shouldNotify parent stop resolution tests passed');
}

/**
 * Test permission handling (AC9.1, AC9.2, AC9.5, AC9.6)
 */
async function testPermissionHandling() {
    // Don't clear localStorage here; just test the permission state APIs
    // without actually adding pairs that would persist

    // Mock Notification API
    globalThis.Notification = {
        permission: 'default',
        requestPermission: async function() {
            // Simulate user granting permission
            this.permission = 'granted';
            return 'granted';
        },
    };

    // AC9.6: getPermissionState returns current permission
    let state = getPermissionState();
    assert.strictEqual(state, 'default', 'Initial permission should be default');

    // AC9.5: After permission granted, state reflects it
    globalThis.Notification.permission = 'granted';
    state = getPermissionState();
    assert.strictEqual(state, 'granted', 'Permission state should be granted');

    // Test unavailable Notification API
    globalThis.Notification = undefined;
    state = getPermissionState();
    assert.strictEqual(state, 'unavailable', 'Should return unavailable when Notification undefined');

    // Test requestPermission when Notification API is undefined
    const result = await requestPermission();
    assert.strictEqual(result, 'denied', 'requestPermission should return denied when Notification undefined');

    // Restore mock for other tests
    globalThis.Notification = {
        permission: 'granted',
        requestPermission: async function() {
            return this.permission;
        },
    };

    console.log('✓ permission handling tests passed');
}

/**
 * Test async addNotificationPair flow
 */
async function testAsyncAddNotificationPair() {
    localStorage.clear();

    // Mock Notification API in granted state
    globalThis.Notification = {
        permission: 'granted',
        requestPermission: async function() {
            return 'granted';
        },
    };

    // Re-initialize to ensure fresh state
    initNotifications(new EventTarget(), new Map());

    // AC9.1: First pair should return permissionState
    const result = await addNotificationPair('stop1-async', 'stop2-async', 'Red');
    assert(result.pair, 'Should return a pair object');
    assert.strictEqual(result.permissionState, 'granted', 'Should return permissionState');

    // Verify pair was saved
    const pairs = getNotificationPairs();
    assert.strictEqual(pairs.length, 1, 'Pair should be saved');

    console.log('✓ async addNotificationPair tests passed');
}

/**
 * Test localStorage quota exceeded handling (AC8.4)
 */
async function testWriteConfigQuotaError() {
    localStorage.clear();

    // Mock Notification API
    globalThis.Notification = {
        permission: 'granted',
        requestPermission: async function() {
            return 'granted';
        },
    };

    // Initialize with fresh state
    initNotifications(new EventTarget(), new Map());

    // AC8.4: Test that quota exceeded error doesn't propagate
    // Save the original setItem
    const originalSetItem = localStorage.setItem;

    // Replace setItem with one that throws QuotaExceededError
    localStorage.setItem = function(key, value) {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
    };

    try {
        // Try to add a pair (which calls writeConfig internally)
        const result = await addNotificationPair('stop1', 'stop2', 'Red');
        // Should return a pair (no exception thrown)
        assert(result.pair, 'Should return a pair despite quota error');
        console.log('✓ writeConfigQuotaError test passed (no exception thrown)');
    } finally {
        // Restore original setItem
        localStorage.setItem = originalSetItem;
        localStorage.clear();
    }
}

/**
 * Test pause/resume notification controls
 */
function testPauseResume() {
    // Setup: clear state
    localStorage.clear();

    // Mock Notification API
    globalThis.Notification = {
        permission: 'granted',
        requestPermission: async function() {
            return 'granted';
        },
    };

    // AC5.1: Paused stops notifications
    pauseNotifications();
    assert.strictEqual(isPaused(), true, 'isPaused() should return true after pauseNotifications()');

    // AC5.2: Resume re-enables
    resumeNotifications();
    assert.strictEqual(isPaused(), false, 'isPaused() should return false after resumeNotifications()');

    // AC5.5: Pairs unchanged after pause/resume cycle
    // Pre-populate localStorage with a known config array
    localStorage.clear();
    localStorage.setItem('ttracker-notifications-config', JSON.stringify([
        { id: 'p1', checkpointStopId: 's1', myStopId: 's2', routeId: 'Red', learnedDirectionId: null }
    ]));
    initNotifications(new EventTarget(), new Map());
    const beforeCount = getNotificationPairs().length; // 1, not 0
    pauseNotifications();
    resumeNotifications();
    assert.strictEqual(getNotificationPairs().length, beforeCount, 'Pause/resume should not modify pairs');

    // AC5.3 + AC8.2: Persist across simulated reload
    pauseNotifications();
    assert.strictEqual(localStorage.getItem('ttracker-notifications-paused'), 'true', 'localStorage should have true after pause');
    resumeNotifications();
    assert.strictEqual(localStorage.getItem('ttracker-notifications-paused'), 'false', 'localStorage should have false after resume');

    // AC5.3: Test state persists after simulated reinit
    localStorage.clear();
    pauseNotifications();
    // Simulate page reload by reinit
    const stopsData = new Map();
    initNotifications(new EventTarget(), stopsData);
    assert.strictEqual(isPaused(), true, 'Paused state should persist after reinit when localStorage has true');

    // Test resume persistence
    resumeNotifications();
    localStorage.clear();
    resumeNotifications(); // Set to false
    initNotifications(new EventTarget(), stopsData);
    assert.strictEqual(isPaused(), false, 'Resumed state should persist after reinit when localStorage has false');

    // Test toggle
    localStorage.clear();
    initNotifications(new EventTarget(), new Map());
    assert.strictEqual(isPaused(), false, 'Should start not paused');
    togglePause();
    assert.strictEqual(isPaused(), true, 'togglePause should pause when not paused');
    togglePause();
    assert.strictEqual(isPaused(), false, 'togglePause should resume when paused');

    console.log('✓ pause/resume tests passed');
}

/**
 * Run all tests
 */
async function runTests() {
    console.log('Running notification config management and direction detection tests...\n');

    testValidatePair();
    await testAddNotificationPair();
    await testRemoveNotificationPair();
    await testLocalStoragePersistence();
    await testCorruptedLocalStorage();
    testShouldNotify();
    testShouldNotifyParentResolution();
    await testPermissionHandling();
    await testAsyncAddNotificationPair();
    testPauseResume();
    await testWriteConfigQuotaError();

    console.log('\n✓ All tests passed!');
}

// Run tests
runTests().catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
});
