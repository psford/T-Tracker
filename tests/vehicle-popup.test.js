// tests/vehicle-popup.test.js — Unit tests for vehicle popup formatting functions
import assert from 'assert';
import {
    formatStatus,
    formatSpeed,
    formatTimeAgo,
    formatVehiclePopup,
} from '../src/vehicle-popup.js';

/**
 * Test formatStatus function
 */
function testFormatStatus() {
    // Test STOPPED_AT with stop name
    assert.strictEqual(
        formatStatus('STOPPED_AT', 'Park Street'),
        'Stopped at Park Street',
        'STOPPED_AT with stop name should format correctly'
    );

    // Test IN_TRANSIT_TO with stop name
    assert.strictEqual(
        formatStatus('IN_TRANSIT_TO', 'Kenmore'),
        'In transit to Kenmore',
        'IN_TRANSIT_TO with stop name should format correctly'
    );

    // Test INCOMING_AT with stop name
    assert.strictEqual(
        formatStatus('INCOMING_AT', 'Boylston'),
        'Approaching Boylston',
        'INCOMING_AT with stop name should format correctly'
    );

    // Test STOPPED_AT without stop name
    assert.strictEqual(
        formatStatus('STOPPED_AT', null),
        'Stopped',
        'STOPPED_AT without stop name should format correctly'
    );

    // Test IN_TRANSIT_TO without stop name
    assert.strictEqual(
        formatStatus('IN_TRANSIT_TO', null),
        'In transit',
        'IN_TRANSIT_TO without stop name should format correctly'
    );

    // Test INCOMING_AT without stop name
    assert.strictEqual(
        formatStatus('INCOMING_AT', null),
        'Approaching',
        'INCOMING_AT without stop name should format correctly'
    );

    // Test null status with stop name
    assert.strictEqual(
        formatStatus(null, 'Park Street'),
        '',
        'null status should return empty string even with stop name'
    );

    // Test undefined status
    assert.strictEqual(
        formatStatus(undefined, null),
        '',
        'undefined status should return empty string'
    );

    console.log('✓ formatStatus tests passed');
}

/**
 * Test formatSpeed function
 */
function testFormatSpeed() {
    // Test valid speed (6.7056 m/s * 2.23694 ≈ 15 mph)
    assert.strictEqual(
        formatSpeed(6.7056),
        '15 mph',
        'Valid speed should convert and round correctly'
    );

    // Test zero speed
    assert.strictEqual(
        formatSpeed(0),
        '',
        'Zero speed should return empty string'
    );

    // Test null speed
    assert.strictEqual(
        formatSpeed(null),
        '',
        'null speed should return empty string'
    );

    // Test undefined speed
    assert.strictEqual(
        formatSpeed(undefined),
        '',
        'undefined speed should return empty string'
    );

    // Test negative speed
    assert.strictEqual(
        formatSpeed(-1),
        '',
        'Negative speed should return empty string'
    );

    // Test small positive speed (0.5 m/s * 2.23694 ≈ 1.12, rounds to 1)
    assert.strictEqual(
        formatSpeed(0.5),
        '1 mph',
        'Small speed should round correctly'
    );

    console.log('✓ formatSpeed tests passed');
}

/**
 * Test formatTimeAgo function
 */
function testFormatTimeAgo() {
    // Test 10 seconds ago — use regex to allow 1-second variance for timing flakiness
    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
    const resultTenSeconds = formatTimeAgo(tenSecondsAgo);
    assert(
        /^(10|11)s ago$/.test(resultTenSeconds),
        `10 seconds ago should format as "10s ago" or "11s ago", got "${resultTenSeconds}"`
    );

    // Test 90 seconds ago (90/60 = 1.5, rounds to 2) — use regex to allow 1-minute variance
    const ninetySecondsAgo = new Date(Date.now() - 90000).toISOString();
    const resultNinetySeconds = formatTimeAgo(ninetySecondsAgo);
    assert(
        /^(1|2)m ago$/.test(resultNinetySeconds),
        `90 seconds ago should format as "1m ago" or "2m ago", got "${resultNinetySeconds}"`
    );

    // Test 7200 seconds ago (2 hours)
    const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();
    assert.strictEqual(
        formatTimeAgo(twoHoursAgo),
        '2h ago',
        '7200 seconds ago should format as 2 hours'
    );

    // Test null timestamp
    assert.strictEqual(
        formatTimeAgo(null),
        '',
        'null timestamp should return empty string'
    );

    // Test invalid date string
    assert.strictEqual(
        formatTimeAgo('invalid-date'),
        '',
        'invalid date should return empty string'
    );

    console.log('✓ formatTimeAgo tests passed');
}

/**
 * Test formatVehiclePopup function
 */
function testFormatVehiclePopup() {
    // Test 1: Full vehicle data with all fields
    const vehicle1 = {
        label: '3821',
        routeId: '23',
        currentStatus: 'STOPPED_AT',
        directionId: 0,
        speed: 6.7056,
        updatedAt: new Date(Date.now() - 12000).toISOString(),
    };

    const routeMeta1 = {
        shortName: 'Green-E',
        color: '#00843D',
    };

    const result1 = formatVehiclePopup(vehicle1, 'Park Street', routeMeta1);

    assert(result1.includes('vehicle-popup'), 'Should contain vehicle-popup class');
    assert(result1.includes('3821'), 'Should include vehicle label');
    assert(result1.includes('Green-E'), 'Should include route short name');
    assert(result1.includes('#00843D'), 'Should include route color');
    assert(result1.includes('Stopped at Park Street'), 'Should include status with stop name');
    assert(result1.includes('Outbound'), 'Should include direction for directionId 0');
    assert(result1.includes('15 mph'), 'Should include converted speed');
    // Allow 1-second variance for timing flakiness: expect "11s ago", "12s ago", or "13s ago"
    assert(/(11|12|13)s ago/.test(result1), 'Should include relative time within 1-second variance');

    // Test 2: Missing speed (null) — should not include speed span
    const vehicle2 = {
        label: '3821',
        routeId: '23',
        currentStatus: 'STOPPED_AT',
        directionId: 0,
        speed: null,
        updatedAt: new Date(Date.now() - 12000).toISOString(),
    };

    const result2 = formatVehiclePopup(vehicle2, 'Park Street', routeMeta1);

    assert(!result2.includes(' mph'), 'Should not include speed when null');
    assert(result2.includes('Outbound'), 'Should still include direction');

    // Test 3: Missing stopName (null) — status should show without location
    const vehicle3 = {
        label: '3821',
        routeId: '23',
        currentStatus: 'IN_TRANSIT_TO',
        directionId: 1,
        speed: 6.7056,
        updatedAt: new Date(Date.now() - 12000).toISOString(),
    };

    const result3 = formatVehiclePopup(vehicle3, null, routeMeta1);

    assert(result3.includes('In transit'), 'Should include status without location');
    assert(!result3.includes('to '), 'Should not have location specifier when stopName null');
    assert(result3.includes('Inbound'), 'Should include direction for directionId 1');

    // Test 4: Missing routeMeta (null) — fallback to routeId and gray color
    const vehicle4 = {
        label: '3821',
        routeId: '23',
        currentStatus: 'STOPPED_AT',
        directionId: 0,
        speed: 6.7056,
        updatedAt: new Date(Date.now() - 12000).toISOString(),
    };

    const result4 = formatVehiclePopup(vehicle4, 'Park Street', null);

    assert(result4.includes('23'), 'Should include routeId when routeMeta missing');
    assert(result4.includes('#888888'), 'Should include gray fallback color when routeMeta missing');

    // Test 5: Missing directionId (null) — should not include direction span
    const vehicle5 = {
        label: '3821',
        routeId: '23',
        currentStatus: 'STOPPED_AT',
        directionId: null,
        speed: 6.7056,
        updatedAt: new Date(Date.now() - 12000).toISOString(),
    };

    const result5 = formatVehiclePopup(vehicle5, 'Park Street', routeMeta1);

    assert(!result5.includes('Outbound') && !result5.includes('Inbound'),
        'Should not include direction when directionId null'
    );
    assert(result5.includes('15 mph'), 'Should still include speed');

    console.log('✓ formatVehiclePopup tests passed');
}

/**
 * Run all tests
 */
function runTests() {
    console.log('Running vehicle-popup formatting function tests...\n');

    testFormatStatus();
    testFormatSpeed();
    testFormatTimeAgo();
    testFormatVehiclePopup();

    console.log('\n✓ All tests passed!');
}

// Run tests
runTests();
