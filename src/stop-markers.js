// src/stop-markers.js — Renders stop markers on map for visible routes
import { getStopData, getRouteStopsMap, getRouteColorMap, getRouteMetadata, snapToRoutePolyline, isTerminusStop, getDirectionDestinations } from './map.js';
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
 */
export function initStopMarkers(map) {
    mapInstance = map;
    stopLayerGroup = L.layerGroup().addTo(map);

    // Set up popup event delegation for alert button clicks and hover persistence
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

        // One-click alert: handle all set-alert buttons
        const alertBtns = container.querySelectorAll('[data-action="set-alert"]');
        alertBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                const stopId = btn.dataset.stopId;
                const routeId = btn.dataset.routeId;
                const directionId = parseInt(btn.dataset.directionId, 10);

                const result = await addNotificationPair(stopId, routeId, directionId);
                if (result.error) {
                    // Show error in popup
                    const actionsDiv = container.querySelector('.stop-popup__actions');
                    if (actionsDiv) {
                        actionsDiv.innerHTML = `<div class="stop-popup__alert-configured" style="color: #ff6b6b">${escapeHtml(result.error)}</div>`;
                    }
                } else {
                    // Success — highlight stop, update UI
                    highlightConfiguredStop(stopId);
                    updateNotificationStatus();
                    renderPanel();
                    mapInstance.closePopup();
                }
            });
        });
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
