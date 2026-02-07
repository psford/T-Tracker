// src/vehicle-popup.js — Pure formatting functions for vehicle popup content
// No imports, no DOM access, no Leaflet dependency

/**
 * Escape HTML special characters to prevent injection
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML interpolation
 * @private
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Format vehicle status with optional stop name
 * @param {string|null} currentStatus - Status code ('STOPPED_AT', 'IN_TRANSIT_TO', 'INCOMING_AT', or null)
 * @param {string|null} stopName - Stop name or null
 * @returns {string} Human-readable status string or empty string
 */
export function formatStatus(currentStatus, stopName) {
    if (!currentStatus) {
        return '';
    }

    switch (currentStatus) {
        case 'STOPPED_AT':
            return stopName ? `Stopped at ${escapeHtml(stopName)}` : 'Stopped';
        case 'IN_TRANSIT_TO':
            return stopName ? `In transit to ${escapeHtml(stopName)}` : 'In transit';
        case 'INCOMING_AT':
            return stopName ? `Approaching ${escapeHtml(stopName)}` : 'Approaching';
        default:
            return '';
    }
}

/**
 * Format speed from meters/second to mph
 * @param {number|null|undefined} speedMs - Speed in meters/second, or null/undefined
 * @returns {string} Formatted speed string (e.g., '15 mph') or empty string
 */
export function formatSpeed(speedMs) {
    if (speedMs === null || speedMs === undefined || speedMs <= 0) {
        return '';
    }

    const mph = speedMs * 2.23694;
    return `${Math.round(mph)} mph`;
}

/**
 * Format relative time (ISO 8601 timestamp to "X time-unit ago")
 * @param {string|null} updatedAt - ISO 8601 timestamp or null
 * @returns {string} Relative time string (e.g., '15s ago') or empty string
 */
export function formatTimeAgo(updatedAt) {
    if (!updatedAt) {
        return '';
    }

    const now = Date.now();
    const timestamp = new Date(updatedAt).getTime();

    // Check for invalid date
    if (isNaN(timestamp)) {
        return '';
    }

    const seconds = (now - timestamp) / 1000;

    // Negative time (future timestamp) should return empty
    if (seconds < 0) {
        return '';
    }

    if (seconds < 60) {
        return `${Math.round(seconds)}s ago`;
    }

    if (seconds < 3600) {
        return `${Math.round(seconds / 60)}m ago`;
    }

    return `${Math.round(seconds / 3600)}h ago`;
}

/**
 * Format complete vehicle popup HTML
 * @param {Object} vehicle - Vehicle object with {label, routeId, currentStatus, directionId, speed, updatedAt}
 * @param {string|null} stopName - Stop name or null (already resolved)
 * @param {Object|null} routeMeta - Route metadata {shortName, color} or null
 * @returns {string} HTML string for popup content
 */
export function formatVehiclePopup(vehicle, stopName, routeMeta) {
    // Extract route display properties
    const routeName = escapeHtml(routeMeta?.shortName || vehicle.routeId);
    const routeColor = routeMeta?.color || '#888888';

    // Build header with color swatch, route name, and vehicle label
    const headerHtml = `<div class="vehicle-popup__header">
        <span class="vehicle-popup__swatch" style="background: ${routeColor}"></span>
        <span class="vehicle-popup__route">${routeName}</span>
        <span class="vehicle-popup__label">#${escapeHtml(vehicle.label)}</span>
    </div>`;

    // Build status line (omit entire div if empty)
    const statusText = formatStatus(vehicle.currentStatus, stopName);
    const statusHtml = statusText
        ? `<div class="vehicle-popup__status">${statusText}</div>`
        : '';

    // Build details line with direction, speed, and time
    const detailSpans = [];

    // Direction: omit if null/undefined
    if (vehicle.directionId !== null && vehicle.directionId !== undefined) {
        const direction = vehicle.directionId === 0 ? 'Outbound' : 'Inbound';
        detailSpans.push(`<span>${direction}</span>`);
    }

    // Speed: omit if empty
    const speedText = formatSpeed(vehicle.speed);
    if (speedText) {
        detailSpans.push(`<span>${speedText}</span>`);
    }

    // Time: omit if empty
    const timeText = formatTimeAgo(vehicle.updatedAt);
    if (timeText) {
        detailSpans.push(`<span>${timeText}</span>`);
    }

    // Build details div (omit entire div if no spans)
    const detailsHtml = detailSpans.length > 0
        ? `<div class="vehicle-popup__details">${detailSpans.join('')}</div>`
        : '';

    return `<div class="vehicle-popup">${headerHtml}${statusHtml}${detailsHtml}</div>`;
}
