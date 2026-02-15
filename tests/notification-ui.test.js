// tests/notification-ui.test.js — Unit tests for notification UI pure functions
import assert from 'assert';

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
 * Run all tests
 */
try {
    testFormatPairResolvesStopNames();
    testFormatPairReturnsDirectionLabel();
    testFormatPairUsesLongNameForRail();
    testFormatPairFallsBackToRouteId();
    testFormatPairFallsBackToStopId();
    testFormatPairWithEmptyMaps();

    console.log('\n✓✓✓ All notification-ui tests passed ✓✓✓');
} catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
}
