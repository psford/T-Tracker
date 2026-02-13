// src/notification-ui.js — Notification status UI management
import { getNotificationPairs, getPermissionState, requestPermission, isPaused, togglePause, removeNotificationPair } from './notifications.js';
import { escapeHtml } from './stop-popup.js';
import { getStopData, getRouteMetadata } from './map.js';

let statusEl = null;
let panelEl = null;
let toggleBtn = null;

/**
 * Initialize notification UI.
 * AC6.5: Sets up visibilitychange listener to detect permission revocation when tab regains focus.
 * AC6.1: Shows status indicator with pair count.
 * AC6.3: Shows blocked status with enable button.
 *
 * @param {HTMLElement} statusElement — #notification-status element
 */
export function initNotificationUI(statusElement) {
    statusEl = statusElement;
    updateStatus();

    // AC6.5 + AC9.6: Detect permission changes when tab regains focus
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            updateStatus();
        }
    });
}

/**
 * Initialize notification panel.
 * AC10.4: Toggle panel visibility on button click
 *
 * @param {HTMLElement} panelElement — #notification-panel
 * @param {HTMLElement} toggleButton — #notification-panel-toggle
 */
export function initNotificationPanel(panelElement, toggleButton) {
    panelEl = panelElement;
    toggleBtn = toggleButton;

    // AC10.4: Toggle panel visibility on button click
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
 * AC6.1: Active state shows "Active: N alerts — Pause" (green)
 * AC6.3: Blocked state shows "Notifications blocked — Enable" button (red)
 * AC9.3: Warning banner shown when permission denied
 * AC9.4: Enable button triggers permission request
 * AC9.5: Status updates after permission change
 * AC5.4: Paused state shows "Paused — Resume" button (amber)
 * AC6.2: Status shows "Paused" when manually paused
 *
 * Call this after any config change or permission change.
 */
export function updateStatus() {
    if (!statusEl) return;

    const pairs = getNotificationPairs();
    const permission = getPermissionState();
    const textEl = statusEl.querySelector('.notification-status__text');

    if (pairs.length === 0) {
        // No config — hide status
        statusEl.className = 'notification-status notification-status--hidden';
        return;
    }

    // Remove all modifier classes, keep base class
    statusEl.className = 'notification-status';

    if (permission === 'denied' || permission === 'unavailable') {
        // AC6.3 + AC9.3: Blocked state with enable button
        statusEl.classList.add('notification-status--blocked');
        textEl.innerHTML = `Notifications blocked &mdash; <button class="notification-status__enable">Enable</button>`;
        bindEnableButton(textEl);
    } else if (isPaused()) {
        // AC5.4 + AC6.2: Paused state
        statusEl.classList.add('notification-status--paused');
        textEl.innerHTML = `Paused &mdash; <button class="notification-status__toggle">Resume</button>`;
        bindToggleButton(textEl);
    } else if (permission === 'default') {
        // Permission not yet requested
        statusEl.classList.add('notification-status--default');
        textEl.textContent = `${pairs.length} alert${pairs.length !== 1 ? 's' : ''} configured`;
    } else {
        // AC6.1: Active state — permission granted, with pause button
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
 * AC10.1: Lists all pairs with readable checkpoint→destination names and route names
 * AC10.2: Delete buttons call removeNotificationPair()
 * AC10.3: Counter shows "X/5 pairs configured"
 * AC10.4: Toggle button shown/hidden based on pair count
 * AC10.5: Empty state shows "No notifications configured"
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

    // AC10.4: Show/hide toggle button based on pair count
    if (toggleBtn) {
        toggleBtn.style.display = pairs.length > 0 ? 'block' : 'none';
    }

    // AC10.5: Empty state
    if (pairs.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = 'block';
        countEl.textContent = '';
        return;
    }

    emptyEl.style.display = 'none';

    // AC10.3: Count display
    countEl.textContent = `${pairs.length}/5 pairs configured`;

    // AC10.1: Render each pair with readable names
    listEl.innerHTML = pairs.map(pair => {
        const checkpointName = stopsData.get(pair.checkpointStopId)?.name || pair.checkpointStopId;
        const destName = stopsData.get(pair.myStopId)?.name || pair.myStopId;
        const routeMeta = metadata.find(r => r.id === pair.routeId);
        const routeName = routeMeta
            ? (routeMeta.type === 2 ? routeMeta.longName : routeMeta.shortName)
            : pair.routeId;

        return `
            <div class="notification-pair" data-pair-id="${escapeHtml(pair.id)}">
                <div>
                    <div class="notification-pair__info">${escapeHtml(checkpointName)} &rarr; ${escapeHtml(destName)}</div>
                    <div class="notification-pair__route">${escapeHtml(routeName)}</div>
                </div>
                <button class="notification-pair__delete" data-pair-id="${escapeHtml(pair.id)}">Delete</button>
            </div>
        `;
    }).join('');

    // AC10.2: Bind delete buttons
    listEl.querySelectorAll('.notification-pair__delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const pairId = btn.dataset.pairId;
            removeNotificationPair(pairId);
            updateStatus();   // Update status indicator (separate from panel)
            renderPanel();    // Re-render panel (separate from status)
        });
    });
}
