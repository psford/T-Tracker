// src/notification-ui.js — Notification status UI management
import { getNotificationPairs, getPermissionState, requestPermission } from './notifications.js';

let statusEl = null;

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
 * Update the status indicator based on current notification and permission state.
 * AC6.1: Active state shows "Active: X alerts monitored" (green)
 * AC6.3: Blocked state shows "Notifications blocked — Enable" button (red)
 * AC9.3: Warning banner shown when permission denied
 * AC9.4: Enable button triggers permission request
 * AC9.5: Status updates after permission change
 * AC6.2: Paused state (stub for Phase 6)
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

        // AC9.4: Enable button triggers permission request
        const enableBtn = textEl.querySelector('.notification-status__enable');
        if (enableBtn) {
            enableBtn.addEventListener('click', async () => {
                await requestPermission();
                // AC9.5: Refresh after permission change
                updateStatus();
            });
        }
    } else if (permission === 'default') {
        // Permission not yet requested
        statusEl.classList.add('notification-status--default');
        textEl.textContent = `${pairs.length} alert${pairs.length !== 1 ? 's' : ''} configured`;
    } else {
        // AC6.1: Active state — permission granted
        statusEl.classList.add('notification-status--active');
        textEl.textContent = `Active: ${pairs.length} alert${pairs.length !== 1 ? 's' : ''} monitored`;
    }
}
