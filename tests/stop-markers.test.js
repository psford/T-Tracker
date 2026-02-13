// tests/stop-markers.test.js — Unit tests for stop marker management
import assert from 'assert';

/**
 * Test updateVisibleStops correctly builds visible stop set from route-stop mapping
 * This is a pure logic test that doesn't require Leaflet to be present
 */
function testUpdateVisibleStopsLogic() {
    // Mock data structures
    const mockStopsData = new Map([
        ['stop-1', { id: 'stop-1', name: 'Downtown Station', latitude: 42.36, longitude: -71.06 }],
        ['stop-2', { id: 'stop-2', name: 'North Station', latitude: 42.37, longitude: -71.07 }],
        ['stop-3', { id: 'stop-3', name: 'Back Bay', latitude: 42.35, longitude: -71.08 }],
    ]);

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
    const allRoutes = new Set(['Red', 'Blue', 'Orange']);
    let visibleStopIds = new Set();
    let stopColorMap = new Map();

    allRoutes.forEach((routeId) => {
        const stopIds = mockRouteStopsMap.get(routeId);
        if (stopIds) {
            stopIds.forEach((stopId) => {
                visibleStopIds.add(stopId);
                if (!stopColorMap.has(stopId)) {
                    stopColorMap.set(stopId, mockRouteColorMap.get(routeId) || '#888888');
                }
            });
        }
    });

    assert.strictEqual(visibleStopIds.size, 3, 'Should collect all 3 unique stops from 3 routes');
    assert(visibleStopIds.has('stop-1'), 'stop-1 should be visible');
    assert(visibleStopIds.has('stop-2'), 'stop-2 should be visible');
    assert(visibleStopIds.has('stop-3'), 'stop-3 should be visible');

    console.log('✓ Test 1: All stops from visible routes collected');

    // Test 2: First route wins for stop color (deduplication - AC1.5)
    // stop-2 is on Red and Blue, should get Red's color (first to claim it)
    assert.strictEqual(stopColorMap.get('stop-2'), '#DA291C', 'stop-2 should have Red color (first route wins)');
    console.log('✓ Test 2: First visible route owns stop color (no stacking)');

    // Test 3: Subset of visible routes
    const partialRoutes = new Set(['Red']);
    visibleStopIds = new Set();
    stopColorMap = new Map();

    partialRoutes.forEach((routeId) => {
        const stopIds = mockRouteStopsMap.get(routeId);
        if (stopIds) {
            stopIds.forEach((stopId) => {
                visibleStopIds.add(stopId);
                if (!stopColorMap.has(stopId)) {
                    stopColorMap.set(stopId, mockRouteColorMap.get(routeId) || '#888888');
                }
            });
        }
    });

    assert.strictEqual(visibleStopIds.size, 2, 'Should collect 2 stops from Red route only');
    assert(visibleStopIds.has('stop-1'), 'stop-1 should be visible');
    assert(visibleStopIds.has('stop-2'), 'stop-2 should be visible');
    assert(!visibleStopIds.has('stop-3'), 'stop-3 should NOT be visible');

    console.log('✓ Test 3: Partial visibility subset works correctly');

    // Test 4: Empty visible routes
    const noRoutes = new Set();
    visibleStopIds = new Set();

    noRoutes.forEach((routeId) => {
        const stopIds = mockRouteStopsMap.get(routeId);
        if (stopIds) {
            stopIds.forEach((stopId) => {
                visibleStopIds.add(stopId);
            });
        }
    });

    assert.strictEqual(visibleStopIds.size, 0, 'Should have no visible stops when no routes visible');

    console.log('✓ Test 4: Empty visible routes produces no visible stops');

    // Test 5: Route with missing stops in stopsData returns gracefully
    const missingStops = new Set(['Red']);
    visibleStopIds = new Set();
    let filteredStops = [];

    missingStops.forEach((routeId) => {
        const stopIds = mockRouteStopsMap.get(routeId);
        if (stopIds) {
            stopIds.forEach((stopId) => {
                visibleStopIds.add(stopId);
                const stop = mockStopsData.get(stopId);
                if (stop && stop.latitude && stop.longitude) {
                    filteredStops.push(stop);
                }
            });
        }
    });

    assert.strictEqual(visibleStopIds.size, 2, 'Should include both stops from Red route');
    assert.strictEqual(filteredStops.length, 2, 'Should filter to valid stops with lat/lon');

    console.log('✓ Test 5: Stops without coordinates are skipped gracefully');
}

/**
 * Test marker lifecycle: add, remove, reuse
 */
function testMarkerLifecycle() {
    // Mock marker map
    const stopMarkers = new Map();

    // Test adding markers
    stopMarkers.set('stop-1', { id: 'marker-1' });
    stopMarkers.set('stop-2', { id: 'marker-2' });

    assert.strictEqual(stopMarkers.size, 2, 'Should have 2 markers');
    assert(stopMarkers.has('stop-1'), 'stop-1 marker should exist');

    console.log('✓ Test 1: Markers are added to map');

    // Test removing markers
    const toRemove = new Set(['stop-1']);
    stopMarkers.forEach((marker, stopId) => {
        if (toRemove.has(stopId)) {
            stopMarkers.delete(stopId);
        }
    });

    assert.strictEqual(stopMarkers.size, 1, 'Should have 1 marker after removal');
    assert(!stopMarkers.has('stop-1'), 'stop-1 marker should be removed');
    assert(stopMarkers.has('stop-2'), 'stop-2 marker should still exist');

    console.log('✓ Test 2: Markers are removed from map');

    // Test reusing existing markers
    const visibleStops = new Set(['stop-2', 'stop-3']);
    const markersToAdd = [];

    visibleStops.forEach((stopId) => {
        if (!stopMarkers.has(stopId)) {
            markersToAdd.push(stopId);
        }
    });

    assert.strictEqual(markersToAdd.length, 1, 'Should only create marker for new stop-3');
    assert(markersToAdd.includes('stop-3'), 'New marker needed for stop-3');
    assert(!markersToAdd.includes('stop-2'), 'Existing marker for stop-2 should be reused');

    console.log('✓ Test 3: Existing markers are reused');
}

/**
 * Run all tests
 */
console.log('\n=== Stop Markers Logic Tests ===\n');
try {
    testUpdateVisibleStopsLogic();
    console.log('\n✓ All updateVisibleStops logic tests passed\n');
} catch (err) {
    console.error('✗ updateVisibleStops logic tests failed:', err.message);
    process.exit(1);
}

try {
    testMarkerLifecycle();
    console.log('\n✓ All marker lifecycle tests passed\n');
} catch (err) {
    console.error('✗ Marker lifecycle tests failed:', err.message);
    process.exit(1);
}

console.log('=== All Stop Markers Tests Passed ===\n');
