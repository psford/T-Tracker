// tests/stop-markers.test.js — Unit tests for stop marker management
import assert from 'assert';
import { computeVisibleStops } from '../src/stop-markers.js';

/**
 * Test computeVisibleStops correctly builds visible stop set from route-stop mapping
 * This test imports and tests the actual exported function from stop-markers.js
 */
function testComputeVisibleStops() {
    // Mock data structures
    const mockRouteStopsMap = new Map([
        ['Red', new Set(['stop-1', 'stop-2'])],
        ['Blue', new Set(['stop-2', 'stop-3'])],
        ['Orange', new Set(['stop-1', 'stop-3'])],
    ]);

    const mockRouteColorMap = new Map([
        ['Red', '#DA291C'],
        ['Blue', '#003DA5'],
        ['Orange', '#ED8936'],
    ]);

    // Test 1: All stops from all visible routes collected
    let result = computeVisibleStops(['Red', 'Blue', 'Orange'], mockRouteStopsMap, mockRouteColorMap);
    assert.strictEqual(result.visibleStopIds.size, 3, 'Should collect all 3 unique stops from 3 routes');
    assert(result.visibleStopIds.has('stop-1'), 'stop-1 should be visible');
    assert(result.visibleStopIds.has('stop-2'), 'stop-2 should be visible');
    assert(result.visibleStopIds.has('stop-3'), 'stop-3 should be visible');

    console.log('✓ Test 1: All stops from visible routes collected');

    // Test 2: First route wins for stop color (deduplication - AC1.5)
    // stop-2 is on Red and Blue, should get Red's color (first route wins)
    assert.strictEqual(result.stopColorMap.get('stop-2'), '#DA291C', 'stop-2 should have Red color (first route wins)');
    console.log('✓ Test 2: First visible route owns stop color (no stacking)');

    // Test 3: Subset of visible routes
    result = computeVisibleStops(['Red'], mockRouteStopsMap, mockRouteColorMap);
    assert.strictEqual(result.visibleStopIds.size, 2, 'Should collect 2 stops from Red route only');
    assert(result.visibleStopIds.has('stop-1'), 'stop-1 should be visible');
    assert(result.visibleStopIds.has('stop-2'), 'stop-2 should be visible');
    assert(!result.visibleStopIds.has('stop-3'), 'stop-3 should NOT be visible');

    console.log('✓ Test 3: Partial visibility subset works correctly');

    // Test 4: Empty visible routes
    result = computeVisibleStops([], mockRouteStopsMap, mockRouteColorMap);
    assert.strictEqual(result.visibleStopIds.size, 0, 'Should have no visible stops when no routes visible');

    console.log('✓ Test 4: Empty visible routes produces no visible stops');

    // Test 5: Route with no stops
    result = computeVisibleStops(['NonexistentRoute'], mockRouteStopsMap, mockRouteColorMap);
    assert.strictEqual(result.visibleStopIds.size, 0, 'Should handle missing routes gracefully');

    console.log('✓ Test 5: Nonexistent routes handled gracefully');

    // Test 6: Accept Set input (in addition to Array)
    result = computeVisibleStops(new Set(['Red', 'Blue']), mockRouteStopsMap, mockRouteColorMap);
    assert.strictEqual(result.visibleStopIds.size, 3, 'Should accept Set input');
    assert(result.visibleStopIds.has('stop-1'), 'stop-1 should be visible from Red');
    assert(result.visibleStopIds.has('stop-2'), 'stop-2 shared by Red and Blue');
    assert(result.visibleStopIds.has('stop-3'), 'stop-3 should be visible from Blue');

    console.log('✓ Test 6: Set input accepted and processed correctly');
}

/**
 * Run all tests
 */
console.log('\n=== Stop Markers Tests ===\n');
try {
    testComputeVisibleStops();
    console.log('\n✓ All stop markers tests passed\n');
} catch (err) {
    console.error('✗ Stop markers tests failed:', err.message);
    console.error(err.stack);
    process.exit(1);
}

console.log('=== All Tests Passed ===\n');
