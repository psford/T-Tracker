// collector/src/flatten.mjs — Flatten MBTA JSON:API objects into raw log lines (pure)
//
// Raw log philosophy (design plan 2026-07-04): record what the API said,
// stamped with collector receive-time. Attribute names stay snake_case as
// received — no interpretation, no unit conversion.

/**
 * Flattens a JSON:API vehicle object into a raw log record.
 *
 * @param {string} eventType — SSE event name ('reset' items use 'reset')
 * @param {Object} data — JSON:API vehicle resource
 * @param {number} tsMs — collector receive-time, epoch milliseconds
 * @returns {Object} raw log record
 */
export function flattenVehicleEvent(eventType, data, tsMs) {
    const record = {
        ts: new Date(tsMs).toISOString(),
        event: eventType,
        vehicleId: data.id,
    };
    if (data.attributes) {
        const a = data.attributes;
        record.lat = a.latitude;
        record.lon = a.longitude;
        record.bearing = a.bearing;
        record.currentStatus = a.current_status;
        record.currentStopSequence = a.current_stop_sequence;
        record.directionId = a.direction_id;
        record.label = a.label;
        record.speed = a.speed;
        record.updatedAt = a.updated_at;
        if (a.occupancy_status != null) {
            record.occupancyStatus = a.occupancy_status;
        }
        if (Array.isArray(a.carriages) && a.carriages.length > 0) {
            record.carriages = a.carriages;
        }
    }
    if (data.relationships) {
        record.routeId = data.relationships.route?.data?.id;
        record.stopId = data.relationships.stop?.data?.id;
        record.tripId = data.relationships.trip?.data?.id;
    }
    return record;
}

/**
 * Flattens a JSON:API prediction object into a raw log record.
 * Keeps the full attributes object — prediction semantics are the study
 * subject, so nothing is dropped.
 *
 * @param {Object} data — JSON:API prediction resource
 * @param {number} tsMs — collector receive-time, epoch milliseconds
 * @returns {Object} raw log record
 */
export function flattenPrediction(data, tsMs) {
    return {
        ts: new Date(tsMs).toISOString(),
        predictionId: data.id,
        attributes: data.attributes ?? {},
        routeId: data.relationships?.route?.data?.id,
        stopId: data.relationships?.stop?.data?.id,
        tripId: data.relationships?.trip?.data?.id,
        vehicleId: data.relationships?.vehicle?.data?.id,
    };
}
