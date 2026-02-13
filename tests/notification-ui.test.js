// tests/notification-ui.test.js — Unit tests for notification UI pure functions
import assert from 'assert';
import { formatPairForDisplay } from '../src/notification-ui.js';

/**
 * Mock data for testing
 */
const mockStops = new Map([
    ['stop1', { id: 'stop1', name: 'Downtown Station' }],
    ['stop2', { id: 'stop2', name: 'Airport Terminal' }],
    ['stop3', { id: 'stop3', name: 'Main Street' }],
]);

const mockRouteMetadata = [
    { id: 'Red', shortName: 'Red', longName: 'Red Line', type: 0 },
    { id: '39', shortName: '39', longName: 'Route 39', type: 3 },
    { id: 'Green', shortName: 'Green', longName: 'Green Line', type: 2 },
];

const mockPairs = [
    { id: 'pair1', checkpointStopId: 'stop1', myStopId: 'stop2', routeId: 'Red' },
    { id: 'pair2', checkpointStopId: 'stop1', myStopId: 'stop3', routeId: '39' },
    { id: 'pair3', checkpointStopId: 'stop2', myStopId: 'stop1', routeId: 'Green' },
];

/**
 * Test: formatPairForDisplay resolves stop names correctly
 */
function testFormatPairResolvesStopNames() {
    const result = formatPairForDisplay(mockPairs[0], mockStops, mockRouteMetadata);

    assert.strictEqual(result.checkpointName, 'Downtown Station', 'Should resolve checkpoint name');
    assert.strictEqual(result.destName, 'Airport Terminal', 'Should resolve destination name');

    console.log('✓ formatPairForDisplay resolves stop names correctly');
}

/**
 * Test: formatPairForDisplay uses shortName for non-rail types
 */
function testFormatPairUsesShortNameForBus() {
    const result = formatPairForDisplay(mockPairs[1], mockStops, mockRouteMetadata);

    assert.strictEqual(result.routeName, '39', 'Should use shortName for bus route (type 3)');

    console.log('✓ formatPairForDisplay uses shortName for bus routes');
}

/**
 * Test: formatPairForDisplay uses longName for rail (type 2)
 */
function testFormatPairUsesLongNameForRail() {
    const result = formatPairForDisplay(mockPairs[2], mockStops, mockRouteMetadata);

    assert.strictEqual(result.routeName, 'Green Line', 'Should use longName for rail route (type 2)');

    console.log('✓ formatPairForDisplay uses longName for rail routes');
}

/**
 * Test: formatPairForDisplay falls back to routeId if route not found
 */
function testFormatPairFallsBackToRouteId() {
    const result = formatPairForDisplay(
        { id: 'pair4', checkpointStopId: 'stop1', myStopId: 'stop2', routeId: 'UnknownRoute' },
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
    const result = formatPairForDisplay(
        { id: 'pair5', checkpointStopId: 'unknown1', myStopId: 'unknown2', routeId: 'Red' },
        mockStops,
        mockRouteMetadata
    );

    assert.strictEqual(result.checkpointName, 'unknown1', 'Should fall back to checkpoint stopId');
    assert.strictEqual(result.destName, 'unknown2', 'Should fall back to destination stopId');

    console.log('✓ formatPairForDisplay falls back to stopIds when stops not found');
}

/**
 * Test: formatPairForDisplay handles empty maps and arrays
 */
function testFormatPairWithEmptyMaps() {
    const emptyStops = new Map();
    const emptyMetadata = [];

    const result = formatPairForDisplay(
        mockPairs[0],
        emptyStops,
        emptyMetadata
    );

    assert.strictEqual(result.checkpointName, 'stop1', 'Should fall back to stopId when no stops data');
    assert.strictEqual(result.destName, 'stop2', 'Should fall back to stopId when no stops data');
    assert.strictEqual(result.routeName, 'Red', 'Should fall back to routeId when no metadata');

    console.log('✓ formatPairForDisplay handles empty maps and arrays');
}

/**
 * Run all tests
 */
try {
    testFormatPairResolvesStopNames();
    testFormatPairUsesShortNameForBus();
    testFormatPairUsesLongNameForRail();
    testFormatPairFallsBackToRouteId();
    testFormatPairFallsBackToStopId();
    testFormatPairWithEmptyMaps();

    console.log('\n✓✓✓ All notification-ui tests passed ✓✓✓');
} catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
}
