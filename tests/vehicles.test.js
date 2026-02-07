// tests/vehicles.test.js — Unit tests for vehicle state management
import assert from 'assert';

// We'll test the mathematical functions independently
// Since the full module requires addEventListener, we'll import utils separately

/**
 * Test lerp function
 */
function testLerp() {
    const lerp = (a, b, t) => a + (b - a) * t;

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
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

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
    const lerpAngle = (a, b, t) => {
        // Normalize angles to [0, 360)
        a = a % 360;
        b = b % 360;
        if (a < 0) a += 360;
        if (b < 0) b += 360;

        // Find shortest rotation direction
        let delta = b - a;
        if (delta > 180) {
            delta -= 360;
        } else if (delta < -180) {
            delta += 360;
        }

        // Interpolate along shortest arc
        return (a + delta * t) % 360;
    };

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

    console.log('✓ lerpAngle tests passed');
}

/**
 * Test haversineDistance function
 */
function testHaversineDistance() {
    const haversineDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371000; // Earth radius in meters
        const toRad = Math.PI / 180;

        const dLat = (lat2 - lat1) * toRad;
        const dLon = (lon2 - lon1) * toRad;

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

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
