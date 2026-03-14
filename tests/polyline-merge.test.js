// tests/polyline-merge.test.js
import assert from 'assert';
import { shouldMergePolylines, mergePolylineSegments } from '../src/polyline-merge.js';

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

// --- mergePolylineSegments tests ---

// Helper: build a line from point A to point B with N vertices
function makeLine(latStart, lngStart, latEnd, lngEnd, n = 11) {
    const coords = [];
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        coords.push({
            lat: latStart + t * (latEnd - latStart),
            lng: lngStart + t * (lngEnd - lngStart),
        });
    }
    return coords;
}

function testCoincidentLinesProduceSingleSegment() {
    // Two identical lines → should merge into exactly 1 segment
    const a = makeNSLine(0);
    const b = makeNSLine(0);
    const segments = mergePolylineSegments(a, b, 20);
    assert.strictEqual(segments.length, 1, `Coincident lines should produce 1 segment, got ${segments.length}`);
    // Merged segment should have roughly same number of vertices as input
    assert.ok(segments[0].length >= 10, 'Merged segment should have ≥10 vertices');
    console.log('✓ Coincident lines produce single merged segment');
}

function testNearbyLinesProduceSingleSegment() {
    // Two parallel lines ~8m apart → should merge into 1 segment (well within 20m threshold)
    const a = makeNSLine(0);
    const b = makeNSLine(0.0001);
    const segments = mergePolylineSegments(a, b, 20);
    assert.strictEqual(segments.length, 1, `Nearby lines should produce 1 segment, got ${segments.length}`);
    // Merged coordinates should be between the two input lines
    const midLng = (-71.060 + -71.060 + 0.0001) / 2;
    const actualLng = segments[0][5].lng;
    assert.ok(Math.abs(actualLng - midLng) < 0.00005,
        'Merged line should be between the two input lines');
    console.log('✓ Nearby parallel lines produce single averaged segment');
}

function testTerminusLoopPreserved() {
    // Simulate Green-E pattern: shared track for most of the route, then one polyline
    // has a terminus loop while the other goes straight.
    //
    // A: straight line from (42.36, -71.06) to (42.35, -71.06), 21 vertices
    // B: same straight line for first 16 vertices, then curves away for last 5
    const a = makeLine(42.36, -71.06, 42.35, -71.06, 21);
    // B shares the first 16 points, then diverges to a loop ~40m east
    const bShared = makeLine(42.36, -71.06, 42.3525, -71.06, 16);
    const bLoop = [
        { lat: 42.3520, lng: -71.0595 },  // ~42m east of A's path
        { lat: 42.3515, lng: -71.0593 },  // ~58m east
        { lat: 42.3510, lng: -71.0596 },  // ~33m east
        { lat: 42.3505, lng: -71.0599 },  // ~8m east (converging back)
        { lat: 42.3500, lng: -71.0600 },  // ~0m (back on A's path)
    ];
    const b = [...bShared, ...bLoop];

    const segments = mergePolylineSegments(a, b, 20);

    // Should produce multiple segments: at least one merged section + divergent sections
    assert.ok(segments.length >= 2,
        `Terminus loop should produce ≥2 segments, got ${segments.length}`);

    // The merged section should cover the shared portion (most of the route)
    const mergedVertexCount = segments.reduce((sum, s) => sum + s.length, 0);
    assert.ok(mergedVertexCount >= 15,
        `Should preserve most vertices, got ${mergedVertexCount}`);

    // At least one segment should contain the loop vertices (far from A's straight path)
    // Check that we have a segment with coordinates east of -71.0597 (the loop area)
    const hasLoopSegment = segments.some(seg =>
        seg.some(pt => pt.lng > -71.0597)
    );
    assert.ok(hasLoopSegment, 'Should have a segment preserving the loop vertices');

    console.log('✓ Terminus loop preserved as separate segment');
}

function testDifferentStreetSectionsPreserved() {
    // Simulate Bus 1 pattern: shared path in the middle, different streets at terminus.
    // Divergent sections need ≥3 vertices (MIN_DIVERGENT_RUN) to survive smoothing.
    //
    // A: straight N-S line, 15 vertices
    // B: diverges at start (4 vertices ~80m east), shared middle (7 vertices), diverges at end (4 vertices ~80m east)
    const a = makeLine(42.36, -71.06, 42.345, -71.06, 15);
    const bStart = [
        { lat: 42.3600, lng: -71.0590 },  // ~83m east
        { lat: 42.3595, lng: -71.0590 },  // ~83m east
        { lat: 42.3590, lng: -71.0591 },  // ~75m east
        { lat: 42.3585, lng: -71.0595 },  // ~42m east (transitioning)
    ];
    const bMiddle = makeLine(42.358, -71.06, 42.352, -71.06, 7);
    const bEnd = [
        { lat: 42.3515, lng: -71.0595 },  // ~42m east (transitioning)
        { lat: 42.3510, lng: -71.0590 },  // ~83m east
        { lat: 42.3505, lng: -71.0590 },  // ~83m east
        { lat: 42.3500, lng: -71.0590 },  // ~83m east
    ];
    const b = [...bStart, ...bMiddle, ...bEnd];

    const segments = mergePolylineSegments(a, b, 20);

    // Should produce multiple segments: merged middle + divergent stubs
    assert.ok(segments.length >= 3,
        `Different-street pattern should produce ≥3 segments, got ${segments.length}`);

    // Should have segments with coordinates near -71.059 (the different-street area)
    const hasDivergentB = segments.some(seg =>
        seg.some(pt => pt.lng > -71.0595)
    );
    assert.ok(hasDivergentB, 'Should preserve B-side different-street segments');

    // Should have a merged segment near the shared middle
    const hasMergedMiddle = segments.some(seg =>
        seg.length >= 5 && seg.every(pt => pt.lng < -71.0595)
    );
    assert.ok(hasMergedMiddle, 'Should have a merged middle segment on the shared path');

    console.log('✓ Different-street sections preserved as separate segments');
}

function testReturnsArrayOfArrays() {
    const a = makeNSLine(0);
    const b = makeNSLine(0.0001);
    const segments = mergePolylineSegments(a, b, 20);
    assert.ok(Array.isArray(segments), 'Should return an array');
    for (const seg of segments) {
        assert.ok(Array.isArray(seg), 'Each segment should be an array');
        for (const pt of seg) {
            assert.ok(typeof pt.lat === 'number', 'Each point should have numeric lat');
            assert.ok(typeof pt.lng === 'number', 'Each point should have numeric lng');
        }
    }
    console.log('✓ Returns array of coordinate arrays');
}

function testSingleVertexSegmentsFiltered() {
    // A single-vertex "segment" can't form a line — should be filtered out
    const a = makeNSLine(0);
    const b = makeNSLine(0);
    const segments = mergePolylineSegments(a, b, 20);
    for (const seg of segments) {
        assert.ok(seg.length >= 2, `Each segment should have ≥2 vertices, got ${seg.length}`);
    }
    console.log('✓ Single-vertex segments filtered out');
}

function runTests() {
    console.log('=== polyline-merge tests ===\n');
    testNearbyLinesMerge();
    testFarLinesDontMerge();
    testCustomThreshold();
    testReversedLinesMerge();
    testCoincidentLines();
    testReturnsBoolean();

    console.log('\n--- mergePolylineSegments tests ---\n');
    testReturnsArrayOfArrays();
    testCoincidentLinesProduceSingleSegment();
    testNearbyLinesProduceSingleSegment();
    testTerminusLoopPreserved();
    testDifferentStreetSectionsPreserved();
    testSingleVertexSegmentsFiltered();

    console.log('\n✓ All polyline-merge tests passed!');
}

try {
    runTests();
} catch (e) {
    console.error('✗ Test failed:', e.message);
    process.exit(1);
}
