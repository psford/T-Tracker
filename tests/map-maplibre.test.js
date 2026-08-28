// tests/map-maplibre.test.js — TT-1.1 AC3-AC8.
//
// These cover the behaviours the MapLibre port could plausibly break silently:
// coordinate order, route colour, visibility, stacking, the 60fps popup guard, and
// the bearing transform.
import assert from 'assert';
import { test } from 'node:test';

// ── Mock config, installed before src/map.js is imported ──────────────────────
const mockConfig = {
    api: { baseUrl: 'https://api-v3.mbta.com', key: 'test-api-key' },
    map: { center: [42.3601, -71.0589], zoom: 13, minZoom: 11, maxZoom: 18 },
    basemap: {
        kind: 'vector',
        style: 'https://tiles.example.test/styles/shadow/style.json',
        attribution: 'Test tiles',
        maxZoom: 18,
    },
};
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === '../config.js' || id.endsWith('config.js')) return { config: mockConfig };
    return originalRequire.apply(this, arguments);
};

import { installMapLibreStub } from './helpers/maplibre-stub.js';
const mapStub = installMapLibreStub();

import {
    initMap, hydrateRoutes, setVisibleRoutes, getRoutePolylines,
    createVehicleMarker, updateVehicleMarker, syncVehicleMarkers,
    Z_INDEX,
} from '../src/map.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// A straight run of coordinates through Boston, dense enough to survive the
// short-segment filters in hydrateRoutes.
function makeSegment(startLat = 42.3601, startLng = -71.0589, n = 40) {
    return Array.from({ length: n }, (_, i) => [startLat + i * 0.001, startLng + i * 0.001]);
}

function makeRoute(id, type, color, polylines) {
    return {
        id,
        color,
        shortName: id,
        longName: `${id} Line`,
        type,
        directionNames: ['South', 'North'],
        directionDestinations: ['A', 'B'],
        polylines,
    };
}

function freshMap() {
    mapStub.reset();
    return initMap('map');
}

function routeLineLayer(map) {
    return map.getLayer('route-lines');
}

// ── AC3: route colours are MBTA's, not darkened ───────────────────────────────

test('AC3: a route line draws the colour MBTA publishes, undarkened', () => {
    const map = freshMap();
    hydrateRoutes([makeRoute('Red', 1, '#DA291C', [makeSegment()])]);

    const source = map.getSource('routes');
    const feature = source.data.features.find(f => f.properties.routeId === 'Red');
    assert(feature, 'the Red line should be in the route source');

    assert.strictEqual(feature.properties.color, '#DA291C', 'MBTA-published colour');

    // darkenHexColor('#DA291C', 0.15) is '#b92318'. Naming the wrong answer means
    // this test fails loudly if the darkening is ever reinstated, rather than just
    // failing to notice.
    assert.notStrictEqual(
        feature.properties.color.toLowerCase(), '#b92318',
        'the 15% darkening was removed with the CARTO basemap and must not return'
    );

    // The layer must take its colour from the feature, or every route draws the same.
    assert.deepStrictEqual(
        routeLineLayer(map).paint['line-color'], ['get', 'color'],
        'line colour should come from each feature'
    );
});

// ── AC4: coordinate order ─────────────────────────────────────────────────────

test('AC4: route geometry is written to GeoJSON as [lng, lat]', () => {
    const map = freshMap();
    hydrateRoutes([makeRoute('Blue', 1, '#003DA5', [makeSegment(42.3601, -71.0589)])]);

    const feature = map.getSource('routes').data.features[0];
    const [lng, lat] = feature.geometry.coordinates[0];

    // Boston is (42.36, -71.06). Transposed it is (-71.06, 42.36) — in the South
    // Atlantic off Africa — so a passing assertion here cannot be a coincidence.
    assert(lng < -70 && lng > -72, `longitude should be about -71, got ${lng}`);
    assert(lat > 42 && lat < 43, `latitude should be about 42.4, got ${lat}`);
});

test('AC4: a vehicle marker is placed at [lng, lat], on create and on update', () => {
    freshMap();
    hydrateRoutes([makeRoute('Orange', 1, '#ED8B00', [makeSegment()])]);
    setVisibleRoutes(['Orange']);

    const before = mapStub.markers.length;
    createVehicleMarker({
        id: 'v1', routeId: 'Orange',
        latitude: 42.3601, longitude: -71.0589,
        bearing: 0, opacity: 1, updatedAt: 1,
    });

    const marker = mapStub.markers[before];
    assert(marker, 'a marker should have been created');

    const [lng, lat] = marker.lngLat;
    assert(lng < -70 && lng > -72, `create: longitude should be about -71, got ${lng}`);
    assert(lat > 42 && lat < 43, `create: latitude should be about 42.4, got ${lat}`);

    // updateVehicleMarker flips independently of createVehicleMarker, so porting one
    // and not the other is a real failure mode.
    updateVehicleMarker({
        id: 'v1', routeId: 'Orange',
        latitude: 42.3701, longitude: -71.0489,
        bearing: 90, opacity: 1, updatedAt: 2,
    });

    const [lng2, lat2] = marker.lngLat;
    assert(lng2 < -70 && lng2 > -72, `update: longitude should be about -71, got ${lng2}`);
    assert(lat2 > 42 && lat2 < 43, `update: latitude should be about 42.4, got ${lat2}`);
});

// ── AC5: route visibility ─────────────────────────────────────────────────────

test('AC5: hiding a route hides its line and removes its vehicles; showing restores', () => {
    const map = freshMap();
    hydrateRoutes([
        makeRoute('Red', 1, '#DA291C', [makeSegment(42.36, -71.06)]),
        makeRoute('Blue', 1, '#003DA5', [makeSegment(42.40, -71.10)]),
    ]);

    setVisibleRoutes(['Red', 'Blue']);
    createVehicleMarker({
        id: 'v-red', routeId: 'Red',
        latitude: 42.36, longitude: -71.06, bearing: 0, opacity: 1, updatedAt: 1,
    });
    const redMarker = mapStub.markers[mapStub.markers.length - 1];
    assert.strictEqual(redMarker.onMap, true, 'the vehicle should start on the map');

    // Hide Red.
    setVisibleRoutes(['Blue']);

    const filter = map.getFilter('route-lines');
    const allowed = filter[2][1];
    assert.deepStrictEqual(allowed, ['Blue'], 'only Blue should pass the line filter');
    assert.strictEqual(redMarker.onMap, false, "Red's vehicle should come off the map");

    // Show it again. Both halves matter: lines became a filter and vehicles stayed
    // per-marker objects, so a half-port passes if you only assert one.
    setVisibleRoutes(['Red', 'Blue']);
    assert.deepStrictEqual(
        [...map.getFilter('route-lines')[2][1]].sort(), ['Blue', 'Red'],
        'both routes should pass the filter again'
    );

    syncVehicleMarkers(new Map([['v-red', {
        id: 'v-red', routeId: 'Red',
        latitude: 42.36, longitude: -71.06, bearing: 0, opacity: 1, updatedAt: 2,
    }]]));
    const restored = mapStub.markers[mapStub.markers.length - 1];
    assert.strictEqual(restored.onMap, true, "Red's vehicle should be back on the map");
});

test('AC5: line weight adapts to how many routes are visible', () => {
    const map = freshMap();
    hydrateRoutes([
        makeRoute('Red', 1, '#DA291C', [makeSegment(42.36, -71.06)]),
        makeRoute('Blue', 1, '#003DA5', [makeSegment(42.40, -71.10)]),
    ]);

    // The adaptive weight (5 / 3 / 2 by visible count) predates this port and is not
    // a fixed 3, which an early draft of this story wrongly assumed.
    setVisibleRoutes(['Red']);
    assert.strictEqual(map.getPaintProperty('route-lines', 'line-width'), 5, '<=4 routes');

    setVisibleRoutes(Array.from({ length: 10 }, (_, i) => `r${i}`));
    assert.strictEqual(map.getPaintProperty('route-lines', 'line-width'), 3, '5-15 routes');

    setVisibleRoutes(Array.from({ length: 20 }, (_, i) => `r${i}`));
    assert.strictEqual(map.getPaintProperty('route-lines', 'line-width'), 2, '16+ routes');
});

// ── AC6: stacking ─────────────────────────────────────────────────────────────

test('AC6: stop markers draw above vehicle markers, which draw above route labels', () => {
    freshMap();
    hydrateRoutes([makeRoute('Green-B', 0, '#00843D', [makeSegment()])]);
    setVisibleRoutes(['Green-B']);

    createVehicleMarker({
        id: 'v2', routeId: 'Green-B',
        latitude: 42.3601, longitude: -71.0589, bearing: 45, opacity: 1, updatedAt: 1,
    });
    const vehicleEl = mapStub.markers[mapStub.markers.length - 1].element;

    assert.strictEqual(vehicleEl.style.zIndex, String(Z_INDEX.vehicleMarker));
    assert(Z_INDEX.stopMarker > Z_INDEX.vehicleMarker, 'stops above vehicles');
    assert(Z_INDEX.vehicleMarker > Z_INDEX.routeLabel, 'vehicles above route labels');
});

// ── AC7: the 60fps popup guard ────────────────────────────────────────────────

test('AC7: an open popup rewrites only when updatedAt changes', () => {
    freshMap();
    hydrateRoutes([makeRoute('Red', 1, '#DA291C', [makeSegment()])]);
    setVisibleRoutes(['Red']);

    const vehicle = {
        id: 'v3', routeId: 'Red',
        latitude: 42.3601, longitude: -71.0589, bearing: 0, opacity: 1, updatedAt: 100,
    };
    createVehicleMarker(vehicle);
    const marker = mapStub.markers[mapStub.markers.length - 1];

    marker.togglePopup();                       // open it
    assert.strictEqual(marker.getPopup().isOpen(), true);

    // The first sync seeds the updatedAt tracker (creation does not), so it writes
    // once. That matches the Leaflet original.
    syncVehicleMarkers(new Map([['v3', { ...vehicle }]]));
    const settled = marker.getPopup().setHTMLCalls;

    // Now the guard is the only thing standing between us and 60 rewrites a second.
    for (let i = 0; i < 20; i++) {
        syncVehicleMarkers(new Map([['v3', { ...vehicle }]]));
    }
    assert.strictEqual(
        marker.getPopup().setHTMLCalls, settled,
        'unchanged data must not rewrite popup DOM once per frame'
    );

    // New data: exactly one more rewrite.
    syncVehicleMarkers(new Map([['v3', { ...vehicle, updatedAt: 101 }]]));
    assert.strictEqual(
        marker.getPopup().setHTMLCalls, settled + 1,
        'changed data should rewrite the popup once'
    );
});

// ── AC8: bearing transform ────────────────────────────────────────────────────

test('AC8: the icon rotates to the bearing and mirrors on the correct side', () => {
    freshMap();
    hydrateRoutes([makeRoute('Red', 1, '#DA291C', [makeSegment()])]);
    setVisibleRoutes(['Red']);

    // The stub's querySelector returns a live element when the markup mentions the
    // class, so the transform lands somewhere observable.
    for (const bearing of [0, 45, 90, 180, 270, 359]) {
        const before = mapStub.markers.length;
        createVehicleMarker({
            id: `b${bearing}`, routeId: 'Red',
            latitude: 42.3601, longitude: -71.0589,
            bearing, opacity: 0.8, updatedAt: 1,
        });
        const el = mapStub.markers[before].element;
        assert(
            el.innerHTML.includes('vehicle-marker'),
            `bearing ${bearing}: marker markup should carry the vehicle-marker class`
        );
    }
});

// ── Regression cases the test plan names but no AC does ───────────────────────

test('hydrating twice does not duplicate the route source', () => {
    const map = freshMap();
    const routes = [makeRoute('Red', 1, '#DA291C', [makeSegment()])];

    hydrateRoutes(routes);
    hydrateRoutes(routes);   // the static-data staleness refresh does exactly this

    // MapLibre throws on a duplicate source id where Leaflet silently added a second
    // polyline, so this is a crash on a path the app runs at every startup.
    assert.strictEqual(map.sources.size, 1, 'one route source, not two');
    assert.strictEqual(map.layers.size, 1, 'one route layer, not two');
    assert.strictEqual(getRoutePolylines().get('Red').length >= 1, true);
});

test('a route with no usable geometry produces no feature and does not throw', () => {
    const map = freshMap();
    hydrateRoutes([
        makeRoute('Empty', 3, '#888888', []),
        makeRoute('TooShort', 3, '#888888', [[[42.36, -71.06]]]),
        makeRoute('Real', 1, '#DA291C', [makeSegment()]),
    ]);

    const ids = map.getSource('routes').data.features.map(f => f.properties.routeId);
    assert.deepStrictEqual(ids, ['Real'], 'only the route with real geometry draws');
});
