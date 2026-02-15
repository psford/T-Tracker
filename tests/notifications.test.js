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

    // Valid pair returns no error
    const result = validatePair('stop1', 'Red', 0, []);
    assert.strictEqual(result.error, undefined, 'Valid pair should have no error');

    // Cross-route pairs allowed
    const existingRedPair = [{ id: 'p1', checkpointStopId: 'red-stop-1', routeId: 'Red', directionId: 0 }];
    const crossRoute = validatePair('green-stop-1', 'Green-D', 0, existingRedPair);
    assert.strictEqual(crossRoute.error, undefined, 'Cross-route pairs should be allowed');

    // 6th pair rejected
    const fivePairs = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
    const full = validatePair('stop1', 'Red', 0, fivePairs);
    assert.strictEqual(full.error, 'Maximum 5 notification pairs configured', '6th pair should be rejected');

    // Duplicate pair (same stop + route + direction) rejected
    const existingPair = [{ id: 'p1', checkpointStopId: 'stop1', routeId: 'Red', directionId: 0 }];
    const duplicate = validatePair('stop1', 'Red', 0, existingPair);
    assert.strictEqual(duplicate.error, 'Alert already configured for this stop and direction', 'Duplicate pair should be rejected');

    // Same stop + route but different direction is allowed
    const diffDir = validatePair('stop1', 'Red', 1, existingPair);
    assert.strictEqual(diffDir.error, undefined, 'Same stop+route with different direction should be allowed');

    // Same stop + direction but different route is allowed
    const diffRoute = validatePair('stop1', 'Green-B', 0, existingPair);
    assert.strictEqual(diffRoute.error, undefined, 'Same stop+direction with different route should be allowed');

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

    // Adding first pair succeeds
    const result1 = await addNotificationPair('stop1', 'Red', 0);
    assert(result1.pair, 'Should return a pair object');
    assert.strictEqual(result1.pair.checkpointStopId, 'stop1', 'Checkpoint should match');
    assert.strictEqual(result1.pair.routeId, 'Red', 'Route should match');
    assert.strictEqual(result1.pair.directionId, 0, 'Direction should match');
    assert(result1.pair.id, 'Should generate an ID');
    assert.strictEqual(result1.pair.myStopId, undefined, 'Should not have myStopId (old field removed)');
    assert.strictEqual(result1.pair.learnedDirectionId, undefined, 'Should not have learnedDirectionId (old field removed)');

    // Add 4 more pairs to reach limit (different stops/routes/directions)
    await addNotificationPair('stop2', 'Green-D', 0);
    await addNotificationPair('stop3', 'Blue', 1);
    await addNotificationPair('stop4', 'Orange', 0);
    await addNotificationPair('stop5', 'Red', 1);

    // 6th pair rejected
    const result6 = await addNotificationPair('stop99', 'Blue', 0);
    assert.strictEqual(result6.error, 'Maximum 5 notification pairs configured', 'Should reject 6th pair');
    assert(!result6.pair, 'Should not return a pair on rejection');

    // Duplicate pair rejected (fresh state)
    localStorage.clear();
    initNotifications(new EventTarget(), new Map());
    await addNotificationPair('stop1', 'Red', 0);
    const resultDup = await addNotificationPair('stop1', 'Red', 0);
    assert.strictEqual(resultDup.error, 'Alert already configured for this stop and direction', 'Should reject duplicate pair');

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
    const result1 = await addNotificationPair('stop1', 'Red', 0);
    const pairId = result1.pair.id;
    let pairs = getNotificationPairs();
    assert.strictEqual(pairs.length, 1, 'Should have 1 pair after adding');

    // Add 4 more pairs to reach max of 5
    await addNotificationPair('stop2', 'Green-D', 0);
    await addNotificationPair('stop3', 'Blue', 1);
    await addNotificationPair('stop4', 'Orange', 0);
    await addNotificationPair('stop5', 'Red', 1);
    pairs = getNotificationPairs();
    assert.strictEqual(pairs.length, 5, 'Should have 5 pairs (at max)');

    // Remove pair frees slot for new configuration
    const removed = removeNotificationPair(pairId);
    assert.strictEqual(removed, true, 'Should return true on successful removal');
    pairs = getNotificationPairs();
    assert.strictEqual(pairs.length, 4, 'Should have 4 pairs after removal');

    // Can now add a new pair (slot freed)
    const newPair = await addNotificationPair('newCheckpoint', 'Green-D', 1);
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
    await addNotificationPair('stop1', 'Red', 0);

    // Verify it's in localStorage
    const stored = localStorage.getItem('ttracker-notifications-config');
    assert(stored, 'Should store config in localStorage');
    const parsed = JSON.parse(stored);
    assert(Array.isArray(parsed), 'Stored data should be an array');
    assert.strictEqual(parsed.length, 1, 'Should have 1 pair in storage');
    assert.strictEqual(parsed[0].checkpointStopId, 'stop1', 'Stored pair should have correct checkpoint');
    assert.strictEqual(parsed[0].routeId, 'Red', 'Stored pair should have correct route');
    assert.strictEqual(parsed[0].directionId, 0, 'Stored pair should have correct direction');

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

    // Corrupted localStorage data discarded, starts fresh
    localStorage._store['ttracker-notifications-config'] = 'invalid json {[ garbage';
    initNotifications(new EventTarget(), new Map());
    let pairs = getNotificationPairs();
    assert.strictEqual(pairs.length, 0, 'Should have 0 pairs after reading corrupted storage');

    // Adding a pair should now work
    const result = await addNotificationPair('stop1', 'Red', 0);
    assert(result.pair, 'Should successfully add pair after corrupted storage recovery');

    // Non-array JSON
    localStorage.clear();
    localStorage._store['ttracker-notifications-config'] = 'not an array';
    initNotifications(new EventTarget(), new Map());
    pairs = getNotificationPairs();
    assert.strictEqual(pairs.length, 0, 'Should have 0 pairs after reading non-array storage');

    // Adding should work
    const result2 = await addNotificationPair('stop1', 'Red', 0);
    assert(result2.pair, 'Should successfully add pair when stored data is not array');

    console.log('✓ corrupted localStorage handling tests passed');
}

/**
 * Test migration: old-format pairs with myStopId are filtered out on init
 */
function testMigration() {
    localStorage.clear();

    // Store mixed old-format and new-format pairs in localStorage
    localStorage.setItem('ttracker-notifications-config', JSON.stringify([
        { id: 'old1', checkpointStopId: 's1', myStopId: 's2', routeId: 'Red', learnedDirectionId: 0 },
        { id: 'new1', checkpointStopId: 's3', routeId: 'Green-B', directionId: 1 },
        { id: 'old2', checkpointStopId: 's4', myStopId: 's5', routeId: 'Blue', learnedDirectionId: null },
    ]));

    initNotifications(new EventTarget(), new Map());
    const pairs = getNotificationPairs();
    assert.strictEqual(pairs.length, 1, 'Should filter out old-format pairs with myStopId');
    assert.strictEqual(pairs[0].id, 'new1', 'Should keep new-format pair');
    assert.strictEqual(pairs[0].routeId, 'Green-B', 'Kept pair should have correct route');
    assert.strictEqual(pairs[0].directionId, 1, 'Kept pair should have correct direction');

    console.log('✓ migration tests passed');
}

/**
 * Test shouldNotify pure logic function
 */
function testShouldNotify() {
    localStorage.clear();
    initNotifications(new EventTarget(), new Map());

    // Vehicle at checkpoint with correct direction → notify
    const pair1 = {
        id: 'p1',
        checkpointStopId: 'stop-A',
        routeId: 'Red',
        directionId: 0,
    };
    const vehicle = { id: 'v1', stopId: 'stop-A', routeId: 'Red', directionId: 0 };
    assert.strictEqual(shouldNotify(vehicle, pair1, new Set()), true, 'Should notify at checkpoint with correct direction');

    // Vehicle heading opposite direction → don't notify
    const wrongDir = { id: 'v2', stopId: 'stop-A', routeId: 'Red', directionId: 1 };
    assert.strictEqual(shouldNotify(wrongDir, pair1, new Set()), false, 'Should not notify wrong direction');

    // Same vehicle+pair already notified → don't notify
    const notified = new Set(['v1:p1']);
    assert.strictEqual(shouldNotify(vehicle, pair1, notified), false, 'Should not notify same vehicle+pair');

    // Vehicle at wrong stop → don't notify
    const wrongStop = { id: 'v4', stopId: 'stop-C', routeId: 'Red', directionId: 0 };
    assert.strictEqual(shouldNotify(wrongStop, pair1, new Set()), false, 'Should not notify at wrong stop');

    // Vehicle on different route → don't notify
    const wrongRoute = { id: 'v5', stopId: 'stop-A', routeId: 'Green-B', directionId: 0 };
    assert.strictEqual(shouldNotify(wrongRoute, pair1, new Set()), false, 'Should not notify different route');

    // Different vehicle at same checkpoint, same direction → notify
    const vehicle2 = { id: 'v6', stopId: 'stop-A', routeId: 'Red', directionId: 0 };
    assert.strictEqual(shouldNotify(vehicle2, pair1, new Set()), true, 'Should notify different vehicle same checkpoint');

    // Vehicle with null directionId → notify (null doesn't fail direction check)
    const noDir = { id: 'v7', stopId: 'stop-A', routeId: 'Red', directionId: null };
    assert.strictEqual(shouldNotify(noDir, pair1, new Set()), true, 'Should notify when vehicle directionId is null');

    // Bus route
    const busPair = {
        id: 'p5',
        checkpointStopId: 'bus-stop-1',
        routeId: '39',
        directionId: 1,
    };
    const busVehicle = { id: 'bus1', stopId: 'bus-stop-1', routeId: '39', directionId: 1 };
    assert.strictEqual(shouldNotify(busVehicle, busPair, new Set()), true, 'Should notify for bus');
    const busWrong = { id: 'bus2', stopId: 'bus-stop-1', routeId: '39', directionId: 0 };
    assert.strictEqual(shouldNotify(busWrong, busPair, new Set()), false, 'Should not notify bus wrong direction');

    // Commuter Rail
    const crPair = {
        id: 'p6',
        checkpointStopId: 'cr-stop-1',
        routeId: 'CR-Providence',
        directionId: 0,
    };
    const crVehicle = { id: 'cr1', stopId: 'cr-stop-1', routeId: 'CR-Providence', directionId: 0 };
    assert.strictEqual(shouldNotify(crVehicle, crPair, new Set()), true, 'Should notify for commuter rail');
    const crWrong = { id: 'cr2', stopId: 'cr-stop-1', routeId: 'CR-Providence', directionId: 1 };
    assert.strictEqual(shouldNotify(crWrong, crPair, new Set()), false, 'Should not notify CR wrong direction');

    // Terminus exception: terminus checker returns true → direction mismatch ignored
    const terminusPair = {
        id: 'p-terminus',
        checkpointStopId: 'stop-terminus',
        routeId: 'Red',
        directionId: 0,
    };
    const terminusChecker = (stopId, routeId) => stopId === 'stop-terminus' && routeId === 'Red';
    const vehicleWrongDirTerminus = { id: 'v-term', stopId: 'stop-terminus', routeId: 'Red', directionId: 1 };
    assert.strictEqual(
        shouldNotify(vehicleWrongDirTerminus, terminusPair, new Set(), null, terminusChecker),
        true,
        'Terminus exception: should notify despite direction mismatch at terminus'
    );

    // Non-terminus stop with terminus checker: direction still enforced
    const nonTerminusPair = {
        id: 'p-nonterm',
        checkpointStopId: 'stop-mid',
        routeId: 'Red',
        directionId: 0,
    };
    const vehicleWrongDirMid = { id: 'v-mid', stopId: 'stop-mid', routeId: 'Red', directionId: 1 };
    assert.strictEqual(
        shouldNotify(vehicleWrongDirMid, nonTerminusPair, new Set(), null, terminusChecker),
        false,
        'Non-terminus: should not notify direction mismatch even with terminus checker present'
    );

    // currentStatus filtering: STOPPED_AT and INCOMING_AT trigger; IN_TRANSIT_TO does not
    const stoppedVehicle = { id: 'v-stopped', stopId: 'stop-A', routeId: 'Red', directionId: 0, currentStatus: 'STOPPED_AT' };
    assert.strictEqual(shouldNotify(stoppedVehicle, pair1, new Set()), true, 'STOPPED_AT should trigger notification');

    const incomingVehicle = { id: 'v-incoming', stopId: 'stop-A', routeId: 'Red', directionId: 0, currentStatus: 'INCOMING_AT' };
    assert.strictEqual(shouldNotify(incomingVehicle, pair1, new Set()), true, 'INCOMING_AT should trigger notification (within braking distance)');

    const inTransitVehicle = { id: 'v-transit', stopId: 'stop-A', routeId: 'Red', directionId: 0, currentStatus: 'IN_TRANSIT_TO' };
    assert.strictEqual(shouldNotify(inTransitVehicle, pair1, new Set()), false, 'IN_TRANSIT_TO should NOT trigger notification');

    // Vehicle with no currentStatus (legacy/fallback) → still notify
    const noStatusVehicle = { id: 'v-nostatus', stopId: 'stop-A', routeId: 'Red', directionId: 0 };
    assert.strictEqual(shouldNotify(noStatusVehicle, pair1, new Set()), true, 'No currentStatus should still trigger (backward compat)');

    // shouldNotify does NOT mutate pair (pure function, no side effects)
    const immutablePair = {
        id: 'p-immutable',
        checkpointStopId: 'stop-A',
        routeId: 'Red',
        directionId: 0,
    };
    const pairBefore = JSON.stringify(immutablePair);
    shouldNotify({ id: 'v-imm', stopId: 'stop-A', routeId: 'Red', directionId: 0 }, immutablePair, new Set());
    assert.strictEqual(JSON.stringify(immutablePair), pairBefore, 'shouldNotify should not mutate pair object');

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
        routeId: 'Red',
        directionId: 0,
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
    assert.strictEqual(
        shouldNotify(vehicleAtOtherChild, pair, new Set(), stopsData),
        true,
        'Should notify for other child stop of same parent station'
    );

    // Vehicle at unrelated child stop should NOT match
    const vehicleAtPorter = { id: 'v-porter', stopId: '70065', routeId: 'Red', directionId: 0 };
    assert.strictEqual(
        shouldNotify(vehicleAtPorter, pair, new Set(), stopsData),
        false,
        'Should not notify when child stop parent is different station'
    );

    // Without stopsData (backward compat), only exact match works
    const vehicleExactMatch = { id: 'v-exact', stopId: 'place-davis', routeId: 'Red', directionId: 0 };
    assert.strictEqual(
        shouldNotify(vehicleExactMatch, pair, new Set()),
        true,
        'Should still match exact stop IDs without stopsData'
    );
    assert.strictEqual(
        shouldNotify(vehicleAtChild, { ...pair, id: 'p-nodata' }, new Set()),
        false,
        'Should not resolve parent without stopsData'
    );

    console.log('✓ shouldNotify parent stop resolution tests passed');
}

/**
 * Test permission handling
 */
async function testPermissionHandling() {
    // Mock Notification API
    globalThis.Notification = {
        permission: 'default',
        requestPermission: async function() {
            this.permission = 'granted';
            return 'granted';
        },
    };

    // getPermissionState returns current permission
    let state = getPermissionState();
    assert.strictEqual(state, 'default', 'Initial permission should be default');

    // After permission granted, state reflects it
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

    // First pair should return permissionState
    const result = await addNotificationPair('stop1-async', 'Red', 0);
    assert(result.pair, 'Should return a pair object');
    assert.strictEqual(result.permissionState, 'granted', 'Should return permissionState');

    // Verify pair was saved
    const pairs = getNotificationPairs();
    assert.strictEqual(pairs.length, 1, 'Pair should be saved');

    console.log('✓ async addNotificationPair tests passed');
}

/**
 * Test localStorage quota exceeded handling
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
        const result = await addNotificationPair('stop1', 'Red', 0);
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

    // Paused stops notifications
    pauseNotifications();
    assert.strictEqual(isPaused(), true, 'isPaused() should return true after pauseNotifications()');

    // Resume re-enables
    resumeNotifications();
    assert.strictEqual(isPaused(), false, 'isPaused() should return false after resumeNotifications()');

    // Pairs unchanged after pause/resume cycle
    localStorage.clear();
    localStorage.setItem('ttracker-notifications-config', JSON.stringify([
        { id: 'p1', checkpointStopId: 's1', routeId: 'Red', directionId: 0 }
    ]));
    initNotifications(new EventTarget(), new Map());
    const beforeCount = getNotificationPairs().length;
    pauseNotifications();
    resumeNotifications();
    assert.strictEqual(getNotificationPairs().length, beforeCount, 'Pause/resume should not modify pairs');

    // Persist across simulated reload
    pauseNotifications();
    assert.strictEqual(localStorage.getItem('ttracker-notifications-paused'), 'true', 'localStorage should have true after pause');
    resumeNotifications();
    assert.strictEqual(localStorage.getItem('ttracker-notifications-paused'), 'false', 'localStorage should have false after resume');

    // State persists after simulated reinit
    localStorage.clear();
    pauseNotifications();
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
    testMigration();
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
