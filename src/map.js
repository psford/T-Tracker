// src/map.js — Leaflet map initialization and layer management
import { config } from '../config.js';

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
 * Determines vehicle type from routeId:
 * - "Green-*" → class vehicle-marker--green-line
 * - Otherwise → class vehicle-marker--bus
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
    const isGreenLine = vehicle.routeId.startsWith('Green-');
    const markerClass = isGreenLine ? 'vehicle-marker--green-line' : 'vehicle-marker--bus';
    const highlightClass = highlightedRoutes.has(vehicle.routeId) ? 'vehicle-marker--highlighted' : '';
    const routeColor = vehicle.color || '#888888';

    // Inline SVG with dynamic class for colorization
    // Pass route color as CSS variable for drop-shadow filter in highlighted state
    return `<div class="vehicle-marker ${markerClass} ${highlightClass}" style="--route-color: ${routeColor}">
        <svg class="vehicle-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <polygon points="12,2 22,20 12,16 2,20" fill="white" />
        </svg>
    </div>`;
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
 * Decodes a Google-encoded polyline string to an array of [lat, lng] coordinate pairs.
 * Implements the standard Google polyline encoding algorithm.
 *
 * @param {string} encoded — the encoded polyline string
 * @returns {Array<Array<number>>} — array of [lat, lng] coordinate pairs
 */
export function decodePolyline(encoded) {
    const coords = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
        let result = 0;
        let shift = 0;
        let byte;

        // Decode latitude
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        const dlat = (result & 1) ? ~(result >> 1) : result >> 1;
        lat += dlat;

        result = 0;
        shift = 0;

        // Decode longitude
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        const dlng = (result & 1) ? ~(result >> 1) : result >> 1;
        lng += dlng;

        coords.push([lat / 1e5, lng / 1e5]);
    }

    return coords;
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
        apiUrl.searchParams.append('filter[type]', '0,3'); // Light Rail (0) and Bus (3)
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
 * - If routeIds contains the route: apply highlighted style (weight 5, opacity 0.9)
 * - Otherwise: apply normal style (weight 3, opacity 0.5)
 *
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
}
