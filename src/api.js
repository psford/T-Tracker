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

/**
 * Parse a JSON:API vehicle object into a flat structure
 * @param {Object} data — JSON:API vehicle object
 * @returns {Object} Flattened vehicle object
 */
function parseVehicle(data) {
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
        'filter[route_type]': '0,3', // Light rail and bus only
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

    try {
        eventSource = new EventSource(url);

        // Handle incoming messages
        eventSource.addEventListener('reset', (e) => {
            console.log('Received reset event');
            resetBackoff();

            try {
                const vehicles = JSON.parse(e.data).map(parseVehicle);
                emitVehicleEvent('vehicles:reset', vehicles);
            } catch (err) {
                console.error('Failed to parse reset event:', err.message);
            }
        });

        eventSource.addEventListener('add', (e) => {
            try {
                const vehicle = parseVehicle(JSON.parse(e.data));
                emitVehicleEvent('vehicles:add', vehicle);
            } catch (err) {
                console.error('Failed to parse add event:', err.message);
            }
        });

        eventSource.addEventListener('update', (e) => {
            try {
                const vehicle = parseVehicle(JSON.parse(e.data));
                emitVehicleEvent('vehicles:update', vehicle);
            } catch (err) {
                console.error('Failed to parse update event:', err.message);
            }
        });

        eventSource.addEventListener('remove', (e) => {
            try {
                const data = JSON.parse(e.data);
                emitVehicleEvent('vehicles:remove', { id: data.id });
            } catch (err) {
                console.error('Failed to parse remove event:', err.message);
            }
        });

        // Handle connection errors
        eventSource.addEventListener('error', () => {
            console.warn('SSE connection error — closing and reconnecting...');
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
