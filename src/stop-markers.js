// src/stop-markers.js — Renders stop markers on map for visible routes
import { getStopData, getRouteStopsMap, getRouteColorMap, getRouteMetadata, getVisibleRoutes, getRouteStopDirectionsMap, isTerminusStop, getDirectionDestinations, snapToRoutePolyline } from './map.js';
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

        // Proximity-based grouping: catches divided-road bus stops that share no parentStopId.
        // Two stops on the same primary route within PROXIMITY_THRESHOLD meters are merged.
        // Using the same-route requirement prevents merging unrelated stops at busy intersections.
        const PROXIMITY_THRESHOLD = 40; // meters — covers typical divided-road widths
        const mergedChildIds = new Set([...mergedStops.values()].flatMap(g => g.childStopIds));
        const ungrouped = [...visibleStopIds].filter(id => !mergedChildIds.has(id));
        const proximityGrouped = new Set();

        ungrouped.forEach((stopId) => {
            if (proximityGrouped.has(stopId)) return;
            const stop = stopsData.get(stopId);
            if (!stop || !stop.latitude || !stop.longitude) return;
            const stopRoute = stopRouteMap.get(stopId);

            const nearby = ungrouped.filter((otherId) => {
                if (otherId === stopId || proximityGrouped.has(otherId)) return false;
                if (stopRouteMap.get(otherId) !== stopRoute) return false;
                const other = stopsData.get(otherId);
                if (!other || !other.latitude || !other.longitude) return false;
                return haversineDistance(stop.latitude, stop.longitude, other.latitude, other.longitude) <= PROXIMITY_THRESHOLD;
            });

            if (nearby.length > 0) {
                const group = [stopId, ...nearby];
                group.forEach(id => proximityGrouped.add(id));

                const coords = group.map(id => stopsData.get(id));
                const lat = coords.reduce((sum, s) => sum + s.latitude, 0) / coords.length;
                const lng = coords.reduce((sum, s) => sum + s.longitude, 0) / coords.length;
                const color = stopColorMap.get(stopId) || '#888888';

                mergedStops.set(stopId, { lat, lng, childStopIds: group, color });
            }
        });
    }

    return { visibleStopIds, stopColorMap, stopRouteMap, mergedStops };
}

/**
 * Compute config state for a stop popup.
 * Builds per-route direction info with labels and terminus status.
 * Extended to support merged markers: aggregates route info and config state across multiple child stops.
 *
 * @param {string} stopId — stop ID (used as parent ID for merged markers)
 * @param {Array<string>} [childStopIds=null] — optional array of child stop IDs for merged marker aggregation
 * @returns {Object} — {pairCount, maxPairs, existingAlerts, routeDirections}
 *   When childStopIds provided: aggregates routes from all children, adds stopId field to each routeDirection
 */
export function getStopConfigState(stopId, childStopIds = null) {
    const pairs = getNotificationPairs();
    const routeMetadata = getRouteMetadata();

    // When childStopIds provided, aggregate across all child stops; otherwise single stop
    const stopsToCheck = childStopIds || [stopId];

    // Find which alerts already exist at any of these stops
    const existingAlerts = pairs
        .filter(p => stopsToCheck.includes(p.checkpointStopId))
        .map(p => ({ routeId: p.routeId, directionId: p.directionId }));

    // Build route directions aggregated from all stops
    if (!stopRoutesMap) {
        stopRoutesMap = buildStopRoutesMap();
    }

    // Collect all unique routes serving any child stop, tracking which child serves each route
    const routeToChildMap = new Map(); // routeId -> childStopId that serves it
    stopsToCheck.forEach(cid => {
        const stopRouteIds = stopRoutesMap.get(cid) || [];
        stopRouteIds.forEach(routeId => {
            if (!routeToChildMap.has(routeId)) {
                routeToChildMap.set(routeId, cid);
            }
        });
    });

    const routeDirections = Array.from(routeToChildMap.entries()).map(([routeId, childStopIdForRoute]) => {
        const meta = routeMetadata.find(m => m.id === routeId);
        const routeName = meta
            ? (meta.type === 2 ? meta.longName : meta.shortName)
            : routeId;
        const labels = getDirectionDestinations(routeId);
        const terminus = isTerminusStop(childStopIdForRoute, routeId);

        // Check direction availability: on rail split sections, a stop may only serve one direction.
        // Non-rail routes always show both directions — bus stops serve both even if MBTA API
        // reports separate physical stops per direction (opposite sides of street).
        const isRail = meta && (meta.type === 0 || meta.type === 1);
        const dirMap = isRail ? getRouteStopDirectionsMap().get(routeId) : undefined;
        const dirOnly = dirMap ? dirMap.get(childStopIdForRoute) : undefined;

        const result = {
            routeId,
            routeName,
            dir0Label: labels[0],
            dir1Label: labels[1],
            isTerminus: terminus,
            availableDirections: dirOnly !== undefined ? [dirOnly] : [0, 1],
        };

        // For merged stops (childStopIds provided), add stopId field to indicate which child to use for alert creation
        if (childStopIds) {
            result.stopId = childStopIdForRoute;
        }

        return result;
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
 * Attach hover/mouseout/popupclose behavior to a marker.
 * Encapsulates: on hover show popup, on mouseout hide (with delay), on popupclose reset sticky flag.
 * Shared between merged markers and individual markers (touch-targets.AC2.3).
 *
 * @param {L.Marker} marker — marker to attach hover behavior to
 */
function attachHoverBehavior(marker) {
    marker.on('mouseover', function () {
        if (this._hoverCloseTimer) {
            clearTimeout(this._hoverCloseTimer);
            this._hoverCloseTimer = null;
        }
        this.openPopup();
    });
    marker.on('mouseout', function () {
        // Don't auto-close if user engaged with chip picker or merged marker popup
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

/**
 * Resolve a stop ID to its marker key (direct or via parent mapping).
 * Encapsulates: if stop has direct marker, return stopId; else check childToParentMap.
 * Used by highlightConfiguredStop and tests to find the actual marker key.
 *
 * @param {string} stopId — stop ID to resolve
 * @returns {string|undefined} — marker key (stopId or parentId), or undefined if not found
 */
export function resolveMarkerKey(stopId) {
    return stopMarkers.has(stopId) ? stopId : childToParentMap.get(stopId);
}

/**
 * Highlight a configured stop by increasing marker size and opacity.
 *
 * @param {string} stopId — stop ID to highlight
 */
function highlightConfiguredStop(stopId) {
    const markerId = resolveMarkerKey(stopId);
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

                // Insert chip picker after the clicked button's parent route row
                const routeRow = showChipsBtn.closest('.stop-popup__route-row');
                if (routeRow) {
                    routeRow.insertAdjacentHTML('afterend', buildChipPickerHtml(stopId, routeId, directionId));
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

    // Step 1: Collect stops to remove (avoid modifying Map during iteration)
    // Parent-keyed markers are not in visibleStopIds, so check against currentMergedParentIds
    const currentMergedParentIds = new Set(mergedStops.keys());

    const stopsToRemove = [];
    stopMarkers.forEach((marker, stopId) => {
        if (!visibleStopIds.has(stopId) && !currentMergedParentIds.has(stopId)) {
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

    // Step 2: Rebuild childToParentMap and collect merged child IDs
    childToParentMap.clear();
    const mergedChildIds = new Set();
    mergedStops.forEach(({ childStopIds }, parentId) => {
        childStopIds.forEach(cid => {
            childToParentMap.set(cid, parentId);
            mergedChildIds.add(cid);
        });
    });

    // Step 3: Create merged markers
    mergedStops.forEach(({ lat, lng, childStopIds, color }, parentId) => {
        if (!stopMarkers.has(parentId)) {
            // Distance-capped snap for merged markers: try all visible routes
            // serving any child stop, pick nearest polyline point within threshold
            let markerLat = lat;
            let markerLng = lng;
            const SNAP_THRESHOLD = 75; // meters — covers underground stations (Andrew ~64m)
            let bestSnapDist = Infinity;
            const childSet = new Set(childStopIds);

            new Set(routeIds).forEach((rid) => {
                const routeStops = routeStopsMap.get(rid);
                if (!routeStops) return;
                // Check if any child stop is served by this route
                let serves = false;
                childSet.forEach(cid => { if (routeStops.has(cid)) serves = true; });
                if (!serves) return;
                const snapped = snapToRoutePolyline(lat, lng, rid);
                const dist = haversineDistance(lat, lng, snapped.lat, snapped.lng);
                if (dist < bestSnapDist && dist <= SNAP_THRESHOLD) {
                    bestSnapDist = dist;
                    markerLat = snapped.lat;
                    markerLng = snapped.lng;
                }
            });

            const marker = createStopMarker(markerLat, markerLng, color);

            // Store child IDs for popup and highlight lookup
            marker._childStopIds = childStopIds;
            marker._isMerged = true;

            // Bind popup with aggregating content for merged marker
            const popupFunction = () => {
                if (!stopRoutesMap) {
                    stopRoutesMap = buildStopRoutesMap();
                }

                // Aggregate routes from all child stops, filtered to currently visible routes.
                // Note: Similar route aggregation logic exists in getStopConfigState;
                // both iterate childStopIds and collect unique routes from stopRoutesMap.
                const allRouteIds = new Set();
                const allRouteInfos = [];
                const routeMetadata = getRouteMetadata();
                const visible = getVisibleRoutes();

                childStopIds.forEach(cid => {
                    const childRouteIds = stopRoutesMap.get(cid) || [];
                    childRouteIds.forEach(rid => {
                        if (!allRouteIds.has(rid) && visible.has(rid)) {
                            allRouteIds.add(rid);
                            const meta = routeMetadata.find(m => m.id === rid);
                            if (meta) allRouteInfos.push(meta);
                        }
                    });
                });

                // Use parent stop data for popup header (name)
                const parentStop = stopsData.get(parentId) || stopsData.get(childStopIds[0]);
                const configState = getStopConfigState(parentId, childStopIds);
                return formatStopPopup(parentStop, allRouteInfos, configState);
            };

            marker.bindPopup(popupFunction, {
                className: 'stop-popup-container',
                closeButton: true,
                autoPan: false,
                maxWidth: 400,
            });

            // Desktop: hover to show popup, stays open while cursor is over marker OR popup
            if (hasHover) {
                attachHoverBehavior(marker);
            }

            stopMarkers.set(parentId, marker);
            stopLayerGroup.addLayer(marker);
        }
    });

    // Add markers for newly visible stops
    visibleStopIds.forEach((stopId) => {
        if (mergedChildIds.has(stopId)) return; // Handled by merged marker
        if (!stopMarkers.has(stopId)) {
            const stop = stopsData.get(stopId);
            // Skip stops without coordinates
            if (!stop || !stop.latitude || !stop.longitude) return;

            const color = stopColorMap.get(stopId) || '#888888';

            // Distance-capped snap: try ALL visible routes serving this stop,
            // pick the nearest polyline point within 30m. No single "owner" route.
            let markerLat = stop.latitude;
            let markerLng = stop.longitude;
            const SNAP_THRESHOLD = 75; // meters — covers underground stations (Andrew ~64m)
            let bestSnapDist = Infinity;

            new Set(routeIds).forEach((rid) => {
                const routeStops = routeStopsMap.get(rid);
                if (!routeStops || !routeStops.has(stopId)) return;
                const snapped = snapToRoutePolyline(stop.latitude, stop.longitude, rid);
                const dist = haversineDistance(stop.latitude, stop.longitude, snapped.lat, snapped.lng);
                if (dist < bestSnapDist && dist <= SNAP_THRESHOLD) {
                    bestSnapDist = dist;
                    markerLat = snapped.lat;
                    markerLng = snapped.lng;
                }
            });

            const marker = createStopMarker(markerLat, markerLng, color);

            // Build popup content dynamically on each popup open
            // This ensures config state is always fresh
            const popupFunction = () => {
                // Compute stopRoutesMap lazily on first use
                if (!stopRoutesMap) {
                    stopRoutesMap = buildStopRoutesMap();
                }

                const stopRouteIds = stopRoutesMap.get(stopId) || [];
                const routeMetadata = getRouteMetadata();
                const visible = getVisibleRoutes();
                const routeInfos = stopRouteIds
                    .filter(rid => visible.has(rid))
                    .map(rid => routeMetadata.find(m => m.id === rid))
                    .filter(Boolean);

                const configState = getStopConfigState(stopId);
                return formatStopPopup(stop, routeInfos, configState);
            };

            marker.bindPopup(popupFunction, {
                className: 'stop-popup-container',
                closeButton: true,
                autoPan: false,
                maxWidth: 400,
            });

            // Desktop: hover to show popup, stays open while cursor is over marker OR popup
            if (hasHover) {
                attachHoverBehavior(marker);
            }

            stopMarkers.set(stopId, marker);
            stopLayerGroup.addLayer(marker);
        }
    });
}
