// src/stop-markers.js — Renders stop markers on map for visible routes
import { getStopData, getRouteStopsMap, getRouteColorMap, getRouteMetadata, snapToRoutePolyline, isTerminusStop, getDirectionDestinations } from './map.js';
import { formatStopPopup, escapeHtml, buildChipPickerHtml } from './stop-popup.js';
import { addNotificationPair, getNotificationPairs, MAX_PAIRS } from './notifications.js';
import { updateStatus as updateNotificationStatus, renderPanel } from './notification-ui.js';

// Map<stopId, L.CircleMarker> — tracks active stop markers on the map
const stopMarkers = new Map();

// L.LayerGroup for stop markers — organized as layer for batch show/hide
let stopLayerGroup = null;

// Map<stopId, Array<routeId>> — cache of which routes serve each stop
// Computed lazily on first popup open, invalidated on route visibility change
let stopRoutesMap = null;

// Leaflet map instance — stored for popup event delegation and popup close/open
let mapInstance = null;

/**
 * Build reverse mapping: stopId → Array<routeId>
 * Computed from routeStopsMap (routeId → Set<stopId>)
 * Used by stop popup to display which routes serve a stop.
 *
 * @returns {Map<string, Array<string>>}
 */
function buildStopRoutesMap() {
    const stopRoutesMapResult = new Map();
    const routeStopsMap = getRouteStopsMap();
    routeStopsMap.forEach((stopIds, routeId) => {
        stopIds.forEach((stopId) => {
            if (!stopRoutesMapResult.has(stopId)) {
                stopRoutesMapResult.set(stopId, []);
            }
            stopRoutesMapResult.get(stopId).push(routeId);
        });
    });
    return stopRoutesMapResult;
}

/**
 * Pure logic: Compute visible stops and their colors based on visible routes.
 * Extracted for testability (AC1.1, AC1.5).
 *
 * @param {Set<string>|Array<string>} visibleRouteIds — route IDs that should be visible
 * @param {Map<string, Set<string>>} routeStopsMap — route ID to set of stop IDs
 * @param {Map<string, string>} routeColorMap — route ID to hex color string
 * @returns {Object} — {visibleStopIds: Set<string>, stopColorMap: Map<string, string>, stopRouteMap: Map<string, string>}
 */
export function computeVisibleStops(visibleRouteIds, routeStopsMap, routeColorMap) {
    const visibleStopIds = new Set();
    const stopColorMap = new Map();
    const stopRouteMap = new Map();

    new Set(visibleRouteIds).forEach((routeId) => {
        const stopIds = routeStopsMap.get(routeId);
        if (stopIds) {
            stopIds.forEach((stopId) => {
                visibleStopIds.add(stopId);
                // First route to claim this stop sets its color and route (AC1.5: no stacking)
                if (!stopColorMap.has(stopId)) {
                    stopColorMap.set(stopId, routeColorMap.get(routeId) || '#888888');
                    stopRouteMap.set(stopId, routeId);
                }
            });
        }
    });

    return { visibleStopIds, stopColorMap, stopRouteMap };
}

/**
 * Compute config state for a stop popup.
 * Builds per-route direction info with labels and terminus status.
 *
 * @param {string} stopId — stop ID
 * @returns {Object} — {pairCount, maxPairs, existingAlerts, routeDirections}
 */
function getStopConfigState(stopId) {
    const pairs = getNotificationPairs();
    const routeMetadata = getRouteMetadata();

    // Find which alerts already exist at this stop
    const existingAlerts = pairs
        .filter(p => p.checkpointStopId === stopId)
        .map(p => ({ routeId: p.routeId, directionId: p.directionId }));

    // Build route directions for each route serving this stop
    if (!stopRoutesMap) {
        stopRoutesMap = buildStopRoutesMap();
    }
    const stopRouteIds = stopRoutesMap.get(stopId) || [];

    const routeDirections = stopRouteIds.map(routeId => {
        const meta = routeMetadata.find(m => m.id === routeId);
        const routeName = meta
            ? (meta.type === 2 ? meta.longName : meta.shortName)
            : routeId;
        const labels = getDirectionDestinations(routeId);
        const terminus = isTerminusStop(stopId, routeId);

        return {
            routeId,
            routeName,
            dir0Label: labels[0],
            dir1Label: labels[1],
            isTerminus: terminus,
        };
    });

    return {
        pairCount: pairs.length,
        maxPairs: MAX_PAIRS,
        existingAlerts,
        routeDirections,
    };
}

/**
 * Handle alert creation result: success path (update UI, close popup)
 * or error path (display inline error message).
 *
 * @param {Object} result — result from addNotificationPair() {error?, ...}
 * @param {string} stopId — stop ID for highlighting on success
 * @param {HTMLElement} container — popup container for error display
 */
function handleAlertResult(result, stopId, container) {
    if (result.error) {
        const actionsDiv = container.querySelector('.stop-popup__actions');
        if (actionsDiv) {
            actionsDiv.innerHTML = `<div class="stop-popup__alert-configured" style="color: #ff6b6b">${escapeHtml(result.error)}</div>`;
        }
    } else {
        highlightConfiguredStop(stopId);
        updateNotificationStatus();
        renderPanel();
        mapInstance.closePopup();
    }
}

/**
 * Highlight a configured stop by increasing marker size and opacity.
 *
 * @param {string} stopId — stop ID to highlight
 */
function highlightConfiguredStop(stopId) {
    const marker = stopMarkers.get(stopId);
    if (marker) {
        marker.setStyle({
            radius: 8,
            fillOpacity: 1.0,
            weight: 2,
        });
    }
}

/**
 * Restore visual highlights for all stops that are part of configured pairs.
 * Called on initStopMarkers to restore highlights after page reload.
 */
function restoreConfiguredHighlights() {
    const pairs = getNotificationPairs();
    for (const pair of pairs) {
        highlightConfiguredStop(pair.checkpointStopId);
    }
}

/**
 * Reset all stop markers to default style and re-apply highlights for current pairs.
 * Called when a notification pair is deleted to remove stale visual highlights.
 *
 * Resets: radius → 6, fillOpacity → 0.6, weight → 1
 * Then re-applies highlights (radius → 8, fillOpacity → 1.0, weight → 2) for stops in current pairs.
 */
export function refreshAllHighlights() {
    // First reset all markers to default style
    stopMarkers.forEach((marker) => {
        marker.setStyle({
            radius: 6,
            fillOpacity: 0.6,
            weight: 1,
        });
    });

    // Then re-apply highlights for stops in current pairs
    const pairs = getNotificationPairs();
    for (const pair of pairs) {
        highlightConfiguredStop(pair.checkpointStopId);
    }
}

/**
 * Initialize stop markers module.
 * Creates layer group, stores map instance for event delegation, and sets up popup event handling.
 *
 * @param {L.Map} map — Leaflet map instance
 * @param {EventTarget} [apiEventsTarget=null] — EventTarget for listening to notification:pair-expired events
 */
export function initStopMarkers(map, apiEventsTarget = null) {
    mapInstance = map;
    stopLayerGroup = L.layerGroup().addTo(map);

    // Listen for pair auto-delete to refresh stop highlights
    if (apiEventsTarget) {
        apiEventsTarget.addEventListener('notification:pair-expired', () => {
            refreshAllHighlights();
        });
    }

    // Set up popup event delegation for alert button clicks and hover persistence
    // AbortController prevents listener stacking across repeated popupopen events
    let popupAbort = null;

    mapInstance.on('popupclose', () => {
        if (popupAbort) {
            popupAbort.abort();
            popupAbort = null;
        }
    });

    mapInstance.on('popupopen', (e) => {
        const container = e.popup.getElement();
        if (!container) return;

        // Only handle stop popups (check for stop-popup class)
        if (!container.querySelector('.stop-popup')) return;

        // Abort any stale listeners from a previous popup
        if (popupAbort) popupAbort.abort();
        popupAbort = new AbortController();
        const { signal } = popupAbort;

        // Keep popup open when mouse enters popup area (cancel marker's mouseout timer)
        const sourceMarker = e.popup._source;
        if (sourceMarker) {
            container.addEventListener('mouseenter', () => {
                if (sourceMarker._hoverCloseTimer) {
                    clearTimeout(sourceMarker._hoverCloseTimer);
                    sourceMarker._hoverCloseTimer = null;
                }
            }, { signal });
            container.addEventListener('mouseleave', () => {
                // Don't auto-close if user has engaged with chip picker
                if (sourceMarker._popupSticky) return;
                mapInstance.closePopup();
            }, { signal });
        }

        // Handle direction button clicks — reveal chip picker
        container.addEventListener('click', async (e) => {
            const showChipsBtn = e.target.closest('[data-action="show-chips"]');
            if (showChipsBtn) {
                // Make popup sticky — only dismissible by click-away, not mouseout
                if (sourceMarker) sourceMarker._popupSticky = true;

                const stopId = showChipsBtn.dataset.stopId;
                const routeId = showChipsBtn.dataset.routeId;
                const directionId = parseInt(showChipsBtn.dataset.directionId, 10);

                // Collapse any existing chip picker in this popup (AC1.7)
                container.querySelectorAll('.chip-picker').forEach(el => el.remove());

                // Insert chip picker after the clicked button's parent route-alerts div
                const routeAlertsDiv = showChipsBtn.closest('.stop-popup__route-alerts');
                if (routeAlertsDiv) {
                    routeAlertsDiv.insertAdjacentHTML('afterend', buildChipPickerHtml(stopId, routeId, directionId));
                }
                return;
            }

            // Handle chip selection
            const chip = e.target.closest('.chip-picker__chip');
            if (chip) {
                const picker = chip.closest('.chip-picker');
                if (!picker) return;

                // Update selected state
                picker.querySelectorAll('.chip-picker__chip').forEach(c => c.classList.remove('chip-picker__chip--selected'));
                chip.classList.add('chip-picker__chip--selected');

                const countValue = chip.dataset.count;
                const hashChip = picker.querySelector('[data-count="custom"]');
                const morphInput = picker.querySelector('.chip-picker__morph-input');
                const createBtn = picker.querySelector('[data-action="create-alert"]');

                if (countValue === 'custom') {
                    // Morph # chip into inline input
                    hashChip.classList.add('chip-picker__chip--morphed');
                    morphInput.classList.add('chip-picker__morph-input--active');
                    morphInput.focus();
                } else {
                    // Restore # chip, collapse input
                    if (hashChip) hashChip.classList.remove('chip-picker__chip--morphed');
                    if (morphInput) {
                        morphInput.classList.remove('chip-picker__morph-input--active');
                        morphInput.value = '';
                    }
                    createBtn.dataset.count = countValue;
                }
                return;
            }

            // Handle "Set Alert" button click — create the pair
            const createBtn = e.target.closest('[data-action="create-alert"]');
            if (createBtn) {
                const picker = createBtn.closest('.chip-picker') || container.querySelector('.chip-picker');
                const selectedChip = picker?.querySelector('.chip-picker__chip--selected');
                const customInput = picker?.querySelector('.chip-picker__morph-input');

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
                    const countStr = createBtn.dataset.count;
                    count = countStr === 'unlimited' ? null : parseInt(countStr, 10);
                }

                const stopId = createBtn.dataset.stopId;
                const routeId = createBtn.dataset.routeId;
                const directionId = parseInt(createBtn.dataset.directionId, 10);

                const result = await addNotificationPair(stopId, routeId, directionId, count);
                handleAlertResult(result, stopId, container);
            }
        }, { signal });
    });

    // Restore highlights for any already-configured stops from localStorage
    restoreConfiguredHighlights();
}

/**
 * Update stop marker visibility based on currently visible routes.
 * Creates markers for newly visible stops, removes markers for hidden stops.
 *
 * @param {Set<string>|Array<string>} routeIds — route IDs that should be visible
 */
export function updateVisibleStops(routeIds) {
    const stopsData = getStopData();
    const routeStopsMap = getRouteStopsMap();
    const routeColorMap = getRouteColorMap();

    const { visibleStopIds, stopColorMap, stopRouteMap } = computeVisibleStops(routeIds, routeStopsMap, routeColorMap);

    // Detect hover support (desktop vs touch)
    const hasHover = window.matchMedia('(hover: hover)').matches;

    // Collect stops to remove (avoid modifying Map during iteration)
    const stopsToRemove = [];
    stopMarkers.forEach((marker, stopId) => {
        if (!visibleStopIds.has(stopId)) {
            stopsToRemove.push(stopId);
        }
    });

    // Remove markers for stops no longer visible
    stopsToRemove.forEach((stopId) => {
        const marker = stopMarkers.get(stopId);
        stopLayerGroup.removeLayer(marker);
        stopMarkers.delete(stopId);
    });

    // Invalidate stopRoutesMap cache on route visibility change
    stopRoutesMap = null;

    // Add markers for newly visible stops
    visibleStopIds.forEach((stopId) => {
        if (!stopMarkers.has(stopId)) {
            const stop = stopsData.get(stopId);
            // Skip stops without coordinates
            if (!stop || !stop.latitude || !stop.longitude) return;

            // Snap stop position to nearest point on its route's polyline
            const ownerRouteId = stopRouteMap.get(stopId);
            const snapped = ownerRouteId
                ? snapToRoutePolyline(stop.latitude, stop.longitude, ownerRouteId)
                : { lat: stop.latitude, lng: stop.longitude };

            const color = stopColorMap.get(stopId) || '#888888';
            const marker = L.circleMarker([snapped.lat, snapped.lng], {
                radius: 6,
                color: color,
                fillColor: color,
                fillOpacity: 0.6,
                weight: 1,
                opacity: 0.8,
                pane: 'overlayPane',
            });

            // Build popup content dynamically on each popup open
            // This ensures config state is always fresh
            const popupFunction = () => {
                // Compute stopRoutesMap lazily on first use
                if (!stopRoutesMap) {
                    stopRoutesMap = buildStopRoutesMap();
                }

                const stopRouteIds = stopRoutesMap.get(stopId) || [];
                const routeMetadata = getRouteMetadata();
                const routeInfos = stopRouteIds
                    .map(rid => routeMetadata.find(m => m.id === rid))
                    .filter(Boolean);

                const configState = getStopConfigState(stopId);
                return formatStopPopup(stop, routeInfos, configState);
            };

            marker.bindPopup(popupFunction, {
                className: 'stop-popup-container',
                closeButton: true,
                autoPan: false,
            });

            // Desktop: hover to show popup, stays open while cursor is over marker OR popup
            if (hasHover) {
                marker.on('mouseover', function () {
                    if (this._hoverCloseTimer) {
                        clearTimeout(this._hoverCloseTimer);
                        this._hoverCloseTimer = null;
                    }
                    this.openPopup();
                });
                marker.on('mouseout', function () {
                    // Don't auto-close if user engaged with chip picker
                    if (this._popupSticky) return;
                    const self = this;
                    self._hoverCloseTimer = setTimeout(() => {
                        self.closePopup();
                        self._hoverCloseTimer = null;
                    }, 300);
                });

                // Reset sticky flag when popup closes
                marker.on('popupclose', function () {
                    this._popupSticky = false;
                });
            }

            stopMarkers.set(stopId, marker);
            stopLayerGroup.addLayer(marker);
        }
    });
}
