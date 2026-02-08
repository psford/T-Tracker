// src/map.js — Leaflet map initialization and layer management
import { config } from '../config.js';
import { decodePolyline } from './polyline.js';
import { formatVehiclePopup } from './vehicle-popup.js';

let map = null;

// Map<vehicleId, L.Marker> — tracks active vehicle markers on the map
const vehicleMarkers = new Map();

// Map<routeId, L.Polyline[]> — stores polylines for each route (for Phase 6 highlighting)
const routePolylines = new Map();

// Array of route metadata [{id, color, shortName, longName, type}] — for Phase 6 UI
let routeMetadata = [];

// L.layerGroup for route polylines — added before vehicle markers to render below them
let routeLayerGroup = null;

// Set<routeId> — tracks currently highlighted route IDs for Phase 6 styling
let highlightedRoutes = new Set();

// Map<routeId, color> — color lookup for vehicle markers (populated by loadRoutes)
const routeColorMap = new Map();

// Map<routeId, number> — route type lookup for vehicle markers (populated by loadRoutes)
const routeTypeMap = new Map();

// Map<stopId, {id, name, latitude, longitude}> — caches stop data fetched on startup
let stopsData = new Map();

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

    // AC1.5: Show error message if tiles fail to load
    tileLayer.on('tileerror', () => {
        const existing = document.getElementById('tile-error');
        if (!existing) {
            const msg = document.createElement('div');
            msg.id = 'tile-error';
            msg.className = 'tile-error';
            msg.textContent = 'Map tiles unavailable — check your connection';
            document.body.appendChild(msg);
        }
    });

    return map;
}

export function getMap() {
    return map;
}

/**
 * Returns HTML string for vehicle marker icon based on vehicle type.
 * Determines vehicle type from routeTypeMap (populated from MBTA route metadata):
 * - Type 0 or 1 (subway) → class vehicle-marker--subway
 * - Type 2 (commuter rail) → class vehicle-marker--commuter-rail
 * - Type 3 (bus) or unknown → class vehicle-marker--bus
 *
 * Adds vehicle-marker--highlighted class if the route is currently highlighted.
 * Passes route color as CSS variable for use in drop-shadow filter.
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
    const highlightClass = highlightedRoutes.has(vehicle.routeId) ? 'vehicle-marker--highlighted' : '';
    const routeColor = routeColorMap.get(vehicle.routeId) || '#888888';

    // Inline SVG with direct fill color (no CSS filters)
    // Pass route color as CSS variable for drop-shadow filter in highlighted state
    return `<div class="vehicle-marker ${markerClass} ${highlightClass}" style="--route-color: ${routeColor}">
        <svg class="vehicle-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <polygon points="12,2 22,20 12,16 2,20" fill="${routeColor}" />
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
 * Helper to create a divIcon for a vehicle with current highlight state.
 * Determines icon size based on whether route is highlighted.
 *
 * @param {object} vehicle — vehicle object with routeId
 * @returns {L.DivIcon} — divIcon instance
 */
function createVehicleDivIcon(vehicle) {
    const iconHtml = getVehicleIconHtml(vehicle);
    const isHighlighted = highlightedRoutes.has(vehicle.routeId);
    const size = isHighlighted ? config.markerSize.highlighted : config.markerSize.normal;
    const iconSize = [size, size];
    const iconAnchor = [size / 2, size / 2];

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
        iconElement.style.transform = `rotate(${vehicle.bearing}deg)`;
        iconElement.style.opacity = vehicle.opacity;
    }

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
        iconElement.style.transform = `rotate(${vehicle.bearing}deg)`;
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
 * Syncs vehicleMarkers Map with current vehiclesMap state:
 * - Creates markers for new vehicles
 * - Updates existing markers (including re-creating divIcon if highlight state changed)
 * - Removes markers for vehicles no longer in vehiclesMap
 *
 * @param {Map<vehicleId, vehicle>} vehiclesMap — current vehicle state from vehicles.js
 */
export function syncVehicleMarkers(vehiclesMap) {
    // Track which markers need icon recreation due to highlight state change
    const markersToRecreate = [];

    // Update existing and create new markers
    vehiclesMap.forEach((vehicle, vehicleId) => {
        if (vehicleMarkers.has(vehicleId)) {
            const marker = vehicleMarkers.get(vehicleId);
            const isHighlighted = highlightedRoutes.has(vehicle.routeId);
            const currentIconSize = marker.getIcon().options.iconSize[0];
            const shouldBeSize = isHighlighted ? config.markerSize.highlighted : config.markerSize.normal;

            // If highlight state changed, mark for icon recreation
            if (currentIconSize !== shouldBeSize) {
                markersToRecreate.push(vehicleId);
            } else {
                // Otherwise just update position/rotation
                updateVehicleMarker(vehicle);
            }

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

    // Recreate icons for markers with changed highlight state
    markersToRecreate.forEach((vehicleId) => {
        const vehicle = vehiclesMap.get(vehicleId);
        const marker = vehicleMarkers.get(vehicleId);

        // Set new icon with updated size
        marker.setIcon(createVehicleDivIcon(vehicle));

        // Update position to ensure it's correct after icon recreation
        marker.setLatLng([vehicle.latitude, vehicle.longitude]);

        // Re-apply rotation and opacity
        const iconElement = marker.getElement().querySelector('.vehicle-marker');
        if (iconElement) {
            iconElement.style.transform = `rotate(${vehicle.bearing}deg)`;
            iconElement.style.opacity = vehicle.opacity;
        }
    });

    // Remove markers for vehicles no longer in vehiclesMap
    const vehicleIdsToRemove = [];
    vehicleMarkers.forEach((marker, vehicleId) => {
        if (!vehiclesMap.has(vehicleId)) {
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
 * Stores metadata for Phase 6 UI and polylines for Phase 6 highlighting.
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
            const color = route.attributes.color ? `#${route.attributes.color}` : '#888888';
            const shortName = route.attributes.short_name || routeId;
            const longName = route.attributes.long_name || '';
            const type = route.attributes.type;

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
            const routePatternsData = route.relationships?.route_patterns?.data || [];

            routePatternsData.forEach((patternRef) => {
                const pattern = includedMap.get(`route_pattern:${patternRef.id}`);
                if (!pattern) return;

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
                    weight: config.routeStyles.normal.weight,
                    opacity: config.routeStyles.normal.opacity,
                });

                polyline.addTo(routeLayerGroup);
                polylines.push(polyline);
            });

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
                    }).addTo(routeLayerGroup);

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
 * Updates the set of highlighted routes and applies styling to polylines and vehicle markers.
 * Called when user selects/deselects routes in the UI.
 *
 * For each route in routePolylines:
 * - If routeIds contains the route: apply highlighted style (bright)
 * - Otherwise: apply normal style (dimmed)
 *
 * Also updates route label opacity to match polyline state.
 * Vehicle markers are re-created on next syncVehicleMarkers call to reflect size/glow changes.
 *
 * @param {Set<routeId>} routeIds — set of route IDs that should be highlighted
 */
export function setHighlightedRoutes(routeIds) {
    highlightedRoutes = new Set(routeIds);

    // Update polyline styling for all routes
    routePolylines.forEach((polylines, routeId) => {
        const isHighlighted = highlightedRoutes.has(routeId);
        const style = isHighlighted
            ? config.routeStyles.highlighted
            : config.routeStyles.normal;

        polylines.forEach((polyline) => {
            polyline.setStyle({
                weight: style.weight,
                opacity: style.opacity,
            });
        });
    });

    // Update route label opacity to match polyline state
    routeLabels.forEach((labels, routeId) => {
        const isHighlighted = highlightedRoutes.has(routeId);
        const opacity = isHighlighted ? 1 : 0.35;
        labels.forEach((marker) => {
            const el = marker.getElement();
            if (el) el.style.opacity = opacity;
        });
    });
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
