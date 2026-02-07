// src/map.js — Leaflet map initialization and layer management
import { config } from '../config.js';

let map = null;

// Map<vehicleId, L.Marker> — tracks active vehicle markers on the map
const vehicleMarkers = new Map();

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
 * This is the single point of change for swapping placeholder arrows to proper icons.
 *
 * @param {object} vehicle — vehicle object with routeId property
 * @returns {string} — HTML string for marker content
 */
export function getVehicleIconHtml(vehicle) {
    const isGreenLine = vehicle.routeId.startsWith('Green-');
    const markerClass = isGreenLine ? 'vehicle-marker--green-line' : 'vehicle-marker--bus';

    // Inline SVG with dynamic class for colorization
    return `<div class="vehicle-marker ${markerClass}">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <polygon points="12,2 22,20 12,16 2,20" fill="white" />
        </svg>
    </div>`;
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

    const iconHtml = getVehicleIconHtml(vehicle);

    const marker = L.marker(
        [vehicle.latitude, vehicle.longitude],
        {
            icon: L.divIcon({
                html: iconHtml,
                className: '', // Avoid Leaflet's default icon styling
                iconSize: [24, 24],
                iconAnchor: [12, 12],
            }),
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
 * - Updates existing markers
 * - Removes markers for vehicles no longer in vehiclesMap
 *
 * @param {Map<vehicleId, vehicle>} vehiclesMap — current vehicle state from vehicles.js
 */
export function syncVehicleMarkers(vehiclesMap) {
    // Update existing and create new markers
    vehiclesMap.forEach((vehicle, vehicleId) => {
        if (vehicleMarkers.has(vehicleId)) {
            updateVehicleMarker(vehicle);
        } else {
            createVehicleMarker(vehicle);
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
