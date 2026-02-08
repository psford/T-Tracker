// tests/vehicles.test.js — Unit tests for vehicle state management
import assert from 'assert';
import { lerp, easeOutCubic, lerpAngle, haversineDistance, darkenHexColor } from '../src/vehicle-math.js';

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
 * Parse hex color string to RGB object
 * Helper for color distinctness testing
 */
function parseHexColor(hex) {
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
    };
}

/**
 * Check if two RGB colors differ by at least minDelta in at least one channel
 */
function colorsDistinct(hex1, hex2, minDelta = 30) {
    const c1 = parseHexColor(hex1);
    const c2 = parseHexColor(hex2);

    const rDiff = Math.abs(c1.r - c2.r);
    const gDiff = Math.abs(c1.g - c2.g);
    const bDiff = Math.abs(c1.b - c2.b);

    return rDiff >= minDelta || gDiff >= minDelta || bDiff >= minDelta;
}

/**
 * Test darkenHexColor function
 */
function testDarkenHexColor() {
    // AC4.1: Red Line darkening — #DA291C darkened by 15%
    const darkRedResult = darkenHexColor('#DA291C', 0.15);
    const darkRedLower = darkRedResult.toLowerCase();
    // Original: #DA291C = (218, 41, 28)
    // Darkened 15%: (218*0.85, 41*0.85, 28*0.85) = (185, 35, 24) = #B92318
    assert(darkRedLower !== '#da291c', 'darkenHexColor should darken the color');

    // Verify it produces a hex string
    assert(/^#[0-9a-f]{6}$/i.test(darkRedResult), 'darkenHexColor should return valid hex string');

    // AC4.2: Orange Line darkening — #ED8B00 darkened by 15%
    const darkOrangeResult = darkenHexColor('#ED8B00', 0.15);
    const darkOrangeLower = darkOrangeResult.toLowerCase();
    // Original: #ED8B00 = (237, 139, 0)
    // Darkened 15%: (237*0.85, 139*0.85, 0*0.85) ≈ (201, 118, 0) = #C97600
    assert(darkOrangeLower !== '#ed8b00', 'Orange should be darkened');
    assert(/^#[0-9a-f]{6}$/i.test(darkOrangeResult), 'darkenHexColor should return valid hex string');

    // AC4.3: Blue Line darkening — #003DA5 darkened by 15%
    const darkBlueResult = darkenHexColor('#003DA5', 0.15);
    const darkBlueLower = darkBlueResult.toLowerCase();
    // Original: #003DA5 = (0, 61, 165)
    // Darkened 15%: (0*0.85, 61*0.85, 165*0.85) ≈ (0, 51, 140) = #00338C
    assert(darkBlueLower !== '#003da5', 'Blue should be darkened');
    assert(/^#[0-9a-f]{6}$/i.test(darkBlueResult), 'darkenHexColor should return valid hex string');

    // AC4.5: Commuter Rail purple darkening — #80276C darkened by 15%
    const darkPurpleResult = darkenHexColor('#80276C', 0.15);
    const darkPurpleLower = darkPurpleResult.toLowerCase();
    // Original: #80276C = (128, 39, 108)
    // Darkened 15%: (128*0.85, 39*0.85, 108*0.85) ≈ (109, 33, 92) = #6d215c
    assert(/^#[0-9a-f]{6}$/i.test(darkPurpleResult), 'darkenHexColor should return valid hex string for purple');
    assert(darkPurpleLower !== '#80276c', 'Purple should be darkened');

    // AC4.8: Darkened colors should remain distinct from each other
    // All four darkened colors (Red, Orange, Blue, Purple) must be visually distinct
    // Each pair must differ by at least 30 in at least one RGB channel
    const colorPairs = [
        [darkRedLower, darkOrangeLower, 'red and orange'],
        [darkRedLower, darkBlueLower, 'red and blue'],
        [darkRedLower, darkPurpleLower, 'red and purple'],
        [darkOrangeLower, darkBlueLower, 'orange and blue'],
        [darkOrangeLower, darkPurpleLower, 'orange and purple'],
        [darkBlueLower, darkPurpleLower, 'blue and purple']
    ];

    colorPairs.forEach(([hex1, hex2, label]) => {
        assert(
            colorsDistinct(hex1, hex2, 30),
            `Darkened ${label} should differ by at least 30 in one RGB channel: ${hex1} vs ${hex2}`
        );
    });

    // Edge: amount=0 should return the same color (no change)
    const noChangeResult = darkenHexColor('#FFFFFF', 0).toLowerCase();
    assert(noChangeResult === '#ffffff', 'amount=0 should produce no change');

    // Edge: Black stays black with any amount
    const blackResult = darkenHexColor('#000000', 0.5).toLowerCase();
    assert(blackResult === '#000000', 'Black with any darkening should stay black');

    // Edge: Full darkening (amount=1) produces black
    const fullDarkenResult = darkenHexColor('#FF0000', 1).toLowerCase();
    assert(fullDarkenResult === '#000000', 'Full darkening (amount=1) should produce black');

    console.log('✓ darkenHexColor tests passed');
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
    testDarkenHexColor();

    console.log('\n✓ All tests passed!');
}

// Run tests
runTests();
