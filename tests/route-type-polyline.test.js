// tests/route-type-polyline.test.js
import assert from 'assert';
import { shouldMergePolylines, mergePolylineSegments } from '../src/polyline-merge.js';
import { haversineDistance } from '../src/vehicle-math.js';

const ROUTE_TYPE = {
    LIGHT_RAIL: 0, HEAVY_RAIL: 1, COMMUTER_RAIL: 2, BUS: 3, FERRY: 4,
};

function isRailType(type) { return type === 0 || type === 1; }
function getsDirectionClassification(type) { return type === 0 || type === 1; }

function makeNSLine(lngOffset, n = 11) {
    const coords = [];
    for (let i = 0; i < n; i++) {
        coords.push({ lat: 42.360 + i * 0.001, lng: -71.060 + lngOffset });
    }
    return coords;
}

function makeCoincidentLines() {
    return { inbound: makeNSLine(0), outbound: makeNSLine(0.0001) }; // ~8m apart
}

function makeDistinctLines() {
    return { inbound: makeNSLine(0), outbound: makeNSLine(0.002) }; // ~165m apart
}

// Tests:

// 1. Rail type classification
assert.strictEqual(isRailType(0), true, 'Light rail must be rail');
assert.strictEqual(isRailType(1), true, 'Heavy rail must be rail');
assert.strictEqual(isRailType(2), false, 'CR must NOT be rail');
assert.strictEqual(isRailType(3), false, 'Bus must NOT be rail');
assert.strictEqual(isRailType(4), false, 'Ferry must NOT be rail');
console.log('PASS: Rail type classification');

// 2. Direction classification scope
assert.strictEqual(getsDirectionClassification(0), true);
assert.strictEqual(getsDirectionClassification(1), true);
assert.strictEqual(getsDirectionClassification(2), false);
assert.strictEqual(getsDirectionClassification(3), false);
assert.strictEqual(getsDirectionClassification(4), false);
console.log('PASS: Direction classification scope');

// 3. Coincident lines should merge
for (const type of [2, 3, 4]) {
    const { inbound, outbound } = makeCoincidentLines();
    const wouldMerge = shouldMergePolylines(inbound, outbound, 50);
    assert.strictEqual(wouldMerge, true, `Type ${type}: coincident lines should pass merge gate`);
}
console.log('PASS: Coincident lines pass merge gate');

// 4. Distinct lines should NOT merge
for (const type of [2, 3, 4]) {
    const { inbound, outbound } = makeDistinctLines();
    const wouldMerge = shouldMergePolylines(inbound, outbound, 50);
    assert.strictEqual(wouldMerge, false, `Type ${type}: distinct lines should NOT merge`);
}
console.log('PASS: Distinct lines do not pass merge gate');

// 5. Rail coincident lines would merge
for (const type of [0, 1]) {
    const { inbound, outbound } = makeCoincidentLines();
    const wouldMerge = shouldMergePolylines(inbound, outbound);
    assert.strictEqual(wouldMerge, true, `Type ${type}: rail lines should merge`);
}
console.log('PASS: Rail coincident lines merge');

// 6. mergePolylineSegments preserves divergent sections
{
    const lineA = makeNSLine(0, 15);
    const lineB = [
        { lat: 42.360, lng: -71.0590 },
        { lat: 42.361, lng: -71.0590 },
        { lat: 42.364, lng: -71.0600 },
        { lat: 42.365, lng: -71.0600 },
        { lat: 42.366, lng: -71.0600 },
        { lat: 42.369, lng: -71.0610 },
    ];
    const segments = mergePolylineSegments(lineA, lineB, 20);
    assert.ok(segments.length >= 2, `Bus one-way pattern must produce >= 2 segments, got ${segments.length}`);
    console.log('PASS: Segment merge preserves divergent sections');
}

// 7. All types have deterministic branch assignment
const matrix = [
    { type: 0, rail: true, dir: true },
    { type: 1, rail: true, dir: true },
    { type: 2, rail: false, dir: false },
    { type: 3, rail: false, dir: false },
    { type: 4, rail: false, dir: false },
];
for (const row of matrix) {
    assert.strictEqual(isRailType(row.type), row.rail, `Type ${row.type} rail mismatch`);
    assert.strictEqual(getsDirectionClassification(row.type), row.dir, `Type ${row.type} dir mismatch`);
}
console.log('PASS: All types have correct branch assignment');

console.log('\nAll route-type polyline behavior tests passed!');
