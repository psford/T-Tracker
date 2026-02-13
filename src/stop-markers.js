// src/stop-markers.js — Renders stop markers on map for visible routes
import { getStopData, getRouteStopsMap, getRouteColorMap } from './map.js';

// Map<stopId, L.CircleMarker> — tracks active stop markers on the map
const stopMarkers = new Map();

// L.LayerGroup for stop markers — organized as layer for batch show/hide
let stopLayerGroup = null;

/**
 * Pure logic: Compute visible stops and their colors based on visible routes.
 * Extracted for testability (AC1.1, AC1.5).
 *
 * @param {Set<string>|Array<string>} visibleRouteIds — route IDs that should be visible
 * @param {Map<string, Set<string>>} routeStopsMap — route ID to set of stop IDs
 * @param {Map<string, string>} routeColorMap — route ID to hex color string
 * @returns {Object} — {visibleStopIds: Set<string>, stopColorMap: Map<string, string>}
 */
export function computeVisibleStops(visibleRouteIds, routeStopsMap, routeColorMap) {
    const visibleStopIds = new Set();
    const stopColorMap = new Map();

    new Set(visibleRouteIds).forEach((routeId) => {
        const stopIds = routeStopsMap.get(routeId);
        if (stopIds) {
            stopIds.forEach((stopId) => {
                visibleStopIds.add(stopId);
                // First route to claim this stop sets its color (AC1.5: no stacking)
                if (!stopColorMap.has(stopId)) {
                    stopColorMap.set(stopId, routeColorMap.get(routeId) || '#888888');
                }
            });
        }
    });

    return { visibleStopIds, stopColorMap };
}

/**
 * Initialize stop markers module.
 * Creates layer group and prepares for rendering markers on visible routes.
 *
 * @param {L.Map} map — Leaflet map instance
 */
export function initStopMarkers(map) {
    stopLayerGroup = L.layerGroup().addTo(map);
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

    const { visibleStopIds, stopColorMap } = computeVisibleStops(routeIds, routeStopsMap, routeColorMap);

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

    // Add markers for newly visible stops
    visibleStopIds.forEach((stopId) => {
        if (!stopMarkers.has(stopId)) {
            const stop = stopsData.get(stopId);
            // Skip stops without coordinates
            if (!stop || !stop.latitude || !stop.longitude) return;

            const color = stopColorMap.get(stopId) || '#888888';
            const marker = L.circleMarker([stop.latitude, stop.longitude], {
                radius: 3,
                color: color,
                fillColor: color,
                fillOpacity: 0.6,
                weight: 1,
                opacity: 0.8,
                pane: 'overlayPane',
            });

            stopMarkers.set(stopId, marker);
            stopLayerGroup.addLayer(marker);
        }
    });
}
