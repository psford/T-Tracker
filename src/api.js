// src/api.js — MBTA API SSE client with JSON:API parsing and exponential backoff
import { config } from '../config.js';

// EventTarget for publishing vehicle events
export const apiEvents = new EventTarget();

// Connection state
let eventSource = null;
let reconnectDelay = 1000; // Initial delay in ms
const MAX_RECONNECT_DELAY = 30000; // 30s max
const RECONNECT_MULTIPLIER = 2;
let reconnectTimer = null;

// Status tracking
let connectionStartTime = null;
let parseErrorCount = 0;
let parseErrorResetTimer = null;
const PARSE_ERROR_THRESHOLD = 5;
const PARSE_ERROR_WINDOW = 30000; // 30 seconds in ms
const RAPID_CLOSE_THRESHOLD = 1000; // 1 second in ms
let rapidCloseCount = 0;

/**
 * Emit a connection status event
 * @param {string} state — 'connected' | 'reconnecting' | 'error'
 * @param {string} message — User-friendly status message
 */
function emitStatusEvent(state, message) {
    const event = new CustomEvent('connection:status', {
        detail: { state, message }
    });
    apiEvents.dispatchEvent(event);
    console.log(`[Status] ${state}: ${message}`);
}

/**
 * Reset parse error counter
 */
function resetParseErrorCounter() {
    if (parseErrorResetTimer) {
        clearTimeout(parseErrorResetTimer);
    }
    parseErrorCount = 0;
}

/**
 * Track parse error and emit warning if threshold exceeded
 */
function recordParseError() {
    parseErrorCount++;

    // Clear previous reset timer
    if (parseErrorResetTimer) {
        clearTimeout(parseErrorResetTimer);
    }

    // Set timer to reset counter after window expires
    parseErrorResetTimer = setTimeout(() => {
        parseErrorCount = 0;
    }, PARSE_ERROR_WINDOW);

    // Check if threshold exceeded
    if (parseErrorCount >= PARSE_ERROR_THRESHOLD) {
        emitStatusEvent('error', 'Data format errors');
    }
}

/**
 * Parse a JSON:API vehicle object into a flat structure
 * @param {Object} data — JSON:API vehicle object
 * @returns {Object|null} Flattened vehicle object, or null if latitude/longitude are invalid
 */
export function parseVehicle(data) {
    // Handle remove events (only id and type)
    if (!data.attributes) {
        return { id: data.id };
    }

    const vehicle = {
        id: data.id,
    };

    // Map attributes (convert snake_case to camelCase)
    const attributeMap = {
        bearing: 'bearing',
        current_status: 'currentStatus',
        current_stop_sequence: 'currentStopSequence',
        direction_id: 'directionId',
        label: 'label',
        latitude: 'latitude',
        longitude: 'longitude',
        speed: 'speed',
        updated_at: 'updatedAt',
    };

    for (const [apiKey, camelKey] of Object.entries(attributeMap)) {
        if (apiKey in data.attributes) {
            vehicle[camelKey] = data.attributes[apiKey];
        }
    }

    // Validate that latitude and longitude are valid numbers
    if (vehicle.latitude == null || vehicle.longitude == null ||
        typeof vehicle.latitude !== 'number' || typeof vehicle.longitude !== 'number' ||
        Number.isNaN(vehicle.latitude) || Number.isNaN(vehicle.longitude)) {
        return null;
    }

    // Map relationships (extract id from nested data structure)
    if (data.relationships) {
        if (data.relationships.route?.data?.id) {
            vehicle.routeId = data.relationships.route.data.id;
        }
        if (data.relationships.stop?.data?.id) {
            vehicle.stopId = data.relationships.stop.data.id;
        }
        if (data.relationships.trip?.data?.id) {
            vehicle.tripId = data.relationships.trip.data.id;
        }
    }

    return vehicle;
}

/**
 * Dispatch a custom DOM event with vehicle data
 * @param {string} eventType — 'vehicles:reset', 'vehicles:add', 'vehicles:update', 'vehicles:remove'
 * @param {*} detail — Event detail (array or object)
 */
function emitVehicleEvent(eventType, detail) {
    const event = new CustomEvent(eventType, { detail });
    apiEvents.dispatchEvent(event);
}

/**
 * Reset backoff delay (call on successful connection)
 */
function resetBackoff() {
    reconnectDelay = 1000;
}

/**
 * Schedule reconnection with exponential backoff
 */
function scheduleReconnect() {
    // Clear any existing timer
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
    }

    console.log(`Reconnecting in ${reconnectDelay}ms...`);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
    }, reconnectDelay);

    // Increment delay for next time (capped at MAX)
    reconnectDelay = Math.min(reconnectDelay * RECONNECT_MULTIPLIER, MAX_RECONNECT_DELAY);
}

/**
 * Build SSE URL with API key and filters
 */
function buildUrl() {
    const baseUrl = `${config.api.baseUrl}/vehicles`;
    const params = new URLSearchParams({
        api_key: config.api.key,
        'filter[route_type]': '0,1,2,3', // Light rail, heavy rail, commuter rail, bus
    });
    return `${baseUrl}?${params.toString()}`;
}

/**
 * Connect to MBTA SSE endpoint
 */
export function connect() {
    // Prevent multiple connections
    if (eventSource) {
        return;
    }

    const url = buildUrl();
    console.log('Connecting to MBTA SSE...');
    connectionStartTime = Date.now();
    emitStatusEvent('reconnecting', 'Connecting...');

    try {
        eventSource = new EventSource(url);

        // Handle incoming messages
        eventSource.addEventListener('reset', (e) => {
            console.log('Received reset event');
            resetBackoff();
            resetParseErrorCounter();
            rapidCloseCount = 0; // Reset rapid close counter on successful message
            emitStatusEvent('connected', 'Live');

            try {
                const vehicles = JSON.parse(e.data).map(parseVehicle).filter(v => v !== null);
                emitVehicleEvent('vehicles:reset', vehicles);
            } catch (err) {
                console.error('Failed to parse reset event:', err.message);
                recordParseError();
            }
        });

        eventSource.addEventListener('add', (e) => {
            try {
                const vehicle = parseVehicle(JSON.parse(e.data));
                if (vehicle !== null) {
                    emitVehicleEvent('vehicles:add', vehicle);
                }
            } catch (err) {
                console.error('Failed to parse add event:', err.message);
                recordParseError();
            }
        });

        eventSource.addEventListener('update', (e) => {
            try {
                const vehicle = parseVehicle(JSON.parse(e.data));
                if (vehicle !== null) {
                    emitVehicleEvent('vehicles:update', vehicle);
                }
            } catch (err) {
                console.error('Failed to parse update event:', err.message);
                recordParseError();
            }
        });

        eventSource.addEventListener('remove', (e) => {
            try {
                const data = JSON.parse(e.data);
                emitVehicleEvent('vehicles:remove', { id: data.id });
            } catch (err) {
                console.error('Failed to parse remove event:', err.message);
                recordParseError();
            }
        });

        // Handle connection errors
        eventSource.addEventListener('error', () => {
            console.warn('SSE connection error — closing and reconnecting...');

            // Detect rate limiting: connection closed quickly after opening
            const timeConnected = Date.now() - connectionStartTime;
            if (timeConnected < RAPID_CLOSE_THRESHOLD) {
                rapidCloseCount++;
                if (rapidCloseCount >= 2) {
                    // Likely rate limited
                    emitStatusEvent('error', 'Rate limited — retrying...');
                    // Temporarily increase backoff aggressively for rate limiting
                    reconnectDelay = Math.min(reconnectDelay * 4, MAX_RECONNECT_DELAY);
                    rapidCloseCount = 0;
                } else {
                    emitStatusEvent('reconnecting', `Reconnecting in ${Math.round(reconnectDelay / 1000)}s...`);
                }
            } else {
                // Normal error
                rapidCloseCount = 0;
                const nextDelay = Math.round(reconnectDelay / 1000);
                emitStatusEvent('reconnecting', `Reconnecting in ${nextDelay}s...`);
            }

            disconnect();
            scheduleReconnect();
        });

    } catch (err) {
        console.error('Failed to create EventSource:', err.message);
        scheduleReconnect();
    }
}

/**
 * Disconnect from SSE endpoint
 */
export function disconnect() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}
