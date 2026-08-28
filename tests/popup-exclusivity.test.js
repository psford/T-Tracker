// tests/popup-exclusivity.test.js — only one popup may be open at a time.
//
// Leaflet's map enforced this for free: opening a popup closed the previous one.
// MapLibre shows any number at once, and the port dropped the invariant without
// anything failing — the cards piled up on the map, three at a time, while every
// test stayed green.
//
// It bites here specifically because markers move or get rebuilt under a cursor that
// is not moving: vehicles are repositioned every animation frame, and stop markers are
// torn down and rebuilt on every route-visibility change. A marker that slides out
// from under a stationary pointer never receives mouseleave, so nothing closes its
// popup. Closing on open is what bounds that.
import assert from 'assert';
import { test } from 'node:test';

const mockConfig = {
    api: { baseUrl: 'https://api-v3.mbta.com', key: 'test-api-key' },
    map: { center: [42.3601, -71.0589], zoom: 13, minZoom: 11, maxZoom: 18 },
    basemap: { kind: 'vector', style: 'https://tiles.example.test/s.json', maxZoom: 18 },
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
    initMap, hydrateRoutes, setVisibleRoutes, createVehicleMarker, removeVehicleMarker,
    registerOpenPopup, closeOpenPopup, forgetOpenPopup, getOpenPopup,
} from '../src/map.js';

function segment(lat = 42.3601, lng = -71.0589, n = 40) {
    return Array.from({ length: n }, (_, i) => [lat + i * 0.001, lng + i * 0.001]);
}

function hoverIn(marker) { marker.element.dispatch('mouseenter'); }
function hoverOut(marker) { marker.element.dispatch('mouseleave'); }

function freshMap() {
    closeOpenPopup();
    mapStub.reset();
    initMap('map');
    hydrateRoutes([{
        id: 'Red', color: '#DA291C', shortName: 'Red', longName: 'Red Line', type: 1,
        directionNames: ['S', 'N'], directionDestinations: ['A', 'B'], polylines: [segment()],
    }]);
    setVisibleRoutes(['Red']);
}

function vehicle(id, updatedAt = 1) {
    return {
        id, routeId: 'Red', latitude: 42.3601, longitude: -71.0589,
        bearing: 0, opacity: 1, updatedAt,
    };
}

test('the registry tracks at most one open popup', () => {
    closeOpenPopup();
    const a = { id: 'a' }, b = { id: 'b' };
    let aClosed = 0, bClosed = 0;

    registerOpenPopup(a, () => { aClosed++; });
    assert.strictEqual(getOpenPopup(), a);

    // Opening b must close a. This is the whole invariant.
    registerOpenPopup(b, () => { bClosed++; });
    assert.strictEqual(aClosed, 1, 'opening a second popup must close the first');
    assert.strictEqual(getOpenPopup(), b);

    closeOpenPopup();
    assert.strictEqual(bClosed, 1);
    assert.strictEqual(getOpenPopup(), null, 'nothing should be left registered');
});

test('a popup that closes on its own does not leave the registry stale', () => {
    closeOpenPopup();
    const p = { id: 'p' };
    let closes = 0;
    registerOpenPopup(p, () => { closes++; });

    forgetOpenPopup(p);            // e.g. the user hit the close button
    assert.strictEqual(getOpenPopup(), null);

    closeOpenPopup();
    assert.strictEqual(closes, 0, 'a popup already closed must not be closed again');
});

test('hovering a second vehicle closes the first one\'s popup', () => {
    freshMap();

    createVehicleMarker(vehicle('v1'));
    const m1 = mapStub.markers[mapStub.markers.length - 1];
    createVehicleMarker(vehicle('v2'));
    const m2 = mapStub.markers[mapStub.markers.length - 1];

    hoverIn(m1);
    assert.strictEqual(m1.getPopup().isOpen(), true, 'first popup should open on hover');

    // The cursor reaches a second vehicle without the first ever seeing mouseleave —
    // exactly what happens when a marker moves out from under a stationary pointer.
    hoverIn(m2);
    assert.strictEqual(m2.getPopup().isOpen(), true, 'second popup should open');
    assert.strictEqual(
        m1.getPopup().isOpen(), false,
        'the first popup must have been closed — two open at once is the reported bug'
    );
});

test('leaving a vehicle marker closes its popup', () => {
    freshMap();
    createVehicleMarker(vehicle('v3'));
    const m = mapStub.markers[mapStub.markers.length - 1];

    hoverIn(m);
    assert.strictEqual(m.getPopup().isOpen(), true);
    hoverOut(m);
    assert.strictEqual(m.getPopup().isOpen(), false, 'mouseleave should close it');
    assert.strictEqual(getOpenPopup(), null, 'and clear the registry');
});

test('removing a vehicle marker does not strand its open popup', () => {
    freshMap();
    createVehicleMarker(vehicle('v4'));
    const m = mapStub.markers[mapStub.markers.length - 1];

    hoverIn(m);
    assert.strictEqual(m.getPopup().isOpen(), true);

    // Route hidden, vehicle gone — but the pointer never left the marker.
    removeVehicleMarker('v4');
    assert.strictEqual(
        m.getPopup().isOpen(), false,
        'a removed marker must take its popup with it, or nothing can ever close it'
    );
    // And the registry must not still be pointing at it. A stale entry makes
    // getOpenPopup() lie about what is on screen, which is how "close the open one"
    // starts closing the wrong one.
    assert.strictEqual(
        getOpenPopup(), null,
        'the registry must be cleared when a popup closes by any route'
    );
});
