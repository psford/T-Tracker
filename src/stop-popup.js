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
 * @returns {string} HTML string for popup content
 */
export function formatStopPopup(stop, routeInfos) {
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

    // Empty actions div for Phase 4 notification config buttons
    const actionsHtml = '<div class="stop-popup__actions"></div>';

    return `<div class="stop-popup">${headerHtml}${routesHtml}${actionsHtml}</div>`;
}

// Export escapeHtml for testing
export { escapeHtml };
