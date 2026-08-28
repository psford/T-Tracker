// tests/stylesheet.test.js — the styles must target the renderer the app uses.
//
// This exists because of a real regression: the MapLibre port left every popup and
// control rule in styles.css pointing at .leaflet-* class names that are no longer
// in the DOM. Nothing errored. The rules simply stopped matching, MapLibre's white
// defaults showed through, and the popups went pale — invisible to the unit suite,
// invisible to the network check, invisible to a grep over src/ that never looked
// at the stylesheet.
//
// A dead CSS selector is silent by design, so the only way to catch it is to look.
import assert from 'assert';
import { test } from 'node:test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

test('styles.css has no selectors for a renderer the app no longer loads', () => {
    const dead = [...css.matchAll(/\.leaflet[\w-]*/g)].map(m => m[0]);
    assert.deepStrictEqual(
        [...new Set(dead)], [],
        'these selectors cannot match anything and their styling is silently lost'
    );
});

test('styles.css dresses the popup surfaces MapLibre actually renders', () => {
    // Both popup containers are created in src/; if either loses its styling the
    // popup falls back to MapLibre's white default on a dark map.
    for (const container of ['vehicle-popup-container', 'stop-popup-container']) {
        assert(
            css.includes(`.${container} .maplibregl-popup-content`),
            `${container} must style .maplibregl-popup-content`
        );
        assert(
            css.includes(`.${container} .maplibregl-popup-close-button`),
            `${container} must style .maplibregl-popup-close-button`
        );
    }

    // The tip is a border triangle: which border carries the colour depends on the
    // anchor, so a single rule silently covers only one of the placements.
    for (const anchor of ['top', 'bottom', 'left', 'right']) {
        assert(
            css.includes(`.maplibregl-popup-anchor-${anchor} .maplibregl-popup-tip`),
            `the ${anchor} anchor's tip needs its own border colour`
        );
    }
});

test('the map controls are styled for the dark theme', () => {
    assert(css.includes('.maplibregl-ctrl-group'), 'zoom control needs dark styling');
    assert(css.includes('.maplibregl-ctrl-attrib'), 'attribution needs dark styling');
    // MapLibre's control icons are dark SVGs meant for a white button. On a dark
    // button they vanish, and there is no dark icon set to switch to.
    assert(css.includes('filter: invert(1)'), 'control icons need inverting on dark buttons');
});
