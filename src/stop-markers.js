// src/stop-markers.js — Renders stop markers on map for visible routes
import { getStopData, getRouteStopsMap, getRouteColorMap, getRouteMetadata, snapToRoutePolyline } from './map.js';
import { formatStopPopup, escapeHtml } from './stop-popup.js';
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

// Two-click workflow state: checkpoint stop ID selected first
let pendingCheckpointStopId = null;

// Two-click workflow state: route ID for the pending checkpoint
let pendingRouteId = null;

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
 * Compute config state for a stop based on notification pairs and pending checkpoint.
 * Used to pass dynamic state to formatStopPopup on each popup open.
 *
 * @param {string} stopId — stop ID
 * @returns {Object} — {isCheckpoint, isDestination, pairCount, pendingCheckpoint, pendingCheckpointName, maxPairs}
 */
function getStopConfigState(stopId) {
    const pairs = getNotificationPairs();
    const stopsData = getStopData();

    // Resolve pending checkpoint stop ID to human-readable name
    const pendingName = pendingCheckpointStopId
        ? (stopsData.get(pendingCheckpointStopId)?.name || pendingCheckpointStopId)
        : null;

    return {
        isCheckpoint: pairs.some(p => p.checkpointStopId === stopId),
        isDestination: pairs.some(p => p.myStopId === stopId),
        pairCount: pairs.length,
        pendingCheckpoint: pendingCheckpointStopId,
        pendingCheckpointName: pendingName,
        maxPairs: MAX_PAIRS,
    };
}

/**
 * Highlight a configured stop by increasing marker size and opacity.
 * Called after successful notification pair creation to visually distinguish
 * stops that are part of configured pairs.
 *
 * @param {string} stopId — stop ID to highlight
 */
function highlightConfiguredStop(stopId) {
    const marker = stopMarkers.get(stopId);
    if (marker) {
        marker.setStyle({
            radius: 8,           // Larger than default 6
            fillOpacity: 1.0,    // Full opacity vs default 0.6
            weight: 2,           // Thicker border
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
        highlightConfiguredStop(pair.myStopId);
    }
}

/**
 * Reset all stop markers to default style and re-apply highlights for current pairs.
 * Called when a notification pair is deleted to remove stale visual highlights.
 * This is simpler than tracking individual stop→pair associations.
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
        highlightConfiguredStop(pair.myStopId);
    }
}

/**
 * Initialize stop markers module.
 * Creates layer group, stores map instance for event delegation, and sets up popup event handling.
 *
 * @param {L.Map} map — Leaflet map instance
 */
export function initStopMarkers(map) {
    mapInstance = map;
    stopLayerGroup = L.layerGroup().addTo(map);

    // Set up popup event delegation for config button clicks and hover persistence
    mapInstance.on('popupopen', (e) => {
        const container = e.popup.getElement();
        if (!container) return;

        // Only handle stop popups (check for stop-popup class)
        if (!container.querySelector('.stop-popup')) return;

        // Keep popup open when mouse enters popup area (cancel marker's mouseout timer)
        const sourceMarker = e.popup._source;
        if (sourceMarker) {
            container.addEventListener('mouseenter', () => {
                if (sourceMarker._hoverCloseTimer) {
                    clearTimeout(sourceMarker._hoverCloseTimer);
                    sourceMarker._hoverCloseTimer = null;
                }
            });
            container.addEventListener('mouseleave', () => {
                mapInstance.closePopup();
            });
        }

        const checkpointBtn = container.querySelector('[data-action="set-checkpoint"]');
        const destBtn = container.querySelector('[data-action="set-destination"]');

        if (checkpointBtn) {
            checkpointBtn.addEventListener('click', () => {
                const stopId = checkpointBtn.dataset.stopId;
                const routeIds = checkpointBtn.dataset.routeIds;
                pendingCheckpointStopId = stopId;
                pendingRouteId = routeIds ? routeIds.split(',')[0] : null;
                // Close popup so user can click destination stop
                mapInstance.closePopup();
            });
        }

        if (destBtn) {
            destBtn.addEventListener('click', async () => {
                const destStopId = destBtn.dataset.stopId;
                if (!pendingCheckpointStopId) {
                    // No checkpoint selected yet — set this as destination directly
                    // (user needs to click checkpoint first)
                    return;
                }
                const result = await addNotificationPair(
                    pendingCheckpointStopId, destStopId, pendingRouteId
                );
                if (result.error) {
                    // Show error in popup (replace actions content)
                    const actionsDiv = container.querySelector('.stop-popup__actions');
                    if (actionsDiv) {
                        actionsDiv.innerHTML = `<div class="stop-popup__configured" style="color: #ff6b6b">${escapeHtml(result.error)}</div>`;
                    }
                } else {
                    // Success — highlight configured stops, clear pending state
                    highlightConfiguredStop(pendingCheckpointStopId);
                    highlightConfiguredStop(destStopId);
                    pendingCheckpointStopId = null;
                    pendingRouteId = null;
                    // AC6.5: Update status indicator to show new pair count
                    updateNotificationStatus();
                    // AC10: Update panel to show new pair in list
                    renderPanel();
                    mapInstance.closePopup();
                }
            });
        }
    });

    // Restore highlights for any already-configured stops from localStorage
    restoreConfiguredHighlights();
}

/**
 * Update stop marker visibility based on currently visible routes.
 * Creates markers for newly visible stops, removes markers for hidden stops.
 * Follows the deduplication pattern from AC1.5: same physical stop on multiple routes
 * gets one marker with the color of the first visible route claiming it.
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
            // This ensures config state (pending checkpoint, pair count, etc.) is always fresh
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

            // Desktop: hover to show popup with delayed close for button interaction
            if (hasHover) {
                marker.on('mouseover', function () {
                    if (this._hoverCloseTimer) {
                        clearTimeout(this._hoverCloseTimer);
                        this._hoverCloseTimer = null;
                    }
                    this.openPopup();
                });
                marker.on('mouseout', function () {
                    const self = this;
                    self._hoverCloseTimer = setTimeout(() => {
                        self.closePopup();
                        self._hoverCloseTimer = null;
                    }, 300);
                });
            }

            stopMarkers.set(stopId, marker);
            stopLayerGroup.addLayer(marker);
        }
    });
}
