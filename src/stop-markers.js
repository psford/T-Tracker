// src/stop-markers.js — Renders stop markers on map for visible routes
import { getStopData, getRouteStopsMap, getRouteColorMap, getRouteMetadata, snapToRoutePolyline, isTerminusStop, getDirectionDestinations } from './map.js';
import { formatStopPopup, escapeHtml, buildChipPickerHtml } from './stop-popup.js';
import { addNotificationPair, getNotificationPairs, MAX_PAIRS } from './notifications.js';
import { updateStatus as updateNotificationStatus, renderPanel } from './notification-ui.js';
import { haversineDistance } from './vehicle-math.js';

// Map<stopId, L.Marker> — tracks active stop markers on the map
const stopMarkers = new Map();

// Map<childStopId, parentStopId> — reverse lookup for merged stops
// When a child stop is part of a merged group, this maps child → parent marker key
const childToParentMap = new Map();

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
 * Create a stop marker with divIcon and stopPane assignment.
 * Extracted for testability (touch-targets.AC1.1, AC1.2, AC2.1, AC4.1).
 *
 * @param {number} lat — latitude
 * @param {number} lng — longitude
 * @param {string} color — hex color string (e.g., '#DA291C')
 * @returns {L.Marker} — marker with divIcon and stopPane set
 */
export function createStopMarker(lat, lng, color) {
    return L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'stop-marker',
            iconSize: [44, 44],
            iconAnchor: [22, 22],
            html: `<div class="stop-dot" style="--stop-color: ${color}"></div>`,
        }),
        pane: 'stopPane',
    });
}

/**
 * Pure logic: Compute visible stops and their colors based on visible routes.
 * Extends to group child stops by parent station and return merged stop data.
 * Extracted for testability (AC1.1, AC1.5, stop-marker-merging.AC1.1-5).
 *
 * @param {Set<string>|Array<string>} visibleRouteIds — route IDs that should be visible
 * @param {Map<string, Set<string>>} routeStopsMap — route ID to set of stop IDs
 * @param {Map<string, string>} routeColorMap — route ID to hex color string
 * @param {Map<string, Object>} stopsData — stop ID to stop object with {parentStopId, latitude, longitude}. Optional; null for backwards compat.
 * @returns {Object} — {visibleStopIds: Set<string>, stopColorMap: Map<string, string>, stopRouteMap: Map<string, string>, mergedStops: Map<string, {lat, lng, childStopIds, color}>}
 */
export function computeVisibleStops(visibleRouteIds, routeStopsMap, routeColorMap, stopsData = null) {
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

    const mergedStops = new Map();

    // If stopsData is provided, compute parent grouping
    if (stopsData) {
        // Build parentGroups: Map<parentId, string[]>
        const parentGroups = new Map();

        visibleStopIds.forEach((stopId) => {
            const stop = stopsData.get(stopId);
            if (stop && stop.parentStopId && stopsData.has(stop.parentStopId)) {
                if (!parentGroups.has(stop.parentStopId)) {
                    parentGroups.set(stop.parentStopId, []);
                }
                parentGroups.get(stop.parentStopId).push(stopId);
            }
        });

        // For each group with 2+ children: check all pairwise distances
        parentGroups.forEach((childStopIds, parentId) => {
            // Single child in parent group → don't merge
            if (childStopIds.length < 2) {
                return;
            }

            // Check all pairwise distances using haversineDistance
            let shouldMerge = true;
            for (let i = 0; i < childStopIds.length && shouldMerge; i++) {
                for (let j = i + 1; j < childStopIds.length && shouldMerge; j++) {
                    const stop1 = stopsData.get(childStopIds[i]);
                    const stop2 = stopsData.get(childStopIds[j]);

                    if (stop1 && stop2) {
                        const distance = haversineDistance(
                            stop1.latitude,
                            stop1.longitude,
                            stop2.latitude,
                            stop2.longitude
                        );

                        // If any pair exceeds 200m, skip merging this group
                        if (distance > 200) {
                            shouldMerge = false;
                        }
                    }
                }
            }

            // If merge is valid, compute averaged lat/lng and store in mergedStops
            if (shouldMerge) {
                let sumLat = 0;
                let sumLng = 0;

                childStopIds.forEach((stopId) => {
                    const stop = stopsData.get(stopId);
                    if (stop) {
                        sumLat += stop.latitude;
                        sumLng += stop.longitude;
                    }
                });

                const avgLat = sumLat / childStopIds.length;
                const avgLng = sumLng / childStopIds.length;

                // Use first child stop's color (deterministic based on route iteration order)
                const firstChildId = childStopIds[0];
                const color = stopColorMap.get(firstChildId) || '#888888';

                mergedStops.set(parentId, {
                    lat: avgLat,
                    lng: avgLng,
                    childStopIds,
                    color,
                });
            }
        });
    }

    return { visibleStopIds, stopColorMap, stopRouteMap, mergedStops };
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
    // Direct lookup first, then check if this child belongs to a merged parent
    const markerId = stopMarkers.has(stopId) ? stopId : childToParentMap.get(stopId);
    if (!markerId) return;
    const marker = stopMarkers.get(markerId);
    if (!marker) return;
    const el = marker.getElement();
    if (!el) return;
    const dot = el.querySelector('.stop-dot');
    if (dot) dot.classList.add('stop-dot--configured');
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
 * Removes .stop-dot--configured class from all stop dots, restoring default 12px route-colored appearance.
 * Then re-applies .stop-dot--configured class for stops in current notification pairs.
 */
export function refreshAllHighlights() {
    // First reset all markers to default style (remove configured class)
    stopMarkers.forEach((marker) => {
        const el = marker.getElement();
        if (!el) return;
        const dot = el.querySelector('.stop-dot');
        if (dot) dot.classList.remove('stop-dot--configured');
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

    const { visibleStopIds, stopColorMap, stopRouteMap, mergedStops } = computeVisibleStops(routeIds, routeStopsMap, routeColorMap, stopsData);

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
            const marker = createStopMarker(snapped.lat, snapped.lng, color);

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
