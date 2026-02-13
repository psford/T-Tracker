// src/map.js — Leaflet map initialization and layer management
import { config } from '../config.js';
import { decodePolyline } from './polyline.js';
import { formatVehiclePopup } from './vehicle-popup.js';
import { darkenHexColor, bearingToTransform, haversineDistance } from './vehicle-math.js';
import { VEHICLE_ICONS, DEFAULT_ICON } from './vehicle-icons.js';

let map = null;

// Map<vehicleId, L.Marker> — tracks active vehicle markers on the map
const vehicleMarkers = new Map();

// Map<routeId, L.Polyline[]> — stores polylines for each route (for visibility filtering)
const routePolylines = new Map();

// Array of route metadata [{id, color, shortName, longName, type}] — for Phase 6 UI
let routeMetadata = [];

// L.layerGroup for route polylines — added before vehicle markers to render below them
let routeLayerGroup = null;

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

// Map<routeId, L.Marker[]> — route name labels placed along polylines
const routeLabels = new Map();

// Track last updatedAt per vehicle to avoid unnecessary popup refreshes at 60fps
const lastPopupUpdatedAt = new Map();

export function initMap(containerId) {
    map = L.map(containerId, {
        center: config.map.center,
        zoom: config.map.zoom,
        minZoom: config.map.minZoom,
        maxZoom: config.map.maxZoom,
        zoomControl: true,
    });

    const tileLayer = L.tileLayer(config.tiles.url, {
        attribution: config.tiles.attribution,
        subdomains: config.tiles.subdomains,
        maxZoom: config.tiles.maxZoom,
    }).addTo(map);

    // Silent tile retry on error (exponential backoff: 1s, 2s, 4s, 8s, max 10s)
    let tileRetryDelay = 1000;
    const MAX_TILE_RETRY_DELAY = 10000;
    tileLayer.on('tileerror', (event) => {
        const tile = event.tile;
        const url = event.tile.src;

        setTimeout(() => {
            // Reload the tile by setting src again
            tile.src = url;
        }, tileRetryDelay);

        // Exponential backoff
        tileRetryDelay = Math.min(tileRetryDelay * 2, MAX_TILE_RETRY_DELAY);
    });

    // Reset retry delay on successful tile load
    tileLayer.on('tileload', () => {
        tileRetryDelay = 1000;
    });

    return map;
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
 * @returns {L.DivIcon} — divIcon instance
 */
function createVehicleDivIcon(vehicle) {
    const iconHtml = getVehicleIconHtml(vehicle);
    const iconSize = [48, 32];
    const iconAnchor = [24, 16];

    return L.divIcon({
        html: iconHtml,
        className: '', // Avoid Leaflet's default icon styling
        iconSize,
        iconAnchor,
    });
}

/**
 * Creates a new vehicle marker on the map with L.divIcon.
 * Adds to vehicleMarkers Map and to Leaflet map.
 * Binds a popup for hover/tap interaction.
 *
 * @param {object} vehicle — vehicle object with latitude, longitude, bearing, opacity
 */
export function createVehicleMarker(vehicle) {
    if (vehicleMarkers.has(vehicle.id)) {
        return; // Marker already exists
    }

    const marker = L.marker(
        [vehicle.latitude, vehicle.longitude],
        {
            icon: createVehicleDivIcon(vehicle),
        }
    ).addTo(map);

    // Bind popup with initial content
    marker.bindPopup(getPopupContent(vehicle), {
        className: 'vehicle-popup-container',
        closeButton: false,
        autoPan: false,
    });

    // Desktop: open on hover, close on mouseout
    marker.on('mouseover', function () {
        this.openPopup();
    });
    marker.on('mouseout', function () {
        this.closePopup();
    });

    // Apply initial rotation and opacity
    const iconElement = marker.getElement().querySelector('.vehicle-marker');
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

    // Update position
    marker.setLatLng([vehicle.latitude, vehicle.longitude]);

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

    map.removeLayer(marker);
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

            // Refresh popup content if popup is open and data changed
            if (marker.isPopupOpen()) {
                const lastUpdated = lastPopupUpdatedAt.get(vehicleId);
                if (vehicle.updatedAt !== lastUpdated) {
                    marker.getPopup().setContent(getPopupContent(vehicle));
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
 * Decodes polylines and creates Leaflet polyline layers.
 * Stores metadata for Phase 6 UI and polylines for visibility filtering.
 *
 * Layer ordering: Adds route layer group to map BEFORE vehicle markers
 * so polylines render below markers.
 */
export async function loadRoutes() {
    try {
        const apiUrl = new URL(`${config.api.baseUrl}/routes`);
        apiUrl.searchParams.append('filter[type]', '0,1,2,3'); // Light Rail (0), Heavy Rail (1), Commuter Rail (2), Bus (3)
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

        // Initialize route layer group if not already done
        if (!routeLayerGroup) {
            routeLayerGroup = L.layerGroup().addTo(map);
        }

        // Process each route
        routes.forEach((route) => {
            const routeId = route.id;
            let color = route.attributes.color ? `#${route.attributes.color}` : '#888888';
            const shortName = route.attributes.short_name || routeId;
            const longName = route.attributes.long_name || '';
            const type = route.attributes.type;

            // Darken heavy rail and commuter rail colors for dark map theme
            // Green Line (type 0) and Bus (type 3) already theme-appropriate
            if (type === 1 || type === 2) {
                color = darkenHexColor(color, 0.15);
            }

            // Store route metadata
            routeMetadata.push({
                id: routeId,
                color,
                shortName,
                longName,
                type,
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

                // Decode and create polyline
                const coords = decodePolyline(encodedPolyline);
                const polyline = L.polyline(coords, {
                    color,
                    weight: 3,
                    opacity: 0.9,
                });

                // Don't add to map yet — setVisibleRoutes() will add visible ones after UI init
                polylines.push(polyline);
            });

            // Snap nearby endpoints to close gaps at termini
            // When multiple patterns share a terminus (e.g., inbound/outbound), their endpoints
            // may differ by a few meters, creating visual discontinuities. Snap endpoints within
            // 50m to their average position.
            const SNAP_THRESHOLD_METERS = 50;
            if (polylines.length > 1) {
                const endpoints = [];
                polylines.forEach((polyline) => {
                    const coords = polyline.getLatLngs();
                    if (coords.length > 0) {
                        endpoints.push({ polyline, index: 0, point: coords[0] }); // Start
                        endpoints.push({ polyline, index: coords.length - 1, point: coords[coords.length - 1] }); // End
                    }
                });

                // Group endpoints that are within snap threshold
                const snapped = new Set();
                for (let i = 0; i < endpoints.length; i++) {
                    if (snapped.has(i)) continue;

                    const group = [endpoints[i]];
                    for (let j = i + 1; j < endpoints.length; j++) {
                        if (snapped.has(j)) continue;

                        const distance = haversineDistance(
                            endpoints[i].point.lat,
                            endpoints[i].point.lng,
                            endpoints[j].point.lat,
                            endpoints[j].point.lng
                        );

                        if (distance <= SNAP_THRESHOLD_METERS) {
                            group.push(endpoints[j]);
                            snapped.add(j);
                        }
                    }

                    // If group has 2+ endpoints, snap them to average position
                    if (group.length > 1) {
                        const avgLat = group.reduce((sum, e) => sum + e.point.lat, 0) / group.length;
                        const avgLng = group.reduce((sum, e) => sum + e.point.lng, 0) / group.length;

                        group.forEach(({ polyline, index }) => {
                            const coords = polyline.getLatLngs();
                            coords[index] = L.latLng(avgLat, avgLng);
                            polyline.setLatLngs(coords);
                        });
                    }

                    snapped.add(i);
                }
            }

            // Create route name labels along the longest polyline
            let longestCoords = [];
            polylines.forEach((pl) => {
                const latlngs = pl.getLatLngs();
                if (latlngs.length > longestCoords.length) {
                    longestCoords = latlngs;
                }
            });

            if (longestCoords.length >= 20) {
                const labels = [];
                const numLabels = Math.max(1, Math.min(5, Math.floor(longestCoords.length / 100)));
                const interval = Math.floor(longestCoords.length / (numLabels + 1));

                for (let n = 1; n <= numLabels; n++) {
                    const i = n * interval;
                    const point = longestCoords[i];
                    const prev = longestCoords[Math.max(0, i - 5)];
                    const next = longestCoords[Math.min(longestCoords.length - 1, i + 5)];

                    // Calculate line angle for label rotation (keep text readable)
                    const cosLat = Math.cos(point.lat * Math.PI / 180);
                    const dx = (next.lng - prev.lng) * cosLat;
                    const dy = next.lat - prev.lat;
                    let rotation = -Math.atan2(dy, dx) * (180 / Math.PI);
                    if (rotation > 90) rotation -= 180;
                    else if (rotation < -90) rotation += 180;

                    const icon = L.divIcon({
                        html: `<span class="route-label" style="--route-color: ${color}; transform: rotate(${rotation.toFixed(1)}deg)">${shortName}</span>`,
                        className: '',
                        iconSize: [0, 0],
                        iconAnchor: [0, 0],
                    });

                    const marker = L.marker([point.lat, point.lng], {
                        icon,
                        interactive: false,
                        zIndexOffset: -1000,
                    });
                    // Don't add to map yet — setVisibleRoutes() will add visible ones after UI init

                    labels.push(marker);
                }

                routeLabels.set(routeId, labels);
            }
        });

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

    // Calculate adaptive weight based on visible route count
    const weight = getAdaptiveWeight(visibleRoutes.size);

    // Show/hide polylines with adaptive weight
    routePolylines.forEach((polylines, routeId) => {
        const isVisible = visibleRoutes.has(routeId);
        polylines.forEach((polyline) => {
            if (isVisible) {
                if (!routeLayerGroup.hasLayer(polyline)) {
                    routeLayerGroup.addLayer(polyline);
                }
                polyline.setStyle({ weight, opacity: 0.9 });
            } else {
                routeLayerGroup.removeLayer(polyline);
            }
        });
    });

    // Show/hide route labels (labels are on routeLayerGroup, not map directly)
    routeLabels.forEach((labels, routeId) => {
        const isVisible = visibleRoutes.has(routeId);
        labels.forEach((marker) => {
            if (isVisible) {
                if (!routeLayerGroup.hasLayer(marker)) {
                    routeLayerGroup.addLayer(marker);
                }
            } else {
                routeLayerGroup.removeLayer(marker);
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
 * Filters by route_type 0 (Light Rail), 1 (Heavy Rail), 2 (Commuter Rail), and 3 (Bus).
 * Parses JSON:API response and stores stop data keyed by stop ID.
 *
 * Graceful degradation: if fetch fails, app continues without stop data.
 */
export async function loadStops() {
    try {
        const apiUrl = new URL(`${config.api.baseUrl}/stops`);
        apiUrl.searchParams.append('filter[route_type]', '0,1,2,3'); // Light Rail (0), Heavy Rail (1), Commuter Rail (2), Bus (3)
        apiUrl.searchParams.append('api_key', config.api.key);

        const response = await fetch(apiUrl.toString());
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const jsonApi = await response.json();
        const stops = jsonApi.data || [];

        // Parse each stop from JSON:API and store in Map
        stops.forEach((stop) => {
            stopsData.set(stop.id, {
                id: stop.id,
                name: stop.attributes?.name || '',
                latitude: stop.attributes?.latitude || 0,
                longitude: stop.attributes?.longitude || 0,
            });
        });

        console.log(`Cached ${stops.length} stops`);
    } catch (error) {
        console.error('Failed to load stops:', error.message);
        // Do not crash — app continues without stop data
    }
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
 * Builds the route-to-stops mapping by fetching stops per visible route.
 * This function requires routeMetadata from loadRoutes() to be available.
 * Called after both loadRoutes() and loadStops() complete.
 *
 * For each route in routeMetadata, fetches /stops?filter[route]=ROUTE_ID to
 * establish the implicit association: all returned stops belong to that route.
 * Runs all route-stop fetches in parallel for performance.
 * Logs result on completion.
 *
 * Graceful degradation: if a route fetch fails, skips that route and continues.
 */
export async function buildRouteStopsMapping() {
    const routeIds = routeMetadata.map(r => r.id);

    // CRITICAL FIX: Limit concurrent requests to avoid rate limiting and browser connection limits.
    // Browser allows ~6 concurrent requests per hostname. MBTA API rate limit is 1000 req/min.
    // Solution: Queue requests with limited concurrency (max 3 concurrent), not unlimited Promise.all().

    const MAX_CONCURRENT = 3;
    const activeFetches = [];
    let routeIndex = 0;

    /**
     * Fetch stops for a single route and add to routeStopsMap.
     * Manages concurrency by removing itself from activeFetches when done.
     */
    const fetchRouteStops = async (routeId) => {
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
                // Also update stopsData if not already present
                if (!stopsData.has(stop.id)) {
                    stopsData.set(stop.id, {
                        id: stop.id,
                        name: stop.attributes?.name || '',
                        latitude: stop.attributes?.latitude || 0,
                        longitude: stop.attributes?.longitude || 0,
                    });
                }
            });

            routeStopsMap.set(routeId, stopIds);
        } catch (error) {
            console.error(`Failed to load stops for route ${routeId}:`, error.message);
        }
    };

    /**
     * Manage request queue: start next request when one completes.
     */
    const startNextRequest = async () => {
        if (routeIndex >= routeIds.length) return; // All routes queued

        const currentRouteId = routeIds[routeIndex++];
        const fetchPromise = fetchRouteStops(currentRouteId);

        // Remove from activeFetches when done, then start next
        activeFetches.push(fetchPromise);
        await fetchPromise;
        activeFetches.splice(activeFetches.indexOf(fetchPromise), 1);
        await startNextRequest();
    };

    // Start MAX_CONCURRENT requests in parallel
    const queueManagers = [];
    for (let i = 0; i < Math.min(MAX_CONCURRENT, routeIds.length); i++) {
        queueManagers.push(startNextRequest());
    }

    // Wait for all queue managers to complete (which waits for all requests)
    await Promise.all(queueManagers);
    console.log(`Built route-stop mapping for ${routeStopsMap.size} routes`);
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
