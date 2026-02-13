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
 * Format complete stop popup HTML
 * @param {Object} stop - Stop object with {id, name, latitude, longitude}
 * @param {Array<Object>} routeInfos - Array of route metadata {id, shortName, longName, color, type}
 * @param {Object} configState - Configuration state with {isCheckpoint, isDestination, pairCount, pendingCheckpoint, maxPairs}
 * @returns {string} HTML string for popup content
 */
export function formatStopPopup(stop, routeInfos, configState = {}) {
    // Build header with stop name
    const headerHtml = `<div class="stop-popup__header">
        <span class="stop-popup__name">${escapeHtml(stop.name)}</span>
    </div>`;

    // Build route list
    const routeHtmls = (routeInfos || []).map((routeInfo) => {
        // For commuter rail (type 2), use longName for context
        // For subway and bus, use shortName for conciseness
        let routeName;
        if (routeInfo?.type === 2) {
            routeName = escapeHtml(routeInfo?.longName || routeInfo?.shortName || routeInfo?.id);
        } else {
            routeName = escapeHtml(routeInfo?.shortName || routeInfo?.id);
        }
        const color = routeInfo?.color || '#888888';

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
 * Build actions div HTML based on configuration state
 * @private
 */
function buildActionsHtml(stop, routeInfos, configState) {
    const {
        isCheckpoint = false,
        isDestination = false,
        pairCount = 0,
        pendingCheckpoint = null,
        pendingCheckpointName = null,
        maxPairs = 5,
    } = configState;

    // Build route IDs string for data-route-ids attribute
    const routeIds = (routeInfos || []).map(r => r.id).join(',');

    // If already configured as checkpoint
    if (isCheckpoint) {
        const routeName = routeInfos?.[0]?.shortName || routeInfos?.[0]?.id || 'route';
        return `<div class="stop-popup__actions">
            <span class="stop-popup__configured">Checkpoint for ${escapeHtml(routeName)} alert</span>
        </div>`;
    }

    // If already configured as destination
    if (isDestination) {
        const routeName = routeInfos?.[0]?.shortName || routeInfos?.[0]?.id || 'route';
        return `<div class="stop-popup__actions">
            <span class="stop-popup__configured">Destination for ${escapeHtml(routeName)} alert</span>
        </div>`;
    }

    // If pending checkpoint is selected (another stop is waiting for destination)
    if (pendingCheckpoint !== null && pendingCheckpoint !== stop.id) {
        const displayName = pendingCheckpointName || pendingCheckpoint;
        return `<div class="stop-popup__actions">
            <div class="stop-popup__pending">Checkpoint: ${escapeHtml(displayName)}</div>
            <button class="stop-popup__btn stop-popup__btn--active" data-action="set-destination" data-stop-id="${escapeHtml(stop.id)}" data-route-ids="${escapeHtml(routeIds)}">
                Set as My Stop
            </button>
            <div class="stop-popup__count">${pairCount}/${maxPairs} pairs configured</div>
        </div>`;
    }

    // If max pairs reached and stop not configured
    if (pairCount >= maxPairs) {
        return `<div class="stop-popup__actions">
            <div class="stop-popup__count">${maxPairs}/${maxPairs} pairs configured (maximum reached)</div>
        </div>`;
    }

    // Default state: show both buttons
    return `<div class="stop-popup__actions">
        <button class="stop-popup__btn" data-action="set-checkpoint" data-stop-id="${escapeHtml(stop.id)}" data-route-ids="${escapeHtml(routeIds)}">
            Set as Checkpoint
        </button>
        <button class="stop-popup__btn" data-action="set-destination" data-stop-id="${escapeHtml(stop.id)}" data-route-ids="${escapeHtml(routeIds)}">
            Set as My Stop
        </button>
        <div class="stop-popup__count">${pairCount}/${maxPairs} pairs configured</div>
    </div>`;
}

// Export escapeHtml for testing
export { escapeHtml };
