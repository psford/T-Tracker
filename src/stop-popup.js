// src/stop-popup.js — Pure formatting functions for stop popup content
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
 * Validate and sanitize hex color value for use in inline style attribute
 * @param {string} color - Color string to validate
 * @returns {string} Valid hex color or safe fallback '#888888'
 * @private
 */
function validateHexColor(color) {
    if (/^#[0-9a-fA-F]{6}$/.test(color)) {
        return color;
    }
    return '#888888';
}

/**
 * Format complete stop popup HTML with per-route direction alert buttons.
 * @param {Object} stop - Stop object with {id, name, latitude, longitude}
 * @param {Array<Object>} routeInfos - Array of route metadata {id, shortName, longName, color, type}
 * @param {Object} configState - Configuration state
 * @param {number} configState.pairCount - Number of existing alert pairs
 * @param {number} configState.maxPairs - Maximum allowed pairs
 * @param {Array<Object>} [configState.existingAlerts] - Alerts at this stop [{routeId, directionId}]
 * @param {Array<Object>} [configState.routeDirections] - Per-route direction info [{routeId, routeName, dir0Label, dir1Label, isTerminus}]
 * @returns {string} HTML string for popup content
 */
export function formatStopPopup(stop, routeInfos, configState = {}) {
    const {
        pairCount = 0,
        maxPairs = 5,
        existingAlerts = [],
        routeDirections = [],
    } = configState;

    // Build header with stop name
    const headerHtml = `<div class="stop-popup__header">
        <span class="stop-popup__name">${escapeHtml(stop.name)}</span>
    </div>`;

    // Build a lookup from routeId → direction data for inline buttons
    const dirByRoute = new Map();
    for (const rd of routeDirections) {
        dirByRoute.set(rd.routeId, rd);
    }

    const atMax = pairCount >= maxPairs;

    // Build unified route rows: swatch + name + direction buttons on one line
    const routeRowHtmls = (routeInfos || []).map((routeInfo) => {
        let routeName;
        if (routeInfo?.type === 2) {
            routeName = escapeHtml(routeInfo?.longName || routeInfo?.shortName || routeInfo?.id);
        } else {
            routeName = escapeHtml(routeInfo?.shortName || routeInfo?.id);
        }
        const color = validateHexColor(routeInfo?.color);

        // Direction buttons for this route (if direction data available and not at max)
        let btnsHtml = '';
        const rd = dirByRoute.get(routeInfo?.id);
        if (rd && !atMax) {
            btnsHtml = buildRouteButtons(stop, rd, existingAlerts);
        }

        return `<div class="stop-popup__route-row">
            <span class="stop-popup__swatch" style="background: ${color}"></span>
            <span class="stop-popup__route-name">${routeName}</span>
            ${btnsHtml}
        </div>`;
    });

    const routesHtml = `<div class="stop-popup__routes">
        ${routeRowHtmls.join('')}
    </div>`;

    // Counter line
    const countText = atMax
        ? `${maxPairs}/${maxPairs} alerts configured (maximum reached)`
        : `${pairCount}/${maxPairs} alerts configured`;
    const countHtml = `<div class="stop-popup__count">${countText}</div>`;

    return `<div class="stop-popup">${headerHtml}${routesHtml}${countHtml}</div>`;
}

/**
 * Build chip picker HTML for notification count selection.
 * @param {string} stopId — stop ID
 * @param {string} routeId — route ID
 * @param {number} directionId — direction ID
 * @returns {string} HTML string for chip picker
 */
export function buildChipPickerHtml(stopId, routeId, directionId) {
    const escapedStopId = escapeHtml(stopId);
    const escapedRouteId = escapeHtml(routeId);

    return `<div class="chip-picker" data-stop-id="${escapedStopId}" data-route-id="${escapedRouteId}" data-direction-id="${directionId}">
        <div class="chip-picker__chips">
            <button class="chip-picker__chip chip-picker__chip--selected" data-count="1">1</button>
            <button class="chip-picker__chip" data-count="2">2</button>
            <button class="chip-picker__chip" data-count="3">3</button>
            <button class="chip-picker__chip" data-count="custom">#</button>
            <input class="chip-picker__morph-input" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="1-99" maxlength="2">
            <button class="chip-picker__chip" data-count="unlimited">∞</button>
        </div>
        <button class="chip-picker__create" data-action="create-alert" data-stop-id="${escapedStopId}" data-route-id="${escapedRouteId}" data-direction-id="${directionId}" data-count="1">Set Alert</button>
    </div>`;
}

/**
 * Build inline direction buttons for a single route row.
 * @private
 */
function buildRouteButtons(stop, rd, existingAlerts) {
    const {
        routeId,
        dir0Label = 'Direction 0',
        dir1Label = 'Direction 1',
        availableDirections = [0, 1],
    } = rd;

    const escapedRouteId = escapeHtml(routeId);
    const escapedStopId = escapeHtml(rd.stopId || stop.id);

    const hasDir0 = existingAlerts.some(a => a.routeId === routeId && a.directionId === 0);
    const hasDir1 = existingAlerts.some(a => a.routeId === routeId && a.directionId === 1);

    const showDir0 = availableDirections.includes(0);
    const showDir1 = availableDirections.includes(1);

    const btn0 = !showDir0 ? '' : hasDir0
        ? `<span class="stop-popup__alert-configured">${escapeHtml(dir0Label)}</span>`
        : `<button class="stop-popup__btn" data-action="show-chips" data-stop-id="${escapedStopId}" data-route-id="${escapedRouteId}" data-direction-id="0">\u2192 ${escapeHtml(dir0Label)}</button>`;

    const btn1 = !showDir1 ? '' : hasDir1
        ? `<span class="stop-popup__alert-configured">${escapeHtml(dir1Label)}</span>`
        : `<button class="stop-popup__btn" data-action="show-chips" data-stop-id="${escapedStopId}" data-route-id="${escapedRouteId}" data-direction-id="1">\u2192 ${escapeHtml(dir1Label)}</button>`;

    return `<div class="stop-popup__route-btns">${btn0}${btn1}</div>`;
}

// Export escapeHtml for testing
export { escapeHtml };
