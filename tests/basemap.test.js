// tests/basemap.test.js — TT-1.1 AC2: the basemap provider seam.
//
// The point of these tests is that they are written entirely from outside src/.
// Every descriptor is passed in as an argument. If swapping provider ever required
// editing a file under src/, these tests could not be written at all.
import assert from 'assert';
import { test } from 'node:test';
import { buildBasemapStyle, expandSubdomains, resolveMaxZoom } from '../src/basemap.js';

const SHADOW = {
    kind: 'vector',
    style: 'https://tiles.versatiles.org/assets/styles/shadow/style.json',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
};

test('AC2: a vector descriptor hands MapLibre the style URL it names', () => {
    assert.strictEqual(buildBasemapStyle(SHADOW), SHADOW.style);
});

test('AC2: a raster descriptor becomes a raster style, with no code change', () => {
    const style = buildBasemapStyle({
        kind: 'raster',
        url: 'https://example.test/{z}/{x}/{y}.png',
        attribution: 'Example',
        maxZoom: 16,
    });

    assert.strictEqual(typeof style, 'object', 'raster providers need a style document');
    assert.strictEqual(style.sources.basemap.type, 'raster');
    assert.deepStrictEqual(style.sources.basemap.tiles, ['https://example.test/{z}/{x}/{y}.png']);
    assert.strictEqual(style.sources.basemap.maxzoom, 16);
    assert.strictEqual(style.layers[0].type, 'raster');
    assert.strictEqual(style.layers[0].source, 'basemap');
});

test('AC2: a {s} template expands to one tile URL per subdomain', () => {
    // Leaflet's {s} token has no MapLibre equivalent; MapLibre round-robins tiles[].
    // The old CARTO config used exactly this shape, so a swap back to any Leaflet-era
    // raster provider has to keep working.
    assert.deepStrictEqual(
        expandSubdomains('https://{s}.example.test/{z}/{x}/{y}.png', 'abc'),
        [
            'https://a.example.test/{z}/{x}/{y}.png',
            'https://b.example.test/{z}/{x}/{y}.png',
            'https://c.example.test/{z}/{x}/{y}.png',
        ]
    );

    assert.deepStrictEqual(
        expandSubdomains('https://{s}.example.test/{z}/{x}/{y}.png', ['a', 'b']),
        ['https://a.example.test/{z}/{x}/{y}.png', 'https://b.example.test/{z}/{x}/{y}.png']
    );

    // No {s} means one URL, and subdomains are irrelevant rather than an error.
    assert.deepStrictEqual(
        expandSubdomains('https://example.test/{z}/{x}/{y}.png', 'abc'),
        ['https://example.test/{z}/{x}/{y}.png']
    );
});

test('a {s} template with no subdomains fails loudly rather than requesting {s}.host', () => {
    assert.throws(
        () => expandSubdomains('https://{s}.example.test/{z}/{x}/{y}.png', undefined),
        /subdomains/,
        'silently requesting the literal host "{s}.example.test" is a broken map with no error'
    );
});

test("AC2: the provider's zoom ceiling reaches the map when it is lower than the app's", () => {
    // Esri Dark Gray Canvas stops at z16. Above its ceiling it serves nothing, which
    // reads as a broken map rather than a provider limit — so the provider wins.
    assert.strictEqual(resolveMaxZoom({ kind: 'raster', maxZoom: 16 }, 18), 16);

    // A provider that goes higher than the app wants does not raise the app's limit.
    assert.strictEqual(resolveMaxZoom({ kind: 'raster', maxZoom: 22 }, 18), 18);

    // A provider that states no ceiling leaves the app's preference alone.
    assert.strictEqual(resolveMaxZoom({ kind: 'vector' }, 18), 18);
});

test('a malformed descriptor is refused with a message naming the problem', () => {
    assert.throws(() => buildBasemapStyle(undefined), /config\.basemap is missing/);
    assert.throws(() => buildBasemapStyle({ kind: 'vector' }), /requires a style URL/);
    assert.throws(() => buildBasemapStyle({ kind: 'raster' }), /requires a .* url template/);
    assert.throws(() => buildBasemapStyle({ kind: 'wms' }), /unknown kind "wms"/);
});
