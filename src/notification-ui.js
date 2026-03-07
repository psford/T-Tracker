// src/notification-ui.js — Notification status UI management
import { getNotificationPairs, getPermissionState, requestPermission, isPaused, togglePause, removeNotificationPair, updatePairCount } from './notifications.js';
import { escapeHtml } from './stop-popup.js';
import { getStopData, getRouteMetadata, getDirectionDestinations, isTerminusStop } from './map.js';
import { refreshAllHighlights } from './stop-markers.js';

let statusEl = null;
let panelEl = null;
let toggleBtn = null;

/** Detect iOS (iPhone/iPad/iPod) via user agent. */
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Detect standalone (Home Screen / installed PWA) mode. */
function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        navigator.standalone === true;
}

/**
 * Pure function to format count display for a notification pair.
 * Exported for testing purposes.
 *
 * @param {number|null} remainingCount — remaining count (null = unlimited)
 * @returns {string} — "N remaining" or "∞ unlimited"
 */
export function formatCountDisplay(remainingCount) {
    return remainingCount === null || remainingCount === undefined
        ? '∞ unlimited'
        : `${remainingCount} remaining`;
}

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
 * Listens for pair auto-delete events to update UI in real-time.
 *
 * @param {HTMLElement} statusElement — #notification-status element
 * @param {EventTarget} apiEventsTarget — EventTarget for API and notification events
 */
export function initNotificationUI(statusElement, apiEventsTarget = null) {
    statusEl = statusElement;
    updateStatus();

    // Detect permission changes when tab regains focus
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            updateStatus();
        }
    });

    // Listen for pair auto-delete to update status and panel
    if (apiEventsTarget) {
        apiEventsTarget.addEventListener('notification:pair-expired', () => {
            updateStatus();
            renderPanel();
        });
    }
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

    if (permission === 'denied') {
        statusEl.classList.add('notification-status--blocked');
        textEl.innerHTML = `Notifications blocked &mdash; <button class="notification-status__enable">Try again</button>`;
        bindEnableButton(textEl);
    } else if (permission === 'unavailable') {
        statusEl.classList.add('notification-status--blocked');
        if (isIOS() && !isStandalone()) {
            textEl.textContent = 'Add to Home Screen to enable notifications';
        } else if (isStandalone()) {
            textEl.textContent = 'Notifications not supported on this device';
        } else {
            textEl.textContent = 'Notifications not supported in this browser';
        }
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
 * Build chip picker HTML for editing a pair's count in the panel.
 * Similar to buildChipPickerHtml but uses pair ID instead of stop/route/direction.
 *
 * @param {string} pairId — pair ID to edit
 * @param {number|null} currentCount — current remaining count (null = unlimited)
 * @returns {string} HTML string
 */
function buildPanelChipPickerHtml(pairId, currentCount) {
    const isUnlimited = currentCount === null || currentCount === undefined;
    const isStandardCount = !isUnlimited && [1, 2, 3].includes(currentCount);
    const isCustomCount = !isUnlimited && !isStandardCount;

    // If current count is not 1/2/3/unlimited (e.g. 4 remaining from original 5),
    // pre-select the # chip and show the morph input pre-populated
    return `<div class="chip-picker chip-picker--panel" data-pair-id="${escapeHtml(pairId)}">
        <div class="chip-picker__chips">
            <button class="chip-picker__chip${isStandardCount && currentCount === 1 ? ' chip-picker__chip--selected' : ''}" data-count="1">1</button>
            <button class="chip-picker__chip${isStandardCount && currentCount === 2 ? ' chip-picker__chip--selected' : ''}" data-count="2">2</button>
            <button class="chip-picker__chip${isStandardCount && currentCount === 3 ? ' chip-picker__chip--selected' : ''}" data-count="3">3</button>
            <button class="chip-picker__chip${isCustomCount ? ' chip-picker__chip--selected chip-picker__chip--morphed' : ''}" data-count="custom">#</button>
            <input class="chip-picker__morph-input${isCustomCount ? ' chip-picker__morph-input--active' : ''}" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="1-99" maxlength="2" ${isCustomCount ? `value="${currentCount}"` : ''}>
            <button class="chip-picker__chip${isUnlimited ? ' chip-picker__chip--selected' : ''}" data-count="unlimited">∞</button>
        </div>
        <button class="chip-picker__apply" data-action="apply-count" data-pair-id="${escapeHtml(pairId)}"${isStandardCount ? ` data-count="${currentCount}"` : ''}${isUnlimited ? ' data-count="unlimited"' : ''}${isCustomCount ? ` data-count="${currentCount}"` : ''}>Apply</button>
    </div>`;
}

/**
 * Bind interactions for a panel chip picker.
 * Handles chip selection, custom input, and apply button.
 *
 * @param {HTMLElement} picker — the chip-picker--panel element
 * @param {string} pairId — pair ID being edited
 */
function bindPanelChipPicker(picker, pairId) {
    // Chip selection
    picker.querySelectorAll('.chip-picker__chip').forEach(chip => {
        chip.addEventListener('click', () => {
            picker.querySelectorAll('.chip-picker__chip').forEach(c => c.classList.remove('chip-picker__chip--selected'));
            chip.classList.add('chip-picker__chip--selected');

            const countValue = chip.dataset.count;
            const hashChip = picker.querySelector('[data-count="custom"]');
            const morphInput = picker.querySelector('.chip-picker__morph-input');
            const applyBtn = picker.querySelector('[data-action="apply-count"]');

            if (countValue === 'custom') {
                hashChip.classList.add('chip-picker__chip--morphed');
                morphInput.classList.add('chip-picker__morph-input--active');
                morphInput.focus();
            } else {
                if (hashChip) hashChip.classList.remove('chip-picker__chip--morphed');
                if (morphInput) {
                    morphInput.classList.remove('chip-picker__morph-input--active');
                    morphInput.value = '';
                }
                applyBtn.dataset.count = countValue;
            }
        });
    });

    // Apply button — update pair count
    const applyBtn = picker.querySelector('[data-action="apply-count"]');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            const selectedChip = picker.querySelector('.chip-picker__chip--selected');
            const customInput = picker.querySelector('.chip-picker__morph-input');

            let count;
            // If # chip is selected, read from morph input
            if (selectedChip?.dataset.count === 'custom') {
                const value = parseInt(customInput?.value, 10);
                if (isNaN(value) || value < 1 || value > 99) {
                    if (customInput) {
                        customInput.classList.add('chip-picker__morph-input--error');
                        customInput.value = '';
                        customInput.placeholder = '1-99';
                    }
                    return;
                }
                count = value;
            } else {
                const countStr = applyBtn.dataset.count;
                if (!countStr) return; // No chip selected yet
                count = countStr === 'unlimited' ? null : parseInt(countStr, 10);
            }

            updatePairCount(pairId, count);
            updateStatus();
            renderPanel(); // Re-render to show updated count
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

        // Compute count display string
        const countDisplay = formatCountDisplay(pair.remainingCount);

        return `
            <div class="notification-pair" data-pair-id="${escapeHtml(pair.id)}">
                <div>
                    <div class="notification-pair__info">${escapeHtml(checkpointName)} &rarr; ${escapeHtml(directionLabel)}</div>
                    <div class="notification-pair__route">${escapeHtml(routeName)}</div>
                    <div class="notification-pair__count" data-pair-id="${escapeHtml(pair.id)}">${countDisplay}</div>
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

    // Bind count text → reveal chip picker for editing
    listEl.querySelectorAll('.notification-pair__count').forEach(pairCountEl => {
        pairCountEl.addEventListener('click', () => {
            const pairId = pairCountEl.dataset.pairId;
            const pairs = getNotificationPairs();
            const pair = pairs.find(p => p.id === pairId);
            if (!pair) return;

            // Collapse any existing panel chip picker
            listEl.querySelectorAll('.chip-picker--panel').forEach(el => el.remove());

            // Insert chip picker after the count element
            const pairDiv = pairCountEl.closest('.notification-pair');
            if (pairDiv) {
                pairDiv.insertAdjacentHTML('beforeend', buildPanelChipPickerHtml(pairId, pair.remainingCount));

                // Bind chip picker interactions within this picker
                const picker = pairDiv.querySelector('.chip-picker--panel');
                bindPanelChipPicker(picker, pairId);
            }
        });
    });
}
