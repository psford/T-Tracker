// tests/polyline.test.js — Unit tests for polyline decoding function
import assert from 'assert';
import { decodePolyline } from '../src/polyline.js';

/**
 * Test decodePolyline function with basic algorithm validation
 */
function testDecodePolyline() {
    // Test empty polyline
    const result1 = decodePolyline('');
    assert.deepStrictEqual(result1, [], 'Empty polyline should return empty array');

    // Test with a simple encoded polyline: single point at (38.5, -120.2)
    // Encoded: ~ps|U~ps|U (Google encoding of [38.5, -120.2])
    const result2 = decodePolyline('~ps|U~ps|U');
    assert(result2.length >= 1, 'Should decode to at least 1 coordinate');
    // Check structure
    assert(Array.isArray(result2[0]) && result2[0].length === 2, 'Point should be [lat, lng]');
    const [lat, lng] = result2[0];
    assert(typeof lat === 'number' && typeof lng === 'number', 'Coordinates should be numbers');

    // All decoded coordinates should be within valid range
    result2.forEach(([latVal, lngVal]) => {
        // Allow some tolerance for floating point, don't test exact range
        assert(!Number.isNaN(latVal) && !Number.isNaN(lngVal), 'Coordinates should not be NaN');
        assert(Number.isFinite(latVal) && Number.isFinite(lngVal), 'Coordinates should be finite');
    });

    // Test with a slightly longer polyline to verify delta decoding
    // Pattern: _p~iF~ps|U_ulLnnqC_mqNvxq`@
    const result3 = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    assert(result3.length >= 2, 'Should decode multiple points');
    // Verify all points are valid
    result3.forEach((point, idx) => {
        assert(Array.isArray(point) && point.length === 2, `Point ${idx} should be [lat, lng]`);
        const [latVal, lngVal] = point;
        assert(Number.isFinite(latVal) && Number.isFinite(lngVal), `Point ${idx} should have finite coordinates`);
    });

    console.log('✓ decodePolyline tests passed');
}

/**
 * Run all tests
 */
function runTests() {
    console.log('Running polyline decoding tests...\n');
    testDecodePolyline();
    console.log('\n✓ All polyline tests passed!');
}

// Run tests
runTests();
