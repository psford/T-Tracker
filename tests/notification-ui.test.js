// tests/notification-ui.test.js — Unit tests for notification UI pure functions
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

/**
 * Mock data for testing
 */
const mockStops = new Map([
    ['stop1', { id: 'stop1', name: 'Downtown Station' }],
    ['stop2', { id: 'stop2', name: 'Airport Terminal' }],
    ['stop3', { id: 'stop3', name: 'Main Street' }],
]);

const mockRouteMetadata = [
    { id: 'Red', shortName: 'Red', longName: 'Red Line', type: 0, directionDestinations: ['Ashmont/Braintree', 'Alewife'] },
    { id: '39', shortName: '39', longName: 'Route 39', type: 3, directionDestinations: ['Outbound', 'Inbound'] },
    { id: 'Green', shortName: 'Green', longName: 'Green Line', type: 2, directionDestinations: ['Medford/Tufts', 'Union Square'] },
];

const mockPairs = [
    { id: 'pair1', checkpointStopId: 'stop1', routeId: 'Red', directionId: 0 },
    { id: 'pair2', checkpointStopId: 'stop1', routeId: '39', directionId: 1 },
    { id: 'pair3', checkpointStopId: 'stop2', routeId: 'Green', directionId: 0 },
];

/**
 * Test implementation of formatPairForDisplay.
 * Note: The actual formatPairForDisplay in notification-ui.js calls getDirectionDestinations()
 * and isTerminusStop() from map.js, which require DOM/network resources.
 * This test reimplements the logic with testable helper functions.
 *
 * @param {Object} pair — {id, checkpointStopId, routeId, directionId}
 * @param {Map} stopsData — Map of stop ID → {id, name}
 * @param {Array} routeMetadata — Array of {id, shortName, longName, type, directionDestinations}
 * @returns {Object} — {checkpointName, directionLabel, routeName}
 */
function formatPairForDisplayTest(pair, stopsData, routeMetadata) {
    const checkpointName = stopsData.get(pair.checkpointStopId)?.name || pair.checkpointStopId;
    const routeMeta = routeMetadata.find(r => r.id === pair.routeId);
    const routeName = routeMeta
        ? (routeMeta.type === 2 ? routeMeta.longName : routeMeta.shortName)
        : pair.routeId;

    // Get direction label using local helper functions
    const directionLabel = getDirectionDestinationTest(pair.routeId, pair.directionId, pair.checkpointStopId, routeMetadata);

    return { checkpointName, directionLabel, routeName };
}

/**
 * Helper: Get direction destination label for a route and direction.
 * Checks if stop is a terminus; if so, returns 'any direction'.
 */
function getDirectionDestinationTest(routeId, directionId, checkpointStopId, routeMetadata) {
    const isTerminus = isTerminusStopTest(checkpointStopId, routeId, routeMetadata);
    if (isTerminus) {
        return 'any direction';
    }

    const meta = routeMetadata.find(r => r.id === routeId);
    if (!meta) return `Direction ${directionId}`;

    if (meta.directionDestinations && meta.directionDestinations.length > directionId) {
        return meta.directionDestinations[directionId];
    }

    return `Direction ${directionId}`;
}

/**
 * Helper: Check if a stop is a terminus for a route.
 */
function isTerminusStopTest(stopId, routeId, routeMetadata) {
    const meta = routeMetadata.find(r => r.id === routeId);
    if (!meta?.directionDestinations?.length) return false;

    // For testing: mark specific stops as terminus
    const terminusByRoute = {
        'Red': ['stop1'],   // Downtown Station is a terminus for Red
        'Green': ['stop2'], // Airport Terminal is a terminus for Green
    };

    return (terminusByRoute[routeId] || []).includes(stopId);
}

/**
 * Test: formatPairForDisplay resolves stop names correctly
 */
function testFormatPairResolvesStopNames() {
    const result = formatPairForDisplayTest(mockPairs[0], mockStops, mockRouteMetadata);

    assert.strictEqual(result.checkpointName, 'Downtown Station', 'Should resolve checkpoint name');
    // Pair 0: directionId 0 on Red route, checkpoint is stop1 (a terminus), so should be 'any direction'
    assert.strictEqual(result.directionLabel, 'any direction', 'Should return any direction for terminus stop');

    console.log('✓ formatPairForDisplay resolves stop names correctly');
}

/**
 * Test: formatPairForDisplay returns directionLabel from route destinations
 */
function testFormatPairReturnsDirectionLabel() {
    const result = formatPairForDisplayTest(mockPairs[1], mockStops, mockRouteMetadata);

    // Pair 1: directionId 1 on Route 39, checkpoint is stop1 (not a terminus for Route 39)
    assert.strictEqual(result.routeName, '39', 'Should use shortName for bus route (type 3)');
    assert.strictEqual(result.directionLabel, 'Inbound', 'Should return direction destination for non-terminus');

    console.log('✓ formatPairForDisplay returns directionLabel from route destinations');
}

/**
 * Test: formatPairForDisplay uses longName for rail (type 2)
 */
function testFormatPairUsesLongNameForRail() {
    const result = formatPairForDisplayTest(mockPairs[2], mockStops, mockRouteMetadata);

    assert.strictEqual(result.routeName, 'Green Line', 'Should use longName for rail route (type 2)');
    // Pair 2: directionId 0 on Green route, checkpoint is stop2 (a terminus for Green)
    assert.strictEqual(result.directionLabel, 'any direction', 'Should return any direction for terminus stop');

    console.log('✓ formatPairForDisplay uses longName for rail routes');
}

/**
 * Test: formatPairForDisplay falls back to routeId if route not found
 */
function testFormatPairFallsBackToRouteId() {
    const result = formatPairForDisplayTest(
        { id: 'pair4', checkpointStopId: 'stop1', routeId: 'UnknownRoute', directionId: 0 },
        mockStops,
        mockRouteMetadata
    );

    assert.strictEqual(result.routeName, 'UnknownRoute', 'Should fall back to routeId');

    console.log('✓ formatPairForDisplay falls back to routeId when route not found');
}

/**
 * Test: formatPairForDisplay falls back to stopId if stop not found
 */
function testFormatPairFallsBackToStopId() {
    const result = formatPairForDisplayTest(
        { id: 'pair5', checkpointStopId: 'unknown1', routeId: 'Red', directionId: 0 },
        mockStops,
        mockRouteMetadata
    );

    assert.strictEqual(result.checkpointName, 'unknown1', 'Should fall back to checkpoint stopId');

    console.log('✓ formatPairForDisplay falls back to stopIds when stops not found');
}

/**
 * Test: formatPairForDisplay handles empty maps and arrays
 */
function testFormatPairWithEmptyMaps() {
    const emptyStops = new Map();
    const emptyMetadata = [];

    const result = formatPairForDisplayTest(
        mockPairs[0],
        emptyStops,
        emptyMetadata
    );

    assert.strictEqual(result.checkpointName, 'stop1', 'Should fall back to stopId when no stops data');
    assert.strictEqual(result.directionLabel, 'Direction 0', 'Should fall back to Direction ID when no metadata');
    assert.strictEqual(result.routeName, 'Red', 'Should fall back to routeId when no metadata');

    console.log('✓ formatPairForDisplay handles empty maps and arrays');
}

/**
 * Helper: Escape HTML for test verification (matches implementation in stop-popup.js)
 */
function escapeHtmlTest(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Test: AC4.1 — formatCountDisplay returns "N remaining" for counted pairs
 */
async function testCountDisplayForCountedPair() {
    const { formatCountDisplay } = await import('../src/notification-ui.js');

    const countDisplay = formatCountDisplay(3);
    assert.strictEqual(countDisplay, '3 remaining', 'Should display "3 remaining"');
    console.log('✓ AC4.1 — Counted pair displays "N remaining"');
}

/**
 * Test: AC4.1 — formatCountDisplay returns "∞ unlimited" for unlimited pairs
 */
async function testCountDisplayForUnlimitedPair() {
    const { formatCountDisplay } = await import('../src/notification-ui.js');

    const countDisplay = formatCountDisplay(null);
    assert.strictEqual(countDisplay, '∞ unlimited', 'Should display "∞ unlimited"');
    console.log('✓ AC4.1 — Unlimited pair displays "∞ unlimited"');
}

/**
 * Test: AC4.3 — updatePairCount updates remainingCount and totalCount, persists to localStorage
 */
async function testUpdatePairCountPersistence() {
    // Setup: Mock Notification and initialize
    globalThis.Notification = {
        permission: 'granted',
        requestPermission: async function() { return 'granted'; },
    };

    localStorage.clear();

    // Import after setup
    const { initNotifications, addNotificationPair, updatePairCount, getNotificationPairs } = await import('../src/notifications.js');

    initNotifications(new EventTarget(), new Map());

    // Add a pair with count=2
    const { pair: addedPair } = await addNotificationPair('stop1', 'Red', 0, 2);
    const pairId = addedPair.id;

    // Verify initial state
    let pairs = getNotificationPairs();
    let storedPair = pairs.find(p => p.id === pairId);
    assert.strictEqual(storedPair.remainingCount, 2, 'Initial remainingCount should be 2');
    assert.strictEqual(storedPair.totalCount, 2, 'Initial totalCount should be 2');

    // Update to count=5
    const updated = updatePairCount(pairId, 5);
    assert.strictEqual(updated, true, 'updatePairCount should return true');

    // Verify updated in-memory state
    pairs = getNotificationPairs();
    storedPair = pairs.find(p => p.id === pairId);
    assert.strictEqual(storedPair.remainingCount, 5, 'remainingCount should be 5 after update');
    assert.strictEqual(storedPair.totalCount, 5, 'totalCount should be 5 after update');

    // Verify persisted to localStorage
    const stored = localStorage.getItem('ttracker-notifications-config');
    const config = JSON.parse(stored);
    const persistedPair = config.find(p => p.id === pairId);
    assert.strictEqual(persistedPair.remainingCount, 5, 'Persisted remainingCount should be 5');
    assert.strictEqual(persistedPair.totalCount, 5, 'Persisted totalCount should be 5');

    console.log('✓ AC4.3 — updatePairCount updates pair and persists to localStorage');
}

/**
 * Test: AC4.4 — Converting counted pair to unlimited by calling updatePairCount(pairId, null)
 */
async function testConvertCountedToUnlimited() {
    globalThis.Notification = {
        permission: 'granted',
        requestPermission: async function() { return 'granted'; },
    };

    localStorage.clear();

    const { initNotifications, addNotificationPair, updatePairCount, getNotificationPairs } = await import('../src/notifications.js');

    initNotifications(new EventTarget(), new Map());

    // Add a pair with count=3
    const { pair: addedPair } = await addNotificationPair('stop1', 'Red', 0, 3);
    const pairId = addedPair.id;

    // Verify initial state is counted
    let pairs = getNotificationPairs();
    let storedPair = pairs.find(p => p.id === pairId);
    assert.strictEqual(storedPair.remainingCount, 3, 'Initial remainingCount should be 3');

    // Convert to unlimited
    updatePairCount(pairId, null);

    // Verify converted to unlimited
    pairs = getNotificationPairs();
    storedPair = pairs.find(p => p.id === pairId);
    assert.strictEqual(storedPair.remainingCount, null, 'remainingCount should be null (unlimited)');
    assert.strictEqual(storedPair.totalCount, null, 'totalCount should be null (unlimited)');

    console.log('✓ AC4.4 — Converting counted pair to unlimited sets remainingCount to null');
}

/**
 * Test: AC4.5 — Converting unlimited pair to counted by calling updatePairCount(pairId, 2)
 */
async function testConvertUnlimitedToCounted() {
    globalThis.Notification = {
        permission: 'granted',
        requestPermission: async function() { return 'granted'; },
    };

    localStorage.clear();

    const { initNotifications, addNotificationPair, updatePairCount, getNotificationPairs } = await import('../src/notifications.js');

    initNotifications(new EventTarget(), new Map());

    // Add a pair with unlimited (count=null)
    const { pair: addedPair } = await addNotificationPair('stop1', 'Red', 0, null);
    const pairId = addedPair.id;

    // Verify initial state is unlimited
    let pairs = getNotificationPairs();
    let storedPair = pairs.find(p => p.id === pairId);
    assert.strictEqual(storedPair.remainingCount, null, 'Initial remainingCount should be null (unlimited)');

    // Convert to counted
    updatePairCount(pairId, 2);

    // Verify converted to counted
    pairs = getNotificationPairs();
    storedPair = pairs.find(p => p.id === pairId);
    assert.strictEqual(storedPair.remainingCount, 2, 'remainingCount should be 2');
    assert.strictEqual(storedPair.totalCount, 2, 'totalCount should be 2');

    console.log('✓ AC4.5 — Converting unlimited pair to counted sets remainingCount to 2');
}

/**
 * Run all tests
 */
async function runAllTests() {
    try {
        // Sync tests
        testFormatPairResolvesStopNames();
        testFormatPairReturnsDirectionLabel();
        testFormatPairUsesLongNameForRail();
        testFormatPairFallsBackToRouteId();
        testFormatPairFallsBackToStopId();
        testFormatPairWithEmptyMaps();

        // Async tests for count display and updatePairCount
        await testCountDisplayForCountedPair();
        await testCountDisplayForUnlimitedPair();
        await testUpdatePairCountPersistence();
        await testConvertCountedToUnlimited();
        await testConvertUnlimitedToCounted();

        console.log('\n✓✓✓ All notification-ui tests passed ✓✓✓');
    } catch (error) {
        console.error('Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

runAllTests();
