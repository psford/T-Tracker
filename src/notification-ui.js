// src/notification-ui.js — Notification status UI management
import { getNotificationPairs, getPermissionState, requestPermission, isPaused, togglePause, removeNotificationPair } from './notifications.js';
import { escapeHtml } from './stop-popup.js';
import { getStopData, getRouteMetadata, getDirectionDestinations, isTerminusStop } from './map.js';
import { refreshAllHighlights } from './stop-markers.js';

let statusEl = null;
let panelEl = null;
let toggleBtn = null;

/**
 * Pure function to format a notification pair for display.
 * Resolves stop and route names, and direction label.
 * Exported for testing purposes.
 *
 * @param {Object} pair — {id, checkpointStopId, routeId, directionId}
 * @param {Map} stopsData — Map of stop ID → {id, name}
 * @param {Array} routeMetadata — Array of {id, shortName, longName, type}
 * @returns {Object} — {checkpointName, directionLabel, routeName}
 */
export function formatPairForDisplay(pair, stopsData, routeMetadata) {
    const checkpointName = stopsData.get(pair.checkpointStopId)?.name || pair.checkpointStopId;
    const routeMeta = routeMetadata.find(r => r.id === pair.routeId);
    const routeName = routeMeta
        ? (routeMeta.type === 2 ? routeMeta.longName : routeMeta.shortName)
        : pair.routeId;

    // Get direction label
    const labels = getDirectionDestinations(pair.routeId);
    const isTerminus = isTerminusStop(pair.checkpointStopId, pair.routeId);
    const directionLabel = isTerminus
        ? 'any direction'
        : (labels[pair.directionId] || `Direction ${pair.directionId}`);

    return { checkpointName, directionLabel, routeName };
}

/**
 * Initialize notification UI.
 * Sets up visibilitychange listener to detect permission revocation when tab regains focus.
 *
 * @param {HTMLElement} statusElement — #notification-status element
 */
export function initNotificationUI(statusElement) {
    statusEl = statusElement;
    updateStatus();

    // Detect permission changes when tab regains focus
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            updateStatus();
        }
    });
}

/**
 * Initialize notification panel.
 * Toggle panel visibility on button click.
 *
 * @param {HTMLElement} panelElement — #notification-panel
 * @param {HTMLElement} toggleButton — #notification-panel-toggle
 */
export function initNotificationPanel(panelElement, toggleButton) {
    panelEl = panelElement;
    toggleBtn = toggleButton;

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            panelEl.classList.toggle('notification-panel--hidden');
        });
    }

    // Close button
    const closeBtn = panelEl.querySelector('.notification-panel__close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            panelEl.classList.add('notification-panel--hidden');
        });
    }

    renderPanel();
}

/**
 * Update the status indicator based on current notification and permission state.
 *
 * Call this after any config change or permission change.
 */
export function updateStatus() {
    if (!statusEl) return;

    const pairs = getNotificationPairs();
    const permission = getPermissionState();
    const textEl = statusEl.querySelector('.notification-status__text');

    if (pairs.length === 0) {
        statusEl.className = 'notification-status notification-status--hidden';
        return;
    }

    statusEl.className = 'notification-status';

    if (permission === 'denied' || permission === 'unavailable') {
        statusEl.classList.add('notification-status--blocked');
        textEl.innerHTML = `Notifications blocked &mdash; <button class="notification-status__enable">Enable</button>`;
        bindEnableButton(textEl);
    } else if (isPaused()) {
        statusEl.classList.add('notification-status--paused');
        textEl.innerHTML = `Paused &mdash; <button class="notification-status__toggle">Resume</button>`;
        bindToggleButton(textEl);
    } else if (permission === 'default') {
        statusEl.classList.add('notification-status--default');
        textEl.textContent = `${pairs.length} alert${pairs.length !== 1 ? 's' : ''} configured`;
    } else {
        statusEl.classList.add('notification-status--active');
        textEl.innerHTML = `Active: ${pairs.length} alert${pairs.length !== 1 ? 's' : ''} &mdash; <button class="notification-status__toggle">Pause</button>`;
        bindToggleButton(textEl);
    }
}

function bindToggleButton(container) {
    const btn = container.querySelector('.notification-status__toggle');
    if (btn) {
        btn.addEventListener('click', () => {
            togglePause();
            updateStatus();
        });
    }
}

function bindEnableButton(container) {
    const btn = container.querySelector('.notification-status__enable');
    if (btn) {
        btn.addEventListener('click', async () => {
            await requestPermission();
            updateStatus();
        });
    }
}

/**
 * Render the panel list with current notification pairs.
 * Lists all pairs with checkpoint name, direction, and route.
 *
 * Call after any config change.
 */
export function renderPanel() {
    if (!panelEl) return;

    const pairs = getNotificationPairs();
    const stopsData = getStopData();
    const metadata = getRouteMetadata();

    const listEl = panelEl.querySelector('.notification-panel__list');
    const emptyEl = panelEl.querySelector('.notification-panel__empty');
    const countEl = panelEl.querySelector('.notification-panel__count');

    // Show/hide toggle button based on pair count
    if (toggleBtn) {
        toggleBtn.style.display = pairs.length > 0 ? 'block' : 'none';
    }

    // Empty state
    if (pairs.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = 'block';
        countEl.textContent = '';
        return;
    }

    emptyEl.style.display = 'none';

    // Count display
    countEl.textContent = `${pairs.length}/5 alerts configured`;

    // Render each pair with readable names
    listEl.innerHTML = pairs.map(pair => {
        const { checkpointName, directionLabel, routeName } = formatPairForDisplay(pair, stopsData, metadata);

        return `
            <div class="notification-pair" data-pair-id="${escapeHtml(pair.id)}">
                <div>
                    <div class="notification-pair__info">${escapeHtml(checkpointName)} &rarr; ${escapeHtml(directionLabel)}</div>
                    <div class="notification-pair__route">${escapeHtml(routeName)}</div>
                </div>
                <button class="notification-pair__delete" data-pair-id="${escapeHtml(pair.id)}">Delete</button>
            </div>
        `;
    }).join('');

    // Bind delete buttons
    listEl.querySelectorAll('.notification-pair__delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const pairId = btn.dataset.pairId;
            removeNotificationPair(pairId);
            refreshAllHighlights();
            updateStatus();
            renderPanel();
        });
    });
}
