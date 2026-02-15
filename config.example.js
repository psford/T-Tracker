// config.example.js — Configuration template
// Copy to config.js and replace YOUR_API_KEY_HERE with your MBTA API key
// Get a free key at https://api-v3.mbta.com
// Streams: Light Rail (Green), Heavy Rail (Red/Orange/Blue), Commuter Rail, Bus, Ferry
export const config = {
    api: {
        key: 'YOUR_API_KEY_HERE',
        baseUrl: 'https://api-v3.mbta.com',
    },
    map: {
        center: [42.3601, -71.0589], // Boston
        zoom: 12,
        minZoom: 10,
        maxZoom: 18,
    },
    tiles: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
    },
    routes: {
        defaultVisible: ['Green-B', 'Green-C', 'Green-D', 'Green-E', 'Red', 'Orange', 'Blue'],
    },
    animation: {
        interpolationDuration: 800,
        fadeInDuration: 200,
        fadeOutDuration: 200,
        snapThreshold: 100, // meters — snap instead of animate above this
    },
};
