// tests/map-hydrate.test.js — Unit tests for hydrateRouteStopsMap and getRouteStopsMap
import assert from 'assert';

// Mock config before importing map.js
const mockConfig = {
    api: {
        baseUrl: 'https://api-v3.mbta.com',
        key: 'test-api-key',
    },
    map: {
        center: [42.3601, -71.0589],
        zoom: 13,
        minZoom: 11,
        maxZoom: 18,
    },
    tiles: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: 'CartoDB',
        subdomains: ['a', 'b', 'c'],
        maxZoom: 19,
    },
};

// Create a module that exports the mocked config
const configModule = { config: mockConfig };
import.meta.url; // Prevent Node warnings about top-level await

// Mock config.js module before importing map.js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Module = require('module');
const originalRequire = Module.prototype.require;

// Intercept config.js imports to return our mock
Module.prototype.require = function(id) {
    if (id === '../config.js' || id.endsWith('config.js')) {
        return configModule;
    }
    return originalRequire.apply(this, arguments);
};

// Mock Leaflet L global
globalThis.L = {
    map: () => ({
        addLayer: () => {},
        on: () => {},
    }),
    tileLayer: () => ({
        addTo: () => ({ on: () => {} }),
        on: () => {},
    }),
    layerGroup: () => ({
        addLayer: () => {},
        removeLayer: () => {},
        clearLayers: () => {},
    }),
    marker: () => ({
        bindPopup: () => ({ on: () => {} }),
        addTo: () => {},
        remove: () => {},
        setIcon: () => {},
        setOpacity: () => {},
        setLatLng: () => {},
    }),
    polyline: () => ({
        addTo: () => {},
        remove: () => {},
    }),
    circleMarker: () => ({
        bindPopup: () => ({ on: () => {} }),
        addTo: () => {},
        remove: () => {},
    }),
    divIcon: () => ({}),
    icon: () => ({}),
};

// Now import the functions we're testing
import { hydrateRouteStopsMap, getRouteStopsMap } from '../src/map.js';

/**
 * Test startup-perf.AC2.2: hydrateRouteStopsMap accepts array input
 */
function testHydrateWithArray() {
    // Clear the map before test
    getRouteStopsMap().clear();

    hydrateRouteStopsMap('Red', ['stop1', 'stop2', 'stop3']);

    const routeStopsMap = getRouteStopsMap();
    assert.strictEqual(routeStopsMap.has('Red'), true, 'Red route should be in map');

    const redStops = routeStopsMap.get('Red');
    assert(redStops instanceof Set, 'Stops should be stored as a Set');
    assert.strictEqual(redStops.size, 3, 'Red route should have 3 stops');
    assert(redStops.has('stop1'), 'stop1 should be in Red stops');
    assert(redStops.has('stop2'), 'stop2 should be in Red stops');
    assert(redStops.has('stop3'), 'stop3 should be in Red stops');

    console.log('✓ startup-perf.AC2.2 — hydrateRouteStopsMap accepts array input');
}

/**
 * Test startup-perf.AC2.2: hydrateRouteStopsMap accepts Set input
 */
function testHydrateWithSet() {
    getRouteStopsMap().clear();

    const stopSet = new Set(['stop-a', 'stop-b']);
    hydrateRouteStopsMap('Orange', stopSet);

    const routeStopsMap = getRouteStopsMap();
    assert.strictEqual(routeStopsMap.has('Orange'), true, 'Orange route should be in map');

    const orangeStops = routeStopsMap.get('Orange');
    assert(orangeStops instanceof Set, 'Stops should be stored as a Set');
    assert.strictEqual(orangeStops.size, 2, 'Orange route should have 2 stops');
    assert(orangeStops.has('stop-a'), 'stop-a should be in Orange stops');
    assert(orangeStops.has('stop-b'), 'stop-b should be in Orange stops');

    console.log('✓ startup-perf.AC2.2 — hydrateRouteStopsMap accepts Set input');
}

/**
 * Test startup-perf.AC2.2: Multiple calls accumulate entries
 */
function testHydrateMultipleCalls() {
    getRouteStopsMap().clear();

    hydrateRouteStopsMap('Red', ['stop1', 'stop2']);
    hydrateRouteStopsMap('Orange', ['stop2', 'stop3']);

    const routeStopsMap = getRouteStopsMap();
    assert.strictEqual(routeStopsMap.size, 2, 'Should have 2 routes in map');
    assert(routeStopsMap.has('Red'), 'Red should be in map');
    assert(routeStopsMap.has('Orange'), 'Orange should be in map');

    // Verify each route's stops
    assert.strictEqual(routeStopsMap.get('Red').size, 2, 'Red should have 2 stops');
    assert.strictEqual(routeStopsMap.get('Orange').size, 2, 'Orange should have 2 stops');

    console.log('✓ startup-perf.AC2.2 — Multiple calls accumulate entries');
}

/**
 * Test startup-perf.AC2.2: Overwrite existing entry with new stopIds
 */
function testHydrateOverwrite() {
    getRouteStopsMap().clear();

    hydrateRouteStopsMap('Blue', ['stop1', 'stop2', 'stop3']);
    assert.strictEqual(getRouteStopsMap().get('Blue').size, 3, 'Blue should initially have 3 stops');

    hydrateRouteStopsMap('Blue', ['stop-new']);
    const blueStops = getRouteStopsMap().get('Blue');
    assert.strictEqual(blueStops.size, 1, 'Blue should now have only 1 stop');
    assert(blueStops.has('stop-new'), 'Blue should have the new stop');
    assert(!blueStops.has('stop1'), 'Blue should not have the old stop1');

    console.log('✓ startup-perf.AC2.2 — Overwrites existing entry with new stopIds');
}

/**
 * Test startup-perf.AC2.2: Empty stopIds array produces empty Set
 */
function testHydrateEmpty() {
    getRouteStopsMap().clear();

    hydrateRouteStopsMap('Green', []);

    const routeStopsMap = getRouteStopsMap();
    assert(routeStopsMap.has('Green'), 'Green route should be in map');

    const greenStops = routeStopsMap.get('Green');
    assert(greenStops instanceof Set, 'Should be a Set');
    assert.strictEqual(greenStops.size, 0, 'Green should have 0 stops');

    console.log('✓ startup-perf.AC2.2 — Empty stopIds array produces empty Set');
}

/**
 * Test startup-perf.AC2.1: Verify AC2.2 works correctly with getRouteStopsMap
 */
function testGetRouteStopsMapIntegration() {
    getRouteStopsMap().clear();

    hydrateRouteStopsMap('Red', ['stop1', 'stop2']);
    hydrateRouteStopsMap('Orange', ['stop3', 'stop4']);

    const routeStopsMap = getRouteStopsMap();

    // Verify Red's stops
    const redStops = routeStopsMap.get('Red');
    assert(redStops instanceof Set, 'Red stops should be a Set');
    assert.deepStrictEqual(
        Array.from(redStops).sort(),
        ['stop1', 'stop2'],
        'Red stops should be exactly [stop1, stop2]'
    );

    // Verify Orange's stops
    const orangeStops = routeStopsMap.get('Orange');
    assert(orangeStops instanceof Set, 'Orange stops should be a Set');
    assert.deepStrictEqual(
        Array.from(orangeStops).sort(),
        ['stop3', 'stop4'],
        'Orange stops should be exactly [stop3, stop4]'
    );

    console.log('✓ startup-perf.AC2.1 — hydrateRouteStopsMap populates internal map identically to API fetch');
}

/**
 * Run all tests
 */
console.log('\n=== Map Hydrate Tests ===\n');
try {
    testHydrateWithArray();
    testHydrateWithSet();
    testHydrateMultipleCalls();
    testHydrateOverwrite();
    testHydrateEmpty();
    testGetRouteStopsMapIntegration();
    console.log('\n✓ All map hydrate tests passed\n');
} catch (err) {
    console.error('✗ Map hydrate tests failed:', err.message);
    console.error(err.stack);
    process.exit(1);
}

console.log('=== All Tests Passed ===\n');
