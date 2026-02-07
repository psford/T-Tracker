// tests/api.test.js — Unit tests for API parsing functions
import assert from 'assert';
import { parseVehicle } from '../src/api.js';

/**
 * Test parseVehicle function
 */
function testParseVehicle() {
    // Test valid vehicle with all attributes
    const validVehicle = {
        id: 'vehicle-1',
        attributes: {
            bearing: 90,
            current_status: 'in_transit_to',
            current_stop_sequence: 5,
            direction_id: 0,
            label: 'Bus 23-4001',
            latitude: 42.3601,
            longitude: -71.0589,
            speed: 25,
            updated_at: '2026-02-07T12:00:00Z',
        },
        relationships: {
            route: { data: { id: '23' } },
            stop: { data: { id: 'stop-456' } },
            trip: { data: { id: 'trip-789' } },
        },
    };

    const result1 = parseVehicle(validVehicle);
    assert(result1 !== null, 'Valid vehicle should not return null');
    assert.strictEqual(result1.id, 'vehicle-1', 'ID should be preserved');
    assert.strictEqual(result1.latitude, 42.3601, 'Latitude should be parsed');
    assert.strictEqual(result1.longitude, -71.0589, 'Longitude should be parsed');
    assert.strictEqual(result1.bearing, 90, 'Bearing should be parsed');
    assert.strictEqual(result1.currentStatus, 'in_transit_to', 'currentStatus should be camelCase');
    assert.strictEqual(result1.routeId, '23', 'routeId should be extracted from relationship');

    // Test remove event (no attributes)
    const removeEvent = { id: 'vehicle-1' };
    const result2 = parseVehicle(removeEvent);
    assert(result2 !== null, 'Remove event should not return null');
    assert.strictEqual(result2.id, 'vehicle-1', 'Remove event should preserve ID');
    assert(!result2.latitude, 'Remove event should not have latitude');

    // Test null latitude
    const nullLatVehicle = {
        id: 'vehicle-2',
        attributes: {
            latitude: null,
            longitude: -71.0589,
        },
    };
    const result3 = parseVehicle(nullLatVehicle);
    assert.strictEqual(result3, null, 'Vehicle with null latitude should return null');

    // Test undefined latitude
    const undefinedLatVehicle = {
        id: 'vehicle-3',
        attributes: {
            longitude: -71.0589,
        },
    };
    const result4 = parseVehicle(undefinedLatVehicle);
    assert.strictEqual(result4, null, 'Vehicle with undefined latitude should return null');

    // Test NaN latitude
    const nanLatVehicle = {
        id: 'vehicle-4',
        attributes: {
            latitude: NaN,
            longitude: -71.0589,
        },
    };
    const result5 = parseVehicle(nanLatVehicle);
    assert.strictEqual(result5, null, 'Vehicle with NaN latitude should return null');

    // Test null longitude
    const nullLonVehicle = {
        id: 'vehicle-5',
        attributes: {
            latitude: 42.3601,
            longitude: null,
        },
    };
    const result6 = parseVehicle(nullLonVehicle);
    assert.strictEqual(result6, null, 'Vehicle with null longitude should return null');

    // Test string latitude (should fail type check)
    const stringLatVehicle = {
        id: 'vehicle-6',
        attributes: {
            latitude: '42.3601',
            longitude: -71.0589,
        },
    };
    const result7 = parseVehicle(stringLatVehicle);
    assert.strictEqual(result7, null, 'Vehicle with string latitude should return null');

    console.log('✓ parseVehicle tests passed');
}

/**
 * Run all tests
 */
function runTests() {
    console.log('Running API parsing tests...\n');
    testParseVehicle();
    console.log('\n✓ All API tests passed!');
}

// Run tests
runTests();
