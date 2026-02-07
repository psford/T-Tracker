// tests/vehicles.test.js — Unit tests for vehicle state management
import assert from 'assert';
import { lerp, easeOutCubic, lerpAngle, haversineDistance } from '../src/vehicle-math.js';

/**
 * Test lerp function
 */
function testLerp() {
    assert.strictEqual(lerp(0, 10, 0), 0, 'lerp(0,10,0) should be 0');
    assert.strictEqual(lerp(0, 10, 1), 10, 'lerp(0,10,1) should be 10');
    assert.strictEqual(lerp(0, 10, 0.5), 5, 'lerp(0,10,0.5) should be 5');
    assert.strictEqual(lerp(-5, 5, 0.5), 0, 'lerp(-5,5,0.5) should be 0');

    console.log('✓ lerp tests passed');
}

/**
 * Test easeOutCubic function
 */
function testEaseOutCubic() {
    assert.strictEqual(easeOutCubic(0), 0, 'easeOutCubic(0) should be 0');
    assert.strictEqual(easeOutCubic(1), 1, 'easeOutCubic(1) should be 1');

    // easeOutCubic accelerates as t increases (cubic curve)
    const at25 = easeOutCubic(0.25);
    const at50 = easeOutCubic(0.5);
    const at75 = easeOutCubic(0.75);

    // Verify monotonic increase
    assert(at25 < at50, `easeOutCubic should be monotonic increasing: ${at25} < ${at50}`);
    assert(at50 < at75, `easeOutCubic should be monotonic increasing: ${at50} < ${at75}`);

    console.log('✓ easeOutCubic tests passed');
}

/**
 * Test lerpAngle function
 */
function testLerpAngle() {
    // Test 359° to 1° = 2° rotation, not 358°
    const result1 = lerpAngle(359, 1, 0.5);
    assert(result1 === 0 || Math.abs(result1 - 360) < 1, `lerpAngle(359,1,0.5) should be ~0 or ~360, got ${result1}`);

    // Test 0° to 180°
    const result2 = lerpAngle(0, 180, 0.5);
    assert.strictEqual(result2, 90, `lerpAngle(0,180,0.5) should be 90, got ${result2}`);

    // Test 180° to 0° — both directions are 180°, so result is ambiguous but valid
    const result3 = lerpAngle(180, 0, 0.5);
    assert(result3 === 90 || result3 === 270, `lerpAngle(180,0,0.5) should be 90 or 270, got ${result3}`);

    // Test t=0 returns a
    assert.strictEqual(lerpAngle(45, 90, 0), 45, 'lerpAngle(45,90,0) should be 45');

    // Test t=1 returns b
    assert.strictEqual(lerpAngle(45, 90, 1), 90, 'lerpAngle(45,90,1) should be 90');

    // Test negative angle normalization (C1 fix)
    // lerpAngle(1, 359, 0.75) should not produce negative values
    const result4 = lerpAngle(1, 359, 0.75);
    assert(result4 >= 0 && result4 < 360, `lerpAngle should always return [0, 360), got ${result4}`);

    console.log('✓ lerpAngle tests passed');
}

/**
 * Test haversineDistance function
 */
function testHaversineDistance() {
    // Same location should be 0 meters
    const dist1 = haversineDistance(42.3628, -71.0581, 42.3628, -71.0581);
    assert(dist1 < 1, `Distance between same points should be ~0, got ${dist1}`);

    // Boston to NYC is ~306km
    const bostonLat = 42.3601;
    const bostonLon = -71.0589;
    const nycLat = 40.7128;
    const nycLon = -74.0060;
    const dist2 = haversineDistance(bostonLat, bostonLon, nycLat, nycLon);
    assert(dist2 > 300000 && dist2 < 315000, `Boston to NYC should be ~306km, got ${dist2 / 1000}km`);

    console.log('✓ haversineDistance tests passed');
}

/**
 * Run all tests
 */
function runTests() {
    console.log('Running vehicle math function tests...\n');

    testLerp();
    testEaseOutCubic();
    testLerpAngle();
    testHaversineDistance();

    console.log('\n✓ All tests passed!');
}

// Run tests
runTests();
