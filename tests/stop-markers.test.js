// tests/stop-markers.test.js — Unit tests for stop marker management
import assert from 'assert';

// Mock Leaflet L global BEFORE importing stop-markers.js
// Following pattern from map-hydrate.test.js
const mockDivIconCalls = [];
const mockMarkerCalls = [];
const mockCircleMarkerCalls = [];

globalThis.L = {
    marker: function(latlng, options) {
        mockMarkerCalls.push({ latlng, options });
        return {
            _latlng: latlng,
            _options: options,
            bindPopup: () => ({ on: () => {} }),
            addTo: () => {},
            remove: () => {},
            setIcon: () => {},
            getElement: () => null,
            on: () => {},
        };
    },
    divIcon: function(options) {
        mockDivIconCalls.push(options);
        return { ...options };
    },
    circleMarker: function(latlng, options) {
        mockCircleMarkerCalls.push({ latlng, options });
        return {};
    },
    layerGroup: () => ({
        addLayer: () => {},
        removeLayer: () => {},
    }),
    polyline: () => ({
        addTo: () => {},
    }),
};

// Mock window.matchMedia for hover detection
globalThis.window = {
    matchMedia: (query) => ({
        matches: false,
        media: query,
        addListener: () => {},
        removeListener: () => {},
    }),
};

// Mock localStorage
globalThis.localStorage = {
    _store: {},
    getItem(key) {
        return this._store[key] || null;
    },
    setItem(key, value) {
        this._store[key] = value;
    },
    removeItem(key) {
        delete this._store[key];
    },
    clear() {
        this._store = {};
    },
};

// Now import the functions we're testing
import { computeVisibleStops, createStopMarker } from '../src/stop-markers.js';

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

    // Test 7: stopRouteMap tracks owning route for each stop
    result = computeVisibleStops(['Red', 'Blue'], mockRouteStopsMap, mockRouteColorMap);
    assert.strictEqual(result.stopRouteMap.get('stop-1'), 'Red', 'stop-1 should be owned by Red');
    assert.strictEqual(result.stopRouteMap.get('stop-2'), 'Red', 'stop-2 should be owned by Red (first route wins)');
    assert.strictEqual(result.stopRouteMap.get('stop-3'), 'Blue', 'stop-3 should be owned by Blue');

    console.log('✓ Test 7: stopRouteMap tracks owning route for polyline snapping');
}

/**
 * Test createStopMarker creates L.marker (not L.circleMarker)
 * Verifies touch-targets.AC1.1 (marker type supports 44px touch target)
 */
function testCreateStopMarkerUsesMarkerNotCircle() {
    mockMarkerCalls.length = 0;
    mockCircleMarkerCalls.length = 0;

    createStopMarker(42.35, -71.06, '#DA291C');

    assert.strictEqual(mockMarkerCalls.length, 1, 'L.marker should be called exactly once');
    assert.strictEqual(mockCircleMarkerCalls.length, 0, 'L.circleMarker should NOT be called');

    console.log('✓ createStopMarker creates L.marker (not L.circleMarker)');
}

/**
 * Test createStopMarker uses correct divIcon config
 * Verifies touch-targets.AC1.1 (44px icon) and AC1.2 (stop-dot class for 12px visual)
 */
function testCreateStopMarkerDivIconConfig() {
    mockDivIconCalls.length = 0;
    mockMarkerCalls.length = 0;

    createStopMarker(42.35, -71.06, '#DA291C');

    assert.strictEqual(mockDivIconCalls.length, 1, 'L.divIcon should be called exactly once');
    const divIconOptions = mockDivIconCalls[0];

    assert.strictEqual(divIconOptions.className, 'stop-marker', 'className should be "stop-marker"');
    assert.deepStrictEqual(divIconOptions.iconSize, [44, 44], 'iconSize should be [44, 44]');
    assert.deepStrictEqual(divIconOptions.iconAnchor, [22, 22], 'iconAnchor should be [22, 22]');

    // Verify HTML contains stop-dot class and style
    assert(divIconOptions.html, 'html property should exist');
    assert(divIconOptions.html.includes('class="stop-dot"'), 'html should contain class="stop-dot"');
    assert(divIconOptions.html.includes('--stop-color: #DA291C'), 'html should contain the color variable');

    console.log('✓ createStopMarker uses correct divIcon config');
}

/**
 * Test createStopMarker assigns stopPane
 * Verifies touch-targets.AC2.1 (stops render above vehicles)
 */
function testCreateStopMarkerAssignsPane() {
    mockMarkerCalls.length = 0;

    createStopMarker(42.35, -71.06, '#003DA5');

    assert.strictEqual(mockMarkerCalls.length, 1, 'L.marker should be called once');
    const markerCall = mockMarkerCalls[0];

    assert(markerCall.options, 'marker options should exist');
    assert.strictEqual(markerCall.options.pane, 'stopPane', 'pane should be "stopPane"');

    console.log('✓ createStopMarker assigns stopPane');
}

/**
 * Test createStopMarker HTML contains stop-dot--configured class structure
 * Verifies touch-targets.AC1.2 (configured visual state CSS contract)
 */
function testCreateStopMarkerHTMLSupportsClassModifier() {
    mockDivIconCalls.length = 0;

    createStopMarker(42.35, -71.06, '#ED8936');

    assert.strictEqual(mockDivIconCalls.length, 1, 'L.divIcon should be called');
    const divIconOptions = mockDivIconCalls[0];
    const html = divIconOptions.html;

    // Verify the HTML structure allows adding stop-dot--configured class
    // The element should be a div with class="stop-dot"
    assert(html.includes('<div class="stop-dot"'), 'html should have div with stop-dot class');
    assert(html.includes('style='), 'html should have inline style for color');

    // Test that the class structure would support .stop-dot--configured
    // by checking the element is structured correctly
    const hasValidStructure = html.includes('class="stop-dot"') && html.includes('style="--stop-color:');
    assert(hasValidStructure, 'HTML structure should support adding stop-dot--configured class');

    console.log('✓ createStopMarker HTML supports class modifier (structural prerequisite for stop-dot--configured)');
}

/**
 * Test createStopMarker returns marker with correct latlng
 */
function testCreateStopMarkerLatLng() {
    mockMarkerCalls.length = 0;

    const lat = 42.3601;
    const lng = -71.0589;
    createStopMarker(lat, lng, '#00843D');

    assert.strictEqual(mockMarkerCalls.length, 1, 'L.marker should be called once');
    const markerCall = mockMarkerCalls[0];

    assert.deepStrictEqual(markerCall.latlng, [lat, lng], 'marker should be created with correct [lat, lng]');

    console.log('✓ createStopMarker returns marker with correct latlng');
}

/**
 * Test createStopMarker with different colors
 */
function testCreateStopMarkerColors() {
    mockDivIconCalls.length = 0;

    const colors = ['#DA291C', '#003DA5', '#ED8936', '#00843D', '#7C878E'];
    colors.forEach(color => {
        mockDivIconCalls.length = 0;
        createStopMarker(42.35, -71.06, color);

        const divIconOptions = mockDivIconCalls[0];
        assert(divIconOptions.html.includes(`--stop-color: ${color}`), `html should contain color ${color}`);
    });

    console.log('✓ createStopMarker works with all MBTA route colors');
}

/**
 * Run all tests
 */
console.log('\n=== Stop Markers Tests ===\n');
try {
    testComputeVisibleStops();
    console.log('');
    testCreateStopMarkerUsesMarkerNotCircle();
    testCreateStopMarkerDivIconConfig();
    testCreateStopMarkerAssignsPane();
    testCreateStopMarkerHTMLSupportsClassModifier();
    testCreateStopMarkerLatLng();
    testCreateStopMarkerColors();
    console.log('\n✓ All stop markers tests passed\n');
} catch (err) {
    console.error('✗ Stop markers tests failed:', err.message);
    console.error(err.stack);
    process.exit(1);
}

console.log('=== All Tests Passed ===\n');
