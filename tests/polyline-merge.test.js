// tests/polyline-merge.test.js
import assert from 'assert';
import { shouldMergePolylines } from '../src/polyline-merge.js';

// Build a N-S line of 11 vertices with a given longitude offset.
// Coordinates span ~1.1km along latitude, suitable for arc-length sampling.
function makeNSLine(lngOffset) {
    const coords = [];
    for (let i = 0; i <= 10; i++) {
        coords.push({ lat: 42.360 + i * 0.001, lng: -71.060 + lngOffset });
    }
    return coords;
}

function testNearbyLinesMerge() {
    // Two N-S lines offset by ~8.3m — well below 50m threshold
    const c1 = makeNSLine(0);
    const c2 = makeNSLine(0.0001);
    assert.strictEqual(shouldMergePolylines(c1, c2), true, 'Lines 8m apart should merge');
    console.log('✓ Nearby parallel lines merge');
}

function testFarLinesDontMerge() {
    // Two N-S lines offset by ~165m — well above 50m threshold
    const c1 = makeNSLine(0);
    const c2 = makeNSLine(0.002);
    assert.strictEqual(shouldMergePolylines(c1, c2), false, 'Lines 165m apart should not merge');
    console.log('✓ Distant parallel lines do not merge');
}

function testCustomThreshold() {
    // Lines ~82.7m apart
    const c1 = makeNSLine(0);
    const c2 = makeNSLine(0.001);
    // Default 50m threshold: should NOT merge
    assert.strictEqual(shouldMergePolylines(c1, c2), false, 'Lines 83m apart should not merge at 50m threshold');
    // Custom 100m threshold: should merge
    assert.strictEqual(shouldMergePolylines(c1, c2, 100), true, 'Lines 83m apart should merge at 100m threshold');
    console.log('✓ Custom threshold respected');
}

function testReversedLinesMerge() {
    // Nearest-vertex check is direction-agnostic: reversed nearby line should still merge
    const c1 = makeNSLine(0);
    const c2 = [...makeNSLine(0.0001)].reverse();
    assert.strictEqual(shouldMergePolylines(c1, c2), true, 'Reversed nearby lines should still merge');
    console.log('✓ Reversed nearby lines merge (nearest-vertex is direction-agnostic)');
}

function testCoincidentLines() {
    // Identical lines: median distance is 0 → always merges
    const c1 = makeNSLine(0);
    const c2 = makeNSLine(0);
    assert.strictEqual(shouldMergePolylines(c1, c2), true, 'Identical (coincident) lines should merge');
    console.log('✓ Coincident lines merge');
}

function testReturnsBoolean() {
    const c1 = makeNSLine(0);
    const c2 = makeNSLine(0.001);
    assert.strictEqual(typeof shouldMergePolylines(c1, c2), 'boolean', 'Return value must be boolean');
    console.log('✓ Returns boolean');
}

function runTests() {
    console.log('=== polyline-merge tests ===\n');
    testNearbyLinesMerge();
    testFarLinesDontMerge();
    testCustomThreshold();
    testReversedLinesMerge();
    testCoincidentLines();
    testReturnsBoolean();
    console.log('\n✓ All polyline-merge tests passed!');
}

try {
    runTests();
} catch (e) {
    console.error('✗ Test failed:', e.message);
    process.exit(1);
}
