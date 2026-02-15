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
    // Build header with stop name
    const headerHtml = `<div class="stop-popup__header">
        <span class="stop-popup__name">${escapeHtml(stop.name)}</span>
    </div>`;

    // Build route list
    const routeHtmls = (routeInfos || []).map((routeInfo) => {
        let routeName;
        if (routeInfo?.type === 2) {
            routeName = escapeHtml(routeInfo?.longName || routeInfo?.shortName || routeInfo?.id);
        } else {
            routeName = escapeHtml(routeInfo?.shortName || routeInfo?.id);
        }
        const color = validateHexColor(routeInfo?.color);

        return `<div class="stop-popup__route">
            <span class="stop-popup__swatch" style="background: ${color}"></span>
            <span>${routeName}</span>
        </div>`;
    });

    const routesHtml = `<div class="stop-popup__routes">
        ${routeHtmls.join('')}
    </div>`;

    // Build actions div based on config state
    const actionsHtml = buildActionsHtml(stop, routeInfos, configState);

    return `<div class="stop-popup">${headerHtml}${routesHtml}${actionsHtml}</div>`;
}

/**
 * Build actions div HTML with per-route direction buttons.
 * @private
 */
function buildActionsHtml(stop, routeInfos, configState) {
    const {
        pairCount = 0,
        maxPairs = 5,
        existingAlerts = [],
        routeDirections = [],
    } = configState;

    // If max pairs reached, show limit message
    if (pairCount >= maxPairs) {
        return `<div class="stop-popup__actions">
            <div class="stop-popup__count">${maxPairs}/${maxPairs} alerts configured (maximum reached)</div>
        </div>`;
    }

    // If no route direction data, show minimal state
    if (routeDirections.length === 0) {
        return `<div class="stop-popup__actions">
            <div class="stop-popup__count">${pairCount}/${maxPairs} alerts configured</div>
        </div>`;
    }

    // Build per-route direction buttons
    const routeAlertHtmls = routeDirections.map(rd => {
        const {
            routeId,
            routeName,
            dir0Label = 'Direction 0',
            dir1Label = 'Direction 1',
            isTerminus = false,
        } = rd;

        const escapedRouteId = escapeHtml(routeId);
        const escapedStopId = escapeHtml(stop.id);

        // Check which directions already have alerts at this stop for this route
        const hasDir0 = existingAlerts.some(a => a.routeId === routeId && a.directionId === 0);
        const hasDir1 = existingAlerts.some(a => a.routeId === routeId && a.directionId === 1);

        if (isTerminus) {
            // Terminus: single button (uses directionId 0 as convention)
            if (hasDir0 || hasDir1) {
                return `<div class="stop-popup__route-alerts">
                    <span class="stop-popup__alert-configured">Alert active (terminus)</span>
                </div>`;
            }
            return `<div class="stop-popup__route-alerts">
                <button class="stop-popup__btn stop-popup__btn--terminus" data-action="set-alert" data-stop-id="${escapedStopId}" data-route-id="${escapedRouteId}" data-direction-id="0">Alert me here</button>
            </div>`;
        }

        // Non-terminus: two direction buttons
        const btn0 = hasDir0
            ? `<span class="stop-popup__alert-configured">${escapeHtml(dir0Label)}</span>`
            : `<button class="stop-popup__btn" data-action="set-alert" data-stop-id="${escapedStopId}" data-route-id="${escapedRouteId}" data-direction-id="0">\u2192 ${escapeHtml(dir0Label)}</button>`;

        const btn1 = hasDir1
            ? `<span class="stop-popup__alert-configured">${escapeHtml(dir1Label)}</span>`
            : `<button class="stop-popup__btn" data-action="set-alert" data-stop-id="${escapedStopId}" data-route-id="${escapedRouteId}" data-direction-id="1">\u2192 ${escapeHtml(dir1Label)}</button>`;

        // Only show route label if multiple routes serve this stop
        const labelHtml = routeDirections.length > 1
            ? `<span class="stop-popup__route-label">${escapeHtml(routeName)}:</span>`
            : '';

        return `<div class="stop-popup__route-alerts">
            ${labelHtml}${btn0}${btn1}
        </div>`;
    });

    return `<div class="stop-popup__actions">
        ${routeAlertHtmls.join('')}
        <div class="stop-popup__count">${pairCount}/${maxPairs} alerts configured</div>
    </div>`;
}

// Export escapeHtml for testing
export { escapeHtml };
