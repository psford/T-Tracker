// src/map.js — MapLibre GL map initialization and layer management
import { config } from '../config.js';
import { buildBasemapStyle, resolveMaxZoom } from './basemap.js';
import { decodePolyline } from './polyline.js';
import { formatVehiclePopup } from './vehicle-popup.js';
import { bearingToTransform, haversineDistance, nearestPointOnSegment } from './vehicle-math.js';
import { shouldMergePolylines, mergePolylineSegments } from './polyline-merge.js';
import { VEHICLE_ICONS, DEFAULT_ICON } from './vehicle-icons.js';

// Route lines draw below vehicle markers, which draw below stop markers.
// Leaflet expressed this with panes (stopPane at z-index 625). MapLibre draws route
// lines inside the WebGL canvas and markers as DOM siblings above it, so only the two
// marker classes need ordering — but they need it explicitly, because DOM order is
// insertion order and vehicles arrive over SSE at unpredictable times relative to
// route hydration.
export const Z_INDEX = {
    routeLabel: 400,
    vehicleMarker: 600,
    stopMarker: 625,
};

// Route geometry, as plain [lat, lng] pairs — one array per branch.
// Under Leaflet these were L.polyline objects doubling as the geometry store, read
// back with getLatLngs(). They are plain data now: snapToRoutePolyline runs per
// marker per animation frame, and it should not walk library objects to do it.
const ROUTE_SOURCE_ID = 'routes';
const ROUTE_LAYER_ID = 'route-lines';

let map = null;

// Map<vehicleId, maplibregl.Marker> — tracks active vehicle markers on the map
const vehicleMarkers = new Map();

// Map<routeId, Array<Array<[lat, lng]>>> — branch geometry per route
const routePolylines = new Map();

// Array of route metadata [{id, color, shortName, longName, type}] — for Phase 6 UI
let routeMetadata = [];

// Set<routeId> — tracks currently visible route IDs for visibility filtering
let visibleRoutes = new Set();

// Map<routeId, color> — color lookup for vehicle markers (populated by loadRoutes)
const routeColorMap = new Map();

// Map<routeId, number> — route type lookup for vehicle markers (populated by loadRoutes)
const routeTypeMap = new Map();

// Map<stopId, {id, name, latitude, longitude}> — caches stop data fetched on startup
let stopsData = new Map();

// Map<routeId, Set<stopId>> — tracks which stops belong to which routes
const routeStopsMap = new Map();

// Map<routeId, Map<stopId, number>> — direction-only stops (0 or 1)
// Stops NOT in this map default to both directions.
let routeStopDirectionsMap = new Map();

// Map<routeId, maplibregl.Marker[]> — route name labels placed along polylines
const routeLabels = new Map();

// Track last updatedAt per vehicle to avoid unnecessary popup refreshes at 60fps
const lastPopupUpdatedAt = new Map();

export function initMap(containerId) {
    // config.map.center is [lat, lng]; MapLibre wants [lng, lat].
    const [centerLat, centerLng] = config.map.center;

    map = new maplibregl.Map({
        container: containerId,
        style: buildBasemapStyle(config.basemap),
        center: [centerLng, centerLat],
        zoom: config.map.zoom,
        minZoom: config.map.minZoom,
        maxZoom: resolveMaxZoom(config.basemap, config.map.maxZoom),
        attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    // Leaflet hung its instance off the container element, and the Playwright suite
    // drove the map through it. MapLibre does not, so put it back deliberately rather
    // than reaching into library internals from the tests.
    const container = map.getContainer();
    if (container) container.__maplibreMap = map;

    // The Leaflet tile-retry/backoff block that used to live here is gone on purpose:
    // MapLibre retries failed tile requests internally, so reimplementing it would be
    // a second retry loop fighting the first.

    // Route lines cannot be added until the style has loaded. Hydration can win that
    // race — static data comes out of localStorage and lands almost immediately — so
    // anything queued before the style is ready is replayed here.
    map.on('style.load', () => {
        styleReady = true;
        flushPendingRouteRender();
    });

    return map;
}

/**
 * True once MapLibre's style has loaded and sources/layers may be added.
 * Adding a source before this point throws, where Leaflet accepted layers any time.
 */
let styleReady = false;
let pendingRouteRender = false;

function flushPendingRouteRender() {
    if (!pendingRouteRender) return;
    pendingRouteRender = false;
    renderRouteLines();
}

/**
 * Rebuilds the route-line source and layer from routePolylines + visibleRoutes.
 *
 * All routes live in one GeoJSON source; visibility is a layer filter rather than
 * adding and removing objects. Colour comes off each feature so one layer draws every
 * route in its own colour.
 */
function renderRouteLines() {
    if (!map) return;
    if (!styleReady) {
        pendingRouteRender = true;
        return;
    }

    const features = [];
    routePolylines.forEach((branches, routeId) => {
        const color = routeColorMap.get(routeId) || '#888888';
        for (const branch of branches) {
            if (!branch || branch.length < 2) continue;
            features.push({
                type: 'Feature',
                properties: { routeId, color },
                // Stored as [lat, lng]; GeoJSON is [lng, lat].
                geometry: {
                    type: 'LineString',
                    coordinates: branch.map(([lat, lng]) => [lng, lat]),
                },
            });
        }
    });

    const data = { type: 'FeatureCollection', features };

    const existing = map.getSource(ROUTE_SOURCE_ID);
    if (existing) {
        // setData rather than remove-and-re-add: hydrateRoutes runs again on every
        // static-data staleness refresh, and MapLibre throws on a duplicate source id.
        existing.setData(data);
    } else {
        map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data });
        map.addLayer({
            id: ROUTE_LAYER_ID,
            type: 'line',
            source: ROUTE_SOURCE_ID,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
                'line-color': ['get', 'color'],
                'line-width': getAdaptiveWeight(visibleRoutes.size),
                'line-opacity': 0.9,
            },
        });
    }

    applyRouteLineVisibility();
}

/**
 * Applies the visible-route filter and the adaptive line weight to the route layer.
 */
function applyRouteLineVisibility() {
    if (!map || !styleReady || !map.getLayer(ROUTE_LAYER_ID)) return;

    map.setFilter(ROUTE_LAYER_ID, [
        'in', ['get', 'routeId'], ['literal', [...visibleRoutes]],
    ]);
    map.setPaintProperty(ROUTE_LAYER_ID, 'line-width', getAdaptiveWeight(visibleRoutes.size));
}

export function getMap() {
    return map;
}

// Fallback SVG polygon if icon data is missing (icons.AC6.6)
// Scaled from original arrow (12,2 22,20 12,16 2,20) in 24x24 viewBox
// to fit 0 0 48 32 viewBox: 2x horizontal, 1.333x vertical
const ARROW_FALLBACK = '<polygon points="24,3 44,27 24,21 4,27" fill="currentColor" />';

/**
 * Returns HTML string for vehicle marker icon based on vehicle type.
 * Determines vehicle type from routeTypeMap (populated from MBTA route metadata):
 * - Type 0 or 1 (subway) → class vehicle-marker--subway
 * - Type 2 (commuter rail) → class vehicle-marker--commuter-rail
 * - Type 3 (bus) or unknown → class vehicle-marker--bus
 *
 * Passes route color as CSS variable for marker styling.
 *
 * This is the single point of change for swapping placeholder arrows to proper icons.
 *
 * @param {object} vehicle — vehicle object with routeId, color property
 * @returns {string} — HTML string for marker content
 */
export function getVehicleIconHtml(vehicle) {
    const routeType = routeTypeMap.get(vehicle.routeId);
    let markerClass;
    if (routeType === 0 || routeType === 1) {
        markerClass = 'vehicle-marker--subway';
    } else if (routeType === 2) {
        markerClass = 'vehicle-marker--commuter-rail';
    } else {
        markerClass = 'vehicle-marker--bus';
    }

    const routeColor = routeColorMap.get(vehicle.routeId) || '#888888';
    const iconSvg = VEHICLE_ICONS[routeType] || DEFAULT_ICON || ARROW_FALLBACK;

    // Inline SVG with type-specific icon from vehicle-icons module
    return `<div class="vehicle-marker ${markerClass}" style="--route-color: ${routeColor}; color: ${routeColor}">
        <svg class="vehicle-icon" viewBox="0 0 48 32" xmlns="http://www.w3.org/2000/svg">
            ${iconSvg}
        </svg>
    </div>`;
}

/**
 * Generates popup HTML content for a vehicle using cached stop and route data.
 * Pure data lookup — formatting delegated to vehicle-popup.js.
 *
 * @param {object} vehicle — vehicle state object
 * @returns {string} — HTML string for popup content
 */
function getPopupContent(vehicle) {
    const stopName = vehicle.stopId ? (stopsData.get(vehicle.stopId)?.name || null) : null;
    const routeMeta = routeMetadata.find(r => r.id === vehicle.routeId) || null;
    return formatVehiclePopup(vehicle, stopName, routeMeta);
}

/**
 * Helper to create a divIcon for a vehicle.
 * Uses uniform size for all markers (48x32 rectangular).
 *
 * @param {object} vehicle — vehicle object with routeId
 * @returns {HTMLElement} — the marker's DOM element
 */
/**
 * Builds the route-name labels placed along a route's longest branch.
 *
 * Both route-loading paths (the static hydrate and the MBTA API fallback) place labels
 * identically; this is that shared code, extracted during the MapLibre port because
 * keeping two copies of it in sync through a renderer change was not realistic.
 *
 * @param {string} shortName — route short name, e.g. "Red"
 * @param {string} color — route colour
 * @param {Array<[number, number]>} coords — the branch to label, as [lat, lng] pairs
 * @returns {Array<object>} — MapLibre markers, not yet added to the map
 */
function createRouteLabels(shortName, color, coords) {
    if (!shortName || coords.length < 20) return [];

    const labels = [];
    const numLabels = Math.max(1, Math.min(5, Math.floor(coords.length / 100)));
    const interval = Math.floor(coords.length / (numLabels + 1));

    for (let n = 1; n <= numLabels; n++) {
        const i = n * interval;
        const [lat, lng] = coords[i];
        const [prevLat, prevLng] = coords[Math.max(0, i - 5)];
        const [nextLat, nextLng] = coords[Math.min(coords.length - 1, i + 5)];

        // Rotate the label to the line's local angle, kept upright so text stays readable.
        const cosLat = Math.cos(lat * Math.PI / 180);
        const dx = (nextLng - prevLng) * cosLat;
        const dy = nextLat - prevLat;
        let rotation = -Math.atan2(dy, dx) * (180 / Math.PI);
        if (rotation > 90) rotation -= 180;
        else if (rotation < -90) rotation += 180;

        const el = document.createElement('div');
        el.innerHTML = `<span class="route-label" style="--route-color: ${color}; transform: rotate(${rotation.toFixed(1)}deg)">${shortName}</span>`;
        el.style.zIndex = String(Z_INDEX.routeLabel);
        el.style.pointerEvents = 'none';   // was Leaflet's interactive: false

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat]);
        marker._onMap = false;
        labels.push(marker);
    }

    return labels;
}

function createVehicleElement(vehicle) {
    // MapLibre markers take a DOM element rather than an HTML string. The icon markup
    // itself is unchanged — getVehicleIconHtml stays the single point of change for
    // vehicle iconography, as it was under Leaflet.
    const el = document.createElement('div');
    el.innerHTML = getVehicleIconHtml(vehicle);
    el.style.width = '48px';
    el.style.height = '32px';
    el.style.zIndex = String(Z_INDEX.vehicleMarker);
    return el;
}

/**
 * Creates a new vehicle marker on the map.
 * Adds to vehicleMarkers Map and to the MapLibre map.
 * Binds a popup for hover/tap interaction.
 *
 * @param {object} vehicle — vehicle object with latitude, longitude, bearing, opacity
 */
export function createVehicleMarker(vehicle) {
    if (vehicleMarkers.has(vehicle.id)) {
        return; // Marker already exists
    }

    // Snap vehicle to nearest point on its route's polyline so icons
    // ride on the (potentially merged/averaged) rendered line
    const snapped = snapToRoutePolyline(vehicle.latitude, vehicle.longitude, vehicle.routeId);

    const element = createVehicleElement(vehicle);
    const marker = new maplibregl.Marker({ element })
        // [lng, lat] — the app stores [lat, lng] everywhere else.
        .setLngLat([snapped.lng, snapped.lat])
        .addTo(map);

    const popup = new maplibregl.Popup({
        className: 'vehicle-popup-container',
        closeButton: false,
        closeOnClick: false,
        focusAfterOpen: false,
    }).setHTML(getPopupContent(vehicle));
    marker.setPopup(popup);

    // Desktop: open on hover, close on mouseout. MapLibre has no marker-level event
    // emitter, so these bind to the marker's own element.
    element.addEventListener('mouseenter', () => {
        if (!popup.isOpen()) marker.togglePopup();
    });
    element.addEventListener('mouseleave', () => {
        if (popup.isOpen()) marker.togglePopup();
    });

    // Apply initial rotation and opacity
    const iconElement = element.querySelector('.vehicle-marker');
    if (iconElement) {
        const { rotate, scaleX } = bearingToTransform(vehicle.bearing);
        iconElement.style.transform = `scaleX(${scaleX}) rotate(${rotate}deg)`;
        iconElement.style.opacity = vehicle.opacity;
    }

    // Store vehicle data reference for use by setVisibleRoutes()
    marker._vehicleData = vehicle;

    vehicleMarkers.set(vehicle.id, marker);
}

/**
 * Updates an existing vehicle marker's position, rotation, and opacity.
 *
 * @param {object} vehicle — vehicle object with id, latitude, longitude, bearing, opacity
 */
export function updateVehicleMarker(vehicle) {
    const marker = vehicleMarkers.get(vehicle.id);
    if (!marker) {
        return; // Marker doesn't exist
    }

    // Snap to polyline and update position
    const snapped = snapToRoutePolyline(vehicle.latitude, vehicle.longitude, vehicle.routeId);
    marker.setLngLat([snapped.lng, snapped.lat]);

    // Keep the reference fresh — setVisibleRoutes reads routeId off it.
    marker._vehicleData = vehicle;

    // Update rotation and opacity
    const iconElement = marker.getElement().querySelector('.vehicle-marker');
    if (iconElement) {
        const { rotate, scaleX } = bearingToTransform(vehicle.bearing);
        iconElement.style.transform = `scaleX(${scaleX}) rotate(${rotate}deg)`;
        iconElement.style.opacity = vehicle.opacity;
    }
}

/**
 * Removes a vehicle marker from the map and vehicleMarkers Map.
 * Cleans up popup update tracking.
 *
 * @param {string} vehicleId — the vehicle ID to remove
 */
export function removeVehicleMarker(vehicleId) {
    const marker = vehicleMarkers.get(vehicleId);
    if (!marker) {
        return; // Marker doesn't exist
    }

    marker.remove();
    vehicleMarkers.delete(vehicleId);
    lastPopupUpdatedAt.delete(vehicleId);
}

/**
 * Reconciliation function called from animation loop.
 * Syncs vehicleMarkers Map with current vehiclesMap state, filtering by visibleRoutes:
 * - Creates markers for new visible vehicles
 * - Updates existing markers position/rotation
 * - Removes markers for vehicles no longer in vehiclesMap or whose route is hidden
 *
 * @param {Map<vehicleId, vehicle>} vehiclesMap — current vehicle state from vehicles.js
 */
export function syncVehicleMarkers(vehiclesMap) {
    // Filter to only visible routes
    const filteredVehicles = new Map();
    vehiclesMap.forEach((vehicle, vehicleId) => {
        if (visibleRoutes.has(vehicle.routeId)) {
            filteredVehicles.set(vehicleId, vehicle);
        }
    });

    // Update existing and create new markers for visible vehicles
    filteredVehicles.forEach((vehicle, vehicleId) => {
        if (vehicleMarkers.has(vehicleId)) {
            const marker = vehicleMarkers.get(vehicleId);

            // Update position/rotation
            updateVehicleMarker(vehicle);

            // Refresh popup content if popup is open and data changed.
            // The updatedAt guard is load-bearing: this runs at 60fps, and without it
            // every open popup rewrites its DOM on every frame.
            const popup = marker.getPopup();
            if (popup && popup.isOpen()) {
                const lastUpdated = lastPopupUpdatedAt.get(vehicleId);
                if (vehicle.updatedAt !== lastUpdated) {
                    popup.setHTML(getPopupContent(vehicle));
                    lastPopupUpdatedAt.set(vehicleId, vehicle.updatedAt);
                }
            }
        } else {
            createVehicleMarker(vehicle);
        }
    });

    // Remove stale markers (vehicles that are gone or whose route is now hidden)
    const vehicleIdsToRemove = [];
    vehicleMarkers.forEach((marker, vehicleId) => {
        if (!filteredVehicles.has(vehicleId)) {
            vehicleIdsToRemove.push(vehicleId);
        }
    });

    vehicleIdsToRemove.forEach((vehicleId) => {
        removeVehicleMarker(vehicleId);
    });
}


/**
 * Fetches routes from MBTA API with the full JSON:API relationship chain
 * (route → route_patterns → representative_trip → shape → polyline).
 * Decodes polylines into branch geometry.
 * Stores metadata for Phase 6 UI and polylines for visibility filtering.
 *
 * Layer ordering: route lines draw inside the WebGL canvas, below the DOM markers.
 */
export async function loadRoutes() {
    try {
        const apiUrl = new URL(`${config.api.baseUrl}/routes`);
        apiUrl.searchParams.append('filter[type]', '0,1,2,3,4'); // Light Rail (0), Heavy Rail (1), Commuter Rail (2), Bus (3), Ferry (4)
        apiUrl.searchParams.append('include', 'route_patterns.representative_trip.shape');
        apiUrl.searchParams.append('api_key', config.api.key);

        const response = await fetch(apiUrl.toString());
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const jsonApi = await response.json();
        const routes = jsonApi.data;
        const included = jsonApi.included || [];

        // Create a map for quick lookup of included resources by type and id
        const includedMap = new Map();
        included.forEach((item) => {
            const key = `${item.type}:${item.id}`;
            includedMap.set(key, item);
        });

        // Process each route
        routes.forEach((route) => {
            const routeId = route.id;
            // Routes render in the colour MBTA publishes — see hydrateRoutes().
            const color = route.attributes.color ? `#${route.attributes.color}` : '#888888';
            const shortName = route.attributes.short_name || routeId;
            const longName = route.attributes.long_name || '';
            const type = route.attributes.type;

            // Parse direction metadata from MBTA route attributes
            const directionNames = route.attributes.direction_names || ['Outbound', 'Inbound'];
            const directionDestinations = route.attributes.direction_destinations || [];

            // Store route metadata
            routeMetadata.push({
                id: routeId,
                color,
                shortName,
                longName,
                type,
                directionNames,
                directionDestinations,
            });

            // Store color in lookup map for vehicle icon generation
            routeColorMap.set(routeId, color);

            // Store type in lookup map for vehicle icon CSS class selection
            routeTypeMap.set(routeId, type);

            // Initialize polylines array for this route
            const polylines = [];
            routePolylines.set(routeId, polylines);

            // Walk the relationship chain: route → route_patterns → representative_trip → shape
            // Filter to only typical patterns (typicality 1) to exclude detours and variations
            const routePatternsData = route.relationships?.route_patterns?.data || [];

            routePatternsData.forEach((patternRef) => {
                const pattern = includedMap.get(`route_pattern:${patternRef.id}`);
                if (!pattern) return;

                // Skip atypical patterns (detours, short-turns, special variations)
                // typicality: 1 = typical, 2 = some diversions, 3+ = highly atypical
                const typicality = pattern.attributes?.typicality;
                if (typicality !== 1) return;

                const tripRef = pattern.relationships?.representative_trip?.data;
                if (!tripRef) return;

                const trip = includedMap.get(`trip:${tripRef.id}`);
                if (!trip) return;

                const shapeRef = trip.relationships?.shape?.data;
                if (!shapeRef) return;

                const shape = includedMap.get(`shape:${shapeRef.id}`);
                if (!shape) return;

                const encodedPolyline = shape.attributes?.polyline;
                if (!encodedPolyline) return;

                // Decode into plain [lat, lng] pairs — the app's geometry representation.
                // Not drawn yet; renderRouteLines() does that once every route is built.
                polylines.push(decodePolyline(encodedPolyline));
            });

            // Snap nearby endpoints to close gaps at termini. When multiple patterns
            // share a terminus (inbound/outbound), their endpoints can differ by a few
            // metres and draw as a gap.
            snapBranchEndpoints(polylines);

            // Rail (types 0, 1): dedup inbound/outbound copies (max nearest-vertex < 20m),
            // then segment-merge remaining polylines (shared corridors averaged at 40m threshold,
            // branches and terminus loops kept as separate segments).
            // Bus/CR/Ferry: segment-by-segment merge at 20m threshold.
            // polyline-merge.js works in {lat, lng} objects and its own test suite pins
            // that interface, so this path converts at the boundary rather than
            // changing a helper three other callers depend on.
            const toObjs = (branch) => branch.map(([lat, lng]) => ({ lat, lng }));
            const toPairs = (objs) => objs.map(p => [p.lat, p.lng]);

            const isRail = (type === 0 || type === 1);
            if (isRail && polylines.length >= 2) {
                const coords = polylines.map(toObjs);
                const oriented = [coords[0]];
                for (let pi = 1; pi < coords.length; pi++) {
                    const p = coords[pi];
                    const dS = haversineDistance(oriented[0][0].lat, oriented[0][0].lng, p[0].lat, p[0].lng);
                    const dF = haversineDistance(oriented[0][0].lat, oriented[0][0].lng, p[p.length - 1].lat, p[p.length - 1].lng);
                    oriented.push(dF < dS ? [...p].reverse() : p);
                }
                // Deduplicate: same start+end AND max sampled nearest-vertex < 20m
                const unique = [oriented[0]];
                for (let pi = 1; pi < oriented.length; pi++) {
                    let isDup = false;
                    for (const u of unique) {
                        const dStart = haversineDistance(oriented[pi][0].lat, oriented[pi][0].lng, u[0].lat, u[0].lng);
                        const dEnd = haversineDistance(
                            oriented[pi][oriented[pi].length - 1].lat, oriented[pi][oriented[pi].length - 1].lng,
                            u[u.length - 1].lat, u[u.length - 1].lng
                        );
                        if (dStart > 100 || dEnd > 100) continue;
                        let maxDist = 0;
                        const step = Math.max(1, Math.floor(oriented[pi].length / 50));
                        for (let k = 0; k < oriented[pi].length; k += step) {
                            let minD = Infinity;
                            for (const v of u) {
                                const d = haversineDistance(oriented[pi][k].lat, oriented[pi][k].lng, v.lat, v.lng);
                                if (d < minD) minD = d;
                            }
                            if (minD > maxDist) maxDist = minD;
                        }
                        if (maxDist < 20) { isDup = true; break; }
                    }
                    if (!isDup) unique.push(oriented[pi]);
                }
                // Distinguish terminus loops from branching routes:
                // - Same start AND end (within 500m): terminus variation (Green-E, Green-C/D).
                //   Keep both raw — they overlap on shared track and diverge at terminus loops.
                // - Same start, different end: branching route (Red Line Ashmont/Braintree).
                //   Segment-merge to combine the shared corridor into one line.
                let resultCoords = unique;
                if (unique.length >= 2) {
                    const END_MATCH_THRESHOLD = 500; // meters
                    const allSameEnd = unique.every(p => {
                        const dEnd = haversineDistance(
                            p[p.length - 1].lat, p[p.length - 1].lng,
                            unique[0][unique[0].length - 1].lat, unique[0][unique[0].length - 1].lng
                        );
                        return dEnd < END_MATCH_THRESHOLD;
                    });

                    if (!allSameEnd) {
                        // Branching route: segment-merge pairwise to combine shared corridor
                        resultCoords = [unique[0]];
                        for (let ui = 1; ui < unique.length; ui++) {
                            const c2 = unique[ui];
                            if (c2.length === 0) continue;
                            // Bypass shouldMergePolylines gate — we know branching polylines
                            // share a corridor that needs merging
                            const segments = mergePolylineSegments(resultCoords[0], c2, 40);
                            resultCoords.splice(0, 1, ...segments);
                        }
                    }
                    // else: terminus loops — keep all raw polylines
                }
                if (resultCoords.length !== polylines.length || unique.length !== oriented.length) {
                    polylines.length = 0;
                    for (const seg of resultCoords) {
                        polylines.push(toPairs(seg));
                    }
                }
            } else if (!isRail && polylines.length === 2) {
                const c1 = toObjs(polylines[0]);
                const c2raw = toObjs(polylines[1]);

                if (c1.length >= 2 && c2raw.length >= 2) {
                    const dSame = haversineDistance(c1[0].lat, c1[0].lng, c2raw[0].lat, c2raw[0].lng);
                    const dFlip = haversineDistance(c1[0].lat, c1[0].lng, c2raw[c2raw.length - 1].lat, c2raw[c2raw.length - 1].lng);
                    const c2 = dFlip < dSame ? [...c2raw].reverse() : c2raw;

                    if (shouldMergePolylines(c1, c2)) {
                        const segments = mergePolylineSegments(c1, c2, 20);
                        polylines.length = 0;
                        for (const seg of segments) {
                            polylines.push(toPairs(seg));
                        }
                    }
                }
            }

            // Route name labels along the longest branch.
            const longestCoords = polylines.reduce(
                (best, branch) => (branch.length > best.length ? branch : best),
                []
            );
            const labels = createRouteLabels(shortName, color, longestCoords);
            if (labels.length > 0) routeLabels.set(routeId, labels);
        });

        renderRouteLines();
        console.log(`Loaded ${routes.length} routes with polylines`);
    } catch (error) {
        console.error('Failed to load routes:', error.message);
        // Do not crash — app still works without route lines
    }
}

/**
 * Returns the stored route metadata array for Phase 6 UI.
 * Each element is {id, color, shortName, longName, type}.
 *
 * @returns {Array<Object>} — route metadata
 */
export function getRouteMetadata() {
    return routeMetadata;
}

/**
 * Calculates adaptive polyline weight based on number of visible routes.
 * Balances visibility across varying network density:
 * - 1-4 routes: ~5px (small network, thick lines for clarity)
 * - 5-15 routes: ~3px (medium network, moderate thickness)
 * - 16+ routes: ~2px (dense network, thin lines to avoid clutter)
 *
 * @param {number} visibleCount — number of currently visible routes
 * @returns {number} — polyline weight in pixels
 */
function getAdaptiveWeight(visibleCount) {
    if (visibleCount <= 4) return 5;
    if (visibleCount <= 15) return 3;
    return 2;
}

/**
 * Updates the set of visible routes and applies show/hide to polylines, labels, and vehicle markers.
 * Called when user selects/deselects routes in the UI.
 *
 * For each route in routePolylines:
 * - If routeIds contains the route: show polyline with adaptive weight, add labels to map
 * - Otherwise: remove polyline and labels from map
 *
 * Also immediately removes vehicle markers for hidden routes.
 *
 * @param {Set<string>|Array<string>} routeIds — set or array of route IDs that should be visible
 */
export function setVisibleRoutes(routeIds) {
    visibleRoutes = new Set(routeIds);

    // Route lines: one layer for every route, so visibility is a filter and the
    // adaptive weight is a paint property. No layer objects are added or removed.
    applyRouteLineVisibility();

    // Route labels are DOM markers, so they are genuinely added and removed.
    routeLabels.forEach((labels, routeId) => {
        const isVisible = visibleRoutes.has(routeId);
        labels.forEach((marker) => {
            if (isVisible) {
                if (!marker._onMap) {
                    marker.addTo(map);
                    marker._onMap = true;
                }
            } else if (marker._onMap) {
                marker.remove();
                marker._onMap = false;
            }
        });
    });

    // Remove vehicle markers for hidden routes immediately (collect-then-delete pattern)
    const idsToRemove = [];
    vehicleMarkers.forEach((marker, vehicleId) => {
        const vehicle = marker._vehicleData; // stored on marker during creation
        if (vehicle && !visibleRoutes.has(vehicle.routeId)) {
            idsToRemove.push(vehicleId);
        }
    });
    idsToRemove.forEach((vehicleId) => removeVehicleMarker(vehicleId));
}

/**
 * Fetches stops from MBTA API and caches them for session.
 * Filters by route_type 0 (Light Rail), 1 (Heavy Rail), 2 (Commuter Rail), 3 (Bus), and 4 (Ferry).
 * Parses JSON:API response and stores stop data keyed by stop ID.
 *
 * Graceful degradation: if fetch fails, app continues without stop data.
 */
export async function loadStops() {
    try {
        const apiUrl = new URL(`${config.api.baseUrl}/stops`);
        apiUrl.searchParams.append('filter[route_type]', '0,1,2,3,4'); // Light Rail (0), Heavy Rail (1), Commuter Rail (2), Bus (3), Ferry (4)
        apiUrl.searchParams.append('api_key', config.api.key);

        const response = await fetch(apiUrl.toString());
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const jsonApi = await response.json();
        const stops = jsonApi.data || [];

        // Parse each stop from JSON:API and store in Map
        // Include parentStopId for child→parent resolution (notification stop matching)
        stops.forEach((stop) => {
            stopsData.set(stop.id, {
                id: stop.id,
                name: stop.attributes?.name || '',
                latitude: stop.attributes?.latitude || 0,
                longitude: stop.attributes?.longitude || 0,
                parentStopId: stop.relationships?.parent_station?.data?.id || null,
            });
        });

        // Build parent station entries from child platforms.
        // The route-level /stops API returns parent station IDs (e.g. "place-hsmnl")
        // but the all-stops API returns child platforms. Ensure stopsData has both
        // so cached route-stops mappings can resolve parent station IDs.
        stops.forEach((stop) => {
            const parentId = stop.relationships?.parent_station?.data?.id;
            if (parentId && !stopsData.has(parentId)) {
                stopsData.set(parentId, {
                    id: parentId,
                    name: stop.attributes?.name || '',
                    latitude: stop.attributes?.latitude || 0,
                    longitude: stop.attributes?.longitude || 0,
                    parentStopId: null,
                });
            }
        });

        console.log(`Cached ${stops.length} stops`);
    } catch (error) {
        console.error('Failed to load stops:', error.message);
        // Do not crash — app continues without stop data
    }
}

/**
 * Hydrate route state from pre-baked static data bundle.
 * Equivalent to loadRoutes() but from pre-decoded data instead of MBTA API.
 * Safe to call multiple times — clears existing state before repopulating.
 *
 * @param {Array<{id, color, shortName, longName, type, directionNames, directionDestinations, polyline: number[][]}>} routes
 * @param {Object} [stopsData] - stops keyed by ID with {lat, lng}
 * @param {Object} [routeStopsData] - route ID → array of stop IDs
 */
export function hydrateRoutes(routes, stopsData = null, routeStopsData = null) {
    // Route labels are DOM markers and must come off the map explicitly; the route
    // lines are rebuilt wholesale by renderRouteLines() at the end of this function.
    routeLabels.forEach(labels => labels.forEach((m) => {
        if (m._onMap) { m.remove(); m._onMap = false; }
    }));

    // Clear state maps
    routeMetadata.length = 0;
    routeColorMap.clear();
    routeTypeMap.clear();
    routePolylines.clear();
    routeLabels.clear();

    routes.forEach((route) => {
        const { id: routeId, shortName, longName, type, directionNames, directionDestinations } = route;

        // Routes render in the colour MBTA publishes. The old 15% darkening was tuned
        // for CARTO's near-black land and muddied Green and Blue on the grey basemap.
        const color = route.color || '#888888';

        routeMetadata.push({ id: routeId, color, shortName, longName, type, directionNames, directionDestinations });
        routeColorMap.set(routeId, color);
        routeTypeMap.set(routeId, type);

        // Rail-only render-time processing: concatenation, dedup, and terminal trimming.
        // Non-rail routes (bus/CR/ferry) use prebaked segments directly — the prebake script
        // already handled merging, preserving one-way street divergences correctly.
        const isRailRoute = (type === 0 || type === 1);
        const rawSegments = route.polylines || [route.polyline];

        let deduped;
        if (isRailRoute) {
            // Concatenate consecutive segments whose endpoints match (fixes merge fragments)
            const merged = [];
            for (const seg of rawSegments) {
                if (!seg || seg.length < 2) continue;
                if (merged.length > 0) {
                    const prev = merged[merged.length - 1];
                    const prevEnd = prev[prev.length - 1];
                    const curStart = seg[0];
                    const endpointDist = haversineDistance(prevEnd[0], prevEnd[1], curStart[0], curStart[1]);
                    if (endpointDist < 5) {
                        prev.push(...seg.slice(1));
                        continue;
                    }
                }
                merged.push([...seg]);
            }

            // Deduplicate segments with matching start+end points (inbound/outbound overlaps).
            // Keeps the longer segment.
            deduped = [];
            const dedupedFlags = new Set();
            for (let mi = 0; mi < merged.length; mi++) {
                if (dedupedFlags.has(mi)) continue;
                const seg = merged[mi];
                const start = seg[0];
                const end = seg[seg.length - 1];

                let dupIdx = -1;
                for (let mj = mi + 1; mj < merged.length; mj++) {
                    if (dedupedFlags.has(mj)) continue;
                    const other = merged[mj];
                    const oStart = other[0];
                    const oEnd = other[other.length - 1];
                    if ((haversineDistance(start[0], start[1], oStart[0], oStart[1]) < 100 &&
                         haversineDistance(end[0], end[1], oEnd[0], oEnd[1]) < 100) ||
                        (haversineDistance(start[0], start[1], oEnd[0], oEnd[1]) < 100 &&
                         haversineDistance(end[0], end[1], oStart[0], oStart[1]) < 100)) {
                        dupIdx = mj;
                        break;
                    }
                }

                if (dupIdx === -1) {
                    deduped.push(seg);
                } else {
                    dedupedFlags.add(dupIdx);
                    const other = merged[dupIdx];
                    const kept = seg.length >= other.length ? seg : other;
                    deduped.push(kept);
                }
            }
        } else {
            // Non-rail: use prebaked segments as-is.
            // GUARD: prebaked segments must pass through unmodified (no concat, no dedup).
            // If this assertion fires, someone removed the isRailRoute gate and applied
            // rail-only processing to bus/CR/ferry. Dedup destroys one-way-street divergences.
            deduped = rawSegments.filter(seg => seg && seg.length >= 2);
        }

        // GUARD: verify isRailRoute is consistent with route type.
        // Catches both failure modes: non-rail misclassified as rail (dedup applied)
        // and rail misclassified as non-rail (dedup skipped).
        if (!isRailRoute && (type === 0 || type === 1)) {
            throw new Error(
                `[hydrateRoutes] ASSERTION FAILED: route "${routeId}" has rail type ${type} ` +
                `but isRailRoute is false. isRailRoute gate is broken.`
            );
        }
        if (isRailRoute && type !== 0 && type !== 1) {
            throw new Error(
                `[hydrateRoutes] ASSERTION FAILED: route "${routeId}" has non-rail type ${type} ` +
                `but isRailRoute is true. isRailRoute gate is broken — ` +
                `bus/CR/ferry routes would be put through rail dedup, destroying one-way-street paths.`
            );
        }

        // Trim rail polylines at terminal stops — riders don't care about yard tracks.
        // Only for rail (subway/light rail) — bus routes have complex multi-segment shapes.
        if (isRailRoute && stopsData && routeStopsData && routeStopsData[routeId]) {
            const stopIds = routeStopsData[routeId];
            const stopCoords = stopIds.map(sid => stopsData[sid]).filter(Boolean);

            // Identify junction endpoints: a segment endpoint that's near any point on another segment.
            // These should NOT be trimmed — they're branch connection points, not terminals.
            // Checks all vertices (not just endpoints) because branches can diverge mid-segment
            // (e.g., Red Line Braintree branch splits from trunk mid-polyline).
            const JUNCTION_THRESHOLD = 50; // meters
            function isJunction(segIdx, whichEnd) {
                const pt = whichEnd === 'start' ? deduped[segIdx][0] : deduped[segIdx][deduped[segIdx].length - 1];
                for (let oi = 0; oi < deduped.length; oi++) {
                    if (oi === segIdx) continue;
                    for (let vi = 0; vi < deduped[oi].length; vi++) {
                        if (haversineDistance(pt[0], pt[1], deduped[oi][vi][0], deduped[oi][vi][1]) < JUNCTION_THRESHOLD) return true;
                    }
                }
                return false;
            }

            for (let si = 0; si < deduped.length; si++) {
                const seg = deduped[si];
                if (seg.length < 3 || stopCoords.length === 0) continue;

                let trimStart = !isJunction(si, 'start');
                let trimEnd = !isJunction(si, 'end');
                if (!trimStart && !trimEnd) continue;

                // Trim at terminal stops — always trim non-junction endpoints
                // so lines end cleanly at the last station (no turnaround curves,
                // no maintenance yard extensions).

                // For each stop, find its nearest point on the polyline (segment projection)
                let minSegIdx = seg.length - 1;
                let maxSegIdx = 0;
                let minProjPoint = null;
                let maxProjPoint = null;
                let hasNearby = false;

                for (const stop of stopCoords) {
                    let bestDist = Infinity;
                    let bestSegI = 0;
                    let bestProj = null;

                    for (let vi = 0; vi < seg.length - 1; vi++) {
                        const proj = nearestPointOnSegment(
                            stop.lat, stop.lng,
                            seg[vi][0], seg[vi][1],
                            seg[vi + 1][0], seg[vi + 1][1]
                        );
                        const d = haversineDistance(stop.lat, stop.lng, proj.lat, proj.lng);
                        if (d < bestDist) {
                            bestDist = d;
                            bestSegI = vi;
                            bestProj = proj;
                        }
                    }

                    if (bestDist < 300) {
                        hasNearby = true;
                        if (bestSegI < minSegIdx) {
                            minSegIdx = bestSegI;
                            minProjPoint = bestProj;
                        }
                        if (bestSegI > maxSegIdx) {
                            maxSegIdx = bestSegI;
                            maxProjPoint = bestProj;
                        }
                    }
                }
                if (!hasNearby) continue;

                // Build trimmed segment, only trimming true terminal ends
                const startIdx = trimStart ? minSegIdx : 0;
                const endIdx = trimEnd ? maxSegIdx : seg.length - 2;
                if (endIdx < startIdx) continue;

                const trimmed = [];
                // Start: projected point at first terminal stop, or keep original start
                if (trimStart && minProjPoint) {
                    trimmed.push([minProjPoint.lat, minProjPoint.lng]);
                } else {
                    // Keep all vertices from start to startIdx
                    for (let vi = 0; vi <= startIdx; vi++) {
                        trimmed.push(seg[vi]);
                    }
                }
                // Middle vertices
                for (let vi = startIdx + 1; vi <= endIdx; vi++) {
                    trimmed.push(seg[vi]);
                }
                // End: projected point at last terminal stop, or keep original end
                if (trimEnd && maxProjPoint) {
                    trimmed.push([maxProjPoint.lat, maxProjPoint.lng]);
                } else {
                    // Keep all vertices from endIdx+1 to end
                    for (let vi = endIdx + 1; vi < seg.length; vi++) {
                        trimmed.push(seg[vi]);
                    }
                }

                if (trimmed.length >= 2) {
                    deduped[si] = trimmed;
                }
            }
        }

        // Branch geometry is plain [lat, lng] data from here on.
        const branches = deduped.map(seg => seg.map(([lat, lng]) => [lat, lng]));

        // Snap nearby endpoints to close gaps at branch junctions (same as loadRoutes())
        snapBranchEndpoints(branches);

        // Not drawn yet — renderRouteLines() builds the source, and setVisibleRoutes()
        // decides which routes the filter lets through.
        routePolylines.set(routeId, branches);

        // Route name labels along the longest branch.
        // Routes with an empty shortName get none — they render as tiny coloured rectangles.
        const longest = branches.reduce(
            (best, b) => (b.length > best.length ? b : best),
            branches[0] || []
        );
        const labels = createRouteLabels(shortName, color, longest);
        if (labels.length > 0) routeLabels.set(routeId, labels);
    });

    renderRouteLines();
    console.log(`Hydrated ${routes.length} routes from static data`);
}

/**
 * Snaps branch endpoints within 50m of each other to their shared average.
 *
 * Where patterns meet at a terminus or junction their endpoints can differ by a few
 * metres, which draws as a visible gap. Mutates the branches in place.
 *
 * @param {Array<Array<[number, number]>>} branches
 */
function snapBranchEndpoints(branches) {
    const SNAP_THRESHOLD_METERS = 50;
    if (branches.length <= 1) return;

    const endpoints = [];
    branches.forEach((branch) => {
        if (branch.length === 0) return;
        endpoints.push({ branch, index: 0 });
        endpoints.push({ branch, index: branch.length - 1 });
    });

    const pointAt = (e) => e.branch[e.index];

    const snapped = new Set();
    for (let i = 0; i < endpoints.length; i++) {
        if (snapped.has(i)) continue;

        const group = [endpoints[i]];
        const [iLat, iLng] = pointAt(endpoints[i]);
        for (let j = i + 1; j < endpoints.length; j++) {
            if (snapped.has(j)) continue;
            const [jLat, jLng] = pointAt(endpoints[j]);
            if (haversineDistance(iLat, iLng, jLat, jLng) <= SNAP_THRESHOLD_METERS) {
                group.push(endpoints[j]);
                snapped.add(j);
            }
        }

        if (group.length > 1) {
            const avgLat = group.reduce((sum, e) => sum + pointAt(e)[0], 0) / group.length;
            const avgLng = group.reduce((sum, e) => sum + pointAt(e)[1], 0) / group.length;
            group.forEach((e) => { e.branch[e.index] = [avgLat, avgLng]; });
        }

        snapped.add(i);
    }
}

/**
 * Returns the current set of visible route IDs.
 * Used by onStaticDataRefresh in index.html to re-render after re-hydration.
 * @returns {Set<string>}
 */
export function getVisibleRoutes() {
    return visibleRoutes;
}

/**
 * Branch geometry per route, as [lat, lng] pairs.
 *
 * Exposed so the merge/dedup/trim behaviour in hydrateRoutes stays observable. Under
 * Leaflet the suite watched L.polyline() calls to see what geometry came out; there is
 * no library call to watch any more, so the geometry itself is the observation point.
 *
 * @returns {Map<string, Array<Array<[number, number]>>>}
 */
export function getRoutePolylines() {
    return routePolylines;
}

/**
 * Hydrate stop state from pre-baked static data bundle.
 * Equivalent to loadStops() but from pre-decoded data instead of MBTA API.
 * Safe to call multiple times — clears existing state before repopulating.
 *
 * @param {Object<string, {id, name, lat, lng, parentStopId}>} stops - keyed by stop ID
 */
export function hydrateStops(stops) {
    stopsData.clear();

    for (const stop of Object.values(stops)) {
        // Static bundle uses lat/lng; stopsData uses latitude/longitude to match existing consumers
        stopsData.set(stop.id, {
            id: stop.id,
            name: stop.name,
            latitude: stop.lat,
            longitude: stop.lng,
            parentStopId: stop.parentStopId,
        });
    }

    // Synthesize parent station entries for any parentStopId not already in stopsData.
    // Matches the second pass in loadStops() (lines 756–767). stop-markers.js looks up
    // stops by parent station ID, so these entries must exist even if the static bundle
    // only includes them as references on child platforms.
    for (const stop of Object.values(stops)) {
        const parentId = stop.parentStopId;
        if (parentId && !stopsData.has(parentId)) {
            stopsData.set(parentId, {
                id: parentId,
                name: stop.name,
                latitude: stop.lat,
                longitude: stop.lng,
                parentStopId: null,
            });
        }
    }

    console.log(`Hydrated ${stopsData.size} stops from static data`);
}

/**
 * Returns the cached stops data Map.
 * Key: stop ID (string), Value: {id, name, latitude, longitude}
 *
 * @returns {Map<string, Object>} — stopsData Map
 */
export function getStopData() {
    return stopsData;
}

/**
 * Returns the route color lookup Map.
 * Key: route ID (string), Value: hex color string (e.g., "#DA291C")
 *
 * @returns {Map<string, string>} — routeColorMap
 */
export function getRouteColorMap() {
    return routeColorMap;
}

/**
 * Fetch route-stops mapping for specific routes.
 * Replaces buildRouteStopsMapping() — fetches only the given route IDs
 * instead of all routes. Max 3 concurrent requests.
 * @param {string[]} routeIds - Route IDs to fetch stops for
 */
export async function fetchRouteStops(routeIds) {
    const MAX_CONCURRENT = 3;
    const activeFetches = [];
    let routeIndex = 0;

    const fetchSingleRoute = async (routeId) => {
        const routeUrl = new URL(`${config.api.baseUrl}/stops`);
        routeUrl.searchParams.append('filter[route]', routeId);
        routeUrl.searchParams.append('fields[stop]', 'name,latitude,longitude');
        routeUrl.searchParams.append('api_key', config.api.key);

        try {
            const response = await fetch(routeUrl.toString());
            if (!response.ok) return;
            const json = await response.json();
            const stops = json.data || [];

            const stopIds = new Set();
            stops.forEach((stop) => {
                stopIds.add(stop.id);
                if (!stopsData.has(stop.id)) {
                    stopsData.set(stop.id, {
                        id: stop.id,
                        name: stop.attributes?.name || '',
                        latitude: stop.attributes?.latitude || 0,
                        longitude: stop.attributes?.longitude || 0,
                        parentStopId: stop.relationships?.parent_station?.data?.id || null,
                    });
                }
            });

            // Filter stops that are too far from the route's polylines.
            // The MBTA API returns stops for all route variants/patterns, including
            // rarely-run variants that don't appear on the official schedule.
            // Exclude any stop >150m from the nearest vertex on any polyline for this route.
            const STOP_PROXIMITY_THRESHOLD = 150; // meters
            const routePls = routePolylines.get(routeId);
            if (routePls && routePls.length > 0) {
                const vertices = routePls.flat();
                if (vertices.length > 0) {
                    for (const stopId of [...stopIds]) {
                        const stop = stopsData.get(stopId);
                        if (!stop || !stop.latitude || !stop.longitude) continue;
                        let minDist = Infinity;
                        for (const [vLat, vLng] of vertices) {
                            const d = haversineDistance(stop.latitude, stop.longitude, vLat, vLng);
                            if (d < minDist) minDist = d;
                            if (minDist <= STOP_PROXIMITY_THRESHOLD) break; // early exit
                        }
                        if (minDist > STOP_PROXIMITY_THRESHOLD) {
                            stopIds.delete(stopId);
                        }
                    }
                }
            }

            routeStopsMap.set(routeId, stopIds);
        } catch (error) {
            console.error(`Failed to load stops for route ${routeId}:`, error.message);
        }
    };

    const startNextRequest = async () => {
        if (routeIndex >= routeIds.length) return;

        const currentRouteId = routeIds[routeIndex++];
        const fetchPromise = fetchSingleRoute(currentRouteId);

        activeFetches.push(fetchPromise);
        await fetchPromise;
        activeFetches.splice(activeFetches.indexOf(fetchPromise), 1);
        await startNextRequest();
    };

    const queueManagers = [];
    for (let i = 0; i < Math.min(MAX_CONCURRENT, routeIds.length); i++) {
        queueManagers.push(startNextRequest());
    }

    await Promise.all(queueManagers);
    console.log(`Fetched route-stop mapping for ${routeIds.length} routes`);
}

/**
 * Populate routeStopsMap from cached data (no network call).
 * @param {string} routeId
 * @param {string[]|Set<string>} stopIds
 */
export function hydrateRouteStopsMap(routeId, stopIds) {
    routeStopsMap.set(routeId, stopIds instanceof Set ? stopIds : new Set(stopIds));
}

/**
 * Populate routeStopDirectionsMap from static data.
 * @param {Object} directionData — { routeId: { stopId: directionId (0 or 1) } }
 */
export function hydrateRouteStopDirections(directionData) {
    routeStopDirectionsMap = new Map();
    for (const [routeId, stopDirs] of Object.entries(directionData)) {
        const stopMap = new Map();
        for (const [stopId, dir] of Object.entries(stopDirs)) {
            stopMap.set(stopId, dir);
        }
        routeStopDirectionsMap.set(routeId, stopMap);
    }
}

/**
 * Returns the route-to-stops mapping.
 * Key: route ID (string), Value: Set of stop IDs
 *
 * @returns {Map<string, Set<string>>} — routeStopsMap
 */
export function getRouteStopsMap() {
    return routeStopsMap;
}

/**
 * Returns the direction-only stops mapping.
 * Key: route ID, Value: Map<stopId, directionId (0 or 1)>.
 * Stops not in this map serve both directions.
 *
 * @returns {Map<string, Map<string, number>>}
 */
export function getRouteStopDirectionsMap() {
    return routeStopDirectionsMap;
}

/**
 * Snap a lat/lng point to the nearest position on a route's polyline.
 * Iterates all polyline segments for the route and returns the closest point.
 * If the route has no polylines, returns the original coordinates unchanged.
 *
 * @param {number} lat — stop latitude
 * @param {number} lng — stop longitude
 * @param {string} routeId — route ID to snap to
 * @returns {{ lat: number, lng: number }} — snapped position
 */
export function snapToRoutePolyline(lat, lng, routeId) {
    const branches = routePolylines.get(routeId);
    if (!branches || branches.length === 0) return { lat, lng };

    let bestDistSq = Infinity;
    let bestPoint = { lat, lng };

    for (const coords of branches) {
        for (let i = 0; i < coords.length - 1; i++) {
            const result = nearestPointOnSegment(
                lat, lng,
                coords[i][0], coords[i][1],
                coords[i + 1][0], coords[i + 1][1]
            );
            if (result.distSq < bestDistSq) {
                bestDistSq = result.distSq;
                bestPoint = { lat: result.lat, lng: result.lng };
            }
        }
    }

    return bestPoint;
}

/**
 * Check if a stop is a terminus for a given route.
 * Matches stop name against route's direction_destinations using case-insensitive
 * substring matching (handles "Heath Street" vs "Heath St" variations).
 *
 * @param {string} stopId — stop ID to check
 * @param {string} routeId — route ID
 * @returns {boolean} — true if stop is a terminus for this route
 */
export function isTerminusStop(stopId, routeId) {
    const stop = stopsData.get(stopId);
    if (!stop?.name) return false;

    const meta = routeMetadata.find(r => r.id === routeId);
    if (!meta?.directionDestinations?.length) return false;

    const stopNameLower = stop.name.toLowerCase();
    return meta.directionDestinations.some(dest => {
        const destLower = dest.toLowerCase();
        return stopNameLower.includes(destLower) || destLower.includes(stopNameLower);
    });
}

/**
 * Get direction destination labels for a route (e.g., ["Ashmont/Braintree", "Alewife"]).
 * Index 0 = direction_id 0, Index 1 = direction_id 1.
 *
 * @param {string} routeId — route ID
 * @returns {Array<string>} — [dir0Label, dir1Label] or fallback to direction names
 */
export function getDirectionDestinations(routeId) {
    const meta = routeMetadata.find(r => r.id === routeId);
    if (!meta) return ['Direction 0', 'Direction 1'];
    // Prefer destination names (e.g., "Alewife") over generic names (e.g., "Inbound")
    if (meta.directionDestinations?.length >= 2) {
        return [meta.directionDestinations[0], meta.directionDestinations[1]];
    }
    return meta.directionNames || ['Outbound', 'Inbound'];
}
