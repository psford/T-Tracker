// collector/tests/flatten.test.js — Unit tests for JSON:API flattening
import assert from 'assert';
import { flattenVehicleEvent, flattenPrediction } from '../src/flatten.mjs';

const TS = Date.UTC(2026, 6, 4, 21, 30, 0);

function testVehicleFull() {
    const record = flattenVehicleEvent('update', {
        id: 'G-10123',
        attributes: {
            latitude: 42.33,
            longitude: -71.1,
            bearing: 45,
            current_status: 'IN_TRANSIT_TO',
            current_stop_sequence: 7,
            direction_id: 1,
            label: '3800-3850',
            speed: 8.9,
            updated_at: '2026-07-04T17:29:55-04:00',
        },
        relationships: {
            route: { data: { id: 'Green-E' } },
            stop: { data: { id: '70239' } },
            trip: { data: { id: '12345' } },
        },
    }, TS);

    assert.strictEqual(record.ts, '2026-07-04T21:30:00.000Z', 'Receive-time stamped');
    assert.strictEqual(record.event, 'update');
    assert.strictEqual(record.vehicleId, 'G-10123');
    assert.strictEqual(record.lat, 42.33);
    assert.strictEqual(record.lon, -71.1);
    assert.strictEqual(record.currentStatus, 'IN_TRANSIT_TO');
    assert.strictEqual(record.routeId, 'Green-E');
    assert.strictEqual(record.stopId, '70239');
    assert.strictEqual(record.tripId, '12345');
    assert.strictEqual(record.updatedAt, '2026-07-04T17:29:55-04:00', 'API timestamp preserved, not trusted for ts');
    console.log('✓ vehicle full flatten');
}

function testVehicleRemove() {
    const record = flattenVehicleEvent('remove', { id: 'G-10123', type: 'vehicle' }, TS);
    assert.strictEqual(record.vehicleId, 'G-10123');
    assert.strictEqual(record.event, 'remove');
    assert.strictEqual(record.lat, undefined, 'No attributes on remove events');
    console.log('✓ vehicle remove flatten');
}

function testVehicleOptionalFields() {
    const record = flattenVehicleEvent('update', {
        id: 'v1',
        attributes: { latitude: 1, longitude: 2, occupancy_status: 'MANY_SEATS_AVAILABLE', carriages: [{ label: 'c1' }] },
    }, TS);
    assert.strictEqual(record.occupancyStatus, 'MANY_SEATS_AVAILABLE');
    assert.deepStrictEqual(record.carriages, [{ label: 'c1' }]);
    const bare = flattenVehicleEvent('update', { id: 'v2', attributes: { latitude: 1, longitude: 2 } }, TS);
    assert.ok(!('occupancyStatus' in bare), 'Optional fields omitted when absent');
    assert.ok(!('carriages' in bare), 'Empty carriages omitted');
    console.log('✓ vehicle optional fields');
}

function testPrediction() {
    const record = flattenPrediction({
        id: 'prediction-12345-70239-90',
        attributes: {
            arrival_time: '2026-07-04T17:36:00-04:00',
            departure_time: '2026-07-04T17:37:00-04:00',
            status: null,
            stop_sequence: 90,
        },
        relationships: {
            route: { data: { id: 'Green-E' } },
            stop: { data: { id: '70239' } },
            trip: { data: { id: '12345' } },
            vehicle: { data: { id: 'G-10123' } },
        },
    }, TS);

    assert.strictEqual(record.ts, '2026-07-04T21:30:00.000Z');
    assert.strictEqual(record.predictionId, 'prediction-12345-70239-90');
    assert.strictEqual(record.attributes.arrival_time, '2026-07-04T17:36:00-04:00', 'Full attributes preserved');
    assert.strictEqual(record.routeId, 'Green-E');
    assert.strictEqual(record.vehicleId, 'G-10123');
    console.log('✓ prediction flatten');
}

function testPredictionMissingRelationships() {
    const record = flattenPrediction({ id: 'p1', attributes: { arrival_time: null } }, TS);
    assert.strictEqual(record.routeId, undefined, 'Missing relationships tolerated');
    assert.deepStrictEqual(record.attributes, { arrival_time: null });
    console.log('✓ prediction missing relationships');
}

testVehicleFull();
testVehicleRemove();
testVehicleOptionalFields();
testPrediction();
testPredictionMissingRelationships();
console.log('All flatten tests passed');
