// src/map.js — Leaflet map initialization and layer management
import { config } from '../config.js';

let map = null;

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
